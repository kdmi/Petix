const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getMaxCharacters,
  getNextSlotPrice,
  getNextSlotIndex,
  canBuySlot,
} = require("../../api/_lib/slots");
const { getDefaults } = require("../../api/_lib/economy-config");
const { makeProfile } = require("./helpers/economy-fixtures");

const cfg = getDefaults();

test("getMaxCharacters = 3 free + paid slots, capped at 10", () => {
  assert.equal(getMaxCharacters(makeProfile({ paidSlots: 0 }), cfg), 3);
  assert.equal(getMaxCharacters(makeProfile({ paidSlots: 2 }), cfg), 5);
  assert.equal(getMaxCharacters(makeProfile({ paidSlots: 7 }), cfg), 10);
});

test("getNextSlotPrice follows the escalating ladder, null at max", () => {
  assert.equal(getNextSlotPrice(makeProfile({ paidSlots: 0 }), cfg), 5000);
  assert.equal(getNextSlotPrice(makeProfile({ paidSlots: 1 }), cfg), 10000);
  assert.equal(getNextSlotPrice(makeProfile({ paidSlots: 6 }), cfg), 160000);
  assert.equal(getNextSlotPrice(makeProfile({ paidSlots: 7 }), cfg), null);
});

test("getNextSlotIndex is 1-based character slot number", () => {
  assert.equal(getNextSlotIndex(makeProfile({ paidSlots: 0 })), 4);
  assert.equal(getNextSlotIndex(makeProfile({ paidSlots: 6 })), 10);
});

test("canBuySlot ok when funds suffice", () => {
  const profile = makeProfile({ paidSlots: 0, currency: { balance: 5000, totalEarned: 5000 } });
  const r = canBuySlot(profile, cfg);
  assert.equal(r.ok, true);
  assert.equal(r.price, 5000);
  assert.equal(r.slotIndex, 4);
});

test("canBuySlot rejects when balance below price", () => {
  const profile = makeProfile({ paidSlots: 0, currency: { balance: 4999, totalEarned: 4999 } });
  const r = canBuySlot(profile, cfg);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "INSUFFICIENT_FUNDS");
  assert.equal(r.required, 5000);
  assert.equal(r.balance, 4999);
});

test("canBuySlot rejects at max slots", () => {
  const profile = makeProfile({ paidSlots: 7, currency: { balance: 9999999, totalEarned: 9999999 } });
  const r = canBuySlot(profile, cfg);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "MAX_SLOTS");
});
