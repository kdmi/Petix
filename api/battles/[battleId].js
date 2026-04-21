const { getSessionFromRequest, handleCors, json } = require("../_lib/auth");
const { formatBattleResponse } = require("../_lib/battle");
const { getBattleRecord } = require("../_lib/battle-store");

function getBattleIdFromRequest(req) {
  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const parts = requestUrl.pathname.split("/").filter(Boolean);
  return String(parts[parts.length - 1] || "").trim();
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

  const battleId = getBattleIdFromRequest(req);
  if (!battleId) {
    json(res, 400, {
      error: "BATTLE_ID_REQUIRED",
      message: "Battle id is required.",
    });
    return;
  }

  const battle = await getBattleRecord(battleId);
  if (!battle) {
    json(res, 404, {
      error: "BATTLE_NOT_FOUND",
      message: "Battle replay is not available.",
    });
    return;
  }

  json(res, 200, formatBattleResponse(battle));
};
