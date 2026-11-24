// Cycle 3 (L review of ID-04): the Realm notebook with storage that cannot be written (a full quota, a private window, a blocked key).
// The page's in-memory notebook was replaced by "what is on disk" after every new page, so with a refused write each new page wiped the
// pages met earlier in the visit: beating creature A, then B, then A again showed "New notebook page: A" a second time (and again after
// every other new creature), the button count fell back, and the Notebook panel listed only the latest page.
// Now a new page is merged with the disk copy (another tab's pages are still picked up). Realm world, blockDb, db.attempts() === 0.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc3-notebook-blocked.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const ORIGIN = new URL(BASE).origin;
const KEY = 'pixeltown-notebook-v1';
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&heropick=0&tutorial=0&seed=12345&qdate=2030-05-01';
const SAVE = { realm: { level: 4, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 } } };
const A = 'kill:aimed:sand_crab@0', B = 'kill:ring:puffcap@0', C = 'boss:kraken@3', D = 'tame:reef_ray', E0 = 'clear:crypt';

async function open(browser, mode, store) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await blockDb(ctx);
  await ctx.route('**/game/index.html*', (rt) => rt.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((a) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', a[0]); if (a[1]) localStorage.setItem('pixeltown-notebook-v1', a[1]); }, [JSON.stringify(SAVE), store || null]);
  // the notebook key refuses every write (quota), or also every read (blocked): only this key, so the rest of the page works as usual
  await page.addInitScript((m) => {
    if (m === 'none') return;
    const set0 = Storage.prototype.setItem, get0 = Storage.prototype.getItem;
    window.__nbWrites = 0; window.__nbRaw = () => get0.call(localStorage, 'pixeltown-notebook-v1');
    Storage.prototype.setItem = function (k, v) { if (k === 'pixeltown-notebook-v1') { window.__nbWrites++; throw new DOMException('quota', 'QuotaExceededError'); } return set0.call(this, k, v); };
    if (m === 'blocked') Storage.prototype.getItem = function (k) { if (k === 'pixeltown-notebook-v1') throw new DOMException('blocked', 'SecurityError'); return get0.call(this, k); };
  }, mode);
  await page.goto(WORLD);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
  return { ctx, page, errors, db };
}
const meets = (page, ids) => page.evaluate((list) => { const nb = window.__mm.world.notebook; return { got: list.map((id) => nb.meet(id, id)), n: nb.newThisVisit(), save: Object.keys(nb.save().e).sort(), writes: window.__nbWrites || 0, raw: window.__nbRaw ? window.__nbRaw() : null }; }, ids);

(async () => {
  const browser = await chromium.launch();
  for (const mode of ['quota', 'blocked']) {
    const seeded = mode === 'quota' ? JSON.stringify({ v: 1, e: { [D]: 5 } }) : null;
    const T = await open(browser, mode, seeded);
    const r = await meets(T.page, [A, B, A, C, B, A]);
    check(mode + ': A, B, A, C, B, A gives new, new, known, new, known, known (a refused write never repeats a page)', JSON.stringify(r.got) === '[true,true,false,true,false,false]', JSON.stringify(r.got));
    check(mode + ': 3 new pages this visit, not one per repeat', r.n === 3, String(r.n));
    const want = (mode === 'quota' ? [A, B, C, D] : [A, B, C]).sort();
    check(mode + ': the visit keeps every page it met' + (mode === 'quota' ? ' and the page that was on disk' : ''), JSON.stringify(r.save) === JSON.stringify(want), JSON.stringify(r.save));
    check(mode + ': the write was really refused each time (3 tries, the disk copy unchanged)', r.writes === 3 && r.raw === seeded, r.writes + ' ' + r.raw);
    // the Nexus button and panel show the same pages
    const ui = await T.page.evaluate(() => { const w = window.__mm.world; w.nexus.open(); const b = document.getElementById('rw-nx-notebook-btn'); const t = b ? b.textContent : ''; w.notebook.open(); const li = Array.from(document.querySelectorAll('#rw-nx-notebook li[data-page]')).map((x) => x.dataset.page).sort(); w.notebook.close(); return { t, li }; });
    check(mode + ': the Notebook button counts them (' + want.length + ') and the panel lists them all', ui.t === 'Notebook (' + want.length + ')' && JSON.stringify(ui.li) === JSON.stringify(want), JSON.stringify(ui));
    check(mode + ': no page errors, 0 DB requests', !T.errors.length && T.db.attempts() === 0, JSON.stringify(T.errors.slice(0, 3)));
    await T.ctx.close();
  }
  { // writable storage: another tab's page is still picked up, nothing is announced twice, the disk holds the union
    const T = await open(browser, 'none', null);
    const r1 = await meets(T.page, [A]);
    await T.page.evaluate((a) => { const o = JSON.parse(localStorage.getItem(a[0])); o.e[a[1]] = 7; localStorage.setItem(a[0], JSON.stringify(o)); }, [KEY, E0]); // "the dungeon tab"
    const r2 = await meets(T.page, [B, A, E0]);
    const disk = await T.page.evaluate((k) => Object.keys(JSON.parse(localStorage.getItem(k)).e).sort(), KEY);
    check('writable: A new; then B new, A known, and the other tab\'s page known (not announced as new)', r1.got[0] === true && JSON.stringify(r2.got) === '[true,false,false]' && r2.n === 2, JSON.stringify([r1.got, r2.got, r2.n]));
    check('writable: memory and disk both hold the union of the two tabs', JSON.stringify(r2.save) === JSON.stringify([A, B, E0].sort()) && JSON.stringify(disk) === JSON.stringify([A, B, E0].sort()), JSON.stringify([r2.save, disk]));
    check('writable: no page errors, 0 DB requests', !T.errors.length && T.db.attempts() === 0, JSON.stringify(T.errors.slice(0, 3)));
    await T.ctx.close();
  }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
