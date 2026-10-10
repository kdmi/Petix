const { handleCors, json } = require("../../api/_lib/auth");
const { CAPSULE_TIERS, previewCapsuleAirdrop, runCapsuleAirdrop } = require("../../api/_lib/expedition-energy");
const { parseJsonBody, requireAdmin, sendError } = require("./_expeditions-shared");

// Capsule airdrop (owner 2026-10-11): energy per capsule for each tier, typed at drop time.
// Whoever holds a capsule at the current block gets it — no rule about how it was obtained.
// GET ?glass=N&bronze=N&silver=N&gold=N&prismatic=N — preview (holders, capsules and energy by tier).
// POST { tiers: { glass, bronze, silver, gold, prismatic }, label? } — send. Every drop gets its own
// label (auto capsules-YYYYMMDD-HHMM), so drops repeat; re-sending the same label skips wallets that got it.
function publicPreview(p) {
  return { tiers: p.tiers, wallets: p.wallets, holders: p.holders, capsules: p.capsules, byTier: p.byTier, totalEnergy: p.totalEnergy, block: p.block, live: p.live };
}

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (!requireAdmin(req, res)) return;
  try {
    if (req.method === "GET") {
      const url = new URL(req.url, "http://localhost");
      const tiers = Object.fromEntries(CAPSULE_TIERS.map((tier) => [tier, url.searchParams.get(tier)]));
      json(res, 200, publicPreview(await previewCapsuleAirdrop({ tiers })));
      return;
    }
    if (req.method !== "POST") { json(res, 405, { error: "Method not allowed." }); return; }
    const body = await parseJsonBody(req);
    json(res, 200, await runCapsuleAirdrop({ label: body?.label ? String(body.label) : undefined, tiers: body?.tiers }));
  } catch (error) {
    sendError(res, error, "Could not run the capsule airdrop.");
  }
};
