// Balance check: greedy bot vs every boss with several squads.
// node expedition-demo/simulate.js
const E = require('./engine.js');
const BOSSES = require('./bosses.js');
if (process.env.DMG_BASE) E.TUNING.tileDmgBase = +process.env.DMG_BASE;
if (process.env.DMG_STR) E.TUNING.tileDmgPerStr = +process.env.DMG_STR;
if (process.env.PAR_EFF) E.TUNING.parEfficiency = +process.env.PAR_EFF;
if (process.env.HP_STA) E.TUNING.hpPerStamina = +process.env.HP_STA;
if (process.env.CH_INT) E.TUNING.chargePerInt = +process.env.CH_INT;
if (process.env.CH_AGI) E.TUNING.chargePerAgi = +process.env.CH_AGI;
if (process.env.SMASH) E.TUNING.smashTiles = +process.env.SMASH;
if (process.env.RAGE) E.TUNING.bossRage = +process.env.RAGE;
if (process.env.SHIELD_EFF) E.TUNING.shieldEfficiency = +process.env.SHIELD_EFF;
if (process.env.SHIELDS) BOSSES.forEach((b, i) => { b.shields = Math.round(b.shields * +process.env.SHIELDS); });
const HPM = +(process.env.BOSS_HP || 1), PWM = +(process.env.BOSS_PW || 1);
BOSSES.forEach((b) => { b.hp = Math.round(b.hp * HPM); b.power = Math.round(b.power * PWM); });

function pet(name, sta, str, agi, int, level) {
  return { id: name, name, stamina: sta, strength: str, agility: agi, intelligence: int, level };
}
const SQUADS = {
  'solo L1 common': [pet('a', 3, 3, 2, 2, 1)],
  '2x L1 common': [pet('a', 3, 3, 2, 2, 1), pet('b', 2, 4, 2, 2, 1)],
  '4x L1 common': [pet('a', 3, 3, 2, 2, 1), pet('b', 2, 4, 2, 2, 1), pet('c', 3, 2, 3, 2, 1), pet('d', 2, 3, 2, 3, 1)],
  '4x L3 common': [pet('a', 4, 3, 2, 3, 3), pet('b', 3, 4, 3, 2, 3), pet('c', 3, 3, 3, 3, 3), pet('d', 3, 4, 2, 3, 3)],
  '4x L5 common': [pet('a', 4, 4, 3, 3, 5), pet('b', 3, 5, 3, 3, 5), pet('c', 4, 3, 4, 3, 5), pet('d', 3, 4, 3, 4, 5)],
  '4x L8 mixed': [pet('a', 5, 5, 4, 3, 8), pet('b', 4, 6, 3, 4, 8), pet('c', 5, 4, 4, 4, 8), pet('d', 4, 5, 4, 4, 8)],
  '4x L12 mixed': [pet('a', 6, 6, 4, 5, 12), pet('b', 5, 7, 4, 5, 12), pet('c', 6, 5, 5, 5, 12), pet('d', 5, 6, 5, 5, 12)],
  '4x L20 epic': [pet('a', 7, 8, 6, 6, 20), pet('b', 6, 9, 6, 6, 20), pet('c', 8, 6, 7, 6, 20), pet('d', 6, 7, 6, 8, 20)]
};

function play(squad, boss, seed) {
  const s = E.createBattle({ squad, boss, seed });
  let guard = 0;
  while (!s.over && guard++ < 300) {
    // use abilities greedily
    s.squad.forEach((p, i) => {
      if (p.charge >= E.CHARGE_MAX) E.useAbility(s, i);
    });
    if (s.over) break;
    const m = E.bestMoveGreedy(s) || E.findMove(s);
    if (!m) break;
    E.playMove(s, m[0], m[1]);
  }
  return s.over || { won: false, stars: 0, moves: s.moves, par: s.par, hpPct: s.team.hp / s.team.maxHp };
}

const RUNS = Number(process.argv[2] || 60);
console.log('runs per cell:', RUNS);
console.log('boss'.padEnd(6) + Object.keys(SQUADS).map((k) => k.padStart(23)).join(''));
BOSSES.forEach((boss, bi) => {
  const cells = Object.values(SQUADS).map((squad) => {
    let wins = 0, stars = [0, 0, 0, 0], moves = 0, par = 0, hp = 0;
    for (let i = 0; i < RUNS; i++) {
      const r = play(squad, boss, 1000 * bi + i + 7);
      if (r.won) { wins++; hp += r.hpPct; }
      stars[r.stars]++;
      moves += r.moves; par = r.par;
    }
    const w = Math.round(100 * wins / RUNS);
    const s3 = Math.round(100 * stars[3] / RUNS);
    const hpAvg = wins ? Math.round(100 * hp / wins) : 0;
    return `${String(w).padStart(3)}%★3${String(s3).padStart(3)}% hp${String(hpAvg).padStart(3)}% ${String(Math.round(moves / RUNS)).padStart(2)}/${String(par).padStart(2)}`;
  });
  console.log(String(bi + 1).padEnd(6) + cells.map((c) => c.padStart(23)).join(''));
});
