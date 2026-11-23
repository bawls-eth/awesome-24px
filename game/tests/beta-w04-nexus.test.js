// W-04 (b04-05, b04-06, b04-07, b04-10, b02-13, b02-15): the walkable Nexus view.
// (1) hero at the 4 plaza corners: no fully dark column / row inside the canvas (no void band); (2) 390x844: the plaza view is >= 55% of the
// screen height and every portal label lies inside the floor the camera can show; (3) phone stall open: elementFromPoint at each Buy button
// centre is that button (no stick over it); (4) desktop 1280x720: the quest Claim buttons are inside the viewport without scrolling;
// (5) the NPC line fits its box. blockDb: no database traffic.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-w04-nexus.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&heropick=0&tutorial=0&seed=12345&qdate=2030-05-01';
const SAVE = { realm: { level: 4, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 } } };
const SHOTS = process.env.SHOTS || null;
const E = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world, ${JSON.stringify(arg === undefined ? null : arg)})`);
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

async function open(browser, phone) {
  const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 720 } });
  await blockDb(ctx);
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((v) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', v); }, JSON.stringify(SAVE));
  await page.goto(WORLD);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
  await page.waitForFunction(() => !window.__mm.world.artState().loading, null, { timeout: 20000 }).catch(() => {});
  await E(page, (a) => { a.player.iframes = 1e9; a._hitPlayer = () => {}; });
  await E(page, (a, w) => { const s = w.nexus.site; a.player.x = s.x - 20; a.player.y = s.y; });
  await frames(page, 15); await page.click('#rw-nexus-go'); await frames(page, 6);
  return { ctx, page, errors };
}
// darkest-line scan of the Nexus canvas: any column or row whose every pixel is near-black
const VOID = () => { const cv = document.querySelector('#rw-nexus canvas'); const g = cv.getContext('2d'); const d = g.getImageData(0, 0, cv.width, cv.height).data; const W = cv.width, H = cv.height;
  const dark = (i) => d[i] + d[i + 1] + d[i + 2] < 60; let cols = 0, rows = 0;
  for (let x = 0; x < W; x += 2) { let all = true; for (let y = 0; y < H && all; y += 3) if (!dark((y * W + x) * 4)) all = false; if (all) cols++; }
  for (let y = 0; y < H; y += 2) { let all = true; for (let x = 0; x < W && all; x += 3) if (!dark((y * W + x) * 4)) all = false; if (all) rows++; }
  return { cols, rows }; };

(async () => {
  const browser = await chromium.launch(); const errs = [];
  // ---- desktop ----
  const D = await open(browser, false); const dp = D.page;
  const corners = [];
  for (const [mx, my] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    await E(dp, (a, w, m) => { for (let i = 0; i < 500; i++) w.nexus.walk.step(m[0], m[1], 0.05); }, [mx, my]); await frames(dp, 3);
    corners.push(Object.assign({ at: [mx, my], cam: await E(dp, (a, w) => w.nexus.walk.cam()) }, await dp.evaluate(VOID)));
  }
  check('1280x720: at all 4 plaza corners the view has no fully dark column or row', corners.every((c) => c.cols === 0 && c.rows === 0), JSON.stringify(corners));
  if (SHOTS) await dp.screenshot({ path: SHOTS + '/w04-desk-corner.png' });
  // quest board: Claim buttons inside the viewport without scrolling
  await E(dp, (a, w) => { const q = window.MMNexus.layout().npcs.find((n) => n.role === 'quests'); w.nexus.talk(q.id); }); await frames(dp, 4);
  const claim = await dp.evaluate(() => { const b = document.getElementById('rw-nx-board'); const rs = Array.from(b.querySelectorAll('button')).map((e) => e.getBoundingClientRect()); const sc = document.getElementById('rw-nexus').scrollTop; return { open: !b.classList.contains('hidden'), n: rs.length, inside: rs.every((r) => r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth), sc }; });
  check('1280x720: the quest board opens with every Claim button inside the viewport, no scroll', claim.open && claim.n >= 1 && claim.inside && claim.sc === 0, JSON.stringify(claim));
  if (SHOTS) await dp.screenshot({ path: SHOTS + '/w04-desk-board.png' });
  errs.push(...D.errors); await D.ctx.close();
  // ---- phone ----
  const P = await open(browser, true); const pp = P.page;
  const view = await pp.evaluate(() => { const r = document.querySelector('#rw-nexus .nx-stage').getBoundingClientRect(); return { h: r.height, w: r.width, ih: innerHeight }; });
  check('390x844: the plaza view is >= 55% of the screen height', view.h >= 0.55 * view.ih, JSON.stringify(view));
  const lab = await E(pp, (a, w) => { const L = window.MMNexus.layout(); return { labels: w.nexus.walk.labels(), W: L.w * 32, H: L.h * 32 }; });
  check('every portal label lies inside the floor the camera shows (not cut at the plaza edge)', lab.labels.length >= 4 && lab.labels.every((r) => r.x >= 32 && r.x + r.w <= lab.W - 32), JSON.stringify(lab.labels));
  // stall open: Buy buttons hit themselves (the sticks step aside)
  await E(pp, (a, w) => w.nexus.talk('vendor')); await frames(pp, 4);
  const buys = await pp.evaluate(() => { const st = document.getElementById('rw-nx-stall'); const out = []; st.querySelectorAll('button').forEach((b) => { b.scrollIntoView({ block: 'nearest' }); const r = b.getBoundingClientRect(); if (!r.width) return; const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); out.push({ t: b.textContent.slice(0, 16), ok: el === b || b.contains(el) }); }); return out; });
  check('390x844 stall open: elementFromPoint at every stall button centre is that button', buys.length >= 2 && buys.every((b) => b.ok), JSON.stringify(buys.filter((b) => !b.ok)));
  const talk = await pp.evaluate(() => { const t = document.querySelector('#rw-nexus .nx-talk'); return { sh: t.scrollHeight, ch: t.clientHeight, txt: t.textContent }; });
  check('the NPC line fits its box (scrollHeight <= clientHeight)', talk.sh <= talk.ch + 1 && talk.txt.length > 5, JSON.stringify(talk));
  if (SHOTS) await pp.screenshot({ path: SHOTS + '/w04-phone-stall.png' });
  errs.push(...P.errors); await P.ctx.close();
  check('no page errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
