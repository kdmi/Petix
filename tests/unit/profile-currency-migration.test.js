const test = require("node:test");
const assert = require("node:assert/strict");

const { withIsolatedBattleHistoryEnv, createWallet } = require("./helpers/battle-history-test-utils");

test("wallet profile without currency field defaults to zero balances", async () => {
  await withIsolatedBattleHistoryEnv(async ({ store }) => {
    const wallet = createWallet("a");
    const legacyProfile = {
      draft: null,
      characters: [],
      notifications: [],
      battleState: { energyCurrent: 3, energyMax: 3, refillDate: null },
    };

    await store.saveWalletProfile(wallet, legacyProfile);
    const loaded = await store.getWalletProfile(wallet);

    assert.deepEqual(loaded.currency, { balance: 0, totalEarned: 0 });
    assert.deepEqual(loaded.characters, []);
    assert.equal(loaded.draft, null);
  });
});

test("wallet profile with null currency defaults to zero balances", async () => {
  await withIsolatedBattleHistoryEnv(async ({ store }) => {
    const wallet = createWallet("b");
    await store.saveWalletProfile(wallet, {
      draft: null,
      characters: [],
      notifications: [],
      battleState: { energyCurrent: 3, energyMax: 3, refillDate: null },
      currency: null,
    });

    const loaded = await store.getWalletProfile(wallet);
    assert.deepEqual(loaded.currency, { balance: 0, totalEarned: 0 });
  });
});

test("wallet profile with malformed currency values is coerced", async () => {
  await withIsolatedBattleHistoryEnv(async ({ store }) => {
    const wallet = createWallet("c");
    await store.saveWalletProfile(wallet, {
      draft: null,
      characters: [],
      notifications: [],
      battleState: { energyCurrent: 3, energyMax: 3, refillDate: null },
      currency: { balance: -5, totalEarned: "garbage" },
    });

    const loaded = await store.getWalletProfile(wallet);
    assert.deepEqual(loaded.currency, { balance: 0, totalEarned: 0 });
  });
});

test("wallet profile preserves valid currency through save+reload", async () => {
  await withIsolatedBattleHistoryEnv(async ({ store }) => {
    const wallet = createWallet("d");
    await store.saveWalletProfile(wallet, {
      draft: null,
      characters: [],
      notifications: [],
      battleState: { energyCurrent: 3, energyMax: 3, refillDate: null },
      currency: { balance: 250, totalEarned: 750 },
    });

    const loaded = await store.getWalletProfile(wallet);
    assert.deepEqual(loaded.currency, { balance: 250, totalEarned: 750 });
  });
});

test("wallet profile with fractional currency values is floored", async () => {
  await withIsolatedBattleHistoryEnv(async ({ store }) => {
    const wallet = createWallet("e");
    await store.saveWalletProfile(wallet, {
      draft: null,
      characters: [],
      notifications: [],
      battleState: { energyCurrent: 3, energyMax: 3, refillDate: null },
      currency: { balance: 12.8, totalEarned: 99.9 },
    });

    const loaded = await store.getWalletProfile(wallet);
    assert.deepEqual(loaded.currency, { balance: 12, totalEarned: 99 });
  });
});

test("updateWalletProfile mutator can credit currency and persist it", async () => {
  await withIsolatedBattleHistoryEnv(async ({ store }) => {
    const wallet = createWallet("f");
    const { creditCurrency } = require("../../api/_lib/currency");

    await store.saveWalletProfile(wallet, {
      draft: null,
      characters: [],
      notifications: [],
      battleState: { energyCurrent: 3, energyMax: 3, refillDate: null },
      currency: { balance: 100, totalEarned: 100 },
    });

    await store.updateWalletProfile(wallet, (current) => {
      creditCurrency(current, 250);
      return current;
    });

    const loaded = await store.getWalletProfile(wallet);
    assert.deepEqual(loaded.currency, { balance: 350, totalEarned: 350 });
  });
});
