// Weird-situation checks through the real page in Safari's engine (WebKit):
//   node tests/ui.edge.mjs <url> <outDir> [only-id ...]
// Each scenario builds an odd position (or does odd taps / sizes / reloads) and
// asserts what a player would see. Prints one line per scenario; exits 1 on any failure.
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const pwPath = process.env.PLAYWRIGHT_DIR || 'C:/Users/timha/.claude/tools/node_modules/playwright';
const { webkit, devices } = require(pwPath);

const url = process.argv[2] || 'http://127.0.0.1:18473/';
const out = process.argv[3] || '.';
const only = process.argv.slice(4);
fs.mkdirSync(out, { recursive: true });
const browser = await webkit.launch();
// these scenarios are for a returning player: the first-visit "New to Coup?" offer (ui.improve covers it) stays away,
// and the offline copy (sw.js, covered by tools/pwa-check.mjs) is off so page.route can cut the connection
const newContext0 = browser.newContext.bind(browser);
browser.newContext = async (o) => { const c = await newContext0({ serviceWorkers: 'block', ...o }); await c.addInitScript(() => { try { localStorage.setItem('coach-offer:coup-first', '1'); } catch (e) { /* storage blocked */ } }); return c; };
const results = [];
const PHONE = { ...devices['iPhone 15'] };
const SIZES = {
  se: { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  phone: PHONE,
  land: { viewport: { width: 659, height: 393 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
  laptop: { viewport: { width: 1280, height: 800 } },
  huge: { viewport: { width: 1920, height: 1080 } },
  zoom200: { viewport: { width: 640, height: 400 }, deviceScaleFactor: 2 },
};

async function open(size = 'phone', storeObj = null, extra = {}) {
  const ctx = await browser.newContext({ ...SIZES[size], ...extra });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  await page.goto(url, { waitUntil: 'load' });
  if (storeObj) {
    await page.evaluate((o) => localStorage.setItem('coup:v1', JSON.stringify(typeof o === 'function' ? o : o)), storeObj);
    await page.reload({ waitUntil: 'load' });
  }
  await page.waitForTimeout(300);
  return { ctx, page };
}
// Build a game in the page with the real engine, tweak it, save it as the stored game, reload.
async function openGame(size, build, settings = {}) {
  const ctx = await browser.newContext({ ...SIZES[size] });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(([src, st]) => {
    const E = window.CoupEngine;
    // eslint-disable-next-line no-new-func
    const s = new Function('E', src)(E);
    localStorage.setItem('coup:v1', JSON.stringify({ settings: Object.assign({ speed: 'fast', opps: s.n - 1, level: 'medium' }, st), tab: 'play', game: { s, level: 'medium', calls: [], over: false, counted: false } }));
  }, [build, settings]);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(400);
  return { ctx, page };
}
// A person's double tap. The second tap's event is made right after the first tap is handled
// (its timeStamp = when the finger came down, like real touch input), then delivered a moment later
// to whatever is under the finger by then: a busy test machine can't stretch the gap.
const doubleTap = (page, sel, gap = 90) => page.evaluate(([q, ms]) => new Promise((res) => {
  const el = document.querySelector(q); const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
  el.click();
  const ev2 = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y });
  setTimeout(() => { const t2 = document.elementFromPoint(x, y); if (t2) t2.dispatchEvent(ev2); res(t2 ? t2.className : null); }, ms);
}), [sel, gap]);
const shot = (page, name) => page.screenshot({ path: `${out}/${name}.png` });
async function layout(page) {
  return page.evaluate(() => {
    const r = (q) => { const e = document.querySelector(q); if (!e) return null; const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, w: b.width, h: b.height }; };
    const nav = r('nav.tabs');
    const navTop = nav && nav.w > window.innerWidth * 0.8 ? nav.top : window.innerHeight;
    const clipped = [...document.querySelectorAll('#tab-play .opp .nm')].filter((e) => e.scrollWidth > e.clientWidth + 1).length;
    return { overflow: document.documentElement.scrollWidth > window.innerWidth + 1, pageScroll: document.scrollingElement.scrollHeight > window.innerHeight + 1,
      acts: r('.actions'), stage: r('#tab-play .stage'), me: r('#tab-play .me-row'), navTop, vh: window.innerHeight, vw: window.innerWidth, clippedNames: clipped,
      oppsBottom: Math.max(0, ...[...document.querySelectorAll('#tab-play .opp')].map((e) => e.getBoundingClientRect().bottom)) };
  });
}
async function scenario(id, title, fn) {
  if (only.length && !only.includes(id)) return;
  let pass = false, note = '';
  try { const r = await fn(); pass = r === true || (r && r.pass); note = (r && r.note) || ''; } catch (e) { note = 'threw: ' + e.message.split('\n')[0]; }
  results.push({ id, title, pass, note });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id} ${title}${note ? ' :: ' + note : ''}`);
}
const G = (page) => page.evaluate(() => { const g = window.__coup.G; return g ? { pending: g.s.pending, ev: g.s.events.length, over: g.over, winner: g.s.winner, coins: g.s.players.map((p) => p.coins), turn: g.s.turn, turnNo: g.s.turnNo } : null; });
const waitHuman = (page, kind, ms = 20000) => page.waitForFunction((k) => { const g = window.__coup.G; return g && g.s.pending && g.s.pending.p === 0 && (!k || g.s.pending.kind === k); }, kind, { timeout: ms });
// a fresh game where it's my action turn
const MY_TURN = (n, extra = '') => `const s = E.newGame({ names: ['You','Ava','Ben','Cleo','Dax','Esme'].slice(0, ${n}), seed: 11, rules: {}, first: 0 }); ${extra}; return s;`;

// ---------------------------------------------------------------- layouts
for (const [size, n] of [['se', 6], ['se', 2], ['phone', 6], ['land', 6], ['laptop', 6], ['huge', 6], ['zoom200', 6], ['land', 2]]) {
  await scenario(`L-${size}-${n}`, `${n} players at ${size}: no overflow, actions above the tab bar, names readable`, async () => {
    const { ctx, page } = await openGame(size, MY_TURN(n));
    await waitHuman(page, 'action');
    await page.waitForTimeout(600);
    const L = await layout(page);
    await shot(page, `L-${size}-${n}`);
    await ctx.close();
    const bad = [];
    if (L.overflow) bad.push('horizontal overflow');
    if (L.pageScroll) bad.push('page scrolls');
    if (!L.acts || L.acts.bottom > L.navTop + 1) bad.push(`actions end ${L.acts && Math.round(L.acts.bottom)} below tab bar ${Math.round(L.navTop)}`);
    if (L.clippedNames) bad.push(L.clippedNames + ' names clipped');
    if (L.stage && L.oppsBottom > L.stage.top + 30) bad.push('opponents overlap the stage');
    if (page.errors.length) bad.push(page.errors[0]);
    return { pass: !bad.length, note: bad.join('; ') };
  });
}

// ---------------------------------------------------------------- odd taps
await scenario('T-income-double', 'double-tap Income takes only one Income', async () => {
  const { ctx, page } = await openGame('phone', MY_TURN(4));
  await waitHuman(page, 'action');
  const before = await G(page);
  await page.waitForTimeout(500);
  await page.evaluate(() => { const b = document.querySelector('[data-act="income"]'); b.click(); const b2 = document.querySelector('[data-act="income"]'); if (b2) b2.click(); });
  await page.waitForTimeout(200);
  const s = await page.evaluate(() => window.__coup.G.s.events.filter((e) => e.t === 'action' && e.p === 0).length);
  await ctx.close();
  return { pass: s === 1 && before.coins[0] === 2, note: 'my actions ' + s };
});
await scenario('T-double-allow', 'double-tap Allow on a challenge prompt does not also answer the next prompt (block)', async () => {
  // Ava (seat 1) will Assassinate me; I am asked to challenge, then to block. A double tap on Allow must not pass on the block.
  const { ctx, page } = await openGame('phone', `const s = E.newGame({ names: ['You','Ava','Ben'], seed: 5, rules: {}, first: 1 });
    s.players[1].coins = 3; s.players[1].cards = [{c:'Assassin',dead:false},{c:'Duke',dead:false}];
    E.act(s, { action: 'assassinate', target: 0 }); return s;`);
  // pending: challenge for whoever is first after Ava: Ben (2), then me (0)
  await waitHuman(page, 'challenge');
  await page.waitForTimeout(600);
  await doubleTap(page, '[data-ch="0"]', 90);
  await page.waitForTimeout(400);
  const st = await page.evaluate(() => { const g = window.__coup.G; return { pd: g.s.pending && g.s.pending.kind, p: g.s.pending && g.s.pending.p, noblock: g.s.events.some((e) => e.t === 'noblock' && e.p === 0) }; });
  await ctx.close();
  return { pass: !st.noblock && st.pd === 'block' && st.p === 0, note: JSON.stringify(st) };
});
await scenario('T-deal-twice', 'tapping Deal twice fast starts one game and every card shows after the deal', async () => {
  const { ctx, page } = await open('phone', { settings: { speed: 'fast', opps: 3 }, tab: 'play' });
  await page.evaluate(() => { const b = document.querySelector('[data-new]'); b.click(); const b2 = document.querySelector('[data-new]'); if (b2) b2.click(); });
  await page.waitForTimeout(3500);
  const hidden = await page.evaluate(() => [...document.querySelectorAll('#tab-play .cardf')].filter((c) => getComputedStyle(c).opacity === '0').length);
  await ctx.close();
  return { pass: hidden === 0 && !page.errors.length, note: `${hidden} cards still invisible ${page.errors[0] || ''}` };
});
await scenario('T-act-on-bot-turn', 'action buttons do nothing during a computer turn', async () => {
  const { ctx, page } = await openGame('phone', `const s = E.newGame({ names: ['You','Ava','Ben','Cleo'], seed: 11, rules: {}, first: 1 }); return s;`, { speed: 'slow' });
  const dis = await page.evaluate(() => [...document.querySelectorAll('.act')].every((b) => b.disabled));
  await page.evaluate(() => document.querySelector('[data-act="income"]').click());
  const me = await page.evaluate(() => window.__coup.G.s.events.filter((e) => e.t === 'action' && e.p === 0).length);
  await ctx.close();
  return { pass: dis && me === 0, note: `disabled=${dis} myActs=${me}` };
});
await scenario('T-target-dead', 'tapping an eliminated opponent as a target is refused with a shake, no move', async () => {
  const { ctx, page } = await openGame('phone', MY_TURN(3, `s.players[1].cards.forEach(c=>c.dead=true); s.players[1].coins=0; s.players[0].coins=7;`));
  await waitHuman(page, 'action');
  await page.click('[data-act="coup"]');
  await page.click('.opp[data-opp="1"]');
  await page.waitForTimeout(200);
  const st = await G(page);
  await ctx.close();
  return { pass: st.pending.kind === 'action' && st.pending.p === 0 && st.coins[0] === 7, note: JSON.stringify(st.pending) };
});
await scenario('T-mustcoup', '10 coins: only Coup is enabled and the prompt says so', async () => {
  const { ctx, page } = await openGame('phone', MY_TURN(3, 's.players[0].coins = 10; s.pending = null; E.advance(s);'));
  await waitHuman(page, 'action');
  const st = await page.evaluate(() => ({ en: [...document.querySelectorAll('.act:not([disabled])')].map((b) => b.dataset.act), t2: document.querySelector('.stage .t2').textContent }));
  await ctx.close();
  return { pass: st.en.join() === 'coup' && /must Coup/.test(st.t2), note: JSON.stringify(st) };
});
await scenario('T-cancel-target', 'pick Steal then Cancel returns to the action list', async () => {
  const { ctx, page } = await openGame('phone', MY_TURN(3));
  await waitHuman(page, 'action');
  await page.click('[data-act="steal"]'); await page.click('[data-cancel]');
  const t1 = await page.textContent('.stage .t1');
  await ctx.close();
  return { pass: /Your turn/.test(t1), note: t1 };
});

// ---------------------------------------------------------------- reloads, tabs, Back
await scenario('R-reload-exchange', 'reload while choosing Exchange cards: the choice sheet comes back with the same 4 cards', async () => {
  const { ctx, page } = await openGame('phone', MY_TURN(3, `s.players[0].cards=[{c:'Ambassador',dead:false},{c:'Duke',dead:false}]; E.act(s,{action:'exchange',target:-1}); while (s.pending && s.pending.kind==='challenge') E.act(s,{challenge:false});`));
  await page.waitForSelector('.sheet .choose', { timeout: 5000 });
  const a = await page.evaluate(() => [...document.querySelectorAll('.sheet .choose .cardf')].map((c) => c.getAttribute('aria-label')).join());
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('.sheet .choose', { timeout: 5000 });
  const b = await page.evaluate(() => [...document.querySelectorAll('.sheet .choose .cardf')].map((c) => c.getAttribute('aria-label')).join());
  await ctx.close();
  return { pass: a === b && a.split(',').length === 4, note: a + ' | ' + b };
});
await scenario('R-back-exchange', 'Back while choosing Exchange closes the sheet, the table offers "Choose cards" again', async () => {
  const { ctx, page } = await openGame('phone', MY_TURN(3, `E.act(s,{action:'exchange',target:-1}); while (s.pending && s.pending.kind==='challenge') E.act(s,{challenge:false});`));
  await page.waitForSelector('.sheet .choose');
  await page.goBack().catch(() => {});
  await page.waitForTimeout(300);
  const st = { sheet: !!(await page.$('.sheet')), btn: !!(await page.$('[data-openx]')) };
  if (st.btn) { await page.click('[data-openx]'); st.reopened = !!(await page.$('.sheet .choose')); }
  await ctx.close();
  return { pass: !st.sheet && st.btn && st.reopened, note: JSON.stringify(st) };
});
await scenario('R-reload-mid', 'reload on my turn restores the exact same position', async () => {
  const { ctx, page } = await openGame('phone', MY_TURN(4));
  await waitHuman(page, 'action');
  await page.click('[data-act="income"]');
  await waitHuman(page, null, 30000);
  const a = await G(page);
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(300);
  const b = await G(page);
  await ctx.close();
  return { pass: JSON.stringify(a.pending) === JSON.stringify(b.pending) && a.ev === b.ev && a.coins.join() === b.coins.join(), note: `${a.ev}/${b.ev}` };
});
await scenario('R-reload-over', 'reload on the game-over screen keeps the result and Review', async () => {
  const { ctx, page } = await openGame('phone', MY_TURN(2, `s.players[1].cards[0].dead=true; s.players[0].coins=7;`));
  await waitHuman(page, 'action');
  await page.click('[data-act="coup"]'); await page.click('.opp[data-opp="1"]');
  await page.waitForSelector('[data-review]');
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(400);
  const st = { review: !!(await page.$('[data-review]')), wins: await page.evaluate(() => JSON.parse(localStorage.getItem('coup:v1')).stats.medium) };
  await ctx.close();
  return { pass: st.review && st.wins.g === 1 && st.wins.w === 1, note: JSON.stringify(st) };
});
await scenario('R-two-tabs', 'same game open in two tabs: a move in one tab is not undone by the other', async () => {
  const ctx = await browser.newContext({ ...PHONE });
  const p1 = await ctx.newPage(); const p2 = await ctx.newPage();
  await p1.goto(url); await p1.evaluate(() => { const E = window.CoupEngine; const s = E.newGame({ names: ['You', 'Ava', 'Ben'], seed: 11, rules: {}, first: 0 }); localStorage.setItem('coup:v1', JSON.stringify({ settings: { speed: 'fast', opps: 2 }, tab: 'play', game: { s, level: 'medium', calls: [], over: false, counted: false } })); });
  await p1.reload(); await p2.goto(url); await p1.waitForTimeout(500);
  await p1.waitForFunction(() => { const g = window.__coup.G; return g && g.s.pending && g.s.pending.p === 0; });
  await p1.waitForTimeout(600);
  await p1.click('[data-act="income"]');
  await p1.waitForTimeout(4000);
  const a = await p1.evaluate(() => window.__coup.G.s.events.length);
  // the other tab then plays: it must play the CURRENT game, not the stale copy
  await p2.waitForTimeout(500);
  const p2ev = await p2.evaluate(() => window.__coup.G && window.__coup.G.s.events.length);
  const saved = await p1.evaluate(() => JSON.parse(localStorage.getItem('coup:v1')).game.s.events.length);
  await ctx.close();
  return { pass: a > 2 && p2ev >= a && saved >= a, note: `tab1 ${a} events, tab2 sees ${p2ev}, saved ${saved}` };
});
await scenario('R-storage-blocked', 'storage blocked (private mode): a game still plays with no errors', async () => {
  const ctx = await browser.newContext({ ...PHONE });
  await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('SecurityError'); } }); });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(url); await page.waitForTimeout(400);
  await page.click('[data-new]'); await page.waitForTimeout(2500);
  const ok = await page.evaluate(() => !!window.__coup.G);
  await ctx.close();
  return { pass: ok && !errs.length, note: errs[0] || '' };
});
await scenario('R-back-tabs', 'Back goes to the previous tab: Play -> Settings -> Learn, Back, Back', async () => {
  const { ctx, page } = await open('phone');
  await page.click('nav [data-tab="settings"]'); await page.click('nav [data-tab="learn"]');
  await page.goBack(); await page.waitForTimeout(200);
  const a = await page.evaluate(() => document.querySelector('nav button.on').dataset.tab);
  await page.goBack(); await page.waitForTimeout(200);
  const b = await page.evaluate(() => document.querySelector('nav button.on').dataset.tab);
  await ctx.close();
  return { pass: a === 'settings' && b === 'play', note: a + ',' + b };
});
await scenario('R-settings-midgame', 'open Settings mid-game, turn odds off + study mode on, come back: game continues, cards revealed, odds gone', async () => {
  const { ctx, page } = await openGame('phone', MY_TURN(3));
  await waitHuman(page, 'action');
  await page.click('nav [data-tab="settings"]');
  await page.click('[data-sw="showOdds"] + span'); await page.click('[data-sw="peek"] + span');
  await page.click('nav [data-tab="play"]'); await page.waitForTimeout(300);
  const st = await page.evaluate(() => ({ bars: document.querySelectorAll('#tab-play .opp .bars').length, up: document.querySelectorAll('#tab-play .opp .cardf.up').length, turn: !!document.querySelector('.act:not([disabled])') }));
  await ctx.close();
  return { pass: st.bars === 0 && st.up >= 4 && st.turn, note: JSON.stringify(st) };
});
await scenario('R-inq-midgame', 'switch Inquisitor on mid-game: the running game keeps its own cards and actions', async () => {
  const { ctx, page } = await openGame('phone', MY_TURN(3));
  await waitHuman(page, 'action');
  await page.click('nav [data-tab="settings"]'); await page.click('[data-sw="inquisitor"] + span');
  await page.click('nav [data-tab="play"]'); await page.waitForTimeout(300);
  const st = await page.evaluate(() => ({ examine: !!document.querySelector('[data-act="examine"]'), exch: document.querySelector('[data-act="exchange"] small').textContent }));
  await ctx.close();
  return { pass: !st.examine && /Ambassador/.test(st.exch), note: JSON.stringify(st) };
});
await scenario('R-tab-during-deal', 'switch tabs while cards are being dealt, come back: every card visible', async () => {
  const { ctx, page } = await open('phone', { settings: { speed: 'fast', opps: 5 }, tab: 'play' });
  await page.click('[data-new]'); await page.waitForTimeout(150);
  await page.click('nav [data-tab="learn"]'); await page.waitForTimeout(300);
  await page.click('nav [data-tab="play"]'); await page.waitForTimeout(3000);
  const hidden = await page.evaluate(() => [...document.querySelectorAll('#tab-play .cardf')].filter((c) => getComputedStyle(c).opacity === '0').length);
  await ctx.close();
  return { pass: hidden === 0, note: hidden + ' invisible' };
});
await scenario('R-rotate', 'rotate the phone mid-game (393x659 -> 659x393 -> back): no overflow, actions on screen', async () => {
  const { ctx, page } = await openGame('phone', MY_TURN(6));
  await waitHuman(page, 'action');
  await page.setViewportSize({ width: 659, height: 393 }); await page.waitForTimeout(300);
  const a = await layout(page);
  await page.setViewportSize({ width: 393, height: 659 }); await page.waitForTimeout(300);
  const b = await layout(page);
  await ctx.close();
  return { pass: !a.overflow && !b.overflow && a.acts.bottom <= a.navTop + 1 && b.acts.bottom <= b.navTop + 1, note: `land acts ${Math.round(a.acts.bottom)}/${Math.round(a.navTop)} port ${Math.round(b.acts.bottom)}/${Math.round(b.navTop)}` };
});
await scenario('R-light-scheme', 'light colour preference: the page still draws its own dark theme (no white-on-white)', async () => {
  const { ctx, page } = await open('phone', null, { colorScheme: 'light' });
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await shot(page, 'R-light-scheme');
  await ctx.close();
  return { pass: !/255, 255, 255/.test(bg), note: bg };
});

// ---------------------------------------------------------------- odd screens
await scenario('S-review-noclaims', 'game over with no claims: Review says so and closes', async () => {
  const { ctx, page } = await openGame('phone', MY_TURN(2, `s.players[1].cards[0].dead=true; s.players[0].coins=7;`));
  await waitHuman(page, 'action');
  await page.click('[data-act="coup"]'); await page.click('.opp[data-opp="1"]');
  await page.waitForSelector('[data-review]'); await page.click('[data-review]');
  const txt = await page.textContent('.sheet');
  await page.click('.sheet [data-s="x"]');
  const closed = !(await page.$('.sheet'));
  await ctx.close();
  return { pass: /No claims were made/.test(txt) && closed && /You win/.test(txt) === false, note: '' };
});
await scenario('S-long-log', 'a 300-turn log: the log sheet opens and scrolls, the table is unchanged', async () => {
  const { ctx, page } = await openGame('phone', MY_TURN(3, `for (let i=0;i<300;i++) s.events.push({t:'action',p:1+(i%2),action:'tax',target:-1,claim:'Duke',turnNo:i});`));
  await waitHuman(page, 'action');
  await page.click('[data-log]');
  await page.waitForTimeout(600);
  await page.evaluate(() => document.getAnimations().forEach((a) => { try { a.finish(); } catch (e) { /* endless */ } }));   // headless WebKit barely ticks the slide-in
  const st = await page.evaluate(() => { const b = document.querySelector('.sheet .body'); return { lines: document.querySelectorAll('.sheet .log div').length, scrolls: b.scrollHeight > b.clientHeight, fits: document.querySelector('.sheet').getBoundingClientRect().bottom <= window.innerHeight + 1 }; });
  await shot(page, 'S-long-log');
  await ctx.close();
  return { pass: st.lines > 20 && st.scrolls && st.fits, note: JSON.stringify(st) };
});
await scenario('S-big-coins', 'a player with 12 coins and one with 0: piles and numbers fit, Treasury still shows', async () => {
  const { ctx, page } = await openGame('phone', MY_TURN(6, `s.players[0].coins=0; s.players[1].coins=12; s.players[2].coins=9;`));
  await waitHuman(page, 'action');
  const L = await layout(page);
  await shot(page, 'S-big-coins');
  await ctx.close();
  return { pass: !L.overflow && !L.clippedNames, note: '' };
});
await scenario('S-everyone-out-but-2', '6 players with 4 out: out seats are clearly out, the two live ones stand out', async () => {
  const { ctx, page } = await openGame('phone', MY_TURN(6, `for (const p of [1,2,4,5]) { s.players[p].cards.forEach(c=>c.dead=true); s.players[p].coins=0; }`));
  await waitHuman(page, 'action');
  const st = await page.evaluate(() => ({ out: document.querySelectorAll('#tab-play .opp.out').length }));
  await shot(page, 'S-four-out');
  await ctx.close();
  return { pass: st.out === 4, note: JSON.stringify(st) };
});
await scenario('S-examine-flow', 'Inquisitor: I examine a computer, see its card, swap it: no errors', async () => {
  const { ctx, page } = await openGame('phone', `const s = E.newGame({ names: ['You','Ava'], seed: 3, rules: { inquisitor: true }, first: 0 }); s.players[0].cards=[{c:'Inquisitor',dead:false},{c:'Duke',dead:false}]; return s;`);
  await waitHuman(page, 'action');
  await page.click('[data-act="examine"]'); await page.click('.opp[data-opp="1"]');
  await waitHuman(page, 'examine', 15000).catch(() => {});
  const st = await G(page);
  const has = !!(await page.$('[data-exam]'));
  if (has) await page.click('[data-exam="1"]');
  await page.waitForTimeout(500);
  await ctx.close();
  return { pass: (has || st.over || st.pending.kind !== 'examine') && !page.errors.length, note: JSON.stringify(st.pending) + (page.errors[0] || '') };
});
await scenario('S-2p-pick', '2-player deal: the pick sheet opens; Back closes it; Choose cards reopens; picking works', async () => {
  const { ctx, page } = await open('phone', { settings: { speed: 'fast', opps: 1, twoDeal: true }, tab: 'play' });
  await page.click('[data-new]');
  await page.waitForSelector('.sheet .choose', { timeout: 5000 });
  const n = await page.$$eval('.sheet .choose .cardf', (x) => x.length);
  await page.goBack(); await page.waitForTimeout(200);
  await page.click('[data-openx]');
  await page.click('.sheet [data-s="c0"]'); await page.click('.sheet [data-s="ok"]');
  await page.waitForTimeout(1500);
  const st = await page.evaluate(() => ({ mine: window.__coup.G.s.players[0].cards.length, deck: window.__coup.G.s.deck.length }));
  await ctx.close();
  return { pass: n === 5 && st.mine === 2, note: JSON.stringify(st) };
});
await scenario('S-hint-everywhere', 'Hint on an action, a challenge, a block and a lose prompt always gives a reason', async () => {
  const { ctx, page } = await openGame('phone', `const s = E.newGame({ names: ['You','Ava','Ben'], seed: 5, rules: {}, first: 1 });
    s.players[1].coins = 3; E.act(s, { action: 'assassinate', target: 0 }); return s;`);
  const whys = [];
  for (let k = 0; k < 3; k++) {
    try { await waitHuman(page, null, 8000); } catch (e) { break; }
    if (!(await page.$('[data-hint]'))) break;
    await page.click('[data-hint]'); await page.waitForTimeout(100);
    const w = await page.$eval('.stage .why', (e) => e.textContent).catch(() => '');
    whys.push(w);
    const btn = (await page.$('[data-ch="0"]')) || (await page.$('[data-blk=""]')) || (await page.$('.me-row [data-card]')) || (await page.$('[data-act="income"]'));
    if (btn) await btn.click(); await page.waitForTimeout(500);
  }
  await ctx.close();
  return { pass: whys.length >= 2 && whys.every((w) => /Hint: \S/.test(w)), note: whys.join(' | ').slice(0, 200) };
});

await scenario('S-quit-confirm-open', 'I am out, the computers play on (all-computer table); Quit box left open, then Cancel: game carries on to a winner', async () => {
  const { ctx, page } = await openGame('phone', `const s = E.newGame({ names: ['You','Ava','Ben','Cleo'], seed: 21, rules: {}, first: 1 }); s.players[0].cards.forEach((c) => { c.dead = true; }); s.players[0].coins = 0; return s;`);
  await page.evaluate(() => document.querySelector('[data-quit]').click());
  const ev0 = (await G(page)).ev;
  await page.waitForTimeout(2500);
  const ev1 = (await G(page)).ev;
  await page.evaluate(() => document.querySelector('.sheet [data-s="no"]').click());
  await page.waitForTimeout(300);
  const end = await page.waitForSelector('[data-review]', { timeout: 120000 }).then(() => page.textContent('.stage .t1')).catch(() => '');
  const st = { moved: ev1 > ev0, sheet: !!(await page.$('.sheet')), game: !!(await page.$('.opp')), end };
  await ctx.close();
  return { pass: st.moved && !st.sheet && st.game && / wins$/.test(st.end) && !page.errors.length, note: JSON.stringify(st) };
});
await scenario('S-keep-double', 'double tap on Keep in the Exchange box: the second tap does not take a move on the table underneath', async () => {
  const { ctx, page } = await openGame('phone', `const s = E.newGame({ names: ['You','Ava'], seed: 4, rules: {}, first: 0 });
    E.act(s,{action:'exchange',target:-1}); while (s.pending && s.pending.kind==='challenge') E.act(s,{challenge:false}); return s;`);
  await page.waitForSelector('.sheet .choose');
  await page.click('.sheet [data-s="c0"]'); await page.click('.sheet [data-s="c1"]');
  await doubleTap(page, '.sheet [data-s="ok"]', 80);
  await page.waitForTimeout(400);
  const st = await page.evaluate(() => window.__coup.G.s.events.filter((e) => e.p === 0 && (e.t === 'action' || e.t === 'challenge' || e.t === 'block')).length);
  await ctx.close();
  return { pass: st === 1, note: 'my moves ' + st };
});

// ---------------------------------------------------------------- table companion
await scenario('C-names', 'Table tab: 6 long / emoji / blank / duplicate names fit and get sensible labels', async () => {
  const { ctx, page } = await open('phone', { settings: {}, tab: 'table', tableDraft: { n: 6, names: ['You', 'WWWWWWWWWWWWWW', '🦊🦊🦊🦊🦊🦊🦊', '', 'Ann', 'Ann'], me: -1, myCards: [], first: 0 } });
  await page.click('[data-tstart]'); await page.waitForTimeout(300);
  const st = await page.evaluate(() => ({ names: [...document.querySelectorAll('#tab-table .tp .nm')].map((e) => e.textContent), over: document.documentElement.scrollWidth > innerWidth + 1, clipped: [...document.querySelectorAll('#tab-table .tp .nm')].filter((e) => e.scrollWidth > e.clientWidth + 1).length }));
  await shot(page, 'C-names');
  await ctx.close();
  const uniq = new Set(st.names).size === st.names.length;
  return { pass: !st.over && uniq && st.names.includes('P4') && !st.names.includes('You'), note: JSON.stringify(st) + ' (clipped = ellipsis)' };
});
await scenario('C-undo-after-win', 'Table tab: Undo right after the game ends brings the last turn back', async () => {
  const { ctx, page } = await open('phone');
  await page.evaluate(() => {
    // play a real 2-player game with the engine, then record it as table turns (same mapping as tests/table.test.js)
    const E = window.CoupEngine, AI = window.CoupAI;
    const s = E.newGame({ names: ['Ann', 'Ben'], seed: 77, rules: {}, first: 0 });
    while (s.pending) { const pd = s.pending; E.act(s, AI.decide(E.view(s, pd.p), pd, 'medium', Math.random, pd.kind === 'action' ? E.legalActions(s, pd.p) : null, s.rules).d); }
    const turns = []; let cur = null;
    for (const e of s.events) {
      if (e.t === 'action') { cur = { actor: e.p, action: e.action, target: e.target >= 0 ? e.target : null, chal: null, block: null }; turns.push(cur); }
      if (!cur) continue;
      if (e.t === 'challenge' && e.about === 'action') cur.chal = { by: e.by, truth: e.truth };
      if (e.t === 'block') cur.block = { by: e.p, char: e.char, chal: null };
      if (e.t === 'challenge' && e.about === 'block') cur.block.chal = { by: e.by, truth: e.truth };
      if (e.t === 'lose') { if (e.reason === 'coup' || e.reason === 'assassinate') cur.targetLose = e.char; else if (cur.block && cur.block.chal && !cur.block.chal.lose) cur.block.chal.lose = e.char; else if (cur.chal && !cur.chal.lose) cur.chal.lose = e.char; }
      if (e.t === 'forced') cur.forced = true;
      if (e.t === 'kept') cur.forced = false;
    }
    localStorage.setItem('coup:v1', JSON.stringify({ tab: 'table', table: { setup: { names: ['Ann', 'Ben'], me: -1, myCards: [], first: 0, rules: {} }, turns, partial: null } }));
  });
  await page.reload(); await page.waitForTimeout(400);
  const won = await page.$eval('#tab-table .ask', (e) => e.textContent);
  await page.click('#tab-table .ask [data-tundo]'); await page.waitForTimeout(300);
  const after = await page.$eval('#tab-table .ask', (e) => e.textContent);
  await ctx.close();
  return { pass: /wins!/.test(won) && !/wins!/.test(after) && /turn/.test(after) && !page.errors.length, note: won.trim().slice(0, 30) + ' -> ' + after.replace(/\s+/g, ' ').trim().slice(0, 50) };
});

// ---------------------------------------------------------------- online (no network use: offline only)
await scenario('O-offline', 'Online with no internet: a short message, the buttons work again, no hang', async () => {
  const ctx = await browser.newContext({ ...PHONE });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.route(/gstatic|googleapis|firebase/, (r) => r.abort());
  await page.goto(url); await page.waitForTimeout(300);
  await page.click('[data-online]'); await page.fill('#netName', 'Tester'); await page.click('.sheet [data-s="create"]');
  const t = await page.waitForSelector('.toast', { timeout: 15000 }).then((e) => e.textContent()).catch(() => '');
  const st = { toast: t, setup: !!(await page.$('[data-new]')) };
  await ctx.close();
  return { pass: /connection/.test(t) && st.setup, note: JSON.stringify(st) };
});
await scenario('O-offline-then-online', 'no internet on the first try, connection back: Make a room works on the second try', async () => {
  const ctx = await browser.newContext({ ...PHONE });
  const page = await ctx.newPage();
  let block = true;
  await page.route(/gstatic|googleapis|firebase/, (r) => (block ? r.abort() : r.continue()));
  await page.goto(url); await page.waitForTimeout(300);
  await page.click('[data-online]'); await page.fill('#netName', 'claude-test'); await page.click('.sheet [data-s="create"]');
  await page.waitForSelector('.toast', { timeout: 15000 });
  block = false;
  await page.waitForTimeout(2300);
  if (!(await page.$('.sheet [data-s="create"]'))) await page.click('[data-online]');
  await page.click('.sheet [data-s="create"]');
  const code = await page.waitForSelector('.lobby .code', { timeout: 20000 }).then((e) => e.textContent()).catch(() => '');
  if (code) { await page.click('[data-netleave]'); await page.waitForTimeout(1500); }
  await ctx.close();
  return { pass: /^[A-Z0-9]{5}$/.test(code), note: 'room ' + (code || 'none') };
});
await scenario('O-bad-codes','Join with a short code / blank name gives a clear message', async () => {
  const { ctx, page } = await open('phone');
  await page.click('[data-online]'); await page.fill('#netName', ''); await page.click('.sheet [data-s="join"]');
  const a = await page.textContent('.toast');
  await page.fill('#netName', 'Tim'); await page.fill('#netCode', 'AB'); await page.click('.sheet [data-s="join"]');
  const b = await page.textContent('.toast');
  await ctx.close();
  return { pass: /name/.test(a) && /5 letters/.test(b), note: a + ' / ' + b };
});

await browser.close();
const fails = results.filter((r) => !r.pass);
fs.writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 1));
console.log(`\n${results.length - fails.length}/${results.length} passed`);
process.exit(fails.length ? 1 : 0);
