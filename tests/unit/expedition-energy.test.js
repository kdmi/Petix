const test = require("node:test");
const assert = require("node:assert/strict");

const energy = require("../../api/_lib/battle-energy");

const WALLET = `0x${"1".repeat(40)}`;
const NOW = new Date("2026-10-09T10:00:00.000Z");

test("granted energy adds to the bank, counts in totals and survives the daily reset", () => {
  let state = energy.normalizeBattleState(null, { now: NOW });
  assert.equal(state.energyGranted, 0);
  state = energy.grantBattleEnergy(state, { now: NOW, amount: 4 });
  assert.equal(state.energyGranted, 4);
  assert.equal(state.energyCurrent, energy.BATTLE_ENERGY_MAX + 4);
  const tomorrow = new Date(NOW.getTime() + 36 * 3600 * 1000);
  const next = energy.normalizeBattleState(state, { now: tomorrow });
  assert.equal(next.energyGranted, 4);
  assert.equal(next.energyFree, energy.BATTLE_ENERGY_MAX);
  const view = energy.buildBattleStateView(state, { now: NOW, wallet: WALLET });
  assert.equal(view.energyGranted, 4);
});

test("spend order: free first, then granted, purchased last", () => {
  let state = energy.normalizeBattleState({ energyPurchased: 1 }, { now: NOW });
  state = energy.grantBattleEnergy(state, { now: NOW, amount: 2 });
  const total = state.energyCurrent;
  assert.equal(total, energy.BATTLE_ENERGY_MAX + 3);
  for (let i = 0; i < energy.BATTLE_ENERGY_MAX; i++) state = energy.consumeBattleEnergy(state, { now: NOW, wallet: WALLET });
  assert.equal(state.energyFree, 0);
  assert.equal(state.energyGranted, 2);
  assert.equal(state.energyPurchased, 1);
  state = energy.consumeBattleEnergy(state, { now: NOW, wallet: WALLET });
  assert.equal(state.energyGranted, 1);
  assert.equal(state.energyPurchased, 1);
  state = energy.consumeBattleEnergy(state, { now: NOW, wallet: WALLET });
  state = energy.consumeBattleEnergy(state, { now: NOW, wallet: WALLET });
  assert.equal(state.energyGranted, 0);
  assert.equal(state.energyPurchased, 0);
  assert.throws(() => energy.consumeBattleEnergy(state, { now: NOW, wallet: WALLET }), { code: energy.NO_ENERGY_ERROR_CODE });
});

test("legacy state without the field behaves exactly as before", () => {
  const legacy = energy.normalizeBattleState({ energyUsed: 1, lastResetDate: energy.getBattleDateKey(NOW) }, { now: NOW });
  assert.equal(legacy.energyGranted, 0);
  assert.equal(legacy.energyCurrent, energy.BATTLE_ENERGY_MAX - 1);
  assert.equal(legacy.energyMax, energy.BATTLE_ENERGY_MAX);
});
