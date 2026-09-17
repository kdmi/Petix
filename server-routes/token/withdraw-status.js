const { handleCors, json, parseJsonBody } = require("../../api/_lib/auth");
const { normalizeCurrency } = require("../../api/_lib/currency");
const { getWalletProfile } = require("../../api/_lib/store");
const { explorerTxUrl, reconcileWithdrawal } = require("../../api/_lib/token");
const { getTokenEnv } = require("../../api/_lib/token-chain");
const { requireEvmSession, requireMethod, sendDomainError } = require("./_shared");

// POST /api/token/withdraw-status { id } — settle one withdrawal by chain data.
module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (!requireMethod(req, res, "POST")) return;
  const session = requireEvmSession(req, res);
  if (!session) return;

  try {
    const body = await parseJsonBody(req);
    const id = String(body.id || "").trim();
    if (!id) {
      json(res, 400, { error: "id is required.", code: "BAD_REQUEST" });
      return;
    }
    const record = await reconcileWithdrawal(session.wallet, id);
    if (!record) {
      json(res, 404, { error: "Withdrawal not found.", code: "NOT_FOUND" });
      return;
    }
    const profile = await getWalletProfile(session.wallet);
    json(res, 200, {
      id: record.id,
      status: record.status,
      txHash: record.txHash || null,
      points: record.points,
      petixSent: record.petixSent,
      reason: record.reason || null,
      balance: normalizeCurrency(profile.currency).balance,
      explorerUrl: explorerTxUrl(getTokenEnv(), record.txHash),
    });
  } catch (error) {
    if (sendDomainError(res, error)) return;
    json(res, 400, { error: error.message || "Bad request." });
  }
};
