// Bug bash (lane: shared modules), browser half: every shared core script loads twice without errors (double-load safety),
// sfx.js injects mm-chip.js once, MMMiniKit.panel() called again and again adds one document key listener, MMInput.attach /
// detach is balanced, no AudioContext exists before a user gesture, MMStore survives a throwing localStorage.
// Needs the static server: BASE=http://localhost:8440/game/index.html node game/tests/shared-bugbash-browser.test.js
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const ROOT = BASE.replace(/index\.html.*$/, '');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }

const CORE = ['rng.js', 'store.js', 'mm-hash.js', 'mm-8bit.js', 'mm-input.js', 'mm-minikit.js', 'mm-pixelize.js', 'mm-perf.js', 'mm-ghost.js', 'mm-art.js', 'motion.js'];

(async () => {
  const browser = await chromium.launch();
  try {
    // 1) double load + listener accounting + autoplay
    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      const errors = [];
      page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
      await page.addInitScript(() => {
        window.__ctxMade = 0;
        const Real = window.AudioContext || window.webkitAudioContext;
        if (Real) window.AudioContext = function () { window.__ctxMade++; return new Real(); };
        window.__docKeys = 0;
        const add = Document.prototype.addEventListener, rem = Document.prototype.removeEventListener;
        Document.prototype.addEventListener = function (t, f, o) { if (t === 'keydown') window.__docKeys++; return add.call(this, t, f, o); };
        Document.prototype.removeEventListener = function (t, f, o) { if (t === 'keydown') window.__docKeys--; return rem.call(this, t, f, o); };
      });
      await page.goto(ROOT + 'shared/'); // same origin, no game code
      await page.setContent('<!doctype html><html><head></head><body><section id="card"></section></body></html>');
      for (let pass = 0; pass < 2; pass++) for (const f of CORE) await page.addScriptTag({ url: ROOT + 'shared/' + f });
      await page.addScriptTag({ url: ROOT + 'shared/sfx.js' });
      await page.addScriptTag({ url: ROOT + 'shared/sfx.js' });
      await page.waitForFunction(() => !!window.MMChip, null, { timeout: 10000 }).catch(() => {});
      const injected = await page.evaluate(() => [...document.scripts].filter((s) => /mm-chip\.js/.test(s.src)).length);
      await page.addScriptTag({ url: ROOT + 'shared/mm-chip.js' }); // and mm-chip.js itself loaded a second time
      const r = await page.evaluate(() => {
        const g = ['MMRng', 'MMStore', 'MMHash', 'MM8', 'MMChip', 'MMInput', 'MMMiniKit', 'MMPixelize', 'MMPerf', 'MMGhost', 'MMArt', 'MMSfx'].filter((n) => !window[n]);
        const chipTags = [...document.scripts].filter((s) => /mm-chip\.js/.test(s.src)).length; // injected by sfx.js only
        const before = window.__docKeys;
        const el = document.getElementById('card');
        let again = 0;
        for (let i = 0; i < 6; i++) window.MMMiniKit.panel(el, { title: 'x', seed: 'Ab-c_1', headline: 'Run ' + i }, { again: () => again++ });
        const keysAdded = window.__docKeys - before;
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }));
        const code = el.querySelector('.mk-code').textContent;
        const t = window.MMInput.attach(window, () => {});
        t.detach();
        const fx = window.MMSfx.create({ storage: null });
        const madeBeforeGesture = window.__ctxMade;
        return { missing: g, chipTags, keysAdded, again, code, madeBeforeGesture, focusables: el.querySelectorAll('button').length, bodyPx8: document.body.classList.contains('px8'), names: fx.names().length };
      });
      check('every shared core script loads twice with no page error', errors.length === 0 && r.missing.length === 0, JSON.stringify([errors, r.missing]));
      check('sfx.js loaded twice injects mm-chip.js only once', injected === 1, String(injected));
      check('MMMiniKit.panel() x6 on one card adds one document keydown listener', r.keysAdded === 1, String(r.keysAdded));
      check('...and one R press plays again exactly once', r.again === 1, String(r.again));
      check('share code keeps - _ and case (Ab-c_1)', r.code === '.AB-C_1' && (await page.evaluate((c) => window.MMMiniKit.parseSeedCode(c), r.code)) === 'Ab-c_1', r.code);
      check('no AudioContext exists before a user gesture (MMSfx.create is lazy)', r.madeBeforeGesture === 0, String(r.madeBeforeGesture));
      await page.mouse.click(5, 5);
      const after = await page.evaluate(() => { const fx = window.MMSfx.create({ storage: null }); document.addEventListener('click', () => { window.__played = fx.play('coin'); }, { once: true }); return true; });
      await page.mouse.click(10, 10);
      const played = await page.evaluate(() => ({ played: window.__played, made: window.__ctxMade }));
      check('a tap plays a sound and makes exactly one AudioContext', after && played.played === true && played.made === 1, JSON.stringify(played));
      check('8-bit init is idempotent (px8 on body once loaded twice)', r.bodyPx8);
      check('no console errors after gesture', errors.length === 0, errors.join(' | '));
      await page.close();
    }
    // 2) storage that throws (Safari private mode / blocked cookies) and quota exceeded
    {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.addInitScript(() => {
        Storage.prototype.setItem = function () { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; };
      });
      await page.setContent('<!doctype html><html><body></body></html>');
      await page.addScriptTag({ url: ROOT + 'shared/store.js' });
      const r = await page.evaluate(() => { MMStore.set('k', { a: 1 }); MMStore.patch('k', (o) => { o.b = 2; return o; }); return JSON.stringify(MMStore.get('k')); });
      check('MMStore with quota exceeded keeps the session value', r === '{"a":1,"b":2}' && !errors.length, r + ' ' + errors.join());
      await page.close();
    }
  } catch (e) { check('browser run', false, e.stack); }
  await browser.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exitCode = failed ? 1 : 0;
})();
