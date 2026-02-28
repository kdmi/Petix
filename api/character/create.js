const {
  CHARACTER_COOKIE,
  CHARACTER_TTL_MS,
  clearCookie,
  createToken,
  getSessionFromRequest,
  json,
  parseCookies,
  parseJsonBody,
  setCookie,
  verifyToken,
} = require("../_lib/auth");
const { validateSkillAllocation } = require("../_lib/character");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed." });
    return;
  }

  const session = getSessionFromRequest(req);
  if (!session) {
    json(res, 401, { error: "Unauthorized." });
    return;
  }

  const cookies = parseCookies(req);
  const rawCharacterCookie = cookies[CHARACTER_COOKIE];
  if (!rawCharacterCookie) {
    json(res, 400, { error: "Character draft not found. Start again." });
    return;
  }

  const parsed = verifyToken(rawCharacterCookie);
  if (!parsed || parsed.exp < Date.now() || parsed.wallet !== session.wallet) {
    clearCookie(res, CHARACTER_COOKIE);
    json(res, 400, { error: "Character draft is invalid or expired." });
    return;
  }

  if (parsed.type === "character_profile") {
    json(res, 409, { error: "Character already exists for this user." });
    return;
  }

  if (parsed.type !== "character_draft" || !parsed.draft) {
    clearCookie(res, CHARACTER_COOKIE);
    json(res, 400, { error: "Character draft is invalid." });
    return;
  }

  try {
    const body = await parseJsonBody(req);
    const selectedPowerId = String(body.selectedPowerId || "");
    const stats = body.stats || {};

    if (!validateSkillAllocation(stats)) {
      json(res, 400, { error: "Invalid skill allocation. Exactly 15 points are required." });
      return;
    }

    const selectedPower = parsed.draft.powers.find((power) => power.id === selectedPowerId);
    if (!selectedPower) {
      json(res, 400, { error: "Selected superpower is invalid." });
      return;
    }

    const character = {
      wallet: session.wallet,
      walletName: session.walletName,
      archetype: parsed.draft.archetype,
      style: parsed.draft.style,
      mood: parsed.draft.mood,
      sidekick: parsed.draft.sidekick,
      name: parsed.draft.name,
      prompt: parsed.draft.prompt,
      imageUrl: parsed.draft.imageUrl,
      powers: parsed.draft.powers,
      selectedPower,
      stats,
      createdAt: new Date().toISOString(),
    };

    const characterToken = createToken(
      {
        type: "character_profile",
        wallet: session.wallet,
        character,
      },
      CHARACTER_TTL_MS
    );
    setCookie(res, CHARACTER_COOKIE, characterToken, CHARACTER_TTL_MS);

    json(res, 200, {
      success: true,
      character,
    });
  } catch (error) {
    json(res, 400, { error: error.message || "Bad request." });
  }
};
