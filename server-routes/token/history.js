const { handleCors, json } = require("../../api/_lib/auth");
const { getWalletHistory } = require("../../api/_lib/token");
const { requireEvmSession, requireMethod, sendDomainError } = require("./_shared");

// GET /api/token/history — the wallet's last withdrawals and deposits with explorer links.
module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (!requireMethod(req, res, "GET")) return;
  const session = requireEvmSession(req, res);
  if (!session) return;

  try {
    json(res, 200, await getWalletHistory(session.wallet));
  } catch (error) {
    if (sendDomainError(res, error)) return;
    json(res, 500, { error: error.message || "Failed to load history." });
  }
};
