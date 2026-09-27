const { importBattleRecords, migrationDocument } = require("./battle-shard-store");
const { legacyListBattleRecords } = require("./battle-store");

// Moves the battles that were written before feature 025 out of the single
// 103 MB document and into one blob per battle plus the indexes.
//
// Run by cron in batches, because one pass over 8 891 records would not fit in
// a function invocation. Every batch is idempotent: a record lands on the same
// shard path and merges into the same index entry, so re-running a batch (a
// timeout, an overlapping tick) can never duplicate a battle.
//
// The legacy document stays the fallback while this runs — battle-store.js
// adopts any record the shards do not have yet — so the switch does not have
// to wait for the migration to finish.

function readIntEnv(name, fallback, minimum) {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, parsed);
}

// Measured on production (2026-09-27): importing 400 records took ~160 s —
// blob writes are rate limited, so a batch is paced by the store, not by us.
// Smaller batches mean the cursor moves more often, which is what keeps a run
// that the platform cuts short from being redone from the beginning.
function getBatchSize() {
  return readIntEnv("BATTLE_MIGRATION_BATCH", 100, 1);
}

function getMaxDurationMs() {
  return readIntEnv("BATTLE_MIGRATION_MAX_DURATION_MS", 120000, 1000);
}

/** Stable order so a cursor means the same thing on every run. */
function byId(left, right) {
  return String(left.id).localeCompare(String(right.id));
}

async function migrateBattlesToShards({ force = false } = {}) {
  const startedAt = Date.now();
  const progress = migrationDocument();
  const { data: state } = await progress.readConsistent();

  if (state.done && !force) {
    return { done: true, migrated: state.migrated, imported: 0, remaining: 0 };
  }

  const records = (await legacyListBattleRecords()).slice().sort(byId);
  const cursor = force ? null : state.cursor;
  const startIndex = cursor ? records.findIndex((record) => record.id === cursor) + 1 : 0;
  const pending = records.slice(startIndex > 0 ? startIndex : 0);

  if (!pending.length) {
    await progress.mutate((current) => ({ ...current, done: true, cursor: null }));
    return { done: true, migrated: state.migrated, imported: 0, remaining: 0, total: records.length };
  }

  const batchSize = getBatchSize();
  const maxDurationMs = getMaxDurationMs();

  let imported = 0;
  let lastId = cursor;
  let migrated = { migrated: force ? 0 : state.migrated, done: false };

  // One legacy read serves several batches; stop on the time budget so the
  // invocation always returns and the next tick continues from the cursor.
  while (imported < pending.length && Date.now() - startedAt < maxDurationMs) {
    const batch = pending.slice(imported, imported + batchSize);
    if (!batch.length) break;

    await importBattleRecords(batch);
    imported += batch.length;
    lastId = batch[batch.length - 1].id;

    // Save after every batch, not at the end: an invocation the platform cuts
    // short would otherwise hand the next tick the same records again, and
    // those redone writes cost the same rate-limited budget as new ones.
    migrated = await progress.mutate((current) => ({
      ...current,
      startedAt: current.startedAt || new Date(startedAt).toISOString(),
      migrated: (force && imported === batch.length ? 0 : current.migrated) + batch.length,
      cursor: lastId,
      done: false,
    }));
  }

  const remaining = pending.length - imported;
  if (remaining === 0) {
    migrated = await progress.mutate((current) => ({ ...current, done: true }));
  }

  return {
    done: Boolean(migrated.done),
    imported,
    migrated: migrated.migrated,
    remaining,
    total: records.length,
    durationMs: Date.now() - startedAt,
  };
}

/** Counts what is on each side, for the check before the legacy blob is dropped. */
async function compareBattleStores() {
  const { listBattleIds } = require("./battle-shard-store");
  const legacy = await legacyListBattleRecords();
  const shardIds = new Set(await listBattleIds());
  const missing = legacy.filter((record) => !shardIds.has(record.id)).map((record) => record.id);

  return {
    legacy: legacy.length,
    shards: shardIds.size,
    missing: missing.length,
    missingSample: missing.slice(0, 20),
  };
}

module.exports = {
  compareBattleStores,
  migrateBattlesToShards,
};
