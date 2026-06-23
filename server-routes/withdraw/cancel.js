const {
  getSessionFromRequest,
  handleCors,
  json,
  parseJsonBody,
} = require("../../api/_lib/auth");
const { getWalletProfile, updateWalletProfile } = require("../../api/_lib/store");
const { findWithdrawal, refundWithdrawal } = require("../../api/_lib/withdrawal-store");

// POST /api/withdraw/cancel { recordId } — игрок отклонил подпись / ошибка кошелька.
// Возвращает зарезервированные Points, если заявка ещё в статусе prepared.
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
    if (!recordId) {
      json(res, 400, { error: "recordId is required." });
      return;
    }

    const snapshot = await getWalletProfile(session.wallet);
    const existing = findWithdrawal(snapshot, recordId);
    if (!existing) {
      json(res, 404, { error: "Withdrawal not found." });
      return;
    }
    // Не отменяем заявку, по которой уже отправлена транзакция (есть сигнатура).
    if (existing.status !== "prepared") {
      json(res, 200, { status: existing.status, refunded: false });
      return;
    }
    if (existing.signature) {
      json(res, 409, { error: "Transaction already submitted; cannot cancel.", code: "ALREADY_SUBMITTED" });
      return;
    }

    const now = Date.now();
    const profile = await updateWalletProfile(session.wallet, (current) => {
      refundWithdrawal(current, recordId, { status: "canceled", now });
      return current;
    });

    json(res, 200, { status: "canceled", refunded: true, balance: profile.currency.balance });
  } catch (error) {
    json(res, 400, { error: error.message || "Bad request." });
  }
};
