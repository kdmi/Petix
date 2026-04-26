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
    currency: { balance: 100, totalEarned: 100 },
  };
}

test("POST /api/battles 200 response has integer coinReward at top level", async () => {
  await withIsolatedBattleHistoryEnv(async ({ auth, battlesRoute, store }) => {
    const attackerWallet = createWallet("A");
    const defenderWallet = createWallet("B");
    const attacker = createCompletedCharacter({ id: "pet_contract_a", name: "Attacker" });
    const defender = createCompletedCharacter({ id: "pet_contract_b", name: "Defender" });

    await store.saveWalletProfile(attackerWallet, buildProfile(attacker));
    await store.saveWalletProfile(defenderWallet, buildProfile(defender));

    const { statusCode, body } = await invokeJsonHandler(battlesRoute, {
      method: "POST",
      url: "/api/battles",
      headers: createInternalHeaders(auth, attackerWallet),
      body: { attackerPetId: attacker.id },
    });

    assert.equal(statusCode, 200, `expected 200, got ${statusCode}: ${JSON.stringify(body)}`);
    assert.ok("coinReward" in body, "response must have top-level coinReward field");
    assert.ok(Number.isInteger(body.coinReward), `coinReward must be an integer, got ${typeof body.coinReward}: ${body.coinReward}`);
    assert.ok(body.coinReward >= 0, `coinReward must be >= 0, got ${body.coinReward}`);
  });
});

test("POST /api/battles 200 response has top-level currency object with integer fields", async () => {
  await withIsolatedBattleHistoryEnv(async ({ auth, battlesRoute, store }) => {
    const attackerWallet = createWallet("C");
    const defenderWallet = createWallet("D");
    const attacker = createCompletedCharacter({ id: "pet_contract_c", name: "Attacker C" });
    const defender = createCompletedCharacter({ id: "pet_contract_d", name: "Defender D" });

    await store.saveWalletProfile(attackerWallet, buildProfile(attacker));
    await store.saveWalletProfile(defenderWallet, buildProfile(defender));

    const { statusCode, body } = await invokeJsonHandler(battlesRoute, {
      method: "POST",
      url: "/api/battles",
      headers: createInternalHeaders(auth, attackerWallet),
      body: { attackerPetId: attacker.id },
    });

    assert.equal(statusCode, 200, `expected 200, got ${statusCode}: ${JSON.stringify(body)}`);
    assert.ok(typeof body.currency === "object" && body.currency !== null, "response must have top-level currency object");
    assert.ok(Number.isInteger(body.currency.balance), `currency.balance must be an integer, got ${body.currency.balance}`);
    assert.ok(Number.isInteger(body.currency.totalEarned), `currency.totalEarned must be an integer, got ${body.currency.totalEarned}`);
    assert.ok(body.currency.balance >= 0, `currency.balance must be >= 0`);
    assert.ok(body.currency.totalEarned >= 0, `currency.totalEarned must be >= 0`);
  });
});
