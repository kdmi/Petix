const test = require("node:test");
const assert = require("node:assert/strict");

const { withFakeBlobIntegrationEnv } = require("./helpers/blob-call-counter");

// Player report, 2026-09-21: "I level up, spend the point, go fight — the fight
// still uses my OLD stats, and afterwards the Upgrade button is back, so I can
// spend the same level twice." Both halves came from the same place: the fight
// was built from the store-wide snapshot (a cache up to
// WALLET_PROFILE_SCAN_TTL_MS old) and then wrote the progression it had
// computed from that stale copy back over the fresh record — handing the spent
// point back. 107 pets had collected 460 free attribute points before this ran.
//
// The fix has two halves: the fight now reads the attacker from its owner's
// profile, and the battle write applies XP as a delta to the record as it is at
// write time. The tests below cover the reported path end to end (both halves
// fail it on the old code); the delta is also the guard for a point spent while
// a fight is in flight, which this harness cannot interleave.

const ATTACKER_WALLET = "a".repeat(32);
const DEFENDER_WALLET = "d".repeat(32);

function character({ id, name, level = 6, attributes, attributePointsAvailable = 0 }) {
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
    attributePointsAvailable,
    attributes,
    variables: {
      ELEMENT: "Arc static",
      TOP_ITEM: "Tiny visor",
      PROFESSION_STYLE: "Arena gremlin",
      SIDE_DETAILS: "Loose sparks",
      FACIAL_FEATURES: "Wide grin",
      ELEMENT_EFFECTS: "Neon crackles",
    },
    selectedPowerId: "power_1",
    powers: [{ id: "power_1", title: "Chaos Burst", description: "A noisy finishing blast." }],
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
    battleState: { energyCurrent: 3, energyMax: 3, refillDate: null },
    currency: { balance: 0, totalEarned: 0 },
  };
}

async function invokeBattle(battlesRoute, auth, internalSecret, wallet, petId) {
  const listeners = { data: [], end: [], error: [] };
  const req = {
    method: "POST",
    url: "/api/battles",
    headers: {
      host: "localhost:3000",
      [auth.INTERNAL_AUTH_HEADER]: internalSecret,
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
    const raw = JSON.stringify({ attackerPetId: petId });
    listeners.data.forEach((cb) => cb(raw));
    listeners.end.forEach((cb) => cb());
  });
  await pending;

  return { statusCode: res.statusCode, body: res.bodyText ? JSON.parse(res.bodyText) : null };
}

// Writes the profile blob behind the store's back — the way another function
// instance would, leaving THIS instance's snapshot stale.
function writeProfileFromAnotherInstance(setEntry, wallet, profile) {
  setEntry(`wallet-profiles/${encodeURIComponent(wallet)}.json`, JSON.stringify(profile, null, 2));
}

test("a fight after an upgrade uses the new stats and never refunds the spent point", async () => {
  const previousTtl = process.env.WALLET_PROFILE_SCAN_TTL_MS;
  process.env.WALLET_PROFILE_SCAN_TTL_MS = "300000"; // production value: a 5-minute stale window

  try {
    await withFakeBlobIntegrationEnv(async ({ store, battlesRoute, auth, internalSecret, setEntry }) => {
      const before = character({
        id: "pet_upgrade_atk",
        name: "Upgrader",
        attributes: { stamina: 6, agility: 7, strength: 18, intelligence: 0 },
        attributePointsAvailable: 1, // just levelled up, point not spent yet
      });
      await store.saveWalletProfile(ATTACKER_WALLET, profileOf(before));
      await store.saveWalletProfile(
        DEFENDER_WALLET,
        profileOf(
          character({
            id: "pet_upgrade_def",
            name: "Rival",
            attributes: { stamina: 5, agility: 5, strength: 5, intelligence: 5 },
          })
        )
      );

      // Something warms the store-wide snapshot with the pre-upgrade state.
      await store.listAllCharacters();

      // The player spends the point (their request lands on another instance).
      const upgraded = profileOf({
        ...before,
        attributePointsAvailable: 0,
        attributes: { ...before.attributes, stamina: 7 },
      });
      writeProfileFromAnotherInstance(setEntry, ATTACKER_WALLET, upgraded);

      const { statusCode, body } = await invokeBattle(
        battlesRoute,
        auth,
        internalSecret,
        ATTACKER_WALLET,
        "pet_upgrade_atk"
      );
      assert.equal(statusCode, 200, `battle must succeed, got ${JSON.stringify(body)}`);

      // Symptom 1: the fight itself must use the upgraded stats.
      assert.equal(
        body.battle.attacker.attributes.stamina,
        7,
        "the fight must be computed from the stats the pet has now, not from the snapshot"
      );

      // Symptom 2: the spent point must stay spent.
      const after = (await store.getWalletProfile(ATTACKER_WALLET)).characters[0];
      const levelsGained = after.level - before.level;
      assert.equal(
        after.attributePointsAvailable,
        levelsGained,
        "the point spent before the fight must not come back (only new levels add points)"
      );
      assert.equal(after.attributes.stamina, 7, "the purchased stat must survive the battle write");
      assert.equal(after.attributes.strength, 18);
    });
  } finally {
    if (previousTtl === undefined) delete process.env.WALLET_PROFILE_SCAN_TTL_MS;
    else process.env.WALLET_PROFILE_SCAN_TTL_MS = previousTtl;
  }
});

test("levelling up in a fight grants exactly one point per level", async () => {
  await withFakeBlobIntegrationEnv(async ({ store, battlesRoute, auth, internalSecret }) => {
    const attacker = character({
      id: "pet_level_atk",
      name: "Climber",
      level: 1,
      attributes: { stamina: 8, agility: 8, strength: 8, intelligence: 8 },
      attributePointsAvailable: 0,
    });
    attacker.experience = 400; // one win (200 xp) is not enough for level 2 (500)
    await store.saveWalletProfile(ATTACKER_WALLET, profileOf(attacker));
    await store.saveWalletProfile(
      DEFENDER_WALLET,
      profileOf(
        character({
          id: "pet_level_def",
          name: "Sparring",
          level: 1,
          attributes: { stamina: 1, agility: 1, strength: 1, intelligence: 1 },
        })
      )
    );

    const { statusCode, body } = await invokeBattle(
      battlesRoute,
      auth,
      internalSecret,
      ATTACKER_WALLET,
      "pet_level_atk"
    );
    assert.equal(statusCode, 200);

    const after = (await store.getWalletProfile(ATTACKER_WALLET)).characters[0];
    const levelsGained = after.level - 1;
    assert.equal(
      after.attributePointsAvailable,
      levelsGained,
      "points available must equal the levels just gained"
    );
    assert.equal(
      body.battle.result.attackerRewards.newLevel,
      after.level,
      "the response must report the level that was actually written"
    );
    assert.equal(
      body.battle.result.attackerRewards.newAttributePointsAvailable,
      after.attributePointsAvailable
    );
  });
});
