const test = require("node:test");
const assert = require("node:assert/strict");

const { withFakeBlobEnv } = require("./helpers/blob-call-counter");

// Regression: the real @vercel/blob error classes leave `error.name` as
// "Error", so matching on `name === "BlobNotFoundError"` let head() 404s for
// brand-new wallets escape as 500s ("Vercel Blob: The requested blob does not
// exist") — first hit was character creation on a fresh wallet.
const NEW_WALLET = "FreshWallet1111111111111111111111111111111";

test("getWalletProfile on a brand-new wallet returns an empty profile, not a 500", async () => {
  await withFakeBlobEnv(async ({ store }) => {
    const profile = await store.getWalletProfile(NEW_WALLET);

    assert.deepEqual(profile.characters, []);
    assert.equal(profile.draft, null);
  });
});

test("updateWalletProfile on a brand-new wallet creates the profile", async () => {
  await withFakeBlobEnv(async ({ store, state }) => {
    const saved = await store.updateWalletProfile(NEW_WALLET, (profile) => {
      profile.draft = { id: "pet_new", status: "draft" };
      return profile;
    });

    assert.equal(saved.draft.id, "pet_new");
    assert.ok(
      state.has(`wallet-profiles/${encodeURIComponent(NEW_WALLET)}.json`),
      "deterministic profile blob written"
    );
  });
});

test("isBlobNotFoundError matches the real SDK error (name stays \"Error\")", () => {
  const { BlobNotFoundError } = require("@vercel/blob");
  const { isBlobNotFoundError } = require("../../api/_lib/blob-read");

  const realError = new BlobNotFoundError();
  assert.equal(realError.name, "Error", "SDK does not set error.name — the premise of the bug");
  assert.equal(isBlobNotFoundError(realError), true);
  assert.equal(isBlobNotFoundError(new Error("something else")), false);
  assert.equal(isBlobNotFoundError(null), false);
});
