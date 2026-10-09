const { handleCors, json, parseJsonBody } = require("../../api/_lib/auth");
const { getWalletProfile, updateWalletProfile } = require("../../api/_lib/store");
const X = require("../../api/_lib/expeditions");
const { assertExpeditionsAccess, requireMethod, sendDomainError } = require("./_shared");

// POST /api/expeditions/finish { attemptId, moves[] } | { attemptId, forfeit: true }
// Replays the moves with the attempt's seed and squad, settles the payout and
// progress in ONE profile write. Idempotent: the same attemptId settled twice
// returns the stored outcome. A failed write leaves the attempt active so the
// client can retry.
module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  const access = await assertExpeditionsAccess(req, res);
  if (!access) return;
  if (!requireMethod(req, res, "POST")) return;
  const { session, cfg } = access;
  const wallet = session.wallet;

  try {
    const body = await parseJsonBody(req);
    const attemptId = String(body?.attemptId || "").trim();
    if (!attemptId) throw X.fail(400, "ATTEMPT_NOT_FOUND", "attemptId is required.");

    const profile = await getWalletProfile(wallet);
    const active = profile.expeditions.active;
    if (!active || active.attemptId !== attemptId) {
      // Already settled? Answer the stored outcome instead of 409.
      for (const progress of Object.values(profile.expeditions.progress || {})) {
        if (progress?.lastResult?.attemptId === attemptId) {
          json(res, 200, { result: progress.lastResult, paid: progress.lastResult.paid || 0, progress, alreadySettled: true, wallet: { points: profile.currency.balance, energy: profile.battleState.energyCurrent } });
          return;
        }
      }
      throw X.fail(409, "ATTEMPT_NOT_FOUND", "No active attempt with this id.");
    }

    // Replay outside the write: a bad move list must not cost a profile write.
    const forfeit = body?.forfeit === true;
    const state = forfeit ? null : X.replayMoves(active, body?.moves);
    if (!forfeit && !state.over) throw X.fail(400, "BATTLE_NOT_OVER", "The battle is not finished.");
    const result = X.resultOf(state, { forfeit });

    let outcome = null;
    await updateWalletProfile(wallet, (current) => {
      const attempt = current.expeditions.active;
      if (!attempt || attempt.attemptId !== attemptId) throw X.fail(409, "ATTEMPT_NOT_FOUND", "No active attempt with this id.");
      outcome = X.settleAttempt(current, attempt, result, cfg);
      return current;
    });
    const saved = await getWalletProfile(wallet);
    json(res, 200, {
      result,
      paid: outcome.paid,
      paidNow: outcome.paidNow || [],
      progress: X.progressOf(saved, active.bossIndex),
      wallet: { points: saved.currency.balance, energy: saved.battleState.energyCurrent },
    });
  } catch (error) {
    if (sendDomainError(res, error)) return;
    console.error("[expeditions] finish failed", error);
    json(res, 500, { error: "Could not finish the fight — try again.", code: "FINISH_FAILED" });
  }
};
