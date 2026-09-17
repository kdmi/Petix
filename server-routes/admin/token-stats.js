const { getSessionFromRequest, handleCors, isAdminSession, json } = require("../../api/_lib/auth");
const { adminStats } = require("../../api/_lib/token");
const { isTokenEnabled } = require("../../api/_lib/token-chain");

// Admin: $PETIX treasury health, today's flows, in-flight payouts, sync state
// and the operations journal (feature 019, US4). 404 while the flag is off so
// the admin panel hides the block instead of showing an empty one.
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
  if (!isTokenEnabled()) {
    json(res, 404, { error: "Token features are disabled.", code: "TOKEN_DISABLED" });
    return;
  }

  try {
    json(res, 200, await adminStats());
  } catch (error) {
    if (error?.httpStatus) {
      json(res, error.httpStatus, { error: error.message, code: error.httpCode });
      return;
    }
    json(res, 500, { error: error.message || "Failed to load token stats." });
  }
};
