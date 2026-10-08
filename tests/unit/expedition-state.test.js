const test = require("node:test");
const assert = require("node:assert/strict");

const { PLAYER, invoke, sessionHeaders, withExpeditionEnv } = require("./helpers/expedition-fixtures");

test("state: boss views with progress, active attempt, wallet and flags", async () => {
  await withExpeditionEnv(async ({ dispatcher, store }) => {
    await store.updateWalletProfile(PLAYER, (p) => ({ ...p, expeditions: { ...p.expeditions, progress: { 1: { bestStars: 3, paidStars: [1, 2, 3], attempts: 4, wins: 2 } }, tutorialSeen: true } }));
    const before = await invoke(dispatcher(), { url: "/api/expeditions/state", headers: sessionHeaders(PLAYER) });
    assert.equal(before.status, 200);
    assert.deepEqual(before.body.bosses.slice(0, 4).map((b) => b.state), ["done", "current", "locked", "hidden"]);
    assert.equal(before.body.bosses[0].stars, 3);
    assert.equal(before.body.bosses[1].fee, 1000);
    assert.equal(before.body.active, null);
    assert.equal(before.body.tutorialSeen, true);
    assert.equal(before.body.energyPerAttempt, 1);
    assert.deepEqual(before.body.wallet, { points: 5000, energy: 3 });
    assert.equal(before.body.progress[1].attempts, 4);

    const started = await invoke(dispatcher(), { method: "POST", url: "/api/expeditions/start", headers: sessionHeaders(PLAYER), body: { bossIndex: 2, squadIds: ["pet-1"] } });
    assert.equal(started.status, 200);
    const after = await invoke(dispatcher(), { url: "/api/expeditions/state", headers: sessionHeaders(PLAYER) });
    assert.equal(after.body.active.attemptId, started.body.attempt.attemptId);
    assert.equal(after.body.active.seed, started.body.attempt.seed);
    assert.equal(after.body.wallet.points, 4000);
    assert.equal(JSON.stringify(after.body).includes("contract"), false);
  });
});

test("state: an attempt older than 24h is reported stale, not active", async () => {
  await withExpeditionEnv(async ({ dispatcher, store }) => {
    const started = await invoke(dispatcher(), { method: "POST", url: "/api/expeditions/start", headers: sessionHeaders(PLAYER), body: { bossIndex: 1, squadIds: ["pet-1"] } });
    const old = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
    await store.updateWalletProfile(PLAYER, (p) => ({ ...p, expeditions: { ...p.expeditions, active: { ...p.expeditions.active, startedAt: old } } }));
    const res = await invoke(dispatcher(), { url: "/api/expeditions/state", headers: sessionHeaders(PLAYER) });
    assert.equal(res.body.active, null);
    assert.equal(res.body.staleAttempt, started.body.attempt.attemptId);
  });
});
