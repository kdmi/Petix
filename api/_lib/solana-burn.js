const { createBlobDocument } = require("./blob-doc");
const { getEconomyConfig } = require("./economy-config");
const { getWalletProfile, updateWalletProfile } = require("./store");
const { creditSouls, fail } = require("./souls");

// Burning $PETIX on Solana for souls (031, owner 2026-10-16).
//
// The player picks a pack in the "Get more souls" popup. We build a transaction
// with one Token-2022 `burnChecked` instruction (the coins are destroyed, not
// sent to us) for the Solana wallet linked to the profile; the wallet signs and
// sends it. Then the client hands us the signature and we read the transaction
// from the chain ourselves: confirmed, our mint, the linked wallet as owner,
// exactly a pack's amount, never counted before. Only then souls are credited.
//
// Every counted burn is written to `soul-burns.json` (signature → wallet, coins,
// souls, time) before the souls: the registry is what stops a signature from
// paying twice.

const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const DEFAULT_MINT = "AgTgwEL3WgFm7LbJ8Sk59hswj15W4iXhe9tGt4gZasEt"; // $PETIX on Solana (public, on chain)
const DECIMALS = 6;
const BURN_CHECKED = 15; // SPL Token instruction index

const burnsDoc = createBlobDocument({
  path: "soul-burns.json",
  empty: () => ({ version: 1, burns: {}, totalCoins: 0, totalSouls: 0 }),
  normalize: (d) => ({
    version: 1,
    burns: (d && d.burns) || {},
    totalCoins: Math.max(0, Number(d && d.totalCoins) || 0),
    totalSouls: Math.max(0, Number(d && d.totalSouls) || 0),
  }),
});

function mintAddress() {
  return String(process.env.SOLANA_PETIX_MINT || DEFAULT_MINT).trim();
}

function rpcUrl() {
  return String(process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com").trim();
}

async function rpc(method, params, fetchImpl = globalThis.fetch) {
  const res = await fetchImpl(rpcUrl(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw fail(502, "RPC_UNAVAILABLE", "Solana is not answering right now. Try again in a minute.");
  const body = await res.json();
  if (body.error) throw fail(502, "RPC_ERROR", `Solana: ${body.error.message || "request failed"}.`);
  return body.result;
}

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/** The two packs from the economy config: coins burned → souls credited. */
function burnPacks(cfg) {
  return [
    { id: "small", coins: toInt(cfg.SOLANA_BURN_SMALL_COINS), souls: toInt(cfg.SOLANA_BURN_SMALL_SOULS) },
    { id: "big", coins: toInt(cfg.SOLANA_BURN_BIG_COINS), souls: toInt(cfg.SOLANA_BURN_BIG_SOULS) },
  ].filter((p) => p.coins > 0 && p.souls > 0);
}

function baseUnits(coins) {
  return BigInt(coins) * 10n ** BigInt(DECIMALS);
}

// ---- base58 (addresses, blockhash) -------------------------------------------------
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58decode(str) {
  let n = 0n;
  for (const ch of String(str)) {
    const v = B58.indexOf(ch);
    if (v < 0) throw fail(400, "BAD_ADDRESS", "Bad Solana address.");
    n = n * 58n + BigInt(v);
  }
  const bytes = [];
  while (n > 0n) { bytes.unshift(Number(n % 256n)); n /= 256n; }
  for (const ch of String(str)) { if (ch !== "1") break; bytes.unshift(0); }
  while (bytes.length < 32) bytes.unshift(0);
  return Buffer.from(bytes);
}

function u64le(value) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(value));
  return buf;
}

/**
 * A legacy transaction with one burnChecked instruction and an empty signature
 * slot for the owner, who is also the fee payer.
 * Accounts: [owner (signer, writable), token account (writable), mint (writable), Token-2022 (program)].
 */
function buildBurnTransaction({ owner, tokenAccount, mint, amount, blockhash }) {
  const header = Buffer.from([1, 0, 1]); // 1 signer, 0 read-only signers, 1 read-only non-signer
  const keys = [owner, tokenAccount, mint, TOKEN_2022_PROGRAM].map(b58decode);
  const data = Buffer.concat([Buffer.from([BURN_CHECKED]), u64le(amount), Buffer.from([DECIMALS])]);
  // burnChecked accounts: token account, mint, owner (authority)
  const instruction = Buffer.concat([Buffer.from([3, 3, 1, 2, 0, data.length]), data]);
  const message = Buffer.concat([header, Buffer.from([keys.length]), ...keys, b58decode(blockhash), Buffer.from([1]), instruction]);
  return Buffer.concat([Buffer.from([1]), Buffer.alloc(64), message]);
}

async function linkedSolana(wallet, deps) {
  const profile = await deps.getProfile(wallet);
  const address = profile.solana && profile.solana.address;
  if (!address) throw fail(409, "NO_SOLANA", "Link a Solana wallet in your profile first.");
  return address;
}

const DEFAULT_DEPS = {
  getProfile: getWalletProfile,
  updateProfile: updateWalletProfile,
  getConfig: () => getEconomyConfig(),
  rpc: (method, params) => rpc(method, params),
  registry: burnsDoc,
  now: () => new Date(),
};

function resolveDeps(overrides) {
  return { ...DEFAULT_DEPS, ...(overrides || {}) };
}

/** Build the burn transaction for a pack; the client has the linked wallet sign and send it. */
async function prepareBurn(wallet, { packId }, depOverrides) {
  const deps = resolveDeps(depOverrides);
  const cfg = await deps.getConfig();
  const pack = burnPacks(cfg).find((p) => p.id === String(packId || ""));
  if (!pack) throw fail(404, "PACK_UNKNOWN", "This burn pack is not offered.");
  const owner = await linkedSolana(wallet, deps);
  const mint = mintAddress();
  const amount = baseUnits(pack.coins);

  const accounts = await deps.rpc("getTokenAccountsByOwner", [owner, { mint }, { encoding: "jsonParsed", commitment: "confirmed" }]);
  const rows = ((accounts && accounts.value) || []).map((a) => ({
    pubkey: a.pubkey,
    amount: BigInt((a.account && a.account.data && a.account.data.parsed && a.account.data.parsed.info && a.account.data.parsed.info.tokenAmount && a.account.data.parsed.info.tokenAmount.amount) || "0"),
  }));
  const balance = rows.reduce((sum, r) => sum + r.amount, 0n);
  const source = rows.filter((r) => r.amount >= amount).sort((a, b) => (a.amount > b.amount ? -1 : 1))[0];
  if (!source) {
    throw fail(409, "NOT_ENOUGH_COINS", `You need ${pack.coins.toLocaleString("en-US")} $PETIX in your linked Solana wallet.`, {
      required: pack.coins,
      balance: Number(balance / 10n ** BigInt(DECIMALS)),
    });
  }
  const latest = await deps.rpc("getLatestBlockhash", [{ commitment: "confirmed" }]);
  const blockhash = latest && latest.value && latest.value.blockhash;
  if (!blockhash) throw fail(502, "RPC_ERROR", "Solana did not return a blockhash. Try again.");

  const tx = buildBurnTransaction({ owner, tokenAccount: source.pubkey, mint, amount, blockhash });
  return { packId: pack.id, coins: pack.coins, souls: pack.souls, owner, transaction: tx.toString("base64") };
}

/** Find a burn of our mint by `owner` in a jsonParsed transaction; returns base units burned. */
function burnedBy(tx, owner, mint) {
  const top = (tx.transaction && tx.transaction.message && tx.transaction.message.instructions) || [];
  const inner = ((tx.meta && tx.meta.innerInstructions) || []).flatMap((i) => i.instructions || []);
  let total = 0n;
  for (const ix of [...top, ...inner]) {
    const parsed = ix && ix.parsed;
    if (!parsed || (parsed.type !== "burnChecked" && parsed.type !== "burn")) continue;
    if (ix.programId !== TOKEN_2022_PROGRAM && ix.program !== "spl-token") continue;
    const info = parsed.info || {};
    if (info.mint !== mint) continue;
    const authority = info.authority || info.multisigAuthority;
    if (authority !== owner) continue;
    const amount = parsed.type === "burnChecked" ? (info.tokenAmount && info.tokenAmount.amount) : info.amount;
    total += BigInt(amount || "0");
  }
  return total;
}

/**
 * Check a burn on chain and pay souls once. Returns { status: "pending" } while
 * the transaction is not confirmed yet; the client asks again in a moment.
 */
async function confirmBurn(wallet, { signature }, depOverrides) {
  const deps = resolveDeps(depOverrides);
  const sig = String(signature || "").trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{60,100}$/.test(sig)) throw fail(400, "BAD_SIGNATURE", "That is not a Solana transaction signature.");
  const owner = await linkedSolana(wallet, deps);
  const mint = mintAddress();

  const { data: seen } = await deps.registry.read();
  if (seen.burns[sig]) throw fail(409, "ALREADY_COUNTED", "This burn was already counted.", { burn: seen.burns[sig] });

  const tx = await deps.rpc("getTransaction", [sig, { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 }]);
  if (!tx) return { status: "pending" };
  if (tx.meta && tx.meta.err) throw fail(400, "TX_FAILED", "This transaction failed on Solana: no coins were burned.");

  const burned = burnedBy(tx, owner, mint);
  if (burned === 0n) throw fail(400, "NOT_A_BURN", "This transaction doesn't burn $PETIX from your linked Solana wallet.");
  const cfg = await deps.getConfig();
  const pack = burnPacks(cfg).find((p) => baseUnits(p.coins) === burned);
  if (!pack) throw fail(400, "NOT_A_PACK", "The burned amount doesn't match a pack.");

  const at = deps.now().toISOString();
  const entry = { wallet: String(wallet).toLowerCase(), solana: owner, coins: pack.coins, souls: pack.souls, at };
  // Claim the signature first: a second confirm of the same burn finds it here.
  await deps.registry.mutate((doc) => {
    if (doc.burns[sig]) throw fail(409, "ALREADY_COUNTED", "This burn was already counted.", { burn: doc.burns[sig] });
    doc.burns[sig] = entry;
    doc.totalCoins += pack.coins;
    doc.totalSouls += pack.souls;
    return doc;
  });

  let profile;
  try {
    profile = await deps.updateProfile(wallet, (current) => {
      creditSouls(current, pack.souls);
      return current;
    });
  } catch (error) {
    // The souls didn't land: free the signature so the same burn can be confirmed again.
    await deps.registry.mutate((doc) => {
      if (doc.burns[sig]) {
        delete doc.burns[sig];
        doc.totalCoins = Math.max(0, doc.totalCoins - pack.coins);
        doc.totalSouls = Math.max(0, doc.totalSouls - pack.souls);
      }
      return doc;
    }).catch(() => null);
    throw error;
  }
  return { status: "credited", signature: sig, coins: pack.coins, soulsGained: pack.souls, souls: profile.souls };
}

/** What the popup needs: packs, the coin link, the running total. */
async function burnView(cfg, depOverrides) {
  const deps = resolveDeps(depOverrides);
  const mint = mintAddress();
  let totalCoins = 0;
  try { totalCoins = (await deps.registry.read()).data.totalCoins; } catch { totalCoins = 0; }
  return {
    mint,
    url: `https://dexscreener.com/solana/${mint}`,
    packs: burnPacks(cfg),
    totalCoins,
  };
}

/** Admin summary of the burn registry: totals, how many burns and wallets, the latest ones. */
async function burnStats({ registry = burnsDoc, limit = 20 } = {}) {
  const { data } = await registry.read();
  const rows = Object.entries(data.burns || {}).map(([signature, b]) => ({ signature, ...b }));
  rows.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return {
    totalCoins: data.totalCoins,
    totalSouls: data.totalSouls,
    burns: rows.length,
    wallets: new Set(rows.map((r) => r.wallet)).size,
    recent: rows.slice(0, limit),
  };
}

module.exports = {
  DECIMALS,
  burnStats,
  TOKEN_2022_PROGRAM,
  buildBurnTransaction,
  burnPacks,
  burnView,
  burnedBy,
  burnsDoc,
  confirmBurn,
  mintAddress,
  prepareBurn,
};
