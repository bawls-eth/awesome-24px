// FZ I6-dust + UR (save-uid): dust spends are transactions and new items carry a `u` tag. Two tabs of one profile (same localStorage):
//  - tab A reforges with 50 of the 60 dust; a STALE tab B (still showing 60) asks for a second 50-dust reforge: refused (it resyncs first), and
//    storage keeps the exact 10 dust (before: B charged it too and the merge floored 10 + (10 - 60) at 0, i.e. 40 dust for free)
//  - the same for a Nexus vendor buy (dust for exactly one buy, two stale tabs)
//  - a reforge whose write FAILS while storage holds the realm is undone: nothing charged, the old entry back, storage unchanged; the retry works
//  - reforged / bought items carry a valid integer tag `u` that survives a reload (old builds drop it, uids are unchanged)
// Offline: blockDb + every WebSocket closed, no chat, nothing written to Firebase.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/gear-dust-txn.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const MAZE = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1&forge=1';
const SAVE = 'pixeltown-save-v1', MM = 'pixeltown-mm-v1', ACTIVE = 'pixeltown-mm-active-v1';
const hero = (id, cls, level) => ({ id, name: cls, cls, level, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] });
const prof = (heroes) => ({ v: 1, heroes, stash: new Array(16).fill(null), fame: 0, mode: 'classic', hall: [], migratedFrom: null });
const realm = (extra) => Object.assign({ shards: 100, bestWave: 0, kills: 0, deaths: 0, kb: { spiral: 0, aimed: 0, ring: 0, drifter: 0, boss: 0 }, bossBestT: 0, level: 20, xp: 0,
  items: [{ n: 1, id: 'sparkwand', r: 1, t: 8, a: 12345 }, { n: 2, id: 'sparkwand', r: 1, t: 8, a: 777 }, { n: 7, id: 'heartcharm', r: 0 }],
  nextUid: 100, eq: { weapon: 1 } }, extra || {});

async function ctxOf(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const db = await blockDb(ctx);
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
  await ctx.routeWebSocket(/.*/, (ws) => ws.close()); // never reach the live DB
  return { ctx, db };
}
async function seed(ctx, rm) {
  const p = await ctx.newPage();
  await p.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await p.evaluate(([k1, pr, k2, a, k3, s]) => { localStorage.clear(); localStorage.setItem(k1, JSON.stringify(pr)); localStorage.setItem(k2, a); localStorage.setItem(k3, s); },
    [MM, prof([hero('h-1', 'bruiser', 20)]), ACTIVE, JSON.stringify({ v: 1, heroId: 'h-1' }), SAVE, JSON.stringify({ realm: rm })]);
  await p.close();
}
async function go(ctx, errors) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(MAZE);
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active, null, { timeout: 20000 });
  await page.evaluate(() => { const a = window.__mm.arena; a.state = 'play'; a.eBullets.forEach((b) => { b.active = false; }); a.enemies.forEach((e) => { e.active = false; }); a._calcStats(); a.setPaused(true); });
  return page;
}
const stored = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)).realm, SAVE);
// A stale tab: the storage event of the other tab's write has not reached it yet (a race window). B's in-memory save and merge bases are
// put back to what they were before A wrote, so B acts on 60 dust exactly like a tab whose event is late.
const stash = () => { const a = window.__mm.arena; window.__stale = { save: JSON.stringify(a.save), b: [a._baseShards, a._baseDust, JSON.stringify(a._baseGp)], k: [...a._known] }; };
const unstash = () => { const a = window.__mm.arena, s = window.__stale; a._adopt(JSON.parse(s.save)); a._baseShards = s.b[0]; a._baseDust = s.b[1]; a._baseGp = JSON.parse(s.b[2]); a._known = new Set(s.k); return a.save.dust; };
const goodTag = (u) => Number.isInteger(u) && u > 0 && u <= 2147483647;

(async () => {
  const browser = await chromium.launch();
  const errs = [];

  // ---- two stale tabs, one 60-dust balance, two 50-dust reforges: only the first is charged ----
  { const { ctx, db } = await ctxOf(browser); await seed(ctx, realm({ dust: 60 }));
    const A = await go(ctx, errs); const B = await go(ctx, errs);
    const pre = await B.evaluate(() => { const a = window.__mm.arena; const o = (a.reforgeOptions(2) || []).find((x) => x.id === 'swift'); return { dust: a.save.dust, o }; });
    check('setup: both tabs show 60 dust and B sees the 50-dust reforge as affordable', pre.dust === 60 && pre.o && pre.o.cost.dust === 50 && pre.o.afford, JSON.stringify(pre));
    await B.evaluate(stash);
    const nA = await A.evaluate(() => window.__mm.arena.reforge(1, 'swift'));
    const bMem = await B.evaluate(unstash);
    const nB = await B.evaluate(() => window.__mm.arena.reforge(2, 'swift'));
    const st = await stored(B);
    const bv = await B.evaluate(() => { const a = window.__mm.arena; const it = a.save.items.find((x) => x.n === 2); return { dust: a.save.dust, it }; });
    check('A reforges (60 -> 10 dust); stale B still showed 60 before its click', nA > 0 && bMem === 60, JSON.stringify({ nA, bMem }));
    check('I6-dust: stale B\'s second 50-dust reforge is refused after its resync (B now shows 10)', nB === 0 && bv.dust === 10 && bv.it && !bv.it.f, JSON.stringify({ nB, bv }));
    check('I6-dust: storage holds exactly 10 dust and 98 shards (one reforge charged once, nothing floored)', st.dust === 10 && st.shards === 98 && st.items.filter((x) => x.f).length === 1 && st.items.some((x) => x.n === 2 && !x.f), JSON.stringify({ d: st.dust, s: st.shards, items: st.items }));
    const fi = st.items.find((x) => x.f);
    check('UR: the reforged entry carries a valid tag u (a fresh uid as before)', fi && fi.n === nA && goodTag(fi.u), JSON.stringify(fi));
    check('no DB traffic (blockDb)', db.attempts() === 0, JSON.stringify({ http: db.http, ws: db.ws }));
    await ctx.close(); }

  // ---- Nexus vendor: dust for exactly one buy, two stale tabs ----
  { const { ctx, db } = await ctxOf(browser); await seed(ctx, realm({ dust: 0 }));
    const P = await go(ctx, errs);
    const o = await P.evaluate(() => (window.__mm.arena.vendorStock() || [])[0] || null);
    await P.close();
    check('setup: the vendor stall lists an item', !!(o && o.price > 0), JSON.stringify(o));
    if (o) {
      await seed(ctx, realm({ dust: o.price + 1 }));
      const A = await go(ctx, errs); const B = await go(ctx, errs);
      await B.evaluate(stash);
      const nA = await A.evaluate((x) => window.__mm.arena.vendorBuy(x.id, x.t), o);
      await B.evaluate(unstash);
      const nB = await B.evaluate((x) => window.__mm.arena.vendorBuy(x.id, x.t), o);
      const st = await stored(B);
      const bought = st.items.filter((x) => x.id === o.id && x.t === o.t && x.r === 0);
      check('I6-dust: the vendor sells once (A); stale B is refused after its resync', nA > 0 && nB === 0, JSON.stringify({ nA, nB }));
      check('I6-dust: storage keeps exactly 1 dust and one bought item', st.dust === 1 && bought.length === 1 && bought[0].n === nA && goodTag(bought[0].u), JSON.stringify({ d: st.dust, bought }));
    }
    check('no DB traffic (blockDb)', db.attempts() === 0);
    await ctx.close(); }

  // ---- a reforge whose write fails (storage full) is undone; the retry charges once ----
  { const { ctx, db } = await ctxOf(browser); await seed(ctx, realm({ dust: 60 }));
    const A = await go(ctx, errs);
    const r = await A.evaluate((k) => {
      const a = window.__mm.arena; const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, v) { if (key === k) throw new Error('QuotaExceededError'); return set.call(this, key, v); };
      let n0; try { n0 = a.reforge(1, 'swift'); } finally { Storage.prototype.setItem = set; }
      const mem = { dust: a.save.dust, shards: a.save.shards, it1: a.save.items.find((x) => x.n === 1) || null, eq: a.save.eq.weapon, ok: a.saveOk };
      const st0 = JSON.parse(localStorage.getItem(k)).realm;
      const n1 = a.reforge(1, 'swift');
      const st1 = JSON.parse(localStorage.getItem(k)).realm;
      return { n0, mem, st0: { dust: st0.dust, shards: st0.shards, f: st0.items.filter((x) => x.f).length }, n1, st1: { dust: st1.dust, shards: st1.shards, f: st1.items.filter((x) => x.f).length, eq: a.save.eq.weapon } };
    }, SAVE);
    check('I6-dust: a reforge whose write failed is undone (returns 0; 60 dust, 100 shards, the old uid 1 entry without f, still equipped)', r.n0 === 0 && r.mem.dust === 60 && r.mem.shards === 100 && r.mem.it1 && !r.mem.it1.f && r.mem.eq === 1 && r.mem.ok === false, JSON.stringify(r));
    check('I6-dust: storage was not changed by the failed reforge', r.st0.dust === 60 && r.st0.shards === 100 && r.st0.f === 0, JSON.stringify(r.st0));
    check('I6-dust: the retry with storage back charges exactly once (10 dust, 98 shards, one forged item, equip follows)', r.n1 > 0 && r.st1.dust === 10 && r.st1.shards === 98 && r.st1.f === 1 && r.st1.eq === r.n1, JSON.stringify(r));
    await A.reload();
    await A.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active, null, { timeout: 20000 });
    const rl = await A.evaluate((n) => { const it = window.__mm.arena.save.items.find((x) => x.n === n); return it ? it.u : null; }, r.n1);
    const st = await stored(A);
    check('UR: the tag survives a reload (cleaner keeps it) and matches storage', goodTag(rl) && st.items.find((x) => x.n === r.n1).u === rl, String(rl));
    check('no DB traffic (blockDb)', db.attempts() === 0);
    await ctx.close(); }

  check('no console errors', errs.length === 0, JSON.stringify(errs.slice(0, 5)));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
