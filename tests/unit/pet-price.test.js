const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildLadder,
  clampPointsPerUsd,
  priceForNextPet,
  resolvePointsPerUsd,
  roundPrice,
} = require("../../api/_lib/pet-price");
const { getDefaults } = require("../../api/_lib/economy-config");

const cfg = getDefaults();

function profile(overrides = {}) {
  return {
    characters: [],
    paidSlots: 0,
    unlockedSlots: 1,
    currency: { balance: 0, totalEarned: 0 },
    ...overrides,
  };
}

function pets(count) {
  return Array.from({ length: count }, (_, i) => ({ id: `char_${i}`, status: "completed" }));
}

test("clampPointsPerUsd takes the first quote as-is", () => {
  assert.equal(clampPointsPerUsd(20920, null, cfg), 20920);
  assert.equal(clampPointsPerUsd(20920, undefined, cfg), 20920);
});

test("clampPointsPerUsd limits one step to PRICE_MAX_STEP_PCT in both directions", () => {
  // The coin doubled: half as many Points per dollar, but the step is capped.
  assert.equal(clampPointsPerUsd(10000, 20000, cfg), 15000);
  // The coin halved: the rise is capped the same way.
  assert.equal(clampPointsPerUsd(40000, 20000, cfg), 25000);
  // A move inside the band passes through untouched.
  assert.equal(clampPointsPerUsd(22000, 20000, cfg), 22000);
});

test("clampPointsPerUsd keeps the rate inside the configured bounds", () => {
  assert.equal(clampPointsPerUsd(10, null, cfg), cfg.PRICE_MIN_POINTS_PER_USD);
  assert.equal(clampPointsPerUsd(1e12, null, cfg), cfg.PRICE_MAX_POINTS_PER_USD);
});

test("clampPointsPerUsd rejects junk and keeps the previous rate", () => {
  for (const junk of [0, -5, NaN, Infinity, null, "lots"]) {
    assert.equal(clampPointsPerUsd(junk, 20000, cfg), 20000, `value ${String(junk)}`);
  }
  // With no previous rate a junk quote falls back to the bootstrap value.
  assert.equal(clampPointsPerUsd(0, null, cfg), cfg.PRICE_BOOTSTRAP_POINTS_PER_USD);
});

test("roundPrice rounds up to three significant digits", () => {
  assert.equal(roundPrice(25104), 25200);
  assert.equal(roundPrice(1070341), 1080000);
  assert.equal(roundPrice(999), 999);
  assert.equal(roundPrice(1000), 1000);
  assert.equal(roundPrice(0), 0);
});

test("buildLadder covers pets 2..10 and stays strictly increasing", () => {
  const ladder = buildLadder(20920, cfg);

  assert.equal(ladder.length, 9);
  assert.deepEqual(
    ladder.map((step) => step.index),
    [2, 3, 4, 5, 6, 7, 8, 9, 10]
  );
  assert.equal(ladder[0].usd, 1.2);
  assert.equal(ladder[0].points, roundPrice(Math.ceil(1.2 * 20920)));
  for (let i = 1; i < ladder.length; i += 1) {
    assert.ok(ladder[i].points > ladder[i - 1].points, `step ${i} must grow`);
  }
});

test("buildLadder halves the Points price when the coin doubles", () => {
  const before = buildLadder(20000, cfg);
  const after = buildLadder(10000, cfg);

  for (let i = 0; i < before.length; i += 1) {
    const ratio = before[i].points / after[i].points;
    assert.ok(ratio > 1.9 && ratio < 2.1, `step ${i} ratio ${ratio}`);
  }
});

test("priceForNextPet: a place that is already unlocked costs nothing", () => {
  const fresh = priceForNextPet(profile(), cfg, 20920);
  assert.equal(fresh.index, 1);
  assert.equal(fresh.price, 0);
  assert.equal(fresh.free, true);
  assert.equal(fresh.freeReason, "unlocked_slot");
});

test("priceForNextPet: a burned pet leaves its place open, so the next one is free", () => {
  // Three places opened, one pet burned — the wallet refills a place it owns.
  const afterBurn = priceForNextPet(profile({ characters: pets(2), unlockedSlots: 3 }), cfg, 20920);
  assert.equal(afterBurn.price, 0);
  assert.equal(afterBurn.free, true);
  assert.equal(afterBurn.freeReason, "unlocked_slot");
  assert.equal(afterBurn.index, 3);

  // The same holds for a wallet that burned its only pet.
  const lonely = priceForNextPet(profile({ characters: [], unlockedSlots: 1 }), cfg, 20920);
  assert.equal(lonely.price, 0);
  assert.equal(lonely.free, true);
});

test("priceForNextPet: opening the next place follows the ladder", () => {
  const ladder = buildLadder(20920, cfg);

  for (const owned of [1, 2, 5, 9]) {
    // Every open place is taken, so the next pet opens a new one.
    const result = priceForNextPet(
      profile({ characters: pets(owned), unlockedSlots: owned }),
      cfg,
      20920
    );
    assert.equal(result.index, owned + 1);
    assert.equal(result.price, ladder[owned - 1].points, `place #${owned + 1}`);
    assert.equal(result.free, false);
  }
});

test("priceForNextPet: pets sealed in capsules live outside the places", () => {
  const sealed = [{ id: "a" }, { id: "b", nft: { tokenId: 7 } }, { id: "c", nft: { tokenId: 8 } }];
  const result = priceForNextPet(profile({ characters: sealed, unlockedSlots: 1 }), cfg, 20920);

  assert.equal(result.petCount, 1, "two sealed pets occupy no places");
  assert.equal(result.index, 2);
  assert.equal(
    result.price,
    buildLadder(20920, cfg)[0].points,
    "the wallet opens its second place"
  );
});

test("priceForNextPet: the cap is reported instead of a price", () => {
  const full = priceForNextPet(profile({ characters: pets(10), unlockedSlots: 10 }), cfg, 20920);
  assert.equal(full.price, null);
  assert.equal(full.atMax, true);

  // All ten places opened, two pets burned: refilling them stays free.
  const refill = priceForNextPet(profile({ characters: pets(8), unlockedSlots: 10 }), cfg, 20920);
  assert.equal(refill.price, 0);
  assert.equal(refill.atMax, false);
});

test("resolvePointsPerUsd falls back to the bootstrap rate without a quote", () => {
  assert.equal(resolvePointsPerUsd(null, cfg), cfg.PRICE_BOOTSTRAP_POINTS_PER_USD);
  assert.equal(resolvePointsPerUsd({}, cfg), cfg.PRICE_BOOTSTRAP_POINTS_PER_USD);
  assert.equal(resolvePointsPerUsd({ pointsPerUsd: 31000 }, cfg), 31000);
  // A stored rate outside the bounds is clamped on read, not trusted blindly.
  assert.equal(resolvePointsPerUsd({ pointsPerUsd: 1e12 }, cfg), cfg.PRICE_MAX_POINTS_PER_USD);
});
