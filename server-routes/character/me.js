const { getSessionFromRequest, handleCors, json } = require("../../api/_lib/auth");
const {
  serializeBattleState,
  serializeCharacterRecord,
} = require("../../api/_lib/character");
const { isCharacterProxyEnabled, proxyCharacterJson } = require("../../api/_lib/character-proxy");
const { getWalletProfile } = require("../../api/_lib/store");
const { getEconomyConfig } = require("../../api/_lib/economy-config");
const { getMaxCharacters, getNextSlotPrice } = require("../../api/_lib/slots");

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
  const now = Date.now();
  const serializeOptions = { economyConfig: cfg, now };
  const latestCharacter = profile.characters[profile.characters.length - 1] || null;

  json(res, 200, {
    hasDraft: Boolean(profile.draft),
    hasCharacter: profile.characters.length > 0,
    draft: serializeCharacterRecord(profile.draft, serializeOptions),
    character: serializeCharacterRecord(latestCharacter, serializeOptions),
    characters: profile.characters.map((record) => serializeCharacterRecord(record, serializeOptions)),
    battleState: serializeBattleState(profile.battleState, { wallet: session.wallet }),
    currency: profile.currency || { balance: 0, totalEarned: 0 },
    paidSlots: profile.paidSlots || 0,
    maxCharacters: getMaxCharacters(profile, cfg),
    nextSlotPrice: getNextSlotPrice(profile, cfg),
  });
};
