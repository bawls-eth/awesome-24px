// cycle 9 L (3): the Pop HUD wrote String(n) ("1234567") while the result card used MMMiniKit.fmt ("1,234,567"): two looks for one
// number, and the 9-character case the HUD boxes were sized for in cycle 8 never happened in the real game. Now the HUD Score and
// Best and the result headline go through MMMiniKit.fmt. Also: at 160x284 the 9-character value ran 4 px past its box (cycle 8 U,
// unresolved): under 180 px the stage and the boxes give back side room.
// Proven with the game's OWN writer (a real save with a 1,234,567 best, a real round), not by typing text into the element, at
// 1280x720, 390x844, 195x422 and 160x284. Offline: blockDb, db.attempts() === 0. Never chats, never writes to Firebase.
// Run: BASE=http://localhost:9901/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc9-lead-pop-fmt.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const ORIGIN = new URL(BASE).origin;
const SHOT = process.env.SHOT_DIR || '';

(async () => {
  const browser = await chromium.launch();
  let attempts = 0; const errors = [];
  for (const [w, h] of [[1280, 720], [390, 844], [195, 422], [160, 284]]) {
    const tag = w + 'x' + h;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 500, isMobile: w < 500 });
    const db = await blockDb(ctx);
    const page = await ctx.newPage(); page.on('pageerror', (e) => errors.push(tag + ': ' + e.message));
    await page.goto(ORIGIN + '/game/games/pop/pop.css');
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('pixeltown-pop-v1', JSON.stringify({ v: 1, best: 1234567, rounds: 3, hint: 1 })); });
    await page.goto(ORIGIN + '/game/games/pop/index.html?test=1&seed=demo1');
    await page.waitForFunction(() => window.__pop && document.getElementById('h-best'));
    await page.waitForTimeout(300);
    const before = await page.evaluate(() => ({ best: document.getElementById('h-best').textContent, saveBest: window.__pop.save.best }));
    check(`[${tag}] the save was read (best 1234567) and the HUD Best shows it with separators`, before.saveBest === 1234567 && before.best === '1,234,567', JSON.stringify(before));
    // a real round: start, give the run a seven-figure score, let the game draw its own HUD
    const measure = () => page.evaluate(() => ['h-score', 'h-best'].map((id) => {
      const st = document.getElementById(id); const box = st.closest('.stat'); const b = box.getBoundingClientRect(); const cs = getComputedStyle(box);
      const rg = document.createRange(); rg.selectNodeContents(st); const t = rg.getBoundingClientRect();
      return { id, text: st.textContent, fs: parseFloat(getComputedStyle(st).fontSize), inner: [b.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth), b.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth)].map(Math.round), span: [t.left, t.right].map(Math.round) };
    }));
    await page.evaluate(() => { window.__pop.start(); window.__pop.run.score = 234567; window.__pop.step(1.1); window.__pop.step(1.1); });
    const drawn = (t) => page.waitForFunction((x) => document.getElementById('h-score').textContent === x, t, { timeout: 8000 }).catch(() => {}); // the HUD is rewritten on the next animation frame after the whole second changes
    await drawn('234,567');
    const six = await measure();
    check(`[${tag}] a six-figure score reads 234,567 and fits its box at >= 12 px`, six[0].text === '234,567' && six.every((q) => q.fs >= 12 && q.span[0] >= q.inner[0] - 0.5 && q.span[1] <= q.inner[1] + 0.5), JSON.stringify(six));
    await page.evaluate(() => { window.__pop.run.score = 2345678; window.__pop.step(1.1); window.__pop.step(1.1); });
    await page.waitForTimeout(150);
    await drawn('2,345,678');
    const r = await measure();
    check(`[${tag}] in play the HUD Score reads 2,345,678 and Best 1,234,567 (the game's own writer)`, r[0].text === '2,345,678' && r[1].text === '1,234,567', JSON.stringify(r.map((q) => q.text)));
    check(`[${tag}] both 9-character values are >= 12 px and inside their box padding`, r.every((q) => q.fs >= 12 && q.span[0] >= q.inner[0] - 0.5 && q.span[1] <= q.inner[1] + 0.5), JSON.stringify(r));
    check(`[${tag}] no horizontal page scroll`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (SHOT) await page.screenshot({ path: `${SHOT}/cyc9-lead-pop-hud-${tag}.jpg`, type: 'jpeg', quality: 70 });
    // the round ends: the headline uses the same formatter, and the HUD Best takes the new best
    await page.evaluate(() => window.__pop.step(95));
    await page.waitForSelector('#result:not([hidden])');
    const e = await page.evaluate(() => ({ head: document.getElementById('r-score').textContent, best: document.getElementById('h-best').textContent, run: window.__pop.run.score, saved: JSON.parse(localStorage.getItem('pixeltown-pop-v1')).best }));
    const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    check(`[${tag}] result headline and HUD Best both show the final score with separators; the save holds the plain number`, e.run >= 2345678 && e.head === fmt(e.run) && e.best === fmt(e.run) && e.saved === e.run, JSON.stringify(e));
    if (SHOT) await page.screenshot({ path: `${SHOT}/cyc9-lead-pop-result-${tag}.jpg`, type: 'jpeg', quality: 70 });
    attempts += db.attempts(); await ctx.close();
  }
  check('no page errors', errors.length === 0, errors.join(' | '));
  check('offline: no database traffic (literal 0)', attempts === 0, String(attempts));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
