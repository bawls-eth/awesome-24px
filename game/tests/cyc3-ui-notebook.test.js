// Cycle 3 U (item 2): ID-04 hero notebook panel (the nxCss block in realm-world.js) against EIGHTBIT-STYLE.md and the phone / a11y rules.
// Gaps found in review and pinned here:
//   - the card had the quest board's 10 px rounded corners (8-bit: square corners, hard ring, whole-pixel drop shadow, no blur);
//   - the title / category lines were system-ui (8-bit: the --px-font monospace stack);
//   - the panel text did not follow the Text size preference (hudScale 1.5 left it at 13 px);
//   - phone, walking Nexus: the move stick (z-index 90) stayed over the open notebook (the stall and board already hide it).
// Also kept: Close and the header button >= 44 px, Close takes focus on open, Esc closes the notebook first and returns focus.
// Firebase blocked (blockDb); the Town page is stubbed. Serve the repo root first:  python3 -m http.server 8440 &
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc3-ui-notebook.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&heropick=0&tutorial=0&seed=12345&qdate=2030-05-01';
const SAVE = { realm: { level: 4, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 } } };
const PAGES = JSON.stringify({ v: 1, e: { 'kill:aimed:sand_crab@0': 1, 'kill:spiral:wisp_mote@1': 2, 'boss:kraken@3': 3, 'clear:crypt': 4, 'tame:reef_ray': 5 } });
const SHOTS = process.env.SHOTS || (__dirname + '/../design/beta/img');
const E = (page, fn) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world)`);
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

async function open(browser, phone, access) {
  const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 720 } });
  const db = await blockDb(ctx);
  await ctx.route('**/game/index.html*', (rt) => rt.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((a) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', a[0]); localStorage.setItem('pixeltown-notebook-v1', a[1]); if (a[2]) localStorage.setItem('pixeltown-access-v1', a[2]); }, [JSON.stringify(SAVE), PAGES, access || null]);
  await page.goto(WORLD);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
  await E(page, (a) => { a.player.iframes = 1e9; a._hitPlayer = () => {}; });
  await E(page, (a, w) => { const s = w.nexus.site; a.player.x = s.x - 20; a.player.y = s.y; });
  await frames(page, 15);
  if (phone) await page.tap('#rw-nexus-go'); else await page.click('#rw-nexus-go');
  await frames(page, 6);
  if (phone) await page.tap('#rw-nx-notebook-btn'); else await page.click('#rw-nx-notebook-btn');
  await frames(page, 4);
  return { ctx, page, errors, db };
}

const MEASURE = () => {
  const el = document.getElementById('rw-nx-notebook'); const cs = getComputedStyle(el);
  const h3 = el.querySelector('h3'), cat = el.querySelector('.nx-nb-cat'), li = el.querySelector('li'), note = el.querySelector('.nx-nb-note');
  const r = el.getBoundingClientRect();
  const stick = document.getElementById('realm-stick-move');
  const sr = stick && getComputedStyle(stick).display !== 'none' && getComputedStyle(stick).visibility !== 'hidden' ? stick.getBoundingClientRect() : null;
  const stickOver = !!(sr && sr.width > 0 && Math.min(sr.right, r.right) - Math.max(sr.left, r.left) > 0 && Math.min(sr.bottom, innerHeight, r.bottom) - Math.max(sr.top, r.top) > 0);
  return {
    open: !el.classList.contains('hidden'), radius: cs.borderTopLeftRadius, shadow: cs.boxShadow,
    h3Font: getComputedStyle(h3).fontFamily, catFont: getComputedStyle(cat).fontFamily,
    fs: [h3, cat, li, note].map((e) => parseFloat(getComputedStyle(e).fontSize)),
    focus: document.activeElement && document.activeElement.id, walking: document.body.classList.contains('nx-walking'), stickOver,
    btns: Array.from(el.querySelectorAll('button')).concat([document.getElementById('rw-nx-notebook-btn')]).map((b) => { const q = b.getBoundingClientRect(); return [Math.round(q.width), Math.round(q.height)]; })
  };
};
// every shadow is "x y blur spread": a non-zero third length is a blur
const blur = (sh) => sh.replace(/rgba?\([^)]*\)/g, '').split(',').some((one) => { const n = (one.match(/-?[\d.]+px/g) || []).map(parseFloat); return n.length >= 3 && n[2] !== 0; });

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  // desktop
  const D = await open(browser, false); const dp = D.page;
  const d = await dp.evaluate(MEASURE);
  check('desktop: notebook opens and Close has focus', d.open && d.focus === 'rw-nx-nb-close', JSON.stringify(d));
  check('8-bit: square corners on the notebook card', d.radius === '0px', d.radius);
  check('8-bit: hard ring / whole-pixel shadow, no blur', d.shadow !== 'none' && !blur(d.shadow), d.shadow);
  check('8-bit: title and category lines use the pixel font stack (monospace)', /monospace/i.test(d.h3Font) && /monospace/i.test(d.catFont), d.h3Font + ' | ' + d.catFont);
  check('text >= 12 px everywhere in the panel', d.fs.every((f) => f >= 12), JSON.stringify(d.fs));
  check('desktop: Close and the header button >= 44x44', d.btns.every((b) => b[0] >= 44 && b[1] >= 44), JSON.stringify(d.btns));
  await dp.keyboard.press('Escape'); await frames(dp, 2);
  const esc = await dp.evaluate(() => ({ nb: document.getElementById('rw-nx-notebook').classList.contains('hidden'), nx: !document.getElementById('rw-nexus').classList.contains('hidden'), focus: document.activeElement && document.activeElement.id }));
  check('Esc closes the notebook first (the Nexus stays) and focus returns to the Notebook button', esc.nb && esc.nx && esc.focus === 'rw-nx-notebook-btn', JSON.stringify(esc));
  errs.push(...D.errors); check('desktop: 0 DB requests', D.db.attempts() === 0, String(D.db.attempts())); await D.ctx.close();
  // phone, walking Nexus
  const P = await open(browser, true); const pp = P.page;
  const p = await pp.evaluate(MEASURE);
  check('phone 390x844: notebook open in the walking Nexus', p.open && p.walking, JSON.stringify(p));
  check('phone: the move stick is not over the open notebook', !p.stickOver, JSON.stringify(p));
  check('phone: buttons >= 44x44', p.btns.every((b) => b[0] >= 44 && b[1] >= 44), JSON.stringify(p.btns));
  await pp.evaluate(() => document.getElementById('rw-nx-notebook').scrollIntoView({ block: 'start' }));
  await pp.screenshot({ path: SHOTS + '/cyc3-ui-notebook-phone.jpg', quality: 70 });
  await pp.tap('#rw-nx-nb-close'); await frames(pp, 2);
  const back = await pp.evaluate(() => { const s = document.getElementById('realm-stick-move'); return s && getComputedStyle(s).display !== 'none'; });
  check('phone: after Close the move stick is back', back);
  errs.push(...P.errors); check('phone: 0 DB requests', P.db.attempts() === 0, String(P.db.attempts())); await P.ctx.close();
  // Text size 150%
  const T = await open(browser, true, JSON.stringify({ v: 1, hudScale: 1.5 })); const tp = T.page;
  const t = await tp.evaluate(MEASURE);
  check('Text size 150%: notebook page text scales (>= 18 px)', t.open && Math.min.apply(null, t.fs.slice(1)) >= 18, JSON.stringify(t.fs));
  errs.push(...T.errors); check('150%: 0 DB requests', T.db.attempts() === 0, String(T.db.attempts())); await T.ctx.close();
  check('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();
  done();
})();
