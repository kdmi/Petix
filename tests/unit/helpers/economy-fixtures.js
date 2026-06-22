const { getDefaults } = require("../../../api/_lib/economy-config");

// Deterministic fixtures for Farm-экономика tests (feature 013).
const HOUR_MS = 3600000;
const BASE_NOW = Date.parse("2026-06-21T12:00:00.000Z");

function makeCharacter(overrides = {}) {
  return Object.assign(
    {
      id: "char-1",
      status: "completed",
      level: 1,
      rarity: "Common",
      farmState: { active: false, startedAt: null, lastClaimedAt: null },
    },
    overrides
  );
}

function makeProfile(overrides = {}) {
  return Object.assign(
    {
      draft: null,
      characters: [],
      notifications: [],
      battleState: null,
      currency: { balance: 0, totalEarned: 0 },
      paidSlots: 0,
    },
    overrides
  );
}

/** ISO timestamp for a farm cycle started `hours`h `minutes`m before `now` (ms). */
function startedAgo(hours, minutes = 0, now = BASE_NOW) {
  return new Date(now - hours * HOUR_MS - minutes * 60000).toISOString();
}

module.exports = {
  HOUR_MS,
  BASE_NOW,
  defaults: getDefaults,
  makeCharacter,
  makeProfile,
  startedAgo,
};
