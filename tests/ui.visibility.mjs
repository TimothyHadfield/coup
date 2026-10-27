// Can a player see what's happening? Layout checks through the real page in Safari's engine (WebKit):
//   node tests/ui.visibility.mjs <url> [outDir]
// Each check builds a game position with the real engine, opens it at a real screen size and measures.
// Exits 1 on any failure.
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const pwPath = process.env.PLAYWRIGHT_DIR || 'C:/Users/timha/.claude/tools/node_modules/playwright';
const { webkit, devices } = require(pwPath);

const url = process.argv[2] || 'http://127.0.0.1:18473/';
const out = process.argv[3] || '';
if (out) fs.mkdirSync(out, { recursive: true });
const browser = await webkit.launch();
const SIZES = {
  phone: { ...devices['iPhone 15'] },
  se: { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  land: { viewport: { width: 659, height: 393 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
  laptop: { viewport: { width: 1280, height: 800 } },
  big: { viewport: { width: 1440, height: 900 } },
};
const NAMES = "['You','Ava','Ben','Cleo','Dax','Esme']";
const POS = {
  turn6: `return E.newGame({ names: ${NAMES}, seed: 11, rules: {}, first: 0 });`,
  turn2: `return E.newGame({ names: ${NAMES}.slice(0, 2), seed: 11, rules: {}, first: 0 });`,
  challenge6: `const s = E.newGame({ names: ${NAMES}, seed: 7, rules: {}, first: 1 });
    s.players[3].cards[0].dead = true; s.players[0].cards[1].dead = true;
    E.act(s, { action: 'tax' }); while (s.pending && s.pending.p !== 0) E.act(s, { challenge: false }); return s;`,
  late6: `const s = E.newGame({ names: ${NAMES}, seed: 5, rules: {}, first: 0 });
    for (const i of [2,4,5]) s.players[i].cards.forEach(c => c.dead = true);
    s.players[1].cards[0].dead = true; s.players[0].cards[0].dead = true;
    s.players[0].coins = 7; s.players[1].coins = 12; s.players[3].coins = 3; return s;`,
  block6: `const s = E.newGame({ names: ${NAMES}, seed: 7, rules: {}, first: 1 });
    s.players[0].coins = 4; E.act(s, { action: 'steal', target: 0 });
    while (s.pending && s.pending.kind === 'challenge') E.act(s, { challenge: false }); return s;`,
};
async function open(size, pos) {
  const ctx = await browser.newContext({ ...SIZES[size] });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate((src) => {
    const E = window.CoupEngine; const s = new Function('E', src)(E);
    localStorage.setItem('coup:v1', JSON.stringify({ settings: { speed: 'fast', opps: s.players.length - 1, level: 'medium' }, tab: 'play', game: { s, level: 'medium', calls: [], over: false, counted: false } }));
  }, POS[pos]);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => { const g = window.__coup.G; return g && g.s.pending && g.s.pending.p === 0; }, null, { timeout: 15000 });
  await page.waitForTimeout(700);
  return { ctx, page };
}
const M = (page) => page.evaluate(() => {
  const R = (e) => e && e.getBoundingClientRect();
  const q = (s) => document.querySelector(s), qa = (s) => [...document.querySelectorAll(s)];
  const nav = R(q('nav.tabs')); const floor = nav.width > innerWidth * 0.8 ? nav.top : innerHeight;
  const side = q('#tab-play .side-col'); const sideX = side && getComputedStyle(side).display !== 'none' ? R(side).left : Infinity;
  const oc = R(q('#tab-play .opp .cardf'));
  const acts = qa('#tab-play .stage .acts .btn').map(R);
  const me = R(q('#tab-play .me-row .cards'));
  return {
    oppW: oc ? Math.round(oc.width) : 0, oppRatio: oc ? oc.height / oc.width : 0,
    underSide: qa('#tab-play .opp, #tab-play .me-row .btn, #tab-play .stage .btn').filter((e) => R(e).right > sideX + 1).map((e) => e.textContent.trim().slice(0, 12) || e.className),
    refBottom: Math.round(R(q('#tab-play .actions')).bottom), floor: Math.round(floor),
    btnOverCards: acts.length && me ? Math.round(Math.max(...acts.map((b) => b.bottom)) - me.top) : -1,
    btnOverRef: acts.length ? Math.round(Math.max(...acts.map((b) => b.bottom)) - R(q('#tab-play .actions')).top) : -1,
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
  };
});
const results = [];
async function check(id, title, size, pos, fn) {
  let pass = false, note = '';
  const { ctx, page } = await open(size, pos);
  try { const r = await fn(page); pass = r.pass; note = r.note || ''; if (page.errors.length) { pass = false; note += ' ' + page.errors[0]; } }
  catch (e) { note = 'threw: ' + e.message.split('\n')[0]; }
  if (out) await page.screenshot({ path: `${out}/${id}.png` }).catch(() => {});
  await ctx.close();
  results.push({ id, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id} ${title}${note ? ' :: ' + note : ''}`);
}

for (const size of ['laptop', 'big']) {
  await check(`V-${size}-6`, `6 players at ${size}: every seat and button clear of the side panel, opponents' cards at least 60px wide`, size, 'challenge6', async (page) => {
    const m = await M(page);
    const bad = [];
    if (m.underSide.length) bad.push('under the side panel: ' + m.underSide.join(', '));
    if (m.oppW < 60) bad.push(`opponent cards ${m.oppW}px wide`);
    if (Math.abs(m.oppRatio - 88 / 63) > 0.08) bad.push('cards out of shape ' + m.oppRatio.toFixed(2));
    return { pass: !bad.length, note: bad.join('; ') };
  });
}
await check('V-phone-2', '2 players on a phone: the opponent\'s cards fill the far side (at least 56px wide)', 'phone', 'turn2', async (page) => {
  const m = await M(page);
  return { pass: m.oppW >= 56 && Math.abs(m.oppRatio - 88 / 63) < 0.08, note: `opponent cards ${m.oppW}px wide` };
});
for (const size of ['phone', 'se', 'land']) {
  await check(`V-block-${size}`, `Block question + Hint at ${size}: every button visible, none over your cards or the reference card`, size, 'block6', async (page) => {
    await page.waitForTimeout(450);
    await page.click('[data-hint]');
    await page.waitForTimeout(500);
    const m = await M(page);
    const bad = [];
    if (m.refBottom > m.floor + 1) bad.push(`reference card cut off by ${m.refBottom - m.floor}px`);
    if (size !== 'land' && m.btnOverCards > 0) bad.push(`buttons ${m.btnOverCards}px over your cards`);
    if (m.btnOverRef > 0) bad.push(`buttons ${m.btnOverRef}px under the reference card`);
    if (m.overflow) bad.push('page wider than the screen');
    return { pass: !bad.length, note: bad.join('; ') };
  });
}
await check('V-se-challenge', 'Challenge question on an iPhone SE with 6 players: buttons clear of your cards', 'se', 'challenge6', async (page) => {
  const m = await M(page);
  return { pass: m.btnOverCards <= 0 && m.refBottom <= m.floor + 1, note: `buttons ${m.btnOverCards}px over your cards, reference card ends ${m.refBottom} (tab bar ${m.floor})` };
});
for (const size of ['phone', 'se']) {
  await check(`V-log-${size}`, `Block question + Hint at ${size}: no line of the log strip is cut in half`, size, 'block6', async (page) => {
    await page.waitForTimeout(450);
    await page.click('[data-hint]');
    await page.waitForTimeout(500);
    const cut = await page.evaluate(() => {
      const t = document.querySelector('#tab-play .game > .tlog');
      if (!t || !t.offsetParent) return [];
      const tb = t.getBoundingClientRect().bottom;
      return [...t.children].filter((d) => d.offsetParent).filter((d) => { const r = d.getBoundingClientRect(); return r.top < tb - 1 && r.bottom > tb + 1; }).map((d) => d.textContent.trim().slice(0, 30));
    });
    return { pass: !cut.length, note: cut.length ? 'cut: ' + cut.join(' | ') : '' };
  });
}
await check('V-se-late', 'iPhone SE late game: Hint and Quit fully on screen, no opponent name cut to "A…"', 'se', 'late6', async (page) => {
  const r = await page.evaluate(() => {
    const g = document.querySelector('#tab-play .game').getBoundingClientRect();
    const btns = [...document.querySelectorAll('#tab-play .me-row .btn')].filter((b) => b.getBoundingClientRect().right > g.right + 1).map((b) => b.textContent.trim());
    const names = [...document.querySelectorAll('#tab-play .opp .nm')].filter((n) => n.scrollWidth > n.clientWidth + 1).map((n) => n.textContent.trim());
    return { btns, names };
  });
  return { pass: !r.btns.length && !r.names.length, note: JSON.stringify(r) };
});
for (const pos of ['block6', 'turn6']) {
  await check(`V-se-gutter-${pos}`, `iPhone SE, 6 players (${pos}): nothing on the table pokes past the right gutter, no text clipped`, 'se', pos, async (page) => {
    const r = await page.evaluate(() => {
      const g = document.querySelector('#tab-play .game').getBoundingClientRect();
      const els = [...document.querySelectorAll('#tab-play .game > *, #tab-play .stage .btn, #tab-play .refcard .act, #tab-play .opp')].filter((e) => e.offsetParent);
      const out = els.filter((e) => e.getBoundingClientRect().right > g.right + 1).map((e) => e.className.split(' ')[0] + ' +' + Math.round(e.getBoundingClientRect().right - g.right));
      const clipped = [...document.querySelectorAll('#tab-play .stage .btn, #tab-play .refcard .act b')].filter((e) => e.offsetParent && e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent.trim());
      return { out, clipped };
    });
    return { pass: !r.out.length && !r.clipped.length, note: [r.out.length ? 'past the gutter: ' + r.out.slice(0, 4).join(', ') : '', r.clipped.length ? 'clipped: ' + r.clipped.join(', ') : ''].filter(Boolean).join('; ') };
  });
}
await check('V-land-quit', 'phone on its side: Hint and Quit are not hidden under the reference card', 'land', 'turn6', async (page) => {
  const r = await page.evaluate(() => {
    const ref = document.querySelector('#tab-play .actions').getBoundingClientRect();
    return [...document.querySelectorAll('#tab-play .me-row .btn')].map((b) => { const x = b.getBoundingClientRect(); return { t: b.textContent.trim(), right: x.right, refL: ref.left, top: x.top, refT: ref.top, bottom: x.bottom }; });
  });
  const hidden = r.filter((b) => b.right > b.refL + 1 && b.bottom > b.refT + 1).map((b) => b.t);
  return { pass: r.length >= 2 && !hidden.length, note: hidden.length ? 'hidden: ' + hidden.join(', ') : '' };
});
await check('V-seat-zoom', 'tapping an opponent shows their cards up close (lost card face up, big)', 'phone', 'challenge6', async (page) => {
  await page.click('#tab-play .opp[data-opp="3"]');
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => {
    const cs = [...document.querySelectorAll('#overlay .seat-cards .cardf')];
    return { n: cs.length, w: cs[0] ? Math.round(cs[0].getBoundingClientRect().width) : 0, dead: cs.filter((c) => c.classList.contains('dead') && c.classList.contains('up')).length, name: (document.querySelector('#overlay h3') || {}).textContent || '' };
  });
  return { pass: r.n === 2 && r.w >= 100 && r.dead === 1 && /Cleo/.test(r.name), note: JSON.stringify(r) };
});
await browser.close();
const failed = results.filter((r) => !r.pass).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
