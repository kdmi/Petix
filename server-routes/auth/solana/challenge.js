const { handleCors, json } = require("../../../api/_lib/auth");

// Solana sign-in is retired in favour of EVM auth (/api/auth/evm/*).
// The route intentionally stays (410, not deleted) so a rollback to Solana
// is a plain git revert; stored base58 profiles are untouched.
// See specs/015-metamask-auth/.
module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed." });
    return;
  }

  json(res, 410, { error: "Solana sign-in is disabled.", code: "SOLANA_AUTH_DISABLED" });
};
