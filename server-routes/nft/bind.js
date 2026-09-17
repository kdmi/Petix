const { handleCors, json, parseJsonBody } = require("../../api/_lib/auth");
const { getEconomyConfig } = require("../../api/_lib/economy-config");
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

  // Рубильник из админки. Фронт прячет пункт меню, но запрос можно послать и
  // руками — поэтому решение принимается на сервере.
  const cfg = await getEconomyConfig();
  if (Number(cfg.NFT_BIND_ENABLED) !== 1) {
    json(res, 403, {
      error: "Sealing pets into capsules is not open yet.",
      code: "NFT_BIND_DISABLED",
    });
    return;
  }

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
