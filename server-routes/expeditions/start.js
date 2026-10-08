const { handleCors, json, parseJsonBody } = require("../../api/_lib/auth");
const { getWalletProfile, updateWalletProfile } = require("../../api/_lib/store");
const { getRoster } = require("../../api/_lib/roster");
const { getWalletCapsuleBonus } = require("../../api/_lib/nft");
const { getBoss, rulesFromConfig } = require("../../api/_lib/expeditions-config");
const X = require("../../api/_lib/expeditions");
const { assertExpeditionsAccess, requireMethod, sendDomainError } = require("./_shared");

// POST /api/expeditions/start { bossIndex, squadIds[] }
// One profile write: forfeits a stale/old attempt, spends 1 energy + the fee,
// stores the new attempt (seed, frozen squad, wild fillers). Nothing is written
// when the mutator throws (4xx).
module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  const access = await assertExpeditionsAccess(req, res);
  if (!access) return;
  if (!requireMethod(req, res, "POST")) return;
  const { session, cfg } = access;
  const wallet = session.wallet;

  try {
    const body = await parseJsonBody(req);
    const bossIndex = Math.floor(Number(body?.bossIndex));
    if (!getBoss(bossIndex)) throw X.fail(400, "BOSS_UNKNOWN", "Unknown boss.");
    const [rosterEntries, capsuleBonus] = await Promise.all([
      getRoster().catch(() => []),
      getWalletCapsuleBonus(wallet).catch(() => ({ extraBattles: 0 })),
    ]);
    let attempt = null;
    await updateWalletProfile(wallet, (profile) => {
      attempt = X.startAttempt(profile, {
        wallet,
        bossIndex,
        squadIds: body?.squadIds,
        cfg,
        rosterEntries,
        bonusEnergy: capsuleBonus.extraBattles || 0,
      });
      return profile;
    });
    const saved = await getWalletProfile(wallet);
    const boss = getBoss(bossIndex);
    json(res, 200, {
      attempt: X.attemptView(attempt),
      boss: { index: boss.index, title: boss.title, name: boss.name, hp: boss.hp, power: boss.power, shields: boss.shields, par: boss.par, hero: boss.hero, squadBg: boss.squadBg },
      rules: rulesFromConfig(cfg),
      wallet: { points: saved.currency.balance, energy: saved.battleState.energyCurrent },
      progress: X.progressOf(saved, bossIndex),
    });
  } catch (error) {
    if (sendDomainError(res, error)) return;
    console.error("[expeditions] start failed", error);
    json(res, 500, { error: "Could not start the fight.", code: "START_FAILED" });
  }
};
