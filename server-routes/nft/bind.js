const { handleCors, json, parseJsonBody } = require("../../api/_lib/auth");
const { bindCharacterToSlot } = require("../../api/_lib/nft");
const { requireEvmSession, sendDomainError } = require("./_shared");

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed." });
    return;
  }
  const session = requireEvmSession(req, res);
  if (!session) return;

  try {
    const body = await parseJsonBody(req);
    const tokenId = body.tokenId;
    const characterId = String(body.characterId || "").trim();
    if (!tokenId || !characterId) {
      json(res, 400, { error: "tokenId and characterId are required." });
      return;
    }

    const result = await bindCharacterToSlot(session.wallet, tokenId, characterId);
    json(res, 200, result);
  } catch (error) {
    if (sendDomainError(res, error)) return;
    console.error("[nft:bind]", error);
    json(res, 500, { error: "Bind failed." });
  }
};
