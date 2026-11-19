// Mad Maze standalone page shell. Serve the repo root first:  python3 -m http.server 8442 &
// Run: NODE_PATH=$(npm root -g) node game/tests/mad-maze-shell.test.js   (no Firebase, no external network)
// Set SHOTS=<dir> to also write desktop/phone screenshots.
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const BASE = process.env.MM_BASE || 'http://localhost:8442/game/games/mad-maze/index.html?test=1&offline=1';

async function open(browser, opts, seed) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = []; const reqs = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', (r) => reqs.push(r.url()));
  if (seed) await page.addInitScript((v) => { if (!sessionStorage.seeded) { sessionStorage.seeded = '1'; localStorage.setItem('pixeltown-save-v1', v); } }, JSON.stringify(seed));
  await page.goto(BASE);
  await page.waitForFunction(() => window.__mm && window.__mm.arena);
  await page.waitForTimeout(400);
  return { ctx, page, errors, reqs };
}

(async () => {
  const browser = await chromium.launch();
  const shot = process.env.SHOTS;

  const d = await open(browser, { viewport: { width: 1000, height: 700 } }, { realm: { level: 4, shards: 7 } });
  check('canvas exists', await d.page.evaluate(() => !!document.getElementById('realm-canvas')));
  check('window.__mm exists with an arena', await d.page.evaluate(() => !!(window.__mm && window.__mm.arena)));
  check('no requests to firebase/gstatic, only own origin', d.reqs.every((u) => u.startsWith('http://localhost:8442/')) && !d.reqs.some((u) => /firebase|gstatic/.test(u)), d.reqs.join(' '));
  const st = await d.page.evaluate(() => {
    const a = window.__mm.arena; const o = { state: a.state };
    a.firePlayerBullet(0); o.bolt = a.pBullets.some((b) => b.active); return o;
  });
  check('arena started (state not idle) and a bolt can be fired', st.state !== 'idle' && st.bolt, JSON.stringify(st));
  check('seeded level 4 is loaded by the arena', (await d.page.evaluate(() => window.__mm.arena.save.level)) === 4);
  if (shot) await d.page.screenshot({ path: `${shot}/mm-desktop.png` });
  await d.page.evaluate(() => { const a = window.__mm.arena; a.save.shards = 99; a.onSave(a.save); });
  await d.page.reload(); await d.page.waitForFunction(() => window.__mm && window.__mm.arena); await d.page.waitForTimeout(300);
  const after = await d.page.evaluate(() => ({ lvl: window.__mm.arena.save.level, sh: window.__mm.arena.save.shards, raw: JSON.parse(localStorage.getItem('pixeltown-save-v1')).realm.level }));
  check('progress persists across reload (level kept, shards written back to realm)', after.lvl === 4 && after.raw === 4 && after.sh === 99, JSON.stringify(after));
  check('desktop: no console errors', d.errors.length === 0, d.errors.join(' | '));
  await d.ctx.close();

  const p = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const m = await p.page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bw: document.body.scrollWidth, touch: document.body.classList.contains('touch-device'), stick: getComputedStyle(document.getElementById('realm-stick-move')).display }));
  check('phone 390x844: no horizontal scroll, touch sticks shown', m.sw <= m.cw && m.bw <= m.cw && m.touch && m.stick === 'block', JSON.stringify(m));
  check('phone: no console errors', p.errors.length === 0, p.errors.join(' | '));
  if (shot) await p.page.screenshot({ path: `${shot}/mm-phone.png` });
  await p.ctx.close();

  await browser.close();
  done();
})();
