const { del, head, list } = require("@vercel/blob");

const { isBlobNotFoundError } = require("./blob-read");
const { isBlobDbEnabled } = require("./store");

// Garbage collection for the content-addressed version blobs.
//
// Every mutable JSON document in this project is written twice: an immutable
// copy at `<doc>-v/<md5>.json` and the pointer blob itself. The copy is what
// makes a read consistent — a reader resolves the pointer's etag (= the md5 of
// the current content) to a pathname that is never reused, so it can never be
// served an older version. See the comments in store.js / battle-store.js.
//
// What that scheme forgot: the copies are forever. On 2026-09-27 the store held
// 541 GB in 103 377 blobs — three days of battles, because a single battle
// rewrites the whole 103 MB battles document twice and leaves both copies
// behind. This job takes them back out.
//
// Deleting the wrong copy breaks reads, so the sweep never guesses which one is
// current: it asks the pointer. head() goes to the API, never the CDN, and its
// etag IS the md5 of the current content — which is the name of the copy that
// must stay. Everything else goes, except copies younger than the TTL, which
// covers readers in flight and writers racing with this sweep.

const DELETE_BATCH = 100;
const LIST_PAGE = 1000;

function readIntEnv(name, fallback, minimum) {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, parsed);
}

/** How long a version blob is kept after it stops being the current one. */
function getTtlMs() {
  return readIntEnv("BLOB_GC_TTL_MS", 30 * 60 * 1000, 60 * 1000);
}

/** Per-run budgets: a backlog is drained across several cron ticks. */
function getMaxDeletes() {
  return readIntEnv("BLOB_GC_MAX_DELETES", 4000, 1);
}

function getMaxDurationMs() {
  return readIntEnv("BLOB_GC_MAX_DURATION_MS", 45 * 1000, 1000);
}

/**
 * How many blobs one prefix may hold in memory per run. The listing is ordered
 * by pathname and deleting shrinks its front, so a capped run still walks the
 * whole backlog — it just takes a few more ticks to get there.
 */
function getMaxScan() {
  return readIntEnv("BLOB_GC_MAX_SCAN", 20000, 100);
}

function isEnabled() {
  return String(process.env.BLOB_GC_ENABLED ?? "1").trim() !== "0";
}

const MD5_FILE = /^[a-f0-9]{32}\.json$/;

// Three layouts produce version copies, so a target says how to read a copy's
// pathname rather than the sweep assuming one shape:
//
//   doc      `<versionPrefix><md5>.json`               one document
//   grouped  `<versionPrefix><wallet>/<md5>.json`      one document per wallet
//   family   `<dir><name>-v/<md5>.json`                a directory of documents
//
// `groupOf` returns the document's key, or null when the blob is not a copy at
// all (a family prefix also holds the pointers themselves).
function docTarget(name, versionPrefix, pointerPath) {
  return {
    name,
    prefix: versionPrefix,
    groupOf: (rest) => (MD5_FILE.test(rest) ? "" : null),
    pointerOf: () => pointerPath,
    copyOf: (key, md5) => `${versionPrefix}${md5}.json`,
  };
}

function groupedTarget(name, versionPrefix, pointerPrefix) {
  return {
    name,
    prefix: versionPrefix,
    groupOf: (rest) => {
      const slash = rest.lastIndexOf("/");
      if (slash === -1 || !MD5_FILE.test(rest.slice(slash + 1))) return null;
      return rest.slice(0, slash);
    },
    pointerOf: (key) => `${pointerPrefix}${key}.json`,
    copyOf: (key, md5) => `${versionPrefix}${key}/${md5}.json`,
  };
}

function familyTarget(name, directory) {
  const COPY = /^(.+)-v\/([a-f0-9]{32})\.json$/;
  return {
    name,
    prefix: directory,
    groupOf: (rest) => {
      const match = COPY.exec(rest);
      return match ? match[1] : null;
    },
    pointerOf: (key) => `${directory}${key}.json`,
    copyOf: (key, md5) => `${directory}${key}-v/${md5}.json`,
  };
}

/**
 * The version prefixes, asked of the modules that own them — a store that
 * changes its layout drags this list along instead of silently escaping it.
 */
function getTargets() {
  const { BATTLES_BLOB_PATH, BATTLES_BLOB_VERSION_PREFIX } = require("./battle-store");
  const {
    STATE_BLOB_PATH: NFT_STATE_PATH,
    STATE_BLOB_VERSION_PREFIX: NFT_VERSION_PREFIX,
  } = require("./nft-store");
  const {
    STATE_BLOB_PATH: TOKEN_STATE_PATH,
    STATE_BLOB_VERSION_PREFIX: TOKEN_VERSION_PREFIX,
  } = require("./token-store");
  const { ROSTER_BLOB_PATH, ROSTER_VERSION_PREFIX } = require("./roster");
  const { WALLET_PROFILE_BLOB_PREFIX, WALLET_PROFILE_VERSION_PREFIX } = require("./store");
  const {
    AUDIT_BLOB_PATH: ECONOMY_AUDIT_PATH,
    AUDIT_VERSION_PREFIX: ECONOMY_AUDIT_VERSION_PREFIX,
    CONFIG_BLOB_PATH: ECONOMY_CONFIG_PATH,
    CONFIG_VERSION_PREFIX: ECONOMY_CONFIG_VERSION_PREFIX,
  } = require("./economy-config-store");
  const {
    DAY_INDEX_PREFIX,
    HOUR_INDEX_PREFIX,
    SHARD_PREFIX,
    WALLET_INDEX_PREFIX,
  } = require("./battle-shard-store");

  return [
    docTarget("battles", BATTLES_BLOB_VERSION_PREFIX, BATTLES_BLOB_PATH),
    docTarget("roster", ROSTER_VERSION_PREFIX, ROSTER_BLOB_PATH),
    docTarget("nft", NFT_VERSION_PREFIX, NFT_STATE_PATH),
    docTarget("token", TOKEN_VERSION_PREFIX, TOKEN_STATE_PATH),
    docTarget("economy-config", ECONOMY_CONFIG_VERSION_PREFIX, ECONOMY_CONFIG_PATH),
    docTarget("economy-config-audit", ECONOMY_AUDIT_VERSION_PREFIX, ECONOMY_AUDIT_PATH),
    groupedTarget("wallet-profiles", WALLET_PROFILE_VERSION_PREFIX, `${WALLET_PROFILE_BLOB_PREFIX}/`),
    // Feature 025: one document per battle, plus the per-wallet and per-hour
    // indexes. Each is its own little document with its own copies.
    familyTarget("battle-shards", SHARD_PREFIX),
    familyTarget("battle-index-wallets", WALLET_INDEX_PREFIX),
    familyTarget("battle-index-hours", HOUR_INDEX_PREFIX),
    familyTarget("battle-index-days", DAY_INDEX_PREFIX),
  ];
}

function uploadedAtMs(blob) {
  const parsed = Date.parse(blob?.uploadedAt || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function etagToMd5(etag) {
  const cleaned = String(etag || "")
    .replace(/^W\//i, "")
    .replace(/^"+|"+$/g, "");
  return /^[a-f0-9]{32}$/.test(cleaned) ? cleaned : "";
}

/**
 * Which copy this document's pointer resolves to.
 * - `{ path }`   keep that copy, the rest is garbage
 * - `{ gone: true }` the pointer is gone (a rolled-up hour file, a deleted
 *   battle): every copy of it is garbage
 * - `{ unknown: true }` we could not tell — leave the document alone
 */
async function resolveCurrentVersionPath(target, groupKey) {
  const pointer = target.pointerOf(groupKey);

  let meta = null;
  try {
    meta = await head(pointer);
  } catch (error) {
    if (isBlobNotFoundError(error)) return { gone: true };
    return { unknown: true };
  }

  const md5 = etagToMd5(meta?.etag);
  if (!md5) return { unknown: true };
  return { path: target.copyOf(groupKey, md5) };
}

function createBudget({ maxDeletes, maxDurationMs, startedAt }) {
  return {
    remaining: maxDeletes,
    isExhausted() {
      return this.remaining <= 0 || Date.now() - startedAt >= maxDurationMs;
    },
  };
}

async function pruneTarget(target, { now, ttlMs, budget, dryRun }) {
  const stats = {
    prefix: target.prefix,
    scanned: 0,
    deleted: 0,
    bytesFreed: 0,
    unresolved: 0,
    truncated: false,
  };

  // Group first, decide later: list() order is not part of the contract we
  // want to depend on, and a document's copies must be judged together.
  const groups = new Map();
  const maxScan = getMaxScan();
  let cursor = null;
  do {
    const page = await list({
      prefix: target.prefix,
      limit: LIST_PAGE,
      ...(cursor ? { cursor } : {}),
    });

    for (const blob of page.blobs || []) {
      const key = target.groupOf(blob.pathname.slice(target.prefix.length));
      // Not a version copy (a pointer blob sharing the directory) — the sweep
      // only ever deletes copies.
      if (key === null) continue;

      stats.scanned += 1;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(blob);
    }

    cursor = page.hasMore ? page.cursor : null;
    if (stats.scanned >= maxScan) {
      stats.truncated = true;
      break;
    }
  } while (cursor);

  let pending = [];
  const flushDeletes = async (force) => {
    if (!pending.length) return;
    if (!force && pending.length < DELETE_BATCH) return;

    const batch = pending;
    pending = [];
    if (!dryRun) {
      await del(batch.map((blob) => blob.pathname));
    }
    stats.deleted += batch.length;
    stats.bytesFreed += batch.reduce((total, blob) => total + (Number(blob.size) || 0), 0);
  };

  for (const [key, blobs] of groups) {
    if (budget.isExhausted()) {
      stats.truncated = true;
      break;
    }

    const expired = blobs.filter((blob) => now - uploadedAtMs(blob) > ttlMs);
    if (!expired.length) continue;

    const current = await resolveCurrentVersionPath(target, key);
    if (current.unknown) {
      // An etag we cannot read, or a pointer read that failed for some other
      // reason: leave this document alone rather than risk deleting the copy
      // its readers resolve to.
      stats.unresolved += 1;
      continue;
    }

    // `gone` means the document itself was deleted, so nothing points at any
    // of these copies any more and all of them go.
    const currentPath = current.gone ? null : current.path;

    for (const blob of expired) {
      if (currentPath && blob.pathname === currentPath) continue;
      if (budget.remaining <= 0) {
        stats.truncated = true;
        break;
      }
      pending.push(blob);
      budget.remaining -= 1;
      await flushDeletes(false);
    }
  }

  await flushDeletes(true);
  return stats;
}

/**
 * Sweeps every version prefix once, within the run's budget.
 * @returns {Promise<{skipped?: string, ttlMs: number, deleted: number,
 *   bytesFreed: number, scanned: number, truncated: boolean, targets: object[]}>}
 */
async function collectBlobGarbage({ dryRun = false } = {}) {
  const startedAt = Date.now();
  const idle = {
    ttlMs: 0,
    deleted: 0,
    bytesFreed: 0,
    scanned: 0,
    truncated: false,
    targets: [],
  };

  if (!isBlobDbEnabled()) return { skipped: "BLOB_DISABLED", ...idle };
  if (!isEnabled()) return { skipped: "BLOB_GC_DISABLED", ...idle };

  const ttlMs = getTtlMs();
  const budget = createBudget({
    maxDeletes: getMaxDeletes(),
    maxDurationMs: getMaxDurationMs(),
    startedAt,
  });

  const targets = [];
  for (const target of getTargets()) {
    if (!target.prefix) continue;
    const stats = await pruneTarget(target, { now: startedAt, ttlMs, budget, dryRun });
    targets.push({ name: target.name, ...stats });
    if (budget.isExhausted()) break;
  }

  return {
    dryRun,
    ttlMs,
    deleted: targets.reduce((total, entry) => total + entry.deleted, 0),
    bytesFreed: targets.reduce((total, entry) => total + entry.bytesFreed, 0),
    scanned: targets.reduce((total, entry) => total + entry.scanned, 0),
    // True when the budget ran out before the sweep finished: the next tick
    // picks up where this one stopped.
    truncated: targets.some((entry) => entry.truncated),
    durationMs: Date.now() - startedAt,
    targets,
  };
}

module.exports = {
  collectBlobGarbage,
  getTargets,
};
