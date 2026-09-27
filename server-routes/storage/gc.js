const {
  INTERNAL_AUTH_HEADER,
  getSessionFromRequest,
  handleCors,
  isAdminSession,
  json,
} = require("../../api/_lib/auth");
const { collectBlobGarbage } = require("../../api/_lib/blob-gc");

// Version-blob garbage collection. Same two machine callers as the other
// syncs — Vercel Cron with `Authorization: Bearer $CRON_SECRET`, or our own
// tooling with the internal secret — plus an admin session, so the panel (or a
// human with a browser) can look at a dry run before anything is deleted.
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
  const isAdmin = Boolean(session) && isAdminSession(session);
  if (!isAuthorizedMachine(req) && !isAdmin) {
    json(res, 401, { error: "Unauthorized." });
    return;
  }

  const requestUrl = new URL(req.url, "http://localhost");
  const dryRun = isTruthy(requestUrl.searchParams.get("dryRun"));

  try {
    json(res, 200, { ok: true, ...(await collectBlobGarbage({ dryRun })) });
  } catch (error) {
    json(res, 500, { error: error.message || "Blob GC failed." });
  }
};
