// Deepdelve dive runs: combo, depth personal bests, safe-return bonus, dive summary with one-tap "Dive again", juice that
// respects reduce motion, hidden touch buttons, 44px targets, no DB traffic, clean console.
// Serve the repo root: python3 -m http.server 9353 &
// Run: NODE_PATH=$(npm root -g) node game/tests/deepdelve-dive.test.js   (BASE=http://localhost:9353 to override)
// SHOTS=<dir> writes phone/desktop screenshots. THREE_JS=<file> serves three.js locally instead of the CDN.
const { chromium } = require('playwright');
const fs = require('fs');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:9353').replace(/\/game\/.*$/, '').replace(/\/$/, '');
const URL = (q) => ORIGIN + '/game/games/deepdelve/index.html?test=1' + (q || '');
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
const DESKTOP = { viewport: { width: 1000, height: 700 } };
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const RUNS = 'pixeltown-deepdelve-runs-v1';

async function open(browser, opts, q, init) {
  const ctx = await browser.newContext(opts);
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  if (init) await page.addInitScript(init);
  if (process.env.THREE_JS) await page.route(THREE_URL, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(process.env.THREE_JS) }));
  await page.goto(URL(q));
  await page.waitForFunction(() => window.__dd && window.__dd.ready);
  return { ctx, page, errors, db };
}

(async () => {
  // pure module
  const R = require('../games/deepdelve/dd-run.js');
  const run = R.start(4);
  check('module: combo grows when breaks are close and resets after the gap', R.mined(run, 'stone', 10).combo === 1 && R.mined(run, 'stone', 11).combo === 2 && R.mined(run, 'coal', 12).combo === 3 && R.mined(run, 'stone', 20).combo === 1 && run.bestCombo === 3);
  check('module: ores counted with weights', run.ores === 1 && run.orePts === R.ORE.coal && run.blocks === 4);
  check('module: depth is relative to the dive start and arms the safe bonus', R.depth(run, 4) === false && run.depth === 0 && R.depth(run, 4 + R.SAFE_DEPTH) === true && run.armed === true);
  check('module: surfacing alive pays the bonus', R.score(run, true) === Math.floor(R.score(run, false) * R.SAFE_BONUS) && R.score(run, true) > R.score(run, false));
  const rec = R.clean('{"best":{"score":"x","depth":-3},"runs":2}');
  check('module: corrupt records clamp safely', rec.best.score === 0 && rec.best.depth === 0 && rec.runs === 2 && R.clean('nonsense').runs === 0);
  const sum = R.finish(rec, run, true);
  check('module: finish flags new personal bests and updates the record', sum.pb.depth && sum.pb.score && rec.best.depth === R.SAFE_DEPTH && rec.runs === 3 && rec.safe === 1);
  const run2 = R.start(0); R.depth(run2, R.SAFE_DEPTH - 2);
  const sum2 = R.finish(rec, run2, false);
  check('module: a near miss reports how many blocks short', sum2.pb.depth === false && sum2.short === 2 && rec.best.depth === R.SAFE_DEPTH);

  const mods = []; for (let n = 0; n < 40; n++) mods.push(R.modFor(7, n).id);
  check('modifiers: seeded and deterministic (same seed + dive number, same twist)', R.modFor(7, 3).id === R.modFor(7, 3).id && R.modFor(123, 9).id === R.modFor(123, 9).id);
  check('modifiers: dives vary (at least 4 different twists over 40 dives)', new Set(mods).size >= 4, mods.join(','));
  const mk = (mod) => { const r = R.start(0, mod); R.depth(r, 10); R.mined(r, 'gold_ore', 1); R.mined(r, 'stone', 1.5); return r; };
  check('modifiers: Rich veins doubles ore points and Plunge boosts depth', R.score(mk('veins')) - R.score(mk('plain')) === R.ORE.gold_ore * 8 && R.score(mk('plunge')) - R.score(mk('plain')) === 50 && R.start(0, 'bogus').mod === 'plain');
  const rh = R.start(0, 'rhythm'); R.mined(rh, 'stone', 1); const pl = R.start(0, 'plain'); R.mined(pl, 'stone', 1);
  check('modifiers: Rhythm widens the combo window', R.mined(rh, 'stone', 3).combo === 2 && R.mined(pl, 'stone', 3).combo === 1);

  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

  // phone: layout, hidden Down button, 44px targets
  const P = await open(browser, PHONE, '&seed=7');
  const lay = await P.page.evaluate(() => {
    const vis = (e) => !!(e && e.offsetParent && getComputedStyle(e).display !== 'none');
    const small = [...document.querySelectorAll('button, a')].filter(vis).map((e) => { const r = e.getBoundingClientRect(); return { id: e.id || e.textContent.trim().slice(0, 14), w: r.width, h: r.height }; }).filter((x) => x.w > 2 && x.h > 2) /* MMNav keeps the legacy Hub/Town links as 1px screen-reader-only */.filter((x) => x.w < 44 || x.h < 44);
    const nav = document.querySelector('.mm-nav-btn, #mm-nav-btn, [data-mm-nav]');
    return { intro: window.__dd.introText(), downVisible: vis(document.getElementById('t-down')), mode: window.__dd.meta().mode, small, dive: document.getElementById('hud-dive').textContent, hasNav: !!window.MMNav };
  });
  check('phone: Down button is hidden in survival (hidden attribute wins over .btn display)', lay.mode === 'survival' && lay.downVisible === false, JSON.stringify(lay));
  check('phone: every visible button/link is at least 44x44', lay.small.length === 0, JSON.stringify(lay.small));
  check('phone: dive HUD shows the dive twist, depth and best', /^[A-Z][a-z]+( [a-z]+)?: 0 deep \| Best (-|\d+)$/.test(lay.dive), lay.dive);
  check('phone: MMNav still mounted', lay.hasNav === true);
  check('phone: first hint uses touch words, not mouse/keys, and names the dive goal', /hold Mine to dig/.test(lay.intro) && !/WASD|left|right/.test(lay.intro) && /climb back out/.test(lay.intro), lay.intro);

  // a dive: mine with a combo, go deep, die -> summary with personal bests; Dive again closes it in one tap
  const d1 = await P.page.evaluate(() => {
    const d = window.__dd, r = d.run;
    r.start();
    const a = r.mined('stone', 100), b = r.mined('stone', 100.5), c = r.mined('iron_ore', 101);
    const comboTxt = document.getElementById('combo').textContent;
    const pops = document.querySelectorAll('#pops .pop').length;
    r.tick(d.run.depth0() + 9);
    const armed = r.state.armed;
    const tip = document.getElementById('msg').textContent;
    d.die('Test fall.');
    const panel = document.getElementById('run-panel');
    const again = document.getElementById('run-again').getBoundingClientRect();
    return { a: a.combo, b: b.combo, c: c.combo, comboTxt, pops, armed, open: !panel.hidden, title: document.getElementById('run-title').textContent, score: document.getElementById('run-score').textContent, stats: [...document.querySelectorAll('#run-stats li')].map((l) => l.textContent), pbs: document.querySelectorAll('#run-stats li.pb').length, again: [again.width, again.height], tip, saved: JSON.parse(localStorage.getItem('pixeltown-deepdelve-runs-v1')), runAfter: r.state.blocks, next: document.getElementById('run-next').textContent };
  });
  check('combo: three quick breaks count x1, x2, x3 and the meter shows it', d1.a === 1 && d1.b === 2 && d1.c === 3 && d1.comboTxt === 'Combo x3', JSON.stringify(d1));
  check('juice: ore and break pops appear', d1.pops >= 1);
  check('dive: going 9 deep arms the safe-return bonus', d1.armed === true);
  check('dive: arming shows how to climb out (pillar tip)', /Climb back out for a x1\.5 bonus: look down, jump and Place/.test(d1.tip), d1.tip);
  check('summary: death opens the Dive over panel with score and stats', d1.open && d1.title === 'Dive over' && /^Score \d+/.test(d1.score) && d1.stats.length === 4 && /Depth: 9/.test(d1.stats[0]));
  check('summary: first dive marks personal bests and saves them in its own key', d1.pbs >= 2 && d1.saved && d1.saved.best.depth === 9 && d1.saved.runs === 1 && d1.saved.best.combo === 3);
  check('summary: Dive again is a big one-tap target and a fresh dive started', d1.again[0] >= 44 && d1.again[1] >= 44 && d1.runAfter === 0);
  check('summary: names this dive and previews the next twist', /^This dive: .+\. Next dive: .+ \(.+\)$/.test(d1.next), d1.next);
  if (process.env.SHOTS) await P.page.screenshot({ path: process.env.SHOTS + '/dive-phone-summary.png' });
  await P.page.tap('#run-again');
  const d2 = await P.page.evaluate(() => ({ open: !document.getElementById('run-panel').hidden, mine: window.__dd.input.mine }));
  check('summary: tapping Dive again closes the panel', d2.open === false && d2.mine === false);

  // safe return: surfacing after an armed dive ends it with the bonus; a near miss tells you how close you were
  const d3 = await P.page.evaluate(() => {
    const d = window.__dd, r = d.run, z = d.run.depth0();
    r.start(); r.mined('stone', 200); r.tick(z + 7); r.tick(z);
    const t1 = document.getElementById('run-title').textContent, tip1 = document.getElementById('run-tip').textContent, rec = r.rec;
    r.close();
    return { t1, tip1, safe: rec.safe, runs: rec.runs, open: !document.getElementById('run-panel').hidden };
  });
  check('safe return: climbing out alive completes the dive with the bonus', d3.t1 === 'Dive complete!' && d3.safe === 1 && d3.runs === 2, JSON.stringify(d3));
  check('near miss: the summary says how many blocks short of the best', /Only 2 blocks short/.test(d3.tip1), d3.tip1);
  check('summary closes with Close', d3.open === false);

  // reload: personal bests persist and show in the HUD; existing meta key untouched in shape
  await P.page.reload(); await P.page.waitForFunction(() => window.__dd && window.__dd.ready);
  const d4 = await P.page.evaluate(() => ({ dive: document.getElementById('hud-dive').textContent, meta: JSON.parse(localStorage.getItem('pixeltown-deepdelve-v1') || '{}') }));
  check('persist: best depth survives a reload', /Best 9/.test(d4.dive), d4.dive);
  check('persist: the old meta key keeps its goals block', d4.meta.v === 1 && d4.meta.goals && typeof d4.meta.goals.deaths === 'number' && d4.meta.goals.deaths >= 1);
  check('phone: console clean', P.errors.length === 0, P.errors.join(' | '));
  check('phone: zero DB requests', P.db.count() === 0);
  await P.ctx.close();

  // desktop + reduced motion: no camera shake; Escape closes the summary
  const D = await open(browser, Object.assign({ reducedMotion: 'reduce' }, DESKTOP), '&seed=7');
  const d5 = await D.page.evaluate(() => {
    const d = window.__dd, r = d.run;
    r.start(); r.mined('iron_ore', 1); const sh = d.run.shake();
    d.hurt(1, 'ouch'); const sh2 = d.run.shake();
    r.tick(d.run.depth0() + 3); d.die('Test.');
    return { reduced: d.reduced, sh, sh2, open: !document.getElementById('run-panel').hidden };
  });
  check('reduced motion: no camera shake from mining or hurt', d5.reduced === true && d5.sh.t === 0 && d5.sh2.t === 0, JSON.stringify(d5));
  check('desktop: death opens the summary', d5.open === true);
  await D.page.keyboard.press('Escape');
  const d6 = await D.page.evaluate(() => !document.getElementById('run-panel').hidden);
  check('desktop: Escape closes the summary', d6 === false);
  const intro = await D.page.evaluate(() => window.__dd.introText());
  check('desktop: first hint names mouse + WASD controls', /WASD/.test(intro) && /Hold left to mine/.test(intro), intro);
  const d7 = await D.page.evaluate(() => { const d = window.__dd; d.panel('goals', true); const g = !document.getElementById('goals-panel').hidden; document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return { g, after: !document.getElementById('goals-panel').hidden }; });
  check('desktop: Escape closes the goals panel too', d7.g === true && d7.after === false, JSON.stringify(d7));
  const pil = await D.page.evaluate(() => {
    const d = window.__dd, s = d.spawn; d.setPos(s.x, s.y, s.z); d.step(1 / 60, 40); d.inv.stone = 5; d.select('stone');
    const y0 = d.player.y; d.player.pitch = -1.55; const out = [];
    for (let k = 0; k < 3; k++) {
      d.input.jump = true; let placed = false;
      for (let i = 0; i < 60 && !placed; i++) { d.step(1 / 60, 1); d.input.jump = false; const h = d.raycast(5); if (h && h.prev && d.player.vy < 2) placed = d.placeAt(h.prev[0], h.prev[1], h.prev[2], 'stone'); }
      d.step(1 / 60, 60); out.push([placed, Math.round((d.player.y - y0) * 100) / 100]);
    }
    return { out, stone: d.inv.stone };
  });
  check('climb tip is honest: jump + Place under you pillars up 3 blocks', pil.out.every((o) => o[0]) && pil.out[2][1] >= 2.9 && pil.stone === 2, JSON.stringify(pil));
  const mp = await D.page.evaluate(() => {
    const d = window.__dd, s = d.spawn; d.setPos(s.x, s.y, s.z); d.step(1 / 60, 30); d.player.pitch = -1.55; d.player.yaw = 0;
    const target = d.raycast(5), before = target && d.getBlock(...target.cell);
    d.input.mine = true; d.mining(0.12);
    const mid = { p: d.progShown(), shown: !document.getElementById('minebar').hidden, w: document.getElementById('mineprog').style.width };
    for (let i = 0; i < 40 && d.getBlock(...target.cell) === before; i++) d.mining(0.05);
    d.input.mine = false; d.mining(0.05);
    return { mid, broke: d.getBlock(...target.cell) !== before, end: d.progShown(), hiddenAfter: document.getElementById('minebar').hidden };
  });
  check('mining bar: fills under the crosshair while a block is being mined', mp.mid.p > 0 && mp.mid.p < 1 && mp.mid.shown && /%$/.test(mp.mid.w), JSON.stringify(mp));
  check('mining bar: the block breaks and the bar hides again', mp.broke === true && mp.end === 0 && mp.hiddenAfter === true);
  if (process.env.SHOTS) await D.page.screenshot({ path: process.env.SHOTS + '/dive-desktop.png' });
  check('desktop: console clean', D.errors.length === 0, D.errors.join(' | '));
  check('desktop: zero DB requests', D.db.count() === 0);
  await D.ctx.close();

  // motion allowed: mining shakes the camera
  const M = await open(browser, DESKTOP, '&seed=7');
  const d8 = await M.page.evaluate(() => { const d = window.__dd; d.run.start(); d.run.mined('gold_ore', 5); return d.run.shake(); });
  check('juice: ore breaks shake the camera when motion is allowed', d8.t > 0 && d8.amp > 0, JSON.stringify(d8));
  check('motion: console clean', M.errors.length === 0, M.errors.join(' | '));
  await M.ctx.close();

  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
