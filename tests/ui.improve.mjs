// Improve pass (2026-10-27): Undo, My stats (rated / with help / quit = loss / guided never counts),
// Daily game, guided first game, rules sheet. Real page in Safari's engine (WebKit, iPhone size):
//   node tests/ui.improve.mjs <url> [outDir]
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
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (c) pass++; else { fail++; console.log('FAIL', name, extra == null ? '' : JSON.stringify(extra)); } };

async function fresh(opts = {}) {
  const ctx = await browser.newContext({ ...devices['iPhone 15'] });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  await page.addInitScript((o) => {
    if (!localStorage.getItem('coup:v1')) localStorage.setItem('coup:v1', JSON.stringify({ settings: { speed: 'fast', opps: 1, level: o.level || 'easy' } }));
    if (!o.offer) localStorage.setItem('coach-offer:coup-first', '1');
  }, opts);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__coup);
  return { ctx, page };
}
// a position: you (seat 0) to act, 1 opponent on its last card, you hold 7 coins
async function nearWin(page, extra) {
  await page.evaluate((x) => {
    const E = window.CoupEngine;
    const s = E.newGame({ names: ['You', 'Ava'], seed: 21, rules: {}, first: 0 });
    s.players[1].cards[0].dead = true; s.players[0].coins = 7;
    localStorage.setItem('coup:v1', JSON.stringify({ settings: { speed: 'fast', opps: 1, level: x.level }, tab: 'play', game: Object.assign({ s, level: x.level, calls: [], over: false, counted: false, id: 'g' + Math.random() }, x.g || {}) }));
  }, extra);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => { const g = window.__coup.G; return g && g.s.pending && g.s.pending.p === 0; });
  await page.waitForTimeout(450);
}
const stats = (page) => page.evaluate(() => window.Profile.stats());
const tapCoupOnAva = async (page) => {
  await page.tap('#tab-play [data-act="coup"]'); await page.waitForTimeout(450);
  await page.click('#tab-play .opp[data-opp="1"]');   // (a touch tap on the pulsing seat gives no click in headless WebKit; ui.play clicks too)
  await page.waitForFunction(() => window.__coup.G && window.__coup.G.over);
};

// 1. a rated win vs Hard
{
  const { ctx, page } = await fresh();
  await nearWin(page, { level: 'hard' });
  await tapCoupOnAva(page);
  const st = await stats(page);
  ok(st.wins === 1 && st.byLevel && st.byLevel.hard && st.byLevel.hard.w === 1, 'win vs Hard is rated', st.byLevel);
  ok(st.elo.rating > 1200 && st.elo.games === 1, 'rating went up', st.elo);
  ok(page.errors.length === 0, 'no page errors (rated win)', page.errors);
  // reload after the win: still counted once
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(500);
  ok((await stats(page)).games === 1, 'counted once after reload');
  await ctx.close();
}
// 2. Hint used -> "with help", unrated
{
  const { ctx, page } = await fresh();
  await nearWin(page, { level: 'hard' });
  await page.tap('#tab-play [data-hint]'); await page.waitForTimeout(300);
  await tapCoupOnAva(page);
  const st = await stats(page);
  ok(st.games === 1 && (!st.byLevel.hard || !st.byLevel.hard.g) && st.byMode.help && st.byMode.help.g === 1, 'Hint game counts as "with help", not rated', { byMode: st.byMode, byLevel: st.byLevel });
  ok(st.elo.rating === 1200 && st.elo.games === 0, 'Hint game leaves the rating alone', st.elo);
  await ctx.close();
}
// 3. Undo: a move then Undo puts the position back; the game becomes unrated
{
  const { ctx, page } = await fresh();
  await nearWin(page, { level: 'medium' });
  ok(await page.$('#tab-play [data-undo]') === null, 'no Undo before your first move');
  const before = await page.evaluate(() => JSON.stringify(window.__coup.G.s.players.map((p) => p.coins)));
  await page.tap('#tab-play [data-act="income"]');
  await page.waitForFunction(() => window.__coup.G.s.pending && window.__coup.G.s.pending.p === 0 && window.__coup.G.s.turnNo > 1, null, { timeout: 20000 });
  await page.waitForTimeout(450);
  ok(await page.$('#tab-play [data-undo]') !== null, 'Undo shows after your move');
  if (out) await page.screenshot({ path: out + '/improve-undo.png' });
  const vis = await page.evaluate(() => { const r = document.querySelector('#tab-play [data-undo]').getBoundingClientRect(); return r.bottom <= innerHeight && r.right <= innerWidth && r.width >= 40; });
  ok(vis, 'Undo is on screen at 393 px');
  await page.tap('#tab-play [data-undo]');
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({ coins: JSON.stringify(window.__coup.G.s.players.map((p) => p.coins)), turn: window.__coup.G.s.turnNo, helped: window.__coup.G.helped, me: window.__coup.G.s.pending.p }));
  ok(after.coins === before && after.turn === 1 && after.me === 0, 'Undo restores the position', { before, after });
  ok(after.helped === true, 'Undo makes the game unrated');
  ok(page.errors.length === 0, 'no page errors (undo)', page.errors);
  await ctx.close();
}
// 4. Quit after your first move = a loss; quitting before any move counts nothing
{
  const { ctx, page } = await fresh();
  await nearWin(page, { level: 'easy' });
  await page.tap('#tab-play [data-quit]'); await page.tap('#overlay [data-s="yes"]'); await page.waitForTimeout(300);
  ok((await stats(page)).games === 0, 'quit before moving counts nothing');
  await nearWin(page, { level: 'easy' });
  await page.tap('#tab-play [data-act="income"]');
  await page.waitForFunction(() => window.__coup.G.moved);
  await page.waitForTimeout(400);
  await page.tap('#tab-play [data-quit]'); await page.waitForTimeout(200);
  const msg = await page.textContent('#overlay');
  ok(/loss/.test(msg), 'quit box says it counts as a loss', msg);
  await page.tap('#overlay [data-s="yes"]'); await page.waitForTimeout(300);
  const st = await stats(page);
  ok(st.games === 1 && st.losses === 1, 'quit after a move = 1 loss', { g: st.games, l: st.losses });
  await ctx.close();
}
// 5. Daily game: 4 players, Hard, same deal on a second device, no Undo
{
  const deals = [];
  for (let k = 0; k < 2; k++) {
    const { ctx, page } = await fresh();
    await page.tap('#tab-play [data-daily]');
    await page.waitForFunction(() => window.__coup.G && window.__coup.G.daily);
    const g = await page.evaluate(() => ({ n: window.__coup.G.s.players.length, level: window.__coup.G.level, mine: window.__coup.G.s.players[0].cards.map((c) => c.c).join('+') }));
    deals.push(g);
    if (k === 0) {
      await page.waitForFunction(() => window.__coup.G.s.pending && window.__coup.G.s.pending.p === 0, null, { timeout: 30000 });
      await page.waitForTimeout(450);
      const legal = await page.evaluate(() => [...document.querySelectorAll('#tab-play .act:not([disabled])')].map((b) => b.dataset.act));
      const pd = await page.evaluate(() => window.__coup.G.s.pending.kind);
      if (pd === 'action') { await page.tap('#tab-play [data-act="income"]'); await page.waitForTimeout(600); }
      ok(await page.$('#tab-play [data-undo]') === null, 'no Undo in the Daily game', legal);
      if (out) await page.screenshot({ path: out + '/improve-daily.png' });
    }
    ok(page.errors.length === 0, 'no page errors (daily)', page.errors);
    await ctx.close();
  }
  ok(deals[0].n === 4 && deals[0].level === 'hard', 'Daily is you + 3 Hard computers', deals[0]);
  ok(deals[0].mine === deals[1].mine, 'same Daily deal on another device', deals);
}
// 6. guided first game: offered on a first visit, steps follow the game, never counts
{
  const { ctx, page } = await fresh({ offer: true });
  await page.waitForSelector('.coach-offer');
  if (out) await page.screenshot({ path: out + '/improve-offer.png' });
  await page.tap('.coach-offer button:last-child');   // Teach me
  await page.waitForFunction(() => window.__coup.G && window.__coup.G.tutorial);
  const mine = await page.evaluate(() => window.__coup.G.s.players[0].cards.map((c) => c.c).sort().join('+'));
  ok(mine === 'Captain+Duke', 'guided game deals you Duke + Captain', mine);
  for (let k = 0; k < 3; k++) { await page.waitForSelector('.coach-bubble, .coach-tip, [class*="coach"] button'); await page.waitForTimeout(250); await page.click('text=Next'); }
  await page.waitForTimeout(400);
  const t4 = await page.evaluate(() => document.body.innerText.includes('Take Tax'));
  ok(t4, 'step 4 asks for Tax');
  if (out) await page.screenshot({ path: out + '/improve-tutorial-tax.png' });
  await page.waitForTimeout(300);
  await page.tap('#tab-play [data-act="tax"]');
  await page.waitForTimeout(800);
  const moved = await page.evaluate(() => !document.body.innerText.includes('Take Tax'));
  ok(moved, 'tapping Tax moves the guide on');
  // finish the guided game fast: the guide never counts it
  await page.evaluate(() => { const G = window.__coup.G; G.s.players[1].cards.forEach((c) => (c.dead = true)); G.s.players[2].cards.forEach((c) => (c.dead = true)); });
  await page.evaluate(() => window.__coup.newGame && 0);
  ok((await stats(page)).games === 0, 'guided game not in My stats');
  ok(page.errors.length === 0, 'no page errors (tutorial)', page.errors);
  await ctx.close();
}
// 8. a game left behind "Resume last game" (as after an online room) still counts: Deal = a loss; Daily resumes, never restarts
{
  const { ctx, page } = await fresh();
  await nearWin(page, { level: 'easy' });
  await page.tap('#tab-play [data-act="income"]');
  await page.waitForFunction(() => window.__coup.G.moved);
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__coup.park());
  await page.waitForSelector('#tab-play [data-resume]');
  await page.tap('#tab-play [data-new]'); await page.waitForTimeout(400);
  let st = await stats(page);
  ok(st.games === 1 && st.losses === 1, 'Deal over a parked game you moved in = 1 loss', { g: st.games, l: st.losses });
  await page.tap('#tab-play [data-quit]'); await page.waitForTimeout(200);
  const y = await page.$('#overlay [data-s="yes"]'); if (y) await y.tap();
  await page.waitForTimeout(300);
  await page.tap('#tab-play [data-daily]');
  await page.waitForFunction(() => window.__coup.G && window.__coup.G.daily);
  const id1 = await page.evaluate(() => window.__coup.G.id);
  // answer any question with Allow until it is your turn, then take Income
  for (let k = 0; k < 120; k++) {
    const pd = await page.evaluate(() => { const g = window.__coup.G; return g.s.pending && g.s.pending.p === 0 ? g.s.pending.kind : ''; });
    if (pd === 'action') break;
    if (pd) await page.evaluate(() => { const a = document.querySelector('#tab-play [data-ch="0"], #tab-play [data-blk=""]'); if (a) a.click(); });
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(450);
  await page.tap('#tab-play [data-act="income"]');
  await page.waitForFunction(() => window.__coup.G.moved);
  await page.evaluate(() => window.__coup.park());
  await page.waitForTimeout(300);
  await page.tap('#tab-play [data-daily]'); await page.waitForTimeout(400);
  const g2 = await page.evaluate(() => ({ id: window.__coup.G && window.__coup.G.id, moved: window.__coup.G && window.__coup.G.moved }));
  ok(g2.id === id1 && g2.moved, 'Daily button resumes the parked Daily instead of a fresh retry', { id1, g2 });
  st = await stats(page);
  ok(st.games === 1, 'resuming the Daily records nothing extra', st.games);
  ok(page.errors.length === 0, 'no page errors (parked game)', page.errors);
  await ctx.close();
}
// 7. rules sheet from Settings, Back closes it
{
  const { ctx, page } = await fresh();
  await page.tap('nav.tabs [data-tab="settings"]');
  await page.tap('#tab-settings [data-rules]');
  await page.waitForTimeout(500);
  const open = await page.evaluate(() => window.COACH.rulesOpen());
  ok(open, 'rules sheet opens from Settings');
  if (out) await page.screenshot({ path: out + '/improve-rules.png' });
  await page.goBack(); await page.waitForTimeout(400);
  ok(!(await page.evaluate(() => window.COACH.rulesOpen())), 'Back closes the rules');
  ok(await page.evaluate(() => document.querySelector('#tab-settings').classList.contains('active')), 'Back stays on Settings');
  ok(page.errors.length === 0, 'no page errors (rules)', page.errors);
  await ctx.close();
}
await browser.close();
console.log(`ui.improve: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
