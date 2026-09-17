const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const { evmWallet, seedBalance, withTokenEnv } = require("./helpers/token-test-utils");

const DISPATCHER_PATH = path.resolve(__dirname, "../../api/token/[action].js");
const ROUTES_DIR = path.resolve(__dirname, "../../server-routes/token");
const AUTH_PATH = path.resolve(__dirname, "../../api/_lib/auth.js");

const ADMIN = evmWallet("a");
const PLAYER = evmWallet("1");
const LEGACY = "AwtqC9r5Wgvjfhqw5DrtzC5W73QRVF14DZVop8caECi9";

function freshDispatcher(token, deps) {
  for (const key of Object.keys(require.cache)) {
    if (key === DISPATCHER_PATH || key.startsWith(ROUTES_DIR)) delete require.cache[key];
  }
  token.configureDeps(deps);
  return require(DISPATCHER_PATH);
}

async function invoke(handler, { method = "GET", url = "/", headers = {}, body } = {}) {
  const listeners = { data: [], end: [], error: [] };
  const req = {
    method,
    url,
    headers: { host: "localhost:3000", ...headers },
    on(event, callback) {
      if (listeners[event]) listeners[event].push(callback);
      return this;
    },
  };
  const res = {
    statusCode: 200,
    headersSent: {},
    bodyText: "",
    getHeader(name) {
      return this.headersSent[name.toLowerCase()];
    },
    setHeader(name, value) {
      this.headersSent[name.toLowerCase()] = value;
    },
    end(chunk) {
      this.bodyText = chunk ? String(chunk) : "";
    },
  };
  const pending = Promise.resolve().then(() => handler(req, res));
  const raw = body === undefined ? "" : JSON.stringify(body);
  process.nextTick(() => {
    if (raw) listeners.data.forEach((cb) => cb(raw));
    listeners.end.forEach((cb) => cb());
  });
  await pending;
  return { status: res.statusCode, body: res.bodyText ? JSON.parse(res.bodyText) : null };
}

function sessionHeaders(wallet, walletType = "metamask") {
  const auth = require(AUTH_PATH);
  const { sessionToken } = auth.createSession(wallet, walletType);
  return { cookie: `${auth.SESSION_COOKIE}=${encodeURIComponent(sessionToken)}` };
}

test("http withdraw-request: 401 without a session", async () => {
  await withTokenEnv(async ({ deps, token }) => {
    const dispatcher = freshDispatcher(token, deps);
    const res = await invoke(dispatcher, { method: "POST", url: "/api/token/withdraw-request", body: { amount: 500 } });
    assert.equal(res.status, 401);
  });
});

test("http withdraw-request: legacy base58 session → 403 EVM_ONLY", async () => {
  await withTokenEnv(async ({ deps, token }) => {
    const dispatcher = freshDispatcher(token, deps);
    const res = await invoke(dispatcher, {
      method: "POST",
      url: "/api/token/withdraw-request",
      headers: sessionHeaders(LEGACY, "phantom"),
      body: { amount: 500 },
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, "EVM_ONLY");
  });
});

test("http withdraw-request: non-admin while WITHDRAW_ENABLED=0 → 403 WITHDRAW_ADMIN_ONLY", async () => {
  await withTokenEnv(async ({ deps, store, token }) => {
    await seedBalance(store, PLAYER, 1000);
    const dispatcher = freshDispatcher(token, deps);
    const res = await invoke(dispatcher, {
      method: "POST",
      url: "/api/token/withdraw-request",
      headers: sessionHeaders(PLAYER),
      body: { amount: 500 },
    });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, "WITHDRAW_ADMIN_ONLY");
    const profile = await store.getWalletProfile(PLAYER);
    assert.equal(profile.currency.balance, 1000);
  });
});

test("http withdraw-request + withdraw-status + config for an admin", async () => {
  await withTokenEnv(async ({ chain, deps, store, token }) => {
    await seedBalance(store, ADMIN, 1000);
    const dispatcher = freshDispatcher(token, deps);
    const headers = sessionHeaders(ADMIN);

    const requested = await invoke(dispatcher, {
      method: "POST",
      url: "/api/token/withdraw-request",
      headers,
      body: { amount: 500 },
    });
    assert.equal(requested.status, 200);
    assert.equal(requested.body.status, "sent");
    assert.match(requested.body.txHash, /^0x/);
    assert.equal(requested.body.explorerUrl, `https://explorer.test/tx/${requested.body.txHash}`);
    assert.equal(requested.body.balance, 500);

    // config lists the pending record and hides treasury ETH
    let config = await invoke(dispatcher, { url: "/api/token/config", headers });
    assert.equal(config.status, 200);
    assert.equal(config.body.enabled, true);
    assert.equal(config.body.isAdmin, true);
    assert.equal(config.body.public, false);
    assert.equal(config.body.reason, null);
    assert.equal(config.body.pending.length, 1);
    assert.equal(config.body.pending[0].id, requested.body.id);
    assert.equal(config.body.pending[0].status, "sent");
    assert.equal(typeof config.body.treasury.available, "string");
    assert.equal("eth" in config.body.treasury, false);
    assert.equal(config.body.deposit.address, chain.state.treasury.address);
    assert.equal(config.body.chain.chainIdHex, "0x1237");
    assert.equal(config.body.min, 200);
    assert.equal(config.body.maxPerTx, 0);

    // the network mines it → status reports confirmed
    chain.confirm(requested.body.txHash);
    const status = await invoke(dispatcher, {
      method: "POST",
      url: "/api/token/withdraw-status",
      headers,
      body: { id: requested.body.id },
    });
    assert.equal(status.status, 200);
    assert.equal(status.body.status, "confirmed");
    assert.equal(status.body.balance, 500);
    assert.equal(status.body.explorerUrl, `https://explorer.test/tx/${requested.body.txHash}`);

    config = await invoke(dispatcher, { url: "/api/token/config", headers });
    assert.equal(config.body.pending.length, 0);

    // unknown id → 404
    const missing = await invoke(dispatcher, {
      method: "POST",
      url: "/api/token/withdraw-status",
      headers,
      body: { id: "nope" },
    });
    assert.equal(missing.status, 404);
  });
});

test("http: domain errors map to their HTTP codes", async () => {
  await withTokenEnv(async ({ chain, deps, store, token }) => {
    await seedBalance(store, ADMIN, 1000);
    const dispatcher = freshDispatcher(token, deps);
    const headers = sessionHeaders(ADMIN);

    const below = await invoke(dispatcher, {
      method: "POST",
      url: "/api/token/withdraw-request",
      headers,
      body: { amount: 10 },
    });
    assert.equal(below.status, 400);
    assert.equal(below.body.code, "BELOW_MIN");
    assert.equal(below.body.min, 200);

    chain.state.treasury.tokensRaw = 0n;
    const empty = await invoke(dispatcher, {
      method: "POST",
      url: "/api/token/withdraw-request",
      headers,
      body: { amount: 300 },
    });
    assert.equal(empty.status, 503);
    assert.equal(empty.body.code, "INSUFFICIENT_TREASURY");

    const wrongMethod = await invoke(dispatcher, { method: "GET", url: "/api/token/withdraw-request", headers });
    assert.equal(wrongMethod.status, 405);

    const unknown = await invoke(dispatcher, { url: "/api/token/whatever", headers });
    assert.equal(unknown.status, 404);
  });
});

// ---- part 2: deposit, sync, history --------------------------------------------

test("http deposit-prepare / deposit-confirm / history", async () => {
  await withTokenEnv(async ({ chain, deps, token }) => {
    const dispatcher = freshDispatcher(token, deps);
    const headers = sessionHeaders(ADMIN);

    const unauth = await invoke(dispatcher, { method: "POST", url: "/api/token/deposit-prepare", body: { amount: 100 } });
    assert.equal(unauth.status, 401);

    const prepared = await invoke(dispatcher, {
      method: "POST",
      url: "/api/token/deposit-prepare",
      headers,
      body: { amount: 250 },
    });
    assert.equal(prepared.status, 200);
    assert.equal(prepared.body.address, chain.state.treasury.address);
    assert.equal(prepared.body.tx.to, chain.state.tokenContract);

    const txHash = chain.mineIncoming(ADMIN, 250);
    const early = await invoke(dispatcher, {
      method: "POST",
      url: "/api/token/deposit-confirm",
      headers,
      body: { txHash },
    });
    assert.equal(early.status, 202);
    assert.equal(early.body.status, "pending");

    chain.advance(12);
    const credited = await invoke(dispatcher, {
      method: "POST",
      url: "/api/token/deposit-confirm",
      headers,
      body: { txHash },
    });
    assert.equal(credited.status, 200);
    assert.equal(credited.body.status, "credited");
    assert.equal(credited.body.points, 250);
    assert.equal(credited.body.balance, 250);

    const history = await invoke(dispatcher, { url: "/api/token/history", headers });
    assert.equal(history.status, 200);
    assert.equal(history.body.deposits.length, 1);
    assert.equal(history.body.deposits[0].explorerUrl, `https://explorer.test/tx/${txHash}`);
    assert.equal(Array.isArray(history.body.withdrawals), true);
  });
});

test("http sync: cron secret, internal header or EVM session; skipped when the flag is off", async () => {
  await withTokenEnv(async ({ chain, deps, token }) => {
    const dispatcher = freshDispatcher(token, deps);
    chain.mineIncoming(PLAYER, 100);
    chain.advance(12);

    const anon = await invoke(dispatcher, { url: "/api/token/sync" });
    assert.equal(anon.status, 401);

    const cron = await invoke(dispatcher, {
      url: "/api/token/sync",
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    assert.equal(cron.status, 200);
    assert.equal(cron.body.credited.length, 1);

    const internal = await invoke(dispatcher, {
      method: "POST",
      url: "/api/token/sync",
      headers: { "x-petix-internal-secret": process.env.INTERNAL_API_SECRET },
    });
    assert.equal(internal.status, 200);
    assert.equal(internal.body.credited.length, 0);

    const session = await invoke(dispatcher, { method: "POST", url: "/api/token/sync", headers: sessionHeaders(ADMIN) });
    assert.equal(session.status, 200);
  });
});
