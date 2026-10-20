// node tests/engine.test.js : the rules engine, scripted cases + random games.
const assert = require('assert');
const E = require('../js/engine.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; } catch (e) { fail++; console.log('FAIL', name, '\n   ', e.message); }
}

// A game with chosen hands, deck (top = last) and coins; player 0 to act.
function rig(hands, deck, coins, rules) {
  const s = E.newGame({ names: hands.map((_, i) => 'P' + i), seed: 1, first: 0, rules });
  s.players.forEach((pl, i) => {
    pl.cards = hands[i].map((c) => ({ c, dead: false }));
    pl.coins = coins ? coins[i] : 2;
  });
  s.deck = deck.slice();
  return s;
}
const fullDeckFor = (hands, rules) => {
  const left = {};
  const CH = E.ruleSet(rules).chars;
  CH.forEach((c) => (left[c] = 3));
  hands.flat().forEach((c) => left[c]--);
  const d = [];
  for (const c of CH) for (let k = 0; k < left[c]; k++) d.push(c);
  return d;
};
function game(hands, coins, rules) { return rig(hands, fullDeckFor(hands, rules), coins, rules); }
const passAll = (s) => { while (s.pending && (s.pending.kind === 'challenge' || s.pending.kind === 'block')) E.act(s, s.pending.kind === 'challenge' ? { challenge: false } : { block: null }); };
const alive = (s, p) => E.hiddenIdx(s.players[p]).length;
function checkCount(s) {
  const cnt = E.countCards(s);
  for (const c of s.rules.chars) assert.strictEqual(cnt[c], 3, c + ' count ' + JSON.stringify(cnt));
}

test('setup: 2 cards, 2 coins, 15 cards in all', () => {
  const s = E.newGame({ names: ['a', 'b', 'c', 'd'], seed: 9 });
  s.players.forEach((p) => { assert.strictEqual(p.cards.length, 2); assert.strictEqual(p.coins, 2); });
  assert.strictEqual(s.deck.length, 15 - 8);
  checkCount(s);
});
test('setup: 2 players, starting player gets 1 coin', () => {
  for (let seed = 1; seed < 20; seed++) {
    const s = E.newGame({ names: ['a', 'b'], seed });
    assert.strictEqual(s.players[s.turn].coins, 1);
    assert.strictEqual(s.players[1 - s.turn].coins, 2);
  }
});
test('income +1, cannot be blocked', () => {
  const s = game([['Duke', 'Duke'], ['Duke', 'Captain']]);
  E.act(s, { action: 'income' });
  assert.strictEqual(s.players[0].coins, 3);
  assert.strictEqual(s.pending.kind, 'action'); assert.strictEqual(s.pending.p, 1);
});
test('foreign aid +2, anyone may block with Duke', () => {
  const s = game([['Captain', 'Captain'], ['Contessa', 'Captain'], ['Duke', 'Assassin']]);
  E.act(s, { action: 'foreign_aid' });
  assert.strictEqual(s.pending.kind, 'block'); assert.strictEqual(s.pending.p, 1);
  E.act(s, { block: null });
  assert.strictEqual(s.pending.p, 2);
  E.act(s, { block: 'Duke' });
  passAll(s);
  assert.strictEqual(s.players[0].coins, 2, 'blocked: no coins');
});
test('tax challenged, Duke shown: challenger loses, Duke swapped for a new card', () => {
  const s = game([['Duke', 'Captain'], ['Contessa', 'Assassin']]);
  E.act(s, { action: 'tax' });
  assert.strictEqual(s.pending.kind, 'challenge');
  E.act(s, { challenge: true });
  assert.strictEqual(s.pending.kind, 'lose'); assert.strictEqual(s.pending.p, 1);
  E.act(s, { card: 0 });
  assert.strictEqual(s.players[0].coins, 5);
  assert.strictEqual(alive(s, 0), 2);
  assert.strictEqual(alive(s, 1), 1);
  checkCount(s);
});
test('tax bluff caught: claimant loses a card, no coins', () => {
  const s = game([['Contessa', 'Captain'], ['Contessa', 'Assassin']]);
  E.act(s, { action: 'tax' });
  E.act(s, { challenge: true });
  assert.strictEqual(s.pending.kind, 'lose'); assert.strictEqual(s.pending.p, 0);
  E.act(s, { card: 1 });
  assert.strictEqual(s.players[0].coins, 2);
  assert.strictEqual(s.players[0].cards[1].dead, true);
});
test('assassin bluff caught: the 3 coins come back', () => {
  const s = game([['Contessa', 'Captain'], ['Duke', 'Assassin']], [3, 2]);
  E.act(s, { action: 'assassinate', target: 1 });
  assert.strictEqual(s.players[0].coins, 0);
  E.act(s, { challenge: true });
  E.act(s, { card: 0 });
  assert.strictEqual(s.players[0].coins, 3, 'refund');
  assert.strictEqual(alive(s, 1), 2);
});
test('assassination blocked by Contessa: coins stay spent', () => {
  const s = game([['Assassin', 'Captain'], ['Contessa', 'Duke']], [3, 2]);
  E.act(s, { action: 'assassinate', target: 1 });
  E.act(s, { challenge: false });
  assert.strictEqual(s.pending.kind, 'block');
  E.act(s, { block: 'Contessa' });
  E.act(s, { challenge: false });
  assert.strictEqual(s.players[0].coins, 0);
  assert.strictEqual(alive(s, 1), 2);
});
test('double loss: target challenges a real Assassin and is eliminated', () => {
  const s = game([['Assassin', 'Captain'], ['Duke', 'Duke']], [3, 2]);
  E.act(s, { action: 'assassinate', target: 1 });
  E.act(s, { challenge: true });
  E.act(s, { card: 0 });       // lost the challenge
  assert.strictEqual(s.pending.kind, 'block', 'may still bluff a Contessa');
  E.act(s, { block: null });
  assert.strictEqual(s.winner, 0, 'second card goes to the assassination');
});
test('Contessa bluff caught: target loses both', () => {
  const s = game([['Assassin', 'Captain'], ['Duke', 'Captain']], [3, 2]);
  E.act(s, { action: 'assassinate', target: 1 });
  E.act(s, { challenge: false });
  E.act(s, { block: 'Contessa' });
  E.act(s, { challenge: true });
  E.act(s, { card: 0 });
  assert.strictEqual(s.winner, 0);
});
test('steal takes 2, or 1 if that is all they have', () => {
  const s = game([['Captain', 'Duke'], ['Duke', 'Duke'], ['Duke', 'Contessa']], [2, 1, 2]);
  E.act(s, { action: 'steal', target: 1 });
  passAll(s);
  assert.strictEqual(s.players[0].coins, 3);
  assert.strictEqual(s.players[1].coins, 0);
});
test('steal blocked by Ambassador', () => {
  const s = game([['Captain', 'Duke'], ['Ambassador', 'Duke']], [2, 2]);
  E.act(s, { action: 'steal', target: 1 });
  E.act(s, { challenge: false });
  assert.deepStrictEqual(s.pending.chars, ['Captain', 'Ambassador']);
  E.act(s, { block: 'Ambassador' });
  E.act(s, { challenge: false });
  assert.strictEqual(s.players[0].coins, 2);
});
test('block challenged and bluffed: blocker loses a card, action goes through', () => {
  const s = game([['Captain', 'Duke'], ['Contessa', 'Duke'], ['Duke', 'Assassin']], [2, 2, 2]);
  E.act(s, { action: 'steal', target: 1 });
  E.act(s, { challenge: false }); E.act(s, { challenge: false });
  E.act(s, { block: 'Captain' });
  assert.strictEqual(s.pending.p, 0, 'actor may challenge the block first');
  E.act(s, { challenge: true });
  E.act(s, { card: 0 });
  assert.strictEqual(s.players[0].coins, 4);
  assert.strictEqual(s.players[1].coins, 0);
});
test('coup costs 7 and cannot be blocked', () => {
  const s = game([['Captain', 'Duke'], ['Contessa', 'Duke']], [7, 2]);
  E.act(s, { action: 'coup', target: 1 });
  assert.strictEqual(s.pending.kind, 'lose');
  E.act(s, { card: 0 });
  assert.strictEqual(s.players[0].coins, 0);
  assert.strictEqual(alive(s, 1), 1);
});
test('10+ coins: Coup is the only legal action', () => {
  const s = game([['Captain', 'Duke'], ['Contessa', 'Duke'], ['Contessa', 'Duke']], [10, 2, 2]);
  const L = E.legalActions(s, 0);
  assert.ok(L.length === 2 && L.every((a) => a.action === 'coup'));
  assert.throws(() => E.act(s, { action: 'income' }));
});
test('cannot assassinate with under 3 coins', () => {
  const s = game([['Assassin', 'Duke'], ['Contessa', 'Duke']], [2, 2]);
  assert.throws(() => E.act(s, { action: 'assassinate', target: 1 }));
});
test('exchange: see 2 more, keep 2, all 15 cards still there', () => {
  const s = game([['Ambassador', 'Duke'], ['Contessa', 'Duke']]);
  E.act(s, { action: 'exchange' });
  E.act(s, { challenge: false });
  assert.strictEqual(s.pending.kind, 'exchange');
  assert.strictEqual(s.pending.options.length, 4);
  checkCount(s);
  const opts = s.pending.options.slice();
  E.act(s, { keep: [2, 3] });
  assert.deepStrictEqual(E.hiddenChars(s.players[0]), [opts[2], opts[3]]);
  assert.deepStrictEqual(s.players[0].knownDeck.sort(), [opts[0], opts[1]].sort());
  checkCount(s);
});
test('eliminated player returns coins to the treasury', () => {
  const s = game([['Captain', 'Duke'], ['Contessa', 'Duke'], ['Duke', 'Duke']], [7, 5, 2]);
  s.players[1].cards[0].dead = true;
  E.act(s, { action: 'coup', target: 1 });
  assert.strictEqual(s.players[1].coins, 0);
});
test('Inquisitor: 15 cards, exchange draws 1, blocks steal', () => {
  const s = game([['Inquisitor', 'Duke'], ['Inquisitor', 'Duke']], null, { inquisitor: true });
  assert.ok(!s.rules.chars.includes('Ambassador'));
  E.act(s, { action: 'exchange' });
  E.act(s, { challenge: false });
  assert.strictEqual(s.pending.options.length, 3);
  E.act(s, { keep: [0, 1] });
  checkCount(s);
  E.act(s, { action: 'steal', target: 0 });
  E.act(s, { challenge: false });
  assert.deepStrictEqual(s.pending.chars, ['Captain', 'Inquisitor']);
});
test('Inquisitor examine: target picks a card, examiner may force a swap', () => {
  const s = game([['Inquisitor', 'Duke'], ['Assassin', 'Contessa']], null, { inquisitor: true });
  E.act(s, { action: 'examine', target: 1 });
  E.act(s, { challenge: false });
  assert.strictEqual(s.pending.kind, 'show'); assert.strictEqual(s.pending.p, 1);
  E.act(s, { card: 0 });
  assert.strictEqual(s.pending.kind, 'examine'); assert.strictEqual(s.pending.char, 'Assassin');
  assert.strictEqual(E.view(s, 1).pending.char, undefined, 'target view does not leak');
  E.act(s, { force: true });
  checkCount(s);
  assert.strictEqual(s.pending.kind, 'action'); assert.strictEqual(s.pending.p, 1);
  const s2 = game([['Inquisitor', 'Duke'], ['Assassin', 'Contessa']], null, { inquisitor: true });
  E.act(s2, { action: 'examine', target: 1 }); E.act(s2, { challenge: false }); E.act(s2, { card: 1 }); E.act(s2, { force: false });
  assert.deepStrictEqual(s2.players[0].peeks, [{ p: 1, char: 'Contessa' }]);
});
test('2-player deal variant: pick 1 of 5, 1 dealt, 3 in deck, 8 out', () => {
  const s = E.newGame({ names: ['a', 'b'], seed: 3, rules: { twoPlayerDeal: true } });
  assert.strictEqual(s.pending.kind, 'pick');
  assert.strictEqual(s.pending.options.length, 5);
  assert.deepStrictEqual(s.pending.options.slice().sort(), E.CHARS.slice().sort());
  E.act(s, { keep: [0] });
  E.act(s, { keep: [4] });
  assert.strictEqual(s.players[0].cards[0].c, 'Duke');
  assert.strictEqual(s.players[1].cards[0].c, 'Contessa');
  s.players.forEach((p) => assert.strictEqual(p.cards.length, 2));
  assert.strictEqual(s.deck.length, 3);
  assert.strictEqual(s.out.length, 8);
  checkCount(s);
  assert.strictEqual(s.pending.kind, 'action');
});
test('view hides other hands and secret fields', () => {
  const s = game([['Duke', 'Captain'], ['Contessa', 'Assassin']]);
  E.act(s, { action: 'tax' });
  const v = E.view(s, 1);
  const txt = JSON.stringify(v.players) + JSON.stringify(v.events);
  assert.ok(!/_true/.test(txt));
  assert.deepStrictEqual(v.myCards.map((c) => c.c), ['Contessa', 'Assassin']);
  assert.ok(!JSON.stringify(v).includes('"cards"'));
});
test('apply() is pure: the old state is untouched', () => {
  const s = game([['Duke', 'Captain'], ['Contessa', 'Assassin']]);
  const before = JSON.stringify(s);
  const s2 = E.apply(s, { action: 'income' });
  assert.strictEqual(JSON.stringify(s), before);
  assert.strictEqual(s2.players[0].coins, 3);
});
test('random games: every legal path keeps 15 cards, coins >= 0, ends with a winner', () => {
  let seed = 12345;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const pickR = (a) => a[Math.floor(rnd() * a.length)];
  for (let g = 0; g < 1500; g++) {
    const n = 2 + (g % 5);
    const rules = { inquisitor: g % 3 === 0, twoPlayerDeal: g % 4 === 0 };
    const s = E.newGame({ names: Array.from({ length: n }, (_, i) => 'p' + i), seed: g + 1, rules });
    let steps = 0;
    while (s.pending) {
      const pd = s.pending;
      let d;
      if (pd.kind === 'action') d = pickR(E.legalActions(s, pd.p));
      else if (pd.kind === 'challenge') d = { challenge: rnd() < 0.3 };
      else if (pd.kind === 'block') d = { block: rnd() < 0.4 ? pickR(pd.chars) : null };
      else if (pd.kind === 'lose' || pd.kind === 'show') d = { card: pickR(E.hiddenIdx(s.players[pd.p])) };
      else if (pd.kind === 'exchange' || pd.kind === 'pick') {
        const idx = pd.options.map((_, i) => i);
        E.shuffle(s, idx);
        d = { keep: idx.slice(0, pd.keep) };
      } else if (pd.kind === 'examine') d = { force: rnd() < 0.5 };
      E.act(s, d);
      checkCount(s);
      s.players.forEach((p) => assert.ok(p.coins >= 0));
      if (++steps > 5000) throw new Error('runaway game');
    }
    assert.ok(s.winner >= 0, 'winner');
    assert.strictEqual(s.players.filter((p) => E.alive(p)).length, 1);
  }
});

console.log(`engine: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
