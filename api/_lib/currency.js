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
  return {
    balance: toSafeInteger(raw.balance, 0),
    totalEarned: toSafeInteger(raw.totalEarned, 0),
  };
}

function computeCoinReward(level) {
  const safeLevel = Math.max(MIN_LEVEL, Math.floor(Number(level) || MIN_LEVEL));
  const raw = BASE_WIN_REWARD * (1 + LEVEL_MULTIPLIER * (safeLevel - MIN_LEVEL));
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
  computeCoinReward,
  creditCurrency,
  debitCurrency,
  formatCoins,
  normalizeCurrency,
};
