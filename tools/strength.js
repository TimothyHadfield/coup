// Hard's look-ahead vs the other levels: node tools/strength.js <games> <seats e.g. hard,medium,medium> [worlds] [depth] [maxCands] [seed]
// Seats rotate every game. Prints each level's share of wins and Hard's time per action decision.
const AI = require('../js/ai.js');
const S = require('./sim.js');
const games = +process.argv[2] || 100;
const lv = (process.argv[3] || 'hard,medium').split(',');
if (process.argv[4] != null) AI.SEARCH.worlds = +process.argv[4];
if (process.argv[5] != null) AI.SEARCH.depth = +process.argv[5];
if (process.argv[6] != null) AI.SEARCH.maxCands = +process.argv[6];
if (process.argv[7] != null) AI.SEARCH.prior = +process.argv[7];
const seed0 = +process.argv[8] || 5000;
const t0 = Date.now();
const r = S.matchup(lv, games, seed0);
const pct = {};
for (const l of Object.keys(r.wins)) pct[l] = +(100 * r.wins[l] / games).toFixed(1);
console.log(lv.join(' v '), JSON.stringify(AI.SEARCH), JSON.stringify(pct), 'fair', (100 / lv.length).toFixed(1) + '% per seat', 'games', games, 's', ((Date.now() - t0) / 1000).toFixed(0));
