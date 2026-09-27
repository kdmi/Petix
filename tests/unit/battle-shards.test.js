const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const { withFakeBlobEnv } = require("./helpers/blob-call-counter");

// Feature 025. Until now every battle rewrote one 103 MB document, twice per
// mutation — ~400 MB of writes per fight, billed as storage and as Fast Origin
// Transfer, growing with the square of the number of battles played.
//
// These tests pin the properties that make the new layout worth the change:
// a battle writes only its own record and the indexes that list it, a replay
// reads one blob, and nothing a battle writes grows without bound.

const SHARD_STORE_PATH = path.resolve(__dirname, "../../api/_lib/battle-shard-store.js");
const MIGRATION_PATH = path.resolve(__dirname, "../../api/_lib/battle-migration.js");

const ATTACKER = "test-wallet-001";
const DEFENDER = "test-wallet-002";

function pet(id, name, wallet) {
  return {
    id,
    name,
    displayName: name,
    wallet,
    imageUrl: `https://example.invalid/${id}.png`,
    level: 4,
    rarity: "Rare",
    attributes: { stamina: 4, agility: 4, strength: 4, intelligence: 4 },
  };
}

function battle(id, { at, winner = "pet_atk", attacker = ATTACKER, defender = DEFENDER } = {}) {
  return {
    id,
    status: "ready",
    battleType: "pvp_random",
    createdAt: at,
    completedAt: at,
    attackerPetId: "pet_atk",
    defenderPetId: "pet_def",
    attackerOwnerWallet: attacker,
    defenderOwnerWallet: defender,
    narrationMode: "template",
    attackerSnapshot: pet("pet_atk", "Attacker", attacker),
    defenderSnapshot: pet("pet_def", "Defender", defender),
    rounds: [{ index: 1, text: "A hit." }],
    result: { winnerPetId: winner, finalSummaryText: "Done." },
    coinReward: 100,
  };
}

function loadShardStore() {
  delete require.cache[require.resolve(SHARD_STORE_PATH)];
  return require(SHARD_STORE_PATH);
}

async function withShardEnv(overrides, run) {
  const previous = {};
  const applied = { BATTLE_SHARDS_ENABLED: "1", ...overrides };
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

function pathsWith(state, fragment) {
  return [...state.keys()].filter((pathname) => pathname.includes(fragment));
}

test("a battle writes its own record and the indexes that list it — nothing else", async () => {
  await withShardEnv({}, async () => {
    await withFakeBlobEnv(async ({ state, counts, resetCounts }) => {
      const shards = loadShardStore();

      await shards.saveBattleRecord(battle("battle_1", { at: "2026-09-27T10:00:00.000Z" }));
      resetCounts();
      await shards.saveBattleRecord(battle("battle_2", { at: "2026-09-27T10:05:00.000Z" }));

      // One record + two wallet months + one hour file, each with its copy.
      assert.ok(counts.put <= 10, `a battle should write a handful of blobs, wrote ${counts.put}`);
      assert.ok(
        counts.putBytes < 1024 * 1024,
        `a battle must write well under a megabyte, wrote ${counts.putBytes} bytes`
      );

      assert.equal(pathsWith(state, "-b/battle_2.json").length, 1, "the record is its own blob");
      assert.equal(pathsWith(state, `-bi-w/${ATTACKER}/2026-09.json`).length, 1);
      assert.equal(pathsWith(state, `-bi-w/${DEFENDER}/2026-09.json`).length, 1);
      assert.equal(pathsWith(state, "-bi-h/2026-09-27T10.json").length, 1);
    });
  });
});

test("a replay reads that battle and nothing else", async () => {
  await withShardEnv({}, async () => {
    await withFakeBlobEnv(async ({ counts, resetCounts }) => {
      const shards = loadShardStore();
      for (let index = 0; index < 5; index += 1) {
        await shards.saveBattleRecord(
          battle(`battle_r${index}`, { at: `2026-09-27T1${index}:00:00.000Z` })
        );
      }

      resetCounts();
      const record = await shards.getBattleRecord("battle_r3");

      assert.equal(record.id, "battle_r3");
      assert.equal(record.rounds.length, 1);
      assert.ok(counts.get <= 2, `a replay should read one blob, read ${counts.get}`);
      assert.equal(counts.list, 0, "and must not scan the store");
    });
  });
});

test("history is paged across months, newest first", async () => {
  await withShardEnv({}, async () => {
    await withFakeBlobEnv(async () => {
      const shards = loadShardStore();
      const days = [
        "2026-07-10T10:00:00.000Z",
        "2026-08-10T10:00:00.000Z",
        "2026-09-10T10:00:00.000Z",
        "2026-09-11T10:00:00.000Z",
      ];
      for (const [index, at] of days.entries()) {
        await shards.saveBattleRecord(battle(`battle_h${index}`, { at }));
      }

      const first = await shards.listBattleHistoryForWallet(ATTACKER, { limit: 2 });
      assert.deepEqual(
        first.history.map((entry) => entry.battleId),
        ["battle_h3", "battle_h2"],
        "newest first"
      );
      assert.equal(first.page.hasMore, true);

      const second = await shards.listBattleHistoryForWallet(ATTACKER, {
        limit: 2,
        cursor: first.page.nextCursor,
      });
      assert.deepEqual(
        second.history.map((entry) => entry.battleId),
        ["battle_h1", "battle_h0"],
        "the next page crosses into the older months"
      );
      assert.equal(second.page.hasMore, false);
    });
  });
});

test("the defender sees the same battle from their own side", async () => {
  await withShardEnv({}, async () => {
    await withFakeBlobEnv(async () => {
      const shards = loadShardStore();
      await shards.saveBattleRecord(battle("battle_sides", { at: "2026-09-27T09:00:00.000Z" }));

      const attacker = await shards.listBattleHistoryForWallet(ATTACKER);
      const defender = await shards.listBattleHistoryForWallet(DEFENDER);

      assert.equal(attacker.history[0].playerRole, "attacker");
      assert.equal(attacker.history[0].outcome, "win");
      assert.equal(defender.history[0].playerRole, "defender");
      assert.equal(defender.history[0].outcome, "loss");
      assert.equal(defender.history[0].opponentPet.id, "pet_atk");
    });
  });
});

test("two battles finishing at once both end up in the index", async () => {
  await withShardEnv({}, async () => {
    await withFakeBlobEnv(async () => {
      const shards = loadShardStore();

      await Promise.all([
        shards.saveBattleRecord(battle("battle_race_a", { at: "2026-09-27T08:00:00.000Z" })),
        shards.saveBattleRecord(battle("battle_race_b", { at: "2026-09-27T08:00:01.000Z" })),
      ]);

      const history = await shards.listBattleHistoryForWallet(ATTACKER, { limit: 10 });
      assert.deepEqual(
        history.history.map((entry) => entry.battleId).sort(),
        ["battle_race_a", "battle_race_b"],
        "a read-modify-write on the same month file must not lose either battle"
      );
    });
  });
});

test("an unfinished battle is stored but listed nowhere", async () => {
  await withShardEnv({}, async () => {
    await withFakeBlobEnv(async ({ state }) => {
      const shards = loadShardStore();
      await shards.saveBattleRecord({
        id: "battle_generating",
        status: "generating",
        createdAt: "2026-09-27T07:00:00.000Z",
        attackerOwnerWallet: ATTACKER,
        defenderOwnerWallet: DEFENDER,
      });

      assert.equal((await shards.getBattleRecord("battle_generating")).status, "generating");
      assert.equal(pathsWith(state, "-bi-h/").length, 0, "no hour index for a battle in flight");

      const history = await shards.listBattleHistoryForWallet(ATTACKER);
      assert.equal(history.history.length, 0);
    });
  });
});

test("the rollup folds finished hours into the day file and drops them", async () => {
  await withShardEnv({}, async () => {
    await withFakeBlobEnv(async ({ state }) => {
      const shards = loadShardStore();
      await shards.saveBattleRecord(battle("battle_d1", { at: "2026-09-26T08:00:00.000Z" }));
      await shards.saveBattleRecord(battle("battle_d2", { at: "2026-09-26T09:00:00.000Z" }));

      const report = await shards.rollUpBattleIndex({ now: Date.parse("2026-09-26T12:00:00.000Z") });

      assert.equal(report.hours, 2);
      assert.equal(report.entries, 2);
      assert.equal(pathsWith(state, "-bi-h/2026-09-26T08.json").length, 0, "the hour file is gone");
      assert.equal(pathsWith(state, "-bi-d/2026-09-26.json").length, 1);

      const admin = await shards.listAdminCompletedBattles({ days: 90 });
      assert.deepEqual(
        admin.battles.map((entry) => entry.battleId).sort(),
        ["battle_d1", "battle_d2"],
        "the admin list reads the rolled-up day"
      );
    });
  });
});

test("the rollup leaves the hour that is still being played", async () => {
  await withShardEnv({}, async () => {
    await withFakeBlobEnv(async ({ state }) => {
      const shards = loadShardStore();
      await shards.saveBattleRecord(battle("battle_now", { at: "2026-09-26T12:30:00.000Z" }));

      await shards.rollUpBattleIndex({ now: Date.parse("2026-09-26T12:45:00.000Z") });

      assert.equal(
        pathsWith(state, "-bi-h/2026-09-26T12.json").length,
        1,
        "the current hour keeps collecting battles"
      );
    });
  });
});

test("the admin list is a window and carries what the numbers need", async () => {
  await withShardEnv({}, async () => {
    await withFakeBlobEnv(async () => {
      const shards = loadShardStore();
      const now = Date.now();
      const recent = new Date(now - 2 * 60 * 60 * 1000).toISOString();
      const old = new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString();

      await shards.saveBattleRecord(battle("battle_recent", { at: recent }));
      await shards.saveBattleRecord(battle("battle_old", { at: old }));

      const week = await shards.listAdminCompletedBattles({ days: 7 });
      assert.deepEqual(week.battles.map((entry) => entry.battleId), ["battle_recent"]);
      assert.equal(week.summary.totalCompletedBattles, 1);
      assert.equal(week.range.days, 7);

      const quarter = await shards.listAdminCompletedBattles({ days: 90 });
      assert.equal(quarter.battles.length, 2, "a wider window reaches the older battle");

      assert.equal(
        await shards.sumCoinRewardSince(now - 24 * 60 * 60 * 1000),
        100,
        "farm-stats reads the day's emission from the index"
      );
    });
  });
});

test("updating a battle keeps one record and one index entry", async () => {
  await withShardEnv({}, async () => {
    await withFakeBlobEnv(async () => {
      const shards = loadShardStore();
      await shards.saveBattleRecord({
        ...battle("battle_update", { at: "2026-09-27T06:00:00.000Z" }),
        status: "generating",
        result: null,
      });

      await shards.updateBattleRecord("battle_update", (current) => ({
        ...current,
        ...battle("battle_update", { at: "2026-09-27T06:00:00.000Z" }),
      }));

      const history = await shards.listBattleHistoryForWallet(ATTACKER, { limit: 10 });
      assert.equal(history.history.length, 1, "the finished battle is listed once");
      assert.equal((await shards.getBattleRecord("battle_update")).status, "ready");
    });
  });
});

test("migration imports the legacy document and is safe to run twice", async () => {
  await withShardEnv({ BATTLE_MIGRATION_BATCH: "2" }, async () => {
    await withFakeBlobEnv(async ({ battleStore }) => {
      // Write the legacy document the way the pre-025 store did.
      await withShardEnv({ BATTLE_SHARDS_ENABLED: "0" }, async () => {
        for (let index = 0; index < 5; index += 1) {
          await battleStore.saveBattleRecord(
            battle(`battle_legacy_${index}`, { at: `2026-08-0${index + 1}T10:00:00.000Z` })
          );
        }
      });

      delete require.cache[require.resolve(MIGRATION_PATH)];
      const { compareBattleStores, migrateBattlesToShards } = require(MIGRATION_PATH);

      const first = await migrateBattlesToShards();
      assert.equal(first.done, true);
      assert.equal(first.imported, 5);

      const shards = loadShardStore();
      const history = await shards.listBattleHistoryForWallet(ATTACKER, { limit: 10 });
      assert.equal(history.history.length, 5, "every legacy battle is in the player's history");
      assert.equal((await shards.getBattleRecord("battle_legacy_3")).coinReward, 100);

      const again = await migrateBattlesToShards({ force: true });
      assert.equal(again.imported, 5, "a repeat run re-imports");

      const afterRepeat = await shards.listBattleHistoryForWallet(ATTACKER, { limit: 10 });
      assert.equal(afterRepeat.history.length, 5, "and cannot duplicate a battle");

      const ids = await shards.listBattleIds();
      assert.equal(ids.length, 5, "listing battles must count records, not their immutable copies");

      const comparison = await compareBattleStores();
      assert.equal(comparison.legacy, 5);
      assert.equal(comparison.shards, 5);
      assert.equal(comparison.missing, 0);
    });
  });
});

test("a battle left behind in the legacy document is adopted on read", async () => {
  await withShardEnv({}, async () => {
    await withFakeBlobEnv(async ({ battleStore }) => {
      await withShardEnv({ BATTLE_SHARDS_ENABLED: "0" }, async () => {
        await battleStore.saveBattleRecord(battle("battle_straggler", { at: "2026-09-27T05:00:00.000Z" }));
      });

      // Reading through the facade with shards on must still find it, and
      // must leave it in the new layout.
      const record = await battleStore.getBattleRecord("battle_straggler");
      assert.equal(record.id, "battle_straggler");

      const shards = loadShardStore();
      assert.ok(await shards.getBattleRecord("battle_straggler"), "the record was adopted");
      const history = await shards.listBattleHistoryForWallet(ATTACKER);
      assert.equal(history.history[0].battleId, "battle_straggler");
    });
  });
});

test("a migration run that is cut short still moves the cursor forward", async () => {
  // Production, 2026-09-27: 400 records took ~160 s, because blob writes are
  // rate limited. A run the platform kills must not hand the next tick the
  // same records again — those redone writes cost the same budget as new ones.
  await withShardEnv({ BATTLE_MIGRATION_BATCH: "2", BATTLE_MIGRATION_MAX_DURATION_MS: "1000" }, async () => {
    await withFakeBlobEnv(async ({ battleStore }) => {
      await withShardEnv({ BATTLE_SHARDS_ENABLED: "0" }, async () => {
        for (let index = 0; index < 6; index += 1) {
          await battleStore.saveBattleRecord(
            battle(`battle_cut_${index}`, { at: `2026-08-1${index}T10:00:00.000Z` })
          );
        }
      });

      delete require.cache[require.resolve(MIGRATION_PATH)];
      const { migrateBattlesToShards } = require(MIGRATION_PATH);
      const shards = loadShardStore();
      const { migrationDocument } = shards;

      // Stop the run after its first batch by exhausting the budget.
      const originalNow = Date.now;
      let calls = 0;
      Date.now = () => originalNow() + (calls++ > 2 ? 5000 : 0);

      let first;
      try {
        first = await migrateBattlesToShards();
      } finally {
        Date.now = originalNow;
      }

      assert.ok(first.imported > 0 && first.imported < 6, "the run stopped early");
      assert.equal(first.done, false);

      const { data: progress } = await migrationDocument().readConsistent();
      assert.equal(progress.migrated, first.imported, "progress is saved per batch");
      assert.ok(progress.cursor, "and the cursor points at the last record written");

      const second = await migrateBattlesToShards();
      assert.equal(second.done, true);
      assert.equal(
        second.migrated,
        6,
        "the second run finishes the rest instead of starting over"
      );
    });
  });
});

test("the catch-up pass imports only what the shards are missing", async () => {
  // A battle played *while* the migration runs gets an id that sorts before
  // the cursor, so the cursor-based pass has already walked past its place.
  // Production left 38 of them behind on the first run (2026-09-27).
  await withShardEnv({}, async () => {
    await withFakeBlobEnv(async ({ battleStore, counts, resetCounts }) => {
      await withShardEnv({ BATTLE_SHARDS_ENABLED: "0" }, async () => {
        for (let index = 0; index < 4; index += 1) {
          await battleStore.saveBattleRecord(
            battle(`battle_pass_${index}`, { at: `2026-08-2${index}T10:00:00.000Z` })
          );
        }
      });

      delete require.cache[require.resolve(MIGRATION_PATH)];
      const { catchUpMissingBattles, migrateBattlesToShards } = require(MIGRATION_PATH);
      await migrateBattlesToShards();

      // Now a battle lands in the legacy document after the pass is done.
      await withShardEnv({ BATTLE_SHARDS_ENABLED: "0" }, async () => {
        await battleStore.saveBattleRecord(
          battle("battle_aaa_latecomer", { at: "2026-08-25T10:00:00.000Z" })
        );
      });

      const plain = await migrateBattlesToShards();
      assert.equal(plain.imported, 0, "the cursor pass cannot reach it");

      resetCounts();
      const caught = await catchUpMissingBattles();
      assert.equal(caught.imported, 1, "the catch-up pass does");
      assert.equal(caught.remaining, 0);
      assert.ok(
        counts.put < 20,
        `it must write the missing record, not all of them (wrote ${counts.put} blobs)`
      );

      const shards = loadShardStore();
      assert.ok(await shards.getBattleRecord("battle_aaa_latecomer"));
      const history = await shards.listBattleHistoryForWallet(ATTACKER, { limit: 10 });
      assert.equal(history.history.length, 5, "and it shows up in the player's history");
    });
  });
});
