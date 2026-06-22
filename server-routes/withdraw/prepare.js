const crypto = require("crypto");
const {
  getSessionFromRequest,
  handleCors,
  json,
  parseJsonBody,
} = require("../../api/_lib/auth");
const { getEconomyConfig } = require("../../api/_lib/economy-config");
const { getWalletProfile, updateWalletProfile } = require("../../api/_lib/store");
const { normalizeCurrency } = require("../../api/_lib/currency");
const { reserveWithdrawal, reconcileExpired } = require("../../api/_lib/withdrawal-store");
const withdraw = require("../../api/_lib/withdraw");

function fail(status, message, code) {
  const error = new Error(message);
  error.httpStatus = status;
  if (code) error.httpCode = code;
  return error;
}

// POST /api/withdraw/prepare { amount } → списывает Points (reserve) и возвращает
// co-sign транзакцию (base64, уже подписана treasury) для подписи в кошельке игрока.
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
    const cfg = await getEconomyConfig();
    if (!cfg.WITHDRAW_ENABLED) {
      throw fail(403, "Withdrawals are currently disabled.", "WITHDRAW_DISABLED");
    }
    if (!withdraw.isConfigured()) {
      throw fail(503, "Withdrawals are not configured on the server.", "WITHDRAW_NOT_CONFIGURED");
    }

    const body = await parseJsonBody(req);
    const amount = Math.floor(Number(body.amount));
    const min = Math.max(0, Math.floor(Number(cfg.MIN_WITHDRAW) || 0));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw fail(400, "amount must be a positive integer.", "BAD_REQUEST");
    }
    if (amount < min) {
      throw fail(400, `Minimum withdrawal is ${min}.`, "BELOW_MIN");
    }

    const feePct = Math.max(0, Number(cfg.WITHDRAW_FEE_PCT) || 0);
    const petixSent = Math.floor(amount * (1 - feePct / 100));
    if (petixSent <= 0) {
      throw fail(400, "Resulting payout is zero.", "BAD_REQUEST");
    }

    // Fast-fail по балансу (авторитетная проверка — в мутаторе ниже).
    const snapshot = await getWalletProfile(session.wallet);
    if (normalizeCurrency(snapshot.currency).balance < amount) {
      throw fail(400, "Insufficient balance.", "INSUFFICIENT_BALANCE");
    }

    // Собираем транзакцию (сеть): blockhash, проверка платёжеспособности treasury, ATA.
    let built;
    try {
      built = await withdraw.buildWithdrawTransaction({
        playerWallet: session.wallet,
        points: petixSent,
      });
    } catch (error) {
      if (error.code === "INSUFFICIENT_TREASURY") {
        throw fail(503, "Withdrawal pool is temporarily empty. Try again later.", "INSUFFICIENT_TREASURY");
      }
      throw error;
    }

    // Текущая высота блока — для реконсиляции просроченных prepared-заявок.
    let currentBlockHeight = 0;
    try {
      currentBlockHeight = await withdraw.getConnection().getBlockHeight("confirmed");
    } catch {
      currentBlockHeight = 0; // реконсиляцию пропустим, это не критично
    }

    const recordId = crypto.randomUUID();
    const now = Date.now();
    await updateWalletProfile(session.wallet, (current) => {
      if (currentBlockHeight > 0) reconcileExpired(current, currentBlockHeight, now);
      reserveWithdrawal(current, {
        id: recordId,
        points: amount,
        feePct,
        mint: withdraw.getConfig().mint,
        blockhash: built.blockhash,
        lastValidBlockHeight: built.lastValidBlockHeight,
        now,
      });
      return current;
    });

    json(res, 200, {
      recordId,
      txBase64: built.txBase64,
      blockhash: built.blockhash,
      lastValidBlockHeight: built.lastValidBlockHeight,
      amount,
      petixSent,
      createsRecipientAta: built.createsRecipientAta,
      tokenSymbol: withdraw.getConfig().tokenSymbol,
    });
  } catch (error) {
    if (error.httpStatus) {
      json(res, error.httpStatus, { error: error.message, code: error.httpCode });
      return;
    }
    if (error.code === "INSUFFICIENT_BALANCE") {
      json(res, 400, { error: "Insufficient balance.", code: "INSUFFICIENT_BALANCE" });
      return;
    }
    json(res, 400, { error: error.message || "Bad request." });
  }
};
