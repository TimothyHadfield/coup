// Sounds, celebrations and animations, checked in the real page (WebKit, iPhone size).
//   node tests/ui.fx.mjs <url> [outDir]
// Plays three short 1-vs-1 games by tapping (you always Tax or Coup, and challenge every claim):
//   1. everything on: each game event fires its sound (FX.play spied), your-turn chime only on
//      your turns, game over celebrates 'win' or 'lose' correctly, animations run;
//   2. Sound off: no sound is actually played (FX.stats.plays stays 0);
//   3. Animations off: no element animates and no confetti canvas appears.
// A fake AudioContext stands in for Web Audio (WebKit on Windows has none).
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pwPath = process.env.PLAYWRIGHT_DIR || 'C:/Users/timha/.claude/tools/node_modules/playwright';
const { webkit, devices } = require(pwPath);

const url = process.argv[2] || 'http://127.0.0.1:18473/';
const out = process.argv[3] || '.';
const failures = [];
const fail = (m) => { failures.push(m); console.log('FAIL', m); };

// What each engine event must sound like (the spec in progress.md).
function expected(e, me) {
  switch (e.t) {
    case 'action':
      if (e.action === 'coup') return ['coins'];
      if (e.action === 'assassinate') return ['whoosh'];
      return e.claim ? ['cardSlide'] : [];
    case 'block': return ['block'];
    case 'challenge': return ['stamp'];
    case 'prove': return ['cardFlip', 'shuffle'];
    case 'lose': return ['cardFlip', e.reason === 'coup' ? 'explosion' : 'hit'];
    case 'out': return ['sink'];
    case 'gain': return [e.n === 1 ? 'coin' : 'coins'];
    case 'steal': return [e.n > 0 ? 'coins' : 'miss'];
    case 'refund': return ['coin'];
    case 'fail': return e.blocked ? ['miss'] : [];
    case 'exchange': return ['shuffle'];
    case 'shown': return ['cardFlip'];
    case 'forced': return ['shuffle'];
    case 'kept': return ['cardSlide'];
    case 'turn': return e.p === me ? ['turn'] : [];
    default: return [];
  }
}

async function playOne(label, fxSettings) {
  const browser = await webkit.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 15'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.addInitScript((fxSet) => {
    if (!localStorage.getItem('coup:v1')) localStorage.setItem('coup:v1', JSON.stringify({ settings: { speed: 'fast', opps: 1, level: 'easy' } }));
    if (fxSet) localStorage.setItem('fx:coup', JSON.stringify(fxSet));
    // fake Web Audio: every node accepts every call
    const P = () => ({ value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} });
    const node = () => ({ connect() {}, disconnect() {}, start() {}, stop() {}, gain: P(), frequency: P(), Q: P(), pan: P(), type: '', buffer: null, loop: false });
    class FakeAC {
      constructor() { this.state = 'running'; this.sampleRate = 44100; this.destination = node(); }
      get currentTime() { return performance.now() / 1000; }
      resume() { return Promise.resolve(); }
      createGain() { return node(); } createOscillator() { return node(); } createBiquadFilter() { return node(); }
      createBufferSource() { return node(); } createStereoPanner() { return node(); } createDynamicsCompressor() { return node(); }
      createBuffer(c, n) { return { getChannelData: () => new Float32Array(n) }; }
    }
    window.AudioContext = FakeAC; window.webkitAudioContext = FakeAC;
    // spies
    const log = window.__fx = { plays: [], celebrates: [], helpers: [], animates: 0, canvases: 0 };
    const anim = Element.prototype.animate;
    Element.prototype.animate = function (...a) { log.animates++; return anim.apply(this, a); };
    new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeName === 'CANVAS') log.canvases++; })))
      .observe(document, { childList: true, subtree: true });
    let real;
    Object.defineProperty(window, 'FX', {
      configurable: true,
      get() { return real; },
      set(v) {
        real = v;
        const play = v.play;
        v.play = function (n, o) { const ok = play.call(this, n, o); log.plays.push({ n, ok }); return ok; };
        const cel = v.celebrate;
        v.celebrate = function (o) { log.celebrates.push(o && o.kind); return cel.call(this, o); };
        ['pop', 'shake', 'pulse', 'flash', 'flyTo', 'floatText', 'countUp'].forEach((k) => { const f = v[k]; v[k] = function (...a) { log.helpers.push(k); return f.apply(this, a); }; });
      },
    });
  }, fxSettings || null);
  await page.goto(url, { waitUntil: 'load' });
  if (!(await page.evaluate(() => !!(window.FX && window.FX.version)))) { fail(label + ': FX is not loaded'); await browser.close(); return null; }
  await page.click('[data-new]');
  const t0 = Date.now();
  let over = false;
  while (Date.now() - t0 < 240000) {
    await page.waitForTimeout(100);
    try {
      if (await page.$('.sheet .choose')) {
        const need = await page.evaluate(() => +document.querySelector('.sheet [data-s="ok"]').textContent.match(/\/(\d)/)[1]);
        for (let k = 0; k < need; k++) await page.click(`.sheet .choose [data-s="c${k}"]`);
        await page.click('.sheet [data-s="ok"]'); continue;
      }
      if (await page.$('[data-review]')) { over = true; break; }
      if (await page.$('[data-ch="1"]')) { await page.click('[data-ch="1"]'); continue; }
      if (await page.$('[data-blk=""]')) { await page.click('[data-blk=""]'); continue; }
      const pick = await page.$('.me-row [data-card]');
      if (pick) { await pick.click(); continue; }
      if (await page.$('[data-exam]')) { await page.click('[data-exam="0"]'); continue; }
      if (await page.$('.act[data-act="coup"]:not([disabled])')) {
        await page.click('.act[data-act="coup"]'); await page.waitForTimeout(60);
        await page.click('.opp.targetable'); continue;
      }
      if (await page.$('.act[data-act="tax"]:not([disabled])')) { await page.click('.act[data-act="tax"]'); continue; }
    } catch (e) { if (!/not attached|detached|Timeout/i.test(e.message)) throw e; }
  }
  if (!over) fail(label + ': game did not finish');
  await page.waitForTimeout(700);
  if (label === 'all on') await page.screenshot({ path: `${out}/fx-test-over.png` });
  await page.waitForTimeout(2600);
  const r = await page.evaluate(() => ({
    fx: window.__fx, stats: window.FX.stats, settings: window.FX.settings,
    events: window.__coup.G ? window.__coup.G.s.events : [], winner: window.__coup.G ? window.__coup.G.s.winner : -2,
  }));
  r.errors = errors;
  await browser.close();
  return r;
}

const count = (arr, n) => arr.filter((x) => x === n).length;

// ---- 1. everything on
const a = await playOne('all on');
if (a) {
  const names = a.fx.plays.map((p) => p.n);
  const need = {};
  a.events.forEach((e) => { for (const n of expected(e, 0)) need[n] = (need[n] || 0) + 1; });
  for (const [n, k] of Object.entries(need)) {
    const got = count(names, n);
    if (n === 'turn' ? got !== k : got < k) fail(`all on: sound "${n}" played ${got} times, events need ${k}`);
  }
  if (!names.includes('shuffle')) fail('all on: no deal shuffle');
  const kind = a.winner === 0 ? 'win' : 'lose';
  if (!a.fx.celebrates.includes(kind)) fail(`all on: winner ${a.winner}, expected celebrate '${kind}', got ${JSON.stringify(a.fx.celebrates)}`);
  if (a.fx.celebrates.includes(kind === 'win' ? 'lose' : 'win')) fail('all on: celebrated the wrong result');
  const bigs = a.events.filter((e) => e.t === 'challenge' && ((e.by === 0 && !e.truth) || (e.of === 0 && e.truth))).length;
  if (count(a.fx.celebrates, 'big') !== bigs) fail(`all on: ${count(a.fx.celebrates, 'big')} big moments for ${bigs} won challenges`);
  if (a.stats.plays < 5) fail('all on: fewer than 5 sounds really played: ' + a.stats.plays);
  if (a.fx.animates < 5) fail('all on: fewer than 5 animations ran: ' + a.fx.animates);
  if (a.fx.canvases < 1) fail('all on: no celebration canvas');
  a.errors.forEach((e) => fail('all on: ' + e));
  console.log('all on:', JSON.stringify({ events: a.events.length, plays: names.length, real: a.stats.plays, need, celebrates: a.fx.celebrates, helpers: a.fx.helpers.length, animates: a.fx.animates, canvases: a.fx.canvases }));
}

// ---- 2. Sound off
const b = await playOne('sound off', { sound: false });
if (b) {
  if (b.stats.plays !== 0) fail('sound off: ' + b.stats.plays + ' sounds played');
  if (b.fx.plays.some((p) => p.ok)) fail('sound off: FX.play returned true');
  if (b.fx.animates < 5) fail('sound off: animations should still run');
  b.errors.forEach((e) => fail('sound off: ' + e));
  console.log('sound off:', JSON.stringify({ calls: b.fx.plays.length, real: b.stats.plays, animates: b.fx.animates }));
}

// ---- 3. Animations off
const c = await playOne('animations off', { animations: false });
if (c) {
  if (c.fx.animates !== 0) fail('animations off: ' + c.fx.animates + ' element animations ran');
  if (c.fx.canvases !== 0) fail('animations off: confetti canvas appeared');
  if (c.stats.plays < 5) fail('animations off: sounds should still play');
  c.errors.forEach((e) => fail('animations off: ' + e));
  console.log('animations off:', JSON.stringify({ animates: c.fx.animates, canvases: c.fx.canvases, real: c.stats.plays }));
}

console.log(failures.length ? `${failures.length} FAILED` : 'ALL PASS');
process.exit(failures.length ? 1 : 0);
