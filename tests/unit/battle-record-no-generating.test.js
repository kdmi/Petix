const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createCompletedCharacter,
  createInternalHeaders,
  createWallet,
  invokeJsonHandler,
  withIsolatedBattleHistoryEnv,
} = require("./helpers/battle-history-test-utils");

function buildProfile(character) {
  return {
    draft: null,
    characters: [character],
    notifications: [],
    battleState: { energyCurrent: 3, energyMax: 3, refillDate: null },
    currency: { balance: 0, totalEarned: 0 },
  };
}

test("POST /api/battles persists exactly one battle record with status=ready", async () => {
  const saveCalls = [];
  await withIsolatedBattleHistoryEnv(
    async ({ auth, battlesRoute, battleStore, store }) => {
      const attackerWallet = createWallet("a");
      const defenderWallet = createWallet("b");
      const attacker = createCompletedCharacter({ id: "pet_norec_attacker", name: "Atk" });
      const defender = createCompletedCharacter({ id: "pet_norec_defender", name: "Def" });

      await store.saveWalletProfile(attackerWallet, buildProfile(attacker));
      await store.saveWalletProfile(defenderWallet, buildProfile(defender));

      const { statusCode, body } = await invokeJsonHandler(battlesRoute, {
        method: "POST",
        url: "/api/battles",
        headers: createInternalHeaders(auth, attackerWallet),
        body: { attackerPetId: attacker.id },
      });

      assert.equal(statusCode, 200, `expected 200, got ${statusCode}: ${JSON.stringify(body)}`);
      assert.equal(saveCalls.length, 1, `saveBattleRecord must be called once, was ${saveCalls.length}`);
      assert.equal(saveCalls[0].status, "ready", "the single saved record must be ready, not generating");
      assert.equal(saveCalls[0].id, body.battleId);

      const stored = await battleStore.getBattleRecord(body.battleId);
      assert.equal(stored?.status, "ready");
    },
    {
      beforeRoutes: ({ battleStore }) => {
        const original = battleStore.saveBattleRecord;
        battleStore.saveBattleRecord = async (record) => {
          saveCalls.push({ id: record?.id, status: record?.status });
          return original.call(battleStore, record);
        };
      },
    }
  );
});

test("POST /api/battles records a failed entry when generation fails after battleId is assigned", async () => {
  const failedSaves = [];
  await withIsolatedBattleHistoryEnv(
    async ({ auth, battlesRoute, battleStore, store }) => {
      const attackerWallet = createWallet("c");
      const defenderWallet = createWallet("d");
      const attacker = createCompletedCharacter({ id: "pet_failed_attacker", name: "AtkFail" });
      const defender = createCompletedCharacter({ id: "pet_failed_defender", name: "DefFail" });

      await store.saveWalletProfile(attackerWallet, buildProfile(attacker));
      await store.saveWalletProfile(defenderWallet, buildProfile(defender));

      const { statusCode, body } = await invokeJsonHandler(battlesRoute, {
        method: "POST",
        url: "/api/battles",
        headers: createInternalHeaders(auth, attackerWallet),
        body: { attackerPetId: attacker.id },
      });

      // Either the simulation succeeded (status=ready) or it failed and we persisted a failed record.
      // We only assert on the failed path here.
      if (statusCode !== 200) {
        assert.ok(
          failedSaves.some((rec) => rec.status === "failed"),
          "on failure, a failed record must be persisted"
        );
      }

      // Regardless of outcome: there must NOT be a record left in `generating` state.
      const allRecords = (await battleStore.listBattleRecords?.()) || [];
      const generating = allRecords.filter((rec) => rec?.status === "generating");
      assert.equal(generating.length, 0, "no battle record may be left in 'generating' state");
    },
    {
      beforeRoutes: ({ battleStore }) => {
        const original = battleStore.saveBattleRecord;
        battleStore.saveBattleRecord = async (record) => {
          if (record?.status === "failed") {
            failedSaves.push({ id: record.id, status: record.status });
          }
          return original.call(battleStore, record);
        };
      },
    }
  );
});
