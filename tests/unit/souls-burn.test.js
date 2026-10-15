const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createCompletedCharacter,
  createInternalHeaders,
  createWallet,
  invokeJsonHandler,
  withIsolatedBattleHistoryEnv,
} = require("./helpers/battle-history-test-utils");
const { creditSouls, normalizeSouls, soulsForBurn } = require("../../api/_lib/souls");

// Souls (031): burning a pet gives its soul back — 1 000 souls per pet level.

test("soulsForBurn: 1 000 per level by default, tunable per level, at least level 1", () => {
  assert.equal(soulsForBurn(1, {}), 0, "no soul at Lvl. 1");
  assert.equal(soulsForBurn(2, {}), 2000);
  assert.equal(soulsForBurn(7, { SOULS_PER_BURN_LEVEL: 1000 }), 7000);
  assert.equal(soulsForBurn(3, { SOULS_PER_BURN_LEVEL: 250 }), 750);
  assert.equal(soulsForBurn(0, {}), 0);
  const profile = {};
  creditSouls(profile, 1500);
  creditSouls(profile, 500);
  assert.deepEqual(profile.souls, { balance: 2000, totalEarned: 2000 });
  assert.deepEqual(normalizeSouls(null), { balance: 0, totalEarned: 0 });
});

test("POST /api/character/burn credits souls by level; /me shows the balance", async () => {
  await withIsolatedBattleHistoryEnv(async ({ auth, characterActionRoute, store }) => {
    const wallet = createWallet("5");
    const victim = { ...createCompletedCharacter({ id: "char_lvl4", name: "Old Friend" }), level: 4 };
    await store.updateWalletProfile(wallet, async (current) => ({
      ...current,
      characters: [victim],
      currency: { balance: 20000, totalEarned: 20000 },
      souls: { balance: 300, totalEarned: 300 },
    }));

    const burn = await invokeJsonHandler(characterActionRoute, {
      method: "POST",
      url: "/api/character/burn",
      headers: createInternalHeaders(auth, wallet),
      body: { petId: "char_lvl4" },
    });
    assert.equal(burn.statusCode, 200, JSON.stringify(burn.body));
    assert.equal(burn.body.soulsGained, 4000);
    assert.deepEqual(burn.body.souls, { balance: 4300, totalEarned: 4300 });

    const profile = await store.getWalletProfile(wallet);
    assert.deepEqual(profile.souls, { balance: 4300, totalEarned: 4300 });

    const me = await invokeJsonHandler(characterActionRoute, {
      method: "GET",
      url: "/api/character/me",
      headers: createInternalHeaders(auth, wallet),
    });
    assert.equal(me.statusCode, 200);
    assert.deepEqual(me.body.souls, { balance: 4300, totalEarned: 4300 });
    assert.equal(me.body.soulsPerBurnLevel, 1000);
  });
});

// Energy → souls exchange (031): 50 energy → 5 000 souls, spent like a fight.
const { exchangeEnergyForSouls, exchangeOffer, exchangeableEnergy } = require("../../api/_lib/souls");
const { getBattleDateKey } = require("../../api/_lib/battle-energy");

test("exchange: today's free energy first, then gifted, then bought", () => {
  const now = new Date("2026-10-15T10:00:00Z");
  // 3 free a day, 1 used today → 2 free left; + 30 gifted + 40 bought = 72.
  const profile = { souls: { balance: 100, totalEarned: 100 }, battleState: { energyGranted: 30, energyPurchased: 40, energyUsed: 1, lastResetDate: getBattleDateKey(now) } };
  assert.equal(exchangeableEnergy(profile.battleState, { now }), 72);
  const r = exchangeEnergyForSouls(profile, { SOULS_EXCHANGE_ENERGY: 50, SOULS_EXCHANGE_SOULS: 5000 }, { now });
  assert.deepEqual([r.energySpent, r.soulsGained], [50, 5000]);
  assert.deepEqual(profile.souls, { balance: 5100, totalEarned: 5100 });
  assert.equal(profile.battleState.energyUsed, 3, "2 free spent");
  assert.equal(profile.battleState.energyGranted, 0, "30 gifted spent");
  assert.equal(profile.battleState.energyPurchased, 22, "18 bought spent");
});

test("exchange: refused below 50 energy without a change; capsule bonus counts as free; offer follows the config", () => {
  const now = new Date("2026-10-15T10:00:00Z");
  const fresh = () => ({ souls: { balance: 0, totalEarned: 0 }, battleState: { energyGranted: 20, energyPurchased: 26, energyUsed: 0, lastResetDate: getBattleDateKey(now) } });
  const profile = fresh(); // 3 free + 46 = 49
  assert.throws(() => exchangeEnergyForSouls(profile, {}, { now }), (e) => e.httpCode === "NOT_ENOUGH_ENERGY" && e.required === 50 && e.balance === 49);
  assert.deepEqual(profile.battleState, fresh().battleState);
  assert.equal(profile.souls.balance, 0);
  assert.equal(exchangeEnergyForSouls(profile, {}, { now, bonusEnergy: 1 }).soulsGained, 5000, "one capsule battle makes it 50");
  assert.deepEqual(exchangeOffer({}), { energy: 50, souls: 5000 });
  assert.deepEqual(exchangeOffer({ SOULS_EXCHANGE_ENERGY: 100, SOULS_EXCHANGE_SOULS: 8000 }), { energy: 100, souls: 8000 });
});

test("POST /api/character/exchange-energy: spends real energy even for an unlimited admin; /me shows the offer", async () => {
  await withIsolatedBattleHistoryEnv(async ({ auth, characterActionRoute, store }) => {
    const wallet = createWallet("7");
    await store.updateWalletProfile(wallet, async (current) => ({ ...current, battleState: { energyGranted: 60 }, souls: { balance: 0, totalEarned: 0 } }));
    const call = () => invokeJsonHandler(characterActionRoute, { method: "POST", url: "/api/character/exchange-energy", headers: createInternalHeaders(auth, wallet), body: {} });

    const ok = await call();
    assert.equal(ok.statusCode, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.soulsGained, 5000);
    assert.deepEqual(ok.body.souls, { balance: 5000, totalEarned: 5000 });
    assert.equal(ok.body.energy, 13, "3 free + 60 gifted - 50");

    const short = await call();
    assert.equal(short.statusCode, 409);
    assert.equal(short.body.code, "NOT_ENOUGH_ENERGY");

    const me = await invokeJsonHandler(characterActionRoute, { method: "GET", url: "/api/character/me", headers: createInternalHeaders(auth, wallet) });
    assert.deepEqual(me.body.soulsExchange, { energy: 50, souls: 5000 });
  });
});
