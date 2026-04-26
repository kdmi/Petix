const test = require("node:test");
const assert = require("node:assert/strict");

const {
  withIsolatedBattleHistoryEnv,
  createWallet,
} = require("./helpers/battle-history-test-utils");

function buildProfileWithCharacter({ walletCurrency, character, battleState }) {
  return {
    draft: null,
    characters: [character],
    notifications: [],
    battleState: battleState || {
      energyCurrent: 3,
      energyMax: 3,
      refillDate: null,
    },
    currency: walletCurrency || { balance: 0, totalEarned: 0 },
  };
}

function buildCompletedCharacter({ id, level = 1 }) {
  return {
    id,
    status: "completed",
    creatureType: "Arena Cub",
    rarity: "Rare",
    name: `Hero ${id}`,
    displayName: `Hero ${id}`,
    level,
    experience: 0,
    softCurrency: 0,
    attributePointsAvailable: 0,
    attributes: { stamina: 4, agility: 5, strength: 6, intelligence: 7 },
    variables: {},
    selectedPowerId: "power_1",
    powers: [{ id: "power_1", title: "Blast", description: "." }],
    image: {},
    createdAt: "2026-04-17T00:00:00.000Z",
    updatedAt: "2026-04-17T00:00:00.000Z",
    completedAt: "2026-04-17T00:00:00.000Z",
  };
}

function buildProgressionState({ level = 1, experience = 0 } = {}) {
  return {
    level,
    experience,
    softCurrency: 0,
    attributePointsAvailable: 0,
    xpGained: 200,
    levelUp: false,
    newLevel: level,
  };
}

test("applyAttackerBattleMutation credits the attacker when they are the winner", async () => {
  await withIsolatedBattleHistoryEnv(async ({ battlesRoute, store }) => {
    const wallet = createWallet("1");
    const petId = "pet_attacker_win";
    await store.saveWalletProfile(
      wallet,
      buildProfileWithCharacter({
        walletCurrency: { balance: 50, totalEarned: 50 },
        character: buildCompletedCharacter({ id: petId, level: 5 }),
      })
    );

    const { applyAttackerBattleMutation } = battlesRoute;
    const result = await applyAttackerBattleMutation({
      wallet,
      petId,
      progressionState: buildProgressionState({ level: 5 }),
      coinReward: 120,
    });

    assert.equal(result.updatedCurrency.balance, 170);
    assert.equal(result.updatedCurrency.totalEarned, 170);

    const reloaded = await store.getWalletProfile(wallet);
    assert.equal(reloaded.currency.balance, 170);
    assert.equal(reloaded.currency.totalEarned, 170);
  });
});

test("applyAttackerBattleMutation does NOT credit when coinReward is 0 (attacker lost)", async () => {
  await withIsolatedBattleHistoryEnv(async ({ battlesRoute, store }) => {
    const wallet = createWallet("2");
    const petId = "pet_attacker_lost";
    await store.saveWalletProfile(
      wallet,
      buildProfileWithCharacter({
        walletCurrency: { balance: 50, totalEarned: 50 },
        character: buildCompletedCharacter({ id: petId, level: 3 }),
      })
    );

    const { applyAttackerBattleMutation } = battlesRoute;
    await applyAttackerBattleMutation({
      wallet,
      petId,
      progressionState: buildProgressionState({ level: 3 }),
      coinReward: 0,
    });

    const reloaded = await store.getWalletProfile(wallet);
    assert.equal(reloaded.currency.balance, 50);
    assert.equal(reloaded.currency.totalEarned, 50);
  });
});

test("applyDefenderBattleMutation credits the defender when they are the winner", async () => {
  await withIsolatedBattleHistoryEnv(async ({ battlesRoute, store }) => {
    const wallet = createWallet("3");
    const petId = "pet_defender_win";
    await store.saveWalletProfile(
      wallet,
      buildProfileWithCharacter({
        walletCurrency: { balance: 10, totalEarned: 200 },
        character: buildCompletedCharacter({ id: petId, level: 10 }),
      })
    );

    const { applyDefenderBattleMutation } = battlesRoute;
    await applyDefenderBattleMutation({
      wallet,
      petId,
      progressionState: buildProgressionState({ level: 10 }),
      coinReward: 145,
    });

    const reloaded = await store.getWalletProfile(wallet);
    assert.equal(reloaded.currency.balance, 155);
    assert.equal(reloaded.currency.totalEarned, 345);
  });
});

test("applyAttackerBattleMutation rollback restores pre-battle balance via restoreWalletProfile", async () => {
  await withIsolatedBattleHistoryEnv(async ({ battlesRoute, store }) => {
    const wallet = createWallet("4");
    const petId = "pet_rollback";
    const startingCurrency = { balance: 500, totalEarned: 500 };
    await store.saveWalletProfile(
      wallet,
      buildProfileWithCharacter({
        walletCurrency: startingCurrency,
        character: buildCompletedCharacter({ id: petId, level: 2 }),
      })
    );

    const { applyAttackerBattleMutation, restoreWalletProfile } = battlesRoute;
    const result = await applyAttackerBattleMutation({
      wallet,
      petId,
      progressionState: buildProgressionState({ level: 2 }),
      coinReward: 150,
    });

    assert.equal(result.updatedCurrency.balance, 650);

    // Simulate handler catch-block restore
    await restoreWalletProfile(wallet, result.previousProfile);

    const reloaded = await store.getWalletProfile(wallet);
    assert.equal(reloaded.currency.balance, 500);
    assert.equal(reloaded.currency.totalEarned, 500);
  });
});

test("resolveWinnerCoinReward returns amount for attacker winner and role=attacker", async () => {
  await withIsolatedBattleHistoryEnv(async ({ battlesRoute }) => {
    const { resolveWinnerCoinReward } = battlesRoute;
    const simulation = {
      battle: { result: { winnerPetId: "pet_a" } },
    };
    const out = resolveWinnerCoinReward({
      simulation,
      attacker: { character: { id: "pet_a", level: 10 } },
      defender: { character: { id: "pet_b", level: 5 } },
    });
    assert.equal(out.winnerRole, "attacker");
    assert.ok(out.amount > 0);
  });
});

test("resolveWinnerCoinReward returns amount for defender winner and role=defender", async () => {
  await withIsolatedBattleHistoryEnv(async ({ battlesRoute }) => {
    const { resolveWinnerCoinReward } = battlesRoute;
    const simulation = {
      battle: { result: { winnerPetId: "pet_b" } },
    };
    const out = resolveWinnerCoinReward({
      simulation,
      attacker: { character: { id: "pet_a", level: 10 } },
      defender: { character: { id: "pet_b", level: 5 } },
    });
    assert.equal(out.winnerRole, "defender");
    assert.ok(out.amount > 0);
  });
});

test("resolveWinnerCoinReward returns zero when no winner resolved", async () => {
  await withIsolatedBattleHistoryEnv(async ({ battlesRoute }) => {
    const { resolveWinnerCoinReward } = battlesRoute;
    const out = resolveWinnerCoinReward({
      simulation: { battle: { result: { winnerPetId: null } } },
      attacker: { character: { id: "pet_a", level: 10 } },
      defender: { character: { id: "pet_b", level: 5 } },
    });
    assert.equal(out.amount, 0);
    assert.equal(out.winnerRole, null);
  });
});
