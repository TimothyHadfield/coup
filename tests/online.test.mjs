// Coup through the shared online.js interface: node tests/online.test.mjs
import { createRequire } from 'module';
import { createLocal } from '../js/online.js';
const require = createRequire(import.meta.url);
const { game, mergeView, stateFromView } = require('../js/coupgame.js');
const E = require('../js/engine.js');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; } catch (e) { fail++; console.log('FAIL', name, '\n  ', e.message); }
}
function assert(c, m) { if (!c) throw new Error(m || 'assert'); }
function rngFrom(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let x = a; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }

// Play a whole game with bot moves through the interface, checking every step.
function playThrough(n, options, seed, check) {
  const rng = rngFrom(seed);
  let s = game.setup(n, options, rng, Array.from({ length: n }, (_, i) => ({ kind: 'computer', name: 'P' + i })));
  let steps = 0;
  while (!game.isOver(s)) {
    const ta = game.toAct(s);
    assert(ta.length === 1, 'toAct empty before the end');
    const seat = ta[0];
    const ctx = { pub: game.publicView(s), mine: game.privateView(s, seat), state: s };
    const a = game.bot(ctx, seat, rng);
    s = game.apply(JSON.parse(JSON.stringify(s)), seat, JSON.parse(JSON.stringify(a)), rng);
    if (check) check(s);
    assert(++steps < 5000, 'game too long');
  }
  return s;
}

t('150 games of bot moves: apply never throws, state is JSON-safe', () => {
  for (let g = 0; g < 150; g++) {
    const n = 2 + (g % 5);
    const options = { level: ['easy', 'medium', 'hard'][g % 3], inquisitor: g % 4 === 1, twoDeal: n === 2 && g % 2 === 0 };
    const s = playThrough(n, options, 1000 + g, (st) => {
      const back = JSON.parse(JSON.stringify(st));
      assert(JSON.stringify(back) === JSON.stringify(st), 'state does not survive JSON');
    });
    assert(s.winner >= 0 && s.winner < n, 'no winner');
  }
});

// The hidden cards of seat i must not appear in anything sent to anyone else.
function secrets(s, i) {
  const pl = s.players[i];
  return pl.cards.filter((c) => !c.dead);
}
t('secrecy: public view and other seats never carry a hidden hand', () => {
  for (let g = 0; g < 30; g++) {
    const n = 3 + (g % 4);
    playThrough(n, { level: 'hard', inquisitor: g % 2 === 1 }, 5000 + g, (s) => {
      if (game.isOver(s)) return;
      const pub = game.publicView(s);
      const pubJson = JSON.stringify(pub);
      assert(!/"_true"|"rs"|"deck":\[|"cards"/.test(pubJson), 'public view leaks secret fields');
      assert(!pub.reveal, 'reveal before the end');
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          const mine = game.privateView(s, j);
          // seat j's private doc may only contain seat j's own cards (+ what j itself legitimately saw)
          assert(JSON.stringify(mine.myCards) === JSON.stringify(s.players[j].cards.map((c) => ({ c: c.c, dead: c.dead }))), 'private view carries wrong hand');
          if (mine.pending) assert(mine.pending.p === j, 'private view carries another seat\'s decision');
        }
      }
      // a pending exchange's options never go public
      if (s.pending && s.pending.kind === 'exchange') assert(!('options' in pub.pending), 'exchange options public');
      if (s.pending && s.pending.kind === 'examine') assert(!('char' in pub.pending), 'examined card public');
    });
  }
});

t('merged view equals the engine view for that seat', () => {
  playThrough(4, { level: 'medium' }, 77, (s) => {
    if (game.isOver(s)) return;
    for (let seat = 0; seat < 4; seat++) {
      const v = mergeView(game.publicView(s), game.privateView(s, seat), seat);
      const ev = E.viewFor(s, seat);
      for (const k of ['me', 'n', 'turn', 'winner', 'deckSize', 'players', 'myCards', 'knownDeck', 'peeks', 'events', 'pending', 'rules'])
        assert(JSON.stringify(v[k]) === JSON.stringify(ev[k]), 'merged view differs at ' + k);
      const st = stateFromView(game.publicView(s), game.privateView(s, seat), seat);
      assert(JSON.stringify(E.legalActions(st, seat)) === JSON.stringify(s.pending && s.pending.p === seat && s.pending.kind === 'action' ? E.legalActions(s, seat) : E.legalActions(st, seat)), 'legal actions differ');
    }
  });
});

t('apply refuses a move from the wrong seat and an illegal move', () => {
  const s = game.setup(3, { level: 'easy' }, rngFrom(3), []);
  const seat = game.toAct(s)[0];
  let threw = false;
  try { game.apply(JSON.parse(JSON.stringify(s)), (seat + 1) % 3, { action: 'income', target: -1 }); } catch (e) { threw = true; }
  assert(threw, 'wrong seat accepted');
  threw = false;
  try { game.apply(JSON.parse(JSON.stringify(s)), seat, { action: 'coup', target: (seat + 1) % 3 }); } catch (e) { threw = true; }
  assert(threw, 'coup with 2 coins accepted');
});

t('final public view reveals every hand for the Review', () => {
  const s = playThrough(3, { level: 'hard' }, 99);
  const pub = game.publicView(s);
  assert(pub.reveal && pub.reveal.length === 3, 'no reveal at the end');
  assert(pub.events.some((e) => '_true' in e), 'claim truth missing at the end');
});

// createLocal: all computers play to "finished"
let localDone = 0;
const LOCAL = 10;
for (let g = 0; g < LOCAL; g++) {
  await new Promise((res) => {
    const room = createLocal({ game, seats: Array(2 + (g % 5)).fill('computer'), options: { level: ['easy', 'medium', 'hard'][g % 3] }, botDelayMs: 0, rng: rngFrom(g + 1) });
    const to = setTimeout(() => { room.close(); res(); }, 60000);
    room.on('error', (e) => { console.log('room error', e && e.message); });
    room.on('change', (snap) => { if (snap.status === 'finished') { localDone++; clearTimeout(to); room.close(); res(); } });
    room.start();
  });
}
t('createLocal: ' + LOCAL + ' all-computer rooms finish', () => assert(localDone === LOCAL, localDone + '/' + LOCAL + ' finished'));

console.log(`online: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
