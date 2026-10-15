const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const { getWalletProfile, updateWalletProfile, createImageStore } = require("./store");
const { createBlobDocument } = require("./blob-doc");
const { requestGeminiImage, shouldUseLiveCharacterGeneration } = require("./character");
const {
  TRY_ON_VARIANTS,
  buildAccessoryPrompt,
  buyItem,
  fail,
  getItem,
  inventoryView,
  listShopItems,
  normalizeSouls,
  normalizeItems,
  normalizeTryOn,
  originalTopItem,
} = require("./souls");

// Souls shop flows (031): buy an item, try it on a pet (up to three renders),
// keep one render. Generation runs outside the profile write — it takes
// seconds — and the result is re-checked inside the write.

// Limited runs (owner 2026-10-13): each item has a global supply and one per
// player. The stock document is the authority: a purchase reserves a unit there
// first (CAS), then charges the souls; a failed charge gives the unit back.
const stockDoc = createBlobDocument({
  path: "shop-stock.json",
  empty: () => ({ version: 1, items: {} }),
  normalize: (d) => ({ version: 1, items: (d && d.items) || {} }),
});

function stockOf(doc, itemId) {
  const entry = (doc.items && doc.items[itemId]) || {};
  return { sold: Math.max(0, Math.floor(Number(entry.sold) || 0)), buyers: { ...(entry.buyers || {}) } };
}

const DEFAULT_DEPS = {
  stock: stockDoc,
  getProfile: getWalletProfile,
  updateProfile: updateWalletProfile,
  imageStore: createImageStore(),
  generate: requestGeminiImage,
  isLive: () => shouldUseLiveCharacterGeneration(),
  readFile: (file) => fs.readFile(file),
  fetchImpl: (...args) => globalThis.fetch(...args),
  now: () => new Date(),
  resnapshot: (character) => require("./nft").resnapshotBoundCharacterImage(character),
};

function resolveDeps(overrides) {
  return { ...DEFAULT_DEPS, ...(overrides || {}) };
}

function findPet(profile, petId) {
  return (profile.characters || []).find((c) => c && c.id === petId && c.status === "completed") || null;
}

async function readPetImage(pet, deps) {
  const image = pet.image || {};
  if (image.filePath) {
    return { base64: (await deps.readFile(image.filePath)).toString("base64"), mimeType: image.mimeType || "image/png" };
  }
  const url = image.url || pet.imageUrl;
  if (url && /^https?:/i.test(url)) {
    const res = await deps.fetchImpl(url);
    if (!res.ok) throw fail(502, "PET_IMAGE_UNAVAILABLE", "Could not read the pet picture.");
    const buffer = Buffer.from(await res.arrayBuffer());
    return { base64: buffer.toString("base64"), mimeType: res.headers.get("content-type") || image.mimeType || "image/png" };
  }
  throw fail(409, "PET_IMAGE_UNAVAILABLE", "This pet has no picture to dress up.");
}

async function readItemImage(item, deps) {
  const buffer = await deps.readFile(path.join(process.cwd(), item.file));
  return { base64: buffer.toString("base64"), mimeType: "image/png" };
}

/** A try-on whose pet or item is gone is dead weight — drop it. */
function liveTryOn(profile) {
  const tryOn = normalizeTryOn(profile.tryOn);
  if (!tryOn) return null;
  if (!findPet(profile, tryOn.petId)) return null;
  if (!normalizeItems(profile.items).some((i) => i.uid === tryOn.itemUid)) return null;
  return tryOn;
}

function tryOnView(tryOn) {
  if (!tryOn) return null;
  return {
    petId: tryOn.petId,
    itemUid: tryOn.itemUid,
    itemId: tryOn.itemId,
    variants: tryOn.variants.map((v) => ({ id: v.id, imageUrl: `/api/shop/variant?id=${encodeURIComponent(v.id)}` })),
    rendersLeft: Math.max(0, TRY_ON_VARIANTS - tryOn.variants.length),
    maxRenders: TRY_ON_VARIANTS,
  };
}

/** The catalog as this wallet sees it: price, units left, whether it already bought one. */
async function shopView(wallet, depOverrides) {
  const deps = resolveDeps(depOverrides);
  const { data } = await deps.stock.read();
  const me = String(wallet || "").toLowerCase();
  return listShopItems().map((item) => {
    const stock = stockOf(data, item.id);
    const left = item.supply ? Math.max(0, item.supply - stock.sold) : null;
    return { ...item, left, soldOut: item.supply ? left === 0 : false, bought: Boolean(me && stock.buyers[me]) };
  });
}

async function buy(wallet, itemId, depOverrides) {
  const deps = resolveDeps(depOverrides);
  const item = getItem(itemId);
  if (!item) throw fail(404, "ITEM_UNKNOWN", "This item is not sold.");
  const me = String(wallet).toLowerCase();

  // Cheap refusal before touching the shared stock.
  const before = await deps.getProfile(wallet);
  if (normalizeSouls(before.souls).balance < item.price) throw fail(402, "NOT_ENOUGH_SOULS", "Not enough souls.", { required: item.price });

  await deps.stock.mutate((doc) => {
    const stock = stockOf(doc, item.id);
    if (item.perWallet && stock.buyers[me]) throw fail(409, "ALREADY_BOUGHT", `You already bought ${item.name}. One per player.`);
    if (item.supply && stock.sold >= item.supply) throw fail(409, "SOLD_OUT", `${item.name} is sold out.`);
    doc.items = { ...(doc.items || {}), [item.id]: { sold: stock.sold + 1, buyers: { ...stock.buyers, [me]: deps.now().toISOString() } } };
    return doc;
  });

  let entry = null;
  let profile;
  try {
    profile = await deps.updateProfile(wallet, (current) => {
      entry = buyItem(current, itemId, { now: deps.now() });
      return current;
    });
  } catch (error) {
    // Souls ran out between the check and the charge: give the unit back.
    await deps.stock.mutate((doc) => {
      const stock = stockOf(doc, item.id);
      if (stock.buyers[me]) {
        delete stock.buyers[me];
        doc.items = { ...(doc.items || {}), [item.id]: { sold: Math.max(0, stock.sold - 1), buyers: stock.buyers } };
      }
      return doc;
    }).catch(() => null);
    throw error;
  }
  return { bought: entry, souls: profile.souls, items: inventoryView(profile), shop: await shopView(wallet, depOverrides) };
}

/**
 * Render one more variant of `petId` wearing the item `itemUid`. The first call
 * starts the fitting; later calls add re-rolls until three variants exist.
 * While a fitting is open, the item can't be tried on another pet.
 */
async function tryOn(wallet, { petId, itemUid }, depOverrides) {
  const deps = resolveDeps(depOverrides);
  const profile = await deps.getProfile(wallet);
  const pet = findPet(profile, String(petId || ""));
  if (!pet) throw fail(404, "PET_NOT_FOUND", "Pet not found.");
  const owned = normalizeItems(profile.items).find((i) => i.uid === String(itemUid || ""));
  if (!owned) throw fail(404, "ITEM_NOT_OWNED", "You don't have this item.");
  const item = getItem(owned.itemId);

  const open = liveTryOn(profile);
  if (open && (open.petId !== pet.id || open.itemUid !== owned.uid)) {
    throw fail(409, "TRY_ON_OPEN", "Finish the fitting you started first.", { tryOn: tryOnView(open) });
  }
  const done = open ? open.variants.length : 0;
  if (done >= TRY_ON_VARIANTS) throw fail(409, "TRY_ON_LIMIT", "No re-rolls left — pick one of the variants.", { tryOn: tryOnView(open) });

  const [petImage, itemImage] = await Promise.all([readPetImage(pet, deps), readItemImage(item, deps)]);
  const variantId = `acc-${pet.id}-${crypto.randomBytes(5).toString("hex")}`;
  let image;
  const generated = await deps.generate(buildAccessoryPrompt(item, pet), [petImage, itemImage]);
  if (generated && generated.base64) {
    const ext = /jpe?g/i.test(generated.mimeType) ? "jpg" : /webp/i.test(generated.mimeType) ? "webp" : "png";
    const stored = await deps.imageStore.writeImageBuffer(variantId, ext, Buffer.from(generated.base64, "base64"), generated.mimeType);
    image = { provider: "gemini", mimeType: generated.mimeType, ...stored, generatedAt: deps.now().toISOString() };
  } else if (!deps.isLive()) {
    // Live generation off (dev without a Gemini key): the "render" is the pet as it is, so the flow can be clicked through.
    const stored = await deps.imageStore.writeImageBuffer(variantId, "png", Buffer.from(petImage.base64, "base64"), petImage.mimeType);
    image = { provider: "mock", mimeType: petImage.mimeType, ...stored, generatedAt: deps.now().toISOString() };
  } else {
    throw fail(502, "RENDER_FAILED", "The artist couldn't draw it this time — try again.");
  }

  let view = null;
  await deps.updateProfile(wallet, (current) => {
    const live = liveTryOn(current);
    const base = live && live.petId === pet.id && live.itemUid === owned.uid
      ? live
      : { petId: pet.id, itemUid: owned.uid, itemId: item.id, variants: [], startedAt: deps.now().toISOString() };
    if (base.variants.length >= TRY_ON_VARIANTS) throw fail(409, "TRY_ON_LIMIT", "No re-rolls left — pick one of the variants.");
    base.variants = [...base.variants, { id: variantId, image, createdAt: deps.now().toISOString() }];
    current.tryOn = base;
    view = tryOnView(base);
    return current;
  });
  return { tryOn: view };
}

/** Keep one variant: it becomes the pet's picture, the item is consumed and stays on the pet. */
async function apply(wallet, { variantId }, depOverrides) {
  const deps = resolveDeps(depOverrides);
  let petId = null;
  const profile = await deps.updateProfile(wallet, (current) => {
    const open = liveTryOn(current);
    if (!open) throw fail(404, "TRY_ON_MISSING", "There is no fitting to finish.");
    const variant = open.variants.find((v) => v.id === String(variantId || ""));
    if (!variant) throw fail(404, "VARIANT_NOT_FOUND", "Pick one of the variants.");
    const item = getItem(open.itemId);
    const pet = findPet(current, open.petId);
    const now = deps.now().toISOString();
    pet.image = { ...variant.image };
    delete pet.imageUrl;
    pet.updatedAt = now;
    // One headwear slot: the new item replaces whatever was there, bonus included.
    // Remember the pet's own headwear before TOP_ITEM is overwritten: later fittings must still name it to remove it.
    pet.accessory = { itemId: item.id, appliedAt: now, replacedTopItem: originalTopItem(pet) || null };
    // TOP_ITEM drives the "Top Item" trait on OpenSea and future prompts.
    pet.variables = { ...(pet.variables || {}), TOP_ITEM: item.name };
    current.items = normalizeItems(current.items).filter((i) => i.uid !== open.itemUid);
    current.tryOn = null;
    petId = pet.id;
    return current;
  });
  // A pet sitting in a capsule: the NFT gets the new picture too (fresh snapshot)
  // and the new Top Item trait; OpenSea is asked to re-read it. No-op without NFT env.
  let nftImage = null;
  const dressed = (profile.characters || []).find((c) => c.id === petId);
  try {
    nftImage = await deps.resnapshot(dressed);
  } catch (error) {
    console.warn("[shop] capsule image update failed", error.message);
  }
  return { petId, items: inventoryView(profile), tryOn: null, nftImageUpdated: Boolean(nftImage) };
}

async function variantImage(wallet, variantId, depOverrides) {
  const deps = resolveDeps(depOverrides);
  const profile = await deps.getProfile(wallet);
  const open = normalizeTryOn(profile.tryOn);
  const variant = open && open.variants.find((v) => v.id === String(variantId || ""));
  if (!variant) throw fail(404, "VARIANT_NOT_FOUND", "Variant not found.");
  return variant.image;
}

function currentTryOn(profile) {
  return tryOnView(liveTryOn(profile));
}

module.exports = { apply, buy, currentTryOn, resolveDeps, shopView, stockDoc, tryOn, tryOnView, variantImage };
