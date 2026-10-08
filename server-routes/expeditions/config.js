const { handleCors, json } = require("../../api/_lib/auth");
const { ROSTER, bossViews, isMintEnabled, rulesFromConfig } = require("../../api/_lib/expeditions-config");
const { assertExpeditionsAccess, requireMethod } = require("./_shared");

// Public view of the season: roster, fees, flags. No contract addresses, no
// opened blocks — those stay in the admin API.
module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  const access = await assertExpeditionsAccess(req, res, { allowAnonymous: true });
  if (!access) return;
  if (!requireMethod(req, res, "GET")) return;
  const { cfg, admin } = access;
  json(res, 200, {
    enabled: true,
    adminOnly: Number(cfg.EXPEDITIONS_ADMIN_ONLY) === 1,
    admin,
    mintEnabled: isMintEnabled(cfg),
    energyPerAttempt: Math.max(0, Math.floor(Number(cfg.EXPEDITION_ENERGY_PER_ATTEMPT) || 0)),
    rules: rulesFromConfig(cfg),
    season: { number: 1, title: "Heroes of Hood and Magic", bosses: ROSTER.length },
    bosses: bossViews(cfg, {}).map((view) => ({ ...view, state: view.state === "hidden" ? "hidden" : "open", stars: 0 })),
  });
};
