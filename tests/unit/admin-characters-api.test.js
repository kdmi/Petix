const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createCompletedCharacter,
  createInternalHeaders,
  invokeJsonHandler,
  withIsolatedBattleHistoryEnv,
} = require("./helpers/battle-history-test-utils");

const ADMIN_WALLET = "AwtqC9r5Wgvjfhqw5DrtzC5W73QRVF14DZVop8caECi9";
const CREATOR_WALLET = "H8GaxxEx2UfCDGxhXUUwHPzAtV2qWgpHnmH2PYxT2uKA";

test("GET /api/admin/characters exposes level and experience fields in the roster payload", async () => {
  await withIsolatedBattleHistoryEnv(async ({ adminActionRoute, auth, store }) => {
    const character = {
      ...createCompletedCharacter({
        id: "char_admin_progression",
        name: "Nova Paw",
        level: 4,
      }),
      experience: 225,
      completedAt: "2026-04-19T12:04:00.000Z",
    };

    await store.updateWalletProfile(CREATOR_WALLET, async (current) => ({
      ...current,
      characters: [character],
    }));

    const response = await invokeJsonHandler(adminActionRoute, {
      method: "GET",
      url: "/api/admin/characters",
      headers: createInternalHeaders(auth, ADMIN_WALLET),
    });

    assert.equal(response.statusCode, 200);
    assert.equal(Array.isArray(response.body.characters), true);
    assert.equal(response.body.characters.length, 1);
    assert.deepEqual(
      {
        level: response.body.characters[0].level,
        experience: response.body.characters[0].experience,
        experienceForNextLevel: response.body.characters[0].experienceForNextLevel,
        creatorWallet: response.body.characters[0].creatorWallet,
      },
      {
        level: 4,
        experience: 225,
        experienceForNextLevel: 650,
        creatorWallet: CREATOR_WALLET,
      }
    );
  });
});

test("GET /api/admin/characters stays forbidden for non-admin wallets", async () => {
  await withIsolatedBattleHistoryEnv(async ({ adminActionRoute, auth }) => {
    const response = await invokeJsonHandler(adminActionRoute, {
      method: "GET",
      url: "/api/admin/characters",
      headers: createInternalHeaders(auth, "11111111111111111111111111111111"),
    });

    assert.equal(response.statusCode, 403);
    assert.equal(response.body.error, "Forbidden.");
  });
});

// 2026-09-23: the roster payload had grown to 14.9 MB for 3039 pets and the
// admin page stopped loading. 63% of it was generation prompts the panel never
// renders, another 15% power texts, trait variables and generation metadata.
test("the roster list carries what the panel renders and nothing heavy", async () => {
  await withIsolatedBattleHistoryEnv(async ({ adminActionRoute, auth, store }) => {
    const character = {
      ...createCompletedCharacter({ id: "char_admin_slim", name: "Slim Paw", level: 2 }),
      prompts: { image: "x".repeat(3000), text: "y".repeat(500) },
      generation: { model: "gemini-3.1-flash-image", size: "512" },
      variables: { ELEMENT: "Arc static", TOP_ITEM: "Tiny visor" },
    };

    await store.updateWalletProfile(CREATOR_WALLET, async (current) => ({
      ...current,
      characters: [character],
    }));

    const response = await invokeJsonHandler(adminActionRoute, {
      method: "GET",
      url: "/api/admin/characters",
      headers: createInternalHeaders(auth, ADMIN_WALLET),
    });

    assert.equal(response.statusCode, 200);
    const row = response.body.characters[0];

    for (const field of [
      "id",
      "name",
      "displayName",
      "creatureType",
      "rarity",
      "level",
      "attributes",
      "attributePoints",
      "imageUrl",
      "imageProvider",
      "creatorWallet",
    ]) {
      assert.ok(field in row, `the panel renders ${field}, it must stay in the list`);
    }

    for (const field of ["prompts", "powers", "selectedPower", "variables", "generation"]) {
      assert.equal(row[field], undefined, `${field} must not travel with the list`);
    }
  });
});

test("a single character can still be fetched in full, prompts included", async () => {
  await withIsolatedBattleHistoryEnv(async ({ adminActionRoute, auth, store }) => {
    const character = {
      ...createCompletedCharacter({ id: "char_admin_full", name: "Full Paw", level: 3 }),
      prompts: { image: "the prompt we debug with" },
    };

    await store.updateWalletProfile(CREATOR_WALLET, async (current) => ({
      ...current,
      characters: [character],
    }));

    const response = await invokeJsonHandler(adminActionRoute, {
      method: "GET",
      url: "/api/admin/characters?id=char_admin_full",
      headers: createInternalHeaders(auth, ADMIN_WALLET),
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.character.id, "char_admin_full");
    assert.equal(response.body.character.creatorWallet, CREATOR_WALLET);
    assert.deepEqual(response.body.character.prompts, { image: "the prompt we debug with" });

    const missing = await invokeJsonHandler(adminActionRoute, {
      method: "GET",
      url: "/api/admin/characters?id=char_does_not_exist",
      headers: createInternalHeaders(auth, ADMIN_WALLET),
    });
    assert.equal(missing.statusCode, 404);
  });
});
