// Expedition battle engine — ONE file for the browser (dashboard) and Node (server replay). Deterministic by seed:
// the server re-runs the player's moves with the same seed and must get byte-identical results, so never add
// Math.random/Date here. Mirrored in expedition-demo/engine.js; keep the two identical.
/*
 * Expedition boss battle — match-3 engine (pure logic, no DOM).
 * Loaded in the browser as window.ExpeditionEngine and in Node via require().
 *
 * Squad stats map 1:1 to Petix character attributes:
 *   stamina -> team HP pool, strength -> tile damage,
 *   intelligence + agility -> super-hit charge speed (agility also gives a small dodge chance).
 *
 * Fight structure: the boss starts behind N shields. While shields are up, matches do no HP
 * damage; they only charge the squad's rings. A full ring = one super hit: BREAK a shield while
 * any remain, SMASH for big damage once the boss is exposed.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ExpeditionEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SIZE = 7;
  var SLOTS = 4;                  // player squad slots
  var TYPES = 5;                  // tile colours on the board: 4 squad slots + wild pets
  var CHARGE_MAX = 100;

  // ---------- tuning ----------
  var T = {
    tileDmgBase: 4,
    tileDmgPerStr: 2.5,
    levelMult: 0.05,             // +5% per level above 1
    hpBasePerPet: 120,           // every real pet brings some HP even with 0 stamina
    hpPerStamina: 70,
    dodgePerAgi: 0.04, dodgeCap: 0.4,
    cascadePerAgi: 0.015,        // extra dmg per cascade level per avg agility
    cascadeStep: 0.15,           // base bonus per cascade level
    chargeBase: 5,               // ring charge per matched tile for any real pet
    chargePerInt: 3,             // ... extra per intelligence point
    chargePerAgi: 1.5,           // ... extra per agility point
    smashTiles: 6,               // SMASH = this many tiles of the pet's damage
    shieldEfficiency: 9,         // tiles-worth of charge per move the par assumes
    sizeMult: { 3: 1, 4: 1.5, 5: 2.2 },
    bossRage: 0.03,              // boss power grows after each hit
    parEfficiency: 15,           // tiles-worth of damage per move the par assumes
    wild: { stamina: 0, strength: 2, agility: 0, intelligence: 0, level: 1 }
  };

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function lvlMult(level) { return 1 + T.levelMult * (Math.max(1, level || 1) - 1); }

  function tileDamage(pet) {
    if (!pet) return 0;
    return Math.round((T.tileDmgBase + T.tileDmgPerStr * pet.strength) * lvlMult(pet.level));
  }

  function abilityFor(pet) { return pet && !pet.mercenary ? 'super' : null; }
  function chargeRate(pet) { return pet.mercenary ? 0 : T.chargeBase + pet.intelligence * T.chargePerInt + pet.agility * T.chargePerAgi; }

  var ABILITY_INFO = {
    break: { label: 'Break', desc: 'Shatters one of the boss shields.' },
    smash: { label: 'Smash', desc: 'Hits the exposed boss for 8 tiles of damage.' }
  };

  // ---------- squad ----------
  // Board colours are pets: the player's squad first, then "wild" pets that only fill colours
  // (empty squad slots and the extra colours). Wild pets hit weakly, add no HP and have no ability.
  function buildSquad(pets, wilds) {
    var squad = [];
    var pool = (wilds || []).slice();
    function wild(i) {
      var w = pool.shift() || { id: 'wild' + i, name: 'Wild', img: null };
      return Object.assign({ id: w.id, name: w.name, img: w.img, mercenary: true, ability: null, charge: 0 }, T.wild);
    }
    for (var i = 0; i < TYPES; i++) {
      var p = i < SLOTS ? pets[i] : null;
      if (p) {
        squad.push({
          id: p.id, name: p.name, img: p.img, level: p.level || 1,
          stamina: p.stamina, strength: p.strength, agility: p.agility, intelligence: p.intelligence,
          mercenary: false, ability: null, charge: 0
        });
      } else squad.push(wild(i));
    }
    squad.forEach(function (s) { s.ability = abilityFor(s); s.dmg = tileDamage(s); s.rate = chargeRate(s); });
    return squad;
  }

  function squadMaxHp(squad) {
    return squad.reduce(function (a, s) { return a + (s.mercenary ? 0 : Math.round((T.hpBasePerPet + s.stamina * T.hpPerStamina) * lvlMult(s.level))); }, 0);
  }
  function avgStat(squad, key) {
    var real = squad.filter(function (s) { return !s.mercenary; });
    if (!real.length) return 0;
    return real.reduce(function (a, s) { return a + s[key]; }, 0) / real.length;
  }

  function computePar(boss, squad) {
    var avgDmg = squad.reduce(function (a, s) { return a + s.dmg; }, 0) / squad.length;
    var avgRate = squad.reduce(function (a, s) { return a + s.rate; }, 0) / squad.length;
    // Shield phase: rings filled per move ≈ tiles matched × average charge rate / 100.
    var shieldMoves = avgRate > 0 ? (boss.shields || 0) * CHARGE_MAX / (avgRate * T.shieldEfficiency) : 0;
    // Damage phase: expected damage per move for a competent player (3-matches + cascades + specials).
    var dmgMoves = boss.hp / (avgDmg * T.parEfficiency);
    return Math.max(4, Math.ceil(shieldMoves + dmgMoves));
  }

  // ---------- board ----------
  function idx(r, c) { return r * SIZE + c; }

  function createBattle(opts) {
    var rng = mulberry32(opts.seed || 1);
    var squad = buildSquad(opts.squad || [], opts.wilds || []);
    var maxHp = Math.max(1, squadMaxHp(squad));
    var state = {
      size: SIZE,
      rng: rng,
      nextId: 1,
      squad: squad,
      boss: { name: opts.boss.name, img: opts.boss.img, hp: opts.boss.hp, maxHp: opts.boss.hp, shields: opts.boss.shields || 0, maxShields: opts.boss.shields || 0, power: opts.boss.power, basePower: opts.boss.power, attacks: 0 },
      team: { hp: maxHp, maxHp: maxHp, dodge: Math.min(T.dodgeCap, avgStat(squad, 'agility') * T.dodgePerAgi), cascadeBonus: avgStat(squad, 'agility') * T.cascadePerAgi },
      blocked: 0,
      moves: 0,
      supers: 0,
      par: 0,
      bestChain: 0,
      biggestMatch: 0,
      totalDamage: 0,
      dodged: 0,
      board: [],
      over: null
    };
    // Fixed turn limit per boss (same for every player); the squad-based estimate is only a fallback for tooling.
    state.par = opts.boss.par || computePar(state.boss, squad);
    fillInitialBoard(state);
    return state;
  }

  function newTile(state, type, special) {
    return { id: state.nextId++, type: type, special: special || null };
  }
  function randType(state) { return Math.floor(state.rng() * TYPES); }

  function fillInitialBoard(state) {
    var b = new Array(SIZE * SIZE);
    for (var r = 0; r < SIZE; r++) for (var c = 0; c < SIZE; c++) {
      var t;
      do {
        t = randType(state);
      } while ((c >= 2 && b[idx(r, c - 1)].type === t && b[idx(r, c - 2)].type === t) ||
               (r >= 2 && b[idx(r - 1, c)].type === t && b[idx(r - 2, c)].type === t));
      b[idx(r, c)] = newTile(state, t);
    }
    state.board = b;
    if (!findMove(state)) fillInitialBoard(state);
  }

  function findMatches(board) {
    var groups = [];
    var seen = {};
    function run(cells) {
      if (cells.length >= 3) groups.push(cells);
    }
    for (var r = 0; r < SIZE; r++) {
      var cells = [idx(r, 0)];
      for (var c = 1; c <= SIZE; c++) {
        var i = idx(r, c), prev = cells[cells.length - 1];
        if (c < SIZE && board[i].type === board[prev].type) cells.push(i);
        else { run(cells); cells = c < SIZE ? [i] : []; }
      }
    }
    for (var c2 = 0; c2 < SIZE; c2++) {
      var cells2 = [idx(0, c2)];
      for (var r2 = 1; r2 <= SIZE; r2++) {
        var i2 = idx(r2, c2), prev2 = cells2[cells2.length - 1];
        if (r2 < SIZE && board[i2].type === board[prev2].type) cells2.push(i2);
        else { run(cells2); cells2 = r2 < SIZE ? [i2] : []; }
      }
    }
    // merge overlapping groups (L / T shapes)
    var merged = [];
    groups.forEach(function (g) {
      var target = null;
      merged.forEach(function (m) {
        if (!target && g.some(function (i) { return m.cells.indexOf(i) >= 0; })) target = m;
      });
      if (target) {
        g.forEach(function (i) { if (target.cells.indexOf(i) < 0) target.cells.push(i); });
        target.len = Math.max(target.len, g.length);
      } else merged.push({ cells: g.slice(), len: g.length, type: board[g[0]].type });
    });
    return merged;
  }

  function swapCells(board, a, b) { var t = board[a]; board[a] = board[b]; board[b] = t; }

  function adjacent(a, b) {
    var ra = Math.floor(a / SIZE), ca = a % SIZE, rb = Math.floor(b / SIZE), cb = b % SIZE;
    return Math.abs(ra - rb) + Math.abs(ca - cb) === 1;
  }

  function canSwap(state, a, b) {
    if (!adjacent(a, b)) return false;
    var board = state.board;
    swapCells(board, a, b);
    var ok = findMatches(board).length > 0;
    swapCells(board, a, b);
    return ok;
  }

  function findMove(state) {
    for (var i = 0; i < SIZE * SIZE; i++) {
      var r = Math.floor(i / SIZE), c = i % SIZE;
      if (c + 1 < SIZE && canSwap(state, i, i + 1)) return [i, i + 1];
      if (r + 1 < SIZE && canSwap(state, i, i + SIZE)) return [i, i + SIZE];
    }
    return null;
  }

  // ---------- resolution ----------
  // Expands matched cells through special tiles. Also returns each blast (origin + special kind)
  // so the UI can draw the shockwave.
  function expandSpecials(board, cells, blasts) {
    var set = {};
    var queue = cells.slice();
    cells.forEach(function (i) { set[i] = true; });
    while (queue.length) {
      var i = queue.shift();
      var t = board[i];
      if (!t) continue;
      if (t.special === 'line') {
        if (blasts) blasts.push({ at: i, special: 'line' });
        var r = Math.floor(i / SIZE);
        for (var c = 0; c < SIZE; c++) { var j = idx(r, c); if (!set[j]) { set[j] = true; queue.push(j); } }
      } else if (t.special === 'cross') {
        if (blasts) blasts.push({ at: i, special: 'cross' });
        var r2 = Math.floor(i / SIZE), c2 = i % SIZE;
        for (var k = 0; k < SIZE; k++) {
          var j1 = idx(r2, k), j2 = idx(k, c2);
          if (!set[j1]) { set[j1] = true; queue.push(j1); }
          if (!set[j2]) { set[j2] = true; queue.push(j2); }
        }
      }
    }
    return Object.keys(set).map(Number);
  }

  function resolveBoard(state, events, chainStart) {
    var board = state.board;
    var chain = chainStart || 0;
    var totalDmg = 0;
    while (true) {
      var groups = findMatches(board);
      if (!groups.length) break;
      chain += 1;
      state.bestChain = Math.max(state.bestChain, chain);
      var cleared = [];
      var spawns = [];
      var blasts = [];
      var dmgByType = {};
      groups.forEach(function (g) {
        state.biggestMatch = Math.max(state.biggestMatch, g.len);
        if (g.len >= 5) spawns.push({ at: g.cells[Math.floor(g.cells.length / 2)], type: g.type, special: 'cross' });
        else if (g.len === 4) spawns.push({ at: g.cells[1], type: g.type, special: 'line' });
        var cells = expandSpecials(board, g.cells, blasts);
        cells.forEach(function (i) { if (cleared.indexOf(i) < 0) cleared.push(i); });
        var mult = T.sizeMult[Math.min(5, g.len)];
        cells.forEach(function (i) {
          var pet = state.squad[board[i].type];
          dmgByType[pet.id] = (dmgByType[pet.id] || 0) + pet.dmg * mult;
          pet.charge = Math.min(CHARGE_MAX, pet.charge + pet.rate);
        });
      });
      var chainMult = 1 + (chain - 1) * (T.cascadeStep + state.team.cascadeBonus);
      var dmg = 0;
      Object.keys(dmgByType).forEach(function (k) { dmg += dmgByType[k]; });
      dmg = Math.round(dmg * chainMult);
      var shielded = state.boss.shields > 0;
      if (shielded) { state.blocked += dmg; dmg = 0; }
      state.boss.hp = Math.max(0, state.boss.hp - dmg);
      totalDmg += dmg;
      state.totalDamage += dmg;

      events.push({ type: 'match', cells: cleared, chain: chain, damage: dmg, shielded: shielded, blasts: blasts, groups: groups.map(function (g) { return { type: g.type, len: g.len }; }), bossHp: state.boss.hp });

      // remove, spawn specials, collapse, refill
      cleared.forEach(function (i) { board[i] = null; });
      spawns.forEach(function (s) { board[s.at] = newTile(state, s.type, s.special); });
      if (spawns.length) events.push({ type: 'spawn', tiles: spawns.map(function (s) { return { at: s.at, id: board[s.at].id, type: s.type, special: s.special }; }) });
      collapseAndRefill(state, events);
      if (state.boss.hp <= 0) break;
    }
    if (state.boss.hp > 0 && !findMove(state)) {
      fillInitialBoard(state);
      events.push({ type: 'shuffle', board: snapshot(state) });
    }
    return totalDmg;
  }

  function collapseAndRefill(state, events) {
    var board = state.board, moves = [], fresh = [];
    for (var c = 0; c < SIZE; c++) {
      var write = SIZE - 1;
      for (var r = SIZE - 1; r >= 0; r--) {
        var i = idx(r, c);
        if (board[i]) {
          if (write !== r) { board[idx(write, c)] = board[i]; board[i] = null; moves.push({ id: board[idx(write, c)].id, from: i, to: idx(write, c) }); }
          write--;
        }
      }
      for (var r3 = write; r3 >= 0; r3--) {
        var t = newTile(state, randType(state));
        board[idx(r3, c)] = t;
        fresh.push({ id: t.id, at: idx(r3, c), type: t.type, fromRow: r3 - (write + 1) });
      }
    }
    events.push({ type: 'collapse', moves: moves, fresh: fresh });
  }

  // Detonate a special tile in place (tap). Costs a move like a swap; the boss hits back.
  function detonate(state, at) {
    var events = [];
    var board = state.board;
    if (state.over || !board[at] || !board[at].special) { events.push({ type: 'invalid', a: at, b: at }); return events; }
    state.moves += 1;
    var blasts = [];
    var cells = expandSpecials(board, [at], blasts);
    var dmg = 0;
    cells.forEach(function (i) {
      var pet = state.squad[board[i].type];
      dmg += pet.dmg;
      pet.charge = Math.min(CHARGE_MAX, pet.charge + pet.rate);
    });
    dmg = Math.round(dmg);
    var shielded = state.boss.shields > 0;
    if (shielded) { state.blocked += dmg; dmg = 0; }
    state.boss.hp = Math.max(0, state.boss.hp - dmg);
    state.totalDamage += dmg;
    state.biggestMatch = Math.max(state.biggestMatch, cells.length);
    events.push({ type: 'match', cells: cells, chain: 1, damage: dmg, shielded: shielded, blasts: blasts, groups: [{ type: board[at].type, len: cells.length }], bossHp: state.boss.hp, tap: true });
    cells.forEach(function (i) { board[i] = null; });
    collapseAndRefill(state, events);
    if (state.boss.hp > 0) resolveBoard(state, events, 1);
    if (state.boss.hp > 0) bossTurn(state, events);
    state.squad.forEach(function (s, i) { if (s.charge >= CHARGE_MAX && !s.readyFlag) { s.readyFlag = true; events.push({ type: 'ability-ready', slot: i }); } });
    checkEnd(state, events);
    return events;
  }

  // Turn an ordinary tile into a special one (demo / debugging).
  function plantSpecial(state, kind, at) {
    var board = state.board;
    if (at === undefined) {
      var candidates = [];
      board.forEach(function (t, i) { if (!t.special) candidates.push(i); });
      if (!candidates.length) return null;
      at = candidates[Math.floor(state.rng() * candidates.length)];
    }
    board[at].special = kind;
    return { at: at, id: board[at].id, type: board[at].type, special: kind };
  }

  function snapshot(state) {
    return state.board.map(function (t, i) { return { id: t.id, at: i, type: t.type, special: t.special }; });
  }

  // The boss answers every player move with one hit; each hit is a little stronger than the last.
  function bossTurn(state, events) {
    state.boss.attacks += 1;
    var power = Math.round(state.boss.basePower * Math.pow(1 + T.bossRage, state.boss.attacks - 1));
    state.boss.power = power;
    var ev = { type: 'boss-attack', power: power, damage: 0, dodged: false };
    if (state.rng() < state.team.dodge) { ev.dodged = true; state.dodged += 1; }
    else {
      ev.damage = power;
      state.team.hp = Math.max(0, state.team.hp - ev.damage);
    }
    ev.teamHp = state.team.hp;
    ev.nextPower = Math.round(state.boss.basePower * Math.pow(1 + T.bossRage, state.boss.attacks));
    events.push(ev);
  }

  function checkEnd(state, events) {
    if (state.over) return;
    if (state.boss.hp <= 0) state.over = result(state, true);
    else if (state.team.hp <= 0) state.over = result(state, false);
    if (state.over) events.push({ type: 'end', result: state.over });
  }

  function result(state, won) {
    var hpPct = state.team.hp / state.team.maxHp;
    var stars = 0;
    var criteria = [
      { key: 'win', label: 'Defeat the boss', ok: won },
      { key: 'hp', label: 'Finish with 50%+ team HP', ok: won && hpPct >= 0.5, value: Math.round(hpPct * 100) + '%' },
      { key: 'par', label: 'Win within ' + state.par + ' turns', ok: won && state.moves <= state.par, value: state.moves + ' turns' }
    ];
    if (won) { stars = 1; if (criteria[1].ok) stars++; if (criteria[2].ok) stars++; }
    return { won: won, stars: stars, criteria: criteria, moves: state.moves, par: state.par, hpPct: hpPct, bestChain: state.bestChain, biggestMatch: state.biggestMatch, totalDamage: state.totalDamage, shields: state.boss.maxShields, supers: state.supers };
  }

  // ---------- public actions ----------
  function playMove(state, a, b) {
    var events = [];
    if (state.over) return events;
    if (!canSwap(state, a, b)) { events.push({ type: 'invalid', a: a, b: b }); return events; }
    var board = state.board;
    state.moves += 1;
    events.push({ type: 'swap', a: a, b: b, ida: board[a].id, idb: board[b].id });
    swapCells(board, a, b);

    resolveBoard(state, events, 0);
    if (state.boss.hp > 0) bossTurn(state, events);
    state.squad.forEach(function (s, i) { if (s.charge >= CHARGE_MAX && !s.readyFlag) { s.readyFlag = true; events.push({ type: 'ability-ready', slot: i }); } });
    checkEnd(state, events);
    return events;
  }

  function useAbility(state, slot) {
    var events = [];
    var pet = state.squad[slot];
    if (state.over || !pet || !pet.ability || pet.charge < CHARGE_MAX) return events;
    pet.charge = 0; pet.readyFlag = false;
    state.supers += 1;
    var ev = { type: 'ability', slot: slot };
    if (state.boss.shields > 0) {
      state.boss.shields -= 1;
      ev.ability = 'break';
      ev.shields = state.boss.shields;
      if (state.boss.shields === 0) ev.exposed = true;
    } else {
      ev.ability = 'smash';
      ev.damage = pet.dmg * T.smashTiles;
      state.boss.hp = Math.max(0, state.boss.hp - ev.damage);
      state.totalDamage += ev.damage;
    }
    ev.bossHp = state.boss.hp; ev.teamHp = state.team.hp;
    events.push(ev);
    checkEnd(state, events);
    return events;
  }

  // ---------- economy / stars ----------
  // Entry fee per attempt. Sized against real income: a fresh wallet farms ~1 000 Points/day
  // (3 Common L1 × 240 + 3 PvP wins), a mid wallet 2–3k, a maxed one 6k+.
  // Rules (fees per boss, payout multipliers per star, base reward of the free boss) come from the server's
  // economy config in production; the defaults below keep the demo and tooling working without one.
  var DEFAULT_RULES = {
    fees: [0, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 8000],
    // Each star pays its own share of the fee ONCE (owner decision 2026-10-03): 1★ 0.5×, 2★ 1×, 3★ 2× → up to 3.5× per boss.
    rewardMults: { 1: 0.5, 2: 1, 3: 2 },
    freeBossRewardBase: 1000
  };
  function rulesOf(rules) {
    if (!rules) return DEFAULT_RULES;
    return {
      fees: Array.isArray(rules.fees) && rules.fees.length ? rules.fees : DEFAULT_RULES.fees,
      rewardMults: rules.rewardMults || DEFAULT_RULES.rewardMults,
      freeBossRewardBase: rules.freeBossRewardBase != null ? Number(rules.freeBossRewardBase) : DEFAULT_RULES.freeBossRewardBase
    };
  }
  // A boss already cleared with 3 stars is free to replay (nothing left to earn).
  function entryFee(bossIndex, bestStars, rules) {
    var r = rulesOf(rules);
    return (bestStars || 0) >= 3 ? 0 : (Number(r.fees[bossIndex - 1]) || 0);
  }
  // Rewards scale with the boss's fee; a free boss pays from a fixed base instead.
  function rewardBase(bossIndex, rules) {
    var r = rulesOf(rules);
    var fee = Number(r.fees[bossIndex - 1]) || 0;
    return fee > 0 ? fee : r.freeBossRewardBase;
  }
  // Payout for reaching exactly tier `t` (paid once per tier).
  function rewardTier(bossIndex, t, rules) {
    var r = rulesOf(rules);
    return Math.round(rewardBase(bossIndex, r) * (Number(r.rewardMults[t]) || 0));
  }
  // Everything paid out for best result `stars` (sum of tiers 1..stars) — callers pay rewardFor(new) − rewardFor(prev).
  function rewardFor(bossIndex, stars, rules) { var s = 0; for (var t = 1; t <= (stars || 0); t++) s += rewardTier(bossIndex, t, rules); return s; }

  // ---------- simple AI for balancing ----------
  function bestMoveGreedy(state) {
    var best = null, bestScore = -1;
    var board = state.board;
    for (var i = 0; i < SIZE * SIZE; i++) {
      var r = Math.floor(i / SIZE), c = i % SIZE;
      [[i, i + 1, c + 1 < SIZE], [i, i + SIZE, r + 1 < SIZE]].forEach(function (m) {
        if (!m[2] || !canSwap(state, m[0], m[1])) return;
        swapCells(board, m[0], m[1]);
        var groups = findMatches(board);
        var score = 0;
        groups.forEach(function (g) {
          var cells = expandSpecials(board, g.cells);
          score += cells.length * (state.squad[g.type].dmg / 20) * (T.sizeMult[Math.min(5, g.len)]);
        });
        swapCells(board, m[0], m[1]);
        if (score > bestScore) { bestScore = score; best = [m[0], m[1]]; }
      });
    }
    return best;
  }

  return {
    SIZE: SIZE, SLOTS: SLOTS, TYPES: TYPES, CHARGE_MAX: CHARGE_MAX, TUNING: T,
    ABILITY_INFO: ABILITY_INFO,
    createBattle: createBattle, playMove: playMove, useAbility: useAbility, detonate: detonate, plantSpecial: plantSpecial,
    canSwap: canSwap, findMove: findMove, bestMoveGreedy: bestMoveGreedy,
    buildSquad: buildSquad, computePar: computePar, tileDamage: tileDamage, squadMaxHp: squadMaxHp, chargeRate: chargeRate,
    DEFAULT_RULES: DEFAULT_RULES, entryFee: entryFee, rewardFor: rewardFor, rewardTier: rewardTier, snapshot: snapshot, abilityFor: abilityFor
  };
});
