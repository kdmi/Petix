const test = require("node:test");
const assert = require("node:assert/strict");

process.env.SOLANA_AUTH_SECRET = "petix-solana-disabled-test-secret-0123456789";

const auth = require("../../api/_lib/auth");
const solanaChallenge = require("../../server-routes/auth/solana/challenge");
const solanaVerify = require("../../server-routes/auth/solana/verify");
const solanaMe = require("../../server-routes/auth/solana/me");
const solanaLogout = require("../../server-routes/auth/solana/logout");
const evmMe = require("../../server-routes/auth/evm/me");
const evmLogout = require("../../server-routes/auth/evm/logout");

const LEGACY_WALLET = "AwtqC9r5Wgvjfhqw5DrtzC5W73QRVF14DZVop8caECi9";

async function invokeJsonHandler(handler, { method = "POST", url = "/", headers = {}, body } = {}) {
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
      const key = name.toLowerCase();
      if (key === "set-cookie") {
        const existing = this.headersSent[key];
        this.headersSent[key] = existing ? [].concat(existing, value) : [].concat(value);
        return;
      }
      this.headersSent[key] = value;
    },
    end(chunk) {
      this.bodyText = chunk ? String(chunk) : "";
    },
  };

  const handlerPromise = Promise.resolve().then(() => handler(req, res));
  const rawBody = body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body);
  process.nextTick(() => {
    if (rawBody) listeners.data.forEach((callback) => callback(rawBody));
    listeners.end.forEach((callback) => callback());
  });
  await handlerPromise;

  return {
    body: res.bodyText ? JSON.parse(res.bodyText) : null,
    headers: res.headersSent,
    statusCode: res.statusCode,
  };
}

test("solana challenge is disabled with 410 SOLANA_AUTH_DISABLED", async () => {
  const response = await invokeJsonHandler(solanaChallenge, {
    body: { wallet: LEGACY_WALLET },
  });
  assert.equal(response.statusCode, 410);
  assert.equal(response.body.code, "SOLANA_AUTH_DISABLED");
});

test("solana verify is disabled with 410 SOLANA_AUTH_DISABLED", async () => {
  const response = await invokeJsonHandler(solanaVerify, {
    body: {
      wallet: LEGACY_WALLET,
      walletType: "phantom",
      message: "irrelevant",
      challengeToken: "irrelevant",
      signature: "irrelevant",
    },
  });
  assert.equal(response.statusCode, 410);
  assert.equal(response.body.code, "SOLANA_AUTH_DISABLED");
});

test("disabled endpoints still reject non-POST methods with 405", async () => {
  const response = await invokeJsonHandler(solanaChallenge, { method: "GET" });
  assert.equal(response.statusCode, 405);
});

test("a live legacy solana session keeps working via me until it expires", async () => {
  const { sessionToken } = auth.createSession(LEGACY_WALLET, "phantom");
  const response = await invokeJsonHandler(solanaMe, {
    method: "GET",
    headers: { cookie: `${auth.SESSION_COOKIE}=${sessionToken}` },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.authenticated, true);
  assert.equal(response.body.wallet, LEGACY_WALLET);
  assert.equal(response.body.isAdmin, true);
  assert.equal(response.body.walletName, "Phantom");
});

test("legacy session is also accepted by getSessionFromRequest", () => {
  const { sessionToken } = auth.createSession(LEGACY_WALLET, "phantom");
  const session = auth.getSessionFromRequest({
    headers: { cookie: `${auth.SESSION_COOKIE}=${encodeURIComponent(sessionToken)}` },
  });
  assert.ok(session, "legacy session expected");
  assert.equal(session.wallet, LEGACY_WALLET);
});

test("solana logout still clears cookies (legacy sessions can log out)", async () => {
  const response = await invokeJsonHandler(solanaLogout, {});
  assert.equal(response.statusCode, 200);
  const setCookies = [].concat(response.headers["set-cookie"] || []);
  assert.ok(
    setCookies.some((value) => value.startsWith(`${auth.SESSION_COOKIE}=;`)),
    "session cookie must be cleared"
  );
});

test("evm me/logout re-export the same chain-agnostic handlers", () => {
  assert.equal(evmMe, solanaMe);
  assert.equal(evmLogout, solanaLogout);
});
