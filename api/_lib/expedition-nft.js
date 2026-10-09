// Expeditions (026): boss trophy NFTs. The server mints ExpeditionTrophies to
// the player's wallet after a verified 3★ run; the player signs nothing and
// pays no gas. Mirrors api/_lib/token-chain.js: ethers v6, one signer, a short
// lock around the send so parallel lambdas never fight over a nonce, and a
// small queue document for mints that must wait (minting paused, RPC down).
const { Contract, JsonRpcProvider, Wallet } = require("ethers");
const { createBlobDocument } = require("./blob-doc");
const { getEconomyConfig } = require("./economy-config");
const { getBoss, isMintEnabled } = require("./expeditions-config");
const { getWalletProfile, updateWalletProfile } = require("./store");

const TROPHY_ABI = [
  "function mint(address to, uint256 bossId) returns (uint256)",
  "function claimed(uint256 bossId, address wallet) view returns (bool)",
  "function bossOf(uint256 tokenId) view returns (uint256)",
  "function mintedFor(uint256 bossId) view returns (uint256)",
  "function totalMinted() view returns (uint256)",
  "function minter() view returns (address)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function contractURI() view returns (string)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "event TrophyMinted(address indexed to, uint256 indexed bossId, uint256 indexed tokenId, uint256 serial)",
];
const { id: keccakId } = require("ethers");
const MINTED_TOPIC = keccakId("TrophyMinted(address,uint256,uint256,uint256)");

const QUEUE_PATH = "expedition-mint-queue.json";
const MAX_ATTEMPTS = 5;

function fail(status, code, message, extra) {
  const error = new Error(message);
  error.httpStatus = status;
  error.httpCode = code;
  if (extra) Object.assign(error, extra);
  return error;
}

function normalizeAddress(value) {
  const text = String(value || "").trim().toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(text) ? text : "";
}

function getMintEnv() {
  const contract = normalizeAddress(process.env.EXPEDITION_NFT_CONTRACT);
  const minterSecret = String(process.env.EXPEDITION_MINTER_SECRET || process.env.TOKEN_TREASURY_SECRET || "").trim();
  const rpcUrl = String(process.env.NFT_RPC_URL || process.env.TOKEN_RPC_URL || "").trim() || null;
  const chainId = Number(process.env.NFT_CHAIN_ID || process.env.TOKEN_CHAIN_ID) || null;
  let minterAddress = "";
  if (minterSecret) {
    try { minterAddress = new Wallet(minterSecret).address.toLowerCase(); } catch { minterAddress = ""; }
  }
  return {
    contract,
    minterSecret,
    minterAddress,
    rpcUrl,
    chainId,
    explorerUrl: String(process.env.NFT_EXPLORER_URL || "").trim() || null,
    configured: Boolean(contract && minterAddress && rpcUrl && chainId),
    // Quiet test on prod with a throwaway collection: neutral names and a
    // placeholder image in the metadata, so no boss art reaches the chain/OpenSea.
    testMode: String(process.env.EXPEDITION_NFT_TEST_MODE || "").trim() === "1",
  };
}

function rpcUnavailable(cause) {
  const error = new Error("Chain RPC is unavailable.");
  error.code = "RPC_UNAVAILABLE";
  error.cause = cause;
  return error;
}

/** ethers-backed client; `overrides` inject fakes in tests. */
function createMintClient(overrides = {}) {
  const env = getMintEnv();
  let provider = overrides.provider || null;
  let contract = overrides.contract || null;
  let signer = overrides.signer || null;

  function requireProvider() {
    if (provider) return provider;
    if (!env.rpcUrl || !env.chainId) throw new Error("Expedition NFT chain env is incomplete (RPC/chainId).");
    provider = new JsonRpcProvider(env.rpcUrl, env.chainId);
    return provider;
  }
  function requireContract() {
    if (contract) return contract;
    if (!env.contract) throw new Error("EXPEDITION_NFT_CONTRACT is not configured.");
    contract = new Contract(env.contract, TROPHY_ABI, requireProvider());
    return contract;
  }
  function requireSigner() {
    if (signer) return signer;
    if (!env.minterSecret) throw new Error("EXPEDITION_MINTER_SECRET is not configured.");
    signer = new Wallet(env.minterSecret, requireProvider());
    return signer;
  }

  return {
    env,
    async hasClaimed(wallet, bossId) {
      try { return Boolean(await requireContract().claimed(bossId, wallet)); } catch (error) { throw rpcUnavailable(error); }
    },
    async bossOf(tokenId) {
      try { return Number(await requireContract().bossOf(tokenId)); } catch (error) { throw rpcUnavailable(error); }
    },
    /** Sends mint(to, bossId); resolves with the tx hash + nonce (not yet mined). */
    async sendMint(to, bossId) {
      const writer = requireContract().connect(requireSigner());
      try {
        const tx = await writer.mint(to, bossId);
        return { txHash: tx.hash, nonce: Number(tx.nonce) };
      } catch (error) {
        if (error?.code === "NETWORK_ERROR" || error?.code === "TIMEOUT" || error?.code === "SERVER_ERROR") throw rpcUnavailable(error);
        const reason = String(error?.reason || error?.shortMessage || error?.message || "send failed");
        const wrapped = new Error(reason);
        wrapped.code = /AlreadyClaimed/.test(reason) ? "ALREADY_CLAIMED" : "SEND_FAILED";
        throw wrapped;
      }
    },
    /** null while pending; { status, tokenId, serial, blockNumber } once mined. */
    async getReceipt(txHash) {
      try {
        const receipt = await requireProvider().getTransactionReceipt(txHash);
        if (!receipt) return null;
        let tokenId = null, serial = null;
        for (const log of receipt.logs || []) {
          if ((log.topics || [])[0] === MINTED_TOPIC && log.topics.length === 4) {
            tokenId = Number(BigInt(log.topics[3]));
            try { serial = Number(BigInt(log.data)); } catch { serial = null; }
          }
        }
        return { status: Number(receipt.status), tokenId, serial, blockNumber: Number(receipt.blockNumber) };
      } catch (error) {
        throw rpcUnavailable(error);
      }
    },
    async getMinterSnapshot() {
      try {
        const activeProvider = requireProvider();
        const c = requireContract();
        const [contractMinter, ethWei, totalMinted, baseUri] = await Promise.all([
          c.minter(), activeProvider.getBalance(env.minterAddress), c.totalMinted(), c.contractURI().catch(() => ""),
        ]);
        return {
          minterAddress: env.minterAddress,
          contractMinter: String(contractMinter).toLowerCase(),
          minterMatches: String(contractMinter).toLowerCase() === env.minterAddress,
          ethWei: BigInt(ethWei.toString()),
          totalMinted: Number(totalMinted),
          baseUri: String(baseUri).replace(/collection$/, ""),
        };
      } catch (error) {
        throw rpcUnavailable(error);
      }
    },
  };
}

// ---- queue document: pending mints + a short send lock + the tokenId registry (for metadata)
function emptyQueue() {
  return { version: 1, lock: null, pending: [], minted: {}, failed: [] };
}
function normalizeQueue(raw) {
  const q = raw && typeof raw === "object" ? raw : {};
  return {
    version: 1,
    lock: q.lock && q.lock.owner ? { owner: String(q.lock.owner), expiresAt: Number(q.lock.expiresAt) || 0 } : null,
    pending: Array.isArray(q.pending) ? q.pending.filter((e) => e && e.wallet && e.bossIndex) : [],
    minted: q.minted && typeof q.minted === "object" ? { ...q.minted } : {},
    failed: Array.isArray(q.failed) ? q.failed.slice(-200) : [],
  };
}
// One registry per contract: a test collection and the real one never share
// tokenIds, and swapping EXPEDITION_NFT_CONTRACT starts from a clean queue.
const queueDocs = new Map();
function queueDocFor(contract) {
  const key = contract ? QUEUE_PATH.replace(/\.json$/, `-${contract}.json`) : QUEUE_PATH;
  if (!queueDocs.has(key)) queueDocs.set(key, createBlobDocument({ path: key, empty: emptyQueue, normalize: normalizeQueue }));
  return queueDocs.get(key);
}

const DEFAULT_DEPS = {
  chain: null, // lazily created
  queue: null, // resolved per contract
  profiles: { getWalletProfile, updateWalletProfile },
  getConfig: getEconomyConfig,
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  receiptPollAttempts: 4,
  receiptPollMs: 2000,
  lockTtlMs: 20000,
  lockWaitMs: 10000,
  lockPollMs: 500,
};
let configuredDeps = {};
function configureDeps(overrides) { configuredDeps = overrides || {}; }
function resolveDeps(overrides) {
  const deps = { ...DEFAULT_DEPS, ...configuredDeps, ...(overrides || {}) };
  if (!deps.chain) deps.chain = createMintClient();
  if (!deps.queue) deps.queue = queueDocFor(deps.chain.env.contract);
  return deps;
}

async function updateQueue(deps, mutate) {
  // CAS on the document: re-read and retry a few times on an etag conflict.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data, etag } = await deps.queue.readConsistent();
    const next = mutate(normalizeQueue(JSON.parse(JSON.stringify(data))));
    if (next === null) return data;
    try {
      await deps.queue.write(next, { ifMatch: etag });
      return next;
    } catch (error) {
      if (attempt === 3 || !/etag|precondition|412/i.test(String(error?.message || error?.code || ""))) throw error;
    }
  }
  return null;
}

async function acquireLock(deps, owner) {
  const attempts = Math.max(1, Math.ceil(deps.lockWaitMs / deps.lockPollMs));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let got = false;
    await updateQueue(deps, (q) => {
      const now = deps.now();
      if (q.lock && q.lock.expiresAt > now && q.lock.owner !== owner) return null;
      q.lock = { owner, expiresAt: now + deps.lockTtlMs };
      got = true;
      return q;
    });
    if (got) return true;
    await deps.sleep(deps.lockPollMs);
  }
  return false;
}
async function releaseLock(deps, owner) {
  await updateQueue(deps, (q) => { if (!q.lock || q.lock.owner !== owner) return null; q.lock = null; return q; }).catch(() => null);
}

/** The wallet's trophy record for this boss — only if it belongs to the current contract. */
function nftOf(profile, bossIndex, contract) {
  const p = profile?.expeditions?.progress?.[bossIndex];
  const nft = p && p.nft && typeof p.nft === "object" ? p.nft : null;
  return isCurrentTrophy(nft, contract) ? nft : null;
}
function isCurrentTrophy(nft, contract = getMintEnv().contract) {
  if (!nft) return false;
  if (nft.contract && contract && nft.contract !== contract) return false; // minted on another (test) collection
  return true;
}

async function setNftStatus(deps, wallet, bossIndex, patch) {
  await deps.profiles.updateWalletProfile(wallet, (profile) => {
    const progress = profile.expeditions.progress[bossIndex] || { bestStars: 0, attempts: 0, wins: 0, forfeits: 0, paidStars: [], nft: null, lastResult: null };
    const same = isCurrentTrophy(progress.nft, deps.chain.env.contract) ? progress.nft : null;
    progress.nft = { ...(same || {}), ...patch, contract: deps.chain.env.contract || null, updatedAt: new Date(deps.now()).toISOString() };
    profile.expeditions.progress[bossIndex] = progress;
    return profile;
  });
}

/**
 * Mint the trophy for (wallet, bossIndex) under the send lock and wait briefly
 * for the receipt. Returns { status: 'minted', tokenId, txHash } or
 * { status: 'sent', txHash } when the receipt is still pending. Throws on a
 * failed send.
 */
async function mintNow(deps, wallet, bossIndex) {
  const owner = `mint:${wallet}:${bossIndex}:${deps.now()}`;
  if (!(await acquireLock(deps, owner))) throw fail(503, "MINT_BUSY", "Minting is busy — try again in a moment.");
  let sent;
  try {
    sent = await deps.chain.sendMint(wallet, bossIndex);
  } finally {
    await releaseLock(deps, owner);
  }
  for (let attempt = 0; attempt < deps.receiptPollAttempts; attempt += 1) {
    const receipt = await deps.chain.getReceipt(sent.txHash).catch(() => null);
    if (receipt) {
      if (receipt.status !== 1) throw fail(502, "MINT_FAILED", "The mint transaction failed on-chain.", { txHash: sent.txHash });
      return { status: "minted", tokenId: receipt.tokenId, serial: receipt.serial, txHash: sent.txHash, blockNumber: receipt.blockNumber };
    }
    if (attempt < deps.receiptPollAttempts - 1) await deps.sleep(deps.receiptPollMs);
  }
  return { status: "sent", txHash: sent.txHash };
}

async function recordMinted(deps, wallet, bossIndex, outcome) {
  await setNftStatus(deps, wallet, bossIndex, { status: "minted", tokenId: outcome.tokenId, serial: outcome.serial, txHash: outcome.txHash, error: null });
  await updateQueue(deps, (q) => {
    q.pending = q.pending.filter((e) => !(e.wallet === wallet && e.bossIndex === bossIndex));
    if (outcome.tokenId != null) q.minted[String(outcome.tokenId)] = { wallet, bossIndex, serial: outcome.serial ?? null, txHash: outcome.txHash, at: new Date(deps.now()).toISOString() };
    return q;
  });
}

/**
 * Player pressed "Claim boss NFT". Requires a 3★ best result and no trophy yet.
 * Minting off / not configured → the right is recorded as `pending` and the
 * cron (`processMintQueue`) mints later. A failed send → status back to `none`
 * (the button returns) and the error is reported.
 */
async function claimTrophy(wallet, bossIndex, depOverrides) {
  const deps = resolveDeps(depOverrides);
  const index = Math.floor(Number(bossIndex));
  if (!getBoss(index)) throw fail(400, "BOSS_UNKNOWN", "Unknown boss.");
  const profile = await deps.profiles.getWalletProfile(wallet);
  const progress = profile.expeditions.progress[index];
  if (!progress || Number(progress.bestStars) < 3) throw fail(403, "NOT_EARNED", "Earn 3 stars to claim the boss NFT.");
  const current = nftOf(profile, index, deps.chain.env.contract);
  if (current && current.status === "minted") throw fail(409, "ALREADY_MINTED", "This boss NFT is already in your wallet.", { tokenId: current.tokenId });
  if (current && current.status === "sent") return { status: "pending", txHash: current.txHash };

  const cfg = await deps.getConfig();
  const canMint = isMintEnabled(cfg) && deps.chain.env.configured;
  if (!canMint) {
    await setNftStatus(deps, wallet, index, { status: "pending", error: null });
    await updateQueue(deps, (q) => {
      if (!q.pending.some((e) => e.wallet === wallet && e.bossIndex === index)) q.pending.push({ wallet, bossIndex: index, attempts: 0, at: new Date(deps.now()).toISOString() });
      return q;
    });
    return { status: "pending" };
  }

  await setNftStatus(deps, wallet, index, { status: "pending", error: null });
  try {
    const outcome = await mintNow(deps, wallet, index);
    if (outcome.status === "minted") {
      await recordMinted(deps, wallet, index, outcome);
      return { status: "minted", tokenId: outcome.tokenId, txHash: outcome.txHash };
    }
    // Sent but not yet mined: keep it in the queue so the cron settles it.
    await setNftStatus(deps, wallet, index, { status: "sent", txHash: outcome.txHash });
    await updateQueue(deps, (q) => {
      q.pending = q.pending.filter((e) => !(e.wallet === wallet && e.bossIndex === index));
      q.pending.push({ wallet, bossIndex: index, attempts: 1, txHash: outcome.txHash, at: new Date(deps.now()).toISOString() });
      return q;
    });
    return { status: "pending", txHash: outcome.txHash };
  } catch (error) {
    if (error?.code === "ALREADY_CLAIMED") {
      // The chain says this wallet already holds the trophy (e.g. a lost receipt): trust it.
      await setNftStatus(deps, wallet, index, { status: "minted", error: null });
      return { status: "minted" };
    }
    await setNftStatus(deps, wallet, index, { status: "none", error: String(error?.code || error?.message || "MINT_FAILED") });
    await updateQueue(deps, (q) => { q.failed.push({ wallet, bossIndex: index, error: String(error?.code || error?.message || "MINT_FAILED"), at: new Date(deps.now()).toISOString() }); return q; });
    if (error?.httpStatus) throw error;
    throw fail(502, "MINT_FAILED", "Couldn't send the NFT, try again later.");
  }
}

/** Cron: settle sent mints and mint the pending ones while minting is on. */
async function processMintQueue(depOverrides, { limit = 5 } = {}) {
  const deps = resolveDeps(depOverrides);
  const cfg = await deps.getConfig();
  if (!isMintEnabled(cfg) || !deps.chain.env.configured) return { skipped: true, reason: "MINT_DISABLED" };
  const { data } = await deps.queue.readConsistent();
  const queue = normalizeQueue(data);
  let processed = 0, minted = 0, failed = 0;
  for (const entry of queue.pending.slice(0, limit)) {
    processed += 1;
    try {
      if (entry.txHash) {
        const receipt = await deps.chain.getReceipt(entry.txHash);
        if (!receipt) continue;
        if (receipt.status === 1) {
          await recordMinted(deps, entry.wallet, entry.bossIndex, { tokenId: receipt.tokenId, serial: receipt.serial, txHash: entry.txHash, blockNumber: receipt.blockNumber });
          minted += 1;
          continue;
        }
        // Mined but failed → try a fresh mint below.
      }
      const outcome = await mintNow(deps, entry.wallet, entry.bossIndex);
      if (outcome.status === "minted") {
        await recordMinted(deps, entry.wallet, entry.bossIndex, outcome);
        minted += 1;
      } else {
        await setNftStatus(deps, entry.wallet, entry.bossIndex, { status: "sent", txHash: outcome.txHash });
        await updateQueue(deps, (q) => { const e = q.pending.find((x) => x.wallet === entry.wallet && x.bossIndex === entry.bossIndex); if (e) { e.txHash = outcome.txHash; e.attempts = (e.attempts || 0) + 1; } return q; });
      }
    } catch (error) {
      failed += 1;
      const attempts = (entry.attempts || 0) + 1;
      if (error?.code === "ALREADY_CLAIMED") {
        await setNftStatus(deps, entry.wallet, entry.bossIndex, { status: "minted", error: null });
        await updateQueue(deps, (q) => { q.pending = q.pending.filter((x) => !(x.wallet === entry.wallet && x.bossIndex === entry.bossIndex)); return q; });
        continue;
      }
      if (attempts >= MAX_ATTEMPTS) {
        await setNftStatus(deps, entry.wallet, entry.bossIndex, { status: "none", error: String(error?.code || error?.message || "MINT_FAILED") });
        await updateQueue(deps, (q) => {
          q.pending = q.pending.filter((x) => !(x.wallet === entry.wallet && x.bossIndex === entry.bossIndex));
          q.failed.push({ wallet: entry.wallet, bossIndex: entry.bossIndex, error: String(error?.code || error?.message || "MINT_FAILED"), at: new Date(deps.now()).toISOString() });
          return q;
        });
      } else {
        await updateQueue(deps, (q) => { const e = q.pending.find((x) => x.wallet === entry.wallet && x.bossIndex === entry.bossIndex); if (e) { e.attempts = attempts; e.lastError = String(error?.code || error?.message || ""); } return q; });
      }
    }
  }
  return { skipped: false, processed, minted, failed, pending: Math.max(0, queue.pending.length - minted) };
}

/** Metadata for a tokenId: registry first (no RPC), chain as the fallback. */
async function getTrophyMetadata(tokenId, origin, depOverrides) {
  const deps = resolveDeps(depOverrides);
  const id = Math.floor(Number(tokenId));
  if (!Number.isFinite(id) || id < 1) return null;
  const { data } = await deps.queue.read();
  const queue = normalizeQueue(data);
  let entry = queue.minted[String(id)] || null;
  if (!entry && deps.chain.env.configured) {
    const bossIndex = await deps.chain.bossOf(id).catch(() => 0);
    if (bossIndex > 0) entry = { bossIndex, serial: null };
  }
  if (!entry) return null;
  const boss = getBoss(entry.bossIndex);
  if (!boss) return null;
  const base = String(origin || "").replace(/\/$/, "");
  if (deps.chain.env.testMode) {
    return {
      name: `Petix test trophy #${id}`,
      description: "Test collection of Petix Expeditions. Not a real boss trophy.",
      image: `${base}/assets/nft/placeholder.png`,
      external_url: `${base}/dashboard/?screen=expeditions`,
      attributes: [{ trait_type: "Boss number", value: boss.index, display_type: "number" }],
    };
  }
  // Owner decision 2026-10-09: name = boss name; traits Level (boss order), Family (partner collection), Season 1.
  return {
    name: boss.title,
    description: `Boss trophy of Petix Expeditions, Season 1. ${boss.title} is a tribute to ${boss.name}. Earned with a perfect three-star run.`,
    image: `${base}${boss.nftImage || boss.img}`,
    external_url: `${base}/dashboard/?screen=expeditions`,
    attributes: [
      { trait_type: "Level", value: boss.index },
      { trait_type: "Family", value: boss.name },
      { trait_type: "Season", value: 1 },
    ],
  };
}

function buildCollectionMetadata(origin, { testMode = getMintEnv().testMode } = {}) {
  const base = String(origin || "").replace(/\/$/, "");
  if (testMode) {
    return {
      name: "Petix test trophies",
      description: "Test collection of Petix Expeditions. Not real boss trophies.",
      image: `${base}/assets/nft/placeholder.png`,
      external_link: `${base}/dashboard/?screen=expeditions`,
    };
  }
  return {
    name: "Petix Expeditions",
    description: "Boss trophies of Petix Expeditions: one per wallet per boss, minted after a verified three-star run.",
    image: `${base}/assets/expeditions/nft/1.png`,
    external_link: `${base}/dashboard/?screen=expeditions`,
  };
}

module.exports = {
  MAX_ATTEMPTS,
  QUEUE_PATH,
  buildCollectionMetadata,
  claimTrophy,
  configureDeps,
  createMintClient,
  isCurrentTrophy,
  queueDocFor,
  emptyQueue,
  getMintEnv,
  getTrophyMetadata,
  normalizeQueue,
  processMintQueue,
};
