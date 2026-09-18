const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildBattleStateView,
  consumeBattleEnergy,
  normalizeBattleState,
  refundBattleEnergy,
} = require("../../api/_lib/battle-energy");

const NOW = new Date("2026-09-18T12:00:00.000Z"); // 08:00 New York, same day key 2026-09-18
const TODAY = "2026-09-18";

test("normalizeBattleState keeps purchased energy and pack timestamps", () => {
  const state = normalizeBattleState(
    {
      energyUsed: 1,
      lastResetDate: TODAY,
      energyPurchased: 4,
      energyPacks: { 1: { purchasedAt: "2026-09-18T10:00:00.000Z" } },
    },
    { now: NOW }
  );
  assert.equal(state.energyPurchased, 4);
  assert.deepEqual(state.energyPacks, { 1: { purchasedAt: "2026-09-18T10:00:00.000Z" } });
  assert.equal(state.energyCurrent, 2 + 4);
  assert.equal(state.energyMax, 3 + 4);
  assert.equal(state.energyFree, 2);
  assert.equal(state.energyFreeMax, 3);
});

test("legacy records without the new fields read as zero purchased", () => {
  const state = normalizeBattleState({ energyCurrent: 2, energyMax: 3, lastResetDate: TODAY }, { now: NOW });
  assert.equal(state.energyPurchased, 0);
  assert.deepEqual(state.energyPacks, {});
  assert.equal(state.energyCurrent, 2);
  assert.equal(state.energyMax, 3);
});

test("daily reset refills free energy but leaves purchased energy untouched", () => {
  const state = normalizeBattleState(
    { energyUsed: 3, lastResetDate: "2026-09-17", energyPurchased: 3, energyPacks: { 2: { purchasedAt: "x" } } },
    { now: NOW }
  );
  assert.equal(state.energyUsed, 0);
  assert.equal(state.energyPurchased, 3);
  assert.equal(state.energyCurrent, 6);
  assert.deepEqual(state.energyPacks, { 2: { purchasedAt: "x" } });
});

test("buildBattleStateView sums free and purchased energy", () => {
  const view = buildBattleStateView(
    { energyUsed: 3, lastResetDate: TODAY, energyPurchased: 2 },
    { now: NOW, bonusEnergy: 1 }
  );
  assert.equal(view.energyFreeMax, 4);
  assert.equal(view.energyFree, 1);
  assert.equal(view.energyPurchased, 2);
  assert.equal(view.energyCurrent, 3);
  assert.equal(view.energyMax, 6);
  assert.equal(view.canStartFight, true);
});

test("consumeBattleEnergy spends free energy first, then purchased", () => {
  let state = { energyUsed: 2, lastResetDate: TODAY, energyPurchased: 2 };
  state = consumeBattleEnergy(state, { now: NOW });
  assert.equal(state.energyUsed, 3);
  assert.equal(state.energyPurchased, 2);
  assert.equal(state.energyCurrent, 2);

  state = consumeBattleEnergy(state, { now: NOW });
  assert.equal(state.energyUsed, 3);
  assert.equal(state.energyPurchased, 1);
  assert.equal(state.energyCurrent, 1);

  state = consumeBattleEnergy(state, { now: NOW });
  assert.equal(state.energyPurchased, 0);
  assert.equal(state.energyCurrent, 0);

  assert.throws(() => consumeBattleEnergy(state, { now: NOW }), (error) => error.code === "DAILY_BATTLE_LIMIT_REACHED");
});

test("purchased energy makes a fight possible when the daily limit is spent", () => {
  const view = buildBattleStateView({ energyUsed: 3, lastResetDate: TODAY, energyPurchased: 1 }, { now: NOW });
  assert.equal(view.canStartFight, true);
  const spent = consumeBattleEnergy({ energyUsed: 3, lastResetDate: TODAY, energyPurchased: 1 }, { now: NOW });
  assert.equal(spent.energyPurchased, 0);
  assert.equal(spent.energyCurrent, 0);
});

test("refundBattleEnergy returns to free energy first, then to purchased", () => {
  let state = refundBattleEnergy({ energyUsed: 1, lastResetDate: TODAY, energyPurchased: 0 }, { now: NOW });
  assert.equal(state.energyUsed, 0);
  assert.equal(state.energyPurchased, 0);

  state = refundBattleEnergy({ energyUsed: 0, lastResetDate: TODAY, energyPurchased: 0 }, { now: NOW });
  assert.equal(state.energyUsed, 0);
  assert.equal(state.energyPurchased, 1);
});
