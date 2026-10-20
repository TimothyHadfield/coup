// Data for the Learn tab: node tools/hands.js [games3p] [gamesPerSize]
// 1. Starting-hand win rates: Hard vs Hard vs Hard, every starting pair.
// 2. Seat win rates (does going first help?) for 2-6 players, all Hard.
// 3. Strength table: the measured win rates quoted in the app.
// Writes data/stats.json (the app reads it; nothing here runs on the phone).
const fs = require('fs');
const path = require('path');
const E = require('../js/engine.js');
const AI = require('../js/ai.js');
const S = require('./sim.js');

const G3 = +process.argv[2] || 6000;
const GN = +process.argv[3] || 600;

function rndFrom(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function play(n, seed, rules) {
  const s = E.newGame({ names: Array.from({ length: n }, (_, i) => 'h' + i), seed, rules });
  const first = s.turn;
  const start = s.players.map((p) => p.cards.map((c) => c.c).sort().join('+'));
  const rnd = rndFrom(seed * 31 + 7);
  while (s.pending) {
    const pd = s.pending;
    const d = AI.decide(E.view(s, pd.p), pd, 'hard', rnd, pd.kind === 'action' ? E.legalActions(s, pd.p) : null, s.rules);
    E.act(s, d.d);
  }
  return { first, start, winner: s.winner, turns: s.turnNo };
}

const out = { made: new Date().toISOString().slice(0, 10), hands: {}, seats: {}, strength: {} };
// 1. starting hands, 3 players
const H = {};
for (let g = 0; g < G3; g++) {
  const r = play(3, 20000 + g);
  r.start.forEach((h, i) => { H[h] = H[h] || { n: 0, w: 0 }; H[h].n++; if (r.winner === i) H[h].w++; });
}
out.hands = { players: 3, games: G3, rows: Object.entries(H).map(([h, v]) => ({ hand: h, n: v.n, win: +(100 * v.w / v.n).toFixed(1) })).sort((a, b) => b.win - a.win) };
console.log('hands done');
// 2. seats
for (let n = 2; n <= 6; n++) {
  const w = new Array(n).fill(0); let turns = 0;
  const games = n <= 3 ? GN * 2 : GN;
  for (let g = 0; g < games; g++) {
    const r = play(n, 50000 + n * 10000 + g);
    w[(r.winner - r.first + n) % n]++;      // seat 0 = went first
    turns += r.turns;
  }
  out.seats[n] = { games, firstWins: +(100 * w[0] / games).toFixed(1), bySeat: w.map((x) => +(100 * x / games).toFixed(1)), avgTurns: +(turns / games).toFixed(1) };
  console.log('seats', n, out.seats[n]);
}
// 3. strength
const M = (lv, g, seed) => { const r = S.matchup(lv, g, seed); const o = {}; for (const k in r.wins) o[k] = +(100 * r.wins[k] / g).toFixed(1); return o; };
out.strength = {
  games: { duel: 2000, three: 1500 },
  hardVsEasy: M(['hard', 'easy'], 2000, 1),
  hardVsMedium: M(['hard', 'medium'], 2000, 1),
  mediumVsEasy: M(['medium', 'easy'], 2000, 1),
  threeWay: M(['easy', 'medium', 'hard'], 1500, 1),
};
console.log('strength', JSON.stringify(out.strength));
fs.mkdirSync(path.join(__dirname, '..', 'data'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'data', 'stats.json'), JSON.stringify(out, null, 1));
console.log('wrote data/stats.json');
