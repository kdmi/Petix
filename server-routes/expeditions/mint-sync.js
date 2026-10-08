const { INTERNAL_AUTH_HEADER, getSessionFromRequest, handleCors, isAdminWallet, json } = require("../../api/_lib/auth");
const { getExpeditionConfig, isExpeditionsEnabled } = require("../../api/_lib/expeditions-config");
const { processMintQueue } = require("../../api/_lib/expedition-nft");

// Mint queue worker: settles sent mints and mints what waited for the switch.
// Callers: Vercel Cron (Bearer CRON_SECRET), our tooling (internal header), admins.
function isAuthorized(req) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && String(req.headers.authorization || "") === `Bearer ${cronSecret}`) return true;
  const internalSecret = process.env.INTERNAL_API_SECRET;
  if (internalSecret && internalSecret.length >= 24 && String(req.headers[INTERNAL_AUTH_HEADER] || "") === internalSecret) return true;
  const session = getSessionFromRequest(req);
  return Boolean(session && isAdminWallet(session.wallet));
}

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (req.method !== "POST" && req.method !== "GET") {
    json(res, 405, { error: "Method not allowed." });
    return;
  }
  if (!isAuthorized(req)) {
    json(res, 401, { error: "Unauthorized." });
    return;
  }
  const cfg = await getExpeditionConfig();
  if (!isExpeditionsEnabled(cfg)) {
    json(res, 200, { skipped: true, reason: "EXPEDITIONS_DISABLED" });
    return;
  }
  try {
    json(res, 200, await processMintQueue());
  } catch (error) {
    console.error("[expeditions] mint-sync failed", error);
    json(res, 500, { error: "Mint sync failed.", code: "MINT_SYNC_FAILED" });
  }
};
