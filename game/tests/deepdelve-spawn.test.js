// Deepdelve first spawn: lands next to a cave mouth (something to do), seeded and stable, no stray selection square.
// Playwright, phone 390x844. Run: NODE_PATH=$(npm root -g) BASE=http://localhost:8440/game/index.html node game/tests/deepdelve-spawn.test.js
// THREE_JS=<file> serves three.js locally instead of the CDN. No Firebase.
const { chromium } = require('playwright');
const fs = require('fs');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = (q) => ORIGIN + '/game/games/deepdelve/index.html?test=1' + (q || '');
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const all = [];
async function open(browser, q) {
  const ctx = await browser.newContext(PHONE);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  if (process.env.THREE_JS) await page.route(THREE_URL, (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(process.env.THREE_JS) }));
  await page.goto(URL(q));
  await page.waitForFunction(() => window.__dd && window.__dd.ready);
  const o = { ctx, page, errors }; all.push(o); return o;
}
const info = () => {
  const d = window.__dd, m = d.mouthSite();
  return { spawn: [d.spawn.x, d.spawn.y, d.spawn.z], m: m && [m.x, m.z, m.dx, m.dz, m.ms], hash: d.terrainHash() };
};

(async () => {
  const browser = await chromium.launch();
  const a = await open(browser, '&seed=1');
  const ia = await a.page.evaluate(info);
  check('a cave mouth exists and the spawn is within 24 blocks of it', !!ia.m && Math.hypot(ia.spawn[0] - ia.m[0], ia.spawn[2] - ia.m[1]) <= 24, JSON.stringify(ia));
  check('the player starts on the ground at the spawn column', await a.page.evaluate(() => { const d = window.__dd; return Math.abs(d.player.x - d.spawn.x) < 1e-6 && Math.abs(d.player.z - d.spawn.z) < 1e-6 && d.getBlock(Math.floor(d.spawn.x), Math.floor(-d.spawn.y + 0.5) - 1, Math.floor(d.spawn.z)) === 0 && d.getBlock(Math.floor(d.spawn.x), Math.floor(-d.spawn.y + 0.5), Math.floor(d.spawn.z)) !== 0; }));
  check('the ramp is carved: mouth cells are air and the floor steps down', await a.page.evaluate(() => {
    const d = window.__dd, m = d.mouthSite(); let ok = true;
    for (let i = 0; i < 10; i++) { const x = m.x + m.dx * i, z = m.z + m.dz * i; if (d.getBlock(x, m.ms + i - 1, z) !== 0 || d.getBlock(x, m.ms + i, z) === 0) ok = false; }
    return ok;
  }));
  check('no stray selection square at spawn; it appears once the player aims', await a.page.evaluate(async () => {
    const d = window.__dd; d.player.pitch = -1.2; await new Promise((r) => setTimeout(r, 400));
    const before = d.outlineVisible(); d.aim(); await new Promise((r) => setTimeout(r, 400));
    return before === false && d.aimed() === true && d.outlineVisible() === true;
  }));
  check('no horizontal scroll at 390', await a.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));

  const b = await open(browser, '&seed=1');
  const ib = await b.page.evaluate(info);
  check('determinism: same seed gives the same mouth, spawn and terrain', JSON.stringify(ia) === JSON.stringify(ib));
  const c = await open(browser, '&seed=7');
  const ic = await c.page.evaluate(info);
  check('another seed has its own mouth but the spawn is still within 24 blocks of it', JSON.stringify(ic.m) !== JSON.stringify(ia.m) && Math.hypot(ic.spawn[0] - ic.m[0], ic.spawn[2] - ic.m[1]) <= 24, JSON.stringify(ic));
  for (const o of all) check('no console errors', o.errors.length === 0, o.errors.join(' | '));
  await browser.close();
  done();
})();
