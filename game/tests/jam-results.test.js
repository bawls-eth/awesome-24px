// Campfire Jam: results polish (last-5 history sparkline, accuracy breakdown, early/late histogram, best-run ghost).
// Playwright, phone 390x844. Run: NODE_PATH=$(npm root -g) BASE=http://localhost:8440/game/index.html node game/tests/jam-results.test.js
const { chromium } = require('playwright');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = ORIGIN + '/game/games/jam/index.html?test=1';
const KEY = 'pixeltown-jam-v1';
const SEED = JSON.stringify({ v: 1, hint: true, offsetMs: 0, plays: 0 });

async function open(browser, init) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  if (init !== undefined) await page.addInitScript(([k, v]) => { if (!sessionStorage.seeded) { sessionStorage.seeded = '1'; localStorage.setItem(k, v); } }, [KEY, init]);
  await page.goto(URL); await page.waitForFunction(() => window.__jam);
  return { ctx, page, errors };
}
// plays the current chart shifted by `shift` ms; leaves out every `skipEvery`th note (0 = none)
const drive = (p, shift, skipEvery) => p.evaluate(([sh, sk]) => {
  const J = window.__jam, ev = [];
  J.chart.notes.forEach((n, i) => { if (sk && i % sk === 0) return; ev.push({ t: n.t + sh, k: 0, n }); if (n.hold) ev.push({ t: n.t + n.hold + sh, k: 1, n }); });
  ev.sort((a, b) => a.t - b.t || a.k - b.k);
  for (const e of ev) { J.at(e.t); if (e.k === 0) J.press(e.n.lane); else J.release(e.n.lane); }
  J.step(70000);
}, [shift, skipEvery || 0]);
const canvasInk = (p, id) => p.evaluate((i) => { const c = document.getElementById(i), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const seen = new Set(); for (let k = 0; k < d.length; k += 4) seen.add(d[k] + ',' + d[k + 1] + ',' + d[k + 2]); return seen.size; }, id);

(async () => {
  const browser = await chromium.launch();
  let d = await open(browser, SEED), p = d.page;

  // ---- first run: breakdown + histogram ----
  await p.evaluate(() => window.__jam.start('warm-embers', 'easy'));
  await drive(p, 25, 10); // all late by 25 ms, every 10th note missed
  const r1 = await p.evaluate(() => ({ s: window.__jam.summary, res: window.__jam.results }));
  check('results mode with a breakdown row per judgement; percentages add up near 100', await p.evaluate(() => { const rows = [...document.querySelectorAll('#res-breakdown .brow')]; const sum = rows.reduce((a, r) => a + Number(r.dataset.pct), 0); return window.__jam.mode === 'results' && rows.length === 4 && sum >= 98 && sum <= 102 && rows[3].dataset.judge === 'miss' && Number(rows[3].dataset.pct) > 0; }));
  check('histogram counts every hit and puts them on the late side', r1.res.histogram.total === r1.s.hits && r1.res.histogram.late === r1.s.hits && r1.res.histogram.early === 0 && r1.res.histogram.bins.slice(7).reduce((a, b) => a + b, 0) === r1.s.hits);
  check('histogram text and canvas are drawn', await p.evaluate(() => /Late \d+/.test(document.getElementById('res-histo-text').textContent) && document.getElementById('res-histo').getAttribute('aria-label').includes('late')) && (await canvasInk(p, 'res-histo')) >= 3);
  check('first run: history has 1 point', r1.res.history.length === 1 && (await p.evaluate(() => document.getElementById('res-spark').dataset.points)) === String(r1.res.history[0].acc));
  check('results fit the phone width', await p.evaluate(() => document.documentElement.scrollWidth <= 390 && document.getElementById('res-spark').getBoundingClientRect().width <= 390));
  const g1 = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)).ghost['warm-embers'].easy, KEY);
  check('best-run ghost saved: one offset per note, 999 for the missed ones', g1.length === (await p.evaluate(() => window.__jam.chart.notes.length)) && g1.filter((v) => v === 999).length === Math.ceil(g1.length / 10) && g1.filter((v) => v === 25).length === g1.length - Math.ceil(g1.length / 10));

  // ---- early side ----
  await p.click('#again');
  await drive(p, -35, 0); // 35 ms early: still perfect, and no misses
  const r2 = await p.evaluate(() => ({ s: window.__jam.summary, res: window.__jam.results }));
  check('an early run shows early hits and a 2-point history', r2.res.histogram.early === r2.s.hits && r2.res.histogram.bins.slice(0, 6).reduce((a, b) => a + b, 0) === r2.s.hits && r2.res.history.length === 2);
  const g2 = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)).ghost['warm-embers'].easy, KEY);
  const b2 = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)).best['warm-embers'].easy.score, KEY);
  check('a higher-scoring run replaces the ghost', r2.s.newBest && g2.every((v) => v === -35) && b2 === r2.s.score);

  // ---- a worse run keeps the old ghost; history caps at 5 ----
  const ghostBefore = JSON.stringify(g2);
  await p.click('#again'); await drive(p, 100, 3);
  const r3 = await p.evaluate(() => ({ s: window.__jam.summary, res: window.__jam.results }));
  check('a worse run does not replace the best ghost', !r3.s.newBest && (await p.evaluate((k) => JSON.stringify(JSON.parse(localStorage.getItem(k)).ghost['warm-embers'].easy), KEY)) === ghostBefore);
  for (let i = 0; i < 4; i++) { await p.click('#again'); await drive(p, 0, 5 + i); }
  const r4 = await p.evaluate(() => ({ res: window.__jam.results, pts: document.getElementById('res-spark').dataset.points, saved: JSON.parse(localStorage.getItem('pixeltown-jam-v1')).hist['warm-embers'].easy }));
  check('history keeps only the last 5 runs, oldest dropped', r4.res.history.length === 5 && r4.saved.length === 5 && r4.pts.split(',').length === 5 && r4.pts === r4.saved.map((h) => h.acc).join(','));
  check('sparkline canvas is drawn and has a text twin', (await canvasInk(p, 'res-spark')) >= 3 && await p.evaluate(() => /Last 5 runs/.test(document.getElementById('res-spark-text').textContent)));
  check('a run on a hand-made chart never saves a ghost', await p.evaluate(() => { window.__jam.start('lantern-shuffle', 'easy', { chart: { version: 1, difficulty: 'easy', bpm: 100, count: 1, lengthMs: 3000, notes: [{ t: 1000, lane: 'D' }] } }); window.__jam.at(1000); window.__jam.press('D'); window.__jam.step(5000); return !(JSON.parse(localStorage.getItem('pixeltown-jam-v1')).ghost || {})['lantern-shuffle']; }));

  // ---- Replay best: the ghost during play ----
  await p.evaluate(() => window.__jam.start('warm-embers', 'easy'));
  check('ghost is off by default while playing', await p.evaluate(() => window.__jam.ghost.active === false));
  await p.evaluate(() => window.__jam.menu());
  await p.evaluate(() => window.__jam.start('warm-embers', 'easy')); await drive(p, 0, 0);
  check('Replay best is enabled when a ghost exists', await p.evaluate(() => !document.getElementById('replay-best').disabled));
  await p.click('#replay-best');
  const gh = await p.evaluate(() => ({ g: window.__jam.ghost, chart: window.__jam.chart, mode: window.__jam.mode }));
  const best = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)).ghost['warm-embers'].easy, KEY);
  check('Replay best shows a marker for every hit of the best run at note time + its offset', gh.mode === 'play' && gh.g.active && gh.g.markers.length === best.filter((v) => v !== 999).length && gh.g.markers.every((m, i) => { const ns = gh.chart.notes.filter((n, k) => best[k] !== 999); return m.t === ns[i].t + best[gh.chart.notes.indexOf(ns[i])] && m.lane === ns[i].lane; }));
  await p.evaluate(() => window.__jam.step(800));
  const again = await p.evaluate(() => JSON.stringify(window.__jam.ghost));
  await p.evaluate(() => { window.__jam.menu(); window.__jam.start('warm-embers', 'easy', { ghost: true }); window.__jam.step(800); });
  check('the ghost is deterministic (same markers each start)', (await p.evaluate(() => JSON.stringify(window.__jam.ghost))) === again);
  check('ghost drawing does not break the frame (canvas still renders)', (await p.evaluate(() => { const c = document.getElementById('game'); return c.width === 320 && c.height === 420; })));
  await p.evaluate(() => window.__jam.menu());
  await p.click('#pref-ghost');
  check('ghost pref toggles on, is stored additively, and applies to a normal start', await p.evaluate((k) => { const on = JSON.parse(localStorage.getItem(k)).prefs.ghost === true; window.__jam.start('warm-embers', 'easy'); return on && window.__jam.ghost.active; }, KEY));
  check('practice never shows the ghost', await p.evaluate(() => { window.__jam.menu(); window.__jam.start('warm-embers', 'easy', { practice: { speed: 0.5 } }); return window.__jam.ghost.active === false; }));
  check('no console errors (results)', d.errors.length === 0, d.errors.join('|'));
  await d.ctx.close();

  // ---- corrupt save recovery ----
  const sane = { 'warm-embers': { easy: { score: 5000, stars: 2, rank: 'B', combo: 20 } } };
  const cases = [
    '{oops',
    JSON.stringify({ v: 1, hint: true, best: sane, hist: { 'warm-embers': { easy: [{ score: 'x', acc: 9999, rank: 'Z' }, 5, null, { score: 100, acc: 50, rank: 'A' }, 1, 2, 3, 4, 5, 6] } }, ghost: { 'warm-embers': { easy: 'nope' } } }),
    JSON.stringify({ v: 1, hint: true, best: sane, ghost: { 'warm-embers': { easy: [1, 2, 3] } } }), // wrong length: kept as data but never applied
    JSON.stringify({ v: 1, hint: true, hist: [], ghost: 5 })
  ];
  for (let i = 0; i < cases.length; i++) {
    d = await open(browser, cases[i]); p = d.page;
    const sv = await p.evaluate(() => window.__jam.save);
    check('corrupt case ' + i + ': save is valid (hist <= 5, ranks and acc clamped)', sv.v === 1 && (!sv.hist || Object.values(sv.hist).every((h) => Object.values(h).every((a) => a.length <= 5 && a.every((e) => e.acc >= 0 && e.acc <= 100 && 'SABCD'.includes(e.rank))))));
    await p.evaluate(() => { window.__jam.setPref('ghost', true); window.__jam.start('warm-embers', 'easy'); });
    check('corrupt case ' + i + ': a mismatching or broken ghost is ignored safely', await p.evaluate(() => window.__jam.mode === 'play' && window.__jam.ghost.active === false));
    await drive(p, 0, 0);
    check('corrupt case ' + i + ': results still render with a sparkline', await p.evaluate(() => window.__jam.mode === 'results' && !!document.getElementById('res-spark') && document.getElementById('res-spark').dataset.points.split(',').length >= 1));
    check('corrupt case ' + i + ': no console errors', d.errors.length === 0, d.errors.join('|'));
    await d.ctx.close();
  }
  await browser.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exitCode = failed ? 1 : 0;
})();
