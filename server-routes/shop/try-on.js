const { handleCors, json, parseJsonBody } = require("../../api/_lib/auth");
const { getWalletProfile } = require("../../api/_lib/store");
const { currentTryOn, tryOn } = require("../../api/_lib/shop");
const { requireSession, sendShopError } = require("./_shared");

// GET — the fitting in progress (or null).
// POST { petId, itemUid } — render one more variant of the pet wearing the item (max 3).
module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  const session = requireSession(req, res);
  if (!session) return;
  try {
    if (req.method === "GET") { json(res, 200, { tryOn: currentTryOn(await getWalletProfile(session.wallet)) }); return; }
    if (req.method !== "POST") { json(res, 405, { error: "Method not allowed." }); return; }
    const body = await parseJsonBody(req);
    json(res, 200, await tryOn(session.wallet, { petId: body?.petId, itemUid: body?.itemUid }));
  } catch (error) {
    sendShopError(res, error, "Could not draw the pet.");
  }
};
