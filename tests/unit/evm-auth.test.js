const test = require("node:test");
const assert = require("node:assert/strict");
const { Wallet } = require("ethers");

process.env.SOLANA_AUTH_SECRET = "petix-evm-auth-test-secret-0123456789abcdef";

const auth = require("../../api/_lib/auth");
const challengeHandler = require("../../server-routes/auth/evm/challenge");
const verifyHandler = require("../../server-routes/auth/evm/verify");

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

function challengeCookieHeader(challengeToken) {
  return { cookie: `${auth.CHALLENGE_COOKIE}=${challengeToken}` };
}

async function requestChallenge(wallet) {
  return invokeJsonHandler(challengeHandler, { body: { wallet } });
}

async function signInFlow(wallet, { walletType = "metamask", requestWallet } = {}) {
  const challenge = await requestChallenge(requestWallet || wallet.address);
  assert.equal(challenge.statusCode, 200);
  const signature = await wallet.signMessage(challenge.body.message);
  const verify = await invokeJsonHandler(verifyHandler, {
    headers: challengeCookieHeader(challenge.body.challengeToken),
    body: {
      wallet: requestWallet || wallet.address,
      walletType,
      message: challenge.body.message,
      challengeToken: challenge.body.challengeToken,
      signature,
    },
  });
  return { challenge, verify };
}

test("EVM challenge → sign → verify issues a session with the canonical lowercase wallet", async () => {
  const wallet = Wallet.createRandom();
  const { verify } = await signInFlow(wallet);

  assert.equal(verify.statusCode, 200);
  assert.equal(verify.body.authenticated, true);
  assert.equal(verify.body.wallet, wallet.address.toLowerCase());
  assert.equal(verify.body.walletType, "metamask");
  assert.equal(verify.body.walletName, "MetaMask");

  const setCookies = [].concat(verify.headers["set-cookie"] || []);
  const sessionCookie = setCookies.find((value) => value.startsWith(`${auth.SESSION_COOKIE}=`));
  assert.ok(sessionCookie, "session cookie must be set");
  const sessionToken = sessionCookie.split(";")[0].split("=")[1];
  const session = auth.verifyToken(sessionToken);
  assert.equal(session.type, "session");
  assert.equal(session.wallet, wallet.address.toLowerCase());
});

test("EVM challenge accepts walletconnect walletType", async () => {
  const wallet = Wallet.createRandom();
  const { verify } = await signInFlow(wallet, { walletType: "walletconnect" });
  assert.equal(verify.statusCode, 200);
  assert.equal(verify.body.walletName, "WalletConnect");
});

test("mixed-case address input maps to one lowercase identity", async () => {
  const wallet = Wallet.createRandom();
  const checksumAddress = wallet.address; // EIP-55 mixed case
  assert.notEqual(checksumAddress, checksumAddress.toLowerCase());

  const { challenge, verify } = await signInFlow(wallet, { requestWallet: checksumAddress });
  assert.equal(verify.statusCode, 200);
  assert.equal(verify.body.wallet, checksumAddress.toLowerCase());
  // Canonical SIWE: EIP-55 checksum address in the message, session identity lowercase.
  assert.ok(challenge.body.message.includes(checksumAddress));
});

test("challenge message is canonical EIP-4361 with the requesting domain", async () => {
  const wallet = Wallet.createRandom();
  const challenge = await requestChallenge(wallet.address);
  const lines = challenge.body.message.split("\n");
  assert.equal(lines[0], "localhost:3000 wants you to sign in with your Ethereum account:");
  assert.equal(lines[1], wallet.address);
  assert.ok(challenge.body.message.includes("URI: http://localhost:3000"));
  assert.ok(challenge.body.message.includes("Version: 1"));
  assert.ok(challenge.body.message.includes("Chain ID: 1"));
  assert.ok(/Nonce: [0-9a-f]{32}/.test(challenge.body.message));
});

test("challenge rejects base58 and malformed addresses", async () => {
  for (const bad of [
    "AwtqC9r5Wgvjfhqw5DrtzC5W73QRVF14DZVop8caECi9",
    "0x123",
    "0xZZ8caf9eca5e45df0e6f50f58a5bf664db1740c1",
    "",
  ]) {
    const response = await requestChallenge(bad);
    assert.equal(response.statusCode, 400, `expected 400 for ${JSON.stringify(bad)}`);
  }
});

test("verify rejects a signature from a different key", async () => {
  const wallet = Wallet.createRandom();
  const attacker = Wallet.createRandom();
  const challenge = await requestChallenge(wallet.address);
  const signature = await attacker.signMessage(challenge.body.message);

  const verify = await invokeJsonHandler(verifyHandler, {
    headers: challengeCookieHeader(challenge.body.challengeToken),
    body: {
      wallet: wallet.address,
      walletType: "metamask",
      message: challenge.body.message,
      challengeToken: challenge.body.challengeToken,
      signature,
    },
  });
  assert.equal(verify.statusCode, 401);
  assert.equal(verify.body.error, "Invalid wallet signature.");
});

test("verify rejects an expired challenge", async () => {
  const wallet = Wallet.createRandom();
  const address = wallet.address.toLowerCase();
  const expired = {
    type: "challenge",
    wallet: address,
    nonce: "ab".repeat(16),
    iat: Date.now() - 10 * 60 * 1000,
    exp: Date.now() - 5 * 60 * 1000,
    domain: "localhost:3000",
    uri: "http://localhost:3000",
  };
  const challengeToken = auth.createToken(expired, -5 * 60 * 1000);
  const parsed = auth.verifyToken(challengeToken);
  const message = auth.buildEvmChallengeMessage(parsed);
  const signature = await wallet.signMessage(message);

  const verify = await invokeJsonHandler(verifyHandler, {
    headers: challengeCookieHeader(challengeToken),
    body: { wallet: address, walletType: "metamask", message, challengeToken, signature },
  });
  assert.equal(verify.statusCode, 401);
  assert.equal(verify.body.error, "Challenge token has expired.");
});

test("verify without the challenge cookie (replay after logout/reuse) is rejected", async () => {
  const wallet = Wallet.createRandom();
  const challenge = await requestChallenge(wallet.address);
  const signature = await wallet.signMessage(challenge.body.message);

  const verify = await invokeJsonHandler(verifyHandler, {
    body: {
      wallet: wallet.address,
      walletType: "metamask",
      message: challenge.body.message,
      challengeToken: challenge.body.challengeToken,
      signature,
    },
  });
  assert.equal(verify.statusCode, 401);
  assert.equal(verify.body.error, "Challenge cookie is missing or invalid.");
});

test("verify rejects unsupported wallet types (legacy solana types included)", async () => {
  const wallet = Wallet.createRandom();
  const challenge = await requestChallenge(wallet.address);
  const signature = await wallet.signMessage(challenge.body.message);

  for (const walletType of ["phantom", "solflare", "trust", "rabby", ""]) {
    const verify = await invokeJsonHandler(verifyHandler, {
      headers: challengeCookieHeader(challenge.body.challengeToken),
      body: {
        wallet: wallet.address,
        walletType,
        message: challenge.body.message,
        challengeToken: challenge.body.challengeToken,
        signature,
      },
    });
    assert.equal(verify.statusCode, 400, `expected 400 for walletType=${walletType}`);
  }
});

test("ADMIN_WALLETS matches EVM addresses case-insensitively", async (t) => {
  const originalAdminWallets = process.env.ADMIN_WALLETS;
  t.after(() => {
    if (originalAdminWallets === undefined) delete process.env.ADMIN_WALLETS;
    else process.env.ADMIN_WALLETS = originalAdminWallets;
  });

  const adminWallet = Wallet.createRandom();
  process.env.ADMIN_WALLETS = adminWallet.address; // checksum (mixed) case in env

  assert.equal(auth.isAdminWallet(adminWallet.address.toLowerCase()), true);
  assert.equal(auth.isAdminWallet(adminWallet.address.toUpperCase().replace("0X", "0x")), true);
  assert.equal(auth.isAdminWallet(Wallet.createRandom().address), false);

  // base58 entries still match exactly (legacy admin sessions)
  assert.equal(auth.isAdminWallet("AwtqC9r5Wgvjfhqw5DrtzC5W73QRVF14DZVop8caECi9"), true);

  const { verify } = await signInFlow(adminWallet);
  assert.equal(verify.statusCode, 200);
  assert.equal(verify.body.isAdmin, true);
});

test("internal header path accepts a lowercase-normalized EVM wallet", async (t) => {
  const originalInternalSecret = process.env.INTERNAL_API_SECRET;
  process.env.INTERNAL_API_SECRET = "petix-evm-internal-secret-test-24ch";
  t.after(() => {
    if (originalInternalSecret === undefined) delete process.env.INTERNAL_API_SECRET;
    else process.env.INTERNAL_API_SECRET = originalInternalSecret;
  });

  const checksumAddress = Wallet.createRandom().address;
  const session = auth.getSessionFromRequest({
    headers: {
      "x-petix-internal-secret": "petix-evm-internal-secret-test-24ch",
      "x-petix-wallet": checksumAddress,
    },
  });
  assert.ok(session, "internal session expected");
  assert.equal(session.wallet, checksumAddress.toLowerCase());

  // legacy base58 wallets keep working on the same path
  const legacy = auth.getSessionFromRequest({
    headers: {
      "x-petix-internal-secret": "petix-evm-internal-secret-test-24ch",
      "x-petix-wallet": "AwtqC9r5Wgvjfhqw5DrtzC5W73QRVF14DZVop8caECi9",
    },
  });
  assert.ok(legacy, "legacy internal session expected");
  assert.equal(legacy.wallet, "AwtqC9r5Wgvjfhqw5DrtzC5W73QRVF14DZVop8caECi9");
});
