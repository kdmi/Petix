const { normalizeCurrency } = require("./currency");

// Pure slot logic (Farm-экономика, feature 013). No network/FS — config + profile passed in.
// cfg.FREE_SLOTS free slots + up to (MAX_CHARACTER_SLOTS - FREE_SLOTS) paid ones.
// Price escalates per SLOT_PRICES, indexed by how many paid slots the wallet holds.

// Fallback for the pre-020 profiles and tests that pass a config without the key.
const DEFAULT_FREE_SLOTS = 1;

function getFreeSlots(cfg) {
  const n = Math.floor(Number(cfg && cfg.FREE_SLOTS));
  return Number.isFinite(n) && n >= 1 ? n : DEFAULT_FREE_SLOTS;
}

function getPaidSlots(profile) {
  const n = Math.floor(Number(profile && profile.paidSlots) || 0);
  return Math.max(0, n);
}

/** Total character capacity for this wallet (free + purchased), capped at MAX_CHARACTER_SLOTS. */
function getMaxCharacters(profile, cfg) {
  const free = getFreeSlots(cfg);
  const cap = Math.floor(Number(cfg.MAX_CHARACTER_SLOTS) || free);
  return Math.min(cap, free + getPaidSlots(profile));
}

/**
 * Price of the NEXT slot to unlock, or null if the wallet is already at MAX_CHARACTER_SLOTS.
 * The next slot is character #(FREE_SLOTS + paidSlots + 1); price index is paidSlots.
 */
function getNextSlotPrice(profile, cfg) {
  const paid = getPaidSlots(profile);
  const free = getFreeSlots(cfg);
  const cap = Math.floor(Number(cfg.MAX_CHARACTER_SLOTS) || free);
  if (free + paid >= cap) return null;
  const prices = Array.isArray(cfg.SLOT_PRICES) ? cfg.SLOT_PRICES : [];
  const price = prices[paid];
  return typeof price === "number" && Number.isFinite(price) ? price : null;
}

/** 1-based index of the next character slot to unlock (e.g. 2 for the first paid slot). */
function getNextSlotIndex(profile, cfg) {
  return getFreeSlots(cfg) + getPaidSlots(profile) + 1;
}

/**
 * Can the wallet buy the next slot?
 * → { ok:true, price, slotIndex } | { ok:false, reason:"MAX_SLOTS" } |
 *   { ok:false, reason:"INSUFFICIENT_FUNDS", required, balance }
 */
function canBuySlot(profile, cfg) {
  const price = getNextSlotPrice(profile, cfg);
  if (price === null) {
    return { ok: false, reason: "MAX_SLOTS" };
  }
  const balance = normalizeCurrency(profile && profile.currency).balance;
  if (balance < price) {
    return { ok: false, reason: "INSUFFICIENT_FUNDS", required: price, balance };
  }
  return { ok: true, price, slotIndex: getNextSlotIndex(profile, cfg) };
}

/**
 * Кошельки, заведённые при трёх бесплатных слотах, ничего не теряют: при первой
 * же проверке вместимости разница засчитывается как оплаченные слоты. Иначе
 * игрок с тремя питомцами был бы вынужден выкупать уже имеющихся, а его
 * следующая покупка ничего бы не открыла. Возвращает true, если профиль изменён
 * (вызывающий код сохраняет его как часть своей записи).
 */
function grandfatherFreeSlots(profile, cfg) {
  if (!profile) return false;
  const missing = countSlotCharacters(profile) - getFreeSlots(cfg) - getPaidSlots(profile);
  if (missing <= 0) return false;
  profile.paidSlots = getPaidSlots(profile) + missing;
  return true;
}

/**
 * Персонажи, занимающие слоты кошелька. Питомец, запечатанный в капсулу, живёт
 * в NFT, а не в слоте (решение владельца 2026-09-18): он не мешает создать
 * следующего, а у покупателя капсулы не съедает лимит. Слот освобождается в
 * момент посадки, а не продажи.
 */
function countSlotCharacters(profile) {
  const characters = Array.isArray(profile && profile.characters) ? profile.characters : [];
  return characters.filter((record) => !(record && record.nft && record.nft.tokenId)).length;
}

module.exports = {
  DEFAULT_FREE_SLOTS,
  countSlotCharacters,
  getFreeSlots,
  grandfatherFreeSlots,
  getPaidSlots,
  getMaxCharacters,
  getNextSlotPrice,
  getNextSlotIndex,
  canBuySlot,
};
