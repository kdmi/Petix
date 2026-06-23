const {
  getSessionFromRequest,
  handleCors,
  json,
  parseJsonBody,
} = require("../../api/_lib/auth");
const { getWalletProfile, updateWalletProfile } = require("../../api/_lib/store");
const {
  findWithdrawal,
  attachSignature,
  markConfirmed,
  refundWithdrawal,
} = require("../../api/_lib/withdrawal-store");
const withdraw = require("../../api/_lib/withdraw");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// POST /api/withdraw/confirm { recordId, signature }
// Игрок уже отправил tx своим кошельком; проверяем статус и финализируем заявку.
module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed." });
    return;
  }
  const session = getSessionFromRequest(req);
  if (!session) {
    json(res, 401, { error: "Unauthorized." });
    return;
  }

  try {
    const body = await parseJsonBody(req);
    const recordId = String(body.recordId || "").trim();
    const signature = String(body.signature || "").trim();
    if (!recordId || !signature) {
      json(res, 400, { error: "recordId and signature are required." });
      return;
    }

    const snapshot = await getWalletProfile(session.wallet);
    const existing = findWithdrawal(snapshot, recordId);
    if (!existing) {
      json(res, 404, { error: "Withdrawal not found." });
      return;
    }
    if (existing.status === "confirmed") {
      json(res, 200, { status: "confirmed", signature: existing.signature });
      return;
    }
    if (existing.status !== "prepared") {
      json(res, 409, { error: `Withdrawal already ${existing.status}.`, code: "BAD_STATE" });
      return;
    }

    // Защищаем заявку от авто-возврата реконсилятором, пока tx подтверждается.
    const now0 = Date.now();
    await updateWalletProfile(session.wallet, (current) => {
      attachSignature(current, recordId, signature, now0);
      return current;
    });

    // Короткий поллинг подтверждения (tx обычно подтверждается за пару секунд).
    let outcome = { confirmed: false, status: "unknown" };
    for (let attempt = 0; attempt < 4; attempt += 1) {
      outcome = await withdraw.confirmWithdrawTransaction(signature);
      if (outcome.confirmed || outcome.status === "failed") break;
      await sleep(2000);
    }

    const now = Date.now();
    if (outcome.confirmed) {
      await updateWalletProfile(session.wallet, (current) => {
        markConfirmed(current, recordId, { signature, now });
        return current;
      });
      json(res, 200, { status: "confirmed", signature });
      return;
    }

    if (outcome.status === "failed") {
      await updateWalletProfile(session.wallet, (current) => {
        refundWithdrawal(current, recordId, { status: "failed", now });
        return current;
      });
      json(res, 400, { error: "Transaction failed on-chain. Points refunded.", code: "TX_FAILED" });
      return;
    }

    // Ещё не подтверждено, но tx отправлена (сигнатура сохранена). Токены в пути —
    // реконсилятор её не тронет; статус финализируется при следующем confirm.
    json(res, 202, { status: "pending", signature });
  } catch (error) {
    json(res, 400, { error: error.message || "Bad request." });
  }
};
