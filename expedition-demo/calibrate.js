// Calibrate the boss ladder against real wallets.
//   node expedition-demo/calibrate.js <characters.json> <battles.json> [runsPerBoss] [maxWallets]
// Cohorts: "active" = wallets that attacked in the last 3 days, "newcomers" = wallets whose pets
// are all level 1 (≤3 pets). Each wallet fights with its best 4 pets (by level, then stat total).
// Env overrides: BOSS_JSON='[{"hp":..,"power":..,"shields":..},...]' replaces the roster.
const fs = require('fs');
const E = require('./engine.js');
let BOSSES = require('./bosses.js');
if (process.env.BOSS_JSON) {
  const o = JSON.parse(process.env.BOSS_JSON);
  BOSSES = BOSSES.map((b, i) => Object.assign({}, b, o[i] || {}));
}
if (process.env.TUNE) Object.assign(E.TUNING, JSON.parse(process.env.TUNE));
const [charsPath, battlesPath, runsArg, maxArg] = process.argv.slice(2);
const RUNS = Number(runsArg || 3), MAX = Number(maxArg || 250), BOSS_MAX = Number(process.env.BOSS_MAX || 6);

const chars = JSON.parse(fs.readFileSync(charsPath, 'utf8')).characters;
const battles = JSON.parse(fs.readFileSync(battlesPath, 'utf8')).battles;
const now = Date.now(), d3 = now - 3 * 864e5;

const byWallet = {};
chars.forEach((c) => { (byWallet[c.creatorWallet] = byWallet[c.creatorWallet] || []).push(c); });
const activeSet = new Set(battles.filter((b) => Date.parse(b.createdAt) >= d3).map((b) => b.attackerPet.wallet));
const active = [...activeSet].filter((w) => byWallet[w]);
const newcomers = Object.keys(byWallet).filter((w) => byWallet[w].length <= 3 && byWallet[w].every((c) => c.level <= 1));

function toPet(c) {
  return { id: c.id, name: c.name, level: c.level, stamina: c.attributes.stamina, strength: c.attributes.strength, agility: c.attributes.agility, intelligence: c.attributes.intelligence };
}
function squadOf(wallet) {
  const pets = byWallet[wallet].slice().sort((a, b) => b.level - a.level || statSum(b) - statSum(a)).slice(0, 4).map(toPet);
  return pets;
}
function statSum(c) { const a = c.attributes; return a.stamina + a.strength + a.agility + a.intelligence; }

function play(squad, boss, seed) {
  const s = E.createBattle({ squad, boss, seed });
  let guard = 0;
  while (!s.over && guard++ < 300) {
    s.squad.forEach((p, i) => { if (p.charge >= E.CHARGE_MAX) E.useAbility(s, i); });
    if (s.over) break;
    const m = E.bestMoveGreedy(s) || E.findMove(s);
    if (!m) break;
    E.playMove(s, m[0], m[1]);
  }
  return s.over ? s.over.won : false;
}

function cohortReport(label, wallets) {
  const sample = wallets.slice(0, MAX);
  const pass = Array(BOSS_MAX).fill(0), any = Array(BOSS_MAX).fill(0);
  const squads = sample.map(squadOf);
  const levels = squads.map((sq) => sq.reduce((a, p) => a + p.level, 0) / sq.length);
  levels.sort((a, b) => a - b);
  console.log(`\n${label}: ${wallets.length} wallets (sampled ${sample.length}); pets per wallet median ${median(sample.map((w) => byWallet[w].length))}, avg squad level median ${median(levels).toFixed(1)}, p75 ${levels[Math.floor(levels.length * 0.75)].toFixed(1)}, p90 ${levels[Math.floor(levels.length * 0.9)].toFixed(1)}`);
  squads.forEach((sq, wi) => {
    for (let b = 0; b < BOSS_MAX; b++) {
      let wins = 0;
      for (let r = 0; r < RUNS; r++) if (play(sq, BOSSES[b], 100 * wi + 7 * b + r + 1)) wins++;
      if (wins / RUNS >= 0.5) pass[b]++;
      if (wins > 0) any[b]++;
    }
  });
  console.log('boss   %wallets winning ≥50% of tries   %with at least one win');
  for (let b = 0; b < BOSS_MAX; b++) {
    console.log(`${String(b + 1).padStart(4)}   ${String(Math.round(100 * pass[b] / sample.length)).padStart(3)}%                              ${String(Math.round(100 * any[b] / sample.length)).padStart(3)}%`);
  }
}
function median(arr) { const s = arr.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; }

console.log('bosses:', BOSSES.slice(0, BOSS_MAX).map((b) => `${b.hp}/${b.power}/${b.shields}`).join(' '));
cohortReport('ACTIVE (attacked in last 3 days)', active);
cohortReport('NEWCOMERS (≤3 pets, all L1)', newcomers);

// Reference squads
const ref = {
  '3× L5 common (balanced)': [1, 2, 3].map((i) => ({ id: 'r' + i, name: 'r', level: 5, stamina: 4, strength: 4, agility: 3, intelligence: 3 })),
  '3× L5 common (STR-stacked)': [1, 2, 3].map((i) => ({ id: 's' + i, name: 's', level: 5, stamina: 2, strength: 9, agility: 2, intelligence: 1 })),
};
console.log('\nReference squads (win% over ' + RUNS * 4 + ' tries):');
Object.entries(ref).forEach(([k, sq]) => {
  const row = [];
  for (let b = 0; b < BOSS_MAX; b++) { let w = 0; for (let r = 0; r < RUNS * 4; r++) if (play(sq, BOSSES[b], 500 + 13 * b + r)) w++; row.push(String(Math.round(100 * w / (RUNS * 4))).padStart(3) + '%'); }
  console.log(`  ${k.padEnd(30)} ${row.join(' ')}`);
});
