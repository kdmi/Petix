const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createCompletedCharacter,
  createInternalHeaders,
  createReadyBattleRecord,
  createWallet,
  invokeJsonHandler,
  withIsolatedBattleHistoryEnv,
} = require("./helpers/battle-history-test-utils");

test("POST /api/character/upgrade spends points and returns the refreshed pet collection", async () => {
  await withIsolatedBattleHistoryEnv(async ({ auth, characterActionRoute, store }) => {
    const wallet = createWallet("7");
    const character = {
      ...createCompletedCharacter({
        id: "char_upgrade_ready",
        name: "Upgrade Pup",
        attributes: {
          stamina: 4,
          agility: 4,
          strength: 5,
          intelligence: 3,
        },
      }),
      attributePointsAvailable: 3,
    };

    await store.updateWalletProfile(wallet, async (current) => ({
      ...current,
      characters: [character],
    }));

    const response = await invokeJsonHandler(characterActionRoute, {
      method: "POST",
      url: "/api/character/upgrade",
      headers: createInternalHeaders(auth, wallet),
      body: {
        characterId: character.id,
        attributeIncrements: {
          strength: 2,
          intelligence: 1,
        },
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.character.attributePointsAvailable, 0);
    assert.deepEqual(response.body.character.attributes, {
      stamina: 4,
      agility: 4,
      strength: 7,
      intelligence: 4,
    });

    const profile = await store.getWalletProfile(wallet);
    assert.equal(profile.characters[0].attributePointsAvailable, 0);
    assert.deepEqual(profile.characters[0].attributes, {
      stamina: 4,
      agility: 4,
      strength: 7,
      intelligence: 4,
    });
  });
});

test("POST /api/character/upgrade requires authentication", async () => {
  await withIsolatedBattleHistoryEnv(async ({ characterActionRoute }) => {
    const response = await invokeJsonHandler(characterActionRoute, {
      method: "POST",
      url: "/api/character/upgrade",
      body: {
        characterId: "char_missing_auth",
        attributeIncrements: {
          stamina: 1,
        },
      },
    });

    assert.equal(response.statusCode, 401);
    assert.equal(response.body.error, "Unauthorized.");
  });
});

test("POST /api/character/upgrade rejects no-points and overspend requests", async () => {
  await withIsolatedBattleHistoryEnv(async ({ auth, characterActionRoute, store }) => {
    const wallet = createWallet("8");
    const noPointsCharacter = {
      ...createCompletedCharacter({
        id: "char_no_points",
        name: "Spent Puff",
      }),
      attributePointsAvailable: 0,
    };
    const overspendCharacter = {
      ...createCompletedCharacter({
        id: "char_overspend",
        name: "Greedy Puff",
      }),
      attributePointsAvailable: 2,
    };

    await store.updateWalletProfile(wallet, async (current) => ({
      ...current,
      characters: [noPointsCharacter, overspendCharacter],
    }));

    const noPointsResponse = await invokeJsonHandler(characterActionRoute, {
      method: "POST",
      url: "/api/character/upgrade",
      headers: createInternalHeaders(auth, wallet),
      body: {
        characterId: noPointsCharacter.id,
        attributeIncrements: {
          stamina: 1,
        },
      },
    });

    assert.equal(noPointsResponse.statusCode, 400);
    assert.equal(noPointsResponse.body.error, "This pet has no upgrade points available.");

    const overspendResponse = await invokeJsonHandler(characterActionRoute, {
      method: "POST",
      url: "/api/character/upgrade",
      headers: createInternalHeaders(auth, wallet),
      body: {
        characterId: overspendCharacter.id,
        attributeIncrements: {
          stamina: 3,
        },
      },
    });

    assert.equal(overspendResponse.statusCode, 400);
    assert.equal(overspendResponse.body.error, "Invalid upgrade allocation.");
  });
});

test("POST /api/character/upgrade does not mutate stored battle replay snapshots", async () => {
  await withIsolatedBattleHistoryEnv(async ({ auth, battleStore, characterActionRoute, store }) => {
    const wallet = createWallet("9");
    const opponentWallet = createWallet("6");
    const character = {
      ...createCompletedCharacter({
        id: "char_replay_safe",
        name: "Replay Safe",
        level: 5,
        attributes: {
          stamina: 5,
          agility: 4,
          strength: 6,
          intelligence: 3,
        },
      }),
      attributePointsAvailable: 2,
    };

    await store.updateWalletProfile(wallet, async (current) => ({
      ...current,
      characters: [character],
    }));

    await battleStore.saveBattleRecord(
      createReadyBattleRecord({
        id: "battle_upgrade_snapshot",
        attackerOwnerWallet: wallet,
        defenderOwnerWallet: opponentWallet,
        attackerPetId: character.id,
        attackerPetName: character.name,
        attackerLevel: character.level,
      })
    );

    const beforeReplay = await battleStore.getBattleRecord("battle_upgrade_snapshot");

    const response = await invokeJsonHandler(characterActionRoute, {
      method: "POST",
      url: "/api/character/upgrade",
      headers: createInternalHeaders(auth, wallet),
      body: {
        characterId: character.id,
        attributeIncrements: {
          stamina: 1,
          intelligence: 1,
        },
      },
    });

    assert.equal(response.statusCode, 200);

    const afterReplay = await battleStore.getBattleRecord("battle_upgrade_snapshot");
    assert.deepEqual(afterReplay.attackerSnapshot.attributes, beforeReplay.attackerSnapshot.attributes);
    assert.equal(afterReplay.result.winnerPetId, beforeReplay.result.winnerPetId);
  });
});

test("POST /api/character/upgrade keeps the save contract stable for higher-level pets", async () => {
  await withIsolatedBattleHistoryEnv(async ({ auth, characterActionRoute, store }) => {
    const wallet = createWallet("4");
    const character = {
      ...createCompletedCharacter({
        id: "char_high_level_upgrade",
        name: "Tower Fang",
        level: 18,
        attributes: {
          stamina: 10,
          agility: 9,
          strength: 11,
          intelligence: 8,
        },
      }),
      attributePointsAvailable: 4,
    };

    await store.updateWalletProfile(wallet, async (current) => ({
      ...current,
      characters: [character],
    }));

    const response = await invokeJsonHandler(characterActionRoute, {
      method: "POST",
      url: "/api/character/upgrade",
      headers: createInternalHeaders(auth, wallet),
      body: {
        characterId: character.id,
        attributeIncrements: {
          stamina: 2,
          intelligence: 2,
        },
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.character.level, 18);
    assert.equal(response.body.character.attributePointsAvailable, 0);
    assert.deepEqual(response.body.character.attributes, {
      stamina: 12,
      agility: 9,
      strength: 11,
      intelligence: 10,
    });
  });
});
