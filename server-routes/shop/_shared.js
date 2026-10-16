const { getSessionFromRequest, json } = require("../../api/_lib/auth");

function requireSession(req, res) {
  const session = getSessionFromRequest(req);
  if (!session) { json(res, 401, { error: "Unauthorized." }); return null; }
  return session;
}

function sendShopError(res, error, fallback) {
  if (error && error.httpStatus) {
    const payload = { error: error.message, code: error.httpCode };
    for (const key of ["required", "balance", "tryOn", "burn"]) if (error[key] != null) payload[key] = error[key];
    json(res, error.httpStatus, payload);
    return;
  }
  console.error(fallback, error);
  json(res, 500, { error: fallback });
}

module.exports = { requireSession, sendShopError };
