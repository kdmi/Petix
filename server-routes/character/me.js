const { getSessionFromRequest, handleCors, json } = require("../../api/_lib/auth");
const {
  serializeBattleState,
  serializeCharacterRecord,
} = require("../../api/_lib/character");
const { isCharacterProxyEnabled, proxyCharacterJson } = require("../../api/_lib/character-proxy");
const { getWalletProfile } = require("../../api/_lib/store");
const { getEconomyConfig } = require("../../api/_lib/economy-config");
const { getMaxCharacters, getNextSlotPrice } = require("../../api/_lib/slots");
const { getWalletCapsuleBonus } = require("../../api/_lib/nft");
const { buildEnergyShopView } = require("../../api/_lib/energy-shop");

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  if (isCharacterProxyEnabled()) {
    await proxyCharacterJson(req, res, "/api/character/me");
    return;
  }

  if (req.method !== "GET") {
    json(res, 405, { error: "Method not allowed." });
    return;
  }

  const session = getSessionFromRequest(req);
  if (!session) {
    json(res, 401, { error: "Unauthorized." });
    return;
  }

  const profile = await getWalletProfile(session.wallet);
  const cfg = await getEconomyConfig();
  // Бонус к лимиту боёв от NFT-капсул. При выключенной фиче возвращает нули,
  // не читая хранилище — на проде без капсул всё считается как раньше.
  const capsuleBonus = await getWalletCapsuleBonus(session.wallet);
  const now = Date.now();
  const serializeOptions = { economyConfig: cfg, now };
  const latestCharacter = profile.characters[profile.characters.length - 1] || null;

  json(res, 200, {
    hasDraft: Boolean(profile.draft),
    hasCharacter: profile.characters.length > 0,
    draft: serializeCharacterRecord(profile.draft, serializeOptions),
    character: serializeCharacterRecord(latestCharacter, serializeOptions),
    characters: profile.characters.map((record) => serializeCharacterRecord(record, serializeOptions)),
    battleState: serializeBattleState(profile.battleState, {
      wallet: session.wallet,
      bonusEnergy: capsuleBonus.extraBattles,
    }),
    // Магазин энергии (020): пакеты и кулдауны едут вместе с профилем, чтобы попап
    // открывался без отдельного запроса.
    energyShop: buildEnergyShopView(profile.battleState, cfg, { now }),
    currency: profile.currency || { balance: 0, totalEarned: 0 },
    paidSlots: profile.paidSlots || 0,
    maxCharacters: getMaxCharacters(profile, cfg),
    nextSlotPrice: getNextSlotPrice(profile, cfg),
    burnCost: cfg.BURN_COST,
    profileUpdatedAt: profile.profileUpdatedAt || null,
  });
};
