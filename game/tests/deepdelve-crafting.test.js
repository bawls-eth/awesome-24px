// Deepdelve crafting depth: ready-only filter, workbench placement/gating, phone usability.
// Serve the repo root: python3 -m http.server 8513 &
// Run: BASE=http://localhost:8513/game/index.html NODE_PATH=$(npm root -g) node game/tests/deepdelve-crafting.test.js
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

  // 1. C opens the panel; ready-only filter lists just what you can craft right now
  await p.keyboard.press('c');
  const f = await p.evaluate(() => {
    const d = window.__dd;
    d.inv.wood = 4; d.inv.coal = 1; d.inv.stone = 0;
    d.panel('craft', true);
    const all = document.querySelectorAll('#recipes li').length;
    document.getElementById('craft-filter').click();
    const rdy = Array.from(document.querySelectorAll('#recipes button')).map((b) => b.dataset.recipe + ':' + !b.disabled);
    return { all, rdy, pressed: document.getElementById('craft-filter').getAttribute('aria-pressed') };
  });
  check('C opens the panel with all 24 recipes, then ready-only shows only craftable ones', f.all === 24 && f.pressed === 'true' && f.rdy.length > 0 && f.rdy.length < 24 && f.rdy.every((x) => /:true$/.test(x)) && f.rdy.indexOf('torch:true') >= 0, JSON.stringify(f));

  // 2. crafting consumes the inputs and adds the outputs
  const c = await p.evaluate(() => {
    const d = window.__dd; d.inv.torch = 0; d.inv.wood = 4; d.inv.coal = 1;
    document.querySelector('#recipes button[data-recipe="torch"]').click();
    return { torch: d.inv.torch, wood: d.inv.wood, coal: d.inv.coal, hot: d.hotbar().some((i) => i.item === 'torch') };
  });
  check('clicking Craft consumes exact inputs, adds 4 torches to the hotbar', c.torch === 4 && c.wood === 3 && c.coal === 0 && c.hot, JSON.stringify(c));

  // 3. bench-gated recipes need a placed workbench; placing one then unlocks them
  const w = await p.evaluate(() => {
    const d = window.__dd, s = d.surfaceY(30, 30);
    d.panel('craft', false); d.inv.wood = 30; d.inv.table = 0;
    d.setPos(30.5, -s, 30.5); d.step(1 / 60, 5);
    const r = { noBench: d.craftRecipe('chest'), rowBefore: d.craftRows().filter((x) => x.id === 'chest')[0].reason };
    d.craftRecipe('table');
    r.tableHotbar = d.hotbar().some((i) => i.item === 'table');
    r.placed = d.placeBench(32, s - 1, 30);
    r.near = d.benchNear(); r.count = d.benches.length; r.tableLeft = d.inv.table | 0;
    r.chest = d.craftRecipe('chest'); r.chestN = d.inv.chest | 0; r.wood = d.inv.wood;
    return r;
  });
  check('chest is refused without a bench, and the row says why', w.noBench === false && /workbench/.test(w.rowBefore), JSON.stringify(w));
  check('a crafted table goes to the hotbar, can be placed, and then chest crafts (8 wood)', w.tableHotbar && w.placed && w.near && w.count === 1 && w.tableLeft === 0 && w.chest && w.chestN === 1 && w.wood === 18, JSON.stringify(w));

  // 4. bench persists across reload; can be picked up again
  const s1 = await p.evaluate(async () => { await window.__dd.flush(); return window.__dd.benches.length; });
  await p.reload(); await p.waitForFunction(() => window.__dd && window.__dd.ready);
  const s2 = await p.evaluate(() => { const d = window.__dd; const n = d.benches.length; const ok = d.pickUpBench(0); return { n, ok, left: d.benches.length, table: d.inv.table | 0 }; });
  check('workbench survives reload (IndexedDB) and can be picked up again', s1 === 1 && s2.n === 1 && s2.ok && s2.left === 0 && s2.table === 1, JSON.stringify([s1, s2]));

  // 5. phone: panel fits, buttons >= 44px, no horizontal scroll
  const P = await open(browser, '&seed=9', PHONE);
  const ph = await P.page.evaluate(() => {
    const d = window.__dd; d.inv.wood = 9; d.inv.stone = 9; d.panel('craft', true);
    const vw = window.innerWidth, small = [];
    document.querySelectorAll('#craft-panel button').forEach((b) => { const r = b.getBoundingClientRect(); if (r.width && (r.height < 43.5 || r.width < 43.5)) small.push(b.textContent + ':' + Math.round(r.width) + 'x' + Math.round(r.height)); });
    const pr = document.getElementById('craft-panel').getBoundingClientRect();
    return { sw: document.documentElement.scrollWidth, vw, small, fits: pr.left >= 0 && pr.right <= vw, rows: document.querySelectorAll('#recipes li').length };
  });
  check('390x844: crafting panel fits, no horizontal scroll, every panel button >= 44 px', ph.sw <= ph.vw && ph.fits && ph.small.length === 0 && ph.rows === 24, JSON.stringify(ph));
  await P.page.tap('#close-craft');
  check('phone: Close button hides the panel', await P.page.evaluate(() => document.getElementById('craft-panel').hidden));

  const errs = [].concat(...all.map((o) => o.errors));
  check('no console errors', errs.length === 0, JSON.stringify(errs));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
