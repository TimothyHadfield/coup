// Two browsers, one online room, against the real free Firebase project:
//   node tests/ui.online.mjs <url> [outDir]
// Host makes a room (3 seats), a friend joins by code, the third seat is a computer,
// both tap through a whole game. The friend reloads mid-game and must land back in it.
// Fails on console errors, failed requests, a seat seeing someone else's hidden cards,
// or the game not finishing.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pwPath = process.env.PLAYWRIGHT_DIR || 'C:/Users/timha/.claude/tools/node_modules/playwright';
const { webkit, devices } = require(pwPath);

const url = process.argv[2] || 'http://127.0.0.1:18473/';
const out = process.argv[3] || '.';
const errors = [];
const browser = await webkit.launch();
async function open(tag, desktop) {
  const ctx = await browser.newContext(desktop ? { viewport: { width: 1280, height: 800 } } : { ...devices['iPhone 15'] });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(tag + ' console: ' + m.text()); });
  // WebKit reports Firestore's long-poll channel being cut off by a page reload as a page error; that's the reload, not the app
  page.on('pageerror', (e) => { if (!/firestore\.googleapis\.com.*channel.*access control/.test(e.message)) errors.push(tag + ' pageerror: ' + e.message); });
  page.on('requestfailed', (r) => { const u = r.url(); if (!/firestore\.googleapis\.com.*(Listen|Write)\/channel/.test(u)) errors.push(tag + ' failed: ' + u + ' ' + (r.failure() && r.failure().errorText)); });
  await page.addInitScript(() => {
    if (!localStorage.getItem('coup:v1')) localStorage.setItem('coup:v1', JSON.stringify({ settings: { speed: 'fast', opps: 2, level: 'easy' } }));
  });
  await page.goto(url, { waitUntil: 'load' });
  return page;
}
const host = await open('host', true);
const friend = await open('friend', false);
const shot = (p, name) => p.screenshot({ path: `${out}/${name}.png` });

// host makes the room
await host.click('[data-online]');
await host.fill('#netName', 'Tim');
await host.click('.sheet [data-s="create"]');
await host.waitForSelector('.lobby .code', { timeout: 30000 });
const code = (await host.textContent('.lobby .code')).trim();
console.log('room', code);

// friend joins
await friend.click('[data-online]');
await friend.fill('#netName', 'Sam');
await friend.fill('#netCode', code.toLowerCase());
await friend.click('.sheet [data-s="join"]');
await host.waitForFunction(() => window.__coup.SNAP && window.__coup.SNAP.seats.filter((s) => s.kind === 'human').length === 2, null, { timeout: 30000 });
await friend.waitForSelector('.lobby .code', { timeout: 30000 });
await host.click('[data-seat="2"]');      // the open seat becomes a computer
await host.waitForFunction(() => window.__coup.SNAP.seats[2].kind === 'computer', null, { timeout: 20000 });
await shot(host, 'online-lobby-host');
await shot(friend, 'online-lobby-friend');
await host.click('[data-netstart]');
await friend.waitForSelector('.opp', { timeout: 30000 });

// Each side: never sees another seat's hidden card values before the end.
async function leakCheck(p, tag) {
  const bad = await p.evaluate(() => {
    const G = window.__coup.G; if (!G || !G.online || G.over) return null;
    const me = window.__coup.SNAP.mySeat;
    for (let i = 0; i < G.s.players.length; i++) {
      if (i === me) continue;
      if (G.s.players[i].cards.some((c) => !c.dead && c.c)) return 'seat ' + i + ' hidden card visible';
    }
    if (JSON.stringify(window.__coup.SNAP.pub).includes('_true')) return 'claim truth visible';
    return null;
  });
  if (bad) errors.push(tag + ' leak: ' + bad);
}

async function tapOnce(p) {
  try { return await tapInner(p); } catch (e) { return false; }   // the screen redrew mid-tap: try again
}
async function tapInner(p) {
  if (await p.$('.sheet .choose')) {
    const need = await p.evaluate(() => +document.querySelector('.sheet [data-s="ok"]').textContent.match(/\/(\d)/)[1]);
    const cards = await p.$$('.sheet .choose [data-s]');
    for (let k = 0; k < need; k++) await p.click(`.sheet .choose [data-s="c${k}"]`);
    await p.click('.sheet [data-s="ok"]'); return true;
  }
  const ch = await p.$$('[data-ch]');
  if (ch.length) { await p.click(Math.random() < 0.2 ? '[data-ch="1"]' : '[data-ch="0"]'); return true; }
  const blk = await p.$$('[data-blk]');
  if (blk.length) { await blk[Math.floor(Math.random() * blk.length)].click(); return true; }
  const pick = await p.$$('.me-row [data-card]');
  if (pick.length) { await pick[0].click(); return true; }
  const ex = await p.$$('[data-exam]');
  if (ex.length) { await ex[0].click(); return true; }
  const acts = await p.$$('.act:not([disabled])');
  if (acts.length) {
    await acts[Math.floor(Math.random() * acts.length)].click();
    await p.waitForTimeout(50);
    const tg = await p.$$('.opp.targetable');
    if (tg.length) await tg[Math.floor(Math.random() * tg.length)].click();
    return true;
  }
  return false;
}

const t0 = Date.now();
let moves = 0, reloaded = false, overHost = false, overFriend = false;
while (Date.now() - t0 < 300000 && !(overHost && overFriend)) {
  await host.waitForTimeout(150);
  overHost = overHost || !!(await host.$('[data-review]'));
  overFriend = overFriend || !!(await friend.$('[data-review]'));
  if (!overHost && await tapOnce(host)) moves++;
  if (!overFriend && await tapOnce(friend)) moves++;
  if (moves % 5 === 0) { await leakCheck(host, 'host'); await leakCheck(friend, 'friend'); }
  if (moves === 4) await shot(friend, 'online-game-friend');
  if (!reloaded && moves >= 6 && !overFriend) {
    reloaded = true;
    await friend.reload({ waitUntil: 'load' });
    try { await friend.waitForSelector('.opp', { timeout: 30000 }); }
    catch (e) { errors.push('friend did not come back after reload'); }
  }
}
if (!(overHost && overFriend)) errors.push('game did not finish on both screens');
else {
  await shot(host, 'online-over-host');
  await friend.click('[data-review]');
  await friend.waitForSelector('.sheet');
  await shot(friend, 'online-review-friend');
  await friend.click('.sheet [data-s="x"]');
}
// both leave; the room gets deleted
await friend.click('[data-netleave]').catch(() => {});
await host.click('[data-netleave]').catch(() => {});
await host.waitForTimeout(1500);
await browser.close();
console.log(JSON.stringify({ code, moves, reloaded, overHost, overFriend, errors }, null, 1));
if (errors.length) process.exit(1);
