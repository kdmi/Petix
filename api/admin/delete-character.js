const {
  getSessionFromRequest,
  handleCors,
  isAdminSession,
  json,
  parseJsonBody,
} = require("../_lib/auth");
const { deleteCharacterById } = require("../_lib/store");

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

  if (!isAdminSession(session)) {
    json(res, 403, { error: "Forbidden." });
    return;
  }

  try {
    const body = await parseJsonBody(req);
    const characterId = String(body.characterId || "").trim();

    if (!characterId) {
      json(res, 400, { error: "Character id is required." });
      return;
    }

    const deleted = await deleteCharacterById(characterId);
    if (!deleted) {
      json(res, 404, { error: "Character not found." });
      return;
    }

    json(res, 200, {
      success: true,
      characterId,
      creatorWallet: deleted.wallet,
    });
  } catch (error) {
    json(res, 400, { error: error.message || "Bad request." });
  }
};
