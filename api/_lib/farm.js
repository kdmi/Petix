const { creditCurrency } = require("./currency");

// Pure farm logic (Farm-экономика, feature 013). No network/FS — config is passed in.
// Accrual is lazy: earnings derive from timestamps, capped at FARM_CAP_HOURS, credited
// only for COMPLETED whole hours (the partial hour is forfeited on early stop).

const HOUR_MS = 3600000;

const DEFAULT_FARM_STATE = Object.freeze({
  active: false,
  startedAt: null,
  lastClaimedAt: null,
});

function toMillis(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function normalizeFarmState(raw) {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_FARM_STATE };
  return {
    active: Boolean(raw.active),
    startedAt: raw.startedAt ? String(raw.startedAt) : null,
    lastClaimedAt: raw.lastClaimedAt ? String(raw.lastClaimedAt) : null,
  };
}

function rarityMultiplierFor(rarity, cfg) {
  const table = (cfg && cfg.rarityMult) || {};
  if (rarity && Object.prototype.hasOwnProperty.call(table, rarity)) {
    return table[rarity];
  }
  // tolerant lookup (case-insensitive) then fall back to Common / 1.0
  const key = Object.keys(table).find((k) => k.toLowerCase() === String(rarity || "").toLowerCase());
  if (key) return table[key];
  return table.Common != null ? table.Common : 1;
}

/** Points/hour for a character at a given level + rarity. */
function computeFarmRate(level, rarity, cfg) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
  const base = Number(cfg.FARM_BASE) || 0;
  const k = Number(cfg.FARM_LEVEL_K) || 0;
  return base * rarityMultiplierFor(rarity, cfg) * (1 + k * (safeLevel - 1));
}

/**
 * Compute accrued (uncredited) earnings for an active farm cycle.
 * Returns { active, completedHours, ratePerHour, earned, elapsedMs, forfeitedMinutes, capped, secondsRemaining }.
 * `earned` is an integer (floor of completedHours × rate). Inactive cycle → all zeros.
 */
function computeFarmEarned(farmState, now, level, rarity, cfg) {
  const state = normalizeFarmState(farmState);
  const ratePerHour = computeFarmRate(level, rarity, cfg);
  const capHours = Math.max(0, Math.floor(Number(cfg.FARM_CAP_HOURS) || 0));

  if (!state.active || !state.startedAt) {
    return {
      active: false,
      completedHours: 0,
      ratePerHour,
      earned: 0,
      elapsedMs: 0,
      forfeitedMinutes: 0,
      capped: false,
      secondsRemaining: 0,
    };
  }

  const startedMs = toMillis(state.startedAt);
  const nowMs = toMillis(now);
  const elapsedMs = Number.isFinite(startedMs) && Number.isFinite(nowMs) ? Math.max(0, nowMs - startedMs) : 0;
  const elapsedHours = Math.floor(elapsedMs / HOUR_MS);
  const completedHours = Math.min(elapsedHours, capHours);
  const capped = elapsedHours >= capHours;
  const earned = Math.floor(completedHours * ratePerHour);
  const forfeitedMinutes = capped ? 0 : Math.floor((elapsedMs % HOUR_MS) / 60000);
  const secondsRemaining = capped ? 0 : Math.max(0, Math.ceil((capHours * HOUR_MS - elapsedMs) / 1000));

  return {
    active: true,
    completedHours,
    ratePerHour,
    earned,
    elapsedMs,
    forfeitedMinutes,
    capped,
    secondsRemaining,
  };
}

/**
 * Build the farm state for a freshly started cycle.
 * Throws { code } if the character is already farming.
 */
function startFarm(character, now) {
  const state = normalizeFarmState(character && character.farmState);
  if (state.active) {
    const error = new Error("Character is already farming.");
    error.code = "ALREADY_FARMING";
    throw error;
  }
  const nowMs = toMillis(now);
  return {
    active: true,
    startedAt: new Date(Number.isFinite(nowMs) ? nowMs : Date.now()).toISOString(),
    lastClaimedAt: state.lastClaimedAt,
  };
}

// Internal: credit completed hours to the wallet profile and reset the cycle.
function settle(profile, character, now, cfg) {
  const result = computeFarmEarned(character.farmState, now, character.level, character.rarity, cfg);
  if (result.earned > 0) {
    creditCurrency(profile, result.earned);
  }
  character.farmState = {
    active: false,
    startedAt: null,
    lastClaimedAt: new Date(toMillis(now) || Date.now()).toISOString(),
  };
  return result;
}

/** Claim a (typically completed) cycle: credit completed hours, reset. */
function claimFarm(profile, character, now, cfg) {
  const before = computeFarmEarned(character.farmState, now, character.level, character.rarity, cfg);
  const result = settle(profile, character, now, cfg);
  return {
    claimed: result.earned,
    completedHours: result.completedHours,
    wasActive: before.active,
  };
}

module.exports = {
  DEFAULT_FARM_STATE,
  normalizeFarmState,
  computeFarmRate,
  computeFarmEarned,
  startFarm,
  claimFarm,
};
