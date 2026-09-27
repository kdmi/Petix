const { getSessionFromRequest, handleCors, isAdminSession, json } = require("../../api/_lib/auth");
const { listAdminCompletedBattles } = require("../../api/_lib/battle-store");

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

  if (!isAdminSession(session)) {
    json(res, 403, { error: "Forbidden." });
    return;
  }

  // Feature 025: a window, not the whole history. The sharded store reads the
  // per-day index files for the range; the legacy store ignores the parameter
  // and still answers with everything it has.
  const requestUrl = new URL(req.url, "http://localhost");
  const days = requestUrl.searchParams.get("days");

  json(res, 200, await listAdminCompletedBattles(days ? { days } : {}));
};
