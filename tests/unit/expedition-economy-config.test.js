const test = require("node:test");
const assert = require("node:assert/strict");

const economy = require("../../api/_lib/economy-config");

test("expedition defaults: feature off, admin-only, 3 bosses open, fees per boss, tier map", () => {
  const d = economy.getDefaults();
  assert.equal(d.EXPEDITIONS_ENABLED, 0);
  assert.equal(d.EXPEDITIONS_ADMIN_ONLY, 1);
  assert.equal(d.EXPEDITION_NFT_MINT_ENABLED, 0);
  assert.deepEqual(d.EXPEDITION_BOSS_OPEN, [1, 1, 1, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(d.EXPEDITION_FEES, [0, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 8000]);
  assert.deepEqual(d.EXPEDITION_REWARD_MULTS, { 1: 0.5, 2: 1, 3: 2 });
  assert.equal("EXPEDITION_CAPSULE_ENERGY" in d, false, "airdrop amounts are typed at drop time, not stored");
  assert.equal(d.EXPEDITION_COLLECTION_CONTRACTS.length, 10);
  assert.equal(economy.EXPEDITION_BOSS_COUNT, 10);
});

test("expedition arrays merge whole and are cloned (defaults never mutated)", () => {
  const merged = economy.mergeConfig({ EXPEDITION_BOSS_OPEN: [1, 1, 1, 1, 0, 0, 0, 0, 0, 0], EXPEDITION_REWARD_MULTS: { 3: 1.5 } });
  assert.equal(merged.EXPEDITION_BOSS_OPEN[3], 1);
  assert.deepEqual(merged.EXPEDITION_REWARD_MULTS, { 1: 0.5, 2: 1, 3: 1.5 });
  merged.EXPEDITION_BOSS_OPEN[0] = 0;
  assert.equal(economy.getDefaults().EXPEDITION_BOSS_OPEN[0], 1);
});

test("expedition validation: length ≠ 10, bad address, bad star key are rejected", () => {
  assert.equal(economy.validateConfigPatch({ EXPEDITION_FEES: [1, 2] }).ok, false);
  assert.equal(economy.validateConfigPatch({ EXPEDITION_BOSS_OPEN: [1, 1, 1, 1, 1, 1, 1, 1, 1, -1] }).ok, false);
  const badAddr = economy.validateConfigPatch({ EXPEDITION_COLLECTION_CONTRACTS: ["nope", "", "", "", "", "", "", "", "", ""] });
  assert.equal(badAddr.ok, false);
  assert.equal(economy.validateConfigPatch({ EXPEDITION_REWARD_MULTS: { 4: 1 } }).ok, false);
  assert.equal(economy.validateConfigPatch({ EXPEDITION_MARKETPLACE_CONTRACTS: ["0x12"] }).ok, false);
  const ok = economy.validateConfigPatch({
    EXPEDITION_COLLECTION_CONTRACTS: ["", `0x${"1".repeat(40)}`, "", "", "", "", "", "", "", ""],
    EXPEDITION_MARKETPLACE_CONTRACTS: [`0x${"2".repeat(40)}`],
    EXPEDITIONS_ENABLED: 1,
  });
  assert.deepEqual(ok.errors, []);
});

test("getEconomyConfig({ fresh: true }) bypasses the in-memory cache (admin reads right after a save)", async () => {
  // Runs inside the isolated env: the store writes under process.cwd()/.data, which the fixture points at a temp dir.
  const { withExpeditionEnv } = require("./helpers/expedition-fixtures");
  await withExpeditionEnv(async () => {
    for (const f of ["economy-config.js", "economy-config-store.js"]) delete require.cache[require.resolve("../../api/_lib/" + f)];
    const { getEconomyConfig, invalidateCache } = require("../../api/_lib/economy-config");
    const { writeOverrides } = require("../../api/_lib/economy-config-store");
    invalidateCache();
    await writeOverrides({ EXPEDITION_COLLECTION_ENERGY: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1] });
    const warm = await getEconomyConfig({ now: 1000 });
    assert.equal(warm.EXPEDITION_COLLECTION_ENERGY[0], 1);
    // Another instance wrote new overrides; this instance's cache is still warm.
    await writeOverrides({ EXPEDITION_COLLECTION_ENERGY: [7, 1, 1, 1, 1, 1, 1, 1, 1, 1] });
    assert.equal((await getEconomyConfig({ now: 2000 })).EXPEDITION_COLLECTION_ENERGY[0], 1, "cached");
    assert.equal((await getEconomyConfig({ now: 2000, fresh: true })).EXPEDITION_COLLECTION_ENERGY[0], 7, "fresh read");
    invalidateCache();
  }, { seedProfiles: false });
});
