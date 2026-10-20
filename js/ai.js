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
  const VAL = { Duke: 5, Captain: 4, Assassin: 4.2, Contessa: 3.4, Ambassador: 2.6, Inquisitor: 3 };
  const NAME = { income: 'Income', foreign_aid: 'Foreign aid', tax: 'Tax', steal: 'Steal', assassinate: 'Assassinate', exchange: 'Exchange', coup: 'Coup', examine: 'Examine' };

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
      const bluffBy = P.learn ? Odds.learnBluff(view.events, view.players.length, 0.2) : undefined;
      _post = Odds.posterior(view, { useEvidence: P.odds === 'full', bluff: 0.3, bluffBy, chars, stealBlockers });
      return _post;
    };
    // P(player i holds char), with a sensible fallback for Easy
    const has = (i, c) => {
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
  function chooseAction(view, legal, level, rnd, rules) {
    const x = ctxOf(view, level, rnd, rules);
    const P = x.P;
    const coins = x.coins;
    const targets = (a) => legal.filter((l) => l.action === a).map((l) => l.target);
    const bestBy = (list, f) => list.reduce((b, t) => (b == null || f(t) > f(b) ? t : b), null);

    if (legal.every((l) => l.action === 'coup')) {
      const t = P.smart ? bestBy(targets('coup'), (i) => threat(x, i)) : targets('coup')[Math.floor(rnd() * targets('coup').length)];
      return { d: { action: 'coup', target: t }, why: 'You have 10+ coins, so you must Coup.' };
    }
    if (coins >= 7 && (level !== 'easy' || rnd() < 0.7)) {
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

    let best = null;
    for (const c of cands) {
      const cost = claimCost(c.claim);
      if (cost >= 99) continue;
      if (level === 'easy' && c.claim && !x.mine.includes(c.claim) && rnd() > P.bluff) continue;
      const s = c.score - cost + (rnd() - 0.5) * P.noise;
      if (!best || s > best.s) best = Object.assign({ s, cost }, c);
    }
    const bluffNote = best.claim && !x.mine.includes(best.claim) ? ` (a bluff: about ${Math.round(challengeRisk(x, best.claim) * 100)}% you get challenged)` : '';
    return { d: { action: best.action, target: best.target }, why: best.why + bluffNote };
  }

  // ----------------------------------------------------------- challenges
  function chooseChallenge(view, pend, level, rnd, rules) {
    const x = ctxOf(view, level, rnd, rules);
    const P = x.P;
    const c = pend.char;
    const q = pend.claimant;
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

  function decide(view, pend, level, rnd, legal, rules) {
    rnd = rnd || Math.random;
    switch (pend.kind) {
      case 'action': return chooseAction(view, legal, level, rnd, rules);
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

  const api = { decide, PARAMS, VAL, NAME, chooseAction, chooseChallenge, chooseBlock, chooseLose, chooseExchange };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CoupAI = api;
})(typeof self !== 'undefined' ? self : this);
