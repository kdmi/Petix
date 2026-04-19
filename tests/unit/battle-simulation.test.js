const test = require("node:test");
const assert = require("node:assert/strict");

const { createBattleSimulation } = require("../../api/_lib/battle");

function createSequenceRandom({ ints = [], floats = [] }) {
  let intIndex = 0;
  let floatIndex = 0;

  return {
    int(min, max) {
      assert.ok(intIndex < ints.length, `Missing int roll #${intIndex + 1}`);
      const value = ints[intIndex];
      intIndex += 1;
      assert.ok(value >= min && value <= max, `Int roll ${value} is outside ${min}-${max}`);
      return value;
    },
    float() {
      assert.ok(floatIndex < floats.length, `Missing float roll #${floatIndex + 1}`);
      const value = floats[floatIndex];
      floatIndex += 1;
      assert.ok(value >= 0 && value <= 1, `Float roll ${value} is outside 0-1`);
      return value;
    },
  };
}

function createParticipant({
  wallet,
  id,
  name,
  stamina,
  agility,
  strength,
  intelligence,
}) {
  return {
    wallet,
    character: {
      id,
      status: "completed",
      creatureType: "Arena Cub",
      rarity: "Rare",
      name,
      level: 1,
      experience: 0,
      softCurrency: 0,
      attributePointsAvailable: 0,
      attributes: {
        stamina,
        agility,
        strength,
        intelligence,
      },
      variables: {
        ELEMENT: "Arc static",
        TOP_ITEM: "Tiny visor",
        PROFESSION_STYLE: "Arena gremlin",
        SIDE_DETAILS: "Loose sparks",
        FACIAL_FEATURES: "Wide grin",
        ELEMENT_EFFECTS: "Neon crackles",
      },
      selectedPowerId: "power_1",
      powers: [
        {
          id: "power_1",
          title: "Chaos Burst",
          description: "A noisy finishing blast.",
        },
      ],
      updatedAt: "2026-04-17T00:00:00.000Z",
      createdAt: "2026-04-17T00:00:00.000Z",
    },
  };
}

test("battle simulation starts with the attacker and uses superpower on the third own turn", () => {
  const attacker = createParticipant({
    wallet: "wallet_attacker",
    id: "pet_attacker",
    name: "Attacker",
    stamina: 0,
    agility: 0,
    strength: 7,
    intelligence: 30,
  });
  const defender = createParticipant({
    wallet: "wallet_defender",
    id: "pet_defender",
    name: "Defender",
    stamina: 0,
    agility: 0,
    strength: 1,
    intelligence: 0,
  });

  const simulation = createBattleSimulation({
    battleId: "battle_superpower",
    attackerParticipant: attacker,
    defenderParticipant: defender,
    matchmaking: {
      preferredBandApplied: true,
      levelDistance: 0,
      selectionMode: "preferred_band",
    },
    random: createSequenceRandom({
      ints: [15, 5, 5, 10, 15, 5, 5, 10, 10, 5, 5, 10, 15, 5],
      floats: [0.3, 0.99, 0.99, 0.3, 0.99, 0.99, 0.3, 0.99, 0.3, 0.99],
    }),
  });

  assert.equal(simulation.battle.rounds[0].actorPetId, "pet_attacker");
  assert.equal(simulation.battle.rounds[0].roundNumber, 1);

  const superpowerRound = simulation.battle.rounds.find((round) => round.usedSuperpower);
  assert.ok(superpowerRound);
  assert.equal(superpowerRound.actorPetId, "pet_attacker");
  assert.equal(superpowerRound.roundNumber, 5);
  assert.equal(superpowerRound.turnType, "superpower");
  assert.equal(simulation.battle.result.winnerPetId, "pet_attacker");
});

test("battle simulation derives HP and base damage from the latest balance formulas", () => {
  const attacker = createParticipant({
    wallet: "wallet_attacker",
    id: "pet_attacker_formula",
    name: "Attacker",
    stamina: 3,
    agility: 0,
    strength: 4,
    intelligence: 0,
  });
  const defender = createParticipant({
    wallet: "wallet_defender",
    id: "pet_defender_formula",
    name: "Defender",
    stamina: 2,
    agility: 0,
    strength: 0,
    intelligence: 0,
  });

  let intRollIndex = 0;
  let floatRollIndex = 0;

  const simulation = createBattleSimulation({
    battleId: "battle_formula_check",
    attackerParticipant: attacker,
    defenderParticipant: defender,
    matchmaking: {
      preferredBandApplied: true,
      levelDistance: 0,
      selectionMode: "preferred_band",
    },
    random: {
      int(min, max) {
        const value = intRollIndex % 2 === 0 ? 15 : 5;
        intRollIndex += 1;
        assert.ok(value >= min && value <= max, `Int roll ${value} is outside ${min}-${max}`);
        return value;
      },
      float() {
        const value = floatRollIndex % 2 === 0 ? 0.3 : 0.99;
        floatRollIndex += 1;
        return value;
      },
    },
  });

  assert.equal(simulation.battle.startingHp.attacker, 76);
  assert.equal(simulation.battle.startingHp.defender, 68);
  assert.equal(simulation.battle.rounds[0].damage, 15);
});

test("battle simulation emits a counterattack step after a strong defense", () => {
  const attacker = createParticipant({
    wallet: "wallet_attacker",
    id: "pet_attacker",
    name: "Attacker",
    stamina: 0,
    agility: 0,
    strength: 1,
    intelligence: 0,
  });
  const defender = createParticipant({
    wallet: "wallet_defender",
    id: "pet_defender",
    name: "Defender",
    stamina: 0,
    agility: 0,
    strength: 10,
    intelligence: 100,
  });

  const simulation = createBattleSimulation({
    battleId: "battle_counter",
    attackerParticipant: attacker,
    defenderParticipant: defender,
    matchmaking: {
      preferredBandApplied: true,
      levelDistance: 0,
      selectionMode: "preferred_band",
    },
    random: createSequenceRandom({
      ints: [5, 15, 15, 5, 5, 10, 15, 5, 5, 10, 15, 5],
      floats: [0.01, 0.3, 0.99, 0.99, 0.3, 0.99, 0.99, 0.3, 0.99],
    }),
  });

  assert.equal(simulation.battle.rounds[0].hitResult, "defended");
  assert.equal(simulation.battle.rounds[0].counterEligible, true);
  assert.equal(simulation.battle.rounds[0].counterTriggered, true);
  assert.equal(simulation.battle.rounds[1].turnType, "counterattack");
  assert.equal(simulation.battle.rounds[1].actorPetId, "pet_defender");
  assert.ok(simulation.battle.rounds[1].damage > 0);
  assert.equal(simulation.battle.result.winnerPetId, "pet_defender");
});
