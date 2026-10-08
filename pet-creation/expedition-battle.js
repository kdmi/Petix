// Expeditions (026) battle screen — ported from expedition-demo/battle.js. Keep the two in sync.
/* Battle screen: renders the match-3 fight driven by engine.js events. */
(function () {
  'use strict';
  var E = window.ExpeditionEngine;
  var TILE = 56, GAP = 8, STEP = TILE + GAP, SCALE = 1;   // recomputed per viewport in layoutMetrics()
  function isMobile() { return window.innerWidth < 640; }
  // Mobile: tiles stay 44px (touch size); the whole board is scaled down to fit the width.
  function layoutMetrics() {
    if (isMobile()) { TILE = 44; GAP = 4; } else { TILE = 56; GAP = 8; }
    STEP = TILE + GAP;
    var logical = E.SIZE * STEP - GAP;
    var avail = Math.min(root.clientWidth || Infinity, document.documentElement.clientWidth - 32, window.innerWidth - 32);
    SCALE = isMobile() ? Math.min(1.25, avail / logical) : 1;
    root.style.setProperty('--tile', TILE + 'px');
    root.style.setProperty('--gap', GAP + 'px');
  }
  function applyBoardSize(board) {
    var logical = E.SIZE * STEP - GAP;
    board.style.width = logical + 'px'; board.style.height = logical + 'px';
    board.style.transformOrigin = '0 0';
    board.style.transform = SCALE !== 1 ? 'scale(' + SCALE + ')' : '';
    var shown = Math.round(logical * SCALE) + 'px';
    board.parentNode.style.width = shown; board.parentNode.style.height = shown;
  }
  var ICONS = '/assets/expeditions/icons/';
  var overlayRoot = function () { return (opts && opts.overlayRoot) || document.body; };
  var hostEl = function () { return (opts && opts.host) || document.body; };
  var TYPE_BG = ['#ffe4cc', '#d3f2fb', '#e3dcfa', '#fde2f2', '#e6f4d7', '#fff3c4'];

  var root = document.getElementById('battle');
  var state = null, busy = false, selected = -1, tiles = {}, opts = null, dragStart = null;

  function el(tag, cls, html) { var n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }
  function fmt(n) { return Number(n).toLocaleString('en-US'); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // ---------- layout (Figma 1220:9665 / 1220:9457) ----------
  var RING_PATH = 'M32 3H52a9 9 0 0 1 9 9V52a9 9 0 0 1-9 9H12a9 9 0 0 1-9-9V12a9 9 0 0 1 9-9H32';

  function render() {
    var heroSrc = opts.boss.hero || opts.boss.img;
    var squadBgSrc = opts.boss.squadBg || '/assets/expeditions/tutorial/squad-bg.jpg';
    root.innerHTML =
      '<div class="battle-layout">' +
        '<aside class="battle-side">' +
          '<div class="boss-card' + (opts.boss.hero ? '' : ' is-square') + '" id="boss-panel">' +
            (opts.boss.hero ? '' : '<img class="boss-card-blur" src="' + heroSrc + '" alt="">') +
            '<img class="boss-card-img" src="' + heroSrc + '" alt="">' +
            '<div class="pill pill--name">' + opts.boss.title + '</div>' +
            '<div class="battle-hud">' +
              '<div class="pill pill--move"><span class="battle-move-label">Turn <span class="b-moves">0</span></span><span class="move-target move-target--light"><img src="' + ICONS + 'target-white.svg" alt=""><span class="b-par"></span></span>' + starsMarkup('star-16.svg') + '</div>' +
              '<button class="pill pill--howto" id="btn-howto-m" type="button" aria-label="How to play">?</button>' +
              '<button class="btn-close" id="btn-close" type="button" aria-label="Leave the fight"><img src="' + ICONS + 'close-dark.svg" alt=""></button>' +
            '</div>' +
            '<div class="pill pill--bar" id="boss-bar"><div class="pbar"><div class="pbar-fill pbar-fill--boss" id="boss-fill"></div><div class="pbar-shields" id="boss-shields"></div></div><span class="pbar-text" id="boss-hp"></span></div>' +
          '</div>' +
          '<div class="squad-card" id="team-panel">' +
            '<img class="squad-card-img" src="' + squadBgSrc + '" alt="">' +
            '<div class="squad-card-shade"></div>' +
            '<div class="pill pill--bar pill--top"><div class="pbar"><div class="pbar-fill pbar-fill--team" id="team-fill"></div></div><span class="pbar-text" id="team-hp-text"></span></div>' +
            '<div class="squad-row" id="squad-row"></div>' +
          '</div>' +
        '</aside>' +
        '<div class="battle-main">' +
          '<div class="battle-topbar">' +
            '<div class="battle-moves"><span class="battle-move-label">Turn <span class="b-moves">0</span></span><span class="move-target" title="Win within this many turns for the third star"><img src="' + ICONS + 'target-dark.svg" alt=""><span class="b-par"></span></span>' + starsMarkup('star-32.svg') + '</div>' +
            '<button class="btn-howto" id="btn-howto" type="button">How to play?</button>' +
          '</div>' +
          '<div class="board-wrap"><div class="board" id="board"></div><div class="board-fx" id="board-fx"></div></div>' +
        '</div>' +
      '</div>' +
      '<div class="battle-log" id="battle-log" hidden></div>';

    document.getElementById('btn-howto').addEventListener('click', showHowTo);
    document.getElementById('btn-howto-m').addEventListener('click', showHowTo);
    document.getElementById('btn-close').addEventListener('click', function () { if (!busy) exit(null); });
    renderSquad();
    buildBoard();
    updateBars();
    updateStars();
  }

  function starsMarkup(icon) {
    return '<span class="live-stars">' + ['win', 'hp', 'par'].map(function (k) { return '<img class="ls on" data-k="' + k + '" src="' + ICONS + icon + '" alt="">'; }).join('') + '</span>';
  }

  function renderSquad() {
    var row = document.getElementById('squad-row');
    row.innerHTML = '';
    for (var i = 0; i < E.SLOTS; i++) {
      var p = state.squad[i];
      var card = el('button', 'sq' + (p.mercenary ? ' sq--empty' : ''));
      card.type = 'button';
      card.dataset.slot = i;
      card.innerHTML =
        '<span class="sq-frame">' + (p.img ? '<img src="' + p.img + '" alt="">' : '') + '</span>' +
        '<svg class="sq-ring" viewBox="0 0 64 64"><path d="' + RING_PATH + '" pathLength="100"/></svg>' +
        '<span class="sq-hit"><img src="' + ICONS + 'sword.svg" alt=""><b>HIT</b></span>';
      card.title = p.mercenary ? p.name + ' (filler): weak hits, no ring' : p.name + ' · ' + p.dmg + ' dmg per tile · ring +' + p.rate + ' per tile';
      card.addEventListener('click', (function (slot) { return function () { onAbility(slot); }; })(i));
      row.appendChild(card);
    }
    updateCharges();
  }

  function updateCharges() {
    for (var i = 0; i < E.SLOTS; i++) {
      var p = state.squad[i];
      var card = document.querySelector('.sq[data-slot="' + i + '"]');
      if (!card) continue;
      var pct = p.ability ? p.charge / E.CHARGE_MAX : 0;
      var ready = !!p.ability && p.charge >= E.CHARGE_MAX;
      card.querySelector('.sq-ring path').style.strokeDashoffset = String(100 * (1 - pct));
      card.classList.toggle('is-ready', ready);
    }
  }

  function updateBars() {
    var b = state.boss, t = state.team;
    var shielded = b.shields > 0;
    var bossBar = document.getElementById('boss-bar');
    bossBar.classList.toggle('is-shielded', shielded);
    document.getElementById('boss-fill').style.width = (100 * b.hp / b.maxHp) + '%';
    document.getElementById('boss-hp').textContent = fmt(b.hp);
    var sh = document.getElementById('boss-shields');
    sh.innerHTML = '<span class="shield-pips">' + Array.apply(null, Array(b.maxShields)).map(function (_, i) {
      var on = i < b.shields;
      return '<i class="' + (on ? 'on' : 'off') + '"><img src="' + ICONS + (on ? 'shield-on.svg' : 'shield-off.svg') + '" alt=""></i>';
    }).join('') + '</span>';
    bossBar.title = shielded ? 'Shields ' + b.shields + '/' + b.maxShields + ' — fill a ring and tap HIT to break one' : 'Exposed — matches deal damage';
    document.querySelectorAll('.b-par').forEach(function (n) { n.textContent = state.par; });
    document.getElementById('team-fill').style.width = (100 * t.hp / t.maxHp) + '%';
    document.getElementById('team-fill').classList.toggle('is-low', t.hp / t.maxHp < 0.5);
    document.getElementById('team-hp-text').textContent = fmt(t.hp);
    document.querySelectorAll('.b-moves').forEach(function (n) { n.textContent = state.moves; });
  }

  function updateStars() {
    var hpOk = state.team.hp / state.team.maxHp >= 0.5;
    var parOk = state.moves <= state.par;
    var count = 1 + (hpOk ? 1 : 0) + (parOk ? 1 : 0);   // stars go out from the right
    document.querySelectorAll('.live-stars').forEach(function (ls) {
      ls.querySelectorAll('.ls').forEach(function (star, i) { star.classList.toggle('on', i < count); });
      ls.title = 'Stars: win · finish with 50%+ HP · win within ' + state.par + ' turns';
    });
  }

  function showHowTo() {
    if (window.ExpeditionTutorial) { window.ExpeditionTutorial.open(state.par); return; }
    if (document.querySelector('.howto')) return;
    var ov = el('div', 'howto');
    ov.innerHTML =
      '<div class="howto-card">' +
        '<h2 class="howto-title">How to play</h2>' +
        '<ol class="howto-list">' +
          '<li><b>Match 3+</b> of the same pet by swapping neighbours. 4 in a row makes a Line Blast, 5 or an L makes a Cross Blast — match them to blow up a row or a row and column.</li>' +
          '<li><b>Fill the rings.</b> Every matched tile of a pet charges its ring (brain and agility make it faster). A full ring turns into a HIT button.</li>' +
          '<li><b>Break the shields.</b> While the boss has shields, matches do no damage. Tap HIT to shatter one shield.</li>' +
          '<li><b>Finish it.</b> With no shields left, matches hit the boss and HIT becomes a smash. The boss hits back after every turn, so keep your HP up.</li>' +
          '<li><b>Stars:</b> win · finish with 50%+ HP · win within ' + state.par + ' turns. Three stars let you claim the boss NFT.</li>' +
        '</ol>' +
        '<button class="btn-primary" type="button">Got it</button>' +
      '</div>';
    ov.addEventListener('click', function (e) { if (e.target === ov || e.target.tagName === 'BUTTON') ov.remove(); });
    document.body.appendChild(ov);
  }

  // ---------- board ----------
  function buildBoard() {
    var board = document.getElementById('board');
    board.innerHTML = '';
    tiles = {};
    layoutMetrics();
    applyBoardSize(board);
    state.board.forEach(function (t, i) { board.appendChild(makeTile(t, i)); });
    board.addEventListener('pointerdown', onPointerDown);
    if (!buildBoard.resizeBound) {
      buildBoard.resizeBound = true;
      window.addEventListener('resize', function () { if (state && !root.hidden) relayout(); });
    }
    board.addEventListener('pointerup', onPointerUp);
    board.addEventListener('pointermove', onPointerMove);
  }

  // Recompute tile size after a viewport change and snap every tile to its cell.
  function relayout() {
    var prevTile = TILE, prevScale = SCALE;
    layoutMetrics();
    if (TILE === prevTile && SCALE === prevScale) return;
    var board = document.getElementById('board');
    applyBoardSize(board);
    if (TILE !== prevTile) state.board.forEach(function (t, i) { if (tiles[t.id]) place(tiles[t.id], i, true); });
  }

  function makeTile(t, at) {
    var pet = state.squad[t.type];
    var n = el('div', 'tile type-' + t.type + (t.special ? ' sp-' + t.special : ''));
    n.dataset.id = t.id;
    n.innerHTML = pet.img ? '<img src="' + pet.img + '" alt="" draggable="false">' : '<span class="tile-merc">?</span>';
    if (t.special) {
      n.innerHTML += '<span class="tile-sp"></span>';
      n.title = t.special === 'cross' ? 'Cross Blast: match it to blow up its row and column' : 'Line Blast: match it to blow up its row';
    }
    place(n, at, true);
    tiles[t.id] = n;
    return n;
  }

  function place(n, at, instant) {
    var r = Math.floor(at / E.SIZE), c = at % E.SIZE;
    if (instant) n.style.transition = 'none';
    n.style.transform = 'translate(' + (c * STEP) + 'px,' + (r * STEP) + 'px)';
    n.dataset.at = at;
    if (instant) { void n.offsetWidth; n.style.transition = ''; }
  }

  function cellFromEvent(e) {
    var rect = document.getElementById('board').getBoundingClientRect();
    var x = (e.clientX - rect.left) / SCALE, y = (e.clientY - rect.top) / SCALE;
    var c = Math.floor(x / STEP), r = Math.floor(y / STEP);
    if (c < 0 || r < 0 || c >= E.SIZE || r >= E.SIZE) return -1;
    return r * E.SIZE + c;
  }

  var tapDetonate = false;   // ?demo=fx: tapping a special tile detonates it

  function onPointerDown(e) {
    if (busy || state.over) return;
    var at = cellFromEvent(e);
    if (at < 0) return;
    if (tapDetonate && state.board[at].special) {
      select(-1); dragStart = null;
      playEvents(E.detonate(state, at));
      return;
    }
    dragStart = { at: at, x: e.clientX, y: e.clientY };
    if (selected >= 0 && at !== selected) {
      var a = selected; select(-1);
      tryMove(a, at); dragStart = null; return;
    }
    select(at);
  }
  function onPointerMove(e) {
    if (!dragStart || busy) return;
    var dx = e.clientX - dragStart.x, dy = e.clientY - dragStart.y;
    if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return;
    var a = dragStart.at, b;
    if (Math.abs(dx) > Math.abs(dy)) b = a + (dx > 0 ? 1 : -1); else b = a + (dy > 0 ? E.SIZE : -E.SIZE);
    if (Math.abs(dx) > Math.abs(dy) && Math.floor(b / E.SIZE) !== Math.floor(a / E.SIZE)) { dragStart = null; return; }
    dragStart = null; select(-1);
    if (b >= 0 && b < E.SIZE * E.SIZE) tryMove(a, b);
  }
  function onPointerUp() { dragStart = null; }

  function select(at) {
    if (selected >= 0) { var prev = tileAt(selected); if (prev) prev.classList.remove('is-selected'); }
    selected = at;
    if (at >= 0) { var n = tileAt(at); if (n) n.classList.add('is-selected'); }
  }
  function tileAt(at) { return tiles[state.board[at].id]; }

  function tryMove(a, b) {
    var ra = Math.floor(a / E.SIZE), ca = a % E.SIZE, rb = Math.floor(b / E.SIZE), cb = b % E.SIZE;
    if (Math.abs(ra - rb) + Math.abs(ca - cb) !== 1) { select(b); return; }
    var events = E.playMove(state, a, b);
    if (events[0] && events[0].type === 'invalid') { shake(a, b); return; }
    recordMove({ a: a, b: b });
    playEvents(events);
  }

  // Every accepted move is appended here; the server replays the list on finish.
  var moves = [];
  function recordMove(move) {
    moves.push(move);
    if (opts && opts.onMove) { try { opts.onMove(moves.slice()); } catch (e) { /* storage is best-effort */ } }
  }

  function shake(a, b) {
    var na = tileAt(a), nb = tileAt(b);
    place(na, b); place(nb, a);
    setTimeout(function () { place(na, a); place(nb, b); }, 160);
  }

  function onAbility(slot) {
    if (busy || state.over) return;
    var events = E.useAbility(state, slot);
    if (events.length) { recordMove({ hit: slot }); playEvents(events); }
  }

  // ---------- event playback ----------
  async function playEvents(events) {
    busy = true;
    try {
      await playEventList(events);
    } catch (err) {
      console.error('battle playback failed', err);
      log('Playback hiccup — board resynced');
    }
    // keep DOM in sync with the engine board (safety net)
    syncBoard();
    updateBars(); updateCharges(); updateStars();
    if (tapDetonate) keepSpecials();
    busy = false;
  }

  function keepSpecials() {
    var want = { line: 2, cross: 2 };
    state.board.forEach(function (t) { if (t.special && want[t.special]) want[t.special]--; });
    Object.keys(want).forEach(function (kind) {
      for (var k = 0; k < want[kind]; k++) {
        var p = E.plantSpecial(state, kind);
        if (!p) return;
        var n = tiles[p.id];
        if (n) {
          n.classList.add('sp-' + kind, 'is-spawn');
          n.innerHTML += '<span class="tile-sp"></span>';
          n.title = kind === 'cross' ? 'Cross Blast: tap to blow up its row and column' : 'Line Blast: tap to blow up its row';
        }
      }
    });
  }

  async function playEventList(events) {
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (ev.type === 'swap') {
        var na = tiles[ev.ida], nb = tiles[ev.idb];
        place(na, ev.b); place(nb, ev.a);
        await wait(200);
      } else if (ev.type === 'match') {
        var blasts = ev.blasts || [];
        var burnDelay = {};                       // cell -> ms before it burns (shockwave travel)
        var maxDelay = 0;
        blasts.forEach(function (bl) {
          var r0 = Math.floor(bl.at / E.SIZE), c0 = bl.at % E.SIZE;
          ev.cells.forEach(function (at) {
            var r = Math.floor(at / E.SIZE), c = at % E.SIZE;
            var d = null;
            if (r === r0) d = Math.abs(c - c0);
            if (bl.special === 'cross' && c === c0) d = d === null ? Math.abs(r - r0) : Math.min(d, Math.abs(r - r0));
            if (d === null) return;
            var ms = 120 + d * 55;
            if (burnDelay[at] === undefined || ms < burnDelay[at]) burnDelay[at] = ms;
            maxDelay = Math.max(maxDelay, ms);
          });
          shockwave(bl);
        });
        ev.cells.forEach(function (at) {
          var id = findIdAt(at);
          var n = tiles[id]; if (!n) return;
          if (burnDelay[at] !== undefined) {
            n.style.setProperty('--burn-delay', burnDelay[at] + 'ms');
            n.classList.add('is-burning');
          } else n.classList.add('is-clearing');
        });
        popDamage(ev);
        updateBars(); updateCharges(); updateStars();
        await wait(230 + (blasts.length ? maxDelay + 220 : 0));
        ev.cells.forEach(function (at) { var id = findIdAt(at); if (tiles[id]) { tiles[id].remove(); delete tiles[id]; } });
        currentCells = null;
      } else if (ev.type === 'spawn') {
        ev.tiles.forEach(function (s) {
          var n = makeTile({ id: s.id, type: s.type, special: s.special }, s.at);
          n.classList.add('is-spawn');
          document.getElementById('board').appendChild(n);
          log((s.special === 'cross' ? 'Cross Blast' : 'Line Blast') + ' created — match it to blow up the ' + (s.special === 'cross' ? 'row and column' : 'row'));
        });
        await wait(120);
      } else if (ev.type === 'collapse') {
        ev.moves.forEach(function (m) { if (tiles[m.id]) place(tiles[m.id], m.to); });
        var board = document.getElementById('board');
        // Fresh tiles start stacked above their column and drop into place.
        var perCol = {};
        ev.fresh.forEach(function (f) { var c = f.at % E.SIZE; perCol[c] = (perCol[c] || 0) + 1; });
        ev.fresh.forEach(function (f) {
          var c = f.at % E.SIZE, r = Math.floor(f.at / E.SIZE);
          var n = makeTile({ id: f.id, type: f.type, special: null }, f.at);
          n.style.transition = 'none';
          n.style.transform = 'translate(' + (c * STEP) + 'px,' + ((r - perCol[c]) * STEP) + 'px)';
          board.appendChild(n);
          void n.offsetWidth;            // commit the start position while in the DOM
          n.style.transition = '';
          place(n, f.at);                // final position; no rAF so it cannot be dropped
        });
        await wait(260);
      } else if (ev.type === 'shuffle') {
        log('No moves left — board reshuffled');
        rebuildFrom(ev.board);
        await wait(300);
      } else if (ev.type === 'boss-attack') {
        await bossAttackFx(ev);
      } else if (ev.type === 'ability-ready') {
        updateCharges();
        var card = document.querySelector('.sq[data-slot="' + ev.slot + '"]');
        if (card) { card.classList.add('is-pop'); setTimeout(function () { card.classList.remove('is-pop'); }, 500); }
        log(state.squad[ev.slot].name + ' is charged — tap to ' + (state.boss.shields > 0 ? 'BREAK a shield' : 'SMASH') + '!');
      } else if (ev.type === 'ability') {
        await abilityFx(ev);
      } else if (ev.type === 'end') {
        updateBars();
        await wait(400);
        if (opts.onFinish) {
          log('Checking the result…');
          var settled = null;
          try { settled = await opts.onFinish(moves.slice(), ev.result); } catch (e) { settled = { error: e }; }
          showResult(ev.result, settled || {});
        } else {
          showResult(ev.result, {});
        }
      }
    }
  }

  var currentCells = null;
  function findIdAt(at) {
    // During a match event tiles are still at their cells in the engine snapshot; the DOM tile
    // that lives at `at` is the one whose dataset.at matches.
    for (var id in tiles) if (Number(tiles[id].dataset.at) === at) return Number(id);
    return -1;
  }

  function syncBoard() {
    var seen = {};
    state.board.forEach(function (t, i) {
      seen[t.id] = true;
      if (!tiles[t.id]) document.getElementById('board').appendChild(makeTile(t, i));
      else if (Number(tiles[t.id].dataset.at) !== i) place(tiles[t.id], i);
    });
    Object.keys(tiles).forEach(function (id) { if (!seen[id]) { tiles[id].remove(); delete tiles[id]; } });
  }

  function rebuildFrom(snap) {
    Object.keys(tiles).forEach(function (id) { tiles[id].remove(); delete tiles[id]; });
    var board = document.getElementById('board');
    snap.forEach(function (t) { var n = makeTile(t, t.at); n.classList.add('is-spawn'); board.appendChild(n); });
  }

  // Hit confetti, same recipe as the PvP arena (canvas-confetti, candy emojis + warm squares).
  var HIT_EMOJIS = ['🍬', '🍫', '🍭', '🧁', '🍪'];
  var hitShapes = null;
  function getHitShapes() {
    if (hitShapes) return hitShapes;
    if (typeof window.confetti !== 'function' || typeof window.confetti.shapeFromText !== 'function') { hitShapes = []; return hitShapes; }
    hitShapes = HIT_EMOJIS.map(function (text) { return window.confetti.shapeFromText({ text: text, scalar: 5.25 }); });
    return hitShapes;
  }
  // direction: 'up' bursts out of the top of the card (boss got hit), 'down' out of the bottom (squad got hit).
  function fireHitConfetti(target, direction, strength) {
    if (typeof window.confetti !== 'function' || !target) return;
    var rect = target.getBoundingClientRect();
    if (!rect.width) return;
    var k = strength || 1;
    var origin = { x: (rect.left + rect.width / 2) / window.innerWidth, y: (rect.top + rect.height * (direction === 'down' ? 0.7 : 0.35)) / window.innerHeight };
    var angle = direction === 'down' ? 270 : 90;
    var defaults = { disableForReducedMotion: true, gravity: 1.15, origin: origin, ticks: 180, zIndex: 1200, angle: angle };
    var shapes = getHitShapes();
    window.requestAnimationFrame(function () {
      if (shapes.length) window.confetti(Object.assign({}, defaults, { particleCount: Math.round(14 * k), scalar: 4.2, shapes: shapes, spread: 70, startVelocity: 38 * k }));
      window.confetti(Object.assign({}, defaults, { particleCount: Math.round(26 * k), scalar: 1.1, shapes: ['square', 'circle'], spread: 80, startVelocity: 42 * k, colors: ['#FDB022', '#F79009', '#F04438', '#FEC84B', '#FFFFFF'] }));
    });
  }

  // Shockwave beams drawn on the board when a special tile detonates.
  function shockwave(bl) {
    var board = document.getElementById('board');
    var r = Math.floor(bl.at / E.SIZE), c = bl.at % E.SIZE;
    var cx = c * STEP + TILE / 2, cy = r * STEP + TILE / 2;
    var full = E.SIZE * STEP - GAP;
    function beam(horizontal) {
      var b = el('div', 'blast-beam ' + (horizontal ? 'is-h' : 'is-v') + (bl.special === 'cross' ? ' is-cross' : ''));
      if (horizontal) { b.style.top = (r * STEP) + 'px'; b.style.left = '0'; b.style.width = full + 'px'; b.style.setProperty('--origin', cx + 'px'); }
      else { b.style.left = (c * STEP) + 'px'; b.style.top = '0'; b.style.height = full + 'px'; b.style.setProperty('--origin', cy + 'px'); }
      board.appendChild(b);
      setTimeout(function () { b.remove(); }, 700);
    }
    beam(true);
    if (bl.special === 'cross') beam(false);
    var core = el('div', 'blast-core' + (bl.special === 'cross' ? ' is-cross' : ''));
    core.style.left = cx + 'px'; core.style.top = cy + 'px';
    board.appendChild(core);
    setTimeout(function () { core.remove(); }, 700);
    root.classList.add(bl.special === 'cross' ? 'is-shake' : 'is-shake-soft');
    setTimeout(function () { root.classList.remove('is-shake', 'is-shake-soft'); }, 420);
    var fx = document.getElementById('board-fx');
    var w = el('span', 'fx-word fx-blast', bl.special === 'cross' ? 'CROSS BLAST' : 'LINE BLAST'); fx.appendChild(w);
    setTimeout(function () { w.remove(); }, 800);
  }

  function popDamage(ev) {
    var panel = document.getElementById('boss-panel');
    if (ev.shielded) {
      var sf = el('span', 'float-dmg is-shielded', 'SHIELDED');
      panel.appendChild(sf);
      setTimeout(function () { sf.remove(); }, 700);
      panel.classList.add('is-blocked'); setTimeout(function () { panel.classList.remove('is-blocked'); }, 260);
    }
    if (ev.damage > 0) {
      var f = el('span', 'float-dmg' + (ev.chain > 1 ? ' is-chain' : ''), '-' + fmt(ev.damage) + (ev.chain > 1 ? '<small>×' + ev.chain + ' chain</small>' : ''));
      panel.appendChild(f);
      setTimeout(function () { f.remove(); }, 900);
      panel.classList.remove('is-hit'); void panel.offsetWidth;
      panel.classList.add('is-hit'); setTimeout(function () { panel.classList.remove('is-hit'); }, 420);
      fireHitConfetti(panel, 'up', ev.chain > 1 ? 1.2 : 0.8);
    }
    var big = ev.groups.some(function (g) { return g.len >= 4; });
    if ((big || ev.chain >= 2) && !(ev.blasts && ev.blasts.length)) {
      var fx = document.getElementById('board-fx');
      var word = ev.chain >= 3 ? 'MEGA CHAIN' : ev.chain === 2 ? 'CHAIN!' : ev.groups.some(function (g) { return g.len >= 5; }) ? 'CROSS BLAST READY' : 'LINE BLAST READY';
      var w = el('span', 'fx-word', word); fx.appendChild(w); setTimeout(function () { w.remove(); }, 800);
    }
  }

  async function bossAttackFx(ev) {
    var panel = document.getElementById('boss-panel');
    panel.classList.remove('is-attacking'); void panel.offsetWidth;
    panel.classList.add('is-attacking');          // lunges down toward the squad
    await wait(220);
    var team = document.getElementById('team-panel');
    var txt = ev.dodged ? 'DODGED' : '-' + fmt(ev.damage);
    var f = el('span', 'float-hit' + (ev.damage ? '' : ' is-miss'), txt);
    team.appendChild(f);
    setTimeout(function () { f.remove(); }, 900);
    if (ev.damage) {
      team.classList.remove('is-hurt'); void team.offsetWidth;
      team.classList.add('is-hurt');
      setTimeout(function () { team.classList.remove('is-hurt'); }, 450);
      fireHitConfetti(team, 'down', 0.9);
    }
    updateBars(); updateStars();
    if (ev.dodged) log('Boss swings for ' + ev.power + ' — dodged!');
    await wait(300);
    panel.classList.remove('is-attacking');
  }

  async function abilityFx(ev) {
    var pet = state.squad[ev.slot];
    var card = document.querySelector('.sq[data-slot="' + ev.slot + '"]');
    card.classList.add('is-cast');                 // pet jumps up at the boss
    var fx = document.getElementById('board-fx');
    var panel = document.getElementById('boss-panel');
    await wait(180);
    if (ev.ability === 'break') {
      var pips = document.querySelectorAll('#boss-shields .shield-pips i.on');
      var pip = pips[pips.length - 1];
      if (pip) pip.classList.add('is-shatter');
      var w = el('span', 'fx-word fx-ability', 'SHIELD BREAK'); fx.appendChild(w);
      setTimeout(function () { w.remove(); }, 800);
      panel.classList.remove('is-hit'); void panel.offsetWidth;
      panel.classList.add('is-hit'); setTimeout(function () { panel.classList.remove('is-hit'); }, 420);
      log(pet.name + ' broke a shield' + (ev.exposed ? ' — the boss is exposed!' : ' (' + ev.shields + ' left)'));
      await wait(420);
      updateBars(); updateCharges();
      if (ev.exposed) {
        var w2 = el('span', 'fx-word fx-exposed', 'EXPOSED!'); fx.appendChild(w2);
        setTimeout(function () { w2.remove(); }, 900);
        panel.classList.add('is-exposed-flash'); setTimeout(function () { panel.classList.remove('is-exposed-flash'); }, 900);
        await wait(500);
      }
    } else {
      var w3 = el('span', 'fx-word fx-ability', 'SMASH'); fx.appendChild(w3);
      setTimeout(function () { w3.remove(); }, 800);
      popDamage({ damage: ev.damage, chain: 1, groups: [] });
      fireHitConfetti(panel, 'up', 1.4);
      log(pet.name + ' smashed for ' + fmt(ev.damage));
      updateBars(); updateCharges(); updateStars();
      await wait(450);
    }
    setTimeout(function () { card.classList.remove('is-cast'); }, 200);
  }

  function log(text) {
    var l = document.getElementById('battle-log');
    if (!l) return;
    var line = el('div', 'log-line', text);
    l.prepend(line);
    while (l.children.length > 3) l.lastChild.remove();
  }

  // ---------- result ----------
  // Result popup (Figma 1370:4638, 1371:5054, 1372:5169/5259/5377/5473/5554). Pure markup so popups.html can mirror it.
  // o: { bossIndex, bossTitle, won, stars, prev, nft: 'locked' | 'claim' | 'claiming' | 'claimed' }
  function resultCardHtml(o) {
    var won = !!o.won, stars = won ? o.stars : 0, prev = o.prev || 0;
    var best = Math.max(prev, stars);
    var nextFee = E.entryFee(o.bossIndex, best, o.rules);
    var paid = o.paidOverride != null ? o.paidOverride : won ? Math.max(0, E.rewardFor(o.bossIndex, stars, o.rules) - E.rewardFor(o.bossIndex, prev, o.rules)) : 0;
    var coin = function (cls, icon) { return '<i class="res-coin' + (cls ? ' ' + cls : '') + '"><img src="' + ICONS + icon + '" alt=""></i>'; };
    var reward = !won ? '' : paid > 0
      ? '<div class="res-reward"><div class="res-reward-sum"><span>+' + fmt(paid) + '</span>' + coin('', 'coin-white-26.svg') + '</div><p class="res-reward-label">Your reward</p></div>'
      : prev >= 3 ? '' : '<p class="res-noreward">No new reward</p>';
    var strip = '<div class="res-strip">' + [1, 2, 3].map(function (t) {
      var cls = t <= prev ? 'is-claimed' : t <= stars ? 'is-paid' : 'is-locked';
      return '<span class="res-tier ' + cls + '" title="' + (cls === 'is-claimed' ? 'Claimed earlier' : cls === 'is-paid' ? 'Paid now' : 'Not reached yet') + '">' +
        '<img class="res-tier-icon" src="' + ICONS + 'tier-' + t + '-' + (cls === 'is-locked' ? 'off' : 'on') + '.svg" alt="' + t + ' star' + (t > 1 ? 's' : '') + '">' +
        '<span class="res-tier-amount">' + fmt(E.rewardTier(o.bossIndex, t, o.rules)) + coin('res-coin--xs', 'coin-white-10.svg') + '</span></span>';
    }).join('') + '</div>';
    var nft = {
      locked: '<div class="res-nft is-locked"><img src="' + ICONS + 'tier-3-on.svg" alt=""><span>Earn 3 stars to get boss NFT</span></div>',
      claim: '<button class="res-nft is-claim" id="res-claim" type="button"><img src="' + ICONS + 'gift.svg" alt=""><span>Claim boss NFT</span></button>',
      claiming: '<button class="res-nft is-claim is-claiming" id="res-claim" type="button" disabled><i class="res-spinner"></i><span>Sending NFT to your wallet…</span></button>',
      claimed: '<div class="res-nft is-claimed"><img src="' + ICONS + 'check-badge.svg" alt=""><span>Boss NFT claimed</span></div>'
    }[o.nft || 'locked'];
    // Retry costs 1 energy + the fee; a shortage disables it in the grey style (owner 2026-10-08).
    var retryBlock = best >= 3 ? null : (o.energy != null && o.energy <= 0) ? 'Not enough energy to retry' : (o.points != null && o.points < nextFee) ? 'Not enough Points to retry' : null;
    var primary = best >= 3 ? '<span class="btn-fight-label">Next boss</span>'
      : retryBlock ? '<span class="btn-fight-label">' + retryBlock + '</span>'
      : '<span class="btn-fight-label"><img src="' + ICONS + 'bolt-white.svg" alt="">Retry</span>' +
        (nextFee ? '<span class="btn-fight-cost"><span class="btn-fight-coin"><img src="' + ICONS + 'points-dark.svg" alt=""></span>' + feeLabel(nextFee) + '</span>' : '');
    return '<div class="result-card' + (won ? ' is-win' : ' is-lose') + '">' +
      '<span class="res-badge">' + (won ? 'Victory' : 'Defeat') + '</span>' +
      '<button class="res-close" id="res-close" type="button" aria-label="Close"><img src="' + ICONS + 'close-dark.svg" alt=""></button>' +
      '<h2 class="res-title">' + (won ? o.bossTitle + ' is down' : 'Your squad fell') + '</h2>' +
      '<div class="res-stars">' + [1, 2, 3].map(function (i) {
        return '<span class="rs' + (i <= stars ? ' on' : '') + '" style="--i:' + i + '"><img src="' + ICONS + (i <= stars ? 'star-64-on.svg' : 'star-64-off.svg') + '" alt=""></span>';
      }).join('') + '</div>' +
      reward + strip + nft +
      '<button class="btn-primary btn-fight-like res-primary' + (retryBlock ? ' is-blocked' : '') + '" id="res-retry" type="button"' + (retryBlock ? ' disabled' : '') + '>' + primary + '</button>' +
      '<button class="res-back" id="res-back" type="button">Back to expedition</button>' +
    '</div>';
  }

  // Boss modal reward strip: same tiers/icons as the result popup; claimed tiers are struck through and dimmed,
  // the rest stay bright because they are still up for grabs.
  function modalStripHtml(bossIndex, bestStars, rules) {
    return '<div class="res-strip res-strip--modal">' + [1, 2, 3].map(function (t) {
      var claimed = t <= (bestStars || 0);
      return '<span class="res-tier' + (claimed ? ' is-claimed' : '') + '" title="' + (claimed ? 'Already claimed' : 'Reward for ' + t + ' star' + (t > 1 ? 's' : '')) + '">' +
        '<img class="res-tier-icon" src="' + ICONS + 'tier-' + t + '-on.svg" alt="' + t + ' star' + (t > 1 ? 's' : '') + '">' +
        '<span class="res-tier-amount">' + fmt(E.rewardTier(bossIndex, t, rules)) + '<i class="res-coin res-coin--xs"><img src="' + ICONS + 'coin-white-10.svg" alt=""></i></span></span>';
    }).join('') + '</div>';
  }

  function showResult(res, settled) {
    settled = settled || {};
    if (settled.error) log('Could not save the result: ' + (settled.error.message || 'try again'));
    var prev = opts.prevStars || 0;
    var best = Math.max(prev, res.won ? res.stars : 0);
    var claimed = settled.nft === 'claimed' || (!settled.nft && !!opts.nftClaimed);
    var ov = el('div', 'result' + (res.won ? ' is-win' : ' is-lose'));
    var wallet = settled.wallet || (opts.wallet ? opts.wallet() : {});
    var view = { bossIndex: opts.bossIndex, bossTitle: opts.boss.title, won: res.won, stars: res.stars, prev: prev,
                 points: wallet.points, energy: wallet.energy,
                 nft: claimed ? 'claimed' : settled.nft === 'pending' ? 'claiming' : best >= 3 ? 'claim' : 'locked', rules: opts.rules, paidOverride: settled.paid };
    ov.innerHTML = resultCardHtml(view);
    overlayRoot().appendChild(ov);   // outside the screen: a transformed ancestor would clip a fixed overlay
    function bind() {
      document.getElementById('res-back').addEventListener('click', function () { exit(res); });
      document.getElementById('res-close').addEventListener('click', function () { exit(res); });
      document.getElementById('res-retry').addEventListener('click', function () { if (this.disabled) return; exit(res, best >= 3 ? 'next' : 'retry'); });
      var claim = document.getElementById('res-claim');
      if (claim && view.nft === 'claim') claim.addEventListener('click', function () {
        // The Claim button stays until the mint goes through (even across sessions); the server mints and sends the NFT.
        view.nft = 'claiming'; ov.innerHTML = resultCardHtml(view); bind();
        var finishClaim = function (status) {
          view.nft = status === 'claimed' ? 'claimed' : 'claim';
          ov.innerHTML = resultCardHtml(view); bind();
          var done = ov.querySelector('.res-nft.is-claimed');
          if (status === 'claimed' && window.confetti && done) fireHitConfetti(done, 'up', 1.2);
        };
        var p = opts.onClaim ? opts.onClaim() : new Promise(function (r) { setTimeout(function () { r('claimed'); }, 1600); });
        Promise.resolve(p).then(finishClaim, function () { finishClaim('claim'); });
      });
    }
    bind();
  }

  function feeLabel(fee) { return fee >= 1000 ? (fee / 1000).toFixed(fee % 1000 ? 1 : 0) + ' K' : String(fee); }

  function exit(result, action) {
    overlayRoot().querySelectorAll('.result, .howto').forEach(function (n) { n.remove(); });
    hostEl().classList.remove('is-battle');
    root.hidden = true;
    root.innerHTML = '';
    if (opts.onExit) opts.onExit(result, action);
  }

  // ---------- public ----------
  window.ExpeditionBattle = {
    resultCardHtml: resultCardHtml,
    modalStripHtml: modalStripHtml,
    start: function (o) {
      opts = o;
      root = o.root || document.getElementById('battle');
      state = E.createBattle({ squad: o.squad, wilds: o.wilds, boss: o.boss, seed: o.seed || Date.now() % 1000000 });
      moves = [];
      // Resuming after a reload: replay the stored moves silently, then render the live board.
      if (Array.isArray(o.moves) && o.moves.length) {
        o.moves.forEach(function (m) {
          if (state.over) return;
          if (m && typeof m.hit === 'number') { if (E.useAbility(state, m.hit).length) moves.push({ hit: m.hit }); }
          else if (m && typeof m.a === 'number') { var ev = E.playMove(state, m.a, m.b); if (!(ev[0] && ev[0].type === 'invalid')) moves.push({ a: m.a, b: m.b }); }
        });
      }
      selected = -1; busy = false;
      root.hidden = false;
      hostEl().classList.add('is-battle');
      render();
      if (state.over) { showResult(state.over, {}); return; }
      log('Fight! ' + o.boss.title + ' hides behind ' + o.boss.shields + ' shields. Fill a ring to BREAK one; it hits back after every turn.');
      // ?demo=fx — the board always holds 2 Line + 2 Cross Blasts; tap one to detonate it.
      tapDetonate = /[?&]demo=fx/.test(location.search);
      if (tapDetonate) { keepSpecials(); log('FX demo: tap a glowing tile to detonate it. Swaps still work.'); }

      // ?demo=blast — plants a Line/Cross Blast into the next match and detonates it, on repeat.
      if (/[?&]demo=blast/.test(location.search)) {
        var kind = 'line';
        var demoTick = setInterval(function () {
          if (busy || state.over) return;
          var m = E.bestMoveGreedy(state) || E.findMove(state);
          if (!m) return;
          var b = state.board, tmp = b[m[0]]; b[m[0]] = b[m[1]]; b[m[1]] = tmp;
          var target = null;
          for (var i = 0; i < E.SIZE * E.SIZE && !target; i++) {
            var r = Math.floor(i / E.SIZE), c = i % E.SIZE;
            if (c <= 4 && b[i].type === b[i + 1].type && b[i].type === b[i + 2].type) target = b[i + 1];
            else if (r <= 4 && b[i].type === b[i + E.SIZE].type && b[i].type === b[i + 2 * E.SIZE].type) target = b[i + E.SIZE];
          }
          b[m[1]] = b[m[0]]; b[m[0]] = tmp;
          if (target && !target.special) {
            target.special = kind;
            var n = tiles[target.id];
            if (n) { n.classList.add('sp-' + kind); n.innerHTML += '<span class="tile-sp"></span>'; }
            kind = kind === 'line' ? 'cross' : 'line';
          }
          setTimeout(function () { if (!busy) tryMove(m[0], m[1]); }, 900);
        }, 3200);
      }

      // ?result=N — show the result popup with N stars right away (dev/screenshots only)
      var rp = /[?&]result=(\d)/.exec(location.search);
      if (rp) setTimeout(function () { var n = Number(rp[1]); showResult({ won: n > 0, stars: n, moves: 0, supers: 0, bestChain: 0, totalDamage: 0 }); }, 300);
      // ?howto=N — open the tutorial on step N (dev/screenshots only)
      var ht = location.search.match(/[?&]howto=(\d+)/);
      if (ht && window.ExpeditionTutorial) setTimeout(function () { window.ExpeditionTutorial.open(state.par); for (var k = 1; k < Number(ht[1]); k++) document.querySelector('.tut-next').click(); }, 300);

      // ?autoplay=N — a bot plays N moves (dev/screenshots only)
      var ap = location.search.match(/[?&]autoplay=(\d+)/);
      if (ap) {
        var left = Number(ap[1]);
        var tick = setInterval(function () {
          if (busy || state.over) return;
          if (left-- <= 0) { clearInterval(tick); return; }
          for (var i = 0; i < E.SLOTS; i++) if (state.squad[i].charge >= E.CHARGE_MAX) { onAbility(i); return; }
          var m = E.bestMoveGreedy(state) || E.findMove(state);
          if (m) tryMove(m[0], m[1]);
        }, 400);
      }
    },
    getState: function () { return state; },
    leave: function () { if (state && !root.hidden) exit(null); },
    isBusy: function () { return busy; }
  };
})();
