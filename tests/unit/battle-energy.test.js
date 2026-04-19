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
