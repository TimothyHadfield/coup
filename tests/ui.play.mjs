// Plays whole games through the real page in Safari's engine (WebKit, iPhone size),
// tapping like a person: node tests/ui.play.mjs <url> [games] [outDir] [--desktop]
// Fails on any console error, page error, failed request or horizontal overflow.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pwPath = process.env.PLAYWRIGHT_DIR || 'C:/Users/timha/.claude/tools/node_modules/playwright';
const { webkit, devices } = require(pwPath);

const url = process.argv[2] || 'http://127.0.0.1:18473/';
const games = +process.argv[3] || 2;
const out = process.argv[4] || '.';
const desktop = process.argv.includes('--desktop');
const errors = [];

const browser = await webkit.launch();
const ctx = await browser.newContext(desktop ? { viewport: { width: 1280, height: 800 } } : { ...devices['iPhone 15'] });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('requestfailed', (r) => errors.push('failed: ' + r.url()));
page.on('response', (r) => { if (r.status() >= 400) errors.push('http ' + r.status() + ' ' + r.url()); });
await page.addInitScript(() => {
  if (!localStorage.getItem('coup:v1')) localStorage.setItem('coup:v1', JSON.stringify({ settings: { speed: 'fast', opps: 3, level: 'hard' } }));
});
await page.goto(url, { waitUntil: 'load' });
const rnd = () => Math.random();
const shots = [];
const shot = async (name) => { const p = `${out}/${name}.png`; await page.screenshot({ path: p }); shots.push(p); };
const overflow = async () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

await shot('ui-setup');
let decisions = 0, finished = 0;
for (let g = 0; g < games; g++) {
  await page.click('[data-new]');
  const t0 = Date.now();
  let took = false;
  while (Date.now() - t0 < 240000) {
    await page.waitForTimeout(120);
    // a choose-cards sheet
    if (await page.$('.sheet .choose')) {
      const need = await page.evaluate(() => { const b = document.querySelector('.sheet [data-s="ok"]'); return b ? +b.textContent.match(/\/(\d)/)[1] : 0; });
      const cards = await page.$$('.sheet .choose [data-s]');
      for (let k = 0; k < need; k++) await cards[k].click();
      if (!took) { await shot('ui-exchange'); took = true; }
      await page.click('.sheet [data-s="ok"]');
      decisions++; continue;
    }
    if (await page.$('[data-review]')) {
      finished++;
      await shot(`ui-over-${g}`);
      await page.click('[data-review]');
      await page.waitForSelector('.sheet');
      await shot(`ui-review-${g}`);
      await page.click('.sheet [data-s="x"]');
      if (await overflow()) errors.push('horizontal overflow at game end');
      await page.click('[data-quit]');
      break;
    }
    const ch = await page.$$('[data-ch]');
    if (ch.length) {
      if (decisions === 3) await shot('ui-challenge');
      if (rnd() < 0.3) { await page.click('[data-hint]'); }
      await page.click(rnd() < 0.25 ? '[data-ch="1"]' : '[data-ch="0"]'); decisions++; continue;
    }
    const blk = await page.$$('[data-blk]');
    if (blk.length) { await blk[Math.floor(rnd() * blk.length)].click(); decisions++; continue; }
    const pick = await page.$$('.me-row [data-card]');
    if (pick.length) { await pick[0].click(); decisions++; continue; }
    const ex = await page.$$('[data-exam]');
    if (ex.length) { await ex[0].click(); decisions++; continue; }
    const acts = await page.$$('.act:not([disabled])');
    if (acts.length) {
      if (decisions === 1) { await page.click('[data-hint]'); await shot('ui-hint'); }
      const a = acts[Math.floor(rnd() * acts.length)];
      await a.click();
      await page.waitForTimeout(60);
      const tg = await page.$$('.opp.targetable');
      if (tg.length) await tg[Math.floor(rnd() * tg.length)].click();
      decisions++; continue;
    }
  }
}
// visit every tab
for (const t of ['table', 'learn', 'settings']) {
  await page.click(`nav [data-tab="${t}"]`);
  await page.waitForTimeout(400);
  await shot('ui-tab-' + t);
  if (await overflow()) errors.push('horizontal overflow on ' + t);
}
// reload mid-game resumes
await page.click('nav [data-tab="play"]');
await page.click('[data-new]');
await page.waitForTimeout(1500);
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(800);
const resumed = await page.$('.opp');
if (!resumed) errors.push('reload mid-game did not resume');
await browser.close();
console.log(JSON.stringify({ finished, games, decisions, shots, errors }, null, 1));
if (errors.length || finished < games) process.exit(1);
