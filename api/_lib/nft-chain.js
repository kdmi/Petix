const { Contract, JsonRpcProvider, Wallet, id: keccakId } = require("ethers");

// On-chain access layer for the NFT slots demo (feature 016). Everything the
// backend needs from the chain lives behind createChainClient() so handlers
// and tests can inject a fake client instead of a live RPC.

const CONTRACT_ABI = [
  "function MAX_SUPPLY() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function walletLimit() view returns (uint256)",
  "function mintPrice() view returns (uint256)",
  "function notifyMetadataUpdate(uint256 tokenId)",
  // OpenSea's ERC721ContractMetadata (SeaDrop) names it differently.
  "function emitBatchMetadataUpdate(uint256 fromTokenId, uint256 toTokenId)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
];

const TRANSFER_TOPIC = keccakId("Transfer(address,address,uint256)");

function isNftEnabled() {
  return process.env.NFT_ENABLED === "1";
}

function getNftEnv() {
  return {
    enabled: isNftEnabled(),
    contract: String(process.env.NFT_CONTRACT || "").trim() || null,
    chainId: Number(process.env.NFT_CHAIN_ID) || null,
    chainName: String(process.env.NFT_CHAIN_NAME || "Robinhood Chain"),
    rpcUrl: String(process.env.NFT_RPC_URL || "").trim() || null,
    explorerUrl: String(process.env.NFT_EXPLORER_URL || "").trim() || null,
    currencySymbol: String(process.env.NFT_CURRENCY_SYMBOL || "ETH"),
    marketplaceUrl: String(process.env.NFT_MARKETPLACE_URL || "").trim() || null,
    maxSupply: Math.max(1, Math.floor(Number(process.env.NFT_MAX_SUPPLY) || 10000)),
  };
}

function normalizeAddress(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(normalized) ? normalized : null;
}

function rpcUnavailable(cause) {
  const error = new Error("Chain RPC is unavailable.");
  error.code = "RPC_UNAVAILABLE";
  error.cause = cause;
  return error;
}

function isTokenMissingError(error) {
  // ethers v6 surfaces ERC721NonexistentToken as CALL_EXCEPTION with revert data.
  return (
    error?.code === "CALL_EXCEPTION" ||
    /nonexistent|invalid token/i.test(String(error?.reason || error?.message || ""))
  );
}

function createChainClient(overrides = {}) {
  const env = getNftEnv();

  let provider = overrides.provider || null;
  let contract = overrides.contract || null;
  let serviceContract = overrides.serviceContract || null;

  function requireContract() {
    if (contract) return contract;
    if (!env.rpcUrl || !env.chainId || !env.contract) {
      throw new Error("NFT demo chain env is incomplete (RPC/chainId/contract).");
    }
    provider = provider || new JsonRpcProvider(env.rpcUrl, env.chainId);
    contract = new Contract(env.contract, CONTRACT_ABI, provider);
    return contract;
  }

  function requireServiceContract() {
    if (serviceContract) return serviceContract;
    const secret = process.env.NFT_SERVICE_SECRET;
    if (!secret) {
      throw new Error("NFT_SERVICE_SECRET is not configured.");
    }
    const base = requireContract();
    const signer = new Wallet(secret, provider);
    serviceContract = base.connect(signer);
    return serviceContract;
  }

  return {
    env,

    async getTotalSupply() {
      try {
        return Number(await requireContract().totalSupply());
      } catch (error) {
        throw rpcUnavailable(error);
      }
    },

    /** Mint price in wei, as a decimal string (frontend converts to hex value). */
    async getMintPrice() {
      try {
        return String(await requireContract().mintPrice());
      } catch (error) {
        throw rpcUnavailable(error);
      }
    },

    /** Current owner (lowercase) or null when the token is not minted. */
    async ownerOf(tokenId) {
      try {
        return normalizeAddress(await requireContract().ownerOf(tokenId));
      } catch (error) {
        if (isTokenMissingError(error)) return null;
        throw rpcUnavailable(error);
      }
    },

    /**
     * Token ids owned by the wallet, via ERC721Enumerable when the contract
     * has it. Returns null when the contract is NOT enumerable — OpenSea's
     * ERC721SeaDrop is ERC721A and has no tokenOfOwnerByIndex, so callers must
     * fall back to the Transfer-log ownership index.
     */
    async tokensOfOwner(wallet) {
      const target = requireContract();
      let balance;
      try {
        balance = Number(await target.balanceOf(wallet));
      } catch (error) {
        throw rpcUnavailable(error);
      }
      if (balance === 0) return [];

      const tokenIds = [];
      for (let index = 0; index < balance; index += 1) {
        try {
          tokenIds.push(Number(await target.tokenOfOwnerByIndex(wallet, index)));
        } catch (error) {
          return null; // not enumerable
        }
      }
      return tokenIds.sort((a, b) => a - b);
    },

    async getBlockNumber() {
      try {
        const target = requireContract();
        const activeProvider = target.runner?.provider || provider;
        return await activeProvider.getBlockNumber();
      } catch (error) {
        throw rpcUnavailable(error);
      }
    },

    /**
     * Block to start the ownership scan from. Binary search over historical
     * eth_getCode is NOT usable here — Robinhood Chain's public RPC keeps no
     * archive state — so walk the contract's own logs backwards instead: the
     * first log a token contract emits is written in its deployment block.
     * NFT_START_BLOCK short-circuits the search when it is known.
     */
    async findDeploymentBlock() {
      const configured = Number(process.env.NFT_START_BLOCK);
      if (Number.isFinite(configured) && configured > 0) return Math.floor(configured);

      const target = requireContract();
      const activeProvider = target.runner?.provider || provider;
      const address = await target.getAddress();

      let latest;
      try {
        latest = await activeProvider.getBlockNumber();
      } catch (error) {
        throw rpcUnavailable(error);
      }

      const chunk = Number(process.env.NFT_LOG_CHUNK) || 50000;
      const maxLookback = Number(process.env.NFT_MAX_LOOKBACK) || 5000000;
      const emptyChunksBeforeStop = 3; // tolerate quiet gaps in contract activity

      let earliest = null;
      let emptyStreak = 0;
      for (let end = latest; end > latest - maxLookback && end >= 0; end -= chunk) {
        const from = Math.max(0, end - chunk + 1);
        let logs;
        try {
          logs = await activeProvider.getLogs({ address, fromBlock: from, toBlock: end });
        } catch (error) {
          break; // RPC refused the range — stop and use what we have
        }
        if (logs.length) {
          emptyStreak = 0;
          const first = Math.min(...logs.map((log) => log.blockNumber));
          earliest = earliest === null ? first : Math.min(earliest, first);
        } else if (earliest !== null && ++emptyStreak >= emptyChunksBeforeStop) {
          break;
        }
        if (from === 0) break;
      }

      // No logs at all → nothing was ever minted; start tracking from now.
      return earliest === null ? latest : earliest;
    },

    /**
     * Transfer events since fromBlock (inclusive), scanned in chunks so public
     * RPCs don't reject wide ranges. Returns
     * { toBlock, transfers: [{ tokenId, from, to, blockNumber }] } — ordered.
     */
    async scanTransfers(fromBlock, { maxBlocks = null } = {}) {
      const target = requireContract();
      const activeProvider = target.runner?.provider || provider;

      let toBlock;
      try {
        toBlock = await activeProvider.getBlockNumber();
      } catch (error) {
        throw rpcUnavailable(error);
      }
      if (maxBlocks && toBlock - fromBlock > maxBlocks) {
        toBlock = fromBlock + maxBlocks;
      }
      if (toBlock < fromBlock) {
        return { toBlock: fromBlock - 1, transfers: [] };
      }

      const transfers = [];
      let chunk = Number(process.env.NFT_LOG_CHUNK) || 50000;
      let cursor = fromBlock;
      while (cursor <= toBlock) {
        const end = Math.min(cursor + chunk - 1, toBlock);
        try {
          const events = await target.queryFilter(target.filters.Transfer(), cursor, end);
          for (const event of events) {
            transfers.push({
              tokenId: Number(event.args.tokenId),
              from: normalizeAddress(event.args.from),
              to: normalizeAddress(event.args.to),
              blockNumber: event.blockNumber,
            });
          }
          cursor = end + 1;
        } catch (error) {
          if (chunk > 1000) {
            chunk = Math.floor(chunk / 4); // range too wide for this RPC — narrow it
            continue;
          }
          throw rpcUnavailable(error);
        }
      }

      transfers.sort((a, b) => a.blockNumber - b.blockNumber);
      return { toBlock, transfers };
    },

    /**
     * Best-effort ERC-4906 signal so marketplaces re-read the token metadata.
     * The function name differs by contract: OpenSea's ERC721SeaDrop exposes
     * emitBatchMetadataUpdate(from,to), our own DemoSlots notifyMetadataUpdate(id).
     * Try both before giving up. Returns true when a tx confirmed.
     */
    async emitMetadataUpdate(tokenId) {
      const target = requireServiceContract();
      const attempts = [
        ["emitBatchMetadataUpdate", [tokenId, tokenId]],
        ["notifyMetadataUpdate", [tokenId]],
      ];

      for (const [method, args] of attempts) {
        if (typeof target[method] !== "function") continue;
        try {
          const tx = await target[method](...args);
          await tx.wait();
          return true;
        } catch (error) {
          console.warn(`[nft] ${method}(${tokenId}) failed: ${error.shortMessage || error.message}`);
        }
      }
      return false;
    },
  };
}

module.exports = {
  CONTRACT_ABI,
  TRANSFER_TOPIC,
  createChainClient,
  getNftEnv,
  isNftEnabled,
  normalizeAddress,
};
