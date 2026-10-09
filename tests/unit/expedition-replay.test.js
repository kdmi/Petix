const test = require("node:test");
const assert = require("node:assert/strict");

const E = require("../../assets/expeditions/engine.js");
const X = require("../../api/_lib/expeditions");
const { PLAYER_PETS, OTHER_PETS, playGreedy } = require("./helpers/expedition-fixtures");

const squad = PLAYER_PETS.map((p) => X.snapshotPet(p));
const wilds = OTHER_PETS.map((p) => ({ id: `wild:x:${p.id}`, name: p.name, img: null }));
const attemptFor = (seed, bossIndex = 2) => ({ attemptId: `a${seed}`, bossIndex, seed, squad, wilds, fee: 1000, startedAt: new Date().toISOString() });

test("200 seeds: the client's play and the server replay agree on hp, moves, stars and damage", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const attempt = attemptFor(seed);
    const client = E.createBattle({ squad: attempt.squad, wilds: attempt.wilds, boss: X.engineBoss(2), seed });
    const moves = playGreedy(E, client);
    const server = X.replayMoves(attempt, moves);
    assert.ok(server.over, `seed ${seed}: server battle not over`);
    assert.deepEqual(
      { hp: server.team.hp, bossHp: server.boss.hp, moves: server.moves, stars: server.over.stars, dmg: server.totalDamage },
      { hp: client.team.hp, bossHp: client.boss.hp, moves: client.moves, stars: client.over.stars, dmg: client.totalDamage },
      `seed ${seed}`
    );
  }
});

test("replay rejects illegal swaps, HIT without a ring, moves after the end and oversized lists", () => {
  const attempt = attemptFor(7);
  assert.throws(() => X.replayMoves(attempt, [{ a: 0, b: 48 }]), { httpCode: "INVALID_MOVES" });
  assert.throws(() => X.replayMoves(attempt, [{ a: -1, b: 0 }]), { httpCode: "INVALID_MOVES" });
  assert.throws(() => X.replayMoves(attempt, [{ hit: 0 }]), { httpCode: "INVALID_MOVES" });
  assert.throws(() => X.replayMoves(attempt, [{ hit: 4 }]), { httpCode: "INVALID_MOVES" }, "wild slot has no ring");
  assert.throws(() => X.replayMoves(attempt, "nope"), { httpCode: "INVALID_MOVES" });
  assert.throws(() => X.replayMoves(attempt, new Array(X.MAX_MOVES + 1).fill({ a: 0, b: 1 })), { httpCode: "INVALID_MOVES" });
  const client = E.createBattle({ squad: attempt.squad, wilds: attempt.wilds, boss: X.engineBoss(2), seed: 7 });
  const moves = playGreedy(E, client);
  assert.throws(() => X.replayMoves(attempt, moves.concat([{ a: 0, b: 1 }])), { httpCode: "INVALID_MOVES" }, "move after the end");
  // A swap that makes no match is illegal even between neighbours.
  const fresh = E.createBattle({ squad: attempt.squad, wilds: attempt.wilds, boss: X.engineBoss(2), seed: 7 });
  let noMatch = null;
  for (let i = 0; i < 48 && noMatch === null; i++) if (!E.canSwap(fresh, i, i + 1) && (i % 7) < 6) noMatch = i;
  assert.notEqual(noMatch, null);
  assert.throws(() => X.replayMoves(attempt, [{ a: noMatch, b: noMatch + 1 }]), { httpCode: "INVALID_MOVES" });
});

test("wild picks are deterministic by seed and never the player's own pets", () => {
  const roster = [
    { wallet: "0x" + "1".repeat(40), character: { id: "mine", status: "completed", name: "Mine" } },
    ...Array.from({ length: 6 }, (_, i) => ({ wallet: "0x" + "2".repeat(40), character: { id: `w${i}`, status: "completed", name: `W${i}`, imageUrl: `/w${i}.png` } })),
    { wallet: "0x" + "3".repeat(40), character: { id: "draft", status: "draft", name: "Draft" } },
  ];
  const a = X.pickWildPets(roster, "0x" + "1".repeat(40), 3, 99);
  const b = X.pickWildPets(roster, "0x" + "1".repeat(40), 3, 99);
  assert.deepEqual(a, b);
  assert.equal(a.length, 3);
  assert.ok(a.every((w) => !w.id.includes(":mine") && !w.id.includes(":draft")));
  assert.equal(new Set(a.map((w) => w.id)).size, 3);
  assert.equal(X.pickWildPets([], "0x" + "1".repeat(40), 2, 1).length, 0, "empty roster → engine uses placeholder wilds");
});
