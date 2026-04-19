const { getSessionFromRequest, handleCors, json, parseJsonBody } = require("../../api/_lib/auth");
const {
  applyAttributeIncrements,
  getAttributeIncrementSpend,
  normalizeCharacterProgress,
  serializeCharacterRecord,
  validateAttributeIncrements,
} = require("../../api/_lib/character");
const { isCharacterProxyEnabled, proxyCharacterJson } = require("../../api/_lib/character-proxy");
const { updateWalletProfile } = require("../../api/_lib/store");

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  if (isCharacterProxyEnabled()) {
    await proxyCharacterJson(req, res, "/api/character/upgrade");
    return;
  }

  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed." });
    return;
  }

  const session = getSessionFromRequest(req);
  if (!session) {
    json(res, 401, { error: "Unauthorized." });
    return;
  }

  try {
    const body = await parseJsonBody(req);
    const characterId = String(body.characterId || "").trim();
    const attributeIncrements = body.attributeIncrements || {};

    if (!characterId) {
      json(res, 400, { error: "Character id is required." });
      return;
    }

    const profile = await updateWalletProfile(session.wallet, async (current) => {
      const characterIndex = current.characters.findIndex(
        (record) => String(record?.id || "").trim() === characterId
      );

      if (characterIndex < 0) {
        throw new Error("Upgrade target not found.");
      }

      const currentCharacter = current.characters[characterIndex];
      if (String(currentCharacter?.status || "").trim().toLowerCase() !== "completed") {
        throw new Error("Only completed pets can be upgraded.");
      }

      const progression = normalizeCharacterProgress(currentCharacter);
      const availablePoints = Math.max(
        0,
        Math.floor(Number(progression.attributePointsAvailable) || 0)
      );

      if (availablePoints <= 0) {
        throw new Error("This pet has no upgrade points available.");
      }

      if (!validateAttributeIncrements(attributeIncrements, availablePoints)) {
        throw new Error("Invalid upgrade allocation.");
      }

      const spendTotal = getAttributeIncrementSpend(attributeIncrements);
      const now = new Date().toISOString();
      const nextCharacter = {
        ...currentCharacter,
        attributes: applyAttributeIncrements(currentCharacter.attributes, attributeIncrements),
        attributePointsAvailable: availablePoints - spendTotal,
        updatedAt: now,
      };
      const nextCharacters = [...current.characters];
      nextCharacters[characterIndex] = nextCharacter;

      return {
        ...current,
        characters: nextCharacters,
      };
    });

    const updatedCharacter = profile.characters.find(
      (record) => String(record?.id || "").trim() === characterId
    );

    json(res, 200, {
      success: true,
      character: serializeCharacterRecord(updatedCharacter),
      characters: profile.characters.map(serializeCharacterRecord),
    });
  } catch (error) {
    json(res, 400, { error: error.message || "Bad request." });
  }
};
