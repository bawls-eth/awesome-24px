// S8 projectile engine: RealmArena.setHeroWeapon(MMWeapons.resolve(...)) drives the bolts through MMProjectile kernels.
// Checks: bow_triple fan, hammer_throw boomerang return, star_bounce wall bounce, wpn_ save tolerance, co-op `fp` 5th element, ?weapons=0.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/class-weapon-engine.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const MAZE = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1';
const MM = 'pixeltown-mm-v1', ACTIVE = 'pixeltown-mm-active-v1', SAVE = 'pixeltown-save-v1';
const hero = (id, cls) => ({ id, name: cls, cls, level: 3, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] });
const prof = (heroes) => ({ v: 1, heroes, stash: new Array(16).fill(null), fame: 0, mode: 'classic', hall: [], migratedFrom: null });
const CLS = ['ranger', 'paladin', 'shadowPaw', 'frostcaller'];
const MODS = ['mm-weapons.js', 'mm-projectile.js', 'mm-fx-draw.js', 'mm-status.js'];
const GLOBALS = { 'mm-weapons.js': 'MMWeapons', 'mm-projectile.js': 'MMProjectile', 'mm-fx-draw.js': 'MMFxDraw', 'mm-status.js': 'MMStatus' };

async function open(browser, cls, query, opts, realm) {
  const ctx = await browser.newContext(opts || { viewport: { width: 1000, height: 700 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([k1, p, k2, a, k3, s]) => { localStorage.setItem(k1, JSON.stringify(p)); localStorage.setItem(k2, a); if (s) localStorage.setItem(k3, s); else localStorage.removeItem(k3); },
    [MM, prof(CLS.map((c) => hero('h-' + c, c))), ACTIVE, JSON.stringify({ v: 1, heroId: 'h-' + cls }), SAVE, realm ? JSON.stringify({ realm }) : null]);
  errors.length = 0;
  await page.goto(MAZE + (query || ''));
  await page.waitForFunction(() => window.__mm && window.__mm.arena);
  // The page wiring (S10) may not load the weapon modules yet: add any that are missing.
  for (const f of MODS) {
    if (!(await page.evaluate((g) => typeof window[g] !== 'undefined', GLOBALS[f]))) await page.addScriptTag({ url: ORIGIN + '/game/shared/' + f });
  }
  return { ctx, page, errors };
}

const prep = (page, x, y) => page.evaluate(([x, y]) => {
  const a = window.__mm.arena;
  a.state = 'play'; a.run.wave = 0; a.paused = false; a.down = false;
  [a.enemies, a.eBullets, a.pBullets].forEach((pool) => pool.forEach((o) => { o.active = false; }));
  const p = a.player; p.x = x; p.y = y; p.aim = 0; p.hp = a.stats.maxHp; p.iframes = 0;
  return true;
}, [x || 300, y || 350]);
const equip = (page, cls, style, r) => page.evaluate(([c, s, r]) => window.__mm.arena.setHeroWeapon(MMWeapons.resolve(c, s, r)), [cls, style, r || 0]);
const volley = (page) => page.evaluate(() => {
  const a = window.__mm.arena; a.pBullets.forEach((b) => { b.active = false; });
  a._firePlayerVolley(a.player.aim);
  return a.pBullets.filter((b) => b.active).map((b) => ({ ang: Math.atan2(b.vy, b.vx), dmg: b.dmg, sp: Math.hypot(b.vx, b.vy), pr: b.pr, ws: !!b.ws }));
});

(async () => {
  const browser = await chromium.launch();
  const errs = [];

  // (1) bow_triple: 3 arrows at -0.09 / 0 / +0.09 rad; no spec = the plain bolt again.
  const R = await open(browser, 'ranger'); errs.push(...R.errors);
  await prep(R.page);
  check('setHeroWeapon accepts a resolved bow_triple spec', await equip(R.page, 'ranger', 'bow_triple') === true);
  const tv = (await volley(R.page)).sort((a, b) => a.ang - b.ang);
  check('bow_triple fires 3 bolts at -0.09, 0, +0.09 rad', tv.length === 3 && Math.abs(tv[0].ang + 0.09) < 1e-6 && Math.abs(tv[1].ang) < 1e-6 && Math.abs(tv[2].ang - 0.09) < 1e-6 && tv.every((b) => b.ws), JSON.stringify(tv));
  const spec = await R.page.evaluate(() => MMWeapons.resolve('ranger', 'bow_triple', 0).dmg);
  check('each arrow carries the resolved per-bolt damage', tv.every((b) => Math.abs(b.dmg - spec) < 1e-9), JSON.stringify({ spec, d: tv.map((b) => b.dmg) }));
  // the page's own frame loop ages the bolts between the volley call and this one: count the age they already have (`age`, seconds) plus the manual steps, so the total lifetime is measured exactly
  const life = await R.page.evaluate(() => { const a = window.__mm.arena; const was = a.paused; a.paused = true; const aged = Math.round(Math.max(0, ...a.pBullets.filter((b) => b.active).map((b) => b.age || 0)) * 60); let n = 0; for (let i = 0; i < 60; i++) { a._updateBullets(1 / 60); if (a.pBullets.some((b) => b.active)) n = i + 1; } a.paused = was; return n + aged; });
  check('bow_triple arrows live about 0.75 s (45 frames)', life >= 43 && life <= 46, String(life));
  const cap = await R.page.evaluate(() => { const a = window.__mm.arena; a.pBullets.forEach((b) => { b.active = false; }); for (let i = 0; i < 30; i++) a._firePlayerVolley(0); return a.pBullets.filter((b) => b.active && b.ws).length; });
  check('40-bolt cap per hero holds', cap === 40, String(cap));
  await R.page.evaluate(() => window.__mm.arena.setHeroWeapon(null));
  await prep(R.page);
  const pv = await volley(R.page);
  check('null spec restores the plain ranger bolt', pv.length === 1 && Math.abs(pv[0].ang) < 1e-9 && pv[0].dmg === 1 && Math.abs(pv[0].sp - 580) < 1e-6 && !pv[0].ws, JSON.stringify(pv));
  check('a base style keeps today\'s fire', await R.page.evaluate(() => window.__mm.arena.setHeroWeapon(MMWeapons.resolve('ranger', 'base', 2))) === false);
  check('a hostile spec is rejected', await R.page.evaluate(() => { const a = window.__mm.arena; return a.setHeroWeapon({ id: '__proto__', count: 99 }) === false && a.setHeroWeapon('x') === false && a.weapon === null; }));

  // (co-op) host `fp` events: plain bolts keep 4 elements, styled bolts add a 5th; the guest decodes it into the same path.
  const co = await R.page.evaluate(() => {
    const a = window.__mm.arena, evs = [];
    const keepT = a.team, keepR = a.role;
    a.team = { isPvp: false, ev: (k, d, o) => evs.push({ k, d, o }) }; a.role = 'host';
    a.setHeroWeapon(null); a.pBullets.forEach((b) => { b.active = false; }); a._firePlayerVolley(0);
    const plain = evs.filter((e) => e.k === 'fp').map((e) => e.d.length);
    evs.length = 0;
    a.setHeroWeapon(MMWeapons.resolve('graveTender', 'wand_seeker', 2)); // no wave: identical path from the same rounded start
    a.player.x = 300; a.player.y = 350; a.pBullets.forEach((b) => { b.active = false; });
    a._firePlayerVolley(0.3);
    const host = a.pBullets.find((b) => b.active);
    const fp = evs.filter((e) => e.k === 'fp').map((e) => e.d);
    // Guest side: draw it from the event like realm-team's handler does.
    const d = fp[0];
    const g = a.firePlayerBulletFrom(d[0], d[1], d[2], d[3], 0); a._wpnRemote(g, d[4], d[2]);
    const sameSpec = g.ws && host.ws && g.ws.id === host.ws.id && g.ws.homing === host.ws.homing && g.ws.life === host.ws.life && g.ho === 1;
    for (let i = 0; i < 20; i++) { a._stepWpn(host, 1 / 60, a.W, a.H); a._stepWpn(g, 1 / 60, a.W, a.H); }
    const drift = Math.hypot(host.x - g.x, host.y - g.y);
    // An old/unknown code or a missing 5th element leaves a plain bolt.
    const o1 = a.firePlayerBulletFrom(10, 10, 0, 1, 0); a._wpnRemote(o1, 'junk', 0);
    const o2 = a.firePlayerBulletFrom(10, 10, 0, 1, 0); a._wpnRemote(o2, 999999999, 0);
    const old = !o1.ws && !o2.ws;
    a.team = keepT; a.role = keepR; a.setHeroWeapon(null);
    a.pBullets.forEach((b) => { b.active = false; });
    return { plain, n5: fp.map((x) => x.length), sameSpec, drift, old };
  });
  check('co-op: plain bolts keep the 4-element fp event (old wire format)', co.plain.length === 1 && co.plain[0] === 4, JSON.stringify(co.plain));
  check('co-op: styled bolts add an optional 5th fp element', co.n5.length === 1 && co.n5[0] === 5, JSON.stringify(co.n5));
  check('co-op: the guest decodes the same style and flies the same path', co.sameSpec && co.drift < 1.5, JSON.stringify(co));
  check('co-op: a junk or unknown 5th element leaves a plain bolt', co.old);
  // Every alternate style fires, flies and hurts a row of enemies without throwing (lob, chain, orbit, burst included).
  const all = await R.page.evaluate(() => {
    const a = window.__mm.arena, p = a.player, fam = MMWeapons.CLASS_FAMILY, out = [];
    MMWeapons.altIds().forEach((id) => {
      const cls = Object.keys(fam).find((k) => fam[k] === MMWeapons.get(id).family);
      [a.enemies, a.eBullets, a.pBullets].forEach((pool) => pool.forEach((o) => { o.active = false; }));
      p.x = 200; p.y = 300; p.aim = 0; p.hp = a.stats.maxHp; a.state = 'play'; a.down = false;
      const es = [90, 150, 210].map((dx) => { const e = a.spawnEnemy('ring', p.x + dx, p.y); e.cd = 999; e.spdMul = 0; e.hp = 50; e.maxHp = 50; return e; });
      a.setHeroWeapon(MMWeapons.resolve(cls, id, 3));
      for (let i = 0; i < 90; i++) { if (i % 12 === 0) a._firePlayerVolley(0); a._updateBullets(1 / 60); a._updateWeapon(1 / 60); }
      a._draw();
      out.push({ id, dmg: es.reduce((s, e) => s + (50 - e.hp), 0) });
    });
    a.setHeroWeapon(null); [a.enemies, a.pBullets].forEach((pool) => pool.forEach((o) => { o.active = false; }));
    return out;
  });
  check('all 26 styles fire and deal damage', all.length === 26 && all.every((r) => r.dmg > 0), JSON.stringify(all.filter((r) => !(r.dmg > 0))));
  await R.ctx.close();

  // (2) hammer_throw: the boomerang returns to the hero (ends within 16 px).
  const P = await open(browser, 'paladin'); errs.push(...P.errors);
  await prep(P.page);
  check('paladin can take hammer_throw', await equip(P.page, 'paladin', 'hammer_throw') === true);
  const hb = await P.page.evaluate(() => {
    const a = window.__mm.arena, p = a.player; a.pBullets.forEach((b) => { b.active = false; });
    a._firePlayerVolley(0);
    const b = a.pBullets.find((x) => x.active);
    let far = 0, last = null, frames = 0;
    for (let i = 0; i < 120 && b.active; i++) { a._updateBullets(1 / 60); frames++; if (b.active) { last = { x: b.x, y: b.y }; far = Math.max(far, b.x - p.x); } }
    return { far, end: Math.hypot(last.x - p.x, last.y - p.y), frames, gone: !b.active };
  });
  check('hammer_throw flies out and comes back to within 16 px of the hero', hb.far > 150 && hb.gone && hb.end <= 16 + 580 / 60, JSON.stringify(hb));
  const hb2 = await P.page.evaluate(() => {
    const a = window.__mm.arena, p = a.player; a.pBullets.forEach((b) => { b.active = false; });
    a._firePlayerVolley(0);
    const b = a.pBullets.find((x) => x.active); let back = false, turnAge = 0;
    for (let i = 0; i < 120 && b.active; i++) { a._updateBullets(1 / 60); if (b.bk && !back) { back = true; turnAge = b.age; } }
    return { back, turnAge, endD: Math.hypot(b.x - p.x, b.y - p.y), gone: !b.active };
  });
  check('hammer_throw turns back at half life and ends within 16 px of the hero', hb2.back && Math.abs(hb2.turnAge - 0.55) < 0.02 && hb2.gone && hb2.endD <= 16, JSON.stringify(hb2));
  const ph = await P.page.evaluate(() => { const a = window.__mm.arena; const keep = a.team; a.team = { isPvp: true, ev() {} }; a.pBullets.forEach((b) => { b.active = false; }); a._firePlayerVolley(0); const bs = a.pBullets.filter((b) => b.active); a.team = keep; return { n: bs.length, ws: bs.some((b) => b.ws) }; });
  check('duels stay plain (no weapon style)', ph.n === 1 && !ph.ws, JSON.stringify(ph));
  await P.ctx.close();

  // (3) star_bounce: survives one wall hit (tile wall), a plain bolt does not.
  const S = await open(browser, 'shadowPaw'); errs.push(...S.errors);
  await prep(S.page, 200, 220);
  check('shadowPaw can take star_bounce', await equip(S.page, 'shadowPaw', 'star_bounce') === true);
  const sb = await S.page.evaluate(() => {
    const a = window.__mm.arena;
    const rows = []; for (let r = 0; r < 14; r++) rows.push('..........#.....'); // a wall column at x 400..440
    a.setWalls(rows);
    a.pBullets.forEach((b) => { b.active = false; });
    a._firePlayerVolley(0);
    const bs = a.pBullets.filter((x) => x.active);
    let alive = 0, bounced = 0, leftward = 0;
    for (let i = 0; i < 30; i++) a._updateBullets(1 / 60);
    bs.forEach((b) => { if (b.active) alive++; if (b.bc >= 1) bounced++; if (b.active && b.vx < 0) leftward++; });
    a.setHeroWeapon(null); a.pBullets.forEach((b) => { b.active = false; });
    a._firePlayerVolley(0);
    const pb = a.pBullets.find((x) => x.active);
    for (let i = 0; i < 30; i++) a._updateBullets(1 / 60);
    const plainDead = !pb.active;
    a.setWalls(null);
    return { n: bs.length, alive, bounced, leftward, plainDead };
  });
  check('star_bounce stars survive one wall hit and fly back', sb.n === 2 && sb.alive === 2 && sb.bounced === 2 && sb.leftward === 2, JSON.stringify(sb));
  check('a plain bolt still dies on the same wall', sb.plainDead, JSON.stringify(sb));
  const draw = await S.page.evaluate(() => {
    const a = window.__mm.arena; a.setHeroWeapon(MMWeapons.resolve('shadowPaw', 'star_bounce', 0)); a.pBullets.forEach((b) => { b.active = false; });
    a._firePlayerVolley(0); a._draw(); a._draw(); const n1 = a._wCache ? a._wCache.size() : -1;
    for (let i = 0; i < 10; i++) a._draw(); const n2 = a._wCache ? a._wCache.size() : -1;
    return { n1, n2 };
  });
  check('code-drawn shapes are cached (no new canvases while drawing the same bolts)', draw.n1 >= 1 && draw.n2 === draw.n1, JSON.stringify(draw));
  await S.ctx.close();

  // (4) a save holding wpn_bow_leaf keeps it and writes it back. Since S12 the 26 known styles are real weapon items, so the stale-tab
  // tolerance is checked with a wpn_ id this build does not know (wpn_zz_future): kept, inert, never equipped.
  const realm = { shards: 5, level: 2, xp: 0, items: [{ n: 1, id: 'wpn_bow_leaf', r: 1 }, { n: 2, id: 'sparkwand', r: 0 }, { n: 3, id: 'wpn_X', r: 0 }, { n: 4, id: 'bogus', r: 0 }, { n: 5, id: 'wpn_zz_future', r: 0 }], nextUid: 6, eq: { weapon: 5 } };
  const Sv = await open(browser, 'ranger', '', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, realm); errs.push(...Sv.errors);
  const sv = await Sv.page.evaluate(([k]) => {
    const a = window.__mm.arena;
    const ids = a.save.items.map((it) => it.id);
    const eq = a.save.eq.weapon || 0;
    const eqOk = a.equip(5) === false && !a.save.eq.weapon;
    a.setPaused(true); const html = (document.getElementById('realm-backpack-body') || {}).innerHTML || '';
    a.setPaused(false);
    a.onSave(a.save);
    const stored = JSON.parse(localStorage.getItem(k)).realm.items.map((it) => it.id);
    return { ids, eq, eqOk, listed: /Leaf Volley/.test(html) && /Zz Future/.test(html), stored, scroll: document.documentElement.scrollWidth <= window.innerWidth };
  }, [SAVE]);
  check('a save holding wpn_bow_leaf keeps it (bad ids still dropped)', sv.ids.join() === 'wpn_bow_leaf,sparkwand,wpn_zz_future', JSON.stringify(sv));
  check('the inert wpn_ item is never equipped', sv.eq === 0 && sv.eqOk, JSON.stringify(sv));
  check('the inert item shows in the backpack and survives a save write', sv.listed && sv.stored.indexOf('wpn_bow_leaf') >= 0 && sv.stored.indexOf('wpn_zz_future') >= 0, JSON.stringify(sv));
  check('390x844 phone: no horizontal scroll', sv.scroll);
  await Sv.ctx.close();

  // ?weapons=0: setHeroWeapon is ignored, today's fire.
  const Off = await open(browser, 'ranger', '&weapons=0'); errs.push(...Off.errors);
  await prep(Off.page);
  const offOk = await equip(Off.page, 'ranger', 'bow_triple');
  const ov = await volley(Off.page);
  check('?weapons=0 ignores the weapon spec (one plain bolt)', offOk === false && ov.length === 1 && ov[0].dmg === 1 && !ov[0].ws, JSON.stringify(ov));
  await Off.ctx.close();

  check('no console errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})();
