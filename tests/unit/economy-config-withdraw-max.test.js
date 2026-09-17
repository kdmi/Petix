const test = require("node:test");
const assert = require("node:assert/strict");

const { getDefaults, mergeConfig, validateConfigPatch } = require("../../api/_lib/economy-config");

test("WITHDRAW_MAX_PER_TX defaults to 0 (= no per-transaction cap)", () => {
  assert.equal(getDefaults().WITHDRAW_MAX_PER_TX, 0);
});

test("WITHDRAW_MAX_PER_TX accepts non-negative numbers via patch", () => {
  assert.equal(validateConfigPatch({ WITHDRAW_MAX_PER_TX: 50000 }).ok, true);
  assert.equal(validateConfigPatch({ WITHDRAW_MAX_PER_TX: 0 }).ok, true);
  assert.equal(mergeConfig({ WITHDRAW_MAX_PER_TX: 50000 }).WITHDRAW_MAX_PER_TX, 50000);
});

test("WITHDRAW_MAX_PER_TX rejects negative and non-numeric values", () => {
  const negative = validateConfigPatch({ WITHDRAW_MAX_PER_TX: -1 });
  assert.equal(negative.ok, false);
  assert.equal(negative.errors[0].field, "WITHDRAW_MAX_PER_TX");
  assert.equal(validateConfigPatch({ WITHDRAW_MAX_PER_TX: "100" }).ok, false);
  // a bogus string never leaks into the effective config
  assert.equal(mergeConfig({ WITHDRAW_MAX_PER_TX: "100" }).WITHDRAW_MAX_PER_TX, 0);
});

test("2026-09-17 defaults: MIN_WITHDRAW 1000, capsule gate on, 48h hold", () => {
  const defaults = getDefaults();
  assert.equal(defaults.MIN_WITHDRAW, 1000);
  assert.equal(defaults.WITHDRAW_REQUIRE_NFT, 1);
  assert.equal(defaults.WITHDRAW_NFT_HOLD_HOURS, 48);
  assert.equal(validateConfigPatch({ WITHDRAW_REQUIRE_NFT: 0, WITHDRAW_NFT_HOLD_HOURS: 24 }).ok, true);
  assert.equal(validateConfigPatch({ WITHDRAW_NFT_HOLD_HOURS: -1 }).ok, false);
  assert.equal(mergeConfig({ WITHDRAW_NFT_HOLD_HOURS: 24 }).WITHDRAW_NFT_HOLD_HOURS, 24);
});
