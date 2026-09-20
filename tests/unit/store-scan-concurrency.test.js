const test = require("node:test");
const assert = require("node:assert/strict");

const { withFakeBlobEnv } = require("./helpers/blob-call-counter");

// Production regression: `loadAllBlobWalletProfiles` used to read every wallet
// profile through a single `Promise.all`. Past ~1000 wallets that opened ~1000
// sockets and DNS lookups inside one function instance, which failed with
// `connect EMFILE` / `getaddrinfo EBUSY` — undici reports both as a bare
// `TypeError: fetch failed`, and POST /api/battles handed that string to the
// player instead of a battle.

function walletAt(index) {
  return `0x${String(index).padStart(40, "0")}`;
}

async function seedWallets(store, count) {
  for (let index = 0; index < count; index += 1) {
    await store.saveWalletProfile(walletAt(index), {
      characters: [{ id: `pet_${index}`, name: `Pet ${index}`, level: 1 }],
    });
  }
}

async function withScanEnv(overrides, run) {
  const previous = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("the full-store scan keeps blob reads under the concurrency limit", async () => {
  await withScanEnv({ WALLET_PROFILE_SCAN_CONCURRENCY: "4" }, async () => {
    await withFakeBlobEnv(async ({ store, concurrency, resetCounts }) => {
      const walletCount = 40;
      await seedWallets(store, walletCount);
      store.clearWalletProfileCache();
      resetCounts();

      const characters = await store.listAllCharacters();

      assert.equal(characters.length, walletCount, "every seeded character must be listed");
      // +1: the legacy DB snapshot is read in parallel with the profile scan.
      assert.ok(
        concurrency.peakGet <= 5,
        `scan must stay within the limit, peak was ${concurrency.peakGet}`
      );
      assert.ok(
        concurrency.peakGet > 1,
        "the scan must still read in parallel, not one profile at a time"
      );
    });
  });
});

test("the default concurrency limit is far below the roster size", async () => {
  await withScanEnv({ WALLET_PROFILE_SCAN_CONCURRENCY: undefined }, async () => {
    await withFakeBlobEnv(async ({ store, concurrency, resetCounts }) => {
      await seedWallets(store, 60);
      store.clearWalletProfileCache();
      resetCounts();

      await store.listAllCharacters();

      assert.ok(
        concurrency.peakGet <= 25,
        `default limit must cap the fan-out, peak was ${concurrency.peakGet}`
      );
    });
  });
});

test("a profile write patches the cached snapshot instead of forcing a re-scan", async () => {
  await withScanEnv({ WALLET_PROFILE_SCAN_TTL_MS: "60000" }, async () => {
    await withFakeBlobEnv(async ({ store, counts, resetCounts }) => {
      const walletCount = 20;
      await seedWallets(store, walletCount);
      store.clearWalletProfileCache();

      await store.listAllCharacters(); // warms the snapshot
      resetCounts();

      await store.updateWalletProfile(walletAt(0), (profile) => {
        profile.characters[0].level = 9;
        return profile;
      });

      const characters = await store.listAllCharacters();
      const updated = characters.find((entry) => entry.character.id === "pet_0");

      assert.equal(updated.character.level, 9, "the writer must see its own write");
      assert.equal(characters.length, walletCount, "the rest of the roster must survive the patch");
      assert.ok(
        counts.get < 10,
        `a single write must not re-read all ${walletCount} profiles, got ${counts.get} gets`
      );
    });
  });
});

test("the snapshot TTL is configurable and 0 disables snapshot reuse", async () => {
  await withScanEnv({ WALLET_PROFILE_SCAN_TTL_MS: "0" }, async () => {
    await withFakeBlobEnv(async ({ store, counts, resetCounts }) => {
      await seedWallets(store, 5);
      store.clearWalletProfileCache();
      resetCounts();

      await store.listAllCharacters();
      const firstScanGets = counts.get;
      resetCounts();

      await store.listAllCharacters();

      assert.ok(firstScanGets >= 5, "the first call must read every profile");
      assert.equal(counts.get, firstScanGets, "with TTL 0 every call re-reads the store");
    });
  });
});
