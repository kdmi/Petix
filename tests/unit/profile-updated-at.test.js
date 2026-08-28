const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createCompletedCharacter,
  createInternalHeaders,
  createWallet,
  invokeJsonHandler,
  withIsolatedBattleHistoryEnv,
} = require("./helpers/battle-history-test-utils");

// The client uses profileUpdatedAt as a monotonic snapshot guard: a stale /me
// payload (late poll / cached read) must never override newer local state.
test("profileUpdatedAt: stamped on every write and exposed by /api/character/me", async () => {
  await withIsolatedBattleHistoryEnv(async ({ auth, characterActionRoute, store }) => {
    const wallet = createWallet("9");
    await store.updateWalletProfile(wallet, async (current) => ({
      ...current,
      characters: [createCompletedCharacter({ id: "char_stamp", name: "Stamp" })],
      currency: { balance: 5000, totalEarned: 5000 },
    }));

    const first = await invokeJsonHandler(characterActionRoute, {
      method: "GET",
      url: "/api/character/me",
      headers: createInternalHeaders(auth, wallet),
    });
    assert.equal(first.statusCode, 200);
    assert.ok(first.body.profileUpdatedAt, "stamp missing after first write");

    await new Promise((resolve) => setTimeout(resolve, 5));

    const burn = await invokeJsonHandler(characterActionRoute, {
      method: "POST",
      url: "/api/character/burn",
      headers: createInternalHeaders(auth, wallet),
      body: { petId: "char_stamp" },
    });
    assert.equal(burn.statusCode, 200);

    const second = await invokeJsonHandler(characterActionRoute, {
      method: "GET",
      url: "/api/character/me",
      headers: createInternalHeaders(auth, wallet),
    });
    assert.equal(second.statusCode, 200);
    assert.ok(second.body.profileUpdatedAt, "stamp missing after burn");
    // ISO strings compare lexicographically — the client relies on this.
    assert.ok(
      second.body.profileUpdatedAt > first.body.profileUpdatedAt,
      `stamp did not advance: ${first.body.profileUpdatedAt} → ${second.body.profileUpdatedAt}`
    );
  });
});
