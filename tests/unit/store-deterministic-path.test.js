const test = require("node:test");
const assert = require("node:assert/strict");

const { withFakeBlobEnv } = require("./helpers/blob-call-counter");

const WALLET_PREFIX = "wallet-profiles";
const SAMPLE_WALLET = "AwtqC9r5Wgvjfhqw5DrtzC5W73QRVF14DZVop8caECi9";

function deterministicPath(wallet) {
  return `${WALLET_PREFIX}/${encodeURIComponent(wallet)}.json`;
}

test("saveWalletProfile writes to a deterministic path without timestamp/uuid suffix", async () => {
  await withFakeBlobEnv(async ({ store, counts, state }) => {
    await store.saveWalletProfile(SAMPLE_WALLET, {
      characters: [{ id: "pet_1", name: "Drago", level: 3 }],
      notifications: [],
      battleState: null,
    });

    assert.equal(counts.put, 1, "exactly one put");
    assert.equal(counts.list, 0, "no list during save");

    const stored = [...state.keys()];
    assert.equal(stored.length, 1);
    assert.equal(stored[0], deterministicPath(SAMPLE_WALLET));
    assert.match(stored[0], /\.json$/);
    assert.ok(
      !/\d{13,}-[0-9a-f-]{20,}\.json$/.test(stored[0]),
      "path must NOT contain timestamp+uuid"
    );
  });
});

test("getWalletProfile reads existing wallet via direct get without list", async () => {
  await withFakeBlobEnv(async ({ store, counts, state, setEntry, resetCounts }) => {
    setEntry(
      deterministicPath(SAMPLE_WALLET),
      JSON.stringify({
        characters: [{ id: "pet_a", name: "Hero", level: 7 }],
        notifications: [],
      })
    );

    resetCounts();

    const profile = await store.getWalletProfile(SAMPLE_WALLET);

    assert.equal(counts.get, 1, "exactly one get");
    assert.equal(counts.list, 0, "no list when deterministic file exists");
    assert.equal(profile.characters.length, 1);
    assert.equal(profile.characters[0].id, "pet_a");
    assert.equal(profile.characters[0].level, 7);
  });
});

test("getWalletProfile returns empty default for a brand-new wallet without leaking list calls", async () => {
  await withFakeBlobEnv(async ({ store, counts }) => {
    const profile = await store.getWalletProfile(SAMPLE_WALLET);

    assert.deepEqual(profile.characters, []);
    assert.deepEqual(profile.notifications, []);
    assert.equal(profile.draft, null);
    // Acceptable budget for a missing wallet: at most two get calls
    // (deterministic miss + legacy DB blob miss) and at most one list
    // (legacy prefix returning empty). Anything higher is a regression.
    assert.ok(
      counts.get <= 2,
      `expected at most 2 get for missing wallet, got ${counts.get}`
    );
    assert.ok(
      counts.list <= 1,
      `expected at most 1 list for missing wallet, got ${counts.list}`
    );
  });
});

test("save→read roundtrip uses deterministic path on both sides", async () => {
  await withFakeBlobEnv(async ({ store, counts, resetCounts }) => {
    await store.saveWalletProfile(SAMPLE_WALLET, {
      characters: [{ id: "pet_x", name: "Phoenix", level: 1 }],
    });
    resetCounts();

    const profile = await store.getWalletProfile(SAMPLE_WALLET);

    assert.equal(profile.characters[0].id, "pet_x");
    assert.equal(counts.list, 0);
    assert.equal(counts.get, 1);
  });
});

test("deterministic file wins over legacy versions in the same prefix (revert safety)", async () => {
  await withFakeBlobEnv(async ({ store, counts, setEntry, resetCounts }) => {
    // Pre-existing legacy versions
    setEntry(
      `${WALLET_PREFIX}/${encodeURIComponent(SAMPLE_WALLET)}/1700000000000-aaa.json`,
      JSON.stringify({ characters: [{ id: "old_1", name: "Stale", level: 1 }] }),
      { uploadedAt: "2026-04-10T00:00:00.000Z" }
    );
    setEntry(
      `${WALLET_PREFIX}/${encodeURIComponent(SAMPLE_WALLET)}/1700000001000-bbb.json`,
      JSON.stringify({ characters: [{ id: "old_2", name: "Older", level: 2 }] }),
      { uploadedAt: "2026-04-15T00:00:00.000Z" }
    );
    // Newer deterministic file
    setEntry(
      deterministicPath(SAMPLE_WALLET),
      JSON.stringify({ characters: [{ id: "new", name: "Fresh", level: 9 }] }),
      { uploadedAt: "2026-04-25T00:00:00.000Z" }
    );

    resetCounts();

    const profile = await store.getWalletProfile(SAMPLE_WALLET);

    assert.equal(profile.characters[0].id, "new");
    assert.equal(counts.list, 0, "deterministic path must short-circuit list");
    assert.equal(counts.get, 1);
  });
});
