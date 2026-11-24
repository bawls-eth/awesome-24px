// cyc2-S DD5 path replay (the half cyc0 left out): the deepest dive per seed keeps a SPARSE path (additive `seedPath` inside
// pixeltown-deepdelve-runs-v1, <= 64 half-block points, <= 8 seeds), and the next dive on that seed draws it as a faint trail
// (one THREE.Points + one THREE.Line, built once per dive). Node: sampling rate / thinning / cap, clean of hostile paths, finish
// keeps the path only for a new seed best, save merge keeps the deeper tab's path, old records load. Browser: a seeded path is
// drawn on load, ?ghost=0 draws nothing, a real dive (scripted moves + endRun) saves its own path, no page errors, 0 DB requests.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc2-dd-path-replay.test.js
const { check, done, blockDb } = require('./helpers');
const R = require('../games/deepdelve/dd-run.js');
const KEY = 'pixeltown-deepdelve-runs-v1';
class Mem { constructor(o) { this.m = Object.assign({}, o); } getItem(k) { return k in this.m ? this.m[k] : null; } setItem(k, v) { this.m[k] = String(v); } }

// ---- node ----
const run = R.start(0, 'plain', 7);
let n = 0; for (let i = 0; i <= 100; i++) { const t = i / 10; if (R.sample(run, 64.3, -t, 64.8, t)) n++; }
check('sample: one point per second (11 points in 0..10 s), half-block rounded', n === 11 && run.path.length === 11 && JSON.stringify(run.path[0]) === '[64.5,0,65]', JSON.stringify(run.path.slice(0, 2)));
const long = R.start(0, 'plain', 7); for (let t = 0; t < 600; t += 0.25) R.sample(long, 1, -t / 10, 1, t);
check('sample: a 10 min dive stays under PATH_MAX points (thinned, interval doubled) and still spans the dive', long.path.length < R.PATH_MAX && long.path.length >= R.PATH_MAX / 4 && long.path[0][1] === 0 && long.path[long.path.length - 1][1] < -50, JSON.stringify({ n: long.path.length, last: long.path[long.path.length - 1] }));
check('sample: no seed (creative) or junk input records nothing', R.sample(R.start(0, 'plain', null), 1, 1, 1, 1) === false && R.sample(run, NaN, 1, 1, 99) === false && R.sample(run, 1, 1, 1, Infinity) === false);
const old = R.clean('{"v":1,"runs":4,"best":{"depth":9},"seedBest":{"7":5}}');
check('clean: an old record (no seedPath) loads with an empty path map', JSON.stringify(old.seedPath) === '{}' && old.seedBest['7'] === 5);
const hp = R.clean({ seedBest: { 7: 9, 8: 3 }, seedPath: { 7: [[1, 2, 3], [1, 'x', 3], [4.26, -5, 6], null, [1, 2]], 8: [[1, 1, 1]], 9: [[1, 1, 1], [2, 2, 2]], __proto__: [[1, 1, 1], [2, 2, 2]] } });
check('clean: bad points dropped, 1-point paths dropped, paths only for seeds with a seedBest', JSON.stringify(hp.seedPath) === '{"7":[[1,2,3],[4.5,-5,6]]}', JSON.stringify(hp.seedPath));
const bigP = []; for (let i = 0; i < 500; i++) bigP.push([i, -i, i]);
const sb = {}, spp = {}; for (let i = 1; i <= 20; i++) { sb[i] = i; spp[i] = bigP; }
const capped = R.clean({ seedBest: sb, seedPath: spp });
check('clean: at most PATH_SEEDS paths (the deepest seeds), each at most PATH_MAX points', Object.keys(capped.seedPath).length === R.PATH_SEEDS && capped.seedPath['20'].length === R.PATH_MAX && !capped.seedPath['1'] && JSON.stringify(capped).length < 20000, JSON.stringify({ keys: Object.keys(capped.seedPath), bytes: JSON.stringify(capped).length }));
const rec = R.clean(null); const r1 = R.start(0, 'plain', 7); R.depth(r1, 10); R.sample(r1, 1, 0, 1, 0); R.sample(r1, 1, -10, 1, 1);
R.finish(rec, r1, false);
check('finish: a new seed best stores its path', rec.seedBest['7'] === 10 && rec.seedPath['7'].length === 2);
const r2 = R.start(0, 'plain', 7); R.depth(r2, 4); R.sample(r2, 9, 0, 9, 0); R.sample(r2, 9, -4, 9, 1);
R.finish(rec, r2, false);
check('finish: a shallower dive keeps the old path', rec.seedPath['7'][1][1] === -10);
const st = new Mem(); R.save(st, rec);
const tabB = R.clean(null); const r3 = R.start(0, 'plain', 7); R.depth(r3, 20); R.sample(r3, 5, 0, 5, 0); R.sample(r3, 5, -20, 5, 1); R.finish(tabB, r3, false);
R.save(st, tabB);
const stale = R.clean(JSON.parse(JSON.stringify(rec))); R.save(st, stale); // the first tab writes again with its older, shallower record
const disk = R.load(st);
check('save merge: the deeper tab\'s path survives a stale second write (max depth and its path together)', disk.seedBest['7'] === 20 && disk.seedPath['7'][1][1] === -20, JSON.stringify(disk.seedPath));

if (process.env.NODE_ONLY) { done(); return; }

// ---- browser ----
const { chromium } = require('playwright');
const ORIGIN = (process.env.BASE || 'http://localhost:8440').replace(/\/game\/.*$/, '').replace(/\/$/, '');
const URL = (q) => ORIGIN + '/game/games/deepdelve/index.html?test=1' + (q || '');
async function open(browser, q, seedRec) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await blockDb(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(ORIGIN + '/game/games/deepdelve/index.html?test=1&noop=1');
  await page.waitForFunction(() => window.__dd && window.__dd.ready, null, { timeout: 60000 });
  const seed = await page.evaluate(() => window.__dd.seed);
  await page.evaluate((a) => { localStorage.setItem(a[0], JSON.stringify(a[1])); }, [KEY, seedRec ? seedRec(seed) : { v: 1 }]);
  await page.goto(URL(q));
  await page.waitForFunction(() => window.__dd && window.__dd.ready, null, { timeout: 60000 });
  return { ctx, page, errors, db, seed };
}
const mk = (seed) => { const p = []; for (let i = 0; i < 30; i++) p.push([64 + Math.sin(i / 3) * 3, -i, 64 + Math.cos(i / 3) * 3]); return { v: 1, runs: 1, best: { depth: 30 }, seedBest: { [seed]: 30 }, seedPath: { [seed]: p } }; };
(async () => {
  const browser = await chromium.launch();
  const A = await open(browser, '', mk);
  const g = await A.page.evaluate(() => window.__dd.run.ghostPath());
  check('a stored path for this seed is drawn on load (30 points, in the scene)', g.on && g.shown && g.n === 30, JSON.stringify(g));
  // a scripted dive deeper than the stored 30: sample at real speed, then end it
  const saved = await A.page.evaluate(async () => {
    const d = window.__dd; const r = d.run; const d0 = r.depth0();
    for (let i = 0; i <= 40; i++) { d.player.y = -(d0 + i); r.tick(d0 + i); await new Promise((res) => setTimeout(res, 60)); }
    const pts = r.state.path ? r.state.path.length : 0;
    r.end(false, 'test'); const rec = JSON.parse(localStorage.getItem('pixeltown-deepdelve-runs-v1'));
    const s = String(d.seed); return { pts, best: rec.seedBest[s], path: (rec.seedPath[s] || []).length, after: r.ghostPath() };
  });
  check('a deeper scripted dive saves its own sparse path and the next dive draws it', saved.best === 40 && saved.path >= 2 && saved.path <= R.PATH_MAX && saved.after.shown && saved.after.n === saved.path && saved.after.builds >= 2, JSON.stringify(saved));
  check('no page errors, 0 DB requests', !A.errors.length && A.db.attempts() === 0, JSON.stringify(A.errors.slice(0, 3)));
  await A.ctx.close();
  const B = await open(browser, '&ghost=0', mk);
  const g0 = await B.page.evaluate(() => window.__dd.run.ghostPath());
  check('?ghost=0: no trail is drawn', g0.on === false && !g0.shown && g0.n === 0, JSON.stringify(g0));
  check('?ghost=0: no page errors, 0 DB requests', !B.errors.length && B.db.attempts() === 0);
  await B.ctx.close();
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
