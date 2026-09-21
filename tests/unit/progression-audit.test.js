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
  const battles = [
    battle("2026-09-20T10:00:00.000Z", snapshot(id, { level: 1, attrs: a(4, 4, 4, 3) })),
    battle("2026-09-20T10:05:00.000Z", snapshot(id, { level: 2, attrs: a(4, 4, 4, 3), available: 1 })),
    battle("2026-09-20T10:10:00.000Z", snapshot(id, { level: 2, attrs: a(5, 4, 4, 3) })),
  ];
  const character = pet(id, { level: 3, attrs: a(5, 5, 4, 3), available: 0 });

  assert.equal(auditPet({ wallet: WALLET, character, battles }), null);
});

test("a refunded point spent twice is found, counted and traced to the attribute", () => {
  const id = "char_exploit";
  const battles = [
    // level 6, one point earned and not spent yet
    battle("2026-09-20T16:40:00.000Z", snapshot(id, { level: 6, attrs: a(2, 0, 20, 0), available: 1 })),
    // the point went into stamina; the fight that follows refunds it
    battle("2026-09-20T16:44:00.000Z", snapshot(id, { level: 6, attrs: a(3, 0, 20, 0), available: 1 })),
    // and it is spent a second time — sum grew without a level
    battle("2026-09-20T16:46:00.000Z", snapshot(id, { level: 6, attrs: a(4, 0, 20, 0), available: 0 })),
  ];
  const character = pet(id, { level: 6, attrs: a(4, 0, 20, 0), available: 0, rarity: "Legendary" });

  const finding = auditPet({ wallet: WALLET, character, battles });

  assert.ok(finding, "the extra point must be detected");
  assert.equal(finding.extraSpent, 1);
  assert.equal(finding.extraUnspent, 0);
  assert.deepEqual(finding.corrections, { stamina: 1 }, "the phantom point is traced to stamina");
  assert.deepEqual(finding.attributesAfter, a(3, 0, 20, 0));
  assert.equal(finding.unattributed, 0);
});

test("a refund that was never spent is trimmed from the available points", () => {
  const id = "char_unspent";
  const battles = [
    battle("2026-09-20T12:00:00.000Z", snapshot(id, { level: 4, attrs: a(6, 6, 3, 3), available: 0 })),
    battle("2026-09-20T12:05:00.000Z", snapshot(id, { level: 4, attrs: a(6, 6, 3, 3), available: 0 })),
  ];
  // The pet never levelled again, yet it now claims two spare points.
  const character = pet(id, { level: 4, attrs: a(6, 6, 3, 3), available: 2 });

  const finding = auditPet({ wallet: WALLET, character, battles });

  assert.equal(finding.extraSpent, 0);
  assert.equal(finding.extraUnspent, 2);
  assert.equal(finding.availableAfter, 0);
  assert.deepEqual(finding.corrections, {}, "nothing to take off the attributes");
});

test("a burst of phantom points is split across the attributes that grew", () => {
  const id = "char_burst";
  const battles = [
    battle("2026-09-20T16:43:00.000Z", snapshot(id, { level: 6, attrs: a(2, 0, 20, 0), available: 0 })),
    // +11 attribute points across one level: 1 earned, 10 phantom
    battle("2026-09-20T16:48:00.000Z", snapshot(id, { level: 7, attrs: a(5, 6, 20, 2), available: 0 })),
  ];
  const character = pet(id, { level: 7, attrs: a(5, 6, 20, 2), available: 0, rarity: "Legendary" });

  const finding = auditPet({ wallet: WALLET, character, battles });

  assert.equal(finding.extraSpent, 10);
  const removed = Object.values(finding.corrections).reduce((sum, value) => sum + value, 0);
  assert.equal(removed, 10, "every phantom point must be taken back");
  // Agility grew the most (+6), so it gives back the most.
  assert.equal(finding.corrections.agility, 6);
  assert.equal(finding.attributesAfter.strength, 20, "untouched attributes stay untouched");
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
  const character = pet("char_fresh", { level: 1, attrs: a(4, 4, 4, 3), available: 0 });
  assert.equal(auditPet({ wallet: WALLET, character, battles: [] }), null);
});
