const test = require("node:test");
const assert = require("node:assert/strict");

const economy = require("../../api/_lib/economy-config");
const X = require("../../api/_lib/expeditions-config");

test("roster: 10 bosses, art paths under /assets/expeditions, OpenSea links, calibrated stats", () => {
  assert.equal(X.ROSTER.length, 10);
  assert.equal(X.ROSTER[0].title, "Sporebeak");
  assert.equal(X.ROSTER[6].name, "WIF Outlaws");
  assert.equal(X.ROSTER[2].img, "/assets/expeditions/bosses/3.png");
  assert.equal(X.ROSTER[9].url, "https://opensea.io/collection/cashcatss");
  assert.deepEqual(X.ROSTER.map((b) => b.par), [18, 22, 27, 26, 25, 26, 26, 24, 24, 22]); // rebalance 2026-10-10
  assert.deepEqual(X.ROSTER.map((b) => b.shields), [2, 3, 4, 4, 5, 7, 6, 7, 8, 8]);
  assert.deepEqual(X.ROSTER.slice(0, 3).map((b) => [b.hp, b.power]), [[2600, 9], [3600, 17], [5000, 29]]);
});

test("bossViews: hidden / current / locked / done follow the open flags and progress", () => {
  const cfg = economy.mergeConfig({ EXPEDITION_BOSS_OPEN: [1, 1, 1, 1, 0, 0, 0, 0, 0, 0] });
  const views = X.bossViews(cfg, { 1: { bestStars: 3 }, 2: { bestStars: 1 } });
  assert.deepEqual(views.slice(0, 5).map((v) => v.state), ["done", "done", "current", "locked", "hidden"]);
  assert.equal(views[0].stars, 3);
  assert.equal(views[1].fee, 1000);
  assert.equal("contract" in views[0], false, "public view never carries contracts");
  assert.equal(X.attemptGate(cfg, { 1: { bestStars: 3 } }, 2).ok, true);
  assert.equal(X.attemptGate(cfg, { 1: { bestStars: 3 } }, 3).code, "BOSS_LOCKED");
  assert.equal(X.attemptGate(cfg, {}, 5).code, "BOSS_HIDDEN");
  assert.equal(X.attemptGate(cfg, {}, 42).code, "BOSS_UNKNOWN");
});

test("rulesFromConfig mirrors fees, multipliers and free-boss base", () => {
  const cfg = economy.mergeConfig({ EXPEDITION_FEES: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90], EXPEDITION_REWARD_MULTS: { 3: 3 }, EXPEDITION_FREE_BOSS_REWARD_BASE: 500 });
  const rules = X.rulesFromConfig(cfg);
  assert.equal(rules.fees[1], 10);
  assert.deepEqual(rules.rewardMults, { 1: 0.5, 2: 1, 3: 3 });
  assert.equal(rules.freeBossRewardBase, 500);
  const settings = X.getBossSettings(economy.mergeConfig({ EXPEDITION_COLLECTION_CONTRACTS: ["", `0x${"A".repeat(40)}`, "", "", "", "", "", "", "", ""], EXPEDITION_COLLECTION_ENERGY: [0, 4, 0, 0, 0, 0, 0, 0, 0, 0] }), 2);
  assert.equal(settings.contract, `0x${"a".repeat(40)}`);
  assert.equal(settings.energy, 4);
});
