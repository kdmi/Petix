const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createInternalHeaders,
  createReadyBattleRecord,
  createWallet,
  invokeJsonHandler,
  withIsolatedBattleHistoryEnv,
} = require("./helpers/battle-history-test-utils");

test("GET /api/battles requires an authenticated wallet session", async () => {
  await withIsolatedBattleHistoryEnv(async ({ battlesRoute }) => {
    const response = await invokeJsonHandler(battlesRoute, {
      url: "/api/battles",
    });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.body, {
      error: "Unauthorized.",
      message: "Connect wallet to view battle history.",
    });
  });
});

test("GET /api/battles returns the current wallet history summaries", async () => {
  await withIsolatedBattleHistoryEnv(async ({ auth, battleStore, battlesRoute }) => {
    const playerWallet = createWallet("6");
    const rivalWallet = createWallet("7");
    const outsiderWallet = createWallet("8");

    await battleStore.saveBattleRecord(
      createReadyBattleRecord({
        id: "battle_visible",
        completedAt: "2026-04-17T15:45:00.000Z",
        attackerOwnerWallet: playerWallet,
        defenderOwnerWallet: rivalWallet,
        attackerPetId: "pet_blaze",
        attackerPetName: "Blaze Orbit",
        defenderPetId: "pet_tide",
        defenderPetName: "Tide Circuit",
        winnerPetId: "pet_blaze",
        finalSummaryText: "Blaze Orbit breaks through in the final exchange.",
      })
    );
    await battleStore.saveBattleRecord(
      createReadyBattleRecord({
        id: "battle_hidden",
        completedAt: "2026-04-17T16:00:00.000Z",
        attackerOwnerWallet: outsiderWallet,
        defenderOwnerWallet: rivalWallet,
      })
    );

    const response = await invokeJsonHandler(battlesRoute, {
      headers: createInternalHeaders(auth, playerWallet),
      url: "/api/battles?limit=8",
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.history.length, 1);
    assert.equal(response.body.history[0].battleId, "battle_visible");
    assert.equal(response.body.history[0].playerRole, "attacker");
    assert.equal(response.body.history[0].playerPet.name, "Blaze Orbit");
    assert.equal(
      response.body.history[0].replayUrl,
      "/dashboard/?screen=arena&battleId=battle_visible"
    );
    assert.deepEqual(response.body.page, {
      hasMore: false,
      nextCursor: null,
    });
  });
});

test("GET /api/battles/[battleId] returns a stored replay for any authenticated wallet", async () => {
  await withIsolatedBattleHistoryEnv(async ({ auth, battleStore, battleByIdRoute }) => {
    const attackerWallet = createWallet("2");
    const defenderWallet = createWallet("3");
    const viewerWallet = createWallet("4");

    await battleStore.saveBattleRecord(
      createReadyBattleRecord({
        id: "battle_replay",
        attackerOwnerWallet: attackerWallet,
        defenderOwnerWallet: defenderWallet,
        attackerPetId: "pet_spark",
        attackerPetName: "Sparkline",
        defenderPetId: "pet_ember",
        defenderPetName: "Ember Tide",
        winnerPetId: "pet_spark",
      })
    );

    const response = await invokeJsonHandler(battleByIdRoute, {
      headers: createInternalHeaders(auth, viewerWallet),
      url: "/api/battles/battle_replay",
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.status, "ready");
    assert.equal(response.body.attacker.name, "Sparkline");
    assert.equal(response.body.defender.name, "Ember Tide");
    assert.equal(response.body.result.winnerPetId, "pet_spark");
    assert.equal(response.body.rounds.length, 1);
  });
});

test("GET /api/battles/[battleId] still allows the admin wallet to inspect any stored replay", async () => {
  await withIsolatedBattleHistoryEnv(async ({ auth, battleStore, battleByIdRoute }) => {
    const attackerWallet = createWallet("7");
    const defenderWallet = createWallet("8");
    const adminWallet = "AwtqC9r5Wgvjfhqw5DrtzC5W73QRVF14DZVop8caECi9";

    await battleStore.saveBattleRecord(
      createReadyBattleRecord({
        id: "battle_admin_replay_access",
        attackerOwnerWallet: attackerWallet,
        defenderOwnerWallet: defenderWallet,
        attackerPetId: "pet_alpha",
        defenderPetId: "pet_beta",
      })
    );

    const response = await invokeJsonHandler(battleByIdRoute, {
      headers: createInternalHeaders(auth, adminWallet),
      url: "/api/battles/battle_admin_replay_access",
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.status, "ready");
    assert.equal(response.body.id, "battle_admin_replay_access");
  });
});

test("GET /api/battles/[battleId] still rejects missing replays with explicit errors", async () => {
  await withIsolatedBattleHistoryEnv(async ({ auth, battleStore, battleByIdRoute }) => {
    const attackerWallet = createWallet("4");

    const missing = await invokeJsonHandler(battleByIdRoute, {
      headers: createInternalHeaders(auth, attackerWallet),
      url: "/api/battles/battle_missing",
    });
    assert.equal(missing.statusCode, 404);
    assert.deepEqual(missing.body, {
      error: "BATTLE_NOT_FOUND",
      message: "Battle replay is not available.",
    });
  });
});

// A shared battle link has to open for someone who is not signed in — that is
// the whole point of sharing it. The payload is safe to hand out: pet snapshots,
// rounds and the result, with no wallet anywhere in it.
test("GET /api/battles/[battleId] opens for a visitor with no session", async () => {
  await withIsolatedBattleHistoryEnv(async ({ battleStore, battleByIdRoute }) => {
    await battleStore.saveBattleRecord(
      createReadyBattleRecord({
        id: "battle_public_link",
        attackerOwnerWallet: createWallet("5"),
        defenderOwnerWallet: createWallet("6"),
        attackerPetId: "pet_public_a",
        attackerPetName: "Public Paw",
        defenderPetId: "pet_public_b",
        defenderPetName: "Guest Fang",
        winnerPetId: "pet_public_a",
      })
    );

    const response = await invokeJsonHandler(battleByIdRoute, {
      url: "/api/battles/battle_public_link",
      headers: {}, // no session, no internal secret
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.status, "ready");
    assert.equal(response.body.attacker.name, "Public Paw");
    assert.equal(response.body.defender.name, "Guest Fang");

    const serialized = JSON.stringify(response.body);
    assert.ok(!serialized.includes(createWallet("5")), "an owner wallet must not travel with a public replay");
    assert.ok(!serialized.includes(createWallet("6")), "neither must the opponent's");
  });
});

test("a missing replay answers the same way without a session", async () => {
  await withIsolatedBattleHistoryEnv(async ({ battleByIdRoute }) => {
    const response = await invokeJsonHandler(battleByIdRoute, {
      url: "/api/battles/battle_nope",
      headers: {},
    });

    assert.equal(response.statusCode, 404);
    assert.equal(response.body.error, "BATTLE_NOT_FOUND");
  });
});
