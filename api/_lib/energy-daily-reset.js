const { getWalletProfile, updateWalletProfile, readDb } = require("./store");
const { getBattleDateKey, normalizeBattleState } = require("./battle-energy");
const { normalizeLabel } = require("./expedition-energy");

// Admin tool (owner 2026-10-11, Expeditions launch day): give everyone today's
// free battle energy back. Only the daily counter (`energyUsed`) goes to 0 —
// bonus energy (`energyGranted`) and purchased energy (`energyPurchased`) are
// not touched. The reset is marked in `expeditions.grants[label]` (the profile
// field that already serves as the idempotency ledger for energy campaigns), so
// running it again — to finish a batch or by mistake — never resets anyone twice.

const DEFAULT_BUDGET_MS = 45000;
const CONCURRENCY = 6;

function defaultLabel(now) {
  return `daily-reset-${getBattleDateKey(now)}`;
}

function needsReset(profile, { label, today }) {
  if (profile?.expeditions?.grants?.[label]) return false;
  const state = profile?.battleState || {};
  return String(state.lastResetDate || "") === today && Number(state.energyUsed) > 0;
}

/** Wallets whose free energy for today is (partly) spent and that were not reset under `label` yet. */
async function listCandidates({ label, today, db }) {
  const snapshot = db || (await readDb());
  return Object.entries(snapshot?.records || {})
    .filter(([, profile]) => needsReset(profile, { label, today }))
    .map(([wallet, profile]) => ({ wallet, used: Number(profile.battleState.energyUsed) || 0 }));
}

async function resetDailyEnergy({ label: rawLabel, dryRun = true, now = new Date(), budgetMs = DEFAULT_BUDGET_MS, db, profiles = { getWalletProfile, updateWalletProfile } } = {}) {
  const today = getBattleDateKey(now);
  const label = normalizeLabel(rawLabel || defaultLabel(now));
  const candidates = await listCandidates({ label, today, db });
  const summary = { label, today, dryRun, candidates: candidates.length, energyBack: candidates.reduce((a, c) => a + c.used, 0), reset: 0, skipped: 0, remaining: candidates.length };
  if (dryRun) return summary;

  const started = Date.now();
  let index = 0;
  async function worker() {
    while (index < candidates.length && Date.now() - started < budgetMs) {
      const { wallet } = candidates[index++];
      let changed = false;
      await profiles.updateWalletProfile(wallet, (profile) => {
        // Re-check on the fresh profile: the snapshot can be a minute old.
        if (!needsReset(profile, { label, today })) throw Object.assign(new Error("skip"), { skip: true });
        const state = normalizeBattleState(profile.battleState, { now });
        profile.battleState = { ...state, energyUsed: 0, updatedAt: now.toISOString() };
        profile.expeditions.grants = { ...(profile.expeditions.grants || {}), [label]: { amount: 0, kind: "daily-reset", at: now.toISOString() } };
        changed = true;
        return profile;
      }).catch((error) => { if (!error.skip) throw error; });
      if (changed) summary.reset += 1; else summary.skipped += 1;
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  summary.remaining = candidates.length - summary.reset - summary.skipped;
  return summary;
}

module.exports = { defaultLabel, needsReset, resetDailyEnergy };
