const test = require("node:test");
const assert = require("node:assert/strict");

const { computeCoinReward } = require("../../api/_lib/currency");
const { getDefaults } = require("../../api/_lib/economy-config");

test("computeCoinReward uses currency-config defaults when no options", () => {
  // default BASE_WIN_REWARD = 100, LEVEL_MULTIPLIER = 0.05
  assert.equal(computeCoinReward(1), 100);
  assert.equal(computeCoinReward(10), 145); // 100*(1+0.05*9)
  assert.equal(computeCoinReward(20), 195);
});

test("computeCoinReward honors injected economy-config base/multiplier", () => {
  const cfg = getDefaults();
  const opts = { base: cfg.BATTLE_REWARD_BASE, levelMultiplier: cfg.BATTLE_LEVEL_K };
  assert.equal(computeCoinReward(1, opts), 100);
  assert.equal(computeCoinReward(10, opts), 145);
});

test("changing the base changes the reward (tunable)", () => {
  assert.equal(computeCoinReward(1, { base: 200, levelMultiplier: 0.05 }), 200);
  assert.equal(computeCoinReward(10, { base: 200, levelMultiplier: 0.05 }), 290); // 200*1.45
  assert.equal(computeCoinReward(1, { base: 10, levelMultiplier: 0.05 }), 10);
});

test("computeCoinReward clamps level to >= 1", () => {
  assert.equal(computeCoinReward(0, { base: 100, levelMultiplier: 0.05 }), 100);
  assert.equal(computeCoinReward(-5, { base: 100, levelMultiplier: 0.05 }), 100);
});
