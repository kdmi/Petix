// Expeditions (026): does this wallet hold a partner collection in a way that
// earns the holder energy? Rule (owner decision 2026-10-07): a token counts
// unless it arrived by a PLAIN transfer after the boss was opened; mints and
// marketplace purchases after opening count.
//
// Source of truth is the RPC only: Blockscout's JSON API sits behind Cloudflare
// and answers server-side fetches with a 403 challenge page (checked 2026-10-09),
// so the optional explorer adapter is kept as an accelerator but never required.
// The RPC path needs no ERC721Enumerable: `balanceOf` gives the count, the
// Transfer logs since `openedBlock` (a recent block, so the scan is short) give
// the tokens that arrived after opening, `ownerOf` confirms they are still
// held, and anything held beyond those must predate the opening → eligible.
const { Contract, JsonRpcProvider, id: keccakId } = require("ethers");

const ZERO = "0x" + "0".repeat(40);
const TRANSFER_TOPIC = keccakId("Transfer(address,address,uint256)");
const ORDER_FULFILLED_TOPIC = keccakId("OrderFulfilled(bytes32,address,address,address,(uint8,address,uint256,uint256)[],(uint8,address,uint256,uint256,address)[])");
const CHECK_TIMEOUT_MS = 15000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_CHUNK = 250000;

function fail(status, code, message) {
  const e = new Error(message);
  e.httpStatus = status;
  e.httpCode = code;
  return e;
}
const lower = (v) => String(v || "").toLowerCase();
const padTopic = (addr) => "0x" + lower(addr).replace(/^0x/, "").padStart(64, "0");

// ---- real adapters -------------------------------------------------------------
function createExplorer(baseUrl, fetchImpl = globalThis.fetch) {
  const base = String(baseUrl || "").replace(/\/$/, "");
  if (!base || !fetchImpl) return null;
  async function getJson(url) {
    const res = await fetchImpl(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw Object.assign(new Error(`explorer ${res.status}`), { code: "EXPLORER_UNAVAILABLE" });
    return res.json();
  }
  return {
    /** tokenIds of `contract` held by `wallet` (follows pagination up to 10 pages). */
    async listNfts(wallet, contract) {
      const ids = [];
      let next = "";
      for (let page = 0; page < 10; page += 1) {
        const data = await getJson(`${base}/api/v2/addresses/${wallet}/nft?type=ERC-721${next}`);
        for (const item of data.items || []) {
          if (lower(item?.token?.address_hash || item?.token?.address) === lower(contract) && item.id != null) ids.push(String(item.id));
        }
        const np = data.next_page_params;
        if (!np) break;
        next = "&" + Object.entries(np).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
      }
      return ids;
    },
    /** incoming ERC-721 transfers of `contract` to `wallet` since `fromBlock` → [{ tokenId, from, blockNumber, txHash }] */
    async listIncoming(wallet, contract, fromBlock) {
      const out = [];
      let next = "";
      for (let page = 0; page < 10; page += 1) {
        const data = await getJson(`${base}/api/v2/addresses/${wallet}/token-transfers?type=ERC-721&filter=to&token=${contract}${next}`);
        let stop = false;
        for (const item of data.items || []) {
          const block = Number(item.block_number);
          if (Number.isFinite(block) && block < fromBlock) { stop = true; continue; }
          out.push({ tokenId: String(item?.total?.token_id ?? item?.token_id ?? ""), from: lower(item?.from?.hash), blockNumber: block, txHash: item?.transaction_hash || item?.tx_hash });
        }
        if (stop || !data.next_page_params) break;
        next = "&" + Object.entries(data.next_page_params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
      }
      return out;
    },
  };
}

function createRpc({ rpcUrl, chainId, chunk = DEFAULT_CHUNK } = {}) {
  if (!rpcUrl || !chainId) return null;
  const provider = new JsonRpcProvider(rpcUrl, chainId);
  const ABI = ["function balanceOf(address) view returns (uint256)", "function ownerOf(uint256) view returns (address)"];
  return {
    async blockNumber() { return Number(await provider.getBlockNumber()); },
    async balanceOf(contract, wallet) {
      const c = new Contract(contract, ABI, provider);
      return Number(await c.balanceOf(wallet));
    },
    async ownerOf(contract, tokenId) {
      const c = new Contract(contract, ABI, provider);
      return lower(await c.ownerOf(tokenId));
    },
    async listIncoming(wallet, contract, fromBlock) {
      const latest = await provider.getBlockNumber();
      const out = [];
      for (let start = Math.max(0, fromBlock); start <= latest; start += chunk) {
        const end = Math.min(latest, start + chunk - 1);
        const logs = await provider.getLogs({ address: contract, fromBlock: start, toBlock: end, topics: [TRANSFER_TOPIC, null, padTopic(wallet)] });
        for (const log of logs) {
          if (!log.topics || log.topics.length !== 4) continue;
          out.push({ tokenId: BigInt(log.topics[3]).toString(), from: "0x" + log.topics[1].slice(-40), blockNumber: Number(log.blockNumber), txHash: log.transactionHash });
        }
      }
      return out;
    },
    async transaction(txHash, attempt = 0) {
      let tx, receipt;
      try {
        [tx, receipt] = await Promise.all([provider.getTransaction(txHash), provider.getTransactionReceipt(txHash)]);
      } catch (error) {
        if (attempt < 1) return this.transaction(txHash, attempt + 1); // one retry: public RPCs drop bursts
        throw error;
      }
      if (!tx || !receipt) throw Object.assign(new Error("transaction not found"), { code: "TX_NOT_FOUND" });
      return {
        to: lower(tx?.to),
        value: tx?.value != null ? BigInt(tx.value.toString()) : 0n,
        logs: (receipt?.logs || []).map((l) => ({ address: lower(l.address), topics: l.topics || [], data: l.data })),
      };
    },
  };
}

// ---- classification --------------------------------------------------------------
/** Does the transaction look like a purchase (marketplace call, sale event, or a payment to the previous owner)? */
function isPurchaseTx(tx, { marketplaces = [], previousOwner = "" } = {}) {
  if (!tx) return false;
  if (marketplaces.some((m) => lower(m) === tx.to)) return true;
  for (const log of tx.logs || []) {
    if (log.topics[0] === ORDER_FULFILLED_TOPIC) return true;
    // ERC-20 Transfer(to = previous owner): WETH/other payment for the token.
    if (log.topics[0] === TRANSFER_TOPIC && log.topics.length === 3 && previousOwner && lower("0x" + log.topics[2].slice(-40)) === lower(previousOwner)) return true;
  }
  return tx.value > 0n && previousOwner !== "";
}

/**
 * Check one collection for a wallet. Returns
 * { held, eligible: [tokenId | 'held-before-opening:N'], rejected: [{ tokenId, reason }], source }.
 */
async function checkCollection({ wallet, contract, openedBlock = 0, marketplaces = [], explorer, rpc, cache, now = () => Date.now() }) {
  const owner = lower(wallet);
  const key = `${owner}:${lower(contract)}:${openedBlock}`;
  if (cache) {
    const hit = cache.get(key);
    if (hit && hit.expiresAt > now()) return hit.value;
  }
  let held = null, source = "rpc";
  if (rpc) {
    try { held = Number(await rpc.balanceOf(contract, owner)); } catch { held = null; }
  }
  if (held === null && explorer) {
    source = "explorer";
    try { held = (await explorer.listNfts(owner, contract)).length; } catch { held = null; }
  }
  if (held === null || !Number.isFinite(held)) throw fail(503, "CHECK_UNAVAILABLE", "Could not read the collection — try again later.");
  if (!held) {
    const value = { held: 0, eligible: [], rejected: [], source };
    if (cache) cache.set(key, { value, expiresAt: now() + CACHE_TTL_MS });
    return value;
  }

  // Which tokens arrived after the boss opened, and are they still here?
  let incoming = [];
  if (openedBlock > 0) {
    let got = false;
    if (rpc) { try { incoming = await rpc.listIncoming(owner, contract, openedBlock); got = true; } catch { got = false; } }
    if (!got && explorer) { try { incoming = await explorer.listIncoming(owner, contract, openedBlock); got = true; } catch { got = false; } }
    if (!got) throw fail(503, "CHECK_UNAVAILABLE", "Could not read transfers — try again later.");
  }
  const latestIncoming = new Map();
  for (const t of incoming) {
    if (t.blockNumber < openedBlock) continue;
    const prev = latestIncoming.get(t.tokenId);
    if (!prev || prev.blockNumber < t.blockNumber) latestIncoming.set(t.tokenId, t);
  }
  const fresh = [];
  for (const t of latestIncoming.values()) {
    let stillOwned = true;
    if (rpc && rpc.ownerOf) { try { stillOwned = (await rpc.ownerOf(contract, t.tokenId)) === owner; } catch { stillOwned = false; } }
    if (stillOwned) fresh.push(t);
  }

  const eligible = [], rejected = [];
  // Held more than arrived after opening → at least one token predates the opening.
  const heldBefore = Math.max(0, held - fresh.length);
  if (heldBefore > 0) eligible.push(`held-before-opening:${heldBefore}`);
  for (const t of fresh) {
    if (t.from === ZERO) { eligible.push(String(t.tokenId)); continue; } // minted after opening
    let tx = null;
    if (rpc && t.txHash) { try { tx = await rpc.transaction(t.txHash); } catch { tx = null; } }
    if (tx && isPurchaseTx(tx, { marketplaces, previousOwner: t.from })) eligible.push(String(t.tokenId));
    else rejected.push({ tokenId: String(t.tokenId), reason: tx ? "plain_transfer_after_open" : "unverifiable_transfer" });
  }
  const value = { held, eligible, rejected, source };
  if (cache) cache.set(key, { value, expiresAt: now() + CACHE_TTL_MS });
  return value;
}

function withTimeout(promise, ms = CHECK_TIMEOUT_MS) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => { timer = setTimeout(() => reject(fail(504, "CHECK_TIMEOUT", "The wallet check took too long — try again later.")), ms); }),
  ]);
}

const sharedCache = new Map();
function defaultDeps() {
  const rpcUrl = String(process.env.NFT_RPC_URL || process.env.TOKEN_RPC_URL || "").trim();
  const chainId = Number(process.env.NFT_CHAIN_ID || process.env.TOKEN_CHAIN_ID) || null;
  const chunk = Number(process.env.NFT_SYNC_MAX_BLOCKS) || DEFAULT_CHUNK;
  return { explorer: createExplorer(process.env.NFT_EXPLORER_URL), rpc: createRpc({ rpcUrl, chainId, chunk }), cache: sharedCache };
}
let configured = null;
function configureDeps(overrides) { configured = overrides; }
function resolveDeps(overrides) { return { ...defaultDeps(), ...(configured || {}), ...(overrides || {}) }; }

module.exports = {
  CACHE_TTL_MS,
  CHECK_TIMEOUT_MS,
  ORDER_FULFILLED_TOPIC,
  TRANSFER_TOPIC,
  checkCollection,
  configureDeps,
  createExplorer,
  createRpc,
  isPurchaseTx,
  resolveDeps,
  withTimeout,
};
