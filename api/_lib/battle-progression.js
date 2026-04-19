const DEFAULT_LEVEL = 1;
const DEFAULT_EXPERIENCE = 0;
const DEFAULT_SOFT_CURRENCY = 0;
const DEFAULT_ATTRIBUTE_POINTS_AVAILABLE = 0;

function normalizeInteger(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.floor(numeric);
}

function normalizeProgression(record) {
  return {
    level: Math.max(DEFAULT_LEVEL, normalizeInteger(record?.level, DEFAULT_LEVEL)),
    experience: Math.max(0, normalizeInteger(record?.experience, DEFAULT_EXPERIENCE)),
    softCurrency: Math.max(0, normalizeInteger(record?.softCurrency, DEFAULT_SOFT_CURRENCY)),
    attributePointsAvailable: Math.max(
      0,
      normalizeInteger(record?.attributePointsAvailable, DEFAULT_ATTRIBUTE_POINTS_AVAILABLE)
    ),
  };
}

function getExperienceForNextLevel(level) {
  const normalizedLevel = Math.max(DEFAULT_LEVEL, normalizeInteger(level, DEFAULT_LEVEL));

  if (normalizedLevel <= 20) {
    return 500 + 50 * (normalizedLevel - 1);
  }

  return 1450 + 75 * (normalizedLevel - 20);
}

function getBattleXpReward({ role, isWinner }) {
  if (role === "attacker") {
    return isWinner ? 200 : 25;
  }

  if (role === "defender") {
    return isWinner ? 25 : 5;
  }

  throw new Error("Unknown battle role for XP reward.");
}

function applyBattleXpReward(progression, xpGained) {
  const normalized = normalizeProgression(progression);
  let level = normalized.level;
  let experience = normalized.experience + Math.max(0, normalizeInteger(xpGained, 0));
  let attributePointsAvailable = normalized.attributePointsAvailable;
  let levelsGained = 0;

  while (experience >= getExperienceForNextLevel(level)) {
    experience -= getExperienceForNextLevel(level);
    level += 1;
    attributePointsAvailable += 1;
    levelsGained += 1;
  }

  return {
    xpGained: Math.max(0, normalizeInteger(xpGained, 0)),
    levelUp: levelsGained > 0,
    newLevel: level,
    newExperience: experience,
    xpForNextLevel: getExperienceForNextLevel(level),
    attributePointsGained: levelsGained,
    newAttributePointsAvailable: attributePointsAvailable,
    nextState: {
      ...normalized,
      level,
      experience,
      attributePointsAvailable,
    },
  };
}

function buildBattleRewardOutcome({ petId, role, isWinner, progression }) {
  const xpGained = getBattleXpReward({ role, isWinner });
  const applied = applyBattleXpReward(progression, xpGained);

  return {
    petId,
    role,
    xpGained: applied.xpGained,
    levelUp: applied.levelUp,
    newLevel: applied.newLevel,
    newExperience: applied.newExperience,
    xpForNextLevel: applied.xpForNextLevel,
    attributePointsGained: applied.attributePointsGained,
    newAttributePointsAvailable: applied.newAttributePointsAvailable,
    isPassiveReward: role === "defender",
    nextState: applied.nextState,
  };
}

module.exports = {
  DEFAULT_ATTRIBUTE_POINTS_AVAILABLE,
  DEFAULT_EXPERIENCE,
  DEFAULT_LEVEL,
  DEFAULT_SOFT_CURRENCY,
  applyBattleXpReward,
  buildBattleRewardOutcome,
  getBattleXpReward,
  getExperienceForNextLevel,
  normalizeProgression,
};
