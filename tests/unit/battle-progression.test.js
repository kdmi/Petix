const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyBattleXpReward,
  buildBattleRewardOutcome,
  getExperienceForNextLevel,
} = require("../../api/_lib/battle-progression");

test("getExperienceForNextLevel follows the approved XP curve", () => {
  // Feature 028: the first ten levels are untouched — that stretch is what a
  // new player sees — and from level 11 each level costs 250 more than the
  // last, where it used to be 50 (and 75 past level 20).
  assert.equal(getExperienceForNextLevel(1), 500);
  assert.equal(getExperienceForNextLevel(10), 950);
  assert.equal(getExperienceForNextLevel(11), 1200);
  assert.equal(getExperienceForNextLevel(20), 3450);
  assert.equal(getExperienceForNextLevel(30), 5950);

  // Монотонность и отсутствие обрыва на стыке: каждый следующий уровень
  // дороже предыдущего, и на границе десятки шаг не проваливается.
  let previous = 0;
  for (let level = 1; level <= 60; level += 1) {
    const cost = getExperienceForNextLevel(level);
    assert.ok(cost > previous, `уровень ${level} должен стоить дороже предыдущего`);
    previous = cost;
  }
});

test("a steeper curve never demotes a pet that already levelled", () => {
  // Уровень хранится в записи, а experience — только остаток до следующего.
  // Поэтому подорожание кривой делает дороже будущее, а не прошлое.
  const veteran = { level: 30, experience: 100, softCurrency: 0, attributePointsAvailable: 4 };
  const reward = applyBattleXpReward(veteran, 200);

  assert.equal(reward.newLevel, 30, "уровень на месте");
  assert.equal(reward.levelUp, false);
  assert.equal(reward.newExperience, 300, "опыт просто копится дальше");
  assert.equal(reward.xpForNextLevel, 5950, "но следующий уровень теперь дороже");
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
