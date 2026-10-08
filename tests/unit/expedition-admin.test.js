const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const path = require("path");

const { ADMIN, OTHER, PLAYER, evmWallet, invoke, playGreedy, sessionHeaders, withExpeditionEnv } = require("./helpers/expedition-fixtures");

const admin = (handler, action, { method = "GET", body, wallet = ADMIN } = {}) => invoke(handler, { method, url: `/api/admin/${action}`, headers: sessionHeaders(wallet), body });

async function fightBoss1(env) {
  const X = require("../../api/_lib/expeditions");
  const started = await invoke(env.dispatcher(), { method: "POST", url: "/api/expeditions/start", headers: sessionHeaders(PLAYER), body: { bossIndex: 1, squadIds: ["pet-1", "pet-2", "pet-3", "pet-4"] } });
  const attempt = started.body.attempt;
  const state = env.engine.createBattle({ squad: attempt.squad, wilds: attempt.wilds, boss: X.engineBoss(1), seed: attempt.seed });
  const moves = playGreedy(env.engine, state);
  const finished = await invoke(env.dispatcher(), { method: "POST", url: "/api/expeditions/finish", headers: sessionHeaders(PLAYER), body: { attemptId: attempt.attemptId, moves } });
  return { state, finished: finished.body };
}

test("expedition-stats: today/week totals, per-boss counters and the attempt log come from profiles", async () => {
  await withExpeditionEnv(async (env) => {
    const { state, finished } = await fightBoss1(env);
    const res = await admin(env.adminDispatcher(), "expedition-stats");
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.today.attempts, 1);
    assert.equal(res.body.today.wallets, 1);
    assert.equal(res.body.today.rewards, finished.paid);
    assert.equal(res.body.week.attempts, 1);
    assert.equal(res.body.bosses[0].attempts, 1);
    assert.equal(res.body.bosses[0].wins, state.over.won ? 1 : 0);
    assert.equal(res.body.bosses[0].rewardsPaid, finished.paid);
    assert.equal(res.body.bosses[0].feesPaid, 0);
    assert.equal(res.body.bosses[0].open, true);
    assert.equal(res.body.bosses[3].open, false);
    assert.equal(res.body.attempts[0].wallet, PLAYER);
    assert.equal(res.body.attempts[0].bossIndex, 1);
    assert.equal(res.body.flags.mintEnabled, false);
    assert.equal(/0x[0-9a-f]{40}/i.test(JSON.stringify(res.body.bosses)), false, "contracts are shortened in the stats payload");
    const forbidden = await admin(env.adminDispatcher(), "expedition-stats", { wallet: PLAYER });
    assert.equal(forbidden.status, 403);
  });
});

test("expedition-boss: open needs a contract + ERC-721 check and records openedBlock; hide only before the first fight", async () => {
  await withExpeditionEnv(async (env) => {
    const handler = env.adminDispatcher();
    const bossRoute = require(path.resolve(__dirname, "../../server-routes/admin/expedition-boss.js"));
    bossRoute.configureChain({ isErc721: async (addr) => addr === `0x${"4".repeat(40)}`, blockNumber: async () => 777 });

    const missing = await admin(handler, "expedition-boss", { method: "POST", body: { action: "open", bossIndex: 4, reason: "test" } });
    assert.equal(missing.status, 400);
    assert.equal(missing.body.code, "CONTRACT_MISSING");

    await env.patchConfig({ EXPEDITION_COLLECTION_CONTRACTS: ["", "", "", `0x${"4".repeat(40)}`, `0x${"5".repeat(40)}`, "", "", "", "", ""] });
    const opened = await admin(handler, "expedition-boss", { method: "POST", body: { action: "open", bossIndex: 4, reason: "test" } });
    assert.equal(opened.status, 200, JSON.stringify(opened.body));
    assert.equal(opened.body.openedBlock, 777);
    assert.equal(opened.body.verified, true);
    const cfg = await env.economy.getEconomyConfig();
    assert.deepEqual(cfg.EXPEDITION_BOSS_OPEN.slice(0, 5), [1, 1, 1, 1, 0]);
    assert.equal(cfg.EXPEDITION_BOSS_OPENED_BLOCK[3], 777);

    const notErc = await admin(handler, "expedition-boss", { method: "POST", body: { action: "open", bossIndex: 5, reason: "test" } });
    assert.equal(notErc.body.code, "CONTRACT_NOT_ERC721");

    const hidden = await admin(handler, "expedition-boss", { method: "POST", body: { action: "hide", bossIndex: 4, reason: "test" } });
    assert.equal(hidden.status, 200);
    assert.equal((await env.economy.getEconomyConfig()).EXPEDITION_BOSS_OPEN[3], 0);

    await fightBoss1(env);
    const busy = await admin(handler, "expedition-boss", { method: "POST", body: { action: "hide", bossIndex: 1, reason: "test" } });
    assert.equal(busy.status, 409);
    assert.equal(busy.body.code, "HAS_ATTEMPTS");
    bossRoute.configureChain(null);
  });
});

test("energy-grant: idempotent per label, parked for wallets without a profile and applied when they show up", async () => {
  await withExpeditionEnv(async (env) => {
    const handler = env.adminDispatcher();
    const newcomer = evmWallet("7");
    const res = await admin(handler, "energy-grant", { method: "POST", body: { label: "Partner Drop 1", grants: [{ wallet: PLAYER, amount: 3 }, { wallet: newcomer, amount: 2 }, { wallet: "nope", amount: 1 }] } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.label, "partner-drop-1");
    assert.equal(res.body.applied, 1);
    assert.equal(res.body.parked, 1);
    let profile = await env.store.getWalletProfile(PLAYER);
    assert.equal(profile.battleState.energyGranted, 3);
    assert.equal(profile.expeditions.grants["partner-drop-1"].amount, 3);

    const again = await admin(handler, "energy-grant", { method: "POST", body: { label: "partner-drop-1", grants: [{ wallet: PLAYER, amount: 3 }] } });
    assert.equal(again.body.applied, 0);
    assert.equal(again.body.skipped, 1);
    assert.equal((await env.store.getWalletProfile(PLAYER)).battleState.energyGranted, 3);

    // The newcomer shows up on the Expeditions tab → the parked grant lands.
    const config = await invoke(env.dispatcher(), { url: "/api/expeditions/config", headers: sessionHeaders(newcomer) });
    assert.equal(config.status, 200);
    profile = await env.store.getWalletProfile(newcomer);
    assert.equal(profile.battleState.energyGranted, 2);
    const summary = await admin(handler, "energy-grant");
    assert.equal(summary.body.grants[0].label, "partner-drop-1");
    assert.equal(summary.body.grants[0].wallets, 2);
  });
});

test("capsule-airdrop: preview from the capsule index by tier, run once per label", async () => {
  await withExpeditionEnv(async (env) => {
    const nftState = { version: 1, bindings: {}, owners: { 1: PLAYER, 2: PLAYER, 3: OTHER, 4: `0x${"9".repeat(40)}` }, ownedSince: {}, transfers: [], startBlock: 0, lastSyncedBlock: 0 };
    await fs.mkdir(path.join(env.tempDir, ".data", "local-dev"), { recursive: true });
    await fs.writeFile(path.join(env.tempDir, ".data", "local-dev", "nft.json"), JSON.stringify(nftState));
    const { getCapsuleTier } = require("../../api/_lib/nft-tiers");
    const cfg = await env.economy.getEconomyConfig();
    const expectedPlayer = [1, 2].reduce((a, id) => a + cfg.EXPEDITION_CAPSULE_ENERGY[getCapsuleTier(id)], 0);

    const handler = env.adminDispatcher();
    const preview = await admin(handler, "capsule-airdrop");
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    assert.equal(preview.body.wallets, 3);
    assert.equal(preview.body.capsules, 4);
    assert.ok(preview.body.totalEnergy >= 8);

    const run = await admin(handler, "capsule-airdrop", { method: "POST", body: { label: "capsules-s1" } });
    assert.equal(run.status, 200, JSON.stringify(run.body));
    assert.equal(run.body.applied, 2, "two wallets have profiles");
    assert.equal(run.body.parked, 1);
    assert.equal((await env.store.getWalletProfile(PLAYER)).battleState.energyGranted, expectedPlayer);
    const rerun = await admin(handler, "capsule-airdrop", { method: "POST", body: { label: "capsules-s1" } });
    assert.equal(rerun.body.applied, 0);
  });
});
