// cyc5 S (b11-08, b11-r3): the Deepdelve HUD said "Depth 5" while the hero stood on the grass at spawn. On or above the local ground it
// now reads "Surface"; one block or more below the column's surface it reads "Depth N" with the same absolute N the medals use
// ("Bronze: Depth -8" still pays at depth 8, unchanged). Checked at spawn on two seeds (real frames, no pose edits), then below / above.
// No network writes: Deepdelve has no Firebase; the page is loaded with ?test=1 only.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc5-deepdelve-surface.test.js
const { chromium } = require('playwright');
const fs = require('fs');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = (q) => ORIGIN + '/game/games/deepdelve/index.html?test=1' + (q || '');
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const hud = (page) => page.evaluate(() => document.getElementById('hud-depth').textContent);

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const seed of [5, 12345]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    if (process.env.THREE_JS) await page.route(THREE_URL, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(process.env.THREE_JS) }));
    await page.goto(URL('&seed=' + seed));
    await page.waitForFunction(() => window.__dd && window.__dd.ready);
    await frames(page, 20);
    const sp = await page.evaluate(() => { const d = window.__dd, p = d.player; return { y: p.y, abs: Math.floor(-p.y), s: d.surfaceY(Math.floor(p.x), Math.floor(p.z)), t: document.getElementById('hud-depth').textContent }; });
    check(`seed ${seed}: at spawn (on the grass, absolute depth ${sp.abs}) the HUD reads "Surface", not "Depth ${sp.abs}"`, sp.t === 'Surface' && sp.abs > 0, JSON.stringify(sp));
    const below = await page.evaluate(() => { const d = window.__dd, p = d.player, x = Math.floor(p.x), z = Math.floor(p.z), s = d.surfaceY(x, z); d.setPos(x + 0.5, -(s + 3) + 0.5, z + 0.5); return { s, y: -(s + 3) + 0.5 }; });
    await frames(page, 3);
    const tb = await hud(page);
    check(`seed ${seed}: 3 blocks under the surface it reads "Depth ${Math.floor(-below.y)}" (the absolute depth the medals use)`, tb === 'Depth ' + Math.floor(-below.y), tb);
    await page.evaluate(() => { const d = window.__dd, p = d.player, x = Math.floor(p.x), z = Math.floor(p.z), s = d.surfaceY(x, z); d.setPos(x + 0.5, -s + 2.5, z + 0.5); });
    await frames(page, 2);
    const ta = await hud(page);
    check(`seed ${seed}: in the air above the ground it reads "Surface"`, ta === 'Surface', ta);
    check(`seed ${seed}: no page errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
