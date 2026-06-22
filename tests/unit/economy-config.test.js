const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getDefaults,
  mergeConfig,
  validateConfigPatch,
} = require("../../api/_lib/economy-config");

test("getDefaults returns the ×10 defaults", () => {
  const d = getDefaults();
  assert.equal(d.FARM_BASE, 10);
  assert.equal(d.BATTLE_REWARD_BASE, 100);
  assert.equal(d.MAX_CHARACTER_SLOTS, 10);
  assert.equal(d.SLOT_PRICES.length, 7);
  assert.deepEqual(d.SLOT_PRICES, [5000, 10000, 20000, 35000, 60000, 100000, 160000]);
  assert.deepEqual(d.rarityMult, { Common: 1.0, Rare: 1.2, Epic: 1.4, Legendary: 1.6 });
});

test("getDefaults returns a fresh deep copy (not frozen internals)", () => {
  const a = getDefaults();
  a.FARM_BASE = 999;
  a.rarityMult.Common = 999;
  a.SLOT_PRICES.push(1);
  const b = getDefaults();
  assert.equal(b.FARM_BASE, 10);
  assert.equal(b.rarityMult.Common, 1.0);
  assert.equal(b.SLOT_PRICES.length, 7);
});

test("mergeConfig overlays numeric override", () => {
  const cfg = mergeConfig({ FARM_BASE: 20 });
  assert.equal(cfg.FARM_BASE, 20);
  assert.equal(cfg.BATTLE_REWARD_BASE, 100); // untouched
});

test("mergeConfig merges rarityMult partially", () => {
  const cfg = mergeConfig({ rarityMult: { Legendary: 2.0 } });
  assert.equal(cfg.rarityMult.Legendary, 2.0);
  assert.equal(cfg.rarityMult.Common, 1.0); // preserved
});

test("mergeConfig replaces SLOT_PRICES wholesale", () => {
  const cfg = mergeConfig({ SLOT_PRICES: [1, 2, 3, 4, 5, 6, 7] });
  assert.deepEqual(cfg.SLOT_PRICES, [1, 2, 3, 4, 5, 6, 7]);
});

test("mergeConfig ignores unknown keys and bad types", () => {
  const cfg = mergeConfig({ NOPE: 1, FARM_BASE: "x" });
  assert.equal("NOPE" in cfg, false);
  assert.equal(cfg.FARM_BASE, 10); // string ignored
});

test("validateConfigPatch accepts a valid patch", () => {
  const r = validateConfigPatch({ FARM_BASE: 12, rarityMult: { Common: 1, Rare: 1.3, Epic: 1.5, Legendary: 1.8 } });
  assert.equal(r.ok, true);
  assert.equal(r.errors.length, 0);
});

test("validateConfigPatch rejects negative numeric", () => {
  const r = validateConfigPatch({ FARM_BASE: -1 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === "FARM_BASE"));
});

test("validateConfigPatch rejects rarityMult missing a tier", () => {
  const r = validateConfigPatch({ rarityMult: { Common: 1, Rare: 1.2, Epic: 1.4 } });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === "rarityMult"));
});

test("validateConfigPatch rejects non-increasing SLOT_PRICES", () => {
  const r = validateConfigPatch({ SLOT_PRICES: [5000, 5000, 6000, 7000, 8000, 9000, 10000] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === "SLOT_PRICES"));
});

test("validateConfigPatch rejects wrong-length SLOT_PRICES", () => {
  const r = validateConfigPatch({ SLOT_PRICES: [5000, 10000] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === "SLOT_PRICES"));
});

test("validateConfigPatch rejects non-object patch", () => {
  assert.equal(validateConfigPatch(null).ok, false);
  assert.equal(validateConfigPatch([]).ok, false);
});
