const test = require("node:test");
const assert = require("node:assert/strict");

const { withFakeBlobIntegrationEnv } = require("./helpers/blob-call-counter");

function createWallet(seed) {
  return String(seed || "1").repeat(32);
}

function createCompletedCharacter({ id, name, level = 4 }) {
  return {
    id,
    status: "completed",
    creatureType: "Arena Cub",
    rarity: "Rare",
    name,
    displayName: name,
    level,
    experience: 0,
    softCurrency: 0,
    attributePointsAvailable: 0,
    attributes: {
      stamina: 4,
      agility: 5,
      strength: 6,
      intelligence: 7,
    },
    variables: {
      ELEMENT: "Arc static",
      TOP_ITEM: "Tiny visor",
      PROFESSION_STYLE: "Arena gremlin",
      SIDE_DETAILS: "Loose sparks",
      FACIAL_FEATURES: "Wide grin",
      ELEMENT_EFFECTS: "Neon crackles",
    },
    selectedPowerId: "power_1",
    powers: [
      {
        id: "power_1",
        title: "Chaos Burst",
        description: "A noisy finishing blast.",
      },
    ],
    image: {},
    createdAt: "2026-04-26T00:00:00.000Z",
    updatedAt: "2026-04-26T00:00:00.000Z",
    completedAt: "2026-04-26T00:00:00.000Z",
  };
}

function buildProfile(character) {
  return {
    draft: null,
    characters: [character],
    notifications: [],
    battleState: { energyCurrent: 3, energyMax: 3, refillDate: null },
    currency: { balance: 0, totalEarned: 0 },
  };
}

function createMockResponse() {
  return {
    bodyText: "",
    headersSent: false,
    statusCode: 200,
    writableEnded: false,
    end(value = "") {
      this.bodyText = Buffer.isBuffer(value) ? value.toString("utf8") : String(value || "");
      this.headersSent = true;
      this.writableEnded = true;
    },
    getHeader() {
      return undefined;
    },
    setHeader() {},
  };
}

async function invokeBattlesRoute(battlesRoute, { headers, body }) {
  const listeners = { data: [], end: [], error: [] };
  const req = {
    method: "POST",
    url: "/api/battles",
    headers: { host: "localhost:3000", ...headers },
    on(event, callback) {
      if (listeners[event]) listeners[event].push(callback);
      return this;
    },
  };
  const res = createMockResponse();

  const promise = Promise.resolve().then(() => battlesRoute(req, res));
  process.nextTick(() => {
    const raw = JSON.stringify(body);
    listeners.data.forEach((cb) => cb(raw));
    listeners.end.forEach((cb) => cb());
  });
  await promise;

  return {
    statusCode: res.statusCode,
    body: res.bodyText ? JSON.parse(res.bodyText) : null,
  };
}

// Baseline from production telemetry (April 2026): a single battle was costing
// ~17 Advanced ops. The bulk of that is `readDb()` loading all wallets for
// matchmaking, which is *out of scope* for the current feature (BLOB_OPTIMIZATION_PLAN
// step 6 covers it separately). What this feature kills:
//   - the redundant `saveBattleRecord(generating)` (−2 ops)
//   - the second `updateWalletProfile(defender)` for the notification (−2 ops, US3)
//   - the per-profile `list()` on every `getWalletProfile` (−several ops, US1)
//
// Realistic post-feature target: ≤ 12 Advanced ops on a fresh-wallets battle.
// Anything higher is a regression we want surfaced loudly.
const BATTLE_OPS_BUDGET = 12;

test(`a single successful battle stays within Advanced-ops budget (≤ ${BATTLE_OPS_BUDGET} SDK calls)`, async () => {
  await withFakeBlobIntegrationEnv(async ({ store, battlesRoute, auth, counts, resetCounts, internalSecret }) => {
    const attackerWallet = createWallet("e");
    const defenderWallet = createWallet("f");
    const attacker = createCompletedCharacter({ id: "pet_budget_atk", name: "BudgetAtk" });
    const defender = createCompletedCharacter({ id: "pet_budget_def", name: "BudgetDef" });

    await store.saveWalletProfile(attackerWallet, buildProfile(attacker));
    await store.saveWalletProfile(defenderWallet, buildProfile(defender));

    resetCounts();

    const { statusCode } = await invokeBattlesRoute(battlesRoute, {
      headers: {
        [auth.INTERNAL_AUTH_HEADER]: internalSecret,
        [auth.INTERNAL_WALLET_HEADER]: attackerWallet,
        [auth.INTERNAL_WALLET_NAME_HEADER]: "Tester",
        [auth.INTERNAL_WALLET_TYPE_HEADER]: "internal",
      },
      body: { attackerPetId: attacker.id },
    });

    const total = counts.get + counts.put + counts.list + counts.del + counts.head + counts.copy;

    assert.equal(statusCode, 200, "battle must succeed");
    assert.ok(
      total <= BATTLE_OPS_BUDGET,
      `Advanced ops budget exceeded: ${total} calls (counts: ${JSON.stringify(counts)})`
    );
    // After the feature, only `loadAllBlobWalletProfiles` (used by matchmaking)
    // is allowed to issue `list`. Per-profile reads must be `get`-only.
    assert.ok(
      counts.list <= 2,
      `expected ≤2 list calls (matchmaking only), got ${counts.list}`
    );
  });
});
