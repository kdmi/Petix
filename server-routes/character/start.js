const {
  getSessionFromRequest,
  handleCors,
  isAdminWallet,
  json,
  parseJsonBody,
} = require("../../api/_lib/auth");
const {
  buildCharacterDraft,
  serializeCharacterRecord,
} = require("../../api/_lib/character");
const { isCharacterProxyEnabled, proxyCharacterJson } = require("../../api/_lib/character-proxy");
const { createImageStore, getWalletProfile, saveWalletProfile } = require("../../api/_lib/store");
const { getEconomyConfig } = require("../../api/_lib/economy-config");
const { getMaxCharacters } = require("../../api/_lib/slots");

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  if (isCharacterProxyEnabled()) {
    await proxyCharacterJson(req, res, "/api/character/start");
    return;
  }

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
    const profile = await getWalletProfile(session.wallet);
    const cfg = await getEconomyConfig();
    const maxCharacters = getMaxCharacters(profile, cfg);
    if (!isAdminWallet(session.wallet) && profile.characters.length >= maxCharacters) {
      json(res, 409, {
        error: `Character limit reached for this wallet. Maximum is ${maxCharacters}. Buy a slot to unlock more.`,
        character: serializeCharacterRecord(profile.characters[profile.characters.length - 1]),
        characters: profile.characters.map(serializeCharacterRecord),
      });
      return;
    }

    const body = await parseJsonBody(req);
    const creatureType = body.creatureType || body.archetype || "";
    const draft = await buildCharacterDraft(creatureType, createImageStore());

    const nextProfile = {
      ...profile,
      draft: {
        ...draft,
        wallet: session.wallet,
        walletName: session.walletName,
        updatedAt: new Date().toISOString(),
      },
    };

    await saveWalletProfile(session.wallet, nextProfile);

    console.log(
      "[character:start]",
      JSON.stringify({
        wallet: session.wallet,
        characterId: draft.id,
        creatureType: draft.creatureType,
        nameProvider: draft.generation?.nameProvider || "unknown",
        powersProvider: draft.generation?.powersProvider || "unknown",
        imageProvider: draft.generation?.imageProvider || "unknown",
        nameError: draft.generation?.nameError || null,
        powersError: draft.generation?.powersError || null,
        imageError: draft.generation?.imageError || null,
      })
    );

    json(res, 200, {
      draft: serializeCharacterRecord(nextProfile.draft),
      characters: nextProfile.characters.map(serializeCharacterRecord),
    });
  } catch (error) {
    json(res, 400, { error: error.message || "Bad request." });
  }
};
