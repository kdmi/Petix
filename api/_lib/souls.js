const crypto = require("crypto");

// Souls (031): a third in-game currency next to Points and energy.
// Souls never leave the game: no withdrawal, no conversion back. They come in by
// burning a pet (SOULS_PER_BURN_LEVEL per level, none at Lvl. 1) and by
// exchanging energy (SOULS_EXCHANGE_ENERGY → SOULS_EXCHANGE_SOULS). They go out on
// redistributing a pet's points (SOULS_RESPEC_PER_LEVEL per level) and in the
// Souls shop: items a pet wears on its head (see SHOP_ITEMS below).

const SOULS_PER_BURN_LEVEL_DEFAULT = 1000;
const SOULS_RESPEC_PER_LEVEL_DEFAULT = 3000;
const STATS = ["stamina", "agility", "strength", "intelligence"];

// ---- Souls shop (031) ----------------------------------------------------------
// Buying puts the item in the inventory; putting it on a pet redraws the pet with
// the item (Gemini, the pet image and the item image as references), the player
// keeps one of up to three renders, the item is consumed and stays on the pet as
// `character.accessory` — the single headwear slot. It also becomes TOP_ITEM, the
// "Top Item" trait on OpenSea. Items carry no stats: they show the pet's team.
const TRY_ON_VARIANTS = 3; // the first render plus two re-rolls

const SHOP_ITEMS = Object.freeze([
  Object.freeze({
    id: "halo",
    name: "Halo",
    price: 50000,
    supply: 25, // limited run across all players (owner 2026-10-15: 25, was 50)
    perWallet: 1, // one per player, ever
    // Owner 2026-10-13: items give no stat bonus — they show which side the pet is on.
    team: "good",
    teamLabel: "Good team",
    description: "I'm playing for the good team.",
    img: "/assets/souls/items/halo.jpg?v=2",
    file: "assets/souls/items/halo.png",
    prompt: "a glowing golden halo with two small white wings and amber gems, floating level just above its head, centred and not touching it",
  }),
  Object.freeze({
    id: "devil-horns",
    name: "Devil Horns",
    price: 50000,
    supply: 25,
    perWallet: 1,
    team: "bad",
    teamLabel: "Bad team",
    description: "I'm playing for the bad team.",
    img: "/assets/souls/items/devil-horns.jpg?v=3",
    file: "assets/souls/items/devil-horns.png",
    prompt: "exactly two curved glowing red devil horns in total, one at the upper left corner and one at the upper right corner of its head, symmetric, pointing up and slightly outward, growing out of its body as if they were always part of it (no headband, no hat, no extra horns)",
  }),
]);



function fail(status, code, message, extra) {
  const error = new Error(message);
  error.httpStatus = status;
  error.httpCode = code;
  if (extra) Object.assign(error, extra);
  return error;
}

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function normalizeSouls(raw) {
  if (!raw || typeof raw !== "object") return { balance: 0, totalEarned: 0 };
  return { balance: toInt(raw.balance), totalEarned: toInt(raw.totalEarned) };
}

function creditSouls(profile, amount) {
  const add = toInt(amount);
  const souls = normalizeSouls(profile.souls);
  profile.souls = { balance: souls.balance + add, totalEarned: souls.totalEarned + add };
  return add;
}

function soulsForBurn(level, cfg) {
  const perLevel = cfg && cfg.SOULS_PER_BURN_LEVEL != null ? toInt(cfg.SOULS_PER_BURN_LEVEL) : SOULS_PER_BURN_LEVEL_DEFAULT;
  // Owner 2026-10-14: no soul at Lvl. 1, otherwise "create a pet, burn it" farms souls for Points.
  // From Lvl. 2 it's the full level × per-level amount (Lvl. 2 = 2 000), easy to count.
  const lvl = Math.max(1, Math.floor(Number(level) || 1));
  return lvl < 2 ? 0 : lvl * perLevel;
}

// ---- energy → souls exchange --------------------------------------------------
// Owner 2026-10-15: 50 energy → 5 000 souls, from the header souls popup.
// Any energy counts, spent in the same order as a fight: today's free energy first
// (it burns at midnight anyway), then gifted, then bought. No unlimited-admin
// shortcut: an exchange needs real energy.

function exchangeOffer(cfg) {
  const energy = Math.max(1, toInt(cfg && cfg.SOULS_EXCHANGE_ENERGY != null ? cfg.SOULS_EXCHANGE_ENERGY : 50));
  const souls = toInt(cfg && cfg.SOULS_EXCHANGE_SOULS != null ? cfg.SOULS_EXCHANGE_SOULS : 5000);
  return { energy, souls };
}

/** All energy the wallet has right now: today's free + gifted + bought. */
function exchangeableEnergy(battleState, { now = new Date(), bonusEnergy = 0 } = {}) {
  return require("./battle-energy").normalizeBattleState(battleState, { now, bonusEnergy }).energyCurrent;
}

/** One exchange inside a profile write (mutates the profile). Throws 409 when there is not enough energy. */
function exchangeEnergyForSouls(profile, cfg, { now = new Date(), bonusEnergy = 0 } = {}) {
  const { consumeBattleEnergy } = require("./battle-energy");
  const offer = exchangeOffer(cfg);
  const have = exchangeableEnergy(profile.battleState, { now, bonusEnergy });
  if (have < offer.energy) {
    throw fail(409, "NOT_ENOUGH_ENERGY", `You need ${offer.energy} energy.`, { required: offer.energy, balance: have });
  }
  // wallet is left out on purpose: the unlimited-energy admin rule must not mint souls.
  profile.battleState = consumeBattleEnergy(profile.battleState, { now, amount: offer.energy, bonusEnergy });
  const soulsGained = creditSouls(profile, offer.souls);
  return { energySpent: offer.energy, soulsGained };
}

function debitSouls(profile, amount) {
  const cost = toInt(amount);
  const souls = normalizeSouls(profile.souls);
  if (souls.balance < cost) throw fail(402, "NOT_ENOUGH_SOULS", "Not enough souls.", { required: cost, balance: souls.balance });
  profile.souls = { ...souls, balance: souls.balance - cost };
  return cost;
}

/** Redistributing a pet's points: souls per pet level (owner 2026-10-15: 3 000 x level). */
function respecPrice(level, cfg) {
  const perLevel = cfg && cfg.SOULS_RESPEC_PER_LEVEL != null ? toInt(cfg.SOULS_RESPEC_PER_LEVEL) : SOULS_RESPEC_PER_LEVEL_DEFAULT;
  return Math.max(1, Math.floor(Number(level) || 1)) * perLevel;
}

/**
 * Redistribute a pet's points inside a profile write (mutates the profile).
 * The pet keeps its total: points in stats plus unspent ones can go to any
 * stat, and some may stay unspent. Charges souls; throws a 4xx error otherwise.
 */
function applyRespec(profile, petId, attributes, cfg, now = new Date()) {
  const pet = (profile.characters || []).find((c) => c && String(c.id) === String(petId || ""));
  if (!pet) throw fail(404, "NOT_FOUND", "Pet not found.");
  if (String(pet.status || "").toLowerCase() !== "completed") throw fail(400, "NOT_COMPLETED", "Only completed pets can be changed.");
  const next = {};
  for (const key of STATS) {
    const n = Number(attributes && attributes[key]);
    if (!Number.isInteger(n) || n < 0) throw fail(400, "BAD_ALLOCATION", "Each stat must be a whole number, 0 or more.");
    next[key] = n;
  }
  const was = pet.attributes || {};
  const current = (key) => toInt(was[key]);
  const spare = toInt(pet.attributePointsAvailable);
  const total = STATS.reduce((sum, key) => sum + current(key), 0) + spare;
  const used = STATS.reduce((sum, key) => sum + next[key], 0);
  if (used > total) throw fail(400, "BAD_ALLOCATION", `This pet has ${total} points in total.`, { required: total });
  if (STATS.every((key) => next[key] === current(key))) throw fail(400, "NOTHING_CHANGED", "Move at least one point first.");
  const price = respecPrice(pet.level, cfg);
  debitSouls(profile, price);
  pet.attributes = { ...was, ...next };
  pet.attributePointsAvailable = total - used;
  pet.updatedAt = now.toISOString();
  return { pet, price };
}

function getItem(itemId) {
  return SHOP_ITEMS.find((item) => item.id === String(itemId || "")) || null;
}

function publicItem(item) {
  return { id: item.id, name: item.name, price: item.price, supply: item.supply || null, perWallet: item.perWallet || null, team: item.team, teamLabel: item.teamLabel, description: item.description, img: item.img };
}

function listShopItems() {
  return SHOP_ITEMS.map(publicItem);
}

function normalizeItems(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry) => entry && typeof entry === "object" && entry.uid && getItem(entry.itemId))
    .map((entry) => ({ uid: String(entry.uid), itemId: String(entry.itemId), boughtAt: entry.boughtAt ? String(entry.boughtAt) : null, price: toInt(entry.price) }));
}

function normalizeSolana(raw) {
  if (!raw || typeof raw !== "object" || !raw.address) return null;
  return { address: String(raw.address), linkedAt: raw.linkedAt ? String(raw.linkedAt) : null };
}

function normalizeTryOn(raw) {
  if (!raw || typeof raw !== "object" || !raw.petId || !raw.itemUid) return null;
  const variants = Array.isArray(raw.variants)
    ? raw.variants.filter((v) => v && v.id && v.image && typeof v.image === "object").map((v) => ({ id: String(v.id), image: { ...v.image }, createdAt: v.createdAt ? String(v.createdAt) : null }))
    : [];
  return { petId: String(raw.petId), itemUid: String(raw.itemUid), itemId: String(raw.itemId || ""), variants, startedAt: raw.startedAt ? String(raw.startedAt) : null };
}

// ---- shop ---------------------------------------------------------------------

/** Buy one item into the inventory. Mutates the profile; returns the new inventory entry. */
function buyItem(profile, itemId, { now = new Date() } = {}) {
  const item = getItem(itemId);
  if (!item) throw fail(404, "ITEM_UNKNOWN", "This item is not sold.");
  debitSouls(profile, item.price);
  const entry = { uid: `itm_${crypto.randomUUID()}`, itemId: item.id, boughtAt: now.toISOString(), price: item.price };
  profile.items = [...normalizeItems(profile.items), entry];
  return entry;
}

function inventoryView(profile) {
  return normalizeItems(profile.items).map((entry) => ({ ...entry, item: publicItem(getItem(entry.itemId)) }));
}

// ---- accessories --------------------------------------------------------------

function accessoryOf(character) {
  const acc = character && character.accessory;
  if (!acc || typeof acc !== "object") return null;
  const item = getItem(acc.itemId);
  return item ? { itemId: item.id, name: item.name, appliedAt: acc.appliedAt || null, team: item.team, teamLabel: item.teamLabel, img: item.img } : null;
}

/**
 * The pet's own headwear from its creation (variables.TOP_ITEM at generation time).
 * Putting an item on overwrites TOP_ITEM with the item's name, so the original is kept in
 * accessory.replacedTopItem; older pets fall back to their stored image prompt
 * ("On its top, it has X.").
 */
function originalTopItem(character) {
  const acc = character && character.accessory;
  if (acc && acc.replacedTopItem) return String(acc.replacedTopItem).trim();
  const fromPrompt = String((character && character.prompts && character.prompts.image) || "").match(/On its top, it has ([^.\n]+)\./);
  if (fromPrompt) return fromPrompt[1].trim();
  if (!acc) return String((character && character.variables && character.variables.TOP_ITEM) || "").trim();
  return "";
}

/** Everything on top of the pet's head that the new item has to replace, by name. */
function topItemsToRemove(character, item) {
  const list = [originalTopItem(character)];
  const current = accessoryOf(character);
  if (current && current.itemId !== item.id) list.push(current.name);
  return [...new Set(list.map((v) => String(v || "").trim()).filter(Boolean))];
}

function buildAccessoryPrompt(item, character) {
  const name = character?.name || character?.displayName || "the pet";
  const remove = topItemsToRemove(character, item);
  const what = remove.join(" and ");
  return [
    "You are given two images.",
    `Image 1 is a pixel-art pet character named ${name}. Image 2 is an accessory: ${item.name}.`,
    remove.length
      ? `On top of its head the character currently has: ${what}. Remove ${what} completely, so that no part of ${remove.length > 1 ? "them" : "it"} remains, and put the accessory from image 2 in its place: ${item.prompt}.`
      : `Put the accessory from image 2 on the character: ${item.prompt}.`,
    "Nothing else may stay on top of its head: if there is any other hat, cap, crown, helmet, hood, headband, bandana, horns, halo, bow or flower up there, remove it too.",
    // Organic fit (owner 2026-10-14): horns used to sit on the top face like a hat.
    "Make the accessory look like a natural part of this character, not a sticker on top: fit it to the character's own head shape and size, place it where such an item naturally belongs on this body, and match the character's perspective, lighting, outline and shading.",
    "For a cube- or box-shaped body the head is the upper part of the cube, seen in the same 3/4 view as the body.",
    "Draw the accessory exactly once, in the same count of parts as in image 2 (for example two horns means two horns in total, never four).",
    "Keep everything else exactly as it is: the same character, body, face, pose, colors, pixel-art style, outline thickness, background, framing and size.",
    "Take only the accessory from image 2: ignore its background, glow circle and shadow.",
    "Draw the accessory in the same pixel-art style as the character, sized to fit its head. Return one square image.",
  ].join(" ");
}

module.exports = {
  SHOP_ITEMS,
  fail,
  TRY_ON_VARIANTS,
  accessoryOf,
  buildAccessoryPrompt,
  buyItem,
  getItem,
  inventoryView,
  listShopItems,
  normalizeItems,
  normalizeTryOn,
  normalizeSolana,
  originalTopItem,
  publicItem,
  topItemsToRemove,
  SOULS_PER_BURN_LEVEL_DEFAULT,
  SOULS_RESPEC_PER_LEVEL_DEFAULT,
  applyRespec,
  debitSouls,
  respecPrice,
  creditSouls,
  exchangeEnergyForSouls,
  exchangeOffer,
  exchangeableEnergy,
  normalizeSouls,
  soulsForBurn,
};
