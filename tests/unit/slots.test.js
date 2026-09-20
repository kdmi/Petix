const test = require("node:test");
const assert = require("node:assert/strict");

const {
  countSlotCharacters,
  getMaxCharacters,
  getNextSlotPrice,
  getNextSlotIndex,
  canBuySlot,
  grandfatherFreeSlots,
} = require("../../api/_lib/slots");
const { getDefaults } = require("../../api/_lib/economy-config");
const { makeProfile } = require("./helpers/economy-fixtures");

const cfg = getDefaults();

test("getMaxCharacters = free slots + paid slots, capped at 10", () => {
  assert.equal(getMaxCharacters(makeProfile({ paidSlots: 0 }), cfg), 1);
  assert.equal(getMaxCharacters(makeProfile({ paidSlots: 2 }), cfg), 3);
  assert.equal(getMaxCharacters(makeProfile({ paidSlots: 9 }), cfg), 10);
});

test("getMaxCharacters follows a FREE_SLOTS override", () => {
  const legacy = { ...cfg, FREE_SLOTS: 3 };
  assert.equal(getMaxCharacters(makeProfile({ paidSlots: 0 }), legacy), 3);
  assert.equal(getMaxCharacters(makeProfile({ paidSlots: 2 }), legacy), 5);
  // A config from before the key existed keeps the single free slot.
  assert.equal(getMaxCharacters(makeProfile({ paidSlots: 0 }), { MAX_CHARACTER_SLOTS: 10 }), 1);
});

test("getNextSlotPrice follows the escalating ladder, null at max", () => {
  assert.equal(getNextSlotPrice(makeProfile({ paidSlots: 0 }), cfg), 25000);
  assert.equal(getNextSlotPrice(makeProfile({ paidSlots: 1 }), cfg), 40000);
  assert.equal(getNextSlotPrice(makeProfile({ paidSlots: 8 }), cfg), 1070000);
  assert.equal(getNextSlotPrice(makeProfile({ paidSlots: 9 }), cfg), null);
});

test("getNextSlotIndex is 1-based character slot number", () => {
  assert.equal(getNextSlotIndex(makeProfile({ paidSlots: 0 }), cfg), 2);
  assert.equal(getNextSlotIndex(makeProfile({ paidSlots: 8 }), cfg), 10);
});

test("canBuySlot ok when funds suffice", () => {
  const profile = makeProfile({ paidSlots: 0, currency: { balance: 25000, totalEarned: 25000 } });
  const r = canBuySlot(profile, cfg);
  assert.equal(r.ok, true);
  assert.equal(r.price, 25000);
  assert.equal(r.slotIndex, 2);
});

test("canBuySlot rejects when balance below price", () => {
  const profile = makeProfile({ paidSlots: 0, currency: { balance: 24999, totalEarned: 24999 } });
  const r = canBuySlot(profile, cfg);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "INSUFFICIENT_FUNDS");
  assert.equal(r.required, 25000);
  assert.equal(r.balance, 24999);
});

test("canBuySlot rejects at max slots", () => {
  const profile = makeProfile({ paidSlots: 9, currency: { balance: 9999999, totalEarned: 9999999 } });
  const r = canBuySlot(profile, cfg);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "MAX_SLOTS");
});

test("countSlotCharacters: a pet sealed in a capsule does not occupy a slot", () => {
  const profile = makeProfile();
  profile.characters = [
    { id: "free-1" },
    { id: "free-2", nft: null },
    { id: "sealed-1", nft: { tokenId: 17, tier: "gold" } },
    { id: "clearing-1", nft: { tokenId: 44, pendingUnbindAt: "2026-09-18T00:00:00.000Z" } },
  ];
  assert.equal(countSlotCharacters(profile), 2);
  assert.equal(countSlotCharacters({}), 0);
  assert.equal(countSlotCharacters(null), 0);
});

test("grandfatherFreeSlots credits pets a wallet already owns, once", () => {
  const profile = makeProfile({ paidSlots: 0 });
  profile.characters = [{ id: "a" }, { id: "b" }, { id: "c" }];

  assert.equal(grandfatherFreeSlots(profile, cfg), true);
  assert.equal(profile.paidSlots, 2, "two of the three pets become paid slots");
  assert.equal(getMaxCharacters(profile, cfg), 3, "nothing is taken away");
  assert.equal(getNextSlotIndex(profile, cfg), 4, "the next purchase is a real addition");
  assert.equal(getNextSlotPrice(profile, cfg), 65000);

  assert.equal(grandfatherFreeSlots(profile, cfg), false, "second call is a no-op");
  assert.equal(profile.paidSlots, 2);
});

test("grandfatherFreeSlots leaves a wallet within its capacity alone", () => {
  const single = makeProfile({ paidSlots: 0 });
  single.characters = [{ id: "a" }];
  assert.equal(grandfatherFreeSlots(single, cfg), false);
  assert.equal(single.paidSlots, 0);

  // A pet sealed in a capsule does not occupy a slot, so it is not credited.
  const sealed = makeProfile({ paidSlots: 0 });
  sealed.characters = [{ id: "a" }, { id: "b", nft: { tokenId: 7 } }];
  assert.equal(grandfatherFreeSlots(sealed, cfg), false);
  assert.equal(sealed.paidSlots, 0);
});
