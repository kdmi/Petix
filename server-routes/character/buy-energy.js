const {
  getSessionFromRequest,
  handleCors,
  json,
  parseJsonBody,
} = require("../../api/_lib/auth");
const { serializeBattleState } = require("../../api/_lib/character");
const { getEconomyConfig } = require("../../api/_lib/economy-config");
const { buildEnergyShopView, purchaseEnergyPack } = require("../../api/_lib/energy-shop");
const { getWalletCapsuleBonus } = require("../../api/_lib/nft");
const { updateWalletProfile } = require("../../api/_lib/store");

// Магазин энергии (020): POST { packIndex } → списать Points, добавить купленные бои.
// Списание и начисление происходят в одном мутаторе updateWalletProfile; любой отказ
// внутри мутатора — throw без записи, так что «Points ушли, а энергии нет» невозможно.
const ERROR_STATUS = {
  SHOP_DISABLED: 403,
  INVALID_PACK: 400,
  PACK_COOLDOWN: 409,
  INSUFFICIENT_FUNDS: 402,
};

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
    const cfg = await getEconomyConfig();
    const now = Date.now();
    let purchase = null;

    const profile = await updateWalletProfile(session.wallet, (current) => {
      purchase = purchaseEnergyPack(current, body.packIndex, cfg, { now });
      return current;
    });

    const capsuleBonus = await getWalletCapsuleBonus(session.wallet);
    json(res, 200, {
      packIndex: purchase.index,
      fights: purchase.fights,
      pricePaid: purchase.pricePaid,
      balance: profile.currency.balance,
      battleState: serializeBattleState(profile.battleState, {
        wallet: session.wallet,
        bonusEnergy: capsuleBonus.extraBattles,
      }),
      energyShop: buildEnergyShopView(profile.battleState, cfg, { now }),
    });
  } catch (error) {
    const status = ERROR_STATUS[error.code];
    if (status) {
      const payload = { error: error.message, code: error.code };
      if (error.availableAt) payload.availableAt = error.availableAt;
      if (error.required != null) payload.required = error.required;
      if (error.balance != null) payload.balance = error.balance;
      json(res, status, payload);
      return;
    }
    json(res, 400, { error: error.message || "Bad request." });
  }
};
