const { handleCors, json, parseJsonBody } = require("../../api/_lib/auth");
const { buy } = require("../../api/_lib/shop");
const { requireSession, sendShopError } = require("./_shared");

// POST { itemId } — buy one item for souls (031).
module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (req.method !== "POST") { json(res, 405, { error: "Method not allowed." }); return; }
  const session = requireSession(req, res);
  if (!session) return;
  try {
    const body = await parseJsonBody(req);
    json(res, 200, await buy(session.wallet, body?.itemId));
  } catch (error) {
    sendShopError(res, error, "Could not buy the item.");
  }
};
