const test = require("node:test");
const assert = require("node:assert/strict");

const { PLAYER, invoke, sessionHeaders, withExpeditionEnv } = require("./helpers/expedition-fixtures");

const CONTRACTS = ["", `0x${"b".repeat(40)}`, `0x${"c".repeat(40)}`, "", "", "", "", "", "", ""];
const overrides = { EXPEDITION_COLLECTION_CONTRACTS: CONTRACTS, EXPEDITION_COLLECTION_ENERGY: [0, 4, 3, 0, 0, 0, 0, 0, 0, 0], EXPEDITION_BOSS_OPENED_BLOCK: [0, 100, 100, 0, 0, 0, 0, 0, 0, 0] };

function sources(holdings) {
  const rpc = { balanceOf: async (contract) => (holdings[contract.toLowerCase()] || []).length, listIncoming: async () => [], ownerOf: async () => PLAYER, transaction: async () => null };
  return { explorer: null, rpc, cache: new Map() };
}

test("GET lists open collections with a contract and energy; POST grants once per collection and writes energyClaims", async () => {
  await withExpeditionEnv(async ({ dispatcher, store, expeditionCollections }) => {
    expeditionCollections.configureDeps(sources({ [`0x${"b".repeat(40)}`]: ["1", "2"], [`0x${"c".repeat(40)}`]: [] }));
    const list = await invoke(dispatcher(), { url: "/api/expeditions/energy-claim", headers: sessionHeaders(PLAYER) });
    assert.equal(list.status, 200, JSON.stringify(list.body));
    assert.deepEqual(list.body.collections.map((c) => [c.bossIndex, c.energy, c.status]), [[2, 4, "claimable"], [3, 3, "claimable"]]);

    const claim = await invoke(dispatcher(), { method: "POST", url: "/api/expeditions/energy-claim", headers: sessionHeaders(PLAYER), body: { collections: [2, 3] } });
    assert.equal(claim.status, 200, JSON.stringify(claim.body));
    assert.deepEqual(claim.body.results.map((r) => [r.bossIndex, r.status]), [[2, "granted"], [3, "not_held"]]);
    assert.equal(claim.body.energyAdded, 4);
    assert.equal(claim.body.wallet.energy, 3 + 4);
    const profile = await store.getWalletProfile(PLAYER);
    assert.equal(profile.battleState.energyGranted, 4);
    assert.equal(profile.expeditions.energyClaims[2].energy, 4);
    assert.equal(profile.expeditions.energyClaims[2].held, 2);
    assert.equal(profile.expeditions.energyClaims[2].eligible, 1);
    assert.equal(profile.expeditions.energyClaims[3], undefined, "not held → no claim recorded, can retry later");

    const again = await invoke(dispatcher(), { method: "POST", url: "/api/expeditions/energy-claim", headers: sessionHeaders(PLAYER), body: { collections: [2] } });
    assert.equal(again.status, 409);
    assert.equal(again.body.code, "ALREADY_CLAIMED");
    assert.equal((await store.getWalletProfile(PLAYER)).battleState.energyGranted, 4);
  }, { overrides });
});

test("POST with a hidden boss's collection → NOTHING_TO_CLAIM; check failure → 503 and no grant", async () => {
  await withExpeditionEnv(async ({ dispatcher, store, expeditionCollections }) => {
    expeditionCollections.configureDeps(sources({}));
    const hidden = await invoke(dispatcher(), { method: "POST", url: "/api/expeditions/energy-claim", headers: sessionHeaders(PLAYER), body: { collections: [7] } });
    assert.equal(hidden.status, 400);
    assert.equal(hidden.body.code, "NOTHING_TO_CLAIM");
    expeditionCollections.configureDeps({ explorer: null, rpc: { balanceOf: async () => { throw new Error("down"); } }, cache: new Map() });
    const down = await invoke(dispatcher(), { method: "POST", url: "/api/expeditions/energy-claim", headers: sessionHeaders(PLAYER), body: { collections: [2] } });
    assert.equal(down.status, 503);
    assert.equal(down.body.code, "CHECK_UNAVAILABLE");
    assert.equal((await store.getWalletProfile(PLAYER)).battleState.energyGranted, 0);
  }, { overrides });
});

test("POST { check: true } reports eligible / not_held without granting; the follow-up claim grants (two-step popup)", async () => {
  await withExpeditionEnv(async ({ dispatcher, store, expeditionCollections }) => {
    expeditionCollections.configureDeps(sources({ [`0x${"b".repeat(40)}`]: ["1"], [`0x${"c".repeat(40)}`]: [] }));
    const check = await invoke(dispatcher(), { method: "POST", url: "/api/expeditions/energy-claim", headers: sessionHeaders(PLAYER), body: { check: true } });
    assert.equal(check.status, 200, JSON.stringify(check.body));
    assert.equal(check.body.checked, true);
    assert.deepEqual(check.body.results.map((r) => [r.bossIndex, r.status]), [[2, "eligible"], [3, "not_held"]]);
    assert.equal(check.body.energyAdded, 0);
    assert.equal((await store.getWalletProfile(PLAYER)).battleState.energyGranted, 0, "a check grants nothing");
    const claim = await invoke(dispatcher(), { method: "POST", url: "/api/expeditions/energy-claim", headers: sessionHeaders(PLAYER), body: { collections: [2] } });
    assert.equal(claim.status, 200);
    assert.equal(claim.body.energyAdded, 4);
    const again = await invoke(dispatcher(), { method: "POST", url: "/api/expeditions/energy-claim", headers: sessionHeaders(PLAYER), body: { check: true } });
    assert.equal(again.status, 200);
    assert.deepEqual(again.body.results.map((r) => [r.bossIndex, r.status]), [[3, "not_held"]], "claimed collections are not re-checked");
  }, { overrides });
});
