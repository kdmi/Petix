const test = require("node:test");
const assert = require("node:assert/strict");

const { buildEnergyShopView, purchaseEnergyPack } = require("../../api/_lib/energy-shop");
const { normalizeBattleState } = require("../../api/_lib/battle-energy");
const { getDefaults } = require("../../api/_lib/economy-config");
const { makeProfile } = require("./helpers/economy-fixtures");

const NOW = Date.parse("2026-09-18T12:00:00.000Z");
const HOUR = 3600000;
const cfg = getDefaults();

function profileWith({ balance = 1000, battleState = null } = {}) {
  return makeProfile({ currency: { balance, totalEarned: balance }, battleState });
}

test("purchaseEnergyPack debits the exact price and adds the pack's fights", () => {
  const profile = profileWith({ balance: 1000 });
  const result = purchaseEnergyPack(profile, 1, cfg, { now: NOW });
  assert.deepEqual(result, { index: 1, fights: 3, pricePaid: 400 });
  assert.equal(profile.currency.balance, 600);
  assert.equal(profile.currency.totalEarned, 1000);
  assert.equal(profile.battleState.energyPurchased, 3);
  assert.equal(profile.battleState.energyPacks["1"].purchasedAt, new Date(NOW).toISOString());

  const view = normalizeBattleState(profile.battleState, { now: new Date(NOW) });
  assert.equal(view.energyCurrent, 3 + 3);
});

test("the same pack is on cooldown for 24h, other packs stay available", () => {
  const profile = profileWith({ balance: 5000 });
  purchaseEnergyPack(profile, 2, cfg, { now: NOW });

  assert.throws(
    () => purchaseEnergyPack(profile, 2, cfg, { now: NOW + 23 * HOUR }),
    (error) => error.code === "PACK_COOLDOWN" && error.availableAt === new Date(NOW + 24 * HOUR).toISOString()
  );
  purchaseEnergyPack(profile, 0, cfg, { now: NOW + HOUR });
  purchaseEnergyPack(profile, 1, cfg, { now: NOW + HOUR });
  assert.equal(profile.battleState.energyPurchased, 5 + 1 + 3);
  assert.equal(profile.currency.balance, 5000 - 500 - 150 - 400);

  const again = purchaseEnergyPack(profile, 2, cfg, { now: NOW + 24 * HOUR });
  assert.equal(again.fights, 5);
  assert.equal(profile.battleState.energyPurchased, 14);
});

test("insufficient Points rejects without touching balance or energy", () => {
  const profile = profileWith({ balance: 399 });
  assert.throws(
    () => purchaseEnergyPack(profile, 1, cfg, { now: NOW }),
    (error) => error.code === "INSUFFICIENT_FUNDS" && error.required === 400 && error.balance === 399
  );
  assert.equal(profile.currency.balance, 399);
  assert.equal(profile.battleState, null);
});

test("disabled shop and unknown packs are rejected", () => {
  const profile = profileWith({ balance: 1000 });
  assert.throws(() => purchaseEnergyPack(profile, 0, { ...cfg, ENERGY_SHOP_ENABLED: 0 }, { now: NOW }), /closed/i);
  for (const bad of [3, -1, "x", 1.5, undefined]) {
    assert.throws(() => purchaseEnergyPack(profile, bad, cfg, { now: NOW }), (error) => error.code === "INVALID_PACK");
  }
  assert.equal(profile.currency.balance, 1000);
});

test("purchase preserves spent free energy for the day", () => {
  const profile = profileWith({ balance: 1000, battleState: { energyUsed: 3, lastResetDate: "2026-09-18" } });
  purchaseEnergyPack(profile, 0, cfg, { now: NOW });
  assert.equal(profile.battleState.energyUsed, 3);
  assert.equal(profile.battleState.energyPurchased, 1);
  assert.equal(normalizeBattleState(profile.battleState, { now: new Date(NOW) }).energyCurrent, 1);
});

test("buildEnergyShopView reports availability, cooldown and config", () => {
  const profile = profileWith({ balance: 1000 });
  purchaseEnergyPack(profile, 1, cfg, { now: NOW });
  const view = buildEnergyShopView(profile.battleState, cfg, { now: NOW + 2 * HOUR });
  assert.equal(view.enabled, true);
  assert.equal(view.cooldownHours, 24);
  assert.equal(view.packs.length, 3);
  assert.deepEqual(view.packs[0], { index: 0, fights: 1, price: 150, availableAt: null, remainingSec: 0 });
  assert.equal(view.packs[1].availableAt, new Date(NOW + 24 * HOUR).toISOString());
  assert.equal(view.packs[1].remainingSec, 22 * 3600);

  const off = buildEnergyShopView(null, { ...cfg, ENERGY_SHOP_ENABLED: 0 }, { now: NOW });
  assert.equal(off.enabled, false);
});

test("buildEnergyShopView honours a custom cooldown and pack list", () => {
  const custom = { ...cfg, ENERGY_PACK_COOLDOWN_HOURS: 1, ENERGY_PACKS: [{ fights: 2, price: 0 }] };
  const profile = profileWith({ balance: 0 });
  const result = purchaseEnergyPack(profile, 0, custom, { now: NOW });
  assert.equal(result.pricePaid, 0);
  assert.equal(profile.battleState.energyPurchased, 2);
  const view = buildEnergyShopView(profile.battleState, custom, { now: NOW + 30 * 60000 });
  assert.equal(view.packs.length, 1);
  assert.equal(view.packs[0].remainingSec, 1800);
  assert.equal(buildEnergyShopView(profile.battleState, custom, { now: NOW + HOUR }).packs[0].availableAt, null);
});
