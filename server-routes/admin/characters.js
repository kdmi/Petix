const { getSessionFromRequest, handleCors, isAdminSession, json } = require("../../api/_lib/auth");
const { serializeCharacterRecord } = require("../../api/_lib/character");
const { findCharacterRecordById, listAllCharacters } = require("../../api/_lib/store");

// Admin roster. The full serialization of every pet had grown to 14.9 MB for
// 3039 characters — 63% of it the generation prompts, another 15% the power
// texts, trait variables and generation metadata, none of which this panel
// renders. At that size the page stopped loading at all (2026-09-23).
//
// The list keeps only what the table and the expanded card actually show; the
// complete record, prompts included, is one request away via `?id=<characterId>`.
const LIST_FIELDS = [
  "id",
  "status",
  "creatureType",
  "name",
  "displayName",
  "rarity",
  "level",
  "experience",
  "experienceForNextLevel",
  "attributePoints",
  "attributePointsAvailable",
  "attributes",
  "imageUrl",
  "imageProvider",
  "nft",
  "createdAt",
  "completedAt",
  "updatedAt",
];

function toListRow(character, wallet) {
  const serialized = serializeCharacterRecord(character);
  if (!serialized) return null;

  const row = { creatorWallet: wallet };
  for (const field of LIST_FIELDS) {
    if (serialized[field] !== undefined) row[field] = serialized[field];
  }
  return row;
}

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  if (req.method !== "GET") {
    json(res, 405, { error: "Method not allowed." });
    return;
  }

  const session = getSessionFromRequest(req);
  if (!session) {
    json(res, 401, { error: "Unauthorized." });
    return;
  }

  if (!isAdminSession(session)) {
    json(res, 403, { error: "Forbidden." });
    return;
  }

  const requestUrl = new URL(req.url, "http://localhost");
  const characterId = String(requestUrl.searchParams.get("id") || "").trim();

  // Single pet, everything we know about it — this is how prompts stay
  // reachable for debugging a live generation.
  if (characterId) {
    const found = await findCharacterRecordById(characterId);
    if (!found?.character) {
      json(res, 404, { error: "Character not found." });
      return;
    }

    json(res, 200, {
      character: { ...serializeCharacterRecord(found.character), creatorWallet: found.wallet },
    });
    return;
  }

  const characters = await listAllCharacters();

  json(res, 200, {
    characters: characters
      .map(({ wallet, character }) => toListRow(character, wallet))
      .filter(Boolean),
  });
};
