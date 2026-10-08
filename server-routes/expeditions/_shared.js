const { getSessionFromRequest, isAdminWallet, json } = require("../../api/_lib/auth");
const { getExpeditionConfig, isAdminOnly, isExpeditionsEnabled } = require("../../api/_lib/expeditions-config");

/**
 * Gate for every expedition route. Resolves the runtime config and the
 * session; answers 404 while the feature is off or admin-only for a non-admin
 * (nothing about the feature leaks), 401 without a session otherwise.
 * Returns { session, cfg } or null after writing the response.
 */
async function assertExpeditionsAccess(req, res, { allowAnonymous = false } = {}) {
  const cfg = await getExpeditionConfig();
  if (!isExpeditionsEnabled(cfg)) {
    json(res, 404, { error: "Expeditions are not available.", code: "EXPEDITIONS_DISABLED" });
    return null;
  }
  const session = getSessionFromRequest(req);
  const admin = Boolean(session && isAdminWallet(session.wallet));
  if (isAdminOnly(cfg) && !admin) {
    json(res, 404, { error: "Expeditions are not available.", code: "EXPEDITIONS_DISABLED" });
    return null;
  }
  if (!session && !allowAnonymous) {
    json(res, 401, { error: "Unauthorized." });
    return null;
  }
  return { session, cfg, admin };
}

function requireMethod(req, res, method) {
  if (req.method === method) return true;
  json(res, 405, { error: "Method not allowed." });
  return false;
}

function fail(status, code, message, extra) {
  const error = new Error(message);
  error.httpStatus = status;
  error.httpCode = code;
  if (extra) Object.assign(error, extra);
  return error;
}

function sendDomainError(res, error) {
  if (error?.httpStatus) {
    const payload = { error: error.message, code: error.httpCode };
    for (const key of ["fee", "energy", "points", "bossIndex", "attemptId"]) {
      if (error[key] != null) payload[key] = error[key];
    }
    json(res, error.httpStatus, payload);
    return true;
  }
  return false;
}

module.exports = { assertExpeditionsAccess, fail, requireMethod, sendDomainError };
