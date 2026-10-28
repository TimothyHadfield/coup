// Wave 3 checks through the real page in Safari's engine (WebKit):
//   node tests/ui.wave3.mjs <url> [outDir]
// First-visit offer clear of the tab bar; the Factions variant on every screen size (side chips, Almshouse,
// Convert / Embezzle on the reference card, same-side targets refused, Convert yourself, the "no Duke" question);
// Confirm challenges setting; Videos in the Rules sheet. Exits 1 on any failure.
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
const fac = (n, extra) => `const s = E.newGame({ names: ${NAMES}.slice(0, ${n}), seed: 11, rules: { factions: true }, first: 0 });
  s.players.forEach((p, i) => { p.side = i % 2; }); s.players[0].coins = 3; ${extra || ''} return s;`;
const POS = {
  fac5: fac(5),
  fac6: fac(6),
  fac2: fac(2),
  base4: `return E.newGame({ names: ${NAMES}.slice(0, 4), seed: 11, rules: {}, first: 0 });`,
  // Ava (Reformist) embezzles 4 coins from the Almshouse; you are asked first
  embezzle: `const s = E.newGame({ names: ${NAMES}.slice(0, 4), seed: 11, rules: { factions: true }, first: 1 });
    s.players.forEach((p, i) => { p.side = i % 2; }); s.reserve = 4; E.act(s, { action: 'embezzle' }); return s;`,
  // Cleo claims Tax; you are asked
  tax: `const s = E.newGame({ names: ${NAMES}.slice(0, 4), seed: 11, rules: {}, first: 3 });
    E.act(s, { action: 'tax' }); return s;`,
};
async function open(size, pos, o) {
  o = o || {};
  const ctx = await browser.newContext({ ...SIZES[size], serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  await page.goto(url, { waitUntil: 'load' });
  if (pos) {
    // let first-load fetches finish so the reload doesn't cancel them (WebKit logs a cancelled
    // fetch as an "access control checks" console error)
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.evaluate(([src, set]) => {
      const E = window.CoupEngine; const s = new Function('E', src)(E);
      localStorage.setItem('coach-offer:coup-first', '1');
      localStorage.setItem('coup:v1', JSON.stringify({ settings: Object.assign({ speed: 'fast', opps: s.players.length - 1, level: 'medium' }, set), tab: 'play', game: { s, level: 'medium', calls: [], over: false, counted: false } }));
    }, [POS[pos], o.settings || {}]);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => { const g = window.__coup.G; return g && g.s.pending && g.s.pending.p === 0; }, null, { timeout: 15000 });
    await page.waitForTimeout(700);
  }
  return { ctx, page };
}
const M = (page) => page.evaluate(() => {
  const R = (e) => e && e.getBoundingClientRect();
  const q = (s) => document.querySelector(s), qa = (s) => [...document.querySelectorAll(s)];
  const nav = R(q('nav.tabs')); const floor = nav.width > innerWidth * 0.8 ? nav.top : innerHeight;
  const vis = (e) => { const r = R(e); return !!r && r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= floor + 1 && r.left >= -1 && r.right <= innerWidth + 1; };
  return {
    floor: Math.round(floor),
    refBottom: q('#tab-play .actions') ? Math.round(R(q('#tab-play .actions')).bottom) : -1,
    facs: qa('#tab-play .opp .fac').length, facsVis: qa('#tab-play .opp .fac').filter(vis).length,
    alms: q('#tab-play .alms') ? vis(q('#tab-play .alms')) : null, almsTxt: (q('#tab-play .alms') || {}).textContent || '',
    me: (q('#tab-play .fac-me') || {}).textContent || '', meVis: q('#tab-play .fac-me') ? vis(q('#tab-play .fac-me')) : null,
    conv: q('[data-act="convert"]') ? vis(q('[data-act="convert"]')) : null, emb: q('[data-act="embezzle"]') ? vis(q('[data-act="embezzle"]')) : null,
    allActsVis: qa('#tab-play .refcard .act').every(vis), nActs: qa('#tab-play .refcard .act').length,
    labelsClip: qa('#tab-play .refcard .act b').filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.textContent),
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
    t1: (q('#tab-play .stage .t1') || {}).textContent || '', t2: (q('#tab-play .stage .t2') || {}).textContent || '',
  };
});
const results = [];
async function check(id, title, size, pos, fn, o) {
  let pass = false, note = '';
  const { ctx, page } = await open(size, pos, o);
  try { const r = await fn(page); pass = r.pass; note = r.note || ''; if (page.errors.length) { pass = false; note += ' errors: ' + page.errors.join(' | '); } }
  catch (e) { note = 'threw: ' + e.message.split('\n')[0]; }
  if (out) await page.screenshot({ path: `${out}/${id}.png` }).catch(() => {});
  await ctx.close();
  results.push({ id, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id} ${title}${note ? ' :: ' + note : ''}`);
}
const tap = async (page, sel) => { await page.waitForTimeout(400); await page.locator(sel).first().click(); await page.waitForTimeout(250); };
const only = process.argv.slice(4);
const want = (id) => !only.length || only.includes(id);

// 1. first visit: the "New to Coup?" card sits above the tab bar, not over it
for (const size of ['phone', 'se', 'land', 'laptop']) {
  if (!want('offer-' + size)) continue;
  await check('offer-' + size, 'first-visit offer clear of the tab bar', size, null, async (page) => {
    await page.waitForSelector('.coach-offer', { timeout: 8000 });
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const o = document.querySelector('.coach-offer').getBoundingClientRect(), n = document.querySelector('nav.tabs').getBoundingClientRect();
      const bottomBar = n.width > innerWidth * 0.8;
      const hit = [...document.querySelectorAll('nav.tabs button')].filter((b) => { const r = b.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !b.contains(el); }).length;
      return { ob: Math.round(o.bottom), nt: Math.round(n.top), bottomBar, hit, top: Math.round(o.top), overflow: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    return { pass: (!r.bottomBar || r.ob <= r.nt) && r.hit === 0 && r.top >= 0 && !r.overflow, note: JSON.stringify(r) };
  });
}
// 2. Factions table on every size: chips, Almshouse, all 10 actions on screen
for (const [size, pos] of [['phone', 'fac5'], ['phone', 'fac6'], ['phone', 'fac2'], ['se', 'fac5'], ['se', 'fac6'], ['land', 'fac5'], ['laptop', 'fac6'], ['big', 'fac5']]) {
  const id = `fac-${size}-${pos}`;
  if (!want(id)) continue;
  await check(id, 'Factions table fits', size, pos, async (page) => {
    const m = await M(page);
    const n = { fac5: 4, fac6: 5, fac2: 1 }[pos];
    const pass = m.facs === n && m.facsVis === n && m.alms === true && m.meVis === true && m.conv && m.emb && m.allActsVis && m.nActs === 9 && !m.overflow && m.refBottom <= m.floor && !m.labelsClip.length;
    return { pass, note: JSON.stringify(m) };
  });
}
// 3. base game unchanged: no chips, no Almshouse, 7 actions
if (want('base')) await check('base', 'base game has no Factions bits', 'phone', 'base4', async (page) => {
  const m = await M(page);
  return { pass: m.facs === 0 && m.alms === null && m.conv === null && m.nActs === 7 && !m.overflow, note: JSON.stringify(m) };
});
// 4. Steal on your own side is refused; on the other side it goes through
if (want('sameside')) await check('sameside', 'same-side target refused', 'phone', 'fac5', async (page) => {
  await tap(page, '[data-act="steal"]');
  await tap(page, '#tab-play .opp[data-opp="2"]');   // Ben: your side
  const a = await page.evaluate(() => ({ kind: window.__coup.G.s.pending.kind, p: window.__coup.G.s.pending.p, toast: (document.querySelector('.toast') || {}).textContent || '' }));
  await tap(page, '#tab-play .opp[data-opp="1"]');   // Ava: the other side
  const b = await page.evaluate(() => window.__coup.G.s.events.some((e) => e.t === 'action' && e.p === 0 && e.action === 'steal' && e.target === 1));
  return { pass: a.kind === 'action' && a.p === 0 && /Same side/.test(a.toast) && b, note: JSON.stringify(a) + ' stole=' + b };
});
// 5. Convert yourself: 1 coin to the Almshouse, your side flips, the table shows it
if (want('convert')) await check('convert', 'Convert yourself', 'phone', 'fac5', async (page) => {
  await tap(page, '[data-act="convert"]');
  const m0 = await M(page);
  await tap(page, '[data-convself]');
  const r = await page.evaluate(() => { const s = window.__coup.G.s; return { side: s.players[0].side, coins: s.players[0].coins, reserve: s.reserve, alms: document.querySelector('#tab-play .alms').textContent, me: document.querySelector('#tab-play .fac-me').textContent }; });
  return { pass: /whose side/i.test(m0.t1) && r.side === 1 && r.coins === 2 && r.reserve === 1 && /1/.test(r.alms) && /Reformist/.test(r.me), note: m0.t1 + ' ' + JSON.stringify(r) };
});
// 6. someone Embezzles: the question says "no Duke", with the odds
for (const size of ['phone', 'se']) {
  if (!want('embezzle-' + size)) continue;
  await check('embezzle-' + size, 'Embezzle question', size, 'embezzle', async (page) => {
    const m = await M(page);
    const r = await page.evaluate(() => ({ pct: (document.querySelector('#tab-play .stage .pct b') || {}).textContent || '', btns: [...document.querySelectorAll('#tab-play .stage [data-ch]')].map((b) => { const r = b.getBoundingClientRect(); return r.bottom <= innerHeight && r.width > 0; }) }));
    return { pass: /claims no Duke/.test(m.t1) && /Almshouse/.test(m.t2) && /%/.test(r.pct) && r.btns.length === 2 && r.btns.every(Boolean) && !m.overflow, note: m.t1 + ' | ' + m.t2 + ' ' + JSON.stringify(r) };
  });
}
// 7. Confirm challenges: off = one tap; on = asks first
if (want('confirm-off')) await check('confirm-off', 'Challenge without confirm (default)', 'phone', 'tax', async (page) => {
  await tap(page, '[data-ch="1"]');
  const r = await page.evaluate(() => ({ ch: window.__coup.G.s.events.some((e) => e.t === 'challenge'), sheet: !!document.querySelector('#overlay .sheet') }));
  return { pass: r.ch && !r.sheet, note: JSON.stringify(r) };
});
if (want('confirm-on')) await check('confirm-on', 'Challenge asks first when the setting is on', 'phone', 'tax', async (page) => {
  await tap(page, '[data-ch="1"]');
  const a = await page.evaluate(() => ({ ch: window.__coup.G.s.events.some((e) => e.t === 'challenge'), sheet: (document.querySelector('#overlay .sheet h3') || {}).textContent || '' }));
  await page.locator('#overlay [data-s="yes"]').click();
  await page.waitForTimeout(300);
  const b = await page.evaluate(() => window.__coup.G.s.events.some((e) => e.t === 'challenge' && e.by === 0));
  return { pass: !a.ch && /Challenge Cleo/.test(a.sheet) && b, note: JSON.stringify(a) + ' after=' + b };
}, { settings: { confirmChallenge: true } });
// 8. Settings: the new rows are there; Rules sheet has 5 videos opening in a new tab
for (const size of ['phone', 'laptop']) {
  if (!want('videos-' + size)) continue;
  await check('videos-' + size, 'Videos in the Rules sheet', size, null, async (page) => {
    await page.evaluate(() => localStorage.setItem('coach-offer:coup-first', '1'));
    await page.reload({ waitUntil: 'load' });
    await page.locator('nav.tabs [data-tab="settings"]').click({ force: true });
    await page.waitForTimeout(300);
    const rows = await page.evaluate(() => ({ fac: !!document.querySelector('[data-sw="factions"]'), conf: !!document.querySelector('[data-sw="confirmChallenge"]') }));
    await page.locator('[data-rules]').click({ force: true });
    await page.waitForSelector('.coach-rules', { timeout: 5000 });
    await page.locator('.coach-rules-nav button', { hasText: 'Videos' }).click({ force: true });
    await page.waitForTimeout(400);
    const v = await page.evaluate(() => [...document.querySelectorAll('.coach-rules .rules-videos a')].map((a) => ({ href: a.href, t: a.target, rel: a.rel, vis: (() => { const r = a.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })() })));
    const ok = v.length === 5 && v.every((x) => /youtube\.com\/watch\?v=[\w-]{11}$/.test(x.href) && x.t === '_blank' && /noopener/.test(x.rel)) && v.some((x) => x.vis);
    return { pass: ok && rows.fac && rows.conf, note: JSON.stringify(rows) + ' ' + v.length + ' links, visible ' + v.filter((x) => x.vis).length };
  });
}

await browser.close();
const bad = results.filter((r) => !r.pass);
console.log(`${results.length - bad.length}/${results.length} passed`);
process.exit(bad.length ? 1 : 0);
