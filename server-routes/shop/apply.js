const { handleCors, json, parseJsonBody } = require("../../api/_lib/auth");
const { apply } = require("../../api/_lib/shop");
const { requireSession, sendShopError } = require("./_shared");

// POST { variantId } — keep this variant: it becomes the pet's picture, the item is consumed.
module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (req.method !== "POST") { json(res, 405, { error: "Method not allowed." }); return; }
  const session = requireSession(req, res);
  if (!session) return;
  try {
    const body = await parseJsonBody(req);
    json(res, 200, await apply(session.wallet, { variantId: body?.variantId }));
  } catch (error) {
    sendShopError(res, error, "Could not save the picture.");
  }
};
