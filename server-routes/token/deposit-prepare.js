const { handleCors, isAdminWallet, json, parseJsonBody } = require("../../api/_lib/auth");
const { prepareDeposit } = require("../../api/_lib/token");
const { requireEvmSession, requireMethod, sendDomainError } = require("./_shared");

// POST /api/token/deposit-prepare { amount } — deposit address + a plain ERC-20
// transfer payload for the "send from wallet" button. Copying the address needs none of this.
module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (!requireMethod(req, res, "POST")) return;
  const session = requireEvmSession(req, res);
  if (!session) return;

  try {
    const body = await parseJsonBody(req);
    const result = await prepareDeposit(session.wallet, body.amount, undefined, {
      isAdmin: isAdminWallet(session.wallet),
    });
    json(res, 200, result);
  } catch (error) {
    if (sendDomainError(res, error)) return;
    json(res, 400, { error: error.message || "Bad request." });
  }
};
