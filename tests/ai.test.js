// node tests/ai.test.js : computer players make only legal moves, see only
// their own view, and the levels are ordered by measured strength.
const assert = require('assert');
const E = require('../js/engine.js');
const AI = require('../js/ai.js');
const S = require('../tools/sim.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; } catch (e) { fail++; console.log('FAIL', name, '\n   ', e.message); }
}

test('every level finishes 120 games of every size and variant with legal moves', () => {
  let g = 0;
  for (const lv of ['easy', 'medium', 'hard']) {
    for (let k = 0; k < 40; k++, g++) {
      const n = 2 + (k % 5);
      const rules = { inquisitor: k % 3 === 1, twoPlayerDeal: k % 2 === 0 };
      const r = S.playGame(Array.from({ length: n }, (_, i) => (i % 2 ? lv : 'medium')), 500 + g, rules);
      assert.ok(r.winner >= 0);
    }
  }
});
test('Hard games never loop: 200 three-player all-Hard games end within 150 turns', () => {
  // two last-card players used to trade Assassinate / bluffed Contessa block forever
  let worst = 0;
  for (let g = 0; g < 200; g++) {
    const s = E.newGame({ names: ['a', 'b', 'c'], seed: 900 + g });
    let rnd = (() => { let a = g * 7 + 3; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
    while (s.pending && s.turnNo < 300) {
      const pd = s.pending;
      E.act(s, AI.decide(E.view(s, pd.p), pd, 'hard', rnd, pd.kind === 'action' ? E.legalActions(s, pd.p) : null, s.rules).d);
    }
    worst = Math.max(worst, s.turnNo);
  }
  assert.ok(worst < 150, 'longest game ' + worst + ' turns');
});
test('the AI cannot see other hands (view has no card fields)', () => {
  const s = E.newGame({ names: ['a', 'b', 'c'], seed: 4 });
  const v = E.view(s, s.pending.p);
  const txt = JSON.stringify(v.players);
  for (const c of E.CHARS) assert.ok(!txt.includes(c) || v.players.some((p) => p.dead.includes(c)));
});
test('Medium and Hard always challenge a claim that must be a bluff', () => {
  const s = E.newGame({ names: ['a', 'b', 'c'], seed: 4, first: 0 });
  s.players[0].cards = [{ c: 'Contessa', dead: false }, { c: 'Captain', dead: false }];
  s.players[1].cards = [{ c: 'Duke', dead: false }, { c: 'Duke', dead: false }];
  s.players[2].cards = [{ c: 'Duke', dead: true }, { c: 'Assassin', dead: false }];
  E.act(s, { action: 'tax' });
  assert.strictEqual(s.pending.p, 1);
  for (const lv of ['medium', 'hard']) {
    const r = AI.decide(E.view(s, 1), s.pending, lv, Math.random, null);
    assert.strictEqual(r.d.challenge, true, lv);
    assert.ok(/bluff/.test(r.why));
  }
});
test('Hint explains itself in plain words', () => {
  const s = E.newGame({ names: ['a', 'b', 'c'], seed: 8 });
  const r = AI.decide(E.view(s, s.pending.p), s.pending, 'hard', Math.random, E.legalActions(s, s.pending.p));
  assert.ok(r.why && r.why.length > 5 && r.why.length < 120, r.why);
});
test('measured strength: Hard > Medium > Easy (fixed seeds)', () => {
  const he = S.matchup(['hard', 'easy'], 300, 7000).wins;
  const me = S.matchup(['medium', 'easy'], 300, 7000).wins;
  const hm = S.matchup(['hard', 'medium'], 600, 7000).wins;
  assert.ok(he.hard / 300 > 0.7, 'hard vs easy ' + he.hard);
  assert.ok(me.medium / 300 > 0.6, 'medium vs easy ' + me.medium);
  assert.ok(hm.hard / 600 > 0.52, 'hard vs medium ' + hm.hard);
});

console.log(`ai: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
