const crypto = require("crypto");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");

// Isolated env + fake chain for the $PETIX token flows (feature 019).
// Profiles and the token state use the real stores against a temp cwd; the
// chain is always injected. No real addresses anywhere — every wallet is
// derived from a seed digit, the treasury from a throwaway fixture key.

const STORE_PATH = path.resolve(__dirname, "../../../api/_lib/store.js");
const ECONOMY_CONFIG_PATH = path.resolve(__dirname, "../../../api/_lib/economy-config.js");
const TOKEN_CHAIN_PATH = path.resolve(__dirname, "../../../api/_lib/token-chain.js");
const TOKEN_STORE_PATH = path.resolve(__dirname, "../../../api/_lib/token-store.js");
const WITHDRAWAL_STORE_PATH = path.resolve(__dirname, "../../../api/_lib/withdrawal-store.js");
const TOKEN_PATH = path.resolve(__dirname, "../../../api/_lib/token.js");

const BASE_NOW = Date.parse("2026-09-12T12:00:00.000Z");
const DECIMALS = 18;
const ONE_TOKEN = 10n ** BigInt(DECIMALS);
const ONE_ETH = 10n ** 18n;

// Throwaway fixture key (never funded, never used outside tests). The treasury
// address the code derives from it is deterministic but is NOT written down
// anywhere — tests read it back from the chain snapshot / env helper.
const FIXTURE_TREASURY_SECRET = `0x${"7a".repeat(32)}`;

function clearModule(modulePath) {
  delete require.cache[require.resolve(modulePath)];
}

function freshRequire(modulePath) {
  clearModule(modulePath);
  return require(modulePath);
}

function evmWallet(digit) {
  return `0x${String(digit).repeat(40)}`.toLowerCase();
}

function toRaw(tokens) {
  return (BigInt(Math.floor(Number(tokens))) * ONE_TOKEN).toString();
}

function fakeTxHash(seed) {
  return `0x${crypto.createHash("sha256").update(String(seed)).digest("hex")}`;
}

function nonceConflictError() {
  const error = new Error("nonce too low");
  error.code = "NONCE_CONFLICT";
  return error;
}

/**
 * In-memory Robinhood Chain stand-in exposing the token-chain client surface.
 * `state` is mutable from tests; helpers below mutate it the way the real
 * network would (confirm → receipt + nonceLatest bump, mineIncoming → Transfer).
 */
function createFakeChain({
  treasuryAddress = evmWallet("f"),
  tokenContract = evmWallet("c"),
  payoutSource = null,
  tokens = 1_000_000,
  eth = 1,
  blockNumber = 100,
  chainId = 4663,
} = {}) {
  const state = {
    treasury: {
      address: treasuryAddress,
      tokensRaw: BigInt(toRaw(tokens)),
      ethWei: BigInt(Math.round(Number(eth) * 1e6)) * (ONE_ETH / 1_000_000n),
      nonceLatest: 7,
      noncePending: 7,
    },
    // Launch wallet holding the pool + the allowance it granted the operator
    // (only used when payoutSource is set).
    source: {
      address: payoutSource,
      tokensRaw: BigInt(toRaw(tokens)),
      allowanceRaw: BigInt(toRaw(tokens)),
    },
    depositAddress: payoutSource || treasuryAddress,
    tokenContract,
    chainId,
    blockNumber,
    receipts: new Map(), // txHash → { status, blockNumber, logs }
    sentTxs: [], // { txHash, nonce, to, amountRaw }
    incoming: [], // Transfer(to=treasury) events
    failNextSend: null, // Error to throw on the next sendTransfer
    nonceConflictOnce: false, // next sendTransfer throws NONCE_CONFLICT once
    gasEstimateFails: false,
    rpcDown: false,
    contracts: new Set(), // addresses that hold code (lowercase)
    sendDelayMs: 0,
    inFlightSends: 0,
    maxConcurrentSends: 0,
  };

  function assertRpc() {
    if (state.rpcDown) {
      const error = new Error("RPC down");
      error.code = "RPC_UNAVAILABLE";
      throw error;
    }
  }

  return {
    state,
    env: { treasuryAddress, tokenContract, chainId, decimals: DECIMALS },

    async getTreasurySnapshot() {
      assertRpc();
      const usingSource = Boolean(state.source.address);
      const balance = usingSource ? state.source.tokensRaw : state.treasury.tokensRaw;
      const allowance = usingSource ? state.source.allowanceRaw : null;
      const available = allowance == null ? balance : balance < allowance ? balance : allowance;
      return {
        address: state.treasury.address,
        sourceAddress: state.source.address,
        tokensRaw: balance.toString(),
        allowanceRaw: allowance == null ? null : allowance.toString(),
        availableRaw: available.toString(),
        ethWei: state.treasury.ethWei.toString(),
        nonceLatest: state.treasury.nonceLatest,
        noncePending: state.treasury.noncePending,
      };
    },

    async estimateTransferGas() {
      assertRpc();
      if (state.gasEstimateFails) {
        const error = new Error("execution reverted");
        error.code = "SEND_FAILED";
        throw error;
      }
      return 60000n;
    },

    async sendTransfer(to, amountRaw, nonce) {
      assertRpc();
      if (state.failNextSend) {
        const error = state.failNextSend;
        state.failNextSend = null;
        throw error;
      }
      if (state.nonceConflictOnce) {
        state.nonceConflictOnce = false;
        throw nonceConflictError();
      }
      if (Number(nonce) !== state.treasury.noncePending) throw nonceConflictError();
      state.inFlightSends += 1;
      state.maxConcurrentSends = Math.max(state.maxConcurrentSends, state.inFlightSends);
      if (state.sendDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, state.sendDelayMs));
      }
      state.inFlightSends -= 1;
      state.treasury.noncePending += 1;
      const from = state.source.address || state.treasury.address;
      const txHash = fakeTxHash(`send:${nonce}:${to}:${amountRaw}`);
      state.sentTxs.push({ txHash, nonce: Number(nonce), from, to, amountRaw: String(amountRaw) });
      return { txHash, nonce: Number(nonce), from };
    },

    async getReceipt(txHash) {
      assertRpc();
      const receipt = state.receipts.get(txHash) || null;
      if (!receipt) return null;
      return {
        ...receipt,
        confirmations: Math.max(0, state.blockNumber - receipt.blockNumber + 1),
      };
    },

    async getBlockNumber() {
      assertRpc();
      return state.blockNumber;
    },

    async scanIncomingTransfers(fromBlock, { maxBlocks = null, confirmations = 0 } = {}) {
      assertRpc();
      let toBlock = state.blockNumber - Math.max(0, confirmations);
      if (maxBlocks && toBlock - fromBlock > maxBlocks) toBlock = fromBlock + maxBlocks;
      if (toBlock < fromBlock) return { toBlock: fromBlock - 1, transfers: [] };
      return {
        toBlock,
        transfers: state.incoming.filter(
          (entry) => entry.blockNumber >= fromBlock && entry.blockNumber <= toBlock
        ),
      };
    },

    async isContract(address) {
      assertRpc();
      return state.contracts.has(String(address).toLowerCase());
    },

    encodeTransferTx(to, amountRaw) {
      const addr = String(to).toLowerCase().replace(/^0x/, "").padStart(64, "0");
      const value = BigInt(amountRaw).toString(16).padStart(64, "0");
      return {
        to: state.tokenContract,
        data: `0xa9059cbb${addr}${value}`,
        value: "0x0",
        chainId: `0x${state.chainId.toString(16)}`,
      };
    },

    // ---- test helpers -----------------------------------------------------

    /** The network mines the treasury's tx: receipt appears, nonceLatest advances. */
    confirm(txHash, { status = 1 } = {}) {
      const sent = state.sentTxs.find((entry) => entry.txHash === txHash);
      state.blockNumber += 1;
      state.receipts.set(txHash, { status, blockNumber: state.blockNumber, logs: [] });
      if (sent) {
        state.treasury.nonceLatest = Math.max(state.treasury.nonceLatest, sent.nonce + 1);
        if (status === 1) {
          if (state.source.address) {
            state.source.tokensRaw -= BigInt(sent.amountRaw);
            state.source.allowanceRaw -= BigInt(sent.amountRaw);
          } else {
            state.treasury.tokensRaw -= BigInt(sent.amountRaw);
          }
        }
      }
    },

    /** Something else from the treasury got mined — our tx (if any) was displaced. */
    displaceNonce() {
      state.treasury.nonceLatest += 1;
      state.treasury.noncePending = Math.max(state.treasury.noncePending, state.treasury.nonceLatest);
    },

    /** A player sends tokens to the treasury; returns the txHash of that transfer. */
    mineIncoming(from, tokens, { logIndex = 0, txHash = null, to = null } = {}) {
      state.blockNumber += 1;
      const amountRaw = typeof tokens === "string" ? tokens : toRaw(tokens);
      const hash = txHash || fakeTxHash(`in:${from}:${amountRaw}:${state.blockNumber}`);
      const entry = {
        from: String(from).toLowerCase(),
        to: String(to || state.depositAddress).toLowerCase(),
        amountRaw,
        txHash: hash,
        logIndex,
        blockNumber: state.blockNumber,
      };
      if (entry.to === state.depositAddress) state.incoming.push(entry);
      state.receipts.set(hash, {
        status: 1,
        blockNumber: state.blockNumber,
        to: state.tokenContract,
        logs: [{ address: state.tokenContract, from: entry.from, to: entry.to, amountRaw, logIndex }],
      });
      if (entry.to === state.depositAddress) {
        if (state.source.address) state.source.tokensRaw += BigInt(amountRaw);
        else state.treasury.tokensRaw += BigInt(amountRaw);
      }
      return hash;
    },

    advance(blocks = 1) {
      state.blockNumber += blocks;
    },
  };
}

/**
 * Stand-in for the capsule index + live ownerOf used by the withdrawal gate.
 * `setHoldings(wallet, [{tokenId, since(ms)}])` seeds the index; `liveOwners`
 * overrides what ownerOf answers (defaults to the indexed owner).
 */
function createFakeNft() {
  const holdings = new Map(); // wallet → [{tokenId, since ISO}]
  const fake = {
    enabled: true,
    failHoldings: false,
    liveOwners: new Map(),
    ownerOfCalls: [],
    marketplaceUrl: "https://market.test/capsules",
    setHoldings(wallet, list) {
      holdings.set(
        String(wallet).toLowerCase(),
        (list || []).map((entry) => ({
          tokenId: Number(entry.tokenId),
          since: entry.since == null ? null : new Date(entry.since).toISOString(),
        }))
      );
    },
  };
  fake.client = {
    isEnabled: () => fake.enabled,
    marketplaceUrl: () => fake.marketplaceUrl,
    async getHoldings(wallet) {
      if (fake.failHoldings) {
        const error = new Error("index unavailable");
        error.code = "RPC_UNAVAILABLE";
        throw error;
      }
      const tokens = holdings.get(String(wallet).toLowerCase()) || [];
      const known = tokens.map((entry) => entry.since).filter(Boolean).sort();
      return { tokens, oldestSince: known.length ? known[0] : null };
    },
    async ownerOf(tokenId) {
      fake.ownerOfCalls.push(Number(tokenId));
      if (fake.liveOwners.has(Number(tokenId))) return fake.liveOwners.get(Number(tokenId));
      for (const [wallet, list] of holdings) {
        if (list.some((entry) => entry.tokenId === Number(tokenId))) return wallet;
      }
      return null;
    },
  };
  return fake;
}

async function withTokenEnv(run, { env: envOverrides = {}, chain: chainOptions = {} } = {}) {
  const originalCwd = process.cwd();
  const keys = [
    "NODE_ENV",
    "BLOB_READ_WRITE_TOKEN",
    "INTERNAL_API_SECRET",
    "SOLANA_AUTH_SECRET",
    "ADMIN_WALLETS",
    "CRON_SECRET",
    "NFT_RPC_URL",
    "NFT_EXPLORER_URL",
    "TOKEN_ENABLED",
    "TOKEN_CONTRACT",
    "TOKEN_TREASURY_SECRET",
    "TOKEN_DECIMALS",
    "TOKEN_CHAIN_ID",
    "TOKEN_RPC_URL",
    "TOKEN_EXPLORER_URL",
    "TOKEN_CONFIRMATIONS",
    "TOKEN_SYNC_MAX_BLOCKS",
    "TOKEN_START_BLOCK",
    "TOKEN_INTERNAL_WALLETS",
    "TOKEN_MIN_GAS_ETH",
    "TOKEN_PAYOUT_SOURCE",
    "ECONOMY_CONFIG_CACHE_TTL_MS",
    "TOKEN_LEDGER_CACHE_MS",
  ];
  const originalEnv = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "petix-token-"));

  try {
    process.chdir(tempDir);
    process.env.NODE_ENV = "test";
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.NFT_RPC_URL;
    delete process.env.NFT_EXPLORER_URL;
    process.env.INTERNAL_API_SECRET = "petix-token-internal-secret-0123";
    process.env.SOLANA_AUTH_SECRET = "petix-token-test-session-secret-0123456789";
    process.env.ADMIN_WALLETS = evmWallet("a");
    process.env.CRON_SECRET = "petix-token-cron-secret";
    process.env.ECONOMY_CONFIG_CACHE_TTL_MS = "0";
    process.env.TOKEN_ENABLED = "1";
    process.env.TOKEN_CONTRACT = evmWallet("c");
    process.env.TOKEN_TREASURY_SECRET = FIXTURE_TREASURY_SECRET;
    process.env.TOKEN_DECIMALS = String(DECIMALS);
    process.env.TOKEN_CHAIN_ID = "4663";
    process.env.TOKEN_RPC_URL = "http://127.0.0.1:1/unused";
    process.env.TOKEN_EXPLORER_URL = "https://explorer.test";
    process.env.TOKEN_CONFIRMATIONS = "12";
    process.env.TOKEN_SYNC_MAX_BLOCKS = "1000";
    process.env.TOKEN_START_BLOCK = "10";
    process.env.TOKEN_INTERNAL_WALLETS = evmWallet("e");
    process.env.TOKEN_MIN_GAS_ETH = "0.001";
    delete process.env.TOKEN_LEDGER_CACHE_MS;
    delete process.env.TOKEN_PAYOUT_SOURCE;
    for (const [key, value] of Object.entries(envOverrides)) {
      if (value === undefined || value === null) delete process.env[key];
      else process.env[key] = String(value);
    }

    const store = freshRequire(STORE_PATH);
    const economyConfig = freshRequire(ECONOMY_CONFIG_PATH);
    const withdrawalStore = freshRequire(WITHDRAWAL_STORE_PATH);
    const tokenChain = freshRequire(TOKEN_CHAIN_PATH);
    const tokenStore = freshRequire(TOKEN_STORE_PATH);
    const token = freshRequire(TOKEN_PATH);

    const chain = createFakeChain({
      treasuryAddress: tokenChain.getTokenEnv().treasuryAddress || evmWallet("f"),
      tokenContract: process.env.TOKEN_CONTRACT,
      payoutSource: tokenChain.getTokenEnv().payoutSource,
      ...chainOptions,
    });
    const configOverrides = {};
    const clock = { now: BASE_NOW };
    const nftFake = createFakeNft();
    const deps = {
      chain,
      tokenStore,
      nft: nftFake.client,
      profiles: {
        getWalletProfile: store.getWalletProfile,
        updateWalletProfile: store.updateWalletProfile,
      },
      // Baseline for the older token tests: the 2026-09-17 defaults (MIN_WITHDRAW 1000,
      // capsule gate on) are exercised explicitly in token-nft-gate.test.js.
      getConfig: async () => ({
        ...economyConfig.getDefaults(),
        MIN_WITHDRAW: 200,
        WITHDRAW_REQUIRE_NFT: 0,
        ...configOverrides,
      }),
      now: () => clock.now,
      sleep: async () => {},
      // Receipt polling loop budget in the request path; tests keep it tiny.
      receiptPollAttempts: 2,
    };

    return await run({
      chain,
      clock,
      configOverrides,
      deps,
      economyConfig,
      nftFake,
      store,
      token,
      tokenChain,
      tokenStore,
      withdrawalStore,
      tempDir,
    });
  } finally {
    for (const modulePath of [
      TOKEN_PATH,
      TOKEN_STORE_PATH,
      TOKEN_CHAIN_PATH,
      WITHDRAWAL_STORE_PATH,
      ECONOMY_CONFIG_PATH,
      STORE_PATH,
    ]) {
      clearModule(modulePath);
    }
    process.chdir(originalCwd);
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function seedBalance(store, wallet, balance, extra = {}) {
  return store.updateWalletProfile(wallet, (current) => ({
    ...current,
    ...extra,
    currency: { balance, totalEarned: balance },
  }));
}

// ---- HTTP-level helpers (dispatcher + fake req/res) ----------------------------

const DISPATCHER_PATH = path.resolve(__dirname, "../../../api/token/[action].js");
const ADMIN_DISPATCHER_PATH = path.resolve(__dirname, "../../../api/admin/[action].js");
const ROUTES_DIR = path.resolve(__dirname, "../../../server-routes/token");
const ADMIN_ROUTES_DIR = path.resolve(__dirname, "../../../server-routes/admin");
const AUTH_PATH = path.resolve(__dirname, "../../../api/_lib/auth.js");

/** Re-require the token dispatcher (and its routes) so they bind to the env's fresh modules. */
function freshDispatcher(token, deps, { admin = false } = {}) {
  for (const key of Object.keys(require.cache)) {
    if (
      key === DISPATCHER_PATH ||
      key === ADMIN_DISPATCHER_PATH ||
      key.startsWith(ROUTES_DIR) ||
      key.startsWith(ADMIN_ROUTES_DIR)
    ) {
      delete require.cache[key];
    }
  }
  if (token && typeof token.configureDeps === "function") token.configureDeps(deps);
  return require(admin ? ADMIN_DISPATCHER_PATH : DISPATCHER_PATH);
}

async function invokeJsonHandler(handler, { method = "GET", url = "/", headers = {}, body } = {}) {
  const listeners = { data: [], end: [], error: [] };
  const req = {
    method,
    url,
    headers: { host: "localhost:3000", ...headers },
    on(event, callback) {
      if (listeners[event]) listeners[event].push(callback);
      return this;
    },
  };
  const res = {
    statusCode: 200,
    headersSent: {},
    bodyText: "",
    getHeader(name) {
      return this.headersSent[name.toLowerCase()];
    },
    setHeader(name, value) {
      this.headersSent[name.toLowerCase()] = value;
    },
    end(chunk) {
      this.bodyText = chunk ? String(chunk) : "";
    },
  };
  const pending = Promise.resolve().then(() => handler(req, res));
  const raw = body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body);
  process.nextTick(() => {
    if (raw) listeners.data.forEach((cb) => cb(raw));
    listeners.end.forEach((cb) => cb());
  });
  await pending;
  return { status: res.statusCode, body: res.bodyText ? JSON.parse(res.bodyText) : null, headers: res.headersSent };
}

function sessionHeaders(wallet, walletType = "metamask") {
  const auth = require(AUTH_PATH);
  const { sessionToken } = auth.createSession(wallet, walletType);
  return { cookie: `${auth.SESSION_COOKIE}=${encodeURIComponent(sessionToken)}` };
}

module.exports = {
  BASE_NOW,
  DECIMALS,
  FIXTURE_TREASURY_SECRET,
  ONE_TOKEN,
  createFakeChain,
  createFakeNft,
  evmWallet,
  fakeTxHash,
  freshDispatcher,
  invokeJsonHandler,
  seedBalance,
  sessionHeaders,
  toRaw,
  withTokenEnv,
};
