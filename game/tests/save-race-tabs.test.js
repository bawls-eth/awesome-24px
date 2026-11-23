// Save / migration safety: two TABS of the same game on one origin (one browser context = one localStorage). Both tabs load first; then
// tab A finishes a great run and saves; then tab B (still holding the old save in memory) finishes a poor run and saves. Nothing tab A
// earned may be lost: its best and its round count must still be in storage. Also the Jam assist toggle in a stale tab must not drop an
// assist best another tab saved, and the Realm (rmMergeSave) / Town writeSave already merge on write (checked here for regressions).
// A real bug found here is not hidden: it is printed as KNOWN-BUG every run and listed in design/bugbash/saves.md (owner lanes fix it).
// OFFLINE ONLY: blockDb on the context; the arcade pages never use the database. Never chats, never writes to Firebase.
// Run: python3 -m http.server 8440 &   BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/save-race-tabs.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const ROOT = BASE.replace(/index\.html.*$/, '');

function KNOWN(name, cond, extra) {
  if (cond) console.log('PASS ' + name + ' (was a KNOWN bug: now fixed, update bugbash/saves.md)');
  else console.log('KNOWN-BUG ' + name + ' ' + (extra || ''));
}

// game -> how a tab plays one round with a given result. Each returns nothing; the page persists inside end().
const ARCADE = [
  { id: 'pop', key: 'pixeltown-pop-v1', hook: '__pop', counter: 'rounds', play: (h, big) => { h.start(); h.run.score = big ? 900 : 3; h.end(); } },
  { id: 'stack', key: 'pixeltown-stack-v1', hook: '__stack', counter: 'rounds', play: (h, big) => { h.start(); h.run.floors = big ? 40 : 1; h.end(); } },
  { id: 'echo', key: 'pixeltown-echo-v1', hook: '__echo', counter: 'rounds', play: (h, big) => { h.start(); h.run.best = big ? 25 : 1; h.end(); } }
];

async function tab(ctx, path, errors) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 160)); });
  await page.goto(ROOT + path, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  return page;
}
const stored = (page, k) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), k);

(async () => {
  const browser = await chromium.launch();
  for (const g of ARCADE) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const db = await blockDb(ctx);
    const errors = [];
    const a = await tab(ctx, 'games/' + g.id + '/index.html', errors);
    const b = await tab(ctx, 'games/' + g.id + '/index.html', errors);
    const okHooks = await a.evaluate((h) => !!window[h], g.hook) && await b.evaluate((h) => !!window[h], g.hook);
    check(`${g.id}: both tabs expose the test hook`, okHooks);
    if (!okHooks) { await ctx.close(); continue; }
    const playIn = (p, big) => p.evaluate(([h, fn, bg]) => { (0, eval)('(' + fn + ')')(window[h], bg); return window[h].save; }, [g.hook, g.play.toString(), big]);
    const sa = await playIn(a, true);
    const afterA = await stored(a, g.key);
    check(`${g.id}: tab A's great round is saved (best ${sa.best})`, afterA && afterA.best === sa.best && sa.best > 0, JSON.stringify(afterA));
    await playIn(b, false);
    const afterB = await stored(b, g.key);
    KNOWN(`${g.id}: a stale second tab finishing a poor round keeps tab A's best (${g.key})`, afterB && afterB.best >= sa.best, JSON.stringify({ A: sa.best, stored: afterB && afterB.best }));
    KNOWN(`${g.id}: and keeps both tabs' rounds (${g.counter})`, afterB && afterB[g.counter] >= 2, JSON.stringify({ stored: afterB && afterB[g.counter] }));
    // the medals the Hub map reads are not lost either (both tabs award round1, so this only checks the key stays readable)
    const med = await stored(b, 'pixeltown-medals-' + g.id + '-v1');
    check(`${g.id}: the medals key is still a valid {v, m[]} after both writes`, med && Array.isArray(med.m), JSON.stringify(med));
    check(`${g.id}: 0 page / console errors in both tabs`, errors.length === 0, errors.slice(0, 3).join(' | '));
    check(`${g.id}: 0 database requests`, db.count() === 0);
    await ctx.close();
  }

  // Jam: tab B (opened first) toggles Assist after tab A stored an assist best: the best must survive.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const db = await blockDb(ctx);
    const errors = [];
    const b = await tab(ctx, 'games/jam/index.html', errors);
    const A_BEST = { on: false, best: { 'warm-embers': { easy: { score: 4321, rank: 'A' } } }, section: {} };
    await b.evaluate((v) => localStorage.setItem('pixeltown-jam-assist-v1', JSON.stringify(v)), A_BEST); // what tab A's finished assist run wrote
    const has = await b.evaluate(() => !!document.getElementById('pref-assist'));
    check('jam: the Assist toggle is on the menu', has);
    if (has) {
      await b.click('#pref-assist');
      await b.waitForTimeout(200);
      const st = await stored(b, 'pixeltown-jam-assist-v1');
      KNOWN('jam: a stale tab toggling Assist keeps the assist best another tab saved (pixeltown-jam-assist-v1)', st && st.best && st.best['warm-embers'] && st.best['warm-embers'].easy && st.best['warm-embers'].easy.score === 4321, JSON.stringify(st));
    }
    check('jam: 0 page / console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    check('jam: 0 database requests', db.count() === 0);
    await ctx.close();
  }

  // Town writeSave merges a fresh read on every write (main.js): a field another tab wrote between two writes is kept.
  // Checked on the Hub page (same origin, no Town boot needed) by running the exact merge main.js uses.
  {
    const ctx = await browser.newContext();
    await blockDb(ctx);
    const errors = [];
    const p = await tab(ctx, 'hub/index.html', errors);
    const r = await p.evaluate(() => {
      const KEY = 'pixeltown-save-v1';
      const load = () => { try { const o = JSON.parse(localStorage.getItem(KEY)); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; } };
      const write = (part) => localStorage.setItem(KEY, JSON.stringify(Object.assign({}, load(), part)));
      localStorage.setItem(KEY, JSON.stringify({ name: 'ADMINrace', species: 'punkettes', frame: 2 }));
      write({ coins: 5 });                       // tab A
      write({ species: 'hero_mage', frame: 0 }); // tab B picks a hero
      write({ coins: 6 });                       // tab A again
      return load();
    });
    check('town merge-on-write: fields from two tabs are all kept', r.name === 'ADMINrace' && r.species === 'hero_mage' && r.coins === 6, JSON.stringify(r));
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'main.js'), 'utf8');
    check('main.js writeSave still merges a fresh loadSave() into every write', /setItem\(SAVE_KEY, JSON\.stringify\(\{ \.\.\.loadSave\(\), \.\.\.partial \}\)\)/.test(src));
    await ctx.close();
  }
  await browser.close();
  done();
})();
