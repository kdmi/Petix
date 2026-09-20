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
  assert.equal(d.FREE_SLOTS, 1);
  assert.equal(d.PET_PRICES_USD.length, 9);
  assert.deepEqual(
    d.PET_PRICES_USD,
    [1.2, 1.91, 3.11, 4.78, 7.65, 12.43, 20.08, 32.03, 51.15]
  );
  assert.deepEqual(d.rarityMult, { Common: 1.0, Rare: 1.2, Epic: 1.4, Legendary: 1.6 });
});

test("getDefaults returns a fresh deep copy (not frozen internals)", () => {
  const a = getDefaults();
  a.FARM_BASE = 999;
  a.rarityMult.Common = 999;
  a.PET_PRICES_USD.push(1);
  const b = getDefaults();
  assert.equal(b.FARM_BASE, 10);
  assert.equal(b.rarityMult.Common, 1.0);
  assert.equal(b.PET_PRICES_USD.length, 9);
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

test("mergeConfig replaces PET_PRICES_USD wholesale", () => {
  const cfg = mergeConfig({ PET_PRICES_USD: [1, 2, 3, 4, 5, 6, 7] });
  assert.deepEqual(cfg.PET_PRICES_USD, [1, 2, 3, 4, 5, 6, 7]);
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

test("validateConfigPatch rejects non-increasing PET_PRICES_USD", () => {
  const r = validateConfigPatch({ PET_PRICES_USD: [5000, 5000, 6000, 7000, 8000, 9000, 10000] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === "PET_PRICES_USD"));
});

test("validateConfigPatch rejects wrong-length PET_PRICES_USD", () => {
  const r = validateConfigPatch({ PET_PRICES_USD: [5000, 10000] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.field === "PET_PRICES_USD"));
});

test("validateConfigPatch rejects non-object patch", () => {
  assert.equal(validateConfigPatch(null).ok, false);
  assert.equal(validateConfigPatch([]).ok, false);
});

test("BURN_COST: default is 500, override merges, negative rejected", () => {
  assert.equal(getDefaults().BURN_COST, 1000);
  assert.equal(mergeConfig({ BURN_COST: 750 }).BURN_COST, 750);
  const bad = validateConfigPatch({ BURN_COST: -1 });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((e) => e.field === "BURN_COST"));
  const nonNumeric = validateConfigPatch({ BURN_COST: "500" });
  assert.equal(nonNumeric.ok, false);
  assert.ok(validateConfigPatch({ BURN_COST: 0 }).ok);
});

test("карты тиров капсул мержатся частично и валидируются", () => {
  const { mergeConfig, validateConfigPatch, getDefaults } = require("../../api/_lib/economy-config");
  const merged = mergeConfig({ NFT_TIER_FARM_BONUS_PCT: { gold: 25 } });
  assert.equal(merged.NFT_TIER_FARM_BONUS_PCT.gold, 25, "оверрайд применился");
  assert.equal(merged.NFT_TIER_FARM_BONUS_PCT.glass, getDefaults().NFT_TIER_FARM_BONUS_PCT.glass, "остальное — из дефолтов");

  assert.equal(validateConfigPatch({ NFT_TIER_EXTRA_BATTLES: { silver: 2 } }).ok, true);
  const bad = validateConfigPatch({ NFT_TIER_EXTRA_BATTLES: { diamond: 1, silver: -1 } });
  assert.equal(bad.ok, false);
  assert.equal(bad.errors.length, 2, "чужой тир и отрицательное число");
});
