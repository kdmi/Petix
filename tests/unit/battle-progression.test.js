const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyBattleXpReward,
  buildBattleRewardOutcome,
  getExperienceForNextLevel,
} = require("../../api/_lib/battle-progression");

test("getExperienceForNextLevel follows the approved XP curve", () => {
  assert.equal(getExperienceForNextLevel(1), 500);
  assert.equal(getExperienceForNextLevel(20), 1450);
  assert.equal(getExperienceForNextLevel(21), 1525);
});

test("applyBattleXpReward supports multiple level gains", () => {
  const reward = applyBattleXpReward(
    {
      level: 1,
      experience: 490,
      softCurrency: 0,
      attributePointsAvailable: 0,
    },
    600
  );

  assert.equal(reward.levelUp, true);
  assert.equal(reward.newLevel, 3);
  assert.equal(reward.newExperience, 40);
  assert.equal(reward.attributePointsGained, 2);
  assert.equal(reward.newAttributePointsAvailable, 2);
  assert.equal(reward.xpForNextLevel, 600);
});

test("buildBattleRewardOutcome applies passive defender rewards", () => {
  const reward = buildBattleRewardOutcome({
    petId: "pet_defender",
    role: "defender",
    isWinner: false,
    progression: {
      level: 4,
      experience: 120,
      softCurrency: 0,
      attributePointsAvailable: 1,
    },
  });

  assert.equal(reward.xpGained, 5);
  assert.equal(reward.isPassiveReward, true);
  assert.equal(reward.newLevel, 4);
  assert.equal(reward.newExperience, 125);
});
