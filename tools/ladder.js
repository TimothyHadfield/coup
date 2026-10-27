// Re-measure the computer levels and write them into data/stats.json (strength only; hands/seats stay).
//   node tools/ladder.js            (~15 min; plain node, one process)
// Duels 1000 games, three-way 900, Hard vs 3 Medium 300, Hard vs 5 Medium 150; seats rotate every game.
const fs = require('fs'), path = require('path');
const S = require('./sim.js');
const FILE = path.join(__dirname, '..', 'data', 'stats.json');
const pct = (r, g) => { const o = {}; for (const k of Object.keys(r.wins)) o[k] = +(100 * r.wins[k] / g).toFixed(1); return o; };
const run = (lv, g, seed) => { const t = Date.now(); const o = pct(S.matchup(lv, g, seed), g); console.log(lv.join(' v '), JSON.stringify(o), ((Date.now() - t) / 1000).toFixed(0) + 's'); return o; };
const DUEL = 1000, THREE = 900, FOUR = 300, SIX = 150;
const st = { games: { duel: DUEL, three: THREE, four: FOUR, six: SIX } };
st.hardVsEasy = run(['hard', 'easy'], DUEL, 1);
st.hardVsMedium = run(['hard', 'medium'], DUEL, 1);
st.mediumVsEasy = run(['medium', 'easy'], DUEL, 1);
st.threeWay = run(['easy', 'medium', 'hard'], THREE, 1);
st.hardVs3Medium = run(['hard', 'medium', 'medium', 'medium'], FOUR, 1);
st.hardVs5Medium = run(['hard', 'medium', 'medium', 'medium', 'medium', 'medium'], SIX, 1);
st.mediumVs3Easy = run(['medium', 'easy', 'easy', 'easy'], FOUR, 1);
const j = JSON.parse(fs.readFileSync(FILE, 'utf8'));
j.strength = st; j.strengthMade = new Date().toISOString().slice(0, 10);
fs.writeFileSync(FILE, JSON.stringify(j, null, 1));
console.log('wrote', FILE);
