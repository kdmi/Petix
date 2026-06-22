const {
  getSessionFromRequest,
  handleCors,
  isAdminSession,
  json,
  parseJsonBody,
} = require("../../api/_lib/auth");
const {
  getDefaults,
  getEconomyConfig,
  setEconomyConfig,
} = require("../../api/_lib/economy-config");

// Admin: read / tune the runtime economy config (feature 013). No redeploy needed —
// changes apply to new accruals (cache invalidated in setEconomyConfig).
module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  const session = getSessionFromRequest(req);
  if (!session) {
    json(res, 401, { error: "Unauthorized." });
    return;
  }
  if (!isAdminSession(session)) {
    json(res, 403, { error: "Forbidden." });
    return;
  }

  if (req.method === "GET") {
    const config = await getEconomyConfig();
    json(res, 200, { config, defaults: getDefaults() });
    return;
  }

  if (req.method === "POST") {
    try {
      const body = await parseJsonBody(req);
      const patch = body && body.patch;
      const reason = String((body && body.reason) || "").trim();
      if (reason.length < 3) {
        json(res, 400, { error: "A reason (min 3 chars) is required for config changes." });
        return;
      }
      const config = await setEconomyConfig(patch, { adminWallet: session.wallet, reason });
      json(res, 200, { config, defaults: getDefaults() });
    } catch (error) {
      if (error.code === "INVALID_CONFIG") {
        json(res, 400, { error: "Invalid economy config patch.", errors: error.errors });
        return;
      }
      json(res, 400, { error: error.message || "Bad request." });
    }
    return;
  }

  json(res, 405, { error: "Method not allowed." });
};
