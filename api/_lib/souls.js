// Souls (031): a third in-game currency next to Points and energy.
// Souls never leave the game: no withdrawal, no conversion back. For now they
// only come in, by burning a pet: 1 000 souls per pet level (SOULS_PER_BURN_LEVEL).

const SOULS_PER_BURN_LEVEL_DEFAULT = 1000;

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function normalizeSouls(raw) {
  if (!raw || typeof raw !== "object") return { balance: 0, totalEarned: 0 };
  return { balance: toInt(raw.balance), totalEarned: toInt(raw.totalEarned) };
}

function creditSouls(profile, amount) {
  const add = toInt(amount);
  const souls = normalizeSouls(profile.souls);
  profile.souls = { balance: souls.balance + add, totalEarned: souls.totalEarned + add };
  return add;
}

function soulsForBurn(level, cfg) {
  const perLevel = cfg && cfg.SOULS_PER_BURN_LEVEL != null ? toInt(cfg.SOULS_PER_BURN_LEVEL) : SOULS_PER_BURN_LEVEL_DEFAULT;
  return Math.max(1, Math.floor(Number(level) || 1)) * perLevel;
}

module.exports = { SOULS_PER_BURN_LEVEL_DEFAULT, creditSouls, normalizeSouls, soulsForBurn };
