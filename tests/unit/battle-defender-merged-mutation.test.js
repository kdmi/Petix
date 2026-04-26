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

test("POST /api/battles updates the defender profile via a single updateWalletProfile call", async () => {
  const updateCallsByWallet = new Map();

  await withIsolatedBattleHistoryEnv(
    async ({ auth, battlesRoute, store }) => {
      const attackerWallet = createWallet("g");
      const defenderWallet = createWallet("h");
      const attacker = createCompletedCharacter({ id: "pet_def_atk", name: "AttackerOne" });
      const defender = createCompletedCharacter({ id: "pet_def_def", name: "DefenderOne" });

      await store.saveWalletProfile(attackerWallet, buildProfile(attacker));
      await store.saveWalletProfile(defenderWallet, buildProfile(defender));

      // Reset counters captured during setup.
      updateCallsByWallet.clear();

      const { statusCode, body } = await invokeJsonHandler(battlesRoute, {
        method: "POST",
        url: "/api/battles",
        headers: createInternalHeaders(auth, attackerWallet),
        body: { attackerPetId: attacker.id },
      });

      assert.equal(statusCode, 200, `expected 200, got ${statusCode}: ${JSON.stringify(body)}`);

      const defenderUpdates = updateCallsByWallet.get(defenderWallet) || 0;
      assert.equal(
        defenderUpdates,
        1,
        `defender profile must be mutated exactly once per battle, was ${defenderUpdates}`
      );

      // Sanity: defender profile contains the new notification.
      const defenderProfile = await store.getWalletProfile(defenderWallet);
      const passiveNotif = defenderProfile.notifications.find(
        (n) => n?.type === "pet_was_challenged"
      );
      assert.ok(passiveNotif, "defender must receive a pet_was_challenged notification");
      assert.equal(passiveNotif.battleId, body.battleId);
    },
    {
      beforeRoutes: ({ store }) => {
        const original = store.updateWalletProfile;
        store.updateWalletProfile = async (wallet, updater) => {
          updateCallsByWallet.set(wallet, (updateCallsByWallet.get(wallet) || 0) + 1);
          return original.call(store, wallet, updater);
        };
      },
    }
  );
});
