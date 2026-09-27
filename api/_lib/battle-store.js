const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { get, head, put } = require("@vercel/blob");
const { getFreshBlob, isBlobNotFoundError } = require("./blob-read");

const DATA_DIR =
  process.env.NODE_ENV === "production"
    ? path.join(process.cwd(), ".data")
    : path.join(process.cwd(), ".data", "local-dev");
const BATTLES_PATH = path.join(DATA_DIR, "battles.json");
const BATTLES_BLOB_PATH =
  process.env.BATTLES_DB_BLOB_PATH ||
  `system/${crypto
    .createHash("sha256")
    .update(
      String(process.env.INTERNAL_API_SECRET || process.env.SOLANA_AUTH_SECRET || "petix-battles")
    )
    .digest("hex")
    .slice(0, 32)}-battles.json`;

// Content-addressed immutable copy of every battles-db version — the same
// stale-overwrite protection store.js uses for wallet profiles (specs
// 021–023). The mutable pointer blob is served stale by the CDN/origin in
// the functions region for a while after an overwrite (query-busting does
// NOT reliably help), which both hid fresh battles from history AND let a
// read-modify-write clobber a just-saved battle record.
const BATTLES_BLOB_VERSION_PREFIX = `${BATTLES_BLOB_PATH.replace(/\.json$/, "")}-v/`;
const BATTLES_CAS_ATTEMPTS = 4;

function md5Hex(text) {
  return crypto.createHash("md5").update(text).digest("hex");
}

function buildBattlesVersionPath(contentMd5) {
  return `${BATTLES_BLOB_VERSION_PREFIX}${contentMd5}.json`;
}

// HTTP-header etags (from the CDN GET) may be weak (`W/"..."`) or quoted,
// while the put API compares against the canonical etag from head()/put().
// Normalize only for COMPARISON — never pass a normalized value to ifMatch.
function normalizeEtag(value) {
  return String(value || "")
    .replace(/^W\//i, "")
    .replace(/^"+|"+$/g, "");
}

function isEtagConflictError(error) {
  return (
    error?.constructor?.name === "BlobPreconditionFailedError" ||
    /precondition failed/i.test(String(error?.message || ""))
  );
}

const EMPTY_BATTLES_DB = {
  version: 1,
  records: {},
};

let writeQueue = Promise.resolve();

const {
  buildAdminBattleSummary,
  buildAdminCompletedBattleEntry,
  buildBattleHistoryEntry,
  cloneValue,
  compareBattleRecordsNewestFirst,
  decodeBattleHistoryCursor,
  encodeBattleHistoryCursor,
  isBattleHistoryEntryOlderThanCursor,
  normalizeBattleRecord,
  resolveBattleHistoryPageSize,
} = require("./battle-record");


function isBlobDbEnabled() {
  return process.env.NODE_ENV === "production" && Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function ensureStorage() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function normalizeDbShape(parsed) {
  if (!parsed || typeof parsed !== "object" || typeof parsed.records !== "object") {
    return { ...EMPTY_BATTLES_DB };
  }

  return {
    version: EMPTY_BATTLES_DB.version,
    records: Object.fromEntries(
      Object.entries(parsed.records)
        .map(([battleId, record]) => [battleId, normalizeBattleRecord(record)])
        .filter(([, record]) => record)
    ),
  };
}

async function readBlobText(stream) {
  if (!stream) return "";

  const reader = stream.getReader();
  const chunks = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function loadLocalDbSnapshot() {
  await ensureStorage();

  try {
    const raw = await fs.readFile(BATTLES_PATH, "utf8");
    return normalizeDbShape(raw ? JSON.parse(raw) : EMPTY_BATTLES_DB);
  } catch (error) {
    if (error.code === "ENOENT") {
      return { ...EMPTY_BATTLES_DB };
    }
    throw error;
  }
}

async function loadBlobDbFromPath(pathname, { fresh = true } = {}) {
  const read = fresh
    ? getFreshBlob(pathname, { access: "public" })
    : get(pathname, { access: "public" });
  const blobResult = await read.catch((error) => {
    if (isBlobNotFoundError(error)) {
      return null;
    }
    throw error;
  });

  if (!blobResult || blobResult.statusCode !== 200) {
    return null;
  }

  const raw = await readBlobText(blobResult.stream);
  return normalizeDbShape(raw ? JSON.parse(raw) : EMPTY_BATTLES_DB);
}

// Consistent battles-db read: head() on the pointer blob (API — always
// current) gives the canonical etag = md5 of the current content, which
// addresses the immutable version blob. No overwrite-staleness can leak in.
// Returns { db, etag } — etag is null when the pointer blob is absent.
async function loadBlobDbSnapshotConsistent() {
  const meta = await head(BATTLES_BLOB_PATH).catch((error) => {
    if (isBlobNotFoundError(error)) return null;
    throw error;
  });

  if (!meta) {
    return { db: { ...EMPTY_BATTLES_DB }, etag: null };
  }

  const canonicalEtag = meta.etag || null;
  const contentMd5 = normalizeEtag(canonicalEtag);

  if (/^[a-f0-9]{32}$/.test(contentMd5)) {
    const versionPath = buildBattlesVersionPath(contentMd5);
    // Immutable pathname → plain (cacheable) read is safe. Retry only for a
    // recent write (its version blob may not have replicated yet); a missing
    // version blob on an old write is a pre-migration db — don't stall.
    const uploadedMs = new Date(meta.uploadedAt).getTime();
    const isRecentWrite = Number.isFinite(uploadedMs) && Date.now() - uploadedMs < 60000;
    const attempts = isRecentWrite ? 3 : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const db = await loadBlobDbFromPath(versionPath, { fresh: false });
      if (db) {
        return { db, etag: canonicalEtag };
      }
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
      }
    }
  }

  // Pre-migration db (no version blob) or replication lag exhausted the
  // retries: best-effort cache-busted read of the pointer blob.
  const fallback = await loadBlobDbFromPath(BATTLES_BLOB_PATH);
  return { db: fallback || { ...EMPTY_BATTLES_DB }, etag: canonicalEtag };
}

async function loadBlobDbSnapshot() {
  const { db } = await loadBlobDbSnapshotConsistent();
  return db;
}

async function readDb() {
  if (isBlobDbEnabled()) {
    return loadBlobDbSnapshot();
  }

  return loadLocalDbSnapshot();
}

async function writeLocalDb(db) {
  await ensureStorage();
  await fs.writeFile(BATTLES_PATH, JSON.stringify(db, null, 2));
}

async function writeBlobDb(db, { ifMatch = null } = {}) {
  // Compact: nobody reads this by eye, and the indentation was a quarter of
  // every copy — of a document that is rewritten twice per battle.
  const json = JSON.stringify(db);

  // 1. Immutable content-addressed version FIRST — readers resolve the
  //    pointer blob's etag (= md5 of this json) to this pathname, so it must
  //    exist before the pointer flips. Long cache age is safe: the content
  //    at this pathname never changes.
  await put(buildBattlesVersionPath(md5Hex(json)), json, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true, // idempotent: same md5 ⇒ same content
    contentType: "application/json; charset=utf-8",
    cacheControlMaxAge: 31536000,
  });

  // 2. Pointer blob (also the legacy read path).
  await put(BATTLES_BLOB_PATH, json, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json; charset=utf-8",
    cacheControlMaxAge: 0,
    ...(ifMatch ? { ifMatch } : {}),
  });
}

async function withDbMutation(mutate) {
  const pending = writeQueue.catch(() => null).then(async () => {
    if (!isBlobDbEnabled()) {
      const current = await readDb();
      const next = (await mutate(current)) || current;
      await writeLocalDb(next);
      return normalizeDbShape(next);
    }

    // Compare-and-swap: the in-memory queue only serializes writes within
    // THIS lambda instance. Concurrent invocations would clobber each
    // other's battle records (observed in production: a finalize write based
    // on a stale read erased the previous battle), so every write carries
    // the etag of the db version it was computed from; on a conflict we
    // re-read and re-run the mutator.
    let next = null;
    for (let attempt = 0; attempt < BATTLES_CAS_ATTEMPTS; attempt += 1) {
      const { db: current, etag } = await loadBlobDbSnapshotConsistent();
      next = (await mutate(current)) || current;

      try {
        await writeBlobDb(next, { ifMatch: etag });
        return normalizeDbShape(next);
      } catch (error) {
        if (!isEtagConflictError(error)) {
          throw error;
        }
      }
    }

    // Fail open: availability beats strict CAS (mirrors the profile store).
    // After several re-read+retry rounds the base is at most ~a second old.
    console.warn(
      "[battle-store] battles db CAS kept conflicting — falling back to unconditional write"
    );
    await writeBlobDb(next);
    return normalizeDbShape(next);
  });

  writeQueue = pending;
  return pending;
}

async function legacySaveBattleRecord(record) {
  if (!record?.id) {
    throw new Error("Battle id is required.");
  }

  const snapshot = normalizeBattleRecord(record);
  await withDbMutation(async (db) => {
    db.records[snapshot.id] = snapshot;
    return db;
  });

  return snapshot;
}

async function legacyUpdateBattleRecord(battleId, updater) {
  if (!battleId) return null;

  const db = await withDbMutation(async (current) => {
    const existing = normalizeBattleRecord(current.records[battleId] || null);
    const next = await updater(existing);

    if (!next) {
      delete current.records[battleId];
      return current;
    }

    current.records[battleId] = normalizeBattleRecord(next);
    return current;
  });

  return normalizeBattleRecord(db.records[battleId] || null);
}

async function legacyGetBattleRecord(battleId) {
  if (!battleId) return null;

  const db = await readDb();
  return normalizeBattleRecord(db.records[battleId] || null);
}

async function legacyListBattleRecords() {
  const db = await readDb();
  return Object.values(db.records)
    .map((record) => normalizeBattleRecord(record))
    .filter(Boolean)
    .sort(compareBattleRecordsNewestFirst);
}

async function legacyListBattleHistoryForWallet(wallet, { limit, cursor } = {}) {
  const normalizedWallet = String(wallet || "").trim();
  if (!normalizedWallet) {
    return {
      history: [],
      page: {
        nextCursor: null,
        hasMore: false,
      },
    };
  }

  const pageSize = resolveBattleHistoryPageSize(limit);
  const cursorState = decodeBattleHistoryCursor(cursor);
  const historyEntries = (await legacyListBattleRecords())
    .map((record) => buildBattleHistoryEntry(record, normalizedWallet))
    .filter(Boolean);

  let visibleEntries = historyEntries;
  if (cursorState) {
    const cursorIndex = historyEntries.findIndex((entry) => entry.battleId === cursorState.battleId);
    visibleEntries =
      cursorIndex >= 0
        ? historyEntries.slice(cursorIndex + 1)
        : historyEntries.filter((entry) => isBattleHistoryEntryOlderThanCursor(entry, cursorState));
  }

  const slice = visibleEntries.slice(0, pageSize);
  const hasMore = visibleEntries.length > slice.length;
  const nextCursor = hasMore ? encodeBattleHistoryCursor(slice[slice.length - 1]) : null;

  return {
    history: slice.map((entry) => cloneValue(entry)),
    page: {
      nextCursor,
      hasMore,
    },
  };
}

async function legacyListAdminCompletedBattles() {
  const battles = (await legacyListBattleRecords())
    .map((record) => buildAdminCompletedBattleEntry(record))
    .filter(Boolean);

  return {
    summary: buildAdminBattleSummary(battles),
    battles: battles.map((entry) => cloneValue(entry)),
  };
}

// ---------------------------------------------------------------------------
// Feature 025: the same API, served either by the single legacy document above
// or by one blob per battle (battle-shard-store.js).
//
// `BATTLE_SHARDS_ENABLED=1` makes the shards authoritative. The legacy
// document stays readable behind it until the migration has moved everything:
// a record that is missing from the shards is served from the document and
// imported on the spot, so a straggler created just before the switch cannot
// disappear from a player's history.
// ---------------------------------------------------------------------------

function areBattleShardsEnabled() {
  return String(process.env.BATTLE_SHARDS_ENABLED ?? "0").trim() === "1";
}

function shardStore() {
  // Required lazily: the shard store reads env at load time, and tests flip
  // these flags between cases.
  return require("./battle-shard-store");
}

/** Pulls one record out of the legacy document into the shards, once. */
async function adoptLegacyRecord(battleId) {
  const legacy = await legacyGetBattleRecord(battleId);
  if (!legacy) return null;

  await shardStore().importBattleRecords([legacy]);
  return legacy;
}

async function getBattleRecord(battleId) {
  if (!areBattleShardsEnabled()) return legacyGetBattleRecord(battleId);

  const record = await shardStore().getBattleRecord(battleId);
  return record || adoptLegacyRecord(battleId);
}

async function saveBattleRecord(record) {
  if (!areBattleShardsEnabled()) return legacySaveBattleRecord(record);
  return shardStore().saveBattleRecord(record);
}

async function updateBattleRecord(battleId, updater) {
  if (!areBattleShardsEnabled()) return legacyUpdateBattleRecord(battleId, updater);

  // Seed the shard from the legacy document first, or the updater would be
  // handed `null` and would overwrite a battle that still exists.
  const existing = await shardStore().getBattleRecord(battleId);
  if (!existing) await adoptLegacyRecord(battleId);

  return shardStore().updateBattleRecord(battleId, updater);
}

async function listBattleRecords() {
  if (!areBattleShardsEnabled()) return legacyListBattleRecords();
  return shardStore().listAllBattleRecords();
}

async function listBattleHistoryForWallet(wallet, options) {
  if (!areBattleShardsEnabled()) return legacyListBattleHistoryForWallet(wallet, options);
  return shardStore().listBattleHistoryForWallet(wallet, options);
}

async function listAdminCompletedBattles(options) {
  if (!areBattleShardsEnabled()) return legacyListAdminCompletedBattles();
  return shardStore().listAdminCompletedBattles(options);
}

module.exports = {
  // Exported for the version-blob GC (api/_lib/blob-gc.js): the pointer says
  // which copy is current, the prefix says where the copies live.
  BATTLES_BLOB_PATH,
  BATTLES_BLOB_VERSION_PREFIX,
  areBattleShardsEnabled,
  buildAdminBattleSummary,
  buildAdminCompletedBattleEntry,
  buildBattleHistoryEntry,
  getBattleRecord,
  legacyListBattleRecords,
  listAdminCompletedBattles,
  listBattleHistoryForWallet,
  listBattleRecords,
  saveBattleRecord,
  updateBattleRecord,
};
