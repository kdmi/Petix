const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildBattleStateView,
  consumeBattleEnergy,
  normalizeBattleState,
} = require("../../api/_lib/battle-energy");

const ADMIN_WALLET = "AwtqC9r5Wgvjfhqw5DrtzC5W73QRVF14DZVop8caECi9";

test("normalizeBattleState refills energy after the New York midnight boundary", () => {
  const now = new Date("2026-04-17T04:30:00.000Z");
  const state = normalizeBattleState(
    {
      energyCurrent: 0,
      energyMax: 3,
      lastResetDate: "2026-04-16",
      updatedAt: "2026-04-16T18:00:00.000Z",
    },
    { now }
  );

  assert.equal(state.energyCurrent, 3);
  assert.equal(state.energyMax, 3);
  assert.equal(state.lastResetDate, "2026-04-17");
});

test("buildBattleStateView exposes next reset timestamp and canStartFight", () => {
  const now = new Date("2026-04-17T03:30:00.000Z");
  const view = buildBattleStateView(
    {
      energyCurrent: 1,
      lastResetDate: "2026-04-16",
    },
    { now }
  );

  assert.equal(view.energyCurrent, 1);
  assert.equal(view.energyMax, 3);
  assert.equal(view.canStartFight, true);
  assert.equal(view.timezone, "America/New_York");
  assert.equal(view.resetsAt, "2026-04-17T04:00:00.000Z");
});

test("consumeBattleEnergy decrements available energy", () => {
  const nextState = consumeBattleEnergy(
    {
      energyCurrent: 2,
      lastResetDate: "2026-04-17",
    },
    {
      now: new Date("2026-04-17T12:00:00.000Z"),
    }
  );

  assert.equal(nextState.energyCurrent, 1);
  assert.equal(nextState.energyMax, 3);
});

test("buildBattleStateView keeps admin wallets battle-ready even when raw energy is empty", () => {
  const now = new Date("2026-04-17T03:30:00.000Z");
  const view = buildBattleStateView(
    {
      energyCurrent: 0,
      lastResetDate: "2026-04-17",
    },
    { now, wallet: ADMIN_WALLET }
  );

  assert.equal(view.energyCurrent, 3);
  assert.equal(view.energyMax, 3);
  assert.equal(view.canStartFight, true);
});

test("consumeBattleEnergy does not spend energy for admin wallets", () => {
  const nextState = consumeBattleEnergy(
    {
      energyCurrent: 1,
      lastResetDate: "2026-04-17",
    },
    { wallet: ADMIN_WALLET }
  );

  assert.equal(nextState.energyCurrent, 3);
  assert.equal(nextState.energyMax, 3);
});

test("бонус капсул даёт лишний бой в тот же день, а не после полуночи", () => {
  const { normalizeBattleState, getBattleDateKey } = require("../../api/_lib/battle-energy");
  const now = new Date("2026-09-10T15:00:00.000Z");
  // Состояние сохранено сегодня при лимите 3, боёв ещё не было.
  const stored = { energyCurrent: 3, energyMax: 3, lastResetDate: getBattleDateKey(now) };
  const view = normalizeBattleState(stored, { now, bonusEnergy: 1 });
  assert.equal(view.energyMax, 4);
  assert.equal(view.energyCurrent, 4, "иначе шапка показывает 3 при лимите 4");
});

test("потраченный бой не воскресает, если состояние перечитали без бонуса", () => {
  const { normalizeBattleState, consumeBattleEnergy, getBattleDateKey } = require("../../api/_lib/battle-energy");
  const now = new Date("2026-09-10T15:00:00.000Z");
  const fresh = { energyCurrent: 3, energyMax: 3, lastResetDate: getBattleDateKey(now) };

  const afterFight = consumeBattleEnergy(fresh, { now, bonusEnergy: 1 });
  assert.equal(afterFight.energyCurrent, 3);

  // store.js нормализует профиль без бонуса — так оно и лежит в базе.
  const persisted = normalizeBattleState(afterFight, { now });
  assert.equal(persisted.energyCurrent, 2);

  // /me читает с бонусом: должно быть 3, а не 4 — бой уже потрачен.
  const viewed = normalizeBattleState(persisted, { now, bonusEnergy: 1 });
  assert.equal(viewed.energyCurrent, 3);
  assert.equal(viewed.energyUsed, 1);
});

test("пропавший бонус обрезает остаток, а не уходит в минус", () => {
  const { normalizeBattleState, getBattleDateKey } = require("../../api/_lib/battle-energy");
  const now = new Date("2026-09-10T15:00:00.000Z");
  const stored = { energyUsed: 4, energyMax: 4, lastResetDate: getBattleDateKey(now) };
  const view = normalizeBattleState(stored, { now, bonusEnergy: 0 });
  assert.equal(view.energyMax, 3);
  assert.equal(view.energyCurrent, 0);
});
