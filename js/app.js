/* ============================================================================
 * app.js: the screens. One IIFE, one saved store, full redraw per panel,
 * event delegation on data-* attributes (no inline handlers).
 *   Play     - you vs 1-5 computers (Easy/Medium/Hard), odds on every claim,
 *              Hint, and a Review after the game (study mode).
 *   Table    - real-table companion: record each turn, same odds.
 *   Learn    - characters, rules, how the odds work, measured data.
 *   Settings - speed, variants, odds model, stats.
 * ==========================================================================*/
(function () {
  'use strict';
  const E = window.CoupEngine, O = window.CoupOdds, AI = window.CoupAI, T = window.CoupTable;
  const Art = window.CoupArt || null;
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const KEY = 'coup:v1';
  const BOT_NAMES = ['Ava', 'Ben', 'Cleo', 'Dax', 'Esme'];
  const FALLBACK_COLORS = { Duke: '#9b6bd6', Assassin: '#4a4f5c', Captain: '#4f8fe0', Ambassador: '#48b07a', Contessa: '#d9534f', Inquisitor: '#3fa3a8' };
  const COLORS = (Art && Art.COLORS) || FALLBACK_COLORS;
  const SPEED = { slow: 1500, normal: 850, fast: 380 };
  const VERB = { income: 'takes Income', foreign_aid: 'takes Foreign aid', tax: 'takes Tax', steal: 'steals from', assassinate: 'assassinates', exchange: 'exchanges', examine: 'examines', coup: 'launches a Coup on' };
  const WHAT = { tax: 'to take 3 coins', steal: 'to steal 2 coins', assassinate: 'to kill a card', exchange: 'to swap cards', examine: 'to look at a card' };

  // ------------------------------------------------------------------ store
  const DEFAULTS = {
    settings: { speed: 'normal', showOdds: true, peek: false, inquisitor: false, twoDeal: false, bluff: 0.3, opps: 3, level: 'medium' },
    stats: { easy: { g: 0, w: 0 }, medium: { g: 0, w: 0 }, hard: { g: 0, w: 0 } },
    game: null, lastWinner: null, table: null, tableArchive: [], tab: 'play',
  };
  let store = load();
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const o = JSON.parse(raw);
        return Object.assign({}, DEFAULTS, o, { settings: Object.assign({}, DEFAULTS.settings, o.settings || {}), stats: Object.assign({}, DEFAULTS.stats, o.stats || {}) });
      }
    } catch (e) { /* private mode or bad data: start fresh */ }
    return JSON.parse(JSON.stringify(DEFAULTS));
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* storage full or blocked */ } }
  const S = () => store.settings;

  // ------------------------------------------------------------------ art
  function cardSVG(ch, small) {
    if (Art && ch) return Art.card(ch, { small });
    if (Art && !ch) return Art.back();
    if (!ch) return '<div class="fallback-card" style="background:repeating-linear-gradient(45deg,#2b3550 0 5px,#232c44 5px 10px)"></div>';
    return `<div class="fallback-card" style="background:${COLORS[ch]}">${small ? ch[0] : ch}</div>`;
  }
  // A card that can flip. ch=null means we only know the back.
  function cardEl(ch, o) {
    o = o || {};
    const cls = ['cardf'];
    if (o.size) cls.push(o.size);
    if (ch && !o.flip) cls.push('up');
    if (o.dead) cls.push('dead');
    if (o.pick) cls.push('pickable');
    if (o.chosen) cls.push('chosen');
    const small = o.size === 'sm';
    const data = o.data ? Object.entries(o.data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('') : '';
    return `<div class="${cls.join(' ')}"${data}${o.flip ? ' data-flip="1"' : ''} role="${o.pick ? 'button' : 'img'}" aria-label="${esc(ch || 'hidden card')}">` +
      `<div class="in"><div class="back">${cardSVG(null)}</div><div class="face">${ch ? cardSVG(ch, small) : ''}</div></div></div>`;
  }
  const coin = (n) => `<span class="coin"><i></i>${n}</span>`;
  // red (unlikely) -> green (likely)
  function scale(p) {
    const h = Math.round(Math.max(0, Math.min(1, p)) * 125);
    return `hsl(${h} 70% 62%)`;
  }
  const pctTxt = (p) => (p == null || isNaN(p) ? '—' : Math.round(p * 100) + '%');

  // ------------------------------------------------------------------ tabs
  function setTab(t) {
    store.tab = t; save();
    document.querySelectorAll('nav.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    document.querySelectorAll('main .tab').forEach((s) => s.classList.toggle('active', s.id === 'tab-' + t));
    render();
  }
  function render() {
    const t = store.tab;
    if (t === 'play') renderPlay();
    else if (t === 'table') renderTable();
    else if (t === 'learn') renderLearn();
    else renderSettings();
  }

  // ------------------------------------------------------------------ overlay
  function sheet(html, onClick) {
    const ov = $('#overlay');
    ov.innerHTML = `<div class="sheet-back" data-close="1"><div class="sheet" role="dialog">${html}</div></div>`;
    ov.onclick = (e) => {
      if (e.target.dataset && e.target.dataset.close) { closeSheet(); return; }
      const b = e.target.closest('[data-s]');
      if (b && onClick) onClick(b.dataset.s, b, e);
    };
  }
  function closeSheet() { $('#overlay').innerHTML = ''; $('#overlay').onclick = null; }
  function confirmBox(title, body, okLabel, onOk) {
    sheet(`<h3>${esc(title)}</h3><div class="body"><p class="muted">${esc(body)}</p></div>
      <div class="foot"><button class="btn" data-s="no">Cancel</button><button class="btn danger" data-s="yes">${esc(okLabel)}</button></div>`,
    (k) => { closeSheet(); if (k === 'yes') onOk(); });
  }
  let toastTimer = 0;
  function toast(msg) {
    let el = $('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
    el.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.remove(), 2200);
  }
  function help(text) {
    sheet(`<h3>Why? <button class="btn small ghost" data-s="x">Close</button></h3><div class="body"><p class="muted" style="margin:0">${esc(text)}</p></div>`, () => closeSheet());
  }

  // ======================================================================
  //   PLAY (vs computer)
  // ======================================================================
  let G = null;        // live game wrapper (also saved in store.game; online games are not saved)
  let ME = 0;          // my seat: always 0 against computers, the room's seat online
  let GEN = 0;         // bumps on every new game / quit, so old timers stop
  const says = {};     // speech bubbles: p -> {text, until}
  let hint = null;     // {key, d, why}
  let selAction = null;
  let shownDead = new Set();
  let strength = null; // data/stats.json once loaded

  function newGame() {
    GEN++;
    const st = S();
    const n = 1 + Math.max(1, Math.min(5, st.opps));
    const names = ['You'].concat(BOT_NAMES.slice(0, n - 1));
    const rules = { inquisitor: st.inquisitor, twoPlayerDeal: st.twoDeal && n === 2 };
    const first = store.lastWinner != null && store.lastWinner < n ? store.lastWinner : -1;   // last game's winner starts
    const s = E.newGame({ names, seed: (Math.random() * 2 ** 31) >>> 0, rules, first });
    G = { s, level: st.level, calls: [], over: false, counted: false };
    store.game = G;
    shownDead = new Set();
    hint = null; selAction = null;
    for (const k in says) delete says[k];
    save();
    renderPlay();
    run(GEN);
  }
  function quitGame() {
    GEN++;
    G = null; store.game = null; save();
    closeSheet();
    renderPlay();
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const isHuman = (p) => p === ME && !(G && G.online && G.sent);

  async function run(gen) {
    while (G && gen === GEN) {
      const s = G.s;
      const pd = s.pending;
      if (!pd) { finish(); return; }
      if (isHuman(pd.p)) {
        renderPlay();
        if (pd.kind === 'exchange' || pd.kind === 'pick') openExchange();
        return;
      }
      await sleep(pd.kind === 'action' ? SPEED[S().speed] * 0.5 : 60);
      if (!G || gen !== GEN) return;
      const view = E.view(s, pd.p);
      const legal = pd.kind === 'action' ? E.legalActions(s, pd.p) : null;
      const r = AI.decide(view, pd, G.level, Math.random, legal, s.rules);
      step(r.d);
      const shown = lastVisible;
      renderPlay();
      if (shown) await sleep(SPEED[S().speed]);
    }
  }
  let lastVisible = false;
  function step(d) {
    const s = G.s;
    const before = s.events.length;
    E.act(s, d);
    noteEvents(s.events.slice(before));
    save();
  }
  // speech bubbles for what just happened
  function noteEvents(evs) {
    lastVisible = false;
    const now = Date.now();
    for (const e of evs) {
      let txt = null, p = e.p;
      if (e.t === 'action') txt = E.ACTIONS[e.action].label + (e.claim ? ` (${e.claim})` : '');
      else if (e.t === 'block') txt = 'Block: ' + e.char;
      else if (e.t === 'challenge') { txt = 'Challenge!'; p = e.by; }
      else if (e.t === 'prove') txt = 'Shows ' + e.char;
      else if (e.t === 'lose') txt = 'Loses ' + e.char;
      if (txt && p !== ME) { says[p] = { text: txt, until: now + SPEED[S().speed] * 1.8 }; }
      if (txt) lastVisible = true;
    }
    hint = null;
    save();
  }
  function human(d) {
    if (!G || !G.s.pending || !isHuman(G.s.pending.p)) return;
    const s = G.s;
    const pd = s.pending;
    if (pd.kind === 'challenge') {
      // remember the call for the Review, with the odds we showed
      let ei = s.events.length - 1;
      while (ei >= 0 && !(s.events[ei].t === 'action' || s.events[ei].t === 'block')) ei--;
      G.calls.push({ ei, p: pd.claimant, char: pd.char, about: pd.about, action: pd.action, pTrue: claimOddsNow(), challenged: !!d.challenge, turnNo: s.turnNo });
    }
    selAction = null;
    if (G.online) { netAct(d); return; }
    try { step(d); } catch (e) { toast('That move is not allowed.'); return; }
    renderPlay();
    run(GEN);
  }
  function finish() {
    if (!G.over) {
      G.over = true;
      if (!G.counted) {
        G.counted = true;
        const st = store.stats[G.level] || (store.stats[G.level] = { g: 0, w: 0 });
        st.g++; if (G.s.winner === ME) st.w++;
        store.lastWinner = G.s.winner;
      }
      save();
    }
    renderPlay();
  }

  function myView() { return G.online ? window.CoupGame.mergeView(G.pub, G.mine, ME) : E.view(G.s, ME); }
  function posteriorNow() {
    if (!G) return null;
    try { return O.posterior(myView(), { bluff: S().bluff }); } catch (e) { return null; }
  }
  function claimOddsNow() {
    const pd = G && G.s.pending;
    if (!pd || !(pd.kind === 'challenge' || pd.kind === 'block')) return null;
    const p = pd.kind === 'challenge' ? pd.claimant : pd.actor;
    if (p === ME) return null;
    const char = pd.kind === 'challenge' ? pd.char : E.actionDef(G.s, pd.action).claim;
    if (!char) return null;
    const post = posteriorNow();
    return post && post[p] ? post[p].has[char] : null;
  }

  // "You takes" -> "You take", "Ava blocks You" -> "Ava blocks you", "You's" -> "Your"
  const FIRST = { takes: 'take', steals: 'steal', assassinates: 'assassinate', exchanges: 'exchange', examines: 'examine', launches: 'launch', blocks: 'block', challenges: 'challenge', shows: 'show', loses: 'lose', is: 'are', gets: 'get', swaps: 'swap', makes: 'make', lets: 'let' };
  function logLine(e, s) {
    const l = logLine3(e, s);
    if (l) l.txt = l.txt.replace(/^You's /, 'Your ').replace(/^You (\w+)/, (m, w) => 'You ' + (FIRST[w] || w)).replace(/(\S) You(?=\W|$)/g, '$1 you');
    return l;
  }
  function logLine3(e, s) {
    const nm = (i) => (i === ME ? 'You' : s.players[i].name);
    switch (e.t) {
      case 'action': {
        const tg = e.target >= 0 ? ' ' + nm(e.target) : '';
        return { txt: `${nm(e.p)} ${VERB[e.action]}${tg}${e.claim ? ` (${e.claim})` : ''}`, me: e.p === ME || e.target === ME };
      }
      case 'block': return { txt: `${nm(e.p)} blocks with ${e.char}`, me: e.p === ME || e.actor === ME };
      case 'noblock': return null;
      case 'challenge': return { txt: `${nm(e.by)} challenges ${nm(e.of)}: ${e.truth ? 'it was true' : 'caught a bluff!'}`, me: e.by === ME || e.of === ME, big: true };
      case 'prove': return { txt: `${nm(e.p)} shows ${e.char}, shuffles it in, draws anew`, me: e.p === ME };
      case 'lose': return { txt: `${nm(e.p)} loses ${e.char}`, me: e.p === ME, big: true };
      case 'out': return { txt: `${nm(e.p)} is out`, me: e.p === ME, big: true };
      case 'gain': return null;
      case 'steal': return { txt: `${nm(e.p)} takes ${e.n} from ${nm(e.target)}`, me: e.p === ME || e.target === ME };
      case 'refund': return { txt: `${nm(e.p)} gets ${e.n} coins back`, me: e.p === ME };
      case 'fail': return e.blocked ? { txt: `${nm(e.p)}'s ${E.ACTIONS[e.action].label} is blocked`, me: e.p === ME } : null;
      case 'exchange': return { txt: `${nm(e.p)} swaps cards with the deck`, me: e.p === ME };
      case 'shown': return { txt: `${nm(e.p)} shows a card to ${nm(e.to)}`, me: e.p === ME || e.to === ME };
      case 'forced': return { txt: `${nm(e.by)} makes ${nm(e.p)} swap it`, me: e.p === ME || e.by === ME };
      case 'kept': return { txt: `${nm(e.by)} lets ${nm(e.p)} keep it`, me: e.p === ME || e.by === ME };
      case 'win': return { txt: `${nm(e.p)} win${e.p === ME ? '' : 's'}!`, me: true, big: true };
      default: return null;
    }
  }
  function logHTML(s) {
    const lines = [];
    for (let i = s.events.length - 1; i >= 0 && lines.length < 80; i--) {
      const l = logLine(s.events[i], s);
      if (l) lines.push(`<div class="${l.big ? 'big' : l.me ? 'me' : ''}">${esc(l.txt)}</div>`);
    }
    return lines.join('') || '<div>Cards dealt. Good luck.</div>';
  }

  function renderPlay() {
    const root = $('#tab-play');
    if (store.tab !== 'play') return;
    if (!G) { root.innerHTML = NET ? lobbyHTML() : setupHTML(); return; }
    const s = G.s;
    const pd = s.pending;
    const post = S().showOdds ? posteriorNow() : null;
    const myTurn = pd && isHuman(pd.p);
    const now = Date.now();
    const chars = s.rules.chars;

    // --- opponents
    const opps = s.players.map((pl, i) => {
      if (i === ME) return '';
      const isAlive = E.alive(pl);
      const reveal = G.over || S().peek;
      const cards = pl.cards.map((cd, k) => {
        const key = i + ':' + k + ':' + cd.c;
        if (cd.dead) {
          const fresh = !shownDead.has(key);
          shownDead.add(key);
          return cardEl(cd.c, { size: 'sm', dead: true, flip: fresh });
        }
        return cardEl(reveal ? cd.c : null, { size: 'sm' });
      }).join('');
      const bars = post && post[i] ? `<div class="bars" aria-label="odds">${chars.map((c) => `<div class="b" title="${c} ${pctTxt(post[i].has[c])}"><i style="height:${Math.round(post[i].has[c] * 100)}%;background:${COLORS[c]}"></i></div>`).join('')}</div>` : '';
      const sy = says[i] && says[i].until > now ? `<div class="say">${esc(says[i].text)}</div>` : '';
      const isTurn = !G.over && s.ctx && s.ctx.actor === i;
      const targetable = myTurn && pd.kind === 'action' && selAction && isAlive;
      const targeted = s.ctx && s.ctx.target === i && s.ctx.action;
      const seatInfo = G.online && SNAP && SNAP.seats ? SNAP.seats[i] : null;
      const away = seatInfo && seatInfo.kind === 'human' && !seatInfo.online ? ' <small class="away">away</small>' : '';
      return `<div class="opp ${isTurn ? 'turn' : ''} ${isAlive ? '' : 'out'} ${targetable ? 'targetable' : ''} ${targeted ? 'targeted' : ''}" data-opp="${i}">
        ${sy}<div class="top"><span class="nm">${esc(pl.name)}${away}</span>${coin(pl.coins)}</div>
        <div class="mid"><div class="cards">${cards}</div>${bars}</div></div>`;
    }).join('');

    // --- stage
    const stage = stageHTML();
    // --- me
    const me = s.players[ME];
    const pickMine = myTurn && (pd.kind === 'lose' || pd.kind === 'show');
    const myCards = me.cards.map((cd, k) => {
      if (cd.dead) {
        const key = '0:' + k + ':' + cd.c;
        const fresh = !shownDead.has(key); shownDead.add(key);
        return cardEl(cd.c, { dead: true, flip: false && fresh });
      }
      return cardEl(cd.c, { pick: pickMine, data: pickMine ? { card: k } : null });
    }).join('');
    const canHint = myTurn && !G.over;
    // --- actions
    const legal = myTurn && pd.kind === 'action' ? E.legalActions(s, ME) : [];
    const acts = E.ACTION_ORDER.filter((a) => a !== 'examine' || s.rules.inquisitor).map((a) => {
      const def = E.actionDef(s, a);
      const ok = legal.some((l) => l.action === a);
      const mine = E.hiddenChars(me);
      let sub = def.claim ? def.claim : a === 'coup' ? '7 coins' : a === 'foreign_aid' ? '+2' : '+1 safe';
      if (a === 'assassinate') sub = '3 · Assassin';
      const bluff = def.claim && !mine.includes(def.claim);
      const hinted = hint && hint.d && hint.d.action === a;
      return `<button class="act ${selAction === a ? 'sel' : ''} ${hinted ? 'hinted' : ''}" data-act="${a}" ${ok ? '' : 'disabled'}>
        <b>${esc(def.label)}</b><small class="${bluff && ok ? 'bluff' : ''}">${esc(bluff && ok ? sub + ' · bluff' : sub)}</small></button>`;
    }).join('');

    const side = `<div class="side-col">
      <div class="panel" style="margin:0"><h2>Odds <button class="q" data-help="odds" aria-label="Why these odds">?</button></h2>${oddsTable(post)}</div>
      <div class="log">${logHTML(s)}</div></div>`;

    root.innerHTML = `<div class="playwrap"><div class="game">
      <div class="opps">${opps}</div>
      <div class="log">${logHTML(s)}</div>
      <div class="stage">${stage}</div>
      <div class="me-row"><div class="cards">${myCards}</div>
        <div class="side">${coin(me.coins)}
          <div class="row">${canHint ? '<button class="btn small" data-hint="1">Hint</button>' : ''}<button class="btn small ghost" data-quit="1">${G.online ? 'Leave' : G.over ? 'Close' : 'Quit'}</button></div></div></div>
      <div class="actions">${acts}</div>
    </div>${side}</div>`;

    // flip in newly revealed cards
    requestAnimationFrame(() => requestAnimationFrame(() => root.querySelectorAll('[data-flip]').forEach((el) => el.classList.add('up'))));
    // clear bubbles when they expire
    const nextSay = Object.values(says).filter((x) => x.until > now).map((x) => x.until - now);
    if (nextSay.length) { clearTimeout(renderPlay._t); renderPlay._t = setTimeout(renderPlay, Math.min(...nextSay) + 30); }
  }

  function oddsTable(post) {
    if (!G) return '';
    const s = G.s, chars = s.rules.chars;
    if (!post) return '<p class="muted" style="margin:0">Odds are off in Settings.</p>';
    const head = `<tr><th></th>${chars.map((c) => `<th><span class="chip" style="background:${COLORS[c]}"></span>${c.slice(0, 4)}</th>`).join('')}</tr>`;
    const rows = s.players.map((pl, i) => {
      if (i === ME || !post[i]) return '';
      return `<tr><td>${esc(pl.name)}</td>${chars.map((c) => `<td style="color:${scale(post[i].has[c])}">${pctTxt(post[i].has[c])}</td>`).join('')}</tr>`;
    }).join('');
    const v = myView();
    const left = `<tr><td class="muted">Unseen</td>${chars.map((c) => `<td class="muted">${O.unseenCopies(v, c)}</td>`).join('')}</tr>`;
    return `<table class="oddsT">${head}${rows}${left}</table>`;
  }

  function stageHTML() {
    const s = G.s;
    const pd = s.pending;
    const nm = (i) => (i === ME ? 'You' : s.players[i].name);
    if (G.over || !pd) {
      const w = s.winner;
      return `<div class="what"><div class="txt"><div class="t1">${w === ME ? 'You win!' : esc(nm(w)) + ' wins'}</div>
        <div class="t2">${w === ME ? 'Last one standing.' : 'See every hidden card and your calls.'}</div></div></div>
        <div class="acts"><button class="btn warm" data-review="1">Review</button>${G.online ? '<button class="btn primary" data-netleave="1">Leave room</button>' : '<button class="btn primary" data-new="1">New game</button>'}</div>`;
    }
    const why = hint && hint.why ? `<div class="why">Hint: ${esc(hint.why)}</div>` : '';
    if (!isHuman(pd.p)) {
      const last = [...s.events].reverse().map((e) => logLine(e, s)).find(Boolean);
      return `<div class="what"><div class="txt"><div class="t1">${esc(last ? last.txt : '')}</div><div class="t2">${esc(nm(pd.p))} is thinking…</div></div></div>`;
    }
    const pctBox = (p) => (p == null ? '' : `<div class="pct"><b style="color:${scale(p)}">${pctTxt(p)}</b><small>true <button class="q" data-help="claim" aria-label="How is this worked out">?</button></small></div>`);
    const H = (k) => (hint && hint.d && hint.d[k]);
    switch (pd.kind) {
      case 'action':
        if (selAction) return `<div class="what"><div class="txt"><div class="t1">${esc(E.ACTIONS[selAction].label)}: pick a player</div><div class="t2">Tap someone above.</div></div></div>
          <div class="acts"><button class="btn" data-cancel="1">Cancel</button></div>${why}`;
        return `<div class="what"><div class="txt"><div class="t1">Your turn</div><div class="t2">${pd.mustCoup ? '10+ coins: you must Coup.' : 'Pick an action below.'}</div></div></div>${why}`;
      case 'challenge': {
        const p = claimOddsNow();
        const blockTxt = pd.about === 'block' ? `blocks ${pd.actor === ME ? 'your' : nm(pd.actor) + "'s"} ${E.ACTIONS[pd.action].label}` : (WHAT[pd.action] || '') + (pd.target === ME ? ' from you' : pd.target >= 0 && pd.action !== 'tax' ? ' · ' + nm(pd.target) : '');
        return `<div class="what"><div class="txt"><div class="t1">${esc(nm(pd.claimant))} claims ${esc(pd.char)}</div><div class="t2">${esc(blockTxt)}</div></div>${pctBox(p)}</div>
          <div class="acts"><button class="btn danger ${H('challenge') === true ? 'hinted' : ''}" data-ch="1">Challenge</button><button class="btn ${hint && hint.d && hint.d.challenge === false ? 'hinted' : ''}" data-ch="0">Allow</button></div>${why}`;
      }
      case 'block': {
        const p = claimOddsNow();
        const btns = pd.chars.map((c) => `<button class="btn warm ${H('block') === c ? 'hinted' : ''}" data-blk="${c}">Block · ${c}</button>`).join('');
        const t1 = pd.action === 'foreign_aid' ? `${nm(pd.actor)} takes Foreign aid` : `${nm(pd.actor)} ${VERB[pd.action]} you`;
        return `<div class="what"><div class="txt"><div class="t1">${esc(t1)}</div><div class="t2">Block it?</div></div>${pctBox(p)}</div>
          <div class="acts">${btns}<button class="btn ${hint && hint.d && hint.d.block === null ? 'hinted' : ''}" data-blk="">Allow</button></div>${why}`;
      }
      case 'lose':
        return `<div class="what"><div class="txt"><div class="t1">Lose a card</div><div class="t2">${pd.reason === 'challenge' ? 'You lost the challenge.' : pd.reason === 'bluff' ? 'Your bluff was caught.' : 'You were hit by a ' + (pd.reason === 'coup' ? 'Coup' : 'killing') + '.'} Tap the card to give up.</div></div></div>${why}`;
      case 'show':
        return `<div class="what"><div class="txt"><div class="t1">Show ${esc(nm(pd.by))} a card</div><div class="t2">Tap the card they get to see.</div></div></div>${why}`;
      case 'examine':
        return `<div class="what"><div class="txt"><div class="t1">${esc(nm(pd.target))} shows: ${esc(pd.char)}</div><div class="t2">Make them swap it for a random card?</div></div>${cardEl(pd.char, { size: 'sm' })}</div>
          <div class="acts"><button class="btn warm" data-exam="1">Swap it</button><button class="btn" data-exam="0">Let them keep it</button></div>${why}`;
      case 'exchange': case 'pick':
        return `<div class="what"><div class="txt"><div class="t1">${pd.kind === 'pick' ? 'Pick your card' : 'Exchange'}</div><div class="t2">Choose what to keep.</div></div></div>
          <div class="acts"><button class="btn primary" data-openx="1">Choose cards</button></div>`;
    }
    return '';
  }

  function openExchange() {
    const pd = G.s.pending;
    let chosen = [];
    const draw = () => {
      const opts = pd.options.map((c, i) => cardEl(c, { size: 'lg', pick: true, chosen: chosen.includes(i), data: { s: 'c' + i } })).join('');
      const why = hint && hint.why ? `<div class="why" style="color:var(--warm);font-size:13px">Hint: ${esc(hint.why)}</div>` : '';
      sheet(`<h3>${pd.kind === 'pick' ? 'Keep 1 card' : 'Keep ' + pd.keep + ' of ' + pd.options.length}<button class="btn small" data-s="hint">Hint</button></h3>
        <div class="body"><p class="muted" style="margin:0 0 4px">${pd.kind === 'pick' ? 'The other 4 leave the game face down.' : 'The rest go back into the deck.'}</p>
        <div class="choose">${opts}</div>${why}</div>
        <div class="foot"><button class="btn primary" data-s="ok" ${chosen.length === pd.keep ? '' : 'disabled'}>Keep ${chosen.length}/${pd.keep}</button></div>`,
      (k) => {
        if (k === 'hint') { askHint(); draw(); return; }
        if (k === 'ok') { if (chosen.length !== pd.keep) return; closeSheet(); human({ keep: chosen.slice() }); return; }
        if (k[0] === 'c') {
          const i = +k.slice(1);
          if (chosen.includes(i)) chosen = chosen.filter((x) => x !== i);
          else { chosen.push(i); if (chosen.length > pd.keep) chosen.shift(); }
          draw();
        }
      });
      // no closing by tapping outside: the choice is required
      const back = $('.sheet-back'); if (back) back.removeAttribute('data-close');
    };
    draw();
  }

  function askHint() {
    const s = G.s, pd = s.pending;
    if (!pd || !isHuman(pd.p)) return;
    const r = AI.decide(myView(), pd, 'hard', Math.random, pd.kind === 'action' ? E.legalActions(s, ME) : null, s.rules);
    hint = { d: r.d, why: r.why || 'No strong preference here.' };
    if (pd.kind === 'action' && r.d.target >= 0) hint.why += ` Target: ${s.players[r.d.target].name}.`;
    if ((pd.kind === 'lose' || pd.kind === 'show') && r.d.card != null) hint.why = r.why;
  }

  // ---- after the game: what was true, which calls were right
  function openReview() {
    const s = G.s;
    const nm = (i) => (i === ME ? 'You' : s.players[i].name);
    const items = [];
    let right = 0, wrong = 0, missed = 0, myBluffs = 0, caught = 0;
    const callsByEi = {};
    for (const c of G.calls) callsByEi[c.ei] = c;
    s.events.forEach((e, ei) => {
      if (!((e.t === 'action' && e.claim) || e.t === 'block')) return;
      const char = e.t === 'block' ? e.char : e.claim;
      const truth = e._true;
      const ch = s.events.slice(ei + 1).find((x) => x.t === 'challenge' && x.of === e.p && x.char === char);
      const challenged = ch && s.events.indexOf(ch) < (s.events.slice(ei + 1).findIndex((x) => x.t === 'turn') + ei + 1 || Infinity);
      const call = callsByEi[ei];
      let tag = '', cls = '', note = '';
      if (e.p === ME) {
        if (!truth) { myBluffs++; if (challenged) caught++; }
        tag = truth ? 'TRUE' : challenged ? 'CAUGHT' : 'BLUFF OK'; cls = truth ? 'ok' : challenged ? 'no' : 'ok';
        note = `You claimed ${char}${truth ? '' : ' (bluff)'}`;
      } else if (call) {
        const good = call.challenged ? !truth : truth;
        if (good) right++; else if (call.challenged) wrong++; else missed++;
        tag = good ? 'RIGHT' : call.challenged ? 'WRONG' : 'MISSED';
        cls = good ? 'ok' : call.challenged ? 'no' : 'meh';
        note = `${nm(e.p)} claimed ${char}: ${truth ? 'true' : 'a bluff'}. You ${call.challenged ? 'challenged' : 'allowed it'}${call.pTrue != null ? ` (odds said ${pctTxt(call.pTrue)} true)` : ''}.`;
      } else {
        tag = truth ? 'TRUE' : 'BLUFF'; cls = truth ? 'ok' : 'meh';
        note = `${nm(e.p)} claimed ${char}${challenged ? ' (challenged)' : ''}`;
      }
      items.push(`<div class="rv"><span class="tag ${cls}">${tag}</span><span>${esc(note)}</span></div>`);
    });
    // calibration: average odds shown vs how often it was true
    const shown = G.calls.filter((c) => c.pTrue != null);
    const avgShown = shown.length ? shown.reduce((a, c) => a + c.pTrue, 0) / shown.length : null;
    const realTrue = shown.length ? shown.filter((c) => s.events[c.ei] && s.events[c.ei]._true).length / shown.length : null;
    const hands = s.players.map((pl, i) => `<div><b>${esc(nm(i))}</b>${pl.cards.map((c) => cardEl(c.c, { size: 'sm', dead: c.dead })).join('')}</div>`).join('');
    sheet(`<h3>Review<button class="btn small ghost" data-s="x">Close</button></h3>
      <div class="body">
        <div class="sumrow"><div><b style="color:var(--good)">${right}</b><small>right calls</small></div><div><b style="color:var(--bad)">${wrong}</b><small>wrong challenges</small></div>
          <div><b style="color:var(--warm)">${missed}</b><small>bluffs let by</small></div><div><b>${caught}/${myBluffs}</b><small>your bluffs caught</small></div></div>
        ${avgShown != null ? `<p class="muted" style="margin:4px 0">Odds shown averaged <b>${pctTxt(avgShown)}</b> true; <b>${pctTxt(realTrue)}</b> really were.</p>` : ''}
        <div class="label" style="margin-top:8px">Final hands</div><div class="hands-reveal">${hands}</div>
        <div class="label" style="margin-top:8px">Every claim</div>${items.join('') || '<p class="muted">No claims were made.</p>'}
      </div>`, () => closeSheet());
  }

  // ======================================================================
  //   ONLINE (shared online.js: room code, any seat a person or a computer)
  // ======================================================================
  let NET = null;       // the online room object
  let SNAP = null;      // its latest snapshot
  let netBusy = false;
  async function netRoom() {
    if (NET) return NET;
    const mod = await import(new URL('js/online.js?v=1', document.baseURI).href);
    NET = mod.createOnline({ game: window.CoupGame.game, gameId: 'coup', botDelayMs: SPEED[S().speed] });
    NET.on('change', onSnap);
    NET.on('error', (msg) => toast(String(msg && msg.message || msg)));
    return NET;
  }
  function netName() { return (store.netName || '').trim().slice(0, 14) || 'Player'; }
  async function netCreate() {
    if (netBusy) return; netBusy = true;
    try {
      const room = await netRoom();
      const n = 1 + Math.max(1, Math.min(5, S().opps));
      const seats = [{ kind: 'human', name: netName() }].concat(Array.from({ length: n - 1 }, () => 'empty'));
      const r = await room.createRoom({ name: netName(), seats, options: { level: S().level, inquisitor: S().inquisitor, twoDeal: S().twoDeal } });
      if (!r.ok) toast(r.message || 'Could not make a room.');
      else { store.netOn = true; save(); closeSheet(); }
    } catch (e) { toast('Online play could not load. Check the connection.'); }
    netBusy = false; renderPlay();
  }
  async function netJoin(code) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 5) { toast('Room codes have 5 letters.'); return; }
    if (netBusy) return; netBusy = true;
    try {
      const room = await netRoom();
      const r = await room.joinRoom(code, netName());
      if (!r.ok) toast(r.message || 'Could not join.');
      else { store.netOn = true; save(); closeSheet(); }
    } catch (e) { toast('Online play could not load. Check the connection.'); }
    netBusy = false; renderPlay();
  }
  async function netLeave() {
    const room = NET;
    NET = null; SNAP = null; G = null; ME = 0;
    store.netOn = false; save();
    closeSheet(); renderPlay();
    if (room) { try { await room.leave(); } catch (e) { /* already gone */ } }
  }
  async function netAct(d) {
    if (!NET) return;
    G.sent = true; renderPlay();
    const r = await NET.act(d);
    if (!r || !r.ok) { G.sent = false; toast((r && r.message) || 'That move did not go through.'); renderPlay(); }
  }
  function onSnap(snap) {
    SNAP = snap;
    if (!snap || ['none', 'closed', 'left'].includes(snap.status)) {
      if (snap && snap.status === 'closed') toast('The host closed the room.');
      if (snap && snap.status !== 'none') { NET = null; store.netOn = false; save(); }
      SNAP = null; G = null; ME = 0;
      renderPlay(); return;
    }
    if ((snap.status === 'playing' || snap.status === 'finished') && snap.pub) {
      const fresh = !G || !G.online;
      if (fresh) {
        GEN++;                       // stop any local game loop
        G = { online: true, calls: [], over: false, level: snap.pub.level, seen: 0 };
        shownDead = new Set(); hint = null; selAction = null;
        for (const k in says) delete says[k];
      }
      ME = snap.mySeat;
      G.pub = snap.pub; G.mine = snap.mine;
      G.s = window.CoupGame.stateFromView(snap.pub, snap.mine, ME);
      G.sent = false;
      const evs = G.s.events;
      if (!fresh && evs.length > G.seen) noteEvents(evs.slice(G.seen));
      G.seen = evs.length;
      G.over = snap.status === 'finished' || G.s.winner >= 0;
      const pd = G.s.pending;
      if (!G.over && pd && pd.p === ME && (pd.kind === 'exchange' || pd.kind === 'pick')) {
        if (!$('.sheet .choose')) openExchange();
      }
    } else {
      G = null;                      // lobby
    }
    if (store.tab === 'play') renderPlay();
  }
  function lobbyHTML() {
    const sn = SNAP || {};
    if (!sn.seats) return `<div class="setup-wrap"><div class="panel"><h2>Online</h2><p class="muted">${sn.status === 'joining' ? 'Asking the host to let you in…' : 'Connecting…'}</p>
      <button class="btn" data-netleave="1" style="width:100%">Cancel</button></div></div>`;
    const o = sn.options || {};
    const seats = sn.seats.map((st, i) => {
      const who = st.kind === 'empty' ? '<span class="muted">Open seat</span>' : esc(st.name) + (st.kind === 'computer' ? ' <span class="muted">· computer</span>' : '') + (i === sn.mySeat ? ' <span class="muted">· you</span>' : '') + (st.isHost ? ' <span class="muted">· host</span>' : '');
      const btn = sn.isHost && i !== sn.mySeat && st.kind !== 'human' ? `<button class="btn small" data-seat="${i}">${st.kind === 'empty' ? 'Computer' : 'Open'}</button>` : '';
      return `<div class="seatrow"><span class="dot ${st.kind === 'human' && !st.online ? 'off' : st.kind}"></span><span class="nm">${who}</span>${btn}</div>`;
    }).join('');
    const lv = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }[o.level] || 'Medium';
    const vars = [o.inquisitor ? 'Inquisitor' : '', o.twoDeal && sn.seats.length === 2 ? '2-player deal' : ''].filter(Boolean).join(' · ');
    return `<div class="setup-wrap">
      <div class="panel lobby"><h2>Room code <button class="q" data-help="online" aria-label="How online works">?</button></h2>
        <div class="code">${esc(sn.code || '')}</div>
        <p class="muted" style="margin:0">Friends open this site, tap Online, and type the code.</p></div>
      <div class="panel"><h2>Seats</h2>${seats}
        <p class="muted" style="margin:8px 0 0;font-size:13px">Computers play ${lv}${vars ? ' · ' + vars : ''}. Open seats left at the start become computers.</p></div>
      ${sn.isHost ? '<button class="btn primary" data-netstart="1" style="width:100%;min-height:50px;font-size:17px">Start game</button>' : '<p class="muted" style="text-align:center">Waiting for the host to start…</p>'}
      <button class="btn ghost" data-netleave="1" style="width:100%;margin-top:8px">Leave room</button>
    </div>`;
  }
  function openOnline() {
    sheet(`<h3>Play online <button class="btn small ghost" data-s="x">Close</button></h3>
      <div class="body">
        <label class="field"><span>Your name</span><input type="text" maxlength="14" id="netName" value="${esc(store.netName || '')}" placeholder="Name" autocomplete="nickname"></label>
        <button class="btn primary" data-s="create" style="width:100%;min-height:46px">Make a room</button>
        <p class="muted" style="margin:2px 0 10px;font-size:13px">${1 + S().opps} seats (your Opponents setting). You pick which are friends and which are computers.</p>
        <div class="label">Or join one</div>
        <div class="row" style="gap:8px"><input type="text" id="netCode" maxlength="5" placeholder="CODE" autocapitalize="characters" autocomplete="off" spellcheck="false" style="flex:1;text-transform:uppercase;letter-spacing:4px;font-weight:700"><button class="btn warm" data-s="join">Join</button></div>
      </div>`,
    (k) => {
      const nameEl = $('#netName');
      if (nameEl) { store.netName = nameEl.value.trim().slice(0, 14); save(); }
      if (k === 'x') { closeSheet(); return; }
      if (!store.netName) { toast('Type your name first.'); if (nameEl) nameEl.focus(); return; }
      if (k === 'create') netCreate();
      if (k === 'join') netJoin(($('#netCode') || {}).value);
    });
  }

  function setupHTML() {
    const st = S();
    const lv = (k, label, note) => `<button class="${st.level === k ? 'on' : ''}" data-level="${k}">${label}<small>${note}</small></button>`;
    const str = strength && strength.strength;
    const pc = (o, k) => (o ? Math.round(o[k]) + '%' : '');
    const notes = str ? {
      easy: 'plays honest',
      medium: `beats Easy ${pc(str.mediumVsEasy, 'medium')}`,
      hard: `beats Medium ${pc(str.hardVsMedium, 'hard')}`,
    } : { easy: 'plays honest', medium: 'counts cards', hard: 'reads the table' };
    const rec = ['easy', 'medium', 'hard'].map((k) => `<span>${k[0].toUpperCase() + k.slice(1)} ${store.stats[k].w}/${store.stats[k].g}</span>`).join('');
    const chars = (st.inquisitor ? E.INQ_CHARS : E.BASE_CHARS);
    const resume = store.game && !G ? '<button class="btn" data-resume="1" style="width:100%;margin-top:8px">Resume last game</button>' : '';
    return `<div class="setup-wrap">
      <div class="hero"><div class="fan">${chars.map((c) => cardEl(c)).join('')}</div><h1>Coup</h1><p>Bluff, call bluffs, be the last one standing.</p></div>
      <div class="panel"><h2>Opponents</h2><div class="seg">${[1, 2, 3, 4, 5].map((n) => `<button class="${st.opps === n ? 'on' : ''}" data-opps="${n}">${n}</button>`).join('')}</div></div>
      <div class="panel"><h2>Computer level <button class="q" data-help="strength" aria-label="How strong">?</button></h2>
        <div class="seg">${lv('easy', 'Easy', notes.easy)}${lv('medium', 'Medium', notes.medium)}${lv('hard', 'Hard', notes.hard)}</div></div>
      <div class="row" style="gap:8px"><button class="btn primary" data-new="1" style="flex:2;min-height:50px;font-size:17px">Deal</button><button class="btn" data-online="1" style="flex:1;min-height:50px">Online</button></div>${resume}
      <div class="record">Your wins: ${rec}</div>
    </div>`;
  }

  // ======================================================================
  //   TABLE (real-table companion)
  // ======================================================================
  let tAnswer = null;   // multi-select scratch for "Your cards now?"
  function tableState() { return store.table; }
  function renderTable() {
    const root = $('#tab-table');
    const tb = tableState();
    if (!tb) { root.innerHTML = tableSetupHTML(); return; }
    const d = T.derive(tb.setup, tb.turns);
    const v = T.oddsView(d);
    const post = S().showOdds ? safePost(v, tb) : null;
    const chars = d.rules.chars;
    const nm = (i) => (i === d.me ? 'You' : d.players[i].name);
    if (!tb.partial || tb.partial.actor == null) tb.partial = { actor: d.next };
    const t = tb.partial;
    const players = d.players.map((p, i) => {
      const deadCards = p.dead.map((c) => cardEl(c, { size: 'sm', dead: true })).join('');
      const live = i === d.me ? d.myCards.filter((m) => !m.dead).map((m) => cardEl(m.c, { size: 'sm' })).join('') : Array.from({ length: Math.max(0, p.hidden) }, () => cardEl(null, { size: 'sm' })).join('');
      const bars = post && post[i] ? `<div class="bars">${chars.map((c) => `<div class="b" title="${c} ${pctTxt(post[i].has[c])}"><i style="height:${Math.round(post[i].has[c] * 100)}%;background:${COLORS[c]}"></i></div>`).join('')}</div>` : '';
      return `<div class="tp ${t.actor === i && d.winner < 0 ? 'turn' : ''} ${p.alive ? '' : 'out'}"><div class="cards" style="display:flex;gap:3px">${live}${deadCards}</div>
        <div class="info"><div class="nm">${esc(nm(i))}</div><div class="sub">${coin(p.coins)}</div></div>${bars}</div>`;
    }).join('');

    let ask;
    if (d.winner >= 0) {
      ask = `<div class="ask"><div class="t1" style="font-weight:750">${esc(nm(d.winner))} win${d.winner === d.me ? '' : 's'}!</div>
        <div class="opts"><button class="btn" data-tundo="1">Undo</button><button class="btn primary" data-tnew="1">New table</button></div></div>`;
    } else {
      const q = T.nextQuestion(tb.setup, tb.turns, t);
      const p = q && q.claim ? T.claimOdds(tb.setup, tb.turns, t, q, O, S().bluff) : null;
      const head = `<div class="row between"><div><div style="font-weight:750">${esc(nm(t.actor))}'s turn${t.action ? ' · ' + esc(E.ACTIONS[t.action].label) : ''}${t.target != null ? ' → ' + esc(nm(t.target)) : ''}</div>
        <div class="muted" style="font-size:13px">${esc(q ? q.ask : '')}</div></div>
        ${p != null ? `<div class="pct"><b style="color:${scale(p)}">${pctTxt(p)}</b><small>true <button class="q" data-help="claim">?</button></small></div>` : ''}</div>`;
      let opts = '';
      if (q && q.multi) {
        tAnswer = tAnswer || [];
        opts = q.options.map((o) => { const n = tAnswer.filter((x) => x === o.value).length; return `<button class="btn small ${n ? 'warm' : ''}" data-tmulti="${esc(o.value)}">${esc(o.label)}${n > 1 ? ' ×' + n : ''}</button>`; }).join('') +
          `<button class="btn small primary" data-tmok="1" ${tAnswer.length === q.multi ? '' : 'disabled'}>Done ${tAnswer.length}/${q.multi}</button>`;
      } else if (q) {
        opts = q.options.map((o, k) => `<button class="btn small ${o.char ? '' : ''}" data-tq="${k}">${o.char ? `<span class="chip" style="background:${COLORS[o.char]}"></span>` : ''}${esc(o.label)}</button>`).join('');
      }
      const back = (t.action || q && q.id !== 'action') ? '<button class="btn small ghost" data-tback="1">Start turn over</button>' : '';
      const change = q && q.id === 'action' ? '<button class="btn small ghost" data-tactor="1">Someone else</button>' : '';
      ask = `<div class="ask">${head}<div class="opts">${opts}</div><div class="row" style="margin-top:6px">${back}${change}</div></div>`;
    }
    const lines = tb.turns.map((tn) => T.describe(tb.setup, d, tn)).reverse().map((l) => `<div>${esc(l)}</div>`).join('') || '<div>Record each turn as it happens.</div>';
    const log = `<div class="log">${lines}</div>`;
    const tools = `<div class="row"><button class="btn small" data-tundo="1" ${tb.turns.length ? '' : 'disabled'}>Undo turn</button><span style="flex:1"></span><button class="btn small ghost" data-tnew="1">New table</button></div>`;
    const side = `<div class="side-col"><div class="panel" style="margin:0"><h2>Odds <button class="q" data-help="odds">?</button></h2>${tableOdds(d, post)}</div>${log}</div>`;
    root.innerHTML = `<div class="tblwrap"><div class="tbl"><div class="tplayers">${players}</div>${ask}${log}${tools}</div>${side}</div>`;
  }
  function safePost(v, tb) {
    try {
      const learned = friendBluff(tb.setup.names);
      return O.posterior(v, { bluff: S().bluff, bluffBy: learned });
    } catch (e) { return null; }
  }
  function tableOdds(d, post) {
    if (!post) return '<p class="muted" style="margin:0">Odds are off in Settings.</p>';
    const chars = d.rules.chars;
    const head = `<tr><th></th>${chars.map((c) => `<th><span class="chip" style="background:${COLORS[c]}"></span>${c.slice(0, 4)}</th>`).join('')}</tr>`;
    const rows = d.players.map((pl, i) => (i === d.me || !post[i] ? '' : `<tr><td>${esc(pl.name)}</td>${chars.map((c) => `<td style="color:${scale(post[i].has[c])}">${pctTxt(post[i].has[c])}</td>`).join('')}</tr>`)).join('');
    return `<table class="oddsT">${head}${rows}</table>`;
  }
  // Friends' bluffing habits across past table games (by name): caught / challenged.
  function friendStats() {
    const out = {};
    const games = (store.tableArchive || []).concat(store.table ? [store.table] : []);
    for (const g of games) {
      const d = T.derive(g.setup, g.turns);
      for (const e of d.events) {
        if (e.t !== 'challenge') continue;
        const name = g.setup.names[e.of];
        if (e.of === g.setup.me) continue;
        const o = out[name] || (out[name] = { tested: 0, caught: 0 });
        o.tested++; if (!e.truth) o.caught++;
      }
    }
    return out;
  }
  function friendBluff(names) {
    const fs = friendStats();
    const prior = S().bluff, w = 4;
    return names.map((n) => { const f = fs[n]; return f ? (prior * w + f.caught) / (w + f.tested) : prior; });
  }
  function tableSetupHTML() {
    const ts = store.tableDraft || (store.tableDraft = { n: 4, names: ['You', 'Ann', 'Ben', 'Cal', 'Dee', 'Eve'], me: 0, myCards: [], first: 0 });
    const chars = S().inquisitor ? E.INQ_CHARS : E.BASE_CHARS;
    const nameInputs = Array.from({ length: ts.n }, (_, i) => `<input type="text" maxlength="14" value="${esc(ts.names[i] || '')}" data-tname="${i}" aria-label="Player ${i + 1} name">`).join('');
    const meSeg = `<div class="seg" style="flex-wrap:wrap">${Array.from({ length: ts.n }, (_, i) => `<button class="${ts.me === i ? 'on' : ''}" data-tme="${i}">${esc(ts.names[i] || 'P' + (i + 1))}</button>`).join('')}<button class="${ts.me === -1 ? 'on' : ''}" data-tme="-1">Watching</button></div>`;
    const firstSeg = `<div class="seg" style="flex-wrap:wrap">${Array.from({ length: ts.n }, (_, i) => `<button class="${ts.first === i ? 'on' : ''}" data-tfirst="${i}">${esc(ts.names[i] || 'P' + (i + 1))}</button>`).join('')}</div>`;
    const mine = ts.me >= 0 ? `<div class="panel"><h2>Your 2 cards <span class="muted" style="font-size:12px;font-weight:500">${ts.myCards.length}/2</span></h2>
      <div class="row" style="flex-wrap:wrap;gap:6px">${chars.map((c) => { const n = ts.myCards.filter((x) => x === c).length; return `<button class="btn small ${n ? 'warm' : ''}" data-tcard="${c}"><span class="chip" style="background:${COLORS[c]}"></span>${c}${n > 1 ? ' ×2' : ''}</button>`; }).join('')}</div></div>` : '';
    const ok = ts.me < 0 || ts.myCards.length === 2;
    return `<div class="setup-wrap" style="overflow-y:auto">
      <div class="panel"><h2>Players at the table <button class="q" data-help="table">?</button></h2>
        <div class="seg" style="margin-bottom:8px">${[2, 3, 4, 5, 6].map((n) => `<button class="${ts.n === n ? 'on' : ''}" data-tn="${n}">${n}</button>`).join('')}</div>
        <div class="namegrid">${nameInputs}</div></div>
      <div class="panel"><h2>Which one is you?</h2>${meSeg}</div>
      ${mine}
      <div class="panel"><h2>Who goes first?</h2>${firstSeg}</div>
      <button class="btn primary" data-tstart="1" ${ok ? '' : 'disabled'} style="width:100%;min-height:50px">Start tracking</button>
    </div>`;
  }

  // ======================================================================
  //   LEARN
  // ======================================================================
  const ABOUT = {
    Duke: ['Tax: take 3 coins', 'Blocks Foreign aid'],
    Assassin: ['Pay 3: target loses a card', '—'],
    Captain: ['Steal 2 coins from a player', 'Blocks stealing'],
    Ambassador: ['Exchange: draw 2, return 2', 'Blocks stealing'],
    Contessa: ['—', 'Blocks assassination'],
    Inquisitor: ['Exchange 1, or look at a card', 'Blocks stealing'],
  };
  let calc = { unseen: 13, copies: 3, hand: 2 };
  function hyper(U, x, k) { return 1 - O.binom(U - x, k) / O.binom(U, k); }
  function renderLearn() {
    const root = $('#tab-learn');
    const chars = S().inquisitor ? E.INQ_CHARS : E.BASE_CHARS;
    const rows = chars.map((c) => `<tr><td><span class="chip" style="background:${COLORS[c]}"></span><b>${c}</b></td><td>${ABOUT[c][0]}</td><td>${ABOUT[c][1]}</td></tr>`).join('');
    const st = strength;
    const strengthBlock = st ? `
      <table><tr><th>Match</th><th>Win rate</th></tr>
      <tr><td>Hard vs Easy (1 on 1)</td><td>Hard ${st.strength.hardVsEasy.hard}%</td></tr>
      <tr><td>Hard vs Medium (1 on 1)</td><td>Hard ${st.strength.hardVsMedium.hard}%</td></tr>
      <tr><td>Medium vs Easy (1 on 1)</td><td>Medium ${st.strength.mediumVsEasy.medium}%</td></tr>
      <tr><td>Easy, Medium, Hard together</td><td>Hard ${st.strength.threeWay.hard}% · Medium ${st.strength.threeWay.medium}% · Easy ${st.strength.threeWay.easy}%</td></tr></table>
      <p>Measured ${esc(st.made)} by playing ${st.strength.games.duel} games per pairing with seats rotated (a fair coin would be 50%, or 33% three ways).</p>` : '<p>Loading…</p>';
    const handRows = st ? st.hands.rows.map((r) => {
      const w = r.win;
      return `<div class="barrow"><span>${esc(r.hand.replace('+', ' + '))}</span><div class="track"><i style="width:${Math.min(100, w * 2)}%;background:${scale((w - 20) / 26)}"></i></div><b>${w}%</b></div>`;
    }).join('') : '';
    const seatRows = st ? Object.entries(st.seats).map(([n, o]) => `<tr><td>${n} players</td><td>${o.firstWins}%</td><td>${(100 / n).toFixed(0)}%</td><td>${o.avgTurns}</td></tr>`).join('') : '';
    const p = hyper(calc.unseen, calc.copies, calc.hand);
    root.innerHTML = `<div class="learn">
      <h2>The cards</h2>
      <div class="cardrow">${chars.map((c) => cardEl(c)).join('')}</div>
      <table><tr><th>Character</th><th>Action</th><th>Blocks</th></tr>${rows}</table>
      <h2>A turn</h2>
      <table>
        <tr><td><b>Income</b></td><td>+1 coin. Nobody can stop it.</td></tr>
        <tr><td><b>Foreign aid</b></td><td>+2 coins. Anyone claiming a Duke can block it.</td></tr>
        <tr><td><b>Coup</b></td><td>Pay 7: a player loses a card. Can't be stopped. With 10+ coins you must Coup.</td></tr>
        <tr><td><b>Character</b></td><td>Claim any character's action, whether you hold it or not.</td></tr>
        <tr><td><b>Challenge</b></td><td>Anyone may call a claim. If the card is there, the challenger loses a card and the card is shuffled back for a new one. If not, the bluffer loses a card and the action fails (coins paid come back).</td></tr>
        <tr><td><b>Block</b></td><td>Blocks are claims too, so they can be challenged.</td></tr>
        <tr><td><b>Lose a card</b></td><td>You pick which one to turn face up. No cards left: you're out, and your coins go back.</td></tr>
      </table>
      <p>Each player starts with 2 cards and 2 coins (in a 2-player game, whoever starts gets 1). 15 cards: 3 of each character.</p>
      <h2>How the odds work <button class="q" data-help="odds">?</button></h2>
      <p>Start from the cards you can't see. Try it: how likely is a player to hold at least one copy?</p>
      <div class="calc">
        <span>Cards you can't see</span><input type="range" min="2" max="13" value="${calc.unseen}" data-calc="unseen"><b>${calc.unseen}</b>
        <span>Copies unaccounted for</span><input type="range" min="0" max="3" value="${calc.copies}" data-calc="copies"><b>${calc.copies}</b>
        <span>Cards in their hand</span><input type="range" min="1" max="2" value="${calc.hand}" data-calc="hand"><b>${calc.hand}</b>
      </div>
      <div class="bigpct" style="color:${scale(p)}">${pctTxt(p)}</div>
      <p>The game then tilts this for what each player has claimed (people bluff, so a claim counts for a lot but not everything), for blocks they skipped, and for any bluff that was caught.</p>
      <h2>How strong are the computers? <button class="q" data-help="strength">?</button></h2>${strengthBlock}
      <h2>Best starting hands</h2>
      <p>Win rate of each starting pair, Hard vs Hard vs Hard${st ? `, ${st.hands.games.toLocaleString()} games` : ''}. A fair share is 33%.</p>${handRows}
      <h2>Does going first help?</h2>
      ${st ? `<table><tr><th>Table</th><th>First player wins</th><th>Fair share</th><th>Avg turns</th></tr>${seatRows}</table>` : ''}
      <div style="height:20px"></div></div>`;
  }

  // ======================================================================
  //   SETTINGS
  // ======================================================================
  function renderSettings() {
    const st = S();
    const seg = (key, opts) => `<div class="seg">${opts.map(([v, l]) => `<button class="${st[key] === v ? 'on' : ''}" data-set="${key}" data-val="${v}">${l}</button>`).join('')}</div>`;
    const sw = (key) => `<label class="switch"><input type="checkbox" data-sw="${key}" ${st[key] ? 'checked' : ''}><span></span></label>`;
    const tot = ['easy', 'medium', 'hard'].map((k) => `${k[0].toUpperCase() + k.slice(1)}: ${store.stats[k].w} of ${store.stats[k].g}`).join(' · ');
    $('#tab-settings').innerHTML = `<div class="set">
      <div class="label" style="margin:4px 0">Play</div>
      <div class="setrow"><div class="k">Computer speed</div>${seg('speed', [['slow', 'Slow'], ['normal', 'Normal'], ['fast', 'Fast']])}</div>
      <div class="setrow"><div class="k">Show odds<small>Card odds on every player</small></div>${sw('showOdds')}</div>
      <div class="setrow"><div class="k">Study mode<small>See the computers' cards while playing</small></div>${sw('peek')}</div>
      <div class="setrow"><div class="k">How much people bluff <button class="q" data-help="bluff">?</button><small>Used for every odds number</small></div>${seg('bluff', [[0.15, 'Rarely'], [0.3, 'Some'], [0.5, 'Often']])}</div>
      <div class="label" style="margin:16px 0 4px">Variants</div>
      <div class="setrow"><div class="k">Inquisitor<small>Replaces all 3 Ambassadors</small></div>${sw('inquisitor')}</div>
      <div class="setrow"><div class="k">2-player deal <button class="q" data-help="twodeal">?</button><small>Official setup for 1 opponent</small></div>${sw('twoDeal')}</div>
      <div class="label" style="margin:16px 0 4px">Your record</div>
      <div class="setrow"><div class="k" style="font-weight:400">${tot}</div><button class="btn small ghost" data-resetstats="1">Reset</button></div>
      <p class="build">Build ${esc(window.COUP_BUILD || '')} · <a href="../">More games</a></p>
    </div>`;
  }

  const HELP = {
    odds: 'Every card you can\'t see could be in any hidden spot, so we start by counting. Then each claim shifts the odds: a player who holds the card always may claim it, a player who doesn\'t only sometimes does (the "how much people bluff" setting). A caught bluff means they certainly don\'t have it; a card shown and shuffled away resets that.',
    claim: 'This is the chance this player really holds the card they just claimed, using the cards you can see, your own hand, and everything they have claimed or skipped so far.',
    strength: 'Each level played thousands of games against the others with seats rotated, so the numbers are measured, not guessed. Hard weighs the odds of each claim against what a challenge risks; Medium uses the same odds more timidly; Easy plays honest and calls bluffs at random.',
    bluff: 'How often a player who does NOT hold a card still claims it, compared with a player who does. Pick what fits your table; it changes every odds number.',
    twodeal: 'The rulebook\'s 2-player setup: each player picks 1 card from a set of all five characters and sets the other 4 aside face down, then gets 1 random card. The deck is only 3 cards.',
    online: 'Make a room and share the 5-letter code. Each seat is a friend or a computer. The host’s browser runs the computers and checks every move, and each player’s cards are only ever sent to that player. If someone drops out, a computer keeps their seat going; reloading the page puts you back in.',
    table: 'Use this with real cards. Record each turn with a few taps; the odds update for every claim. If you add your own cards, the odds count them too. Bluff habits of each name carry over between games.',
  };

  // ======================================================================
  //   events
  // ======================================================================
  document.addEventListener('click', (e) => {
    if (e.target.closest('#overlay')) return;
    const b = e.target.closest('button, [data-opp], [data-card]');
    if (!b) return;
    const ds = b.dataset;
    if (ds.tab) { setTab(ds.tab); return; }
    if (ds.help) { help(HELP[ds.help] || ''); return; }
    // ---- play setup
    if (ds.opps) { S().opps = +ds.opps; save(); renderPlay(); return; }
    if (ds.level) { S().level = ds.level; save(); renderPlay(); return; }
    if (ds.new) { closeSheet(); newGame(); return; }
    if (ds.online) { openOnline(); return; }
    if (ds.netleave) {
      if (G && !G.over) { confirmBox('Leave this game?', 'A computer takes over your seat.', 'Leave', netLeave); return; }
      netLeave(); return;
    }
    if (ds.netstart) { if (NET) NET.start().then((r) => { if (r && !r.ok) toast(r.message); }); return; }
    if (ds.seat != null) {
      if (!NET || !SNAP || !SNAP.seats) return;
      const st = SNAP.seats[+ds.seat];
      NET.setSeat(+ds.seat, st.kind === 'empty' ? 'computer' : 'empty').then((r) => { if (r && !r.ok) toast(r.message); });
      return;
    }
    if (ds.resume) { G = store.game; renderPlay(); run(++GEN); return; }
    if (ds.quit) {
      if (G && G.online) { if (G.over) netLeave(); else confirmBox('Leave this game?', 'A computer takes over your seat.', 'Leave', netLeave); return; }
      if (G && G.over) { quitGame(); return; }
      confirmBox('Quit this game?', 'It will count as unfinished.', 'Quit', quitGame); return;
    }
    if (ds.review) { openReview(); return; }
    // ---- play decisions
    if (G && G.s.pending && isHuman(G.s.pending.p)) {
      const pd = G.s.pending;
      if (ds.hint) { askHint(); renderPlay(); return; }
      if (ds.act && pd.kind === 'action') {
        const a = ds.act;
        if (E.ACTIONS[a].target) { selAction = selAction === a ? null : a; renderPlay(); return; }
        human({ action: a, target: -1 }); return;
      }
      if (ds.cancel) { selAction = null; renderPlay(); return; }
      if (ds.opp != null && pd.kind === 'action' && selAction) {
        const t = +ds.opp;
        if (!E.alive(G.s.players[t])) return;
        human({ action: selAction, target: t }); return;
      }
      if (ds.ch != null && pd.kind === 'challenge') { human({ challenge: ds.ch === '1' }); return; }
      if (ds.blk != null && pd.kind === 'block') { human({ block: ds.blk || null }); return; }
      if (ds.card != null && (pd.kind === 'lose' || pd.kind === 'show')) { human({ card: +ds.card }); return; }
      if (ds.exam != null && pd.kind === 'examine') { human({ force: ds.exam === '1' }); return; }
      if (ds.openx) { openExchange(); return; }
    }
    // ---- table
    if (ds.tn) { store.tableDraft.n = +ds.tn; if (store.tableDraft.me >= +ds.tn) store.tableDraft.me = 0; if (store.tableDraft.first >= +ds.tn) store.tableDraft.first = 0; save(); renderTable(); return; }
    if (ds.tme) { store.tableDraft.me = +ds.tme; save(); renderTable(); return; }
    if (ds.tfirst) { store.tableDraft.first = +ds.tfirst; save(); renderTable(); return; }
    if (ds.tcard) {
      const mc = store.tableDraft.myCards;
      const i = mc.indexOf(ds.tcard);
      if (i >= 0 && (mc.length < 2 || mc.filter((x) => x === ds.tcard).length === 2)) { mc.splice(i, 1); }
      else if (mc.length < 2) mc.push(ds.tcard);
      else { mc.shift(); mc.push(ds.tcard); }
      save(); renderTable(); return;
    }
    if (ds.tstart) {
      const ts = store.tableDraft;
      const names = ts.names.slice(0, ts.n).map((x, i) => (x || '').trim() || 'P' + (i + 1));
      store.table = { setup: { names, me: ts.me, myCards: ts.me >= 0 ? ts.myCards.slice() : [], first: ts.first, rules: { inquisitor: S().inquisitor } }, turns: [], partial: null };
      save(); renderTable(); return;
    }
    if (ds.tq != null) {
      const tb = store.table;
      const q = T.nextQuestion(tb.setup, tb.turns, tb.partial);
      if (!q) return;
      const opt = q.options[+ds.tq];
      tb.partial = T.answer(tb.partial, q, opt.value);
      commitIfDone(); return;
    }
    if (ds.tmulti != null) {
      const tb = store.table; const q = T.nextQuestion(tb.setup, tb.turns, tb.partial);
      tAnswer = tAnswer || [];
      const n = tAnswer.filter((x) => x === ds.tmulti).length;
      if (n && (tAnswer.length >= q.multi || n >= 2)) tAnswer.splice(tAnswer.indexOf(ds.tmulti), 1);
      else if (tAnswer.length < q.multi) tAnswer.push(ds.tmulti);
      else tAnswer.splice(tAnswer.indexOf(ds.tmulti), 1);
      renderTable(); return;
    }
    if (ds.tmok) {
      const tb = store.table; const q = T.nextQuestion(tb.setup, tb.turns, tb.partial);
      if (!q || !tAnswer || tAnswer.length !== q.multi) return;
      tb.partial = T.answer(tb.partial, q, tAnswer.slice()); tAnswer = null;
      commitIfDone(); return;
    }
    if (ds.tback) { const tb = store.table; tb.partial = { actor: tb.partial.actor }; tAnswer = null; save(); renderTable(); return; }
    if (ds.tactor) { const tb = store.table; tb.partial = {}; tAnswer = null; save(); renderTable(); return; }
    if (ds.tundo) { const tb = store.table; const last = tb.turns.pop(); tb.partial = last ? { actor: last.actor } : null; save(); renderTable(); toast('Last turn removed'); return; }
    if (ds.tnew) {
      confirmBox('New table?', 'This game moves to your history (it still counts toward each friend\'s bluff habits).', 'New table', () => {
        if (store.table && store.table.turns.length) { store.tableArchive = (store.tableArchive || []).concat([{ setup: store.table.setup, turns: store.table.turns }]).slice(-60); }
        store.table = null; save(); renderTable();
      });
      return;
    }
    // ---- settings
    if (ds.set) { const v = ds.val; S()[ds.set] = isNaN(+v) ? v : +v; save(); renderSettings(); return; }
    if (ds.resetstats) { confirmBox('Reset your record?', 'Wins and games played go back to zero.', 'Reset', () => { store.stats = JSON.parse(JSON.stringify(DEFAULTS.stats)); save(); renderSettings(); }); return; }
  });
  function commitIfDone() {
    const tb = store.table;
    const q = T.nextQuestion(tb.setup, tb.turns, tb.partial);
    if (!q && tb.partial.action) {
      tb.turns.push(tb.partial);
      const d = T.derive(tb.setup, tb.turns);
      tb.partial = { actor: d.next };
      toast('Turn saved');
    }
    save(); renderTable();
  }
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.sw) { S()[t.dataset.sw] = t.checked; save(); return; }
  });
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.tname != null) { store.tableDraft.names[+t.dataset.tname] = t.value; save(); return; }   // no re-render: keeps the keyboard up
    if (t.dataset.calc) { calc[t.dataset.calc] = +t.value; if (calc.copies > calc.unseen) calc.copies = calc.unseen; renderLearn(); }
  });
  // the table "you" buttons show names: refresh them when a name field loses focus
  document.addEventListener('focusout', (e) => { if (e.target.dataset && e.target.dataset.tname != null) renderTable(); });

  // ------------------------------------------------------------------ boot
  fetch('data/stats.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => { strength = j; render(); }).catch(() => {});
  if (store.game && store.game.s && store.game.s.pending !== undefined) {
    G = store.game;
    if (G.over) G = null;
  }
  setTab(store.tab || 'play');
  if (G && !G.over) run(++GEN);
  // back into an online room after a reload
  if (store.netOn) {
    netRoom().then((room) => room.resume()).then((ok) => { if (!ok) { NET = null; store.netOn = false; save(); renderPlay(); } })
      .catch(() => { NET = null; store.netOn = false; save(); renderPlay(); });
  }
  window.__coup = { get G() { return G; }, get SNAP() { return SNAP; }, store: () => store, newGame, step: (d) => human(d) };
})();
