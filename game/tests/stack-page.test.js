// Stack Tower page (game/games/stack): seeded timing stacker, trims, Perfect combos that widen, timer, medals, replay seed,
// best marker, phone targets, nav, prefs, hub map milestones (arcade group).
//   python3 -m http.server 9371 &   BASE=http://localhost:9371/game/index.html NODE_PATH=$(npm root -g) node game/tests/stack-page.test.js
// Standalone page only: never joins the town. Firebase hosts are blocked (blockDb) and must see 0 attempts.
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:9371/game/index.html';
const PAGE = BASE.replace(/index\.html.*$/, '') + 'games/stack/index.html';
const KEY = 'pixeltown-stack-v1', MKEY = 'pixeltown-medals-stack-v1';

async function open(browser, ctxOpts, query, init) {
  const ctx = await browser.newContext(ctxOpts);
  const db = await blockDb(ctx);
  if (init) await ctx.addInitScript((kv) => { if (!sessionStorage.seeded) { sessionStorage.seeded = '1'; Object.keys(kv).forEach((k) => localStorage.setItem(k, kv[k])); } }, init);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(PAGE + (query || '?test=1'));
  await page.waitForFunction(() => window.__stack);
  return { ctx, page, errors, db };
}
const lj = (p, k) => p.evaluate((key) => JSON.parse(localStorage.getItem(key)), k);

(async () => {
  const browser = await chromium.launch();
  // ---- phone, fresh save ----
  const s = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, '?test=1&seed=tow1');
  const p = s.page;
  check('title and how-to card on a fresh save', (await p.title()) === 'Stack Tower - Pixeltown' && await p.isVisible('#intro') && await p.isVisible('#how') && (await p.textContent('#play')) === 'Got it, play');
  check('MMNav mounted and the old links hidden', await p.evaluate(() => !!document.getElementById('mm-nav-btn') && document.body.classList.contains('mm-nav-on') && document.getElementById('back').hidden && document.getElementById('town').hidden));
  await p.tap('#play');
  check('Play starts the round: 90 s, seed from the URL, a block swinging', await p.evaluate(() => __stack.run.state === 'play' && __stack.run.time === 90 && __stack.run.seed === 'tow1' && !!__stack.mover && document.getElementById('intro').hidden));
  check('hint is remembered in the own save key', (await lj(p, KEY)).hint === true);
  const log1 = await p.evaluate(() => { for (let i = 0; i < 6; i++) { __stack.align(0); __stack.drop(); } return JSON.stringify(__stack.run.log); });
  // the block moves on its own
  const mv = await p.evaluate(() => { const x0 = __stack.mover.x; __stack.step(0.2); return [x0, __stack.mover.x]; });
  check('the block swings across over time', mv[0] !== mv[1], JSON.stringify(mv));
  // trim: drop 30 px off -> width shrinks by 30, a piece falls, near text not shown (30 > 12)
  const trim = await p.evaluate(() => { const w0 = __stack.tower.slice(-1)[0].w; __stack.align(30); const r = __stack.drop(); return { r, w0, w1: __stack.tower.slice(-1)[0].w, c: __stack.counts(), combo: __stack.run.combo }; });
  check('an overhang is trimmed off: the new floor is narrower by the overhang', trim.r && !trim.r.perfect && Math.abs(trim.w1 - (trim.w0 - 30)) < 0.01 && trim.r.cut === 30, JSON.stringify(trim));
  check('the trimmed piece falls and the Perfect combo resets', trim.c.falling >= 1 && trim.combo === 0, JSON.stringify(trim));
  const near = await p.evaluate(() => { __stack.align(8); __stack.drop(); return document.getElementById('msg').textContent; });
  check('near-miss text: "8 px from a Perfect"', /8 px from a Perfect/.test(near), near);
  // Perfect combo widens
  const pf = await p.evaluate(() => { const ws = []; for (let i = 0; i < 3; i++) { __stack.align(i === 1 ? 4 : 0); const r = __stack.drop(); ws.push([r.perfect, r.w]); } return { ws, combo: __stack.run.combo, c: __stack.counts() }; });
  check('within 5 px is a Perfect that snaps flush (width kept)', pf.ws[0][0] && pf.ws[1][0] && pf.ws[1][1] === pf.ws[0][1], JSON.stringify(pf));
  check('three Perfects in a row widen the block by 10', pf.ws[2][0] && pf.ws[2][1] === pf.ws[1][1] + 10 && pf.combo === 3, JSON.stringify(pf));
  check('juice: particles and floating text spawn on a Perfect', pf.c.parts > 0 && pf.c.floats > 0, JSON.stringify(pf.c));
  const sp = await p.evaluate(() => { const l = __stack.run.log; return [l[0][1], l[l.length - 1][1]]; });
  check('the swing speeds up as the tower climbs', sp[1] > sp[0], JSON.stringify(sp));
  // targets
  const t = await p.evaluate(() => ['drop', 'btn-mute'].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return [id, r.width, r.height, r.bottom]; }).concat([[innerWidth, document.documentElement.scrollWidth, innerHeight]]));
  check('phone: Drop button is wide, >= 44 px, on screen; no horizontal scroll', t[0][1] >= 300 && t[0][2] >= 44 && t[0][3] <= 844 && t[1][2] >= 44 && t[2][1] <= t[2][0], JSON.stringify(t));
  // real touch on Drop
  const f0 = await p.evaluate(() => { __stack.align(0); return __stack.run.floors; });
  await p.tap('#drop');
  check('a real tap on Drop adds a floor', await p.evaluate((f) => __stack.run.floors === f + 1, f0));
  // miss -> round over
  const miss = await p.evaluate(() => { const top = __stack.tower.slice(-1)[0]; __stack.mover.x = top.x + top.w + 2; return __stack.drop(); });
  check('missing the tower ends the round with a result card', miss.miss && await p.isVisible('#result') && await p.evaluate(() => __stack.run.state === 'over'));
  const end = await p.evaluate(() => ({ title: document.getElementById('r-title').textContent, line: document.getElementById('r-line').textContent, best: __stack.save.best, floors: __stack.run.floors, focus: document.activeElement.id }));
  check('result: "It fell!", floors, seed, new personal best, Play again focused', /It fell!/.test(end.title) && /seed tow1/.test(end.line) && end.best === end.floors && end.floors >= 10 && end.focus === 'again', JSON.stringify(end));
  const sv = await lj(p, KEY), md = await lj(p, MKEY), pr = await lj(p, 'pixeltown-profile-v1');
  check('own save key + hub medal summary written (round1 now, f40 not yet)', sv.v === 1 && sv.rounds === 1 && md.v === 1 && md.m.includes('round1') && !md.m.includes('f40'), JSON.stringify([sv, md]));
  check('hub map progress: the arcade milestone gives the Stack node a bronze', !!(pr && pr.nodes['w5-stack'] && pr.nodes['w5-stack'].medals.b && pr.games.stack.done.includes('round1')), JSON.stringify(pr && pr.nodes['w5-stack']));
  check('the W0 "all 6 games" goal is not cleared by an arcade game', !(pr.nodes['w0-practice'] && pr.nodes['w0-practice'].exits.includes('normal')) && !(pr.nodes['w0-first']));
  const kit = await p.evaluate(() => {
    const r = document.getElementById('result'), c = document.getElementById('r-copy').getBoundingClientRect();
    const small = Array.from(r.querySelectorAll('*')).filter((e) => Array.from(e.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12).map((e) => e.className || e.tagName);
    const foc = r.querySelector('button, a');
    return { card: r.classList.contains('mk-card'), code: document.getElementById('r-code').textContent, goal: document.getElementById('r-goal').textContent, menu: !!r.querySelector('a.mk-link[href]'), copy: [c.width, c.height], small, first: foc && foc.id, medals: !!r.querySelector('#r-medals'), rows: r.querySelectorAll('.mk-row').length };
  });
  check('kit: shared result card with share code TOW1, 3 stat rows, a goal line, a Menu link, medals kept', kit.card && kit.code === 'TOW1' && kit.rows === 3 && kit.goal.length > 0 && kit.menu && kit.medals, JSON.stringify(kit));
  check('kit: Copy is >= 44 px, Play again is the first focusable, no text under 12 px', kit.copy[0] >= 44 && kit.copy[1] >= 44 && kit.first === 'again' && kit.small.length === 0, JSON.stringify(kit));
  const btns = await p.evaluate(() => ['again', 'replay'].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return [id, r.width, r.height]; }));
  check('phone: Play again / Replay seed are >= 44 px', btns.every((x) => x[1] >= 44 && x[2] >= 44), JSON.stringify(btns));
  await p.tap('#replay');
  const log2 = await p.evaluate(() => { for (let i = 0; i < 6; i++) { __stack.align(0); __stack.drop(); } return { log: JSON.stringify(__stack.run.log), seed: __stack.run.seed }; });
  check('Replay seed swings the very same blocks (sides, speeds, colours)', log2.log === log1 && log2.seed === 'tow1', log2.log);
  await p.evaluate(() => __stack.end());
  await p.tap('#again');
  const log3 = await p.evaluate(() => { for (let i = 0; i < 9; i++) { __stack.align(0); __stack.drop(); } return { log: JSON.stringify(__stack.run.log.slice(0, 7)), seed: __stack.run.seed }; });
  check('Play again rolls a new seed (variety)', log3.seed !== 'tow1' && log3.log !== log1, log3.seed);
  // timer
  await p.evaluate(() => __stack.step(91));
  check('after 90 s the round ends: "Time!"', await p.evaluate(() => __stack.run.state === 'over' && /Time!/.test(document.getElementById('r-title').textContent)));
  // keyboard
  await p.tap('#again');
  await p.evaluate(() => { document.activeElement.blur(); __stack.align(0); });
  await p.keyboard.press('Space');
  check('keyboard: Space drops', await p.evaluate(() => __stack.run.floors === 1));
  await p.evaluate(() => __stack.align(0));
  await p.keyboard.press('Enter');
  check('keyboard: Enter drops too', await p.evaluate(() => __stack.run.floors === 2));
  check('best marker: the save best is shown on the HUD', (await p.textContent('#h-best')) === String(await p.evaluate(() => __stack.save.best)));
  check('phone: no console errors, 0 DB requests', s.errors.length === 0 && s.db.count() === 0, JSON.stringify(s.errors) + s.db.count());
  await s.ctx.close();

  // ---- desktop, returning player, reduced motion + low graphics, hostile save ----
  const d = await open(browser, { viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' }, '?test=1',
    { [KEY]: JSON.stringify({ v: 1, hint: true, best: 12, rounds: 3, medals: ['round1', 'evil', '__proto__', 'round1'], bestCombo: -5 }), [MKEY]: '{bad json', 'pixeltown-access-v1': JSON.stringify({ v: 1, lowGfx: true }) });
  const q = d.page;
  check('returning player: one-tap Play card, no how-to text', await q.isVisible('#intro') && !(await q.isVisible('#how')) && (await q.textContent('#play')) === 'Play');
  check('save is cleaned: unknown/duplicate medal ids dropped, bad numbers zeroed, best kept', await q.evaluate(() => __stack.save.best === 12 && __stack.save.bestCombo === 0 && JSON.stringify(__stack.save.medals) === '["round1"]'));
  await q.click('#play');
  const rm = await q.evaluate(() => { for (let i = 0; i < 4; i++) { __stack.align(0); __stack.drop(); } __stack.align(40); __stack.drop(); __stack.step(0.1); return Object.assign(__stack.counts(), { reduced: __stack.reduced, low: __stack.lowGfx }); });
  check('reduced motion: no shake or flash; low graphics: particles capped at 24', rm.reduced && rm.low && rm.shake === 0 && rm.flash === 0 && rm.parts <= 24, JSON.stringify(rm));
  const dw = await q.evaluate(() => { const b = document.getElementById('board').getBoundingClientRect(); return { w: b.width, x: b.left }; });
  check('desktop: board is centred and capped in width', dw.w <= 560 && dw.x > 100, JSON.stringify(dw));
  await q.evaluate(() => __stack.end());
  await q.waitForTimeout(450);
  const dk = await q.evaluate(() => ({ code: document.getElementById('r-code').textContent, seed: __stack.run.seed }));
  check('kit: desktop card shows the share code of the round seed', dk.code === dk.seed.toUpperCase() && /^[A-Z0-9]{1,24}$/.test(dk.code), JSON.stringify(dk));
  await q.keyboard.press('r');
  check('kit: R on the result card plays again', await q.evaluate(() => __stack.run.state === 'play' && document.getElementById('result').hidden));
  check('desktop: no console errors, 0 DB requests', d.errors.length === 0 && d.db.count() === 0, JSON.stringify(d.errors));
  await d.ctx.close();
  // share code in the URL swings the same blocks as the seed it came from; a bad code is ignored safely
  const logFor = async (qs) => { const x = await open(browser, { viewport: { width: 1280, height: 800 } }, '?test=1&' + qs, { [KEY]: JSON.stringify({ v: 1, hint: true }) }); await x.page.click('#play'); const r = await x.page.evaluate(() => { for (let i = 0; i < 6; i++) { __stack.align(0); __stack.drop(); } return { seed: __stack.run.seed, log: JSON.stringify(__stack.run.log) }; }); const ok = x.errors.length === 0 && x.db.count() === 0; await x.ctx.close(); return Object.assign(r, { ok }); };
  const sc = await logFor('seed=TOW1'), sl = await logFor('seed=tow1'), sb = await logFor('seed=%3Cb%3E!!');
  check('kit: ?seed=TOW1 (share code) swings the tow1 blocks', sc.seed === 'tow1' && sc.log === sl.log && sc.ok, sc.seed);
  check('kit: an invalid share code is ignored (fresh seed, no errors)', /^[a-z0-9]+$/.test(sb.seed) && sb.ok, sb.seed);
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
