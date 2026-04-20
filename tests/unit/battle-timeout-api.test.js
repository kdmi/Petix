const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createCompletedCharacter,
  createInternalHeaders,
  createWallet,
  invokeJsonHandler,
  withBattleTimeoutEnv,
} = require("./helpers/battle-timeout-test-utils");

async function seedProfiles(store, { attackerWallet, attackerCharacter, defenderWallet, defenderCharacter }) {
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

function buildParticipants(battleLib, input) {
  return {
    attackerParticipant: battleLib.buildBattleParticipant({
      wallet: input.attackerWallet,
      character: input.attackerCharacter,
    }),
    defenderParticipant: battleLib.buildBattleParticipant({
      wallet: input.defenderWallet,
      character: input.defenderCharacter,
    }),
  };
}

test("POST /api/battles does not grant rewards when completed battle persistence fails", async () => {
  await withBattleTimeoutEnv(
    async ({ auth, battleStore, battlesRoute, store }) => {
      const attackerWallet = createWallet("1");
      const defenderWallet = createWallet("2");
      const attackerCharacter = createCompletedCharacter({
        id: "pet_post_fail_attacker",
        name: "Timeout Hero",
        level: 1,
      });
      const defenderCharacter = createCompletedCharacter({
        id: "pet_post_fail_defender",
        name: "Timeout Rival",
        level: 1,
      });

      await seedProfiles(store, {
        attackerWallet,
        attackerCharacter,
        defenderWallet,
        defenderCharacter,
      });

      const response = await invokeJsonHandler(battlesRoute, {
        method: "POST",
        url: "/api/battles",
        headers: createInternalHeaders(auth, attackerWallet),
        body: {
          attackerPetId: attackerCharacter.id,
        },
      });

      assert.equal(response.statusCode, 400);

      const attackerProfile = await store.getWalletProfile(attackerWallet, { fresh: true });
      const attackerPet = attackerProfile.characters.find((record) => record.id === attackerCharacter.id);
      assert.equal(attackerPet.experience, attackerCharacter.experience);

      const history = await battleStore.listBattleHistoryForWallet(attackerWallet);
      assert.equal(history.history.length, 0);

      const attempts = await battleStore.listBattleRecords({ fresh: true });
      assert.equal(attempts.length, 1);
      assert.equal(attempts[0].status, "failed");
      assert.equal(attempts[0].finalizationState.rewardStatus, "not_applied");
    },
    {
      mocks: {
        battleStore: (actual) => ({
          ...actual,
          saveBattleRecord: async (record) => {
            if (record?.status === "ready") {
              const error = new Error("Completed battle persistence failed.");
              error.code = "READY_PERSISTENCE_FAILED";
              throw error;
            }

            return actual.saveBattleRecord(record);
          },
        }),
      },
    }
  );
});

test("GET /api/battles/:battleId exposes generating, failed, and recovered ready states", async () => {
  await withBattleTimeoutEnv(async ({
    auth,
    battleByIdRoute,
    battleLib,
    battleNarration,
    battleStore,
    store,
  }) => {
    const attackerWallet = createWallet("3");
    const defenderWallet = createWallet("4");
    const attackerCharacter = createCompletedCharacter({
      id: "pet_status_attacker",
      name: "Status Hero",
      level: 1,
    });
    const defenderCharacter = createCompletedCharacter({
      id: "pet_status_defender",
      name: "Status Rival",
      level: 1,
    });

    await seedProfiles(store, {
      attackerWallet,
      attackerCharacter,
      defenderWallet,
      defenderCharacter,
    });

    const simulation = battleLib.createBattleSimulation({
      battleId: "battle_status_ready",
      ...buildParticipants(battleLib, {
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

    await battleStore.saveBattleRecord(battleLib.buildGeneratingBattleRecord(simulation.battle));
    await battleStore.saveBattleRecord({
      id: "battle_status_failed",
      status: "failed",
      battleType: "pvp_random",
      createdAt: simulation.battle.createdAt,
      completedAt: simulation.battle.completedAt,
      attackerPetId: simulation.battle.attackerPetId,
      defenderPetId: simulation.battle.defenderPetId,
      attackerOwnerWallet: attackerWallet,
      defenderOwnerWallet: defenderWallet,
      attackerSnapshot: simulation.battle.attackerSnapshot,
      defenderSnapshot: simulation.battle.defenderSnapshot,
      rounds: [],
      result: null,
      error: "BATTLE_GENERATION_FAILED",
      finalizationState: {
        rewardStatus: "not_applied",
        attackerAppliedAt: null,
        defenderAppliedAt: null,
        lastAttemptAt: simulation.battle.completedAt,
        lastAttemptResult: "BATTLE_GENERATION_FAILED",
      },
    });
    await battleStore.saveBattleRecord(
      battleLib.buildReadyBattleRecord({
        battle: {
          ...simulation.battle,
          id: "battle_status_ready_pending",
        },
        progression: simulation.progression,
        narration: battleNarration.applyFallbackNarration(simulation.battle),
      })
    );

    const generatingResponse = await invokeJsonHandler(battleByIdRoute, {
      method: "GET",
      url: "/api/battles/battle_status_ready",
      headers: createInternalHeaders(auth, attackerWallet),
    });
    assert.equal(generatingResponse.statusCode, 200);
    assert.equal(generatingResponse.body.status, "generating");
    assert.equal(generatingResponse.body.rewardStatus, "not_applied");

    const failedResponse = await invokeJsonHandler(battleByIdRoute, {
      method: "GET",
      url: "/api/battles/battle_status_failed",
      headers: createInternalHeaders(auth, attackerWallet),
    });
    assert.equal(failedResponse.statusCode, 200);
    assert.equal(failedResponse.body.status, "failed");
    assert.equal(failedResponse.body.rewardStatus, "not_applied");

    const readyResponse = await invokeJsonHandler(battleByIdRoute, {
      method: "GET",
      url: "/api/battles/battle_status_ready_pending",
      headers: createInternalHeaders(auth, attackerWallet),
    });
    assert.equal(readyResponse.statusCode, 200);
    assert.equal(readyResponse.body.status, "ready");
    assert.equal(readyResponse.body.rewardStatus, "applied");
    assert.equal(readyResponse.body.result.winnerPetId, simulation.battle.result.winnerPetId);
  });
});

test("POST /api/battles falls back safely when narration helper throws on the critical path", async () => {
  await withBattleTimeoutEnv(
    async ({ auth, battleByIdRoute, battlesRoute, store }) => {
      const attackerWallet = createWallet("5");
      const defenderWallet = createWallet("6");
      const attackerCharacter = createCompletedCharacter({
        id: "pet_narration_attacker",
        name: "Narration Hero",
        level: 1,
      });
      const defenderCharacter = createCompletedCharacter({
        id: "pet_narration_defender",
        name: "Narration Rival",
        level: 1,
      });

      await seedProfiles(store, {
        attackerWallet,
        attackerCharacter,
        defenderWallet,
        defenderCharacter,
      });

      const createResponse = await invokeJsonHandler(battlesRoute, {
        method: "POST",
        url: "/api/battles",
        headers: createInternalHeaders(auth, attackerWallet),
        body: {
          attackerPetId: attackerCharacter.id,
        },
      });

      assert.equal(createResponse.statusCode, 200);
      assert.equal(createResponse.body.status, "generating");
      assert.ok(createResponse.body.battleId);

      const replayResponse = await invokeJsonHandler(battleByIdRoute, {
        method: "GET",
        url: `/api/battles/${createResponse.body.battleId}`,
        headers: createInternalHeaders(auth, attackerWallet),
      });

      assert.equal(replayResponse.statusCode, 200);
      assert.equal(replayResponse.body.status, "ready");
      assert.equal(replayResponse.body.narrationMode, "template");
    },
    {
      mocks: {
        battleNarration: (actual) => ({
          ...actual,
          generateBattleNarrationWithBudget: async () => {
            throw new Error("Simulated narration failure");
          },
        }),
      },
    }
  );
});
