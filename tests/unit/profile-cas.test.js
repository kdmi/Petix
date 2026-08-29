const test = require("node:test");
const assert = require("node:assert/strict");

const { withFakeBlobEnv } = require("./helpers/blob-call-counter");

const WALLET = "CasWallet111111111111111111111111111111111";
const PROFILE_PATH = `wallet-profiles/${WALLET}.json`;

function petRecord(id) {
  return {
    id,
    status: "completed",
    name: id,
    level: 1,
    farmState: { active: false, startedAt: null, lastClaimedAt: null },
  };
}

function startFarmMutator(petId) {
  return (profile) => {
    const pet = profile.characters.find((record) => record.id === petId);
    pet.farmState = { active: true, startedAt: new Date().toISOString(), lastClaimedAt: null };
    return profile;
  };
}

// Reproduces the prod report: rapid farm-starts on several pets where one of
// the reads is served stale (edge cache) — without version control the
// stale-based write silently dropped the previous farm-starts.
test("stale CDN read cannot drop earlier writes: all farm-starts survive", async () => {
  await withFakeBlobEnv(async ({ store, primeStaleReads }) => {
    await store.saveWalletProfile(WALLET, {
      characters: [petRecord("pet_1"), petRecord("pet_2"), petRecord("pet_3"), petRecord("pet_4")],
      currency: { balance: 0, totalEarned: 0 },
    });

    await store.updateWalletProfile(WALLET, startFarmMutator("pet_1"));

    // The next read serves the pre-farm-start version (stale CDN response);
    // head() still sees the latest etag, so the store re-reads until the
    // content matches the canonical version.
    primeStaleReads(PROFILE_PATH, 1);
    await store.updateWalletProfile(WALLET, startFarmMutator("pet_2"));

    await store.updateWalletProfile(WALLET, startFarmMutator("pet_3"));
    await store.updateWalletProfile(WALLET, startFarmMutator("pet_4"));

    const profile = await store.getWalletProfile(WALLET);
    const farming = profile.characters.filter((record) => record.farmState.active).map((r) => r.id);
    assert.deepEqual(farming.sort(), ["pet_1", "pet_2", "pet_3", "pet_4"]);
  });
});

test("a concurrent writer's 412 triggers re-read + retry, both mutations land", async () => {
  await withFakeBlobEnv(async ({ store, failConditionalPuts }) => {
    await store.saveWalletProfile(WALLET, {
      characters: [petRecord("pet_1")],
      currency: { balance: 0, totalEarned: 0 },
    });

    failConditionalPuts(1); // first conditional put loses the race
    await store.updateWalletProfile(WALLET, startFarmMutator("pet_1"));

    const profile = await store.getWalletProfile(WALLET);
    assert.equal(profile.characters[0].farmState.active, true);
  });
});

test("persistent conflicts fail open (unconditional write) instead of erroring", async () => {
  await withFakeBlobEnv(async ({ store, failConditionalPuts }) => {
    await store.saveWalletProfile(WALLET, {
      characters: [petRecord("pet_1")],
      currency: { balance: 0, totalEarned: 0 },
    });

    // Every conditional put conflicts — availability must win: the final
    // attempt writes unconditionally rather than surfacing an error.
    failConditionalPuts(1000);
    const result = await store.updateWalletProfile(WALLET, startFarmMutator("pet_1"));
    assert.equal(result.characters[0].farmState.active, true);

    const profile = await store.getWalletProfile(WALLET);
    assert.equal(profile.characters[0].farmState.active, true);
  });
});
