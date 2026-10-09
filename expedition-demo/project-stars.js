// Projection: % of active wallets able to 3★ each boss after N days of PvP levelling.
//   node expedition-demo/project-stars.js <characters.json> <battles.json>
// Model: each active wallet keeps its real 7-day fight rate, wins 55%, +200 XP per win
// (battle-progression.js), XP goes to the pet it fights with (strongest first, round-robin
// among its top 3), each level-up adds +1 attribute point to the pet's weakest stat.
const fs = require('fs');
const E = require('./engine.js');
const BOSSES = require('./bosses.js');
const [charsPath, battlesPath] = process.argv.slice(2);
const chars = JSON.parse(fs.readFileSync(charsPath, 'utf8')).characters;
const battles = JSON.parse(fs.readFileSync(battlesPath, 'utf8')).battles;
const RUNS = 4, DAYS = [0, 4, 8, 12, 16, 20, 28, 40], WIN = 0.55, XP_WIN = 200;

function xpForNext(l) { return l <= 20 ? 500 + 50 * (l - 1) : 1450 + 75 * (l - 20); }
const byW = {}; chars.forEach((c) => { (byW[c.creatorWallet] = byW[c.creatorWallet] || []).push(c); });
const fights = {}; battles.forEach((b) => { fights[b.attackerPet.wallet] = (fights[b.attackerPet.wallet] || 0) + 1; });
const active = Object.keys(fights).filter((w) => byW[w]);

function clonePets(w) {
  return byW[w].slice().sort((a, b) => b.level - a.level).slice(0, 4).map((c) => ({
    id: c.id, name: c.name, level: c.level, xp: c.experience || 0,
    stamina: c.attributes.stamina, strength: c.attributes.strength, agility: c.attributes.agility, intelligence: c.attributes.intelligence
  }));
}
function grow(pets, wallet, days) {
  const perDay = fights[wallet] / 7;
  let wins = Math.round(perDay * days * WIN);
  const top = pets.slice(0, Math.min(3, pets.length));
  let i = 0;
  while (wins-- > 0 && top.length) {
    const p = top[i % top.length]; i++;
    p.xp += XP_WIN;
    while (p.xp >= xpForNext(p.level)) {
      p.xp -= xpForNext(p.level); p.level++;
      const keys = ['stamina', 'strength', 'agility', 'intelligence'];
      const weakest = keys.reduce((a, k) => (p[k] < p[a] ? k : a), keys[0]);
      p[weakest]++;
    }
  }
  return pets;
}
function play(squad, boss, seed) {
  const s = E.createBattle({ squad, boss, seed });
  let g = 0;
  while (!s.over && g++ < 300) {
    s.squad.forEach((p, i) => { if (p.charge >= E.CHARGE_MAX) E.useAbility(s, i); });
    if (s.over) break;
    const m = E.bestMoveGreedy(s) || E.findMove(s);
    if (!m) break;
    E.playMove(s, m[0], m[1]);
  }
  return s.over ? s.over.stars : 0;
}

console.log(`active wallets: ${active.length}; % of them reaching 3★ in ≥50% of tries (and ≥1 win) per boss, after N days`);
console.log('boss  ' + DAYS.map((d) => `d${d}`.padStart(9)).join(''));
for (let b = 0; b < BOSSES.length; b++) {
  const row = DAYS.map((days) => {
    let three = 0, won = 0;
    active.forEach((w, wi) => {
      const squad = grow(clonePets(w), w, days);
      let s3 = 0, w1 = 0;
      for (let r = 0; r < RUNS; r++) { const st = play(squad, BOSSES[b], 1000 * wi + 31 * b + r + days); if (st === 3) s3++; if (st > 0) w1++; }
      if (s3 / RUNS >= 0.5) three++;
      if (w1 > 0) won++;
    });
    return `${String(Math.round(100 * three / active.length)).padStart(3)}/${String(Math.round(100 * won / active.length)).padEnd(3)}`;
  });
  console.log(String(b + 1).padEnd(6) + row.map((c) => c.padStart(9)).join(''));
}
console.log('cell = %3★ / %win');
