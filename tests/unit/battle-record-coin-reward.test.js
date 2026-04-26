const test = require("node:test");
const assert = require("node:assert/strict");

const {
  withIsolatedBattleHistoryEnv,
  createReadyBattleRecord,
  createWallet,
} = require("./helpers/battle-history-test-utils");

test("battle record without coinReward defaults to 0", async () => {
  await withIsolatedBattleHistoryEnv(async ({ battleStore }) => {
    const record = createReadyBattleRecord({
      id: "battle_legacy_no_reward",
      attackerOwnerWallet: createWallet("1"),
      defenderOwnerWallet: createWallet("2"),
    });
    // explicitly omit coinReward
    await battleStore.saveBattleRecord(record);

    const loaded = await battleStore.getBattleRecord(record.id);
    assert.equal(loaded.coinReward, 0);
  });
});

test("battle record with string-number coinReward is coerced to integer", async () => {
  await withIsolatedBattleHistoryEnv(async ({ battleStore }) => {
    const record = createReadyBattleRecord({
      id: "battle_coerce_string",
      attackerOwnerWallet: createWallet("1"),
      defenderOwnerWallet: createWallet("2"),
    });
    record.coinReward = "125";
    await battleStore.saveBattleRecord(record);

    const loaded = await battleStore.getBattleRecord(record.id);
    assert.equal(loaded.coinReward, 125);
  });
});

test("battle record with negative coinReward is floored at 0", async () => {
  await withIsolatedBattleHistoryEnv(async ({ battleStore }) => {
    const record = createReadyBattleRecord({
      id: "battle_neg_reward",
      attackerOwnerWallet: createWallet("1"),
      defenderOwnerWallet: createWallet("2"),
    });
    record.coinReward = -50;
    await battleStore.saveBattleRecord(record);

    const loaded = await battleStore.getBattleRecord(record.id);
    assert.equal(loaded.coinReward, 0);
  });
});

test("battle record with fractional coinReward is floored", async () => {
  await withIsolatedBattleHistoryEnv(async ({ battleStore }) => {
    const record = createReadyBattleRecord({
      id: "battle_fractional_reward",
      attackerOwnerWallet: createWallet("1"),
      defenderOwnerWallet: createWallet("2"),
    });
    record.coinReward = 12.7;
    await battleStore.saveBattleRecord(record);

    const loaded = await battleStore.getBattleRecord(record.id);
    assert.equal(loaded.coinReward, 12);
  });
});

test("battle record preserves valid integer coinReward through save+reload", async () => {
  await withIsolatedBattleHistoryEnv(async ({ battleStore }) => {
    const record = createReadyBattleRecord({
      id: "battle_valid_reward",
      attackerOwnerWallet: createWallet("1"),
      defenderOwnerWallet: createWallet("2"),
    });
    record.coinReward = 180;
    await battleStore.saveBattleRecord(record);

    const loaded = await battleStore.getBattleRecord(record.id);
    assert.equal(loaded.coinReward, 180);
  });
});
