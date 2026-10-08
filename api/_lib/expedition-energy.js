// Expeditions (026): bonus energy grants — the one-off capsule airdrop and the
// manual "grant a list of wallets" tool. Idempotent per campaign label: a wallet
// receives a label once, ever. Wallets without a profile yet get the grant
// parked in a small document and applied the next time they show up.
const { createBlobDocument } = require("./blob-doc");
const { grantBattleEnergy } = require("./battle-energy");
const { getWalletProfile, updateWalletProfile, readDb } = require("./store");
const { readNftState } = require("./nft-store");
const { getCapsuleTier } = require("./nft-tiers");
const { getEconomyConfig } = require("./economy-config");
const { isLikelyEvmAddress } = require("./auth");

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

/** Capsule airdrop preview: owners from the capsule index × energy per tier. */
async function previewCapsuleAirdrop({ nftState, config } = {}) {
  const state = nftState || (await readNftState());
  const cfg = config || (await getEconomyConfig());
  const perTier = cfg.EXPEDITION_CAPSULE_ENERGY || {};
  const byWallet = {};
  const byTier = {};
  let capsules = 0;
  for (const [tokenId, owner] of Object.entries(state.owners || {})) {
    const wallet = String(owner || "").toLowerCase();
    if (!isLikelyEvmAddress(wallet)) continue;
    const tier = getCapsuleTier(Number(tokenId));
    if (!tier) continue;
    const amount = Math.max(0, Math.floor(Number(perTier[tier]) || 0));
    capsules += 1;
    byTier[tier] = (byTier[tier] || 0) + 1;
    byWallet[wallet] = (byWallet[wallet] || 0) + amount;
  }
  const grants = Object.entries(byWallet).filter(([, amount]) => amount > 0).map(([wallet, amount]) => ({ wallet, amount }));
  return { wallets: grants.length, capsules, byTier, totalEnergy: grants.reduce((a, g) => a + g.amount, 0), grants };
}

async function runCapsuleAirdrop({ label, now = Date.now(), nftState, config, profiles, pending } = {}) {
  const preview = await previewCapsuleAirdrop({ nftState, config });
  if (!preview.grants.length) throw fail(400, "NO_HOLDERS", "The capsule index has no holders.");
  const result = await grantEnergy({ label, grants: preview.grants, now, profiles, pending });
  return { ...result, capsules: preview.capsules, byTier: preview.byTier, totalEnergy: preview.totalEnergy };
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
  return Object.values(labels).sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)));
}

module.exports = {
  MAX_GRANT,
  PENDING_PATH,
  applyGrantToProfile,
  applyPendingGrants,
  grantEnergy,
  normalizeLabel,
  previewCapsuleAirdrop,
  runCapsuleAirdrop,
  summarizeGrants,
};
