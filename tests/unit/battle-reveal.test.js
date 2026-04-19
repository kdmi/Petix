const test = require("node:test");
const assert = require("node:assert/strict");

const { buildBattleRevealBundle } = require("../../api/_lib/battle");
const { buildRevealOpponentCandidates } = require("../../api/_lib/battle-matchmaking");

function createParticipant(wallet, id, level, updatedAt) {
  return {
    wallet,
    character: {
      id,
      status: "completed",
      creatureType: "Arena Cub",
      rarity: "Rare",
      name: `Pet ${id}`,
      level,
      experience: 0,
      softCurrency: 0,
      attributePointsAvailable: 0,
      attributes: {
        stamina: 4,
        agility: 5,
        strength: 6,
        intelligence: 7,
      },
      variables: {
        ELEMENT: "Arc static",
        TOP_ITEM: "Tiny visor",
        PROFESSION_STYLE: "Arena gremlin",
        SIDE_DETAILS: "Loose sparks",
        FACIAL_FEATURES: "Wide grin",
        ELEMENT_EFFECTS: "Neon crackles",
      },
      selectedPowerId: "power_1",
      powers: [
        {
          id: "power_1",
          title: "Chaos Burst",
          description: "A noisy finishing blast.",
        },
      ],
      updatedAt,
      createdAt: updatedAt,
      completedAt: updatedAt,
    },
    matchTier: "preferred",
    levelDistance: Math.abs(level - 5),
  };
}

test("buildRevealOpponentCandidates keeps the selected opponent inside the reveal pool", () => {
  const attacker = createParticipant("wallet_attacker", "pet_attacker", 5, "2026-04-17T10:00:00.000Z");
  const candidateA = createParticipant("wallet_a", "pet_a", 5, "2026-04-17T12:00:00.000Z");
  const candidateB = createParticipant("wallet_b", "pet_b", 5, "2026-04-17T11:00:00.000Z");
  const candidateC = createParticipant("wallet_c", "pet_c", 5, "2026-04-17T09:00:00.000Z");
  const selectedOpponent = createParticipant("wallet_selected", "pet_selected", 5, "2026-04-16T09:00:00.000Z");

  const revealCandidates = buildRevealOpponentCandidates({
    attacker,
    candidates: [candidateA, candidateB, candidateC, selectedOpponent],
    selectedOpponent,
    limit: 3,
  });

  assert.equal(revealCandidates.length, 3);
  assert.equal(revealCandidates[0].character.id, "pet_selected");
  assert.ok(revealCandidates.some((entry) => entry.character.id === "pet_selected"));
});

test("buildBattleRevealBundle serializes a deduped selected rival and carousel candidates", () => {
  const selectedOpponent = createParticipant(
    "wallet_selected",
    "pet_selected",
    4,
    "2026-04-17T08:00:00.000Z"
  );
  const candidate = createParticipant("wallet_other", "pet_other", 3, "2026-04-17T07:00:00.000Z");

  const reveal = buildBattleRevealBundle({
    selectedOpponent,
    carouselCandidates: [selectedOpponent, candidate],
    matchmaking: {
      preferredBandApplied: true,
      levelDistance: 1,
      selectionMode: "preferred_band",
    },
  });

  assert.ok(reveal);
  assert.equal(reveal.selectedOpponent.id, "pet_selected");
  assert.equal(reveal.carouselCandidates.length, 2);
  assert.deepEqual(
    reveal.carouselCandidates.map((entry) => entry.id),
    ["pet_selected", "pet_other"]
  );
  assert.match(reveal.selectedOpponent.imageUrl, /^\/api\/character\/image\?id=pet_selected&v=/);
  assert.equal(reveal.selectedOpponent.creatorWallet, "wallet_selected");
  assert.equal(reveal.carouselCandidates[1].matchTier, "preferred");
});
