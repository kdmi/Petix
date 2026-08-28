const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createCompletedCharacter,
  createInternalHeaders,
  createWallet,
  invokeJsonHandler,
  withIsolatedBattleHistoryEnv,
} = require("./helpers/battle-history-test-utils");

const BURN_COST = 1000; // default from api/_lib/economy-config.js

function burnRequest(auth, wallet, petId) {
  return {
    method: "POST",
    url: "/api/character/burn",
    headers: createInternalHeaders(auth, wallet),
    body: { petId },
  };
}

async function seedProfile(store, wallet, { characters, balance, totalEarned, paidSlots = 0 }) {
  await store.updateWalletProfile(wallet, async (current) => ({
    ...current,
    characters,
    paidSlots,
    currency: { balance, totalEarned: totalEarned == null ? balance : totalEarned },
  }));
}

test("POST /api/character/burn debits the cost, deletes the pet, and keeps paid slots", async () => {
  await withIsolatedBattleHistoryEnv(async ({ auth, characterActionRoute, store }) => {
    const wallet = createWallet("2");
    const keeper = createCompletedCharacter({ id: "char_keeper", name: "Keeper" });
    const victim = createCompletedCharacter({ id: "char_victim", name: "Victim" });
    await seedProfile(store, wallet, {
      characters: [keeper, victim],
      balance: 1200,
      totalEarned: 5000,
      paidSlots: 2,
    });

    const response = await invokeJsonHandler(
      characterActionRoute,
      burnRequest(auth, wallet, "char_victim")
    );

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.burned, true);
    assert.equal(response.body.petId, "char_victim");
    assert.equal(response.body.pricePaid, BURN_COST);
    assert.equal(response.body.balance, 1200 - BURN_COST);
    assert.equal(response.body.paidSlots, 2);
    assert.equal(response.body.maxCharacters, 5);

    const profile = await store.getWalletProfile(wallet);
    assert.deepEqual(
      profile.characters.map((record) => record.id),
      ["char_keeper"]
    );
    assert.equal(profile.currency.balance, 1200 - BURN_COST);
    // burn is a sink: totalEarned must stay untouched
    assert.equal(profile.currency.totalEarned, 5000);
    assert.equal(profile.paidSlots, 2);
  });
});

test("POST /api/character/burn rejects with 402 when balance is below the cost", async () => {
  await withIsolatedBattleHistoryEnv(async ({ auth, characterActionRoute, store }) => {
    const wallet = createWallet("3");
    const pet = createCompletedCharacter({ id: "char_poor", name: "Poor Pet" });
    await seedProfile(store, wallet, { characters: [pet], balance: BURN_COST - 1 });

    const response = await invokeJsonHandler(
      characterActionRoute,
      burnRequest(auth, wallet, "char_poor")
    );

    assert.equal(response.statusCode, 402);
    assert.equal(response.body.code, "INSUFFICIENT_FUNDS");
    assert.equal(response.body.required, BURN_COST);
    assert.equal(response.body.balance, BURN_COST - 1);

    const profile = await store.getWalletProfile(wallet);
    assert.equal(profile.characters.length, 1);
    assert.equal(profile.currency.balance, BURN_COST - 1);
  });
});

test("POST /api/character/burn returns 404 for an unknown pet and for a repeated burn", async () => {
  await withIsolatedBattleHistoryEnv(async ({ auth, characterActionRoute, store }) => {
    const wallet = createWallet("4");
    const pet = createCompletedCharacter({ id: "char_once", name: "Once" });
    await seedProfile(store, wallet, { characters: [pet], balance: 2000 });

    const missing = await invokeJsonHandler(
      characterActionRoute,
      burnRequest(auth, wallet, "char_ghost")
    );
    assert.equal(missing.statusCode, 404);
    assert.equal(missing.body.code, "NOT_FOUND");

    const first = await invokeJsonHandler(
      characterActionRoute,
      burnRequest(auth, wallet, "char_once")
    );
    assert.equal(first.statusCode, 200);

    const second = await invokeJsonHandler(
      characterActionRoute,
      burnRequest(auth, wallet, "char_once")
    );
    assert.equal(second.statusCode, 404);
    assert.equal(second.body.code, "NOT_FOUND");

    // exactly one debit happened
    const profile = await store.getWalletProfile(wallet);
    assert.equal(profile.currency.balance, 2000 - BURN_COST);
  });
});

test("POST /api/character/burn rejects generating pets and cross-wallet ids", async () => {
  await withIsolatedBattleHistoryEnv(async ({ auth, characterActionRoute, store }) => {
    const wallet = createWallet("5");
    const otherWallet = createWallet("6");
    const generating = {
      ...createCompletedCharacter({ id: "char_wip", name: "WIP" }),
      status: "generating",
    };
    await seedProfile(store, wallet, { characters: [generating], balance: 2000 });
    await seedProfile(store, otherWallet, {
      characters: [createCompletedCharacter({ id: "char_foreign", name: "Foreign" })],
      balance: 2000,
    });

    const notCompleted = await invokeJsonHandler(
      characterActionRoute,
      burnRequest(auth, wallet, "char_wip")
    );
    assert.equal(notCompleted.statusCode, 400);
    assert.equal(notCompleted.body.code, "NOT_COMPLETED");

    // someone else's pet is invisible from this session → 404, foreign profile intact
    const foreign = await invokeJsonHandler(
      characterActionRoute,
      burnRequest(auth, wallet, "char_foreign")
    );
    assert.equal(foreign.statusCode, 404);
    const otherProfile = await store.getWalletProfile(otherWallet);
    assert.equal(otherProfile.characters.length, 1);
    assert.equal(otherProfile.currency.balance, 2000);
  });
});

test("POST /api/character/burn rejects farming pets and allows burn after claim", async () => {
  await withIsolatedBattleHistoryEnv(async ({ auth, characterActionRoute, store }) => {
    const wallet = createWallet("7");
    const farming = {
      ...createCompletedCharacter({ id: "char_farming", name: "Farmer" }),
      farmState: { active: true, startedAt: new Date(Date.now() - 3600000).toISOString(), lastClaimedAt: null },
    };
    const ready = {
      ...createCompletedCharacter({ id: "char_ready", name: "Harvester" }),
      farmState: { active: true, startedAt: new Date(Date.now() - 25 * 3600000).toISOString(), lastClaimedAt: null },
    };
    const claimed = {
      ...createCompletedCharacter({ id: "char_claimed", name: "Done" }),
      farmState: { active: false, startedAt: null, lastClaimedAt: new Date().toISOString() },
    };
    await seedProfile(store, wallet, { characters: [farming, ready, claimed], balance: 2000 });

    const midCycle = await invokeJsonHandler(
      characterActionRoute,
      burnRequest(auth, wallet, "char_farming")
    );
    assert.equal(midCycle.statusCode, 409);
    assert.equal(midCycle.body.code, "FARM_ACTIVE");
    assert.match(midCycle.body.error, /wait for the farm cycle/i);

    const readyToClaim = await invokeJsonHandler(
      characterActionRoute,
      burnRequest(auth, wallet, "char_ready")
    );
    assert.equal(readyToClaim.statusCode, 409);
    assert.equal(readyToClaim.body.code, "FARM_ACTIVE");
    assert.match(readyToClaim.body.error, /harvest/i);

    const afterClaim = await invokeJsonHandler(
      characterActionRoute,
      burnRequest(auth, wallet, "char_claimed")
    );
    assert.equal(afterClaim.statusCode, 200);

    const profile = await store.getWalletProfile(wallet);
    assert.deepEqual(
      profile.characters.map((record) => record.id).sort(),
      ["char_farming", "char_ready"]
    );
    assert.equal(profile.currency.balance, 2000 - BURN_COST);
  });
});

test("POST /api/character/burn rejects non-POST and missing petId", async () => {
  await withIsolatedBattleHistoryEnv(async ({ auth, characterActionRoute }) => {
    const wallet = createWallet("8");

    const wrongMethod = await invokeJsonHandler(characterActionRoute, {
      method: "GET",
      url: "/api/character/burn",
      headers: createInternalHeaders(auth, wallet),
    });
    assert.equal(wrongMethod.statusCode, 405);

    const noPetId = await invokeJsonHandler(characterActionRoute, {
      method: "POST",
      url: "/api/character/burn",
      headers: createInternalHeaders(auth, wallet),
      body: {},
    });
    assert.equal(noPetId.statusCode, 400);
  });
});
