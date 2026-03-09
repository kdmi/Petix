const { getSessionFromRequest, handleCors, json, parseJsonBody } = require("../_lib/auth");
const {
  getAttributePointBudget,
  normalizeAttributes,
  serializeCharacterRecord,
  validateSkillAllocation,
} = require("../_lib/character");
const { isCharacterProxyEnabled, proxyCharacterJson } = require("../_lib/character-proxy");
const { updateWalletProfile } = require("../_lib/store");

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  if (isCharacterProxyEnabled()) {
    await proxyCharacterJson(req, res, "/api/character/create");
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
    const selectedPowerId = String(body.selectedPowerId || "").trim();
    const stats = body.stats || {};

    const profile = await updateWalletProfile(session.wallet, async (current) => {
      if (!current.draft) {
        throw new Error("Character draft not found. Start again.");
      }

      const attributePointBudget = getAttributePointBudget(current.draft);
      if (!validateSkillAllocation(stats, attributePointBudget)) {
        throw new Error(
          `Invalid attribute allocation. Exactly ${attributePointBudget} points are required.`
        );
      }

      const nextSelectedPowerId = selectedPowerId || current.draft.selectedPowerId;
      const selectedPower = current.draft.powers.find((power) => power.id === nextSelectedPowerId);
      if (!selectedPower) {
        throw new Error("Selected superpower is invalid.");
      }

      const now = new Date().toISOString();
      const completedCharacter = {
        ...current.draft,
        status: "completed",
        selectedPowerId: nextSelectedPowerId,
        attributes: normalizeAttributes(stats),
        completedAt: now,
        updatedAt: now,
      };

      return {
        draft: null,
        characters: [...current.characters, completedCharacter],
      };
    });

    const latestCharacter = profile.characters[profile.characters.length - 1] || null;

    json(res, 200, {
      success: true,
      character: serializeCharacterRecord(latestCharacter),
      characters: profile.characters.map(serializeCharacterRecord),
    });
  } catch (error) {
    json(res, 400, { error: error.message || "Bad request." });
  }
};
