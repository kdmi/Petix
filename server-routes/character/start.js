const {
  getSessionFromRequest,
  handleCors,
  isAdminWallet,
  json,
  parseJsonBody,
} = require("../../api/_lib/auth");
const {
  buildCharacterDraft,
  isDraftExpired,
  serializeCharacterRecord,
} = require("../../api/_lib/character");
const { isCharacterProxyEnabled, proxyCharacterJson } = require("../../api/_lib/character-proxy");
const { createImageStore, getWalletProfile, saveWalletProfile } = require("../../api/_lib/store");
const { getEconomyConfig } = require("../../api/_lib/economy-config");
const { countSlotCharacters, getMaxCharacters } = require("../../api/_lib/slots");

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
    // Read the body before anything awaits on storage: the request stream is
    // still unread at this point, and parsing it later can miss the payload.
    const body = await parseJsonBody(req);
    const creatureType = body.creatureType || body.archetype || "";

    const profile = await getWalletProfile(session.wallet);
    const cfg = await getEconomyConfig();
    const maxCharacters = getMaxCharacters(profile, cfg);
    if (!isAdminWallet(session.wallet) && countSlotCharacters(profile) >= maxCharacters) {
      json(res, 409, {
        error: `Character limit reached for this wallet. Maximum is ${maxCharacters}. Buy a slot to unlock more.`,
        character: serializeCharacterRecord(profile.characters[profile.characters.length - 1]),
        characters: profile.characters.map(serializeCharacterRecord),
      });
      return;
    }

    // Every start is a paid generation (one image plus two text calls), and the
    // slot cap above only counts saved characters — a wallet that keeps an
    // unfinished draft would otherwise redraw its pet for free on every call.
    // Admins keep the old behaviour so prompt changes stay testable on prod.
    const pendingDraft = profile.draft;
    if (pendingDraft && !isDraftExpired(pendingDraft) && !isAdminWallet(session.wallet)) {
      console.log(
        "[character:start]",
        JSON.stringify({
          wallet: session.wallet,
          characterId: pendingDraft.id,
          creatureType: pendingDraft.creatureType,
          resumedDraft: true,
        })
      );

      json(res, 200, {
        draft: serializeCharacterRecord(pendingDraft),
        characters: profile.characters.map(serializeCharacterRecord),
      });
      return;
    }

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
