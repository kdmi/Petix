const test = require("node:test");
const assert = require("node:assert/strict");

const { buildProgressionAudit, auditPet } = require("../../api/_lib/progression-audit");

// Forensics for the refund bug (fixed 2026-09-21): replay the snapshots every
// battle leaves behind and separate the points a pet earned from the points a
// refund handed back.

const WALLET = "w".repeat(32);

function snapshot(id, { level, attrs, available = 0 }) {
  return {
    id,
    level,
    attributePointsAvailable: available,
    attributes: attrs,
  };
}

function battle(at, attackerSnap, defenderSnap = snapshot("other_pet", { level: 1, attrs: a(1, 1, 1, 1) })) {
  return {
    id: `battle_${at}`,
    createdAt: at,
    completedAt: at,
    attackerSnapshot: attackerSnap,
    defenderSnapshot: defenderSnap,
  };
}

function a(stamina, agility, strength, intelligence) {
  return { stamina, agility, strength, intelligence };
}

// Budgets come from the rarity rules (Rare 12, Legendary 15); the fixtures keep
// sum(attributes) = budget + (level - 1) - available for clean play.
function pet(id, { level, attrs, available = 0, rarity = "Rare" }) {
  return {
    id,
    status: "completed",
    rarity,
    name: "Fixture",
    level,
    experience: 0,
    attributePointsAvailable: available,
    attributes: attrs,
  };
}

test("clean play produces no findings", () => {
  const id = "char_clean";
  // Rare budget 12: level 1 spends 12, and each level adds exactly one point.
  const battles = [
    battle("2026-09-20T10:00:00.000Z", snapshot(id, { level: 1, attrs: a(3, 3, 3, 3) })),
    battle("2026-09-20T10:05:00.000Z", snapshot(id, { level: 2, attrs: a(3, 3, 3, 3), available: 1 })),
    battle("2026-09-20T10:10:00.000Z", snapshot(id, { level: 2, attrs: a(4, 3, 3, 3) })),
  ];
  const character = pet(id, { level: 3, attrs: a(4, 4, 3, 3), available: 0 });

  assert.equal(auditPet({ wallet: WALLET, character, battles }), null);
});

test("a refunded point spent twice is found, counted and traced to the attribute", () => {
  const id = "char_exploit";
  // Legendary budget is 15, so at level 6 the pet may hold 20 points across
  // its attributes and unspent pool: 19 spent + 1 in hand here.
  const battles = [
    battle("2026-09-20T16:40:00.000Z", snapshot(id, { level: 6, attrs: a(2, 0, 17, 0), available: 1 })),
    // the point went into stamina, and the fight that followed refunded it
    battle("2026-09-20T16:44:00.000Z", snapshot(id, { level: 6, attrs: a(3, 0, 17, 0), available: 1 })),
    // spent a second time: the sum grew again without a level
    battle("2026-09-20T16:46:00.000Z", snapshot(id, { level: 6, attrs: a(4, 0, 17, 0), available: 0 })),
  ];
  const character = pet(id, { level: 6, attrs: a(4, 0, 17, 0), available: 0, rarity: "Legendary" });

  const finding = auditPet({ wallet: WALLET, character, battles });

  assert.ok(finding, "the extra point must be detected");
  assert.equal(finding.extraSpent, 1);
  assert.equal(finding.extraUnspent, 0);
  assert.deepEqual(finding.corrections, { stamina: 1 }, "the phantom point is traced to stamina");
  assert.deepEqual(finding.attributesAfter, a(3, 0, 17, 0));
  assert.equal(finding.unattributed, 0);
});

test("a refund that was never spent is trimmed from the available points", () => {
  const id = "char_unspent";
  // Rare budget 12, level 4: three earned points, all three spent → sum 15.
  const battles = [
    battle("2026-09-20T12:00:00.000Z", snapshot(id, { level: 4, attrs: a(5, 4, 3, 3), available: 0 })),
    battle("2026-09-20T12:05:00.000Z", snapshot(id, { level: 4, attrs: a(5, 4, 3, 3), available: 0 })),
  ];
  // The pet never levelled again, yet it now claims two spare points.
  const character = pet(id, { level: 4, attrs: a(5, 4, 3, 3), available: 2 });

  const finding = auditPet({ wallet: WALLET, character, battles });

  assert.equal(finding.extraSpent, 0);
  assert.equal(finding.extraUnspent, 2);
  assert.equal(finding.availableAfter, 0);
  assert.deepEqual(finding.corrections, {}, "nothing to take off the attributes");
  assert.equal(finding.invariantAfter?.ok ?? true, true);
});

test("a burst of phantom points is split across the attributes that grew", () => {
  const id = "char_burst";
  const battles = [
    battle("2026-09-20T16:43:00.000Z", snapshot(id, { level: 6, attrs: a(2, 0, 18, 0), available: 0 })),
    // +11 attribute points across one level: 1 earned, 10 phantom
    battle("2026-09-20T16:48:00.000Z", snapshot(id, { level: 7, attrs: a(5, 6, 18, 2), available: 0 })),
  ];
  const character = pet(id, { level: 7, attrs: a(5, 6, 18, 2), available: 0, rarity: "Legendary" });

  const finding = auditPet({ wallet: WALLET, character, battles });

  assert.equal(finding.extraSpent, 10);
  assert.equal(finding.removedPoints, 10, "every phantom point must be taken back");
  // Agility grew the most (+6), so it gives back the most.
  assert.equal(finding.corrections.agility, 6);
  assert.equal(finding.attributesAfter.strength, 18, "untouched attributes stay untouched");
  assert.equal(
    Object.values(finding.attributesAfter).reduce((sum, value) => sum + value, 0),
    Object.values(finding.attributesBefore).reduce((sum, value) => sum + value, 0) - 10
  );
});

test("the report only marks a pet applicable when the correction restores the invariant", () => {
  const cleanId = "char_ok";
  const dirtyId = "char_dirty";
  // Rare budget is 12, so a clean level-3 pet has spent 14 points.
  const characters = [
    { wallet: WALLET, character: pet(cleanId, { level: 3, attrs: a(4, 4, 3, 3), available: 0 }) },
    { wallet: WALLET, character: pet(dirtyId, { level: 3, attrs: a(7, 4, 3, 3), available: 0 }) },
  ];
  const battles = [
    battle("2026-09-20T09:00:00.000Z", snapshot(cleanId, { level: 1, attrs: a(3, 3, 3, 3) })),
    battle("2026-09-20T09:10:00.000Z", snapshot(cleanId, { level: 2, attrs: a(4, 3, 3, 3) })),
    battle("2026-09-20T09:00:00.000Z", snapshot(dirtyId, { level: 1, attrs: a(3, 3, 3, 3) })),
    battle("2026-09-20T09:10:00.000Z", snapshot(dirtyId, { level: 2, attrs: a(4, 3, 3, 3) })),
  ];

  const report = buildProgressionAudit({ characters, battles });

  assert.equal(report.affectedPets, 1, "only the pet with phantom points is listed");
  const finding = report.findings[0];
  assert.equal(finding.petId, dirtyId);
  assert.equal(finding.extraSpent, 3, "three points beyond the two levels it earned");
  assert.deepEqual(finding.attributesAfter, a(4, 4, 3, 3));
  assert.equal(finding.invariantBefore.ok, false);
  assert.equal(finding.invariantAfter.ok, true, "the fixed pet must satisfy budget + levels - available");
  assert.equal(report.applicable, 1);
  assert.equal(report.extraPointsSpent, finding.extraSpent);
});

test("pets that never fought are left alone", () => {
  // Common budget 10, freshly created and never in a fight.
  const character = pet("char_fresh", { level: 1, attrs: a(3, 3, 2, 2), available: 0, rarity: "Common" });
  assert.equal(auditPet({ wallet: WALLET, character, battles: [] }), null);
});

test("overspend the battle history cannot explain is still corrected", () => {
  // Production case (Pixel Drop): the pet holds one point more than its budget
  // allows, but every recorded fight shows the same numbers — the purchase
  // happened in a gap between battles, so the ledger has nothing to trace.
  const id = "char_invisible";
  const battles = [
    battle("2026-09-21T03:00:00.000Z", snapshot(id, { level: 3, attrs: a(5, 3, 3, 1), available: 1 })),
    battle("2026-09-21T03:30:00.000Z", snapshot(id, { level: 3, attrs: a(5, 3, 3, 1), available: 1 })),
    // (the same numbers in every fight — nothing for the ledger to catch)
  ];
  // Common budget 10: at level 3 with one point in hand it may hold 11.
  const character = pet(id, { level: 3, attrs: a(5, 3, 3, 1), available: 1, rarity: "Common" });

  const finding = auditPet({ wallet: WALLET, character, battles });

  assert.ok(finding, "a pet over its budget must be reported even without ledger evidence");
  assert.equal(finding.extraSpent, 0, "the ledger saw nothing");
  assert.equal(finding.removedPoints, 1, "the invariant still says one point too many");
  assert.equal(finding.attributesAfter.stamina, 4, "it comes off the biggest attribute");
});

test("the removal is clamped to the invariant, whichever way the ledger leans", () => {
  // Case 1: the ledger blames more points than the pet is actually over by —
  // a level lost to an earlier stale write. Only the real excess comes off.
  const overId = "char_over";
  const overBattles = [
    battle("2026-09-20T08:00:00.000Z", snapshot(overId, { level: 2, attrs: a(4, 3, 3, 3) })),
    battle("2026-09-20T08:30:00.000Z", snapshot(overId, { level: 2, attrs: a(9, 3, 3, 3) })),
  ];
  // Rare budget 12 at level 3 → the pet may hold 14 points; it holds 18.
  const over = pet(overId, { level: 3, attrs: a(9, 3, 3, 3), available: 0 });
  const overFinding = auditPet({ wallet: WALLET, character: over, battles: overBattles });

  assert.ok(overFinding.extraSpent >= 4, "the ledger sees the whole burst");
  assert.equal(overFinding.removedPoints, 4, "but only four points are actually over the budget");
  assert.equal(
    Object.values(overFinding.attributesAfter).reduce((sum, value) => sum + value, 0),
    14
  );

  // Case 2: part of the growth happened outside any recorded battle, so the
  // ledger can place less than the pet owes; the rest comes off the biggest
  // attribute rather than being quietly left behind.
  const underId = "char_under";
  const underBattles = [
    battle("2026-09-20T08:00:00.000Z", snapshot(underId, { level: 1, attrs: a(3, 3, 3, 3) })),
  ];
  const under = pet(underId, { level: 1, attrs: a(3, 2, 6, 2), available: 0, rarity: "Common" });
  const underFinding = auditPet({ wallet: WALLET, character: under, battles: underBattles });

  // Common budget 10 at level 1: the pet holds 13.
  assert.equal(underFinding.removedPoints, 3);
  assert.equal(
    Object.values(underFinding.attributesAfter).reduce((sum, value) => sum + value, 0),
    10
  );
  assert.equal(underFinding.attributesAfter.strength, 3, "the biggest attribute gives the rest back");
});
