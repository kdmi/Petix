const { handleCors, json } = require("../../api/_lib/auth");
const { getWalletProfile } = require("../../api/_lib/store");
const { bossViews, isMintEnabled, rulesFromConfig } = require("../../api/_lib/expeditions-config");
const X = require("../../api/_lib/expeditions");
const { assertExpeditionsAccess, requireMethod } = require("./_shared");

// GET /api/expeditions/state — everything the Expeditions screen needs for this wallet.
module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  const access = await assertExpeditionsAccess(req, res);
  if (!access) return;
  if (!requireMethod(req, res, "GET")) return;
  const { session, cfg } = access;
  const profile = await getWalletProfile(session.wallet);
  const active = profile.expeditions.active;
  const progress = {};
  for (const key of Object.keys(profile.expeditions.progress || {})) progress[key] = X.progressOf(profile, Number(key));
  json(res, 200, {
    bosses: bossViews(cfg, profile.expeditions.progress),
    progress,
    active: active && !X.isAttemptStale(active) ? X.attemptView(active) : null,
    staleAttempt: active && X.isAttemptStale(active) ? active.attemptId : null,
    wallet: { points: profile.currency.balance, energy: profile.battleState.energyCurrent },
    energyPerAttempt: Math.max(0, Math.floor(Number(cfg.EXPEDITION_ENERGY_PER_ATTEMPT) || 0)),
    rules: rulesFromConfig(cfg),
    mintEnabled: isMintEnabled(cfg),
    tutorialSeen: profile.expeditions.tutorialSeen === true,
  });
};
