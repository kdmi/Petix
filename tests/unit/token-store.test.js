const test = require("node:test");
const assert = require("node:assert/strict");

const { BASE_NOW, evmWallet, withTokenEnv } = require("./helpers/token-test-utils");

test("token-store: empty state has sane defaults", async () => {
  await withTokenEnv(async ({ tokenStore }) => {
    const state = await tokenStore.readTokenState();
    assert.equal(state.treasury, null);
    assert.equal(state.token, null);
    assert.equal(state.startBlock, 0);
    assert.equal(state.lastSyncedBlock, 0);
    assert.deepEqual(state.recentKeys, []);
    assert.deepEqual(state.recentWallets, []);
    assert.equal(state.sendLock, null);
    assert.deepEqual(state.dailyOut, { day: 0, points: 0 });
    assert.equal(state.lastRunAt, null);
    assert.equal(state.lastError, null);
  });
});

test("token-store: cursor and diagnostics persist across reads", async () => {
  await withTokenEnv(async ({ tokenStore }) => {
    await tokenStore.withTokenState((state) => {
      state.lastSyncedBlock = 4242;
      state.lastRunAt = new Date(BASE_NOW).toISOString();
      state.lastError = "boom";
      return state;
    });
    const state = await tokenStore.readTokenState();
    assert.equal(state.lastSyncedBlock, 4242);
    assert.equal(state.lastRunAt, new Date(BASE_NOW).toISOString());
    assert.equal(state.lastError, "boom");
  });
});

test("token-store: recentKeys is a bounded FIFO, recentWallets deduplicates", async () => {
  await withTokenEnv(async ({ tokenStore }) => {
    const state = tokenStore.normalizeState(null);
    for (let i = 0; i < 5100; i += 1) tokenStore.rememberKeys(state, [`0xhash${i}:0`]);
    assert.equal(state.recentKeys.length, 5000);
    assert.equal(state.recentKeys[0], "0xhash100:0");
    assert.equal(tokenStore.hasKey(state, "0xhash5099:0"), true);
    assert.equal(tokenStore.hasKey(state, "0xhash5:0"), false);

    tokenStore.rememberWallet(state, evmWallet("1"));
    tokenStore.rememberWallet(state, evmWallet("1").toUpperCase());
    tokenStore.rememberWallet(state, evmWallet("2"));
    assert.deepEqual(state.recentWallets, [evmWallet("1"), evmWallet("2")]);
    for (let i = 0; i < 600; i += 1) tokenStore.rememberWallet(state, `0x${String(i).padStart(40, "0")}`);
    assert.equal(state.recentWallets.length, 500);
  });
});

test("token-store: resetIfChanged clears the cursor when treasury/token change", async () => {
  await withTokenEnv(async ({ tokenStore }) => {
    const state = tokenStore.normalizeState({
      treasury: evmWallet("f"),
      token: evmWallet("c"),
      startBlock: 10,
      lastSyncedBlock: 900,
      recentKeys: ["a:0"],
      recentWallets: [evmWallet("1")],
    });

    // same identity → untouched
    assert.equal(
      tokenStore.resetIfChanged(state, { treasury: evmWallet("f"), token: evmWallet("c"), startBlock: 10 }),
      false
    );
    assert.equal(state.lastSyncedBlock, 900);

    // new treasury → cursor and keys reset, wallets kept (journal), startBlock updated
    assert.equal(
      tokenStore.resetIfChanged(state, { treasury: evmWallet("9"), token: evmWallet("c"), startBlock: 50 }),
      true
    );
    assert.equal(state.treasury, evmWallet("9"));
    assert.equal(state.lastSyncedBlock, 0);
    assert.equal(state.startBlock, 50);
    assert.deepEqual(state.recentKeys, []);
    assert.deepEqual(state.recentWallets, [evmWallet("1")]);
  });
});

test("token-store: send lock is exclusive until released or expired", async () => {
  await withTokenEnv(async ({ tokenStore }) => {
    const now = BASE_NOW;
    assert.equal(await tokenStore.acquireSendLock("lambda-1", { ttlMs: 20000, now }), true);
    assert.equal(await tokenStore.acquireSendLock("lambda-2", { ttlMs: 20000, now: now + 1000 }), false);
    // the owner can re-enter (refresh) its own lock
    assert.equal(await tokenStore.acquireSendLock("lambda-1", { ttlMs: 20000, now: now + 1000 }), true);
    // someone else cannot release it
    assert.equal(await tokenStore.releaseSendLock("lambda-2"), false);
    assert.equal(await tokenStore.acquireSendLock("lambda-2", { ttlMs: 20000, now: now + 2000 }), false);
    // expiry frees it
    assert.equal(await tokenStore.acquireSendLock("lambda-2", { ttlMs: 20000, now: now + 30000 }), true);
    assert.equal(await tokenStore.releaseSendLock("lambda-2"), true);
    const state = await tokenStore.readTokenState();
    assert.equal(state.sendLock, null);
  });
});

test("token-store: bumpDailyOut accumulates within a UTC day and resets on the next", async () => {
  await withTokenEnv(async ({ tokenStore }) => {
    const state = tokenStore.normalizeState(null);
    const day1 = Date.parse("2026-09-12T23:50:00.000Z");
    tokenStore.bumpDailyOut(state, 100, day1);
    tokenStore.bumpDailyOut(state, 50, day1 + 60000);
    assert.equal(state.dailyOut.points, 150);
    assert.equal(tokenStore.dailyOutFor(state, day1 + 60000), 150);

    const day2 = Date.parse("2026-09-13T00:01:00.000Z");
    assert.equal(tokenStore.dailyOutFor(state, day2), 0);
    tokenStore.bumpDailyOut(state, 30, day2);
    assert.equal(state.dailyOut.points, 30);
    assert.equal(state.dailyOut.day, Math.floor(day2 / 86400000));
  });
});
