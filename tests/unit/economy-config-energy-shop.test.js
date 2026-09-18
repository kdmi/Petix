const test = require("node:test");
const assert = require("node:assert/strict");

const { getDefaults, mergeConfig, validateConfigPatch } = require("../../api/_lib/economy-config");

test("energy shop defaults: enabled, three packs, 24h cooldown", () => {
  const d = getDefaults();
  assert.equal(d.ENERGY_SHOP_ENABLED, 1);
  assert.equal(d.ENERGY_PACK_COOLDOWN_HOURS, 24);
  assert.deepEqual(d.ENERGY_PACKS, [
    { fights: 1, price: 150 },
    { fights: 3, price: 400 },
    { fights: 5, price: 500 },
  ]);
});

test("getDefaults returns a deep copy of ENERGY_PACKS", () => {
  const a = getDefaults();
  a.ENERGY_PACKS[0].price = 1;
  a.ENERGY_PACKS.push({ fights: 9, price: 9 });
  const b = getDefaults();
  assert.equal(b.ENERGY_PACKS.length, 3);
  assert.equal(b.ENERGY_PACKS[0].price, 150);
});

test("mergeConfig replaces ENERGY_PACKS wholesale and copies the array", () => {
  const override = [{ fights: 2, price: 300 }];
  const cfg = mergeConfig({ ENERGY_PACKS: override, ENERGY_SHOP_ENABLED: 0 });
  assert.deepEqual(cfg.ENERGY_PACKS, [{ fights: 2, price: 300 }]);
  assert.notEqual(cfg.ENERGY_PACKS, override);
  assert.notEqual(cfg.ENERGY_PACKS[0], override[0]);
  assert.equal(cfg.ENERGY_SHOP_ENABLED, 0);
  assert.equal(cfg.ENERGY_PACK_COOLDOWN_HOURS, 24);
});

test("validateConfigPatch accepts a sane energy shop patch", () => {
  const r = validateConfigPatch({
    ENERGY_SHOP_ENABLED: 1,
    ENERGY_PACK_COOLDOWN_HOURS: 12,
    ENERGY_PACKS: [{ fights: 1, price: 0 }, { fights: 10, price: 900 }],
  });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
});

test("validateConfigPatch rejects broken energy packs", () => {
  const cases = [
    { ENERGY_PACKS: [] },
    { ENERGY_PACKS: "1:150" },
    { ENERGY_PACKS: [{ fights: 0, price: 100 }] },
    { ENERGY_PACKS: [{ fights: 1.5, price: 100 }] },
    { ENERGY_PACKS: [{ fights: 1, price: -1 }] },
    { ENERGY_PACKS: [{ fights: 1 }] },
    { ENERGY_PACK_COOLDOWN_HOURS: -1 },
    { ENERGY_SHOP_ENABLED: "yes" },
  ];
  for (const patch of cases) {
    const r = validateConfigPatch(patch);
    assert.equal(r.ok, false, `expected failure for ${JSON.stringify(patch)}`);
  }
});
