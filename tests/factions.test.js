// node tests/factions.test.js : the Factions variant (Loyalists vs Reformists, Convert, Embezzle).
// Rules source: the Reformation expansion rules (ultraboardgames.com/coup/reformation.php), see docs/rules-check.md.
const assert = require('assert');
const E = require('../js/engine.js');
const AI = require('../js/ai.js');
const CG = require('../js/coupgame.js');
AI.SEARCH.budgetMs = 1e9; AI.SEARCH.worlds = 3;

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; } catch (e) { fail++; console.log('FAIL', name, '\n   ', e.stack.split('\n').slice(0, 3).join('\n   ')); }
}
const F = { factions: true };
// chosen hands and sides (0 Loyalist, 1 Reformist), player 0 to act
function rig(hands, sides, coins, rules) {
  rules = rules || F;
  const s = E.newGame({ names: hands.map((_, i) => 'P' + i), seed: 1, first: 0, rules });
  const left = {};
  s.rules.chars.forEach((c) => (left[c] = 3));
  s.players.forEach((pl, i) => {
    pl.cards = hands[i].map((c) => ({ c, dead: false }));
    hands[i].forEach((c) => left[c]--);
    pl.coins = coins ? coins[i] : 2;
    if (sides) pl.side = sides[i];
  });
  s.deck = [];
  for (const c of s.rules.chars) for (let k = 0; k < left[c]; k++) s.deck.push(c);
  return s;
}
const checkCount = (s) => { const cnt = E.countCards(s); for (const c of s.rules.chars) assert.strictEqual(cnt[c], 3, c + ' ' + JSON.stringify(cnt)); };
const alive = (s, p) => E.hiddenIdx(s.players[p]).length;
const legal = (s, p) => E.legalActions(s, p).map((l) => l.action + ':' + l.target);

test('setup: sides alternate round the table, Almshouse starts empty', () => {
  for (let seed = 1; seed < 30; seed++) {
    const s = E.newGame({ names: ['a', 'b', 'c', 'd', 'e'], seed, rules: F });
    assert.strictEqual(s.reserve, 0);
    for (let k = 1; k < 5; k++) {
      const p = (s.turn + k) % 5, q = (s.turn + k - 1) % 5;
      assert.notStrictEqual(s.players[p].side, s.players[q].side);
    }
    assert.ok(s.players.every((pl) => pl.side === 0 || pl.side === 1));
  }
});
test('base game has no sides, no Convert / Embezzle', () => {
  const s = E.newGame({ names: ['a', 'b', 'c'], seed: 3, first: 0 });
  assert.ok(!legal(s, 0).some((x) => /convert|embezzle/.test(x)));
});
test('no Coup / Assassinate / Steal on your own side while both sides are in play', () => {
  const s = rig([['Duke', 'Duke'], ['Captain', 'Captain'], ['Contessa', 'Contessa']], [0, 1, 0], [7, 2, 2]);
  const L = legal(s, 0);
  assert.ok(L.includes('coup:1') && !L.includes('coup:2'), L.join(' '));
  assert.ok(L.includes('steal:1') && !L.includes('steal:2'));
  assert.ok(L.includes('assassinate:1') && !L.includes('assassinate:2'));
});
test('all on one side: anyone may be targeted', () => {
  const s = rig([['Duke', 'Duke'], ['Captain', 'Captain'], ['Contessa', 'Contessa']], [0, 0, 0], [7, 2, 2]);
  const L = legal(s, 0);
  assert.ok(L.includes('coup:1') && L.includes('coup:2'));
});
test('an eliminated player does not count as a side still in play', () => {
  const s = rig([['Duke', 'Duke'], ['Captain', 'Captain'], ['Contessa', 'Contessa']], [0, 1, 0], [7, 2, 2]);
  s.players[1].cards.forEach((c) => (c.dead = true));
  assert.ok(legal(s, 0).includes('coup:2'));
});
test('10+ coins: must Coup someone of the other side', () => {
  const s = rig([['Duke', 'Duke'], ['Captain', 'Captain'], ['Contessa', 'Contessa']], [0, 1, 0], [10, 2, 2]);
  assert.deepStrictEqual(legal(s, 0), ['coup:1']);
});
test('Foreign aid: your own side may not block it', () => {
  const s = rig([['Captain', 'Captain'], ['Duke', 'Duke'], ['Duke', 'Contessa'], ['Duke', 'Assassin']], [0, 1, 0, 1]);
  E.act(s, { action: 'foreign_aid' });
  assert.strictEqual(s.pending.kind, 'block'); assert.strictEqual(s.pending.p, 1);
  E.act(s, { block: null });
  assert.strictEqual(s.pending.p, 3);   // seat 2 is on the actor's side: skipped
  E.act(s, { block: null });
  assert.strictEqual(s.players[0].coins, 4);
});
test('Convert yourself: 1 coin into the Almshouse, your side flips', () => {
  const s = rig([['Captain', 'Captain'], ['Duke', 'Duke'], ['Duke', 'Contessa']], [0, 1, 0], [3, 2, 2]);
  assert.ok(legal(s, 0).includes('convert:0'));
  E.act(s, { action: 'convert', target: 0 });
  assert.strictEqual(s.players[0].side, 1);
  assert.strictEqual(s.players[0].coins, 2);
  assert.strictEqual(s.reserve, 1);
  assert.strictEqual(s.pending.kind, 'action'); assert.strictEqual(s.pending.p, 1);   // nobody can challenge or block it
});
test('Convert another player: 2 coins', () => {
  const s = rig([['Captain', 'Captain'], ['Duke', 'Duke'], ['Duke', 'Contessa']], [0, 1, 0], [2, 2, 2]);
  E.act(s, { action: 'convert', target: 2 });
  assert.strictEqual(s.players[2].side, 1);
  assert.strictEqual(s.players[0].coins, 0);
  assert.strictEqual(s.reserve, 2);
});
test('Convert costs: 1 coin can convert only yourself', () => {
  const s = rig([['Captain', 'Captain'], ['Duke', 'Duke'], ['Duke', 'Contessa']], [0, 1, 0], [1, 2, 2]);
  const L = legal(s, 0);
  assert.ok(L.includes('convert:0') && !L.includes('convert:1'));
  assert.throws(() => E.act(s, { action: 'convert', target: 1 }));
});
test('Embezzle, allowed: take everything in the Almshouse', () => {
  const s = rig([['Captain', 'Captain'], ['Duke', 'Duke'], ['Duke', 'Contessa']], [0, 1, 0], [2, 2, 2]);
  s.reserve = 5;
  E.act(s, { action: 'embezzle' });
  assert.strictEqual(s.pending.kind, 'challenge');
  assert.strictEqual(s.pending.char, 'Duke'); assert.strictEqual(s.pending.denies, true);
  E.act(s, { challenge: false }); E.act(s, { challenge: false });
  assert.strictEqual(s.players[0].coins, 7); assert.strictEqual(s.reserve, 0);
});
test('Embezzle challenged, holding a Duke: embezzler loses a card, gets nothing', () => {
  const s = rig([['Duke', 'Captain'], ['Captain', 'Contessa'], ['Duke', 'Contessa']], [0, 1, 0], [2, 2, 2]);
  s.reserve = 4;
  E.act(s, { action: 'embezzle' });
  E.act(s, { challenge: true });
  assert.strictEqual(s.pending.kind, 'lose'); assert.strictEqual(s.pending.p, 0);
  E.act(s, { card: 1 });
  assert.strictEqual(s.players[0].coins, 2); assert.strictEqual(s.reserve, 4);
  assert.strictEqual(alive(s, 1), 2);
  const ch = s.events.find((e) => e.t === 'challenge');
  assert.strictEqual(ch.truth, false);
  checkCount(s);
});
test('Embezzle challenged, no Duke: shows its cards, redraws them, challenger loses a card, coins taken', () => {
  const s = rig([['Captain', 'Contessa'], ['Captain', 'Assassin'], ['Duke', 'Contessa']], [0, 1, 0], [2, 2, 2]);
  s.reserve = 3;
  E.act(s, { action: 'embezzle' });
  E.act(s, { challenge: true });
  assert.strictEqual(s.pending.kind, 'lose'); assert.strictEqual(s.pending.p, 1);
  E.act(s, { card: 0 });
  assert.strictEqual(s.players[0].coins, 5); assert.strictEqual(s.reserve, 0);
  assert.strictEqual(alive(s, 0), 2);
  const rv = s.events.find((e) => e.t === 'reveal');
  assert.deepStrictEqual(rv.chars.slice().sort(), ['Captain', 'Contessa']);
  assert.strictEqual(s.events.find((e) => e.t === 'challenge').truth, true);
  checkCount(s);
});
test('view and online stand-in carry sides and the Almshouse; legal moves work from it', () => {
  const s = rig([['Captain', 'Captain'], ['Duke', 'Duke'], ['Duke', 'Contessa']], [0, 1, 0], [7, 2, 2]);
  s.reserve = 2;
  const v = E.viewFor(s, 1);
  assert.deepStrictEqual(v.players.map((p) => p.side), [0, 1, 0]);
  assert.strictEqual(v.reserve, 2);
  const pub = CG.game.publicView(s), mine = CG.game.privateView(s, 0);
  const st = CG.stateFromView(pub, mine, 0);
  assert.deepStrictEqual(legal(st, 0), legal(s, 0));
});
function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
test('computers play whole Factions games at every level and size (+ Inquisitor), cards always 15', () => {
  const lv = ['easy', 'medium', 'hard'];
  let conv = 0, emb = 0, games = 0;
  for (let g = 0; g < 60; g++) {
    const n = 2 + (g % 5);
    const rules = { factions: true, inquisitor: g % 4 === 3 };
    const s = E.newGame({ names: Array.from({ length: n }, (_, i) => 'P' + i), seed: 100 + g, rules });
    const rnd = mulberry(g + 1);
    let steps = 0;
    while (s.pending) {
      const pd = s.pending;
      const r = AI.decide(E.viewFor(s, pd.p), pd, lv[(pd.p + g) % 3], rnd, pd.kind === 'action' ? E.legalActions(s, pd.p) : null, s.rules);
      E.act(s, r.d);
      if (++steps > 3000) throw new Error('too long, game ' + g);
      if (steps % 7 === 0) checkCount(s);
    }
    assert.ok(s.winner >= 0);
    conv += s.events.filter((e) => e.t === 'action' && e.action === 'convert').length;
    emb += s.events.filter((e) => e.t === 'action' && e.action === 'embezzle').length;
    games++;
  }
  assert.ok(conv > 0, 'computers never convert');
  assert.ok(emb > 0, 'computers never embezzle');
});

console.log(`factions: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
