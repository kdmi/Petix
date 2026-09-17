const test = require("node:test");
const assert = require("node:assert/strict");

const {
  evmWallet,
  freshDispatcher,
  invokeJsonHandler,
  seedBalance,
  sessionHeaders,
  toRaw,
  withTokenEnv,
} = require("./helpers/token-test-utils");

const ADMIN = evmWallet("a");
const PLAYER = evmWallet("1");

test("admin token-stats: 403 for non-admins, 404 when the feature flag is off", async () => {
  await withTokenEnv(async ({ deps, token }) => {
    const dispatcher = freshDispatcher(token, deps, { admin: true });
    const res = await invokeJsonHandler(dispatcher, { url: "/api/admin/token-stats", headers: sessionHeaders(PLAYER) });
    assert.equal(res.status, 403);
  });
  await withTokenEnv(
    async ({ deps, token }) => {
      const dispatcher = freshDispatcher(token, deps, { admin: true });
      const res = await invokeJsonHandler(dispatcher, { url: "/api/admin/token-stats", headers: sessionHeaders(ADMIN) });
      assert.equal(res.status, 404);
      assert.equal(res.body.code, "TOKEN_DISABLED");
    },
    { env: { TOKEN_ENABLED: "0" } }
  );
});

test("admin token-stats: treasury snapshot, today's flows, pending payouts, sync state and a journal", async () => {
  await withTokenEnv(async ({ chain, clock, deps, store, token }) => {
    await seedBalance(store, PLAYER, 1000);
    // one withdrawal left in flight, one deposit credited by the cron
    const sent = await token.requestWithdraw(PLAYER, 300, deps, { isAdmin: true });
    const depositTx = chain.mineIncoming(PLAYER, 150);
    chain.advance(12);
    await token.syncDeposits(deps);

    chain.state.treasury.ethWei = 5n * 10n ** 15n; // 0.005 ETH → lowGas
    const dispatcher = freshDispatcher(token, deps, { admin: true });
    const res = await invokeJsonHandler(dispatcher, { url: "/api/admin/token-stats", headers: sessionHeaders(ADMIN) });
    assert.equal(res.status, 200);

    const body = res.body;
    assert.equal(body.treasury.address, chain.state.treasury.address);
    assert.equal(body.treasury.tokens, (BigInt(chain.state.treasury.tokensRaw) / 10n ** 18n).toString());
    assert.equal(body.treasury.eth, "0.005");
    assert.equal(body.treasury.lowGas, true);
    assert.equal(body.treasury.lowTokens, false);

    assert.equal(body.today.withdrawnPoints, 300);
    assert.equal(body.today.depositedPoints, 150);
    assert.equal(body.pending.count, 1);
    assert.equal(body.pending.points, 300);
    assert.equal(body.sync.lastSyncedBlock, chain.state.blockNumber - 12);
    assert.equal(body.sync.lastError, null);
    assert.ok(body.sync.lastRunAt);

    assert.equal(body.recent.length, 2);
    const kinds = body.recent.map((entry) => entry.kind).sort();
    assert.deepEqual(kinds, ["deposit", "withdrawal"]);
    const withdrawalRow = body.recent.find((entry) => entry.kind === "withdrawal");
    assert.equal(withdrawalRow.wallet, PLAYER);
    assert.equal(withdrawalRow.status, "sent");
    assert.equal(withdrawalRow.explorerUrl, `https://explorer.test/tx/${sent.txHash}`);
    const depositRow = body.recent.find((entry) => entry.kind === "deposit");
    assert.equal(depositRow.explorerUrl, `https://explorer.test/tx/${depositTx}`);
    assert.equal(depositRow.points, 150);

    // lowTokens: treasury below the last-7-days payout volume
    chain.state.treasury.tokensRaw = BigInt(toRaw(100));
    clock.now += 1000;
    const again = await invokeJsonHandler(dispatcher, { url: "/api/admin/token-stats", headers: sessionHeaders(ADMIN) });
    assert.equal(again.body.treasury.lowTokens, true);
  });
});

test("admin token-stats: RPC down → treasury numbers null with rpcDegraded, journal still served", async () => {
  await withTokenEnv(async ({ chain, deps, store, token }) => {
    await seedBalance(store, PLAYER, 1000);
    await token.requestWithdraw(PLAYER, 300, deps, { isAdmin: true });
    chain.state.rpcDown = true;
    const dispatcher = freshDispatcher(token, deps, { admin: true });
    const res = await invokeJsonHandler(dispatcher, { url: "/api/admin/token-stats", headers: sessionHeaders(ADMIN) });
    assert.equal(res.status, 200);
    assert.equal(res.body.rpcDegraded, true);
    assert.equal(res.body.treasury.tokens, null);
    assert.equal(res.body.recent.length, 1);
  });
});
