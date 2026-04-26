const test = require("node:test");
const assert = require("node:assert/strict");

const { withFakeBlobEnv } = require("./helpers/blob-call-counter");

const WALLET_PREFIX = "wallet-profiles";
const SAMPLE_WALLET = "AwtqC9r5Wgvjfhqw5DrtzC5W73QRVF14DZVop8caECi9";
const ENC = encodeURIComponent(SAMPLE_WALLET);

function deterministicPath() {
  return `${WALLET_PREFIX}/${ENC}.json`;
}

function legacyPath(suffix) {
  return `${WALLET_PREFIX}/${ENC}/${suffix}`;
}

async function flushMicrotasks() {
  // Give the fire-and-forget lazy migration write enough turns to settle.
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}

test("getWalletProfile reads a legacy-only wallet via list+get fallback", async () => {
  await withFakeBlobEnv(async ({ store, counts, setEntry, resetCounts }) => {
    setEntry(
      legacyPath("1700000000000-aaa.json"),
      JSON.stringify({ characters: [{ id: "old", name: "Stale", level: 1 }] }),
      { uploadedAt: "2026-04-10T00:00:00.000Z" }
    );
    setEntry(
      legacyPath("1700000001000-bbb.json"),
      JSON.stringify({ characters: [{ id: "fresher", name: "FreshOne", level: 5 }] }),
      { uploadedAt: "2026-04-15T00:00:00.000Z" }
    );

    resetCounts();

    const profile = await store.getWalletProfile(SAMPLE_WALLET);

    assert.equal(profile.characters[0].id, "fresher");
    assert.equal(counts.list, 1, "exactly one list during fallback");
    // Two gets: one missed deterministic + one for the freshest legacy file.
    assert.ok(counts.get >= 2 && counts.get <= 3, `expected 2–3 gets in fallback, got ${counts.get}`);
  });
});

test("legacy fallback triggers a lazy write to the deterministic path", async () => {
  await withFakeBlobEnv(async ({ store, state, setEntry }) => {
    setEntry(
      legacyPath("1700000005000-zzz.json"),
      JSON.stringify({ characters: [{ id: "legacy_only", name: "Legacy", level: 2 }] }),
      { uploadedAt: "2026-04-20T00:00:00.000Z" }
    );

    await store.getWalletProfile(SAMPLE_WALLET);
    await flushMicrotasks();

    assert.ok(state.has(deterministicPath()), "lazy migration must write to deterministic path");
    const stored = JSON.parse(state.get(deterministicPath()).content);
    assert.equal(stored.characters[0].id, "legacy_only");
  });
});

test("after lazy migration the next read uses deterministic path without list", async () => {
  await withFakeBlobEnv(async ({ store, counts, setEntry, resetCounts }) => {
    setEntry(
      legacyPath("1700000010000-mmm.json"),
      JSON.stringify({ characters: [{ id: "legacy", name: "OldOne", level: 3 }] }),
      { uploadedAt: "2026-04-22T00:00:00.000Z" }
    );

    // First read triggers fallback + lazy migration.
    await store.getWalletProfile(SAMPLE_WALLET);
    await flushMicrotasks();

    // Clear the in-process read cache so we actually exercise the storage.
    store.clearWalletProfileCache();
    resetCounts();

    // Second read should hit deterministic file directly.
    const profile = await store.getWalletProfile(SAMPLE_WALLET);

    assert.equal(profile.characters[0].id, "legacy");
    assert.equal(counts.list, 0, "no list on second read");
    assert.equal(counts.get, 1, "exactly one get on second read");
  });
});
