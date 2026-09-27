const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const { withFakeBlobEnv } = require("./helpers/blob-call-counter");

// 2026-09-27: the blob store held 541 GB in 103 377 files. Every mutable
// document keeps an immutable copy of each version it ever had, and nothing
// ever removed them — three days of battles filled half a terabyte, because a
// single fight rewrites the whole 103 MB battles document twice.
//
// The sweep has to be provably conservative: deleting the copy a reader is
// about to resolve breaks that read. These tests pin both halves — what goes,
// and what must never go.

const GC_PATH = path.resolve(__dirname, "../../api/_lib/blob-gc");
const NFT_STORE_PATH = path.resolve(__dirname, "../../api/_lib/nft-store");
const TOKEN_STORE_PATH = path.resolve(__dirname, "../../api/_lib/token-store");

function md5(text) {
  return require("crypto").createHash("md5").update(String(text)).digest("hex");
}

function minutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60000).toISOString();
}

/** Loads the GC inside the fake-blob environment (it pulls in every store). */
function loadBlobGc() {
  for (const modulePath of [GC_PATH, NFT_STORE_PATH, TOKEN_STORE_PATH]) {
    delete require.cache[require.resolve(modulePath)];
  }
  return require(GC_PATH);
}

function versionPrefixOf(state, suffix) {
  for (const pathname of state.keys()) {
    const marker = `-${suffix}-v/`;
    const index = pathname.indexOf(marker);
    if (index !== -1) return pathname.slice(0, index + marker.length);
  }
  return null;
}

function pathsUnder(state, prefix) {
  return [...state.keys()].filter((pathname) => pathname.startsWith(prefix)).sort();
}

async function withGcEnv(overrides, run) {
  const previous = {};
  const applied = { BLOB_GC_TTL_MS: "1800000", ...overrides };
  for (const [key, value] of Object.entries(applied)) {
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

test("old copies go, the current one and anything inside the TTL stay", async () => {
  await withGcEnv({}, async () => {
    await withFakeBlobEnv(async ({ battleStore, state, setEntry }) => {
      await battleStore.saveBattleRecord({ id: "battle_1", status: "ready" });
      const prefix = versionPrefixOf(state, "battles");
      assert.ok(prefix, "a battle write must leave an immutable copy");

      // The copy the pointer resolves to is the newest one; backdate it well
      // past the TTL so the test proves age alone never condemns it.
      const current = pathsUnder(state, prefix)[0];
      setEntry(current, state.get(current).content, { uploadedAt: minutesAgo(180) });

      setEntry(`${prefix}${md5("aaaa")}.json`, "{}", { uploadedAt: minutesAgo(10) });
      setEntry(`${prefix}${md5("bbbb")}.json`, "{}", { uploadedAt: minutesAgo(120) });
      setEntry(`${prefix}${md5("cccc")}.json`, "{}", { uploadedAt: minutesAgo(240) });

      const gc = loadBlobGc();
      const report = await gc.collectBlobGarbage();

      const left = pathsUnder(state, prefix);
      assert.equal(report.deleted, 2, "only the two expired copies");
      assert.ok(left.includes(current), "the copy the pointer resolves to must survive");
      assert.ok(left.includes(`${prefix}${md5("aaaa")}.json`), "a copy inside the TTL must survive");
      assert.ok(!left.includes(`${prefix}${md5("bbbb")}.json`));
      assert.ok(!left.includes(`${prefix}${md5("cccc")}.json`));
    });
  });
});

test("wallet profiles are swept per wallet, so every wallet keeps its own current copy", async () => {
  await withGcEnv({}, async () => {
    await withFakeBlobEnv(async ({ store, state, setEntry }) => {
      const wallets = ["test-wallet-001", "test-wallet-002"];
      for (const wallet of wallets) {
        await store.saveWalletProfile(wallet, { characters: [] });
      }

      const prefix = "wallet-profiles-v/";
      const currents = pathsUnder(state, prefix);
      assert.equal(currents.length, 2, "one copy per wallet so far");

      // Both wallets have been idle for hours, and both have an older copy.
      for (const pathname of currents) {
        setEntry(pathname, state.get(pathname).content, { uploadedAt: minutesAgo(300) });
      }
      for (const wallet of wallets) {
        setEntry(`${prefix}${wallet}/${md5("0000")}.json`, "{}", { uploadedAt: minutesAgo(400) });
      }

      const gc = loadBlobGc();
      const report = await gc.collectBlobGarbage();

      assert.equal(report.deleted, 2, "one stale copy per wallet");
      const left = pathsUnder(state, prefix);
      assert.deepEqual(left, currents, "each wallet keeps exactly its newest copy");
    });
  });
});

test("a newer orphan copy never gets the current one deleted", async () => {
  // A write that dies between the copy and the pointer leaves a copy that is
  // newer than the current one. "Keep the newest" would then delete the copy
  // every reader resolves, so the sweep asks the pointer instead.
  await withGcEnv({}, async () => {
    await withFakeBlobEnv(async ({ battleStore, state, setEntry }) => {
      await battleStore.saveBattleRecord({ id: "battle_orphan", status: "ready" });
      const prefix = versionPrefixOf(state, "battles");
      const current = pathsUnder(state, prefix)[0];

      setEntry(current, state.get(current).content, { uploadedAt: minutesAgo(180) });
      setEntry(`${prefix}${md5("ffff")}.json`, "{}", { uploadedAt: minutesAgo(60) });

      const gc = loadBlobGc();
      const report = await gc.collectBlobGarbage();

      assert.equal(report.deleted, 1);
      assert.deepEqual(pathsUnder(state, prefix), [current], "the orphan goes, the current stays");
    });
  });
});

test("a dry run reports the same work and deletes nothing", async () => {
  await withGcEnv({}, async () => {
    await withFakeBlobEnv(async ({ battleStore, state, setEntry }) => {
      await battleStore.saveBattleRecord({ id: "battle_dry", status: "ready" });
      const prefix = versionPrefixOf(state, "battles");
      setEntry(`${prefix}${md5("dead")}.json`, "{}", { uploadedAt: minutesAgo(600) });

      const gc = loadBlobGc();
      const report = await gc.collectBlobGarbage({ dryRun: true });

      assert.equal(report.dryRun, true);
      assert.equal(report.deleted, 1, "it still reports what it would take");
      assert.ok(
        pathsUnder(state, prefix).includes(`${prefix}${md5("dead")}.json`),
        "a dry run must leave the store untouched"
      );
    });
  });
});

test("the run stops at its delete budget and says it is not finished", async () => {
  await withGcEnv({ BLOB_GC_MAX_DELETES: "2" }, async () => {
    await withFakeBlobEnv(async ({ battleStore, state, setEntry }) => {
      await battleStore.saveBattleRecord({ id: "battle_budget", status: "ready" });
      const prefix = versionPrefixOf(state, "battles");
      for (let index = 0; index < 5; index += 1) {
        setEntry(`${prefix}${md5(`old${index}`)}.json`, "{}", { uploadedAt: minutesAgo(120) });
      }

      const gc = loadBlobGc();
      const report = await gc.collectBlobGarbage();

      assert.equal(report.deleted, 2, "the budget is a hard stop");
      assert.equal(report.truncated, true, "and the next tick has to continue");
      assert.equal(pathsUnder(state, prefix).length, 4, "1 current + 5 old - 2 deleted");
    });
  });
});

test("BLOB_GC_ENABLED=0 turns the sweep off", async () => {
  await withGcEnv({ BLOB_GC_ENABLED: "0" }, async () => {
    await withFakeBlobEnv(async ({ battleStore, state, setEntry }) => {
      await battleStore.saveBattleRecord({ id: "battle_off", status: "ready" });
      const prefix = versionPrefixOf(state, "battles");
      setEntry(`${prefix}${md5("dead")}.json`, "{}", { uploadedAt: minutesAgo(600) });

      const gc = loadBlobGc();
      const report = await gc.collectBlobGarbage();

      assert.equal(report.skipped, "BLOB_GC_DISABLED");
      assert.equal(report.deleted, 0);
      assert.equal(pathsUnder(state, prefix).length, 2);
    });
  });
});
