const test = require("node:test");
const assert = require("node:assert/strict");

const { evmWallet, seedBalance, withTokenEnv } = require("./helpers/token-test-utils");

// Production incident 2026-09-20: a player sent 80 000 $PETIX, the indexer saw
// the transfer, the credit failed while the profile store was throwing
// `TypeError: fetch failed`, and the sync cursor moved on anyway — so nothing
// ever looked at that transfer again and the money simply never arrived.
// A transfer that fails to credit must be retried, not lost.

const PLAYER = evmWallet("1");

// Wraps the injected profile writer so the first write for `wallet` explodes
// the way an exhausted function instance does.
function failingProfilesOnce(deps, wallet) {
  const original = deps.profiles.updateWalletProfile;
  let failed = false;
  deps.profiles = {
    ...deps.profiles,
    updateWalletProfile: async (target, mutator) => {
      if (!failed && String(target).toLowerCase() === wallet.toLowerCase()) {
        failed = true;
        throw new TypeError("fetch failed");
      }
      return original(target, mutator);
    },
  };
  return () => failed;
}

test("sync: a deposit whose credit fails is queued and credited on the next run", async () => {
  await withTokenEnv(async ({ chain, deps, store, token, tokenStore }) => {
    await seedBalance(store, PLAYER, 10);
    const txHash = chain.mineIncoming(PLAYER, 80000);
    chain.advance(12);

    const didFail = failingProfilesOnce(deps, PLAYER);
    const first = await token.syncDeposits(deps);

    assert.ok(didFail(), "the fixture must have broken the first credit");
    assert.deepEqual(first.credited, [], "nothing may be reported as credited");
    assert.equal(first.errors.length, 1);
    assert.equal(first.pendingDeposits, 1, "the failed transfer must be parked for a retry");

    const afterFailure = await store.getWalletProfile(PLAYER);
    assert.equal(afterFailure.currency.balance, 10, "balance untouched while the credit failed");

    const parked = await tokenStore.readTokenState();
    assert.equal(parked.pendingDeposits.length, 1);
    assert.equal(parked.pendingDeposits[0].txHash, txHash);
    assert.equal(parked.pendingDeposits[0].from, PLAYER);
    assert.ok(parked.pendingDeposits[0].lastError.includes("fetch failed"));
    // The cursor has already passed that block — the retry queue is the only
    // thing standing between the player and a silent loss.
    assert.ok(parked.lastSyncedBlock >= first.toBlock);

    const second = await token.syncDeposits(deps);

    assert.equal(second.retriedDeposits, 1);
    assert.deepEqual(
      second.credited.map((entry) => [entry.wallet, entry.points, entry.txHash]),
      [[PLAYER, 80000, txHash]]
    );
    assert.equal(second.pendingDeposits, 0, "the queue must drain on success");

    const credited = await store.getWalletProfile(PLAYER);
    assert.equal(credited.currency.balance, 80010);
    assert.equal(credited.deposits.length, 1);
    assert.equal(credited.deposits[0].source, "retry");
  });
});

test("sync: a retried deposit is never credited twice", async () => {
  await withTokenEnv(async ({ chain, deps, store, token, tokenStore }) => {
    await seedBalance(store, PLAYER, 0);
    chain.mineIncoming(PLAYER, 5000);
    chain.advance(12);

    failingProfilesOnce(deps, PLAYER);
    await token.syncDeposits(deps); // fails, parks
    await token.syncDeposits(deps); // retries, credits
    const third = await token.syncDeposits(deps); // nothing left to do

    assert.equal(third.retriedDeposits, 0);
    assert.equal(third.pendingDeposits, 0);

    const profile = await store.getWalletProfile(PLAYER);
    assert.equal(profile.currency.balance, 5000, "the same transfer must not be credited twice");
    assert.equal(profile.deposits.length, 1);

    const state = await tokenStore.readTokenState();
    assert.deepEqual(state.pendingDeposits, []);
  });
});

test("sync: the manual fast path drains the queue too", async () => {
  await withTokenEnv(async ({ chain, deps, store, token, tokenStore }) => {
    await seedBalance(store, PLAYER, 0);
    const txHash = chain.mineIncoming(PLAYER, 1200);
    chain.advance(12);

    failingProfilesOnce(deps, PLAYER);
    await token.syncDeposits(deps);
    assert.equal((await tokenStore.readTokenState()).pendingDeposits.length, 1);

    // The player pastes the hash themselves before the next cron tick.
    const confirmed = await token.confirmDeposit(PLAYER, txHash, deps);
    assert.equal(confirmed.status, "credited");
    assert.equal(confirmed.points, 1200);

    // The queued copy must not add a second credit when the cron catches up.
    const next = await token.syncDeposits(deps);
    assert.equal(next.retriedDeposits, 0, "already credited by hand");
    assert.equal(next.pendingDeposits, 0, "and the queue is cleared");

    const profile = await store.getWalletProfile(PLAYER);
    assert.equal(profile.currency.balance, 1200);
    assert.equal(profile.deposits.length, 1);
  });
});

test("admin stats surface deposits stuck in the queue", async () => {
  await withTokenEnv(async ({ chain, deps, store, token }) => {
    await seedBalance(store, PLAYER, 0);
    chain.mineIncoming(PLAYER, 700);
    chain.advance(12);

    failingProfilesOnce(deps, PLAYER);
    await token.syncDeposits(deps);

    const stats = await token.adminStats(deps);
    assert.equal(stats.sync.pendingDeposits, 1, "an operator must see money waiting to land");
  });
});
