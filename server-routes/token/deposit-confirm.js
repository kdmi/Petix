const { handleCors, json, parseJsonBody } = require("../../api/_lib/auth");
const { confirmDeposit } = require("../../api/_lib/token");
const { requireEvmSession, requireMethod, sendDomainError } = require("./_shared");

// POST /api/token/deposit-confirm { txHash } — fast-path credit by receipt.
// 202 while confirmations are short; 200 credited / already_credited.
module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (!requireMethod(req, res, "POST")) return;
  const session = requireEvmSession(req, res);
  if (!session) return;

  try {
    const body = await parseJsonBody(req);
    const result = await confirmDeposit(session.wallet, body.txHash);
    json(res, result.status === "pending" ? 202 : 200, result);
  } catch (error) {
    if (sendDomainError(res, error)) return;
    json(res, 400, { error: error.message || "Bad request." });
  }
};
