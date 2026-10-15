const { handleCors, json, parseJsonBody } = require("../../api/_lib/auth");
const { getEconomyConfig } = require("../../api/_lib/economy-config");
const { linkSolanaWallet } = require("../../api/_lib/solana-link");
const { requireSession, sendShopError } = require("../shop/_shared");

// POST { address, message, signature(base64) } — attach a Solana wallet to the profile, once (031).
module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (req.method !== "POST") { json(res, 405, { error: "Method not allowed." }); return; }
  const session = requireSession(req, res);
  if (!session) return;
  try {
    const body = await parseJsonBody(req);
    const cfg = await getEconomyConfig();
    json(res, 200, await linkSolanaWallet(session.wallet, body || {}, { reward: cfg.SOULS_SOLANA_LINK_REWARD }));
  } catch (error) {
    sendShopError(res, error, "Could not link the Solana wallet.");
  }
};
