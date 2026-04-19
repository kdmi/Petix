const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createReadyBattleRecord,
  createWallet,
  withIsolatedBattleHistoryEnv,
} = require("./helpers/battle-history-test-utils");

test("listBattleHistoryForWallet returns newest-first entries for attacker and defender participation", async () => {
  await withIsolatedBattleHistoryEnv(async ({ battleStore }) => {
    const playerWallet = createWallet("1");
    const rivalWallet = createWallet("2");
    const outsiderWallet = createWallet("3");

    await battleStore.saveBattleRecord(
      createReadyBattleRecord({
        id: "battle_older_attacker",
        completedAt: "2026-04-17T09:00:00.000Z",
        attackerOwnerWallet: playerWallet,
        defenderOwnerWallet: rivalWallet,
        attackerPetId: "pet_solar",
        attackerPetName: "Solar Fang",
        defenderPetId: "pet_moss",
        defenderPetName: "Moss Byte",
        winnerPetId: "pet_solar",
        finalSummaryText: "Solar Fang closes the duel with a bright finisher.",
      })
    );

    await battleStore.saveBattleRecord(
      createReadyBattleRecord({
        id: "battle_newer_defender",
        completedAt: "2026-04-17T11:30:00.000Z",
        attackerOwnerWallet: outsiderWallet,
        defenderOwnerWallet: playerWallet,
        attackerPetId: "pet_glitch",
        attackerPetName: "Glitch Tail",
        defenderPetId: "pet_nova",
        defenderPetName: "Nova Bloom",
        winnerPetId: "pet_nova",
        finalSummaryText: "Nova Bloom holds the line and steals the win on defense.",
      })
    );

    await battleStore.saveBattleRecord(
      createReadyBattleRecord({
        id: "battle_irrelevant",
        completedAt: "2026-04-17T12:15:00.000Z",
        attackerOwnerWallet: outsiderWallet,
        defenderOwnerWallet: rivalWallet,
      })
    );

    const payload = await battleStore.listBattleHistoryForWallet(playerWallet);

    assert.deepEqual(
      payload.history.map((entry) => entry.battleId),
      ["battle_newer_defender", "battle_older_attacker"]
    );
    assert.equal(payload.history[0].playerRole, "defender");
    assert.equal(payload.history[0].outcome, "win");
    assert.equal(payload.history[0].playerPet.name, "Nova Bloom");
    assert.equal(payload.history[0].opponentPet.name, "Glitch Tail");
    assert.equal(payload.history[0].replayUrl, "/dashboard/?screen=arena&battleId=battle_newer_defender");
    assert.equal(payload.history[1].playerRole, "attacker");
    assert.equal(payload.history[1].outcome, "win");
    assert.equal(payload.page.hasMore, false);
    assert.equal(payload.page.nextCursor, null);
  });
});

test("listBattleHistoryForWallet paginates older entries with a stable cursor", async () => {
  await withIsolatedBattleHistoryEnv(async ({ battleStore }) => {
    const playerWallet = createWallet("4");
    const rivalWallet = createWallet("5");

    await battleStore.saveBattleRecord(
      createReadyBattleRecord({
        id: "battle_gamma",
        completedAt: "2026-04-17T12:30:00.000Z",
        attackerOwnerWallet: playerWallet,
        defenderOwnerWallet: rivalWallet,
      })
    );
    await battleStore.saveBattleRecord(
      createReadyBattleRecord({
        id: "battle_beta",
        completedAt: "2026-04-17T12:30:00.000Z",
        attackerOwnerWallet: playerWallet,
        defenderOwnerWallet: rivalWallet,
      })
    );
    await battleStore.saveBattleRecord(
      createReadyBattleRecord({
        id: "battle_alpha",
        completedAt: "2026-04-17T11:10:00.000Z",
        attackerOwnerWallet: playerWallet,
        defenderOwnerWallet: rivalWallet,
      })
    );

    const firstPage = await battleStore.listBattleHistoryForWallet(playerWallet, { limit: 2 });
    assert.deepEqual(
      firstPage.history.map((entry) => entry.battleId),
      ["battle_gamma", "battle_beta"]
    );
    assert.equal(firstPage.page.hasMore, true);
    assert.ok(firstPage.page.nextCursor);

    const secondPage = await battleStore.listBattleHistoryForWallet(playerWallet, {
      limit: 2,
      cursor: firstPage.page.nextCursor,
    });
    assert.deepEqual(
      secondPage.history.map((entry) => entry.battleId),
      ["battle_alpha"]
    );
    assert.equal(secondPage.page.hasMore, false);
    assert.equal(secondPage.page.nextCursor, null);
  });
});
