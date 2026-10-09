const { handleCors, json } = require("../../api/_lib/auth");
const { previewCapsuleAirdrop, runCapsuleAirdrop } = require("../../api/_lib/expedition-energy");
const { parseJsonBody, requireAdmin, sendError } = require("./_expeditions-shared");

// GET — preview (wallets, capsules by tier, total energy at current tier rates).
// POST { label } — run it once; the label makes a re-run a no-op per wallet.
module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (!requireAdmin(req, res)) return;
  try {
    if (req.method === "GET") {
      const preview = await previewCapsuleAirdrop();
      json(res, 200, { wallets: preview.wallets, capsules: preview.capsules, byTier: preview.byTier, totalEnergy: preview.totalEnergy });
      return;
    }
    if (req.method !== "POST") { json(res, 405, { error: "Method not allowed." }); return; }
    const body = await parseJsonBody(req);
    json(res, 200, await runCapsuleAirdrop({ label: body?.label }));
  } catch (error) {
    sendError(res, error, "Could not run the capsule airdrop.");
  }
};
