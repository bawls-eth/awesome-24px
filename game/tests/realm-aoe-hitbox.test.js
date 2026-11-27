// cyc16 (owner: "hit box smaller than enemy often"): every player-side area hit in the Realm reaches the enemy's DRAWN body, like bolts
// (_hitR = _er x 1.3 + 2; the art is drawn 2.8 x _er wide). Before, the lob landing, signature AoE and bone orbit all used
// the smaller _er, so an enemy whose drawn body sat inside the ring was not hit. For a boss (_er 34) and a sniper (_er 13):
//  - an enemy at r + 1.2 x _er (inside its drawn half-width 1.4 x _er) IS hit by each path;
//  - an enemy at r + 1.45 x _er + 3 (outside the drawn body) is NOT hit (no over-reach).
// (Bolt splash is NOT changed here: its falloff damage is measured from _er, a balance number gear-splash-player pins; see cycle16-lead.md.)
// Runs on the standalone Mad Maze page (offline, no Firebase). Serve the repo root first.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/realm-aoe-hitbox.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(URL);
  await page.waitForFunction(() => window.__mm && window.__mm.arena);
  await page.waitForTimeout(300);
  const res = await page.evaluate(() => {
    const r = window.__mm.arena; cancelAnimationFrame(r._raf); r.active = true; r.state = 'play'; r.run.wave = 1; r.player.hp = 1e6; r.player.iframes = 1e6;
    r.player.x = 120; r.player.y = 120;
    const clear = () => { r.enemies.forEach((e) => { e.active = false; }); r.pBullets.forEach((b) => { b.active = false; }); r.eBullets.forEach((b) => { b.active = false; }); };
    const X0 = 500, Y0 = 380;
    // put one enemy of `type` at X0 + off and report whether `fire` damaged it
    const one = (type, off, fire) => {
      clear(); const e = r.spawnEnemy(type, X0 + off, Y0); if (!e) return { err: 'spawn' };
      e.rad = 0; e.invuln = 0; e.hp = 1e5; e.x = X0 + off; e.y = Y0; e.vx = 0; e.vy = 0; const h0 = e.hp;
      fire(); return { hit: e.hp < h0, er: r._er(e) };
    };
    const er = { boss: 34, aimed: 13 };
    const paths = {
      lob: { r: 40, fire: () => r._lobLand({ ws: { shape: 'dot', lob: { radius: 40 } }, dmg: 1, st: 0, cr: 0 }, X0, Y0) },
      sigAoe: { r: 60, fire: () => r._sigAoe(X0, Y0, 60, 1, 0, 1, 0) },
    };
    const out = {};
    for (const p of Object.keys(paths)) for (const t of Object.keys(er)) {
      const R = paths[p].r, E = er[t];
      out[p + '.' + t] = { inBody: one(t, R + 1.2 * E, paths[p].fire), outside: one(t, R + 1.45 * E + 3, paths[p].fire) };
    }
    // bone orbit: one bone at angle 0 sits at player.x + radius; the enemy just right of it
    const bones = (t, off) => {
      clear(); const s = r.sig; const g = r.sg; r.player.x = X0; r.player.y = Y0;
      const e = r.spawnEnemy(t, 0, 0); e.rad = 0; e.invuln = 0; e.hp = 1e5; e.boneT = 0; e.vx = 0; e.vy = 0; const h0 = e.hp;
      const R = s && s.radius > 0 ? s.radius : 70; if (s) s.radius = R;
      e.x = X0 + R + off; e.y = Y0;
      g.bones.t = 1; g.bones.n = 1; g.bones.a = 0; g.bones.frac = 0; g.bones.heal = 0;
      try { r._sigOn = () => true; r._updateSignature(0); } catch (err) { return { err: String(err) }; }
      return { hit: e.hp < h0 };
    };
    if (!r.sig) r.sig = { radius: 70, dmg: 1 }; // a bone-orbit signature for the test (the page starts with none)
    out.hasUpdateSig = typeof r._updateSignature === "function";
    if (out.hasUpdateSig) for (const t of Object.keys(er)) out['bones.' + t] = { inBody: bones(t, 1.2 * er[t] + 4), outside: bones(t, 1.45 * er[t] + 12) };
    return out;
  });
  for (const k of Object.keys(res)) {
    if (k === 'hasUpdateSig') continue;
    check(k + ': an enemy whose drawn body is inside the area is hit', res[k].inBody && res[k].inBody.hit === true, JSON.stringify(res[k]));
    check(k + ': an enemy outside its drawn body is not hit', res[k].outside && res[k].outside.hit === false, JSON.stringify(res[k]));
  }
  check("every area path was exercised (lob, sigAoe, bones x 2 types)", ["lob", "sigAoe", "bones"].every((p) => res[p + '.boss'] && res[p + '.aimed']), Object.keys(res).join(','));
  check('0 console errors', errors.length === 0, errors.join(' | '));
  check('0 DB requests', db.attempts() === 0, String(db.attempts()));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
