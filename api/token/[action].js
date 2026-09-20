const path = require("path");
const { json } = require("../_lib/auth");
const { isTokenEnabled } = require("../_lib/token-chain");

// $PETIX token routes (feature 019): custodial withdraw + deposit by transfer.
// Handlers live in server-routes/token/*; add new actions to HANDLERS here.
const HANDLERS = {
  config: require("../../server-routes/token/config"),
  "withdraw-request": require("../../server-routes/token/withdraw-request"),
  "withdraw-status": require("../../server-routes/token/withdraw-status"),
  "deposit-prepare": require("../../server-routes/token/deposit-prepare"),
  "deposit-confirm": require("../../server-routes/token/deposit-confirm"),
  sync: require("../../server-routes/token/sync"),
  history: require("../../server-routes/token/history"),
  ledger: require("../../server-routes/token/ledger"),
};

module.exports = async (req, res) => {
  const requestUrl = new URL(req.url, "http://localhost");
  const action = path.basename(requestUrl.pathname).replace(/\.js$/i, "");

  if (!isTokenEnabled()) {
    // Vercel Cron hits `sync` every minute even while the feature sleeps —
    // answer 200 so the cron log stays clean. Everything else (known or not)
    // is a plain 404 that reveals nothing about token/treasury configuration.
    if (action === "sync") {
      json(res, 200, { skipped: true, reason: "TOKEN_DISABLED" });
      return;
    }
    json(res, 404, { error: "Token features are disabled.", code: "TOKEN_DISABLED" });
    return;
  }

  const handler = HANDLERS[action];
  if (!handler) {
    json(res, 404, { error: "Not found." });
    return;
  }
  await handler(req, res);
};
