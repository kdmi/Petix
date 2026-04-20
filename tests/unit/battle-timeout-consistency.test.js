const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createCompletedCharacter,
  createInternalHeaders,
  createWallet,
  invokeJsonHandler,
  withBattleTimeoutEnv,
} = require("./helpers/battle-timeout-test-utils");

function buildBattleParticipants(battleLib, { attackerWallet, attackerCharacter, defenderWallet, defenderCharacter }) {
  return {
    attackerParticipant: battleLib.buildBattleParticipant({
      wallet: attackerWallet,
      character: attackerCharacter,
    }),
    defenderParticipant: battleLib.buildBattleParticipant({
      wallet: defenderWallet,
      character: defenderCharacter,
    }),
  };
}

async function seedBattleProfiles(store, { attackerWallet, attackerCharacter, defenderWallet, defenderCharacter }) {
  await store.saveWalletProfile(attackerWallet, {
    draft: null,
    characters: [attackerCharacter],
    notifications: [],
    battleState: null,
  });
  await store.saveWalletProfile(defenderWallet, {
    draft: null,
    characters: [defenderCharacter],
    notifications: [],
    battleState: null,
  });
}

test("wallet reward ledger records exactly one reward per battle and reward kind", async () => {
  await withBattleTimeoutEnv(async ({ store }) => {
    const profile = await store.getWalletProfile(createWallet("1"));
    const updated = store.recordWalletBattleReward(profile, "battle_ledger", {
      rewardKind: "attacker",
      petId: "pet_a",
      appliedAt: "2026-04-20T10:00:00.000Z",
    });

    assert.equal(store.hasWalletBattleReward(updated, "battle_ledger", "attacker"), true);
    assert.equal(store.hasWalletBattleReward(updated, "battle_ledger", "defender"), false);
    assert.deepEqual(store.getWalletBattleRewardLedgerEntry(updated, "battle_ledger"), {
      battleId: "battle_ledger",
      appliedAt: "2026-04-20T10:00:00.000Z",
      rewards: {
        attacker: {
          rewardKind: "attacker",
          petId: "pet_a",
          appliedAt: "2026-04-20T10:00:00.000Z",
        },
      },
    });
  });
});

test("pending ready battles finalize rewards exactly once and become visible in history", async () => {
  await withBattleTimeoutEnv(async ({ battleFinalization, battleLib, battleNarration, battleStore, store }) => {
    const attackerWallet = createWallet("1");
    const defenderWallet = createWallet("2");
    const attackerCharacter = createCompletedCharacter({
      id: "pet_attacker",
      name: "Ghost Buster",
      level: 1,
    });
    const defenderCharacter = createCompletedCharacter({
      id: "pet_defender",
      name: "Slow Rival",
      level: 1,
    });

    await seedBattleProfiles(store, {
      attackerWallet,
      attackerCharacter,
      defenderWallet,
      defenderCharacter,
    });

    const simulation = battleLib.createBattleSimulation({
      battleId: "battle_pending_rewards",
      ...buildBattleParticipants(battleLib, {
        attackerWallet,
        attackerCharacter,
        defenderWallet,
        defenderCharacter,
      }),
      matchmaking: null,
      random: {
        int(min, max) {
          return max;
        },
        float() {
          return 0.5;
        },
      },
    });

    const pendingRecord = battleLib.buildReadyBattleRecord({
      battle: simulation.battle,
      progression: simulation.progression,
      narration: battleNarration.applyFallbackNarration(simulation.battle),
    });

    await battleStore.saveBattleRecord(pendingRecord);

    const beforeHistory = await battleStore.listBattleHistoryForWallet(attackerWallet);
    assert.equal(beforeHistory.history.length, 0);

    const finalized = await battleFinalization.reconcileBattleFinalization("battle_pending_rewards");
    assert.equal(finalized.finalizationState.rewardStatus, "applied");

    const attackerProfile = await store.getWalletProfile(attackerWallet, { fresh: true });
    const attackerPet = attackerProfile.characters.find((record) => record.id === "pet_attacker");
    assert.equal(attackerPet.experience, simulation.progression.attacker.experience);

    const history = await battleStore.listBattleHistoryForWallet(attackerWallet);
    assert.equal(history.history.length, 1);
    assert.equal(history.history[0].battleId, "battle_pending_rewards");

    await battleFinalization.reconcileBattleFinalization("battle_pending_rewards");

    const attackerProfileAgain = await store.getWalletProfile(attackerWallet, { fresh: true });
    const attackerPetAgain = attackerProfileAgain.characters.find((record) => record.id === "pet_attacker");
    assert.equal(attackerPetAgain.experience, simulation.progression.attacker.experience);
    assert.equal(
      store.getWalletBattleRewardLedgerEntry(attackerProfileAgain, "battle_pending_rewards").rewards
        .attacker.petId,
      "pet_attacker"
    );
  });
});

test("character profile refresh reconciles pending finalized battles before serializing progression", async () => {
  await withBattleTimeoutEnv(async ({
    auth,
    battleLib,
    battleNarration,
    battleStore,
    characterMeRoute,
    store,
  }) => {
    const attackerWallet = createWallet("3");
    const defenderWallet = createWallet("4");
    const attackerCharacter = createCompletedCharacter({
      id: "pet_refresh_attacker",
      name: "Refresh Hero",
      level: 1,
    });
    const defenderCharacter = createCompletedCharacter({
      id: "pet_refresh_defender",
      name: "Refresh Rival",
      level: 1,
    });

    await seedBattleProfiles(store, {
      attackerWallet,
      attackerCharacter,
      defenderWallet,
      defenderCharacter,
    });

    const simulation = battleLib.createBattleSimulation({
      battleId: "battle_refresh_reconcile",
      ...buildBattleParticipants(battleLib, {
        attackerWallet,
        attackerCharacter,
        defenderWallet,
        defenderCharacter,
      }),
      matchmaking: null,
      random: {
        int(min, max) {
          return max;
        },
        float() {
          return 0.5;
        },
      },
    });

    await battleStore.saveBattleRecord(
      battleLib.buildReadyBattleRecord({
        battle: simulation.battle,
        progression: simulation.progression,
        narration: battleNarration.applyFallbackNarration(simulation.battle),
      })
    );

    const response = await invokeJsonHandler(characterMeRoute, {
      method: "GET",
      url: "/api/character/me",
      headers: createInternalHeaders(auth, attackerWallet),
    });

    assert.equal(response.statusCode, 200);
    const refreshedCharacter = response.body.characters.find((record) => record.id === "pet_refresh_attacker");
    assert.equal(refreshedCharacter.experience, simulation.progression.attacker.experience);

    const history = await battleStore.listBattleHistoryForWallet(attackerWallet);
    assert.equal(history.history.length, 1);
    assert.equal(history.history[0].battleId, "battle_refresh_reconcile");
  });
});

test("battle store and admin summaries retain investigation metadata for failed and pending attempts", async () => {
  await withBattleTimeoutEnv(async ({ adminBattlesRoute, auth, battleStore }) => {
    await battleStore.saveBattleRecord({
      id: "battle_failed_attempt",
      status: "failed",
      battleType: "pvp_random",
      createdAt: "2026-04-20T10:00:00.000Z",
      completedAt: "2026-04-20T10:00:05.000Z",
      attackerPetId: "pet_a",
      defenderPetId: "pet_b",
      attackerOwnerWallet: createWallet("5"),
      defenderOwnerWallet: createWallet("6"),
      rounds: [],
      result: null,
      error: "BATTLE_GENERATION_FAILED",
      failureStage: "ready_persistence",
      finalizationState: {
        rewardStatus: "not_applied",
        attackerAppliedAt: null,
        defenderAppliedAt: null,
        lastAttemptAt: "2026-04-20T10:00:05.000Z",
        lastAttemptResult: "BATTLE_GENERATION_FAILED",
      },
      attackerSnapshot: null,
      defenderSnapshot: null,
    });

    const response = await invokeJsonHandler(adminBattlesRoute, {
      method: "GET",
      url: "/server-routes/admin/battles",
      headers: createInternalHeaders(auth, "AwtqC9r5Wgvjfhqw5DrtzC5W73QRVF14DZVop8caECi9"),
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.battles[0].battleId, "battle_failed_attempt");
    assert.equal(response.body.battles[0].status, "failed");
    assert.equal(response.body.battles[0].rewardStatus, "not_applied");
    assert.equal(response.body.battles[0].failureStage, "ready_persistence");
    assert.equal(response.body.battles[0].finalizationState.lastAttemptResult, "BATTLE_GENERATION_FAILED");
  });
});
