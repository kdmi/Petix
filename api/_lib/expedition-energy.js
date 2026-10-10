// Expeditions (026): bonus energy grants — the one-off capsule airdrop and the
// manual "grant a list of wallets" tool. Idempotent per campaign label: a wallet
// receives a label once, ever. Wallets without a profile yet get the grant
// parked in a small document and applied the next time they show up.
const { createBlobDocument } = require("./blob-doc");
const { grantBattleEnergy } = require("./battle-energy");
const { getWalletProfile, updateWalletProfile, readDb } = require("./store");
const { readNftState } = require("./nft-store");
const { getCapsuleTier } = require("./nft-tiers");
const { isLikelyEvmAddress } = require("./auth");
const { createChainClient, isNftEnabled } = require("./nft-chain");

const PENDING_PATH = "expedition-energy-grants-pending.json";
const MAX_GRANT = 1000;

function fail(status, code, message) {
  const error = new Error(message);
  error.httpStatus = status;
  error.httpCode = code;
  return error;
}

function normalizePending(raw) {
  const doc = raw && typeof raw === "object" ? raw : {};
  const wallets = {};
  if (doc.wallets && typeof doc.wallets === "object") {
    for (const [wallet, list] of Object.entries(doc.wallets)) {
      if (Array.isArray(list) && list.length) wallets[wallet] = list.filter((g) => g && g.label && Number(g.amount) > 0);
    }
  }
  return { version: 1, wallets };
}
const pendingDoc = createBlobDocument({ path: PENDING_PATH, empty: () => ({ version: 1, wallets: {} }), normalize: normalizePending });

function normalizeLabel(value) {
  const label = String(value || "").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  if (label.length < 3 || label.length > 64) throw fail(400, "BAD_LABEL", "Label must be 3–64 chars (letters, digits, dots, dashes).");
  return label;
}

/** Apply one grant to a profile in place; false when the label was already applied. */
function applyGrantToProfile(profile, { label, amount, now = Date.now() }) {
  const x = profile.expeditions;
  if (x.grants && x.grants[label]) return false;
  profile.battleState = grantBattleEnergy(profile.battleState, { now: new Date(now), amount });
  x.grants = { ...(x.grants || {}), [label]: { amount, at: new Date(now).toISOString() } };
  return true;
}

/**
 * Grant `amount` energy under `label` to every wallet in `grants`.
 * Returns { applied, skipped, parked } counts. Wallets with no profile are
 * parked in the pending document (see applyPendingGrants).
 */
async function grantEnergy({ label: rawLabel, grants, now = Date.now(), profiles = { getWalletProfile, updateWalletProfile }, pending = pendingDoc }) {
  const label = normalizeLabel(rawLabel);
  const list = (Array.isArray(grants) ? grants : [])
    .map((g) => ({ wallet: String(g?.wallet || "").trim().toLowerCase(), amount: Math.floor(Number(g?.amount) || 0) }))
    .filter((g) => isLikelyEvmAddress(g.wallet) && g.amount > 0 && g.amount <= MAX_GRANT);
  if (!list.length) throw fail(400, "NO_GRANTS", "No valid wallets to grant.");
  let applied = 0, skipped = 0, parked = 0;
  const toPark = [];
  for (const grant of list) {
    const existing = await profiles.getWalletProfile(grant.wallet);
    const hasProfile = (existing.characters || []).length > 0 || Number(existing.currency?.totalEarned) > 0 || Object.keys(existing.expeditions?.grants || {}).length > 0 || existing.profileUpdatedAt;
    if (!hasProfile) { toPark.push(grant); continue; }
    let done = false;
    await profiles.updateWalletProfile(grant.wallet, (profile) => {
      done = applyGrantToProfile(profile, { label, amount: grant.amount, now });
      if (!done) throw Object.assign(new Error("skip"), { skip: true });
      return profile;
    }).catch((error) => { if (!error.skip) throw error; });
    if (done) applied += 1; else skipped += 1;
  }
  if (toPark.length) {
    const { data } = await pending.readConsistent();
    const doc = normalizePending(data);
    for (const grant of toPark) {
      const list = doc.wallets[grant.wallet] || [];
      if (!list.some((g) => g.label === label)) { list.push({ label, amount: grant.amount, at: new Date(now).toISOString() }); parked += 1; } else skipped += 1;
      doc.wallets[grant.wallet] = list;
    }
    await pending.write(doc);
  }
  return { label, applied, skipped, parked, total: list.length };
}

/** Called when a wallet shows up (expeditions config/state): apply what was parked for it. */
async function applyPendingGrants(wallet, { now = Date.now(), profiles = { updateWalletProfile }, pending = pendingDoc } = {}) {
  const key = String(wallet || "").trim().toLowerCase();
  if (!key) return 0;
  const { data } = await pending.read();
  const doc = normalizePending(data);
  const list = doc.wallets[key];
  if (!list || !list.length) return 0;
  let applied = 0;
  await profiles.updateWalletProfile(key, (profile) => {
    for (const grant of list) if (applyGrantToProfile(profile, { label: grant.label, amount: grant.amount, now })) applied += 1;
    return profile;
  });
  const fresh = normalizePending((await pending.readConsistent()).data);
  delete fresh.wallets[key];
  await pending.write(fresh);
  return applied;
}

const CAPSULE_TIERS = ["glass", "bronze", "silver", "gold", "prismatic"];
const MAX_INDEX_LAG_BLOCKS = 36000; // ≈ 1 hour on Robinhood Chain

/**
 * Capsule airdrop amounts (owner 2026-10-11): energy per capsule for each tier,
 * typed in the admin panel at drop time. A tier left empty pays 0; at least one
 * tier must pay something.
 */
function normalizeAirdropTiers(raw) {
  const tiers = {};
  for (const tier of CAPSULE_TIERS) {
    const value = raw && raw[tier] != null && raw[tier] !== "" ? Number(raw[tier]) : 0;
    if (!Number.isFinite(value) || value < 0 || value > MAX_GRANT || Math.floor(value) !== value) {
      throw fail(400, "BAD_AMOUNT", `${tier[0].toUpperCase()}${tier.slice(1)}: a whole number from 0 to ${MAX_GRANT}.`);
    }
    tiers[tier] = value;
  }
  if (!CAPSULE_TIERS.some((tier) => tiers[tier] > 0)) throw fail(400, "BAD_AMOUNT", "Enter energy for at least one tier.");
  return tiers;
}

/**
 * Who holds each capsule right now. No rule about how a capsule was obtained
 * (owner 2026-10-11): whoever holds it at drop time gets the drop. The capsule
 * index is synced by cron every minute; on top of it we replay the Transfer
 * events since its last synced block, read-only, so the drop sees the chain
 * as of the current block. Without NFT_ENABLED (dev/tests) the index is used as is.
 */
async function liveCapsuleOwners({ nftState, chain } = {}) {
  const state = nftState || (await readNftState());
  const owners = { ...(state.owners || {}) };
  const indexBlock = Number(state.lastSyncedBlock) || 0;
  // An index that never synced (fresh dev data) would mean scanning the whole chain — use it as is.
  const client = indexBlock > 0 ? chain || (isNftEnabled() ? createChainClient() : null) : null;
  if (!client) return { owners, block: indexBlock, indexBlock, caughtUp: 0, live: false };
  let scan;
  try {
    // The cron keeps the index within a minute (~600 blocks at ~0.1 s/block). A much older index
    // means the sync is stuck; better to refuse than to scan hours of chain inside a request.
    if (typeof client.getBlockNumber === "function") {
      const head = await client.getBlockNumber();
      if (head - indexBlock > MAX_INDEX_LAG_BLOCKS) {
        throw fail(409, "INDEX_BEHIND", `The capsule index is ${head - indexBlock} blocks behind the chain — wait for the capsule sync and try again.`);
      }
    }
    scan = await client.scanTransfers(indexBlock + 1, { maxBlocks: MAX_INDEX_LAG_BLOCKS });
  } catch (error) {
    if (error.httpStatus) throw error;
    throw Object.assign(new Error("Chain RPC is unavailable — try again."), { code: "RPC_UNAVAILABLE", cause: error });
  }
  for (const transfer of scan.transfers || []) {
    const key = String(Number(transfer.tokenId));
    const to = String(transfer.to || "").toLowerCase();
    if (!isLikelyEvmAddress(to) || /^0x0{40}$/.test(to)) delete owners[key];
    else owners[key] = to;
  }
  return { owners, block: Math.max(indexBlock, Number(scan.toBlock) || 0), indexBlock, caughtUp: (scan.transfers || []).length, live: true };
}

/** Capsule airdrop preview: current holders × energy per capsule of its tier. */
async function previewCapsuleAirdrop({ nftState, chain, tiers: rawTiers } = {}) {
  const tiers = normalizeAirdropTiers(rawTiers);
  const snapshot = await liveCapsuleOwners({ nftState, chain });
  const byWallet = {};
  const byTier = Object.fromEntries(CAPSULE_TIERS.map((tier) => [tier, { capsules: 0, perCapsule: tiers[tier], energy: 0 }]));
  let capsules = 0;
  for (const [tokenId, owner] of Object.entries(snapshot.owners)) {
    const wallet = String(owner || "").toLowerCase();
    if (!isLikelyEvmAddress(wallet)) continue;
    const tier = getCapsuleTier(Number(tokenId));
    if (!tier || !byTier[tier]) continue;
    capsules += 1;
    byTier[tier].capsules += 1;
    byTier[tier].energy += tiers[tier];
    if (tiers[tier] > 0) byWallet[wallet] = (byWallet[wallet] || 0) + tiers[tier];
  }
  // One grant per wallet is capped like any grant; a whale's sum above the cap is clipped.
  const grants = Object.entries(byWallet).map(([wallet, amount]) => ({ wallet, amount: Math.min(amount, MAX_GRANT) }));
  return {
    tiers,
    wallets: grants.length,
    holders: new Set(Object.values(snapshot.owners).map((o) => String(o || "").toLowerCase())).size,
    capsules,
    byTier,
    totalEnergy: grants.reduce((a, g) => a + g.amount, 0),
    block: snapshot.block,
    live: snapshot.live,
    grants,
  };
}

/** A fresh label per drop (repeatable drops); the caller may pass its own. */
function defaultAirdropLabel(now = Date.now()) {
  const d = new Date(now);
  const p = (n) => String(n).padStart(2, "0");
  return `capsules-${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
}

async function runCapsuleAirdrop({ label, tiers, now = Date.now(), nftState, chain, profiles, pending } = {}) {
  const preview = await previewCapsuleAirdrop({ nftState, chain, tiers });
  if (!preview.grants.length) throw fail(400, "NO_HOLDERS", "Nobody holds a capsule of the tiers you set.");
  const result = await grantEnergy({ label: label || defaultAirdropLabel(now), grants: preview.grants, now, profiles, pending });
  return { ...result, tiers: preview.tiers, wallets: preview.wallets, capsules: preview.capsules, byTier: preview.byTier, totalEnergy: preview.totalEnergy, block: preview.block, live: preview.live };
}

/** Which labels have been granted to how many wallets (for the admin journal). */
async function summarizeGrants() {
  const db = await readDb();
  const labels = {};
  for (const profile of Object.values(db?.records || {})) {
    const grants = profile?.expeditions?.grants || {};
    for (const [label, grant] of Object.entries(grants)) {
      const entry = labels[label] || { label, wallets: 0, energy: 0, lastAt: null };
      entry.wallets += 1;
      entry.energy += Number(grant?.amount) || 0;
      if (!entry.lastAt || String(grant?.at) > entry.lastAt) entry.lastAt = grant?.at || null;
      labels[label] = entry;
    }
  }
  // Wallets without a profile yet: parked until their first visit, but part of the drop.
  const { data } = await pendingDoc.readConsistent().catch(() => ({ data: null }));
  for (const list of Object.values(normalizePending(data).wallets || {})) {
    for (const grant of list || []) {
      const entry = labels[grant.label] || { label: grant.label, wallets: 0, energy: 0, lastAt: null };
      entry.wallets += 1;
      entry.energy += Number(grant.amount) || 0;
      entry.parked = (entry.parked || 0) + 1;
      if (!entry.lastAt || String(grant.at) > entry.lastAt) entry.lastAt = grant.at || null;
      labels[grant.label] = entry;
    }
  }
  return Object.values(labels).sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)));
}

module.exports = {
  MAX_GRANT,
  PENDING_PATH,
  applyGrantToProfile,
  applyPendingGrants,
  grantEnergy,
  normalizeLabel,
  defaultAirdropLabel,
  CAPSULE_TIERS,
  liveCapsuleOwners,
  normalizeAirdropTiers,
  previewCapsuleAirdrop,
  runCapsuleAirdrop,
  summarizeGrants,
};
