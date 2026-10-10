const { handleCors, json } = require("../../api/_lib/auth");
const { previewCapsuleAirdrop, runCapsuleAirdrop } = require("../../api/_lib/expedition-energy");
const { parseJsonBody, requireAdmin, sendError } = require("./_expeditions-shared");

// GET ?mode=capsule|wallet|tier&amount=N[&tiers=json] — preview (holders, capsules by tier, total energy at these rates).
// POST { mode, amount|tiers, label? } — run it; every drop gets its own label (auto capsules-YYYYMMDD-HHMM), so drops repeat,
// while re-sending the same label is a no-op per wallet.
function ratesFrom(src) {
  if (!src) return undefined;
  let tiers = src.tiers;
  if (typeof tiers === "string") { try { tiers = JSON.parse(tiers); } catch { tiers = undefined; } }
  return { mode: src.mode, amount: src.amount, tiers };
}

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (!requireAdmin(req, res)) return;
  try {
    if (req.method === "GET") {
      const url = new URL(req.url, "http://localhost");
      const preview = await previewCapsuleAirdrop({ rates: ratesFrom(Object.fromEntries(url.searchParams)) });
      json(res, 200, { rates: preview.rates, wallets: preview.wallets, capsules: preview.capsules, byTier: preview.byTier, totalEnergy: preview.totalEnergy });
      return;
    }
    if (req.method !== "POST") { json(res, 405, { error: "Method not allowed." }); return; }
    const body = await parseJsonBody(req);
    json(res, 200, await runCapsuleAirdrop({ label: body?.label ? String(body.label) : undefined, rates: ratesFrom(body) }));
  } catch (error) {
    sendError(res, error, "Could not run the capsule airdrop.");
  }
};
