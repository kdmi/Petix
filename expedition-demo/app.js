(function () {
  'use strict';

  var ICONS = 'assets/icons/';

  var E = window.ExpeditionEngine;
  var ROSTER = window.EXPEDITION_BOSSES;
  var STORE_KEY = 'petix-expedition-demo';

  function loadState() {
    try { var raw = localStorage.getItem(STORE_KEY); if (raw) return JSON.parse(raw); } catch (e) {}
    return { points: 23500, progress: { 1: 3, 2: 2 }, nft: { 1: true }, energy: 3 };
  }
  function saveState() { try { localStorage.setItem(STORE_KEY, JSON.stringify(STATE)); } catch (e) {} }
  var STATE = loadState();
  if (STATE.energy == null) STATE.energy = 3;                       // older saves
  var energyParam = new URLSearchParams(location.search).get('energy'); // dev: ?energy=0
  if (energyParam !== null) STATE.energy = Math.max(0, parseInt(energyParam, 10) || 0);

  function firstUncleared() {
    for (var i = 1; i <= ROSTER.length; i++) if (!STATE.progress[i]) return i;
    return ROSTER.length + 1;
  }
  // Bosses are opened manually (plan 026 #1); the demo opens the first OPENED_BOSSES (override with ?opened=N).
  var OPENED_BOSSES = Math.max(1, Math.min(ROSTER.length, parseInt(new URLSearchParams(location.search).get('opened'), 10) || 3));
  function bossView(i) {
    var b = ROSTER[i - 1];
    var stars = STATE.progress[i] || 0;
    var current = firstUncleared();
    var state = i > OPENED_BOSSES ? 'hidden' : stars ? 'done' : i === current ? 'current' : 'locked';
    return Object.assign({}, b, { index: i, n: i, stars: stars, state: state });
  }

  // ---------- Toast ----------
  var toastTimer = null;
  function showToast(text) {
    var t = document.getElementById('toast');
    if (!t) { t = el('div', 'toast'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = text;
    t.classList.remove('is-visible');
    void t.offsetWidth;
    t.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('is-visible'); }, 2400);
  }
  function renderPoints() {
    document.getElementById('hud-points').textContent = STATE.points >= 10000 ? (STATE.points / 1000).toFixed(1) + ' K' : String(STATE.points);
    document.getElementById('hud-energy').textContent = String(STATE.energy);
  }

  // Demo roster mirrors real Petix characters: Common = 10 attribute points, +1 per level above 1.
  var PETS = [
    { id: 1, name: 'Sweet Rich', img: '085_Sparky-Swindler_Common.jpg', lvl: 2, hp: 3, spd: 3, atk: 3, int: 2 },
    { id: 2, name: 'Scully Nightmare', img: '088_Stone-Swarm_Common.jpg', lvl: 1, hp: 2, spd: 2, atk: 4, int: 2 },
    { id: 3, name: 'Red Madness', img: '091_Gooey-Hook_Common.jpg', lvl: 3, hp: 3, spd: 1, atk: 5, int: 3 },
    { id: 4, name: 'Dragon Destroyer', img: '094_Fluffy-Warden_Common.jpg', lvl: 2, hp: 4, spd: 3, atk: 2, int: 2 },
    { id: 5, name: 'Terra Kratos', img: '087_Terra-Kratos_Common.jpg', lvl: 1, hp: 4, spd: 2, atk: 3, int: 1 },
    { id: 6, name: 'Cosmic Neuron', img: '086_Cosmic-Neuron_Common.jpg', lvl: 1, hp: 2, spd: 2, atk: 2, int: 4 },
    { id: 7, name: 'Void Crowbar', img: '089_Void-Crowbar_Common.jpg', lvl: 2, hp: 3, spd: 3, atk: 3, int: 2 },
    { id: 8, name: 'Glow Spin', img: '090_Glow-Spin_Common.jpg', lvl: 1, hp: 2, spd: 4, atk: 2, int: 2 },
    { id: 9, name: 'Bismuth Blade', img: '092_Bismuth-Blade_Common.jpg', lvl: 3, hp: 3, spd: 3, atk: 4, int: 2 },
    { id: 10, name: 'Gear Byte', img: '093_Gear-Byte_Epic.jpg', lvl: 2, hp: 4, spd: 3, atk: 4, int: 3 },
    { id: 11, name: 'Rusty Diver', img: '095_Rusty-Diver_Common.jpg', lvl: 1, hp: 3, spd: 2, atk: 3, int: 2 },
    { id: 12, name: 'Dread Kami', img: '096_Dread-Kami_Common.jpg', lvl: 1, hp: 2, spd: 3, atk: 3, int: 2 }
  ];

  var SLOT_COUNT = 4;
  var squad = [null, null, null, null];
  var openSlot = -1;

  var fade = document.getElementById('fade');
  var slotsEl = document.getElementById('slots');
  var dropdownEl = document.getElementById('dropdown');
  var fightBtn = document.getElementById('btn-fight');
  var modalEl = fade.querySelector('.modal');

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
      hiddenBadge.appendChild(el('span', 'num', String(boss.n)));
      card.appendChild(hiddenBadge);
      card.setAttribute('role', 'button');
      card.tabIndex = 0;
      card.addEventListener('click', function () { showToast('This boss will be revealed soon!'); });
      card.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showToast('This boss will be revealed soon!'); } });
      return card;
    }

    var art = el('div', 'boss-art');
    if (boss.bg) art.style.background = boss.bg;
    var img = document.createElement('img');
    img.src = 'assets/bosses/' + boss.img;
    img.alt = boss.title;
    if (boss.art) { // same composition as the Figma frame: [left%, top%, size%]
      img.style.left = boss.art[0] + '%';
      img.style.top = boss.art[1] + '%';
      img.style.width = boss.art[2] + '%';
      img.style.height = boss.art[2] + '%';
    }
    art.appendChild(img);
    card.appendChild(art);

    card.appendChild(el('div', 'boss-name', boss.title)); // boss name on the map; the collection lives in the popup

    if (boss.state === 'done') {
      card.classList.add('is-replayable');
      card.title = 'Replay for ' + (E.entryFee(boss.index, boss.stars) ? E.entryFee(boss.index, boss.stars) + ' Points' : 'free');
      card.addEventListener('click', function () { openModal(boss.index); });
      var stars = el('div', 'boss-stars');
      [['star-small.svg', 'star-l'], ['star-big.svg', 'star-big'],
       [boss.stars >= 3 ? 'star-small-2.svg' : 'star-small-gray.svg', 'star-r']].forEach(function (pair) {
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
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        openModal(boss.index);
      });
      card.appendChild(btn);
      card.addEventListener('click', function () { openModal(boss.index); });
    } else {
      var lockBadge = el('div', 'boss-badge');
      lockBadge.appendChild(icon('ellipse-locked.svg', 'ring'));
      lockBadge.appendChild(el('span', 'num', String(boss.n)));
      card.appendChild(lockBadge);
    }
    return card;
  }

  function renderMap() {
    var r1 = document.getElementById('boss-row-1'), r2 = document.getElementById('boss-row-2');
    r1.innerHTML = ''; r2.innerHTML = '';
    for (var i = 1; i <= ROSTER.length; i++) {
      var c = renderBoss(bossView(i)); c.style.setProperty('--i', i - 1);
      (i <= 5 ? r1 : r2).appendChild(c);
    }
    var cleared = Object.keys(STATE.progress).length;
    document.querySelector('.season-progress .num').textContent = cleared;
    // path lines: green = cleared, dark = up to the current boss
    var cur = Math.min(5, firstUncleared(), OPENED_BOSSES);
    document.querySelector('.path-line--row1-done').style.width = Math.max(0, (Math.min(5, cleared) - 1) * 153) + 'px';
    document.querySelector('.path-line--row1-done-dark').style.width = Math.max(0, (cur - 1) * 153 + 12) + 'px';
    renderPoints();
  }
  renderMap();

  // Progress counter "2 of 10" counts up on load.
  (function countUp() {
    var nums = document.querySelectorAll('.season-progress .num');
    nums.forEach(function (n) {
      var target = parseInt(n.textContent, 10);
      var start = null;
      function step(ts) {
        if (!start) start = ts;
        var t = Math.min(1, (ts - start) / 900);
        var eased = 1 - Math.pow(1 - t, 3);
        n.textContent = Math.round(target * eased);
        if (t < 1) requestAnimationFrame(step);
      }
      setTimeout(function () { requestAnimationFrame(step); }, 450);
    });
  })();

  // ---------- Modal ----------
  var closing = false;
  var settledIds = {};

  var modalBoss = 1;
  function openModal(bossIndex) {
    if (closing) return;
    modalBoss = bossIndex || firstUncleared();
    var boss = bossView(modalBoss);
    var fee = E.entryFee(modalBoss, boss.stars);
    document.getElementById('modal-title').textContent = boss.title;
    var subtitle = document.getElementById('modal-subtitle');
    subtitle.textContent = boss.name;
    if (boss.url) { subtitle.href = boss.url; subtitle.removeAttribute('aria-disabled'); }
    else { subtitle.removeAttribute('href'); subtitle.setAttribute('aria-disabled', 'true'); }
    document.getElementById('modal-hp').textContent = boss.hp.toLocaleString('en-US');
    document.getElementById('modal-power').textContent = boss.power;
    var hero = document.getElementById('modal-hero');
    hero.src = 'assets/' + (boss.hero ? boss.hero : 'bosses/' + boss.img);
    hero.parentNode.style.background = boss.bg || '#eaecf0';
    hero.classList.toggle('is-contain', !boss.hero);
    // Reward strip: same tiers as the result popup; claimed tiers are struck through (owner 2026-10-08).
    document.getElementById('modal-rewards').innerHTML = ExpeditionBattle.modalStripHtml(modalBoss, boss.stars) +
      '<p class="reward-note">' + (boss.stars >= 3 ? 'All rewards claimed · replay is free' : boss.stars ? 'Best ' + boss.stars + '★ · each reward pays once' : 'Each reward pays once') + '</p>';
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

  fade.addEventListener('click', function (e) {
    if (e.target === fade) closeModal();
  });
  document.getElementById('modal-close').addEventListener('click', closeModal);

  // ---------- Holder bonus banner → claim popup (placeholder until the Figma popup lands) ----------
  var claimFade = document.getElementById('claim-fade');
  function openClaim() {
    var list = document.getElementById('claim-list');
    list.innerHTML = '';
    for (var i = 1; i <= OPENED_BOSSES; i++) {
      var b = ROSTER[i - 1];
      var row = el('li', 'claim-row');
      row.innerHTML = '<a href="' + b.url + '" target="_blank" rel="noopener">' + b.name + '</a><span class="claim-status">Not checked</span>';
      list.appendChild(row);
    }
    claimFade.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeClaim() {
    claimFade.hidden = true;
    document.body.style.overflow = '';
  }
  document.getElementById('btn-holder-claim').addEventListener('click', openClaim);
  document.getElementById('claim-close').addEventListener('click', closeClaim);
  document.getElementById('claim-check').addEventListener('click', function () { showToast('Wallet check arrives with the backend'); });
  claimFade.addEventListener('click', function (e) { if (e.target === claimFade) closeClaim(); });
  if (new URLSearchParams(location.search).get('claim') === '1') openClaim(); // dev: ?claim=1 opens the holder popup

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && claimFade && !claimFade.hidden) { closeClaim(); return; }
    if (e.key === 'Escape') {
      if (openSlot >= 0) closeDropdown();
      else if (!fade.hidden) closeModal();
    }
  });

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
        img.src = 'assets/pets/' + pet.img;
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
            if (fresh) { fresh.style.animation = 'slot-nudge 420ms var(--ease-spring) both'; }
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
    var fee = E.entryFee(modalBoss, STATE.progress[modalBoss] || 0);
    // A fight costs 1 energy plus the Points fee (owner 2026-10-08); either shortage blocks the button in the grey disabled style.
    var noEnergy = STATE.energy <= 0;
    var broke = fee > STATE.points;
    var blocked = noEnergy || broke;
    fightBtn.disabled = filled === 0 || blocked;
    fightBtn.classList.toggle('is-blocked', blocked);
    fightBtn.classList.toggle('is-ready', filled === SLOT_COUNT && !blocked);
    var label = noEnergy ? 'Not enough energy' : broke ? 'Not enough Points' : filled === 0 ? 'Pick your squad' : 'Fight';
    var feeLabel = fee >= 1000 ? (fee / 1000).toFixed(fee % 1000 ? 1 : 0) + ' K' : String(fee);
    fightBtn.innerHTML = '<span class="btn-fight-label">' + (label === 'Fight' ? '<img src="assets/icons/bolt-white.svg" alt="">' : '') + label + '</span>' +
      (fee && !blocked ? '<span class="btn-fight-cost"><span class="btn-fight-coin"><img src="assets/icons/points-dark.svg" alt=""></span>' + feeLabel + '</span>' : '');
  }

  // ---------- Dropdown ----------
  function toggleDropdown(i) {
    if (openSlot === i) closeDropdown();
    else openDropdown(i);
  }

  function openDropdown(i) {
    openSlot = i;
    renderSlots();

    var picked = squad.filter(Boolean).map(function (p) { return p.id; });
    var available = PETS.filter(function (p) { return picked.indexOf(p.id) === -1; });

    dropdownEl.innerHTML = '';
    dropdownEl.classList.remove('is-closing');
    available.forEach(function (pet, idx) {
      var row = el('button', 'pet-row');
      row.type = 'button';
      row.style.setProperty('--i', idx);
      row.innerHTML =
        '<div class="pet-thumb"><img src="assets/pets/' + pet.img + '" alt=""></div>' +
        '<div class="pet-body">' +
          '<div class="pet-head"><span class="pet-name">' + pet.name + '</span><span class="pet-level">Lvl.' + pet.lvl + '</span></div>' +
          '<div class="pet-stats">' +
            '<span><img src="' + ICONS + 'heart-12.svg" alt="">' + pet.hp + '</span>' +
            '<span><img src="' + ICONS + 'wind-12.svg" alt="">' + pet.spd + '</span>' +
            '<span><img src="' + ICONS + 'attack-12.svg" alt="">' + pet.atk + '</span>' +
            '<span><img src="' + ICONS + 'brain-12.svg" alt="">' + pet.int + '</span>' +
          '</div>' +
        '</div>';
      row.addEventListener('click', function () {
        squad[i] = pet;
        closeDropdown();
        renderSlots();
      });
      dropdownEl.appendChild(row);
    });

    // Anchor: 4px above the slot, aligned to its left edge, clamped inside the modal.
    var slotLeft = 24 + i * 96;
    var maxLeft = modalEl.offsetWidth - 16 - 289;
    var left = Math.max(16, Math.min(slotLeft - 8, maxLeft));
    dropdownEl.style.left = left + 'px';
    var slotsTop = slotsEl.offsetTop;
    dropdownEl.style.top = (slotsTop - 4 - 277) + 'px';
    clearTimeout(dropdownTimer);
    dropdownEl.hidden = false;
    dropdownEl.scrollTop = 0;
  }

  var dropdownTimer = null;
  function closeDropdown() {
    if (openSlot < 0) return;
    openSlot = -1;
    dropdownEl.classList.add('is-closing');
    clearTimeout(dropdownTimer);
    dropdownTimer = setTimeout(function () {
      dropdownEl.hidden = true;
      dropdownEl.classList.remove('is-closing');
    }, 160);
    renderSlots();
  }

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
    setTimeout(function () {
      closeModal();
      setTimeout(function () { fightBtn.classList.remove('is-launching'); launchBattle(modalBoss); }, 240);
    }, 500);
  });

  // ---------- Battle bridge ----------
  var content = document.querySelector('.content');
  function toEngineSquad() {
    return squad.map(function (p) {
      return p ? { id: p.id, name: p.name, img: p.img, level: p.lvl, stamina: p.hp, strength: p.atk, agility: p.spd, intelligence: p.int } : null;
    });
  }
  function launchBattle(bossIndex) {
    var fee = E.entryFee(bossIndex, STATE.progress[bossIndex] || 0);
    if (fee > STATE.points) return;
    STATE.points -= fee; STATE.energy = Math.max(0, STATE.energy - 1); saveState(); renderPoints();
    content.hidden = true;
    var seedParam = location.search.match(/[?&]seed=(\d+)/);
    window.ExpeditionBattle.start({
      seed: seedParam ? Number(seedParam[1]) : undefined,
      bossIndex: bossIndex,
      boss: ROSTER[bossIndex - 1],
      squad: toEngineSquad(),
      // Empty squad slots and the fifth colour are filled with random real pets the player owns
      // but did not pick (they hit weakly and charge nothing).
      wilds: PETS.filter(function (p) { return squad.indexOf(p) < 0; })
        .sort(function () { return Math.random() - 0.5; })
        .map(function (p) { return { id: 'wild-' + p.id, name: p.name, img: p.img }; }),
      prevStars: STATE.progress[bossIndex] || 0,
      nftClaimed: !!(STATE.nft && STATE.nft[bossIndex]),
      wallet: function () { return { points: STATE.points, energy: STATE.energy }; }, // Retry needs 1 energy + the fee
      onClaim: function () { STATE.nft = STATE.nft || {}; STATE.nft[bossIndex] = true; saveState(); },
      onExit: function (result, action) {
        if (result && result.won) {
          var prev = STATE.progress[bossIndex] || 0;
          if (result.stars > prev) {
            STATE.points += E.rewardFor(bossIndex, result.stars) - E.rewardFor(bossIndex, prev);
            STATE.progress[bossIndex] = result.stars;
          }
          saveState();
        }
        content.hidden = false;
        renderMap();
        if (action === 'retry') { setTimeout(function () { launchBattle(bossIndex); }, 60); }
        else if (action === 'next' && bossIndex < ROSTER.length) { setTimeout(function () { openModal(bossIndex + 1); }, 350); }
        else { window.scrollTo(0, 0); }
      }
    });
  }

  // ?modal=N opens the squad picker for boss N with two pets pre-picked (screenshots).
  (function automodal() {
    var m = location.search.match(/[?&]modal=(\d+)/);
    if (!m) return;
    squad = [PETS[2], PETS[0], null, null];
    setTimeout(function () { openModal(Math.max(1, Math.min(ROSTER.length, Number(m[1])))); }, 100);
  })();

  // ?battle=N auto-starts boss N with the first four pets (handy for demos and screenshots).
  (function autostart() {
    var m = location.search.match(/[?&]battle=(\d+)/);
    if (!m) return;
    var n = Math.max(1, Math.min(ROSTER.length, Number(m[1])));
    squad = PETS.slice(0, 4);
    setTimeout(function () { launchBattle(n); }, 50);
  })();

  document.querySelectorAll('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () { if (window.ExpeditionBattle) window.ExpeditionBattle.leave(); });
  });

  document.getElementById('demo-reset').addEventListener('click', function (e) {
    e.preventDefault();
    STATE = { points: 23500, progress: { 1: 3, 2: 2 }, nft: { 1: true }, energy: 3 }; saveState(); renderMap();
  });
})();
