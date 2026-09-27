const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const { withFakeBlobIntegrationEnv } = require("./helpers/blob-call-counter");

// The write path that feature 025 exists for: a real POST /api/battles with the
// sharded store behind it. The point is not only that the fight works — it is
// what the fight costs. Before, one battle rewrote a 103 MB document twice.

const SHARD_STORE_PATH = path.resolve(__dirname, "../../api/_lib/battle-shard-store.js");

const ATTACKER_WALLET = "a".repeat(32);
const DEFENDER_WALLET = "b".repeat(32);

function character(id, name) {
  return {
    id,
    status: "completed",
    creatureType: "Arena Cub",
    rarity: "Rare",
    name,
    displayName: name,
    level: 3,
    experience: 0,
    softCurrency: 0,
    attributePointsAvailable: 0,
    attributes: { stamina: 4, agility: 5, strength: 6, intelligence: 7 },
    variables: {
      ELEMENT: "Arc static",
      TOP_ITEM: "Tiny visor",
      PROFESSION_STYLE: "Arena gremlin",
      SIDE_DETAILS: "Loose sparks",
      FACIAL_FEATURES: "Wide grin",
      ELEMENT_EFFECTS: "Neon crackles",
    },
    selectedPowerId: "power_1",
    powers: [{ id: "power_1", title: "Chaos Burst", description: "A noisy blast." }],
    image: {},
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    completedAt: "2026-09-01T00:00:00.000Z",
  };
}

function profileOf(record) {
  return {
    draft: null,
    characters: [record],
    notifications: [],
    battleState: { energyUsed: 0, energyPurchased: 0 },
    currency: { balance: 0, totalEarned: 0 },
  };
}

async function fight(battlesRoute, auth, secret, wallet, petId) {
  const listeners = { data: [], end: [], error: [] };
  const req = {
    method: "POST",
    url: "/api/battles",
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
  const res = {
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

  const pending = Promise.resolve().then(() => battlesRoute(req, res));
  process.nextTick(() => {
    listeners.data.forEach((cb) => cb(JSON.stringify({ attackerPetId: petId })));
    listeners.end.forEach((cb) => cb());
  });
  await pending;

  return { statusCode: res.statusCode, body: res.bodyText ? JSON.parse(res.bodyText) : null };
}

async function withShardsOn(run) {
  const previous = process.env.BATTLE_SHARDS_ENABLED;
  process.env.BATTLE_SHARDS_ENABLED = "1";
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.BATTLE_SHARDS_ENABLED;
    else process.env.BATTLE_SHARDS_ENABLED = previous;
  }
}

test("a fight on sharded storage writes kilobytes, not the whole history", async () => {
  await withShardsOn(async () => {
    await withFakeBlobIntegrationEnv(async ({ store, battlesRoute, auth, internalSecret, counts, resetCounts, state }) => {
      await store.saveWalletProfile(ATTACKER_WALLET, profileOf(character("pet_shard_atk", "Sharder")));
      await store.saveWalletProfile(DEFENDER_WALLET, profileOf(character("pet_shard_def", "Rival")));

      // The first fight also creates the month and hour index files; measure
      // the second, which is what a busy day actually looks like.
      const first = await fight(battlesRoute, auth, internalSecret, ATTACKER_WALLET, "pet_shard_atk");
      assert.equal(first.statusCode, 200);

      resetCounts();
      const second = await fight(battlesRoute, auth, internalSecret, ATTACKER_WALLET, "pet_shard_atk");
      assert.equal(second.statusCode, 200);

      assert.ok(
        counts.putBytes < 512 * 1024,
        `a battle must stay well under half a megabyte of writes, wrote ${counts.putBytes} bytes`
      );

      const battleId = second.body.battle?.id || second.body.battleId;
      assert.ok(battleId, "the response carries the battle id");
      assert.ok(
        [...state.keys()].some((pathname) => pathname.includes(`-b/${battleId}.json`)),
        "the battle is stored as its own blob"
      );
      assert.ok(
        ![...state.keys()].some((pathname) => pathname.endsWith("-battles.json")),
        "and the legacy single document is never written again"
      );
    });
  });
});

test("the battle a fight just wrote is replayable and shows up in both histories", async () => {
  await withShardsOn(async () => {
    await withFakeBlobIntegrationEnv(async ({ store, battlesRoute, auth, internalSecret }) => {
      await store.saveWalletProfile(ATTACKER_WALLET, profileOf(character("pet_replay_atk", "Reader")));
      await store.saveWalletProfile(DEFENDER_WALLET, profileOf(character("pet_replay_def", "Rival")));

      const response = await fight(battlesRoute, auth, internalSecret, ATTACKER_WALLET, "pet_replay_atk");
      const battleId = response.body.battle?.id || response.body.battleId;

      const shards = require(SHARD_STORE_PATH);
      const record = await shards.getBattleRecord(battleId);
      assert.equal(record.status, "ready");
      assert.ok(record.rounds.length > 0, "the replay has its rounds");

      const attackerHistory = await shards.listBattleHistoryForWallet(ATTACKER_WALLET);
      const defenderHistory = await shards.listBattleHistoryForWallet(DEFENDER_WALLET);
      assert.equal(attackerHistory.history[0].battleId, battleId);
      assert.equal(defenderHistory.history[0].battleId, battleId);
      assert.equal(defenderHistory.history[0].playerRole, "defender");

      const admin = await shards.listAdminCompletedBattles({ days: 1 });
      assert.ok(
        admin.battles.some((entry) => entry.battleId === battleId),
        "and the admin list sees it through the index"
      );
    });
  });
});
