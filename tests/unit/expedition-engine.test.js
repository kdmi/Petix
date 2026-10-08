const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const E = require("../../assets/expeditions/engine.js");
const { PLAYER_PETS, OTHER_PETS, playGreedy } = require("./helpers/expedition-fixtures");

const BOSS = { name: "Test", hp: 2600, power: 12, shields: 3, par: 17 };
const toEnginePet = (p) => ({ id: p.id, name: p.name, level: p.level, ...p.attributes });
const SQUAD = PLAYER_PETS.map(toEnginePet);
const WILDS = OTHER_PETS.map(toEnginePet);

test("shared engine is byte-identical to the demo copy", () => {
  const shared = fs.readFileSync(path.join(__dirname, "../../assets/expeditions/engine.js"), "utf8");
  const demo = fs.readFileSync(path.join(__dirname, "../../expedition-demo/engine.js"), "utf8");
  assert.equal(shared.slice(shared.indexOf("(function (root, factory)")), demo.slice(demo.indexOf("(function (root, factory)")));
});

test("same seed + same moves → identical result; different seed → different board", () => {
  const a = E.createBattle({ squad: SQUAD, wilds: WILDS, boss: BOSS, seed: 42 });
  const b = E.createBattle({ squad: SQUAD, wilds: WILDS, boss: BOSS, seed: 42 });
  assert.deepEqual(E.snapshot(a), E.snapshot(b));
  const moves = playGreedy(E, a);
  for (const m of moves) {
    if ("hit" in m) E.useAbility(b, m.hit);
    else E.playMove(b, m.a, m.b);
  }
  assert.ok(a.over, "battle ends");
  assert.deepEqual(a.over, b.over);
  assert.deepEqual(E.snapshot(a), E.snapshot(b));
  const c = E.createBattle({ squad: SQUAD, wilds: WILDS, boss: BOSS, seed: 43 });
  assert.notDeepEqual(E.snapshot(c), E.snapshot(b));
});

test("1 000 random seeds play to the end without throwing and within 300 moves", () => {
  let wins = 0;
  for (let seed = 1; seed <= 1000; seed++) {
    const s = E.createBattle({ squad: SQUAD, wilds: WILDS, boss: BOSS, seed });
    playGreedy(E, s);
    assert.ok(s.over, `seed ${seed} did not finish`);
    assert.ok(s.moves <= 300);
    if (s.over.won) wins++;
  }
  assert.ok(wins > 0);
});

test("rules: fees and per-star payouts, free replay after 3★, injected rules override defaults", () => {
  assert.equal(E.entryFee(1, 0), 0);
  assert.equal(E.entryFee(2, 0), 1000);
  assert.equal(E.entryFee(2, 3), 0);
  assert.deepEqual([1, 2, 3].map((t) => E.rewardTier(2, t)), [500, 1000, 2000]);
  assert.equal(E.rewardFor(2, 3), 3500);
  assert.equal(E.rewardFor(1, 3), 3500, "free boss pays from the 1 000 base");
  const rules = { fees: [0, 500], rewardMults: { 1: 1, 2: 1, 3: 1 }, freeBossRewardBase: 100 };
  assert.equal(E.entryFee(2, 0, rules), 500);
  assert.equal(E.rewardFor(2, 3, rules), 1500);
  assert.equal(E.rewardFor(1, 2, rules), 200);
});
