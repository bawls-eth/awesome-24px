// Boss art in the Mad Maze arena (setBossArt + MMArt.BOSS_MAP / bossArtFor). Serve the repo root first:  python3 -m http.server 8440 &
// Run: NODE_PATH=$(npm root -g) node game/tests/boss-art.test.js   (own origin only, no Firebase)
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
const dbg = (page) => page.evaluate(() => { const d = window.__mm.arena._bossDbg; return d && JSON.parse(JSON.stringify(d)); });
// Park the run (no waves, hero untouchable) and spawn the boss of the given wave.
const spawnBoss = (page, wave) => page.evaluate((w) => {
  const a = window.__mm.arena; a._enemyDbgOn = true; a.player.iframes = 1e9; a.player.hp = 1e9; a.nextWaveIn = 1e9;
  a.player.x = a.W / 2; a.player.y = a.H - 80;
  a.enemies.forEach((e) => { e.active = false; }); a.eBullets.forEach((b) => { b.active = false; });
  a.run.wave = w; const e = a._spawnBoss(); e.invuln = 0; e.cd = 99; e.cd2 = 99; a._bossDbg = null; return !!e;
}, wave);
async function waitAction(page, want, ms = 1500) {
  let d = null;
  for (let i = 0; i < ms / 30; i++) { await page.waitForTimeout(30); d = await dbg(page); if (d && d.action === want) return d; }
  return d;
}

async function suite(label, opts) {
  const browser = await chromium.launch();
  const T = (s) => `${label}: ${s}`;
  const P = await open(browser, opts);
  const { page } = P;
  await page.waitForFunction(() => window.__mm.arena._bossArt && window.__mm.arena._bossArt.has('void_oracle'), null, { timeout: 10000 });
  check(T('boss art attached; only void_oracle (tier 0) strips loaded, idle/move/attack_a/attack_b/hit/death'), await page.evaluate(() => {
    const r = window.__mm.arena._bossArt.registry; const acts = new Set(); Object.keys(r).forEach((c) => Object.keys(r[c]).forEach((k) => acts.add(k.split('_down')[0])));
    return Object.keys(r).join(',') === 'void_oracle' && [...acts].sort().join(',') === 'attack_a,attack_b,death,hit,idle,move';
  }));
  check(T('BOSS_MAP is deterministic: tier 0 void_oracle, 8 distinct bosses, wraps, bad input never throws'), await page.evaluate(() => {
    const ids = []; for (let t = 0; t < 8; t++) ids.push(MMArt.bossArtFor(t));
    return MMArt.bossArtFor(0) === 'void_oracle' && new Set(ids).size === 8 && MMArt.bossArtFor(8) === 'void_oracle' && MMArt.bossArtFor(9) === ids[1] && ids.every((x) => MMArt.BOSS_MAP.includes(x))
      && MMArt.bossArtFor(undefined) === 'void_oracle' && MMArt.bossArtFor(-3) === 'void_oracle' && MMArt.bossArtFor('x') === 'void_oracle' && MMArt.bossArtFor(NaN) === 'void_oracle' && MMArt.bossArtFor({}) === 'void_oracle' && MMArt.bossArtFor(1.9) === ids[1];
  }));
  await spawnBoss(page, 5);

  // Art pixels differ from the procedural Gloomheart, offscreen and on the arena canvas.
  const px = await page.evaluate(() => {
    const a = window.__mm.arena; const e = a._boss(); e.t = 0.5;
    const sig = (fn) => { const c = document.createElement('canvas'); c.width = 240; c.height = 240; const g = c.getContext('2d'); g.translate(120 - e.x, 120 - e.y); fn(g); const d = g.getImageData(0, 0, 240, 240).data; let n = 0, h = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3]) { n++; h = (h * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7) % 1000003; } return { n, h }; };
    const art = sig((g) => a._drawBossArt(g, e)); const spr = a.sprites.boss; const proc = sig((g) => g.drawImage(spr, e.x - spr.width / 2, e.y - spr.height / 2));
    return { art, proc };
  });
  check(T('boss art pixels differ from the procedural sprite'), px.art.n > 500 && px.art.h !== px.proc.h, JSON.stringify(px));
  const region = (hide) => page.evaluate(async (hide) => {
    const a = window.__mm.arena; const keep = a._bossArt; if (hide) a._bossArt = null;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const e = a._boss(); const c = a.canvas; const k = c.width / a.W; const x = Math.max(0, Math.round((e.x - 70) * k)), y = Math.max(0, Math.round((e.y - 70) * k)), w = Math.round(140 * k);
    const d = c.getContext('2d').getImageData(x, y, w, w).data; let h = 0; for (let i = 0; i < d.length; i += 4) h = (h * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7) % 1000003;
    a._bossArt = keep; return h;
  }, hide);
  check(T('arena canvas region differs with boss art on vs off'), (await region(false)) !== (await region(true)));
  // size: visible body about 3x the collision radius wide
  const size = await page.evaluate(() => {
    const a = window.__mm.arena; const e = a._boss(); const c = document.createElement('canvas'); c.width = 400; c.height = 400; const g = c.getContext('2d'); g.translate(200 - e.x, 200 - e.y); a._drawBossArt(g, e);
    const d = g.getImageData(0, 0, 400, 400).data; let x0 = 999, x1 = -1, y1 = -1; for (let y = 0; y < 400; y++) for (let x = 0; x < 400; x++) if (d[(y * 400 + x) * 4 + 3] > 20) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return { w: x1 - x0 + 1, feetBelow: y1 - 200 };
  });
  check(T('visible body is roughly 3x the collision radius (60..140 px wide), feet below the centre'), size.w >= 60 && size.w <= 140 && size.feetBelow > 0 && size.feetBelow < 90, JSON.stringify(size));

  // Animations per phase.
  // Reset cooldowns high and let the (artificial) cooldown jump settle, then arm one pattern like a real countdown to zero.
  const fire = async (ph, which) => {
    await page.evaluate((ph) => { const e = window.__mm.arena._boss(); e.phase = ph; e.invuln = 0; e.cd = 99; e.cd2 = 99; }, ph);
    await page.waitForTimeout(650);
    await page.evaluate((which) => { const a = window.__mm.arena; a._bossDbg = null; a._boss()[which] = 0.05; }, which);
  };
  let d;
  await page.waitForTimeout(100);
  d = await dbg(page);
  check(T('boss draws with art and reports an action'), d && d.name === 'void_oracle' && ['idle', 'move'].includes(d.action), JSON.stringify(d));
  await page.waitForTimeout(500); d = await dbg(page);
  check(T('moving boss plays move'), d && d.action === 'move', JSON.stringify(d));
  await fire(1, 'cd2'); d = await waitAction(page, 'attack_a');
  check(T('phase 1 aimed fan -> attack_a'), d && d.action === 'attack_a' && d.phase === 1, JSON.stringify(d));
  await fire(2, 'cd'); d = await waitAction(page, 'attack_b');
  check(T('phase 2 ring of 20 -> attack_b'), d && d.action === 'attack_b' && d.phase === 2, JSON.stringify(d));
  await fire(2, 'cd2'); d = await waitAction(page, 'attack_a');
  check(T('phase 2 aimed fan -> attack_a'), d && d.action === 'attack_a', JSON.stringify(d));
  await fire(3, 'cd2'); d = await waitAction(page, 'attack_b');
  check(T('phase 3 ring -> attack_b'), d && d.action === 'attack_b' && d.phase === 3, JSON.stringify(d));
  // hit animation
  await page.evaluate(() => { const a = window.__mm.arena; const e = a._boss(); e.cd = 99; e.cd2 = 99; e.maxHp = e.hp = 1e6; a._hitEnemy(e, 1); a._bossDbg = null; });
  d = await waitAction(page, 'hit', 600);
  check(T('damage plays the hit animation and still lowers hp'), d && d.action === 'hit' && await page.evaluate(() => window.__mm.arena._boss().hp < 1e6), JSON.stringify(d));
  check(T('boss HP bar still shown'), await page.evaluate(() => {
    const a = window.__mm.arena; const e = a._boss(); e.invuln = 1; a._syncBoss(); const shown = !document.getElementById('realm-boss').classList.contains('hidden'); e.invuln = 0; return shown;
  }));
  // pause freezes
  await page.evaluate(() => { const e = window.__mm.arena._boss(); e.phase = 1; e.cd = 99; e.cd2 = 99; });
  await page.waitForTimeout(800); await page.evaluate(() => window.__mm.arena.setPaused(true)); await page.waitForTimeout(300);
  const f1 = await dbg(page); await page.waitForTimeout(600); const f2 = await dbg(page);
  check(T('boss animation frozen while paused'), f1 && f2 && f1.frame === f2.frame && f1.action === f2.action, JSON.stringify([f1, f2]));
  await page.evaluate(() => window.__mm.arena.setPaused(false));

  // Missing strip -> fallback.
  const fb = await page.evaluate(() => {
    const a = window.__mm.arena; const real = a._bossArt; const e = a._boss(); const c = document.createElement('canvas'); c.width = c.height = 300; const g = c.getContext('2d'); const out = {};
    a.setBossArt({ has: () => true, draw: real.draw.bind(real), anim: () => null });
    out.none = a._drawBossArt(g, e);
    a.setBossArt({ has: real.has.bind(real), draw: real.draw.bind(real), anim: (n, ac, di) => (ac === 'attack_b' || ac === 'hit' ? null : real.anim(n, ac, di)) });
    e._bt = e.t; out.partial = a._drawBossArt(g, e); // attack_b missing -> idle strip instead
    a.setBossArt(null); out.off = a._bossArt === null; a.setBossArt({}); out.bad = a._bossArt === null;
    a.setBossArt(real, (id) => MMArt.loadBosses('../../assets/arcane/', [id]).then((s) => real.merge(s))); return out;
  });
  check(T('missing strips: no anims -> false (procedural), missing attack_b -> idle strip, null/garbage detaches'), fb.none === false && fb.partial === true && fb.off && fb.bad, JSON.stringify(fb));

  // Lazy second boss (wave 10 -> tier 1 -> bone_colossus), same wave -> same boss.
  await spawnBoss(page, 10);
  await page.waitForFunction(() => window.__mm.arena._bossArt.has('bone_colossus'), null, { timeout: 10000 });
  await page.waitForTimeout(200); d = await dbg(page);
  check(T('wave 10 lazily loads and draws bone_colossus (only used bosses loaded)'), d && d.name === 'bone_colossus' && await page.evaluate(() => Object.keys(window.__mm.arena._bossArt.registry).sort().join(',') === 'bone_colossus,void_oracle'), JSON.stringify(d));
  await spawnBoss(page, 5); await page.waitForTimeout(200);
  check(T('wave 5 again shows the same boss (void_oracle)'), (await dbg(page)).name === 'void_oracle');

  // Death animation plays after the kill.
  await page.evaluate(() => { const a = window.__mm.arena; const e = a._boss(); e.invuln = 0; a._hitEnemy(e, e.hp + 1); });
  check(T('boss death starts the death animation'), await page.evaluate(() => { const g = window.__mm.arena._bossGhost; return !!g && g.name === 'void_oracle'; }));
  await page.waitForFunction(() => window.__mm.arena._bossGhost === null, null, { timeout: 5000 }).catch(() => {});
  check(T('death animation ends and clears'), await page.evaluate(() => window.__mm.arena._bossGhost === null));
  await page.waitForTimeout(300);
  check(T('no console errors'), P.errors.length === 0, P.errors.join(' | '));
  check(T('no 404s'), P.bad.length === 0, P.bad.join(' | '));
  await P.ctx.close();

  const Z = await open(browser, opts, MAZE + '&bossart=0'); await Z.page.waitForTimeout(1000);
  check(T('?bossart=0 keeps the procedural boss and runs clean'), await Z.page.evaluate(() => window.__mm.arena._bossArt === null) && Z.errors.length === 0);
  await Z.ctx.close();

  const B = await browser.newContext(opts); const bp = await B.newPage(); const be = [];
  bp.on('pageerror', (e) => be.push(e.message));
  await bp.route('**/assets/arcane/**', (r) => r.abort());
  await bp.goto(MAZE); await bp.waitForFunction(() => window.__mm && window.__mm.arena); await bp.waitForTimeout(800);
  check(T('all art requests failing: no boss art, no page errors'), await bp.evaluate(() => window.__mm.arena._bossArt === null || !window.__mm.arena._bossArt.has('void_oracle')) && be.length === 0, be.join('|'));
  await B.close();
  await browser.close();
}

(async () => {
  await suite('desktop', { viewport: { width: 1000, height: 700 } });
  await suite('phone 390x844', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const browser = await chromium.launch();
  const text = async (u) => { const c = await browser.newContext(); const p = await c.newPage(); const r = await p.goto(ORIGIN + u); const t = await r.text(); await c.close(); return t; };
  const [main, index, realm] = [await text('/game/main.js'), await text('/game/index.html'), await text('/game/realm.js')];
  check('town (Realm Gate) never attaches boss art', !/setBossArt|loadBosses|bossArtFor/.test(main) && !/mm-art/.test(index));
  check('realm.js defaults to no boss art (procedural)', /this\._bossArt = null/.test(realm));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
