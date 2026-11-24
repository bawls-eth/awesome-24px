// ID-13 wiring (cycle 3 S): the first world boss of a zone rolls its bag with the MMZones FIRST_KILL_BAG_FLOOR; the Realm save keeps an additive
// bitmask `zk` (bit z = first boss of zone z already died). Node: the cleaner keeps 0..15 ints only (hostile values leave the key out), the
// Backup bundle round-trips the key. Browser (Realm world, blockDb, db.attempts() === 0): the first boss bag of a zone is floored (>= pink for zone 1; world bosses sit in zones 1..3) and sets
// bit 0 once; after a reload the same boss rolls without the floor and zk is unchanged; a Trial-of-Six style boss roll (rollFor with src 'boss',
// the path rushKilled uses) neither reads nor sets zk; a stale tab's write keeps the bit (union merge).
const B = require('../shared/mm-backup.js');
const { check, done, blockDb } = require('./helpers');

// ---- node: backup keeps zk inside the realm save (the key is not new, so it uses the existing realm cleaner) ----
{
  const m = { 'pixeltown-realm-v1': JSON.stringify({ v: 1, seed: '12345', zk: 5 }) };
  const store = { _m: m, getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, key: (i) => Object.keys(m)[i] || null, get length() { return Object.keys(m).length; } };
  const bun = B.bundle(store);
  const pl = B.plan(JSON.parse(JSON.stringify(bun)));
  check('node: Backup bundle + plan keep zk in the realm save', typeof bun.keys['pixeltown-realm-v1'] === 'string' && pl.ok && JSON.parse(pl.entries['pixeltown-realm-v1']).zk === 5, JSON.stringify(pl.entries || pl));
}
if (process.env.NODE_ONLY) { done(); return; }

const { chromium } = require('playwright');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&heropick=0&tutorial=0&seed=12345&qdate=2030-05-01';
const SAVE = { realm: { level: 4, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 } } };
const E = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world, ${JSON.stringify(arg === undefined ? null : arg)})`);
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const realm = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('pixeltown-realm-v1') || 'null'));

async function load(page) {
  await page.goto(WORLD);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
  await E(page, (a) => { a.player.iframes = 1e9; a._hitPlayer = () => {}; });
}
async function killBoss(page, idx) {
  await E(page, (a, w, i) => { const s = w.bossSites()[i]; a.player.x = (s.x + 0.5) * w.TILE; a.player.y = (s.y + 2.5) * w.TILE; }, idx);
  for (let i = 0; i < 40; i++) {
    const got = await E(page, (a, w, k) => {
      const n0 = w.kills(); w.bossTick(); const e = w.bossEntity(k); if (e && e.active) { e.invuln = 0; a._hitEnemy(e, 1e9); }
      if (w.kills() === n0) return null; const L = w.lastDrops(); const d = L[L.length - 1]; return d && d.boss && d.src === 'boss' ? d : null;
    }, idx);
    if (got) return got;
    await frames(page, 5);
  }
  return null;
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await blockDb(ctx);
  await ctx.route('**/game/index.html*', (rt) => rt.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((a) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', a); }, JSON.stringify(SAVE));
  await load(page);

  // cleaner: hostile zk values never reach storage; a valid one is kept as is
  const cl = await page.evaluate(() => {
    const out = {};
    [['str', '3'], ['neg', -1], ['frac', 2.5], ['big', 16], ['ok', 9], ['obj', { a: 1 }], ['zero', 0]].forEach(([k, v]) => {
      localStorage.setItem('pixeltown-realm-v1', JSON.stringify({ v: 1, seed: '12345', zk: v }));
      out[k] = 'zk' in (window.__mm.world.debugCleanSave ? window.__mm.world.debugCleanSave() : {}) ? window.__mm.world.debugCleanSave().zk : null;
    });
    localStorage.setItem('pixeltown-realm-v1', JSON.stringify({ v: 1, seed: '12345' }));
    return out;
  });
  check('cleaner: zk keeps a 0..15 int (9), drops string / negative / fraction / object, drops 0 and 16 (out of 4 bits)', cl.ok === 9 && cl.str === null && cl.neg === null && cl.frac === null && cl.obj === null && cl.big === null && cl.zero === null, JSON.stringify(cl));
  await load(page);

  const sites = await E(page, (a, w) => w.bossSites());
  // world bosses sit in zones 1..3 (seed 12345: [1,1,2,2,2,3,3,3]); the lowest-zone boss is the first one a new hero meets
  const low = sites.slice().sort((p, q) => p.zone - q.zone)[0];
  const FLOOR = await page.evaluate(() => window.MMZones.TABLES.FIRST_KILL_BAG_FLOOR.slice());
  check('the world has boss sites and the floor table is pink, pink, purple, cyan', !!low && JSON.stringify(FLOOR) === '[1,1,2,3]', JSON.stringify(sites.map((s) => s.zone)));
  const si = low ? low.i : 0; const zb = low ? 1 << low.zone : 0; const fl = low ? FLOOR[low.zone] : 9;
  check('a fresh save has no zk key', !('zk' in ((await realm(page)) || {})));

  // a Trial-of-Six style roll (rollFor directly, src 'boss', zone 3: the rush path) leaves zk alone
  const trial = await E(page, (a, w) => { w.setDropAll(true); const d = w.testDrop({ zone: 3, tier: 3, boss: true, src: 'boss', bossId: 'x' }, 'rush1:0'); return d; });
  await E(page, (a, w) => w.forceSave && w.forceSave());
  check('a Trial-style boss roll is not floored and sets no zk bit', !!trial && trial.firstKill === false && !(((await realm(page)) || {}).zk), JSON.stringify(trial && { t: trial.tierIndex, fk: trial.firstKill }));

  const first = await killBoss(page, si);
  const r1 = await realm(page);
  check('first boss of its zone (lowest zone): the bag rolls with the floor and is at least that floor (pink for zone 1)', !!first && first.firstKill === true && first.tierIndex >= fl && fl >= 1 && first.zone === low.zone, JSON.stringify(first && { t: first.tierIndex, tier: first.tier, fk: first.firstKill, z: first.zone }));
  check('the first kill sets exactly that zone\'s bit in the saved zk', !!r1 && r1.zk === zb, JSON.stringify(r1 && r1.zk));

  // a stale tab that never saw the kill writes its old copy: the bit survives (union merge)
  const stale = await page.evaluate(() => { const o = JSON.parse(localStorage.getItem('pixeltown-realm-v1')); return o; });
  await load(page);
  const second = await killBoss(page, si);
  const r2 = await realm(page);
  check('after a reload the same boss rolls WITHOUT the floor', !!second && second.firstKill === false && second.zone === low.zone, JSON.stringify(second && { t: second.tierIndex, fk: second.firstKill }));
  check('zk is unchanged by the second kill', !!r2 && r2.zk === zb, JSON.stringify(r2 && r2.zk));
  const merged = await page.evaluate((s) => { delete s.zk; localStorage.setItem('pixeltown-realm-v1', JSON.stringify(Object.assign({}, s, { zk: 1 }))); return true; }, stale);
  await E(page, (a, w) => w.forceSave && w.forceSave());
  const r3 = await realm(page);
  check('merge: a write while storage holds only bit 0 (another tab) keeps the union (no bit is ever lost)', merged && !!r3 && r3.zk === (zb | 1), JSON.stringify(r3 && r3.zk));

  check('no page errors', errors.length === 0, errors.join(' | '));
  check('0 DB requests (Firebase blocked)', db.attempts() === 0);
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
