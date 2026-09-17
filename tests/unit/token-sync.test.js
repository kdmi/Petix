const test = require("node:test");
const assert = require("node:assert/strict");

const { evmWallet, seedBalance, withTokenEnv } = require("./helpers/token-test-utils");

const PLAYER = evmWallet("1");
const NEWCOMER = evmWallet("2"); // no profile yet
const INTERNAL = evmWallet("e");

test("sync: first run starts at TOKEN_START_BLOCK, respects confirmations, credits senders (creating profiles)", async () => {
  await withTokenEnv(async ({ chain, deps, store, token, tokenStore }) => {
    await seedBalance(store, PLAYER, 50);
    const tx1 = chain.mineIncoming(PLAYER, 300);
    const tx2 = chain.mineIncoming(NEWCOMER, 700);
    chain.mineIncoming(INTERNAL, 5000); // treasury top-up — never Points
    chain.advance(12);
    const unconfirmed = chain.mineIncoming(PLAYER, 999); // inside the confirmation window → next run

    const result = await token.syncDeposits(deps);
    assert.equal(result.scannedFromBlock, 10);
    assert.equal(result.toBlock, chain.state.blockNumber - 12);
    assert.deepEqual(
      result.credited.map((entry) => [entry.wallet, entry.points, entry.txHash]),
      [
        [PLAYER, 300, tx1],
        [NEWCOMER, 700, tx2],
      ]
    );
    assert.equal(result.skippedInternal, 1);
    assert.deepEqual(result.errors, []);

    const player = await store.getWalletProfile(PLAYER);
    assert.equal(player.currency.balance, 350);
    assert.equal(player.deposits[0].source, "sync");
    const newcomer = await store.getWalletProfile(NEWCOMER);
    assert.equal(newcomer.currency.balance, 700);

    const state = await tokenStore.readTokenState();
    assert.equal(state.lastSyncedBlock, result.toBlock);
    assert.equal(state.treasury, chain.state.treasury.address);
    assert.equal(state.token, chain.state.tokenContract);
    assert.equal(state.lastError, null);
    assert.ok(state.lastRunAt);

    // the unconfirmed one lands once the chain moves on
    chain.advance(12);
    const second = await token.syncDeposits(deps);
    assert.deepEqual(second.credited.map((entry) => entry.txHash), [unconfirmed]);
    assert.equal(second.scannedFromBlock, result.toBlock + 1);
  });
});

test("sync: bounded by TOKEN_SYNC_MAX_BLOCKS and resumable", async () => {
  await withTokenEnv(async ({ chain, deps, token, tokenStore }) => {
    chain.state.blockNumber = 5000;
    const late = chain.mineIncoming(PLAYER, 100); // block 5001
    chain.advance(12);
    const first = await token.syncDeposits(deps); // env: max 1000 blocks from start 10
    assert.equal(first.toBlock, 1010);
    assert.equal(first.credited.length, 0);
    let state = await tokenStore.readTokenState();
    assert.equal(state.lastSyncedBlock, 1010);

    // catch up in bounded steps
    let credited = [];
    for (let i = 0; i < 6 && !credited.length; i += 1) {
      const run = await token.syncDeposits(deps);
      credited = run.credited;
    }
    assert.deepEqual(credited.map((entry) => entry.txHash), [late]);
    state = await tokenStore.readTokenState();
    assert.equal(state.lastSyncedBlock, chain.state.blockNumber - 12);
  });
});

test("sync: never double-credits — fast path first, sync second, and repeated runs", async () => {
  await withTokenEnv(async ({ chain, deps, store, token }) => {
    const txHash = chain.mineIncoming(PLAYER, 400);
    chain.advance(12);
    const fast = await token.confirmDeposit(PLAYER, txHash, deps);
    assert.equal(fast.status, "credited");

    const run = await token.syncDeposits(deps);
    assert.equal(run.credited.length, 0);
    assert.equal(run.skippedDuplicate, 1);
    const again = await token.syncDeposits(deps);
    assert.equal(again.credited.length, 0);

    const profile = await store.getWalletProfile(PLAYER);
    assert.equal(profile.currency.balance, 400);
    assert.equal(profile.deposits.length, 1);
  });
});

test("sync: fast path after sync is already_credited", async () => {
  await withTokenEnv(async ({ chain, deps, store, token }) => {
    const txHash = chain.mineIncoming(PLAYER, 400);
    chain.advance(12);
    await token.syncDeposits(deps);
    const fast = await token.confirmDeposit(PLAYER, txHash, deps);
    assert.equal(fast.status, "already_credited");
    const profile = await store.getWalletProfile(PLAYER);
    assert.equal(profile.currency.balance, 400);
  });
});

test("sync: changing treasury/token resets the cursor; RPC failure records lastError and keeps the cursor", async () => {
  await withTokenEnv(async ({ chain, deps, token, tokenStore }) => {
    chain.mineIncoming(PLAYER, 100);
    chain.advance(12);
    const first = await token.syncDeposits(deps);
    assert.equal(first.credited.length, 1);
    let state = await tokenStore.readTokenState();
    const cursor = state.lastSyncedBlock;
    assert.ok(cursor > 0);

    // pretend the cursor belonged to another treasury
    await tokenStore.withTokenState((current) => {
      current.treasury = evmWallet("9");
      return current;
    });
    const reset = await token.syncDeposits(deps);
    assert.equal(reset.scannedFromBlock, 10, "cursor must restart from TOKEN_START_BLOCK");
    assert.equal(reset.credited.length, 0, "already credited keys are still honoured by the profile");
    assert.equal(reset.skippedDuplicate, 1);

    chain.state.rpcDown = true;
    const failed = await token.syncDeposits(deps);
    assert.equal(failed.errors.length, 1);
    state = await tokenStore.readTokenState();
    assert.equal(state.lastSyncedBlock, reset.toBlock);
    assert.match(state.lastError, /RPC/i);
  });
});

test("sync: also settles `sent` withdrawals of recently active wallets", async () => {
  await withTokenEnv(async ({ chain, clock, deps, store, token }) => {
    await seedBalance(store, PLAYER, 1000);
    const sent = await token.requestWithdraw(PLAYER, 300, deps, { isAdmin: true });
    assert.equal(sent.status, "sent");
    chain.confirm(sent.txHash);
    chain.advance(12);
    clock.now += 60000;
    const run = await token.syncDeposits(deps);
    assert.equal(run.reconciled, 1);
    const profile = await store.getWalletProfile(PLAYER);
    assert.equal(profile.withdrawals[0].status, "confirmed");
  });
});
