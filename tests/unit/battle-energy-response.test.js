const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { withFakeBlobIntegrationEnv } = require("./helpers/blob-call-counter");
const { getBattleDateKey } = require("../../api/_lib/battle-energy");

// Player report, 2026-09-22: "I used my last energy, came back to the dashboard
// and the counter said 0 — but the Fight buttons still worked and I got another
// battle." Nothing was stolen (he had bought all three energy packs, so the day
// allowed 12 fights and he played 11), but the dashboard had no way to know:
// the client decremented its own counter on every fight and the battle response
// carried no energy at all, so any drift showed up as a phantom bug.

const APP_JS = path.resolve(__dirname, "../../pet-creation/app.js");
const ATTACKER_WALLET = "e".repeat(32);
const DEFENDER_WALLET = "f".repeat(32);

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

function profileOf(record, battleState) {
  return {
    draft: null,
    characters: [record],
    notifications: [],
    battleState: battleState || { energyUsed: 0, energyPurchased: 0 },
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
    const raw = JSON.stringify({ attackerPetId: petId });
    listeners.data.forEach((cb) => cb(raw));
    listeners.end.forEach((cb) => cb());
  });
  await pending;

  return { statusCode: res.statusCode, body: res.bodyText ? JSON.parse(res.bodyText) : null };
}

test("the battle response reports the energy the server has left", async () => {
  await withFakeBlobIntegrationEnv(async ({ store, battlesRoute, auth, internalSecret }) => {
    await store.saveWalletProfile(ATTACKER_WALLET, profileOf(character("pet_energy_atk", "Counter")));
    await store.saveWalletProfile(DEFENDER_WALLET, profileOf(character("pet_energy_def", "Rival")));

    const first = await fight(battlesRoute, auth, internalSecret, ATTACKER_WALLET, "pet_energy_atk");
    assert.equal(first.statusCode, 200);
    assert.ok(first.body.battleState, "the response must carry the authoritative energy");
    assert.equal(first.body.battleState.energyCurrent, 2, "three free fights minus the one just spent");
    assert.equal(first.body.battleState.energyMax, 3);
    assert.equal(first.body.battleState.canStartFight, true);

    const second = await fight(battlesRoute, auth, internalSecret, ATTACKER_WALLET, "pet_energy_atk");
    assert.equal(second.body.battleState.energyCurrent, 1);

    const third = await fight(battlesRoute, auth, internalSecret, ATTACKER_WALLET, "pet_energy_atk");
    assert.equal(third.body.battleState.energyCurrent, 0);
    assert.equal(third.body.battleState.canStartFight, false, "the last fight closes the day");

    const fourth = await fight(battlesRoute, auth, internalSecret, ATTACKER_WALLET, "pet_energy_atk");
    assert.equal(fourth.statusCode, 400, "and the server refuses a fourth fight");
    assert.equal(fourth.body.error, "DAILY_BATTLE_LIMIT_REACHED");
  });
});

test("purchased fights are reported the same way", async () => {
  await withFakeBlobIntegrationEnv(async ({ store, battlesRoute, auth, internalSecret }) => {
    await store.saveWalletProfile(
      ATTACKER_WALLET,
      // lastResetDate must be today's, otherwise the free energy just refills.
      profileOf(character("pet_bought_atk", "Buyer"), {
        energyUsed: 3,
        energyPurchased: 2,
        lastResetDate: getBattleDateKey(new Date()),
      })
    );
    await store.saveWalletProfile(DEFENDER_WALLET, profileOf(character("pet_bought_def", "Rival")));

    const first = await fight(battlesRoute, auth, internalSecret, ATTACKER_WALLET, "pet_bought_atk");

    assert.equal(first.statusCode, 200, "free energy is gone but the bought fights are not");
    assert.equal(first.body.battleState.energyCurrent, 1);
    assert.equal(first.body.battleState.energyPurchased, 1);
    assert.equal(first.body.battleState.canStartFight, true);
  });
});

test("the dashboard applies the energy from the battle response", () => {
  // The counter and the Fight buttons both read state.energyCurrent, which the
  // client decrements locally; without reconciling against this payload the two
  // drift apart and the player sees a fight they "shouldn't" be able to start.
  const source = fs.readFileSync(APP_JS, "utf8");
  assert.match(
    source,
    /createBattlePayload\?\.battleState[\s\S]{0,200}applyBattleStatePayload\(createBattlePayload\.battleState\)/,
    "the battle response's battleState must be applied to the client state"
  );
});
