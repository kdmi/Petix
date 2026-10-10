const { handleCors, json } = require("../../api/_lib/auth");
const { resetExpeditionProgress } = require("../../api/_lib/expedition-reset");
const { parseJsonBody, requireAdmin, sendError } = require("./_expeditions-shared");

// POST { wallets: ["0x…"], confirm: true } — wipe Expeditions progress of the
// listed wallets (test runs before launch). Without `confirm: true` it is a dry
// run that only reports what would be cleared.
module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (!requireAdmin(req, res)) return;
  try {
    if (req.method !== "POST") { json(res, 405, { error: "Method not allowed." }); return; }
    const body = await parseJsonBody(req);
    json(res, 200, await resetExpeditionProgress({ wallets: body?.wallets, dryRun: body?.confirm !== true }));
  } catch (error) {
    sendError(res, error, "Could not reset expedition progress.");
  }
};
