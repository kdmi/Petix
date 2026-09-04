const { getSessionFromRequest, isLikelyEvmAddress, json } = require("../../api/_lib/auth");

// Common session gate for the NFT demo routes: legacy base58 sessions have no
// EVM address to hold tokens, so only EVM sessions participate (FR-019).
function requireEvmSession(req, res) {
  const session = getSessionFromRequest(req);
  if (!session) {
    json(res, 401, { error: "Unauthorized." });
    return null;
  }
  if (!isLikelyEvmAddress(session.wallet)) {
    json(res, 403, { error: "An EVM session is required.", code: "EVM_SESSION_REQUIRED" });
    return null;
  }
  return session;
}

function sendDomainError(res, error) {
  if (error?.httpStatus) {
    const payload = { error: error.message, code: error.httpCode };
    if (error.required != null) payload.required = error.required;
    if (error.current != null) payload.current = error.current;
    if (error.balance != null) payload.balance = error.balance;
    if (error.executeAt != null) payload.executeAt = error.executeAt;
    json(res, error.httpStatus, payload);
    return true;
  }
  if (error?.code === "RPC_UNAVAILABLE") {
    json(res, 502, { error: "Chain RPC is unavailable — try again.", code: "RPC_UNAVAILABLE" });
    return true;
  }
  return false;
}

module.exports = { requireEvmSession, sendDomainError };
