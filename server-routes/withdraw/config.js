const { getSessionFromRequest, handleCors, json } = require("../../api/_lib/auth");
const { getEconomyConfig } = require("../../api/_lib/economy-config");
const withdraw = require("../../api/_lib/withdraw");

// GET /api/withdraw/config — настройки вывода для модалки (любой авторизованный).
module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (req.method !== "GET") {
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
    const chain = withdraw.getConfig();
    json(res, 200, {
      enabled: Boolean(cfg.WITHDRAW_ENABLED) && withdraw.isConfigured(),
      configured: withdraw.isConfigured(),
      min: Math.max(0, Math.floor(Number(cfg.MIN_WITHDRAW) || 0)),
      feePct: Math.max(0, Number(cfg.WITHDRAW_FEE_PCT) || 0),
      tokenSymbol: chain.tokenSymbol,
      decimals: chain.decimals,
    });
  } catch (error) {
    json(res, 500, { error: error.message || "Failed to load withdraw config." });
  }
};
