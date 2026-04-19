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

test("GET /api/battles/[battleId] returns a stored replay for participants", async () => {
  await withIsolatedBattleHistoryEnv(async ({ auth, battleStore, battleByIdRoute }) => {
    const attackerWallet = createWallet("2");
    const defenderWallet = createWallet("3");

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
      headers: createInternalHeaders(auth, attackerWallet),
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

test("GET /api/battles/[battleId] rejects non-participants and missing replays with explicit errors", async () => {
  await withIsolatedBattleHistoryEnv(async ({ auth, battleStore, battleByIdRoute }) => {
    const attackerWallet = createWallet("4");
    const defenderWallet = createWallet("5");
    const outsiderWallet = createWallet("9");

    await battleStore.saveBattleRecord(
      createReadyBattleRecord({
        id: "battle_locked",
        attackerOwnerWallet: attackerWallet,
        defenderOwnerWallet: defenderWallet,
      })
    );

    const forbidden = await invokeJsonHandler(battleByIdRoute, {
      headers: createInternalHeaders(auth, outsiderWallet),
      url: "/api/battles/battle_locked",
    });
    assert.equal(forbidden.statusCode, 403);
    assert.deepEqual(forbidden.body, {
      error: "BATTLE_REPLAY_FORBIDDEN",
      message: "This battle replay is not available to the current wallet.",
    });

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
