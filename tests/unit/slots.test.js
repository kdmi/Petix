const test = require("node:test");
const assert = require("node:assert/strict");

const {
  countSlotCharacters,
  ensurePrepaidCreations,
  getFreeSlots,
  getMaxCharacters,
} = require("../../api/_lib/slots");
const { getDefaults } = require("../../api/_lib/economy-config");
const { makeProfile } = require("./helpers/economy-fixtures");

const cfg = getDefaults();

test("getFreeSlots reads the config and falls back to one", () => {
  assert.equal(getFreeSlots(cfg), 1);
  assert.equal(getFreeSlots({ ...cfg, FREE_SLOTS: 3 }), 3);
  assert.equal(getFreeSlots({}), 1, "a config from before the key existed");
  assert.equal(getFreeSlots({ FREE_SLOTS: 0 }), 1, "zero is not a valid free count");
});

test("getMaxCharacters is the same cap for everyone — places are no longer bought", () => {
  assert.equal(getMaxCharacters(makeProfile({ paidSlots: 0 }), cfg), 10);
  assert.equal(getMaxCharacters(makeProfile({ paidSlots: 7 }), cfg), 10);
  assert.equal(getMaxCharacters(makeProfile(), { MAX_CHARACTER_SLOTS: 4 }), 4);
});

test("countSlotCharacters: a pet sealed in a capsule does not occupy a place", () => {
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

test("ensurePrepaidCreations credits unfilled purchased places, once", () => {
  const profile = makeProfile({ paidSlots: 2 });
  profile.characters = [{ id: "a" }];

  assert.equal(ensurePrepaidCreations(profile, cfg), true);
  assert.equal(profile.prepaidCreations, 2, "both purchased places are still unused");

  profile.paidSlots = 5;
  assert.equal(ensurePrepaidCreations(profile, cfg), false, "second call is a no-op");
  assert.equal(profile.prepaidCreations, 2);
});

test("ensurePrepaidCreations gives no credit for pets that already fill the purchase", () => {
  const filled = makeProfile({ paidSlots: 2 });
  filled.characters = [{ id: "a" }, { id: "b" }, { id: "c" }];
  ensurePrepaidCreations(filled, cfg);
  assert.equal(filled.prepaidCreations, 0, "one free place plus two paid ones are all taken");

  // The three free places of the old rule are not a paid entitlement.
  const legacyFree = makeProfile({ paidSlots: 0 });
  legacyFree.characters = [{ id: "a" }, { id: "b" }];
  ensurePrepaidCreations(legacyFree, cfg);
  assert.equal(legacyFree.prepaidCreations, 0);

  // Zero is a real answer and must not be recomputed later.
  legacyFree.paidSlots = 4;
  assert.equal(ensurePrepaidCreations(legacyFree, cfg), false);
  assert.equal(legacyFree.prepaidCreations, 0);
});
