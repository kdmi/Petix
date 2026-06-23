"use strict";

// Чистые помощники для заявок на вывод. Хранятся в профиле кошелька
// (`profile.withdrawals`), поэтому списание/возврат Points и запись заявки происходят
// АТОМАРНО в одном `updateWalletProfile`-мутаторе (анти-double-spend). Сетевых вызовов тут нет.

const { normalizeCurrency } = require("./currency");

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

// Резервирует вывод: проверяет баланс, СПИСЫВАЕТ Points (totalEarned не трогаем),
// создаёт запись status="prepared". Бросает {code:"INSUFFICIENT_BALANCE"} при нехватке.
function reserveWithdrawal(profile, { id, points, feePct, mint, blockhash, lastValidBlockHeight, now }) {
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
    points: debit,
    feePct: fee,
    petixSent,
    status: "prepared",
    signature: "",
    mint: mint || "",
    blockhash: blockhash || "",
    lastValidBlockHeight: Number(lastValidBlockHeight) || 0,
    createdAt: ts,
    updatedAt: ts,
  };
  ensureWithdrawals(profile).push(record);
  return record;
}

// Возврат Points по prepared-заявке (отмена/сбой/истечение). Идемпотентно: на не-prepared — no-op.
function refundWithdrawal(profile, id, { status = "canceled", now } = {}) {
  const record = findWithdrawal(profile, id);
  if (!record || record.status !== "prepared") return null;
  const current = normalizeCurrency(profile.currency);
  setBalance(profile, current.balance + Math.max(0, Math.floor(Number(record.points) || 0)));
  record.status = status;
  record.updatedAt = new Date(now).toISOString();
  return record;
}

// Привязывает сигнатуру к prepared-заявке (tx отправлена, ждём подтверждения). Это защищает
// заявку от авто-возврата реконсилятором (он трогает только заявки без сигнатуры).
function attachSignature(profile, id, signature, now) {
  const record = findWithdrawal(profile, id);
  if (!record || record.status !== "prepared") return null;
  record.signature = signature || record.signature;
  record.updatedAt = new Date(now).toISOString();
  return record;
}

// Помечает заявку подтверждённой (Points уже списаны на reserve, не возвращаем).
function markConfirmed(profile, id, { signature, now }) {
  const record = findWithdrawal(profile, id);
  if (!record) return null;
  if (record.status === "confirmed") return record; // идемпотентно
  record.status = "confirmed";
  record.signature = signature || record.signature;
  record.updatedAt = new Date(now).toISOString();
  return record;
}

// Ленивая реконсиляция: возвращает Points по prepared-заявкам без сигнатуры, чей blockhash
// уже истёк (currentBlockHeight > lastValidBlockHeight) — такая tx не подтвердится никогда.
function reconcileExpired(profile, currentBlockHeight, now) {
  let refunded = 0;
  for (const record of ensureWithdrawals(profile)) {
    if (
      record.status === "prepared" &&
      !record.signature &&
      Number(record.lastValidBlockHeight) > 0 &&
      Number(currentBlockHeight) > Number(record.lastValidBlockHeight)
    ) {
      refundWithdrawal(profile, record.id, { status: "expired", now });
      refunded += 1;
    }
  }
  return refunded;
}

module.exports = {
  ensureWithdrawals,
  findWithdrawal,
  reserveWithdrawal,
  refundWithdrawal,
  attachSignature,
  markConfirmed,
  reconcileExpired,
};
