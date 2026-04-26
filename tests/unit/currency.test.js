const test = require("node:test");
const assert = require("node:assert/strict");

const {
  computeCoinReward,
  creditCurrency,
  debitCurrency,
  formatCoins,
  normalizeCurrency,
} = require("../../api/_lib/currency");
const { BASE_WIN_REWARD, LEVEL_MULTIPLIER } = require("../../api/_lib/currency-config");

test("computeCoinReward returns base amount for level 1", () => {
  assert.equal(computeCoinReward(1), BASE_WIN_REWARD);
});

test("computeCoinReward scales linearly with level", () => {
  assert.equal(computeCoinReward(5), Math.round(BASE_WIN_REWARD * (1 + LEVEL_MULTIPLIER * 4)));
  assert.equal(computeCoinReward(10), Math.round(BASE_WIN_REWARD * (1 + LEVEL_MULTIPLIER * 9)));
  assert.equal(computeCoinReward(20), Math.round(BASE_WIN_REWARD * (1 + LEVEL_MULTIPLIER * 19)));
  assert.equal(computeCoinReward(50), Math.round(BASE_WIN_REWARD * (1 + LEVEL_MULTIPLIER * 49)));
});

test("computeCoinReward clamps non-positive levels to MIN_LEVEL", () => {
  assert.equal(computeCoinReward(0), BASE_WIN_REWARD);
  assert.equal(computeCoinReward(-5), BASE_WIN_REWARD);
  assert.equal(computeCoinReward(null), BASE_WIN_REWARD);
  assert.equal(computeCoinReward(undefined), BASE_WIN_REWARD);
});

test("computeCoinReward floors fractional levels", () => {
  assert.equal(computeCoinReward(5.9), computeCoinReward(5));
});

test("creditCurrency increments both balance and totalEarned", () => {
  const profile = { currency: { balance: 50, totalEarned: 50 } };
  creditCurrency(profile, 125);
  assert.deepEqual(profile.currency, { balance: 175, totalEarned: 175 });
});

test("creditCurrency initializes currency when missing", () => {
  const profile = {};
  creditCurrency(profile, 100);
  assert.deepEqual(profile.currency, { balance: 100, totalEarned: 100 });
});

test("creditCurrency throws on non-positive or non-integer amounts", () => {
  const profile = { currency: { balance: 0, totalEarned: 0 } };
  assert.throws(() => creditCurrency(profile, 0));
  assert.throws(() => creditCurrency(profile, -50));
  assert.throws(() => creditCurrency(profile, 3.5));
  assert.throws(() => creditCurrency(profile, "abc"));
});

test("debitCurrency subtracts from balance, leaves totalEarned", () => {
  const profile = { currency: { balance: 300, totalEarned: 500 } };
  const debited = debitCurrency(profile, 120);
  assert.equal(debited, 120);
  assert.deepEqual(profile.currency, { balance: 180, totalEarned: 500 });
});

test("debitCurrency floors at zero and returns actually-debited amount", () => {
  const profile = { currency: { balance: 50, totalEarned: 1000 } };
  const debited = debitCurrency(profile, 200);
  assert.equal(debited, 50);
  assert.deepEqual(profile.currency, { balance: 0, totalEarned: 1000 });
});

test("debitCurrency throws on non-positive or non-integer amounts", () => {
  const profile = { currency: { balance: 100, totalEarned: 100 } };
  assert.throws(() => debitCurrency(profile, 0));
  assert.throws(() => debitCurrency(profile, -10));
  assert.throws(() => debitCurrency(profile, 2.5));
});

test("normalizeCurrency defaults missing / malformed input", () => {
  assert.deepEqual(normalizeCurrency(undefined), { balance: 0, totalEarned: 0 });
  assert.deepEqual(normalizeCurrency(null), { balance: 0, totalEarned: 0 });
  assert.deepEqual(normalizeCurrency("garbage"), { balance: 0, totalEarned: 0 });
  assert.deepEqual(normalizeCurrency({ balance: -5, totalEarned: "xyz" }), {
    balance: 0,
    totalEarned: 0,
  });
  assert.deepEqual(normalizeCurrency({ balance: 12.8, totalEarned: 99 }), {
    balance: 12,
    totalEarned: 99,
  });
});

// formatCoins fixture table — must match the boundary spec in quickstart.md
const FORMAT_COINS_FIXTURES = [
  [0, "0"],
  [1, "1"],
  [9999, "9999"],
  [10_000, "10.0K"],
  [10_499, "10.4K"],
  [12_345, "12.3K"],
  [99_999, "99.9K"],
  [100_000, "100.0K"],
  [500_000, "500.0K"],
  [999_999, "999.9K"],
  [1_000_000, "1.0M"],
  [1_200_000, "1.2M"],
  [12_345_678, "12.3M"],
  [999_999_999, "999.9M"],
  [1_000_000_000, "1.0B"],
  [3_200_000_000, "3.2B"],
  [9_999_999_999, "9.9B"],
];

for (const [input, expected] of FORMAT_COINS_FIXTURES) {
  test(`formatCoins(${input}) === "${expected}"`, () => {
    assert.equal(formatCoins(input), expected);
  });
}

test("formatCoins defends against negative / NaN / string input", () => {
  assert.equal(formatCoins(-100), "0");
  assert.equal(formatCoins(NaN), "0");
  assert.equal(formatCoins("abc"), "0");
  assert.equal(formatCoins(null), "0");
  assert.equal(formatCoins(undefined), "0");
});

module.exports = { FORMAT_COINS_FIXTURES };
