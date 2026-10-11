// Expeditions (026): does this wallet hold a partner collection right now?
// Rule (owner 2026-10-11): holding is enough — at least one token of the
// collection on the wallet at claim time. How it got there (mint, purchase,
// plain transfer) does not matter; the earlier "plain transfers after the boss
// opened don't count" check was dropped on purpose ("пусть обманывают, не страшно").
// One claim per collection per wallet still holds (energyClaims in the profile).
//
// Source of truth is the RPC (`balanceOf`). Blockscout's JSON API sits behind
// Cloudflare and answers server-side fetches with a 403 challenge page
// (checked 2026-10-09), so the explorer adapter is only a fallback.
const { Contract, JsonRpcProvider } = require("ethers");

const CHECK_TIMEOUT_MS = 15000;
const CACHE_TTL_MS = 5 * 60 * 1000;

function fail(status, code, message) {
  const e = new Error(message);
  e.httpStatus = status;
  e.httpCode = code;
  return e;
}
const lower = (v) => String(v || "").toLowerCase();

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
  };
}

function createRpc({ rpcUrl, chainId } = {}) {
  if (!rpcUrl || !chainId) return null;
  const provider = new JsonRpcProvider(rpcUrl, chainId);
  const ABI = ["function balanceOf(address) view returns (uint256)"];
  return {
    async blockNumber() { return Number(await provider.getBlockNumber()); },
    async balanceOf(contract, wallet, attempt = 0) {
      try {
        return Number(await new Contract(contract, ABI, provider).balanceOf(wallet));
      } catch (error) {
        if (attempt < 1) return this.balanceOf(contract, wallet, attempt + 1); // one retry: public RPCs drop bursts
        throw error;
      }
    },
  };
}

/**
 * Check one collection for a wallet. Returns { held, eligible, rejected, source }:
 * eligible = ["held:N"] when the wallet holds N > 0 tokens, [] otherwise; rejected is always [].
 */
async function checkCollection({ wallet, contract, explorer, rpc, cache, now = () => Date.now() }) {
  const owner = lower(wallet);
  const key = `${owner}:${lower(contract)}`;
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
  const value = { held, eligible: held > 0 ? [`held:${held}`] : [], rejected: [], source };
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
  return { explorer: createExplorer(process.env.NFT_EXPLORER_URL), rpc: createRpc({ rpcUrl, chainId }), cache: sharedCache };
}
let configured = null;
function configureDeps(overrides) { configured = overrides; }
function resolveDeps(overrides) { return { ...defaultDeps(), ...(configured || {}), ...(overrides || {}) }; }

module.exports = {
  CACHE_TTL_MS,
  CHECK_TIMEOUT_MS,
  checkCollection,
  configureDeps,
  createExplorer,
  createRpc,
  resolveDeps,
  withTimeout,
};
