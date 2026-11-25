// cycle 9 L (1): the pool-shape rule from cycle 8 (realm.js: every object of a pool has ONE list of fields, declared where it is
// made) applied to the rest of the game. An object that gains a field later gets a new hidden shape, and the browser throws away
// the optimised code of every hot function that read the old one (cycle 8 measured about 10 KB per frame from that in the Realm).
//   [A] Realm: the arena object itself has the same fields after 12 s of fighting as at the first frame of play (it gained 6
//       late: _enemyVis, _enemyDbg, lastDmgColor, _dmgTxtT, _numC, _spS).
//   [B] Town: each record list the scene walks per frame (bugs, fish shadows, field-guide specimens, villager states) has one
//       field list (the bug records had two: placed bugs gained `tween`, bug-off extras had `extra`).
//   [C] Isles: every creature, bolt and death slot has one field list, after spawning, fighting, stunning and killing.
// Deterministic (field lists, not bytes). Offline: Town through offlineStub, Realm and Isles through blockDb; db.attempts() === 0.
// Never chats, never writes to Firebase.
// Run: BASE=http://localhost:9901/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc9-lead-pool-shapes.test.js
const { chromium } = require('playwright');
const { check, done, blockDb, offlineStub, exposeGame, joinOffline } = require('./helpers');
const LS = require('./lib/load-scale');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const ORIGIN = new URL(BASE).origin;
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&heropick=0&tutorial=0&seed=12345&qdate=2030-05-01';
const ISLES = ORIGIN + '/game/games/isles/index.html?test=1&seed=123';
const SAVE = { realm: { level: 4, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 } } };
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

(async () => {
  const browser = await chromium.launch();
  let attempts = 0; const errors = [];

  // ---- [A] Realm arena ----
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const db = await blockDb(ctx);
    await ctx.route('**/game/index.html*', (rt) => rt.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
    const page = await ctx.newPage(); page.on('pageerror', (e) => errors.push('realm: ' + e.message));
    await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
    await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', s); }, JSON.stringify(SAVE));
    await page.goto(WORLD, { waitUntil: 'domcontentloaded', timeout: LS.budget(30000) });
    await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: LS.budget(30000) });
    await page.evaluate(() => {
      const a = window.__mm.arena; window.__keys0 = Object.keys(a);
      a.player.iframes = 1e9; a._hitPlayer = () => {}; a.mouse.seen = true; a.mouse.down = true; a.mouse.x = a.W * 0.7; a.mouse.y = a.H * 0.4;
      let t = 0; setInterval(() => { t++; const k = ['d', 's', 'a', 'w'][Math.floor(t / 8) % 4]; a.keys = {}; a.keys[k] = true; }, 250);
    });
    await page.waitForFunction(() => window.__mm.arena.run.kills >= 5, null, { timeout: LS.budget(60000) });
    await frames(page, 300);
    const r = await page.evaluate(() => { const a = window.__mm.arena; const k1 = Object.keys(a); return { n0: window.__keys0.length, n1: k1.length, late: k1.filter((k) => !window.__keys0.includes(k)), kills: a.run.kills, vis: a._enemyVis }; });
    check('[A] the fight was real: >= 5 kills (damage numbers, sparks and enemy art all ran)', r.kills >= 5, String(r.kills));
    check('[A] the Realm arena has the same fields after the fight as at the first frame of play (none added late)', r.late.length === 0 && r.n0 === r.n1, r.n0 + ' -> ' + r.n1 + ' fields; late: ' + r.late.join(', '));
    check('[A] the enemy art scale is still a real number (declared default 130, or the art module\'s value)', r.vis > 0, String(r.vis));
    attempts += db.attempts(); await ctx.close();
  }

  // ---- [B] Town record lists ----
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const db = await offlineStub(ctx);
    const page = await ctx.newPage(); page.on('pageerror', (e) => errors.push('town: ' + e.message));
    await exposeGame(page);
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: LS.budget(30000) });
    await joinOffline(page, 'ADMINcyc9shape');
    await frames(page, 300);
    const r = await page.evaluate(() => {
      const s = window.__g.scene.getScene('Town'); const out = {};
      const sig = (list) => { const m = new Map(); for (const o of list) { const k = Object.keys(o).join(','); m.set(k, (m.get(k) || 0) + 1); } return { n: list.length, shapes: [...m.entries()].map(([k, n]) => n + ' x [' + k + ']') }; };
      out.bugs = sig(s.bugs); out.fishShadows = sig(s.fishShadows); out.ffSpecimens = sig(s.ffSpecimens); out.villagerState = sig(Object.values(s.villagerState));
      out.extras = s.bugs.filter((b) => b.extra).length; out.placed = s.bugs.filter((b) => b.tween).length;
      return out;
    });
    check('[B] the Town has both kinds of bug record (placed with a tween, and bug-off extras), so the check is real', r.extras >= 1 && r.placed >= 1 && r.bugs.n > r.extras, JSON.stringify([r.bugs.n, r.extras, r.placed]));
    for (const k of ['bugs', 'fishShadows', 'ffSpecimens', 'villagerState']) check('[B] Town ' + k + ': one field list for all ' + r[k].n + ' records', r[k].n >= 2 && r[k].shapes.length === 1, r[k].shapes.join(' | ').slice(0, 300));
    attempts += db.attempts(); await ctx.close();
  }

  // ---- [C] Isles creatures, bolts, death slots ----
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const db = await blockDb(ctx);
    const page = await ctx.newPage(); page.on('pageerror', (e) => errors.push('isles: ' + e.message));
    await page.goto(ISLES, { waitUntil: 'domcontentloaded', timeout: LS.budget(30000) });
    await page.waitForFunction(() => window.__isles && window.__isles.creatures && window.__isles.creatures().length > 0, null, { timeout: LS.budget(30000) });
    const r = await page.evaluate(() => {
      const I = window.__isles; I.god(true);
      const hasShapes = typeof I.shapes === 'function';
      const first = hasShapes ? I.shapes() : null;
      // walk in a square firing in every direction, 40 s of game time: creatures notice, attack, get hit, stunned, die
      let fired = 0;
      for (let k = 0; k < 400; k++) {
        const d = [[1, 0], [0, 1], [-1, 0], [0, -1]][Math.floor(k / 25) % 4];
        if (I.fire(d[0], d[1]) !== false) fired++;
        if (k % 50 === 10 && I.useAbility) { try { I.useAbility(); } catch (e) { /* no ability on this hero */ } }
        I.step(d[0], d[1], 0.1);
      }
      const during = hasShapes ? I.shapes() : null;
      return { hasShapes, first, during, n: I.creatures().length, kills: (I.stats && I.stats().kills) || 0, fired, deaths: I.deathsShown ? I.deathsShown() : null };
    });
    const list = (m) => Object.keys(m || {}).map((k) => m[k] + ' x ' + k.split(',').length + ' fields');
    const diff = (m) => { const ks = Object.keys(m || {}).map((k) => k.split(',')); const all = [...new Set(ks.flat())]; return all.filter((f) => !ks.every((k) => k.includes(f))); };
    check('[C] Isles exposes the field lists and the scene was busy (creatures alive, bolts fired)', r.hasShapes && r.n >= 3 && r.fired >= 20, JSON.stringify({ n: r.n, fired: r.fired, kills: r.kills, deaths: r.deaths }));
    if (r.hasShapes) {
      check('[C] Isles creatures: one field list, fresh and after 40 s of fighting', list(r.first.creatures).length === 1 && list(r.during.creatures).length === 1 && Object.keys(r.first.creatures)[0] === Object.keys(r.during.creatures)[0],
        'fresh ' + list(r.first.creatures).join(' | ') + '; after ' + list(r.during.creatures).join(' | ') + '; fields not on all: ' + diff(Object.assign({}, r.first.creatures, r.during.creatures)).join(', '));
      check('[C] Isles bolts in flight: one field list', list(r.during.bolts).length <= 1, list(r.during.bolts).join(' | ') + ' ' + diff(r.during.bolts).join(', '));
      check('[C] Isles death slots: one field list', list(r.during.deadPool).length === 1, list(r.during.deadPool).join(' | ') + ' ' + diff(r.during.deadPool).join(', '));
    }
    attempts += db.attempts(); await ctx.close();
  }

  check('no page errors', errors.length === 0, errors.join(' | '));
  check('offline: no database traffic (literal 0)', attempts === 0, String(attempts));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
