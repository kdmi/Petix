const { getSessionFromRequest, isAdminSession, json, parseJsonBody } = require("../../api/_lib/auth");

function requireAdmin(req, res) {
  const session = getSessionFromRequest(req);
  if (!session) { json(res, 401, { error: "Unauthorized." }); return null; }
  if (!isAdminSession(session)) { json(res, 403, { error: "Forbidden." }); return null; }
  return session;
}

function sendError(res, error, fallback) {
  if (error?.httpStatus) { json(res, error.httpStatus, { error: error.message, code: error.httpCode }); return; }
  if (error?.code === "RPC_UNAVAILABLE") { json(res, 503, { error: "Chain RPC is unavailable — try again.", code: "RPC_UNAVAILABLE" }); return; }
  console.error(fallback, error);
  json(res, 500, { error: fallback, code: "ADMIN_FAILED" });
}

module.exports = { parseJsonBody, requireAdmin, sendError };
