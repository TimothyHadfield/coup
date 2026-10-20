// Behaviour counts per AI level: node tools/diag.js <games> lvlA lvlB [...]
const E = require('../js/engine.js');
const AI = require('../js/ai.js');
const games = +process.argv[2] || 200;
const levels = process.argv.slice(3);
const st = {};
levels.forEach((l) => (st[l] = { wins: 0, actions: {}, bluffs: 0, bluffCaught: 0, claims: 0, chal: 0, chalWon: 0, blockBluff: 0, blocks: 0 }));
let seed = 5;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
for (let g = 0; g < games; g++) {
  const seats = levels.map((_, i) => levels[(i + g) % levels.length]);
  const s = E.newGame({ names: seats, seed: g + 1 });
  while (s.pending) {
    const pd = s.pending;
    const r = AI.decide(E.viewFor(s, pd.p), pd, seats[pd.p], rnd, pd.kind === 'action' ? E.legalActions(s, pd.p) : null);
    E.act(s, r.d);
  }
  st[seats[s.winner]].wins++;
  for (const e of s.events) {
    if (e.t === 'action') { const o = st[seats[e.p]]; o.actions[e.action] = (o.actions[e.action] || 0) + 1; if (e.claim) { o.claims++; if (!e._true) o.bluffs++; } }
    if (e.t === 'block') { const o = st[seats[e.p]]; o.blocks++; if (!e._true) o.blockBluff++; }
    if (e.t === 'challenge') { const o = st[seats[e.by]]; o.chal++; if (!e.truth) o.chalWon++; else; if (!e.truth) st[seats[e.of]].bluffCaught++; }
  }
}
console.log(JSON.stringify(st, null, 1));
