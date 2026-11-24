// Cycle 4 (L review of ID-13): the first-kill bag floor is "once per hero per zone" (Realm save bitmask `zk`). The kill read the bit only
// from this page's memory, so a second tab opened before the first kill (zk = 0 in memory) gave the floor again: once per open tab.
// The write merged the bit, but only after the floored bag had dropped. Now the boss kill reads the stored bit first.
// Realm world, one page: "the other tab's kill" is its write to storage (the zone's bit set under this page's feet).
// blockDb, db.attempts() === 0.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc4-zk-stale-tab.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&heropick=0&tutorial=0&seed=12345&qdate=2030-05-01';
const SAVE = { realm: { level: 4, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 } } };
const E = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world, ${JSON.stringify(arg === undefined ? null : arg)})`);
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const realm = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('pixeltown-realm-v1') || 'null'));

async function load(page) {
  await page.goto(WORLD);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 60000 });
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
  await E(page, (a, w) => w.forceSave && w.forceSave());
  const sites = await E(page, (a, w) => w.bossSites());
  const byZone = sites.slice().sort((p, q) => p.zone - q.zone);
  const A = byZone[0], B = byZone[byZone.length - 1]; // two bosses in different zones (seed 12345: zones 1 and 3)
  check('the world has bosses in two different zones', !!A && !!B && A.zone !== B.zone, JSON.stringify(sites.map((s) => s.zone)));
  const r0 = (await realm(page)) || {};
  check('this page starts with no zk bit, in memory and in storage', !r0.zk, JSON.stringify(r0.zk));

  // the other tab kills zone A's first boss: storage now holds the bit, this page's memory does not
  await page.evaluate((bit) => { const o = JSON.parse(localStorage.getItem('pixeltown-realm-v1')) || { v: 1, seed: '12345' }; o.zk = (o.zk | 0) | bit; localStorage.setItem('pixeltown-realm-v1', JSON.stringify(o)); }, 1 << A.zone);
  const second = await killBoss(page, A.i);
  check('STALE TAB: the zone\'s first-kill floor was spent in another tab, so this tab\'s kill of that zone\'s boss is NOT a first kill', !!second && second.zone === A.zone && second.firstKill === false, JSON.stringify(second && { z: second.zone, fk: second.firstKill, t: second.tierIndex }));
  const r1 = await realm(page);
  check('the stored zk still holds exactly that bit', !!r1 && r1.zk === (1 << A.zone), JSON.stringify(r1 && r1.zk));

  // a zone nobody has cleared is still a first kill on this (stale) tab, and both bits end up stored
  const other = await killBoss(page, B.i);
  const FLOOR = await page.evaluate(() => window.MMZones.TABLES.FIRST_KILL_BAG_FLOOR.slice());
  check('a zone not cleared in any tab still gets its first-kill floor here', !!other && other.zone === B.zone && other.firstKill === true && other.tierIndex >= FLOOR[B.zone], JSON.stringify(other && { z: other.zone, fk: other.firstKill, t: other.tierIndex }));
  const r2 = await realm(page);
  check('zk holds both zones\' bits (union)', !!r2 && r2.zk === ((1 << A.zone) | (1 << B.zone)), JSON.stringify(r2 && r2.zk));

  // hostile stored values never turn into "everything spent" (-1 & 15 = 15) or throw
  for (const bad of [-1, 99, '7', 2.5, null, { a: 1 }]) {
    await page.evaluate((v) => { const o = JSON.parse(localStorage.getItem('pixeltown-realm-v1')); o.zk = v; localStorage.setItem('pixeltown-realm-v1', JSON.stringify(o)); }, bad);
  }
  await page.evaluate(() => { const o = JSON.parse(localStorage.getItem('pixeltown-realm-v1')); o.zk = -1; localStorage.setItem('pixeltown-realm-v1', JSON.stringify(o)); });
  await E(page, (a, w) => w.forceSave && w.forceSave());
  const r3 = await realm(page);
  check('a hostile stored zk (-1) is not read as "all zones spent": the page keeps its own two bits', !!r3 && r3.zk === ((1 << A.zone) | (1 << B.zone)), JSON.stringify(r3 && r3.zk));

  check('no page errors', errors.length === 0, errors.join(' | '));
  check('0 DB requests (Firebase blocked)', db.attempts() === 0, String(db.attempts()));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
