/* ============================================================================
 * engine.js: the rules of Coup (base game) as a pure state machine.
 *
 * No DOM here. The whole game is one plain JSON object, so it can be saved
 * to localStorage, sent over the network, and replayed in Node for the
 * strength simulations.
 *
 *   let s = CoupEngine.newGame({ names: ['You','Bot 1'], seed: 7, rules: {} });
 *   s = CoupEngine.apply(s, decision);        // pure (copies), for online play
 *   CoupEngine.act(s, decision);              // same, in place (fast, for sims)
 *   CoupEngine.view(s, seat);                 // what that seat may see
 *
 * s.pending says who must decide what:
 *   { kind:'action',    p }                        -> { action, target }
 *   { kind:'challenge', p, claimant, char, about }  -> { challenge: true|false }
 *   { kind:'block',     p, actor, action, chars }   -> { block: 'Duke' | null }
 *   { kind:'lose',      p, reason }                 -> { card: index into players[p].cards }
 *   { kind:'exchange',  p, options, keep }          -> { keep: [indices into options] }
 *   { kind:'pick',      p, options, keep:1 }         -> { keep: [index] }   (2-player variant setup)
 *   { kind:'show',      p, by }                      -> { card: index }     (Inquisitor examine: target picks)
 *   { kind:'examine',   p, target, char }            -> { force: true|false }
 *
 * Rules (checked against the 2015 rulebook, see docs/rules-check.md):
 * - 15 cards, 3 of each character. Everyone starts with 2 cards and 2 coins;
 *   in a 2-player game the starting player gets only 1 coin.
 * - 10+ coins at the start of your turn means you must Coup.
 * - "If an action is successfully challenged the entire action fails, and any
 *   coins paid as the cost of the action are returned." A Contessa block
 *   leaves the Assassin's fee spent.
 * - A player who proves a challenged card shuffles it into the deck and draws
 *   a new one. Eliminated players' coins go back to the treasury.
 * Variants (rules object):
 *   inquisitor: true  -> Inquisitor replaces all 3 Ambassadors (Exchange draws
 *                        1; Examine; blocks stealing).
 *   twoPlayerDeal: true (2 players only) -> the official 2-player setup: each
 *                        player picks 1 card from a set of all 5 characters,
 *                        the other 4 go out of play face down; a third set is
   *                        shuffled, each gets 1, the last 3 are the deck.
 *   factions: true    -> Loyalists vs Reformists (the Reformation expansion's rules):
 *                        sides alternate round the table from the starting
 *                        player; while both sides are in play nobody may Coup,
 *                        Assassinate, Steal from, Examine or block the Foreign aid
 *                        of their own side. Convert: pay 1 (yourself) or 2
 *                        (anyone else) into the Almshouse to flip a side.
 *                        Embezzle: claim you have NO Duke and take the Almshouse.
 *                        Challenged: a Duke-holder loses a card; otherwise the
 *                        embezzler shows both cards, redraws them, and the
 *                        challenger loses a card.
 * ==========================================================================*/
(function (root) {
  'use strict';

  const BASE_CHARS = ['Duke', 'Assassin', 'Captain', 'Ambassador', 'Contessa'];
  const INQ_CHARS = ['Duke', 'Assassin', 'Captain', 'Inquisitor', 'Contessa'];

  const ACTIONS = {
    income:      { label: 'Income',      claim: null,         cost: 0, target: false, blockBy: [] },
    foreign_aid: { label: 'Foreign aid', claim: null,         cost: 0, target: false, blockBy: ['Duke'] },
    coup:        { label: 'Coup',        claim: null,         cost: 7, target: true,  blockBy: [] },
    tax:         { label: 'Tax',         claim: 'Duke',       cost: 0, target: false, blockBy: [] },
    assassinate: { label: 'Assassinate', claim: 'Assassin',   cost: 3, target: true,  blockBy: ['Contessa'] },
    steal:       { label: 'Steal',       claim: 'Captain',    cost: 0, target: true,  blockBy: ['Captain', 'Ambassador'] },
    exchange:    { label: 'Exchange',    claim: 'Ambassador', cost: 0, target: false, blockBy: [] },
    examine:     { label: 'Examine',     claim: 'Inquisitor', cost: 0, target: true,  blockBy: [] },
    convert:     { label: 'Convert',     claim: null,         cost: 1, target: true,  blockBy: [], factions: true },
    embezzle:    { label: 'Embezzle',    claim: null,         cost: 0, target: false, blockBy: [], factions: true, denies: 'Duke' },
  };
  const ACTION_ORDER = ['income', 'foreign_aid', 'tax', 'steal', 'assassinate', 'exchange', 'examine', 'convert', 'embezzle', 'coup'];
  // Factions: these actions may not be aimed at your own side while both sides are in play.
  const ATTACKS = { coup: 1, assassinate: 1, steal: 1, examine: 1 };

  // The rule set in force: which characters exist and who does what.
  function ruleSet(rules) {
    const inq = !!(rules && rules.inquisitor);
    return {
      inquisitor: inq,
      twoPlayerDeal: !!(rules && rules.twoPlayerDeal),
      factions: !!(rules && rules.factions),
      chars: inq ? INQ_CHARS.slice() : BASE_CHARS.slice(),
      exchanger: inq ? 'Inquisitor' : 'Ambassador',
      stealBlockers: inq ? ['Captain', 'Inquisitor'] : ['Captain', 'Ambassador'],
      exchangeDraw: inq ? 1 : 2,
    };
  }
  // Action definition under the rules in force.
  function actionDef(s, a) {
    const d = Object.assign({}, ACTIONS[a]);
    if (a === 'exchange') d.claim = s.rules.exchanger;
    if (a === 'steal') d.blockBy = s.rules.stealBlockers.slice();
    return d;
  }
  function actionsInPlay(s) {
    return ACTION_ORDER.filter((a) => (a !== 'examine' || s.rules.inquisitor) && (!ACTIONS[a].factions || s.rules.factions));
  }
  // Factions: are a and b on the same side while both sides still have someone in play?
  function sameSide(s, a, b) {
    if (!s.rules.factions || a === b) return false;
    const pa = s.players[a], pb = s.players[b];
    if (pa.side !== pb.side) return false;
    return s.players.some((pl) => alive(pl) && pl.side !== pa.side);
  }
  const convertCost = (p, t) => (p === t ? 1 : 2);

  // ---- seeded random numbers (mulberry32), state kept inside the game ----
  function rand(s) {
    let t = (s.rs = (s.rs + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function shuffle(s, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand(s) * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // ---- small helpers ----
  const hiddenIdx = (pl) => pl.cards.map((c, i) => (c.dead ? -1 : i)).filter((i) => i >= 0);
  const hiddenChars = (pl) => pl.cards.filter((c) => !c.dead).map((c) => c.c);
  const alive = (pl) => pl.cards.some((c) => !c.dead);
  function aliveList(s) { return s.players.map((pl, i) => (alive(pl) ? i : -1)).filter((i) => i >= 0); }
  // Others in seat order, starting just after `from`.
  function orderAfter(s, from, exclude) {
    const out = [];
    for (let k = 1; k < s.n; k++) {
      const i = (from + k) % s.n;
      if (i !== exclude && alive(s.players[i])) out.push(i);
    }
    return out;
  }

  function newGame(opts) {
    const names = opts.names;
    const n = names.length;
    if (n < 2 || n > 6) throw new Error('Coup needs 2-6 players');
    const rules = ruleSet(opts.rules);
    if (n !== 2) rules.twoPlayerDeal = false;
    const s = {
      n, rs: (opts.seed >>> 0) || 1, turn: 0, turnNo: 0, rules,
      players: [], deck: [], out: [], events: [], loseQueue: [], reserve: 0,
      ctx: null, pending: null, winner: -1,
    };
    const first = opts.first == null || opts.first < 0 || opts.first >= n ? Math.floor(rand(s) * n) : opts.first;
    for (let i = 0; i < n; i++) {
      s.players.push({
        name: names[i],
        coins: n === 2 && i === first ? 1 : 2,
        cards: [],
        knownDeck: [],   // cards this player put back into the deck and still knows are there
        knownOut: [],    // 2-player variant: the 4 cards this player set aside
        peeks: [],       // Inquisitor: cards this player has examined [{p, char}]
      });
    }
    s.turn = first;
    if (rules.factions) {
      // the starting player's side is picked at random; everyone else takes the other side from the player before them
      const s0 = rand(s) < 0.5 ? 0 : 1;
      for (let k = 0; k < n; k++) s.players[(first + k) % n].side = (s0 + k) % 2;
    }
    if (rules.twoPlayerDeal) {
      // three sets of one-of-each; two are offered, the third makes the hand + deck
      s.sets = [rules.chars.slice(), rules.chars.slice(), shuffle(s, rules.chars.slice())];
      s.ctx = { stage: 'setupPick', order: [0, 1], oi: 0 };
    } else {
      for (const c of rules.chars) for (let k = 0; k < 3; k++) s.deck.push(c);
      shuffle(s, s.deck);
      for (const pl of s.players) pl.cards = [{ c: s.deck.pop(), dead: false }, { c: s.deck.pop(), dead: false }];
      startTurn(s);
    }
    advance(s);
    return s;
  }

  function log(s, ev) { ev.turnNo = s.turnNo; s.events.push(ev); return ev; }

  // Anyone drawing from the deck makes the "I know these are in the deck" memory unreliable.
  function deckTouched(s) { for (const pl of s.players) pl.knownDeck = []; }
  // Player p's hand changed: anything others learned by examining it is stale.
  function handChanged(s, p) { for (const pl of s.players) pl.peeks = pl.peeks.filter((k) => k.p !== p); }

  function startTurn(s) {
    s.turnNo++;
    s.ctx = { actor: s.turn, action: null, target: -1, stage: 'declare', order: [], oi: 0, blocker: -1, blockChar: null, failed: false };
    log(s, { t: 'turn', p: s.turn });
  }

  function legalActions(s, p) {
    const pl = s.players[p];
    const targets = orderAfter(s, p, p);
    const out = [];
    if (pl.coins >= 10) {
      for (const t of targets) if (!sameSide(s, p, t)) out.push({ action: 'coup', target: t });
      return out;
    }
    for (const a of actionsInPlay(s)) {
      const def = ACTIONS[a];
      if (a === 'convert') {
        for (const t of [p].concat(targets)) if (pl.coins >= convertCost(p, t)) out.push({ action: a, target: t });
        continue;
      }
      if (pl.coins < def.cost) continue;
      if (def.target) { for (const t of targets) if (!(ATTACKS[a] && sameSide(s, p, t))) out.push({ action: a, target: t }); }
      else out.push({ action: a, target: -1 });
    }
    return out;
  }

  // ---- the main loop: move forward until somebody has to decide something ----
  function advance(s) {
    for (let guard = 0; guard < 500; guard++) {
      const c = s.ctx;
      if (c && c.stage === 'setupPick') {
        if (c.oi < c.order.length) {
          const p = c.order[c.oi];
          s.pending = { kind: 'pick', p, options: s.sets[p].slice(), keep: 1 };
          return s;
        }
        // deal one from the third set to each, the last 3 become the deck
        const third = s.sets[2];
        for (const pl of s.players) pl.cards.push({ c: third.pop(), dead: false });
        s.deck = third;
        delete s.sets;
        startTurn(s);
        continue;
      }
      // 1. pending card losses come first
      while (s.loseQueue.length) {
        const q = s.loseQueue[0];
        const pl = s.players[q.p];
        const h = hiddenIdx(pl);
        if (h.length === 0) { s.loseQueue.shift(); continue; }
        if (h.length === 1) { s.loseQueue.shift(); loseCard(s, q.p, h[0], q.reason); continue; }
        s.pending = { kind: 'lose', p: q.p, reason: q.reason };
        return s;
      }
      // 2. game over?
      const al = aliveList(s);
      if (al.length <= 1) {
        s.winner = al.length ? al[0] : -1;
        s.pending = null;
        s.ctx = null;
        log(s, { t: 'win', p: s.winner });
        return s;
      }
      const def = c.action ? actionDef(s, c.action) : null;
      switch (c.stage) {
        case 'declare':
          if (!alive(s.players[c.actor])) { c.stage = 'done'; break; }
          s.pending = { kind: 'action', p: c.actor, mustCoup: s.players[c.actor].coins >= 10 };
          return s;

        case 'challengeAction': {
          if (c.oi < c.order.length) {
            const p = c.order[c.oi];
            if (!alive(s.players[p])) { c.oi++; break; }
            s.pending = { kind: 'challenge', p, claimant: c.actor, char: def.claim || def.denies, about: 'action', action: c.action, actor: c.actor, target: c.target };
            if (def.denies) s.pending.denies = true;
            return s;
          }
          c.stage = 'block'; c.order = []; c.oi = 0; c.blockOrderSet = false;
          break;
        }

        case 'block': {
          if (c.failed || !def.blockBy.length) { c.stage = 'resolve'; break; }
          if (!c.blockOrderSet) {
            c.blockOrderSet = true;
            if (c.action === 'foreign_aid') c.order = orderAfter(s, c.actor, c.actor).filter((p) => !sameSide(s, p, c.actor));
            else c.order = alive(s.players[c.target]) ? [c.target] : [];
            c.oi = 0;
          }
          if (c.oi < c.order.length) {
            const p = c.order[c.oi];
            if (!alive(s.players[p])) { c.oi++; break; }
            s.pending = { kind: 'block', p, actor: c.actor, action: c.action, target: c.target, chars: def.blockBy.slice() };
            return s;
          }
          c.stage = 'resolve';
          break;
        }

        case 'challengeBlock': {
          if (c.oi < c.order.length) {
            const p = c.order[c.oi];
            if (!alive(s.players[p])) { c.oi++; break; }
            s.pending = { kind: 'challenge', p, claimant: c.blocker, char: c.blockChar, about: 'block', action: c.action, actor: c.actor, target: c.target };
            return s;
          }
          // block stands unchallenged
          c.failed = true;
          c.stage = 'resolve';
          break;
        }

        case 'resolve':
          resolve(s);
          if (s.pending) return s;      // exchange / examine choice
          break;

        case 'done':
          nextTurn(s);
          break;

        default:
          throw new Error('bad stage ' + c.stage);
      }
    }
    throw new Error('advance loop did not settle');
  }

  function nextTurn(s) {
    const t = s.turn;
    for (let k = 1; k <= s.n; k++) {
      const i = (t + k) % s.n;
      if (alive(s.players[i])) { s.turn = i; break; }
    }
    startTurn(s);
  }

  function loseCard(s, p, idx, reason) {
    const card = s.players[p].cards[idx];
    card.dead = true;
    for (const pl of s.players) pl.peeks = pl.peeks.filter((k) => !(k.p === p && k.char === card.c && countHidden(s.players[p], card.c) === 0));
    log(s, { t: 'lose', p, char: card.c, reason });
    if (!alive(s.players[p])) {
      // eliminated players return their coins to the treasury
      s.players[p].coins = 0;
      log(s, { t: 'out', p });
    }
  }
  const countHidden = (pl, ch) => pl.cards.filter((cd) => !cd.dead && cd.c === ch).length;

  function resolve(s) {
    const c = s.ctx;
    const actor = s.players[c.actor];
    c.stage = 'done';
    if (c.failed) { log(s, { t: 'fail', p: c.actor, action: c.action, blocked: c.blocker >= 0 }); return; }
    if (!alive(actor) && c.action !== 'coup') {
      log(s, { t: 'fail', p: c.actor, action: c.action });
      return;
    }
    switch (c.action) {
      case 'income': actor.coins += 1; log(s, { t: 'gain', p: c.actor, n: 1, action: 'income' }); break;
      case 'foreign_aid': actor.coins += 2; log(s, { t: 'gain', p: c.actor, n: 2, action: 'foreign_aid' }); break;
      case 'tax': actor.coins += 3; log(s, { t: 'gain', p: c.actor, n: 3, action: 'tax' }); break;
      case 'embezzle': { const k = s.reserve; s.reserve = 0; actor.coins += k; log(s, { t: 'gain', p: c.actor, n: k, action: 'embezzle' }); break; }
      case 'convert': {
        const tg = s.players[c.target];
        if (!alive(tg)) break;
        tg.side = 1 - tg.side;
        log(s, { t: 'convert', p: c.actor, target: c.target, side: tg.side });
        break;
      }
      case 'steal': {
        const tg = s.players[c.target];
        const k = Math.min(2, tg.coins);
        tg.coins -= k; actor.coins += k;
        log(s, { t: 'steal', p: c.actor, target: c.target, n: k });
        break;
      }
      case 'coup':
      case 'assassinate':
        if (alive(s.players[c.target])) s.loseQueue.push({ p: c.target, reason: c.action });
        break;
      case 'exchange': {
        deckTouched(s);
        const drawn = [];
        for (let k = 0; k < s.rules.exchangeDraw && s.deck.length; k++) drawn.push(s.deck.pop());
        const options = hiddenChars(actor).concat(drawn);
        c.stage = 'exchangeWait';
        s.pending = { kind: 'exchange', p: c.actor, options, keep: hiddenIdx(actor).length };
        break;
      }
      case 'examine': {
        if (!alive(s.players[c.target])) break;
        c.stage = 'showWait';
        s.pending = { kind: 'show', p: c.target, by: c.actor };
        break;
      }
    }
  }

  // Challenge outcome: claimant proves the card or loses one.
  function resolveChallenge(s, challenger, claimant, char, about) {
    const pl = s.players[claimant];
    if (about === 'denies') {
      // Embezzle: the claim is "I have no Duke"
      const has = pl.cards.some((cd) => !cd.dead && cd.c === char);
      log(s, { t: 'challenge', by: challenger, of: claimant, char, about: 'action', denies: true, truth: !has });
      if (has) { s.loseQueue.push({ p: claimant, reason: 'bluff' }); return false; }
      // show every hidden card, shuffle them into the deck and draw as many new ones
      const hi = hiddenIdx(pl);
      const shown = hi.map((i) => pl.cards[i].c);
      log(s, { t: 'reveal', p: claimant, chars: shown.slice() });
      for (const c of shown) s.deck.push(c);
      shuffle(s, s.deck);
      deckTouched(s);
      handChanged(s, claimant);
      for (const i of hi) pl.cards[i] = { c: s.deck.pop(), dead: false };
      s.loseQueue.push({ p: challenger, reason: 'challenge' });
      return true;
    }
    const idx = pl.cards.findIndex((cd) => !cd.dead && cd.c === char);
    if (idx >= 0) {
      log(s, { t: 'challenge', by: challenger, of: claimant, char, about, truth: true });
      // prove it: card goes back, shuffle, draw a new one
      s.deck.push(char);
      shuffle(s, s.deck);
      deckTouched(s);
      handChanged(s, claimant);
      pl.cards[idx] = { c: s.deck.pop(), dead: false };
      log(s, { t: 'prove', p: claimant, char });
      s.loseQueue.push({ p: challenger, reason: 'challenge' });
      return true;
    }
    log(s, { t: 'challenge', by: challenger, of: claimant, char, about, truth: false });
    s.loseQueue.push({ p: claimant, reason: 'bluff' });
    return false;
  }

  function pickKeep(d, pd) {
    const keep = d.keep;
    if (!Array.isArray(keep) || keep.length !== pd.keep || new Set(keep).size !== keep.length ||
        keep.some((k) => !Number.isInteger(k) || k < 0 || k >= pd.options.length)) throw new Error('bad keep');
    return keep;
  }

  // ---- apply one decision (in place) ----
  function act(s, d) {
    const pd = s.pending;
    if (!pd) throw new Error('no decision pending');
    if (!d || typeof d !== 'object') throw new Error('bad decision');
    const c = s.ctx;
    switch (pd.kind) {
      case 'pick': {
        const keep = pickKeep(d, pd);
        const pl = s.players[pd.p];
        pl.cards.push({ c: pd.options[keep[0]], dead: false });
        pl.knownOut = pd.options.filter((_, k) => k !== keep[0]);
        s.out = s.out.concat(pl.knownOut);
        s.sets[pd.p] = [];
        c.oi++;
        break;
      }
      case 'action': {
        const pl = s.players[pd.p];
        const tgt = d.target == null ? -1 : d.target;
        const ok = legalActions(s, pd.p).some((a) => a.action === d.action && a.target === tgt);
        if (!ok) throw new Error('illegal action ' + JSON.stringify(d));
        const def = actionDef(s, d.action);
        c.action = d.action;
        c.target = def.target ? tgt : -1;
        const cost = d.action === 'convert' ? convertCost(pd.p, tgt) : def.cost;
        pl.coins -= cost;
        c.paid = cost;
        if (d.action === 'convert') { s.reserve = (s.reserve || 0) + cost; c.paid = 0; }
        const truth = def.claim ? hiddenChars(pl).includes(def.claim) : def.denies ? !hiddenChars(pl).includes(def.denies) : null;
        const ev = { t: 'action', p: pd.p, action: d.action, target: c.target, claim: def.claim, _true: truth };
        if (def.denies) ev.denies = def.denies;
        if (d.action === 'convert') ev.n = cost;
        log(s, ev);
        if (def.claim || def.denies) { c.stage = 'challengeAction'; c.order = orderAfter(s, pd.p, pd.p); c.oi = 0; }
        else { c.stage = 'block'; c.order = []; c.oi = 0; c.blockOrderSet = false; }
        break;
      }
      case 'challenge': {
        if (!d.challenge) { c.oi++; break; }
        if (pd.about === 'action') {
          const proved = resolveChallenge(s, pd.p, pd.claimant, pd.char, pd.denies ? 'denies' : 'action');
          if (!proved) {
            c.failed = true;
            if (c.paid) { s.players[c.actor].coins += c.paid; log(s, { t: 'refund', p: c.actor, n: c.paid }); c.paid = 0; }
          }
          c.stage = 'block'; c.order = []; c.oi = 0; c.blockOrderSet = false;
        } else {
          const proved = resolveChallenge(s, pd.p, pd.claimant, pd.char, 'block');
          c.failed = proved;        // a proven block stops the action
          c.stage = 'resolve';
        }
        break;
      }
      case 'block': {
        if (!d.block) { log(s, { t: 'noblock', p: pd.p, action: c.action, actor: c.actor }); c.oi++; break; }
        if (!pd.chars.includes(d.block)) throw new Error('cannot block with ' + d.block);
        const truth = hiddenChars(s.players[pd.p]).includes(d.block);
        log(s, { t: 'block', p: pd.p, char: d.block, action: c.action, actor: c.actor, _true: truth });
        c.blocker = pd.p; c.blockChar = d.block;
        c.stage = 'challengeBlock';
        // the actor gets first say, then everyone else in seat order
        c.order = [c.actor].concat(orderAfter(s, c.actor, pd.p));
        c.oi = 0;
        break;
      }
      case 'lose': {
        const pl = s.players[pd.p];
        if (!Number.isInteger(d.card) || !pl.cards[d.card] || pl.cards[d.card].dead) throw new Error('bad card to lose');
        s.loseQueue.shift();
        loseCard(s, pd.p, d.card, pd.reason);
        break;
      }
      case 'exchange': {
        const keep = pickKeep(d, pd);
        const pl = s.players[pd.p];
        const kept = keep.map((k) => pd.options[k]);
        const back = pd.options.filter((_, k) => !keep.includes(k));
        const hi = hiddenIdx(pl);
        hi.forEach((ci, k) => { pl.cards[ci] = { c: kept[k], dead: false }; });
        for (const b of back) s.deck.push(b);
        shuffle(s, s.deck);
        deckTouched(s);
        handChanged(s, pd.p);
        pl.knownDeck = back.slice();
        log(s, { t: 'exchange', p: pd.p });
        c.stage = 'done';
        break;
      }
      case 'show': {
        const pl = s.players[pd.p];
        if (!Number.isInteger(d.card) || !pl.cards[d.card] || pl.cards[d.card].dead) throw new Error('bad card to show');
        c.shown = d.card;
        const ch = pl.cards[d.card].c;
        log(s, { t: 'shown', p: pd.p, to: pd.by });
        s.pending = { kind: 'examine', p: pd.by, target: pd.p, char: ch };
        return s;
      }
      case 'examine': {
        const tg = s.players[pd.target];
        if (d.force) {
          s.deck.push(tg.cards[c.shown].c);
          shuffle(s, s.deck);
          deckTouched(s);
          handChanged(s, pd.target);
          tg.cards[c.shown] = { c: s.deck.pop(), dead: false };
          s.players[pd.p].knownDeck = [];
          log(s, { t: 'forced', p: pd.target, by: pd.p });
        } else {
          s.players[pd.p].peeks.push({ p: pd.target, char: pd.char });
          log(s, { t: 'kept', p: pd.target, by: pd.p });
        }
        c.stage = 'done';
        break;
      }
      default: throw new Error('unknown pending ' + pd.kind);
    }
    s.pending = null;
    return advance(s);
  }

  // Pure form for online play: never mutates the state it is given.
  function apply(state, decision) {
    const s = JSON.parse(JSON.stringify(state));
    return act(s, decision);
  }

  // What seat p is allowed to know. Fields starting with "_" are secret.
  function viewFor(s, p) {
    const pend = s.pending && s.pending.p === p ? s.pending : (s.pending ? publicPending(s.pending) : null);
    return {
      me: p, n: s.n, turn: s.turn, winner: s.winner, rules: s.rules,
      deckSize: s.deck.length, reserve: s.reserve || 0,
      players: s.players.map((pl, i) => ({
        name: pl.name, coins: pl.coins, alive: alive(pl), side: pl.side,
        hidden: hiddenIdx(pl).length,
        dead: pl.cards.filter((cd) => cd.dead).map((cd) => cd.c),
      })),
      myCards: p >= 0 ? s.players[p].cards.map((cd) => ({ c: cd.c, dead: cd.dead })) : [],
      knownDeck: p >= 0 ? s.players[p].knownDeck.concat(s.players[p].knownOut) : [],
      knownOut: p >= 0 ? s.players[p].knownOut.slice() : [],   // the part of knownDeck set aside (2-player deal), not in the deck
      peeks: p >= 0 ? s.players[p].peeks.slice() : [],
      events: publicEvents(s.events),
      pending: pend,
    };
  }
  function publicPending(pd) {
    const o = { kind: pd.kind, p: pd.p };
    for (const k of ['claimant', 'char', 'about', 'action', 'actor', 'target', 'chars', 'reason', 'by', 'denies'])
      if (pd[k] !== undefined && !(pd.kind === 'examine' && k === 'char')) o[k] = pd[k];
    return o;
  }
  function publicEvents(evs) {
    return evs.map((e) => {
      const o = {};
      for (const k in e) if (k[0] !== '_') o[k] = e[k];
      return o;
    });
  }

  // Card count invariant: every one of the 15 cards is somewhere exactly once.
  function countCards(s) {
    const cnt = {};
    for (const c of s.rules.chars) cnt[c] = 0;
    for (const c of s.deck) cnt[c]++;
    for (const c of s.out) cnt[c]++;
    if (s.sets) for (const set of s.sets) for (const c of set) cnt[c]++;
    for (const pl of s.players) for (const cd of pl.cards) cnt[cd.c]++;
    if (s.pending && s.pending.kind === 'exchange') {
      const pl = s.players[s.pending.p];
      const extra = s.pending.options.slice();
      for (const c of hiddenChars(pl)) extra.splice(extra.indexOf(c), 1);
      for (const c of extra) cnt[c]++;
    }
    if (s.sets && s.pending && s.pending.kind === 'pick') {
      // sets already counted
    }
    return cnt;
  }

  const api = {
    CHARS: BASE_CHARS, BASE_CHARS, INQ_CHARS, ACTIONS, ACTION_ORDER, ruleSet, actionDef,
    newGame, act, apply, view: viewFor, viewFor, advance, legalActions, publicEvents, countCards,
    alive, hiddenChars, hiddenIdx, orderAfter, rand, shuffle, sameSide, actionsInPlay,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CoupEngine = api;
})(typeof self !== 'undefined' ? self : this);
