const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const { withFakeBlobEnv } = require("./helpers/blob-call-counter");

// Regression (2026-10-10): the admin flipped "NFT minting" to Paused, the panel
// reloaded a second later and showed On again — the overrides lived in one
// overwritten blob and the reload got the CDN's stale copy. The store now
// keeps an immutable md5 copy of every version and resolves reads through the
// pointer's etag, like wallet profiles and battles.

const STORE_PATH = path.resolve(__dirname, "../../api/_lib/economy-config-store.js");
const CONFIG_PATH = path.resolve(__dirname, "../../api/_lib/economy-config.js");

function loadFresh() {
  delete require.cache[STORE_PATH];
  delete require.cache[CONFIG_PATH];
  const store = require(STORE_PATH);
  const economy = require(CONFIG_PATH);
  return { store, economy };
}

test("a save is read back even while the pointer blob still serves the previous version", async () => {
  await withFakeBlobEnv(async ({ state, primeStaleReads }) => {
    const { store, economy } = loadFresh();
    await economy.setEconomyConfig({ EXPEDITION_NFT_MINT_ENABLED: 1 }, { adminWallet: "0xadmin" });
    await economy.setEconomyConfig({ EXPEDITION_NFT_MINT_ENABLED: 0 }, { adminWallet: "0xadmin" });

    // The CDN keeps answering with the pre-overwrite document for a while.
    primeStaleReads(store.CONFIG_BLOB_PATH, 5);

    const fresh = await economy.getEconomyConfig({ fresh: true });
    assert.equal(fresh.EXPEDITION_NFT_MINT_ENABLED, 0, "admin must see its own save");

    const copies = [...state.keys()].filter((p) => p.startsWith(store.CONFIG_VERSION_PREFIX));
    assert.equal(copies.length, 2, "one immutable copy per version");
    delete require.cache[STORE_PATH];
    delete require.cache[CONFIG_PATH];
  });
});

test("two admins saving at once keep both patches (CAS retry instead of clobber)", async () => {
  await withFakeBlobEnv(async ({ failConditionalPuts }) => {
    const { economy } = loadFresh();
    await economy.setEconomyConfig({ EXPEDITION_COLLECTION_ENERGY: [10, 20, 10, 15, 10, 15, 15, 20, 10, 20] }, { adminWallet: "a" });

    // First conditional put of the next save is rejected as if someone else
    // wrote in between; the store must re-read and retry, not give up.
    failConditionalPuts(1);
    await economy.setEconomyConfig({ EXPEDITION_NFT_MINT_ENABLED: 0 }, { adminWallet: "b" });

    const cfg = await economy.getEconomyConfig({ fresh: true });
    assert.equal(cfg.EXPEDITION_NFT_MINT_ENABLED, 0);
    assert.deepEqual(cfg.EXPEDITION_COLLECTION_ENERGY, [10, 20, 10, 15, 10, 15, 15, 20, 10, 20]);

    const audit = await economy.readAuditEntries();
    assert.equal(audit.length, 2, "both saves are in the audit log");
    delete require.cache[STORE_PATH];
    delete require.cache[CONFIG_PATH];
  });
});

test("a pre-migration document (pointer without a copy) is still readable", async () => {
  await withFakeBlobEnv(async ({ setEntry }) => {
    const { store, economy } = loadFresh();
    setEntry(store.CONFIG_BLOB_PATH, JSON.stringify({ EXPEDITION_NFT_MINT_ENABLED: 1 }), {
      uploadedAt: new Date(Date.now() - 3600000).toISOString(),
    });
    const cfg = await economy.getEconomyConfig({ fresh: true });
    assert.equal(cfg.EXPEDITION_NFT_MINT_ENABLED, 1);
    delete require.cache[STORE_PATH];
    delete require.cache[CONFIG_PATH];
  });
});
