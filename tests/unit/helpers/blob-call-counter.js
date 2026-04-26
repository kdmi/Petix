const fs = require("fs/promises");
const os = require("os");
const path = require("path");

// Helper: emulate `@vercel/blob` in tests with an in-memory store and a per-call
// counter, then load `api/_lib/store.js` (or other modules that depend on blob)
// in production-like mode (`NODE_ENV=production` + `BLOB_READ_WRITE_TOKEN`) so
// `isBlobDbEnabled()` returns true and blob code paths are exercised.
//
// Usage:
//   const blob = require("./helpers/blob-call-counter");
//   await blob.withFakeBlobEnv(async ({ store, counts, state }) => {
//     await store.saveWalletProfile("w1", { characters: [...] });
//     assert.equal(counts.put, 1);
//   });

const BLOB_MODULE_ID = require.resolve("@vercel/blob");
const STORE_PATH = path.resolve(__dirname, "../../../api/_lib/store.js");
const BATTLE_STORE_PATH = path.resolve(__dirname, "../../../api/_lib/battle-store.js");
const AUTH_PATH = path.resolve(__dirname, "../../../api/_lib/auth.js");
const BATTLE_LIB_PATH = path.resolve(__dirname, "../../../api/_lib/battle.js");
const BATTLE_MATCHMAKING_PATH = path.resolve(__dirname, "../../../api/_lib/battle-matchmaking.js");
const CHARACTER_LIB_PATH = path.resolve(__dirname, "../../../api/_lib/character.js");
const NOTIFICATION_PATH = path.resolve(__dirname, "../../../api/_lib/notification.js");
const BATTLE_NARRATION_PATH = path.resolve(__dirname, "../../../api/_lib/battle-narration.js");
const BATTLES_ROUTE_PATH = path.resolve(__dirname, "../../../api/battles/index.js");
const INTERNAL_SECRET_FOR_TESTS = "petix-blob-counter-internal-secret";

function makeReadableStream(content) {
  const bytes = Buffer.from(String(content || ""), "utf8");
  let consumed = false;
  return {
    getReader() {
      return {
        async read() {
          if (consumed) return { done: true, value: undefined };
          consumed = true;
          return { done: false, value: bytes };
        },
      };
    },
  };
}

function blobNotFound() {
  const err = new Error("Blob not found");
  err.name = "BlobNotFoundError";
  return err;
}

function createFakeBlob({ initialState = {} } = {}) {
  const state = new Map(Object.entries(initialState));
  const counts = { get: 0, put: 0, list: 0, del: 0, head: 0, copy: 0 };

  function setEntry(pathname, content, { uploadedAt } = {}) {
    state.set(pathname, {
      content: String(content),
      uploadedAt: uploadedAt || new Date().toISOString(),
    });
  }

  const fake = {
    async get(pathname) {
      counts.get += 1;
      const entry = state.get(pathname);
      if (!entry) {
        throw blobNotFound();
      }
      return {
        statusCode: 200,
        stream: makeReadableStream(entry.content),
        blob: { etag: entry.uploadedAt },
      };
    },
    async put(pathname, content, opts = {}) {
      counts.put += 1;
      // Tests rely on `addRandomSuffix: false` being respected by callers; if a
      // caller passes `true`, fail loudly so we catch regressions.
      if (opts.addRandomSuffix === true) {
        throw new Error(
          `[fake blob] put() called with addRandomSuffix:true on ${pathname} — expected stable path`
        );
      }
      setEntry(pathname, content, { uploadedAt: new Date().toISOString() });
      return {
        url: `mock://${pathname}`,
        pathname,
        downloadUrl: `mock://${pathname}`,
      };
    },
    async list({ prefix = "", cursor: _cursor, limit: _limit } = {}) {
      counts.list += 1;
      const blobs = [];
      for (const [pathname, entry] of state.entries()) {
        if (!prefix || pathname.startsWith(prefix)) {
          blobs.push({
            pathname,
            uploadedAt: entry.uploadedAt,
            url: `mock://${pathname}`,
            size: entry.content.length,
          });
        }
      }
      return { blobs, hasMore: false, cursor: null };
    },
    async del(pathname) {
      counts.del += 1;
      if (Array.isArray(pathname)) {
        pathname.forEach((p) => state.delete(p));
      } else {
        state.delete(pathname);
      }
    },
    async head(pathname) {
      counts.head += 1;
      const entry = state.get(pathname);
      if (!entry) throw blobNotFound();
      return {
        pathname,
        uploadedAt: entry.uploadedAt,
        size: entry.content.length,
      };
    },
    async copy(from, to) {
      counts.copy += 1;
      const src = state.get(from);
      if (!src) throw blobNotFound();
      setEntry(to, src.content, { uploadedAt: src.uploadedAt });
      return { pathname: to, url: `mock://${to}` };
    },
  };

  return {
    fake,
    counts,
    state,
    setEntry,
    resetCounts() {
      for (const key of Object.keys(counts)) counts[key] = 0;
    },
  };
}

function clearModule(modulePath) {
  delete require.cache[require.resolve(modulePath)];
}

async function withFakeBlobEnv(run, { initialState = {} } = {}) {
  const originalCwd = process.cwd();
  const originalNodeEnv = process.env.NODE_ENV;
  const originalBlobToken = process.env.BLOB_READ_WRITE_TOKEN;
  const originalDisableBattleAi = process.env.DISABLE_BATTLE_AI;
  const originalCachedBlob = require.cache[BLOB_MODULE_ID];
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "petix-blob-counter-"));
  const handle = createFakeBlob({ initialState });

  try {
    process.chdir(tempDir);
    process.env.NODE_ENV = "production";
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test_token";
    process.env.DISABLE_BATTLE_AI = "true";

    require.cache[BLOB_MODULE_ID] = {
      id: BLOB_MODULE_ID,
      filename: BLOB_MODULE_ID,
      loaded: true,
      exports: handle.fake,
      children: [],
      paths: [],
    };

    clearModule(STORE_PATH);
    clearModule(BATTLE_STORE_PATH);

    const store = require(STORE_PATH);
    const battleStore = require(BATTLE_STORE_PATH);

    return await run({
      store,
      battleStore,
      counts: handle.counts,
      state: handle.state,
      setEntry: handle.setEntry,
      resetCounts: handle.resetCounts,
      tempDir,
    });
  } finally {
    clearModule(STORE_PATH);
    clearModule(BATTLE_STORE_PATH);

    if (originalCachedBlob) {
      require.cache[BLOB_MODULE_ID] = originalCachedBlob;
    } else {
      delete require.cache[BLOB_MODULE_ID];
    }

    process.chdir(originalCwd);

    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;

    if (originalBlobToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = originalBlobToken;

    if (originalDisableBattleAi === undefined) delete process.env.DISABLE_BATTLE_AI;
    else process.env.DISABLE_BATTLE_AI = originalDisableBattleAi;
  }
}

async function withFakeBlobIntegrationEnv(run, { initialState = {} } = {}) {
  const originalCwd = process.cwd();
  const originalNodeEnv = process.env.NODE_ENV;
  const originalBlobToken = process.env.BLOB_READ_WRITE_TOKEN;
  const originalInternalSecret = process.env.INTERNAL_API_SECRET;
  const originalDisableBattleAi = process.env.DISABLE_BATTLE_AI;
  const originalCachedBlob = require.cache[BLOB_MODULE_ID];
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "petix-blob-int-"));
  const handle = createFakeBlob({ initialState });

  const modulePaths = [
    STORE_PATH,
    BATTLE_STORE_PATH,
    AUTH_PATH,
    BATTLE_LIB_PATH,
    BATTLE_MATCHMAKING_PATH,
    CHARACTER_LIB_PATH,
    NOTIFICATION_PATH,
    BATTLE_NARRATION_PATH,
    BATTLES_ROUTE_PATH,
  ];

  try {
    process.chdir(tempDir);
    process.env.NODE_ENV = "production";
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test_token";
    process.env.INTERNAL_API_SECRET = INTERNAL_SECRET_FOR_TESTS;
    process.env.DISABLE_BATTLE_AI = "true";

    require.cache[BLOB_MODULE_ID] = {
      id: BLOB_MODULE_ID,
      filename: BLOB_MODULE_ID,
      loaded: true,
      exports: handle.fake,
      children: [],
      paths: [],
    };

    modulePaths.forEach(clearModule);

    const store = require(STORE_PATH);
    const battleStore = require(BATTLE_STORE_PATH);
    const auth = require(AUTH_PATH);
    require(BATTLE_LIB_PATH);
    require(BATTLE_MATCHMAKING_PATH);
    require(CHARACTER_LIB_PATH);
    require(NOTIFICATION_PATH);
    require(BATTLE_NARRATION_PATH);
    const battlesRoute = require(BATTLES_ROUTE_PATH);

    return await run({
      store,
      battleStore,
      auth,
      battlesRoute,
      counts: handle.counts,
      state: handle.state,
      setEntry: handle.setEntry,
      resetCounts: handle.resetCounts,
      tempDir,
      internalSecret: INTERNAL_SECRET_FOR_TESTS,
    });
  } finally {
    modulePaths.forEach(clearModule);

    if (originalCachedBlob) {
      require.cache[BLOB_MODULE_ID] = originalCachedBlob;
    } else {
      delete require.cache[BLOB_MODULE_ID];
    }

    process.chdir(originalCwd);

    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;

    if (originalBlobToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = originalBlobToken;

    if (originalInternalSecret === undefined) delete process.env.INTERNAL_API_SECRET;
    else process.env.INTERNAL_API_SECRET = originalInternalSecret;

    if (originalDisableBattleAi === undefined) delete process.env.DISABLE_BATTLE_AI;
    else process.env.DISABLE_BATTLE_AI = originalDisableBattleAi;
  }
}

module.exports = {
  withFakeBlobEnv,
  withFakeBlobIntegrationEnv,
  createFakeBlob,
};
