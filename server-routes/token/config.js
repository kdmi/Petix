const { handleCors, json } = require("../../api/_lib/auth");
const { getTokenConfigForWallet } = require("../../api/_lib/token");
const { requireMethod, requireSession, sendDomainError } = require("./_shared");

// GET /api/token/config — what the Withdraw/Deposit modals need for THIS user.
// Legacy sessions get enabled:false + reason:"EVM_ONLY" instead of a refusal.
module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (!requireMethod(req, res, "GET")) return;
  const session = requireSession(req, res);
  if (!session) return;

  try {
    json(res, 200, await getTokenConfigForWallet(session.wallet));
  } catch (error) {
    if (sendDomainError(res, error)) return;
    json(res, 500, { error: error.message || "Failed to load token config." });
  }
};
