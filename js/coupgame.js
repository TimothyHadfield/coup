/* ============================================================================
 * coupgame.js: the Coup engine wrapped in the shared online.js game interface
 * (setup / toAct / apply / publicView / privateView / bot / isOver).
 * Works as a browser script (window.CoupGame) and in node (require).
 * ==========================================================================*/
(function (root) {
  'use strict';
  const E = root.CoupEngine || require('./engine.js');
  const AI = root.CoupAI || require('./ai.js');

  const game = {
    id: 'coup',
    minSeats: 2,
    maxSeats: 6,

    // options: { level: 'easy'|'medium'|'hard', inquisitor, twoDeal, factions }
    setup(n, options, rng, seats) {
      options = options || {};
      rng = rng || Math.random;
      seats = seats || [];
      const names = Array.from({ length: n }, (_, i) => String((seats[i] && seats[i].name) || 'Seat ' + (i + 1)).slice(0, 18));
      const s = E.newGame({
        names,
        seed: (Math.floor(rng() * 2 ** 31) >>> 0) || 1,
        rules: { inquisitor: !!options.inquisitor, twoPlayerDeal: !!options.twoDeal && n === 2, factions: !!options.factions },
        first: -1,
      });
      s.level = ['easy', 'medium', 'hard'].includes(options.level) ? options.level : 'medium';
      return s;
    },

    toAct(s) { return s.winner < 0 && s.pending ? [s.pending.p] : []; },

    apply(s, seat, action) {
      if (!s.pending || s.pending.p !== seat) throw new Error('Not your turn.');
      return E.act(s, action);
    },

    // Everything the whole table may see. At the end every card is turned over
    // (with which claims were true) so everyone gets the Review.
    publicView(s) {
      const v = E.viewFor(s, -1);
      delete v.myCards; delete v.knownDeck; delete v.peeks; delete v.me;
      v.turnNo = s.turnNo;
      v.ctx = s.ctx ? { actor: s.ctx.actor, action: s.ctx.action, target: s.ctx.target } : null;
      v.level = s.level;
      if (s.winner >= 0) {
        v.reveal = s.players.map((pl) => pl.cards.map((c) => ({ c: c.c, dead: c.dead })));
        v.events = s.events.map((e) => Object.assign({}, e));
      }
      return v;
    },

    // Only this seat's secrets: its cards, what it knows of the deck, its peeks,
    // and its own decision (exchange options, examined card).
    privateView(s, seat) {
      const pl = s.players[seat];
      if (!pl) return null;
      return {
        myCards: pl.cards.map((c) => ({ c: c.c, dead: c.dead })),
        knownDeck: pl.knownDeck.concat(pl.knownOut),
        peeks: pl.peeks.slice(),
        pending: s.pending && s.pending.p === seat ? s.pending : null,
      };
    },

    bot(ctx, seat, rng) {
      const s = ctx.state;
      const pd = s.pending;
      const v = E.viewFor(s, seat);
      const legal = pd.kind === 'action' ? E.legalActions(s, seat) : null;
      return AI.decide(v, pd, s.level || 'medium', rng || Math.random, legal, s.rules).d;
    },

    isOver(s) { return s.winner >= 0; },
  };

  // Rebuild what seat `me` may know, in the same shape as engine.viewFor.
  function mergeView(pub, mine, me) {
    return Object.assign({}, pub, {
      me,
      myCards: mine ? mine.myCards : [],
      knownDeck: mine ? mine.knownDeck : [],
      peeks: mine ? mine.peeks : [],
      pending: (mine && mine.pending) || pub.pending,
    });
  }
  // A stand-in state for drawing the table: other players' hidden cards are null.
  function stateFromView(pub, mine, me) {
    const players = pub.players.map((p, i) => {
      let cards;
      if (pub.reveal) cards = pub.reveal[i].map((c) => ({ c: c.c, dead: c.dead }));
      else if (i === me && mine) cards = mine.myCards.map((c) => ({ c: c.c, dead: c.dead }));
      else cards = Array.from({ length: p.hidden }, () => ({ c: null, dead: false })).concat(p.dead.map((c) => ({ c, dead: true })));
      return { name: p.name, coins: p.coins, side: p.side, cards, knownDeck: [], knownOut: [], peeks: [] };
    });
    return {
      n: pub.n, rules: pub.rules, players, events: pub.events || [], turn: pub.turn, turnNo: pub.turnNo || 0, reserve: pub.reserve || 0,
      pending: (mine && mine.pending) || pub.pending || null, ctx: pub.ctx, winner: pub.winner,
      deck: { length: pub.deckSize }, out: [], level: pub.level,
    };
  }

  const api = { game, mergeView, stateFromView };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CoupGame = api;
})(typeof window !== 'undefined' ? window : globalThis);
