"use strict";

// Чистые помощники для заявок на вывод $PETIX (feature 019, custodial на EVM).
// Хранятся в профиле кошелька (`profile.withdrawals`), поэтому списание/возврат
// Points и смена статуса заявки происходят АТОМАРНО в одном мутаторе
// `updateWalletProfile` (анти-double-spend). Сетевых вызовов тут нет.
//
// Жизненный цикл: reserved → sent → confirmed | failed | dropped.
//   reserved  — Points списаны, транзакция ещё не отправлена
//   sent      — раздатчик отправил transfer (txHash/nonce известны)
//   confirmed — receipt.status == 1; Points остаются списанными
//   failed    — отправка упала или receipt.status == 0 → Points возвращены
//   dropped   — сеть вытеснила транзакцию (nonce прошёл без receipt) → возвращены
// Старые Solana-записи (status prepared/…, поля blockhash/mint) читаются как
// есть и никакими функциями ниже не трогаются.

const { normalizeCurrency } = require("./currency");

const REFUNDABLE = new Set(["reserved", "sent"]);

function ensureWithdrawals(profile) {
  if (!Array.isArray(profile.withdrawals)) profile.withdrawals = [];
  return profile.withdrawals;
}

function findWithdrawal(profile, id) {
  return ensureWithdrawals(profile).find((record) => record.id === id) || null;
}

function setBalance(profile, balance) {
  const current = normalizeCurrency(profile.currency);
  profile.currency = { balance, totalEarned: current.totalEarned };
}

function stamp(record, now) {
  record.updatedAt = new Date(now).toISOString();
  return record;
}

function isEvmRecord(record) {
  return record && record.chain === "evm";
}

// Резервирует вывод: проверяет баланс, СПИСЫВАЕТ Points (totalEarned не трогаем),
// создаёт запись status="reserved". Бросает {code:"INSUFFICIENT_BALANCE"} при нехватке.
function reserveWithdrawal(profile, { id, points, feePct, amountRaw, now, mode = "custodial" }) {
  const current = normalizeCurrency(profile.currency);
  const debit = Math.max(0, Math.floor(Number(points) || 0));
  if (debit <= 0) {
    const e = new Error("points must be > 0");
    e.code = "BAD_REQUEST";
    throw e;
  }
  if (debit > current.balance) {
    const e = new Error("Insufficient balance");
    e.code = "INSUFFICIENT_BALANCE";
    throw e;
  }
  const fee = Math.max(0, Number(feePct) || 0);
  const petixSent = Math.floor(debit * (1 - fee / 100));
  setBalance(profile, current.balance - debit);
  const ts = new Date(now).toISOString();
  const record = {
    id,
    chain: "evm",
    mode,
    points: debit,
    feePct: fee,
    petixSent,
    amountRaw: amountRaw != null ? String(amountRaw) : "",
    status: "reserved",
    txHash: "",
    nonce: null,
    treasury: "",
    reason: "",
    createdAt: ts,
    updatedAt: ts,
  };
  ensureWithdrawals(profile).push(record);
  return record;
}

// Транзакция отправлена: reserved → sent. Хранит txHash/nonce/treasury для
// последующей реконсиляции. На не-reserved записи — no-op (null).
function attachTx(profile, id, { txHash, nonce, treasury = "", now }) {
  const record = findWithdrawal(profile, id);
  if (!isEvmRecord(record) || record.status !== "reserved") return null;
  record.status = "sent";
  record.txHash = String(txHash || "");
  record.nonce = Number.isFinite(Number(nonce)) ? Number(nonce) : null;
  record.treasury = String(treasury || "").toLowerCase();
  return stamp(record, now);
}

// Подтверждено сетью (receipt.status == 1). Идемпотентно; Points не возвращаем.
function confirmWithdrawal(profile, id, { txHash, now } = {}) {
  const record = findWithdrawal(profile, id);
  if (!isEvmRecord(record)) return null;
  if (record.status === "confirmed") return record;
  if (!REFUNDABLE.has(record.status)) return null;
  record.status = "confirmed";
  if (txHash) record.txHash = String(txHash);
  return stamp(record, now);
}

function refund(profile, record, status, { now, reason = "" }) {
  const current = normalizeCurrency(profile.currency);
  setBalance(profile, current.balance + Math.max(0, Math.floor(Number(record.points) || 0)));
  record.status = status;
  record.reason = String(reason || "");
  return stamp(record, now);
}

// Отправка упала или receipt.status == 0 → возврат Points. Только из reserved/sent,
// ровно один раз (повтор — no-op).
function failWithdrawal(profile, id, { now, reason = "" } = {}) {
  const record = findWithdrawal(profile, id);
  if (!isEvmRecord(record) || !REFUNDABLE.has(record.status)) return null;
  return refund(profile, record, "failed", { now, reason });
}

// Сеть вытеснила транзакцию (nonce раздатчика ушёл дальше, receipt нет) → возврат.
function dropWithdrawal(profile, id, { now, reason = "" } = {}) {
  const record = findWithdrawal(profile, id);
  if (!isEvmRecord(record) || !REFUNDABLE.has(record.status)) return null;
  return refund(profile, record, "dropped", { now, reason });
}

// Заявки, которые ещё требуют реконсиляции по данным сети.
function listUnsettled(profile) {
  return ensureWithdrawals(profile).filter(
    (record) => isEvmRecord(record) && REFUNDABLE.has(record.status)
  );
}

module.exports = {
  ensureWithdrawals,
  findWithdrawal,
  reserveWithdrawal,
  attachTx,
  confirmWithdrawal,
  failWithdrawal,
  dropWithdrawal,
  listUnsettled,
};
