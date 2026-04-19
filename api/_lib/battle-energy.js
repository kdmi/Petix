const { isAdminWallet } = require("./auth");

const BATTLE_ENERGY_MAX = 3;
const BATTLE_TIMEZONE = "America/New_York";
const NO_ENERGY_ERROR_CODE = "DAILY_BATTLE_LIMIT_REACHED";

const ZONED_PARTS_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: BATTLE_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function normalizeInteger(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.floor(numeric);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getZonedParts(date = new Date(), timeZone = BATTLE_TIMEZONE) {
  const formatter =
    timeZone === BATTLE_TIMEZONE
      ? ZONED_PARTS_FORMATTER
      : new Intl.DateTimeFormat("en-US", {
          timeZone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hourCycle: "h23",
        });

  return formatter.formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") {
      acc[part.type] = part.value;
    }
    return acc;
  }, {});
}

function getTimeZoneOffsetMs(date = new Date(), timeZone = BATTLE_TIMEZONE) {
  const parts = getZonedParts(date, timeZone);
  const zonedUtcMs = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );

  return zonedUtcMs - date.getTime();
}

function zonedDateTimeToUtc(parts, timeZone = BATTLE_TIMEZONE) {
  let utcMs = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour || 0),
    Number(parts.minute || 0),
    Number(parts.second || 0)
  );

  for (let index = 0; index < 2; index += 1) {
    const offsetMs = getTimeZoneOffsetMs(new Date(utcMs), timeZone);
    const nextUtcMs =
      Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        Number(parts.hour || 0),
        Number(parts.minute || 0),
        Number(parts.second || 0)
      ) - offsetMs;

    if (nextUtcMs === utcMs) {
      break;
    }

    utcMs = nextUtcMs;
  }

  return new Date(utcMs);
}

function getBattleDateKey(now = new Date()) {
  const parts = getZonedParts(now, BATTLE_TIMEZONE);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getNextBattleResetAt(now = new Date()) {
  const parts = getZonedParts(now, BATTLE_TIMEZONE);
  const nextDaySeed = new Date(
    Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + 1, 0, 0, 0)
  );

  return zonedDateTimeToUtc(
    {
      year: nextDaySeed.getUTCFullYear(),
      month: String(nextDaySeed.getUTCMonth() + 1).padStart(2, "0"),
      day: String(nextDaySeed.getUTCDate()).padStart(2, "0"),
      hour: "00",
      minute: "00",
      second: "00",
    },
    BATTLE_TIMEZONE
  );
}

function hasUnlimitedBattleEnergy(wallet) {
  return Boolean(wallet) && isAdminWallet(wallet);
}

function normalizeBattleState(rawBattleState, { now = new Date() } = {}) {
  const currentDateKey = getBattleDateKey(now);
  const energyMax = BATTLE_ENERGY_MAX;
  let energyCurrent = clamp(
    normalizeInteger(rawBattleState?.energyCurrent, energyMax),
    0,
    energyMax
  );
  let lastResetDate = String(rawBattleState?.lastResetDate || "").trim();
  let updatedAt = String(rawBattleState?.updatedAt || "").trim();

  if (!lastResetDate || lastResetDate !== currentDateKey) {
    energyCurrent = energyMax;
    lastResetDate = currentDateKey;
    updatedAt = now.toISOString();
  }

  return {
    energyCurrent,
    energyMax,
    lastResetDate,
    updatedAt: updatedAt || now.toISOString(),
  };
}

function buildBattleStateView(rawBattleState, { now = new Date(), wallet = "" } = {}) {
  const normalized = normalizeBattleState(rawBattleState, { now });
  const isUnlimited = hasUnlimitedBattleEnergy(wallet);
  const energyCurrent = isUnlimited ? normalized.energyMax : normalized.energyCurrent;

  return {
    energyCurrent,
    energyMax: normalized.energyMax,
    canStartFight: isUnlimited || energyCurrent > 0,
    resetsAt: getNextBattleResetAt(now).toISOString(),
    timezone: BATTLE_TIMEZONE,
  };
}

function createNoEnergyError() {
  const error = new Error("You have used all battles for today.");
  error.code = NO_ENERGY_ERROR_CODE;
  return error;
}

function assertBattleEnergyAvailable(rawBattleState, { now = new Date(), wallet = "" } = {}) {
  const normalized = normalizeBattleState(rawBattleState, { now });
  if (hasUnlimitedBattleEnergy(wallet)) {
    return {
      ...normalized,
      energyCurrent: normalized.energyMax,
    };
  }

  if (normalized.energyCurrent <= 0) {
    throw createNoEnergyError();
  }

  return normalized;
}

function consumeBattleEnergy(rawBattleState, { now = new Date(), amount = 1, wallet = "" } = {}) {
  const normalized = assertBattleEnergyAvailable(rawBattleState, { now, wallet });
  if (hasUnlimitedBattleEnergy(wallet)) {
    return {
      ...normalized,
      energyCurrent: normalized.energyMax,
      updatedAt: now.toISOString(),
    };
  }

  const spendAmount = clamp(normalizeInteger(amount, 1), 1, normalized.energyMax);

  if (normalized.energyCurrent < spendAmount) {
    throw createNoEnergyError();
  }

  return {
    ...normalized,
    energyCurrent: normalized.energyCurrent - spendAmount,
    updatedAt: now.toISOString(),
  };
}

function refundBattleEnergy(rawBattleState, { now = new Date(), amount = 1, wallet = "" } = {}) {
  const normalized = normalizeBattleState(rawBattleState, { now });
  if (hasUnlimitedBattleEnergy(wallet)) {
    return {
      ...normalized,
      energyCurrent: normalized.energyMax,
      updatedAt: now.toISOString(),
    };
  }

  const refundAmount = clamp(normalizeInteger(amount, 1), 1, normalized.energyMax);

  return {
    ...normalized,
    energyCurrent: clamp(normalized.energyCurrent + refundAmount, 0, normalized.energyMax),
    updatedAt: now.toISOString(),
  };
}

module.exports = {
  BATTLE_ENERGY_MAX,
  BATTLE_TIMEZONE,
  NO_ENERGY_ERROR_CODE,
  assertBattleEnergyAvailable,
  buildBattleStateView,
  consumeBattleEnergy,
  createNoEnergyError,
  getBattleDateKey,
  getNextBattleResetAt,
  normalizeBattleState,
  refundBattleEnergy,
};
