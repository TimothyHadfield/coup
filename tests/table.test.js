// node tests/table.test.js : the real-table companion replays turns exactly
// like the rules engine (every coin and every lost card), and its question
// flow records a full turn.
const assert = require('assert');
const E = require('../js/engine.js');
const T = require('../js/table.js');
const S = require('../tools/sim.js');
const AI = require('../js/ai.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; } catch (e) { fail++; console.log('FAIL', name, '\n   ', e.message); }
}

// Turn the engine's public event log into companion turn records.
function toTurns(events) {
  const turns = [];
  let cur = null;
  for (const e of events) {
    if (e.t === 'action') { cur = { actor: e.p, action: e.action, target: e.target >= 0 ? e.target : null, chal: null, block: null }; turns.push(cur); }
    if (!cur) continue;
    if (e.t === 'challenge' && e.about === 'action') cur.chal = { by: e.by, truth: e.truth };
    if (e.t === 'block') cur.block = { by: e.p, char: e.char, chal: null };
    if (e.t === 'challenge' && e.about === 'block') cur.block.chal = { by: e.by, truth: e.truth };
    if (e.t === 'lose') {
      if (e.reason === 'coup' || e.reason === 'assassinate') cur.targetLose = e.char;
      else if (cur.block && cur.block.chal && !cur.block.chal.lose) cur.block.chal.lose = e.char;
      else if (cur.chal && !cur.chal.lose) cur.chal.lose = e.char;
    }
    if (e.t === 'forced') cur.forced = true;
    if (e.t === 'kept') cur.forced = false;
  }
  return turns;
}

function playRecorded(n, seed, rules) {
  const s = E.newGame({ names: Array.from({ length: n }, (_, i) => 'p' + i), seed, rules });
  const first = s.turn;
  let r = seed;
  const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  const lv = ['hard', 'medium', 'easy'];
  const snaps = [];
  while (s.pending) {
    const pd = s.pending;
    if (pd.kind === 'action') snaps.push(s.players.map((p) => p.coins));
    const d = AI.decide(E.view(s, pd.p), pd, lv[pd.p % 3], rnd, pd.kind === 'action' ? E.legalActions(s, pd.p) : null, s.rules);
    E.act(s, d.d);
  }
  return { s, first, snaps };
}

test('replaying 200 computer games through the companion gives the same coins and lost cards', () => {
  for (let g = 0; g < 200; g++) {
    const n = 2 + (g % 5);
    const rules = { inquisitor: g % 4 === 3 };
    const { s, first, snaps } = playRecorded(n, 900 + g, rules);
    const turns = toTurns(s.events);
    const setup = { names: s.players.map((p) => p.name), me: -1, first, rules };
    assert.strictEqual(turns.length, snaps.length);
    for (let k = 0; k < turns.length; k++)
      assert.deepStrictEqual(T.derive(setup, turns.slice(0, k)).players.map((p) => p.coins), snaps[k], `game ${g} coins before turn ${k + 1}`);
    const d = T.derive({ names: s.players.map((p) => p.name), me: -1, first, rules }, turns);
    s.players.forEach((pl, i) => {
      assert.deepStrictEqual(d.players[i].dead.slice().sort(), pl.cards.filter((c) => c.dead).map((c) => c.c).sort(), `game ${g} dead p${i}`);
    });
    assert.strictEqual(d.winner, s.winner, 'winner');
  }
});

test('question flow: steal, blocked with a Captain, block challenged and shown', () => {
  const setup = { names: ['Me', 'Ann', 'Bo'], me: 0, myCards: ['Duke', 'Contessa'], first: 0, rules: {} };
  const turns = [];
  let t = {};
  const seq = [];
  const pickBy = (q, f) => q.options.find(f).value;
  for (let k = 0; k < 20; k++) {
    const q = T.nextQuestion(setup, turns, t);
    if (!q) break;
    seq.push(q.id);
    let v;
    switch (q.id) {
      case 'actor': v = 1; break;                         // Ann
      case 'action': v = 'steal'; break;
      case 'target': v = 0; break;                         // from me
      case 'chal': v = null; break;
      case 'block': v = pickBy(q, (o) => o.value && o.value.char === 'Captain'); break;
      case 'blockChal': v = 1; break;                      // Ann challenges my block
      case 'blockChalTruth': v = false; break;             // I was bluffing
      case 'blockChalLose': v = 'Duke'; break;
      default: throw new Error('unexpected ' + q.id);
    }
    t = T.answer(t, q, v);
  }
  assert.deepStrictEqual(seq, ['actor', 'action', 'target', 'chal', 'block', 'blockChal', 'blockChalTruth', 'blockChalLose']);
  turns.push(t);
  const d = T.derive(setup, turns);
  assert.strictEqual(d.players[1].coins, 4);
  assert.strictEqual(d.players[0].coins, 0);
  assert.deepStrictEqual(d.myCards, [{ c: 'Duke', dead: true }, { c: 'Contessa', dead: false }]);
  assert.strictEqual(d.next, 2);
});

test('claim odds shown while recording: a Duke claim when I hold two Dukes', () => {
  const setup = { names: ['Me', 'Ann'], me: 0, myCards: ['Duke', 'Duke'], first: 1, rules: {} };
  const t = { actor: 1, action: 'tax' };
  const q = T.nextQuestion(setup, [], t);
  assert.strictEqual(q.id, 'chal');
  const p = T.claimOdds(setup, [], t, q, require('../js/odds.js'), 0.3);
  const pr = 1 - 66 / 78;    // 1 Duke among 13 unseen, 2-card hand
  assert.ok(Math.abs(p - pr / (pr + (1 - pr) * 0.3)) < 1e-9, p);
});

test('10+ coins: the only action offered is Coup', () => {
  const setup = { names: ['A', 'B'], me: -1, first: 0, rules: {} };
  const turns = [];
  for (let k = 0; k < 8; k++) turns.push({ actor: k % 2, action: 'tax', chal: null });
  const d = T.derive(setup, turns);
  assert.strictEqual(d.players[0].coins, 13);
  const q = T.nextQuestion(setup, turns, { actor: 0 });
  assert.deepStrictEqual(q.options.map((o) => o.value), ['coup']);
});

console.log(`table: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
