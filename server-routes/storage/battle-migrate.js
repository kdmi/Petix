const {
  INTERNAL_AUTH_HEADER,
  getSessionFromRequest,
  handleCors,
  isAdminSession,
  json,
} = require("../../api/_lib/auth");
const {
  catchUpMissingBattles,
  compareBattleStores,
  migrateBattlesToShards,
} = require("../../api/_lib/battle-migration");

// Feature 025 migration: moves pre-025 battles into the sharded layout, one
// batch per call. Same callers as the other jobs — cron, internal tooling, or
// an admin session. `?compare=1` only counts the two sides, which is the check
// before the legacy document is dropped.
function isAuthorizedMachine(req) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && String(req.headers.authorization || "") === `Bearer ${cronSecret}`) return true;

  const internalSecret = process.env.INTERNAL_API_SECRET;
  return Boolean(
    internalSecret &&
      internalSecret.length >= 24 &&
      String(req.headers[INTERNAL_AUTH_HEADER] || "") === internalSecret
  );
}

function isTruthy(value) {
  return ["1", "true", "yes"].includes(String(value || "").trim().toLowerCase());
}

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  if (req.method !== "GET" && req.method !== "POST") {
    json(res, 405, { error: "Method not allowed." });
    return;
  }

  const session = getSessionFromRequest(req);
  if (!isAuthorizedMachine(req) && !(session && isAdminSession(session))) {
    json(res, 401, { error: "Unauthorized." });
    return;
  }

  const requestUrl = new URL(req.url, "http://localhost");

  try {
    if (isTruthy(requestUrl.searchParams.get("compare"))) {
      json(res, 200, { ok: true, ...(await compareBattleStores()) });
      return;
    }

    if (isTruthy(requestUrl.searchParams.get("catchup"))) {
      // Only the records the shards are missing — battles played while the
      // cursor-based pass was running, or between that pass and the switch.
      const limit = requestUrl.searchParams.get("limit");
      json(res, 200, { ok: true, ...(await catchUpMissingBattles(limit ? { limit } : {})) });
      return;
    }

    const force = isTruthy(requestUrl.searchParams.get("force"));
    json(res, 200, { ok: true, ...(await migrateBattlesToShards({ force })) });
  } catch (error) {
    json(res, 500, { error: error.message || "Battle migration failed." });
  }
};
