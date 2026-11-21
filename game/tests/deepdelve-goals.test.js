// Deepdelve goals panel: goals complete on real actions (test hooks), persist, corrupt saves recover, phone layout.
// Serve the repo root: python3 -m http.server 8594 &
// Run: BASE=http://localhost:8594/game/index.html THREE_JS=/path/three.min.js NODE_PATH=$(npm root -g) node game/tests/deepdelve-goals.test.js
const { chromium } = require('playwright');
const fs = require('fs');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = (q) => ORIGIN + '/game/games/deepdelve/index.html?test=1&seed=5' + (q || '');
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
const DESKTOP = { viewport: { width: 1000, height: 700 } };
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const META = 'pixeltown-deepdelve-v1', HUB = 'pixeltown-medals-deepdelve-v1';
const all = [];
async function open(browser, opts, seedMeta, ctx0) {
  const ctx = ctx0 || await browser.newContext(opts || DESKTOP);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  if (process.env.THREE_JS) await page.route(THREE_URL, (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(process.env.THREE_JS) }));
  if (seedMeta !== undefined) await page.addInitScript(([k, v]) => { if (!sessionStorage.seeded) { sessionStorage.seeded = '1'; localStorage.setItem(k, v); } }, [META, seedMeta]);
  await page.goto(URL());
  await page.waitForFunction(() => window.__dd && window.__dd.ready);
  const o = { ctx, page, errors }; all.push(o); return o;
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const A = await open(browser);
  const p = A.page;

  // 1. each goal completes on its action
  const r = await p.evaluate(() => {
    const d = window.__dd, o = {};
    o.start = JSON.stringify(d.meta().goals);
    const s = d.surfaceY(64, 64);
    d.setPos(64.5, -(s + 21), 64.5); d.checkGoals(); o.d20 = d.meta().goals.depth20; o.d40a = d.meta().goals.depth40;
    d.setPos(64.5, -(s + 41), 64.5); d.checkGoals(); o.d40 = d.meta().goals.depth40;
    d.setPos(30.5, -d.surfaceY(30, 30), 30.5); d.step(1 / 60, 20); d.setPick(0); d.player.yaw = 0; d.player.pitch = 0; d.player.iframes = 0;
    d.spawnCreature('crawler', 30.5, d.player.y, 28.9, 'g1', 0);
    d.setPick(3); d.attackCreature(false); d.attackCreature(false); d.tickCreatures(0.016);
    o.crawler = d.meta().goals.crawler;
    d.inv.torch = 12;
    for (let i = 0; i < 9; i++) d.placeAt(40 + i, d.surfaceY(40 + i, 50) - 3, 50, 'torch');
    o.t9 = d.meta().goals.torches; o.t9done = d.meta().goals.torches10;
    d.placeAt(49, d.surfaceY(49, 50) - 3, 50, 'torch');
    o.t10 = d.meta().goals.torches; o.t10done = d.meta().goals.torches10;
    d.wyrm.defeat(); o.wyrm = d.meta().goals.wyrm;
    return o;
  });
  check('start: new goals are all unset', /"depth20":false/.test(r.start) && /"wyrm":false/.test(r.start) && /"torches":0/.test(r.start), r.start);
  check('depth 20 completes at depth 20 but depth 40 does not; depth 40 completes deeper', r.d20 === true && r.d40a === false && r.d40 === true, JSON.stringify(r));
  check('defeating a crawler completes its goal', r.crawler === true, JSON.stringify(r));
  check('torches count up to 10 and complete the goal on the 10th', r.t9 === 9 && r.t9done === false && r.t10 === 10 && r.t10done === true, JSON.stringify(r));
  check('defeating the Rock Wyrm completes its goal', r.wyrm === true, JSON.stringify(r));

  // 2. persistence: saved to the meta key, hub summary written, and a reload keeps it
  const saved = await p.evaluate(([k, h]) => ({ meta: JSON.parse(localStorage.getItem(k)), hub: JSON.parse(localStorage.getItem(h)) }), [META, HUB]);
  check('goals persist additively in pixeltown-deepdelve-v1 (old keys intact)', saved.meta.v === 1 && saved.meta.goals.depth40 === true && saved.meta.goals.torches10 === true && saved.meta.goals.wyrm === true && typeof saved.meta.mode === 'string' && 'maxDepth' in saved.meta.goals, JSON.stringify(saved.meta));
  check('the hub medal summary lists the earned goals', saved.hub.v === 1 && ['depth20', 'depth40', 'crawler', 'wyrm', 'torches10'].every((m) => saved.hub.m.includes(m)), JSON.stringify(saved.hub));
  const B = await open(browser, null, undefined, A.ctx);
  const rl = await B.page.evaluate(() => { const g = window.__dd.meta().goals; return { d40: g.depth40, w: g.wyrm, t: g.torches }; });
  check('after reload the goals are still done', rl.d40 && rl.w && rl.t === 10, JSON.stringify(rl));

  // 3. panel lists the goals with progress
  await B.page.evaluate(() => window.__dd.panel('goals', true));
  const panel = await B.page.evaluate(() => ({
    n: document.querySelectorAll('#goal-list li, #goal-more li').length, more: document.querySelectorAll('#goal-more li').length, done: document.querySelectorAll('#goal-list li.done, #goal-more li.done').length,
    txt: document.getElementById('goal-more').textContent, stats: document.getElementById('goal-stats').textContent,
  }));
  check('goals panel lists the 8 goals and marks the done ones', panel.n === 8 && panel.more === 5 && panel.done >= 5 && /Wyrm Slayer/.test(panel.txt) && /Goals: \d\/8/.test(panel.stats), JSON.stringify(panel));

  // 4. corrupt saves recover to defaults
  const bad = [
    'not json{{', '[1,2]', '{"goals":"x"}',
    JSON.stringify({ v: 1, goals: { depth20: 'yes', depth40: 1, crawler: {}, wyrm: [], torches: 'many', torches10: 'true', maxDepth: -5, bronze: true } }),
    JSON.stringify({ goals: { torches: 9999999, deaths: 1e99 } }),
  ];
  const outs = [];
  for (const b of bad) {
    const X = await open(browser, DESKTOP, b);
    outs.push(await X.page.evaluate(() => { const g = window.__dd.meta().goals; return JSON.stringify([g.depth20, g.depth40, g.crawler, g.wyrm, g.torches, g.torches10, g.maxDepth >= 0, g.bronze]); }));
    await X.ctx.close();
  }
  check('corrupt or hostile meta falls back to unset goals (strict booleans, clamped counters)',
    outs[0] === '[false,false,false,false,0,false,true,false]' && outs[1] === outs[0] && outs[2] === outs[0] && outs[3] === '[false,false,false,false,0,false,true,true]' && outs[4].startsWith('[false,false,false,false,10,true,true'), outs.join(' '));

  // 5. phone: panel fits, 44 px targets, no horizontal scroll
  const P = await open(browser, PHONE);
  await P.page.evaluate(() => window.__dd.panel('goals', true));
  const ph = await P.page.evaluate(() => {
    const bs = [...document.querySelectorAll('#open-goals, #close-goals')].map((b) => { const r = b.getBoundingClientRect(); return { id: b.id, w: r.width, h: r.height }; });
    const pn = document.getElementById('goals-panel').getBoundingClientRect();
    return { bs, panelW: pn.width, vw: innerWidth, sw: document.documentElement.scrollWidth, shown: !document.getElementById('goals-panel').hidden };
  });
  check('phone: goals panel opens, fits the screen, no horizontal scroll', ph.shown && ph.panelW <= ph.vw && ph.sw <= ph.vw, JSON.stringify(ph));
  check('phone: Goals buttons are at least 44 px', ph.bs.length === 2 && ph.bs.every((b) => b.w >= 44 && b.h >= 44), JSON.stringify(ph.bs));

  check('no console errors on any page', all.every((o) => o.errors.length === 0), all.map((o) => o.errors.join(' | ')).filter(Boolean).join(' || '));
  await browser.close();
  done();
})();
