const {
  getSessionFromRequest,
  handleCors,
  isAdminSession,
  isLikelyEvmAddress,
  json,
  normalizeEvmAddress,
  parseJsonBody,
} = require("../../api/_lib/auth");
const { creditCurrency, debitCurrency, normalizeCurrency } = require("../../api/_lib/currency");
const { getWalletProfile, updateWalletProfile } = require("../../api/_lib/store");

// Ручная правка баланса Points: компенсации, подарки, откаты. Только админ,
// только целое число, обязательная причина — она уходит в лог вместе с тем,
// кто и кому. Списание не уводит баланс в минус.
//
// POST /api/admin/adjust-balance  { wallet, amount, reason }
//   amount > 0 — начислить, amount < 0 — списать.

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
  if (!isAdminSession(session)) {
    json(res, 403, { error: "Forbidden." });
    return;
  }

  let body;
  try {
    body = await parseJsonBody(req);
  } catch (error) {
    json(res, 400, { error: "Invalid JSON body." });
    return;
  }

  const rawWallet = String(body?.wallet || "").trim();
  if (!isLikelyEvmAddress(rawWallet)) {
    json(res, 400, { error: "wallet must be a 0x address." });
    return;
  }
  const wallet = normalizeEvmAddress(rawWallet);

  const amount = Number(body?.amount);
  if (!Number.isInteger(amount) || amount === 0) {
    json(res, 400, { error: "amount must be a non-zero integer." });
    return;
  }

  const reason = String(body?.reason || "").trim();
  if (reason.length < 3) {
    json(res, 400, { error: "A reason (min 3 chars) is required." });
    return;
  }

  try {
    const before = normalizeCurrency((await getWalletProfile(wallet)).currency).balance;
    let debited = null;
    await updateWalletProfile(wallet, (profile) => {
      if (amount > 0) creditCurrency(profile, amount);
      else debited = debitCurrency(profile, -amount);
      return profile;
    });
    const after = normalizeCurrency((await getWalletProfile(wallet)).currency).balance;

    console.log(
      `[admin:adjust-balance] ${session.wallet} → ${wallet}: ${amount > 0 ? "+" : ""}${amount} (${before} → ${after}) — ${reason}`
    );
    json(res, 200, { wallet, amount, before, after, ...(debited !== null ? { debited } : {}) });
  } catch (error) {
    console.error("[admin:adjust-balance]", error);
    json(res, 500, { error: "Balance adjustment failed." });
  }
};
