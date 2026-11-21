// G11 (GEAR-DROPS-BUILD-PLAN section d): player splash / reach / pierce in the realm hit path (MMSplash kernel).
// A splash style (staff_comet {r 56, frac .6, max 6}) or the `blast` affix (_calcStats splashR / splashFrac / splashMax) splashes the nearest
// hostile enemies around the impact for hit x frac x falloff (primary excluded, cap max <= 6, nothing outside r, never inactive enemies, drifters
// or the player), once per bolt (a pierce bolt splashes on its first hit only), a ring + one combined orange number. `reach` lengthens a bolt's
// life, `pierce` adds pass-throughs (cap 3), `venom` on a style without a status rolls a 3 s bleed. No splash and no extra rng draw when there is
// nothing to splash; ?gear=0 and ?splash=0 turn it all off. Offline (blockDb), no chat, no Firebase writes, no console errors.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/gear-splash-player.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const MAZE = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1';
const SAVE = 'pixeltown-save-v1', MM = 'pixeltown-mm-v1', ACTIVE = 'pixeltown-mm-active-v1';
const hero = (id, cls) => ({ id, name: cls, cls, level: 20, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] });
const prof = (heroes) => ({ v: 1, heroes, stash: new Array(16).fill(null), fame: 0, mode: 'classic', hall: [], migratedFrom: null });
const realm = () => ({ shards: 0, bestWave: 0, kills: 0, deaths: 0, kb: { spiral: 0, aimed: 0, ring: 0, drifter: 0, boss: 0 }, bossBestT: 0, level: 20, xp: 0, items: [], nextUid: 100, eq: {} });

async function open(browser, query) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const db = await blockDb(ctx);
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([k1, p, k2, a, k3, s]) => { localStorage.clear(); localStorage.setItem(k1, JSON.stringify(p)); localStorage.setItem(k2, a); localStorage.setItem(k3, JSON.stringify({ realm: s })); localStorage.setItem('mm-aim-assist', '0'); },
    [MM, prof([hero('h-1', 'warlock')]), ACTIVE, JSON.stringify({ v: 1, heroId: 'h-1' }), SAVE, realm()]);
  errors.length = 0;
  await page.goto(MAZE + (query || ''));
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active, null, { timeout: 15000 });
  await page.evaluate(() => {
    const a = window.__mm.arena; a.state = 'play'; a.setPaused(false);
    a.eBullets.forEach((b) => { b.active = false; }); a.enemies.forEach((e) => { e.active = false; }); a.pBullets.forEach((b) => { b.active = false; }); a.drifters.forEach((d) => { d.active = false; });
    a.player.iframes = 1e9; a.player.x = 200; a.player.y = 300;
    // test helpers: a sturdy, still enemy; one bolt flown until it is gone
    window.__en = (x, y) => { const e = a.spawnEnemy('spiral', x, y); e.hp = e.maxHp = 1000; e.cd = 999; e.flash = 0; return e; };
    window.__fly = (b) => { for (let i = 0; i < 120 && b.active; i++) a._updateBullets(1 / 60); };
    window.__clear = () => { a.enemies.forEach((e) => { e.active = false; }); a.pBullets.forEach((b) => { b.active = false; }); a.texts.forEach((t) => { t.active = false; }); };
  });
  return { ctx, page, errors, db };
}

// Splash-style shot into a cluster: primary straight ahead, neighbours up / down of it at growing distances, two outside the radius.
const cluster = (page) => page.evaluate(() => {
  const a = window.__mm.arena; window.__clear();
  const spec = MMWeapons.resolve('warlock', 'staff_comet', 0); const on = a.setHeroWeapon(spec);
  const P = window.__en(300, 300); const near = [12, 18, 26, 34, 44, 52, 58].map((d, i) => window.__en(300, 300 + (i % 2 ? d : -d)));
  const far = [window.__en(300, 300 + 130), window.__en(300, 300 - 150)];
  const off = window.__en(300, 330); off.active = false; off.hp = 1000; // an inactive pool slot right inside the radius
  const ph0 = a.player.hp; const n0 = a.splashN || 0;
  const b = a.firePlayerBulletFrom(a.player.x, a.player.y, 0, 10, 0); a._styleBolt(b, a.weapon, 0, 0, 0); const hit = b.dmg;
  window.__fly(b);
  const L = a.lastSplash || null; const sp = { r: a.weapon.splash.r, frac: a.weapon.splash.frac, inner: a.weapon.splash.inner, edge: a.weapon.splash.edge, max: a.weapon.splash.max };
  const want = near.map((e) => (L ? MMSplash.dmg(hit, Math.max(0, Math.hypot(e.x - L.x, e.y - L.y) - a._er(e)), sp) : 0));
  const took = near.map((e) => 1000 - e.hp);
  // the kernel's own nearest-max choice over the same points
  const order = near.map((e, i) => ({ i, d: L ? Math.max(0, Math.hypot(e.x - L.x, e.y - L.y) - a._er(e)) : 1e9 })).filter((q) => q.d <= sp.r).sort((x, y) => x.d - y.d).slice(0, sp.max).map((q) => q.i);
  const texts = a.texts.filter((t) => t.active && t.color === '#ffb36b').map((t) => t.text);
  return { on, sp, primary: 1000 - P.hp, took, want, order, far: far.map((e) => 1000 - e.hp), off: 1000 - off.hp, player: ph0 - a.player.hp, events: (a.splashN || 0) - n0, L, texts, rings: (a.splashRingN || 0) + (a.splashArtN || 0) };
});

(async () => {
  const browser = await chromium.launch();
  const errs = []; let leaks = 0;

  // ---------- gear on (default) ----------
  { const A = await open(browser, '');
    const c = await cluster(A.page);
    const hitIdx = c.took.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0);
    check('splash style: staff_comet resolves with splash {r 56, frac 0.6, max 6} and the primary takes the full hit (10)', c.on && c.sp.r === 56 && Math.abs(c.sp.frac - 0.6) < 1e-9 && c.sp.max === 6 && Math.abs(c.primary - 10) < 1e-6, JSON.stringify(c));
    check('neighbours inside the radius take hit x frac x falloff (nearest one gets about 6 = 10 x 0.6 minus the small inner falloff, further ones less)', c.events === 1 && hitIdx.every((i) => Math.abs(c.took[i] - c.want[i]) < 1e-4) && c.took[0] <= 6 + 1e-4 && c.took[0] >= 6 * (1 - 2 * c.sp.inner - 0.05) && c.took[0] >= c.took[hitIdx[hitIdx.length - 1]], JSON.stringify(c));
    check('cap: 7 neighbours inside r but only the nearest 6 (spec max) are splashed', hitIdx.length === 6 && JSON.stringify(hitIdx.slice().sort()) === JSON.stringify(c.order.slice().sort()), JSON.stringify({ hitIdx, order: c.order }));
    check('outside the radius, an inactive pool slot and the player take nothing', c.far.every((v) => v === 0) && c.off === 0 && c.player === 0, JSON.stringify(c));
    check('one ring and one combined orange number ("6 ×6"-style) per splash event', c.rings >= 1 && c.texts.length === 1 && /^[0-9.]+ ×6$/.test(c.texts[0]), JSON.stringify(c.texts));

    const r = await A.page.evaluate(() => {
      const a = window.__mm.arena; const out = {};
      // pierce: a 3-pierce splash bolt through 3 enemies in a row splashes only on its first hit
      window.__clear(); [300, 340, 380].forEach((x) => window.__en(x, 300)); const n0 = a.splashN || 0;
      const b = a.firePlayerBulletFrom(a.player.x, a.player.y, 0, 10, 0); a._styleBolt(b, a.weapon, 0, 0, 0); b.pr = 3; window.__fly(b); out.pierceEvents = (a.splashN || 0) - n0;
      // chain hops / partner bolts never splash
      window.__clear(); const P = window.__en(300, 300), N = window.__en(300, 318); const n1 = a.splashN || 0;
      const pb = a.firePlayerBulletFrom(a.player.x, a.player.y, 0, 10, 1); a._styleBolt(pb, a.weapon, 0, 0, 0); window.__fly(pb); out.partner = { ev: (a.splashN || 0) - n1, n: 1000 - N.hp };
      // drifters near the impact are never splashed
      window.__clear(); window.__en(300, 300); const d = a.drifters[0]; d.active = true; d.x = 300; d.y = 322; const dh = d.hp;
      const db = a.firePlayerBulletFrom(a.player.x, a.player.y, 0, 10, 0); a._styleBolt(db, a.weapon, 0, 0, 0); window.__fly(db); out.drifter = d.hp === dh; d.active = false;
      // 30 splash events in one frame: live texts stay <= 28, FX for at most 24 (the rest still deal damage)
      window.__clear(); a.texts.forEach((t) => { t.active = false; }); a._spTxtT = undefined;
      a.setHeroWeapon(null); a.stats.splashR = 30; a.stats.splashFrac = 0.3; a.stats.splashMax = 3; // blast-affix splash on plain bolts (the pool has 24 enemies)
      const rn0 = (a.splashRingN || 0) + (a.splashArtN || 0); const e0 = a.splashN || 0; const hit = [];
      for (let k = 0; k < 12; k++) { const y = 40 + k * 40; window.__en(300, y); hit.push(window.__en(325, y)); }
      // the real hit path in ONE _updateBullets call: 30 bolts sitting on the 12 primaries (each bolt splashes once)
      for (let k = 0; k < 30; k++) { const q = a.firePlayerBulletFrom(300, 40 + (k % 12) * 40, 0, 10, 0); q.x = 300; q.y = 40 + (k % 12) * 40; q.vx = 0.001; q.vy = 0; }
      const t0 = performance.now(); a._updateBullets(1 / 60); out.ms = performance.now() - t0;
      out.burst = { events: (a.splashN || 0) - e0, fx: (a.splashRingN || 0) + (a.splashArtN || 0) - rn0, texts: a.texts.filter((t) => t.active).length, dmg: hit.filter((e) => e.hp < 1000).length };
      a.setHeroWeapon(MMWeapons.resolve('warlock', 'staff_comet', 0)); a.stats.splashR = 0; a.stats.splashFrac = 0; a.stats.splashMax = 0;
      // blast affix path on a plain bolt: _calcStats-style keys splash {r 30, frac .3, max 3}
      a.setHeroWeapon(null); window.__clear(); a.stats.splashR = 30; a.stats.splashFrac = 0.3; a.stats.splashMax = 3;
      const P2 = window.__en(300, 300); const N2 = [16, -16, 20, -20].map((d) => window.__en(300, 300 + d)); const F2 = window.__en(300, 360);
      const pl = a.firePlayerBulletFrom(a.player.x, a.player.y, 0, 10, 0); a._gearBolt(pl); window.__fly(pl);
      out.blast = { primary: 1000 - P2.hp, n: N2.map((e) => 1000 - e.hp), far: 1000 - F2.hp };
      // reach + pierce on a fresh plain bolt
      a.stats.splashR = 0; a.stats.splashFrac = 0; a.stats.splashMax = 0; a.stats.reach = 0.1; a.stats.pierce = 2;
      const rb = a.firePlayerBulletFrom(a.player.x, a.player.y, 0, 10, 0); const life0 = rb.life; a._gearBolt(rb); out.reach = { ratio: rb.life / life0, pr: rb.pr }; rb.active = false;
      a.stats.pierce = 5; const rb2 = a.firePlayerBulletFrom(a.player.x, a.player.y, 0, 10, 0); a._gearBolt(rb2); out.pierceCap = rb2.pr; rb2.active = false;
      // reach on a styled bolt: its spec copy lives longer
      a.stats.pierce = 0; a.setHeroWeapon(MMWeapons.resolve('warlock', 'staff_comet', 0)); const w = a.weapon; out.reachW = a._wpnReach(w).life / w.life; out.reachSame = a._wpnReach(w) === a._wpnReach(w);
      // venom fallback: staff_comet has no status of its own -> a bleed
      a.setHeroWeapon(null); window.__clear(); a.stats.reach = 0; a.stats.venom = 1; const V = window.__en(300, 300);
      const vb = a.firePlayerBulletFrom(a.player.x, a.player.y, 0, 10, 0); window.__fly(vb); out.bleed = !!(V.status && V.status.fx && V.status.fx.bleed);
      a.stats.venom = 0; a._calcStats();
      return out;
    });
    check('a pierce-3 splash bolt through 3 enemies splashes once (first hit only)', r.pierceEvents === 1, JSON.stringify(r));
    check('partner bolts and drifters: no splash', r.partner.ev === 0 && r.partner.n === 0 && r.drifter, JSON.stringify(r));
    check('30 splash events in one frame: all 30 deal damage, FX for at most 24, live texts <= 28', r.burst.events === 30 && r.burst.dmg === 12 && r.burst.fx === 24 && r.burst.texts <= 28 && r.ms < 50, JSON.stringify(r.burst) + ' ms ' + r.ms);
    check('blast affix (r 30, frac .3, max 3) on a plain bolt: 3 neighbours take 3 (0.3 x 10), the 4th (cap) and one 60 px away take 0', Math.abs(r.blast.primary - 10) < 1e-6 && r.blast.n.filter((v) => Math.abs(v - 3) < 1e-4).length === 3 && r.blast.n.filter((v) => v === 0).length === 1 && r.blast.far === 0, JSON.stringify(r.blast));
    check('reach +10% lengthens a plain bolt\'s life by 10%; pierce +2 gives 2 pass-throughs and caps at 3', Math.abs(r.reach.ratio - 1.1) < 1e-6 && r.reach.pr === 2 && r.pierceCap === 3, JSON.stringify(r));
    check('reach on a styled weapon: a cached spec copy with 10% more life', Math.abs(r.reachW - 1.1) < 1e-6 && r.reachSame, JSON.stringify(r));
    check('venom on a bolt without a status of its own applies a bleed', r.bleed, JSON.stringify(r));

    // no splash -> no extra rng draw (existing seeds unchanged): count rng calls through a plain hit with and without the splash code path
    const rngOn = await A.page.evaluate(() => {
      const a = window.__mm.arena; window.__clear(); a._calcStats(); window.__en(300, 300); window.__en(300, 316);
      const orig = a.rng; let n = 0; a.rng = function () { n++; return orig.apply(this, arguments); };
      const b = a.firePlayerBulletFrom(a.player.x, a.player.y, 0, 10, 0); window.__fly(b); a.rng = orig; return { n, splash: a.stats.splashFrac };
    });
    errs.push(...A.errors); leaks += A.db.count(); await A.ctx.close();

    // ---------- ?gear=0: the kill switch ----------
    const B = await open(browser, '&gear=0');
    const g = await cluster(B.page);
    const rngOff = await B.page.evaluate(() => {
      const a = window.__mm.arena; window.__clear(); a.setHeroWeapon(null); a._calcStats(); window.__en(300, 300); window.__en(300, 316);
      const orig = a.rng; let n = 0; a.rng = function () { n++; return orig.apply(this, arguments); };
      const b = a.firePlayerBulletFrom(a.player.x, a.player.y, 0, 10, 0); window.__fly(b); a.rng = orig; return { n };
    });
    check('?gear=0: the same staff_comet shot splashes nobody (no event, neighbours untouched)', g.primary > 0 && g.events === 0 && g.took.every((v) => v === 0) && !g.L, JSON.stringify(g));
    check('splashFrac 0: a plain hit draws exactly as many rng values as with gear off (seeds unchanged)', rngOn.splash === 0 && rngOn.n === rngOff.n && rngOn.n > 0, JSON.stringify({ rngOn, rngOff }));
    errs.push(...B.errors); leaks += B.db.count(); await B.ctx.close();

    const C = await open(browser, '&splash=0');
    const s0 = await cluster(C.page);
    check('?splash=0: no splash either', s0.events === 0 && s0.took.every((v) => v === 0), JSON.stringify(s0));
    errs.push(...C.errors); leaks += C.db.count(); await C.ctx.close(); }

  check('no console errors', errs.length === 0, errs.join(' | '));
  check('no Firebase traffic (blockDb)', leaks === 0, String(leaks));
  await browser.close();
  done();
})();
