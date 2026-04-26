const { getSessionFromRequest, handleCors, json, parseJsonBody } = require("../../api/_lib/auth");
const {
  getAttributePointBudget,
  normalizeAttributes,
  serializeCharacterRecord,
  validateSkillAllocation,
} = require("../../api/_lib/character");
const { isCharacterProxyEnabled, proxyCharacterJson } = require("../../api/_lib/character-proxy");
const { updateWalletProfile } = require("../../api/_lib/store");

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
    const draftId = String(body.draftId || "").trim();
    const selectedPowerId = String(body.selectedPowerId || "").trim();
    const stats = body.stats || {};
    console.log(
      "[character:create:request]",
      JSON.stringify({
        wallet: session.wallet,
        draftId,
        selectedPowerId,
      })
    );

    const profile = await updateWalletProfile(session.wallet, async (current) => {
      if (!current.draft) {
        throw new Error("Character draft not found. Start again.");
      }

      if (draftId && String(current.draft.id || "") !== draftId) {
        throw new Error("Character draft changed. Start again.");
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
        level: 1,
        experience: 0,
        softCurrency: 0,
        attributePointsAvailable: 0,
        completedAt: now,
        updatedAt: now,
      };

      return {
        ...current,
        draft: null,
        characters: [...current.characters, completedCharacter],
      };
    });

    const latestCharacter = profile.characters[profile.characters.length - 1] || null;

    console.log(
      "[character:create:success]",
      JSON.stringify({
        wallet: session.wallet,
        characterId: latestCharacter?.id || null,
        selectedPowerId: latestCharacter?.selectedPowerId || selectedPowerId || null,
      })
    );

    json(res, 200, {
      success: true,
      character: serializeCharacterRecord(latestCharacter),
      characters: profile.characters.map(serializeCharacterRecord),
    });
  } catch (error) {
    console.warn(
      "[character:create:error]",
      JSON.stringify({
        wallet: session.wallet,
        message: error.message || "Bad request.",
      })
    );
    json(res, 400, { error: error.message || "Bad request." });
  }
};
