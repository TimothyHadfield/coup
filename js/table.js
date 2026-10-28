/* ============================================================================
 * table.js: the real-table companion. You play Coup with real cards; the
 * phone records each turn by asking a few taps' worth of questions, and
 * keeps the same odds as the computer game.
 *
 * Everything is derived from { setup, turns } (like the Secret Hitler
 * companion's event log), so Undo is just "drop the last turn".
 *
 * setup = { names:[..], me: seat or -1, myCards:[c,c] or [], rules:{inquisitor} }
 * turn  = { actor, action, target,
 *           chal:  { by, truth, lose, proofNew },    // challenge of the action
 *           block: { by, char, chal: { by, truth, lose, proofNew } },
 *           targetLose, myNew:[..] }                 // after coup/assassinate, after my exchange
 *   lose     = the character the loser turned face up
 *   proofNew = my new card when I proved a challenged card (only asked if I'm the one)
 * ==========================================================================*/
(function (root) {
  'use strict';
  const Eng = root.CoupEngine || (typeof require !== 'undefined' ? require('./engine.js') : null);

  function emptyPlayers(setup) {
    return setup.names.map((name, i) => ({
      name, coins: setup.names.length === 2 && i === (setup.first || 0) ? 1 : 2,
      dead: [], hidden: 2, alive: true,
    }));
  }

  // Replay every turn. Returns players, my cards, public events (odds format), next actor.
  function derive(setup, turns, uptoPartial) {
    const rules = Eng.ruleSet(setup.rules);
    const P = emptyPlayers(setup);
    const me = setup.me == null ? -1 : setup.me;
    let mine = (setup.myCards || []).map((c) => ({ c, dead: false }));
    const events = [];
    let knownDeck = [];
    const lose = (p, ch, reason) => {
      if (!P[p].alive || !ch) return;
      P[p].dead.push(ch);
      P[p].hidden--;
      if (p === me) {
        const k = mine.findIndex((m) => !m.dead && m.c === ch);
        if (k >= 0) mine[k].dead = true;
      }
      events.push({ t: 'lose', p, char: ch, reason });
      if (P[p].hidden <= 0) { P[p].alive = false; P[p].coins = 0; events.push({ t: 'out', p }); }
    };
    const proveMine = (ch, nw) => {
      if (!nw) return;
      const k = mine.findIndex((m) => !m.dead && m.c === ch);
      if (k >= 0) mine[k] = { c: nw, dead: false };
    };
    let turnNo = 0;
    let next = setup.first || 0;
    const all = turns.slice();
    for (const tn of all) {
      turnNo++;
      const def = Eng.actionDef({ rules }, tn.action);
      const actor = P[tn.actor];
      events.push({ t: 'turn', p: tn.actor, turnNo });
      actor.coins -= def.cost;
      events.push({ t: 'action', p: tn.actor, action: tn.action, target: tn.target == null ? -1 : tn.target, claim: def.claim, turnNo });
      let failed = false;
      if (tn.chal) {
        events.push({ t: 'challenge', by: tn.chal.by, of: tn.actor, char: def.claim, about: 'action', truth: !!tn.chal.truth });
        if (tn.chal.truth) {
          events.push({ t: 'prove', p: tn.actor, char: def.claim });
          knownDeck = [];
          if (tn.actor === me) proveMine(def.claim, tn.chal.proofNew);
          lose(tn.chal.by, tn.chal.lose, 'challenge');
        } else {
          actor.coins += def.cost;      // a failed challenged action refunds its cost (before the loss, like the engine:
          lose(tn.actor, tn.chal.lose, 'bluff');   //  a bluffer who goes out returns those coins too)
          failed = true;
        }
      }
      const tAlive = tn.target != null && tn.target >= 0 && P[tn.target].alive;
      if (!failed && def.blockBy.length) {
        if (tn.block) {
          events.push({ t: 'block', p: tn.block.by, char: tn.block.char, action: tn.action, actor: tn.actor });
          const bc = tn.block.chal;
          if (bc) {
            events.push({ t: 'challenge', by: bc.by, of: tn.block.by, char: tn.block.char, about: 'block', truth: !!bc.truth });
            if (bc.truth) {
              events.push({ t: 'prove', p: tn.block.by, char: tn.block.char });
              knownDeck = [];
              if (tn.block.by === me) proveMine(tn.block.char, bc.proofNew);
              lose(bc.by, bc.lose, 'challenge');
              failed = true;
            } else {
              lose(tn.block.by, bc.lose, 'bluff');
            }
          } else failed = true;
        } else {
          const askers = tn.action === 'foreign_aid' ? P.map((_, i) => i).filter((i) => i !== tn.actor && P[i].alive) : (tAlive ? [tn.target] : []);
          for (const i of askers) events.push({ t: 'noblock', p: i, action: tn.action, actor: tn.actor });
        }
      }
      if (!failed && actor.alive) {
        switch (tn.action) {
          case 'income': actor.coins += 1; break;
          case 'foreign_aid': actor.coins += 2; break;
          case 'tax': actor.coins += 3; break;
          case 'steal': if (P[tn.target]) { const k = Math.min(2, P[tn.target].coins); P[tn.target].coins -= k; actor.coins += k; } break;
          case 'coup': case 'assassinate':
            if (P[tn.target].alive) lose(tn.target, tn.targetLose, tn.action);
            break;
          case 'exchange':
            events.push({ t: 'exchange', p: tn.actor });
            knownDeck = [];
            if (tn.actor === me && tn.myNew && tn.myNew.length) {
              let k = 0;
              mine = mine.map((m) => (m.dead ? m : { c: tn.myNew[k++] || m.c, dead: false }));
            }
            break;
          case 'examine':
            if (tn.forced) events.push({ t: 'forced', p: tn.target, by: tn.actor });
            break;
        }
      } else if (failed) events.push({ t: 'fail', p: tn.actor, action: tn.action });
      // next living player in seat order
      for (let k = 1; k <= P.length; k++) { const i = (tn.actor + k) % P.length; if (P[i].alive) { next = i; break; } }
    }
    const alive = P.map((p, i) => (p.alive ? i : -1)).filter((i) => i >= 0);
    return {
      rules, players: P, me, myCards: mine, events, next, knownDeck,
      winner: alive.length === 1 ? alive[0] : -1,
    };
  }

  // Odds-model view from the table state (same shape as CoupEngine.view).
  function oddsView(d) {
    return {
      me: d.me, rules: d.rules, players: d.players.map((p) => ({ coins: p.coins, alive: p.alive, hidden: Math.max(0, p.hidden), dead: p.dead })),
      myCards: d.me >= 0 ? d.myCards : [], knownDeck: d.knownDeck, events: d.events, peeks: [],
    };
  }

  /**
   * What to ask next while recording a turn. Returns null when the turn is complete.
   * { id, ask, options:[{label, value}], claim?: {p, char} }  (claim -> show its odds)
   */
  function nextQuestion(setup, turns, t) {
    const d = derive(setup, turns);
    const P = d.players;
    const rules = d.rules;
    const me = d.me;
    const name = (i) => (i === me ? 'You' : P[i].name);
    const aliveOthers = (x) => P.map((_, i) => i).filter((i) => i !== x && P[i].alive);
    const charsLeft = (p) => {
      // what p could have turned over: for me, my real cards; else any character
      if (p === me) return d.myCards.filter((m) => !m.dead).map((m) => m.c).filter((c, i, a) => a.indexOf(c) === i);
      return rules.chars.slice();
    };
    const lostQ = (id, p) => ({ id, ask: `${name(p)} lost which card?`, options: charsLeft(p).map((c) => ({ label: c, value: c, char: c })) });
    if (t.actor == null) return { id: 'actor', ask: 'Whose turn?', options: P.map((p, i) => (p.alive ? { label: name(i), value: i } : null)).filter(Boolean) };
    if (!t.action) {
      const coins = P[t.actor].coins;
      const acts = Eng.ACTION_ORDER.filter((a) => (a !== 'examine' || rules.inquisitor) && !Eng.ACTIONS[a].factions && coins >= Eng.ACTIONS[a].cost && (coins < 10 || a === 'coup'));
      return { id: 'action', ask: `${name(t.actor)}: which action?`, options: acts.map((a) => ({ label: Eng.ACTIONS[a].label, value: a, action: a })) };
    }
    const def = Eng.actionDef({ rules }, t.action);
    if (def.target && t.target == null) return { id: 'target', ask: `${Eng.ACTIONS[t.action].label} who?`, options: aliveOthers(t.actor).map((i) => ({ label: name(i), value: i })) };
    // a fake turn list that includes this claim, to price it
    if (def.claim && t.chal === undefined)
      return { id: 'chal', ask: 'Anyone challenge?', claim: { p: t.actor, char: def.claim }, options: [{ label: 'No', value: null }].concat(aliveOthers(t.actor).map((i) => ({ label: name(i), value: i }))) };
    if (t.chal && t.chal.truth === undefined) return { id: 'chalTruth', ask: `Did ${name(t.actor)} show a ${def.claim}?`, options: [{ label: 'Yes, shown', value: true }, { label: 'No, bluff', value: false }] };
    if (t.chal && !t.chal.lose) {
      const loser = t.chal.truth ? t.chal.by : t.actor;
      if (P[loser].hidden > 1 || loser === me) return lostQ('chalLose', loser);
      return { id: 'chalLose', ask: `${name(loser)} turned over which card?`, options: rules.chars.map((c) => ({ label: c, value: c, char: c })) };
    }
    if (t.chal && t.chal.truth && t.actor === me && t.chal.proofNew === undefined)
      return { id: 'proofNew', ask: 'Your new card?', options: rules.chars.map((c) => ({ label: c, value: c, char: c })) };
    const failed = t.chal && !t.chal.truth;
    if (failed) return null;
    // simulate the challenge losses so far to see who is still in
    const partial = derive(setup, turns.concat([Object.assign({}, t, { block: null, targetLose: null })]));
    const tAlive = def.target ? partial.players[t.target].alive : false;
    if (def.blockBy.length && t.block === undefined) {
      const blockers = t.action === 'foreign_aid' ? aliveOthers(t.actor).filter((i) => partial.players[i].alive) : (tAlive ? [t.target] : []);
      if (blockers.length) {
        const opts = [{ label: 'No block', value: null }];
        for (const b of blockers) for (const c of def.blockBy) opts.push({ label: `${name(b)} · ${c}`, value: { by: b, char: c }, char: c });
        return { id: 'block', ask: 'Blocked?', options: opts };
      }
    }
    if (t.block) {
      const bl = t.block;
      if (bl.chal === undefined) {
        const who = [t.actor].concat(aliveOthers(t.actor).filter((i) => i !== bl.by)).filter((i) => partial.players[i].alive);
        return { id: 'blockChal', ask: 'Anyone challenge the block?', claim: { p: bl.by, char: bl.char, block: true }, options: [{ label: 'No', value: null }].concat(who.map((i) => ({ label: name(i), value: i }))) };
      }
      if (bl.chal && bl.chal.truth === undefined) return { id: 'blockChalTruth', ask: `Did ${name(bl.by)} show a ${bl.char}?`, options: [{ label: 'Yes, shown', value: true }, { label: 'No, bluff', value: false }] };
      if (bl.chal && !bl.chal.lose) {
        const loser = bl.chal.truth ? bl.chal.by : bl.by;
        return lostQ('blockChalLose', loser);
      }
      if (bl.chal && bl.chal.truth && bl.by === me && bl.chal.proofNew === undefined)
        return { id: 'blockProofNew', ask: 'Your new card?', options: rules.chars.map((c) => ({ label: c, value: c, char: c })) };
      if (!bl.chal || bl.chal.truth) return null;   // block stands
    }
    const after = derive(setup, turns.concat([Object.assign({}, t, { targetLose: null })]));
    if ((t.action === 'coup' || t.action === 'assassinate') && !t.targetLose && after.players[t.target].alive)
      return lostQ('targetLose', t.target);
    if (t.action === 'exchange' && t.actor === me && !t.myNew) {
      return { id: 'myNew', ask: 'Your cards now?', multi: after.myCards.filter((m) => !m.dead).length, options: rules.chars.map((c) => ({ label: c, value: c, char: c })) };
    }
    if (t.action === 'examine' && t.forced === undefined)
      return { id: 'forced', ask: 'Made them swap it?', options: [{ label: 'Yes', value: true }, { label: 'No', value: false }] };
    return null;
  }

  // Put an answer into the partial turn.
  function answer(t, q, value) {
    const o = JSON.parse(JSON.stringify(t));
    switch (q.id) {
      case 'actor': o.actor = value; break;
      case 'action': o.action = value; break;
      case 'target': o.target = value; break;
      case 'chal': o.chal = value == null ? null : { by: value }; break;
      case 'chalTruth': o.chal.truth = value; break;
      case 'chalLose': o.chal.lose = value; break;
      case 'proofNew': o.chal.proofNew = value; break;
      case 'block': o.block = value == null ? null : { by: value.by, char: value.char }; break;
      case 'blockChal': o.block.chal = value == null ? null : { by: value }; break;
      case 'blockChalTruth': o.block.chal.truth = value; break;
      case 'blockChalLose': o.block.chal.lose = value; break;
      case 'blockProofNew': o.block.chal.proofNew = value; break;
      case 'targetLose': o.targetLose = value; break;
      case 'myNew': o.myNew = value; break;
      case 'forced': o.forced = value; break;
    }
    return o;
  }

  // Odds that the claim in question q is true, with the claim itself counted as evidence.
  function claimOdds(setup, turns, t, q, Odds, bluff) {
    if (!q || !q.claim) return null;
    const d = derive(setup, turns);
    const v = oddsView(d);
    if (q.claim.p === d.me) return null;
    v.events = v.events.concat(q.claim.block
      ? [{ t: 'action', p: t.actor, action: t.action, target: t.target, claim: null }, { t: 'block', p: q.claim.p, char: q.claim.char }]
      : [{ t: 'action', p: t.actor, action: t.action, target: t.target, claim: q.claim.char }]);
    const post = Odds.posterior(v, { bluff: bluff == null ? 0.3 : bluff });
    return post[q.claim.p] ? post[q.claim.p].has[q.claim.char] : null;
  }

  // One line of plain English for the log.
  function describe(setup, d, tn) {
    const nm = (i) => (i === d.me ? 'You' : d.players[i].name);
    const A = Eng.ACTIONS[tn.action].label;
    let s = nm(tn.actor) + ': ' + A + (tn.target != null && tn.target >= 0 ? ' → ' + nm(tn.target) : '');
    if (tn.chal) s += tn.chal.truth ? ` · ${nm(tn.chal.by)} challenged, wrong` : ` · ${nm(tn.chal.by)} caught a bluff`;
    if (tn.block) {
      s += ` · ${nm(tn.block.by)} blocked (${tn.block.char})`;
      if (tn.block.chal) s += tn.block.chal.truth ? ', block held' : ', block was a bluff';
    }
    if (tn.targetLose) s += ` · ${nm(tn.target)} lost ${tn.targetLose}`;
    return s;
  }

  const api = { derive, oddsView, nextQuestion, answer, claimOdds, describe };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CoupTable = api;
})(typeof self !== 'undefined' ? self : this);
