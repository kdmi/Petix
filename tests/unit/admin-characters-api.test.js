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
