const { getWalletProfile, updateWalletProfile } = require("./store");
const { normalizeEvmAddress } = require("./auth");

// Admin tool (026): wipe a wallet's Expeditions progress so test runs on prod
// do not count at launch — stars, per-boss counters, last results, NFT claim
// records, holder-energy claims and the daily counters the admin stats read.
// Stats are computed from profiles, so this also clears them for the wallet.
//
// Energy banked by holder-energy claims is taken back as far as it is unspent
// (the claim becomes available again; without this it would pay twice).
// Airdrop/manual grant labels (`grants`) stay: they are idempotency keys of
// real campaigns, not progress. Points are not touched.

function summarize(profile) {
  const x = profile?.expeditions || {};
  const progress = x.progress || {};
  let attempts = 0, wins = 0, stars3 = 0, feesPaid = 0, rewardsPaid = 0, nftClaims = 0;
  const bosses = [];
  for (const [key, p] of Object.entries(progress)) {
    if (!p) continue;
    bosses.push({ bossIndex: Number(key), bestStars: Number(p.bestStars) || 0, attempts: Number(p.attempts) || 0, nft: p.nft?.status || null });
    attempts += Number(p.attempts) || 0;
    wins += Number(p.wins) || 0;
    stars3 += Number(p.stars3) || 0;
    feesPaid += Number(p.feesPaid) || 0;
    rewardsPaid += Number(p.rewardsPaid) || 0;
    if (p.nft) nftClaims += 1;
  }
  const claims = Object.entries(x.energyClaims || {}).filter(([, c]) => c).map(([key, c]) => ({ bossIndex: Number(key), energy: Number(c.energy) || 0 }));
  const claimedEnergy = claims.reduce((sum, c) => sum + c.energy, 0);
  const energyGranted = Math.max(0, Math.floor(Number(profile?.battleState?.energyGranted) || 0));
  return {
    active: Boolean(x.active),
    attempts, wins, stars3, feesPaid, rewardsPaid, nftClaims,
    bosses: bosses.sort((a, b) => a.bossIndex - b.bossIndex),
    energyClaims: claims,
    claimedEnergy,
    energyGrantedBefore: energyGranted,
    energyRemoved: Math.min(energyGranted, claimedEnergy),
    dailyDays: Object.keys(x.daily || {}).length,
    tutorialSeen: x.tutorialSeen === true,
  };
}

function resetProfile(profile, { now = new Date() } = {}) {
  const plan = summarize(profile);
  const grants = profile?.expeditions?.grants || {};
  profile.expeditions = { active: null, progress: {}, energyClaims: {}, daily: {}, grants, tutorialSeen: false };
  if (plan.energyRemoved > 0) {
    profile.battleState = { ...(profile.battleState || {}), energyGranted: plan.energyGrantedBefore - plan.energyRemoved, updatedAt: now.toISOString() };
  }
  return plan;
}

function parseWallets(list) {
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const wallet = normalizeEvmAddress(String(raw || "").trim());
    if (wallet && !out.includes(wallet)) out.push(wallet);
  }
  return out;
}

/** dryRun (default) only reports what would be cleared. */
async function resetExpeditionProgress({ wallets, dryRun = true, now = new Date(), profiles = { getWalletProfile, updateWalletProfile } } = {}) {
  const list = parseWallets(wallets);
  if (!list.length) throw Object.assign(new Error("No valid 0x wallets."), { httpStatus: 400, httpCode: "NO_WALLETS" });
  if (list.length > 20) throw Object.assign(new Error("At most 20 wallets per call."), { httpStatus: 400, httpCode: "TOO_MANY_WALLETS" });
  const results = [];
  for (const wallet of list) {
    if (dryRun) {
      results.push({ wallet, ...summarize(await profiles.getWalletProfile(wallet)) });
      continue;
    }
    let plan = null;
    await profiles.updateWalletProfile(wallet, (profile) => {
      plan = resetProfile(profile, { now });
      return profile;
    });
    results.push({ wallet, ...plan, reset: true });
  }
  return { dryRun, results };
}

module.exports = { resetExpeditionProgress, resetProfile, summarize };
