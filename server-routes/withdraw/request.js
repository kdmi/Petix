const crypto = require("crypto");
const {
  getSessionFromRequest,
  handleCors,
  isAdminWallet,
  json,
  parseJsonBody,
} = require("../../api/_lib/auth");
const { getEconomyConfig } = require("../../api/_lib/economy-config");
const { getWalletProfile, updateWalletProfile } = require("../../api/_lib/store");
const { normalizeCurrency } = require("../../api/_lib/currency");
const {
  reserveWithdrawal,
  refundWithdrawal,
  attachSignature,
  markConfirmed,
  reconcileExpired,
  findWithdrawal,
} = require("../../api/_lib/withdrawal-store");
const withdraw = require("../../api/_lib/withdraw");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fail(status, message, code) {
  const error = new Error(message);
  error.httpStatus = status;
  if (code) error.httpCode = code;
  return error;
}

// POST /api/withdraw/request { amount }
// Custodial-вывод: списываем Points (reserve) и САМИ отправляем токены с казначея.
// Игрок ничего не подписывает. При сбое отправки/подтверждения Points возвращаются.
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

  let recordId = "";
  try {
    const cfg = await getEconomyConfig();
    if (!withdraw.isConfigured()) {
      throw fail(503, "Withdrawals are not configured on the server.", "WITHDRAW_NOT_CONFIGURED");
    }
    // WITHDRAW_ENABLED=0 → только админ; =1 → все.
    const publicOpen = Boolean(cfg.WITHDRAW_ENABLED);
    if (!publicOpen && !isAdminWallet(session.wallet)) {
      throw fail(403, "Withdrawals are in admin-only mode right now.", "WITHDRAW_ADMIN_ONLY");
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

    // Fast-fail по балансу (авторитетная проверка — в мутаторе резерва).
    const snapshot = await getWalletProfile(session.wallet);
    if (normalizeCurrency(snapshot.currency).balance < amount) {
      throw fail(400, "Insufficient balance.", "INSUFFICIENT_BALANCE");
    }

    // Текущая высота блока — для ленивой реконсиляции зависших prepared-заявок.
    let currentBlockHeight = 0;
    try {
      currentBlockHeight = await withdraw.getConnection().getBlockHeight("confirmed");
    } catch {
      currentBlockHeight = 0;
    }

    // 1) Резерв Points (атомарно, анти-double-spend).
    recordId = crypto.randomUUID();
    const reservedAt = Date.now();
    await updateWalletProfile(session.wallet, (current) => {
      if (currentBlockHeight > 0) reconcileExpired(current, currentBlockHeight, reservedAt);
      reserveWithdrawal(current, {
        id: recordId,
        points: amount,
        feePct,
        mint: withdraw.getConfig().mint,
        blockhash: "",
        lastValidBlockHeight: 0,
        now: reservedAt,
      });
      return current;
    });

    // 2) Отправка с казначея (мы fee payer, подписываем и шлём).
    let sent;
    try {
      sent = await withdraw.sendWithdrawFromTreasury({ playerWallet: session.wallet, points: petixSent });
    } catch (sendError) {
      const now = Date.now();
      await updateWalletProfile(session.wallet, (current) => {
        refundWithdrawal(current, recordId, { status: "failed", now });
        return current;
      });
      if (sendError.code === "INSUFFICIENT_TREASURY") {
        throw fail(503, "Withdrawal pool is temporarily empty. Try again later.", "INSUFFICIENT_TREASURY");
      }
      throw fail(502, "Failed to submit the payout. Your Points were refunded.", "SEND_FAILED");
    }

    // 3) Сохраняем сигнатуру/blockhash (защита от авто-возврата реконсилятором).
    const signature = sent.signature;
    await updateWalletProfile(session.wallet, (current) => {
      const record = findWithdrawal(current, recordId);
      if (record) {
        record.blockhash = sent.blockhash;
        record.lastValidBlockHeight = sent.lastValidBlockHeight;
      }
      attachSignature(current, recordId, signature, Date.now());
      return current;
    });

    // 4) Короткий поллинг подтверждения.
    let outcome = { confirmed: false, status: "unknown" };
    for (let attempt = 0; attempt < 4; attempt += 1) {
      outcome = await withdraw.confirmWithdrawTransaction(signature);
      if (outcome.confirmed || outcome.status === "failed") break;
      await sleep(2000);
    }

    if (outcome.status === "failed") {
      const now = Date.now();
      await updateWalletProfile(session.wallet, (current) => {
        refundWithdrawal(current, recordId, { status: "failed", now });
        return current;
      });
      throw fail(400, "Transaction failed on-chain. Your Points were refunded.", "TX_FAILED");
    }

    // confirmed либо ещё pending (токены уже отправлены) → финализируем запись.
    const now = Date.now();
    const profile = await updateWalletProfile(session.wallet, (current) => {
      if (outcome.confirmed) markConfirmed(current, recordId, { signature, now });
      return current;
    });

    json(res, 200, {
      status: outcome.confirmed ? "confirmed" : "pending",
      signature,
      amount,
      petixSent,
      balance: profile.currency.balance,
      tokenSymbol: withdraw.getConfig().tokenSymbol,
    });
  } catch (error) {
    if (error.httpStatus) {
      json(res, error.httpStatus, { error: error.message, code: error.httpCode });
      return;
    }
    json(res, 400, { error: error.message || "Bad request." });
  }
};
