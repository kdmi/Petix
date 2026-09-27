const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const { withFakeBlobEnv } = require("./helpers/blob-call-counter");

// /api/storage/gc — the cron that keeps the version copies from piling up.
// It deletes storage, so who may call it is the whole point of this file.

const GC_ROUTE_PATH = path.resolve(__dirname, "../../server-routes/storage/gc.js");
const STORAGE_ACTION_ROUTE_PATH = path.resolve(__dirname, "../../api/storage/[action].js");
const AUTH_PATH = path.resolve(__dirname, "../../api/_lib/auth.js");
const GC_PATH = path.resolve(__dirname, "../../api/_lib/blob-gc.js");
const NFT_STORE_PATH = path.resolve(__dirname, "../../api/_lib/nft-store.js");
const TOKEN_STORE_PATH = path.resolve(__dirname, "../../api/_lib/token-store.js");

const CRON_SECRET = "petix-storage-cron-secret";
const INTERNAL_SECRET = "petix-storage-internal-secret-value";
// The project's public admin wallet, the fixture the other admin tests use.
const ADMIN_WALLET = "0x0e8Caf9eca5E45df0E6f50f58A5bF664db1740c1";

function md5(text) {
  return require("crypto").createHash("md5").update(String(text)).digest("hex");
}

function freshRequire(modulePath) {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

function loadRoute() {
  for (const modulePath of [GC_PATH, NFT_STORE_PATH, TOKEN_STORE_PATH, GC_ROUTE_PATH]) {
    delete require.cache[require.resolve(modulePath)];
  }
  return freshRequire(STORAGE_ACTION_ROUTE_PATH);
}

function createMockResponse() {
  return {
    statusCode: 200,
    bodyText: "",
    setHeader() {},
    getHeader() {
      return undefined;
    },
    end(value = "") {
      this.bodyText = String(value || "");
    },
  };
}

async function callRoute(route, { method = "GET", url = "/api/storage/gc", headers = {} } = {}) {
  const req = { method, url, headers: { host: "localhost:3000", ...headers } };
  const res = createMockResponse();
  await route(req, res);
  return { statusCode: res.statusCode, body: res.bodyText ? JSON.parse(res.bodyText) : null };
}

async function withGcApiEnv(overrides, run) {
  const previous = {};
  const applied = {
    CRON_SECRET,
    INTERNAL_API_SECRET: INTERNAL_SECRET,
    SOLANA_AUTH_SECRET: "petix-storage-gc-test-cookie-secret-0123456789",
    ADMIN_WALLETS: ADMIN_WALLET,
    BLOB_GC_TTL_MS: "1800000",
    ...overrides,
  };

  for (const [key, value] of Object.entries(applied)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("the cron and internal tooling can run the sweep", async () => {
  await withGcApiEnv({}, async () => {
    await withFakeBlobEnv(async ({ battleStore, state, setEntry }) => {
      await battleStore.saveBattleRecord({ id: "battle_api", status: "ready" });
      const stale = [...state.keys()].find((pathname) => pathname.includes("-battles-v/"));
      setEntry(`${stale.replace(/[^/]+$/, "")}${md5("0000")}.json`, "{}", {
        uploadedAt: new Date(Date.now() - 6 * 3600000).toISOString(),
      });

      const auth = freshRequire(AUTH_PATH);
      const route = loadRoute();

      const cronCall = await callRoute(route, {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      });
      assert.equal(cronCall.statusCode, 200);
      assert.equal(cronCall.body.ok, true);
      assert.equal(cronCall.body.deleted, 1);

      const internalCall = await callRoute(route, {
        headers: { [auth.INTERNAL_AUTH_HEADER]: INTERNAL_SECRET },
      });
      assert.equal(internalCall.statusCode, 200);
      assert.equal(internalCall.body.deleted, 0, "nothing left to take");
    });
  });
});

test("anonymous callers and wrong methods are turned away", async () => {
  await withGcApiEnv({}, async () => {
    await withFakeBlobEnv(async () => {
      const route = loadRoute();

      assert.equal((await callRoute(route)).statusCode, 401);
      assert.equal(
        (
          await callRoute(route, {
            method: "DELETE",
            headers: { authorization: `Bearer ${CRON_SECRET}` },
          })
        ).statusCode,
        405
      );
      assert.equal(
        (await callRoute(route, { headers: { authorization: "Bearer wrong" } })).statusCode,
        401
      );
    });
  });
});

test("an admin session can look before anything is deleted", async () => {
  await withGcApiEnv({}, async () => {
    await withFakeBlobEnv(async ({ battleStore, state, setEntry }) => {
      await battleStore.saveBattleRecord({ id: "battle_admin", status: "ready" });
      const versionPath = [...state.keys()].find((pathname) => pathname.includes("-battles-v/"));
      const orphan = `${versionPath.replace(/[^/]+$/, "")}${md5("1111")}.json`;
      setEntry(orphan, "{}", { uploadedAt: new Date(Date.now() - 6 * 3600000).toISOString() });

      const auth = freshRequire(AUTH_PATH);
      const route = loadRoute();
      const { sessionToken } = auth.createSession(ADMIN_WALLET.toLowerCase(), "metamask");

      const response = await callRoute(route, {
        url: "/api/storage/gc?dryRun=1",
        headers: { cookie: `${auth.SESSION_COOKIE}=${sessionToken}` },
      });

      assert.equal(response.statusCode, 200);
      assert.equal(response.body.dryRun, true);
      assert.equal(response.body.deleted, 1, "the dry run still counts the work");
      assert.ok(state.has(orphan), "and takes nothing");
    });
  });
});
