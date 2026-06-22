const { normalizeCurrency } = require("./currency");

// Pure slot logic (Farm-экономика, feature 013). No network/FS — config + profile passed in.
// 3 free slots + up to (MAX_CHARACTER_SLOTS - 3) paid slots. Price escalates per SLOT_PRICES.

const FREE_SLOTS = 3;

function getPaidSlots(profile) {
  const n = Math.floor(Number(profile && profile.paidSlots) || 0);
  return Math.max(0, n);
}

/** Total character capacity for this wallet (free + purchased), capped at MAX_CHARACTER_SLOTS. */
function getMaxCharacters(profile, cfg) {
  const cap = Math.floor(Number(cfg.MAX_CHARACTER_SLOTS) || FREE_SLOTS);
  return Math.min(cap, FREE_SLOTS + getPaidSlots(profile));
}

/**
 * Price of the NEXT slot to unlock, or null if the wallet is already at MAX_CHARACTER_SLOTS.
 * The next slot is character #(FREE_SLOTS + paidSlots + 1); price index is paidSlots.
 */
function getNextSlotPrice(profile, cfg) {
  const paid = getPaidSlots(profile);
  const cap = Math.floor(Number(cfg.MAX_CHARACTER_SLOTS) || FREE_SLOTS);
  if (FREE_SLOTS + paid >= cap) return null;
  const prices = Array.isArray(cfg.SLOT_PRICES) ? cfg.SLOT_PRICES : [];
  const price = prices[paid];
  return typeof price === "number" && Number.isFinite(price) ? price : null;
}

/** 1-based index of the next character slot to unlock (e.g. 4 for the first paid slot). */
function getNextSlotIndex(profile) {
  return FREE_SLOTS + getPaidSlots(profile) + 1;
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
  return { ok: true, price, slotIndex: getNextSlotIndex(profile) };
}

module.exports = {
  FREE_SLOTS,
  getPaidSlots,
  getMaxCharacters,
  getNextSlotPrice,
  getNextSlotIndex,
  canBuySlot,
};
