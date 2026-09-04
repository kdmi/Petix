const {
  INTERNAL_AUTH_HEADER,
  getSessionFromRequest,
  handleCors,
  isLikelyEvmAddress,
  json,
} = require("../../api/_lib/auth");
const { syncTransfers } = require("../../api/_lib/nft");
const { sendDomainError } = require("./_shared");

// Manual/periodic ownership sync. Three callers, three auth paths:
//   1. Vercel Cron — GET with `Authorization: Bearer $CRON_SECRET`
//   2. our own tooling — the internal secret header
//   3. the dashboard — a regular EVM session
function isAuthorized(req) {
  const cronSecret = process.env.CRON_SECRET;
  if (
    cronSecret &&
    String(req.headers.authorization || "") === `Bearer ${cronSecret}`
  ) {
    return true;
  }

  const internalSecret = process.env.INTERNAL_API_SECRET;
  if (
    internalSecret &&
    internalSecret.length >= 24 &&
    String(req.headers[INTERNAL_AUTH_HEADER] || "") === internalSecret
  ) {
    return true;
  }

  const session = getSessionFromRequest(req);
  return Boolean(session && isLikelyEvmAddress(session.wallet));
}

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  // Vercel Cron issues GET; everything else posts.
  if (req.method !== "POST" && req.method !== "GET") {
    json(res, 405, { error: "Method not allowed." });
    return;
  }
  if (!isAuthorized(req)) {
    json(res, 401, { error: "Unauthorized." });
    return;
  }

  try {
    const result = await syncTransfers();
    json(res, 200, result);
  } catch (error) {
    if (sendDomainError(res, error)) return;
    console.error("[nft:sync]", error);
    json(res, 500, { error: "Sync failed." });
  }
};
