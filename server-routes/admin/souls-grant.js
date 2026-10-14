const {
  getSessionFromRequest,
  handleCors,
  isAdminSession,
  isLikelyEvmAddress,
  json,
  normalizeEvmAddress,
  parseJsonBody,
} = require("../../api/_lib/auth");
const { normalizeSouls } = require("../../api/_lib/souls");
const { getWalletProfile, updateWalletProfile } = require("../../api/_lib/store");

// Ручная выдача душ (031): подарки, компенсации, откаты. Только админ,
// обязательная причина — она уходит в лог вместе с тем, кто и кому.
//
// POST /api/admin/souls-grant  { wallet, amount, reason }
//   amount — дельта баланса (± целое, не 0). Подарок не считается заработком:
//            totalEarned не растёт. Списание не уводит баланс в минус.
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
    json(res, 400, { error: "Enter a 0x wallet address." });
    return;
  }
  const wallet = normalizeEvmAddress(rawWallet);

  const amount = Number(body?.amount);
  if (!Number.isInteger(amount) || amount === 0) {
    json(res, 400, { error: "Amount must be a whole number, not 0." });
    return;
  }

  const reason = String(body?.reason || "").trim();
  if (reason.length < 3) {
    json(res, 400, { error: "A reason (min 3 chars) is required." });
    return;
  }

  try {
    let before = null;
    let after = null;
    await updateWalletProfile(wallet, (profile) => {
      const souls = normalizeSouls(profile.souls);
      before = souls.balance;
      after = Math.max(0, souls.balance + amount);
      profile.souls = { ...souls, balance: after };
      return profile;
    });

    console.log(
      `[admin:souls-grant] ${session.wallet} → ${wallet}: souls ${before} → ${after} (asked ${amount}) — ${reason}`
    );
    json(res, 200, { wallet, amount, applied: after - before, before, after });
  } catch (error) {
    console.error("[admin:souls-grant]", error);
    json(res, 500, { error: "Could not change the souls balance." });
  }
};
