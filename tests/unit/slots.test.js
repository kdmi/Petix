const test = require("node:test");
const assert = require("node:assert/strict");

const {
  countSlotCharacters,
  ensureUnlockedSlots,
  getFreeSlots,
  getMaxCharacters,
  getUnlockedSlots,
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

test("ensureUnlockedSlots counts a place for every pet the wallet already holds", () => {
  // Old rules gave three free places; the wallet keeps all three.
  const legacy = makeProfile({ paidSlots: 0 });
  legacy.characters = [{ id: "a" }, { id: "b" }, { id: "c" }];

  assert.equal(ensureUnlockedSlots(legacy, cfg), true);
  assert.equal(legacy.unlockedSlots, 3, "nothing is taken away");

  legacy.characters.push({ id: "d" });
  assert.equal(ensureUnlockedSlots(legacy, cfg), false, "second call is a no-op");
  assert.equal(legacy.unlockedSlots, 3);
});

test("ensureUnlockedSlots credits places bought under the old slot rules", () => {
  const bought = makeProfile({ paidSlots: 2 });
  bought.characters = [{ id: "a" }];

  ensureUnlockedSlots(bought, cfg);
  assert.equal(bought.unlockedSlots, 3, "one free place plus two purchased ones");
});

test("ensureUnlockedSlots ignores pets sealed in capsules and respects the cap", () => {
  const sealed = makeProfile({ paidSlots: 0 });
  sealed.characters = [{ id: "a" }, { id: "b", nft: { tokenId: 7 } }];
  ensureUnlockedSlots(sealed, cfg);
  assert.equal(sealed.unlockedSlots, 1, "a capsule pet opens no place");

  const overflowing = makeProfile({ paidSlots: 99 });
  ensureUnlockedSlots(overflowing, cfg);
  assert.equal(overflowing.unlockedSlots, 10, "never above MAX_CHARACTER_SLOTS");
});

test("getUnlockedSlots derives a missing value and never drops below the free place", () => {
  const untouched = makeProfile({ paidSlots: 1 });
  untouched.characters = [{ id: "a" }];
  untouched.unlockedSlots = null;
  assert.equal(getUnlockedSlots(untouched, cfg), 2, "derived on the fly");

  // A broken or under-counted value must not lock a wallet out of creation.
  const broken = makeProfile();
  broken.unlockedSlots = 0;
  assert.equal(getUnlockedSlots(broken, cfg), 1);

  const overflowing = makeProfile();
  overflowing.unlockedSlots = 99;
  assert.equal(getUnlockedSlots(overflowing, cfg), 10);
});
