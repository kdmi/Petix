const { handleCors, json } = require("../../api/_lib/auth");
const { getEconomyConfig } = require("../../api/_lib/economy-config");
const { createChainClient, getNftDemoEnv } = require("../../api/_lib/nft-demo-chain");
const { requireEvmSession } = require("./_shared");

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (req.method !== "GET") {
    json(res, 405, { error: "Method not allowed." });
    return;
  }
  const session = requireEvmSession(req, res);
  if (!session) return;

  const env = getNftDemoEnv();
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
    bindLevel: Math.max(1, Math.floor(Number(cfg.NFT_DEMO_BIND_LEVEL) || 1)),
    mintLimit: Math.max(1, Math.floor(Number(cfg.NFT_DEMO_MINT_LIMIT) || 5)),
    unbindCost: Math.max(0, Math.floor(Number(cfg.NFT_DEMO_UNBIND_COST) || 0)),
    unbindDelayMs: Math.max(0, Math.floor(Number(cfg.NFT_DEMO_UNBIND_DELAY_MS) || 0)),
    maxSupply: env.maxSupply,
    totalSupply,
    // Slots are bought on the marketplace, not minted from here.
    marketplaceUrl: env.marketplaceUrl,
    ...(rpcDegraded ? { rpcDegraded: true } : {}),
  });
};
