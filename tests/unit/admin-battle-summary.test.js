const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createBattleRound,
  createReadyBattleRecord,
  withIsolatedBattleHistoryEnv,
} = require("./helpers/battle-history-test-utils");

function createBattleWithRounds({ id, roundCount, narrationMode = "template", completedAt }) {
  return {
    ...createReadyBattleRecord({
    id,
    completedAt,
    rounds: Array.from({ length: roundCount }, (_, index) =>
      createBattleRound({
        roundNumber: index + 1,
      })
    ),
    }),
    narrationMode,
  };
}

test("listAdminCompletedBattles summarizes total battles and average rounds from the latest 50", async () => {
  await withIsolatedBattleHistoryEnv(async ({ battleStore }) => {
    const roundCounts = [];

    for (let index = 0; index < 55; index += 1) {
      const roundCount = 10 + index;
      roundCounts.push(roundCount);
      await battleStore.saveBattleRecord(
        createBattleWithRounds({
          id: `battle_admin_${index}`,
          roundCount,
          narrationMode: index % 2 === 0 ? "ai" : "template",
          completedAt: new Date(Date.UTC(2026, 3, 19, 0, index, 0)).toISOString(),
        })
      );
    }

    const payload = await battleStore.listAdminCompletedBattles();
    const latest50Average =
      roundCounts
        .slice(-50)
        .reverse()
        .reduce((sum, value) => sum + value, 0) / 50;

    assert.equal(payload.summary.totalCompletedBattles, 55);
    assert.equal(payload.summary.averageRoundsSampleSize, 50);
    assert.equal(payload.summary.averageRoundsLast50, Math.round(latest50Average * 10) / 10);
    assert.equal(payload.summary.aiNarratedBattles, 28);
    assert.equal(payload.summary.templateNarratedBattles, 27);
    assert.equal(payload.battles.length, 55);
    assert.equal(payload.battles[0].battleId, "battle_admin_54");
    assert.equal(payload.battles[0].roundCount, 64);
  });
});

test("listAdminCompletedBattles keeps completed-only summary metrics while still returning investigation rows", async () => {
  await withIsolatedBattleHistoryEnv(async ({ battleStore }) => {
    await battleStore.saveBattleRecord(
      createBattleWithRounds({
        id: "battle_ready_visible",
        roundCount: 16,
      })
    );
    await battleStore.saveBattleRecord({
      id: "battle_generating_hidden",
      status: "generating",
      createdAt: "2026-04-19T14:00:00.000Z",
      attackerPetId: "a",
      defenderPetId: "b",
    });

    const payload = await battleStore.listAdminCompletedBattles();
    assert.equal(payload.summary.totalCompletedBattles, 1);
    assert.deepEqual(
      payload.battles.map((battle) => battle.battleId),
      ["battle_generating_hidden", "battle_ready_visible"]
    );
    assert.equal(payload.battles[0].status, "generating");
    assert.equal(payload.battles[0].rewardStatus, "not_applied");
  });
});
