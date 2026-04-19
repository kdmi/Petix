const test = require("node:test");
const assert = require("node:assert/strict");

const {
  filterAdminCharacters,
  getAdminWalletPivotState,
} = require("../../pet-creation/admin-panel-state");

test("getAdminWalletPivotState normalizes the clicked wallet and resets pagination", () => {
  assert.deepEqual(
    getAdminWalletPivotState("  AwtqC9r5Wgvjfhqw5DrtzC5W73QRVF14DZVop8caECi9  "),
    {
      query: "AwtqC9r5Wgvjfhqw5DrtzC5W73QRVF14DZVop8caECi9",
      page: 1,
    }
  );
});

test("filterAdminCharacters keeps only same-wallet pets after a wallet pivot", () => {
  const wallet = "H8GaxxEx2UfCDGxhXUUwHPzAtV2qWgpHnmH2PYxT2uKA";
  const otherWallet = "AwtqC9r5Wgvjfhqw5DrtzC5W73QRVF14DZVop8caECi9";
  const records = [
    { id: "char_a", creatorWallet: wallet },
    { id: "char_b", creatorWallet: wallet },
    { id: "char_c", creatorWallet: otherWallet },
  ];

  assert.deepEqual(
    filterAdminCharacters(records, wallet).map((record) => record.id),
    ["char_a", "char_b"]
  );
});
