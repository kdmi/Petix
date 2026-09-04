const { handleCors, json } = require("../../api/_lib/auth");
const { listWalletSlots } = require("../../api/_lib/nft");
const { requireEvmSession, sendDomainError } = require("./_shared");

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (req.method !== "GET") {
    json(res, 405, { error: "Method not allowed." });
    return;
  }
  const session = requireEvmSession(req, res);
  if (!session) return;

  try {
    // Side effect (login sync, FR-013): bindings whose recorded wallet differs
    // from the caller are reconciled before the response is built.
    const result = await listWalletSlots(session.wallet);
    json(res, 200, result);
  } catch (error) {
    if (sendDomainError(res, error)) return;
    console.error("[nft:slots]", error);
    json(res, 500, { error: "Failed to load slots." });
  }
};
