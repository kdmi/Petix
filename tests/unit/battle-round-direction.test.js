const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildArenaRoundVisualState,
  getArenaRoundPillAssets,
  getArenaRoundPillDirection,
} = require("../../pet-creation/battle-round-direction");
const {
  createBattleRound,
  createReadyBattleRecord,
} = require("./helpers/battle-history-test-utils");

test("buildArenaRoundVisualState maps an initiator attack to right-side arrows and defender accents", () => {
  const visualState = buildArenaRoundVisualState({
    actorPetId: "pet_attacker",
    initiatorId: "pet_attacker",
    targetPetId: "pet_defender",
  });

  assert.deepEqual(visualState, {
    attackerSide: "initiator",
    defenderSide: "opponent",
    pillDirection: "right",
    accentSide: "right",
    leftIcon: "swords",
    rightIcon: "shield",
  });
});

test("buildArenaRoundVisualState maps an opponent attack to left-side arrows and defender accents", () => {
  const visualState = buildArenaRoundVisualState({
    actorPetId: "pet_defender",
    initiatorId: "pet_attacker",
    targetPetId: "pet_attacker",
  });

  assert.deepEqual(visualState, {
    attackerSide: "opponent",
    defenderSide: "initiator",
    pillDirection: "left",
    accentSide: "left",
    leftIcon: "shield",
    rightIcon: "swords",
  });
});

test("getArenaRoundPillAssets keeps the yellow ornament on the attacking side", () => {
  assert.deepEqual(getArenaRoundPillAssets("left"), {
    left: "/assets/battle/round-pill-left-alt.svg",
    right: "/assets/battle/round-pill-right-alt.svg",
  });

  assert.deepEqual(getArenaRoundPillAssets("right"), {
    left: "/assets/battle/round-pill-left-default.svg",
    right: "/assets/battle/round-pill-right-default.svg",
  });
});

test("getArenaRoundPillDirection keeps alternating attacker changes correct beyond round three", () => {
  const rounds = [
    createBattleRound({ roundNumber: 1, actorPetId: "pet_attacker", targetPetId: "pet_defender" }),
    createBattleRound({ roundNumber: 2, actorPetId: "pet_defender", targetPetId: "pet_attacker" }),
    createBattleRound({ roundNumber: 3, actorPetId: "pet_attacker", targetPetId: "pet_defender" }),
    createBattleRound({ roundNumber: 4, actorPetId: "pet_defender", targetPetId: "pet_attacker" }),
    createBattleRound({ roundNumber: 5, actorPetId: "pet_attacker", targetPetId: "pet_defender" }),
    createBattleRound({ roundNumber: 6, actorPetId: "pet_defender", targetPetId: "pet_attacker" }),
  ];

  const directions = rounds.map((round) =>
    getArenaRoundPillDirection(
      buildArenaRoundVisualState({
        actorPetId: round.actorPetId,
        initiatorId: "pet_attacker",
        targetPetId: round.targetPetId,
      })
    )
  );

  assert.deepEqual(directions, ["right", "left", "right", "left", "right", "left"]);
});

test("replay fixtures preserve the same pillDirection for the same saved rounds", () => {
  const battleRecord = createReadyBattleRecord({
    attackerPetId: "pet_attacker",
    defenderPetId: "pet_defender",
    id: "battle_direction_fixture",
    rounds: [
      createBattleRound({ roundNumber: 1, actorPetId: "pet_attacker", targetPetId: "pet_defender" }),
      createBattleRound({ roundNumber: 2, actorPetId: "pet_defender", targetPetId: "pet_attacker", hitResult: "defended" }),
      createBattleRound({ roundNumber: 3, actorPetId: "pet_attacker", targetPetId: "pet_defender", hitResult: "critical" }),
      createBattleRound({
        roundNumber: 4,
        actorPetId: "pet_defender",
        targetPetId: "pet_attacker",
        turnType: "counterattack",
        hitResult: "counter",
      }),
      createBattleRound({
        roundNumber: 5,
        actorPetId: "pet_attacker",
        targetPetId: "pet_defender",
        usedSuperpower: true,
      }),
    ],
  });

  const liveDirections = battleRecord.rounds.map((round) =>
    buildArenaRoundVisualState({
      actorPetId: round.actorPetId,
      initiatorId: battleRecord.attackerPetId,
      targetPetId: round.targetPetId,
    }).pillDirection
  );
  const replayDirections = battleRecord.rounds.map((round) =>
    getArenaRoundPillDirection({
      attackerSide:
        buildArenaRoundVisualState({
          actorPetId: round.actorPetId,
          initiatorId: battleRecord.attackerPetId,
          targetPetId: round.targetPetId,
        }).attackerSide,
    })
  );

  assert.deepEqual(liveDirections, ["right", "left", "right", "left", "right"]);
  assert.deepEqual(replayDirections, liveDirections);
});
