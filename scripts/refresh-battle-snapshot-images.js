// Points stored battle snapshots at each pet's current image.
//
// Battle records freeze a pet snapshot — including its image URL — at fight
// time, so arena history and replays keep showing the art a pet had back then.
// After a bulk re-render (see regenerate-character-images.js) that leaves the
// arena on the old images while the dashboard shows the new ones. This walks
// every battle and rewrites the snapshot URLs from the live character records.
//
//   node scripts/refresh-battle-snapshot-images.js --dry-run
//   node scripts/refresh-battle-snapshot-images.js
//
// Snapshots whose character no longer exists (burned pets) are left untouched.

const path = require("path");

const { listBattleRecords, updateBattleRecord } = require("../api/_lib/battle-store");
const { readDb } = require("../api/_lib/store");

const SNAPSHOT_KEYS = ["attackerSnapshot", "defenderSnapshot"];

function loadEnvFiles() {
  const root = process.cwd();

  for (const file of [".env.local", ".env"]) {
    let contents = "";
    try {
      contents = require("fs").readFileSync(path.join(root, file), "utf8");
    } catch {
      continue;
    }

    for (const line of contents.split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  }
}

async function buildCurrentImageIndex() {
  const db = await readDb();
  const index = new Map();

  for (const profile of Object.values(db.records || {})) {
    for (const character of profile.characters || []) {
      const url = character?.image?.url || "";
      if (character?.id && url) {
        index.set(character.id, url);
      }
    }
  }

  return index;
}

function planRecord(record, index) {
  const updates = {};

  for (const key of SNAPSHOT_KEYS) {
    const snapshot = record[key];
    if (!snapshot?.id) {
      continue;
    }

    const url = index.get(snapshot.id);
    if (url && snapshot.imageUrl !== url) {
      updates[key] = url;
    }
  }

  return updates;
}

async function main() {
  loadEnvFiles();
  const dryRun = process.argv.includes("--dry-run");

  const [battles, index] = await Promise.all([listBattleRecords(), buildCurrentImageIndex()]);
  const planned = battles
    .map((record) => ({ record, updates: planRecord(record, index) }))
    .filter((entry) => Object.keys(entry.updates).length > 0);

  console.log(
    JSON.stringify({
      battles: battles.length,
      recordsToUpdate: planned.length,
      snapshotsToUpdate: planned.reduce((sum, entry) => sum + Object.keys(entry.updates).length, 0),
      dryRun,
    })
  );

  if (dryRun) {
    return;
  }

  const failures = [];
  let done = 0;

  for (const { record, updates } of planned) {
    try {
      await updateBattleRecord(record.id, (existing) => {
        if (!existing) {
          return existing;
        }

        const next = { ...existing };
        for (const [key, url] of Object.entries(updates)) {
          if (next[key]?.id) {
            next[key] = { ...next[key], imageUrl: url };
          }
        }
        return next;
      });

      done += 1;
      console.log(`ok   ${done}/${planned.length} ${record.id}`);
    } catch (error) {
      failures.push({ battleId: record.id, error: error.message });
      console.error(`fail ${record.id}: ${error.message}`);
    }
  }

  console.log(JSON.stringify({ updated: done, failed: failures.length, failures }, null, 2));

  if (failures.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
