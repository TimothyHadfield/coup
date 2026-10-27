/* ============================================================================
 * odds.js: "how likely is that claim true?" from one player's point of view.
 *
 * Model (all pure functions, no DOM):
 *  1. Card counting. Every card I can't see (not in my hand, not face up,
 *     not one I put back in the deck myself) is equally likely to be in any
 *     unseen spot: an opponent's hand or the deck.
 *  2. Evidence. What each player has said and done since their hand last
 *     changed tilts those odds, Bayes-style:
 *       - claiming a character: x1 if they hold it, x(bluff rate) if not
 *       - caught bluffing:      they certainly don't hold it
 *       - not blocking an assassination: holding a Contessa is unlikely (x0.15)
 *       - not blocking a steal:  x0.35 if they hold a blocker
 *       - not blocking foreign aid: x0.6 if they hold a Duke
 *     A card shown and shuffled away, a card lost, or an Exchange wipes the
 *     evidence it explains.
 *  3. Exact sum over every way the unseen cards could be split between the
 *     opponents (dynamic programming over the remaining-pool counts).
 * ==========================================================================*/
(function (root) {
  'use strict';

  const DEFAULT_CHARS = ['Duke', 'Assassin', 'Captain', 'Ambassador', 'Contessa'];
  const NOBLOCK = { assassinate: 0.15, steal: 0.35, foreign_aid: 0.6 };

  function binom(n, k) {
    if (k < 0 || n < 0 || k > n) return 0;
    let r = 1;
    for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
    return Math.round(r);
  }

  // All multisets of size k over T types, as count vectors.
  const _hands = {};
  function handsOf(T, k) {
    const key = T + ':' + k;
    if (_hands[key]) return _hands[key];
    const out = [];
    (function rec(t, left, cur) {
      if (t === T - 1) { cur[t] = left; out.push(cur.slice()); return; }
      for (let x = left; x >= 0; x--) { cur[t] = x; rec(t + 1, left - x, cur); }
    })(0, k, new Array(T).fill(0));
    _hands[key] = out;
    return out;
  }

  // Evidence per player from the public event list.
  function buildEvidence(events, n, opts) {
    const bOf = (p) => (opts.bluffBy && opts.bluffBy[p] != null ? opts.bluffBy[p] : opts.bluff);
    const blockers = opts.stealBlockers || ['Captain', 'Ambassador'];
    const E = [];
    for (let i = 0; i < n; i++) E.push([]);
    const dropPositive = (p, ch) => { E[p] = E[p].filter((it) => !(it.lh > it.ln && it.chars.includes(ch))); };
    for (const e of events) {
      switch (e.t) {
        case 'action':
          if (e.claim) E[e.p].push({ chars: [e.claim], lh: 1, ln: bOf(e.p) });
          break;
        case 'block':
          E[e.p].push({ chars: [e.char], lh: 1, ln: bOf(e.p) });
          break;
        case 'challenge':
          if (e.truth) dropPositive(e.of, e.char);
          else { dropPositive(e.of, e.char); E[e.of].push({ chars: [e.char], lh: 0, ln: 1 }); }
          break;
        case 'noblock': {
          const w = NOBLOCK[e.action];
          if (w == null) break;
          const chars = e.action === 'assassinate' ? ['Contessa'] : e.action === 'steal' ? blockers : ['Duke'];
          E[e.p].push({ chars, lh: w, ln: 1 });
          break;
        }
        case 'lose':
          dropPositive(e.p, e.char);
          break;
        case 'exchange':
        case 'forced':        // Inquisitor made them swap a card
          E[e.p] = [];
          break;
      }
    }
    return E;
  }

  /**
   * Posterior for every opponent, seen by `view.me`.
   * view: { me, players:[{hidden, dead:[chars], alive}], myCards:[{c,dead}], knownDeck:[chars], events }
   * opts: { bluff=0.3, chars, useEvidence=true }
   * Returns per player i: null for me / dead players, else
   *   { has: {Duke: P(holds at least one)...}, hand: [{counts, p}] }
   */
  function posterior(view, opts) {
    const given = {};
    for (const k in opts || {}) if (opts[k] !== undefined) given[k] = opts[k];
    const vr = view.rules || {};
    opts = Object.assign({ bluff: 0.3, useEvidence: true, chars: vr.chars || DEFAULT_CHARS, stealBlockers: vr.stealBlockers }, given);
    const CH = opts.chars;
    const T = CH.length;
    const perChar = opts.perChar || 3;
    const pool = new Array(T).fill(perChar);
    const take = (c) => { const t = CH.indexOf(c); if (t >= 0) pool[t]--; };
    for (const cd of view.myCards) if (!cd.dead) take(cd.c);
    view.players.forEach((pl) => pl.dead.forEach(take));
    for (const c of view.knownDeck || []) take(c);
    for (let t = 0; t < T; t++) if (pool[t] < 0) pool[t] = 0;

    const E = opts.useEvidence
      ? buildEvidence(view.events || [], view.players.length, { bluff: opts.bluff, bluffBy: opts.bluffBy, stealBlockers: opts.stealBlockers })
      : view.players.map(() => []);
    // cards I have examined with an Inquisitor are certain
    for (const pk of view.peeks || []) if (E[pk.p]) E[pk.p].push({ chars: [pk.char], lh: 1, ln: 0 });

    const opp = [];
    view.players.forEach((pl, i) => { if (i !== view.me && pl.hidden > 0) opp.push(i); });

    // Pools and hands are coded as base-(perChar+1) integers so the dynamic
    // programme runs on flat arrays (6 players stays well under a few ms).
    const BASE = perChar + 1;
    const PW = [];
    for (let t = 0, m = 1; t < T; t++, m *= BASE) PW.push(m);
    const SIZE = PW[T - 1] * BASE;
    const code = (v) => v.reduce((s, x, t) => s + x * PW[t], 0);
    const digit = (cd, t) => Math.floor(cd / PW[t]) % BASE;

    // per player: every hand they could hold, with its likelihood
    const handInfo = {};
    for (const i of opp) {
      handInfo[i] = handsOf(T, view.players[i].hidden).map((h) => {
        let w = 1;
        for (const it of E[i]) {
          const holds = it.chars.some((c) => { const t = CH.indexOf(c); return t >= 0 && h[t] > 0; });
          w *= holds ? it.lh : it.ln;
        }
        return { h, code: code(h), lik: w };
      }).filter((x) => x.lik > 0);
    }
    function ways(h, pc) {
      let w = 1;
      for (let t = 0; t < T; t++) {
        if (!h[t]) continue;
        const have = digit(pc, t);
        if (h[t] > have) return 0;
        w *= binom(have, h[t]);
      }
      return w;
    }

    const poolCode = code(pool);
    const out = view.players.map(() => null);
    for (const target of opp) {
      if (opts.only && !opts.only.includes(target)) continue;   // the caller needs just these players
      const others = opp.filter((i) => i !== target);
      const memo = new Float64Array(Math.max(1, others.length) * SIZE).fill(-1);
      // G(j, pool): weighted count of ways to fill others[j..] from pool
      function G(j, pc) {
        if (j === others.length) return 1;
        const key = j * SIZE + pc;
        if (memo[key] >= 0) return memo[key];
        let sum = 0;
        for (const hi of handInfo[others[j]]) {
          const w = ways(hi.h, pc);
          if (!w) continue;
          sum += w * hi.lik * G(j + 1, pc - hi.code);
        }
        memo[key] = sum;
        return sum;
      }
      const dist = [];
      let Z = 0;
      for (const hi of handInfo[target]) {
        const h = hi.h;
        const w = ways(h, poolCode);
        if (!w) continue;
        const v = w * hi.lik * G(0, poolCode - hi.code);
        if (v > 0) { dist.push({ counts: h, p: v }); Z += v; }
      }
      if (Z === 0) {
        if (!opts.useEvidence) { out[target] = null; continue; }   // impossible card count
        // evidence contradicts itself (e.g. odd table entries): fall back to plain counting
        const plain = posterior(view, Object.assign({}, opts, { useEvidence: false }));
        out[target] = plain[target];
        continue;
      }
      const has = {};
      CH.forEach((c) => (has[c] = 0));
      for (const d of dist) {
        d.p /= Z;
        d.counts.forEach((x, t) => { if (x > 0) has[CH[t]] += d.p; });
      }
      out[target] = { has, hand: dist };
    }
    return out;
  }

  // Chance player p really has `char` (the claim just made is already in view.events).
  function claimTrue(view, p, char, opts) {
    const post = posterior(view, opts);
    return post[p] ? post[p].has[char] : NaN;
  }

  // How many copies of `char` I can't account for (0 means a claim is surely a bluff).
  function unseenCopies(view, char, perChar) {
    let k = perChar || 3;
    for (const cd of view.myCards) if (!cd.dead && cd.c === char) k--;
    view.players.forEach((pl) => pl.dead.forEach((c) => { if (c === char) k--; }));
    for (const c of view.knownDeck || []) if (c === char) k--;
    return Math.max(0, k);
  }

  // Each player's bluffing habit, learned from this game's challenges:
  // starts at `prior` and moves toward what the challenges showed.
  function learnBluff(events, n, prior, weight) {
    prior = prior == null ? 0.2 : prior;
    weight = weight == null ? 4 : weight;
    const caught = new Array(n).fill(0), tested = new Array(n).fill(0);
    for (const e of events) if (e.t === 'challenge') { tested[e.of]++; if (!e.truth) caught[e.of]++; }
    return caught.map((c, i) => (prior * weight + c) / (weight + tested[i]));
  }

  const api = { learnBluff, binom, handsOf, buildEvidence, posterior, claimTrue, unseenCopies, NOBLOCK };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CoupOdds = api;
})(typeof self !== 'undefined' ? self : this);
