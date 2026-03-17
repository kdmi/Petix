const { getSessionFromRequest, handleCors, json, parseJsonBody } = require("../../api/_lib/auth");
const { serializeCharacterRecord } = require("../../api/_lib/character");
const { isCharacterProxyEnabled, proxyCharacterJson } = require("../../api/_lib/character-proxy");
const { updateWalletProfile } = require("../../api/_lib/store");

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  if (isCharacterProxyEnabled()) {
    await proxyCharacterJson(req, res, "/api/character/select-power");
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
    console.log(
      "[character:select-power:request]",
      JSON.stringify({
        wallet: session.wallet,
        selectedPowerId,
      })
    );
    if (!selectedPowerId) {
      json(res, 400, { error: "Selected superpower is required." });
      return;
    }

    const profile = await updateWalletProfile(session.wallet, async (current) => {
      if (!current.draft) {
        throw new Error("Character draft not found. Start again.");
      }

      const selectedPower = current.draft.powers.find((power) => power.id === selectedPowerId);
      if (!selectedPower) {
        throw new Error("Selected superpower is invalid.");
      }

      return {
        ...current,
        draft: {
          ...current.draft,
          selectedPowerId,
          updatedAt: new Date().toISOString(),
        },
      };
    });

    console.log(
      "[character:select-power:success]",
      JSON.stringify({
        wallet: session.wallet,
        draftId: profile.draft?.id || null,
        selectedPowerId: profile.draft?.selectedPowerId || selectedPowerId,
      })
    );

    json(res, 200, {
      draft: serializeCharacterRecord(profile.draft),
      characters: profile.characters.map(serializeCharacterRecord),
    });
  } catch (error) {
    console.warn(
      "[character:select-power:error]",
      JSON.stringify({
        wallet: session.wallet,
        message: error.message || "Bad request.",
      })
    );
    json(res, 400, { error: error.message || "Bad request." });
  }
};
