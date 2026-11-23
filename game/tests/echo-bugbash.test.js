// Echo Garden bug bash: chip cues, MMInput keys, canonical seeds / share codes, Settings, 150% text, landscape, hostile saves,
// rapid taps, resize, tab visibility, 2-minute cap.
//   python3 -m http.server 9433 &   BASE=http://localhost:9433/game/index.html NODE_PATH=$(npm root -g) node game/tests/echo-bugbash.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:9433/game/index.html';
const PAGE = BASE.replace(/index\.html.*$/, '') + 'games/echo/index.html';
const KEY = 'pixeltown-echo-v1';

async function open(browser, ctxOpts, query, init) {
  const ctx = await browser.newContext(ctxOpts);
  const db = await blockDb(ctx);
  if (init) await ctx.addInitScript((kv) => { if (!sessionStorage.seeded) { sessionStorage.seeded = '1'; Object.keys(kv).forEach((k) => localStorage.setItem(k, kv[k])); } }, init);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(PAGE + (query || '?test=1'));
  await page.waitForFunction(() => window.__echo);
  return { ctx, page, errors, db };
}
const HINT = { [KEY]: JSON.stringify({ v: 1, hint: true }) };

(async () => {
  const browser = await chromium.launch();
  const D = { viewport: { width: 1280, height: 800 } };

  // ---- cues, keys, seeds ----
  const a = await open(browser, D, '?test=1&seed=cue1', HINT);
  const p = a.page;
  await p.click('#play');
  check('MMChip + MMInput + MMSettings are loaded on the page', await p.evaluate(() => !!(window.MMChip && MMChip.SFX.bloom_c && window.MMInput && window.MMSettings && __echo.settings())));
  const sung = await p.evaluate(() => { __echo.listen(); return { cues: __echo.cues(), seq: __echo.seq(3) }; });
  const want = sung.seq.map((i) => ['bloom_c', 'bloom_d', 'bloom_e', 'bloom_g'][i]).join(',');
  check('the garden sings each note with its own MMChip bloom cue (C D E G)', sung.cues.filter((c) => /^bloom_/.test(c)).join(',') === want, JSON.stringify(sung));
  const wr = await p.evaluate(() => { const w = __echo.seq()[0]; __echo.tap((w + 1) % 4); return __echo.cues().slice(-2); });
  check('a wrong flower plays the error cue and a bloom cue is not faked', wr.includes('error') && !wr.includes('perfect'), JSON.stringify(wr));
  // keys: WASD moves the cursor (MMInput alias), Space taps, 1-4 still work, Ctrl+1 and right click are ignored
  await p.evaluate(() => { __echo.listen(); });
  const k0 = await p.evaluate(() => __echo.seq()[0]);
  for (const k of ['w', 'a']) await p.keyboard.press(k);
  if (k0 % 2) await p.keyboard.press('d');
  if (k0 >= 2) await p.keyboard.press('s');
  await p.keyboard.press('Space');
  check('MMInput: WASD moves the cursor and Space taps the flower', await p.evaluate(() => __echo.run.pos === 1));
  const pos = await p.evaluate(() => __echo.run.pos);
  await p.keyboard.press('Control+2');
  await p.keyboard.press('Control+1');
  check('Ctrl+digit (browser shortcuts) never taps a flower', await p.evaluate((q) => __echo.run.pos === q && __echo.run.leaves === 2, pos));
  const bb = await p.locator('#board').boundingBox();
  await p.mouse.click(bb.x + 20, bb.y + 20, { button: 'right' });
  check('a right click is not a tap', await p.evaluate((q) => __echo.run.pos === q && __echo.run.leaves === 2, pos));
  // tab hidden / shown
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  check('tab visibility change keeps the round intact', await p.evaluate(() => __echo.run.state === 'play'));
  // 2 minute cap
  await p.evaluate(() => { while (__echo.run.time > 20) __echo.step(Math.min(5, __echo.run.time - 20)); __echo.step(__echo.run.time - 0.5); });
  check('the round is still on with half a second left', await p.evaluate(() => __echo.run.state === 'play' && __echo.run.time > 0));
  await p.evaluate(() => __echo.step(0.6));
  check('and over at 120 s (never longer), time shows 0', await p.evaluate(() => __echo.run.state === 'over' && document.getElementById('h-time').textContent === '0' && __echo.run.time === 0));
  check('desktop: no console errors, 0 DB requests', a.errors.length === 0 && a.db.count() === 0, JSON.stringify(a.errors));
  await a.ctx.close();

  // a clean timed round plays the perfect cue
  const c = await open(browser, D, '?test=1&seed=calm', HINT);
  await c.page.click('#play');
  const calm = await c.page.evaluate(() => { for (let k = 0; k < 2; k++) { __echo.listen(); __echo.seq().forEach((i) => __echo.tap(i)); } __echo.step(130); return { cues: __echo.cues(), wilts: __echo.run.wilts, why: __echo.run.why }; });
  check('a whole round with no wilt ends with the perfect cue', calm.why === 'time' && calm.wilts === 0 && calm.cues.includes('perfect'), JSON.stringify(calm));
  await c.ctx.close();

  // share code round trip: odd old-form seeds become canonical, so the code sings the same tune
  const tune = async (qs) => { const x = await open(browser, D, '?test=1&' + qs, HINT); await x.page.click('#play'); const r = await x.page.evaluate(() => ({ seed: __echo.run.seed, t: JSON.stringify(__echo.seq(30)) })); await x.ctx.close(); return r; };
  const s1 = await tune('seed=Ab-c_9'), s2 = await tune('seed=ABC9'), s3 = await tune('seed=abc9');
  check('seed Ab-c_9 is stored as abc9 and the ABC9 share code sings the very same tune', s1.seed === 'abc9' && s1.t === s2.t && s2.t === s3.t, JSON.stringify([s1.seed, s2.seed]));
  const s4 = await tune('seed=---');
  check('a seed with no letters or digits is ignored (fresh seed)', /^[a-z0-9]{1,8}$/.test(s4.seed), s4.seed);
  const t1 = await tune('seed=one'), t2 = await tune('seed=two');
  check('different seeds sing different tunes', t1.t !== t2.t);

  // ---- Settings via the Menu sheet ----
  const m = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, '?test=1', HINT);
  await m.page.tap('#mm-nav-btn');
  const setBtn = await m.page.evaluate(() => { const b = document.getElementById('mm-nav-settings'); return !!b && !b.hidden; });
  check('Menu sheet shows a Settings entry', setBtn);
  await m.page.tap('#mm-nav-settings');
  check('Settings opens the shared 8-bit panel', await m.page.evaluate(() => __echo.settings().isOpen()));
  await m.ctx.close();

  // ---- 150% text, landscape, resize ----
  const t = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, '?test=1', Object.assign({ 'pixeltown-access-v1': JSON.stringify({ v: 1, hudScale: 1.5 }) }, HINT));
  await t.page.tap('#play');
  const tm = await t.page.evaluate(() => { const h = document.getElementById('hud').getBoundingClientRect(); const bad = Array.from(document.querySelectorAll('#hud .stat')).filter((e) => e.scrollWidth > e.clientWidth + 1).length; return { fs: parseFloat(getComputedStyle(document.getElementById('h-score')).fontSize), sw: document.documentElement.scrollWidth, vw: innerWidth, hud: h.width, bad }; });
  check('150% text: HUD numbers scale to 30 px, nothing overflows sideways', tm.fs === 30 && tm.sw <= tm.vw && tm.bad === 0, JSON.stringify(tm));
  await t.page.evaluate(() => __echo.end());
  const rm = await t.page.evaluate(() => { const r = document.getElementById('result').getBoundingClientRect(); return { l: r.left, r: r.right, vw: innerWidth }; });
  check('150% text: the result card stays on screen', rm.l >= 0 && rm.r <= rm.vw, JSON.stringify(rm));
  await t.ctx.close();

  const l = await open(browser, { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true }, '?test=1', HINT);
  await l.page.tap('#play');
  const lm = await l.page.evaluate(() => { __echo.listen(); const b = document.getElementById('board').getBoundingClientRect(); return { bh: b.height, bw: b.width, bottom: b.bottom, sh: document.documentElement.scrollHeight, vh: innerHeight, sw: document.documentElement.scrollWidth, vw: innerWidth }; });
  check('landscape phone: the whole garden fits in the height, no sideways scroll', lm.bottom <= lm.vh && lm.sh <= lm.vh + 8 && lm.sw <= lm.vw && lm.bw >= 200, JSON.stringify(lm));
  // a real tap on each pad in landscape maps to the right flower
  const want0 = await l.page.evaluate(() => __echo.seq()[0]);
  const bx = await l.page.locator('#board').boundingBox();
  await l.page.touchscreen.tap(bx.x + bx.width * (want0 % 2 ? 0.75 : 0.25), bx.y + bx.height * (want0 >= 2 ? 0.75 : 0.25));
  check('landscape: a touch lands on the right flower', await l.page.evaluate(() => __echo.run.pos === 1));
  await l.page.setViewportSize({ width: 390, height: 844 });
  const rs = await l.page.evaluate(() => { const b = document.getElementById('board').getBoundingClientRect(); return { w: b.width, sw: document.documentElement.scrollWidth, vw: innerWidth }; });
  const want1 = await l.page.evaluate(() => __echo.seq()[1]);
  const b2 = await l.page.locator('#board').boundingBox();
  await l.page.touchscreen.tap(b2.x + b2.width * (want1 % 2 ? 0.75 : 0.25), b2.y + b2.height * (want1 >= 2 ? 0.75 : 0.25));
  check('rotating back to portrait: board resizes and taps still map', rs.sw <= rs.vw && rs.w > 300 && await l.page.evaluate(() => __echo.run.pos === 2), JSON.stringify(rs));
  check('landscape: no console errors', l.errors.length === 0, JSON.stringify(l.errors));
  await l.ctx.close();

  // ---- hostile saves ----
  const hostile = ['{"best":{"a":1},"bestScore":-5,"rounds":1e400,"medals":{"0":"t6"},"hint":"yes"}', '[1,2,3]', 'null', '"str"', 'x'.repeat(5000), '{"medals":["t6","t6","__proto__","t10"],"best":-1,"bestScore":"9"}'];
  for (const h of hostile) {
    const x = await open(browser, D, '?test=1', { [KEY]: h });
    const ok = await x.page.evaluate(() => { const s = __echo.save; return s.v === 1 && s.best >= 0 && s.best <= 64 && s.bestScore >= 0 && s.rounds >= 0 && Array.isArray(s.medals) && s.medals.every((m) => ['round1', 't6', 'clean8', 't10'].includes(m)) && typeof s.hint === 'boolean'; });
    await x.page.click('#play');
    await x.page.evaluate(() => { __echo.listen(); __echo.seq().forEach((i) => __echo.tap(i)); __echo.end(); });
    check('hostile save survives a whole round: ' + h.slice(0, 24), ok && x.errors.length === 0 && await x.page.isVisible('#result'), JSON.stringify(x.errors));
    await x.ctx.close();
  }

  // ---- rapid taps: hammering never breaks the state ----
  const r = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, '?test=1&seed=rapid', HINT);
  await r.page.tap('#play');
  const rr = await r.page.evaluate(() => {
    let bad = 0;
    for (let n = 0; n < 400; n++) {
      if (n % 7 === 0) __echo.listen();
      __echo.tap(n % 4); __echo.tap((n + 1) % 4); __echo.tap(-1); __echo.tap(9); __echo.tap(NaN);
      __echo.step(0.3);
      const q = __echo.run;
      if (q.leaves < 0 || q.leaves > 3 || q.pos < 0 || q.pos > q.len || q.score < 0) bad++;
    }
    return { bad, state: __echo.run.state, leaves: __echo.run.leaves };
  });
  check('rapid taps keep leaves 0..3, position in range, and end the round calmly', rr.bad === 0 && rr.state === 'over' && await r.page.isVisible('#result'), JSON.stringify(rr));
  // many real pointer taps on the live page
  await r.page.tap('#again');
  await r.page.evaluate(() => __echo.listen());
  const rb = await r.page.locator('#board').boundingBox();
  for (let n = 0; n < 12; n++) await r.page.touchscreen.tap(rb.x + rb.width * (n % 2 ? 0.75 : 0.25), rb.y + rb.height * (n % 3 ? 0.75 : 0.25));
  check('twelve quick real touches: still a valid round, no errors', await r.page.evaluate(() => __echo.run.leaves >= 0 && __echo.run.leaves <= 3) && r.errors.length === 0, JSON.stringify(r.errors));
  check('0 DB requests in every run', r.db.count() === 0);
  await r.ctx.close();

  // ---- low graphics / reduced motion: calm, capped ----
  const lg = await open(browser, { viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' }, '?test=1', Object.assign({ 'pixeltown-access-v1': JSON.stringify({ v: 1, lowGfx: true }) }, HINT));
  await lg.page.click('#play');
  const lc = await lg.page.evaluate(() => { for (let k = 0; k < 6; k++) { __echo.listen(); __echo.seq().forEach((i) => __echo.tap(i)); } return Object.assign(__echo.counts(), { reduced: __echo.reduced, low: __echo.lowGfx }); });
  check('low graphics + reduced motion: particles stay capped', lc.reduced && lc.low && lc.parts <= 24, JSON.stringify(lc));
  await lg.ctx.close();

  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
