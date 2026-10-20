// Data for the Learn tab. Runs in parallel parts, then merges:
//   node tools/hands.js            (spawns every part, waits, writes data/stats.json)
//   node tools/hands.js part <id>  (one part; writes data/parts/<id>.json)
// 1. Starting-hand win rates: Hard vs Hard vs Hard, every starting pair.
// 2. Seat win rates (does going first help?) for 2-6 players, all Hard.
// 3. Strength table: the measured win rates quoted in the app.
// Nothing here runs on the phone.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const E = require('../js/engine.js');
const AI = require('../js/ai.js');
const S = require('./sim.js');

const H_CHUNKS = 6, H_PER = 500;          // 3000 three-player games
const SEAT_GAMES = { 2: 800, 3: 600, 4: 400, 5: 300, 6: 300 };
const DUEL = 1000, THREE = 900;
const PARTS = []
  .concat(Array.from({ length: H_CHUNKS }, (_, i) => 'hands' + i))
  .concat([2, 3, 4, 5, 6].map((n) => 'seats' + n))
  .concat(['hardVsEasy', 'hardVsMedium', 'mediumVsEasy', 'threeWay']);
const DIR = path.join(__dirname, '..', 'data');
const PDIR = path.join(DIR, 'parts');

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
const pct = (r, g) => { const o = {}; for (const k in r.wins) o[k] = +(100 * r.wins[k] / g).toFixed(1); return o; };

function runPart(id) {
  let res;
  if (id.startsWith('hands')) {
    const c = +id.slice(5), H = {};
    for (let g = 0; g < H_PER; g++) {
      const r = play(3, 20000 + c * H_PER + g);
      r.start.forEach((h, i) => { H[h] = H[h] || { n: 0, w: 0 }; H[h].n++; if (r.winner === i) H[h].w++; });
    }
    res = { H, games: H_PER };
  } else if (id.startsWith('seats')) {
    const n = +id.slice(5), games = SEAT_GAMES[n];
    const w = new Array(n).fill(0); let turns = 0;
    for (let g = 0; g < games; g++) {
      const r = play(n, 50000 + n * 10000 + g);
      w[(r.winner - r.first + n) % n]++;      // seat 0 = went first
      turns += r.turns;
    }
    res = { games, firstWins: +(100 * w[0] / games).toFixed(1), bySeat: w.map((x) => +(100 * x / games).toFixed(1)), avgTurns: +(turns / games).toFixed(1) };
  } else {
    const lv = { hardVsEasy: ['hard', 'easy'], hardVsMedium: ['hard', 'medium'], mediumVsEasy: ['medium', 'easy'], threeWay: ['easy', 'medium', 'hard'] }[id];
    const g = lv.length === 3 ? THREE : DUEL;
    res = pct(S.matchup(lv, g, 1), g);
  }
  fs.mkdirSync(PDIR, { recursive: true });
  fs.writeFileSync(path.join(PDIR, id + '.json'), JSON.stringify(res));
}

function merge() {
  const get = (id) => JSON.parse(fs.readFileSync(path.join(PDIR, id + '.json'), 'utf8'));
  const out = { made: new Date().toISOString().slice(0, 10), hands: {}, seats: {}, strength: {} };
  const H = {}; let games = 0;
  for (let c = 0; c < H_CHUNKS; c++) {
    const p = get('hands' + c); games += p.games;
    for (const [h, v] of Object.entries(p.H)) { H[h] = H[h] || { n: 0, w: 0 }; H[h].n += v.n; H[h].w += v.w; }
  }
  out.hands = { players: 3, games, rows: Object.entries(H).map(([h, v]) => ({ hand: h, n: v.n, win: +(100 * v.w / v.n).toFixed(1) })).sort((a, b) => b.win - a.win) };
  for (let n = 2; n <= 6; n++) out.seats[n] = get('seats' + n);
  out.strength = { games: { duel: DUEL, three: THREE } };
  for (const k of ['hardVsEasy', 'hardVsMedium', 'mediumVsEasy', 'threeWay']) out.strength[k] = get(k);
  fs.writeFileSync(path.join(DIR, 'stats.json'), JSON.stringify(out, null, 1));
  console.log('wrote data/stats.json', JSON.stringify(out.strength), JSON.stringify(out.seats));
}

if (process.argv[2] === 'part') runPart(process.argv[3]);
else if (process.argv[2] === 'merge') merge();
else {
  let left = PARTS.length;
  const t0 = Date.now();
  for (const id of PARTS) {
    const ch = spawn(process.execPath, [__filename, 'part', id], { stdio: 'inherit' });
    ch.on('exit', (code) => {
      console.log(id, code === 0 ? 'done' : 'FAILED ' + code, Math.round((Date.now() - t0) / 1000) + 's');
      if (--left === 0) merge();
    });
  }
}
