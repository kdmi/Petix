const test = require("node:test");
const assert = require("node:assert/strict");

const { BASE_NOW, evmWallet, seedBalance, withTokenEnv } = require("./helpers/token-test-utils");

const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("sendlock: parallel withdrawals from different wallets never share a nonce", async () => {
  await withTokenEnv(async ({ chain, deps, store, token }) => {
    const a = evmWallet("1");
    const b = evmWallet("2");
    await seedBalance(store, a, 1000);
    await seedBalance(store, b, 1000);
    chain.state.sendDelayMs = 40; // make the critical section observable
    const lockDeps = { ...deps, sleep: realSleep, lockPollMs: 5, lockWaitMs: 5000 };

    const [ra, rb] = await Promise.all([
      token.requestWithdraw(a, 300, lockDeps, { isAdmin: true }),
      token.requestWithdraw(b, 400, lockDeps, { isAdmin: true }),
    ]);

    assert.equal(ra.status, "sent");
    assert.equal(rb.status, "sent");
    const nonces = chain.state.sentTxs.map((entry) => entry.nonce).sort();
    assert.deepEqual(nonces, [7, 8]);
    assert.equal(chain.state.maxConcurrentSends, 1, "sends must be serialized");
    const state = await deps.tokenStore.readTokenState();
    assert.equal(state.sendLock, null);
  });
});

test("sendlock: the lock is released even when the send throws", async () => {
  await withTokenEnv(async ({ chain, deps, store, token }) => {
    const a = evmWallet("1");
    await seedBalance(store, a, 1000);
    const boom = new Error("nope");
    boom.code = "SEND_FAILED";
    chain.state.failNextSend = boom;
    await assert.rejects(token.requestWithdraw(a, 300, deps, { isAdmin: true }));
    const state = await deps.tokenStore.readTokenState();
    assert.equal(state.sendLock, null);
    // and the next withdrawal goes through
    const next = await token.requestWithdraw(a, 300, deps, { isAdmin: true });
    assert.equal(next.status, "sent");
  });
});

test("sendlock: a lock held by someone else past the wait budget → BUSY and refund", async () => {
  await withTokenEnv(async ({ chain, deps, store, token, tokenStore }) => {
    const a = evmWallet("1");
    await seedBalance(store, a, 1000);
    await tokenStore.acquireSendLock("another-lambda", { ttlMs: 60000, now: BASE_NOW });

    let caught = null;
    try {
      await token.requestWithdraw(a, 300, { ...deps, lockWaitMs: 20, lockPollMs: 5 }, { isAdmin: true });
    } catch (error) {
      caught = error;
    }
    assert.ok(caught);
    assert.equal(caught.httpCode, "BUSY");
    assert.equal(caught.httpStatus, 503);

    const profile = await store.getWalletProfile(a);
    assert.equal(profile.currency.balance, 1000);
    assert.equal(profile.withdrawals[0].status, "failed");
    assert.equal(profile.withdrawals[0].reason, "BUSY");
    assert.equal(chain.state.sentTxs.length, 0);
    const state = await tokenStore.readTokenState();
    assert.equal(state.sendLock.owner, "another-lambda", "foreign lock must stay untouched");
  });
});
