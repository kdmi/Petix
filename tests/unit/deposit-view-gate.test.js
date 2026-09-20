const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

// Production bug 2026-09-20: the Deposit screen refused to open for anyone who
// could not WITHDRAW. A player who had just bought a capsule (36-hour hold not
// served yet) saw the Deposit button, clicked it and nothing happened — and the
// deposit address and the "paste your tx hash" field live only on that screen,
// so there was no way in at all. Depositing has nothing to do with the
// withdrawal gate: the server sends `deposit.address` exactly to the wallets
// whose deposits are open, and confirmDeposit never checks the capsule rule.

const APP_JS = path.resolve(__dirname, "../../pet-creation/app.js");

function loadOpenDepositView() {
  const source = fs.readFileSync(APP_JS, "utf8");
  const match = source.match(/function openDepositView\(\) \{[\s\S]*?\n\}/);
  if (!match) {
    throw new Error("openDepositView() not found in pet-creation/app.js");
  }

  const calls = { stopped: 0, shown: 0 };
  const withdrawState = {
    enabled: false, // withdrawal blocked for this wallet
    // Fixture address shape the repo allows: one hex char repeated (019, FR-016).
    depositAddress: `0x${"a".repeat(40)}`,
    view: "form",
    depositError: "stale",
    depositMessage: "stale",
    depositTxHash: "0xstale",
  };

  const factory = new Function(
    "withdrawState",
    "stopWithdrawPolling",
    "showWithdrawView",
    `${match[0]}\nreturn openDepositView;`
  );
  const openDepositView = factory(
    withdrawState,
    () => {
      calls.stopped += 1;
    },
    () => {
      calls.shown += 1;
    }
  );

  return { openDepositView, withdrawState, calls };
}

test("the deposit screen opens for a wallet that is not allowed to withdraw", () => {
  const { openDepositView, withdrawState, calls } = loadOpenDepositView();

  openDepositView();

  assert.equal(withdrawState.view, "deposit", "withdrawal rights must not gate deposits");
  assert.equal(calls.shown, 1, "the view must actually be rendered");
  assert.equal(calls.stopped, 1, "withdrawal polling must stop while depositing");
  assert.equal(withdrawState.depositError, "");
  assert.equal(withdrawState.depositMessage, "");
  assert.equal(withdrawState.depositTxHash, "");
});

test("the deposit screen stays closed when the server sent no deposit address", () => {
  const { openDepositView, withdrawState, calls } = loadOpenDepositView();
  withdrawState.depositAddress = "";

  openDepositView();

  assert.equal(withdrawState.view, "form", "without an address there is nothing to show");
  assert.equal(calls.shown, 0);
});

test("the Points chip and the modal let a deposit-only wallet in", () => {
  const source = fs.readFileSync(APP_JS, "utf8");

  // The chip is the only entry point to the money modal; if it is not
  // clickable, openDepositView() is unreachable no matter what it allows.
  const chipGate = source.match(/const withdrawable =[\s\S]*?;\n/);
  assert.ok(chipGate, "points chip gate not found");
  assert.match(
    chipGate[0],
    /canDepositHere/,
    "the balance must be clickable for a wallet that can only deposit"
  );

  const modalGate = source.match(/function openWithdrawModal\(\) \{[\s\S]*?ensureWithdrawModal\(\);/);
  assert.ok(modalGate, "openWithdrawModal guard not found");
  assert.match(
    modalGate[0],
    /state\.depositAvailable/,
    "the modal must open for a wallet that can only deposit"
  );
});
