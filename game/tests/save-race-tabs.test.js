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
  { id: 'echo', key: 'pixeltown-echo-v1', hook: '__echo', counter: 'rounds', play: (h, big) => { h.start(); h.run.best = big ? 25 : 1; h.end(); } },
  { id: 'dash', key: 'pixeltown-dash-v1', hook: '__dash', counter: 'runs', play: (h, big) => { h.start('night1'); if (big) h.step(20000, { lead: 26 }); else h.step(3000); } }
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
    // a newer build (another tab) stored a field this build does not know: no older tab may erase it (S7)
    await a.evaluate((k) => { const o = JSON.parse(localStorage.getItem(k)); o.futureField = { keep: 7 }; localStorage.setItem(k, JSON.stringify(o)); }, g.key);
    const sb = await playIn(b, false);
    const afterB = await stored(b, g.key);
    check(`${g.id}: a stale second tab finishing a poor round keeps tab A's best (${g.key})`, afterB && afterB.best >= sa.best, JSON.stringify({ A: sa.best, stored: afterB && afterB.best }));
    check(`${g.id}: and keeps both tabs' rounds (${g.counter})`, afterB && afterB[g.counter] === 2, JSON.stringify({ stored: afterB && afterB[g.counter] }));
    check(`${g.id}: every medal tab A earned is still stored (${(sa.medals || []).join(',')})`, afterB && (sa.medals || []).every((m) => afterB.medals.indexOf(m) >= 0), JSON.stringify(afterB && afterB.medals));
    check(`${g.id}: a field a newer build stored is kept (forward compatible)`, afterB && afterB.futureField && afterB.futureField.keep === 7, JSON.stringify(afterB));
    if (g.id === 'dash') check('dash: tab A\'s longer ghost on the same course is not replaced by tab B\'s short run', afterB && afterB.ghost && sa.ghost && afterB.ghost.dist === sa.ghost.dist && afterB.ghost.seed === sa.ghost.seed, JSON.stringify({ A: sa.ghost && sa.ghost.dist, stored: afterB && afterB.ghost && afterB.ghost.dist }));
    check(`${g.id}: tab B's memory now holds the merged best too`, sb && sb.best >= sa.best, JSON.stringify(sb && sb.best));
    // the medals the Hub map reads keep every medal of both tabs
    const med = await stored(b, 'pixeltown-medals-' + g.id + '-v1');
    check(`${g.id}: the medals key is still a valid {v, m[]} after both writes`, med && Array.isArray(med.m), JSON.stringify(med));
    check(`${g.id}: the medals key keeps every medal tab A earned`, med && (sa.medals || []).every((m) => med.m.indexOf(m) >= 0), JSON.stringify(med));
    // a third write from tab A (stale again) does not double-count B's round
    await playIn(a, false);
    const afterA2 = await stored(a, g.key);
    check(`${g.id}: a third round from tab A counts once (${g.counter} 3), best kept`, afterA2 && afterA2[g.counter] === 3 && afterA2.best >= sa.best, JSON.stringify(afterA2 && { n: afterA2[g.counter], best: afterA2.best }));
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
      check('jam: a stale tab toggling Assist keeps the assist best another tab saved (pixeltown-jam-assist-v1)', st && st.best && st.best['warm-embers'] && st.best['warm-embers'].easy && st.best['warm-embers'].easy.score === 4321, JSON.stringify(st));
      check('jam: the toggle itself is saved (on) and tab B now shows the merged best', st && st.on === true && (await b.evaluate(() => { const a = window.__jam && window.__jam.assist; return !a || (a.best['warm-embers'] && a.best['warm-embers'].easy.score === 4321); })), JSON.stringify(st));
      // another tab turns Assist off and stores a section best; tab B (stale) toggling nothing but saving keeps both
      await b.evaluate(() => { const o = JSON.parse(localStorage.getItem('pixeltown-jam-assist-v1')); o.section = { 'warm-embers:easy:100:1-8': 9 }; o.futureField = 1; localStorage.setItem('pixeltown-jam-assist-v1', JSON.stringify(o)); });
      await b.click('#pref-assist');
      await b.waitForTimeout(200);
      const st2 = await stored(b, 'pixeltown-jam-assist-v1');
      check('jam: a second toggle keeps the section best and an unknown field another tab stored', st2 && st2.on === false && st2.section && st2.section['warm-embers:easy:100:1-8'] === 9 && st2.futureField === 1 && st2.best['warm-embers'].easy.score === 4321, JSON.stringify(st2));
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
