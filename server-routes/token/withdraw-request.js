const { handleCors, isAdminWallet, json, parseJsonBody } = require("../../api/_lib/auth");
const { requestWithdraw } = require("../../api/_lib/token");
const { requireEvmSession, requireMethod, sendDomainError } = require("./_shared");

// POST /api/token/withdraw-request { amount }
// Custodial payout: Points are debited, the treasury sends the ERC-20 transfer
// and pays gas. The player signs nothing. Refund on proven failure only.
module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (!requireMethod(req, res, "POST")) return;
  const session = requireEvmSession(req, res);
  if (!session) return;

  try {
    const body = await parseJsonBody(req);
    const result = await requestWithdraw(session.wallet, body.amount, undefined, {
      isAdmin: isAdminWallet(session.wallet),
    });
    json(res, 200, result);
  } catch (error) {
    if (sendDomainError(res, error)) return;
    json(res, 400, { error: error.message || "Bad request." });
  }
};
