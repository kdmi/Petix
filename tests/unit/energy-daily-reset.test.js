const test = require("node:test");
const assert = require("node:assert/strict");

const { resetDailyEnergy } = require("../../api/_lib/energy-daily-reset");
const { getBattleDateKey } = require("../../api/_lib/battle-energy");

const NOW = new Date("2026-10-11T16:00:00Z");
const TODAY = getBattleDateKey(NOW);
const A = `0x${"a".repeat(40)}`, B = `0x${"b".repeat(40)}`, C = `0x${"c".repeat(40)}`, D = `0x${"d".repeat(40)}`;

function profile(battleState) {
  return { battleState, expeditions: { active: null, progress: {}, energyClaims: {}, daily: {}, grants: {}, tutorialSeen: false } };
}

function fakeProfiles(records) {
  return {
    db: { records },
    profiles: {
      getWalletProfile: async (w) => records[w],
      updateWalletProfile: async (w, mutate) => { records[w] = mutate(JSON.parse(JSON.stringify(records[w]))); return records[w]; },
    },
  };
}

test("daily reset: only today's spent free energy goes back; bonus and purchased stay; never twice", async () => {
  const records = {
    [A]: profile({ energyUsed: 3, energyGranted: 7, energyPurchased: 2, lastResetDate: TODAY }),
    [B]: profile({ energyUsed: 1, energyGranted: 0, energyPurchased: 0, lastResetDate: TODAY }),
    [C]: profile({ energyUsed: 0, energyGranted: 5, energyPurchased: 0, lastResetDate: TODAY }), // nothing spent
    [D]: profile({ energyUsed: 3, energyGranted: 0, energyPurchased: 0, lastResetDate: "2026-10-10" }), // resets by itself
  };
  const { db, profiles } = fakeProfiles(records);

  const dry = await resetDailyEnergy({ now: NOW, db, profiles });
  assert.equal(dry.dryRun, true);
  assert.equal(dry.candidates, 2);
  assert.equal(dry.energyBack, 4);
  assert.equal(records[A].battleState.energyUsed, 3, "dry run writes nothing");

  const run = await resetDailyEnergy({ now: NOW, db, profiles, dryRun: false });
  assert.equal(run.reset, 2);
  assert.equal(run.remaining, 0);
  assert.equal(records[A].battleState.energyUsed, 0);
  assert.equal(records[A].battleState.energyGranted, 7, "bonus energy kept");
  assert.equal(records[A].battleState.energyPurchased, 2, "purchased energy kept");
  assert.equal(records[A].battleState.lastResetDate, TODAY);
  assert.ok(records[A].expeditions.grants[`daily-reset-${TODAY}`], "marked");
  assert.equal(records[C].battleState.energyUsed, 0);
  assert.equal(records[D].battleState.energyUsed, 3, "yesterday's counter untouched (it resets on its own)");

  // The player fights again after the reset; a second run must not refill them.
  records[A].battleState.energyUsed = 2;
  const again = await resetDailyEnergy({ now: NOW, db, profiles, dryRun: false });
  assert.equal(again.candidates, 0);
  assert.equal(records[A].battleState.energyUsed, 2);
});
