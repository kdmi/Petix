const test = require("node:test");
const assert = require("node:assert/strict");

const { ADMIN, OTHER, PLAYER, invoke, sessionHeaders, withExpeditionEnv } = require("./helpers/expedition-fixtures");

const start = (handler, wallet, body) => invoke(handler, { method: "POST", url: "/api/expeditions/start", headers: sessionHeaders(wallet), body });

test("start: boss 1 is free, costs 1 energy, freezes the squad, adds wild fillers from other wallets", async () => {
  await withExpeditionEnv(async ({ dispatcher, store }) => {
    const res = await start(dispatcher(), PLAYER, { bossIndex: 1, squadIds: ["pet-1", "pet-2"] });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const { attempt } = res.body;
    assert.ok(attempt.attemptId);
    assert.ok(attempt.seed >= 1);
    assert.equal(attempt.fee, 0);
    assert.equal(attempt.squad.length, 2);
    assert.equal(attempt.squad[0].strength, 6);
    assert.equal(attempt.wilds.length, 3, "4 − 2 own + 1 wild");
    assert.ok(attempt.wilds.every((w) => w.id.startsWith(`wild:${OTHER}:`)), "fillers never come from the player");
    assert.equal(res.body.wallet.points, 5000);
    assert.equal(res.body.wallet.energy, 2);
    const profile = await store.getWalletProfile(PLAYER);
    assert.equal(profile.expeditions.active.attemptId, attempt.attemptId);
    assert.equal(profile.expeditions.progress[1].attempts, 1);
    assert.equal(profile.spend.length, 0, "free boss writes no spend entry");
  });
});

test("start: boss 2 after boss 1 cleared charges the fee and logs the spend; 3★ replay is free", async () => {
  await withExpeditionEnv(async ({ dispatcher, store }) => {
    await store.updateWalletProfile(PLAYER, (p) => ({ ...p, expeditions: { ...p.expeditions, progress: { 1: { bestStars: 1 } } } }));
    const res = await start(dispatcher(), PLAYER, { bossIndex: 2, squadIds: ["pet-1", "pet-2", "pet-3", "pet-4"] });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.attempt.fee, 1000);
    assert.equal(res.body.attempt.wilds.length, 1);
    assert.equal(res.body.wallet.points, 4000);
    const profile = await store.getWalletProfile(PLAYER);
    assert.equal(profile.spend.at(-1).reason, "expedition");
    assert.equal(profile.spend.at(-1).points, 1000);

    await store.updateWalletProfile(PLAYER, (p) => ({ ...p, expeditions: { ...p.expeditions, active: null, progress: { 1: { bestStars: 1 }, 2: { bestStars: 3 } } } }));
    const replay = await start(dispatcher(), PLAYER, { bossIndex: 2, squadIds: ["pet-1"] });
    assert.equal(replay.status, 200);
    assert.equal(replay.body.attempt.fee, 0);
    assert.equal(replay.body.wallet.points, 4000);
  });
});

test("start: gating — hidden boss 404, locked boss 403, foreign/duplicate/empty squad 400", async () => {
  await withExpeditionEnv(async ({ dispatcher }) => {
    const handler = dispatcher();
    assert.equal((await start(handler, PLAYER, { bossIndex: 4, squadIds: ["pet-1"] })).body.code, "BOSS_HIDDEN");
    assert.equal((await start(handler, PLAYER, { bossIndex: 2, squadIds: ["pet-1"] })).body.code, "BOSS_LOCKED");
    assert.equal((await start(handler, PLAYER, { bossIndex: 42, squadIds: ["pet-1"] })).body.code, "BOSS_UNKNOWN");
    assert.equal((await start(handler, PLAYER, { bossIndex: 1, squadIds: ["wild-1"] })).body.code, "SQUAD_INVALID");
    assert.equal((await start(handler, PLAYER, { bossIndex: 1, squadIds: ["pet-1", "pet-1"] })).body.code, "SQUAD_DUPLICATE");
    assert.equal((await start(handler, PLAYER, { bossIndex: 1, squadIds: [] })).body.code, "SQUAD_SIZE");
    assert.equal((await start(handler, PLAYER, { bossIndex: 1, squadIds: ["pet-1", "pet-2", "pet-3", "pet-4", "pet-1"] })).body.code, "SQUAD_SIZE");
  });
});

test("start: NOT_ENOUGH_ENERGY wins over NOT_ENOUGH_POINTS; granted energy counts; nothing is written on refusal", async () => {
  await withExpeditionEnv(async ({ dispatcher, store, energy }) => {
    await store.updateWalletProfile(PLAYER, (p) => ({ ...p, currency: { balance: 10, totalEarned: 10 }, expeditions: { ...p.expeditions, progress: { 1: { bestStars: 1 } } } }));
    const broke = await start(dispatcher(), PLAYER, { bossIndex: 2, squadIds: ["pet-1"] });
    assert.equal(broke.status, 400);
    assert.equal(broke.body.code, "NOT_ENOUGH_POINTS");
    assert.equal(broke.body.fee, 1000);
    let profile = await store.getWalletProfile(PLAYER);
    assert.equal(profile.expeditions.active, null);
    assert.equal(profile.battleState.energyCurrent, 3, "refused start spends no energy");

    let drained = energy.normalizeBattleState(null);
    for (let i = 0; i < 3; i++) drained = energy.consumeBattleEnergy(drained, { wallet: PLAYER });
    await store.updateWalletProfile(PLAYER, (p) => ({ ...p, battleState: drained }));
    const noEnergy = await start(dispatcher(), PLAYER, { bossIndex: 2, squadIds: ["pet-1"] });
    assert.equal(noEnergy.body.code, "NOT_ENOUGH_ENERGY", "energy is checked before Points");

    await store.updateWalletProfile(PLAYER, (p) => ({ ...p, battleState: energy.grantBattleEnergy(p.battleState, { amount: 1 }), currency: { balance: 1000, totalEarned: 1000 } }));
    const granted = await start(dispatcher(), PLAYER, { bossIndex: 2, squadIds: ["pet-1"] });
    assert.equal(granted.status, 200, JSON.stringify(granted.body));
    profile = await store.getWalletProfile(PLAYER);
    assert.equal(profile.battleState.energyGranted, 0);
    assert.equal(profile.battleState.energyCurrent, 0);
  });
});

test("start: a new attempt forfeits the active one without refund", async () => {
  await withExpeditionEnv(async ({ dispatcher, store }) => {
    const first = await start(dispatcher(), PLAYER, { bossIndex: 1, squadIds: ["pet-1"] });
    const second = await start(dispatcher(), PLAYER, { bossIndex: 1, squadIds: ["pet-2"] });
    assert.notEqual(first.body.attempt.attemptId, second.body.attempt.attemptId);
    const profile = await store.getWalletProfile(PLAYER);
    assert.equal(profile.expeditions.active.attemptId, second.body.attempt.attemptId);
    assert.equal(profile.expeditions.progress[1].forfeits, 1);
    assert.equal(profile.expeditions.progress[1].attempts, 2);
    assert.equal(profile.battleState.energyCurrent, 1);
  });
});

test("start: admins have unlimited energy but still pay the fee", async () => {
  await withExpeditionEnv(async ({ dispatcher, store }) => {
    await store.updateWalletProfile(ADMIN, (p) => ({ ...p, characters: [{ ...require("./helpers/expedition-fixtures").makePet("adm-1") }], currency: { balance: 2500, totalEarned: 2500 }, expeditions: { ...p.expeditions, progress: { 1: { bestStars: 2 } } } }));
    const res = await start(dispatcher(), ADMIN, { bossIndex: 2, squadIds: ["adm-1"] });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.wallet.points, 1500);
  });
});
