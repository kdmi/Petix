const { del, head, list } = require("@vercel/blob");

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

/**
 * The version prefixes, asked of the modules that own them — a store that
 * changes its layout drags this list along instead of silently escaping it.
 * `pointerOf(group)` names the mutable blob whose etag says which copy is
 * current; `grouped` marks a prefix that holds one folder per document.
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

  return [
    {
      name: "battles",
      prefix: BATTLES_BLOB_VERSION_PREFIX,
      grouped: false,
      pointerOf: () => BATTLES_BLOB_PATH,
    },
    {
      name: "roster",
      prefix: ROSTER_VERSION_PREFIX,
      grouped: false,
      pointerOf: () => ROSTER_BLOB_PATH,
    },
    {
      name: "nft",
      prefix: NFT_VERSION_PREFIX,
      grouped: false,
      pointerOf: () => NFT_STATE_PATH,
    },
    {
      name: "token",
      prefix: TOKEN_VERSION_PREFIX,
      grouped: false,
      pointerOf: () => TOKEN_STATE_PATH,
    },
    {
      name: "wallet-profiles",
      prefix: WALLET_PROFILE_VERSION_PREFIX,
      grouped: true,
      // The group key is the wallet exactly as the version path spells it.
      pointerOf: (wallet) => `${WALLET_PROFILE_BLOB_PREFIX}/${wallet}.json`,
    },
  ];
}

/** `<prefix><wallet>/<md5>.json` → `<wallet>`; one group per document. */
function groupKeyOf(pathname, prefix) {
  const rest = String(pathname || "").slice(prefix.length);
  const slash = rest.lastIndexOf("/");
  return slash === -1 ? "" : rest.slice(0, slash);
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

/** The copy the pointer currently resolves to, or "" when we cannot tell. */
async function resolveCurrentVersionPath(target, groupKey) {
  const pointer = target.pointerOf(groupKey);
  const meta = await head(pointer).catch(() => null);
  const md5 = etagToMd5(meta?.etag);
  if (!md5) return "";
  return target.grouped ? `${target.prefix}${groupKey}/${md5}.json` : `${target.prefix}${md5}.json`;
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
      stats.scanned += 1;
      const key = target.grouped ? groupKeyOf(blob.pathname, target.prefix) : "";
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

    // A single copy is by definition the current one — no pointer read needed.
    const expired = blobs.filter((blob) => now - uploadedAtMs(blob) > ttlMs);
    if (blobs.length <= 1 || !expired.length) continue;

    const currentPath = await resolveCurrentVersionPath(target, key);
    if (!currentPath) {
      // No pointer, or an etag we cannot read: leave this document alone
      // rather than risk deleting the copy its readers resolve to.
      stats.unresolved += 1;
      continue;
    }

    for (const blob of expired) {
      if (blob.pathname === currentPath) continue;
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
  groupKeyOf,
};
