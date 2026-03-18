const { getSessionFromRequest, handleCors, json } = require("../_lib/auth");
const { serializeCharacterRecord } = require("../_lib/character");
const { findCharacterRecordById, listAllCharacters } = require("../_lib/store");

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

  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const attackerPetId = String(requestUrl.searchParams.get("attackerPetId") || "").trim();

  if (!attackerPetId) {
    json(res, 400, { error: "attackerPetId is required." });
    return;
  }

  const attacker = await findCharacterRecordById(attackerPetId);
  if (!attacker?.character || attacker.wallet !== session.wallet) {
    json(res, 403, { error: "Attacker pet does not belong to this wallet." });
    return;
  }

  const characters = await listAllCharacters();
  const opponents = characters
    .filter(({ wallet, character }) => {
      return (
        wallet &&
        wallet !== session.wallet &&
        character?.status === "completed" &&
        character?.id !== attackerPetId
      );
    })
    .map(({ wallet, character }) => ({
      ...serializeCharacterRecord(character),
      creatorWallet: wallet,
    }));

  json(res, 200, {
    opponents,
  });
};
