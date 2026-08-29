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

    // Two puts since the content-addressed versions: immutable version blob
    // + deterministic pointer blob. Still no list, still no legacy suffixes.
    assert.equal(counts.put, 2, "version blob + deterministic blob");
    assert.equal(counts.list, 0, "no list during save");

    const stored = [...state.keys()].sort();
    assert.equal(stored.length, 2);
    assert.ok(stored.includes(deterministicPath(SAMPLE_WALLET)));
    const versionPath = stored.find((key) => key.startsWith(`${WALLET_PREFIX}-v/`));
    assert.ok(versionPath, "immutable version blob written under -v prefix");
    assert.match(versionPath, /\/[a-f0-9]{32}\.json$/);
    for (const key of stored) {
      assert.ok(
        !/\d{13,}-[0-9a-f-]{20,}\.json$/.test(key),
        "path must NOT contain timestamp+uuid"
      );
    }
  });
});

test("getWalletProfile reads existing wallet via direct get without list", async () => {
  await withFakeBlobEnv(async ({ store, counts, state, setEntry, resetCounts }) => {
    setEntry(
      deterministicPath(SAMPLE_WALLET),
      JSON.stringify({
        characters: [{ id: "pet_a", name: "Hero", level: 7 }],
        notifications: [],
      }),
      // Old write: pre-migration profile — no version blob and no retry.
      { uploadedAt: "2026-04-01T00:00:00.000Z" }
    );

    resetCounts();

    const profile = await store.getWalletProfile(SAMPLE_WALLET);

    // Pre-migration profile (no version blob): one version-path miss, then
    // the deterministic fallback — and never a list.
    assert.ok(counts.get <= 2, `at most two gets, got ${counts.get}`);
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
    // Consistent read: head resolves the etag, one get fetches the
    // immutable version blob.
    assert.equal(counts.get, 1);
    assert.equal(counts.head, 1);
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
    assert.ok(counts.get <= 2, `at most two gets, got ${counts.get}`);
  });
});
