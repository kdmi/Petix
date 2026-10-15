// Souls (031): a third in-game currency next to Points and energy.
// Souls never leave the game: no withdrawal, no conversion back. They come in by
// burning a pet (SOULS_PER_BURN_LEVEL per level, none at Lvl. 1) and by
// exchanging energy (SOULS_EXCHANGE_ENERGY → SOULS_EXCHANGE_SOULS). They go out on
// redistributing a pet's points (SOULS_RESPEC_PER_LEVEL per level).

const SOULS_PER_BURN_LEVEL_DEFAULT = 1000;
const SOULS_RESPEC_PER_LEVEL_DEFAULT = 3000;
const STATS = ["stamina", "agility", "strength", "intelligence"];

function fail(status, code, message, extra) {
  const error = new Error(message);
  error.httpStatus = status;
  error.httpCode = code;
  if (extra) Object.assign(error, extra);
  return error;
}

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
  // Owner 2026-10-14: no soul at Lvl. 1, otherwise "create a pet, burn it" farms souls for Points.
  // From Lvl. 2 it's the full level × per-level amount (Lvl. 2 = 2 000), easy to count.
  const lvl = Math.max(1, Math.floor(Number(level) || 1));
  return lvl < 2 ? 0 : lvl * perLevel;
}

// ---- energy → souls exchange --------------------------------------------------
// Owner 2026-10-15: 50 energy → 5 000 souls, from the header souls popup.
// Any energy counts, spent in the same order as a fight: today's free energy first
// (it burns at midnight anyway), then gifted, then bought. No unlimited-admin
// shortcut: an exchange needs real energy.

function exchangeOffer(cfg) {
  const energy = Math.max(1, toInt(cfg && cfg.SOULS_EXCHANGE_ENERGY != null ? cfg.SOULS_EXCHANGE_ENERGY : 50));
  const souls = toInt(cfg && cfg.SOULS_EXCHANGE_SOULS != null ? cfg.SOULS_EXCHANGE_SOULS : 5000);
  return { energy, souls };
}

/** All energy the wallet has right now: today's free + gifted + bought. */
function exchangeableEnergy(battleState, { now = new Date(), bonusEnergy = 0 } = {}) {
  return require("./battle-energy").normalizeBattleState(battleState, { now, bonusEnergy }).energyCurrent;
}

/** One exchange inside a profile write (mutates the profile). Throws 409 when there is not enough energy. */
function exchangeEnergyForSouls(profile, cfg, { now = new Date(), bonusEnergy = 0 } = {}) {
  const { consumeBattleEnergy } = require("./battle-energy");
  const offer = exchangeOffer(cfg);
  const have = exchangeableEnergy(profile.battleState, { now, bonusEnergy });
  if (have < offer.energy) {
    throw fail(409, "NOT_ENOUGH_ENERGY", `You need ${offer.energy} energy.`, { required: offer.energy, balance: have });
  }
  // wallet is left out on purpose: the unlimited-energy admin rule must not mint souls.
  profile.battleState = consumeBattleEnergy(profile.battleState, { now, amount: offer.energy, bonusEnergy });
  const soulsGained = creditSouls(profile, offer.souls);
  return { energySpent: offer.energy, soulsGained };
}

function debitSouls(profile, amount) {
  const cost = toInt(amount);
  const souls = normalizeSouls(profile.souls);
  if (souls.balance < cost) throw fail(402, "NOT_ENOUGH_SOULS", "Not enough souls.", { required: cost, balance: souls.balance });
  profile.souls = { ...souls, balance: souls.balance - cost };
  return cost;
}

/** Redistributing a pet's points: souls per pet level (owner 2026-10-15: 3 000 x level). */
function respecPrice(level, cfg) {
  const perLevel = cfg && cfg.SOULS_RESPEC_PER_LEVEL != null ? toInt(cfg.SOULS_RESPEC_PER_LEVEL) : SOULS_RESPEC_PER_LEVEL_DEFAULT;
  return Math.max(1, Math.floor(Number(level) || 1)) * perLevel;
}

/**
 * Redistribute a pet's points inside a profile write (mutates the profile).
 * The pet keeps its total: points in stats plus unspent ones can go to any
 * stat, and some may stay unspent. Charges souls; throws a 4xx error otherwise.
 */
function applyRespec(profile, petId, attributes, cfg, now = new Date()) {
  const pet = (profile.characters || []).find((c) => c && String(c.id) === String(petId || ""));
  if (!pet) throw fail(404, "NOT_FOUND", "Pet not found.");
  if (String(pet.status || "").toLowerCase() !== "completed") throw fail(400, "NOT_COMPLETED", "Only completed pets can be changed.");
  const next = {};
  for (const key of STATS) {
    const n = Number(attributes && attributes[key]);
    if (!Number.isInteger(n) || n < 0) throw fail(400, "BAD_ALLOCATION", "Each stat must be a whole number, 0 or more.");
    next[key] = n;
  }
  const was = pet.attributes || {};
  const current = (key) => toInt(was[key]);
  const spare = toInt(pet.attributePointsAvailable);
  const total = STATS.reduce((sum, key) => sum + current(key), 0) + spare;
  const used = STATS.reduce((sum, key) => sum + next[key], 0);
  if (used > total) throw fail(400, "BAD_ALLOCATION", `This pet has ${total} points in total.`, { required: total });
  if (STATS.every((key) => next[key] === current(key))) throw fail(400, "NOTHING_CHANGED", "Move at least one point first.");
  const price = respecPrice(pet.level, cfg);
  debitSouls(profile, price);
  pet.attributes = { ...was, ...next };
  pet.attributePointsAvailable = total - used;
  pet.updatedAt = now.toISOString();
  return { pet, price };
}

module.exports = {
  SOULS_PER_BURN_LEVEL_DEFAULT,
  SOULS_RESPEC_PER_LEVEL_DEFAULT,
  applyRespec,
  debitSouls,
  respecPrice,
  creditSouls,
  exchangeEnergyForSouls,
  exchangeOffer,
  exchangeableEnergy,
  normalizeSouls,
  soulsForBurn,
};
