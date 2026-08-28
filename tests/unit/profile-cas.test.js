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
// the reads is served stale (edge cache) — without CAS the stale-based write
// silently dropped the previous farm-starts.
test("updateWalletProfile CAS survives a stale read: no lost farm-starts", async () => {
  await withFakeBlobEnv(async ({ store, primeStaleReads, counts }) => {
    await store.saveWalletProfile(WALLET, {
      characters: [petRecord("pet_1"), petRecord("pet_2"), petRecord("pet_3"), petRecord("pet_4")],
      currency: { balance: 0, totalEarned: 0 },
    });

    await store.updateWalletProfile(WALLET, startFarmMutator("pet_1"));

    // The next read serves the pre-farm-start version (stale CDN response).
    primeStaleReads(PROFILE_PATH, 1);
    await store.updateWalletProfile(WALLET, startFarmMutator("pet_2"));

    await store.updateWalletProfile(WALLET, startFarmMutator("pet_3"));
    await store.updateWalletProfile(WALLET, startFarmMutator("pet_4"));

    const profile = await store.getWalletProfile(WALLET);
    const farming = profile.characters.filter((record) => record.farmState.active).map((r) => r.id);
    assert.deepEqual(farming.sort(), ["pet_1", "pet_2", "pet_3", "pet_4"]);
    // The stale read must have caused at least one 412→retry put.
    assert.ok(counts.put >= 6, `expected a CAS retry put, saw ${counts.put} puts`);
  });
});

test("updateWalletProfile CAS gives up with an error instead of clobbering", async () => {
  await withFakeBlobEnv(async ({ store, primeStaleReads }) => {
    await store.saveWalletProfile(WALLET, {
      characters: [petRecord("pet_1")],
      currency: { balance: 0, totalEarned: 0 },
    });
    await store.updateWalletProfile(WALLET, startFarmMutator("pet_1"));

    // Storage keeps serving the stale version forever → every CAS attempt
    // conflicts; the write must FAIL loudly, never overwrite blindly.
    primeStaleReads(PROFILE_PATH, 1000);
    await assert.rejects(
      store.updateWalletProfile(WALLET, (profile) => profile),
      /conflict/i
    );

    primeStaleReads(PROFILE_PATH, 0); // stop emulating staleness for the final check
    const profile = await store.getWalletProfile(WALLET);
    // pet_1's farm-start survived untouched.
    assert.equal(profile.characters[0].farmState.active, true);
  });
});
