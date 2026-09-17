const test = require("node:test");
const assert = require("node:assert/strict");

const { evmWallet, seedBalance, withTokenEnv } = require("./helpers/token-test-utils");

const PLAYER = evmWallet("1");
const MINUTE = 60000;

async function sendOne(token, deps, store, points = 300) {
  await seedBalance(store, PLAYER, 1000);
  const result = await token.requestWithdraw(PLAYER, points, deps, { isAdmin: true });
  assert.equal(result.status, "sent");
  return result;
}

test("reconcile: receipt status 1 → confirmed, no refund", async () => {
  await withTokenEnv(async ({ chain, deps, store, token }) => {
    const sent = await sendOne(token, deps, store);
    chain.confirm(sent.txHash);
    const outcome = await token.reconcileWithdrawal(PLAYER, sent.id, deps);
    assert.equal(outcome.status, "confirmed");
    assert.equal(outcome.txHash, sent.txHash);
    const profile = await store.getWalletProfile(PLAYER);
    assert.equal(profile.currency.balance, 700);
    assert.equal(profile.withdrawals[0].status, "confirmed");
  });
});

test("reconcile: receipt status 0 → failed + refund", async () => {
  await withTokenEnv(async ({ chain, deps, store, token }) => {
    const sent = await sendOne(token, deps, store);
    chain.confirm(sent.txHash, { status: 0 });
    const outcome = await token.reconcileWithdrawal(PLAYER, sent.id, deps);
    assert.equal(outcome.status, "failed");
    const profile = await store.getWalletProfile(PLAYER);
    assert.equal(profile.currency.balance, 1000);
  });
});

test("reconcile: no receipt and nonce not consumed → still sent, even an hour later", async () => {
  await withTokenEnv(async ({ clock, deps, store, token }) => {
    const sent = await sendOne(token, deps, store);
    clock.now += 60 * MINUTE;
    const outcome = await token.reconcileWithdrawal(PLAYER, sent.id, deps);
    assert.equal(outcome.status, "sent");
    const profile = await store.getWalletProfile(PLAYER);
    assert.equal(profile.currency.balance, 700);
  });
});

test("reconcile: nonce consumed by another tx but too fresh → wait; after 2 min → dropped + refund", async () => {
  await withTokenEnv(async ({ chain, clock, deps, store, token }) => {
    const sent = await sendOne(token, deps, store);
    chain.displaceNonce(); // nonceLatest jumps past our nonce, our tx has no receipt

    clock.now += 1 * MINUTE;
    let outcome = await token.reconcileWithdrawal(PLAYER, sent.id, deps);
    assert.equal(outcome.status, "sent");

    clock.now += 2 * MINUTE;
    outcome = await token.reconcileWithdrawal(PLAYER, sent.id, deps);
    assert.equal(outcome.status, "dropped");
    let profile = await store.getWalletProfile(PLAYER);
    assert.equal(profile.currency.balance, 1000);

    // idempotent
    outcome = await token.reconcileWithdrawal(PLAYER, sent.id, deps);
    assert.equal(outcome.status, "dropped");
    profile = await store.getWalletProfile(PLAYER);
    assert.equal(profile.currency.balance, 1000);
  });
});

test("reconcile: a reserved record that never got a tx is refunded after the drop age", async () => {
  await withTokenEnv(async ({ clock, deps, store, token, withdrawalStore }) => {
    await seedBalance(store, PLAYER, 1000);
    await store.updateWalletProfile(PLAYER, (profile) => {
      withdrawalStore.reserveWithdrawal(profile, {
        id: "orphan",
        points: 200,
        feePct: 0,
        amountRaw: "0",
        now: clock.now,
      });
      return profile;
    });
    let outcome = await token.reconcileWithdrawal(PLAYER, "orphan", deps);
    assert.equal(outcome.status, "reserved");
    clock.now += 3 * MINUTE;
    outcome = await token.reconcileWithdrawal(PLAYER, "orphan", deps);
    assert.equal(outcome.status, "failed");
    const profile = await store.getWalletProfile(PLAYER);
    assert.equal(profile.currency.balance, 1000);
  });
});

test("reconcile: unknown id → null, RPC down → error without touching the record", async () => {
  await withTokenEnv(async ({ chain, deps, store, token }) => {
    const sent = await sendOne(token, deps, store);
    assert.equal(await token.reconcileWithdrawal(PLAYER, "nope", deps), null);
    chain.state.rpcDown = true;
    await assert.rejects(token.reconcileWithdrawal(PLAYER, sent.id, deps), { code: "RPC_UNAVAILABLE" });
    const profile = await store.getWalletProfile(PLAYER);
    assert.equal(profile.withdrawals[0].status, "sent");
  });
});

test("reconcileWalletUnsettled settles several records in one pass", async () => {
  await withTokenEnv(async ({ chain, clock, deps, store, token }) => {
    await seedBalance(store, PLAYER, 1000);
    const first = await token.requestWithdraw(PLAYER, 200, deps, { isAdmin: true });
    const second = await token.requestWithdraw(PLAYER, 300, deps, { isAdmin: true });
    const third = await token.requestWithdraw(PLAYER, 200, deps, { isAdmin: true });
    chain.confirm(first.txHash);
    chain.confirm(second.txHash, { status: 0 });
    // third: displaced and old
    chain.displaceNonce();
    clock.now += 5 * MINUTE;

    const summary = await token.reconcileWalletUnsettled(PLAYER, deps);
    assert.equal(summary.confirmed, 1);
    assert.equal(summary.refunded, 2);

    const profile = await store.getWalletProfile(PLAYER);
    const byId = Object.fromEntries(profile.withdrawals.map((record) => [record.id, record.status]));
    assert.equal(byId[first.id], "confirmed");
    assert.equal(byId[second.id], "failed");
    assert.equal(byId[third.id], "dropped");
    assert.equal(profile.currency.balance, 800);
  });
});
