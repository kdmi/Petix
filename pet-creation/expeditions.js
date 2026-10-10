// Expeditions (026) — the Expeditions screen of the dashboard: season map, squad
// popup, battle bridge, result handling. Ported from expedition-demo/app.js; the
// demo kept its state in localStorage, this one talks to /api/expeditions/*.
//
// The dashboard (app.js) mounts it with a bridge:
//   PetixExpeditions.mount({ host, overlayRoot, apiRequest, getCharacters, onWallet, onTutorial })
(function () {
  'use strict';

  var ICONS = '/assets/expeditions/icons/';
  var E = window.ExpeditionEngine;
  var STORAGE_PREFIX = 'petix-xp-attempt:';

  var bridge = null;
  var host = null;
  var overlayRoot = null;
  var mounted = false;
  var STATE = null; // last /state payload
  var ROSTER = [];  // bosses views from /state (index, title, name, url, img, hero, squadBg, bg, art, hp, power, shields, par, fee, state, stars)
  var SLOT_COUNT = 4;
  var squad = [null, null, null, null];
  var openSlot = -1;
  var modalBoss = 1;

  function el(tag, cls, html) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html != null) node.innerHTML = html;
    return node;
  }
  function icon(file, cls) {
    var img = document.createElement('img');
    img.src = ICONS + file;
    img.alt = '';
    if (cls) img.className = cls;
    return img;
  }
  function q(sel) { return host.querySelector(sel); }
  function byId(id) { return host.querySelector('#' + id); }
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function fmt(n) { return Number(n || 0).toLocaleString('en-US'); }
  function feeLabel(fee) { return fee >= 1000 ? (fee / 1000).toFixed(fee % 1000 ? 1 : 0) + ' K' : String(fee); }
  function rules() { return STATE && STATE.rules; }
  function bossOf(index) { return ROSTER[index - 1]; }
  function bestStars(index) { var p = STATE && STATE.progress && STATE.progress[index]; return p ? (p.bestStars || 0) : 0; }
  function nftStatus(index) { var p = STATE && STATE.progress && STATE.progress[index]; return p && p.nft ? p.nft.status : null; }

  // ---------- Toast ----------
  var toastTimer = null;
  function showToast(text) {
    var t = overlayRoot.querySelector('.toast');
    if (!t) { t = el('div', 'toast'); t.setAttribute('role', 'status'); overlayRoot.appendChild(t); }
    t.textContent = text;
    t.classList.remove('is-visible');
    void t.offsetWidth;
    t.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('is-visible'); }, 2400);
  }

  // ---------- Server ----------
  async function loadState() {
    STATE = await bridge.apiRequest('/api/expeditions/state', {}, 'GET');
    ROSTER = STATE.bosses || [];
    if (bridge.onWallet && STATE.wallet) bridge.onWallet(STATE.wallet);
    return STATE;
  }

  // ---------- Pets ----------
  function ownPets() {
    return (bridge.getCharacters ? bridge.getCharacters() : []).filter(function (c) { return c && c.status === 'completed'; }).map(function (c) {
      var a = c.attributes || {};
      return { id: String(c.id), name: c.name || c.displayName || 'Pet', img: c.imageUrl, lvl: c.level || 1, hp: Number(a.stamina) || 0, spd: Number(a.agility) || 0, atk: Number(a.strength) || 0, int: Number(a.intelligence) || 0 };
    });
  }

  // ---------- Boss cards ----------
  function renderBoss(boss) {
    var card = el('div', 'boss boss--' + boss.state);

    if (boss.state === 'hidden') { // Figma 1355:2904: not revealed yet
      var hidden = el('div', 'boss-art boss-art--hidden');
      hidden.appendChild(icon('hex-question.svg', 'hex'));
      hidden.appendChild(el('span', 'q', '?'));
      card.appendChild(hidden);
      card.appendChild(el('div', 'boss-name', 'Coming soon'));
      var hiddenBadge = el('div', 'boss-badge');
      hiddenBadge.appendChild(icon('ellipse-locked.svg', 'ring'));
      hiddenBadge.appendChild(el('span', 'num', String(boss.index)));
      card.appendChild(hiddenBadge);
      card.setAttribute('role', 'button');
      card.tabIndex = 0;
      var soon = function () { showToast('This boss will be revealed soon!'); };
      card.addEventListener('click', soon);
      card.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); soon(); } });
      return card;
    }

    var art = el('div', 'boss-art');
    if (boss.bg) art.style.background = boss.bg;
    var img = document.createElement('img');
    img.src = boss.img;
    img.alt = boss.title;
    if (boss.art) { // same composition as the Figma frame: [left%, top%, size%]
      img.style.left = boss.art[0] + '%';
      img.style.top = boss.art[1] + '%';
      img.style.width = boss.art[2] + '%';
      img.style.height = boss.art[2] + '%';
    }
    art.appendChild(img);
    card.appendChild(art);
    card.appendChild(el('div', 'boss-name', boss.title));

    if (boss.state === 'done') {
      card.classList.add('is-replayable');
      var replayFee = E.entryFee(boss.index, boss.stars, rules());
      card.title = 'Replay for ' + (replayFee ? fmt(replayFee) + ' Points' : 'free');
      card.addEventListener('click', function () { openModal(boss.index); });
      var stars = el('div', 'boss-stars');
      [['star-small.svg', 'star-l'], ['star-big.svg', 'star-big'], [boss.stars >= 3 ? 'star-small-2.svg' : 'star-small-gray.svg', 'star-r']].forEach(function (pair) {
        var wrap = el('span', 'star ' + pair[1]);
        wrap.appendChild(icon(pair[0]));
        stars.appendChild(wrap);
      });
      card.appendChild(stars);
      var badge = el('div', 'boss-badge');
      badge.appendChild(icon('ellipse-done.svg', 'ring'));
      badge.appendChild(icon('tick.svg', 'tick'));
      card.appendChild(badge);
    } else if (boss.state === 'current') {
      var btn = el('button', 'btn-fight-small', 'Fight');
      btn.type = 'button';
      btn.addEventListener('click', function (e) { e.stopPropagation(); openModal(boss.index); });
      card.appendChild(btn);
      card.addEventListener('click', function () { openModal(boss.index); });
    } else {
      var lockBadge = el('div', 'boss-badge');
      lockBadge.appendChild(icon('ellipse-locked.svg', 'ring'));
      lockBadge.appendChild(el('span', 'num', String(boss.index)));
      card.appendChild(lockBadge);
    }
    return card;
  }

  function renderMap() {
    var r1 = byId('boss-row-1'), r2 = byId('boss-row-2');
    r1.innerHTML = ''; r2.innerHTML = '';
    ROSTER.forEach(function (boss, i) {
      var c = renderBoss(boss); c.style.setProperty('--i', i);
      (i < 5 ? r1 : r2).appendChild(c);
    });
    var cleared = ROSTER.filter(function (b) { return b.state === 'done'; }).length;
    var cur = ROSTER.findIndex(function (b) { return b.state === 'current'; });
    var current = cur < 0 ? Math.min(5, cleared + 1) : cur + 1;
    q('.season-progress .num').textContent = cleared;
    q('.path-line--row1-done').style.width = Math.max(0, (Math.min(5, cleared) - 1) * 153) + 'px';
    q('.path-line--row1-done-dark').style.width = Math.max(0, (Math.min(5, current) - 1) * 153 + 12) + 'px';
    // Lines are revealed only now, relative to the cards' insertion — on prod the
    // state arrives well after page load, and page-load timers showed lines first.
    q('.path').classList.add('is-ready');
  }

  // ---------- Modal ----------
  var closing = false;
  var settledIds = {};
  var fade, slotsEl, dropdownEl, fightBtn, modalEl;

  function openModal(bossIndex) {
    if (closing) return;
    modalBoss = bossIndex;
    var boss = bossOf(modalBoss);
    if (!boss) return;
    var stars = bestStars(modalBoss);
    byId('modal-title').textContent = boss.title;
    var subtitle = byId('modal-subtitle');
    subtitle.textContent = boss.name;
    if (boss.url) { subtitle.href = boss.url; subtitle.removeAttribute('aria-disabled'); }
    else { subtitle.removeAttribute('href'); subtitle.setAttribute('aria-disabled', 'true'); }
    byId('modal-hp').textContent = fmt(boss.hp);
    byId('modal-power').textContent = boss.power;
    var hero = byId('modal-hero');
    hero.src = boss.hero || boss.img;
    hero.parentNode.style.background = boss.bg || '#eaecf0';
    hero.classList.toggle('is-contain', !boss.hero);
    byId('modal-rewards').innerHTML = window.ExpeditionBattle.modalStripHtml(modalBoss, stars, rules()) +
      '<p class="reward-note">' + (stars >= 3 ? 'All rewards claimed · replay is free' : stars ? 'Best ' + stars + '★ · each reward pays once' : 'Each reward pays once') + '</p>';
    fade.classList.remove('is-closing');
    fade.hidden = false;
    document.body.style.overflow = 'hidden';
    slotsEl.classList.remove('is-ready');
    settledIds = {};
    renderSlots();
    setTimeout(function () { slotsEl.classList.add('is-ready'); }, 700);
  }

  function closeModal() {
    if (fade.hidden || closing) return;
    closing = true;
    closeDropdown();
    fade.classList.add('is-closing');
    setTimeout(function () {
      fade.hidden = true;
      fade.classList.remove('is-closing');
      document.body.style.overflow = '';
      closing = false;
    }, 230);
  }

  // ---------- Slots ----------
  function renderSlots() {
    slotsEl.innerHTML = '';
    squad.forEach(function (pet, i) {
      var slot = el('button', 'slot');
      slot.type = 'button';
      slot.dataset.index = i;
      slot.style.setProperty('--i', i);
      if (pet) {
        slot.classList.add('is-filled');
        if (settledIds[pet.id]) slot.classList.add('is-settled');
        settledIds[pet.id] = true;
        var img = document.createElement('img');
        img.className = 'slot-pet';
        img.src = pet.img;
        img.alt = pet.name;
        slot.appendChild(img);
        var remove = el('span', 'slot-remove');
        remove.setAttribute('role', 'button');
        remove.setAttribute('aria-label', 'Remove ' + pet.name);
        remove.appendChild(icon('close.svg'));
        remove.addEventListener('click', function (e) {
          e.stopPropagation();
          if (slot.classList.contains('is-leaving')) return;
          closeDropdown();
          slot.classList.add('is-leaving');
          setTimeout(function () {
            delete settledIds[pet.id];
            squad[i] = null;
            renderSlots();
            var fresh = slotsEl.children[i];
            if (fresh) fresh.style.animation = 'slot-nudge 420ms var(--ease-spring) both';
          }, 200);
        });
        slot.appendChild(remove);
        slot.addEventListener('click', function () { toggleDropdown(i); });
      } else {
        var isOpen = openSlot === i;
        if (isOpen) slot.classList.add('is-open');
        var inner = el('div', 'slot-inner');
        inner.appendChild(icon(isOpen ? 'plus-active.svg' : 'plus.svg'));
        slot.appendChild(inner);
        slot.addEventListener('click', function () { toggleDropdown(i); });
      }
      slotsEl.appendChild(slot);
    });

    var filled = squad.filter(Boolean).length;
    var fee = E.entryFee(modalBoss, bestStars(modalBoss), rules());
    var wallet = (STATE && STATE.wallet) || { points: 0, energy: 0 };
    // A fight costs energy plus the Points fee; either shortage blocks the button in the grey disabled style.
    var noEnergy = wallet.energy < (STATE ? STATE.energyPerAttempt : 1);
    var broke = fee > wallet.points;
    var blocked = noEnergy || broke;
    fightBtn.disabled = filled === 0 || blocked;
    fightBtn.classList.toggle('is-blocked', blocked);
    fightBtn.classList.toggle('is-ready', filled === SLOT_COUNT && !blocked);
    var label = noEnergy ? 'Not enough energy' : broke ? 'Not enough Points' : filled === 0 ? 'Pick your squad' : 'Fight';
    fightBtn.innerHTML = '<span class="btn-fight-label">' + (label === 'Fight' ? '<img src="' + ICONS + 'bolt-white.svg" alt="">' : '') + label + '</span>' +
      (fee && !blocked ? '<span class="btn-fight-cost"><span class="btn-fight-coin"><img src="' + ICONS + 'points-dark.svg" alt=""></span>' + feeLabel(fee) + '</span>' : '');
  }

  // ---------- Dropdown ----------
  var dropdownTimer = null;
  function toggleDropdown(i) { if (openSlot === i) closeDropdown(); else openDropdown(i); }
  function openDropdown(i) {
    openSlot = i;
    renderSlots();
    var picked = squad.filter(Boolean).map(function (p) { return p.id; });
    var available = ownPets().filter(function (p) { return picked.indexOf(p.id) === -1; });
    dropdownEl.innerHTML = '';
    dropdownEl.classList.remove('is-closing');
    if (!available.length) dropdownEl.appendChild(el('div', 'pet-row pet-row--empty', 'No more pets to add'));
    available.forEach(function (pet, idx) {
      var row = el('button', 'pet-row');
      row.type = 'button';
      row.style.setProperty('--i', idx);
      row.innerHTML =
        '<div class="pet-thumb"><img src="' + escapeHtml(pet.img) + '" alt=""></div>' +
        '<div class="pet-body">' +
          '<div class="pet-head"><span class="pet-name">' + escapeHtml(pet.name) + '</span><span class="pet-level">Lvl.' + pet.lvl + '</span></div>' +
          '<div class="pet-stats">' +
            '<span><img src="' + ICONS + 'heart-12.svg" alt="">' + pet.hp + '</span>' +
            '<span><img src="' + ICONS + 'wind-12.svg" alt="">' + pet.spd + '</span>' +
            '<span><img src="' + ICONS + 'attack-12.svg" alt="">' + pet.atk + '</span>' +
            '<span><img src="' + ICONS + 'brain-12.svg" alt="">' + pet.int + '</span>' +
          '</div>' +
        '</div>';
      row.addEventListener('click', function () { squad[i] = pet; closeDropdown(); renderSlots(); });
      dropdownEl.appendChild(row);
    });
    var slotLeft = 24 + i * 96;
    var maxLeft = modalEl.offsetWidth - 16 - 289;
    dropdownEl.style.left = Math.max(16, Math.min(slotLeft - 8, maxLeft)) + 'px';
    dropdownEl.hidden = false; // measure the real height: the list shrinks when pets are already picked
    dropdownEl.style.top = (slotsEl.offsetTop - 4 - dropdownEl.offsetHeight) + 'px';
    clearTimeout(dropdownTimer);
    dropdownEl.hidden = false;
    dropdownEl.scrollTop = 0;
  }
  function closeDropdown() {
    if (openSlot < 0) return;
    openSlot = -1;
    dropdownEl.classList.add('is-closing');
    clearTimeout(dropdownTimer);
    dropdownTimer = setTimeout(function () { dropdownEl.hidden = true; dropdownEl.classList.remove('is-closing'); }, 160);
    renderSlots();
  }

  // ---------- Battle bridge ----------
  function storageKey(attemptId) { return STORAGE_PREFIX + attemptId; }
  function readMoves(attemptId) { try { var raw = localStorage.getItem(storageKey(attemptId)); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
  function writeMoves(attemptId, moves) { try { localStorage.setItem(storageKey(attemptId), JSON.stringify(moves)); } catch (e) {} }
  function clearMoves(attemptId) { try { localStorage.removeItem(storageKey(attemptId)); } catch (e) {} }

  var content;
  function setBattleMode(on) { content.hidden = on; host.classList.toggle('is-battle', on); }

  async function launchBattle(bossIndex, squadIds) {
    var started;
    try {
      started = await bridge.apiRequest('/api/expeditions/start', { bossIndex: bossIndex, squadIds: squadIds });
    } catch (error) {
      showToast(error.message || 'Could not start the fight.');
      await loadState().catch(function () {});
      renderMap();
      return;
    }
    if (bridge.onWallet && started.wallet) bridge.onWallet(started.wallet);
    STATE.wallet = started.wallet;
    runBattle(started.attempt, bossIndex, squadIds, []);
  }

  function runBattle(attempt, bossIndex, squadIds, initialMoves) {
    // The move list must exist from the first second of the fight: a reload before the first
    // move otherwise reads nothing and forfeits the attempt (fee lost). launchBattle passes [].
    if (!readMoves(attempt.attemptId)) writeMoves(attempt.attemptId, initialMoves || []);
    var boss = bossOf(bossIndex);
    var prevStars = bestStars(bossIndex);
    setBattleMode(true);
    window.ExpeditionBattle.start({
      root: byId('battle'),
      host: host,
      overlayRoot: overlayRoot,
      seed: attempt.seed,
      bossIndex: bossIndex,
      // Numbers come from the attempt's snapshot when the server sent one (frozen at start), art from the roster.
      boss: { title: boss.title, name: boss.name, img: boss.img, hero: boss.hero, squadBg: boss.squadBg,
        hp: (attempt.boss && attempt.boss.hp) || boss.hp, power: (attempt.boss && attempt.boss.power) || boss.power,
        shields: attempt.boss ? attempt.boss.shields : boss.shields, par: (attempt.boss && attempt.boss.par) || boss.par },
      squad: attempt.squad,
      wilds: attempt.wilds,
      moves: initialMoves,
      rules: rules(),
      prevStars: prevStars,
      nftClaimed: nftStatus(bossIndex) === 'minted',
      wallet: function () { return STATE.wallet; },
      onMove: function (moves) { writeMoves(attempt.attemptId, moves); },
      onFinish: async function (moves) {
        var settled = await bridge.apiRequest('/api/expeditions/finish', { attemptId: attempt.attemptId, moves: moves });
        clearMoves(attempt.attemptId);
        STATE.progress[bossIndex] = settled.progress;
        STATE.wallet = settled.wallet;
        if (bridge.onWallet) bridge.onWallet(settled.wallet);
        var nft = settled.progress && settled.progress.nft ? settled.progress.nft.status : null;
        return { paid: settled.paid, wallet: settled.wallet, nft: nft === 'minted' ? 'claimed' : nft === 'pending' ? 'pending' : null };
      },
      onClaim: async function () {
        try {
          var claimed = await bridge.apiRequest('/api/expeditions/claim-nft', { bossIndex: bossIndex });
          STATE.progress[bossIndex] = claimed.progress || STATE.progress[bossIndex];
          if (claimed.status === 'minted') return 'claimed';
          showToast('The NFT will be sent to your wallet a little later');
          return 'claiming';
        } catch (error) {
          showToast(error.code === 'MINT_DISABLED' ? 'The NFT will be sent to your wallet later' : "Couldn't send the NFT, try again later");
          return 'claim';
        }
      },
      onExit: async function (result, action) {
        setBattleMode(false);
        try { await loadState(); } catch (e) {}
        renderMap();
        if (action === 'retry') { setTimeout(function () { launchBattle(bossIndex, squadIds); }, 60); }
        else if (action === 'next' && bossIndex < ROSTER.length) { setTimeout(function () { openModal(bossIndex + 1); }, 350); }
        else { window.scrollTo(0, 0); }
      }
    });
    maybeShowTutorial();
  }

  function maybeShowTutorial() {
    if (!STATE || STATE.tutorialSeen || !window.ExpeditionTutorial) return;
    var state = window.ExpeditionBattle.getState();
    window.ExpeditionTutorial.onClose = function () {
      window.ExpeditionTutorial.onClose = null;
      STATE.tutorialSeen = true;
      bridge.apiRequest('/api/expeditions/tutorial-seen', {}).catch(function () {});
    };
    setTimeout(function () { window.ExpeditionTutorial.open(state ? state.par : 20); }, 400);
  }

  // Resume an attempt after a reload: the moves live in localStorage; without them the attempt is forfeited.
  async function resumeIfNeeded() {
    if (!STATE || !STATE.active) return false;
    var attempt = STATE.active;
    var moves = readMoves(attempt.attemptId);
    if (!moves) {
      try { await bridge.apiRequest('/api/expeditions/finish', { attemptId: attempt.attemptId, forfeit: true }); } catch (e) {}
      showToast('Your previous fight was abandoned on another device');
      await loadState().catch(function () {});
      return false;
    }
    showToast('Continuing your fight');
    runBattle(attempt, attempt.bossIndex, attempt.squad.map(function (p) { return p.id; }), moves);
    return true;
  }

  // ---------- Holder bonus banner → claim popup (layout is a placeholder until the Figma popup lands; the flow is real) ----------
  // Two-step popup (Figma 1372:5554 → 1421:4132 → 1423:4199): Check my wallet → Eligible badges → Claim → Claimed + confetti.
  var claimFade, claimPhase = 'idle', claimCollections = null, claimChecks = {};
  function claimRowHtml(c) {
    var check = claimChecks[c.bossIndex];
    var claimed = c.status === 'claimed';
    var eligible = !claimed && check && check.status === 'eligible';
    var title = !claimed && check ? (check.status === 'not_held' ? 'No NFTs from this collection in your wallet' : check.status === 'not_eligible' ? 'Only mints and marketplace purchases after the boss opened count' : '') : '';
    return '<li class="claim-row' + (claimed ? ' is-claimed' : eligible ? ' is-eligible' : '') + '"' + (title ? ' title="' + escapeHtml(title) + '"' : '') + '>' +
      '<span class="claim-row-name"><a href="' + escapeHtml(c.url || '#') + '" target="_blank" rel="noopener">' + escapeHtml(c.name) + '</a>' +
        (eligible ? '<span class="claim-badge"><img src="/assets/expeditions/icons/check-badge-16.svg" alt="">Eligible</span>' : '') + '</span>' +
      (claimed ? '<span class="claim-done">Claimed</span>' : '<span class="claim-energy">+' + c.energy + '<i><img src="/assets/expeditions/icons/bolt-white.svg" alt=""></i></span>') +
    '</li>';
  }
  function renderClaimList() {
    var rows = claimCollections || [];
    byId('claim-list').innerHTML = rows.length ? rows.map(claimRowHtml).join('') : '<li class="claim-row claim-empty">No collections open for claims yet</li>';
    var claimable = rows.some(function (c) { return c.status !== 'claimed'; });
    var eligibleCount = rows.filter(function (c) { return c.status !== 'claimed' && claimChecks[c.bossIndex] && claimChecks[c.bossIndex].status === 'eligible'; }).length;
    var actions = byId('claim-actions'), html;
    if (claimPhase === 'checked' || claimPhase === 'claiming') {
      html = '<button class="claim-btn claim-btn--ghost" id="claim-recheck" type="button"' + (claimPhase === 'claiming' ? ' disabled' : '') + '>Check again</button>' +
             '<button class="claim-btn claim-btn--primary" id="claim-go" type="button"' + (claimPhase === 'claiming' || !eligibleCount ? ' disabled' : '') + '>' + (claimPhase === 'claiming' ? 'Claiming…' : 'Claim') + '</button>';
    } else {
      html = '<button class="claim-btn claim-btn--primary" id="claim-check" type="button"' + (claimPhase === 'checking' || !claimable ? ' disabled' : '') + '>' +
             (claimPhase === 'checking' ? 'Checking your wallet…' : claimable ? 'Check my wallet' : rows.length ? 'All collections claimed' : 'Nothing to claim yet') + '</button>';
    }
    actions.innerHTML = html;
    var check = byId('claim-check'), recheck = byId('claim-recheck'), go = byId('claim-go');
    if (check) check.addEventListener('click', runCheck);
    if (recheck) recheck.addEventListener('click', runCheck);
    if (go) go.addEventListener('click', runClaim);
  }
  async function openClaim() {
    claimFade.hidden = false;
    document.body.style.overflow = 'hidden';
    claimCollections = null; claimChecks = {}; claimPhase = 'checking';
    renderClaimList();
    try {
      var data = await bridge.apiRequest('/api/expeditions/energy-claim', {}, 'GET');
      claimCollections = data.collections || [];
    } catch (e) {
      claimCollections = [];
      showToast(e && e.message ? e.message : 'Could not load collections');
    }
    claimPhase = 'idle'; renderClaimList();
  }
  async function runCheck() {
    if (claimPhase === 'checking' || claimPhase === 'claiming') return;
    claimPhase = 'checking'; claimChecks = {}; renderClaimList();
    try {
      var data = await bridge.apiRequest('/api/expeditions/energy-claim', { check: true });
      (data.results || []).forEach(function (r) { claimChecks[r.bossIndex] = r; });
      if (data.collections) claimCollections = data.collections;
      claimPhase = 'checked';
      if (!(data.results || []).some(function (r) { return r.status === 'eligible'; })) showToast('No eligible NFTs found in your wallet');
    } catch (e) {
      showToast(e && e.message ? e.message : 'Could not check your wallet — try again later');
      claimPhase = 'idle';
    }
    renderClaimList();
  }
  async function runClaim() {
    if (claimPhase !== 'checked') return;
    var wanted = Object.keys(claimChecks).filter(function (k) { return claimChecks[k].status === 'eligible'; }).map(Number);
    if (!wanted.length) return;
    var btn = byId('claim-go'), rect = btn ? btn.getBoundingClientRect() : null;
    claimPhase = 'claiming'; renderClaimList();
    try {
      var data = await bridge.apiRequest('/api/expeditions/energy-claim', { collections: wanted });
      claimCollections = data.collections || claimCollections;
      claimChecks = {};
      if (data.wallet) { STATE.wallet = data.wallet; if (bridge.onWallet) bridge.onWallet(data.wallet); }
      claimPhase = 'idle'; renderClaimList();
      if (data.energyAdded > 0) {
        showToast('+' + data.energyAdded + ' energy added to your balance');
        if (typeof window.confetti === 'function' && rect) {
          var origin = { x: (rect.left + rect.width / 2) / window.innerWidth, y: (rect.top + rect.height / 2) / window.innerHeight };
          window.confetti({ particleCount: 90, spread: 70, startVelocity: 38, origin: origin, zIndex: 200 });
          setTimeout(function () { window.confetti({ particleCount: 50, spread: 100, startVelocity: 28, origin: origin, zIndex: 200 }); }, 180);
        }
      } else showToast('No eligible NFTs found in your wallet');
    } catch (e) {
      showToast(e && e.message ? e.message : 'Could not claim — try again later');
      claimPhase = 'checked'; renderClaimList();
    }
  }
  function closeClaim() { claimFade.hidden = true; document.body.style.overflow = ''; }

  // ---------- Mount ----------
  function bindOnce() {
    fade = byId('fade'); slotsEl = byId('slots'); dropdownEl = byId('dropdown'); fightBtn = byId('btn-fight'); modalEl = fade.querySelector('.modal');
    content = q('.content'); claimFade = byId('claim-fade');
    fade.addEventListener('click', function (e) { if (e.target === fade) closeModal(); });
    byId('modal-close').addEventListener('click', closeModal);
    byId('btn-holder-claim').addEventListener('click', openClaim);
    byId('claim-close').addEventListener('click', closeClaim);
    claimFade.addEventListener('click', function (e) { if (e.target === claimFade) closeClaim(); });
    document.addEventListener('keydown', function (e) {
      if (!mounted || host.classList.contains('hidden')) return;
      if (e.key === 'Escape' && !claimFade.hidden) { closeClaim(); return; }
      if (e.key === 'Escape') { if (openSlot >= 0) closeDropdown(); else if (!fade.hidden) closeModal(); }
    });
    document.addEventListener('click', function (e) {
      if (openSlot < 0) return;
      if (dropdownEl.contains(e.target)) return;
      if (e.target.closest && e.target.closest('.slot')) return;
      closeDropdown();
    });
    fightBtn.addEventListener('click', function (e) {
      if (fightBtn.disabled) return;
      var r = fightBtn.getBoundingClientRect();
      var ripple = el('span', 'ripple');
      ripple.style.left = (e.clientX - r.left) + 'px';
      ripple.style.top = (e.clientY - r.top) + 'px';
      fightBtn.appendChild(ripple);
      setTimeout(function () { ripple.remove(); }, 650);
      fightBtn.classList.add('is-launching');
      fightBtn.classList.remove('is-ready');
      fightBtn.innerHTML = '<span class="btn-fight-label">Fight!</span>';
      var ids = squad.filter(Boolean).map(function (p) { return p.id; });
      var bossIndex = modalBoss;
      setTimeout(function () {
        closeModal();
        setTimeout(function () { fightBtn.classList.remove('is-launching'); launchBattle(bossIndex, ids); }, 240);
      }, 500);
    });
  }

  window.PetixExpeditionsOverlayRoot = null;

  window.PetixExpeditions = {
    /** Show the screen: (re)load state from the server and render the map. */
    mount: async function (options) {
      bridge = options;
      host = options.host;
      overlayRoot = options.overlayRoot;
      window.PetixExpeditionsOverlayRoot = overlayRoot;
      if (!mounted) { bindOnce(); mounted = true; }
      squad = [null, null, null, null];
      try {
        await loadState();
      } catch (error) {
        q('.content').innerHTML = '<p class="xp-error">' + escapeHtml(error.message || 'Expeditions are not available right now.') + '</p>';
        return;
      }
      renderMap();
      await resumeIfNeeded();
    },
    /** Leaving the tab: abandon the on-screen battle UI (the attempt stays active on the server). */
    leave: function () {
      if (!mounted) return;
      if (window.ExpeditionBattle && window.ExpeditionBattle.getState && !byId('battle').hidden) {
        window.ExpeditionBattle.leave();
      }
      setBattleMode(false);
      if (fade && !fade.hidden) { fade.hidden = true; document.body.style.overflow = ''; }
    },
    refresh: async function () { if (!mounted) return; await loadState(); renderMap(); },
    showToast: showToast
  };
})();
