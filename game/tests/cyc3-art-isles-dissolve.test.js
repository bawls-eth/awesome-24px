// Cycle 3 art (G): Isles creature death dissolve. Over the 0.35 s hold on the death strip's last frame the body breaks up in 2x2
// ordered-dither blocks and squashes toward its feet instead of popping off. ?dissolve=0 = the old hold. blockDb, nothing written.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc3-art-isles-dissolve.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const LS = require('./lib/load-scale');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/isles/index.html?test=1&tutorial=0&howto=0&isle=jungle';

async function sample(browser, q) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await blockDb(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(PAGE + (q || ''));
  await page.waitForFunction(() => window.__isles && window.__isles.world, null, { timeout: 30000 });
  await page.waitForTimeout(3000);
  const r = await page.evaluate(() => {
    const I = window.__isles; I.god && I.god(true); I.clearCreatures(); const h = I.hero(); const uid = I.spawn('glimmerfrog', h.tx + 2, h.ty);
    for (let i = 0; i < 40 && I.creatures().some((c) => c.uid === uid); i++) { const c = I.creatures().find((x) => x.uid === uid); const hh = I.hero(); I.soothe(false); I.fire(c.x - hh.x, c.y - 8 - hh.y); I.step(0, 0, 0.1); }
    const pool = I.deadPool().filter((d) => d.on).length; const d0 = I.dissolve().draws;
    const cv = document.querySelector('canvas'); const g = cv.getContext('2d');
    // walk the hold: before the strip ends no dissolve; inside the hold it dissolves; record the level progression
    const levels = []; let firstDt = -1;
    for (let dt = 0.2; dt <= 3.0; dt += 0.05) { const before = I.dissolve().draws; I.drawDeathsAt(dt); const s = I.dissolve(); if (s.draws > before) { if (firstDt < 0) firstDt = dt; levels.push(s.level); } if (!I.deadPool().some((d) => d.on)) break; }
    return { pool, d0, levels, firstDt, st: I.dissolve(), freed: !I.deadPool().some((d) => d.on), cvw: cv.width };
  });
  await ctx.close();
  return Object.assign(r, { errors, dbReq: db.count ? db.count() : 0 });
}

(async () => {
  const browser = await chromium.launch();
  const on = await sample(browser, '');
  check('a killed creature entered the death pool', on.pool >= 1, JSON.stringify(on).slice(0, 300));
  check('dissolve runs only inside the hold after the strip (several steps, levels rise 1 -> 16)', on.st.on && on.levels.length >= 4 && on.levels.every((v, i) => i === 0 || v >= on.levels[i - 1]) && on.levels[on.levels.length - 1] >= 12, JSON.stringify(on.levels));
  check('the dying slot still frees after the hold', on.freed);
  const per = on.st.ms / Math.max(1, on.st.draws);
  check('per-frame cost of one dissolving body < ' + LS.budget(0.8).toFixed(2) + ' ms (measured ' + per.toFixed(3) + ' ms)', per < LS.budget(0.8), per.toFixed(3));
  const off = await sample(browser, '&dissolve=0');
  check('?dissolve=0: the old hold, no dissolve draws', !off.st.on && off.st.draws === 0 && off.pool >= 1 && off.freed, JSON.stringify(off.st));
  check('no page errors, no DB requests', on.errors.length === 0 && off.errors.length === 0 && on.dbReq === 0 && off.dbReq === 0, on.errors.concat(off.errors).join(' | '));
  console.log('INFO isles dissolve per-frame cost', per.toFixed(3), 'ms; levels', on.levels.join(','));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
