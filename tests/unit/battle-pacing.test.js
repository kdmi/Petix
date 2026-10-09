const test = require("node:test");
const assert = require("node:assert/strict");

const { createBattleSimulation } = require("../../api/_lib/battle");
const { DEFAULTS, validateConfigPatch } = require("../../api/_lib/economy-config");

// Feature 029. Fights had collapsed to a median of 7 rounds, with a quarter of
// them ending in five or fewer: players put 53% of their points into strength,
// a point of strength buys +2 damage while a point of stamina buys +8 HP, and
// the gap widens with every level (3.1 hits to kill at level 21+ against 4.4
// at level 5).
//
// The four numbers behind that now live in the economy config, so the pacing
// can be tuned from the admin panel instead of a deploy — and the exponents
// let the curve bend, which is what keeps an all-tank build from turning a
// fight into fifty rounds.

function pet(id, { stamina = 10, strength = 10, agility = 3, intelligence = 3, level = 20 } = {}) {
  return {
    wallet: `w_${id}`,
    character: {
      id,
      status: "completed",
      name: id,
      creatureType: "Pet",
      rarity: "Legendary",
      level,
      experience: 0,
      attributes: { stamina, agility, strength, intelligence },
      variables: {},
      powers: [{ id: "p1", title: "Power", description: "A hit." }],
      selectedPowerId: "p1",
    },
  };
}

function averageRounds(pacing, { runs = 60, build = {} } = {}) {
  let total = 0;
  for (let index = 0; index < runs; index += 1) {
    const sim = createBattleSimulation({
      battleId: `b_${index}`,
      attackerParticipant: pet("atk", build),
      defenderParticipant: pet("def", build),
      matchmaking: {},
      pacing,
    });
    total += sim.battle.rounds.length;
  }
  return total / runs;
}

test("without a config the pacing is exactly what it was before", () => {
  const sim = createBattleSimulation({
    battleId: "b",
    attackerParticipant: pet("atk", { stamina: 10, strength: 18 }),
    defenderParticipant: pet("def", { stamina: 10, strength: 18 }),
    matchmaking: {},
  });

  // 52 + 8 × 10 and 7 + 2 × 18 — the numbers the game shipped with.
  assert.equal(sim.battle.attackerSnapshot.derivedStats.maxHp, 132);
  assert.equal(sim.battle.attackerSnapshot.derivedStats.baseDamage, 43);
});

test("the config defaults keep those same numbers, so the deploy changes nothing", () => {
  assert.equal(DEFAULTS.BATTLE_HP_BASE, 52);
  assert.equal(DEFAULTS.BATTLE_HP_PER_STAMINA, 8);
  assert.equal(DEFAULTS.BATTLE_HP_EXPONENT, 1);
  assert.equal(DEFAULTS.BATTLE_DAMAGE_BASE, 7);
  assert.equal(DEFAULTS.BATTLE_DAMAGE_PER_STRENGTH, 2);
  assert.equal(DEFAULTS.BATTLE_DAMAGE_EXPONENT, 1);

  const sim = createBattleSimulation({
    battleId: "b",
    attackerParticipant: pet("atk", { stamina: 10, strength: 18 }),
    defenderParticipant: pet("def", { stamina: 10, strength: 18 }),
    matchmaking: {},
    pacing: DEFAULTS,
  });
  assert.equal(sim.battle.attackerSnapshot.derivedStats.maxHp, 132);
  assert.equal(sim.battle.attackerSnapshot.derivedStats.baseDamage, 43);
});

test("tuning the numbers lengthens the fight", () => {
  const before = averageRounds(undefined, { build: { stamina: 11, strength: 21 } });
  const after = averageRounds(
    {
      ...DEFAULTS,
      BATTLE_HP_PER_STAMINA: 20,
      BATTLE_HP_EXPONENT: 0.8,
      BATTLE_DAMAGE_PER_STRENGTH: 3,
      BATTLE_DAMAGE_EXPONENT: 0.8,
    },
    { build: { stamina: 11, strength: 21 } }
  );

  assert.ok(before < 9, `the current pacing is short: ${before.toFixed(1)} rounds`);
  assert.ok(after > before * 1.4, `tuned pacing must be clearly longer: ${after.toFixed(1)}`);
});

test("the exponent damps the extremes a linear curve blows up", () => {
  const tank = { stamina: 30, strength: 8 };
  const linear = averageRounds({ ...DEFAULTS, BATTLE_HP_PER_STAMINA: 20 }, { runs: 25, build: tank });
  const damped = averageRounds(
    { ...DEFAULTS, BATTLE_HP_PER_STAMINA: 20, BATTLE_HP_EXPONENT: 0.8, BATTLE_DAMAGE_EXPONENT: 0.8 },
    { runs: 25, build: tank }
  );

  assert.ok(
    damped < linear,
    `an all-tank mirror must get shorter, not longer: ${damped.toFixed(1)} vs ${linear.toFixed(1)}`
  );
});

test("a garbage exponent is refused before it reaches a fight", () => {
  assert.equal(validateConfigPatch({ BATTLE_HP_EXPONENT: 0.8 }).ok, true);
  assert.equal(validateConfigPatch({ BATTLE_DAMAGE_EXPONENT: 1 }).ok, true);

  for (const bad of [0, 0.1, 1.5, -1, "0.8", null]) {
    assert.equal(
      validateConfigPatch({ BATTLE_HP_EXPONENT: bad }).ok,
      false,
      `exponent ${JSON.stringify(bad)} must be rejected`
    );
  }
  assert.equal(validateConfigPatch({ BATTLE_HP_PER_STAMINA: -5 }).ok, false);
});

test("the admin panel offers every pacing knob and saves them all", () => {
  const source = require("fs").readFileSync(
    require("path").resolve(__dirname, "../../pet-creation/app.js"),
    "utf8"
  );

  for (const key of [
    "BATTLE_HP_BASE",
    "BATTLE_HP_PER_STAMINA",
    "BATTLE_HP_EXPONENT",
    "BATTLE_DAMAGE_BASE",
    "BATTLE_DAMAGE_PER_STRENGTH",
    "BATTLE_DAMAGE_EXPONENT",
  ]) {
    assert.ok(source.includes(`ecoNumberRow("`) && source.includes(`"${key}"`), `${key} must have a field`);
    // The save path reads an explicit key list; a field nobody saves is a trap.
    assert.ok(
      new RegExp(`"${key}"[^\\n]*\\]\\.forEach`).test(source) || source.includes(`"${key}",`),
      `${key} must be in the saved patch`
    );
  }
});
