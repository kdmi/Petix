const { handleCors, json } = require("../../api/_lib/auth");
const { readDb } = require("../../api/_lib/store");
const { ROSTER, getBossSettings, getExpeditionConfig, isMintEnabled } = require("../../api/_lib/expeditions-config");
const { dayKey } = require("../../api/_lib/expeditions");
const { createMintClient, normalizeQueue, getMintEnv, isCurrentTrophy, queueDocFor } = require("../../api/_lib/expedition-nft");
const { summarizeGrants } = require("../../api/_lib/expedition-energy");
const { requireAdmin } = require("./_expeditions-shared");


// Everything the admin Expeditions tab shows, computed from wallet profiles
// (no hot shared document): today / 7 days, per boss, holder claims, mint
// queue, latest attempts.
module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (req.method !== "GET") { json(res, 405, { error: "Method not allowed." }); return; }
  if (!requireAdmin(req, res)) return;

  const now = Date.now();
  const today = dayKey(now);
  const week = new Set(Array.from({ length: 7 }, (_, i) => dayKey(now - i * 86400000)));
  const [cfg, db] = await Promise.all([getExpeditionConfig(), readDb()]);
  const records = db && db.records ? db.records : {};

  const sum = () => ({ attempts: 0, fees: 0, rewards: 0, wins: 0, stars3: 0, forfeits: 0, wallets: 0 });
  const todayTotals = sum(), weekTotals = sum();
  const bosses = ROSTER.map((boss) => ({ ...getBossSettings(cfg, boss.index), attempts: 0, wins: 0, stars3: 0, forfeits: 0, feesPaid: 0, rewardsPaid: 0, nftMinted: 0, nftPending: 0, claims: 0, claimEnergy: 0, cleared: 0 }));
  const attempts = [];
  let activeAttempts = 0;

  for (const [wallet, profile] of Object.entries(records)) {
    const x = profile?.expeditions;
    if (!x) continue;
    const daily = x.daily || {};
    let touchedToday = false, touchedWeek = false;
    for (const [day, d] of Object.entries(daily)) {
      const addTo = (t) => { t.attempts += Number(d.attempts) || 0; t.fees += Number(d.fees) || 0; t.rewards += Number(d.rewards) || 0; t.wins += Number(d.wins) || 0; t.stars3 += Number(d.stars3) || 0; t.forfeits += Number(d.forfeits) || 0; };
      if (day === today) { addTo(todayTotals); touchedToday = true; }
      if (week.has(day)) { addTo(weekTotals); touchedWeek = true; }
    }
    if (touchedToday) todayTotals.wallets += 1;
    if (touchedWeek) weekTotals.wallets += 1;
    if (x.active) activeAttempts += 1;
    for (const [key, p] of Object.entries(x.progress || {})) {
      const boss = bosses[Number(key) - 1];
      if (!boss || !p) continue;
      boss.attempts += Number(p.attempts) || 0;
      boss.wins += Number(p.wins) || 0;
      boss.stars3 += Number(p.stars3) || 0;
      boss.forfeits += Number(p.forfeits) || 0;
      boss.feesPaid += Number(p.feesPaid) || 0;
      boss.rewardsPaid += Number(p.rewardsPaid) || 0;
      if (Number(p.bestStars) > 0) boss.cleared += 1;
      const nft = isCurrentTrophy(p.nft) ? p.nft : null;
      if (nft?.status === "minted") boss.nftMinted += 1;
      if (nft?.status === "pending" || nft?.status === "sent") boss.nftPending += 1;
      if (p.lastResult?.at) attempts.push({ at: p.lastResult.at, wallet, bossIndex: Number(key), status: p.lastResult.status, won: !!p.lastResult.won, stars: Number(p.lastResult.stars) || 0, moves: p.lastResult.moves ?? null, par: boss.par, paid: Number(p.lastResult.paid) || 0, nft: nft?.status || null });
    }
    for (const [key, claim] of Object.entries(x.energyClaims || {})) {
      const boss = bosses[Number(key) - 1];
      if (!boss || !claim) continue;
      boss.claims += 1;
      boss.claimEnergy += Number(claim.energy) || 0;
    }
  }
  attempts.sort((a, b) => String(b.at).localeCompare(String(a.at)));

  const queue = normalizeQueue((await queueDocFor(getMintEnv().contract).read().catch(() => ({ data: null }))).data);
  const mintEnv = getMintEnv();
  let minter = null;
  if (mintEnv.configured) {
    try { const snap = await createMintClient().getMinterSnapshot(); minter = { ...snap, ethWei: snap.ethWei.toString() }; } catch { minter = { error: "RPC_UNAVAILABLE" }; }
  }
  const grants = await summarizeGrants().catch(() => []);

  json(res, 200, {
    generatedAt: new Date(now).toISOString(),
    flags: { enabled: Number(cfg.EXPEDITIONS_ENABLED) === 1, adminOnly: Number(cfg.EXPEDITIONS_ADMIN_ONLY) === 1, mintEnabled: isMintEnabled(cfg), mintConfigured: mintEnv.configured },
    today: todayTotals,
    week: weekTotals,
    activeAttempts,
    bosses: bosses.map((b) => ({ ...b, contractSet: Boolean(b.contract), contract: b.contract ? `${b.contract.slice(0, 6)}…${b.contract.slice(-4)}` : "", contractFull: b.contract })),
    mint: { pending: queue.pending, failed: queue.failed.slice(-30), mintedTotal: Object.keys(queue.minted).length, minter },
    grants,
    attempts: attempts.slice(0, 50),
  });
};
