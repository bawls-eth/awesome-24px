// Campfire Jam MG4: Relax mode (no fail, no score, practice stars that do not count, its own tracking), the lane-shape assist
// (shapes on notes, lane tops and pads; on by default with any colour-blind MMAccess palette), "tap only" long notes,
// and calibration that never blocks play. Phone 390x844, blockDb, console clean.
// Run: NODE_PATH=$(npm root -g) BASE=http://localhost:8440/game/index.html node game/tests/jam-relax.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = ORIGIN + '/game/games/jam/index.html?test=1';
const KEY = 'pixeltown-jam-v1', AKEY = 'pixeltown-access-v1';
const SEED = JSON.stringify({ v: 1, hint: true, plays: 0 }); // no offsetMs: the optional timing check card is showing
const HCHART = { version: 1, difficulty: 'easy', bpm: 100, count: 2, lengthMs: 6000, notes: [{ t: 1000, lane: 'D', hold: 1200 }, { t: 3500, lane: 'K' }] };
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const dbs = [];

async function open(browser, init, access) {
  const ctx = await browser.newContext(PHONE);
  const db = await blockDb(ctx); dbs.push(db);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript(([k, v, ak, av]) => { if (!sessionStorage.seeded) { sessionStorage.seeded = '1'; if (v !== null) localStorage.setItem(k, v); if (av !== null) localStorage.setItem(ak, av); } }, [KEY, init === undefined ? null : init, AKEY, access === undefined ? null : access]);
  await page.goto(URL); await page.waitForFunction(() => window.__jam);
  return { ctx, page, errors };
}
const noHScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && document.body.scrollWidth <= window.innerWidth + 1);
const targets44 = (p) => p.evaluate(() => [...document.querySelectorAll('#overlay button, #overlay a, .pad')].filter((b) => b.offsetParent !== null).every((b) => { const r = b.getBoundingClientRect(); return r.height >= 44 && r.width >= 44; }));

(async () => {
  const browser = await chromium.launch();
  let d = await open(browser, SEED), p = d.page;

  // ---- menu: relax toggle, clearly labelled; calibration stays optional ----
  check('menu: Relax toggle is off by default, labelled, >= 44 px', await p.evaluate(() => { const b = document.getElementById('pref-relax'); const r = b.getBoundingClientRect(); return b.getAttribute('aria-pressed') === 'false' && /Relax mode: Off/.test(b.textContent) && r.height >= 44 && r.width >= 44; }));
  check('calibration is non-blocking: the timing card shows and every open tier button is enabled', await p.evaluate(() => !!document.getElementById('cal-card') && !document.querySelector('.card[data-song=warm-embers] .tiers button[data-tier=easy]').disabled && !document.querySelector('.card[data-song=warm-embers] .tiers button[data-tier=normal]').disabled));
  await p.click('#pref-relax');
  check('Relax on: aria-pressed, tier buttons say "Relax", info says no fail and stars only from normal play', await p.evaluate(() => document.getElementById('pref-relax').getAttribute('aria-pressed') === 'true' && document.querySelector('.card[data-song=warm-embers] .tiers button[data-tier=easy]').textContent === 'Relax Easy' && /nothing can fail/.test(document.getElementById('relax-info').textContent) && /Stars only come from normal play/.test(document.getElementById('relax-info').textContent)));
  check('relax pref stored additively in the jam key', await p.evaluate((k) => JSON.parse(localStorage.getItem(k)).prefs.relax === true, KEY));
  check('phone menu: no horizontal scroll, all targets >= 44 px', (await noHScroll(p)) && (await targets44(p)));
  const normalNotes = await p.evaluate(() => { window.__jam.start('warm-embers', 'easy'); const n = JSON.stringify(window.__jam.chart.notes); window.__jam.menu(); return n; });

  // ---- a relax run with no presses at all: never fails, no Miss popups, no shake ----
  await p.click('.card[data-song=warm-embers] .tiers button[data-tier=easy]');
  check('relax run starts without calibrating; the HUD says Relax', await p.evaluate(() => window.__jam.mode === 'play' && window.__jam.relax === true && /^Relax: Warm Embers/.test(document.getElementById('hud-song').textContent)));
  check('songs keep their charts: the relax chart equals the normal chart', normalNotes === await p.evaluate(() => JSON.stringify(window.__jam.chart.notes)));
  check('no score pressure: score, accuracy and combo are hidden', await p.evaluate(() => ['hud-score', 'hud-acc', 'hud-combo'].every((id) => getComputedStyle(document.getElementById(id)).display === 'none')));
  const idle = await p.evaluate(() => { const J = window.__jam; let miss = false, shake = 0; for (let i = 0; i < 2000 && J.mode === 'play'; i++) { J.step(100); if (J.popups.indexOf('Miss') >= 0) miss = true; shake = Math.max(shake, J.shake); } return { mode: J.mode, miss, shake, r: J.relaxResult, summary: J.summary }; });
  check('missing every note still ends on a friendly card (no fail state)', idle.mode === 'results' && idle.r && idle.r.hits === 0 && idle.summary === null, JSON.stringify(idle));
  check('no "Miss" popups and no screen shake in Relax', !idle.miss && idle.shake === 0, JSON.stringify(idle));
  check('relax card: labelled practice stars that do not count, no rank or score', await p.evaluate(() => /Practice stars/.test(document.getElementById('relax-stars').textContent) && /do not count/.test(document.getElementById('relax-note').textContent) && !document.getElementById('res-rank') && !document.getElementById('res-score') && !/Miss/.test(document.getElementById('overlay').textContent)));
  check('phone relax card: no horizontal scroll, targets >= 44 px', (await noHScroll(p)) && (await targets44(p)));
  let sv = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
  check('relax saved only its own tracking: no best, stars, plays or history', sv.plays === 0 && Object.keys(sv.best).length === 0 && !sv.hist && !sv.ghost && sv.relax.plays === 1 && sv.relax.songs['warm-embers'].plays === 1 && sv.relax.songs['warm-embers'].pstars === 0, JSON.stringify(sv));

  // ---- a perfect relax run: 3 practice stars, but no real stars and no unlocks ----
  await p.click('#again');
  const perfect = await p.evaluate(() => { const J = window.__jam; const ev = []; J.chart.notes.forEach((n) => { ev.push({ t: n.t, k: 0, n }); if (n.hold) ev.push({ t: n.t + n.hold, k: 1, n }); }); ev.sort((a, b) => a.t - b.t || a.k - b.k); for (const e of ev) { J.at(e.t); if (e.k === 0) J.press(e.n.lane); else J.release(e.n.lane); } J.step(200000); return { r: J.relaxResult, mode: J.mode }; });
  check('perfect relax play shows 3 practice stars', perfect.mode === 'results' && perfect.r.practiceStars === 3 && perfect.r.plays === 2 && await p.evaluate(() => document.getElementById('relax-stars').textContent.includes('★★★')), JSON.stringify(perfect));
  sv = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
  check('practice stars never count: total stars 0, Lantern Shuffle (2 stars) still locked', sv.relax.songs['warm-embers'].pstars === 3 && Object.keys(sv.best).length === 0 && sv.unlocked.join() === 'warm-embers' && await p.evaluate(() => { window.__jam.menu(); return document.querySelector('.card[data-song=lantern-shuffle]').classList.contains('locked') && /Stars: 0 \//.test(document.getElementById('overlay').textContent); }));
  check('menu card shows the relax line marked "do not count"', await p.evaluate(() => /Relax plays 2, practice stars ★★★ \(do not count\)/.test(document.querySelector('.card[data-song=warm-embers] .relax-line').textContent)));
  await p.click('#pref-relax');
  check('Relax off again: tier buttons start a normal scored run', await p.evaluate(() => { document.querySelector('.card[data-song=warm-embers] .tiers button[data-tier=easy]').click(); const ok = window.__jam.relax === false && getComputedStyle(document.getElementById('hud-score')).display !== 'none'; window.__jam.menu(); return ok; }));

  // ---- lane-shape assist toggle (default palette) ----
  const base = await p.evaluate(() => window.__jam.laneColors);
  check('lane shapes default off without an access palette; pads show keys only', await p.evaluate(() => window.__jam.laneShapes === false && window.__jam.padText.join() === 'D,F,J,K' && document.getElementById('pref-laneShapes').getAttribute('aria-pressed') === 'false'));
  await p.click('#pref-laneShapes');
  check('lane shapes on: four distinct shapes on the pads, colours kept, pref stored', await p.evaluate((k) => { const t = window.__jam.padText; return window.__jam.laneShapes && t[0] === '● D' && t[1] === '◆ F' && t[2] === '■ J' && t[3] === '▲ K' && JSON.parse(localStorage.getItem(k)).prefs.laneShapes === true; }, KEY) && (await p.evaluate(() => window.__jam.laneColors)).join() === base.join());
  check('lane shapes draw without errors during a run (render frames)', await p.evaluate(() => new Promise((res) => { window.__jam.start('warm-embers', 'easy'); window.__jam.step(1500); requestAnimationFrame(() => requestAnimationFrame(() => { window.__jam.menu(); res(true); })); })));
  await p.click('#pref-laneShapes');
  check('lane shapes off removes the stored flag', await p.evaluate((k) => { const pr = JSON.parse(localStorage.getItem(k)).prefs || {}; return !pr.laneShapes && !pr.laneShapesOff && window.__jam.padText.join() === 'D,F,J,K'; }, KEY));

  // ---- tap-only long notes ----
  const holdRun = async () => p.evaluate((c) => { const J = window.__jam; J.start('warm-embers', 'easy', { chart: c }); J.at(1000); J.press('D'); J.release('D'); J.at(3500); J.press('K'); J.release('K'); J.step(10000); return J.summary; }, HCHART);
  const held = await holdRun();
  check('hold mode: letting go of a long note early breaks the full combo', held && held.fullCombo === false, JSON.stringify(held));
  await p.evaluate(() => window.__jam.menu());
  await p.click('#pref-tapHolds');
  check('tap-only toggle: label, aria-pressed and stored pref', await p.evaluate((k) => { const b = document.getElementById('pref-tapHolds'); return /Tap only/.test(b.textContent) && b.getAttribute('aria-pressed') === 'true' && JSON.parse(localStorage.getItem(k)).prefs.tapHolds === true && window.__jam.tapHolds; }, KEY));
  const tapped = await holdRun();
  check('tap only: one tap finishes the long note, full combo kept', tapped && tapped.fullCombo === true && tapped.counts.miss === 0, JSON.stringify(tapped));
  check('no console errors (relax, shapes, tap only)', d.errors.length === 0, d.errors.join('|'));
  await d.ctx.close();

  // ---- shared access palettes turn lane shapes on (every non-normal MMAccess palette) ----
  for (const pal of ['deuteranopia', 'protanopia', 'tritanopia']) {
    d = await open(browser, SEED, JSON.stringify({ v: 1, palette: pal })); p = d.page;
    check('access palette ' + pal + ': lane shapes on by default with 4 distinct pad shapes', await p.evaluate(() => window.__jam.laneShapes === true && new Set(window.__jam.padText.map((t) => t.split(' ')[0])).size === 4 && /\(access palette\)/.test(document.getElementById('pref-laneShapes').textContent)));
    if (pal === 'deuteranopia') {
      await p.click('#pref-laneShapes');
      check('player can still turn them off; the off choice is stored and survives a reload', await p.evaluate((k) => window.__jam.laneShapes === false && JSON.parse(localStorage.getItem(k)).prefs.laneShapesOff === true, KEY));
      await p.reload(); await p.waitForFunction(() => window.__jam);
      check('after reload lane shapes stay off and the access prefs were not written', await p.evaluate((ak) => window.__jam.laneShapes === false && JSON.parse(localStorage.getItem(ak)).palette === 'deuteranopia', AKEY));
    }
    check('no console errors (' + pal + ')', d.errors.length === 0, d.errors.join('|'));
    await d.ctx.close();
  }

  // ---- old and hostile saves ----
  d = await open(browser, JSON.stringify({ v: 1, hint: true, relax: { plays: 'x', songs: { 'warm-embers': { plays: 1e12, notes: -4, pstars: 9 }, evil: { plays: 3 } } }, prefs: { relax: 'yes', tapHolds: true } })); p = d.page;
  check('hostile relax data is clamped and unknown songs dropped', await p.evaluate(() => { const s = window.__jam.save; return s.relax.plays === 0 && s.relax.songs['warm-embers'].plays === 999999 && s.relax.songs['warm-embers'].notes === 0 && s.relax.songs['warm-embers'].pstars === 3 && !s.relax.songs.evil && !s.prefs.relax && s.prefs.tapHolds === true; }));
  check('no console errors (hostile save)', d.errors.length === 0, d.errors.join('|'));
  await d.ctx.close();
  check('blockDb saw 0 database requests', dbs.every((x) => x.count() === 0), dbs.map((x) => x.count()).join(','));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
