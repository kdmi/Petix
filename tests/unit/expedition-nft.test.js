const test = require("node:test");
const assert = require("node:assert/strict");

const { ADMIN, PLAYER, createFakeTrophyChain, invoke, sessionHeaders, withExpeditionEnv } = require("./helpers/expedition-fixtures");

const fastDeps = (chain) => ({ chain, sleep: async () => {}, receiptPollMs: 0, lockPollMs: 0, lockWaitMs: 1 });
const claim = (handler, wallet, bossIndex) => invoke(handler, { method: "POST", url: "/api/expeditions/claim-nft", headers: sessionHeaders(wallet), body: { bossIndex } });
async function give3Stars(store, wallet, bossIndex) {
  await store.updateWalletProfile(wallet, (p) => ({ ...p, expeditions: { ...p.expeditions, progress: { ...p.expeditions.progress, [bossIndex]: { bestStars: 3, paidStars: [1, 2, 3], attempts: 1, wins: 1 } } } }));
}

test("claim: minting on → trophy minted, tokenId stored, registry feeds metadata; repeat → 409; 1 per wallet per boss", async () => {
  await withExpeditionEnv(async ({ dispatcher, store, expeditionNft }) => {
    const chain = createFakeTrophyChain();
    expeditionNft.configureDeps(fastDeps(chain));
    await give3Stars(store, PLAYER, 1);
    const res = await claim(dispatcher(), PLAYER, 1);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.status, "minted");
    assert.equal(res.body.tokenId, 1);
    assert.equal(res.body.progress.nft.status, "minted");
    assert.equal(res.body.progress.nft.txHash, chain.minted[0].txHash);
    assert.deepEqual(chain.minted.map((m) => [m.to, m.bossId]), [[PLAYER, 1]]);

    const again = await claim(dispatcher(), PLAYER, 1);
    assert.equal(again.status, 409);
    assert.equal(again.body.code, "ALREADY_MINTED");
    assert.equal(chain.minted.length, 1);

    const meta = await expeditionNft.getTrophyMetadata(1, "https://petix.test");
    assert.equal(meta.name, "Sporebeak");
    assert.equal(meta.image, "https://petix.test/assets/expeditions/nft/1.png");
    assert.deepEqual(meta.attributes, [
      { trait_type: "Level", value: 1 },
      { trait_type: "Family", value: "Rubber Hoodie Ducks" },
      { trait_type: "Season", value: 1 },
    ]);
    assert.equal(await expeditionNft.getTrophyMetadata(99, "https://petix.test"), null);
  }, { overrides: { EXPEDITION_NFT_MINT_ENABLED: 1 } });
});

test("claim: without 3★ → 403 NOT_EARNED; nothing sent", async () => {
  await withExpeditionEnv(async ({ dispatcher, store, expeditionNft }) => {
    const chain = createFakeTrophyChain();
    expeditionNft.configureDeps(fastDeps(chain));
    await store.updateWalletProfile(PLAYER, (p) => ({ ...p, expeditions: { ...p.expeditions, progress: { 1: { bestStars: 2 } } } }));
    const res = await claim(dispatcher(), PLAYER, 1);
    assert.equal(res.status, 403);
    assert.equal(res.body.code, "NOT_EARNED");
    assert.equal(chain.minted.length, 0);
  }, { overrides: { EXPEDITION_NFT_MINT_ENABLED: 1 } });
});

test("claim: minting paused → right recorded as pending + queued; the cron mints once the switch is on", async () => {
  await withExpeditionEnv(async ({ dispatcher, store, expeditionNft, patchConfig }) => {
    const chain = createFakeTrophyChain();
    expeditionNft.configureDeps(fastDeps(chain));
    await give3Stars(store, PLAYER, 2);
    const res = await claim(dispatcher(), PLAYER, 2);
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "pending");
    assert.equal((await store.getWalletProfile(PLAYER)).expeditions.progress[2].nft.status, "pending");
    assert.equal(chain.minted.length, 0);

    const skipped = await expeditionNft.processMintQueue();
    assert.equal(skipped.skipped, true);

    await patchConfig({ EXPEDITION_NFT_MINT_ENABLED: 1 });
    const run = await expeditionNft.processMintQueue();
    assert.equal(run.minted, 1, JSON.stringify(run));
    const profile = await store.getWalletProfile(PLAYER);
    assert.equal(profile.expeditions.progress[2].nft.status, "minted");
    assert.equal(profile.expeditions.progress[2].nft.tokenId, 1);
    assert.equal((await expeditionNft.processMintQueue()).processed, 0, "queue is empty afterwards");
  }, { overrides: { EXPEDITION_NFT_MINT_ENABLED: 0 } });
});

test("claim: a failed send → 502 MINT_FAILED, status back to none (the button returns), failure logged", async () => {
  await withExpeditionEnv(async ({ dispatcher, store, expeditionNft }) => {
    const chain = createFakeTrophyChain();
    chain.failNext = "SEND_FAILED";
    expeditionNft.configureDeps(fastDeps(chain));
    await give3Stars(store, PLAYER, 1);
    const res = await claim(dispatcher(), PLAYER, 1);
    assert.equal(res.status, 502);
    assert.equal(res.body.code, "MINT_FAILED");
    const nft = (await store.getWalletProfile(PLAYER)).expeditions.progress[1].nft;
    assert.equal(nft.status, "none");
    assert.equal(nft.error, "SEND_FAILED");
    const retry = await claim(dispatcher(), PLAYER, 1);
    assert.equal(retry.status, 200);
    assert.equal(retry.body.status, "minted");
  }, { overrides: { EXPEDITION_NFT_MINT_ENABLED: 1 } });
});

test("claim: receipt not mined in time → pending with txHash; the cron settles it from the receipt", async () => {
  await withExpeditionEnv(async ({ dispatcher, store, expeditionNft }) => {
    const chain = createFakeTrophyChain({ receiptDelay: 10 });
    expeditionNft.configureDeps({ ...fastDeps(chain), receiptPollAttempts: 2 });
    await give3Stars(store, PLAYER, 3);
    const res = await claim(dispatcher(), PLAYER, 3);
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "pending");
    assert.ok(res.body.txHash);
    assert.equal((await store.getWalletProfile(PLAYER)).expeditions.progress[3].nft.status, "sent");
    chain.polls[res.body.txHash] = 100; // receipt now available
    const run = await expeditionNft.processMintQueue();
    assert.equal(run.minted, 1, JSON.stringify(run));
    assert.equal((await store.getWalletProfile(PLAYER)).expeditions.progress[3].nft.status, "minted");
    assert.equal(chain.minted.length, 1, "no second mint for the same wallet+boss");
  }, { overrides: { EXPEDITION_NFT_MINT_ENABLED: 1 } });
});

test("metadata endpoint is public: token, collection, unknown id", async () => {
  await withExpeditionEnv(async ({ dispatcher, store, expeditionNft }) => {
    const chain = createFakeTrophyChain();
    expeditionNft.configureDeps(fastDeps(chain));
    await give3Stars(store, PLAYER, 7);
    await claim(dispatcher(), PLAYER, 7);
    const path = require("path");
    const handler = require(path.resolve(__dirname, "../../api/expeditions/metadata/[tokenId].js"));
    const token = await invoke(handler, { url: "/api/expeditions/metadata/1", headers: { host: "petix.test", "x-forwarded-proto": "https" } });
    assert.equal(token.status, 200);
    assert.equal(token.body.name, "Hatlaw");
    assert.equal(token.headers["access-control-allow-origin"], "*");
    const collection = await invoke(handler, { url: "/api/expeditions/metadata/collection" });
    assert.equal(collection.status, 200);
    assert.equal(collection.body.name, "Petix Expeditions");
    const missing = await invoke(handler, { url: "/api/expeditions/metadata/42" });
    assert.equal(missing.status, 404);
  }, { overrides: { EXPEDITION_NFT_MINT_ENABLED: 1 } });
});

test("mint-sync: cron secret or admin only; skipped while minting is off", async () => {
  await withExpeditionEnv(async ({ dispatcher, expeditionNft }) => {
    expeditionNft.configureDeps(fastDeps(createFakeTrophyChain()));
    const anon = await invoke(dispatcher(), { url: "/api/expeditions/mint-sync" });
    assert.equal(anon.status, 401);
    const player = await invoke(dispatcher(), { url: "/api/expeditions/mint-sync", headers: sessionHeaders(PLAYER) });
    assert.equal(player.status, 401);
    const cron = await invoke(dispatcher(), { url: "/api/expeditions/mint-sync", headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
    assert.equal(cron.status, 200);
    assert.equal(cron.body.skipped, true);
    const admin = await invoke(dispatcher(), { url: "/api/expeditions/mint-sync", headers: sessionHeaders(ADMIN) });
    assert.equal(admin.status, 200);
  }, { overrides: { EXPEDITION_NFT_MINT_ENABLED: 0 } });
});

test("contract swap: trophies minted on the test collection are invisible on the real one and can be claimed again; the registry is per contract", async () => {
  await withExpeditionEnv(async ({ dispatcher, store, expeditionNft }) => {
    const testChain = createFakeTrophyChain();
    testChain.env.contract = "0x" + "a".repeat(40);
    expeditionNft.configureDeps(fastDeps(testChain));
    await give3Stars(store, PLAYER, 1);
    const first = await claim(dispatcher(), PLAYER, 1);
    assert.equal(first.status, 200);
    assert.equal(first.body.progress.nft.contract, testChain.env.contract);
    assert.equal((await expeditionNft.getTrophyMetadata(1, "https://petix.test")).name, "Sporebeak");

    // Launch: a fresh contract. The old record no longer counts, the queue starts empty.
    const realChain = createFakeTrophyChain();
    realChain.env.contract = "0x" + "b".repeat(40);
    expeditionNft.configureDeps(fastDeps(realChain));
    process.env.EXPEDITION_NFT_CONTRACT = realChain.env.contract;
    const state = await invoke(dispatcher(), { url: "/api/expeditions/state", headers: sessionHeaders(PLAYER) });
    assert.equal(state.body.progress[1].nft, null, "the test-collection trophy is hidden on the real contract");
    assert.equal(await expeditionNft.getTrophyMetadata(1, "https://petix.test"), null, "registry is per contract");
    const second = await claim(dispatcher(), PLAYER, 1);
    assert.equal(second.status, 200, JSON.stringify(second.body));
    assert.equal(realChain.minted.length, 1);
    assert.equal(second.body.progress.nft.contract, realChain.env.contract);
    delete process.env.EXPEDITION_NFT_CONTRACT;
  }, { overrides: { EXPEDITION_NFT_MINT_ENABLED: 1 } });
});

test("EXPEDITION_NFT_TEST_MODE=1: metadata carries neutral names and the placeholder image, no boss art", async () => {
  await withExpeditionEnv(async ({ dispatcher, store, expeditionNft }) => {
    const chain = createFakeTrophyChain();
    chain.env.testMode = true;
    expeditionNft.configureDeps(fastDeps(chain));
    await give3Stars(store, PLAYER, 2);
    await claim(dispatcher(), PLAYER, 2);
    const meta = await expeditionNft.getTrophyMetadata(1, "https://petix.test");
    assert.equal(meta.name, "Petix test trophy #1");
    assert.equal(meta.image, "https://petix.test/assets/nft/placeholder.png");
    assert.ok(!JSON.stringify(meta).includes("Minty Pix") && !JSON.stringify(meta).includes("/assets/expeditions/"));
    const collection = expeditionNft.buildCollectionMetadata("https://petix.test", { testMode: true });
    assert.equal(collection.name, "Petix test trophies");
    assert.equal(collection.image, "https://petix.test/assets/nft/placeholder.png");
  }, { overrides: { EXPEDITION_NFT_MINT_ENABLED: 1 } });
});
