const { handleCors, json } = require("../../api/_lib/auth");
const { getEconomyConfig } = require("../../api/_lib/economy-config");
const { createChainClient, getNftEnv } = require("../../api/_lib/nft-chain");
const { requireEvmSession } = require("./_shared");
const { TIER_ORDER, TIER_LABELS } = require("../../api/_lib/nft-tiers");

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (req.method !== "GET") {
    json(res, 405, { error: "Method not allowed." });
    return;
  }
  const session = requireEvmSession(req, res);
  if (!session) return;

  const env = getNftEnv();
  const cfg = await getEconomyConfig();

  let totalSupply = null;
  let rpcDegraded = false;
  try {
    totalSupply = await createChainClient().getTotalSupply();
  } catch (error) {
    rpcDegraded = true;
  }

  json(res, 200, {
    enabled: true,
    contract: env.contract,
    chainId: env.chainId,
    chainName: env.chainName,
    rpcUrl: env.rpcUrl,
    explorerUrl: env.explorerUrl,
    currencySymbol: env.currencySymbol,
    bindLevel: Math.max(1, Math.floor(Number(cfg.NFT_BIND_LEVEL) || 1)),
    mintLimit: Math.max(1, Math.floor(Number(cfg.NFT_MINT_LIMIT) || 5)),
    unbindCost: Math.max(0, Math.floor(Number(cfg.NFT_UNBIND_COST) || 0)),
    unbindDelayMs: Math.max(0, Math.floor(Number(cfg.NFT_UNBIND_DELAY_MS) || 0)),
    maxSupply: env.maxSupply,
    totalSupply,
    // Slots are bought on the marketplace, not minted from here.
    marketplaceUrl: env.marketplaceUrl,
    // Бонусы по тирам — для тултипа на бейдже NFT (018).
    tierBonuses: Object.fromEntries(
      TIER_ORDER.map((tier) => [
        tier,
        {
          label: TIER_LABELS[tier],
          farmPct: Math.max(0, Number(cfg.NFT_TIER_FARM_BONUS_PCT?.[tier]) || 0),
          extraBattles: Math.max(0, Math.floor(Number(cfg.NFT_TIER_EXTRA_BATTLES?.[tier]) || 0)),
        },
      ])
    ),
    ...(rpcDegraded ? { rpcDegraded: true } : {}),
  });
};
