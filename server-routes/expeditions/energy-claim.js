const { handleCors, json, parseJsonBody } = require("../../api/_lib/auth");
const { getWalletProfile, updateWalletProfile } = require("../../api/_lib/store");
const { grantBattleEnergy } = require("../../api/_lib/battle-energy");
const { ROSTER, getBossSettings } = require("../../api/_lib/expeditions-config");
const { checkCollection, resolveDeps, withTimeout } = require("../../api/_lib/expedition-collections");
const { assertExpeditionsAccess, fail, requireMethod, sendDomainError } = require("./_shared");

// Holder energy (026, US4). GET → the collections of open bosses with this wallet's
// claim status. POST { collections: [bossIndex…] } → check the wallet on-chain for
// each and grant the flat amount once per collection. ONE profile write per claim.
function listCollections(cfg, profile) {
  return ROSTER.map((boss) => getBossSettings(cfg, boss.index))
    .filter((b) => b.open && b.contract && b.energy > 0)
    .map((b) => ({ bossIndex: b.index, title: b.title, name: b.name, url: b.url, energy: b.energy, status: profile.expeditions.energyClaims[b.index] ? "claimed" : "claimable", claimedAt: profile.expeditions.energyClaims[b.index]?.at || null }));
}

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  const access = await assertExpeditionsAccess(req, res);
  if (!access) return;
  const { session, cfg } = access;
  const wallet = session.wallet;
  try {
    const profile = await getWalletProfile(wallet);
    const collections = listCollections(cfg, profile);
    if (req.method === "GET") {
      json(res, 200, { collections, wallet: { points: profile.currency.balance, energy: profile.battleState.energyCurrent } });
      return;
    }
    if (!requireMethod(req, res, "POST")) return;
    const body = await parseJsonBody(req);
    const wanted = Array.isArray(body?.collections) && body.collections.length ? body.collections.map(Number) : collections.map((c) => c.bossIndex);
    const targets = collections.filter((c) => wanted.includes(c.bossIndex));
    if (!targets.length) throw fail(400, "NOTHING_TO_CLAIM", "No open collections to claim.");
    const claimable = targets.filter((c) => c.status === "claimable");
    const dryRun = body?.check === true; // step 1 of the two-step popup: look at the wallet, grant nothing
    if (!claimable.length) {
      if (dryRun) { json(res, 200, { checked: true, results: [], energyAdded: 0, wallet: { points: profile.currency.balance, energy: profile.battleState.energyCurrent }, collections }); return; }
      throw fail(409, "ALREADY_CLAIMED", "All selected collections were claimed already.");
    }

    const deps = resolveDeps();
    const marketplaces = cfg.EXPEDITION_MARKETPLACE_CONTRACTS || [];
    const results = [];
    await withTimeout((async () => {
      for (const c of claimable) {
        const settings = getBossSettings(cfg, c.bossIndex);
        const check = await checkCollection({ wallet, contract: settings.contract, openedBlock: settings.openedBlock, marketplaces, explorer: deps.explorer, rpc: deps.rpc, cache: deps.cache });
        results.push({ bossIndex: c.bossIndex, name: c.name, energy: c.energy, held: check.held, eligible: check.eligible.length, rejected: check.rejected.length, status: check.held === 0 ? "not_held" : check.eligible.length ? (dryRun ? "eligible" : "granted") : "not_eligible" });
      }
    })());
    if (dryRun) {
      json(res, 200, { checked: true, results, energyAdded: 0, wallet: { points: profile.currency.balance, energy: profile.battleState.energyCurrent }, collections });
      return;
    }
    const granted = results.filter((r) => r.status === "granted");
    let energyAdded = 0;
    if (granted.length) {
      await updateWalletProfile(wallet, (current) => {
        const now = Date.now();
        for (const r of granted) {
          if (current.expeditions.energyClaims[r.bossIndex]) { r.status = "claimed"; continue; }
          current.battleState = grantBattleEnergy(current.battleState, { now: new Date(now), amount: r.energy });
          current.expeditions.energyClaims[r.bossIndex] = { at: new Date(now).toISOString(), energy: r.energy, held: r.held, eligible: r.eligible, block: getBossSettings(cfg, r.bossIndex).openedBlock };
          energyAdded += r.energy;
        }
        return current;
      });
    }
    const saved = await getWalletProfile(wallet);
    json(res, 200, { results, energyAdded, wallet: { points: saved.currency.balance, energy: saved.battleState.energyCurrent }, collections: listCollections(cfg, saved) });
  } catch (error) {
    if (sendDomainError(res, error)) return;
    console.error("[expeditions] energy-claim failed", error);
    json(res, 500, { error: "Could not check your wallet — try again later.", code: "CLAIM_FAILED" });
  }
};
