const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createCompletedCharacter,
  createInternalHeaders,
  createWallet,
  invokeJsonHandler,
  withIsolatedBattleHistoryEnv,
} = require("./helpers/battle-history-test-utils");

function buyRequest(auth, wallet, packIndex) {
  return {
    method: "POST",
    url: "/api/character/buy-energy",
    headers: createInternalHeaders(auth, wallet),
    body: { packIndex },
  };
}

function meRequest(auth, wallet) {
  return { method: "GET", url: "/api/character/me", headers: createInternalHeaders(auth, wallet) };
}

async function seedProfile(store, wallet, { balance, battleState = null, characters = [] }) {
  await store.updateWalletProfile(wallet, async (current) => ({
    ...current,
    characters,
    battleState: battleState || current.battleState,
    currency: { balance, totalEarned: balance },
  }));
}

test("POST /api/character/buy-energy debits Points, adds fights and reports the cooldown", async () => {
  await withIsolatedBattleHistoryEnv(async ({ auth, characterActionRoute, store }) => {
    const wallet = createWallet("3");
    await seedProfile(store, wallet, { balance: 1000 });

    const response = await invokeJsonHandler(characterActionRoute, buyRequest(auth, wallet, 1));
    assert.equal(response.statusCode, 200, JSON.stringify(response.body));
    assert.equal(response.body.packIndex, 1);
    assert.equal(response.body.fights, 3);
    assert.equal(response.body.pricePaid, 400);
    assert.equal(response.body.balance, 600);
    assert.equal(response.body.battleState.energyCurrent, 3 + 3);
    assert.equal(response.body.battleState.energyMax, 6);
    assert.equal(response.body.battleState.energyPurchased, 3);
    assert.equal(response.body.battleState.canStartFight, true);
    assert.equal(response.body.energyShop.enabled, true);
    assert.equal(typeof response.body.energyShop.packs[1].availableAt, "string");
    assert.equal(response.body.energyShop.packs[0].availableAt, null);
    assert.equal(response.body.energyShop.packs[2].availableAt, null);

    const profile = await store.getWalletProfile(wallet);
    assert.equal(profile.currency.balance, 600);
    assert.equal(profile.currency.totalEarned, 1000);
    assert.equal(profile.battleState.energyPurchased, 3);

    const me = await invokeJsonHandler(characterActionRoute, meRequest(auth, wallet));
    assert.equal(me.statusCode, 200);
    assert.equal(me.body.battleState.energyCurrent, 6);
    assert.equal(me.body.battleState.energyPurchased, 3);
    assert.equal(me.body.energyShop.packs.length, 3);
    assert.equal(me.body.energyShop.packs[1].remainingSec > 86000, true);
  });
});

test("buying the same pack again is refused with 409 and nothing changes", async () => {
  await withIsolatedBattleHistoryEnv(async ({ auth, characterActionRoute, store }) => {
    const wallet = createWallet("3");
    await seedProfile(store, wallet, { balance: 1000 });

    const first = await invokeJsonHandler(characterActionRoute, buyRequest(auth, wallet, 0));
    assert.equal(first.statusCode, 200);
    const second = await invokeJsonHandler(characterActionRoute, buyRequest(auth, wallet, 0));
    assert.equal(second.statusCode, 409);
    assert.equal(second.body.code, "PACK_COOLDOWN");
    assert.equal(typeof second.body.availableAt, "string");

    const profile = await store.getWalletProfile(wallet);
    assert.equal(profile.currency.balance, 850);
    assert.equal(profile.battleState.energyPurchased, 1);
  });
});

test("not enough Points → 402 without debit; bad pack → 400; no session → 401", async () => {
  await withIsolatedBattleHistoryEnv(async ({ auth, characterActionRoute, store }) => {
    const wallet = createWallet("3");
    await seedProfile(store, wallet, { balance: 100 });

    const poor = await invokeJsonHandler(characterActionRoute, buyRequest(auth, wallet, 2));
    assert.equal(poor.statusCode, 402);
    assert.equal(poor.body.code, "INSUFFICIENT_FUNDS");
    assert.equal(poor.body.required, 500);
    assert.equal(poor.body.balance, 100);

    const bad = await invokeJsonHandler(characterActionRoute, buyRequest(auth, wallet, 7));
    assert.equal(bad.statusCode, 400);
    assert.equal(bad.body.code, "INVALID_PACK");

    const anon = await invokeJsonHandler(characterActionRoute, {
      method: "POST",
      url: "/api/character/buy-energy",
      body: { packIndex: 0 },
    });
    assert.equal(anon.statusCode, 401);

    const profile = await store.getWalletProfile(wallet);
    assert.equal(profile.currency.balance, 100);
    assert.equal(profile.battleState.energyPurchased, 0);
  });
});

test("a fight spends free energy first and only then the purchased fights", async () => {
  await withIsolatedBattleHistoryEnv(async ({ auth, battlesRoute, characterActionRoute, store }) => {
    const wallet = createWallet("3");
    const pet = createCompletedCharacter({ id: "pet_buyer", name: "Buyer" });
    const { getBattleDateKey } = require("../../api/_lib/battle-energy");
    const today = getBattleDateKey(new Date());
    await seedProfile(store, wallet, {
      balance: 1000,
      characters: [pet],
      battleState: { energyUsed: 2, lastResetDate: today },
    });

    const bought = await invokeJsonHandler(characterActionRoute, buyRequest(auth, wallet, 1));
    assert.equal(bought.statusCode, 200);
    assert.equal(bought.body.battleState.energyCurrent, 1 + 3);

    const progression = { level: 1, experience: 200, softCurrency: 0, attributePointsAvailable: 0 };
    await battlesRoute.applyAttackerBattleMutation({ wallet, petId: pet.id, progressionState: progression });
    let profile = await store.getWalletProfile(wallet);
    assert.equal(profile.battleState.energyUsed, 3);
    assert.equal(profile.battleState.energyPurchased, 3);

    await battlesRoute.applyAttackerBattleMutation({ wallet, petId: pet.id, progressionState: progression });
    profile = await store.getWalletProfile(wallet);
    assert.equal(profile.battleState.energyUsed, 3);
    assert.equal(profile.battleState.energyPurchased, 2);

    const me = await invokeJsonHandler(characterActionRoute, meRequest(auth, wallet));
    assert.equal(me.body.battleState.energyCurrent, 2);
    assert.equal(me.body.battleState.energyFree, 0);
    assert.equal(me.body.battleState.canStartFight, true);
  });
});

test("purchased fights survive the daily reset while free energy refills", async () => {
  await withIsolatedBattleHistoryEnv(async ({ auth, characterActionRoute, store }) => {
    const wallet = createWallet("3");
    await seedProfile(store, wallet, {
      balance: 1000,
      battleState: { energyUsed: 3, lastResetDate: "2020-01-01", energyPurchased: 4, energyPacks: {} },
    });
    const me = await invokeJsonHandler(characterActionRoute, meRequest(auth, wallet));
    assert.equal(me.body.battleState.energyFree, 3);
    assert.equal(me.body.battleState.energyPurchased, 4);
    assert.equal(me.body.battleState.energyCurrent, 7);
    const profile = await store.getWalletProfile(wallet);
    assert.equal(profile.battleState.energyPurchased, 4);
  });
});
