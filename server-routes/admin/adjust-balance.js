const {
  getSessionFromRequest,
  handleCors,
  isAdminSession,
  isLikelyEvmAddress,
  json,
  normalizeEvmAddress,
  parseJsonBody,
} = require("../../api/_lib/auth");
const { adjustCurrency, normalizeCurrency } = require("../../api/_lib/currency");
const { getWalletProfile, updateWalletProfile } = require("../../api/_lib/store");

// Ручная правка Points: компенсации, подарки, откаты. Только админ, обязательная
// причина — она уходит в лог вместе с тем, кто и кому.
//
// POST /api/admin/adjust-balance  { wallet, reason, amount?, earnedDelta? }
//   amount      — дельта баланса (± целое). НЕ считается заработком: подарок —
//                 не эмиссия, в «Top earners» и «Total emitted» не попадает.
//   earnedDelta — коррекция totalEarned (± целое), баланс не трогает. Нужна,
//                 чтобы поправить статистику, если заработок был искажён.
//   Хотя бы одно из двух. Списание не уводит баланс в минус.

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

  const amount = body?.amount === undefined ? 0 : Number(body.amount);
  const earnedDelta = body?.earnedDelta === undefined ? 0 : Number(body.earnedDelta);
  if (!Number.isInteger(amount) || !Number.isInteger(earnedDelta)) {
    json(res, 400, { error: "amount and earnedDelta must be integers." });
    return;
  }
  if (amount === 0 && earnedDelta === 0) {
    json(res, 400, { error: "Nothing to change: give amount and/or earnedDelta." });
    return;
  }

  const reason = String(body?.reason || "").trim();
  if (reason.length < 3) {
    json(res, 400, { error: "A reason (min 3 chars) is required." });
    return;
  }

  try {
    const before = normalizeCurrency((await getWalletProfile(wallet)).currency);
    let applied = 0;
    await updateWalletProfile(wallet, (profile) => {
      if (amount !== 0) applied = adjustCurrency(profile, amount);
      if (earnedDelta !== 0) {
        const current = normalizeCurrency(profile.currency);
        profile.currency = { ...current, totalEarned: Math.max(0, current.totalEarned + earnedDelta) };
      }
      return profile;
    });
    const after = normalizeCurrency((await getWalletProfile(wallet)).currency);

    console.log(
      `[admin:adjust-balance] ${session.wallet} → ${wallet}: balance ${before.balance} → ${after.balance}` +
        ` (applied ${applied}), totalEarned ${before.totalEarned} → ${after.totalEarned} — ${reason}`
    );
    json(res, 200, {
      wallet,
      amount,
      applied,
      earnedDelta,
      before: before.balance,
      after: after.balance,
      totalEarnedBefore: before.totalEarned,
      totalEarnedAfter: after.totalEarned,
    });
  } catch (error) {
    console.error("[admin:adjust-balance]", error);
    json(res, 500, { error: "Balance adjustment failed." });
  }
};
