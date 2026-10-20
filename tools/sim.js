// Measure computer strength: node tools/sim.js [games] [mode]
// Plays full games between AI levels with every seat rotated, prints win rates.
const E = require('../js/engine.js');
const AI = require('../js/ai.js');

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function playGame(levels, seed, rules) {
  const s = E.newGame({ names: levels.map((l, i) => l + i), seed, rules });
  const rnd = mulberry(seed * 7919 + 13);
  let steps = 0;
  while (s.pending) {
    const pd = s.pending;
    const lv = levels[pd.p];
    const view = E.viewFor(s, pd.p);
    const legal = pd.kind === 'action' ? E.legalActions(s, pd.p) : null;
    const r = AI.decide(view, pd, lv, rnd, legal, s.rules);
    E.act(s, r.d);
    if (++steps > 3000) throw new Error('game too long, seed ' + seed);
  }
  return { winner: s.winner, steps, turns: s.turnNo };
}

function matchup(levels, games, seed0, rules) {
  const n = levels.length;
  const wins = {};
  levels.forEach((l) => (wins[l] = 0));
  let turns = 0;
  for (let g = 0; g < games; g++) {
    const rot = g % n;
    const seats = levels.map((_, i) => levels[(i + rot) % n]);
    const r = playGame(seats, seed0 + g, rules);
    wins[seats[r.winner]] += 1;
    turns += r.turns;
  }
  return { wins, avgTurns: turns / games };
}

if (require.main === module) {
  const games = +process.argv[2] || 600;
  const mode = process.argv[3] || 'all';
  const t0 = Date.now();
  const out = {};
  const run = (name, lv) => {
    const r = matchup(lv, games, 1000);
    const pct = {};
    // win share per distinct level; a level that fills k seats gets its total share
    for (const l of Object.keys(r.wins)) pct[l] = +(100 * r.wins[l] / games).toFixed(1);
    out[name] = { seats: lv.join(' v '), winPct: pct, avgTurns: +r.avgTurns.toFixed(1) };
    console.log(name.padEnd(22), lv.join(' v ').padEnd(34), JSON.stringify(pct), 'turns', r.avgTurns.toFixed(1));
  };
  if (mode === 'all' || mode === 'duel') {
    run('hard-vs-easy', ['hard', 'easy']);
    run('hard-vs-medium', ['hard', 'medium']);
    run('medium-vs-easy', ['medium', 'easy']);
  }
  if (mode === 'all' || mode === 'three') run('three-way', ['easy', 'medium', 'hard']);
  if (mode === 'all' || mode === 'table') {
    run('hard-vs-5-easy', ['hard', 'easy', 'easy', 'easy', 'easy', 'easy']);
    run('hard-vs-3-medium', ['hard', 'medium', 'medium', 'medium']);
  }
  console.log('ms', Date.now() - t0);
}

module.exports = { playGame, matchup };
