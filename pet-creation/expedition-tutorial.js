// Expeditions (026) how-to-play guide — ported from expedition-demo/tutorial.js. Keep the two in sync.
/* Step-by-step "How to play" with looping demos built from the real battle UI pieces. */
(function () {
  'use strict';
  var ICONS = '/assets/expeditions/icons/';
  var mountRoot = null; // set by open(par, mount)
  var PETS = {
    S: '085_Sparky-Swindler_Common.jpg',   // Sweet Rich
    K: '088_Stone-Swarm_Common.jpg',       // Scully
    R: '091_Gooey-Hook_Common.jpg',        // Red Madness
    D: '094_Fluffy-Warden_Common.jpg'      // Dragon Destroyer
  };
  var T = 40, G = 4, STEP = T + G;
  var alive = false, par = 27;

  function el(tag, cls, html) { var n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function cursorMarkup() {
    return '<div class="tut-cursor"><svg viewBox="0 0 24 24" width="26" height="26"><path d="M5 3l14 8.5-6.2 1.4 3.6 6.4-2.6 1.4-3.6-6.4L5 18.5z" fill="#fff" stroke="#101828" stroke-width="1.6" stroke-linejoin="round"/></svg><span class="tut-cursor-ring"></span></div>';
  }
  function tile(type, special) {
    return '<div class="tile' + (special ? ' sp-' + special : '') + '"><img src="/assets/expeditions/tutorial/' + PETS[type] + '" alt="">' + (special ? '<span class="tile-sp"></span>' : '') + '</div>';
  }

  var STEPS = [
    { title: 'Swap to match',
      text: 'Tap a pet, then a neighbour, to swap them. Line up <b>3 or more</b> of the same pet and they burst — new pets drop in from above.',
      run: demoSwap },
    { title: 'Fill the rings',
      text: 'Every matched tile of a pet charges its <b>ring</b>; brainy and agile pets charge faster. A full ring becomes a <b>HIT</b> button: while the boss has shields, a hit <b>breaks one shield</b>. Once it is exposed, a hit is a <b>big extra blow</b> to its HP.',
      run: demoRings },
    { title: 'Shields first, then HP',
      text: 'While the boss has shields, matches do no damage — only HIT breaks them. Once it is exposed, every match hurts the boss. It hits back after every turn, so watch your HP.',
      run: demoShields },
    { title: 'Blast tiles',
      text: '<b>4 in a row</b> makes a Line Blast, <b>5 or an L</b> makes a Cross Blast. Match a glowing tile to blow up its row (or row and column).',
      run: demoBlast },
    { title: 'Earn the stars',
      text: 'One star for the win, one for finishing with <b>50%+ HP</b>, one for winning within the turn limit. <b>Three stars</b> let you claim the boss NFT and make replays free.',
      run: demoStars, w: 392 }
  ];

  // ---------- helpers for demo stages ----------
  function makeStage(cls, w, h) {
    var st = el('div', 'tut-stage ' + (cls || ''));
    st.style.width = w + 'px'; st.style.height = h + 'px';
    return st;
  }
  function placeTile(n, c, r, instant) {
    if (instant) n.style.transition = 'none';
    n.style.transform = 'translate(' + (c * STEP) + 'px,' + (r * STEP) + 'px)';
    if (instant) { void n.offsetWidth; n.style.transition = ''; }
  }
  function moveCursor(cur, x, y) { cur.style.transform = 'translate(' + x + 'px,' + y + 'px)'; }
  async function press(cur) {
    cur.classList.add('is-press'); await sleep(260); cur.classList.remove('is-press');
  }
  function miniBoss(shields, hpPct, label) {
    return '<div class="tut-boss"><img class="tut-boss-img" src="/assets/expeditions/tutorial/boss-hero.jpg" alt="">' +
      '<div class="pill pill--shields tut-shields' + (shields ? '' : ' is-exposed') + '"><span class="shield-pips">' + [0, 1, 2].map(function (i) { return '<i class="' + (i < shields ? 'on' : 'off') + '"><img src="' + ICONS + (i < shields ? 'shield-on.svg' : 'shield-off.svg') + '" alt=""></i>'; }).join('') + '</span></div>' +
      '<div class="pill pill--bar tut-bar' + (shields ? ' is-shielded' : '') + '"><div class="pbar"><div class="pbar-fill pbar-fill--boss" style="width:' + (shields ? 100 : hpPct) + '%"></div></div>' +
      '<span class="pbar-text">' + (shields ? 'Break shields first' : (label || '1,824')) + '</span></div></div>';
  }
  function sqCard(img) {
    return '<button class="sq" type="button"><span class="sq-frame"><img src="/assets/expeditions/tutorial/' + img + '" alt=""></span>' +
      '<svg class="sq-ring" viewBox="0 0 64 64"><path d="M32 3H52a9 9 0 0 1 9 9V52a9 9 0 0 1-9 9H12a9 9 0 0 1-9-9V12a9 9 0 0 1 9-9H32" pathLength="100" style="stroke-dashoffset:100"/></svg>' +
      '<span class="sq-hit"><img src="' + ICONS + 'sword.svg" alt=""><b>HIT</b></span></button>';
  }

  // ---------- step 1: swap & match ----------
  async function demoSwap(stage) {
    var grid = ['SKDSK', 'KSRSK', 'RRKDS'];
    var board = el('div', 'tut-board'); stage.appendChild(board);
    var cur = el('div'); cur.innerHTML = cursorMarkup(); cur = cur.firstChild; stage.appendChild(cur);
    var cells = {};
    function build() {
      board.innerHTML = ''; cells = {};
      grid.forEach(function (row, r) { row.split('').forEach(function (t, c) {
        var n = el('div'); n.innerHTML = tile(t); n = n.firstChild; placeTile(n, c, r, true); board.appendChild(n); cells[r + ':' + c] = n;
      }); });
    }
    function cxy(c, r) { return [16 + c * STEP + 22, 16 + r * STEP + 24]; }
    async function swapMatch(a, b, clearKeys, freshTypes) {
      var A = cells[a], B = cells[b];
      var pa = cxy(+a.split(':')[1], +a.split(':')[0]), pb = cxy(+b.split(':')[1], +b.split(':')[0]);
      moveCursor(cur, pa[0], pa[1]); await sleep(520); if (!alive) return;
      await press(cur); A.classList.add('is-selected'); await sleep(260);
      moveCursor(cur, pb[0], pb[1]); await sleep(520); if (!alive) return;
      await press(cur); A.classList.remove('is-selected');
      var ra = +a.split(':')[0], ca = +a.split(':')[1], rb = +b.split(':')[0], cb = +b.split(':')[1];
      placeTile(A, cb, rb); placeTile(B, ca, ra); cells[a] = B; cells[b] = A;
      moveCursor(cur, pb[0] + 50, pb[1] + 40);
      await sleep(380); if (!alive) return;
      clearKeys.forEach(function (k) { cells[k].classList.add('is-clearing'); });
      await sleep(320); if (!alive) return;
      clearKeys.forEach(function (k) { cells[k].remove(); delete cells[k]; });
      settle(board, cells, grid.length, grid[0].length, freshTypes);
      await sleep(600);
    }
    while (alive) {
      build(); stage.classList.remove('is-fade'); moveCursor(cur, 262, 140);
      await sleep(600); if (!alive) break;
      // swap 1: r1c2 (R) with r2c2 (K) → bottom row R R R
      await swapMatch('1:2', '2:2', ['2:0', '2:1', '2:2'], ['D', 'K', 'S']);
      if (!alive) break;
      // swap 2: r2c3 (D) with r2c4 (S) → column 3 = S S S
      await swapMatch('2:3', '2:4', ['0:3', '1:3', '2:3'], ['R', 'K', 'D']);
      if (!alive) break;
      await sleep(900); stage.classList.add('is-fade'); await sleep(400);
    }
  }

  // ---------- step 2: rings → HIT ----------
  async function demoRings(stage) {
    // Start with one shield left so the loop is short: break it, boss exposed at full HP, then a SMASH.
    stage.innerHTML = miniBoss(1, 100) + '<div class="tut-squad">' + sqCard(PETS.S) + sqCard(PETS.R) + sqCard(PETS.K) + '</div>' + cursorMarkup();
    var cards = stage.querySelectorAll('.sq'), cur = stage.querySelector('.tut-cursor');
    var rings = [].map.call(cards, function (c) { return c.querySelector('.sq-ring path'); });
    var pips = stage.querySelectorAll('.shield-pips i');
    var boss = stage.querySelector('.tut-boss');
    var bar = stage.querySelector('.tut-bar'), fill = bar.querySelector('.pbar-fill'), txt = bar.querySelector('.pbar-text');
    var MAX = 1824;
    var shieldPill = stage.querySelector('.tut-shields');
    function setPips(n) {
      pips.forEach(function (p, i) { var on = i < n; p.className = on ? 'on' : 'off'; p.querySelector('img').src = ICONS + (on ? 'shield-on.svg' : 'shield-off.svg'); });
      bar.classList.toggle('is-shielded', n > 0);
      if (shieldPill) shieldPill.classList.toggle('is-exposed', n === 0);
      if (n > 0) { fill.style.width = '100%'; txt.textContent = 'Break shields first'; }
    }
    async function chargeAndHit(hero, ms) {
      rings.forEach(function (p, i) { p.style.transition = 'stroke-dashoffset ' + ms + 'ms linear'; p.style.strokeDashoffset = String(i === hero ? 0 : 35 + i * 15); });
      await sleep(ms + 50); if (!alive) return false;
      cards[hero].classList.add('is-ready'); await sleep(250);
      var r = cards[hero].getBoundingClientRect(), sb = stage.getBoundingClientRect();
      moveCursor(cur, r.left - sb.left + 26, r.top - sb.top + 28);
      await sleep(520); if (!alive) return false;
      await press(cur); cards[hero].classList.add('is-cast'); await sleep(200);
      boss.classList.add('is-hit');
      return true;
    }
    function settleHit(hero) {
      boss.classList.remove('is-hit'); cards[hero].classList.remove('is-ready', 'is-cast');
      rings.forEach(function (p) { p.style.transition = 'none'; p.style.strokeDashoffset = '100'; });
      moveCursor(cur, 262, 20);
    }
    moveCursor(cur, 262, 20);
    while (alive) {
      setPips(1); // shielded: the bar is locked and reads "Break shields first"
      await sleep(500); if (!alive) return;

      // 1) last shield: HIT breaks it
      if (!await chargeAndHit(0, 1300)) return;
      pips[0].classList.add('is-shatter');
      var w = el('span', 'fx-word fx-ability tut-word', 'SHIELD BREAK'); stage.appendChild(w);
      await sleep(600); if (!alive) return;
      w.remove(); settleHit(0); setPips(0);
      await sleep(300); if (!alive) return;

      // boss exposed at FULL HP: the bar unlocks and shows the number
      var ex = el('span', 'fx-word fx-exposed tut-word', 'EXPOSED!'); stage.appendChild(ex);
      fill.style.width = '100%'; txt.textContent = MAX.toLocaleString('en-US');
      await sleep(900); ex.remove(); if (!alive) return;

      // 2) exposed: HIT is a big extra blow
      if (!await chargeAndHit(1, 1200)) return;
      var hp = MAX - 674; fill.style.width = (100 * hp / MAX) + '%'; txt.textContent = hp.toLocaleString('en-US');
      var d = el('span', 'float-dmg is-chain tut-float', '-674'); boss.appendChild(d);
      var w2 = el('span', 'fx-word fx-ability tut-word', 'SMASH'); stage.appendChild(w2);
      await sleep(900); if (!alive) return;
      d.remove(); w2.remove(); settleHit(1);
      await sleep(1100); if (!alive) return;
    }
  }

  // ---------- step 3: exposed boss takes damage, hits back ----------
  async function demoShields(stage) {
    stage.innerHTML = miniBoss(0, 72, '1,824') +
      '<div class="tut-board tut-board--row"></div>' +
      '<div class="pill pill--bar tut-team"><div class="pbar"><div class="pbar-fill pbar-fill--team" style="width:64%"></div></div><span class="pbar-text">743</span></div>' + cursorMarkup();
    var board = stage.querySelector('.tut-board'), cur = stage.querySelector('.tut-cursor');
    var boss = stage.querySelector('.tut-boss'), bossFill = stage.querySelector('.pbar-fill--boss'), bossText = stage.querySelector('.tut-bar .pbar-text');
    var team = stage.querySelector('.tut-team'), teamFill = team.querySelector('.pbar-fill'), teamText = team.querySelector('.pbar-text');
    var MAXB = 1824, MAXT = 743, hp, thp;
    var cells = {};
    function reset() {
      board.innerHTML = ''; cells = {};
      'RRKR'.split('').forEach(function (t, c) { var n = el('div'); n.innerHTML = tile(t); n = n.firstChild; placeTile(n, c, 0, true); board.appendChild(n); cells['0:' + c] = n; });
      hp = MAXB; thp = MAXT; bossFill.style.width = '72%'; bossText.textContent = '1,824'; teamFill.style.width = '64%'; teamText.textContent = '743';
    }
    // one exchange: swap col a↔b, clear `clearCols`, refill with `fresh`, boss takes damage and hits back
    async function exchange(a, b, clearCols, fresh) {
      var bb = board.getBoundingClientRect(), sb = stage.getBoundingClientRect(), ox = bb.left - sb.left, oy = bb.top - sb.top;
      moveCursor(cur, ox + a * STEP + 22, oy + 24); await sleep(520); if (!alive) return false;
      await press(cur); cells['0:' + a].classList.add('is-selected'); await sleep(240);
      moveCursor(cur, ox + b * STEP + 22, oy + 24); await sleep(520); if (!alive) return false;
      await press(cur); cells['0:' + a].classList.remove('is-selected');
      var A = cells['0:' + a], B = cells['0:' + b]; placeTile(A, b, 0); placeTile(B, a, 0); cells['0:' + a] = B; cells['0:' + b] = A;
      moveCursor(cur, ox + 4 * STEP + 10, oy + 60);
      await sleep(380); if (!alive) return false;
      clearCols.forEach(function (c) { cells['0:' + c].classList.add('is-clearing'); });
      boss.classList.add('is-hit'); hp -= 320; bossFill.style.width = (72 * hp / MAXB) + '%'; bossText.textContent = hp.toLocaleString('en-US');
      var d = el('span', 'float-dmg tut-float', '-320'); boss.appendChild(d);
      await sleep(320); if (!alive) return false;
      clearCols.forEach(function (c) { cells['0:' + c].remove(); delete cells['0:' + c]; });
      settle(board, cells, 1, 4, fresh);                  // new pets drop into the gaps from above
      await sleep(600); if (!alive) return false;
      d.remove(); boss.classList.remove('is-hit');
      boss.classList.add('is-attacking'); await sleep(260);
      team.classList.add('is-hurt'); thp -= 35; teamFill.style.width = (64 * thp / MAXT) + '%'; teamText.textContent = String(thp);
      var h = el('span', 'float-hit tut-float tut-float--team', '-35'); stage.appendChild(h);
      await sleep(800); if (!alive) return false;
      h.remove(); team.classList.remove('is-hurt'); boss.classList.remove('is-attacking');
      await sleep(500);
      return alive;
    }
    while (alive) {
      reset(); moveCursor(cur, 262, 140); await sleep(600); if (!alive) return;
      // R R K R → swap 2↔3 → R R R K → clear 0,1,2 → refill K K S → K K S K
      if (!await exchange(2, 3, [0, 1, 2], ['K', 'K', 'S'])) return;
      // K K S K → swap 2↔3 → K K K S → clear 0,1,2 → refill R R K → R R K R (back to start)
      if (!await exchange(2, 3, [0, 1, 2], ['R', 'R', 'K'])) return;
      await sleep(400);
    }
  }

  // Shared: survivors settle down each column, holes refill from above with the next fresh types.
  function settle(board, cells, ROWS, COLS, freshTypes) {
    var fi = 0;
    for (var c = 0; c < COLS; c++) {
      var survivors = [];
      for (var r = ROWS - 1; r >= 0; r--) { var n = cells[r + ':' + c]; if (n) { survivors.push(n); delete cells[r + ':' + c]; } }
      var row = ROWS - 1;
      survivors.forEach(function (n) { placeTile(n, c, row); cells[row + ':' + c] = n; row--; });
      var holes = row + 1;
      for (var h = 0; h < holes; h++) {
        var spec = freshTypes[fi++ % freshTypes.length];
        var f = el('div'); f.innerHTML = tile(spec[0], spec.length > 1 ? spec.slice(1) : null); f = f.firstChild;
        f.style.transition = 'none'; f.style.transform = 'translate(' + (c * STEP) + 'px,' + (-(holes - h) * STEP) + 'px)';
        board.appendChild(f); void f.offsetWidth; f.style.transition = ''; placeTile(f, c, row); cells[row + ':' + c] = f; row--;
      }
    }
  }

  // ---------- step 4: blast tiles ----------
  async function demoBlast(stage) {
    stage.innerHTML = '<div class="tut-board"></div>' + cursorMarkup();
    var board = stage.querySelector('.tut-board'), cur = stage.querySelector('.tut-cursor');
    function cxy(c, r) { return [40 + c * STEP + 22, 20 + r * STEP + 24]; }
    async function clickSwap(cells, a, b) {
      var A = cells[a], B = cells[b];
      var ra = +a.split(':')[0], ca = +a.split(':')[1], rb = +b.split(':')[0], cb = +b.split(':')[1];
      var pa = cxy(ca, ra), pb = cxy(cb, rb);
      moveCursor(cur, pa[0], pa[1]); await sleep(520); if (!alive) return;
      await press(cur); A.classList.add('is-selected'); await sleep(260);
      moveCursor(cur, pb[0], pb[1]); await sleep(520); if (!alive) return;
      await press(cur); A.classList.remove('is-selected');
      placeTile(A, cb, rb); placeTile(B, ca, ra); cells[a] = B; cells[b] = A;
      moveCursor(cur, pb[0] + 60, pb[1] + 50);
      await sleep(380);
    }
    while (alive) {
      board.innerHTML = '';
      var grid = ['KSDKS', 'RRDRS', 'SKRDK'];
      var cells = {};
      grid.forEach(function (row, r) { row.split('').forEach(function (t, c) { var n = el('div'); n.innerHTML = tile(t); n = n.firstChild; placeTile(n, c, r, true); board.appendChild(n); cells[r + ':' + c] = n; }); });
      moveCursor(cur, 262, 140); await sleep(600); if (!alive) return;

      // 1) swap r1c2 (D) ↔ r2c2 (R) → row 1 = R R R R → 4-match spawns a Line Blast
      await clickSwap(cells, '1:2', '2:2'); if (!alive) return;
      ['1:0', '1:1', '1:2', '1:3'].forEach(function (k) { cells[k].classList.add('is-clearing'); });
      var w = el('span', 'fx-word fx-blast tut-word', 'LINE BLAST READY'); w.style.fontSize = '22px'; stage.appendChild(w);
      await sleep(320); if (!alive) return;
      ['1:0', '1:1', '1:2', '1:3'].forEach(function (k) { cells[k].remove(); delete cells[k]; });
      var sp = el('div'); sp.innerHTML = tile('R', 'line'); sp = sp.firstChild; placeTile(sp, 1, 1, true); sp.classList.add('is-spawn'); board.appendChild(sp); cells['1:1'] = sp;
      settle(board, cells, 3, 5, ['R', 'R', 'K']);     // fresh: col0=R, col2=R, col3=K → row 0 = R S R K S
      await sleep(700); w.remove(); if (!alive) return;
      await sleep(900); if (!alive) return;

      // 2) swap the blast up: r1c1 (blast) ↔ r0c1 (S) → row 0 = R [blast] R → match includes the blast → row explodes
      await clickSwap(cells, '1:1', '0:1'); if (!alive) return;
      var beam = el('div', 'blast-beam is-h'); beam.style.top = '0px'; beam.style.left = '0'; beam.style.width = (5 * STEP - G) + 'px'; beam.style.setProperty('--origin', (STEP + 20) + 'px'); board.appendChild(beam);
      var core = el('div', 'blast-core'); core.style.left = (STEP + 20) + 'px'; core.style.top = '20px'; board.appendChild(core);
      var w2 = el('span', 'fx-word fx-blast tut-word', 'LINE BLAST'); w2.style.fontSize = '26px'; stage.appendChild(w2);
      for (var c2 = 0; c2 < 5; c2++) { var n = cells['0:' + c2]; n.style.setProperty('--burn-delay', (120 + Math.abs(c2 - 1) * 60) + 'ms'); n.classList.add('is-burning'); }
      await sleep(1100); if (!alive) return; beam.remove(); core.remove(); w2.remove();
      for (var c3 = 0; c3 < 5; c3++) { cells['0:' + c3].remove(); delete cells['0:' + c3]; }
      settle(board, cells, 3, 5, ['K', 'D', 'S', 'K', 'D']);
      await sleep(1200);
    }
  }

  // ---------- step 5: stars ----------
  async function demoStars(stage) {
    // Figma 1289:3294 at half scale: three big stars with captions, claim button below.
    stage.innerHTML =
      '<div class="tut-big-star tut-big-star--l"><img class="ls" src="' + ICONS + 'star-96.svg" alt=""><span>Win the fight</span></div>' +
      '<div class="tut-big-star tut-big-star--c"><img class="ls" src="' + ICONS + 'star-96.svg" alt=""><span>Win with 50%+ HP</span></div>' +
      '<div class="tut-big-star tut-big-star--r"><img class="ls" src="' + ICONS + 'star-96.svg" alt=""><span>Less than <img class="tut-target" src="' + ICONS + 'target-21.svg" alt=""> turns</span></div>' +
      '<div class="tut-nft-slot"><button class="nft-note is-unlocked nft-claim tut-nft" type="button"><img src="' + ICONS + 'stars-3.svg" alt=""><span>Claim boss NFT</span></button></div>';
    var stars = stage.querySelectorAll('.ls'), nft = stage.querySelector('.tut-nft');
    while (alive) {
      stars.forEach(function (s) { s.classList.remove('on'); }); nft.classList.remove('is-show');
      await sleep(700); if (!alive) return;
      stars[0].classList.add('on'); await sleep(550); if (!alive) return;
      stars[1].classList.add('on'); await sleep(550); if (!alive) return;
      stars[2].classList.add('on'); await sleep(600); if (!alive) return;
      nft.classList.add('is-show');          // only now the claim button appears
      await sleep(2400); if (!alive) return;
    }
  }

  // ---------- overlay ----------
  var ov = null, idx = 0, runToken = 0, inline = false;
  // open(par) — overlay on body (the real thing). open(par, mountNode) — the same card mounted inline
  // (popups gallery): "Got it"/close just loop back to the first step instead of removing it.
  function open(parMoves, mount) {
    if (ov) return;
    par = parMoves || 27; idx = 0; inline = !!mount;
    ov = el('div', 'howto tut');
    ov.innerHTML = '<div class="howto-card tut-card">' +
      '<button class="btn-close tut-close" type="button" aria-label="Close"><img src="' + ICONS + 'close-dark.svg" alt=""></button>' +
      '<div class="tut-head"><h2 class="howto-title tut-title"></h2></div>' +
      '<div class="tut-stage-wrap"></div>' +
      '<p class="tut-text"></p>' +
      '<div class="tut-dots"></div>' +
      '<div class="tut-nav"><button class="btn-ghost tut-back" type="button">Back</button><button class="btn-primary tut-next" type="button">Next</button></div>' +
    '</div>';
    (mount || window.PetixExpeditionsOverlayRoot || document.body).appendChild(ov);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    ov.querySelector('.tut-close').addEventListener('click', close);
    ov.querySelector('.tut-back').addEventListener('click', function () { if (idx > 0) show(idx - 1); });
    ov.querySelector('.tut-next').addEventListener('click', function () { if (idx < STEPS.length - 1) show(idx + 1); else close(); });
    ov.querySelector('.tut-dots').innerHTML = STEPS.map(function (_, i) { return '<button class="tut-dot" type="button" data-i="' + i + '"></button>'; }).join('');
    ov.querySelectorAll('.tut-dot').forEach(function (d) { d.addEventListener('click', function () { show(+d.dataset.i); }); });
    show(0);
  }
  function show(i) {
    idx = i; alive = false; var token = ++runToken;
    var step = STEPS[i];
    ov.querySelector('.tut-title').textContent = step.title;
    ov.querySelector('.tut-text').innerHTML = step.text;
    ov.querySelectorAll('.tut-dot').forEach(function (d, k) { d.classList.toggle('on', k === i); });
    ov.querySelector('.tut-back').disabled = i === 0;
    ov.querySelector('.tut-next').textContent = i === STEPS.length - 1 ? 'Got it' : 'Next';
    var wrap = ov.querySelector('.tut-stage-wrap'); wrap.innerHTML = '';
    var sw = step.w || 296;
    var stage = makeStage('tut-stage--' + i, sw, 176); wrap.appendChild(stage);
    fitStage(stage, wrap, sw);
    setTimeout(function () { if (token !== runToken) return; alive = true; step.run(stage); }, 30);
  }
  function fitStage(stage, wrap, sw) {
    var w = wrap.clientWidth || 384; var k = Math.min(1, w / sw);
    stage.style.transform = 'scale(' + k + ')'; stage.style.transformOrigin = '0 0';
    wrap.style.height = Math.round(176 * k) + 'px';
    stage.style.marginLeft = Math.max(0, Math.round((w - sw * k) / 2)) + 'px';
  }
  function close() { if (inline && ov) { show(0); return; } alive = false; runToken++; if (ov) { ov.remove(); ov = null; } if (window.ExpeditionTutorial && typeof window.ExpeditionTutorial.onClose === 'function') { try { window.ExpeditionTutorial.onClose(); } catch (e) {} } }

  window.ExpeditionTutorial = { open: open, close: close, onClose: null };
})();
