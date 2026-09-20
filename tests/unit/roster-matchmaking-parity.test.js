const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildRevealOpponentCandidates,
  getPreviewOpponentCandidates,
  selectAuthoritativeOpponent,
} = require("../../api/_lib/battle-matchmaking");
const { serializeBattlePreviewCandidate } = require("../../api/_lib/battle");
const { buildRosterEntry } = require("../../api/_lib/roster");

// SC-005: switching matchmaking from full profile records to roster entries
// must not change WHO gets picked or HOW the reveal cards look. Same fixtures,
// both inputs, identical output.

// Not 0x-shaped on purpose — the repo forbids committing addresses (019).
function wallet(index) {
  return `parity-wallet-${String(index).padStart(3, "0")}`;
}

function fullCharacter(index, level) {
  return {
    id: `pet_${index}`,
    status: "completed",
    name: `Pet ${index}`,
    displayName: `Pet ${index}`,
    creatureType: index % 2 ? "Panda" : "Fox",
    rarity: index % 3 === 0 ? "Legendary" : "Common",
    level,
    experience: 120,
    attributes: { stamina: 5, agility: 5, strength: 5, intelligence: 5 },
    powers: [{ id: `pw_${index}`, name: `Power ${index}`, description: "Boom" }],
    selectedPowerId: `pw_${index}`,
    image: { provider: "gemini", url: `https://example.test/pet_${index}.png` },
    completedAt: new Date(1780000000000 + index * 1000).toISOString(),
    updatedAt: new Date(1780000000000 + index * 2000).toISOString(),
  };
}

// A spread of levels around the attacker so both the preferred band and the
// lower-level fallback are exercised.
const LEVELS = [7, 6, 9, 4, 12, 2, 7, 15, 5, 8, 3, 7];

function buildFixtures() {
  const fullCandidates = LEVELS.map((level, index) => ({
    wallet: wallet(index + 1),
    character: fullCharacter(index + 1, level),
  }));
  const rosterCandidates = fullCandidates
    .map((entry) => buildRosterEntry(entry.wallet, entry.character))
    .filter(Boolean);

  const attacker = {
    wallet: wallet(999),
    character: fullCharacter(999, 7),
  };

  return { attacker, fullCandidates, rosterCandidates };
}

const alwaysFirst = () => 0;

test("the selected opponent is the same from full records and from roster entries", () => {
  const { attacker, fullCandidates, rosterCandidates } = buildFixtures();

  assert.equal(rosterCandidates.length, fullCandidates.length, "every fixture must be indexable");

  const fromFull = selectAuthoritativeOpponent({
    attacker,
    candidates: fullCandidates,
    randomIndex: alwaysFirst,
  });
  const fromRoster = selectAuthoritativeOpponent({
    attacker,
    candidates: rosterCandidates,
    randomIndex: alwaysFirst,
  });

  assert.equal(fromRoster.opponent.character.id, fromFull.opponent.character.id);
  assert.equal(fromRoster.opponent.wallet, fromFull.opponent.wallet);
  assert.deepEqual(fromRoster.matchmaking, fromFull.matchmaking);
});

test("the preview list matches card for card", () => {
  const { attacker, fullCandidates, rosterCandidates } = buildFixtures();

  const fromFull = getPreviewOpponentCandidates({ attacker, candidates: fullCandidates, limit: 10 })
    .map((entry) => serializeBattlePreviewCandidate(entry));
  const fromRoster = getPreviewOpponentCandidates({
    attacker,
    candidates: rosterCandidates,
    limit: 10,
  }).map((entry) => serializeBattlePreviewCandidate(entry));

  assert.ok(fromFull.length > 1, "the fixture must produce a real list");
  assert.deepEqual(fromRoster, fromFull);
});

test("the reveal carousel matches", () => {
  const { attacker, fullCandidates, rosterCandidates } = buildFixtures();

  const selectedFull = selectAuthoritativeOpponent({
    attacker,
    candidates: fullCandidates,
    randomIndex: alwaysFirst,
  }).opponent;
  const selectedRoster = selectAuthoritativeOpponent({
    attacker,
    candidates: rosterCandidates,
    randomIndex: alwaysFirst,
  }).opponent;

  const fromFull = buildRevealOpponentCandidates({
    attacker,
    candidates: fullCandidates,
    selectedOpponent: selectedFull,
    limit: 6,
  }).map((entry) => serializeBattlePreviewCandidate(entry));
  const fromRoster = buildRevealOpponentCandidates({
    attacker,
    candidates: rosterCandidates,
    selectedOpponent: selectedRoster,
    limit: 6,
  }).map((entry) => serializeBattlePreviewCandidate(entry));

  assert.deepEqual(fromRoster, fromFull);
});

test("a pet without a selected power is ignored by both paths", () => {
  const { attacker, fullCandidates } = buildFixtures();
  const powerless = {
    wallet: wallet(500),
    character: { ...fullCharacter(500, 7), powers: [], selectedPowerId: "" },
  };

  const full = getPreviewOpponentCandidates({
    attacker,
    candidates: fullCandidates.concat(powerless),
    limit: 20,
  }).map((entry) => entry.character.id);

  const rosterEntry = buildRosterEntry(powerless.wallet, powerless.character);
  const roster = getPreviewOpponentCandidates({
    attacker,
    candidates: fullCandidates
      .map((entry) => buildRosterEntry(entry.wallet, entry.character))
      .concat(rosterEntry ? [rosterEntry] : []),
    limit: 20,
  }).map((entry) => entry.character.id);

  assert.ok(!full.includes("pet_500"));
  assert.deepEqual(roster, full);
});
