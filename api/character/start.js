const {
  getSessionFromRequest,
  handleCors,
  isAdminWallet,
  json,
  parseJsonBody,
} = require("../_lib/auth");
const {
  buildCharacterDraft,
  serializeCharacterRecord,
} = require("../_lib/character");
const { isCharacterProxyEnabled, proxyCharacterJson } = require("../_lib/character-proxy");
const { createImageStore, getWalletProfile, saveWalletProfile } = require("../_lib/store");

const MAX_CHARACTERS_PER_WALLET = 3;

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
    if (!isAdminWallet(session.wallet) && profile.characters.length >= MAX_CHARACTERS_PER_WALLET) {
      json(res, 409, {
        error: `Character limit reached for this wallet. Maximum is ${MAX_CHARACTERS_PER_WALLET}.`,
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
