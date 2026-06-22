const {
  getSessionFromRequest,
  handleCors,
  json,
  parseJsonBody,
} = require("../../api/_lib/auth");
const { serializeCharacterRecord } = require("../../api/_lib/character");
const { getEconomyConfig } = require("../../api/_lib/economy-config");
const { claimFarm, computeFarmEarned } = require("../../api/_lib/farm");
const { updateWalletProfile } = require("../../api/_lib/store");

function fail(status, message, code) {
  const error = new Error(message);
  error.httpStatus = status;
  if (code) error.httpCode = code;
  return error;
}

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
    const petId = String(body.petId || "").trim();
    if (!petId) {
      json(res, 400, { error: "petId is required." });
      return;
    }

    const cfg = await getEconomyConfig();
    const now = Date.now();
    let outcome = null;

    const profile = await updateWalletProfile(session.wallet, (current) => {
      const character = (current.characters || []).find((record) => record.id === petId);
      if (!character) throw fail(404, "Character not found.");
      const view = computeFarmEarned(character.farmState, now, character.level, character.rarity, cfg);
      if (!view.active) throw fail(409, "Character is not farming.", "NOT_FARMING");
      // Farm runs a full cycle and auto-completes; claim only once the cap is reached.
      if (!view.capped) throw fail(409, "Farm is still running — come back when it's ready.", "FARM_NOT_READY");
      const result = claimFarm(current, character, now, cfg);
      outcome = result;
      return current;
    });

    const character = (profile.characters || []).find((record) => record.id === petId);
    const view = serializeCharacterRecord(character, { economyConfig: cfg, now });
    json(res, 200, {
      petId,
      claimed: outcome.claimed,
      completedHours: outcome.completedHours,
      balance: profile.currency.balance,
      farmState: view.farmState,
      character: view,
    });
  } catch (error) {
    if (error.httpStatus) {
      json(res, error.httpStatus, { error: error.message, code: error.httpCode });
      return;
    }
    json(res, 400, { error: error.message || "Bad request." });
  }
};
