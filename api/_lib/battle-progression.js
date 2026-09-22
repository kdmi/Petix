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

// Total experience a pet has accumulated across all its levels. Used to undo a
// battle's XP exactly: the level curve is deterministic, so the sum can be
// walked back down again.
function getCumulativeExperience(record) {
  const { level, experience } = normalizeProgression(record);
  let total = experience;
  for (let step = 1; step < level; step += 1) {
    total += getExperienceForNextLevel(step);
  }
  return total;
}

function resolveProgressionFromExperience(totalExperience) {
  let remaining = Math.max(0, normalizeInteger(totalExperience, 0));
  let level = DEFAULT_LEVEL;
  while (remaining >= getExperienceForNextLevel(level)) {
    remaining -= getExperienceForNextLevel(level);
    level += 1;
  }
  return { level, experience: remaining };
}

/**
 * Undoes what a battle gave this pet, as a delta against the record as it is
 * now — a failed battle must take back its own XP and points and nothing else.
 * Points already spent are not clawed back: the floor at zero means a rollback
 * can never take away more than the battle handed out.
 */
function revertBattleXpReward(record, { xpGained = 0, attributePointsGained = 0 } = {}) {
  const current = normalizeProgression(record);
  const total = Math.max(0, getCumulativeExperience(record) - Math.max(0, normalizeInteger(xpGained, 0)));
  const { level, experience } = resolveProgressionFromExperience(total);

  return {
    level,
    experience,
    softCurrency: current.softCurrency,
    attributePointsAvailable: Math.max(
      0,
      current.attributePointsAvailable - Math.max(0, normalizeInteger(attributePointsGained, 0))
    ),
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
  getCumulativeExperience,
  resolveProgressionFromExperience,
  revertBattleXpReward,
  getBattleXpReward,
  getExperienceForNextLevel,
  normalizeProgression,
};
