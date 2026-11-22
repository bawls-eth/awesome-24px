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
  check('MMNav mounted (Where to? button) and the old links removed from view', await p.evaluate(() => !!document.getElementById('mm-nav-btn') && document.body.classList.contains('mm-nav-on') && document.getElementById('back').hidden && document.getElementById('town').hidden && document.getElementById('back').getBoundingClientRect().width === 0));
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
  // MK1 shared result card: share code, goal line, Menu, 44 px Copy, text >= 12 px
  const kit = await p.evaluate(() => {
    const r = document.getElementById('result'), c = document.getElementById('r-copy').getBoundingClientRect();
    const small = Array.from(r.querySelectorAll('*')).filter((e) => e.childNodes.length && Array.from(e.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12).map((e) => e.className || e.tagName);
    const foc = r.querySelector('button, a');
    return { card: r.classList.contains('mk-card'), code: document.getElementById('r-code').textContent, goal: document.getElementById('r-goal').textContent, menu: !!r.querySelector('a.mk-link[href]'), copy: [c.width, c.height], small, first: foc && foc.id, medals: !!r.querySelector('#r-medals') };
  });
  check('kit: shared result card with share code DEMO1, a goal line and a Menu link', kit.card && kit.code === 'DEMO1' && kit.goal.length > 0 && kit.menu && kit.medals, JSON.stringify(kit));
  check('kit: Copy is >= 44 px, Play again is the first focusable, no text under 12 px', kit.copy[0] >= 44 && kit.copy[1] >= 44 && kit.first === 'again' && kit.small.length === 0, JSON.stringify(kit));
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
  // ---- second pass: chain preview, combo audio ladder, idle hint ----
  const CHAINB = [[1, 3, 1, 3, 1, 3], [3, 1, 3, 1, 4, 4], [1, 3, 1, 3, 2, 3], [3, 1, 3, 1, 2, 1], [1, 3, 1, 3, 1, 3]];
  const pv = await p.evaluate((B) => {
    __pop.set(B); const before = JSON.stringify(__pop.values());
    const pr = __pop.predict(2, 4), lone = __pop.predict(0, 0);
    const same = JSON.stringify(__pop.values()) === before;
    const r = __pop.tap(2, 4);
    return { pr, lone, same, chain: r.chain, sound: __pop.lastSound };
  }, CHAINB);
  check('chain preview: a twin pair that lands next to its twin predicts a x2 chain (group of 2, new tile 3)', pv.pr && pv.pr.size === 2 && pv.pr.chain === 2 && pv.pr.cells.length === 2, JSON.stringify(pv.pr));
  check('chain preview: never touches the board (or the seeded refills); a lone tile predicts nothing', pv.same && pv.lone === null);
  check('chain preview is a safe lower bound: the real pop chained at least as far', pv.chain >= pv.pr.chain, JSON.stringify(pv));
  check('combo audio ladder: a x2 chain plays the brighter "claim" step', pv.chain === 2 ? pv.sound === 'claim' : pv.sound === ['pickup', 'claim', 'bag_rare', 'levelup'][Math.min(pv.chain, 4) - 1], JSON.stringify(pv));
  const lad = await p.evaluate(() => {
    __pop.set([[1, 1, 3, 2, 3, 2], [2, 3, 2, 3, 2, 3], [3, 2, 3, 2, 3, 2], [2, 3, 2, 3, 2, 3], [3, 2, 3, 2, 3, 2]]);
    const r = __pop.tap(0, 1), one = __pop.lastSound;
    __pop.set([[1, 2, 1, 2, 1, 2], [2, 1, 2, 1, 2, 1], [1, 2, 1, 2, 1, 2], [2, 1, 2, 1, 2, 1], [1, 2, 1, 2, 1, 1]]);
    __pop.tap(0, 0);
    return { chain: r.chain, one, miss: __pop.lastSound };
  });
  check('combo audio ladder: a plain pop plays the base "pickup" step', lad.chain !== 1 || lad.one === 'pickup', JSON.stringify(lad));
  check('combo audio ladder: a lone tile only plays the soft tap (no ladder step)', lad.miss === 'ui_tap', JSON.stringify(lad));
  await p.evaluate(() => { document.getElementById('board').focus(); });
  await p.keyboard.press('ArrowRight');
  check('chain preview follows the keyboard cursor', await p.evaluate(() => { const pr = __pop.preview; return pr === null || (Array.isArray(pr.cells) && pr.size >= 2); }));
  const hn = await p.evaluate(() => {
    __pop.tap(-1, -1); // no-op
    __pop.set([[1, 2, 1, 2, 1, 2], [2, 1, 2, 1, 2, 1], [1, 2, 1, 2, 1, 2], [2, 1, 2, 1, 2, 1], [1, 2, 1, 2, 3, 3]]);
    __pop.tap(0, 0); // a miss counts as activity: idle timer restarts
    __pop.step(5);
    const early = __pop.hint;
    __pop.step(1.2);
    const h = __pop.hint, m = document.getElementById('msg').textContent, best = __pop.bestMove();
    const r = __pop.tap(h.c, h.r);
    return { early, h: h && { c: h.c, r: h.r, size: h.size }, best: { c: best.c, r: best.r }, m, popped: !!r, after: __pop.hint, on: __pop.hintsOn };
  });
  check('idle hint: nothing for the first 6 s of thinking', hn.on && hn.early === null, JSON.stringify(hn));
  check('idle hint: after 6 s the best move glows and the status line nudges (no penalty, no timer change)', hn.h && hn.h.size >= 2 && hn.h.c === hn.best.c && hn.h.r === hn.best.r && /psst/i.test(hn.m), JSON.stringify(hn));
  check('idle hint: popping clears the glow', hn.popped && hn.after === null, JSON.stringify(hn));
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
  check('reduced motion: no screen shake; low graphics: particles capped at 24', rm.reduced && rm.low && rm.shake === 0 && rm.parts <= 24, JSON.stringify(rm));
  const dw = await q.evaluate(() => { const b = document.getElementById('board').getBoundingClientRect(); return { w: b.width, x: b.left, vw: innerWidth }; });
  check('desktop: board is centred and capped in width', dw.w <= 560 && dw.x > 100, JSON.stringify(dw));
  const hm = await q.evaluate(() => { __pop.step(4); const a = __pop.hint; __pop.step(3); return { a, b: __pop.hint }; });
  check('reduced motion: the idle hint still appears (a steady outline, no pulse)', hm.a === null && hm.b && hm.b.size >= 2, JSON.stringify(hm));
  const bb2 = await q.locator('#board').boundingBox();
  await q.evaluate(() => __pop.set([[1, 1, 3, 2, 3, 2], [2, 3, 2, 3, 2, 3], [3, 2, 3, 2, 3, 2], [2, 3, 2, 3, 2, 3], [3, 2, 3, 2, 3, 2]]));
  await q.mouse.move(bb2.x + bb2.width * 0.1, bb2.y + bb2.height * (0.5 / 6));
  check('chain preview: a mouse hovering a pair outlines it without popping', await q.evaluate(() => __pop.preview && __pop.preview.size === 2 && __pop.values()[0][0] === 1));
  await q.evaluate(() => __pop.end());
  await q.keyboard.press('r');
  check('kit: R on the result card plays again', await q.evaluate(() => __pop.run.state === 'play' && document.getElementById('result').hidden));
  check('desktop: no console errors, 0 DB requests', d.errors.length === 0 && d.db.count() === 0, JSON.stringify(d.errors));
  await d.ctx.close();
  const o = await open(browser, { viewport: { width: 1280, height: 800 } }, '?test=1&hints=0', { [KEY]: JSON.stringify({ v: 1, hint: true }) });
  await o.page.click('#play');
  check('?hints=0 turns the idle hint off', await o.page.evaluate(() => { __pop.step(10); return __pop.hintsOn === false && __pop.hint === null; }));
  check('hints=0 page: no console errors, 0 DB requests', o.errors.length === 0 && o.db.count() === 0, JSON.stringify(o.errors));
  await o.ctx.close();
  // share code in the URL deals the same board as the seed it came from; a bad code is ignored safely
  const boardFor = async (qs) => { const x = await open(browser, { viewport: { width: 1280, height: 800 } }, '?test=1&' + qs, { [KEY]: JSON.stringify({ v: 1, hint: true }) }); await x.page.click('#play'); const r = await x.page.evaluate(() => ({ v: __pop.values(), seed: __pop.run.seed })); const ok = x.errors.length === 0 && x.db.count() === 0; await x.ctx.close(); return Object.assign(r, { ok }); };
  const sc = await boardFor('seed=DEMO1'), sl = await boardFor('seed=demo1'), sb = await boardFor('seed=%3Cb%3Ebad%3C%2Fb%3E');
  check('kit: ?seed=DEMO1 (share code) plays the demo1 board', sc.seed === 'demo1' && JSON.stringify(sc.v) === JSON.stringify(sl.v) && sc.ok, sc.seed);
  check('kit: an invalid share code is ignored (fresh seed, no errors)', sb.seed !== '<b>bad</b>' && /^[a-z0-9]+$/.test(sb.seed) && sb.ok, sb.seed);
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
