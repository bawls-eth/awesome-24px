// Pixel Pop page (game/games/pop): seeded merge puzzle, chains, timer, medals, replay seed, phone targets, nav, prefs.
//   python3 -m http.server 9355 &   BASE=http://localhost:9355/game/index.html NODE_PATH=$(npm root -g) node game/tests/pop-page.test.js
// Standalone page only: never joins the town. Firebase hosts are blocked (blockDb) and must see 0 attempts.
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:9355/game/index.html';
const PAGE = BASE.replace(/index\.html.*$/, '') + 'games/pop/index.html';
const KEY = 'pixeltown-pop-v1', MKEY = 'pixeltown-medals-pop-v1';

async function open(browser, ctxOpts, query, init) {
  const ctx = await browser.newContext(ctxOpts);
  const db = await blockDb(ctx);
  if (init) await ctx.addInitScript((kv) => { if (!sessionStorage.seeded) { sessionStorage.seeded = '1'; Object.keys(kv).forEach((k) => localStorage.setItem(k, kv[k])); } }, init);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(PAGE + (query || '?test=1'));
  await page.waitForFunction(() => window.__pop);
  return { ctx, page, errors, db };
}
const lj = (p, k) => p.evaluate((key) => JSON.parse(localStorage.getItem(key)), k);

(async () => {
  const browser = await chromium.launch();
  // ---- phone, fresh save ----
  const s = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, '?test=1&seed=demo1');
  const p = s.page;
  check('title and how-to card on a fresh save', (await p.title()) === 'Pixel Pop - Pixeltown' && await p.isVisible('#intro') && await p.isVisible('#how') && (await p.textContent('#play')) === 'Got it, play');
  check('MMNav mounted (Where to? button) and legacy links hidden', await p.evaluate(() => !!document.getElementById('mm-nav-btn') && document.body.classList.contains('mm-nav-on')));
  await p.tap('#play');
  check('Play starts the round: card hidden, state play, 90 s, seed from the URL', await p.evaluate(() => __pop.run.state === 'play' && __pop.run.time === 90 && __pop.run.seed === 'demo1' && document.getElementById('intro').hidden));
  check('hint is remembered in the own save key', (await lj(p, KEY)).hint === true);
  const b1 = await p.evaluate(() => __pop.values());
  // controlled board: a column of three 2s under the tap -> merge + chain
  const res = await p.evaluate(() => {
    const v = [[1, 3, 1, 3, 1, 3], [3, 1, 3, 1, 4, 4], [1, 3, 1, 3, 2, 3], [3, 1, 3, 1, 2, 1], [1, 3, 1, 3, 1, 3]];
    __pop.set(v);
    const before = __pop.run.score;
    // tap (2,4): 2 at (2,4) + (3,4) merge into 3 at (2,4); after gravity it sits next to the 3s at (2,5) -> chain x2
    const r = __pop.tap(2, 4);
    return { r, gained: __pop.run.score - before, chain: __pop.run.bestChain, maxTile: __pop.run.maxTile, counts: __pop.counts() };
  });
  check('tapping twins merges them and scores (10 x value x size)', res.r && res.r.gained >= 40 && res.gained === res.r.gained, JSON.stringify(res));
  check('the merged tile chains into its new twin: chain x2 multiplies', res.r.chain >= 2 && res.chain >= 2, JSON.stringify(res));
  check('juice: particles and floating score text spawned', res.counts.parts > 0 && res.counts.floats > 0, JSON.stringify(res.counts));
  const lone = await p.evaluate(() => { __pop.set([[1, 2, 1, 2, 1, 2], [2, 1, 2, 1, 2, 1], [1, 2, 1, 2, 1, 2], [2, 1, 2, 1, 2, 1], [1, 2, 1, 2, 1, 1]]); const sc = __pop.run.score; const r = __pop.tap(0, 0); return { r, same: __pop.run.score === sc, msg: document.getElementById('msg').textContent }; });
  check('a lone tile does not pop and explains why (no penalty)', lone.r === false && lone.same && /twin/i.test(lone.msg), JSON.stringify(lone));
  // targets
  const t = await p.evaluate(() => {
    const b = document.getElementById('board').getBoundingClientRect();
    return { cell: b.width / 5, h: b.height / 6, w: b.width, vw: innerWidth, scroll: document.documentElement.scrollWidth };
  });
  check('phone: board cells are >= 44 px and no horizontal scroll', t.cell >= 44 && t.h >= 44 && t.scroll <= t.vw, JSON.stringify(t));
  // real tap on a pair via the canvas
  const tapped = await p.evaluate(() => { __pop.set([[1, 1, 3, 2, 3, 2], [2, 3, 2, 3, 2, 3], [3, 2, 3, 2, 3, 2], [2, 3, 2, 3, 2, 3], [3, 2, 3, 2, 3, 2]]); return __pop.run.score; });
  const bb = await p.locator('#board').boundingBox();
  await p.touchscreen.tap(bb.x + bb.width * 0.1, bb.y + bb.height * (1.5 / 6));
  check('a real touch on the board pops the pair under the thumb', await p.evaluate((sc) => __pop.run.score > sc, tapped));
  // timer -> end card
  await p.evaluate(() => __pop.step(95));
  check('after 90 s the round ends with a result card', await p.isVisible('#result') && await p.evaluate(() => __pop.run.state === 'over'));
  const end = await p.evaluate(() => ({ score: document.getElementById('r-score').textContent, line: document.getElementById('r-line').textContent, best: __pop.save.best, run: __pop.run.score, focus: document.activeElement.id }));
  check('result shows score, seed and a new personal best; Play again has focus', end.score === String(end.run) && /seed demo1/.test(end.line) && end.best === end.run && end.focus === 'again', JSON.stringify(end));
  const sv = await lj(p, KEY), md = await lj(p, MKEY);
  check('save is additive own key; medal summary key written for the hub', sv.v === 1 && sv.rounds === 1 && sv.best === end.run && md.v === 1 && md.m.includes('round1'), JSON.stringify([sv, md]));
  const btns = await p.evaluate(() => ['again', 'replay', 'btn-mute'].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return [id, r.width, r.height]; }));
  check('phone: Play again / Replay seed / Sound are >= 44 px', btns.every((x) => x[1] >= 44 && x[2] >= 44), JSON.stringify(btns));
  await p.tap('#replay');
  const b2 = await p.evaluate(() => ({ v: __pop.values(), seed: __pop.run.seed, st: __pop.run.state, score: __pop.run.score }));
  check('Replay seed deals the very same board (seeded)', JSON.stringify(b2.v) === JSON.stringify(b1) && b2.seed === 'demo1' && b2.st === 'play' && b2.score === 0);
  await p.evaluate(() => __pop.end());
  await p.tap('#again');
  const b3 = await p.evaluate(() => ({ v: __pop.values(), seed: __pop.run.seed }));
  check('Play again rolls a new seed (variety between runs)', b3.seed !== 'demo1' && JSON.stringify(b3.v) !== JSON.stringify(b1), b3.seed);
  // keyboard
  await p.evaluate(() => { __pop.set([[2, 2, 3, 1, 3, 1], [1, 3, 1, 3, 1, 3], [3, 1, 3, 1, 3, 1], [1, 3, 1, 3, 1, 3], [3, 1, 3, 1, 3, 1]]); document.activeElement.blur(); });
  const kb0 = await p.evaluate(() => __pop.run.score);
  for (const k of ['ArrowLeft', 'ArrowLeft', 'ArrowUp', 'ArrowUp', 'ArrowUp']) await p.keyboard.press(k);
  await p.keyboard.press('Enter');
  check('keyboard: arrows move the cursor, Enter pops', await p.evaluate((sc) => __pop.run.score > sc, kb0));
  check('phone: no console errors, 0 DB requests', s.errors.length === 0 && s.db.count() === 0, JSON.stringify(s.errors) + s.db.count());
  await s.ctx.close();

  // ---- desktop, returning player, reduced motion + low graphics, corrupt medal data ----
  const d = await open(browser, { viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' }, '?test=1',
    { [KEY]: JSON.stringify({ v: 1, hint: true, best: 1234, rounds: 3, medals: ['round1', 'evil', '__proto__'], extra: 'kept?' }), 'pixeltown-access-v1': JSON.stringify({ v: 1, lowGfx: true }) });
  const q = d.page;
  check('returning player: one-tap Play card, no how-to text', await q.isVisible('#intro') && !(await q.isVisible('#how')) && (await q.textContent('#play')) === 'Play');
  check('save is cleaned: unknown medal ids dropped, best kept', await q.evaluate(() => __pop.save.best === 1234 && JSON.stringify(__pop.save.medals) === '["round1"]'));
  await q.click('#play');
  const rm = await q.evaluate(() => { __pop.set([[1, 1, 3, 2, 3, 2], [2, 3, 2, 3, 2, 3], [3, 2, 3, 2, 3, 2], [2, 3, 2, 3, 2, 3], [3, 2, 3, 2, 3, 2]]); __pop.tap(0, 1); return Object.assign(__pop.counts(), { reduced: __pop.reduced, low: __pop.lowGfx }); });
  check('reduced motion: no screen shake; low graphics: fewer particles', rm.reduced && rm.low && rm.shake === 0 && rm.parts <= 12, JSON.stringify(rm));
  const dw = await q.evaluate(() => { const b = document.getElementById('board').getBoundingClientRect(); return { w: b.width, x: b.left, vw: innerWidth }; });
  check('desktop: board is centred and capped in width', dw.w <= 560 && dw.x > 100, JSON.stringify(dw));
  check('desktop: no console errors, 0 DB requests', d.errors.length === 0 && d.db.count() === 0, JSON.stringify(d.errors));
  await d.ctx.close();
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
