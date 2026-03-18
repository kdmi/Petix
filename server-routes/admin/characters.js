const { getSessionFromRequest, handleCors, isAdminSession, json } = require("../../api/_lib/auth");
const { serializeCharacterRecord } = require("../../api/_lib/character");
const { listAllCharacters } = require("../../api/_lib/store");

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  if (req.method !== "GET") {
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

  const characters = await listAllCharacters();

  json(res, 200, {
    characters: characters.map(({ wallet, character }) => ({
      ...serializeCharacterRecord(character),
      creatorWallet: wallet,
    })),
  });
};
