// Pixelize review page (game/tools/pixelize/). Serve the repo root: python3 -m http.server 8440 &
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/pixelize-page.test.js
// No Firebase, no external network. Checks: 0 console errors, every species baked within a load-scaled budget,
// cache hits on a second call, crisp output (no semi-transparent pixels) with an outline, ?pixelize=0 off-switch.
const os = require('os');
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = ORIGIN + '/game/tools/pixelize/index.html';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  const errors = [], external = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', (r) => { if (!r.url().startsWith(ORIGIN) && !r.url().startsWith('data:')) external.push(r.url()); });
  await page.goto(URL);
  await page.waitForFunction(() => window.__pixelize && (window.__pixelize.ready || window.__pixelize.errors.length), null, { timeout: 30000 });

  const info = await page.evaluate(() => {
    const s = window.__pixelize, P = window.MMPixelize;
    let semi = 0, noOutline = 0, empty = 0, tooMany = 0;
    s.results.forEach((r) => { const e = r.ent, st = P.stats({ w: e.w, h: e.h, data: e.data });
      semi += st.semi; if (!st.opaque) empty++; if (e.colors > 20) tooMany++;
      // outline present: the darkest edge pixel is darker than the mean body colour
      let edgeL = 0, edgeN = 0, bodyL = 0, bodyN = 0; const d = e.data, op = (x, y) => x >= 0 && y >= 0 && x < e.w && y < e.h && d[(y * e.w + x) * 4 + 3] === 255;
      for (let y = 0; y < e.h; y++) for (let x = 0; x < e.w; x++) { if (!op(x, y)) continue; const i = (y * e.w + x) * 4, l = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
        if (!op(x - 1, y) || !op(x + 1, y) || !op(x, y - 1) || !op(x, y + 1)) { edgeL += l; edgeN++; } else { bodyL += l; bodyN++; } }
      if (bodyN && edgeN && edgeL / edgeN >= bodyL / bodyN) noOutline++; });
    return { n: s.species.length, villagers: s.villagers.length, total: s.results.length, ms: s.bakeMs, semi, noOutline, empty, tooMany, errs: s.errors,
      cards: document.querySelectorAll('.card').length, crisp: getComputedStyle(document.querySelector('.card .row:not(.before) canvas')).imageRendering };
  });
  check('all 98 registry species load and bake', info.n === 98 && info.errs.length === 0, JSON.stringify(info.errs));
  check('Town villager strips (mooncats etc.) are on the page', info.villagers >= 9);
  check('every sprite gets a before/after card', info.cards === info.total);
  const budget = 2000 * Math.min(5, Math.max(1, os.loadavg()[0] / Math.max(1, os.cpus().length)));
  check(`bake time for all sprites under budget (${info.ms.toFixed(0)} ms < ${budget.toFixed(0)} ms)`, info.ms < budget);
  check('output is crisp: no semi-transparent pixels', info.semi === 0, info.semi);
  check('no empty bakes', info.empty === 0, info.empty);
  check('outline present (edge darker than body) on every sprite', info.noOutline === 0, info.noOutline);
  check('colour budget kept (<= 20 colours per sprite)', info.tooMany === 0, info.tooMany);
  check('after canvases draw with image-rendering: pixelated', /pixelated|crisp/.test(info.crisp), info.crisp);

  const cache = await page.evaluate(() => {
    const P = window.MMPixelize, it = window.__pixelize.items[0], o = Object.assign({ size: 32 }, window.__pixelize.opts);
    const before = P.counters(), a = P.bake(it.img, o), b = P.bake(it.img, o), after = P.counters();
    return { same: a === b, hits: after.hits - before.hits, bakes: after.bakes - before.bakes };
  });
  check('second call is a cache hit (same object, no re-bake)', cache.same && cache.hits >= 1 && cache.bakes <= 1, JSON.stringify(cache));
  check('deterministic: re-baking everything gives identical pixels', await page.evaluate(() => {
    const h1 = window.__pixelize.results.map((r) => window.MMPixelize.hash(r.ent)).join();
    window.__pixelize.rebake(); return h1 === window.__pixelize.results.map((r) => window.MMPixelize.hash(r.ent)).join();
  }));
  check('slider change re-bakes with the new option', await page.evaluate(() => {
    const before = window.__pixelize.results[0].ent.colors; window.__pixelize.rebake({ colors: 4 });
    const r = window.__pixelize.results[0].ent.colors <= before; window.__pixelize.rebake({ colors: window.MMPixelize.DEFAULTS.colors }); return r;
  }));
  check('?pixelize=0 off-switch helper', await page.evaluate(() => window.MMPixelize.enabled('?pixelize=0') === false && window.MMPixelize.enabled('?x=1') === true));
  check('no external network requests', external.length === 0, external.slice(0, 3).join(' '));
  check('no DB traffic (page never touches Firebase)', db.attempts() === 0);
  check('0 console errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
