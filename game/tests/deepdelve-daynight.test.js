// Deepdelve day/night + torch light. Serve the repo root: python3 -m http.server 8513 &
// Run: BASE=http://localhost:8513/game/index.html NODE_PATH=$(npm root -g) node game/tests/deepdelve-daynight.test.js
// THREE_JS=<file> serves three.js locally instead of the CDN. No Firebase.
const { chromium } = require('playwright');
const fs = require('fs');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = (q) => ORIGIN + '/game/games/deepdelve/index.html?test=1' + (q || '');
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
const DESKTOP = { viewport: { width: 1000, height: 700 } };
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const all = [];
async function open(browser, q, opts) {
  const ctx = await browser.newContext(opts || DESKTOP);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  if (process.env.THREE_JS) await page.route(THREE_URL, (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(process.env.THREE_JS) }));
  await page.goto(URL(q));
  await page.waitForFunction(() => window.__dd && window.__dd.ready);
  const o = { ctx, page, errors }; all.push(o); return o;
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const A = await open(browser, '&seed=5');
  const p = A.page;

  // 1. the clock hook sets the stage, sky colour and surface light level
  const s = await p.evaluate(() => {
    const d = window.__dd, sy = d.surfaceY(64, 64);
    const out = { start: d.timeStage() };
    d.setPos(64.5, -sy + 0.5, 64.5); d.settle();
    const probe = () => d.cellLight(64.5, -(sy - 3) - 0.5, 64.5); // open air 3 cells above the surface column
    d.setTime(d.MMDDTime.NOON); out.noon = { stage: d.timeStage(), scale: d.skyScale(), bg: d.bg(), light: probe() };
    d.setTime(270); out.night = { stage: d.timeStage(), scale: d.skyScale(), bg: d.bg(), light: probe() };
    d.settle(); out.meshes = d.loadedMeshes(); out.faces = d.meshFaces();
    out.hud = document.getElementById('hud-time').textContent;
    return out;
  });
  check('test hook: noon is day with a bright blue sky and full surface light', s.noon.stage === 'day' && s.noon.scale === 1 && s.noon.bg > s.night.bg && (s.noon.bg & 255) > 0xf0 && s.noon.light === 15, JSON.stringify(s.noon));
  check('midnight is night: dark sky colour and surface light cut to about a quarter', s.night.stage === 'night' && s.night.scale === 0.25 && Math.max(s.night.bg >> 16, (s.night.bg >> 8) & 255, s.night.bg & 255) < 0x80 && s.night.light < 5 && s.night.light > 3, JSON.stringify(s.night));
  check('HUD shows the clock and stage; chunks re-light without losing meshes', /night/.test(s.hud) && s.meshes > 0 && s.faces > 0, JSON.stringify([s.hud, s.meshes, s.faces]));

  // 2. caves stay dark day or night; a torch lights a radius that falls off with distance, even at night
  const c = await p.evaluate(() => {
    const d = window.__dd, sy = d.surfaceY(50, 50), wy = sy + 9;
    d.setPick(3); d.setPos(50.5, -(sy + 1), 44.5);
    for (let z = 50; z <= 58; z++) d.mineAt(50, wy, z); // sealed 9-long tunnel inside the rock (no sky access)
    const at = (z) => d.cellLight(50.5, -(wy + 1) + 0.5, z + 0.5);
    d.setTime(d.MMDDTime.NOON); const dayDark = at(54);
    d.setTime(270); const nightDark = at(54);
    d.inv.torch = 2; const placed = d.placeAt(50, wy, 50, 'torch');
    const lit = [0, 1, 4, 8].map((k) => at(50 + k));
    d.setTime(d.MMDDTime.NOON); const litDay = at(50);
    return { dayDark, nightDark, placed, lit, litDay };
  });
  check('a sealed cave is dark both at noon and at midnight', c.dayDark <= 1 && c.nightDark <= 1, JSON.stringify(c));
  check('a placed torch lights a radius at night: bright at the torch, falling off with distance', c.placed && c.lit[0] >= 13 && c.lit[0] > c.lit[1] && c.lit[1] > c.lit[2] && c.lit[2] > c.lit[3] && c.lit[3] >= 5, JSON.stringify(c.lit));
  check('torch light is not dimmed by the clock (same level at noon)', c.litDay === c.lit[0], JSON.stringify(c));

  // 3. the clock advances (test hook), wraps, and persists across reload
  const t = await p.evaluate(async () => {
    const d = window.__dd; d.setTime(350); d.tickTime(30);
    const wrapped = d.clock.t;
    d.setTime(123); await d.flush();
    return { wrapped };
  });
  await p.reload(); await p.waitForFunction(() => window.__dd && window.__dd.ready);
  const t2 = await p.evaluate(() => ({ t: window.__dd.clock.t, stage: window.__dd.timeStage() }));
  check('time wraps at the 6 minute period (350 + 30 -> 20)', t.wrapped === 20, JSON.stringify(t));
  check('the world time is saved with the player and restored on reload', t2.t === 123, JSON.stringify(t2));

  // 4. phone: clock in the HUD, no horizontal scroll
  const P = await open(browser, '&seed=9', PHONE);
  const ph = await P.page.evaluate(() => { window.__dd.setTime(270); const h = document.getElementById('hud').getBoundingClientRect(); return { sw: document.documentElement.scrollWidth, vw: window.innerWidth, hudRight: h.right, text: document.getElementById('hud-time').textContent }; });
  check('390x844: no horizontal scroll and the clock fits in the HUD', ph.sw <= ph.vw && ph.hudRight <= ph.vw && /night/.test(ph.text), JSON.stringify(ph));

  const errs = [].concat(...all.map((o) => o.errors));
  check('no console errors', errs.length === 0, JSON.stringify(errs));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
