const { INTERNAL_AUTH_HEADER, handleCors, json } = require("../../api/_lib/auth");
const { isRosterEnabled, refreshRoster } = require("../../api/_lib/roster");

// Roster index refresh (feature 023). Two callers, two auth paths — the same
// pair the other syncs use:
//   1. Vercel Cron — GET with `Authorization: Bearer $CRON_SECRET`
//   2. our own tooling — the internal secret header
// No player session: this job writes shared state and nothing in the UI needs it.
function isAuthorized(req) {
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

  if (!isAuthorized(req)) {
    json(res, 401, { error: "Unauthorized." });
    return;
  }

  // The cron keeps firing while the feature sleeps; answer 200 so the logs do
  // not fill with failures (same convention as /api/nft/sync).
  if (!isRosterEnabled()) {
    json(res, 200, { skipped: true, reason: "ROSTER_DISABLED" });
    return;
  }

  const requestUrl = new URL(req.url, "http://localhost");
  const force = ["1", "true", "yes"].includes(
    String(requestUrl.searchParams.get("force") || "").trim().toLowerCase()
  );

  try {
    json(res, 200, { ok: true, ...(await refreshRoster({ force })) });
  } catch (error) {
    json(res, 500, { error: error.message || "Roster sync failed." });
  }
};
