const test = require("node:test");
const assert = require("node:assert/strict");

const { PLAYER, invoke, playGreedy, sessionHeaders, withExpeditionEnv } = require("./helpers/expedition-fixtures");

const post = (handler, action, wallet, body) => invoke(handler, { method: "POST", url: `/api/expeditions/${action}`, headers: sessionHeaders(wallet), body });

async function startAndPlay({ dispatcher, engine }, X, bossIndex, squadIds, { seedOverride } = {}) {
  const started = await post(dispatcher(), "start", PLAYER, { bossIndex, squadIds });
  assert.equal(started.status, 200, JSON.stringify(started.body));
  const attempt = started.body.attempt;
  const state = engine.createBattle({ squad: attempt.squad, wilds: attempt.wilds, boss: X.engineBoss(bossIndex), seed: seedOverride || attempt.seed });
  const moves = playGreedy(engine, state);
  return { attempt, state, moves };
}

test("finish: replayed moves pay the new star tiers once, update progress, clear the attempt; idempotent", async () => {
  await withExpeditionEnv(async (env) => {
    const X = require("../../api/_lib/expeditions");
    const { attempt, state, moves } = await startAndPlay(env, X, 1, ["pet-1", "pet-2", "pet-3", "pet-4"]);
    const res = await post(env.dispatcher(), "finish", PLAYER, { attemptId: attempt.attemptId, moves });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.result.won, state.over.won);
    assert.equal(res.body.result.stars, state.over.stars);
    assert.equal(res.body.result.moves, state.over.moves);
    const expectedPaid = X.settleAttempt({ expeditions: { progress: {}, active: null }, currency: { balance: 0, totalEarned: 0 } }, attempt, X.resultOf(state), env.economy.mergeConfig({})).paid;
    assert.equal(res.body.paid, expectedPaid);
    assert.equal(res.body.wallet.points, 5000 + expectedPaid);
    const profile = await env.store.getWalletProfile(PLAYER);
    assert.equal(profile.expeditions.active, null);
    assert.equal(profile.expeditions.progress[1].bestStars, state.over.won ? state.over.stars : 0);
    assert.equal(profile.expeditions.progress[1].wins, state.over.won ? 1 : 0);

    const again = await post(env.dispatcher(), "finish", PLAYER, { attemptId: attempt.attemptId, moves });
    assert.equal(again.status, 200);
    assert.equal(again.body.alreadySettled, true);
    assert.equal(again.body.paid, expectedPaid);
    assert.equal((await env.store.getWalletProfile(PLAYER)).currency.balance, 5000 + expectedPaid, "no double payout");
  });
});

test("finish: tiers paid earlier are not paid again; a worse result pays nothing; a better one pays the difference", async () => {
  await withExpeditionEnv(async (env) => {
    const X = require("../../api/_lib/expeditions");
    const cfg = env.economy.mergeConfig({});
    const profile = { currency: { balance: 0, totalEarned: 0 }, expeditions: { active: null, progress: { 2: { bestStars: 2, paidStars: [1, 2] } } } };
    const attempt = { attemptId: "a1", bossIndex: 2, seed: 1, squad: [], wilds: [], fee: 1000, startedAt: new Date().toISOString() };
    const worse = X.settleAttempt(profile, attempt, { won: true, stars: 1, finished: true, moves: 20, hpPct: 60 }, cfg);
    assert.equal(worse.paid, 0);
    assert.equal(profile.expeditions.progress[2].bestStars, 2);
    const better = X.settleAttempt(profile, { ...attempt, attemptId: "a2" }, { won: true, stars: 3, finished: true, moves: 15, hpPct: 70 }, cfg);
    assert.equal(better.paid, 2000, "only the 3★ tier (2× of 1 000)");
    assert.deepEqual(better.paidNow, [3]);
    assert.equal(profile.currency.balance, 2000);
    assert.deepEqual(profile.expeditions.progress[2].paidStars, [1, 2, 3]);
    const lost = X.settleAttempt(profile, { ...attempt, attemptId: "a3" }, { won: false, stars: 0, finished: true, moves: 30, hpPct: 0 }, cfg);
    assert.equal(lost.paid, 0);
    assert.equal(profile.expeditions.progress[2].wins, 2);
  });
});

test("finish: no active attempt → 409; unfinished battle → 400; forfeit closes without payout", async () => {
  await withExpeditionEnv(async (env) => {
    const X = require("../../api/_lib/expeditions");
    const none = await post(env.dispatcher(), "finish", PLAYER, { attemptId: "nope", moves: [] });
    assert.equal(none.status, 409);
    assert.equal(none.body.code, "ATTEMPT_NOT_FOUND");

    const { attempt, moves } = await startAndPlay(env, X, 1, ["pet-1"]);
    const partial = await post(env.dispatcher(), "finish", PLAYER, { attemptId: attempt.attemptId, moves: moves.slice(0, 1) });
    assert.equal(partial.status, 400);
    assert.equal(partial.body.code, "BATTLE_NOT_OVER");
    assert.ok((await env.store.getWalletProfile(PLAYER)).expeditions.active, "attempt stays active");

    const forfeit = await post(env.dispatcher(), "finish", PLAYER, { attemptId: attempt.attemptId, forfeit: true });
    assert.equal(forfeit.status, 200);
    assert.equal(forfeit.body.paid, 0);
    assert.equal(forfeit.body.result.finished, false);
    assert.equal(forfeit.body.progress.forfeits, 1, "an explicit forfeit is counted in the boss stats");
    const profile = await env.store.getWalletProfile(PLAYER);
    assert.equal(profile.expeditions.active, null);
    assert.equal(profile.expeditions.progress[1].lastResult.status, "forfeited");
  });
});
