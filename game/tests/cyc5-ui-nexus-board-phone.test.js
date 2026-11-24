// cyc5-ui (retest 3 P2 b04-r3-01): the phone quest board opened at y=736 of 844 with one row visible, its Claim buttons below the
// fold, and the Nexus scrolled inside itself with no cue. Now, on 390x844 (touch): talking to the Quest Giver brings the WHOLE board
// into view (every row and Claim button inside the viewport), and a "More below" cue shows while a panel runs past the bottom edge
// and goes when it does not. Desktop 1280x720 keeps the side card (no scroll, no cue). blockDb: no database traffic.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc5-ui-nexus-board-phone.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&heropick=0&tutorial=0&seed=12345&qdate=2030-05-01';
const SAVE = { realm: { level: 4, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 } } };
const E = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world, ${JSON.stringify(arg === undefined ? null : arg)})`);
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

async function open(browser, vp, touch) {
  const ctx = await browser.newContext(Object.assign({ viewport: vp }, touch ? { hasTouch: true, isMobile: true } : {}));
  await blockDb(ctx);
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((v) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', v); }, JSON.stringify(SAVE));
  await page.goto(WORLD);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
  await E(page, (a) => { a.player.iframes = 1e9; a._hitPlayer = () => {}; });
  await E(page, (a, w) => { const s = w.nexus.site; a.player.x = s.x - 20; a.player.y = s.y; });
  await frames(page, 15); await page.click('#rw-nexus-go'); await frames(page, 6);
  return { ctx, page, errors };
}
const BOARD = () => {
  const b = document.getElementById('rw-nx-board'), root = document.getElementById('rw-nexus');
  const rows = Array.from(b.querySelectorAll('.nx-q')).map((e) => e.getBoundingClientRect());
  const btns = Array.from(b.querySelectorAll('button')).map((e) => e.getBoundingClientRect());
  const r = b.getBoundingClientRect(), cue = document.getElementById('rw-nx-more');
  const cueOn = !!(cue && getComputedStyle(cue).display !== 'none');
  return { open: !b.classList.contains('hidden'), top: Math.round(r.top), bottom: Math.round(r.bottom), ih: innerHeight, rows: rows.length, btns: btns.length,
    inside: rows.concat(btns).every((x) => x.top >= 0 && x.bottom <= innerHeight), sc: root.scrollTop, cueOn };
};

(async () => {
  const browser = await chromium.launch(); const errs = [];
  const P = await open(browser, { width: 390, height: 844 }, true); const p = P.page;
  await E(p, (a, w) => { const q = window.MMNexus.layout().npcs.find((n) => n.role === 'quests'); w.nexus.talk(q.id); }); await frames(p, 4);
  const b = await p.evaluate(BOARD);
  check('390x844: the quest board opens with every row and button inside the viewport', b.open && b.rows >= 3 && b.inside, JSON.stringify(b));
  check('390x844: no "More below" cue while the whole board is in view', !b.cueOn, JSON.stringify(b));
  await p.screenshot({ path: require('path').join(__dirname, '..', 'design', 'beta', 'img', 'cyc5-ui-board-390x844.jpg'), type: 'jpeg', quality: 60 }).catch(() => {});
  // scroll the Nexus back to the top: the board now runs below the edge, so the cue shows
  await p.evaluate(() => { document.getElementById('rw-nexus').scrollTop = 0; }); await frames(p, 4);
  const up = await p.evaluate(BOARD);
  check('390x844: scrolled back to the plaza, the board runs past the bottom and the "More below" cue shows', up.bottom > up.ih && up.cueOn, JSON.stringify(up));
  await p.screenshot({ path: require('path').join(__dirname, '..', 'design', 'beta', 'img', 'cyc5-ui-board-cue-390x844.jpg'), type: 'jpeg', quality: 60 }).catch(() => {});
  await p.click('#rw-nx-board-close', { force: true }); await frames(p, 4);
  const shut = await p.evaluate(BOARD);
  check('390x844: closing the board removes the cue', !shut.open && !shut.cueOn, JSON.stringify(shut));
  errs.push(...P.errors); await P.ctx.close();
  const D = await open(browser, { width: 1280, height: 720 }, false); const d = D.page;
  await E(d, (a, w) => { const q = window.MMNexus.layout().npcs.find((n) => n.role === 'quests'); w.nexus.talk(q.id); }); await frames(d, 4);
  const db = await d.evaluate(BOARD);
  check('1280x720: the side-card board is in view with no scroll and no cue', db.open && db.inside && db.sc === 0 && !db.cueOn, JSON.stringify(db));
  errs.push(...D.errors); await D.ctx.close();
  check('no page errors', errs.length === 0, errs.join('|'));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
