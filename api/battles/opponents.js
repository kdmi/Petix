const { getSessionFromRequest, handleCors, json } = require("../_lib/auth");
const { getPreviewOpponentCandidates } = require("../_lib/battle-matchmaking");
const {
  resolveAttackerParticipant,
  serializeBattlePreviewCandidate,
} = require("../_lib/battle");
const { listAllCharacters } = require("../_lib/store");

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

  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const attackerPetId = String(requestUrl.searchParams.get("attackerPetId") || "").trim();
  const requestedLimit = Number.parseInt(requestUrl.searchParams.get("limit") || "", 10);
  const opponentLimit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(requestedLimit, 20))
    : 10;

  if (!attackerPetId) {
    json(res, 400, { error: "attackerPetId is required." });
    return;
  }

  try {
    const attacker = await resolveAttackerParticipant({
      attackerPetId,
      attackerWallet: session.wallet,
    });
    const characters = await listAllCharacters();
    const opponents = getPreviewOpponentCandidates({
      attacker,
      candidates: characters,
      limit: opponentLimit,
    })
      .map((entry) => serializeBattlePreviewCandidate(entry))
      .filter(Boolean);

    json(res, 200, {
      opponents,
    });
  } catch (error) {
    json(res, 400, {
      error: error.message || "Bad request.",
    });
  }
};
