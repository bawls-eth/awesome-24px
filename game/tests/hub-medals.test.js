// Hub medal strips fed by each game's own summary key (read-only on the hub). Serve the repo root first:
//   python3 -m http.server 8594 &
// Run: BASE=http://localhost:8594/game/index.html NODE_PATH=$(npm root -g) node game/tests/hub-medals.test.js
// Also checks the one-line writers in Angler, Jam and Stalk. No Firebase, no external network.
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const HUB = ORIGIN + '/game/hub/index.html';
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const key = (g) => 'pixeltown-medals-' + g + '-v1';
const all = [];
// A real Jam save (pixeltown-jam-v1): 4 songs with 3 stars each plus a long Hard combo (full combo).
const JS = require('../shared/mm-jam-songs.js');
const jamSave = (stars, fc) => {
  const best = {}; JS.SONGS.slice(0, stars ? 4 : 0).forEach((so) => { best[so.id] = { normal: { score: 5000, stars, rank: 'S', combo: 40 }, hard: { score: 5000, stars, rank: 'S', combo: 40 } }; });
  return JSON.stringify({ v: 1, best, plays: 5, fullCombo: !!fc });
};
const at = (seed, node) => Object.assign({}, seed, { 'pixeltown-hub-v1': JSON.stringify({ v: 1, at: node }) }); // start standing on the node so tapping it opens the card

async function open(browser, url, seed, opts) {
  const ctx = await browser.newContext(opts || { viewport: { width: 1100, height: 760 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript((s) => { if (sessionStorage.seeded) return; sessionStorage.seeded = '1'; Object.keys(s).forEach((k) => localStorage.setItem(k, s[k])); }, seed || {});
  await page.goto(url);
  if (url === HUB) await page.waitForFunction(() => window.__hub);
  await page.waitForTimeout(250);
  const o = { ctx, page, errors }; all.push(o); return o;
}
const idle = (page) => page.waitForFunction(() => !window.__hub.walking, null, { timeout: 8000 });
async function strip(page, nodeId) {
  const p = await page.evaluate((i) => window.__hub.nodeClient(i), nodeId);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(100);
  await idle(page);
  await page.waitForFunction(() => !document.getElementById('card').hidden, null, { timeout: 8000 }).catch(() => {});
  return page.evaluate(() => ({
    hidden: document.getElementById('card-ach').hidden, shown: !document.getElementById('card').hidden,
    on: [...document.querySelectorAll('#card-ach li.on')].map((l) => l.dataset.medal), all: [...document.querySelectorAll('#card-ach li')].map((l) => l.dataset.medal),
  }));
}

(async () => {
  const browser = await chromium.launch();
  const seed = {};
  seed[key('angler')] = JSON.stringify({ v: 1, m: ['catch1', 'boss1'] });
  seed['pixeltown-jam-v1'] = jamSave(3, true);
  seed[key('stalk')] = JSON.stringify({ v: 1, m: ['bronze'] });
  seed[key('deepdelve')] = JSON.stringify({ v: 1, m: ['depth20', 'wyrm', 'torches10'] });

  // 1. seeded summaries show the right medals via the read-only hook
  const H = await open(browser, HUB, at(seed, 'w3-deepdelve'));
  const a = await H.page.evaluate(() => window.__hub.achievements());
  check('achievements() reads each game key and keeps only its medals', JSON.stringify(a) === JSON.stringify({ angler: ['catch1', 'boss1'], jam: ['star1', 'stars12', 'fullcombo'], stalk: ['bronze'], deepdelve: ['depth20', 'wyrm', 'torches10'] }), JSON.stringify(a));

  // 2. the node card shows the strip with the right chips lit (try Deepdelve and Stalk)
  const dd = await strip(H.page, 'w3-deepdelve');
  check('Deepdelve card strip lights depth20, wyrm and torches10 of its 8 medals', dd.shown && !dd.hidden && dd.all.length === 8 && JSON.stringify(dd.on) === JSON.stringify(['depth20', 'wyrm', 'torches10']), JSON.stringify(dd));
  const txt = await H.page.evaluate(() => document.getElementById('card-ach').textContent);
  check('chips are plain text names', /Rock Wyrm/.test(txt) && !/</.test(txt), txt);
  const hooks = await H.page.evaluate(() => Object.keys(window.__hub));
  check('hub exposes only a read hook for medals', hooks.includes('achievements') && !hooks.some((k) => /set|write|award/i.test(k)), hooks.join(','));

  // 3. corrupt and hostile values are ignored
  const bad = {};
  bad[key('angler')] = '{"v":1,"m":["<img src=x onerror=alert(1)>","catch1","catch1","nope",5,null,{"a":1}]}';
  bad['pixeltown-jam-v1'] = 'not json {{'; bad[key('jam')] = JSON.stringify({ v: 1, m: ['star1'] });
  bad[key('stalk')] = '["bronze"]';
  bad[key('deepdelve')] = JSON.stringify({ v: 1, m: 'depth20', x: ['wyrm'] });
  const B = await open(browser, HUB, at(bad, 'w4-angler'));
  const ab = await B.page.evaluate(() => window.__hub.achievements());
  check('hostile ids, duplicates and non-arrays are dropped; corrupt JSON shows nothing', JSON.stringify(ab) === JSON.stringify({ angler: ['catch1'], jam: [], stalk: [], deepdelve: [] }), JSON.stringify(ab));
  const bs = await strip(B.page, 'w4-angler');
  check('corrupt-seeded Angler strip lights only catch1', JSON.stringify(bs.on) === JSON.stringify(['catch1']) && bs.all.length === 3, JSON.stringify(bs));
  const hostile = await B.page.evaluate(() => ({ imgs: document.querySelectorAll('img').length, alerted: !!window.__alerted }));
  check('no injected markup reaches the page', hostile.imgs === 0 && !hostile.alerted, JSON.stringify(hostile));
  const empty = await open(browser, HUB, at({}, 'w5-jam'));
  const e0 = await empty.page.evaluate(() => window.__hub.achievements());
  const cs = await strip(empty.page, 'w5-jam');
  check('with no summaries every strip is empty and nothing is lit', Object.keys(e0).every((g) => e0[g].length === 0) && cs.on.length === 0 && cs.all.length === 3, JSON.stringify([e0, cs]));

  // 4. phone: strip fits, no horizontal scroll
  const P = await open(browser, HUB, at(seed, 'w3-deepdelve'), PHONE);
  const ps = await strip(P.page, 'w3-deepdelve');
  const m = await P.page.evaluate(() => { const c = document.getElementById('card').getBoundingClientRect(); return { cardW: c.width, vw: innerWidth, sw: document.documentElement.scrollWidth, top: c.top, bottom: c.bottom, vh: innerHeight }; });
  check('phone 390x844: strip shown, card fits, no horizontal scroll', ps.shown && ps.on.length === 3 && m.cardW <= m.vw && m.sw <= m.vw && m.top >= 0 && m.bottom <= m.vh + 1, JSON.stringify(m));

  // 5. each game writes its own summary key on load (Angler, Jam, Stalk) and Deepdelve on boot
  for (const g of ['angler', 'stalk']) {
    const G = await open(browser, ORIGIN + '/game/games/' + g + '/index.html?test=1', {});
    const v = await G.page.evaluate((k) => localStorage.getItem(k), key(g));
    let ok = false; try { const o = JSON.parse(v); ok = o.v === 1 && Array.isArray(o.m) && o.m.length === 0; } catch (e) { ok = false; }
    check(g + ' writes its own summary key {"v":1,"m":[]} for a fresh save', ok, String(v));
  }
  const jm = await strip((await open(browser, HUB, at({ 'pixeltown-jam-v1': jamSave(1, false) }, 'w5-jam'))).page, 'w5-jam');
  check('Jam strip is derived from its own validated save (1 star: first star only)', JSON.stringify(jm.on) === JSON.stringify(['star1']) && jm.all.length === 3, JSON.stringify(jm));
  const jb = await strip((await open(browser, HUB, at({ 'pixeltown-jam-v1': '{"best":{"warm-embers":{"easy":{"stars":99999,"score":-5}}},"fullCombo":"yes","plays":"x"}' }, 'w5-jam'))).page, 'w5-jam');
  check('hostile Jam save values are clamped by cleanSave (no fullcombo from a bare flag)', !jb.on.includes('fullcombo') && jb.all.length === 3, JSON.stringify(jb));
  const J = await open(browser, ORIGIN + '/game/games/stalk/index.html?test=1', { 'pixeltown-stalk-v1': JSON.stringify({ medals: { bronze: true, silver: 'yes', gold: false } }) });
  const sv = await J.page.evaluate((k) => localStorage.getItem(k), key('stalk'));
  check('stalk summary lists only strictly earned medals from its save', sv === '{"v":1,"m":["bronze"]}', sv);
  const A2 = await open(browser, ORIGIN + '/game/games/angler/index.html?test=1', { 'pixeltown-angler-v1': JSON.stringify({ caught: { sea_bass: { n: 1, best: 40 } }, bosses: {}, trophies: {} }) });
  const av = await A2.page.evaluate((k) => localStorage.getItem(k), key('angler'));
  check('angler summary reflects a first catch from its journal', av === '{"v":1,"m":["catch1"]}', String(av));

  check('no console errors', all.every((o) => o.errors.length === 0), all.map((o) => o.errors.join(' | ')).filter(Boolean).join(' || '));
  await browser.close();
  done();
})();
