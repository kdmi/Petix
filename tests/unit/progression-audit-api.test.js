const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const { withFakeBlobIntegrationEnv } = require("./helpers/blob-call-counter");

// The admin route that undoes the points the refund bug handed out. It writes
// to players' pets, so the guards matter as much as the arithmetic: admin only,
// nothing happens without an explicit apply, and a pet that moved since the
// report is left alone.

const ADMIN_ROUTE_PATH = path.resolve(__dirname, "../../api/admin/[action].js");
const AUDIT_ROUTE_PATH = path.resolve(__dirname, "../../server-routes/admin/progression-audit.js");

// The project's long-standing admin wallet (base58, predates the EVM switch).
const ADMIN_WALLET = "AwtqC9r5Wgvjfhqw5DrtzC5W73QRVF14DZVop8caECi9";
const PLAYER_WALLET = "p".repeat(32);
const PET_ID = "char_audit_target";

function freshRequire(modulePath) {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

function attrs(stamina, agility, strength, intelligence) {
  return { stamina, agility, strength, intelligence };
}

function snapshotOf(level, attributes, available = 0) {
  return { id: PET_ID, level, attributes, attributePointsAvailable: available };
}

function battleRecord(at, snapshot) {
  return {
    id: `battle_${at}`,
    status: "ready",
    createdAt: at,
    completedAt: at,
    attackerPetId: PET_ID,
    attackerOwnerWallet: PLAYER_WALLET,
    attackerSnapshot: snapshot,
    defenderPetId: "char_other",
    defenderOwnerWallet: "o".repeat(32),
    defenderSnapshot: { id: "char_other", level: 1, attributes: attrs(3, 3, 3, 3) },
    rounds: [],
    result: null,
  };
}

// Rare budget is 12: a clean level-3 pet has spent 14 points. This one shows 17.
function dirtyPet() {
  return {
    id: PET_ID,
    status: "completed",
    rarity: "Rare",
    name: "Overcharged",
    creatureType: "Panda",
    level: 3,
    experience: 10,
    attributePointsAvailable: 0,
    attributes: attrs(7, 4, 3, 3),
    powers: [{ id: "pw", name: "Zap" }],
    selectedPowerId: "pw",
    image: {},
    createdAt: "2026-09-20T09:00:00.000Z",
    updatedAt: "2026-09-20T09:20:00.000Z",
    completedAt: "2026-09-20T09:00:00.000Z",
  };
}

function profileOf(character) {
  return {
    draft: null,
    characters: [character],
    notifications: [],
    battleState: { energyCurrent: 3, energyMax: 3, refillDate: null },
    currency: { balance: 0, totalEarned: 0 },
  };
}

function createResponse() {
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

async function callRoute(route, auth, { method = "GET", wallet = ADMIN_WALLET, secret, body = null }) {
  const listeners = { data: [], end: [], error: [] };
  const req = {
    method,
    url: "/api/admin/progression-audit",
    headers: {
      host: "localhost:3000",
      [auth.INTERNAL_AUTH_HEADER]: secret,
      [auth.INTERNAL_WALLET_HEADER]: wallet,
      [auth.INTERNAL_WALLET_NAME_HEADER]: "Tester",
      [auth.INTERNAL_WALLET_TYPE_HEADER]: "internal",
    },
    on(event, callback) {
      if (listeners[event]) listeners[event].push(callback);
      return this;
    },
  };
  const res = createResponse();

  const pending = Promise.resolve().then(() => route(req, res));
  if (method !== "GET") {
    process.nextTick(() => {
      const raw = JSON.stringify(body || {});
      listeners.data.forEach((cb) => cb(raw));
      listeners.end.forEach((cb) => cb());
    });
  }
  await pending;

  return { statusCode: res.statusCode, body: res.bodyText ? JSON.parse(res.bodyText) : null };
}

async function seed(store, battleStore, character = dirtyPet()) {
  await store.saveWalletProfile(PLAYER_WALLET, profileOf(character));
  await battleStore.saveBattleRecord(
    battleRecord("2026-09-20T09:00:00.000Z", snapshotOf(1, attrs(3, 3, 3, 3)))
  );
  await battleStore.saveBattleRecord(
    battleRecord("2026-09-20T09:10:00.000Z", snapshotOf(2, attrs(4, 3, 3, 3)))
  );
  store.clearWalletProfileCache();
}

test("the audit reports the phantom points and where they went", async () => {
  await withFakeBlobIntegrationEnv(async ({ store, battleStore, auth, internalSecret }) => {
    await seed(store, battleStore);
    freshRequire(AUDIT_ROUTE_PATH);
    const route = freshRequire(ADMIN_ROUTE_PATH);

    const { statusCode, body } = await callRoute(route, auth, { secret: internalSecret });

    assert.equal(statusCode, 200);
    assert.equal(body.mode, "dry-run");
    assert.equal(body.affectedPets, 1);
    assert.equal(body.extraPointsSpent, 3);
    const finding = body.findings[0];
    assert.equal(finding.petId, PET_ID);
    assert.deepEqual(finding.corrections, { stamina: 3 });
    assert.deepEqual(finding.attributesAfter, attrs(4, 4, 3, 3));
    assert.equal(finding.applicable, true);

    // A dry run must not touch the pet.
    const untouched = (await store.getWalletProfile(PLAYER_WALLET)).characters[0];
    assert.deepEqual(untouched.attributes, attrs(7, 4, 3, 3));
  });
});

test("applying the audit takes exactly the phantom points back", async () => {
  await withFakeBlobIntegrationEnv(async ({ store, battleStore, auth, internalSecret }) => {
    await seed(store, battleStore);
    freshRequire(AUDIT_ROUTE_PATH);
    const route = freshRequire(ADMIN_ROUTE_PATH);

    const refused = await callRoute(route, auth, {
      method: "POST",
      secret: internalSecret,
      body: {},
    });
    assert.equal(refused.statusCode, 400, "no write without an explicit apply");

    const { statusCode, body } = await callRoute(route, auth, {
      method: "POST",
      secret: internalSecret,
      body: { apply: true },
    });

    assert.equal(statusCode, 200);
    assert.equal(body.applied, 1);
    assert.equal(body.failed, 0);

    const fixed = (await store.getWalletProfile(PLAYER_WALLET)).characters[0];
    assert.deepEqual(fixed.attributes, attrs(4, 4, 3, 3), "only the phantom points are removed");
    assert.equal(fixed.level, 3, "level and progress are untouched");
    assert.equal(fixed.attributePointsAvailable, 0);

    // Running it again finds nothing left to do.
    const second = await callRoute(route, auth, { secret: internalSecret });
    assert.equal(second.body.affectedPets, 0);
  });
});

test("the write is always computed from the pet's current state", async () => {
  await withFakeBlobIntegrationEnv(async ({ store, battleStore, auth, internalSecret }) => {
    await seed(store, battleStore);
    freshRequire(AUDIT_ROUTE_PATH);
    const route = freshRequire(ADMIN_ROUTE_PATH);

    const first = await callRoute(route, auth, { secret: internalSecret });
    assert.equal(first.body.findings[0].extraSpent, 3);

    // The player spends one more phantom point before the operator hits apply.
    await store.updateWalletProfile(PLAYER_WALLET, (profile) => {
      profile.characters[0].attributes = attrs(8, 5, 3, 3);
      return profile;
    });

    const { body } = await callRoute(route, auth, {
      method: "POST",
      secret: internalSecret,
      body: { apply: true },
    });
    assert.equal(body.applied, 1);
    assert.equal(body.extraPointsSpent, 5, "the apply re-counts against the newer state");

    const pet = (await store.getWalletProfile(PLAYER_WALLET)).characters[0];
    assert.deepEqual(pet.attributes, attrs(4, 4, 3, 3), "the pet lands back on its legitimate budget");

    const after = await callRoute(route, auth, { secret: internalSecret });
    assert.equal(after.body.affectedPets, 0, "and nothing is left to correct");
  });
});

test("non-admins cannot read or apply the audit", async () => {
  await withFakeBlobIntegrationEnv(async ({ store, battleStore, auth, internalSecret }) => {
    await seed(store, battleStore);
    freshRequire(AUDIT_ROUTE_PATH);
    const route = freshRequire(ADMIN_ROUTE_PATH);

    const read = await callRoute(route, auth, { secret: internalSecret, wallet: PLAYER_WALLET });
    assert.equal(read.statusCode, 403);

    const write = await callRoute(route, auth, {
      method: "POST",
      secret: internalSecret,
      wallet: PLAYER_WALLET,
      body: { apply: true },
    });
    assert.equal(write.statusCode, 403);

    const pet = (await store.getWalletProfile(PLAYER_WALLET)).characters[0];
    assert.deepEqual(pet.attributes, attrs(7, 4, 3, 3));
  });
});
