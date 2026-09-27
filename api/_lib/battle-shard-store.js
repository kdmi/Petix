const crypto = require("crypto");
const { del, list } = require("@vercel/blob");

const { createBlobDocument, isBlobEnabled } = require("./blob-doc");
const { mapWithConcurrency } = require("./store");
const {
  buildAdminBattleSummary,
  buildAdminCompletedBattleEntry,
  buildBattleHistoryEntry,
  cloneValue,
  compareBattleRecordsNewestFirst,
  decodeBattleHistoryCursor,
  encodeBattleHistoryCursor,
  getBattleSortTimestamp,
  isBattleHistoryEntryOlderThanCursor,
  isReplayableBattleRecord,
  normalizeBattleRecord,
  resolveBattleHistoryPageSize,
} = require("./battle-record");

// Feature 025 — battles, one blob per battle.
//
// Until now every battle rewrote a single document that had grown to 103 MB,
// twice per mutation, twice per battle: ~400 MB of writes per fight, billed as
// storage AND as Fast Origin Transfer ("usage is incurred on both the input
// and output data transfer when using compute or blob"). The cost grew with
// the square of the number of battles played.
//
// The layout that replaces it:
//
//   <base>-b/<battleId>.json               the record itself, ~12 KB
//   <base>-bi-w/<wallet>/<YYYY-MM>.json    that wallet's history for a month
//   <base>-bi-w/<wallet>/months.json       which months that wallet has
//   <base>-bi-h/<YYYY-MM-DDTHH>.json       admin list, the hour being played
//   <base>-bi-d/<YYYY-MM-DD>.json          admin list, hours already rolled up
//
// Nothing a battle writes grows without bound: the month file is capped by the
// energy limit (~90 fights), the hour file by how many battles fit in an hour.
// The day rollup is written by a cron, never by a battle — a day file would
// otherwise reach ~450 KB and be rewritten by every fight in that day.

const BASE_PREFIX =
  process.env.BATTLE_SHARD_BLOB_PREFIX ||
  `system/${crypto
    .createHash("sha256")
    .update(
      String(process.env.INTERNAL_API_SECRET || process.env.SOLANA_AUTH_SECRET || "petix-battles")
    )
    .digest("hex")
    .slice(0, 32)}`;

const SHARD_PREFIX = `${BASE_PREFIX}-b/`;
const WALLET_INDEX_PREFIX = `${BASE_PREFIX}-bi-w/`;
const HOUR_INDEX_PREFIX = `${BASE_PREFIX}-bi-h/`;
const DAY_INDEX_PREFIX = `${BASE_PREFIX}-bi-d/`;
const MIGRATION_PATH = `${BASE_PREFIX}-bi-migration.json`;

const SHARD_READ_CONCURRENCY = 24;
const DEFAULT_ADMIN_DAYS = 7;
const MAX_ADMIN_DAYS = 90;

function walletKey(wallet) {
  return encodeURIComponent(String(wallet || "").trim());
}

function shardPath(battleId) {
  return `${SHARD_PREFIX}${encodeURIComponent(String(battleId))}.json`;
}

function battleIdFromShardPath(pathname) {
  const rest = String(pathname || "").slice(SHARD_PREFIX.length);
  return decodeURIComponent(rest.replace(/\.json$/, ""));
}

/** UTC keys: the admin list is an operator tool, not a player-facing clock. */
function monthKeyOf(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 7);
}

function dayKeyOf(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function hourKeyOf(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 13);
}

function recordTimestamp(record) {
  const parsed = getBattleSortTimestamp(record);
  return parsed || Date.now();
}

function shardDocument(battleId) {
  return createBlobDocument({
    path: shardPath(battleId),
    empty: () => null,
    normalize: (raw) => normalizeBattleRecord(raw),
  });
}

function entriesDocument(pathname) {
  return createBlobDocument({
    path: pathname,
    empty: () => ({ version: 1, entries: [] }),
    normalize: (raw) => ({
      version: 1,
      entries: Array.isArray(raw?.entries) ? raw.entries.filter((entry) => entry?.battleId) : [],
    }),
  });
}

function walletMonthsDocument(wallet) {
  return createBlobDocument({
    path: `${WALLET_INDEX_PREFIX}${walletKey(wallet)}/months.json`,
    empty: () => ({ version: 1, months: [] }),
    normalize: (raw) => ({
      version: 1,
      months: Array.isArray(raw?.months)
        ? [...new Set(raw.months.filter((month) => /^\d{4}-\d{2}$/.test(String(month))))].sort().reverse()
        : [],
    }),
  });
}

function walletMonthDocument(wallet, month) {
  return entriesDocument(`${WALLET_INDEX_PREFIX}${walletKey(wallet)}/${month}.json`);
}

function hourDocument(hourKey) {
  return entriesDocument(`${HOUR_INDEX_PREFIX}${hourKey}.json`);
}

function dayDocument(dayKey) {
  return entriesDocument(`${DAY_INDEX_PREFIX}${dayKey}.json`);
}

/** Replace-or-insert by battleId, newest first — an index write is idempotent. */
function mergeEntries(existing, incoming) {
  const byId = new Map();
  for (const entry of existing) byId.set(entry.battleId, entry);
  for (const entry of incoming) byId.set(entry.battleId, entry);

  return [...byId.values()].sort((left, right) =>
    compareBattleRecordsNewestFirst(
      { id: left.battleId, completedAt: left.completedAt, createdAt: left.createdAt },
      { id: right.battleId, completedAt: right.completedAt, createdAt: right.createdAt }
    )
  );
}

function buildAdminIndexEntry(record) {
  const entry = buildAdminCompletedBattleEntry(record);
  if (!entry) return null;
  // coinReward rides along so farm-stats can price the last 24 hours from the
  // index instead of reading every battle.
  return { ...entry, coinReward: Math.max(0, Math.floor(Number(record.coinReward) || 0)) };
}

async function upsertWalletMonth(wallet, month, entries) {
  await walletMonthDocument(wallet, month).mutate((current) => ({
    version: 1,
    entries: mergeEntries(current.entries, entries),
  }));

  const months = walletMonthsDocument(wallet);
  const known = await months.read();
  if (known.data.months.includes(month)) return;

  await months.mutate((current) => ({
    version: 1,
    months: [...new Set([...current.months, month])].sort().reverse(),
  }));
}

async function upsertHour(hourKey, entries) {
  await hourDocument(hourKey).mutate((current) => ({
    version: 1,
    entries: mergeEntries(current.entries, entries),
  }));
}

/**
 * Puts one finished battle into every index that has to list it. A battle that
 * is still generating (or failed) has its record stored but is listed nowhere,
 * exactly as before.
 */
async function indexBattleRecord(record) {
  if (!isReplayableBattleRecord(record)) return;

  const timestamp = recordTimestamp(record);
  const wallets = [...new Set([record.attackerOwnerWallet, record.defenderOwnerWallet].filter(Boolean))];

  for (const wallet of wallets) {
    const entry = buildBattleHistoryEntry(record, wallet);
    if (entry) await upsertWalletMonth(wallet, monthKeyOf(timestamp), [entry]);
  }

  const adminEntry = buildAdminIndexEntry(record);
  if (adminEntry) await upsertHour(hourKeyOf(timestamp), [adminEntry]);
}

async function getBattleRecord(battleId) {
  if (!battleId) return null;
  const { data } = await shardDocument(battleId).readConsistent();
  return data || null;
}

async function saveBattleRecord(record) {
  if (!record?.id) {
    throw new Error("Battle id is required.");
  }

  const snapshot = normalizeBattleRecord(record);
  await shardDocument(snapshot.id).write(snapshot);
  await indexBattleRecord(snapshot);
  return snapshot;
}

async function updateBattleRecord(battleId, updater) {
  if (!battleId) return null;

  const document = shardDocument(battleId);
  let removed = false;

  const next = await document.mutate(async (current) => {
    const updated = await updater(current || null);
    if (!updated) {
      removed = true;
      return current;
    }
    removed = false;
    return normalizeBattleRecord(updated);
  });

  if (removed) {
    await removeBattleRecord(battleId, next);
    return null;
  }

  await indexBattleRecord(next);
  return next;
}

/** Deleting a battle also takes it out of the indexes that list it. */
async function removeBattleRecord(battleId, record) {
  if (isBlobEnabled()) {
    await del(shardPath(battleId)).catch(() => null);
  }

  if (!record) return;

  const timestamp = recordTimestamp(record);
  const drop = (entries) => entries.filter((entry) => entry.battleId !== battleId);

  for (const wallet of [record.attackerOwnerWallet, record.defenderOwnerWallet].filter(Boolean)) {
    await walletMonthDocument(wallet, monthKeyOf(timestamp)).mutate((current) => ({
      version: 1,
      entries: drop(current.entries),
    }));
  }

  await hourDocument(hourKeyOf(timestamp)).mutate((current) => ({
    version: 1,
    entries: drop(current.entries),
  }));
  await dayDocument(dayKeyOf(timestamp)).mutate((current) => ({
    version: 1,
    entries: drop(current.entries),
  }));
}

async function listBattleHistoryForWallet(wallet, { limit, cursor } = {}) {
  const normalizedWallet = String(wallet || "").trim();
  const empty = { history: [], page: { nextCursor: null, hasMore: false } };
  if (!normalizedWallet) return empty;

  const pageSize = resolveBattleHistoryPageSize(limit);
  const cursorState = decodeBattleHistoryCursor(cursor);
  const { data: monthsDoc } = await walletMonthsDocument(normalizedWallet).read();

  const page = [];
  let hasMore = false;

  // Months are walked newest first and only until the page is full: a player
  // reading the first screen of history touches exactly one file.
  for (const month of monthsDoc.months) {
    const { data } = await walletMonthDocument(normalizedWallet, month).read();

    for (const entry of data.entries) {
      if (cursorState && !isBattleHistoryEntryOlderThanCursor(entry, cursorState)) continue;
      if (page.length >= pageSize) {
        hasMore = true;
        break;
      }
      page.push(entry);
    }

    if (hasMore) break;
  }

  return {
    history: page.map((entry) => cloneValue(entry)),
    page: {
      nextCursor: hasMore ? encodeBattleHistoryCursor(page[page.length - 1]) : null,
      hasMore,
    },
  };
}

function resolveAdminDays(value) {
  const parsed = Math.floor(Number(value) || DEFAULT_ADMIN_DAYS);
  return Math.max(1, Math.min(MAX_ADMIN_DAYS, parsed));
}

async function listHourKeys() {
  if (!isBlobEnabled()) return listLocalIndexKeys(HOUR_INDEX_PREFIX);

  const keys = [];
  let cursor = null;
  do {
    const page = await list({ prefix: HOUR_INDEX_PREFIX, limit: 1000, ...(cursor ? { cursor } : {}) });
    for (const blob of page.blobs || []) {
      const rest = blob.pathname.slice(HOUR_INDEX_PREFIX.length);
      if (/^\d{4}-\d{2}-\d{2}T\d{2}\.json$/.test(rest)) keys.push(rest.replace(/\.json$/, ""));
    }
    cursor = page.hasMore ? page.cursor : null;
  } while (cursor);

  return keys.sort();
}

async function listLocalIndexKeys(prefix) {
  const fs = require("fs/promises");
  const path = require("path");
  const base = path.join(
    process.cwd(),
    process.env.NODE_ENV === "production" ? ".data" : ".data/local-dev",
    "blob",
    prefix
  );
  const names = await fs.readdir(base).catch(() => []);
  return names
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.replace(/\.json$/, ""))
    .sort();
}

/**
 * The admin list, by date range instead of "everything ever played" — the old
 * answer was a 5 MB payload that read the whole 103 MB document.
 */
async function listAdminCompletedBattles({ days } = {}) {
  const windowDays = resolveAdminDays(days);
  const now = Date.now();
  const dayKeys = [];
  for (let offset = 0; offset < windowDays; offset += 1) {
    dayKeys.push(dayKeyOf(now - offset * 24 * 60 * 60 * 1000));
  }

  const wanted = new Set(dayKeys);
  const hourKeys = (await listHourKeys()).filter((key) => wanted.has(key.slice(0, 10)));

  const entries = [];
  for (const dayKey of dayKeys) {
    const { data } = await dayDocument(dayKey).read();
    entries.push(...data.entries);
  }
  for (const hourKey of hourKeys) {
    const { data } = await hourDocument(hourKey).read();
    entries.push(...data.entries);
  }

  const battles = mergeEntries([], entries);

  return {
    summary: buildAdminBattleSummary(battles),
    battles: battles.map((entry) => cloneValue(entry)),
    range: { days: windowDays, from: dayKeys[dayKeys.length - 1], to: dayKeys[0] },
  };
}

/**
 * Points paid out by battles since `sinceMs`, read from the admin index —
 * `farm-stats` used to answer this by scanning every battle record.
 */
async function sumCoinRewardSince(sinceMs) {
  const { battles } = await listAdminCompletedBattles({ days: 2 });

  return battles.reduce((total, entry) => {
    const timestamp = Date.parse(entry.completedAt || entry.createdAt || 0);
    if (!Number.isFinite(timestamp) || timestamp < sinceMs) return total;
    return total + Math.max(0, Math.floor(Number(entry.coinReward) || 0));
  }, 0);
}

/**
 * Every record, for the forensic tools only (progression audit, the snapshot
 * image script). Reads one blob per battle with a bounded pool.
 */
async function listAllBattleRecords() {
  const ids = await listBattleIds();
  const records = await mapWithConcurrency(ids, SHARD_READ_CONCURRENCY, (id) =>
    getBattleRecord(id).catch(() => null)
  );

  return records.filter(Boolean).sort(compareBattleRecordsNewestFirst);
}

async function listBattleIds() {
  if (!isBlobEnabled()) return listLocalIndexKeys(SHARD_PREFIX).then((keys) => keys.map(decodeURIComponent));

  const ids = [];
  let cursor = null;
  do {
    const page = await list({ prefix: SHARD_PREFIX, limit: 1000, ...(cursor ? { cursor } : {}) });
    for (const blob of page.blobs || []) {
      const rest = blob.pathname.slice(SHARD_PREFIX.length);
      // The prefix also holds each record's immutable copies at
      // `<battleId>-v/<md5>.json`; only the pointers are battles.
      if (!rest.endsWith(".json") || rest.includes("/")) continue;
      ids.push(battleIdFromShardPath(blob.pathname));
    }
    cursor = page.hasMore ? page.cursor : null;
  } while (cursor);

  return ids;
}

/**
 * Folds finished hours into their day file. Run by cron: a day file is ~450 KB
 * and must never be on a battle's write path.
 */
async function rollUpBattleIndex({ now = Date.now() } = {}) {
  const currentHour = hourKeyOf(now);
  const hourKeys = (await listHourKeys()).filter((key) => key < currentHour);

  const byDay = new Map();
  for (const hourKey of hourKeys) {
    const dayKey = hourKey.slice(0, 10);
    if (!byDay.has(dayKey)) byDay.set(dayKey, []);
    byDay.get(dayKey).push(hourKey);
  }

  let rolledEntries = 0;
  for (const [dayKey, hours] of byDay) {
    const collected = [];
    for (const hourKey of hours) {
      const { data } = await hourDocument(hourKey).readConsistent();
      collected.push(...data.entries);
    }

    if (collected.length) {
      await dayDocument(dayKey).mutate((current) => ({
        version: 1,
        entries: mergeEntries(current.entries, collected),
      }));
      rolledEntries += collected.length;
    }

    // The hour file is gone once its entries are in the day file; the GC
    // collects the immutable copies it leaves behind.
    for (const hourKey of hours) {
      if (isBlobEnabled()) await del(hourDocument(hourKey).path).catch(() => null);
      else await deleteLocalIndex(hourDocument(hourKey).path);
    }
  }

  return { hours: hourKeys.length, days: byDay.size, entries: rolledEntries };
}

async function deleteLocalIndex(pathname) {
  const fs = require("fs/promises");
  const path = require("path");
  const file = path.join(
    process.cwd(),
    process.env.NODE_ENV === "production" ? ".data" : ".data/local-dev",
    "blob",
    pathname
  );
  await fs.rm(file, { force: true }).catch(() => null);
}

function migrationDocument() {
  return createBlobDocument({
    path: MIGRATION_PATH,
    empty: () => ({ version: 1, migrated: 0, cursor: null, done: false, startedAt: null }),
    normalize: (raw) => ({
      version: 1,
      migrated: Math.max(0, Math.floor(Number(raw?.migrated) || 0)),
      cursor: raw?.cursor || null,
      done: Boolean(raw?.done),
      startedAt: raw?.startedAt || null,
    }),
  });
}

/**
 * Writes a batch of legacy records into the new layout. Idempotent: a record
 * written twice lands on the same shard path and merges into the same index
 * entry, so a retried or overlapping run cannot duplicate anything.
 */
async function importBattleRecords(records) {
  const snapshots = records.map((record) => normalizeBattleRecord(record)).filter(Boolean);

  await mapWithConcurrency(snapshots, SHARD_READ_CONCURRENCY, (snapshot) =>
    shardDocument(snapshot.id).write(snapshot)
  );

  // Index writes are grouped per file: a migration batch touches one wallet's
  // month once, not once per battle.
  const walletMonths = new Map();
  const hours = new Map();

  for (const snapshot of snapshots) {
    if (!isReplayableBattleRecord(snapshot)) continue;
    const timestamp = recordTimestamp(snapshot);

    for (const wallet of [snapshot.attackerOwnerWallet, snapshot.defenderOwnerWallet].filter(Boolean)) {
      const entry = buildBattleHistoryEntry(snapshot, wallet);
      if (!entry) continue;
      const key = `${wallet}\u0000${monthKeyOf(timestamp)}`;
      if (!walletMonths.has(key)) walletMonths.set(key, []);
      walletMonths.get(key).push(entry);
    }

    const adminEntry = buildAdminIndexEntry(snapshot);
    if (adminEntry) {
      const hourKey = hourKeyOf(timestamp);
      if (!hours.has(hourKey)) hours.set(hourKey, []);
      hours.get(hourKey).push(adminEntry);
    }
  }

  for (const [key, entries] of walletMonths) {
    const [wallet, month] = key.split("\u0000");
    await upsertWalletMonth(wallet, month, entries);
  }
  for (const [hourKey, entries] of hours) {
    await upsertHour(hourKey, entries);
  }

  return snapshots.length;
}

module.exports = {
  BASE_PREFIX,
  DAY_INDEX_PREFIX,
  HOUR_INDEX_PREFIX,
  SHARD_PREFIX,
  WALLET_INDEX_PREFIX,
  getBattleRecord,
  importBattleRecords,
  indexBattleRecord,
  listAdminCompletedBattles,
  listAllBattleRecords,
  listBattleHistoryForWallet,
  listBattleIds,
  migrationDocument,
  removeBattleRecord,
  rollUpBattleIndex,
  saveBattleRecord,
  sumCoinRewardSince,
  updateBattleRecord,
};
