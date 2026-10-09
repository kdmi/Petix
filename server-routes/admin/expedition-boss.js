const { handleCors, json } = require("../../api/_lib/auth");
const { readDb } = require("../../api/_lib/store");
const { getEconomyConfig, setEconomyConfig } = require("../../api/_lib/economy-config");
const { getBoss, getBossSettings } = require("../../api/_lib/expeditions-config");
const { getNftEnv } = require("../../api/_lib/nft-chain");
const { parseJsonBody, requireAdmin, sendError } = require("./_expeditions-shared");

const ERC721_INTERFACE = "0x80ac58cd";

function fail(status, code, message) { const e = new Error(message); e.httpStatus = status; e.httpCode = code; return e; }

// Chain lookups are injectable for tests; by default ethers against NFT_RPC_URL.
let chainOverride = null;
function configureChain(chain) { chainOverride = chain; }
function resolveChain() {
  if (chainOverride) return chainOverride;
  const env = getNftEnv();
  if (!env.rpcUrl || !env.chainId) return null;
  const { Contract, JsonRpcProvider } = require("ethers");
  const provider = new JsonRpcProvider(env.rpcUrl, env.chainId);
  return {
    async isErc721(address) {
      const c = new Contract(address, ["function supportsInterface(bytes4) view returns (bool)"], provider);
      try {
        return Boolean(await c.supportsInterface(ERC721_INTERFACE));
      } catch (error) {
        // No code at the address or a contract without ERC-165 → "0x" / revert: not an ERC-721.
        if (error?.code === "BAD_DATA" || error?.code === "CALL_EXCEPTION") return false;
        const wrapped = new Error("Chain RPC is unavailable."); wrapped.code = "RPC_UNAVAILABLE"; wrapped.cause = error; throw wrapped;
      }
    },
    async blockNumber() { return Number(await provider.getBlockNumber()); },
  };
}

async function attemptsOf(bossIndex) {
  const db = await readDb();
  let attempts = 0;
  for (const profile of Object.values(db?.records || {})) attempts += Number(profile?.expeditions?.progress?.[bossIndex]?.attempts) || 0;
  return attempts;
}

// POST { action: "open" | "hide", bossIndex, reason }
// open: needs the collection contract (verified ERC-721 when an RPC is configured),
//       flips EXPEDITION_BOSS_OPEN and records the current block as openedBlock.
// hide: only a boss nobody has fought yet; clears openedBlock.
module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (req.method !== "POST") { json(res, 405, { error: "Method not allowed." }); return; }
  const session = requireAdmin(req, res);
  if (!session) return;
  try {
    const body = await parseJsonBody(req);
    const action = String(body?.action || "").trim();
    const bossIndex = Math.floor(Number(body?.bossIndex));
    const reason = String(body?.reason || "").trim() || `${action} boss ${bossIndex}`;
    if (!getBoss(bossIndex)) throw fail(400, "BOSS_UNKNOWN", "Unknown boss.");
    const cfg = await getEconomyConfig();
    const settings = getBossSettings(cfg, bossIndex);
    const open = [...cfg.EXPEDITION_BOSS_OPEN];
    const opened = [...cfg.EXPEDITION_BOSS_OPENED_BLOCK];
    const chain = resolveChain();
    let verified = null;
    let block = 0;

    if (action === "open") {
      if (settings.open) throw fail(409, "ALREADY_OPEN", "This boss is already open.");
      if (!settings.contract) throw fail(400, "CONTRACT_MISSING", "Add the collection contract before opening the boss.");
      if (chain) {
        verified = await chain.isErc721(settings.contract);
        if (!verified) throw fail(400, "CONTRACT_NOT_ERC721", "The collection contract does not look like an ERC-721.");
        block = await chain.blockNumber();
      }
      open[bossIndex - 1] = 1;
      opened[bossIndex - 1] = block;
    } else if (action === "hide") {
      if (!settings.open) throw fail(409, "ALREADY_HIDDEN", "This boss is already hidden.");
      const attempts = await attemptsOf(bossIndex);
      if (attempts > 0) throw fail(409, "HAS_ATTEMPTS", "A boss that has been fought can't be hidden — pause the mode instead.");
      open[bossIndex - 1] = 0;
      opened[bossIndex - 1] = 0;
    } else {
      throw fail(400, "BAD_ACTION", "action must be open or hide.");
    }
    const config = await setEconomyConfig({ EXPEDITION_BOSS_OPEN: open, EXPEDITION_BOSS_OPENED_BLOCK: opened }, { adminWallet: session.wallet, reason });
    json(res, 200, { ok: true, action, bossIndex, openedBlock: opened[bossIndex - 1], verified, boss: getBossSettings(config, bossIndex) });
  } catch (error) {
    sendError(res, error, "Could not update the boss.");
  }
};
module.exports.configureChain = configureChain;
