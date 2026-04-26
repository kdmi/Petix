const test = require("node:test");
const assert = require("node:assert/strict");

const { withFakeBlobEnv } = require("./helpers/blob-call-counter");

const SAMPLE_WALLET = "AwtqC9r5Wgvjfhqw5DrtzC5W73QRVF14DZVop8caECi9";
const OTHER_WALLET = "AwtqC9r5Wgvjfhqw5DrtzC5W73QRVF14DZVop8caECi8";

test("repeated getWalletProfile calls dedupe via in-memory cache", async () => {
  await withFakeBlobEnv(async ({ store, counts }) => {
    await store.saveWalletProfile(SAMPLE_WALLET, {
      characters: [{ id: "p1", name: "Pet One", level: 4 }],
    });
    store.clearWalletProfileCache();

    counts.get = 0;
    counts.list = 0;

    const a = await store.getWalletProfile(SAMPLE_WALLET);
    const b = await store.getWalletProfile(SAMPLE_WALLET);

    assert.equal(a.characters[0].id, "p1");
    assert.deepEqual(a, b);
    assert.equal(counts.get, 1, `expected 1 get for two reads, got ${counts.get}`);
  });
});

test("parallel getWalletProfile calls dedupe in-flight", async () => {
  await withFakeBlobEnv(async ({ store, counts }) => {
    await store.saveWalletProfile(SAMPLE_WALLET, {
      characters: [{ id: "p_par", name: "Parallel", level: 1 }],
    });
    store.clearWalletProfileCache();

    counts.get = 0;
    counts.list = 0;

    const [a, b, c] = await Promise.all([
      store.getWalletProfile(SAMPLE_WALLET),
      store.getWalletProfile(SAMPLE_WALLET),
      store.getWalletProfile(SAMPLE_WALLET),
    ]);

    assert.equal(a.characters[0].id, "p_par");
    assert.deepEqual(a, b);
    assert.deepEqual(b, c);
    assert.equal(counts.get, 1, `parallel reads must collapse into one get, got ${counts.get}`);
  });
});

test("saveWalletProfile invalidates the cache for that wallet", async () => {
  await withFakeBlobEnv(async ({ store, counts }) => {
    await store.saveWalletProfile(SAMPLE_WALLET, {
      characters: [{ id: "v1", name: "Original", level: 1 }],
    });
    await store.getWalletProfile(SAMPLE_WALLET); // warm cache

    await store.saveWalletProfile(SAMPLE_WALLET, {
      characters: [{ id: "v2", name: "Updated", level: 9 }],
    });

    counts.get = 0;
    const after = await store.getWalletProfile(SAMPLE_WALLET);

    assert.equal(after.characters[0].id, "v2", "cache must reflect post-save state");
    assert.equal(counts.get, 1, `must re-read after invalidation, got ${counts.get}`);
  });
});

test("updateWalletProfile invalidates the cache for that wallet", async () => {
  await withFakeBlobEnv(async ({ store, counts }) => {
    await store.saveWalletProfile(SAMPLE_WALLET, {
      characters: [{ id: "u1", name: "Initial", level: 1 }],
    });
    await store.getWalletProfile(SAMPLE_WALLET); // warm cache

    await store.updateWalletProfile(SAMPLE_WALLET, async (current) => ({
      ...current,
      characters: current.characters.map((c) => ({ ...c, level: 5 })),
    }));

    counts.get = 0;
    const after = await store.getWalletProfile(SAMPLE_WALLET);

    assert.equal(after.characters[0].level, 5);
    assert.equal(counts.get, 1, `must re-read after update, got ${counts.get}`);
  });
});

test("clearWalletProfileCache empties the cache and is wallet-scoped", async () => {
  await withFakeBlobEnv(async ({ store, counts }) => {
    await store.saveWalletProfile(SAMPLE_WALLET, {
      characters: [{ id: "x", name: "X", level: 1 }],
    });
    await store.saveWalletProfile(OTHER_WALLET, {
      characters: [{ id: "y", name: "Y", level: 1 }],
    });

    await store.getWalletProfile(SAMPLE_WALLET);
    await store.getWalletProfile(OTHER_WALLET);

    store.clearWalletProfileCache(SAMPLE_WALLET);
    counts.get = 0;

    await store.getWalletProfile(SAMPLE_WALLET);
    await store.getWalletProfile(OTHER_WALLET);

    assert.equal(counts.get, 1, `only one wallet should miss cache after scoped clear, got ${counts.get}`);
  });
});
