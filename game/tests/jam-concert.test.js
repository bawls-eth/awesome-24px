// Campfire Jam: Concert mode (3 songs back to back, combined score and rank). Playwright, phone 390x844.
// Run: NODE_PATH=$(npm root -g) BASE=http://localhost:8440/game/index.html node game/tests/jam-concert.test.js
const { chromium } = require('playwright');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = ORIGIN + '/game/games/jam/index.html?test=1';
const KEY = 'pixeltown-jam-v1';
// 3 songs open (5 stars) so a concert is possible
const SEED = JSON.stringify({ v: 1, hint: true, offsetMs: 0, plays: 3, unlocked: [],
  best: { 'warm-embers': { easy: { score: 5000, stars: 3, rank: 'S', combo: 40 } }, 'lantern-shuffle': { easy: { score: 5000, stars: 2, rank: 'A', combo: 40 } } } });

async function open(browser, init) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  if (init !== undefined) await page.addInitScript(([k, v]) => { if (!sessionStorage.seeded) { sessionStorage.seeded = '1'; localStorage.setItem(k, v); } }, [KEY, init]);
  await page.goto(URL); await page.waitForFunction(() => window.__jam);
  return { ctx, page, errors };
}
// perfect-play the current chart; skipEvery = leave out every Nth note
const play = (p, skipEvery) => p.evaluate((sk) => {
  const J = window.__jam, ev = [];
  J.chart.notes.forEach((n, i) => { if (sk && i % sk === 0) return; ev.push({ t: n.t, k: 0, n }); if (n.hold) ev.push({ t: n.t + n.hold, k: 1, n }); });
  ev.sort((a, b) => a.t - b.t || a.k - b.k);
  for (const e of ev) { J.at(e.t); if (e.k === 0) J.press(e.n.lane); else J.release(e.n.lane); }
  J.step(120000);
}, skipEvery || 0);

(async () => {
  const browser = await chromium.launch();

  // ---- locked until 3 songs are open ----
  let d = await open(browser);
  let p = d.page;
  check('fresh save: Concert button disabled (only 1 song open)', await p.evaluate(() => document.getElementById('btn-concert').disabled && /Open 3 songs/.test(document.getElementById('concert-info').textContent)));
  check('concert cannot be started from the hook with locked songs', await p.evaluate(() => window.__jam.startConcert(['warm-embers', 'lantern-shuffle', 'moth-parade'], 'easy') === false && window.__jam.mode === 'menu'));
  check('no horizontal scroll at 390 px; 12 song cards', await p.evaluate(() => document.documentElement.scrollWidth <= 390 && document.querySelectorAll('.card[data-song]').length === 12));
  await d.ctx.close();

  // ---- a full concert ----
  d = await open(browser, SEED); p = d.page;
  check('3 songs open: Concert button enabled', await p.evaluate(() => !document.getElementById('btn-concert').disabled));
  await p.click('#btn-concert');
  check('setup lists only open songs and Start is disabled', await p.evaluate(() => document.querySelectorAll('#concert-songs button').length === 3 && document.getElementById('concert-start').disabled));
  check('setup buttons are at least 44 px', await p.evaluate(() => [...document.querySelectorAll('#overlay button')].every((b) => b.getBoundingClientRect().height >= 44 && b.getBoundingClientRect().width >= 44)));
  await p.click('#concert-songs button[data-song=moth-parade]');
  await p.click('#concert-songs button[data-song=warm-embers]');
  await p.click('#concert-songs button[data-song=lantern-shuffle]');
  check('3 picked songs enable Start; order numbered', await p.evaluate(() => !document.getElementById('concert-start').disabled && document.querySelector('#concert-songs button[data-song=moth-parade]').textContent.startsWith('1.')));
  await p.click('#concert-tiers button[data-tier=hard]');
  check('hard tier is refused while locked (Start disabled)', await p.evaluate(() => document.getElementById('concert-start').disabled));
  await p.click('#concert-tiers button[data-tier=easy]');
  await p.click('#concert-start');
  check('concert starts with the first picked song', await p.evaluate(() => window.__jam.mode === 'play' && window.__jam.concert.idx === 0 && window.__jam.chart.song === 'moth-parade' && /Concert 1\/3/.test(document.getElementById('hud-song').textContent)));
  await play(p, 0);
  check('interlude shows after song 1 with next song', await p.evaluate(() => window.__jam.mode === 'interlude' && document.getElementById('inter-next').textContent.includes('Warm Embers') && document.getElementById('inter-total').textContent.includes('Concert so far')));
  await p.click('#inter-next-btn');
  check('song 2 is Warm Embers on the same tier', await p.evaluate(() => window.__jam.mode === 'play' && window.__jam.chart.song === 'warm-embers' && window.__jam.chart.difficulty === 'easy'));
  await play(p, 4); // every 4th note missed
  await p.click('#inter-next-btn');
  await play(p, 0);
  const cr = await p.evaluate(() => window.__jam.concertResult);
  check('concert results: combined score is the sum of the 3 songs', await p.evaluate(() => { const r = window.__jam.concertResult; return window.__jam.mode === 'results' && r.songs.length === 3 && r.score === r.songs.reduce((a, s) => a + s.score, 0) && document.getElementById('con-score').textContent.includes(String(r.score)); }));
  check('concert rank from combined accuracy (A or S) and shown', ['S', 'A'].includes(cr.rank) && (await p.evaluate(() => document.getElementById('con-rank').textContent)) === cr.rank && cr.accuracy < 1 && cr.accuracy > 0.85);
  const saved = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
  check('concert best saved additively; song bests kept', saved.concert && saved.concert.easy.score === cr.score && saved.concert.plays === 1 && saved.best['moth-parade'] && saved.v === 1);
  check('each song also counted for its own stars', saved.best['moth-parade'].easy.stars === 3 && saved.best['warm-embers'].easy.score >= 5000);
  check('3 per-song lines on the concert results', await p.evaluate(() => document.querySelectorAll('#con-songs .cline').length === 3));
  check('fits the phone width', await p.evaluate(() => document.documentElement.scrollWidth <= 390));
  await p.click('#to-menu');
  check('menu shows the concert best', await p.evaluate(() => document.getElementById('concert-info').textContent.includes('Easy ' + window.__jam.save.concert.easy.score)));
  check('no console errors (full concert)', d.errors.length === 0, d.errors.join('|'));
  await d.ctx.close();

  // ---- quit mid-concert: no concert saved, determinism ----
  d = await open(browser, SEED); p = d.page;
  await p.evaluate(() => window.__jam.startConcert(['warm-embers', 'lantern-shuffle', 'moth-parade'], 'easy'));
  const before = await p.evaluate(() => JSON.stringify(window.__jam.chart.notes.slice(0, 20)));
  await play(p, 0);
  await p.click('#inter-quit');
  check('quitting mid-concert returns to songs and records no concert', await p.evaluate(() => window.__jam.mode === 'menu' && window.__jam.concert === null && !('concert' in window.__jam.save)));
  await p.evaluate(() => window.__jam.startConcert(['warm-embers', 'lantern-shuffle', 'moth-parade'], 'easy'));
  check('concert charts are deterministic (same chart again)', (await p.evaluate(() => JSON.stringify(window.__jam.chart.notes.slice(0, 20)))) === before);
  check('no console errors (quit)', d.errors.length === 0, d.errors.join('|'));
  await d.ctx.close();

  // ---- corrupt save recovery ----
  for (const bad of ['{not json', JSON.stringify({ v: 1, concert: { plays: 'x', easy: { score: 1e15, rank: 'Z' } }, prefs: 7, best: 5 }), JSON.stringify([1, 2])]) {
    d = await open(browser, bad); p = d.page;
    const ok = await p.evaluate(() => { const s = window.__jam.save; return window.__jam.mode === 'menu' && s.v === 1 && s.unlocked.join() === 'warm-embers' && (!s.concert || !s.concert.easy || s.concert.easy.score <= 3 * 999999) && document.getElementById('btn-concert').disabled; });
    check('corrupt save recovers to a clean menu: ' + bad.slice(0, 24), ok);
    check('no console errors (corrupt save)', d.errors.length === 0, d.errors.join('|'));
    await d.ctx.close();
  }
  await browser.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exitCode = failed ? 1 : 0;
})();
