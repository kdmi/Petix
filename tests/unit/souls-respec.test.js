const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createCompletedCharacter,
  createInternalHeaders,
  createWallet,
  invokeJsonHandler,
  withIsolatedBattleHistoryEnv,
} = require("./helpers/battle-history-test-utils");
const { applyRespec, respecPrice } = require("../../api/_lib/souls");

// Redistributing a pet's points (031): 3 000 souls per pet level, the pet keeps its total.

const CFG = { SOULS_RESPEC_PER_LEVEL: 3000 };

function profileWith(pet, souls) {
  return { characters: [pet], souls: { balance: souls, totalEarned: souls } };
}

function pet(extra = {}) {
  return { id: "p1", status: "completed", level: 3, attributes: { stamina: 5, agility: 3, strength: 10, intelligence: 2 }, attributePointsAvailable: 0, ...extra };
}

const codeOf = (code) => (error) => error.httpCode === code;

test("respecPrice: 3 000 souls per level by default, tunable, Lvl. 1 at least", () => {
  assert.equal(respecPrice(1, {}), 3000);
  assert.equal(respecPrice(5, {}), 15000);
  assert.equal(respecPrice(10, { SOULS_RESPEC_PER_LEVEL: 2000 }), 20000);
  assert.equal(respecPrice(0, CFG), 3000);
});

test("applyRespec: moves points, uses unspent ones, charges souls, keeps the lifetime total", () => {
  const profile = profileWith(pet({ attributePointsAvailable: 2 }), 10000);
  const { price } = applyRespec(profile, "p1", { stamina: 10, agility: 4, strength: 2, intelligence: 6 }, CFG);
  assert.equal(price, 9000);
  assert.deepEqual(profile.souls, { balance: 1000, totalEarned: 10000 });
  assert.deepEqual(profile.characters[0].attributes, { stamina: 10, agility: 4, strength: 2, intelligence: 6 });
  assert.equal(profile.characters[0].attributePointsAvailable, 0);
});

test("applyRespec: points may stay unspent; over the total, no change, bad numbers and short souls are refused without a charge", () => {
  const profile = profileWith(pet(), 9000);
  assert.throws(() => applyRespec(profile, "p1", { stamina: 5, agility: 3, strength: 11, intelligence: 2 }, CFG), codeOf("BAD_ALLOCATION"));
  assert.throws(() => applyRespec(profile, "p1", { stamina: 5, agility: 3, strength: 10, intelligence: 2 }, CFG), codeOf("NOTHING_CHANGED"));
  assert.throws(() => applyRespec(profile, "p1", { stamina: -1, agility: 3, strength: 10, intelligence: 2 }, CFG), codeOf("BAD_ALLOCATION"));
  assert.throws(() => applyRespec(profile, "p1", { stamina: 5, agility: 3, strength: 2.5, intelligence: 2 }, CFG), codeOf("BAD_ALLOCATION"));
  assert.throws(() => applyRespec(profile, "nope", { stamina: 5, agility: 3, strength: 9, intelligence: 2 }, CFG), codeOf("NOT_FOUND"));
  assert.equal(profile.souls.balance, 9000);

  applyRespec(profile, "p1", { stamina: 5, agility: 3, strength: 5, intelligence: 2 }, CFG);
  assert.equal(profile.characters[0].attributePointsAvailable, 5, "5 points back to unspent");
  assert.equal(profile.souls.balance, 0);
  assert.throws(() => applyRespec(profile, "p1", { stamina: 6, agility: 3, strength: 5, intelligence: 2 }, CFG), codeOf("NOT_ENOUGH_SOULS"));
  assert.deepEqual(profile.characters[0].attributes, { stamina: 5, agility: 3, strength: 5, intelligence: 2 });
});

test("POST /api/character/respec saves the new stats and souls; /me shows the price per level", async () => {
  await withIsolatedBattleHistoryEnv(async ({ auth, characterActionRoute, store }) => {
    const wallet = createWallet("6");
    const character = { ...createCompletedCharacter({ id: "char_respec", name: "Shifter" }), level: 2, attributes: { stamina: 4, agility: 4, strength: 4, intelligence: 4 }, attributePointsAvailable: 1 };
    await store.updateWalletProfile(wallet, async (current) => ({ ...current, characters: [character], souls: { balance: 7000, totalEarned: 7000 } }));

    const ok = await invokeJsonHandler(characterActionRoute, {
      method: "POST",
      url: "/api/character/respec",
      headers: createInternalHeaders(auth, wallet),
      body: { petId: "char_respec", attributes: { stamina: 2, agility: 2, strength: 9, intelligence: 4 } },
    });
    assert.equal(ok.statusCode, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.price, 6000);
    assert.deepEqual(ok.body.souls, { balance: 1000, totalEarned: 7000 });
    assert.equal(ok.body.character.attributes.strength, 9);

    const saved = (await store.getWalletProfile(wallet)).characters[0];
    assert.deepEqual(saved.attributes, { stamina: 2, agility: 2, strength: 9, intelligence: 4 });
    assert.equal(saved.attributePointsAvailable, 0);

    const short = await invokeJsonHandler(characterActionRoute, {
      method: "POST",
      url: "/api/character/respec",
      headers: createInternalHeaders(auth, wallet),
      body: { petId: "char_respec", attributes: { stamina: 3, agility: 1, strength: 9, intelligence: 4 } },
    });
    assert.equal(short.statusCode, 402);
    assert.equal(short.body.code, "NOT_ENOUGH_SOULS");

    const me = await invokeJsonHandler(characterActionRoute, {
      method: "GET",
      url: "/api/character/me",
      headers: createInternalHeaders(auth, wallet),
    });
    assert.equal(me.body.soulsRespecPerLevel, 3000);
  });
});
