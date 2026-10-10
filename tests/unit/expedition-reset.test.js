const test = require("node:test");
const assert = require("node:assert/strict");

const { resetExpeditionProgress, resetProfile } = require("../../api/_lib/expedition-reset");

const WALLET = `0x${"ab".repeat(20)}`;

function testerProfile() {
  return {
    currency: { balance: 5000 },
    battleState: { energyGranted: 25, energyUsed: 1, lastResetDate: "2026-10-10" },
    expeditions: {
      active: { attemptId: "x1", bossIndex: 3 },
      progress: {
        1: { attempts: 7, wins: 6, stars3: 2, bestStars: 3, feesPaid: 0, rewardsPaid: 5000, nft: { status: "minted", contract: "0xold" }, lastResult: { at: "2026-10-10T18:00:00Z" } },
        2: { attempts: 2, wins: 2, stars3: 1, bestStars: 3, feesPaid: 2000, rewardsPaid: 3500 },
      },
      energyClaims: { 1: { energy: 10 }, 2: { energy: 20 } },
      daily: { "2026-10-10": { attempts: 9 } },
      grants: { "capsules-s1": { amount: 4 } },
      tutorialSeen: true,
    },
  };
}

test("reset clears progress, claims, daily stats and takes back unspent claimed energy", () => {
  const profile = testerProfile();
  const plan = resetProfile(profile, { now: new Date("2026-10-11T00:00:00Z") });

  assert.equal(plan.attempts, 9);
  assert.equal(plan.claimedEnergy, 30);
  assert.equal(plan.energyRemoved, 25, "only what is still banked can be taken back");
  assert.deepEqual(profile.expeditions.progress, {});
  assert.deepEqual(profile.expeditions.energyClaims, {});
  assert.deepEqual(profile.expeditions.daily, {});
  assert.equal(profile.expeditions.active, null);
  assert.equal(profile.expeditions.tutorialSeen, false);
  assert.deepEqual(profile.expeditions.grants, { "capsules-s1": { amount: 4 } }, "airdrop labels stay");
  assert.equal(profile.battleState.energyGranted, 0);
  assert.equal(profile.battleState.energyUsed, 1, "daily energy untouched");
  assert.equal(profile.currency.balance, 5000, "Points untouched");
});

test("dry run reports without writing; confirm writes through updateWalletProfile", async () => {
  const stored = testerProfile();
  let writes = 0;
  const profiles = {
    getWalletProfile: async () => JSON.parse(JSON.stringify(stored)),
    updateWalletProfile: async (wallet, mutate) => { writes += 1; return mutate(stored); },
  };

  const dry = await resetExpeditionProgress({ wallets: [WALLET.toUpperCase().replace("0X", "0x")], profiles });
  assert.equal(dry.dryRun, true);
  assert.equal(dry.results[0].wallet, WALLET);
  assert.equal(dry.results[0].stars3, 3);
  assert.equal(writes, 0);

  const done = await resetExpeditionProgress({ wallets: [WALLET], dryRun: false, profiles });
  assert.equal(done.results[0].reset, true);
  assert.equal(writes, 1);
  assert.deepEqual(stored.expeditions.progress, {});
});

test("invalid wallet list is rejected", async () => {
  await assert.rejects(() => resetExpeditionProgress({ wallets: ["nope"] }), /No valid/);
});
