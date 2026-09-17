const { Contract, Interface, JsonRpcProvider, Wallet, formatEther, id: keccakId, zeroPadValue } = require("ethers");

// On-chain access layer for the $PETIX token flows (feature 019, custodial).
// Everything the backend needs from Robinhood Chain lives behind
// createChainClient() so handlers and tests inject a fake instead of a live RPC.
// The treasury key never leaves this module: the only signing operation is
// sendTransfer(), and its nonce is chosen by the caller (see token.js sendLock).

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

const TRANSFER_TOPIC = keccakId("Transfer(address,address,uint256)");
const erc20Interface = new Interface(ERC20_ABI);

function isTokenEnabled() {
  return process.env.TOKEN_ENABLED === "1";
}

function normalizeAddress(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(normalized) ? normalized : null;
}

function envNumber(name, fallback) {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
}

function parseWalletList(raw) {
  return String(raw || "")
    .split(",")
    .map((entry) => normalizeAddress(entry))
    .filter(Boolean);
}

let cachedTreasury = { secret: null, address: null };

/** Address derived from TOKEN_TREASURY_SECRET (null when unset or malformed). */
function deriveTreasuryAddress(secret) {
  const trimmed = String(secret || "").trim();
  if (!trimmed) return null;
  if (cachedTreasury.secret === trimmed) return cachedTreasury.address;
  try {
    const address = normalizeAddress(new Wallet(trimmed).address);
    cachedTreasury = { secret: trimmed, address };
    return address;
  } catch (error) {
    cachedTreasury = { secret: trimmed, address: null };
    return null;
  }
}

function getTokenEnv() {
  const chainId = Number(process.env.TOKEN_CHAIN_ID) || null;
  const rpcUrl =
    String(process.env.TOKEN_RPC_URL || "").trim() ||
    String(process.env.NFT_RPC_URL || "").trim() ||
    null;
  const explorerUrl =
    String(process.env.TOKEN_EXPLORER_URL || "").trim() ||
    String(process.env.NFT_EXPLORER_URL || "").trim() ||
    null;
  const treasuryAddress = deriveTreasuryAddress(process.env.TOKEN_TREASURY_SECRET);
  const contract = normalizeAddress(process.env.TOKEN_CONTRACT);
  return {
    enabled: isTokenEnabled(),
    contract,
    treasuryAddress,
    hasTreasurySecret: Boolean(String(process.env.TOKEN_TREASURY_SECRET || "").trim()),
    chainId,
    chainIdHex: chainId ? `0x${chainId.toString(16)}` : null,
    chainName: String(process.env.TOKEN_CHAIN_NAME || "Robinhood Chain"),
    rpcUrl,
    explorerUrl: explorerUrl ? explorerUrl.replace(/\/+$/, "") : null,
    currencySymbol: String(process.env.TOKEN_CURRENCY_SYMBOL || "ETH"),
    tokenSymbol: String(process.env.TOKEN_SYMBOL || "$PETIX"),
    decimals: Math.max(0, Math.floor(envNumber("TOKEN_DECIMALS", 18))),
    confirmations: Math.max(0, Math.floor(envNumber("TOKEN_CONFIRMATIONS", 12))),
    syncMaxBlocks: Math.max(1000, Math.floor(Number(process.env.TOKEN_SYNC_MAX_BLOCKS) || 250000)),
    startBlock: Math.max(0, Math.floor(envNumber("TOKEN_START_BLOCK", 0))),
    internalWallets: parseWalletList(process.env.TOKEN_INTERNAL_WALLETS),
    minGasEth: envNumber("TOKEN_MIN_GAS_ETH", 0.001),
    // configured = everything the custodial path physically needs
    configured: Boolean(contract && treasuryAddress && chainId && rpcUrl),
  };
}

function rpcUnavailable(cause) {
  const error = new Error("Chain RPC is unavailable.");
  error.code = "RPC_UNAVAILABLE";
  error.cause = cause;
  return error;
}

function isNonceConflict(error) {
  const code = String(error?.code || "");
  const text = String(error?.shortMessage || error?.message || "").toLowerCase();
  return (
    code === "NONCE_EXPIRED" ||
    code === "REPLACEMENT_UNDERPRICED" ||
    /nonce too low|nonce has already been used|already known|replacement transaction underpriced/.test(
      text
    )
  );
}

function nonceConflict(cause) {
  const error = new Error("Treasury nonce conflict.");
  error.code = "NONCE_CONFLICT";
  error.cause = cause;
  return error;
}

function sendFailed(cause) {
  const error = new Error(cause?.shortMessage || cause?.message || "Failed to send the transfer.");
  error.code = "SEND_FAILED";
  error.cause = cause;
  return error;
}

/** Ready-to-send payload for a wallet's eth_sendTransaction: ERC-20 transfer(to, amount). */
function encodeTransferTx(contract, chainIdHex, to, amountRaw) {
  return {
    to: contract,
    data: erc20Interface.encodeFunctionData("transfer", [to, BigInt(amountRaw)]),
    value: "0x0",
    chainId: chainIdHex,
  };
}

function decodeTransferLog(log) {
  if (!log || !Array.isArray(log.topics) || log.topics[0] !== TRANSFER_TOPIC || log.topics.length < 3) {
    return null;
  }
  try {
    const parsed = erc20Interface.parseLog({ topics: log.topics, data: log.data });
    return {
      address: normalizeAddress(log.address),
      from: normalizeAddress(parsed.args.from),
      to: normalizeAddress(parsed.args.to),
      amountRaw: parsed.args.value.toString(),
      logIndex: Number(log.index ?? log.logIndex ?? 0),
      txHash: String(log.transactionHash || ""),
      blockNumber: Number(log.blockNumber),
    };
  } catch (error) {
    return null;
  }
}

function createChainClient(overrides = {}) {
  const env = getTokenEnv();

  let provider = overrides.provider || null;
  let readContract = overrides.contract || null;
  let signer = overrides.signer || null;

  function requireProvider() {
    if (provider) return provider;
    if (!env.rpcUrl || !env.chainId) {
      throw new Error("Token chain env is incomplete (RPC/chainId).");
    }
    provider = new JsonRpcProvider(env.rpcUrl, env.chainId);
    return provider;
  }

  function requireContract() {
    if (readContract) return readContract;
    if (!env.contract) throw new Error("TOKEN_CONTRACT is not configured.");
    readContract = new Contract(env.contract, ERC20_ABI, requireProvider());
    return readContract;
  }

  function requireSigner() {
    if (signer) return signer;
    const secret = String(process.env.TOKEN_TREASURY_SECRET || "").trim();
    if (!secret) throw new Error("TOKEN_TREASURY_SECRET is not configured.");
    signer = new Wallet(secret, requireProvider());
    return signer;
  }

  return {
    env,

    /** Treasury balances + nonces in one round. Raw values are decimal strings. */
    async getTreasurySnapshot() {
      try {
        const activeProvider = requireProvider();
        const contract = requireContract();
        const address = env.treasuryAddress;
        const [tokensRaw, ethWei, nonceLatest, noncePending] = await Promise.all([
          contract.balanceOf(address),
          activeProvider.getBalance(address),
          activeProvider.getTransactionCount(address, "latest"),
          activeProvider.getTransactionCount(address, "pending"),
        ]);
        return {
          address,
          tokensRaw: tokensRaw.toString(),
          ethWei: ethWei.toString(),
          nonceLatest: Number(nonceLatest),
          noncePending: Number(noncePending),
        };
      } catch (error) {
        throw rpcUnavailable(error);
      }
    },

    /** Gas units for transfer(to, amount) from the treasury; throws SEND_FAILED on revert. */
    async estimateTransferGas(to, amountRaw) {
      const contract = requireContract().connect(requireSigner());
      try {
        return await contract.transfer.estimateGas(to, BigInt(amountRaw));
      } catch (error) {
        if (error?.code === "CALL_EXCEPTION" || /revert|insufficient/i.test(String(error?.message))) {
          throw sendFailed(error);
        }
        throw rpcUnavailable(error);
      }
    },

    /**
     * Signs and broadcasts transfer(to, amount) with an explicit nonce (chosen by
     * the caller under the send lock). Returns { txHash, nonce } right after
     * broadcast — confirmation is the caller's job (getReceipt).
     */
    async sendTransfer(to, amountRaw, nonce) {
      const contract = requireContract().connect(requireSigner());
      try {
        const tx = await contract.transfer(to, BigInt(amountRaw), { nonce: Number(nonce) });
        return { txHash: tx.hash, nonce: Number(tx.nonce) };
      } catch (error) {
        if (isNonceConflict(error)) throw nonceConflict(error);
        if (error?.code === "NETWORK_ERROR" || error?.code === "TIMEOUT" || error?.code === "SERVER_ERROR") {
          throw rpcUnavailable(error);
        }
        throw sendFailed(error);
      }
    },

    /** null while pending; { status, blockNumber, confirmations, to, logs:[decoded Transfer…] } once mined. */
    async getReceipt(txHash) {
      try {
        const activeProvider = requireProvider();
        const receipt = await activeProvider.getTransactionReceipt(txHash);
        if (!receipt) return null;
        const latest = await activeProvider.getBlockNumber();
        return {
          status: Number(receipt.status),
          blockNumber: Number(receipt.blockNumber),
          confirmations: Math.max(0, latest - Number(receipt.blockNumber) + 1),
          to: normalizeAddress(receipt.to),
          logs: (receipt.logs || []).map(decodeTransferLog).filter(Boolean),
        };
      } catch (error) {
        throw rpcUnavailable(error);
      }
    },

    async getBlockNumber() {
      try {
        return await requireProvider().getBlockNumber();
      } catch (error) {
        throw rpcUnavailable(error);
      }
    },

    /**
     * Transfer(to = treasury) events of the token since fromBlock, up to
     * latest − confirmations, chunked so public RPCs accept the range.
     * Returns { toBlock, transfers:[{ from, to, amountRaw, txHash, logIndex, blockNumber }] }.
     */
    async scanIncomingTransfers(fromBlock, { maxBlocks = null, confirmations = 0 } = {}) {
      const activeProvider = requireProvider();
      if (!env.contract || !env.treasuryAddress) {
        throw new Error("TOKEN_CONTRACT / treasury are not configured.");
      }

      let toBlock;
      try {
        toBlock = (await activeProvider.getBlockNumber()) - Math.max(0, confirmations);
      } catch (error) {
        throw rpcUnavailable(error);
      }
      if (maxBlocks && toBlock - fromBlock > maxBlocks) toBlock = fromBlock + maxBlocks;
      if (toBlock < fromBlock) return { toBlock: fromBlock - 1, transfers: [] };

      const topics = [TRANSFER_TOPIC, null, zeroPadValue(env.treasuryAddress, 32)];
      const transfers = [];
      let chunk = Number(process.env.TOKEN_LOG_CHUNK) || 50000;
      let cursor = fromBlock;
      while (cursor <= toBlock) {
        const end = Math.min(cursor + chunk - 1, toBlock);
        try {
          const logs = await activeProvider.getLogs({
            address: env.contract,
            topics,
            fromBlock: cursor,
            toBlock: end,
          });
          for (const log of logs) {
            const decoded = decodeTransferLog(log);
            if (decoded && decoded.to === env.treasuryAddress) transfers.push(decoded);
          }
          cursor = end + 1;
        } catch (error) {
          if (chunk > 1000) {
            chunk = Math.floor(chunk / 4);
            continue;
          }
          throw rpcUnavailable(error);
        }
      }

      transfers.sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
      return { toBlock, transfers };
    },

    encodeTransferTx(to, amountRaw) {
      return encodeTransferTx(env.contract, env.chainIdHex, to, amountRaw);
    },
  };
}

module.exports = {
  ERC20_ABI,
  TRANSFER_TOPIC,
  createChainClient,
  decodeTransferLog,
  deriveTreasuryAddress,
  encodeTransferTx,
  formatEther,
  getTokenEnv,
  isNonceConflict,
  isTokenEnabled,
  normalizeAddress,
};
