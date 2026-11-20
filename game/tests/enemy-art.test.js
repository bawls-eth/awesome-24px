// Enemy art in the Mad Maze arena (setEnemyArt + MMArt.ENEMY_MAP). Serve the repo root first:  python3 -m http.server 8440 &
// Run: NODE_PATH=$(npm root -g) node game/tests/enemy-art.test.js   (own origin only, no Firebase)
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const MAZE = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1';

async function open(browser, opts, url) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [], bad = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  await page.goto(url || MAZE);
  await page.waitForFunction(() => window.__mm && window.__mm.arena);
  return { ctx, page, errors, bad };
}
// Park the run: no wave spawns, player untouchable, enemies cleared.
const park = (page) => page.evaluate(() => {
  const a = window.__mm.arena; a._enemyDbgOn = true; a.player.iframes = 1e9; a.player.hp = 1e9; a.nextWaveIn = 1e9;
  a.player.x = a.W / 2; a.player.y = a.H / 2;
  a.enemies.forEach((e) => { e.active = false; }); a.eBullets.forEach((b) => { b.active = false; });
});
const spawn = (page, type, dx, dy, extra) => page.evaluate(([t, dx, dy, ex]) => {
  const a = window.__mm.arena; const e = a.spawnEnemy(t, a.player.x + dx, a.player.y + dy); Object.assign(e, ex || {}); window.__e = e; return a.enemies.indexOf(e);
}, [type, dx, dy, extra]);
const dbg = (page) => page.evaluate(() => { const d = window.__mm.arena._enemyDbg; return d && JSON.parse(JSON.stringify(d)); });
const clear = (page) => page.evaluate(() => { const a = window.__mm.arena; a.enemies.forEach((e) => { e.active = false; }); a._enemyDbg = null; });

async function suite(label, opts) {
  const browser = await chromium.launch();
  const T = (s) => `${label}: ${s}`;
  const P = await open(browser, opts);
  await P.page.waitForFunction(() => window.__mm.arena._enemyArt, null, { timeout: 8000 });
  await park(P.page);
  check(T('enemy art attached after load'), await P.page.evaluate(() => !!window.__mm.arena._enemyArt));
  check(T('only idle/move/attack (+ death, down/right only) strips are loaded for mapped creatures'), await P.page.evaluate(() => { const r = window.__mm.arena._enemyArt.registry; const names = Object.keys(r).sort().join(','); const acts = new Set(); Object.keys(r).forEach((c) => Object.keys(r[c]).forEach((k) => acts.add(k.split('_')[0]))); return names === 'archer,beetle,dark_spider,moth,mothling,puffcap,sprout' && [...acts].sort().join(',') === 'attack,death,idle,move' && !Object.keys(r).some((c) => Object.keys(r[c]).some((k) => k.startsWith('death_') && !/_(down|right)$/.test(k))); }));
  check(T('ENEMY_MAP covers spiral/aimed/ring and not the boss; helper never throws'), await P.page.evaluate(() => MMArt.enemyArtFor('spiral') === 'moth' && MMArt.enemyArtFor('aimed') === 'archer' && MMArt.enemyArtFor('ring') === 'puffcap' && MMArt.enemyArtFor('boss') === null && MMArt.enemyArtFor(undefined) === null && MMArt.enemyArtFor('__proto__') === null && MMArt.drifterArtFor({}) === null));

  // Each mapped type draws pixels that differ from the procedural sprite.
  for (const type of ['spiral', 'aimed', 'ring']) {
    const r = await P.page.evaluate((t) => {
      const a = window.__mm.arena; a.enemies.forEach((e) => { e.active = false; });
      const e = a.spawnEnemy(t, 100, 100); e.cd = 99; e.t = 0.5;
      const sig = (fn) => { const c = document.createElement('canvas'); c.width = 200; c.height = 200; const g = c.getContext('2d'); g.translate(100 - e.x, 100 - e.y); fn(g); const d = g.getImageData(0, 0, 200, 200).data; let n = 0, h = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3]) { n++; h = (h * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7) % 1000003; } return { n, h }; };
      const art = sig((g) => a._drawEnemyArt(g, e, { r: { spiral: 17, aimed: 13, ring: 15 }[t] }));
      const spr = a.sprites[t]; const proc = sig((g) => g.drawImage(spr, e.x - spr.width / 2, e.y - spr.height / 2));
      e.active = false; return { art, proc };
    }, type);
    check(T(`${type} art differs from the procedural sprite`), r.art.n > 100 && r.art.h !== r.proc.h, JSON.stringify(r));
  }

  // Arena canvas really shows the art (region pixels change when the art is detached).
  await clear(P.page); await spawn(P.page, 'ring', 0, -120, { cd: 99 });
  const region = (hide) => P.page.evaluate(async (hide) => {
    const a = window.__mm.arena; const keep = a._enemyArt; if (hide) a._enemyArt = null;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const e = window.__e; const c = a.canvas; const k = c.width / a.W; const x = Math.round((e.x - 40) * k), y = Math.round((e.y - 40) * k), w = Math.round(80 * k);
    const d = c.getContext('2d').getImageData(x, y, w, w).data; let h = 0; for (let i = 0; i < d.length; i += 4) h = (h * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7) % 1000003;
    a._enemyArt = keep; return h;
  }, hide);
  const withArt = await region(false), without = await region(true);
  check(T('arena canvas pixels differ with enemy art on vs off'), withArt !== without);

  // idle -> move
  await clear(P.page); await spawn(P.page, 'ring', 0, 90, { cd: 99 }); // within 150: stands still
  await P.page.waitForTimeout(500);
  let d = await dbg(P.page);
  check(T('stationary enemy plays idle'), d && d.name === 'puffcap' && d.action === 'idle', JSON.stringify(d));
  await P.page.evaluate(() => { window.__e.x = window.__mm.arena.player.x + 100; window.__e.y = window.__mm.arena.player.y - 200; });
  await P.page.waitForTimeout(500);
  d = await dbg(P.page);
  check(T('moving enemy switches idle -> move'), d && d.action === 'move', JSON.stringify(d));
  // left movement mirrors, right does not
  await clear(P.page); await spawn(P.page, 'ring', 300, 0, { cd: 99 }); await P.page.waitForTimeout(500);
  d = await dbg(P.page);
  check(T('enemy approaching from the right (moving left) is mirrored'), d && d.dir === 'right' && d.flip === true, JSON.stringify(d));
  await clear(P.page); await spawn(P.page, 'ring', -300, 0, { cd: 99 }); await P.page.waitForTimeout(500);
  d = await dbg(P.page);
  check(T('enemy approaching from the left (moving right) is not mirrored'), d && d.dir === 'right' && d.flip === false, JSON.stringify(d));
  // attack after a shot
  await clear(P.page); await spawn(P.page, 'ring', 0, 90, { cd: 0.5 });
  let sawAttack = false;
  for (let i = 0; i < 25 && !sawAttack; i++) { await P.page.waitForTimeout(40); d = await dbg(P.page); sawAttack = !!d && d.action === 'attack'; }
  check(T('attack animation plays after the enemy fires'), sawAttack, JSON.stringify(d));
  await P.page.waitForTimeout(600); d = await dbg(P.page);
  check(T('attack returns to idle/move afterwards'), d && d.action !== 'attack', JSON.stringify(d));
  // hit flash + hp reduction still work; pause freezes the animation
  const hit = await P.page.evaluate(() => { const a = window.__mm.arena; const e = window.__e; e.maxHp = 50; e.hp = 50; a._hitEnemy(e, 1); return e.flash > 0 && e.hp < e.maxHp; });
  check(T('hit flash and hp reduction still happen'), hit);
  await P.page.evaluate(() => window.__mm.arena.setPaused(true)); await P.page.waitForTimeout(300);
  const f1 = (await dbg(P.page)).frame; await P.page.waitForTimeout(500); const f2 = (await dbg(P.page)).frame;
  check(T('animation is frozen while paused'), f1 === f2, f1 + ' vs ' + f2);
  await P.page.evaluate(() => window.__mm.arena.setPaused(false));

  // missing strip keeps the fallback; boss stays procedural
  const fb = await P.page.evaluate(() => {
    const a = window.__mm.arena; const real = a._enemyArt; const out = {};
    a.setEnemyArt({ anim: (n, ac, di) => (n === 'moth' ? null : real.anim(n, ac, di)), draw: real.draw.bind(real), registry: real.registry });
    const c = document.createElement('canvas'); c.width = c.height = 300; const g = c.getContext('2d');
    const m = a.spawnEnemy('spiral', 100, 100), r = a.spawnEnemy('ring', 100, 100), b = a.spawnEnemy('boss', 100, 100);
    out.moth = a._drawEnemyArt(g, m, { r: 17 }); out.ring = a._drawEnemyArt(g, r, { r: 15 });
    out.boss = a._enemyMap.boss === undefined;
    [m, r, b].forEach((e) => { e.active = false; });
    a.setEnemyArt(null); out.off = a._enemyArt === null && a._enemyMap === null;
    a.setEnemyArt({}); out.bad = a._enemyArt === null;
    a.setEnemyArt(real); return out;
  });
  check(T('missing moth strip -> fallback (false), other strips still draw, boss unmapped, null/garbage detaches'), fb.moth === false && fb.ring === true && fb.boss && fb.off && fb.bad, JSON.stringify(fb));
  await P.page.waitForTimeout(400);
  check(T('no console errors'), P.errors.length === 0, P.errors.join(' | '));
  check(T('no 404s'), P.bad.length === 0, P.bad.join(' | '));
  await P.ctx.close();

  // enemy art disabled via the page flag: nothing attaches, arena still runs
  const Z = await open(browser, opts, MAZE + '&enemyart=0'); await Z.page.waitForTimeout(800);
  check(T('?enemyart=0 keeps the procedural sprites and runs clean'), await Z.page.evaluate(() => window.__mm.arena._enemyArt === null) && Z.errors.length === 0);
  await Z.ctx.close();

  // all art requests failing stays silent
  const B = await browser.newContext(opts); const bp = await B.newPage(); const be = [];
  bp.on('pageerror', (e) => be.push(e.message));
  await bp.route('**/assets/arcane/**', (r) => r.abort());
  await bp.goto(MAZE); await bp.waitForFunction(() => window.__mm && window.__mm.arena); await bp.waitForTimeout(800);
  check(T('all art requests failing: fallback, no page errors'), await bp.evaluate(() => window.__mm.arena._enemyArt === null && window.__mm.arena.state !== 'idle') && be.length === 0, be.join('|'));
  await B.close();
  await browser.close();
}

(async () => {
  await suite('desktop', { viewport: { width: 1000, height: 700 } });
  await suite('phone 390x844', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  // the town never attaches enemy art
  const browser = await chromium.launch();
  const text = async (u) => { const c = await browser.newContext(); const p = await c.newPage(); const r = await p.goto(ORIGIN + u); const t = await r.text(); await c.close(); return t; };
  const [main, index, realm] = [await text('/game/main.js'), await text('/game/index.html'), await text('/game/realm.js')];
  check('town main.js and index.html never reference enemy art or mm-art', !/setEnemyArt|MMArt|loadEnemies/.test(main) && !/mm-art/.test(index));
  check('realm.js defaults to no enemy art (procedural)', /this\._enemyArt = null/.test(realm));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
