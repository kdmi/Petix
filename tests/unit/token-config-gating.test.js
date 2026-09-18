const test = require("node:test");
const assert = require("node:assert/strict");

const {
  evmWallet,
  freshDispatcher,
  invokeJsonHandler,
  seedBalance,
  sessionHeaders,
  withTokenEnv,
} = require("./helpers/token-test-utils");

const ADMIN = evmWallet("a");
const PLAYER = evmWallet("1");
const LEGACY = "AwtqC9r5Wgvjfhqw5DrtzC5W73QRVF14DZVop8caECi9";

const SECRET_FIELDS = ["deposit", "treasury", "tokenContract", "rpcUrl", "address"];

function assertNoSecrets(body) {
  const text = JSON.stringify(body || {});
  for (const field of SECRET_FIELDS) {
    assert.equal(text.includes(`"${field}"`), false, `response must not expose ${field}`);
  }
  assert.equal(/0x[0-9a-f]{40}/i.test(text), false, "response must not expose any address");
}

test("gating: TOKEN_ENABLED off → every action 404 except sync (200 skipped), nothing leaks", async () => {
  await withTokenEnv(
    async ({ deps, token }) => {
      const dispatcher = freshDispatcher(token, deps);
      const headers = sessionHeaders(ADMIN);
      for (const action of ["config", "withdraw-request", "withdraw-status", "deposit-prepare", "deposit-confirm", "history"]) {
        const res = await invokeJsonHandler(dispatcher, { method: "POST", url: `/api/token/${action}`, headers, body: {} });
        assert.equal(res.status, 404, action);
        assert.equal(res.body.code, "TOKEN_DISABLED", action);
        assertNoSecrets(res.body);
      }
      const sync = await invokeJsonHandler(dispatcher, { url: "/api/token/sync" });
      assert.equal(sync.status, 200);
      assert.equal(sync.body.skipped, true);
    },
    { env: { TOKEN_ENABLED: "0" } }
  );
});

test("gating: non-admin while WITHDRAW_ENABLED=0 → enabled:false, reason ADMIN_ONLY, no deposit address", async () => {
  await withTokenEnv(async ({ deps, store, token }) => {
    await seedBalance(store, PLAYER, 1000);
    const dispatcher = freshDispatcher(token, deps);
    const headers = sessionHeaders(PLAYER);

    const config = await invokeJsonHandler(dispatcher, { url: "/api/token/config", headers });
    assert.equal(config.status, 200);
    assert.equal(config.body.enabled, false);
    assert.equal(config.body.reason, "ADMIN_ONLY");
    assert.equal(config.body.public, false);
    assert.equal(config.body.isAdmin, false);
    assert.equal(config.body.deposit, undefined, "admin-only mode keeps the deposit address away from players");
    assertNoSecrets(config.body);

    const prepare = await invokeJsonHandler(dispatcher, {
      method: "POST",
      url: "/api/token/deposit-prepare",
      headers,
      body: { amount: 100 },
    });
    assert.equal(prepare.status, 403);
    assert.equal(prepare.body.code, "WITHDRAW_ADMIN_ONLY");
    assertNoSecrets(prepare.body);
  });
});

test("gating: admin gets enabled:true with the deposit address; WITHDRAW_ENABLED=1 opens it to everyone", async () => {
  await withTokenEnv(async ({ chain, configOverrides, deps, economyConfig, token }) => {
    const dispatcher = freshDispatcher(token, deps);

    const admin = await invokeJsonHandler(dispatcher, { url: "/api/token/config", headers: sessionHeaders(ADMIN) });
    assert.equal(admin.body.enabled, true);
    assert.equal(admin.body.reason, null);
    assert.equal(admin.body.deposit.address, chain.state.treasury.address);

    // flip the runtime switch (the handlers read the real economy-config store)
    await economyConfig.setEconomyConfig({ WITHDRAW_ENABLED: 1 }, { adminWallet: ADMIN });
    configOverrides.WITHDRAW_ENABLED = 1;
    const player = await invokeJsonHandler(dispatcher, { url: "/api/token/config", headers: sessionHeaders(PLAYER) });
    assert.equal(player.body.enabled, true);
    assert.equal(player.body.public, true);
    assert.equal(player.body.deposit.address, chain.state.treasury.address);
  });
});

test("gating: incomplete env → configured:false, reason TOKEN_NOT_CONFIGURED, withdraw 503", async () => {
  await withTokenEnv(
    async ({ deps, store, token }) => {
      await seedBalance(store, ADMIN, 1000);
      const dispatcher = freshDispatcher(token, deps);
      const headers = sessionHeaders(ADMIN);
      const config = await invokeJsonHandler(dispatcher, { url: "/api/token/config", headers });
      assert.equal(config.body.enabled, false);
      assert.equal(config.body.configured, false);
      assert.equal(config.body.reason, "TOKEN_NOT_CONFIGURED");
      assertNoSecrets(config.body);

      const req = await invokeJsonHandler(dispatcher, {
        method: "POST",
        url: "/api/token/withdraw-request",
        headers,
        body: { amount: 500 },
      });
      assert.equal(req.status, 503);
      assert.equal(req.body.code, "TOKEN_NOT_CONFIGURED");
    },
    { env: { TOKEN_CONTRACT: null } }
  );
});

test("gating: legacy base58 session → EVM_ONLY everywhere", async () => {
  await withTokenEnv(async ({ deps, token }) => {
    const dispatcher = freshDispatcher(token, deps);
    const headers = sessionHeaders(LEGACY, "phantom");
    const config = await invokeJsonHandler(dispatcher, { url: "/api/token/config", headers });
    assert.equal(config.status, 200);
    assert.equal(config.body.enabled, false);
    assert.equal(config.body.reason, "EVM_ONLY");
    assertNoSecrets(config.body);

    for (const action of ["withdraw-request", "withdraw-status", "deposit-prepare", "deposit-confirm"]) {
      const res = await invokeJsonHandler(dispatcher, { method: "POST", url: `/api/token/${action}`, headers, body: {} });
      assert.equal(res.status, 403, action);
      assert.equal(res.body.code, "EVM_ONLY", action);
    }
  });
});

test("gating: reason priority — disabled beats EVM_ONLY beats not-configured beats admin-only", async () => {
  await withTokenEnv(
    async ({ token }) => {
      const config = await token.getTokenConfigForWallet(LEGACY);
      assert.equal(config.reason, "TOKEN_DISABLED");
    },
    { env: { TOKEN_ENABLED: "0", TOKEN_CONTRACT: null } }
  );
  await withTokenEnv(
    async ({ token }) => {
      assert.equal((await token.getTokenConfigForWallet(LEGACY)).reason, "EVM_ONLY");
      assert.equal((await token.getTokenConfigForWallet(PLAYER)).reason, "TOKEN_NOT_CONFIGURED");
    },
    { env: { TOKEN_CONTRACT: null } }
  );
});
