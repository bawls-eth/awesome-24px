// Echo Garden page (game/games/echo): seeded calm memory tunes, forgiving wilts + slower replay, timer, medals, replay seed,
// phone targets, nav, prefs, hub map milestones (arcade group).
//   python3 -m http.server 9371 &   BASE=http://localhost:9371/game/index.html NODE_PATH=$(npm root -g) node game/tests/echo-page.test.js
// Standalone page only: never joins the town. Firebase hosts are blocked (blockDb) and must see 0 attempts.
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
// G-17: the kit's result card ignores clicks for its holdMs after it opens: wait for that (a condition, not a sleep) before tapping it
const kitReady = (pg) => pg.waitForFunction(() => { const r = document.getElementById('result'); return !r || !r.__mkOn || r.__mkOn.clickReady(); }, null, { timeout: 3000 }).catch(() => {});
const BASE = process.env.BASE || 'http://localhost:9371/game/index.html';
const PAGE = BASE.replace(/index\.html.*$/, '') + 'games/echo/index.html';
const KEY = 'pixeltown-echo-v1', MKEY = 'pixeltown-medals-echo-v1';

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
const lj = (p, k) => p.evaluate((key) => JSON.parse(localStorage.getItem(key)), k);
// echo the current tune correctly (in page)
const echoTune = (p) => p.evaluate(() => { __echo.listen(); const s = __echo.seq(); let r = null; s.forEach((i) => { r = __echo.tap(i); }); return { r, len: __echo.run.len, score: __echo.run.score }; });

(async () => {
  const browser = await chromium.launch();
  // ---- phone, fresh save ----
  const s = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, '?test=1&seed=bloom1');
  const p = s.page;
  check('title and how-to card on a fresh save', (await p.title()) === 'Echo Garden - Pixeltown' && await p.isVisible('#intro') && await p.isVisible('#how') && (await p.textContent('#play')) === 'Got it, play');
  check('MMNav mounted and the old links hidden', await p.evaluate(() => !!document.getElementById('mm-nav-btn') && document.body.classList.contains('mm-nav-on') && document.getElementById('back').hidden && document.getElementById('town').hidden));
  await p.tap('#play');
  check('Play starts: 120 s, seed from the URL, a 3-note tune is sung first', await p.evaluate(() => __echo.run.state === 'play' && __echo.run.time === 120 && __echo.run.seed === 'bloom1' && __echo.run.phase === 'show' && __echo.run.len === 3));
  check('hint is remembered in the own save key', (await lj(p, KEY)).hint === true);
  const early = await p.evaluate(() => { const r = __echo.tap(0); return { r, msg: document.getElementById('msg').textContent }; });
  check('tapping during the tune is ignored and explained (Listen first)', early.r === false && /Listen first/.test(early.msg), JSON.stringify(early));
  const sung = await p.evaluate(() => { const seen = []; let n = 0; while (__echo.run.phase === 'show' && n++ < 400) { __echo.step(0.05); const l = __echo.lit(); l.forEach((v, i) => { if (v > 0.15 && seen[seen.length - 1] !== i + ':' + __echo.run.showI) seen.push(i + ':' + __echo.run.showI); }); } return { seen, phase: __echo.run.phase, seq: __echo.seq() }; });
  check('the garden lights each note of the tune in order, then it is your turn', sung.phase === 'input' && sung.seen.map((x) => +x.split(':')[0]).join(',') === sung.seq.join(','), JSON.stringify(sung));
  const seq1 = await p.evaluate(() => JSON.stringify(__echo.seq(20)));
  const e1 = await echoTune(p);
  check('echoing the tune scores (10/note + bloom bonus) and grows it to 4 notes', e1.r.ok && e1.r.done && e1.len === 4 && e1.score === 45, JSON.stringify(e1));
  const juice = await p.evaluate(() => __echo.counts());
  check('juice: petals and floating text on a finished tune', juice.parts > 0 && juice.floats > 0, JSON.stringify(juice));
  // a miss: wilt, hint, replay slower, the same tune
  const miss = await p.evaluate(() => { __echo.listen(); const want = __echo.seq()[0]; const r = __echo.tap((want + 1) % 4); const t0 = __echo.run.tempo; __echo.step(1.2); return { r, want, leaves: __echo.run.leaves, msg: document.getElementById('msg').textContent, phase: __echo.run.phase, slower: __echo.run.tempo > t0, len: __echo.run.len }; });
  check('a wrong flower wilts one leaf and names the right one', miss.r.ok === false && miss.r.want === miss.want && miss.leaves === 2, JSON.stringify(miss));
  check('then the same tune plays again, slower (forgiving)', miss.phase === 'show' && miss.slower && miss.len === 4 && /slower/.test(miss.msg), JSON.stringify(miss));
  for (let i = 0; i < 3; i++) await echoTune(p);
  check('the tune keeps growing: 7 notes after echoing 6', await p.evaluate(() => __echo.run.len === 7 && __echo.run.best === 6 && __echo.save.medals.includes('t6')));
  // targets
  const t = await p.evaluate(() => { const b = document.getElementById('board').getBoundingClientRect(); return { pw: b.width / 2, ph: b.height / 2, bottom: b.bottom, vw: innerWidth, sw: document.documentElement.scrollWidth, mute: document.getElementById('btn-mute').getBoundingClientRect().height }; });
  check('phone: each flower pad is >= 44 px (about 179 px), no horizontal scroll', t.pw >= 44 && t.ph >= 44 && t.sw <= t.vw && t.mute >= 44, JSON.stringify(t));
  // a real touch on the right pad
  const want = await p.evaluate(() => { __echo.listen(); return __echo.seq()[0]; });
  const bb = await p.locator('#board').boundingBox();
  await p.touchscreen.tap(bb.x + bb.width * (want % 2 ? 0.75 : 0.25), bb.y + bb.height * (want >= 2 ? 0.75 : 0.25));
  check('a real touch on the right flower counts as the next note', await p.evaluate(() => __echo.run.pos === 1));
  // last leaves -> gentle end
  await p.evaluate(() => { const w = __echo.seq()[1]; __echo.tap((w + 1) % 4); __echo.listen(); __echo.tap((__echo.seq()[0] + 1) % 4); });
  check('the third wilt ends the round with a calm result card', await p.isVisible('#result') && await p.evaluate(() => __echo.run.state === 'over' && /rests/.test(document.getElementById('r-title').textContent)));
  const end = await p.evaluate(() => ({ line: document.getElementById('r-line').textContent, best: __echo.save.best, focus: document.activeElement.id, rb: document.getElementById('r-best').textContent }));
  check('result: near-miss line, seed, new best tune, Play again focused', /Seed bloom1/.test(end.line) && /note/.test(end.line) && end.best === 6 && /New best tune: 6/.test(end.rb) && end.focus === 'again', JSON.stringify(end));
  const sv = await lj(p, KEY), md = await lj(p, MKEY), pr = await lj(p, 'pixeltown-profile-v1');
  check('own save key + hub medal summary (round1, t6)', sv.v === 1 && sv.rounds === 1 && md.v === 1 && md.m.includes('round1') && md.m.includes('t6') && !md.m.includes('t10'), JSON.stringify([sv, md]));
  check('hub map progress: Echo node bronze + silver from the arcade milestones', !!(pr && pr.nodes['w5-echo'] && pr.nodes['w5-echo'].medals.b && pr.nodes['w5-echo'].medals.s && !pr.nodes['w5-echo'].medals.g), JSON.stringify(pr && pr.nodes['w5-echo']));
  const kit = await p.evaluate(() => {
    const r = document.getElementById('result'), c = document.getElementById('r-copy').getBoundingClientRect();
    const small = Array.from(r.querySelectorAll('*')).filter((e) => Array.from(e.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12).map((e) => e.className || e.tagName);
    const foc = r.querySelector('button, a');
    return { card: r.classList.contains('mk-card'), code: document.getElementById('r-code').textContent, goal: document.getElementById('r-goal').textContent, menu: !!r.querySelector('a.mk-link[href]'), copy: [c.width, c.height], small, first: foc && foc.id, medals: !!r.querySelector('#r-medals'), best: !!r.querySelector('.mk-row .mk-new') };
  });
  check('kit: shared result card with share code BLOOM1, a goal line, a Menu link, medals kept', kit.card && kit.code === 'BLOOM1' && kit.goal.length > 0 && kit.menu && kit.medals, JSON.stringify(kit));
  check('kit: Copy is >= 44 px, Play again is the first focusable, no text under 12 px', kit.copy[0] >= 44 && kit.copy[1] >= 44 && kit.first === 'again' && kit.small.length === 0, JSON.stringify(kit));
  const btns = await p.evaluate(() => ['again', 'replay'].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return [id, r.width, r.height]; }));
  check('phone: Play again / Replay seed are >= 44 px', btns.every((x) => x[1] >= 44 && x[2] >= 44), JSON.stringify(btns));
  await kitReady(p); await p.tap('#replay');
  check('Replay seed sings the very same melody', await p.evaluate((q) => JSON.stringify(__echo.seq(20)) === q && __echo.run.seed === 'bloom1' && __echo.run.score === 0 && __echo.run.leaves === 3, seq1));
  await p.evaluate(() => __echo.end());
  await kitReady(p); await p.tap('#again');
  check('Play again rolls a new seed and a new melody', await p.evaluate((q) => JSON.stringify(__echo.seq(20)) !== q && __echo.run.seed !== 'bloom1', seq1));
  // keyboard: number keys
  await p.evaluate(() => { document.activeElement.blur(); __echo.listen(); });
  const kseq = await p.evaluate(() => __echo.seq());
  for (const i of kseq) await p.keyboard.press(String(i + 1));
  check('keyboard: keys 1-4 echo the tune', await p.evaluate(() => __echo.run.len === 4 && __echo.run.score > 0));
  await p.evaluate(() => __echo.listen());
  const k0 = await p.evaluate(() => __echo.seq()[0]);
  // arrows + Enter: cursor starts at the last key pressed; move to k0 from top-left
  for (const k of ['ArrowUp', 'ArrowLeft']) await p.keyboard.press(k);
  if (k0 % 2) await p.keyboard.press('ArrowRight');
  if (k0 >= 2) await p.keyboard.press('ArrowDown');
  await p.keyboard.press('Enter');
  check('keyboard: arrows move the cursor, Enter taps the flower', await p.evaluate(() => __echo.run.pos === 1));
  await p.evaluate(() => __echo.step(121));
  check('after 2 minutes the round ends: "Time!"', await p.evaluate(() => __echo.run.state === 'over' && /Time!/.test(document.getElementById('r-title').textContent)));
  check('phone: no console errors, 0 DB requests', s.errors.length === 0 && s.db.count() === 0, JSON.stringify(s.errors) + s.db.count());
  await s.ctx.close();

  // ---- desktop, returning player, reduced motion + low graphics, hostile save ----
  const d = await open(browser, { viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' }, '?test=1',
    { [KEY]: JSON.stringify({ v: 1, hint: true, best: 999, bestScore: 'x', rounds: 2, medals: ['t6', '<img src=x onerror=alert(1)>', 't6', 'constructor'] }), [MKEY]: '[[[', 'pixeltown-access-v1': JSON.stringify({ v: 1, lowGfx: true }) });
  const q = d.page;
  check('returning player: one-tap Play card, no how-to text', await q.isVisible('#intro') && !(await q.isVisible('#how')) && (await q.textContent('#play')) === 'Play');
  check('save is cleaned: hostile/duplicate ids dropped, numbers clamped', await q.evaluate(() => __echo.save.best === 64 && __echo.save.bestScore === 0 && JSON.stringify(__echo.save.medals) === '["t6"]' && document.querySelectorAll('img').length === 0));
  await q.click('#play');
  const rm = await q.evaluate(() => { for (let k = 0; k < 3; k++) { __echo.listen(); __echo.seq().forEach((i) => __echo.tap(i)); } return Object.assign(__echo.counts(), { reduced: __echo.reduced, low: __echo.lowGfx }); });
  check('reduced motion + low graphics prefs read; particles capped at 24', rm.reduced && rm.low && rm.parts <= 24, JSON.stringify(rm));
  const dw = await q.evaluate(() => { const b = document.getElementById('board').getBoundingClientRect(); return { w: b.width, x: b.left }; });
  check('desktop: board is centred and capped in width', dw.w <= 560 && dw.x > 100, JSON.stringify(dw));
  await q.evaluate(() => __echo.end());
  await q.keyboard.press('r');
  check('kit: R right at the end is held for a moment (no skipped result card)', await q.evaluate(() => __echo.run.state === 'over' && !document.getElementById('result').hidden));
  await q.waitForTimeout(450);
  const dk = await q.evaluate(() => ({ code: document.getElementById('r-code').textContent, seed: __echo.run.seed }));
  check('kit: desktop card shows the share code of the round seed', dk.code === dk.seed.toUpperCase() && /^[A-Z0-9]{1,24}$/.test(dk.code), JSON.stringify(dk));
  await q.keyboard.press('r');
  check('kit: R on the result card plays again', await q.evaluate(() => __echo.run.state === 'play' && document.getElementById('result').hidden));
  check('desktop: no console errors, 0 DB requests', d.errors.length === 0 && d.db.count() === 0, JSON.stringify(d.errors));
  await d.ctx.close();
  // share code in the URL sings the same tune as the seed it came from; a bad code is ignored safely
  const tuneFor = async (qs) => { const x = await open(browser, { viewport: { width: 1280, height: 800 } }, '?test=1&' + qs, { [KEY]: JSON.stringify({ v: 1, hint: true }) }); await x.page.click('#play'); const r = await x.page.evaluate(() => ({ seed: __echo.run.seed, t: JSON.stringify(__echo.seq(20)) })); const ok = x.errors.length === 0 && x.db.count() === 0; await x.ctx.close(); return Object.assign(r, { ok }); };
  const sc = await tuneFor('seed=BLOOM1'), sl = await tuneFor('seed=bloom1'), sb = await tuneFor('seed=%3Cb%3E!!');
  check('kit: ?seed=BLOOM1 (share code) sings the bloom1 tune', sc.seed === 'bloom1' && sc.t === sl.t && sc.ok, sc.seed);
  check('kit: an invalid share code is ignored (fresh seed, no errors)', /^[a-z0-9]+$/.test(sb.seed) && sb.ok, sb.seed);
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
