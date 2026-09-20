const {
  BASE_WIN_REWARD,
  LEVEL_MULTIPLIER,
  MIN_LEVEL,
  FORMAT_ABBREV_THRESHOLD,
} = require("./currency-config");

function toSafeInteger(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(0, Math.floor(number));
}

function normalizeCurrency(raw) {
  if (!raw || typeof raw !== "object") {
    return { balance: 0, totalEarned: 0 };
  }
  const normalized = {
    balance: toSafeInteger(raw.balance, 0),
    totalEarned: toSafeInteger(raw.totalEarned, 0),
  };
  // Ручные правки админа (подарки, компенсации, откаты) — не заработок и не
  // эмиссия. Держим их отдельно, чтобы статистика оставалась честной.
  const adjusted = Number(raw.adjusted);
  if (Number.isFinite(adjusted) && adjusted !== 0) normalized.adjusted = Math.trunc(adjusted);
  return normalized;
}

/**
 * Ручная правка баланса без учёта в totalEarned. Отрицательная дельта не уводит
 * баланс в минус; возвращает фактически применённую дельту.
 */
function adjustCurrency(profile, delta) {
  const amount = Number(delta);
  if (!Number.isInteger(amount) || amount === 0) {
    throw new Error("Adjustment must be a non-zero integer.");
  }
  if (!profile || typeof profile !== "object") {
    throw new Error("adjustCurrency: profile is required.");
  }
  const current = normalizeCurrency(profile.currency);
  const applied = amount < 0 ? -Math.min(-amount, current.balance) : amount;
  profile.currency = {
    ...current,
    balance: current.balance + applied,
    adjusted: (current.adjusted || 0) + applied,
  };
  return applied;
}

function computeCoinReward(level, options = {}) {
  // Battle win reward. `options` lets callers inject runtime-tunable economy config
  // (feature 013); when omitted it falls back to the static currency-config defaults.
  const base = Number.isFinite(options.base) ? options.base : BASE_WIN_REWARD;
  const multiplier = Number.isFinite(options.levelMultiplier)
    ? options.levelMultiplier
    : LEVEL_MULTIPLIER;
  const safeLevel = Math.max(MIN_LEVEL, Math.floor(Number(level) || MIN_LEVEL));
  const raw = base * (1 + multiplier * (safeLevel - MIN_LEVEL));
  return Math.round(raw);
}

function assertPositiveInteger(amount) {
  const number = Number(amount);
  if (!Number.isFinite(number) || number <= 0 || !Number.isInteger(number)) {
    throw new Error("Currency amount must be a positive integer.");
  }
  return number;
}

function creditCurrency(profile, amount) {
  const safeAmount = assertPositiveInteger(amount);
  if (!profile || typeof profile !== "object") {
    throw new Error("creditCurrency: profile is required.");
  }
  const current = normalizeCurrency(profile.currency);
  profile.currency = {
    balance: current.balance + safeAmount,
    totalEarned: current.totalEarned + safeAmount,
  };
  return profile;
}

function debitCurrency(profile, amount) {
  const safeAmount = assertPositiveInteger(amount);
  if (!profile || typeof profile !== "object") {
    throw new Error("debitCurrency: profile is required.");
  }
  const current = normalizeCurrency(profile.currency);
  const actualDebited = Math.min(safeAmount, current.balance);
  profile.currency = {
    balance: current.balance - actualDebited,
    totalEarned: current.totalEarned,
  };
  return actualDebited;
}

const SPEND_LOG_LIMIT = 200;

/**
 * Журнал списаний (024). Каждый потраченный внутри игры Point — это погашенное
 * требование к казне, и именно он уходит в еженедельное сжигание, поэтому трата
 * записывается рядом с балансом, в той же мутации профиля.
 *
 * Журнал обрезается сверху: он нужен игроку как история, а сумма к сжиганию
 * живёт отдельным счётчиком в состоянии токена.
 */
function recordSpend(profile, { points, reason, ref = null, at = null }) {
  const amount = Math.floor(Number(points) || 0);
  if (!profile || typeof profile !== "object" || amount <= 0) return profile;

  const log = Array.isArray(profile.spend) ? profile.spend : [];
  log.push({
    at: at || new Date().toISOString(),
    points: amount,
    reason: String(reason || "other"),
    ref: ref ? String(ref) : null,
    refunded: false,
  });
  profile.spend = log.slice(-SPEND_LOG_LIMIT);
  return profile;
}

// BEGIN format-coins-mirror
function formatCoins(value) {
  const n = Math.max(0, Math.floor(Number(value) || 0));
  if (n < FORMAT_ABBREV_THRESHOLD) {
    return String(n);
  }
  if (n < 1_000_000) {
    const truncatedTenths = Math.floor(n / 100) / 10;
    return truncatedTenths.toFixed(1) + "K";
  }
  if (n < 1_000_000_000) {
    const truncatedTenths = Math.floor(n / 100_000) / 10;
    return truncatedTenths.toFixed(1) + "M";
  }
  const truncatedTenths = Math.floor(n / 100_000_000) / 10;
  return truncatedTenths.toFixed(1) + "B";
}
// END format-coins-mirror

module.exports = {
  adjustCurrency,
  computeCoinReward,
  creditCurrency,
  debitCurrency,
  formatCoins,
  normalizeCurrency,
  recordSpend,
};
