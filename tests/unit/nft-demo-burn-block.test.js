const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createCompletedCharacter,
  createInternalHeaders,
  createWallet,
  invokeJsonHandler,
  withIsolatedBattleHistoryEnv,
} = require("./helpers/battle-history-test-utils");

function burnRequest(auth, wallet, petId) {
  return {
    method: "POST",
    url: "/api/character/burn",
    headers: createInternalHeaders(auth, wallet),
    body: { petId },
  };
}

test("POST /api/character/burn rejects a character bound to an NFT slot", async () => {
  await withIsolatedBattleHistoryEnv(async ({ auth, characterActionRoute, store }) => {
    const wallet = createWallet("4");
    const bound = createCompletedCharacter({ id: "char_bound", name: "Bound Pet" });
    bound.nftDemo = { tokenId: 7, boundAt: "2026-09-02T12:00:00.000Z" };
    await store.updateWalletProfile(wallet, (current) => ({
      ...current,
      characters: [bound],
      currency: { balance: 5000, totalEarned: 5000 },
    }));

    const response = await invokeJsonHandler(
      characterActionRoute,
      burnRequest(auth, wallet, "char_bound")
    );

    assert.equal(response.statusCode, 409);
    assert.equal(response.body.code, "CHARACTER_BOUND_TO_NFT");

    // Персонаж и баланс не тронуты.
    const profile = await store.getWalletProfile(wallet);
    assert.equal(profile.characters.length, 1);
    assert.equal(profile.currency.balance, 5000);
  });
});

test("POST /api/character/burn still works for an unbound character", async () => {
  await withIsolatedBattleHistoryEnv(async ({ auth, characterActionRoute, store }) => {
    const wallet = createWallet("5");
    const plain = createCompletedCharacter({ id: "char_plain", name: "Plain Pet" });
    await store.updateWalletProfile(wallet, (current) => ({
      ...current,
      characters: [plain],
      currency: { balance: 5000, totalEarned: 5000 },
    }));

    const response = await invokeJsonHandler(
      characterActionRoute,
      burnRequest(auth, wallet, "char_plain")
    );

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.burned, true);
  });
});
