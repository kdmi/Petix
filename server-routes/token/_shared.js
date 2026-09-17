const { getSessionFromRequest, isLikelyEvmAddress, json } = require("../../api/_lib/auth");

// Session gate for the token routes. Legacy base58 (Solana) sessions have no
// EVM address to receive ERC-20s, so only EVM sessions may withdraw/deposit;
// `config` handles them itself (it needs to explain why, not refuse).
function requireSession(req, res) {
  const session = getSessionFromRequest(req);
  if (!session) {
    json(res, 401, { error: "Unauthorized." });
    return null;
  }
  return session;
}

function requireEvmSession(req, res) {
  const session = requireSession(req, res);
  if (!session) return null;
  if (!isLikelyEvmAddress(session.wallet)) {
    json(res, 403, { error: "Withdrawals require an EVM wallet.", code: "EVM_ONLY" });
    return null;
  }
  return session;
}

function requireMethod(req, res, method) {
  if (req.method === method) return true;
  json(res, 405, { error: "Method not allowed." });
  return false;
}

const EXTRA_FIELDS = ["min", "maxPerTx", "balance", "txHash", "confirmations", "eligibleAt", "holdHours"];

function sendDomainError(res, error) {
  if (error?.httpStatus) {
    const payload = { error: error.message, code: error.httpCode };
    for (const field of EXTRA_FIELDS) {
      if (error[field] != null) payload[field] = error[field];
    }
    json(res, error.httpStatus, payload);
    return true;
  }
  if (error?.code === "RPC_UNAVAILABLE") {
    json(res, 503, { error: "Chain RPC is unavailable — try again.", code: "RPC_UNAVAILABLE" });
    return true;
  }
  return false;
}

module.exports = { requireEvmSession, requireMethod, requireSession, sendDomainError };
