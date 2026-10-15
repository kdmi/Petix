const test = require("node:test");
const assert = require("node:assert/strict");

const S = require("../../api/_lib/souls");
const shop = require("../../api/_lib/shop");

// Souls shop (031): Halo and Devil Horns for souls, 25 of each, one per player;
// putting an item on a pet redraws it, the item becomes its Top Item.

const WALLET = `0x${"ab".repeat(20)}`;

function memoryProfiles(initial) {
  let profile = JSON.parse(JSON.stringify(initial));
  return {
    get: () => profile,
    getProfile: async () => JSON.parse(JSON.stringify(profile)),
    updateProfile: async (_w, mutate) => { const next = mutate(JSON.parse(JSON.stringify(profile))); profile = next; return JSON.parse(JSON.stringify(profile)); },
  };
}

function pet(extra = {}) {
  return { id: "pet-1", status: "completed", name: "Brain Dragon", level: 3, rarity: "Common", attributes: { strength: 10, stamina: 5, agility: 3, intelligence: 2 }, image: { filePath: "/pet.png", mimeType: "image/png" }, variables: { TOP_ITEM: "a straw hat" }, ...extra };
}

function memoryStock() {
  let doc = { version: 1, items: {} };
  return { get: () => doc, read: async () => ({ data: JSON.parse(JSON.stringify(doc)) }), mutate: async (fn) => { const next = await fn(JSON.parse(JSON.stringify(doc))); doc = next || doc; return doc; } };
}

test("shop: buying costs souls, refuses when short, puts the item in the inventory", async () => {
  const mem = memoryProfiles({ souls: { balance: 60000, totalEarned: 60000 }, items: [], characters: [] });
  const stock = memoryStock();
  const r = await shop.buy(WALLET, "halo", { getProfile: mem.getProfile, updateProfile: mem.updateProfile, stock });
  assert.equal(r.souls.balance, 10000);
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].item.name, "Halo");
  await assert.rejects(() => shop.buy(WALLET, "devil-horns", { getProfile: mem.getProfile, updateProfile: mem.updateProfile, stock }), (e) => e.httpCode === "NOT_ENOUGH_SOULS");
  await assert.rejects(() => shop.buy(WALLET, "crown", { getProfile: mem.getProfile, updateProfile: mem.updateProfile, stock }), (e) => e.httpCode === "ITEM_UNKNOWN");
  assert.equal(stock.get().items["devil-horns"], undefined, "a refused purchase reserves nothing");
});

test("shop stock: 25 per item across all players, one per player, sold out after the last unit", async () => {
  const stock = memoryStock();
  const rich = () => memoryProfiles({ souls: { balance: 10 ** 7, totalEarned: 0 }, items: [], characters: [] });
  const walletN = (n) => `0x${n.toString(16).padStart(40, "0")}`;
  const first = rich();
  await shop.buy(walletN(1), "halo", { getProfile: first.getProfile, updateProfile: first.updateProfile, stock });
  await assert.rejects(() => shop.buy(walletN(1), "halo", { getProfile: first.getProfile, updateProfile: first.updateProfile, stock }), (e) => e.httpCode === "ALREADY_BOUGHT");
  for (let n = 2; n <= 25; n += 1) {
    const m = rich();
    await shop.buy(walletN(n), "halo", { getProfile: m.getProfile, updateProfile: m.updateProfile, stock });
  }
  const late = rich();
  await assert.rejects(() => shop.buy(walletN(26), "halo", { getProfile: late.getProfile, updateProfile: late.updateProfile, stock }), (e) => e.httpCode === "SOLD_OUT");
  assert.equal(stock.get().items.halo.sold, 25);
  const view = await shop.shopView(walletN(1), { stock });
  const halo = view.find((i) => i.id === "halo");
  assert.deepEqual([halo.left, halo.soldOut, halo.bought], [0, true, true]);
  const horns = view.find((i) => i.id === "devil-horns");
  assert.deepEqual([horns.left, horns.soldOut, horns.bought], [25, false, false]);
});

test("shop stock: a failed charge gives the reserved unit back", async () => {
  const stock = memoryStock();
  const mem = memoryProfiles({ souls: { balance: 60000, totalEarned: 0 }, items: [], characters: [] });
  const failing = { getProfile: mem.getProfile, updateProfile: async () => { throw Object.assign(new Error("Not enough souls."), { httpStatus: 402, httpCode: "NOT_ENOUGH_SOULS" }); }, stock };
  await assert.rejects(() => shop.buy(WALLET, "halo", failing), (e) => e.httpCode === "NOT_ENOUGH_SOULS");
  assert.equal(stock.get().items.halo.sold, 0);
  assert.deepEqual(stock.get().items.halo.buyers, {});
});

test("try-on: up to three renders, item locked to the fitting, apply consumes the item and dresses the pet", async () => {
  const mem = memoryProfiles({ souls: { balance: 0, totalEarned: 0 }, items: [{ uid: "itm_1", itemId: "devil-horns", price: 50000 }, { uid: "itm_2", itemId: "halo", price: 50000 }], characters: [pet(), pet({ id: "pet-2" })] });
  const prompts = [];
  let n = 0;
  const deps = {
    getProfile: mem.getProfile,
    updateProfile: mem.updateProfile,
    readFile: async () => Buffer.from("png-bytes"),
    generate: async (prompt, refs) => { prompts.push({ prompt, refs: refs.length }); return { base64: Buffer.from(`render-${++n}`).toString("base64"), mimeType: "image/png" }; },
    isLive: () => true,
    imageStore: { writeImageBuffer: async (id, ext) => ({ filePath: `/tmp/${id}.${ext}` }) },
  };
  const first = await shop.tryOn(WALLET, { petId: "pet-1", itemUid: "itm_1" }, deps);
  assert.equal(first.tryOn.variants.length, 1);
  assert.equal(first.tryOn.rendersLeft, 2);
  assert.equal(prompts[0].refs, 2, "pet picture + item picture");
  assert.match(prompts[0].prompt, /Remove a straw hat completely/, "the pet's own headwear is named");

  await assert.rejects(() => shop.tryOn(WALLET, { petId: "pet-2", itemUid: "itm_1" }, deps), (e) => e.httpCode === "TRY_ON_OPEN");
  await shop.tryOn(WALLET, { petId: "pet-1", itemUid: "itm_1" }, deps);
  const third = await shop.tryOn(WALLET, { petId: "pet-1", itemUid: "itm_1" }, deps);
  assert.equal(third.tryOn.rendersLeft, 0);
  await assert.rejects(() => shop.tryOn(WALLET, { petId: "pet-1", itemUid: "itm_1" }, deps), (e) => e.httpCode === "TRY_ON_LIMIT");

  const pick = third.tryOn.variants[1].id;
  const done = await shop.apply(WALLET, { variantId: pick }, deps);
  assert.equal(done.items.length, 1, "horns consumed, halo left");
  const saved = mem.get().characters.find((c) => c.id === "pet-1");
  assert.equal(saved.accessory.itemId, "devil-horns");
  assert.equal(saved.variables.TOP_ITEM, "Devil Horns", "Top Item trait on OpenSea");
  assert.match(saved.image.filePath, /acc-pet-1-/);
  assert.equal(mem.get().tryOn, null);

  assert.equal(saved.accessory.replacedTopItem, "a straw hat", "the original headwear is kept after TOP_ITEM is overwritten");

  // Halo on the same pet replaces the horns (one headwear slot) — the prompt still names the straw hat.
  const halo = await shop.tryOn(WALLET, { petId: "pet-1", itemUid: "itm_2" }, deps);
  assert.match(prompts[prompts.length - 1].prompt, /Remove a straw hat and Devil Horns completely/);
  await shop.apply(WALLET, { variantId: halo.tryOn.variants[0].id }, deps);
  const after = mem.get().characters.find((c) => c.id === "pet-1");
  assert.equal(after.accessory.itemId, "halo");
  assert.equal(after.variables.TOP_ITEM, "Halo");
});

test("capsule pet: putting on an item re-snapshots the NFT picture and points the binding at it", async () => {
  const saved = { NFT_ENABLED: process.env.NFT_ENABLED, NFT_OPENSEA_API_KEY: process.env.NFT_OPENSEA_API_KEY };
  process.env.NFT_ENABLED = "1";
  delete process.env.NFT_OPENSEA_API_KEY;
  try {
    const nft = require("../../api/_lib/nft");
    let state = { bindings: { 7: { characterId: "pet-1", wallet: WALLET, imageUri: "ipfs://old", imageGatewayUrl: "https://gw/ipfs/old" } } };
    const snaps = [];
    const deps = {
      now: () => 1791900000000,
      snapshotImage: async (tokenId, character, opts) => { snaps.push({ tokenId, id: character.id, version: opts.version }); return { imageUri: "ipfs://new", imageGatewayUrl: "https://gw/ipfs/new" }; },
      store: {
        getBindingByCharacterId: async (id) => (state.bindings[7].characterId === id ? { tokenId: 7, ...state.bindings[7] } : null),
        withNftState: async (fn) => { state = (await fn(JSON.parse(JSON.stringify(state)))) || state; return state; },
      },
    };
    const uri = await nft.resnapshotBoundCharacterImage(pet({ accessory: { itemId: "halo" } }), deps);
    assert.equal(uri, "ipfs://new");
    assert.equal(snaps[0].tokenId, 7);
    assert.ok(snaps[0].version, "a new write-once file, not the bind-time one");
    assert.equal(state.bindings[7].imageUri, "ipfs://new");
    assert.equal(state.bindings[7].imageGatewayUrl, "https://gw/ipfs/new");
    assert.ok(state.bindings[7].imageUpdatedAt);

    const none = await nft.resnapshotBoundCharacterImage(pet({ id: "pet-9" }), deps);
    assert.equal(none, null, "a pet outside a capsule changes nothing");
    assert.equal(snaps.length, 1);
  } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});

test("apply on a capsule pet calls the NFT re-snapshot with the dressed pet", async () => {
  const mem = memoryProfiles({ items: [{ uid: "itm_1", itemId: "halo", price: 50000 }], characters: [pet({ nft: { tokenId: 7 } })] });
  let dressed = null;
  const deps = {
    getProfile: mem.getProfile, updateProfile: mem.updateProfile,
    readFile: async () => Buffer.from("png"), isLive: () => true,
    generate: async () => ({ base64: Buffer.from("r").toString("base64"), mimeType: "image/png" }),
    imageStore: { writeImageBuffer: async (id) => ({ filePath: `/tmp/${id}.png` }) },
    resnapshot: async (character) => { dressed = character; return "ipfs://new"; },
  };
  const t = await shop.tryOn(WALLET, { petId: "pet-1", itemUid: "itm_1" }, deps);
  const r = await shop.apply(WALLET, { variantId: t.tryOn.variants[0].id }, deps);
  assert.equal(r.nftImageUpdated, true);
  assert.equal(dressed.variables.TOP_ITEM, "Halo");
  assert.match(dressed.image.filePath, /acc-pet-1-/, "the snapshot is taken from the new picture");
});

test("items are team badges, not buffs: Halo = Good team, Devil Horns = Bad team", () => {
  assert.equal(S.accessoryOf(pet({ accessory: { itemId: "halo" } })).teamLabel, "Good team");
  assert.equal(S.accessoryOf(pet({ accessory: { itemId: "devil-horns" } })).teamLabel, "Bad team");
  assert.equal(S.accessoryOf(pet()), null);
  assert.deepEqual(S.listShopItems().map((i) => [i.id, i.teamLabel, i.price, i.supply, i.perWallet]), [["halo", "Good team", 50000, 25, 1], ["devil-horns", "Bad team", 50000, 25, 1]]);
});
