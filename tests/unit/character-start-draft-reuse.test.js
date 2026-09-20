const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const path = require("path");

const {
  createInternalHeaders,
  createWallet,
  invokeJsonHandler,
  withIsolatedBattleHistoryEnv,
} = require("./helpers/battle-history-test-utils");

const HOUR_MS = 60 * 60 * 1000;
const REPO_ROOT = path.resolve(__dirname, "../..");

// The start route resolves its data paths when it first loads, and each
// isolated env runs from a temp dir that is deleted afterwards — so the route
// is reloaded per test and re-binds to the env that is actually live.
function forgetStartRoute() {
  delete require.cache[require.resolve("../../server-routes/character/start")];
  delete require.cache[require.resolve("../../api/character/[action].js")];
}

// Generation reads its tables and the placeholder image relative to the cwd,
// and the isolated env runs from a temp dir — copy what a real start needs.
async function seedGenerationAssets(tempDir) {
  await fs.mkdir(path.join(tempDir, "api", "_data"), { recursive: true });
  await fs.mkdir(path.join(tempDir, "assets", "character"), { recursive: true });
  for (const file of ["character-variables.csv", "rarity-chances.csv"]) {
    await fs.copyFile(
      path.join(REPO_ROOT, "api", "_data", file),
      path.join(tempDir, "api", "_data", file)
    );
  }
  await fs.copyFile(
    path.join(REPO_ROOT, "assets", "character", "current-pet.jpg"),
    path.join(tempDir, "assets", "character", "current-pet.jpg")
  );
}

function startRequest(auth, wallet) {
  return {
    method: "POST",
    url: "/api/character/start",
    headers: createInternalHeaders(auth, wallet),
    body: { creatureType: "panda" },
  };
}

function createDraft({ id = "char_draft", ageMs = HOUR_MS, expiresInMs = 23 * HOUR_MS } = {}) {
  const now = Date.now();
  return {
    id,
    status: "draft",
    creatureType: "panda",
    name: "Pending Panda",
    displayName: "Pending Panda",
    rarity: "Common",
    attributePoints: 10,
    powers: [{ id: "power-1", title: "Slam", description: "Slam" }],
    selectedPowerId: "",
    attributes: { stamina: 0, agility: 0, strength: 0, intelligence: 0 },
    image: { provider: "fallback" },
    createdAt: new Date(now - ageMs).toISOString(),
    updatedAt: new Date(now - ageMs).toISOString(),
    draftExpiresAt: new Date(now + expiresInMs).toISOString(),
  };
}

async function seedDraft(store, wallet, draft) {
  await store.updateWalletProfile(wallet, async (current) => ({ ...current, draft }));
}

test("POST /api/character/start resumes a pending draft instead of paying for a new one", async () => {
  forgetStartRoute();
  await withIsolatedBattleHistoryEnv(async ({ auth, characterActionRoute, store, tempDir }) => {
    await seedGenerationAssets(tempDir);
    const wallet = createWallet("7");
    await seedDraft(store, wallet, createDraft());

    const response = await invokeJsonHandler(characterActionRoute, startRequest(auth, wallet));

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.draft.id, "char_draft");
    assert.equal(response.body.draft.name, "Pending Panda");

    const profile = await store.getWalletProfile(wallet);
    assert.equal(profile.draft.id, "char_draft", "the stored draft is left untouched");
  });
});

test("POST /api/character/start generates again once the draft TTL has passed", async () => {
  forgetStartRoute();
  await withIsolatedBattleHistoryEnv(async ({ auth, characterActionRoute, store, tempDir }) => {
    await seedGenerationAssets(tempDir);
    const wallet = createWallet("8");
    await seedDraft(
      store,
      wallet,
      createDraft({ id: "char_stale", ageMs: 25 * HOUR_MS, expiresInMs: -HOUR_MS })
    );

    const response = await invokeJsonHandler(characterActionRoute, startRequest(auth, wallet));

    assert.equal(response.statusCode, 200, JSON.stringify(response.body));
    assert.notEqual(response.body.draft.id, "char_stale", "an expired draft is replaced");

    const profile = await store.getWalletProfile(wallet);
    assert.notEqual(profile.draft.id, "char_stale");
  });
});

test("POST /api/character/start still regenerates for admin wallets", async () => {
  forgetStartRoute();
  await withIsolatedBattleHistoryEnv(async ({ auth, characterActionRoute, store, tempDir }) => {
    await seedGenerationAssets(tempDir);
    const wallet = createWallet("9");
    const savedAdmins = process.env.ADMIN_WALLETS;
    process.env.ADMIN_WALLETS = wallet;

    try {
      await seedDraft(store, wallet, createDraft({ id: "char_admin_draft" }));

      const response = await invokeJsonHandler(characterActionRoute, startRequest(auth, wallet));

      assert.equal(response.statusCode, 200);
      assert.notEqual(response.body.draft.id, "char_admin_draft");
    } finally {
      if (savedAdmins === undefined) delete process.env.ADMIN_WALLETS;
      else process.env.ADMIN_WALLETS = savedAdmins;
    }
  });
});

test("isDraftExpired treats a record without timestamps as expired", () => {
  const { isDraftExpired } = require("../../api/_lib/character");
  const now = Date.now();

  assert.equal(isDraftExpired(null), true);
  assert.equal(isDraftExpired({}), true);
  assert.equal(isDraftExpired({ draftExpiresAt: "nonsense" }), true);
  assert.equal(
    isDraftExpired({ draftExpiresAt: new Date(now + HOUR_MS).toISOString() }, now),
    false
  );
  assert.equal(
    isDraftExpired({ draftExpiresAt: new Date(now - HOUR_MS).toISOString() }, now),
    true
  );
  // Drafts saved before the TTL field existed fall back to their creation time.
  assert.equal(isDraftExpired({ createdAt: new Date(now - HOUR_MS).toISOString() }, now), false);
  assert.equal(
    isDraftExpired({ createdAt: new Date(now - 25 * HOUR_MS).toISOString() }, now),
    true
  );
});
