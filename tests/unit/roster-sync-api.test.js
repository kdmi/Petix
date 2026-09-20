const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const { withFakeBlobEnv } = require("./helpers/blob-call-counter");

const SYNC_ROUTE_PATH = path.resolve(__dirname, "../../server-routes/roster/sync.js");
const ROSTER_ACTION_ROUTE_PATH = path.resolve(__dirname, "../../api/roster/[action].js");
const FARM_STATS_ROUTE_PATH = path.resolve(__dirname, "../../server-routes/admin/farm-stats.js");
const AUTH_PATH = path.resolve(__dirname, "../../api/_lib/auth.js");

const CRON_SECRET = "petix-roster-cron-secret";
const INTERNAL_SECRET = "petix-roster-internal-secret-value";
// The project's public admin wallet, the same fixture the other admin tests use
// (allowlisted in tests/unit/token-no-addresses.test.js).
const ADMIN_WALLET = "0x0e8Caf9eca5E45df0E6f50f58A5bF664db1740c1";

function freshRequire(modulePath) {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

function createMockResponse() {
  return {
    statusCode: 200,
    bodyText: "",
    headersSent: false,
    writableEnded: false,
    setHeader() {},
    getHeader() {
      return undefined;
    },
    end(value = "") {
      this.bodyText = String(value || "");
      this.headersSent = true;
      this.writableEnded = true;
    },
  };
}

async function callRoute(route, { method = "GET", url = "/api/roster/sync", headers = {} } = {}) {
  const req = { method, url, headers: { host: "localhost:3000", ...headers } };
  const res = createMockResponse();
  await route(req, res);
  return { statusCode: res.statusCode, body: res.bodyText ? JSON.parse(res.bodyText) : null };
}

// Fixture wallets are deliberately NOT 0x-addresses: the repo forbids
// committing anything address-shaped (feature 019, FR-016).
function walletAt(index) {
  return `test-wallet-${String(index).padStart(3, "0")}`;
}

function completedCharacter(index) {
  return {
    id: `pet_${index}`,
    status: "completed",
    name: `Pet ${index}`,
    creatureType: "Panda",
    rarity: "Common",
    level: 2,
    powers: [{ id: "pw", name: "Zap" }],
    selectedPowerId: "pw",
    completedAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

async function withSyncEnv(overrides, run) {
  const previous = {};
  const applied = {
    ROSTER_ENABLED: "1",
    ROSTER_CACHE_TTL_MS: "0",
    CRON_SECRET,
    INTERNAL_API_SECRET: INTERNAL_SECRET,
    ADMIN_WALLETS: ADMIN_WALLET,
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

test("GET /api/roster/sync refreshes the index for the cron and for internal tooling", async () => {
  await withSyncEnv({}, async () => {
    await withFakeBlobEnv(async ({ store }) => {
      await store.saveWalletProfile(walletAt(1), { characters: [completedCharacter(1)] });
      await store.saveWalletProfile(walletAt(2), { characters: [completedCharacter(2)] });
      store.clearWalletProfileCache();

      const auth = freshRequire(AUTH_PATH);
      freshRequire(SYNC_ROUTE_PATH);
      const route = freshRequire(ROSTER_ACTION_ROUTE_PATH);

      const cronCall = await callRoute(route, {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      });
      assert.equal(cronCall.statusCode, 200);
      assert.equal(cronCall.body.ok, true);
      assert.equal(cronCall.body.entries, 2);
      assert.ok(cronCall.body.mode === "full" || cronCall.body.mode === "incremental");

      const internalCall = await callRoute(route, {
        headers: { [auth.INTERNAL_AUTH_HEADER]: INTERNAL_SECRET },
      });
      assert.equal(internalCall.statusCode, 200);
      assert.equal(internalCall.body.entries, 2);
    });
  });
});

test("the sync route rejects anonymous callers and wrong methods", async () => {
  await withSyncEnv({}, async () => {
    await withFakeBlobEnv(async () => {
      freshRequire(SYNC_ROUTE_PATH);
      const route = freshRequire(ROSTER_ACTION_ROUTE_PATH);

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
        (await callRoute(route, { url: "/api/roster/nope", headers: { authorization: `Bearer ${CRON_SECRET}` } }))
          .statusCode,
        404
      );
    });
  });
});

test("the sync route answers 200 skipped while the feature is disabled", async () => {
  await withSyncEnv({ ROSTER_ENABLED: "0" }, async () => {
    await withFakeBlobEnv(async ({ state }) => {
      freshRequire(SYNC_ROUTE_PATH);
      const route = freshRequire(ROSTER_ACTION_ROUTE_PATH);

      const response = await callRoute(route, {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      });

      assert.equal(response.statusCode, 200, "a disabled feature must not look like a broken cron");
      assert.equal(response.body.skipped, true);
      assert.equal(response.body.reason, "ROSTER_DISABLED");
      assert.ok(
        ![...state.keys()].some((pathname) => pathname.includes("-roster.json")),
        "nothing may be written while disabled"
      );
    });
  });
});

test("admin farm-stats reports roster index health", async () => {
  await withSyncEnv({}, async () => {
    await withFakeBlobEnv(async ({ store, roster }) => {
      await store.saveWalletProfile(walletAt(1), { characters: [completedCharacter(1)] });
      store.clearWalletProfileCache();
      await roster.refreshRoster({ force: true });

      const auth = freshRequire(AUTH_PATH);
      const farmStats = freshRequire(FARM_STATS_ROUTE_PATH);

      const response = await callRoute(farmStats, {
        url: "/api/admin/farm-stats",
        headers: {
          [auth.INTERNAL_AUTH_HEADER]: INTERNAL_SECRET,
          [auth.INTERNAL_WALLET_HEADER]: ADMIN_WALLET,
          [auth.INTERNAL_WALLET_TYPE_HEADER]: "internal",
        },
      });

      assert.equal(response.statusCode, 200);
      assert.equal(response.body.roster.enabled, true);
      assert.equal(response.body.roster.entries, 1);
      assert.equal(response.body.roster.wallets, 1);
      assert.ok(response.body.roster.builtAt, "the admin needs to see how old the index is");
      assert.ok("totalEmitted" in response.body, "existing fields must survive");
    });
  });
});
