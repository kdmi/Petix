const {
  CHARACTER_COOKIE,
  clearCookie,
  createToken,
  getSessionFromRequest,
  json,
  parseCookies,
  parseJsonBody,
  setCookie,
  verifyToken,
} = require("../_lib/auth");
const { DRAFT_TTL_MS, buildCharacterDraft } = require("../_lib/character");

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
  const existingCharacterToken = cookies[CHARACTER_COOKIE];
  if (existingCharacterToken) {
    const parsed = verifyToken(existingCharacterToken);
    if (
      parsed &&
      parsed.type === "character_profile" &&
      parsed.exp >= Date.now() &&
      parsed.wallet === session.wallet
    ) {
      json(res, 409, { error: "Character already exists for this user." });
      return;
    }
    clearCookie(res, CHARACTER_COOKIE);
  }

  try {
    const body = await parseJsonBody(req);
    const archetype = String(body.archetype || "");
    const draft = buildCharacterDraft(archetype);
    const draftToken = createToken(
      {
        type: "character_draft",
        wallet: session.wallet,
        draft,
      },
      DRAFT_TTL_MS
    );

    setCookie(res, CHARACTER_COOKIE, draftToken, DRAFT_TTL_MS);
    json(res, 200, { draft });
  } catch (error) {
    json(res, 400, { error: error.message || "Bad request." });
  }
};
