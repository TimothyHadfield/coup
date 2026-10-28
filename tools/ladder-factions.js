// Ladder for the Factions variant: node tools/ladder-factions.js [games]
// Same as tools/ladder.js but with rules { factions: true }; prints win shares and writes
// data/stats.json "factionsStrength". Seats rotate every game.
const fs = require('fs'), path = require('path');
const S = require('./sim.js');
const FILE = path.join(__dirname, '..', 'data', 'stats.json');
const G = +process.argv[2] || 400;
const R = { factions: true };
const pct = (r, g) => { const o = {}; for (const k of Object.keys(r.wins)) o[k] = +(100 * r.wins[k] / g).toFixed(1); return o; };
const run = (lv, g) => { const t = Date.now(); const r = S.matchup(lv, g, 5000, R); const o = pct(r, g); o.avgTurns = +r.avgTurns.toFixed(1); console.log(lv.join(' v '), JSON.stringify(o), ((Date.now() - t) / 1000).toFixed(0) + 's'); return o; };
const st = { games: G };
st.hardVsMedium = run(['hard', 'medium'], G);
st.mediumVsEasy = run(['medium', 'easy'], G);
st.hardVsEasy = run(['hard', 'easy'], G);
st.threeWay = run(['easy', 'medium', 'hard'], G);
st.hardVs3Medium = run(['hard', 'medium', 'medium', 'medium'], Math.round(G / 2));
st.mediumVs3Easy = run(['medium', 'easy', 'easy', 'easy'], Math.round(G / 2));
if (process.argv[3] === '--write') {
  const j = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  j.factionsStrength = st; j.factionsStrengthMade = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(FILE, JSON.stringify(j, null, 1));
  console.log('wrote', FILE);
}
