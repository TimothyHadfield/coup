/* ============================================================================
 * ai.js: the computer players (Easy / Medium / Hard) and the Hint button.
 *
 * Every decision sees only CoupEngine.viewFor(state, me): its own cards,
 * face-up cards, coins and the public event log. No peeking.
 *   Easy   plays honestly by feel, rarely bluffs, challenges almost at random.
 *   Medium counts cards (which characters are already face up) and bluffs some.
 *   Hard   uses the full odds model (odds.js: card counting + what everyone
 *          has claimed) and weighs what each choice risks against what it gains.
 * The Hint button asks Hard what it would do in your seat, with a reason.
 * ==========================================================================*/
(function (root) {
  'use strict';
  const Odds = root.CoupOdds || (typeof require !== 'undefined' ? require('./odds.js') : null);

  const PARAMS = {
    easy:   { noise: 2.2, bluff: 0.04, odds: 'none',  caution: 1.0, blockBluff: 0.25, smart: false },
    medium: { noise: 0.9, bluff: 0.5,  odds: 'full', learn: false, caution: 1.4, blockBluff: 0.5,  smart: true },
    // Hard's numbers were tuned by simulation (tools/sim.js, 2026-10-19): a
    // grid over caution/bluff/risk against Medium; learning each opponent's
    // bluff rate mid-game measured worse, so it is off.
    hard:   { noise: 0.25, bluff: 0.5, odds: 'full', learn: false, caution: 3.0, risk: 0.2, blockBluff: 1.0,  smart: true },
  };
  // Hard's look-ahead plays thousands of quick games in its head; those use Medium's habits with a
  // cheaper odds sum (card counting + each player's claims since their hand last changed).
  PARAMS.quick = Object.assign({}, PARAMS.medium, { odds: 'quick' });
  function quickPost(view, chars) {
    const CH = chars || (view.rules && view.rules.chars) || ['Duke', 'Assassin', 'Captain', 'Ambassador', 'Contessa'];
    const per = (view.rules && view.rules.perChar) || 3;
    const u = {};
    CH.forEach((c) => (u[c] = per));
    view.myCards.forEach((cd) => { if (!cd.dead && u[cd.c] > 0) u[cd.c]--; });
    view.players.forEach((pl) => pl.dead.forEach((c) => { if (u[c] > 0) u[c]--; }));
    (view.knownDeck || []).forEach((c) => { if (u[c] > 0) u[c]--; });
    const U = CH.reduce((a, c) => a + u[c], 0);
    const n = view.players.length;
    const claims = Array.from({ length: n }, () => ({})), caught = Array.from({ length: n }, () => ({}));
    for (const e of view.events) {
      if (e.t === 'action' && e.claim) claims[e.p][e.claim] = 1;
      else if (e.t === 'block') claims[e.p][e.char] = 1;
      else if (e.t === 'challenge' && e.denies) { if (e.truth) { claims[e.of] = {}; caught[e.of] = {}; } else claims[e.of][e.char] = 1; }
      else if (e.t === 'challenge') { delete claims[e.of][e.char]; if (!e.truth) caught[e.of][e.char] = 1; }
      else if (e.t === 'exchange' || e.t === 'forced') { claims[e.p] = {}; caught[e.p] = {}; }
      else if (e.t === 'lose') delete claims[e.p][e.char];
    }
    return view.players.map((pl, i) => {
      if (i === view.me || !pl.hidden) return null;
      const has = {};
      for (const c of CH) {
        let p = U > 0 ? 1 - Odds.binom(U - u[c], pl.hidden) / Math.max(1, Odds.binom(U, pl.hidden)) : 0;
        if (caught[i][c]) p = 0;
        else if (claims[i][c] && u[c] > 0) p = p / (p + (1 - p) * 0.3);
        has[c] = p;
      }
      return { has };
    });
  }
  const VAL = { Duke: 5, Captain: 4, Assassin: 4.2, Contessa: 3.4, Ambassador: 2.6, Inquisitor: 3 };
  const NAME = { income: 'Income', foreign_aid: 'Foreign aid', tax: 'Tax', steal: 'Steal', assassinate: 'Assassinate', exchange: 'Exchange', coup: 'Coup', examine: 'Examine', convert: 'Convert', embezzle: 'Embezzle' };

  function ctxOf(view, level, rnd, rules) {
    const P = PARAMS[level];
    const me = view.me;
    const mine = view.myCards.filter((c) => !c.dead).map((c) => c.c);
    const opps = view.players.map((p, i) => i).filter((i) => i !== me && view.players[i].alive);
    let _post = null;
    const chars = (rules && rules.chars) || undefined;
    const stealBlockers = (rules && rules.stealBlockers) || undefined;
    const post = () => {
      if (_post) return _post;
      if (P.odds === 'none') return (_post = null);
      if (P.odds === 'quick') return (_post = quickPost(view, chars));
      const bluffBy = P.learn ? Odds.learnBluff(view.events, view.players.length, 0.2) : undefined;
      _post = Odds.posterior(view, { useEvidence: P.odds === 'full', bluff: 0.3, bluffBy, chars, stealBlockers });
      return _post;
    };
    // P(player i holds char), with a sensible fallback for Easy
    // one player's odds only (much cheaper at a big table than everyone's)
    const one = {};
    const postOne = (i) => {
      if (_post) return _post[i];
      if (P.odds !== 'full') { const pp = post(); return pp && pp[i]; }
      if (one[i] === undefined) {
        const bluffBy = P.learn ? Odds.learnBluff(view.events, view.players.length, 0.2) : undefined;
        one[i] = Odds.posterior(view, { useEvidence: true, bluff: 0.3, bluffBy, chars, stealBlockers, only: [i] })[i];
      }
      return one[i];
    };
    const has = (i, c) => {
      const pi = postOne(i);
      if (pi) return pi.has[c];
      const pp = post();
      if (pp && pp[i]) return pp[i].has[c];
      const unseen = Odds.unseenCopies(view, c);
      return unseen === 0 ? 0 : 0.35 * view.players[i].hidden;
    };
    const unseen = (c) => Odds.unseenCopies(view, c);
    // did I already claim c this hand (makes a repeat bluff more believable)?
    const myClaims = new Set();
    for (const e of view.events) {
      if ((e.t === 'action' && e.p === me && e.claim)) myClaims.add(e.claim);
      if (e.t === 'block' && e.p === me) myClaims.add(e.char);
      if ((e.t === 'exchange' || e.t === 'forced') && e.p === me) myClaims.clear();
      if (e.t === 'challenge' && e.of === me && !e.truth) myClaims.delete(e.char);
    }
    return { P, me, mine, opps, post, has, unseen, myClaims, rnd, view, hidden: mine.length, coins: view.players[me].coins, rules: rules || {} };
  }

  // Cost to me of losing a card, and value of taking one from player i.
  const myLossCost = (x) => (x.hidden <= 1 ? 14 : 5);
  const killValue = (x, i) => (x.view.players[i].hidden <= 1 ? 8 : 5);
  function threat(x, i) {
    const p = x.view.players[i];
    return p.hidden * 4 + p.coins + (p.coins >= 7 ? 3 : 0);
  }

  // How likely the table calls my bluff of char c.
  function challengeRisk(x, c) {
    const u = x.unseen(c) - (x.mine.includes(c) ? 0 : 0);
    if (u <= 0) return 0.97;
    let pc = (x.P.risk || 0.1) * x.opps.length + (3 - u) * 0.14;
    if (x.myClaims.has(c)) pc -= 0.12;
    if (x.P.learn) {
      // how often this table has been calling claims so far
      let claims = 0, calls = 0;
      for (const e of x.view.events) {
        if ((e.t === 'action' && e.claim) || e.t === 'block') claims++;
        if (e.t === 'challenge') calls++;
      }
      pc += ((calls + 0.6) / (claims + 4) - 0.15) * 1.2;
    }
    return Math.max(0.05, Math.min(0.9, pc));
  }

  // ------------------------------------------------------------- actions
  function chooseAction(view, legal, level, rnd, rules, withCands) {
    const x = ctxOf(view, level, rnd, rules);
    const P = x.P;
    const coins = x.coins;
    const targets = (a) => legal.filter((l) => l.action === a).map((l) => l.target);
    const bestBy = (list, f) => list.reduce((b, t) => (b == null || f(t) > f(b) ? t : b), null);

    if (legal.every((l) => l.action === 'coup')) {
      const t = P.smart ? bestBy(targets('coup'), (i) => threat(x, i)) : targets('coup')[Math.floor(rnd() * targets('coup').length)];
      const r = { d: { action: 'coup', target: t }, why: 'You have 10+ coins, so you must Coup.' };
      if (withCands) r.cands = targets('coup').map((i) => ({ action: 'coup', target: i, s: threat(x, i), why: `Coup ${view.players[i].name}: you have 10+ coins, so you must Coup.` }));
      return r;
    }
    if (coins >= 7 && !withCands && (level !== 'easy' || rnd() < 0.7)) {
      const ts = targets('coup');
      const t = P.smart ? bestBy(ts, (i) => threat(x, i)) : ts[Math.floor(rnd() * ts.length)];
      return { d: { action: 'coup', target: t }, why: `Coup ${view.players[t].name}: it can't be blocked or challenged.` };
    }

    const cands = [];
    const add = (action, target, score, claim, why) => cands.push({ action, target, score, claim, why });
    const claimCost = (c) => {
      if (!c || x.mine.includes(c)) return 0;
      if (P.bluff <= 0) return 99;
      const r = challengeRisk(x, c);
      return (r * myLossCost(x)) / P.bluff;
    };
    const anyHas = (c) => 1 - x.opps.reduce((q, i) => q * (1 - Math.min(0.95, x.has(i, c))), 1);
    const stealBlockers = (rules && rules.stealBlockers) || ['Captain', 'Ambassador'];
    // How often player t has blocked this action before. Trying again into the same block can loop
    // forever between two last-card players, so each repeat makes it less attractive (saving up for a Coup wins instead).
    const blocksBy = (t, a) => view.events.filter((e) => e.t === 'block' && e.p === t && e.action === a).length;

    add('income', -1, 1, null, 'Income is safe: nobody can stop it.');
    const pDuke = level === 'hard' ? anyHas('Duke') * 0.85 : 0.35;
    add('foreign_aid', -1, 2 * (1 - pDuke) + 0.15, null, `Foreign aid: about ${Math.round(pDuke * 100)}% someone blocks with a Duke.`);
    if (targets('tax').length || legal.some((l) => l.action === 'tax'))
      add('tax', -1, 3, 'Duke', x.mine.includes('Duke') ? 'You hold a Duke: Tax is free money.' : 'Tax is a bluff here.');
    for (const t of targets('steal')) {
      const c = view.players[t].coins;
      if (c === 0) continue;
      const pb = P.smart ? Math.min(0.95, stealBlockers.reduce((q, ch) => q + x.has(t, ch), 0) * 0.8) : 0.3;
      add('steal', t, Math.min(2, c) * 1.7 * (1 - pb) + (c >= 5 ? 0.6 : 0) - (P.smart ? blocksBy(t, 'steal') * 1.2 : 0), 'Captain',
        `Steal from ${view.players[t].name}: about ${Math.round(pb * 100)}% they block.`);
    }
    for (const t of targets('assassinate')) {
      const pc = P.smart ? x.has(t, 'Contessa') : 0.3;
      add('assassinate', t, killValue(x, t) * (1 - pc * 0.9) - 2.2 + (P.smart ? threat(x, t) * 0.05 - blocksBy(t, 'assassinate') * 2.5 : 0), 'Assassin',
        `Assassinate ${view.players[t].name}: about ${Math.round(pc * 100)}% they have a Contessa.`);
    }
    if (legal.some((l) => l.action === 'exchange')) {
      const weak = x.mine.every((c) => VAL[c] < 3.5) || (x.mine.length === 2 && x.mine[0] === x.mine[1]);
      add('exchange', -1, weak ? 2.6 : 0.6, (rules && rules.exchanger) || 'Ambassador', 'Exchange to improve a weak hand.');
    }
    if (legal.some((l) => l.action === 'examine')) {
      for (const t of targets('examine')) add('examine', t, 0.8, 'Inquisitor', 'Examine to learn a card.');
    }

    // Factions: Convert to get out of the line of fire (whoever can attack you, weighted by what they can afford),
    // Embezzle the Almshouse when you hold no Duke (with a Duke it is a bluff).
    if (rules && rules.factions) {
      const sides = view.players.map((p) => p.side);
      const live = view.players.map((p, i) => (p.alive ? i : -1)).filter((i) => i >= 0);
      const danger = (sd) => {
        const both = new Set(live.map((i) => sd[i])).size > 1;
        let d = 0;
        for (const i of x.opps) {
          if (both && sd[i] === sd[x.me]) continue;
          const c = view.players[i].coins;
          d += c >= 7 ? 3 : c >= 3 ? 1.2 : 0.4;
        }
        return d;
      };
      const d0 = danger(sides);
      for (const t of targets('convert')) {
        const sd = sides.slice(); sd[t] = 1 - sd[t];
        const cost = t === x.me ? 1 : 2;
        const nm = t === x.me ? 'yourself' : view.players[t].name;
        add('convert', t, (d0 - danger(sd)) * (P.smart ? 1.1 : 0.5) - cost * 0.9 + 0.3, null,
          `Convert ${nm} (${cost} coin${cost > 1 ? 's' : ''}): fewer players can attack you.`);
      }
      if (legal.some((l) => l.action === 'embezzle')) {
        const r = view.reserve || 0;
        const dukeBluff = x.mine.includes('Duke');
        if (r > 0) cands.push({ action: 'embezzle', target: -1, score: r * 1.05, claim: null, denies: true, dukeBluff,
          why: dukeBluff ? `Embezzle the Almshouse's ${r}: a bluff, you hold a Duke.` : `Embezzle the Almshouse's ${r}: you hold no Duke, so a challenge only helps you.` });
      }
    }

    if (withCands && coins >= 7) for (const t of targets('coup')) add('coup', t, 6 + threat(x, t) * 0.1, null, `Coup ${view.players[t].name}: it can't be blocked or challenged.`);
    let best = null;
    const scored = [];
    // Embezzling while holding a Duke: the table calls it more often once you have claimed a Duke yourself
    const embezzleCost = () => {
      if (P.bluff <= 0) return 99;
      const r = Math.max(0.1, Math.min(0.85, (x.myClaims.has('Duke') ? 0.55 : 0.15) + (P.risk || 0.1) * x.opps.length));
      return (r * myLossCost(x)) / P.bluff;
    };
    for (const c of cands) {
      const cost = c.denies ? (c.dukeBluff ? embezzleCost() : 0) : claimCost(c.claim);
      if (cost >= 99) continue;
      if (level === 'easy' && c.claim && !x.mine.includes(c.claim) && rnd() > P.bluff) continue;
      if (level === 'easy' && c.dukeBluff && rnd() > P.bluff) continue;
      const s = c.score - cost + (rnd() - 0.5) * P.noise;
      const o = Object.assign({ s, cost }, c);
      scored.push(o);
      if (!best || s > best.s) best = o;
    }
    const bluffNote = best.claim && !x.mine.includes(best.claim) ? ` (a bluff: about ${Math.round(challengeRisk(x, best.claim) * 100)}% you get challenged)` : '';
    const r = { d: { action: best.action, target: best.target }, why: best.why + bluffNote };
    if (withCands) r.cands = scored;
    return r;
  }

  // ----------------------------------------------------------- challenges
  function chooseChallenge(view, pend, level, rnd, rules) {
    const x = ctxOf(view, level, rnd, rules);
    const P = x.P;
    const c = pend.char;
    const q = pend.claimant;
    if (pend.denies) {
      // Embezzle: they claim to hold NO Duke. Catch them with one and they lose a card; if they're honest you do.
      if (x.unseen(c) === 0) return { d: { challenge: false }, why: `Every ${c} is accounted for: they can't hold one.`, pTrue: 1 };
      const pT = 1 - (P.odds === 'none' ? 0.3 : x.has(q, c));
      if (level === 'easy') return { d: { challenge: rnd() < 0.07 }, why: '', pTrue: pT };
      let g = killValue(x, q) + (view.reserve || 0) * 0.5;
      if (x.opps.length > 1) g *= 0.75;
      const ev = (1 - pT) * g - pT * myLossCost(x) * P.caution;
      const pct = Math.round(pT * 100);
      return { d: { challenge: ev > 0 }, why: ev > 0 ? `Only ${pct}% likely they have no Duke. Challenge.` : `${pct}% likely they really have no Duke. Let it go.`, pTrue: pT };
    }
    if (x.unseen(c) === 0) {
      const certain = level !== 'easy' || rnd() < 0.6;
      return { d: { challenge: certain }, why: `Every ${c} is accounted for: it must be a bluff.`, pTrue: 0 };
    }
    let pTrue;
    if (P.odds === 'none') pTrue = 0.7;
    else pTrue = x.has(q, c);

    // what's at stake
    const iAmTarget = pend.target === x.me;
    let gain = killValue(x, q);
    if (pend.about === 'action') {
      if (pend.action === 'assassinate' && iAmTarget) gain += x.mine.includes('Contessa') ? 0 : myLossCost(x);
      else if (pend.action === 'steal' && iAmTarget) gain += 2.5;
      else if (pend.action === 'tax') gain += 1.2;
      else if (pend.action === 'exchange') gain += 0.3;
    } else if (pend.actor === x.me) {
      gain += pend.action === 'assassinate' ? 4 : pend.action === 'steal' ? 2.5 : 1.5;
    }
    if (!iAmTarget && pend.actor !== x.me && x.opps.length > 1) gain *= 0.75;     // someone else might do it
    const cost = myLossCost(x);

    // If I'm being assassinated and hold a Contessa, block instead of challenging.
    const pct0 = Math.round(pTrue * 100);
    if (pend.about === 'action' && pend.action === 'assassinate' && iAmTarget) {
      if (x.mine.includes('Contessa'))
        return { d: { challenge: false }, why: 'Let it come: you can block with your Contessa.', pTrue };
      if (level !== 'easy' && x.hidden <= 1) {
        // Last card either way: challenge only if that beats a bluffed Contessa.
        const r = Math.max(0.15, 0.22 + (3 - x.unseen('Contessa')) * 0.18);
        const yes = pTrue < r;
        return { d: { challenge: yes }, why: yes ? `Only ${pct0}% likely they have it: challenge.` : `${pct0}% likely true: bluffing a Contessa is safer.`, pTrue };
      }
    }

    if (level === 'easy') {
      const yes = rnd() < 0.07;
      return { d: { challenge: yes }, why: '', pTrue };
    }
    let costEff = cost;
    if (pend.about === 'action' && pend.action === 'assassinate' && iAmTarget) { gain = killValue(x, q) + 5; costEff = 9; }
    const ev = (1 - pTrue) * gain - pTrue * costEff * P.caution;
    const yes = ev > 0;
    const pct = Math.round(pTrue * 100);
    const why = yes
      ? `Only ${pct}% likely true. Challenging is worth the risk.`
      : `${pct}% likely true. Losing a card costs more than you'd gain.`;
    return { d: { challenge: yes }, why, pTrue };
  }

  // --------------------------------------------------------------- blocks
  function chooseBlock(view, pend, level, rnd, rules) {
    const x = ctxOf(view, level, rnd, rules);
    const P = x.P;
    const real = pend.chars.find((ch) => x.mine.includes(ch));
    if (real) return { d: { block: real }, why: `You hold a ${real}: block it.` };
    const iAmTarget = pend.target === x.me;

    const risk = (ch) => {
      if (x.unseen(ch) === 0) return 0.97;
      const actorPost = 0.22 + (3 - x.unseen(ch)) * 0.18 - (x.myClaims.has(ch) ? 0.12 : 0);
      return Math.max(0.08, Math.min(0.95, actorPost));
    };
    const pick = pend.chars.slice().sort((a, b) => risk(a) - risk(b))[0];
    const r = risk(pick);

    if (pend.action === 'assassinate' && iAmTarget) {
      if (x.hidden <= 1) {
        const go = level !== 'easy' || rnd() < 0.5;
        return { d: { block: go ? pick : null }, why: 'Last card: a bluffed Contessa is your only way out.' };
      }
      // with 2 cards, a caught bluff loses both
      const ev = (1 - r) * 5 - r * 9;
      const go = level === 'hard' ? ev > 0 : rnd() < 0.2 * P.blockBluff;
      return { d: { block: go ? pick : null }, why: go ? `Bluff a Contessa: about ${Math.round(r * 100)}% you get called.` : 'Take the hit: a caught bluff here costs both cards.' };
    }
    if (pend.action === 'steal' && iAmTarget) {
      const at = Math.min(2, view.players[x.me].coins);
      if (at === 0) return { d: { block: null }, why: 'Nothing to steal.' };
      const ev = (1 - r) * at * 1.7 - r * myLossCost(x);
      const go = level === 'hard' ? ev > 0 : level === 'medium' ? rnd() < 0.15 : rnd() < 0.03;
      return { d: { block: go ? pick : null }, why: go ? `Bluff a ${pick} block: about ${Math.round(r * 100)}% you get called.` : 'Let the steal go.' };
    }
    if (pend.action === 'foreign_aid') {
      const actor = view.players[pend.actor];
      const big = actor.coins + 2 >= 7;
      const go = level === 'hard' ? big && r < 0.3 && x.hidden === 2 : level === 'medium' ? rnd() < 0.05 : false;
      return { d: { block: go ? 'Duke' : null }, why: go ? 'Bluff a Duke to keep them under 7.' : 'Let it go.' };
    }
    return { d: { block: null }, why: 'Let it go.' };
  }

  // ---------------------------------------------------- losing / exchanging
  function cardScore(x, c, others) {
    let v = VAL[c] || 3;
    if (c === 'Contessa' && x.opps.some((i) => x.view.players[i].coins >= 3)) v += 0.6;
    if (others.includes(c)) v -= 1.6;   // a duplicate is worth less
    return v;
  }
  function chooseLose(view, pend, level, rnd, rules) {
    const x = ctxOf(view, level, rnd, rules);
    const idxs = view.myCards.map((c, i) => (c.dead ? -1 : i)).filter((i) => i >= 0);
    if (level === 'easy') return { d: { card: idxs[Math.floor(rnd() * idxs.length)] }, why: '' };
    let best = idxs[0], bv = Infinity;
    for (const i of idxs) {
      const rest = idxs.filter((j) => j !== i).map((j) => view.myCards[j].c);
      const keepVal = rest.reduce((s, c) => s + cardScore(x, c, []), 0);
      const v = -keepVal;
      if (v < bv) { bv = v; best = i; }
    }
    return { d: { card: best }, why: `Give up the ${view.myCards[best].c}: the other card is more useful.` };
  }
  function chooseExchange(view, pend, level, rnd, rules) {
    const x = ctxOf(view, level, rnd, rules);
    const opts = pend.options;
    const k = pend.keep;
    const combos = [];
    (function rec(start, cur) {
      if (cur.length === k) { combos.push(cur.slice()); return; }
      for (let i = start; i < opts.length; i++) { cur.push(i); rec(i + 1, cur); cur.pop(); }
    })(0, []);
    if (level === 'easy') return { d: { keep: combos[Math.floor(rnd() * combos.length)] }, why: '' };
    let best = combos[0], bv = -Infinity;
    for (const cmb of combos) {
      let v = 0;
      cmb.forEach((i, j) => { v += cardScore(x, opts[i], cmb.slice(0, j).map((t) => opts[t])); });
      if (v > bv) { bv = v; best = cmb; }
    }
    return { d: { keep: best }, why: 'Keep: ' + best.map((i) => opts[i]).join(' + ') + '.' };
  }

  // ------------------------------------------------------- Hard: look ahead
  // Hard plays each choice out many times before it commits. Each time it deals the cards it can't see
  // at random, weighted by the same odds model (what everyone has claimed, blocked or been caught
  // bluffing), then plays the game to the end with every player (itself too) using Medium's habits.
  // The choice that wins most often is played. It still sees only its own view.
  const Eng = root.CoupEngine || (typeof require !== 'undefined' ? require('./engine.js') : null);
  const SEARCH = { worlds: 8, maxCands: 5, depth: 4, rollout: 'medium', prior: 0, budgetMs: 600 };
  function sampleHands(view, rnd, rules, postIn) {
    const CH = (rules && rules.chars) || (view.rules && view.rules.chars) || ['Duke', 'Assassin', 'Captain', 'Ambassador', 'Contessa'];
    const per = (rules && rules.perChar) || 3;
    const pool = {};
    CH.forEach((c) => (pool[c] = per));
    const take = (c) => { if (pool[c] > 0) pool[c]--; };
    view.myCards.forEach((cd) => { if (!cd.dead) take(cd.c); });
    view.players.forEach((pl) => pl.dead.forEach(take));
    (view.knownDeck || []).forEach(take);
    const pool0 = Object.assign({}, pool);
    const post = postIn || Odds.posterior(view, { bluff: 0.3, chars: CH, stealBlockers: rules && rules.stealBlockers, perChar: per });
    const opp = view.players.map((p, i) => i).filter((i) => i !== view.me && view.players[i].hidden > 0);
    for (let k = opp.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); const t = opp[k]; opp[k] = opp[j]; opp[j] = t; }
    const hands = {};
    for (const i of opp) {
      const dist = post[i] && post[i].hand ? post[i].hand : null;
      let pick = null;
      if (dist) {
        // weight each possible hand by its odds and by how many ways the cards still left can make it
        const ws = dist.map((d) => {
          let w = d.p;
          d.counts.forEach((x, t) => { if (x) { const b = Odds.binom(pool0[CH[t]], x); w = b ? w * Odds.binom(pool[CH[t]], x) / b : 0; } });
          return w;
        });
        const Z = ws.reduce((a, b) => a + b, 0);
        if (Z > 0) {
          let r = rnd() * Z, k = 0;
          while (k < ws.length - 1 && (r -= ws[k]) > 0) k++;
          pick = [];
          dist[k].counts.forEach((x, t) => { for (let m = 0; m < x; m++) pick.push(CH[t]); });
        }
      }
      if (!pick) {
        // fall back to plain card counting
        pick = [];
        for (let m = 0; m < view.players[i].hidden; m++) {
          const bag = []; CH.forEach((c) => { for (let q = 0; q < pool[c]; q++) bag.push(c); });
          if (!bag.length) break;
          const c = bag[Math.floor(rnd() * bag.length)]; pool[c]--; pick.push(c);
        }
        hands[i] = pick; continue;
      }
      pick.forEach((c) => pool[c]--);
      hands[i] = pick;
    }
    const rest = [];
    CH.forEach((c) => { for (let q = 0; q < pool[c]; q++) rest.push(c); });
    return { hands, rest };
  }
  // A full game state that matches what `view` shows, with the hidden cards dealt by sampleHands.
  function worldFrom(view, rnd, rules, post) {
    const { hands, rest } = sampleHands(view, rnd, rules, post);
    for (let k = rest.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); const t = rest[k]; rest[k] = rest[j]; rest[j] = t; }
    // view.knownDeck also holds the cards I set aside in the 2-player deal (view.knownOut): those are out, not in the deck
    const known = (view.knownDeck || []).slice();
    for (const c of view.knownOut || []) { const k = known.indexOf(c); if (k >= 0) known.splice(k, 1); }
    const deckN = Math.max(0, view.deckSize - known.length);
    const deck = rest.slice(0, deckN).concat(known);
    for (let k = deck.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); const t = deck[k]; deck[k] = deck[j]; deck[j] = t; }
    const out = rest.slice(deckN).concat(view.knownOut || []);
    const lastTurn = view.events.length ? view.events[view.events.length - 1].turnNo || 0 : 0;
    const s = {
      n: view.players.length, rs: (rnd() * 4294967296) >>> 0 || 1, turn: view.turn, turnNo: lastTurn, rules: view.rules || Eng.ruleSet(rules),
      players: view.players.map((pl, i) => {
        const dead = pl.dead.map((c) => ({ c, dead: true }));
        const live = i === view.me ? view.myCards.filter((c) => !c.dead).map((c) => ({ c: c.c, dead: false })) : (hands[i] || []).map((c) => ({ c, dead: false }));
        return { name: pl.name, coins: pl.coins, side: pl.side, cards: i === view.me ? view.myCards.map((c) => ({ c: c.c, dead: c.dead })) : live.concat(dead), knownDeck: i === view.me ? known.slice() : [], knownOut: [], peeks: i === view.me ? (view.peeks || []).slice() : [] };
      }),
      deck, out, events: view.events.slice(), loseQueue: [], ctx: null, pending: null, winner: -1, reserve: view.reserve || 0,
    };
    return s;
  }
  function cloneWorld(s) {
    return {
      n: s.n, rs: s.rs, turn: s.turn, turnNo: s.turnNo, rules: s.rules,
      players: s.players.map((pl) => ({ name: pl.name, coins: pl.coins, side: pl.side, cards: pl.cards.map((c) => ({ c: c.c, dead: c.dead })), knownDeck: pl.knownDeck.slice(), knownOut: [], peeks: pl.peeks.slice() })),
      deck: s.deck.slice(), out: s.out.slice(), events: s.events.slice(), loseQueue: [], ctx: null, pending: null, winner: -1, reserve: s.reserve || 0,
    };
  }
  // A cut-off game: each player's chance from cards in hand and coins (a card is worth about 7 coins).
  function guessShare(s, me) {
    let tot = 0, mine = 0;
    s.players.forEach((pl, i) => {
      const h = pl.cards.filter((c) => !c.dead).length;
      if (!h) return;
      const v = Math.pow(h * 7 + Math.min(pl.coins, 9), 2);
      tot += v; if (i === me) mine = v;
    });
    return tot ? mine / tot : 0;
  }
  // Play to the end with Medium's habits for everyone; 1 if `me` wins (a share if the game runs long).
  function rollout(s, me, rnd) {
    let steps = 0;
    const stop = SEARCH.depth ? s.turnNo + SEARCH.depth : Infinity;
    while (s.pending && steps++ < 400) {
      if (s.turnNo > stop && s.pending.kind === 'action') return guessShare(s, me);
      const pd = s.pending;
      const v = Eng.viewFor(s, pd.p);
      const r = decide(v, pd, SEARCH.rollout, rnd, pd.kind === 'action' ? Eng.legalActions(s, pd.p) : null, s.rules);
      Eng.act(s, r.d);
    }
    if (s.winner === me) return 1;
    if (s.winner >= 0) return 0;
    const alive = s.players.filter((p) => p.cards.some((c) => !c.dead)).length;
    return s.players[me].cards.some((c) => !c.dead) ? 1 / alive : 0;
  }
  // Pick the best of `cands` (decisions for my pending action) by playing each out in the same sampled worlds.
  function searchAction(view, legal, rnd, rules, cands) {
    const me = view.me;
    const tot = cands.map(() => 0);
    const CH = (rules && rules.chars) || (view.rules && view.rules.chars);
    const post = Odds.posterior(view, { bluff: 0.3, chars: CH, stealBlockers: rules && rules.stealBlockers, perChar: (rules && rules.perChar) || 3 });
    const t0 = Date.now();
    let W = 0;
    for (let w = 0; w < SEARCH.worlds; w++) {
      if (w >= 3 && Date.now() - t0 > SEARCH.budgetMs) break;   // a slow phone: stop early rather than freeze the page
      W++;
      const base = worldFrom(view, rnd, rules, post);
      const seed = (rnd() * 4294967296) >>> 0;
      cands.forEach((d, k) => {
        const s = cloneWorld(base);
        s.rs = base.rs;
        s.ctx = { actor: me, action: null, target: -1, stage: 'declare', order: [], oi: 0, blocker: -1, blockChar: null, failed: false };
        s.pending = { kind: 'action', p: me, mustCoup: s.players[me].coins >= 10 };
        let a = seed;
        const r2 = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
        try { Eng.act(s, d); tot[k] += rollout(s, me, r2); } catch (e) { tot[k] -= 99; }
      });
    }
    const avg = tot.map((v, k) => v / W + (k === 0 ? SEARCH.prior : 0));   // cands[0] is the rule-of-thumb pick
    let bi = 0;
    avg.forEach((v, k) => { if (v > avg[bi]) bi = k; });
    return { k: bi, win: Math.min(1, tot[bi] / W), all: avg };
  }
  function hardAction(view, legal, rnd, rules) {
    const base = chooseAction(view, legal, 'hard', rnd, rules, true);
    if (!Eng || !base.cands || legal.length <= 1) return base;
    // the heuristic's best few choices (always including the safe Income and its own pick)
    const ranked = base.cands.slice().sort((a, b) => b.s - a.s);
    const pickSet = [];
    const keyOf = (c) => c.action + ':' + c.target;
    for (const c of ranked) { if (pickSet.length >= SEARCH.maxCands) break; if (!pickSet.some((p) => keyOf(p) === keyOf(c))) pickSet.push(c); }
    for (const l of legal) if (l.action === 'coup' && !pickSet.some((p) => keyOf(p) === keyOf(l))) { const t = ranked.find((c) => c.action === 'coup' && c.target === l.target); pickSet.push(t || Object.assign({ why: `Coup ${view.players[l.target].name}: it can't be blocked or challenged.` }, l)); }
    if (!pickSet.some((p) => p.action === 'income')) { const inc = ranked.find((c) => c.action === 'income'); if (inc) pickSet.push(inc); }
    if (pickSet.length <= 1) return base;
    const r = searchAction(view, legal, rnd, rules, pickSet.map((c) => ({ action: c.action, target: c.target })));
    const best = pickSet[r.k];
    const mine = view.myCards.filter((c) => !c.dead).map((c) => c.c);
    const bluff = (best.claim && !mine.includes(best.claim)) || (best.denies && mine.includes('Duke'));
    const why = (best.why || NAME[best.action]) + (bluff ? ' (a bluff)' : '') + ` Played out, it wins about ${Math.round(r.win * 100)}% of the time.`;
    return { d: { action: best.action, target: best.target }, why };
  }

  function decide(view, pend, level, rnd, legal, rules) {
    rnd = rnd || Math.random;
    switch (pend.kind) {
      case 'action': return level === 'hard' && SEARCH.worlds > 0 ? hardAction(view, legal, rnd, rules) : chooseAction(view, legal, level, rnd, rules);
      case 'challenge': return chooseChallenge(view, pend, level, rnd, rules);
      case 'block': return chooseBlock(view, pend, level, rnd, rules);
      case 'lose': return chooseLose(view, pend, level, rnd, rules);
      case 'exchange': return chooseExchange(view, pend, level, rnd, rules);
      case 'pick': {
        if (level === 'easy') return { d: { keep: [Math.floor(rnd() * pend.options.length)] }, why: '' };
        let bi = 0;
        pend.options.forEach((c, i) => { if ((VAL[c] || 3) > (VAL[pend.options[bi]] || 3)) bi = i; });
        return { d: { keep: [bi] }, why: `Keep the ${pend.options[bi]}: the most useful card.` };
      }
      case 'show': {
        const idxs = view.myCards.map((c, i) => (c.dead ? -1 : i)).filter((i) => i >= 0);
        if (level === 'easy') return { d: { card: idxs[Math.floor(rnd() * idxs.length)] }, why: '' };
        let w = idxs[0];
        for (const i of idxs) if ((VAL[view.myCards[i].c] || 3) < (VAL[view.myCards[w].c] || 3)) w = i;
        return { d: { card: w }, why: `Show the ${view.myCards[w].c}: if they make you swap it, you lose little.` };
      }
      case 'examine': {
        const strong = (VAL[pend.char] || 3) >= 4;
        const force = level === 'easy' ? rnd() < 0.5 : strong;
        return { d: { force }, why: force ? `Make them swap the ${pend.char}: it's a strong card.` : `Let them keep the ${pend.char}: now you know it.` };
      }
      default:
        if (root.CoupAIExtra && root.CoupAIExtra[pend.kind]) return root.CoupAIExtra[pend.kind](view, pend, level, rnd, rules);
        throw new Error('AI cannot handle ' + pend.kind);
    }
  }

  const api = { decide, SEARCH, worldFrom, PARAMS, VAL, NAME, chooseAction, chooseChallenge, chooseBlock, chooseLose, chooseExchange };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CoupAI = api;
})(typeof self !== 'undefined' ? self : this);
