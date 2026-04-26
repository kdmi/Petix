const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs/promises");
const os = require("os");

const AUTH_PATH = path.resolve(__dirname, "../../api/_lib/auth.js");
const STORE_PATH = path.resolve(__dirname, "../../api/_lib/store.js");
const CHARACTER_ME_PATH = path.resolve(__dirname, "../../server-routes/character/me.js");

const INTERNAL_SECRET = "petix-me-currency-test-secret";

function clearModule(modulePath) {
  delete require.cache[require.resolve(modulePath)];
}

function freshRequire(modulePath) {
  clearModule(modulePath);
  return require(modulePath);
}

function createMockResponse() {
  return {
    bodyText: "",
    statusCode: 200,
    headersSent: false,
    writableEnded: false,
    end(value = "") {
      this.bodyText = Buffer.isBuffer(value) ? value.toString("utf8") : String(value || "");
      this.headersSent = true;
      this.writableEnded = true;
    },
    getHeader() { return undefined; },
    setHeader() {},
  };
}

async function withIsolatedEnv(run) {
  const originalCwd = process.cwd();
  const originalNodeEnv = process.env.NODE_ENV;
  const originalInternalSecret = process.env.INTERNAL_API_SECRET;
  const originalBlobToken = process.env.BLOB_READ_WRITE_TOKEN;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "petix-me-currency-"));

  try {
    process.chdir(tempDir);
    process.env.NODE_ENV = "test";
    process.env.INTERNAL_API_SECRET = INTERNAL_SECRET;
    delete process.env.BLOB_READ_WRITE_TOKEN;

    const auth = freshRequire(AUTH_PATH);
    const store = freshRequire(STORE_PATH);
    const characterMeHandler = freshRequire(CHARACTER_ME_PATH);

    return await run({ auth, store, characterMeHandler });
  } finally {
    clearModule(CHARACTER_ME_PATH);
    clearModule(STORE_PATH);
    clearModule(AUTH_PATH);
    process.chdir(originalCwd);

    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

    if (originalInternalSecret === undefined) {
      delete process.env.INTERNAL_API_SECRET;
    } else {
      process.env.INTERNAL_API_SECRET = originalInternalSecret;
    }

    if (originalBlobToken === undefined) {
      delete process.env.BLOB_READ_WRITE_TOKEN;
    } else {
      process.env.BLOB_READ_WRITE_TOKEN = originalBlobToken;
    }

    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function callHandler(handler, { wallet, auth }) {
  const req = {
    method: "GET",
    url: "/api/character/me",
    headers: {
      host: "localhost:3000",
      [auth.INTERNAL_AUTH_HEADER]: INTERNAL_SECRET,
      [auth.INTERNAL_WALLET_HEADER]: wallet,
      [auth.INTERNAL_WALLET_NAME_HEADER]: "Test User",
      [auth.INTERNAL_WALLET_TYPE_HEADER]: "internal",
    },
    on() { return this; },
  };
  const res = createMockResponse();
  await handler(req, res);
  return {
    statusCode: res.statusCode,
    body: res.bodyText ? JSON.parse(res.bodyText) : null,
  };
}

const TEST_WALLET = "A".repeat(32);

test("GET /api/character/me includes currency field when profile has currency", async () => {
  await withIsolatedEnv(async ({ auth, store, characterMeHandler }) => {
    await store.saveWalletProfile(TEST_WALLET, {
      draft: null,
      characters: [],
      notifications: [],
      battleState: { energyCurrent: 3, energyMax: 3, refillDate: null },
      currency: { balance: 250, totalEarned: 250 },
    });

    const { statusCode, body } = await callHandler(characterMeHandler, {
      wallet: TEST_WALLET,
      auth,
    });

    assert.equal(statusCode, 200);
    assert.ok(body !== null, "response body should be JSON");
    assert.ok(typeof body.currency === "object" && body.currency !== null, "currency field must be present");
    assert.equal(body.currency.balance, 250);
    assert.equal(body.currency.totalEarned, 250);
  });
});

test("GET /api/character/me defaults currency to zeros for legacy profiles", async () => {
  await withIsolatedEnv(async ({ auth, store, characterMeHandler }) => {
    const legacyWallet = "B".repeat(32);
    await store.saveWalletProfile(legacyWallet, {
      draft: null,
      characters: [],
      notifications: [],
      battleState: { energyCurrent: 3, energyMax: 3, refillDate: null },
    });

    const { statusCode, body } = await callHandler(characterMeHandler, {
      wallet: legacyWallet,
      auth,
    });

    assert.equal(statusCode, 200);
    assert.ok(typeof body.currency === "object" && body.currency !== null);
    assert.equal(body.currency.balance, 0);
    assert.equal(body.currency.totalEarned, 0);
  });
});
