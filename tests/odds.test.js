// node tests/odds.test.js : the claim-odds model against hand-worked and brute-force answers.
const assert = require('assert');
const O = require('../js/odds.js');
const E = require('../js/engine.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; } catch (e) { fail++; console.log('FAIL', name, '\n   ', e.message); }
}
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) < (tol || 1e-9), `${msg || ''} ${a} vs ${b}`);
const CH = E.CHARS;

function view(me, mine, players, events, knownDeck) {
  return {
    me, myCards: mine.map((c) => ({ c, dead: false })), knownDeck: knownDeck || [],
    players: players.map((p) => ({ hidden: p.hidden, dead: p.dead || [], alive: p.hidden > 0, coins: 2 })),
    events: events || [],
  };
}

// Brute force: label every unseen card, try every split into opponent hands,
// weight each by the same evidence likelihoods, and average.
function brute(v, bluff) {
  const pool = [];
  const left = {};
  CH.forEach((c) => (left[c] = 3));
  v.myCards.forEach((cd) => left[cd.c]--);
  v.players.forEach((p) => p.dead.forEach((c) => left[c]--));
  v.knownDeck.forEach((c) => left[c]--);
  CH.forEach((c) => { for (let k = 0; k < left[c]; k++) pool.push(c); });
  const E2 = O.buildEvidence(v.events, v.players.length, { bluff });
  const opp = v.players.map((p, i) => i).filter((i) => i !== v.me && v.players[i].hidden > 0);
  const tot = {}; opp.forEach((i) => { tot[i] = {}; CH.forEach((c) => (tot[i][c] = 0)); });
  let Z = 0;
  function rec(j, used, hands) {
    if (j === opp.length) {
      let w = 1;
      opp.forEach((i, k) => { for (const it of E2[i]) w *= it.chars.some((c) => hands[k].includes(c)) ? it.lh : it.ln; });
      if (!w) return;
      Z += w;
      opp.forEach((i, k) => CH.forEach((c) => { if (hands[k].includes(c)) tot[i][c] += w; }));
      return;
    }
    const k = v.players[opp[j]].hidden;
    const idx = pool.map((_, i) => i).filter((i) => !used.has(i));
    (function choose(start, cur) {
      if (cur.length === k) { const u = new Set(used); cur.forEach((x) => u.add(x)); rec(j + 1, u, hands.concat([cur.map((x) => pool[x])])); return; }
      for (let a = start; a < idx.length; a++) choose(a + 1, cur.concat([idx[a]]));
    })(0, []);
  }
  rec(0, new Set(), []);
  opp.forEach((i) => CH.forEach((c) => (tot[i][c] /= Z)));
  return tot;
}

test('plain counting: 1 opponent, 2 cards, 3 Dukes unseen of 13', () => {
  const v = view(0, ['Captain', 'Contessa'], [{ hidden: 2 }, { hidden: 2 }]);
  const p = O.posterior(v, { useEvidence: false });
  near(p[1].has.Duke, 1 - 45 / 78, 1e-12, 'hypergeometric');
});
test('every copy accounted for: chance is 0', () => {
  const v = view(0, ['Duke', 'Duke'], [{ hidden: 2 }, { hidden: 2, dead: ['Duke'] }]);
  const p = O.posterior(v);
  near(p[1].has.Duke, 0);
  assert.strictEqual(O.unseenCopies(v, 'Duke'), 0);
});
test('caught bluff: certainly does not hold it', () => {
  const ev = [{ t: 'action', p: 1, claim: 'Duke', action: 'tax' }, { t: 'challenge', by: 0, of: 1, char: 'Duke', truth: false }, { t: 'lose', p: 1, char: 'Captain' }];
  const v = view(0, ['Contessa', 'Assassin'], [{ hidden: 2 }, { hidden: 1, dead: ['Captain'] }], ev);
  near(O.posterior(v)[1].has.Duke, 0);
});
test('a claim raises the odds by Bayes (2 players, hand-worked)', () => {
  // P(has Duke)=33/78 before; claim likelihood 1 vs b=0.3
  const ev = [{ t: 'action', p: 1, claim: 'Duke', action: 'tax' }];
  const v = view(0, ['Captain', 'Contessa'], [{ hidden: 2 }, { hidden: 2 }], ev);
  const pr = 33 / 78;
  near(O.posterior(v, { bluff: 0.3 })[1].has.Duke, pr / (pr + (1 - pr) * 0.3), 1e-12);
});
test('matches brute force: 3 opponents with claims, blocks, non-blocks', () => {
  const ev = [
    { t: 'action', p: 1, claim: 'Duke', action: 'tax' },
    { t: 'action', p: 2, claim: 'Captain', action: 'steal', target: 3 },
    { t: 'block', p: 3, char: 'Ambassador' },
    { t: 'action', p: 3, claim: 'Assassin', action: 'assassinate', target: 1 },
    { t: 'noblock', p: 1, action: 'assassinate' },
    { t: 'lose', p: 1, char: 'Contessa' },
  ];
  const v = view(0, ['Duke', 'Captain'], [{ hidden: 2 }, { hidden: 1, dead: ['Contessa'] }, { hidden: 2 }, { hidden: 2 }], ev);
  const p = O.posterior(v, { bluff: 0.3 });
  const b = brute(v, 0.3);
  for (const i of [1, 2, 3]) for (const c of CH) near(p[i].has[c], b[i][c], 1e-9, `p${i} ${c}`);
});
test('matches brute force: known deck cards after my exchange', () => {
  const v = view(0, ['Duke', 'Assassin'], [{ hidden: 2 }, { hidden: 2 }, { hidden: 1, dead: ['Duke'] }],
    [{ t: 'action', p: 2, claim: 'Contessa' }], ['Contessa', 'Captain']);
  const p = O.posterior(v);
  const b = brute(v, 0.3);
  for (const i of [1, 2]) for (const c of CH) near(p[i].has[c], b[i][c], 1e-9, `p${i} ${c}`);
});
test('exchange wipes earlier evidence', () => {
  const ev = [{ t: 'action', p: 1, claim: 'Duke' }, { t: 'exchange', p: 1 }];
  const v = view(0, ['Captain', 'Contessa'], [{ hidden: 2 }, { hidden: 2 }], ev);
  near(O.posterior(v)[1].has.Duke, 1 - 45 / 78, 1e-12);
});
test('learned bluff rate moves toward what challenges showed', () => {
  const ev = [{ t: 'challenge', of: 1, truth: false }, { t: 'challenge', of: 1, truth: false }, { t: 'challenge', of: 2, truth: true }];
  const b = O.learnBluff(ev, 3, 0.2, 4);
  near(b[1], (0.8 + 2) / 6); near(b[2], 0.8 / 5); near(b[0], 0.2);
});
test('6 players: fast enough for a phone (< 60 ms)', () => {
  const v = view(0, ['Duke', 'Captain'], [{ hidden: 2 }, { hidden: 2 }, { hidden: 2 }, { hidden: 2 }, { hidden: 2 }, { hidden: 2 }],
    [{ t: 'action', p: 1, claim: 'Duke' }, { t: 'block', p: 4, char: 'Contessa' }]);
  const t = Date.now();
  for (let k = 0; k < 5; k++) O.posterior(v);
  const ms = (Date.now() - t) / 5;
  assert.ok(ms < 60, ms + ' ms');
  const p = O.posterior(v);
  for (let i = 1; i < 6; i++) { const s = p[i].hand.reduce((a, h) => a + h.p, 0); near(s, 1, 1e-9); }
});

console.log(`odds: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
