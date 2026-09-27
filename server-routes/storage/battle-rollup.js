const {
  INTERNAL_AUTH_HEADER,
  getSessionFromRequest,
  handleCors,
  isAdminSession,
  json,
} = require("../../api/_lib/auth");
const { areBattleShardsEnabled } = require("../../api/_lib/battle-store");
const { rollUpBattleIndex } = require("../../api/_lib/battle-shard-store");

// Folds finished hours of the admin battle index into their day file. This is
// the one index write that must not sit on a battle's path: a day file reaches
// ~450 KB, and rewriting it per fight is exactly the cost feature 025 removes.
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

  // The cron keeps firing while the feature sleeps; answer 200 so the logs do
  // not fill with failures (same convention as the other syncs).
  if (!areBattleShardsEnabled()) {
    json(res, 200, { skipped: true, reason: "BATTLE_SHARDS_DISABLED" });
    return;
  }

  try {
    json(res, 200, { ok: true, ...(await rollUpBattleIndex()) });
  } catch (error) {
    json(res, 500, { error: error.message || "Battle index rollup failed." });
  }
};
