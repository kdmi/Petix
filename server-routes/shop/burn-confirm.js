const { handleCors, json, parseJsonBody } = require("../../api/_lib/auth");
const { confirmBurn } = require("../../api/_lib/solana-burn");
const { requireSession, sendShopError } = require("./_shared");

// POST { signature } — check a burn on Solana and pay souls once (031). 202 while it is not confirmed yet.
module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (req.method !== "POST") { json(res, 405, { error: "Method not allowed." }); return; }
  const session = requireSession(req, res);
  if (!session) return;
  try {
    const body = await parseJsonBody(req);
    const result = await confirmBurn(session.wallet, { signature: body?.signature });
    json(res, result.status === "pending" ? 202 : 200, result);
    return;
  } catch (error) {
    sendShopError(res, error, "Could not burn the coins.");
  }
};
