const test = require("node:test");
const assert = require("node:assert/strict");

const path = require("path");
const fs = require("fs/promises");
const os = require("os");

const STORE_PATH = path.resolve(__dirname, "../../api/_lib/store.js");
const CREATE_ROUTE_PATH = path.resolve(
  __dirname,
  "../../server-routes/character/create.js"
);
const AUTH_PATH = path.resolve(__dirname, "../../api/_lib/auth.js");

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
    end(value = "") {
      this.bodyText = String(value || "");
    },
    setHeader() {},
    getHeader() {
      return undefined;
    },
  };
}

async function invokeJsonHandler(handler, { headers = {}, body }) {
  const listeners = { data: [], end: [], error: [] };
  const req = {
    method: "POST",
    url: "/api/character/create",
    headers: { host: "localhost:3000", ...headers },
    on(event, callback) {
      if (listeners[event]) listeners[event].push(callback);
      return this;
    },
  };
  const res = createMockResponse();
  const promise = Promise.resolve().then(() => handler(req, res));
  process.nextTick(() => {
    if (body !== undefined) {
      listeners.data.forEach((cb) => cb(JSON.stringify(body)));
    }
    listeners.end.forEach((cb) => cb());
  });
  await promise;
  return {
    statusCode: res.statusCode,
    body: res.bodyText ? JSON.parse(res.bodyText) : null,
  };
}

test("character create handler preserves wallet currency on completion", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "petix-char-create-"));
  const originalCwd = process.cwd();
  const originalNodeEnv = process.env.NODE_ENV;
  const originalInternalSecret = process.env.INTERNAL_API_SECRET;

  try {
    process.chdir(tempDir);
    process.env.NODE_ENV = "test";
    process.env.INTERNAL_API_SECRET = "petix-char-create-test-secret";
    delete process.env.BLOB_READ_WRITE_TOKEN;

    const auth = freshRequire(AUTH_PATH);
    const store = freshRequire(STORE_PATH);
    const createRoute = freshRequire(CREATE_ROUTE_PATH);

    const wallet = "AwtqC9r5Wgvjfhqw5DrtzC5W73QRVF14DZVop8caECi9";
    const draftId = "draft_currency_test";

    // Pre-existing profile with non-zero currency and a draft ready to complete.
    await store.saveWalletProfile(wallet, {
      draft: {
        id: draftId,
        status: "draft",
        creatureType: "Dragon",
        rarity: "Rare",
        attributePoints: 22,
        name: "TestPet",
        displayName: "TestPet",
        powers: [
          {
            id: "power_1",
            title: "Test Burst",
            description: "Test power",
          },
        ],
        selectedPowerId: "power_1",
        attributes: { stamina: 4, agility: 5, strength: 6, intelligence: 7 },
        variables: {
          ELEMENT: "Arc",
          TOP_ITEM: "Hat",
          PROFESSION_STYLE: "Tester",
          SIDE_DETAILS: "Lines",
          FACIAL_FEATURES: "Smile",
          ELEMENT_EFFECTS: "Sparks",
        },
        image: {},
        createdAt: "2026-04-26T00:00:00.000Z",
        updatedAt: "2026-04-26T00:00:00.000Z",
        wallet,
      },
      characters: [],
      notifications: [
        {
          id: "notif_kept",
          wallet,
          type: "pet_was_challenged",
          petId: "pet_old",
          battleId: "battle_old",
          title: "Old notif",
          body: "kept",
          createdAt: "2026-04-25T00:00:00.000Z",
          isRead: false,
        },
      ],
      battleState: { energyCurrent: 2, energyMax: 3, refillDate: null },
      currency: { balance: 1234, totalEarned: 5678 },
    });

    const headers = {
      [auth.INTERNAL_AUTH_HEADER]: process.env.INTERNAL_API_SECRET,
      [auth.INTERNAL_WALLET_HEADER]: wallet,
      [auth.INTERNAL_WALLET_NAME_HEADER]: "Tester",
      [auth.INTERNAL_WALLET_TYPE_HEADER]: "internal",
    };

    const { statusCode, body } = await invokeJsonHandler(createRoute, {
      headers,
      body: {
        draftId,
        selectedPowerId: "power_1",
        stats: { stamina: 4, agility: 5, strength: 6, intelligence: 7 },
      },
    });

    assert.equal(statusCode, 200, `expected 200, got ${statusCode}: ${JSON.stringify(body)}`);

    const reloaded = await store.getWalletProfile(wallet);

    // The whole point of this regression test:
    assert.deepEqual(
      reloaded.currency,
      { balance: 1234, totalEarned: 5678 },
      "currency must survive a character-create transaction"
    );
    assert.equal(reloaded.notifications.length, 1, "notifications must be preserved");
    assert.equal(reloaded.notifications[0].id, "notif_kept");
    assert.equal(reloaded.draft, null, "draft must be cleared after completion");
    assert.equal(reloaded.characters.length, 1, "completed character must be appended");
  } finally {
    clearModule(CREATE_ROUTE_PATH);
    clearModule(STORE_PATH);
    clearModule(AUTH_PATH);

    process.chdir(originalCwd);

    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;

    if (originalInternalSecret === undefined) delete process.env.INTERNAL_API_SECRET;
    else process.env.INTERNAL_API_SECRET = originalInternalSecret;

    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
