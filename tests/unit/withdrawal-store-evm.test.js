const test = require("node:test");
const assert = require("node:assert/strict");

const {
  attachTx,
  confirmWithdrawal,
  dropWithdrawal,
  failWithdrawal,
  findWithdrawal,
  listUnsettled,
  reserveWithdrawal,
} = require("../../api/_lib/withdrawal-store");

const NOW = Date.parse("2026-09-12T12:00:00.000Z");
const RAW_500 = (500n * 10n ** 18n).toString();

function makeProfile(balance = 1000) {
  return { currency: { balance, totalEarned: 5000 }, withdrawals: [] };
}

function reserve(profile, overrides = {}) {
  return reserveWithdrawal(profile, {
    id: "w-1",
    points: 500,
    feePct: 0,
    amountRaw: RAW_500,
    now: NOW,
    ...overrides,
  });
}

test("reserveWithdrawal debits Points, keeps totalEarned and writes EVM fields", () => {
  const profile = makeProfile();
  const record = reserve(profile);

  assert.equal(profile.currency.balance, 500);
  assert.equal(profile.currency.totalEarned, 5000);
  assert.equal(record.status, "reserved");
  assert.equal(record.chain, "evm");
  assert.equal(record.points, 500);
  assert.equal(record.petixSent, 500);
  assert.equal(record.amountRaw, RAW_500);
  assert.equal(record.txHash, "");
  assert.equal(record.nonce, null);
  assert.equal(record.createdAt, new Date(NOW).toISOString());
  assert.equal(findWithdrawal(profile, "w-1"), record);
  // Solana-era fields must not be created any more.
  assert.equal("blockhash" in record, false);
  assert.equal("lastValidBlockHeight" in record, false);
});

test("reserveWithdrawal applies the fee to petixSent, not to the debit", () => {
  const profile = makeProfile();
  const record = reserve(profile, { feePct: 10 });
  assert.equal(profile.currency.balance, 500);
  assert.equal(record.petixSent, 450);
});

test("reserveWithdrawal refuses when the balance is short or amount is zero", () => {
  const profile = makeProfile(100);
  assert.throws(() => reserve(profile), { code: "INSUFFICIENT_BALANCE" });
  assert.throws(() => reserve(profile, { points: 0 }), { code: "BAD_REQUEST" });
  assert.equal(profile.currency.balance, 100);
  assert.equal(profile.withdrawals.length, 0);
});

test("attachTx moves reserved → sent and records txHash/nonce/treasury", () => {
  const profile = makeProfile();
  reserve(profile);
  const record = attachTx(profile, "w-1", {
    txHash: "0xabc",
    nonce: 7,
    treasury: "0x" + "f".repeat(40),
    now: NOW + 1000,
  });
  assert.equal(record.status, "sent");
  assert.equal(record.txHash, "0xabc");
  assert.equal(record.nonce, 7);
  assert.equal(record.treasury, "0x" + "f".repeat(40));
  assert.equal(record.updatedAt, new Date(NOW + 1000).toISOString());
  // attaching again to a non-reserved record is a no-op
  assert.equal(attachTx(profile, "w-1", { txHash: "0xdef", nonce: 8, now: NOW }), null);
  assert.equal(record.txHash, "0xabc");
});

test("confirmWithdrawal is idempotent and never refunds", () => {
  const profile = makeProfile();
  reserve(profile);
  attachTx(profile, "w-1", { txHash: "0xabc", nonce: 7, now: NOW });

  const first = confirmWithdrawal(profile, "w-1", { txHash: "0xabc", now: NOW + 5000 });
  assert.equal(first.status, "confirmed");
  assert.equal(profile.currency.balance, 500);

  const second = confirmWithdrawal(profile, "w-1", { txHash: "0xabc", now: NOW + 9000 });
  assert.equal(second.status, "confirmed");
  assert.equal(second.updatedAt, first.updatedAt);
  assert.equal(profile.currency.balance, 500);
});

test("failWithdrawal refunds exactly once, from reserved or sent only", () => {
  const profile = makeProfile();
  reserve(profile);
  assert.equal(profile.currency.balance, 500);

  const failed = failWithdrawal(profile, "w-1", { now: NOW, reason: "SEND_FAILED" });
  assert.equal(failed.status, "failed");
  assert.equal(failed.reason, "SEND_FAILED");
  assert.equal(profile.currency.balance, 1000);

  // second call: no-op, no double refund
  assert.equal(failWithdrawal(profile, "w-1", { now: NOW }), null);
  assert.equal(profile.currency.balance, 1000);

  // a confirmed record can never be refunded
  const other = makeProfile();
  reserve(other, { id: "w-2" });
  attachTx(other, "w-2", { txHash: "0x1", nonce: 1, now: NOW });
  confirmWithdrawal(other, "w-2", { now: NOW });
  assert.equal(failWithdrawal(other, "w-2", { now: NOW }), null);
  assert.equal(dropWithdrawal(other, "w-2", { now: NOW }), null);
  assert.equal(other.currency.balance, 500);
});

test("dropWithdrawal refunds a sent record that the network displaced", () => {
  const profile = makeProfile();
  reserve(profile);
  attachTx(profile, "w-1", { txHash: "0xabc", nonce: 7, now: NOW });
  const dropped = dropWithdrawal(profile, "w-1", { now: NOW + 200000 });
  assert.equal(dropped.status, "dropped");
  assert.equal(profile.currency.balance, 1000);
  assert.equal(dropWithdrawal(profile, "w-1", { now: NOW }), null);
});

test("listUnsettled returns reserved and sent records only", () => {
  const profile = makeProfile(5000);
  reserve(profile, { id: "a" });
  reserve(profile, { id: "b" });
  attachTx(profile, "b", { txHash: "0xb", nonce: 1, now: NOW });
  reserve(profile, { id: "c" });
  attachTx(profile, "c", { txHash: "0xc", nonce: 2, now: NOW });
  confirmWithdrawal(profile, "c", { now: NOW });
  reserve(profile, { id: "d" });
  failWithdrawal(profile, "d", { now: NOW });

  assert.deepEqual(
    listUnsettled(profile).map((record) => record.id),
    ["a", "b"]
  );
});

test("legacy Solana records are tolerated and left untouched", () => {
  const profile = {
    currency: { balance: 100, totalEarned: 100 },
    withdrawals: [
      {
        id: "legacy",
        points: 200,
        feePct: 0,
        petixSent: 200,
        status: "prepared",
        signature: "sig",
        mint: "MintAddr",
        blockhash: "bh",
        lastValidBlockHeight: 123,
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
      },
    ],
  };
  assert.equal(listUnsettled(profile).length, 0);
  assert.equal(failWithdrawal(profile, "legacy", { now: NOW }), null);
  assert.equal(dropWithdrawal(profile, "legacy", { now: NOW }), null);
  assert.equal(profile.withdrawals[0].status, "prepared");
  assert.equal(profile.currency.balance, 100);

  const record = reserve(profile, { points: 50, amountRaw: (50n * 10n ** 18n).toString() });
  assert.equal(record.status, "reserved");
  assert.equal(profile.withdrawals.length, 2);
});
