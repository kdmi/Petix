const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createCompletedCharacter,
  createInternalHeaders,
  createWallet,
  invokeJsonHandler,
  withIsolatedBattleHistoryEnv,
} = require("./helpers/battle-history-test-utils");
const { creditSouls, normalizeSouls, soulsForBurn } = require("../../api/_lib/souls");

// Souls (031): burning a pet gives its soul back — 1 000 souls per pet level.

test("soulsForBurn: 1 000 per level by default, tunable per level, at least level 1", () => {
  assert.equal(soulsForBurn(1, {}), 1000);
  assert.equal(soulsForBurn(7, { SOULS_PER_BURN_LEVEL: 1000 }), 7000);
  assert.equal(soulsForBurn(3, { SOULS_PER_BURN_LEVEL: 250 }), 750);
  assert.equal(soulsForBurn(0, {}), 1000);
  const profile = {};
  creditSouls(profile, 1500);
  creditSouls(profile, 500);
  assert.deepEqual(profile.souls, { balance: 2000, totalEarned: 2000 });
  assert.deepEqual(normalizeSouls(null), { balance: 0, totalEarned: 0 });
});

test("POST /api/character/burn credits souls by level; /me shows the balance", async () => {
  await withIsolatedBattleHistoryEnv(async ({ auth, characterActionRoute, store }) => {
    const wallet = createWallet("5");
    const victim = { ...createCompletedCharacter({ id: "char_lvl4", name: "Old Friend" }), level: 4 };
    await store.updateWalletProfile(wallet, async (current) => ({
      ...current,
      characters: [victim],
      currency: { balance: 20000, totalEarned: 20000 },
      souls: { balance: 300, totalEarned: 300 },
    }));

    const burn = await invokeJsonHandler(characterActionRoute, {
      method: "POST",
      url: "/api/character/burn",
      headers: createInternalHeaders(auth, wallet),
      body: { petId: "char_lvl4" },
    });
    assert.equal(burn.statusCode, 200, JSON.stringify(burn.body));
    assert.equal(burn.body.soulsGained, 4000);
    assert.deepEqual(burn.body.souls, { balance: 4300, totalEarned: 4300 });

    const profile = await store.getWalletProfile(wallet);
    assert.deepEqual(profile.souls, { balance: 4300, totalEarned: 4300 });

    const me = await invokeJsonHandler(characterActionRoute, {
      method: "GET",
      url: "/api/character/me",
      headers: createInternalHeaders(auth, wallet),
    });
    assert.equal(me.statusCode, 200);
    assert.deepEqual(me.body.souls, { balance: 4300, totalEarned: 4300 });
    assert.equal(me.body.soulsPerBurnLevel, 1000);
  });
});
