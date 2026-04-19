const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createBattleRound,
  createInternalHeaders,
  createReadyBattleRecord,
  createWallet,
  invokeJsonHandler,
  withIsolatedBattleHistoryEnv,
} = require("./helpers/battle-history-test-utils");

const ADMIN_WALLET = "AwtqC9r5Wgvjfhqw5DrtzC5W73QRVF14DZVop8caECi9";

test("GET /api/admin/battles returns summary metrics and newest-first battle entries for admins", async () => {
  await withIsolatedBattleHistoryEnv(async ({ adminActionRoute, auth, battleStore }) => {
    const olderCompletedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const newerCompletedAt = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();

    await battleStore.saveBattleRecord({
      ...createReadyBattleRecord({
        id: "battle_admin_old",
        completedAt: olderCompletedAt,
        attackerOwnerWallet: createWallet("4"),
        defenderOwnerWallet: createWallet("5"),
        rounds: [
          createBattleRound({ roundNumber: 1 }),
          createBattleRound({ roundNumber: 2 }),
        ],
      }),
      narrationMode: "template",
    });

    await battleStore.saveBattleRecord({
      ...createReadyBattleRecord({
        id: "battle_admin_new",
        completedAt: newerCompletedAt,
        attackerOwnerWallet: createWallet("6"),
        defenderOwnerWallet: createWallet("7"),
        rounds: [
          createBattleRound({ roundNumber: 1 }),
          createBattleRound({ roundNumber: 2 }),
          createBattleRound({ roundNumber: 3 }),
        ],
      }),
      narrationMode: "ai",
    });

    const response = await invokeJsonHandler(adminActionRoute, {
      method: "GET",
      url: "/api/admin/battles",
      headers: createInternalHeaders(auth, ADMIN_WALLET),
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body.summary, {
      totalCompletedBattles: 2,
      averageRoundsLast50: 2.5,
      averageRoundsSampleSize: 2,
      aiNarratedBattles: 1,
      templateNarratedBattles: 1,
      completedLast24Hours: 2,
    });
    assert.deepEqual(
      response.body.battles.map((battle) => battle.battleId),
      ["battle_admin_new", "battle_admin_old"]
    );
    assert.equal(response.body.battles[0].attackerPet.wallet, createWallet("6"));
    assert.equal(response.body.battles[0].roundCount, 3);
  });
});

test("GET /api/admin/battles enforces admin authorization", async () => {
  await withIsolatedBattleHistoryEnv(async ({ adminActionRoute, auth }) => {
    const unauthorized = await invokeJsonHandler(adminActionRoute, {
      method: "GET",
      url: "/api/admin/battles",
    });

    assert.equal(unauthorized.statusCode, 401);
    assert.equal(unauthorized.body.error, "Unauthorized.");

    const forbidden = await invokeJsonHandler(adminActionRoute, {
      method: "GET",
      url: "/api/admin/battles",
      headers: createInternalHeaders(auth, createWallet("8")),
    });

    assert.equal(forbidden.statusCode, 403);
    assert.equal(forbidden.body.error, "Forbidden.");
  });
});
