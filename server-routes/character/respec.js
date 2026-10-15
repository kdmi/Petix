const { getSessionFromRequest, handleCors, json, parseJsonBody } = require("../../api/_lib/auth");
const { serializeCharacterRecord } = require("../../api/_lib/character");
const { getEconomyConfig } = require("../../api/_lib/economy-config");
const { refreshBoundCharacterMetadata } = require("../../api/_lib/nft");
const { applyRespec } = require("../../api/_lib/souls");
const { updateWalletProfile } = require("../../api/_lib/store");

// Redistribute a pet's points for souls (031).
// POST /api/character/respec  { petId, attributes: { stamina, agility, strength, intelligence } }
// Price: SOULS_RESPEC_PER_LEVEL x pet level. An expedition fight keeps the stats
// it started with (attempt.squad), so a change mid-fight does not touch it.
module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
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
    const petId = String(body?.petId || "").trim();
    if (!petId) {
      json(res, 400, { error: "petId is required." });
      return;
    }
    const cfg = await getEconomyConfig();
    let price = 0;
    const profile = await updateWalletProfile(session.wallet, (current) => {
      price = applyRespec(current, petId, body?.attributes, cfg).price;
      return current;
    });
    const pet = profile.characters.find((record) => String(record?.id) === petId);

    // Stats are NFT traits: ask the marketplace to re-read a capsule pet. Not awaited.
    void refreshBoundCharacterMetadata(petId);

    json(res, 200, {
      success: true,
      price,
      souls: profile.souls,
      character: serializeCharacterRecord(pet),
      characters: profile.characters.map(serializeCharacterRecord),
    });
  } catch (error) {
    if (error.httpStatus) {
      const payload = { error: error.message, code: error.httpCode };
      for (const key of ["required", "balance"]) if (error[key] != null) payload[key] = error[key];
      json(res, error.httpStatus, payload);
      return;
    }
    console.error("[character:respec]", error);
    json(res, 500, { error: "Could not redistribute the points." });
  }
};
