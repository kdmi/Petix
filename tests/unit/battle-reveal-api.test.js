const fs = require("fs/promises");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createCompletedCharacter,
  createInternalHeaders,
  createWallet,
  invokeHandler,
  invokeJsonHandler,
  withIsolatedBattleHistoryEnv,
} = require("./helpers/battle-history-test-utils");

test("GET /api/battles/opponents returns rival previews with real image routes", async () => {
  await withIsolatedBattleHistoryEnv(async ({ auth, opponentsRoute, store }) => {
    const attackerWallet = createWallet("1");
    const rivalWallet = createWallet("2");

    await store.saveWalletProfile(attackerWallet, {
      characters: [createCompletedCharacter({ id: "pet_attacker", name: "Attacker", level: 5 })],
    });
    await store.saveWalletProfile(rivalWallet, {
      characters: [createCompletedCharacter({ id: "pet_rival", name: "Rival", level: 4 })],
    });

    const response = await invokeJsonHandler(opponentsRoute, {
      headers: createInternalHeaders(auth, attackerWallet),
      url: "/api/battles/opponents?attackerPetId=pet_attacker&limit=6",
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.opponents.length, 1);
    assert.equal(response.body.opponents[0].id, "pet_rival");
    assert.match(response.body.opponents[0].imageUrl, /^\/api\/character\/image\?id=pet_rival&v=/);
    assert.equal(response.body.opponents[0].creatorWallet, rivalWallet);
    assert.equal(response.body.opponents[0].matchTier, "preferred");
    assert.ok(!response.body.opponents.some((entry) => entry.id === "pet_attacker"));
  });
});

test("POST /api/battles returns an authoritative reveal bundle with the selected opponent", async () => {
  await withIsolatedBattleHistoryEnv(async ({ auth, battlesRoute, store }) => {
    const attackerWallet = createWallet("3");
    const rivalWallet = createWallet("4");

    await store.saveWalletProfile(attackerWallet, {
      characters: [createCompletedCharacter({ id: "pet_attacker", name: "Attacker", level: 5 })],
    });
    await store.saveWalletProfile(rivalWallet, {
      characters: [createCompletedCharacter({ id: "pet_rival", name: "Rival", level: 4 })],
    });

    const response = await invokeJsonHandler(battlesRoute, {
      method: "POST",
      headers: createInternalHeaders(auth, attackerWallet),
      url: "/api/battles",
      body: {
        attackerPetId: "pet_attacker",
      },
    });

    assert.equal(response.statusCode, 200);
    assert.match(response.body.battleId, /^battle_/);
    assert.equal(response.body.status, "ready");
    assert.equal(response.body.battle?.status, "ready");
    assert.equal(response.body.battle?.id, response.body.battleId);
    assert.equal(response.body.reveal.selectedOpponent.id, "pet_rival");
    assert.ok(
      response.body.reveal.carouselCandidates.some((entry) => entry.id === "pet_rival")
    );
    assert.equal(response.body.reveal.matchmaking.selectionMode, "preferred_band");
  });
});

test("completed opponent images can be fetched by another wallet session", async () => {
  await withIsolatedBattleHistoryEnv(async ({ auth, characterImageRoute, store, tempDir }) => {
    const attackerWallet = createWallet("5");
    const rivalWallet = createWallet("6");
    const customImagePath = path.join(tempDir, "rival-image.png");
    await fs.writeFile(customImagePath, "opponent-image-bytes");

    await store.saveWalletProfile(attackerWallet, {
      characters: [createCompletedCharacter({ id: "pet_attacker", name: "Attacker", level: 5 })],
    });
    await store.saveWalletProfile(rivalWallet, {
      characters: [
        createCompletedCharacter({
          id: "pet_rival",
          name: "Rival",
          level: 4,
          image: {
            filePath: customImagePath,
            mimeType: "image/png",
          },
        }),
      ],
    });

    const response = await invokeHandler(characterImageRoute, {
      headers: createInternalHeaders(auth, attackerWallet),
      url: "/api/character/image?id=pet_rival",
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.response.getHeader("content-type"), "image/png");
    assert.equal(response.bodyText, "opponent-image-bytes");
  });
});
