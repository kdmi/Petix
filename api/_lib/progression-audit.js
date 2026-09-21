const { getAttributePointBudget, normalizeAttributes } = require("./character");
const { normalizeProgression } = require("./battle-progression");

// Attribute-point forensics for the refund bug fixed on 2026-09-21.
//
// Until that fix a battle could hand back an upgrade point the player had
// already spent, so the same level could be cashed in several times. The
// damage is recoverable exactly, because every battle stores a snapshot of the
// pet as it was before the fight: level, all four attributes and the unspent
// points. Replaying those snapshots in order shows how many points the pet was
// entitled to and how many it actually spent — and, because each step also
// shows WHICH attributes grew, where the phantom points went.
//
// The ledger, per pet: points earned = one per level gained; points spent =
// growth of the attribute sum. Any spend beyond the earned balance is phantom.

const ATTRIBUTE_KEYS = ["stamina", "agility", "strength", "intelligence"];

function sumAttributes(attributes) {
  return ATTRIBUTE_KEYS.reduce((total, key) => total + Math.max(0, Math.floor(Number(attributes?.[key]) || 0)), 0);
}

function toSample(at, record) {
  const progression = normalizeProgression(record);
  return {
    at: at || null,
    level: progression.level,
    available: progression.attributePointsAvailable,
    attributes: normalizeAttributes(record?.attributes),
  };
}

/** Battle snapshots of one pet, oldest first, followed by its current record. */
function buildSamples({ petId, character, battles }) {
  const samples = [];

  for (const record of battles || []) {
    for (const side of ["attackerSnapshot", "defenderSnapshot"]) {
      const snapshot = record?.[side];
      if (!snapshot || String(snapshot.id) !== String(petId)) continue;
      // The snapshot is taken before the fight is resolved, so it is the state
      // the pet had when the player pressed Fight.
      samples.push(toSample(record.createdAt || record.completedAt, snapshot));
    }
  }

  samples.sort((left, right) => String(left.at || "").localeCompare(String(right.at || "")));
  samples.push(toSample(null, character));
  return samples;
}

// Takes `count` points back from the attributes that grew in this step,
// largest growth first — that is where the phantom points visibly landed.
function chargeBack(growth, count) {
  const taken = {};
  let left = count;
  const order = ATTRIBUTE_KEYS.filter((key) => growth[key] > 0).sort((a, b) => growth[b] - growth[a]);

  for (const key of order) {
    if (left <= 0) break;
    const take = Math.min(growth[key], left);
    taken[key] = (taken[key] || 0) + take;
    left -= take;
  }

  return { taken, unattributed: left };
}

/**
 * @returns {{petId, wallet, name, level, extraSpent, extraUnspent, corrections,
 *   attributesBefore, attributesAfter, availableBefore, availableAfter,
 *   unattributed, samples}|null} null when the pet's ledger is clean.
 */
function auditPet({ wallet, character, battles }) {
  const petId = String(character?.id || "");
  if (!petId) return null;

  const samples = buildSamples({ petId, character, battles });
  const current = samples[samples.length - 1];

  let legitAvailable = samples[0].available;
  const corrections = {};
  let extraSpent = 0;
  let unattributed = 0;

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const sample = samples[index];

    const levelsGained = Math.max(0, sample.level - previous.level);
    const spent = sumAttributes(sample.attributes) - sumAttributes(previous.attributes);
    const earned = legitAvailable + levelsGained;

    if (spent <= 0) {
      legitAvailable = earned;
      continue;
    }

    const phantom = Math.max(0, spent - earned);
    legitAvailable = Math.max(0, earned - spent);

    if (phantom > 0) {
      extraSpent += phantom;
      const growth = {};
      for (const key of ATTRIBUTE_KEYS) {
        growth[key] = Math.max(0, sample.attributes[key] - previous.attributes[key]);
      }
      const { taken, unattributed: leftover } = chargeBack(growth, phantom);
      for (const [key, value] of Object.entries(taken)) {
        corrections[key] = (corrections[key] || 0) + value;
      }
      unattributed += leftover;
    }
  }

  // Points the refund handed back that were never spent yet.
  const extraUnspent = Math.max(0, current.available - legitAvailable);

  // The timeline says WHERE the phantom points went; the invariant says HOW
  // MANY the pet may keep. Real data disagrees on nine pets out of 107 — a lost
  // level here, a purchase made outside any recorded battle window there — so
  // the removal is clamped to land the pet exactly on
  // `budget + (level - 1) - available`, never above it and never below.
  const availableAfter = Math.max(0, current.available - extraUnspent);
  const budget = getAttributePointBudget(character);
  const targetSum = Math.max(0, budget + (current.level - 1) - availableAfter);
  const removable = Math.max(0, sumAttributes(current.attributes) - targetSum);

  const attributesAfter = { ...current.attributes };
  let removed = 0;
  // 1. take what the timeline could attribute, in that order
  for (const [key, value] of Object.entries(corrections)) {
    const take = Math.min(value, Math.max(0, removable - removed), attributesAfter[key]);
    attributesAfter[key] -= take;
    removed += take;
  }
  // 2. anything the timeline could not place comes off the biggest attributes
  while (removed < removable) {
    const key = ATTRIBUTE_KEYS.slice().sort((a, b) => attributesAfter[b] - attributesAfter[a])[0];
    if (!attributesAfter[key]) break;
    attributesAfter[key] -= 1;
    removed += 1;
  }

  const appliedCorrections = {};
  for (const key of ATTRIBUTE_KEYS) {
    const delta = current.attributes[key] - attributesAfter[key];
    if (delta > 0) appliedCorrections[key] = delta;
  }

  // Nothing to take and nothing to trim: either the pet is clean, or it was
  // already corrected and only the old bursts are still visible in its
  // history. Reporting those would leave an operator chasing ghosts.
  if (!removed && !extraUnspent) return null;

  return {
    petId,
    wallet,
    name: character.name || character.displayName || character.creatureType || "Pet",
    rarity: character.rarity || null,
    level: current.level,
    extraSpent,
    extraUnspent,
    // What the ledger traced, and what will actually be taken after the clamp.
    tracedCorrections: corrections,
    corrections: appliedCorrections,
    removedPoints: removed,
    attributesBefore: current.attributes,
    attributesAfter,
    availableBefore: current.available,
    availableAfter,
    // Points we know are phantom but could not place on a specific attribute
    // (the growth happened outside any recorded battle window).
    unattributed,
    battleSamples: samples.length - 1,
  };
}

/** Cross-check: a clean pet satisfies sum(attributes) = budget + (level-1) - available. */
function checkInvariant(character, attributes, available) {
  const progression = normalizeProgression(character);
  const budget = getAttributePointBudget(character);
  const expected = budget + (progression.level - 1) - available;
  return { ok: sumAttributes(attributes) === expected, expected, actual: sumAttributes(attributes) };
}

function buildProgressionAudit({ characters = [], battles = [] }) {
  const battlesByPet = new Map();
  for (const record of battles) {
    for (const side of ["attackerSnapshot", "defenderSnapshot"]) {
      const id = String(record?.[side]?.id || "");
      if (!id) continue;
      if (!battlesByPet.has(id)) battlesByPet.set(id, []);
      battlesByPet.get(id).push(record);
    }
  }

  const findings = [];
  for (const entry of characters) {
    const character = entry?.character;
    if (!character || character.status !== "completed") continue;

    const finding = auditPet({
      wallet: entry.wallet,
      character,
      battles: battlesByPet.get(String(character.id)) || [],
    });
    if (!finding) continue;

    const before = checkInvariant(character, finding.attributesBefore, finding.availableBefore);
    const after = checkInvariant(character, finding.attributesAfter, finding.availableAfter);
    findings.push({ ...finding, invariantBefore: before, invariantAfter: after });
  }

  findings.sort((left, right) => right.extraSpent + right.extraUnspent - (left.extraSpent + left.extraUnspent));

  return {
    checkedPets: characters.filter((entry) => entry?.character?.status === "completed").length,
    checkedBattles: battles.length,
    affectedPets: findings.length,
    affectedWallets: new Set(findings.map((finding) => finding.wallet)).size,
    extraPointsSpent: findings.reduce((total, finding) => total + finding.extraSpent, 0),
    extraPointsUnspent: findings.reduce((total, finding) => total + finding.extraUnspent, 0),
    unplaceablePoints: findings.reduce((total, finding) => total + finding.unattributed, 0),
    // A correction is only safe to apply when the pet lands back on the
    // invariant; anything else is reported and left alone.
    applicable: findings.filter((finding) => finding.invariantAfter.ok).length,
    findings,
  };
}

module.exports = {
  ATTRIBUTE_KEYS,
  auditPet,
  buildProgressionAudit,
  checkInvariant,
  sumAttributes,
};
