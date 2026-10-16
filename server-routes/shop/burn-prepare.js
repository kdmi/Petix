const { handleCors, json, parseJsonBody } = require("../../api/_lib/auth");
const { prepareBurn } = require("../../api/_lib/solana-burn");
const { requireSession, sendShopError } = require("./_shared");

// POST { packId } — build the burn transaction for the linked Solana wallet (031).
module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (req.method !== "POST") { json(res, 405, { error: "Method not allowed." }); return; }
  const session = requireSession(req, res);
  if (!session) return;
  try {
    const body = await parseJsonBody(req);
    const result = await prepareBurn(session.wallet, { packId: body?.packId });
    json(res, 200, result);
  } catch (error) {
    sendShopError(res, error, "Could not burn the coins.");
  }
};
