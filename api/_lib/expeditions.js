// Expeditions (026): attempt lifecycle, wild-pet fill, server-side replay and
// payouts. Pure functions over the wallet profile where possible so the route
// handlers stay thin and the whole thing is unit-testable without storage.
const crypto = require("crypto");
const E = require("../../assets/expeditions/engine.js");
const { creditCurrency, debitCurrency, normalizeCurrency, recordSpend } = require("./currency");
const { consumeBattleEnergy, normalizeBattleState } = require("./battle-energy");
const { attemptGate, getBoss, rulesFromConfig } = require("./expeditions-config");
const { buildCharacterImageUrl } = require("./character");

const MAX_OWN_PETS = 4; // squad slots on the board (engine SLOTS)
const WILD_COUNT = 1; // one wild pet always joins as the 5th tile colour
const MAX_MOVES = 300;
const ATTEMPT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SEED = 2 ** 31 - 1;

function fail(status, code, message, extra) {
  const error = new Error(message);
  error.httpStatus = status;
  error.httpCode = code;
  if (extra) Object.assign(error, extra);
  return error;
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomSeed() {
  return crypto.randomInt(1, MAX_SEED);
}

function newAttemptId() {
  return crypto.randomUUID();
}

/** Frozen copy of what the engine needs from an own pet — the fight uses this even if the pet changes later. */
function snapshotPet(character) {
  const attrs = character?.attributes || {};
  return {
    id: String(character.id),
    name: character.name || character.displayName || "Pet",
    level: Math.max(1, Math.floor(Number(character.level) || 1)),
    stamina: Number(attrs.stamina) || 0,
    strength: Number(attrs.strength) || 0,
    agility: Number(attrs.agility) || 0,
    intelligence: Number(attrs.intelligence) || 0,
    img: buildCharacterImageUrl(character) || character.imageUrl || null,
  };
}

/** Wild pets are tiles only (weak hits, no ring): name + picture is all the engine reads. */
function snapshotWild(entry) {
  const c = entry.character || entry;
  return {
    id: `wild:${entry.wallet || "?"}:${c.id}`,
    name: c.name || c.displayName || "Wild pet",
    img: c.imageUrl || null,
  };
}

/** Deterministic pick (by seed) of `count` roster pets that are not the player's. */
function pickWildPets(rosterEntries, ownWallet, count, seed) {
  const owner = String(ownWallet || "").toLowerCase();
  const pool = (rosterEntries || []).filter(
    (entry) => entry && entry.character && entry.character.status === "completed" && String(entry.wallet || "").toLowerCase() !== owner
  );
  const rng = mulberry32(seed);
  const picked = [];
  const used = new Set();
  while (picked.length < count && used.size < pool.length) {
    const i = Math.floor(rng() * pool.length);
    if (used.has(i)) continue;
    used.add(i);
    picked.push(snapshotWild(pool[i]));
  }
  return picked;
}

function progressOf(profile, bossIndex) {
  const existing = profile?.expeditions?.progress?.[bossIndex];
  return {
    bestStars: Math.max(0, Math.floor(Number(existing?.bestStars) || 0)),
    attempts: Math.max(0, Math.floor(Number(existing?.attempts) || 0)),
    wins: Math.max(0, Math.floor(Number(existing?.wins) || 0)),
    forfeits: Math.max(0, Math.floor(Number(existing?.forfeits) || 0)),
    paidStars: Array.isArray(existing?.paidStars) ? existing.paidStars.map(Number).filter((n) => n >= 1 && n <= 3) : [],
    feesPaid: Math.max(0, Math.floor(Number(existing?.feesPaid) || 0)),
    rewardsPaid: Math.max(0, Math.floor(Number(existing?.rewardsPaid) || 0)),
    stars3: Math.max(0, Math.floor(Number(existing?.stars3) || 0)),
    nft: existing?.nft && typeof existing.nft === "object" ? { ...existing.nft } : null,
    lastResult: existing?.lastResult && typeof existing.lastResult === "object" ? { ...existing.lastResult } : null,
  };
}

// Per-wallet daily counters (last 8 days) so the admin stats can answer
// "today / 7 days" without a hot shared document.
const DAILY_KEEP_DAYS = 8;
function dayKey(now) { return new Date(now).toISOString().slice(0, 10); }
function bumpDaily(profile, now, patch) {
  const x = profile.expeditions;
  const daily = x.daily && typeof x.daily === "object" ? x.daily : {};
  const key = dayKey(now);
  const day = daily[key] || { attempts: 0, fees: 0, rewards: 0, wins: 0, stars3: 0, forfeits: 0 };
  for (const [k, v] of Object.entries(patch)) day[k] = (Number(day[k]) || 0) + v;
  daily[key] = day;
  const keys = Object.keys(daily).sort();
  while (keys.length > DAILY_KEEP_DAYS) delete daily[keys.shift()];
  x.daily = daily;
}

function bestStarsMap(profile) {
  const out = {};
  for (const [key, value] of Object.entries(profile?.expeditions?.progress || {})) {
    out[key] = { bestStars: Math.max(0, Math.floor(Number(value?.bestStars) || 0)) };
  }
  return out;
}

function isAttemptStale(attempt, now = Date.now()) {
  const started = Date.parse(attempt?.startedAt || "");
  return !Number.isFinite(started) || now - started > ATTEMPT_TTL_MS;
}

/** Close the active attempt as forfeited (no refund). Mutates `profile`. */
function forfeitActive(profile, { now = new Date() } = {}) {
  const active = profile.expeditions.active;
  if (!active) return null;
  const progress = progressOf(profile, active.bossIndex);
  progress.forfeits += 1;
  bumpDaily(profile, now, { forfeits: 1 });
  progress.lastResult = { attemptId: active.attemptId, status: "forfeited", at: now.toISOString(), stars: 0, won: false };
  profile.expeditions.progress[active.bossIndex] = progress;
  profile.expeditions.active = null;
  return active;
}

/**
 * Validate the request and mutate the profile for a new attempt: forfeit the
 * old one, spend energy + fee, store the attempt. Throws `fail(...)` errors
 * (which abort the profile write when used inside updateWalletProfile).
 */
function startAttempt(profile, { wallet, bossIndex, squadIds, cfg, rosterEntries, bonusEnergy = 0, now = new Date(), seed = randomSeed(), attemptId = newAttemptId() }) {
  const index = Math.floor(Number(bossIndex));
  const boss = getBoss(index);
  if (!boss) throw fail(400, "BOSS_UNKNOWN", "Unknown boss.");
  const gate = attemptGate(cfg, bestStarsMap(profile), index);
  if (!gate.ok) throw fail(gate.code === "BOSS_HIDDEN" ? 404 : 403, gate.code, gate.code === "BOSS_HIDDEN" ? "This boss is not open yet." : "Beat the previous boss first.", { bossIndex: index });

  const ids = Array.isArray(squadIds) ? squadIds.map((id) => String(id || "").trim()).filter(Boolean) : [];
  if (ids.length < 1 || ids.length > MAX_OWN_PETS) throw fail(400, "SQUAD_SIZE", `Pick 1 to ${MAX_OWN_PETS} pets.`);
  if (new Set(ids).size !== ids.length) throw fail(400, "SQUAD_DUPLICATE", "A pet can join the squad once.");
  const own = ids.map((id) => (profile.characters || []).find((c) => c && String(c.id) === id && c.status === "completed"));
  if (own.some((c) => !c)) throw fail(400, "SQUAD_INVALID", "Pick pets from your own roster.");

  const rules = rulesFromConfig(cfg);
  const fee = E.entryFee(index, progressOf(profile, index).bestStars, rules);
  const energyPerAttempt = Math.max(0, Math.floor(Number(cfg?.EXPEDITION_ENERGY_PER_ATTEMPT) || 0));

  // Energy first, then Points — the squad modal shows the same priority.
  let nextBattleState = normalizeBattleState(profile.battleState, { now, bonusEnergy });
  if (energyPerAttempt > 0) {
    try {
      nextBattleState = consumeBattleEnergy(profile.battleState, { now, amount: energyPerAttempt, wallet, bonusEnergy });
    } catch (error) {
      throw fail(400, "NOT_ENOUGH_ENERGY", "Not enough energy.", { energy: nextBattleState.energyCurrent });
    }
  }
  const balance = normalizeCurrency(profile.currency).balance;
  if (fee > balance) throw fail(400, "NOT_ENOUGH_POINTS", "Not enough Points.", { fee, points: balance });

  forfeitActive(profile, { now });

  profile.battleState = nextBattleState;
  if (fee > 0) {
    debitCurrency(profile, fee);
    recordSpend(profile, { points: fee, reason: "expedition", ref: attemptId, at: now.toISOString() });
  }

  const wildsNeeded = MAX_OWN_PETS - own.length + WILD_COUNT;
  const attempt = {
    attemptId,
    bossIndex: index,
    seed: Math.max(1, Math.floor(Number(seed)) || 1),
    squad: own.map(snapshotPet),
    wilds: pickWildPets(rosterEntries, wallet, wildsNeeded, seed),
    fee,
    energySpent: energyPerAttempt,
    startedAt: now.toISOString(),
    status: "active",
  };
  // Re-read after forfeitActive(): it may have bumped this boss's counters.
  const progress = progressOf(profile, index);
  progress.attempts += 1;
  progress.feesPaid = (Number(progress.feesPaid) || 0) + fee;
  profile.expeditions.progress[index] = progress;
  profile.expeditions.active = attempt;
  bumpDaily(profile, now, { attempts: 1, fees: fee });
  return attempt;
}

function engineBoss(index) {
  const boss = getBoss(index);
  return { name: boss.title, img: boss.img, hp: boss.hp, power: boss.power, shields: boss.shields, par: boss.par };
}

/**
 * Re-run the client's moves on the server. Every move is checked the way the
 * board would check it: a swap must be between neighbours and produce a match,
 * a HIT needs a full ring. Returns the finished engine state; throws
 * INVALID_MOVES otherwise. Deterministic: same seed + moves → same result.
 */
function replayMoves(attempt, moves) {
  if (!Array.isArray(moves)) throw fail(400, "INVALID_MOVES", "Moves must be an array.");
  if (moves.length > MAX_MOVES) throw fail(400, "INVALID_MOVES", "Too many moves.");
  const state = E.createBattle({ squad: attempt.squad, wilds: attempt.wilds, boss: engineBoss(attempt.bossIndex), seed: attempt.seed });
  const cells = E.SIZE * E.SIZE;
  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    if (state.over) throw fail(400, "INVALID_MOVES", `Move ${i} after the battle ended.`);
    if (move && Number.isInteger(move.hit)) {
      const pet = state.squad[move.hit];
      if (!pet || pet.mercenary || pet.charge < E.CHARGE_MAX) throw fail(400, "INVALID_MOVES", `Move ${i}: HIT without a full ring.`);
      E.useAbility(state, move.hit);
      continue;
    }
    const a = move && Number.isInteger(move.a) ? move.a : -1;
    const b = move && Number.isInteger(move.b) ? move.b : -1;
    if (a < 0 || b < 0 || a >= cells || b >= cells || !E.canSwap(state, a, b)) throw fail(400, "INVALID_MOVES", `Move ${i}: illegal swap.`);
    E.playMove(state, a, b);
  }
  return state;
}

/** Result record derived from a finished (or abandoned) engine state. */
function resultOf(state, { forfeit = false } = {}) {
  if (forfeit || !state.over) {
    return { won: false, stars: 0, moves: state ? state.moves : 0, hpPct: state ? Math.round((state.team.hp / state.team.maxHp) * 100) : 0, finished: false };
  }
  const o = state.over;
  return { won: o.won, stars: o.stars, moves: o.moves, par: o.par, hpPct: o.hpPct, bestChain: o.bestChain, supers: o.supers, totalDamage: o.totalDamage, finished: true };
}

/**
 * Apply a finished attempt to the profile: pay the star tiers not paid before,
 * update the best result, clear the active attempt. Idempotent on attemptId:
 * a second settle of the same attempt returns the stored outcome unchanged.
 */
function settleAttempt(profile, attempt, result, cfg, { now = new Date() } = {}) {
  const index = attempt.bossIndex;
  const progress = progressOf(profile, index);
  if (progress.lastResult && progress.lastResult.attemptId === attempt.attemptId) {
    return { paid: progress.lastResult.paid || 0, progress, alreadySettled: true };
  }
  const rules = rulesFromConfig(cfg);
  const stars = result.won ? result.stars : 0;
  let paid = 0;
  const paidNow = [];
  for (let tier = 1; tier <= stars; tier++) {
    if (progress.paidStars.includes(tier)) continue;
    const amount = E.rewardTier(index, tier, rules);
    if (amount > 0) creditCurrency(profile, amount);
    paid += amount;
    paidNow.push(tier);
    progress.paidStars.push(tier);
  }
  progress.paidStars.sort();
  if (result.won) progress.wins += 1;
  if (stars >= 3) progress.stars3 += 1;
  progress.rewardsPaid += paid;
  progress.bestStars = Math.max(progress.bestStars, stars);
  if (!result.finished) progress.forfeits += 1; // explicit forfeit (reload without moves, Back during the fight)
  bumpDaily(profile, now, { rewards: paid, wins: result.won ? 1 : 0, stars3: stars >= 3 ? 1 : 0, forfeits: result.finished ? 0 : 1 });
  progress.lastResult = { attemptId: attempt.attemptId, status: result.finished ? "finished" : "forfeited", at: now.toISOString(), won: result.won, stars, paid, paidNow, moves: result.moves, hpPct: result.hpPct };
  profile.expeditions.progress[index] = progress;
  if (profile.expeditions.active && profile.expeditions.active.attemptId === attempt.attemptId) profile.expeditions.active = null;
  return { paid, paidNow, progress, alreadySettled: false };
}

/** Public shape of an attempt for the client (what it needs to render and play). */
function attemptView(attempt) {
  if (!attempt) return null;
  return {
    attemptId: attempt.attemptId,
    bossIndex: attempt.bossIndex,
    seed: attempt.seed,
    squad: attempt.squad,
    wilds: attempt.wilds,
    fee: attempt.fee,
    startedAt: attempt.startedAt,
  };
}

module.exports = {
  ATTEMPT_TTL_MS,
  DAILY_KEEP_DAYS,
  dayKey,
  MAX_MOVES,
  MAX_OWN_PETS,
  WILD_COUNT,
  attemptView,
  bestStarsMap,
  engineBoss,
  fail,
  forfeitActive,
  isAttemptStale,
  pickWildPets,
  progressOf,
  replayMoves,
  resultOf,
  settleAttempt,
  snapshotPet,
  startAttempt,
};
