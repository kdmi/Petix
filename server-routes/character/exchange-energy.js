const { getSessionFromRequest, handleCors, json } = require("../../api/_lib/auth");
const { getEconomyConfig } = require("../../api/_lib/economy-config");
const { getWalletCapsuleBonus } = require("../../api/_lib/nft");
const { exchangeEnergyForSouls, exchangeableEnergy } = require("../../api/_lib/souls");
const { updateWalletProfile } = require("../../api/_lib/store");

// Exchange energy for souls (031).
// POST /api/character/exchange-energy — SOULS_EXCHANGE_ENERGY energy → SOULS_EXCHANGE_SOULS souls.
// Energy is spent like a fight: today's free first, then gifted, then bought.
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
    // Capsules raise today's free allowance; count it the same way a fight does.
    const bonusEnergy = (await getWalletCapsuleBonus(session.wallet).catch(() => ({ extraBattles: 0 }))).extraBattles || 0;
    let result = null;
    const profile = await updateWalletProfile(session.wallet, (current) => {
      result = exchangeEnergyForSouls(current, cfg, { bonusEnergy });
      return current;
    });
    json(res, 200, { ...result, souls: profile.souls, energy: exchangeableEnergy(profile.battleState, { bonusEnergy }) });
  } catch (error) {
    if (error.httpStatus) {
      const payload = { error: error.message, code: error.httpCode };
      for (const key of ["required", "balance"]) if (error[key] != null) payload[key] = error[key];
      json(res, error.httpStatus, payload);
      return;
    }
    console.error("[character:exchange-energy]", error);
    json(res, 500, { error: "Could not exchange the energy." });
  }
};
