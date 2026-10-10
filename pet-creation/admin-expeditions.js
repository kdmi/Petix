// Admin panel · Expeditions tab (feature 026). Mounted by app.js into
// #adminExpeditionsPanel; talks to /api/admin/expedition-stats,
// /api/admin/economy-config (EXPEDITION_* levers), /api/admin/expedition-boss,
// /api/admin/energy-grant, /api/admin/capsule-airdrop and /api/expeditions/mint-sync.
// Layout follows expedition-demo/admin.html: switches + today, season board,
// economy, holder energy, boss NFTs, attempts.
(function () {
  "use strict";

  const ctx = { apiRequest: null, showToast: null, escapeHtml: (v) => String(v), formatPoints: (v) => String(v) };
  const view = { stats: null, config: null, defaults: null, loading: false, error: "", saving: false, airdrop: null, airdropParams: null, attemptBoss: "all", attemptResult: "all", lastLoadedAt: 0 };
  let panel = null;
  let bound = false;

  const esc = (v) => ctx.escapeHtml(v == null ? "" : v);
  const num = (v) => ctx.formatPoints(Number(v) || 0);
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
  const shortWallet = (w) => (w && w.length > 12 ? `${w.slice(0, 6)}…${w.slice(-4)}` : w || "");
  const when = (iso) => (iso ? new Date(iso).toLocaleString("en-GB", { hour12: false }) : "—");

  function reasonValue() {
    const input = panel && panel.querySelector("#xaReason");
    const value = String((input && input.value) || "").trim();
    return value.length >= 3 ? value : "Expeditions admin panel";
  }

  async function load({ force = false } = {}) {
    if (!panel || view.loading) return;
    if (!force && view.stats && Date.now() - view.lastLoadedAt < 15000) { render(); return; }
    view.loading = true;
    view.error = "";
    render();
    try {
      const [stats, cfg] = await Promise.all([
        ctx.apiRequest("/api/admin/expedition-stats", {}, "GET"),
        ctx.apiRequest("/api/admin/economy-config", {}, "GET"),
      ]);
      view.stats = stats;
      view.config = cfg.config || null;
      view.defaults = cfg.defaults || null;
      view.lastLoadedAt = Date.now();
    } catch (error) {
      view.error = error.message || "Failed to load expeditions data.";
    } finally {
      view.loading = false;
      render();
    }
  }

  async function patchConfig(patch, reason) {
    const res = await ctx.apiRequest("/api/admin/economy-config", { patch, reason: reason || reasonValue() });
    view.config = res.config || view.config;
    return res;
  }

  // ---------- sections ----------
  function seg(key, options, current) {
    return `<div class="xa-seg">${options.map((o) => `<button type="button" class="${o.value === current ? "on" : ""}" data-xa-action="${key}" data-value="${o.value}">${esc(o.label)}</button>`).join("")}</div>`;
  }
  function stat(label, value, small, warn) {
    return `<article class="admin-stat-card${warn ? " xa-stat--warn" : ""}"><span class="admin-stat-label">${esc(label)}</span><strong class="admin-stat-value">${esc(value)}</strong>${small ? `<span class="xa-stat-small">${esc(small)}</span>` : ""}</article>`;
  }

  function sectionSwitches() {
    const s = view.stats, c = view.config;
    const access = Number(c.EXPEDITIONS_ENABLED) !== 1 ? "off" : Number(c.EXPEDITIONS_ADMIN_ONLY) === 1 ? "admins" : "everyone";
    const minter = s.mint && s.mint.minter;
    const eth = minter && !minter.error && minter.ethWei != null ? Number(BigInt(minter.ethWei)) / 1e18 : null;
    const net = (s.today.fees || 0) - (s.today.rewards || 0);
    return `
      <section class="xa-card">
        <div class="xa-toolbar">
          <div><h3>Expeditions</h3><p class="xa-hint">Who sees the tab and whether 3★ runs mint NFTs. Applies instantly, no redeploy.</p></div>
          <div class="xa-row">
            <span class="xa-label">Access</span>${seg("access", [{ value: "off", label: "Off" }, { value: "admins", label: "Admins only" }, { value: "everyone", label: "Everyone" }], access)}
            <span class="xa-label">NFT minting</span>${seg("minting", [{ value: "on", label: "On" }, { value: "off", label: "Paused" }], Number(c.EXPEDITION_NFT_MINT_ENABLED) === 1 ? "on" : "off")}
            ${!s.flags.mintConfigured ? '<span class="xa-pill xa-pill--warn">minter not configured</span>' : ""}
          </div>
        </div>
        <div class="admin-stats-grid xa-stats">
          ${stat("Attempts today", num(s.today.attempts), `${s.today.wallets} wallets · 7d: ${num(s.week.attempts)}`)}
          ${stat("Points collected", num(s.today.fees), `fees today · 7d: ${num(s.week.fees)}`)}
          ${stat("Rewards paid", num(s.today.rewards), `today · net sink ${net >= 0 ? "+" : ""}${num(net)}`)}
          ${stat("3★ runs", num(s.today.stars3), `today · 7d: ${num(s.week.stars3)}`)}
          ${stat("NFTs minted", num(s.mint.mintedTotal), `total · ${s.mint.pending.length} in queue · ${s.activeAttempts} fights live`)}
          ${eth == null ? stat("Minter ETH", minter && minter.error ? "RPC?" : "—", s.flags.mintConfigured ? "balance unknown" : "set EXPEDITION_NFT_CONTRACT + minter", true) : stat("Minter ETH", eth.toFixed(4), `≈ ${Math.floor(eth / 0.0000022)} mints${minter.minterMatches ? "" : " · MINTER MISMATCH"}`, eth < 0.005 || !minter.minterMatches)}
        </div>
        <div class="xa-row xa-reason"><span class="xa-label">Reason for changes</span><input type="text" id="xaReason" placeholder="why (logged with every change)" value="" /></div>
      </section>`;
  }

  function sectionBoard() {
    const s = view.stats;
    const open = s.bosses.filter((b) => b.open).length;
    const rows = s.bosses.map((b) => {
      const cleared = b.attempts > 0 ? b.wins : 0;
      const win = pct(b.wins, b.attempts), three = pct(b.stars3, b.attempts);
      const status = b.open ? `<span class="xa-pill xa-pill--open"><i></i>Open${b.openedBlock ? ` · block ${num(b.openedBlock)}` : ""}</span>` : '<span class="xa-pill xa-pill--hidden">Hidden</span>';
      const contract = b.open
        ? `<span class="xa-mono">${esc(b.contract || "—")}</span>${b.contractSet ? ' <span class="xa-ok">✓ set</span>' : ' <span class="xa-pill xa-pill--warn">no contract</span>'}`
        : `<input class="xa-addr" type="text" data-xa-contract="${b.index}" value="${esc(b.contractFull || "")}" placeholder="0x… collection contract" />${b.contractSet ? ' <span class="xa-ok">✓ set</span>' : ' <span class="xa-pill xa-pill--warn">no contract</span>'}`;
      const action = b.open
        ? `<button type="button" class="admin-secondary-btn xa-btn-sm" data-xa-action="hide" data-boss="${b.index}" ${b.attempts > 0 ? 'disabled title="A boss that has been fought can\'t be hidden"' : ""}>Hide</button>`
        : `<button type="button" class="admin-secondary-btn xa-btn-sm xa-btn-primary" data-xa-action="open" data-boss="${b.index}" ${b.contractSet ? "" : 'disabled title="Add the collection contract first"'}>Open boss</button>`;
      return `<tr class="${b.open ? "" : "xa-row--hidden"}">
        <td>${b.index}</td>
        <td><div class="xa-boss"><img src="${esc(b.img)}" alt="" /><div><div class="xa-boss-name">${esc(b.title)}</div><div class="xa-boss-coll"><a href="${esc(b.url)}" target="_blank" rel="noopener noreferrer">${esc(b.name)}</a> · ${contract}</div></div></div></td>
        <td>${status}</td>
        <td class="xa-num"><input class="xa-fee" type="number" min="0" step="100" data-xa-fee="${b.index}" value="${Number(b.fee) || 0}" /></td>
        <td class="xa-num">${b.attempts ? num(b.attempts) : "—"}</td>
        <td>${b.attempts ? `<div class="xa-bar" title="win ${win}% · 3★ ${three}%"><i style="width:${win}%"></i></div><div class="xa-muted">${win}% · 3★ ${three}%</div>` : '<span class="xa-muted">—</span>'}</td>
        <td class="xa-num">${b.attempts ? `${num(b.feesPaid)} → ${num(b.rewardsPaid)}` : "—"}</td>
        <td class="xa-num">${b.nftMinted || 0}${b.nftPending ? ` <span class="xa-muted">+${b.nftPending}</span>` : ""}</td>
        <td><div class="xa-row xa-row--tight"><input class="xa-energy" type="number" min="0" step="1" data-xa-energy="${b.index}" value="${Number(b.energy) || 0}" /><span class="xa-muted">per wallet</span></div></td>
        <td class="xa-num">${b.claims || 0}</td>
        <td>${action}</td>
      </tr>`;
    }).join("");
    return `
      <section class="xa-card">
        <div class="xa-toolbar">
          <div><h3>Season 1 · Heroes of Hood and Magic</h3><p class="xa-hint">Open bosses one by one. Opening verifies the collection contract on-chain and records the block that the holder-energy check counts from.</p></div>
          <div class="xa-row"><span class="xa-pill xa-pill--open"><i></i>${open} open</span><span class="xa-pill xa-pill--hidden">${s.bosses.length - open} hidden</span><button type="button" class="admin-secondary-btn xa-btn-sm" data-xa-action="save-board">Save fees · contracts · energy</button></div>
        </div>
        <div class="xa-tw"><table class="xa-table">
          <thead><tr><th>#</th><th>Boss · collection</th><th>Status</th><th class="xa-num">Fee</th><th class="xa-num">Attempts</th><th>Win / 3★</th><th class="xa-num">Points in → out</th><th class="xa-num">NFTs</th><th>Holder energy</th><th class="xa-num">Claims</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </section>`;
  }

  function sectionEconomy() {
    const c = view.config;
    const m = c.EXPEDITION_REWARD_MULTS || {};
    const t = c.EXPEDITION_CAPSULE_ENERGY || {};
    const field = (label, key, value, step = "1") => `<label class="xa-field">${esc(label)}<input type="number" step="${step}" min="0" data-xa-eco="${key}" value="${esc(value)}" /></label>`;
    return `
      <section class="xa-card">
        <h3>Economy</h3>
        <p class="xa-hint">Fees are per boss (table above). Partner energy is a flat amount per wallet; capsules add up per token by tier (airdrop below).</p>
        <div class="xa-fields xa-fields--3">
          ${field("1★ reward, × fee", "mult:1", m[1] ?? 0.5, "0.1")}
          ${field("2★ reward, × fee", "mult:2", m[2] ?? 1, "0.1")}
          ${field("3★ reward, × fee", "mult:3", m[3] ?? 2, "0.1")}
          ${field("Free boss base, Points", "EXPEDITION_FREE_BOSS_REWARD_BASE", c.EXPEDITION_FREE_BOSS_REWARD_BASE)}
          ${field("Energy per attempt", "EXPEDITION_ENERGY_PER_ATTEMPT", c.EXPEDITION_ENERGY_PER_ATTEMPT)}
        </div>
        <h4>Capsule airdrop · energy per capsule, by tier</h4>
        <div class="xa-fields xa-fields--5">
          ${["glass", "bronze", "silver", "gold", "prismatic"].map((tier) => field(tier[0].toUpperCase() + tier.slice(1), `tier:${tier}`, t[tier] ?? 0)).join("")}
        </div>
        <h4>Marketplaces <span class="xa-muted">· purchases through these contracts count as purchases, plain transfers don't</span></h4>
        <textarea id="xaMarketplaces" rows="2" placeholder="0x… one contract per line (Seaport on Robinhood Chain)">${esc((c.EXPEDITION_MARKETPLACE_CONTRACTS || []).join("\n"))}</textarea>
        <div class="xa-row xa-row--end"><button type="button" class="admin-secondary-btn xa-btn-sm xa-btn-primary" data-xa-action="save-economy">Save economy</button></div>
      </section>`;
  }

  function sectionHolderEnergy() {
    const s = view.stats;
    const claims = s.bosses.reduce((a, b) => a + (b.claims || 0), 0);
    const energy = s.bosses.reduce((a, b) => a + (b.claimEnergy || 0), 0);
    const rows = s.bosses.filter((b) => b.open).map((b) => `<tr><td>${esc(b.name)}</td><td class="xa-num">${b.claims || 0}</td><td class="xa-num">${num(b.claimEnergy || 0)}</td><td class="xa-num">${b.energy || 0} / wallet</td></tr>`).join("") || '<tr><td colspan="4" class="xa-muted">No open bosses.</td></tr>';
    const a = view.airdrop, ap = view.airdropParams;
    const grants = (s.grants || []).slice(0, 10).map((g) => `<li><span class="xa-mono">${esc(g.label)}</span><span>${num(g.wallets)} wallets</span><span>${num(g.energy)} energy</span><span class="xa-muted">${esc(when(g.lastAt))}</span></li>`).join("") || '<li class="xa-muted">No grants yet.</li>';
    return `
      <section class="xa-card">
        <h3>Holder energy</h3>
        <p class="xa-hint">Players claim it themselves on the Expeditions page (one claim per collection, flat per wallet).</p>
        <div class="admin-stats-grid xa-stats xa-stats--3">${stat("Claims", num(claims), "all time")}${stat("Energy granted", num(energy), "via claims")}${stat("Grant campaigns", num((s.grants || []).length), "airdrops + manual")}</div>
        <div class="xa-tw"><table class="xa-table xa-table--tight"><thead><tr><th>Collection</th><th class="xa-num">Claims</th><th class="xa-num">Energy</th><th class="xa-num">Rate</th></tr></thead><tbody>${rows}</tbody></table></div>
        <h4>Capsule airdrop <span class="xa-muted">· pick the amount, preview, drop — repeatable (launch, later events)</span></h4>
        <div class="xa-row xa-row--wrap">
          <select id="xaDropMode" title="How the amount is counted">
            <option value="capsule" ${!ap || ap.mode === "capsule" ? "selected" : ""}>per capsule</option>
            <option value="wallet" ${ap && ap.mode === "wallet" ? "selected" : ""}>per holder</option>
            <option value="tier" ${ap && ap.mode === "tier" ? "selected" : ""}>by tier (rates in Economy)</option>
          </select>
          <input type="number" id="xaDropAmount" min="1" max="1000" step="1" value="${ap && ap.amount ? ap.amount : 3}" title="energy" /><span class="xa-muted">energy</span>
          <input type="text" id="xaDropLabel" value="${esc(ap && ap.label ? ap.label : "")}" placeholder="label (auto: capsules-YYYYMMDD-HHMM)" />
          <button type="button" class="admin-secondary-btn xa-btn-sm" data-xa-action="airdrop-preview">Preview</button>
          <button type="button" class="admin-secondary-btn xa-btn-sm xa-btn-primary" data-xa-action="airdrop-run" ${a && a.totalEnergy > 0 ? "" : "disabled"}>Drop energy</button>
        </div>
        <div class="xa-muted">${a ? `${num(a.wallets)} holders · ${num(a.capsules)} capsules: ${Object.entries(a.byTier || {}).map(([tier, n]) => `${n} ${tier}`).join(" · ") || "—"} → <b>${num(a.totalEnergy)} energy</b> (${a.rates.mode === "tier" ? "by tier" : a.rates.amount + " per " + (a.rates.mode === "wallet" ? "holder" : "capsule")})` : "Choose the amount and press Preview — the numbers come from the capsule index."}</div>
        <p class="xa-hint">Every drop gets its own label, so a wallet can receive several drops over time; re-sending the same label skips wallets that already got it. Holders without a profile get it on their first visit.</p>
        <h4>Manual grant <span class="xa-muted">· backup tool for one-off campaigns</span></h4>
        <div class="xa-row xa-row--grant"><textarea id="xaGrantWallets" rows="3" placeholder="wallets, one per line"></textarea><div class="xa-col"><input type="number" id="xaGrantAmount" min="1" value="3" title="energy each" /><input type="text" id="xaGrantLabel" placeholder="label (idempotent)" /><button type="button" class="admin-secondary-btn xa-btn-sm" data-xa-action="grant">Grant energy</button></div></div>
        <ul class="xa-journal">${grants}</ul>
      </section>`;
  }

  function sectionMint() {
    const s = view.stats;
    const minter = s.mint.minter;
    const pending = s.mint.pending.map((e) => `<li><span class="xa-mono">${esc(when(e.at))}</span><span><span class="xa-mono">${esc(shortWallet(e.wallet))}</span> · boss ${e.bossIndex}</span><span class="xa-pill xa-pill--warn">${e.txHash ? "sent · waiting for receipt" : "pending"} · try ${e.attempts || 0}</span><span class="xa-muted">${esc(e.lastError || "")}</span></li>`).join("");
    const failed = s.mint.failed.slice().reverse().slice(0, 10).map((e) => `<li><span class="xa-mono">${esc(when(e.at))}</span><span><span class="xa-mono">${esc(shortWallet(e.wallet))}</span> · boss ${e.bossIndex}</span><span class="xa-pill xa-pill--err">failed · player saw a toast</span><span class="xa-muted">${esc(e.error || "")}</span></li>`).join("");
    return `
      <section class="xa-card">
        <div class="xa-toolbar">
          <div><h3>Boss NFTs</h3><p class="xa-hint">${s.flags.mintConfigured ? `minter ${esc(shortWallet(minter && minter.minterAddress))}${minter && minter.contractMinter ? ` · on-chain minter ${esc(shortWallet(minter.contractMinter))}` : ""}${minter && minter.baseUri ? ` · base URI ${esc(minter.baseUri)}` : ""}` : "Contract and minter are not configured in env — claims wait in the queue."}</p></div>
          <button type="button" class="admin-secondary-btn xa-btn-sm" data-xa-action="mint-sync">Run mint queue now</button>
          <button type="button" class="admin-secondary-btn xa-btn-sm" data-xa-action="nft-refresh" title="Ask OpenSea to re-read the metadata of every minted trophy (after an art change)">Refresh on OpenSea</button>
        </div>
        <ul class="xa-journal">${pending || '<li class="xa-muted">Queue is empty.</li>'}</ul>
        ${failed ? `<h4>Recent failures</h4><ul class="xa-journal">${failed}</ul>` : ""}
      </section>`;
  }

  function sectionAttempts() {
    const s = view.stats;
    const list = s.attempts.filter((a) => (view.attemptBoss === "all" || String(a.bossIndex) === view.attemptBoss) && (view.attemptResult === "all" || (view.attemptResult === "3" ? a.stars >= 3 : view.attemptResult === "won" ? a.won : view.attemptResult === "lost" ? !a.won && a.status === "finished" : a.status === "forfeited")));
    const rows = list.map((a) => {
      const boss = s.bosses[a.bossIndex - 1];
      const result = a.status === "forfeited" ? "Forfeited" : a.won ? `${"★".repeat(a.stars)} ${a.stars}★` : "Lost";
      return `<tr><td class="xa-mono">${esc(when(a.at))}</td><td class="xa-mono">${esc(shortWallet(a.wallet))}</td><td>${a.bossIndex} · ${esc(boss ? boss.title : "")}</td><td>${esc(result)}</td><td class="xa-num">${a.moves != null ? `${a.moves} / ${a.par}` : "—"}</td><td class="xa-num">${a.paid ? `+${num(a.paid)}` : "0"}</td><td>${a.nft === "minted" ? '<span class="xa-pill xa-pill--open"><i></i>minted</span>' : a.nft ? `<span class="xa-pill xa-pill--warn">${esc(a.nft)}</span>` : '<span class="xa-muted">—</span>'}</td></tr>`;
    }).join("") || '<tr><td colspan="7" class="xa-muted">No fights yet.</td></tr>';
    return `
      <section class="xa-card">
        <div class="xa-toolbar">
          <div><h3>Attempts</h3><p class="xa-hint">Latest finished fight per wallet and boss.</p></div>
          <div class="xa-row">
            <select data-xa-filter="boss"><option value="all">All bosses</option>${s.bosses.map((b) => `<option value="${b.index}" ${view.attemptBoss === String(b.index) ? "selected" : ""}>${b.index} · ${esc(b.title)}</option>`).join("")}</select>
            <select data-xa-filter="result">${[["all", "Any result"], ["3", "3★"], ["won", "Won"], ["lost", "Lost"], ["forfeited", "Forfeited"]].map(([v, l]) => `<option value="${v}" ${view.attemptResult === v ? "selected" : ""}>${l}</option>`).join("")}</select>
            <button type="button" class="admin-secondary-btn xa-btn-sm" data-xa-action="refresh">Refresh</button>
          </div>
        </div>
        <div class="xa-tw"><table class="xa-table xa-table--tight"><thead><tr><th>When</th><th>Wallet</th><th>Boss</th><th>Result</th><th class="xa-num">Turns / par</th><th class="xa-num">Paid</th><th>NFT</th></tr></thead><tbody>${rows}</tbody></table></div>
      </section>`;
  }

  function render() {
    if (!panel) return;
    if (view.loading && !view.stats) { panel.innerHTML = '<p class="admin-empty">Loading expeditions…</p>'; return; }
    if (view.error && !view.stats) { panel.innerHTML = `<p class="admin-empty">${esc(view.error)}</p>`; return; }
    if (!view.stats || !view.config) return;
    panel.innerHTML = `<div class="xa${view.saving ? " is-saving" : ""}">${sectionSwitches()}${sectionBoard()}${sectionEconomy()}${sectionHolderEnergy()}${sectionMint()}${sectionAttempts()}</div>`;
  }

  // ---------- actions ----------
  async function withSaving(fn, okMessage) {
    if (view.saving) return;
    view.saving = true;
    // Dim in place — a full render() here would reset the inputs before fn() reads them.
    const root = panel.querySelector(".xa");
    if (root) root.classList.add("is-saving");
    try {
      await fn();
      if (okMessage) ctx.showToast(okMessage);
      view.saving = false; // before the reload: load() renders, and it must not paint the panel as still saving
      await load({ force: true });
    } catch (error) {
      ctx.showToast(error.message || "Action failed.");
    } finally {
      view.saving = false;
      render();
    }
  }

  function readDropParams() {
    const mode = String((panel.querySelector("#xaDropMode") || {}).value || "capsule");
    const amount = Math.max(1, Math.floor(Number((panel.querySelector("#xaDropAmount") || {}).value) || 0));
    const label = String((panel.querySelector("#xaDropLabel") || {}).value || "").trim();
    return { mode, amount, label };
  }

  function readArray(attr, count, parse) {
    const out = [];
    for (let i = 1; i <= count; i++) {
      const input = panel.querySelector(`[${attr}="${i}"]`);
      out.push(parse(input ? input.value : null, i));
    }
    return out;
  }

  function handleAction(action, target) {
    const bossIndex = Number(target.dataset.boss);
    const value = target.dataset.value;
    switch (action) {
      case "access":
        return withSaving(() => patchConfig({ EXPEDITIONS_ENABLED: value === "off" ? 0 : 1, EXPEDITIONS_ADMIN_ONLY: value === "everyone" ? 0 : 1 }), `Expeditions access: ${value}.`);
      case "minting":
        return withSaving(() => patchConfig({ EXPEDITION_NFT_MINT_ENABLED: value === "on" ? 1 : 0 }), value === "on" ? "NFT minting is on." : "NFT minting paused — claims wait in the queue.");
      case "open":
        if (!window.confirm(`Open boss ${bossIndex} for everyone? Its collection joins the holder-energy list and the current block becomes the claim cut-off.`)) return undefined;
        return withSaving(async () => {
          // Save pending contract edits first so the open check sees them.
          await saveBoard({ silent: true });
          await ctx.apiRequest("/api/admin/expedition-boss", { action: "open", bossIndex, reason: reasonValue() });
        }, `Boss ${bossIndex} is open.`);
      case "hide":
        if (!window.confirm(`Hide boss ${bossIndex} again?`)) return undefined;
        return withSaving(() => ctx.apiRequest("/api/admin/expedition-boss", { action: "hide", bossIndex, reason: reasonValue() }), `Boss ${bossIndex} is hidden.`);
      case "save-board":
        return withSaving(() => saveBoard({ silent: false }), "Boss settings saved.");
      case "save-economy":
        return withSaving(() => {
          const read = (key) => Number(panel.querySelector(`[data-xa-eco="${key}"]`).value);
          const marketplaces = String(panel.querySelector("#xaMarketplaces").value || "").split(/\s+/).map((v) => v.trim()).filter(Boolean);
          return patchConfig({
            EXPEDITION_REWARD_MULTS: { 1: read("mult:1"), 2: read("mult:2"), 3: read("mult:3") },
            EXPEDITION_FREE_BOSS_REWARD_BASE: read("EXPEDITION_FREE_BOSS_REWARD_BASE"),
            EXPEDITION_ENERGY_PER_ATTEMPT: read("EXPEDITION_ENERGY_PER_ATTEMPT"),
            EXPEDITION_CAPSULE_ENERGY: Object.fromEntries(["glass", "bronze", "silver", "gold", "prismatic"].map((tier) => [tier, read(`tier:${tier}`)])),
            EXPEDITION_MARKETPLACE_CONTRACTS: marketplaces,
          });
        }, "Economy saved.");
      case "airdrop-preview": {
        const params = readDropParams();
        return withSaving(async () => {
          view.airdropParams = params;
          view.airdrop = await ctx.apiRequest(`/api/admin/capsule-airdrop?mode=${encodeURIComponent(params.mode)}&amount=${encodeURIComponent(params.amount)}`, {}, "GET");
        });
      }
      case "airdrop-run": {
        const params = readDropParams();
        const p = view.airdrop;
        if (!p || !view.airdropParams || view.airdropParams.mode !== params.mode || view.airdropParams.amount !== params.amount) { ctx.showToast("Preview first — the amount changed."); return undefined; }
        const label = params.label || "(auto label)";
        if (!window.confirm(`Drop ${num(p.totalEnergy)} energy to ${num(p.wallets)} capsule holders (${params.mode === "tier" ? "by tier" : params.amount + " per " + (params.mode === "wallet" ? "holder" : "capsule")}), label ${label}?`)) return undefined;
        return withSaving(async () => {
          const r = await ctx.apiRequest("/api/admin/capsule-airdrop", { mode: params.mode, amount: params.amount, label: params.label || undefined });
          ctx.showToast(`Dropped under ${r.label}: ${r.applied} wallets, ${r.parked} parked for later, ${r.skipped} skipped.`);
          view.airdrop = null; view.airdropParams = { mode: params.mode, amount: params.amount, label: "" };
        });
      }
      case "grant": {
        const wallets = String(panel.querySelector("#xaGrantWallets").value || "").split(/\s+/).map((v) => v.trim()).filter(Boolean);
        const amount = Number(panel.querySelector("#xaGrantAmount").value);
        const label = String(panel.querySelector("#xaGrantLabel").value || "").trim();
        if (!wallets.length || !(amount > 0) || label.length < 3) { ctx.showToast("Wallets, amount and a label (3+ chars) are required."); return undefined; }
        if (!window.confirm(`Grant ${amount} energy to ${wallets.length} wallets under "${label}"?`)) return undefined;
        return withSaving(async () => { const r = await ctx.apiRequest("/api/admin/energy-grant", { label, grants: wallets.map((wallet) => ({ wallet, amount })) }); ctx.showToast(`Granted: ${r.applied} applied, ${r.parked} parked, ${r.skipped} skipped.`); });
      }
      case "nft-refresh":
        return withSaving(async () => { const r = await ctx.apiRequest("/api/admin/expedition-nft-refresh", { all: true }); ctx.showToast(`OpenSea refresh requested for ${r.requested} of ${r.results.length} trophies.`); });
      case "mint-sync":
        return withSaving(async () => { const r = await ctx.apiRequest("/api/expeditions/mint-sync", {}); ctx.showToast(r.skipped ? `Mint queue skipped: ${r.reason}` : `Mint queue: ${r.minted} minted, ${r.failed} failed, ${r.pending} pending.`); });
      case "refresh":
        return load({ force: true });
      default:
        return undefined;
    }
  }

  async function saveBoard({ silent }) {
    const count = view.stats.bosses.length;
    const contracts = readArray("data-xa-contract", count, (v, i) => (v == null ? view.stats.bosses[i - 1].contractFull || "" : String(v).trim()));
    const fees = readArray("data-xa-fee", count, (v, i) => (v == null ? Number(view.stats.bosses[i - 1].fee) || 0 : Math.max(0, Math.floor(Number(v) || 0))));
    const energy = readArray("data-xa-energy", count, (v, i) => (v == null ? Number(view.stats.bosses[i - 1].energy) || 0 : Math.max(0, Math.floor(Number(v) || 0))));
    const patch = { EXPEDITION_COLLECTION_CONTRACTS: contracts, EXPEDITION_FEES: fees, EXPEDITION_COLLECTION_ENERGY: energy };
    const current = view.config;
    const unchanged = JSON.stringify(patch) === JSON.stringify({ EXPEDITION_COLLECTION_CONTRACTS: current.EXPEDITION_COLLECTION_CONTRACTS, EXPEDITION_FEES: current.EXPEDITION_FEES, EXPEDITION_COLLECTION_ENERGY: current.EXPEDITION_COLLECTION_ENERGY });
    if (unchanged && silent) return;
    await patchConfig(patch);
  }

  function bind() {
    if (bound || !panel) return;
    bound = true;
    panel.addEventListener("click", (event) => {
      const target = event.target.closest("[data-xa-action]");
      if (!target || target.disabled) return;
      event.preventDefault();
      void handleAction(target.dataset.xaAction, target);
    });
    panel.addEventListener("change", (event) => {
      const filter = event.target.closest("[data-xa-filter]");
      if (!filter) return;
      if (filter.dataset.xaFilter === "boss") view.attemptBoss = filter.value;
      if (filter.dataset.xaFilter === "result") view.attemptResult = filter.value;
      render();
    });
  }

  window.PetixAdminExpeditions = {
    mount(target, helpers) {
      panel = target;
      Object.assign(ctx, helpers || {});
      bind();
    },
    load,
    render,
  };
})();
