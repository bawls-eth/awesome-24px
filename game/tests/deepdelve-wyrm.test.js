// Deepdelve Rock Wyrm boss. Serve the repo root: python3 -m http.server 8524 &
// Run: BASE=http://localhost:8524/game/index.html NODE_PATH=$(npm root -g) node game/tests/deepdelve-wyrm.test.js
// THREE_JS=<file> serves three.js locally instead of the CDN. No Firebase.
const { chromium } = require('playwright');
const fs = require('fs');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = (q) => ORIGIN + '/game/games/deepdelve/index.html?test=1' + (q || '');
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
const DESKTOP = { viewport: { width: 1000, height: 700 } };
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const all = [];
async function route(page) {
  if (process.env.THREE_JS) await page.route(THREE_URL, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(process.env.THREE_JS) }));
}
async function openIn(ctx, q) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await route(page);
  await page.goto(URL(q));
  await page.waitForFunction(() => window.__dd && window.__dd.ready);
  const o = { ctx, page, errors }; all.push(o); return o;
}
async function open(browser, q, opts) { return openIn(await browser.newContext(opts || DESKTOP), q); }
// Puts the player in the middle of the cavern floor and wakes the boss.
const enter = () => {
  const d = window.__dd, w = d.wyrm, s = w.state.site, M = w.MMDDWyrm;
  d.setPick(3); d.setPos(s.c.x, M.floorY(s) + 0.02, s.c.z); d.player.iframes = 0; d.player.hp = 10;
  return { woke: w.scan(), site: s };
};

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

  // 1. off in ?test=1 unless ?wyrm=1
  const off = await open(browser, '&seed=5');
  const offr = await off.page.evaluate(() => ({ on: window.__dd.wyrm.on, bar: !!document.getElementById('wyrm-bar'), scan: window.__dd.wyrm.scan(), site: window.__dd.wyrm.state.site }));
  check('the wyrm is off in ?test=1 without ?wyrm=1 (no site, no bar, scan does nothing)', offr.on === false && !offr.bar && offr.scan === false && offr.site === null, JSON.stringify(offr));

  // 2. seeded cavern, deep, deterministic
  const A = await open(browser, '&seed=5&wyrm=1');
  const p = A.page;
  const a = await p.evaluate(() => { const d = window.__dd, s = d.wyrm.state.site; return { on: d.wyrm.on, site: s, surf: d.surfaceY(s.wx, s.wz), bar: !!document.getElementById('wyrm-bar'), hidden: document.getElementById('wyrm-bar').hidden }; });
  const B = await open(browser, '&seed=5&wyrm=1');
  const b = await B.page.evaluate(() => window.__dd.wyrm.state.site);
  const C = await open(browser, '&seed=6&wyrm=1');
  const c = await C.page.evaluate(() => window.__dd.wyrm.state.site);
  check('?wyrm=1 turns it on; the cavern site is the same for the same seed and differs for another', a.on && a.bar && JSON.stringify(a.site) === JSON.stringify(b) && JSON.stringify(a.site) !== JSON.stringify(c), JSON.stringify([a.site, b, c]));
  check('the cavern lies 40+ blocks below the surface and the health bar starts hidden', a.site.wy - a.surf >= 40 && a.hidden, JSON.stringify(a));

  // 3. sleeps on the surface and while shallow; wakes deep and near; carves the cavern; exactly one boss
  const w1 = await p.evaluate(() => {
    const d = window.__dd, s = d.wyrm.state.site; d.setPos(64.5, 2, 64.5);
    const surfaceWake = d.wyrm.scan();
    const x = s.wx + 0.5, z = s.wz + 0.5;
    d.setPos(x, -(d.surfaceY(s.wx, s.wz) + 10), z); // right above the cavern but only 10 blocks deep
    const shallow = d.wyrm.scan();
    return { surfaceWake, shallow, awake: d.wyrm.state.awake };
  });
  check('the wyrm stays asleep on the surface and when only 10 blocks deep', !w1.surfaceWake && !w1.shallow && !w1.awake, JSON.stringify(w1));
  const e = await p.evaluate(enter);
  const w2 = await p.evaluate(() => {
    const d = window.__dd, w = d.wyrm, s = w.state.site, again = w.scan();
    return { awake: w.state.awake, hp: w.state.hp, carved: w.state.carved, air: d.getBlock(s.wx, s.wy, s.wz), airEdge: d.getBlock(s.wx + 6, s.wy, s.wz), segs: w.state.segs.length, again, barHidden: document.getElementById('wyrm-bar').hidden, fill: document.getElementById('wyrm-fill').style.width, now: d.world.diffCount() };
  });
  check('deep and near, it wakes with 30 HP and 8 segments and hollows its cavern', e.woke && w2.awake && w2.hp === 30 && w2.segs === 8 && w2.carved && w2.air === 0 && w2.airEdge === 0, JSON.stringify([e.woke, w2]));
  check('only one wyrm is ever active (a second scan changes nothing) and the HP bar is shown at 100%', w2.again === true && !w2.barHidden && w2.fill === '100%', JSON.stringify(w2));

  // 4. phases by HP and the telegraphed dust ring before each lunge
  const ph = await p.evaluate(() => {
    const d = window.__dd, w = d.wyrm, W = w.state, M = w.MMDDWyrm, out = {};
    const label = () => document.getElementById('wyrm-label').textContent;
    W.hp = 30; w.tick(0.01); out.p1 = M.phaseOf(W.hp, W.max);
    W.hp = 15; out.p2 = M.phaseOf(W.hp, W.max); W.hp = 8; out.p3 = M.phaseOf(W.hp, W.max);
    // walk a full phase 1 cycle with the player standing still; the ring must show during telegraph and not otherwise
    W.hp = 30; W.atk = M.newAttack(); d.player.iframes = 0;
    const seen = []; let ringOn = 0, ringOff = 0, telegraphBeforeLunge = true, last = '';
    for (let i = 0; i < 600; i++) {
      d.player.iframes = 0; d.player.hp = 10;
      w.tick(0.02); w.mesh();
      const s = W.atk.s;
      if (s !== last) { seen.push(s); if (s === 'lunge' && last !== 'telegraph') telegraphBeforeLunge = false; last = s; }
      if (s === 'telegraph' && W.ring && W.ring.visible) ringOn++;
      if (s !== 'telegraph' && W.ring && W.ring.visible) ringOff++;
    }
    out.seen = seen.slice(0, 5); out.ringOn = ringOn; out.ringOff = ringOff; out.tbl = telegraphBeforeLunge; out.meshes = W.group ? W.group.children.length : 0;
    W.hp = 15; W.atk = M.newAttack(); W.burrowed = false;
    let sawBurrow = false; for (let i = 0; i < 400; i++) { d.player.iframes = 0; d.player.hp = 10; w.tick(0.02); if (W.atk.s === 'burrow' && W.burrowed) sawBurrow = true; }
    out.burrow = sawBurrow; W.hp = 30; W.burrowed = false; w.state.atk = M.newAttack();
    return out;
  });
  check('HP thirds give phases 1, 2 and 3', ph.p1 === 1 && ph.p2 === 2 && ph.p3 === 3, JSON.stringify(ph));
  check('every lunge is preceded by a telegraph with the dust ring visible, and the ring is hidden otherwise', ph.seen.slice(1, 5).join() === 'telegraph,lunge,recover,circle' && ph.ringOn > 10 && ph.ringOff === 0 && ph.tbl, JSON.stringify(ph));
  check('the wyrm is drawn as 8 body meshes plus the ring (one group) and burrows in phase 2', ph.meshes === 9 && ph.burrow, JSON.stringify(ph));

  // 5. a lunge that lands on the player costs HP; a player who leaves the ring is untouched
  const sl = await p.evaluate(() => {
    const d = window.__dd, w = d.wyrm, W = w.state, M = w.MMDDWyrm, s = W.site, out = {};
    const run = (dodge) => {
      d.setPos(s.c.x - 3, M.floorY(s) + 0.02, s.c.z); d.player.iframes = 0; d.player.hp = 10; W.hp = 30; W.hurtCd = 0;
      W.segs.forEach((g) => { g.x = s.c.x + 6; g.z = s.c.z + 6; g.y = s.c.y; });
      W.atk = { s: 'circle', t: M.T.circle[0] - 0.01, n: 0 }; W.burrowed = false;
      w.tick(0.02); // enters telegraph, locking the ring on the player
      out.locked = W.atk.s === 'telegraph' && Math.hypot(W.tgt.x - (s.c.x - 3), W.tgt.z - s.c.z) < 2;
      if (dodge) d.setPos(s.c.x - 3, M.floorY(s) + 0.02, s.c.z - 6);
      let slam = false;
      for (let i = 0; i < 300 && W.atk.s !== 'recover'; i++) { d.player.iframes = 0; w.tick(0.02); }
      return d.player.hp;
    };
    out.hit = run(false); out.dodged = run(true);
    return out;
  });
  check('a lunge landing in the dust ring hurts (HP drops by 1-2)', sl.locked && sl.hit <= 9 && sl.hit >= 7, JSON.stringify(sl));
  check('stepping out of the ring after the telegraph dodges the slam', sl.dodged === 10, JSON.stringify(sl));

  // 6. melee damage by pick tier + knockback on the boss; invulnerable while burrowed
  const me = await p.evaluate(() => {
    const d = window.__dd, w = d.wyrm, W = w.state, M = w.MMDDWyrm, s = W.site, out = {};
    d.setPos(s.c.x, M.floorY(s) + 0.02, s.c.z); d.player.iframes = 0;
    W.atk = { s: 'recover', t: 0, n: 0 }; W.burrowed = false; W.hurtCd = 9;
    const put = () => { W.segs.forEach((g, i) => { g.x = s.c.x + 1.5 + i * 0.3; g.y = d.player.y + 1; g.z = s.c.z; }); };
    const tryHit = (tier) => { d.setPick(tier); put(); W.hp = 30; d.player.yaw = 0; const x0 = W.segs[0].x; d.wyrm.state.hurtCd = 9; const hit = w.attack(false); return { hit, dmg: 30 - W.hp, push: W.segs[0].x - x0 }; };
    d.player.x = s.c.x; // (attack(false) ignores the view cone)
    out.t0 = tryHit(0); out.t2 = tryHit(2); out.t3 = tryHit(3);
    put(); W.burrowed = true; W.hp = 30; out.burrowedHit = w.attack(false); out.burrowedHp = W.hp; W.burrowed = false;
    out.barNow = (put(), W.hp = 21, w.attack(false), document.getElementById('wyrm-fill').style.width);
    return out;
  });
  check('melee damage follows the pick tier (wood 1, iron 2, gold 3) and the wyrm cannot be hit while burrowed', me.t0.hit && me.t0.dmg === 1 && me.t2.dmg === 2 && me.t3.dmg === 3 && me.burrowedHit === false && me.burrowedHp === 30, JSON.stringify(me));
  check('a hit knocks the head back from the player and the HP bar follows', me.t3.push > 0.2 && me.barNow === '60%', JSON.stringify(me));

  // 7. far away: frozen and unmeshed, bar hidden, HP kept
  const fr = await p.evaluate(() => {
    const d = window.__dd, w = d.wyrm, W = w.state; W.hp = 22; w.mesh();
    const had = !!W.group;
    d.setPos(2.5, -d.surfaceY(2, 2), 2.5); w.scan(); w.mesh();
    const asleep = { awake: W.awake, group: !!W.group, hidden: document.getElementById('wyrm-bar').hidden, hp: W.hp };
    const x0 = W.segs[0].x; w.tick(1); asleep.frozen = W.segs[0].x === x0;
    return { had, asleep };
  });
  check('beyond 60 blocks the wyrm is frozen: no mesh, no ticking, bar hidden, HP kept', fr.had && !fr.asleep.awake && !fr.asleep.group && fr.asleep.hidden && fr.asleep.hp === 22 && fr.asleep.frozen, JSON.stringify(fr));

  // 8. defeat: scale drop, trophy flag saved additively, and it stays down after a reload (same storage)
  const df = await p.evaluate(() => {
    const d = window.__dd, w = d.wyrm, W = w.state; d.inv.wyrm_scale = 0;
    window.__e = null;
    return null;
  });
  await p.evaluate(enter);
  const kill = await p.evaluate(async () => {
    const d = window.__dd, w = d.wyrm, W = w.state, M = w.MMDDWyrm, s = W.site;
    d.setPick(3); W.hp = 2; W.atk = { s: 'recover', t: 0, n: 0 }; W.burrowed = false; W.hurtCd = 9;
    W.segs.forEach((g, i) => { g.x = s.c.x + 1.5; g.y = d.player.y + 1; g.z = s.c.z; });
    const hit = w.attack(false);
    await d.flush();
    return { hit, down: W.down, awake: W.awake, scale: d.inv.wyrm_scale, again: w.scan(), seedTxt: document.getElementById('hud-seed').textContent, barHidden: document.getElementById('wyrm-bar').hidden };
  });
  check('defeat drops a wyrm scale, sets the trophy, hides the bar, and it cannot re-wake', kill.hit && kill.down && !kill.awake && kill.scale === 1 && kill.again === false && kill.barHidden && /Wyrm trophy/.test(kill.seedTxt), JSON.stringify(kill));
  const R = await openIn(A.ctx, '&seed=5&wyrm=1');
  const rl = await R.page.evaluate(() => {
    const d = window.__dd, w = d.wyrm; const r = w.MMDDWyrm, s = w.state.site;
    d.setPos(s.c.x, r.floorY(s) + 0.02, s.c.z);
    return { down: w.state.down, carved: w.state.carved, scale: d.inv.wyrm_scale | 0, scan: w.scan(), awake: w.state.awake, plain: JSON.stringify(Object.keys(d.inv).includes('wood')) };
  });
  check('after a reload the trophy and the scale persist and the wyrm stays down; old save keys still load', rl.down && rl.carved && rl.scale === 1 && !rl.scan && !rl.awake && rl.plain === 'true', JSON.stringify(rl));
  const fresh = await open(browser, '&seed=5&wyrm=1');
  const fw = await fresh.page.evaluate(() => { const d = window.__dd; return { down: d.wyrm.state.down, scale: d.inv.wyrm_scale | 0 }; });
  check('a fresh world (new storage) has the wyrm again', fw.down === false && fw.scale === 0, JSON.stringify(fw));

  // 9. corrupt wyrm save data falls back to defaults
  const bad = await browser.newContext(DESKTOP);
  const badPage = await bad.newPage(); await route(badPage);
  await badPage.addInitScript(() => { });
  const BP = await openIn(bad, '&seed=9&wyrm=1');
  await BP.page.evaluate(async () => { const d = window.__dd; d.inv.stone = 3; });
  // write a corrupt doc straight into the player save through the app's own flush, then patch the stored JSON
  const corrupt = await BP.page.evaluate(async () => {
    const d = window.__dd; await d.flush();
    return new Promise((res) => {
      const req = indexedDB.open('pixeltown-deepdelve-v1', 1);
      req.onsuccess = () => {
        const tx = req.result.transaction('kv', 'readwrite'), st = tx.objectStore('kv');
        const g = st.get('player:9');
        g.onsuccess = () => { const o = JSON.parse(g.result); o.wyrm = 'garbage'; st.put(JSON.stringify(o), 'player:9'); tx.oncomplete = () => res(true); };
      };
      req.onerror = () => res(false);
    });
  });
  const BP2 = await openIn(bad, '&seed=9&wyrm=1');
  const cr = await BP2.page.evaluate(() => ({ down: window.__dd.wyrm.state.down, carved: window.__dd.wyrm.state.carved, stone: window.__dd.inv.stone }));
  check('a corrupt wyrm key in the save is ignored (defaults) and the rest still loads', corrupt && cr.down === false && cr.carved === false && cr.stone === 3, JSON.stringify([corrupt, cr]));

  // 10. phone: the bar fits the viewport, no sideways scroll
  const P = await open(browser, '&seed=5&wyrm=1', PHONE);
  await P.page.evaluate(enter);
  await P.page.waitForTimeout(300);
  const pv = await P.page.evaluate(() => {
    const b = document.getElementById('wyrm-bar'), r = b.getBoundingClientRect();
    window.__dd.wyrm.mesh();
    return { hidden: b.hidden, left: r.left, right: r.right, w: r.width, vw: window.innerWidth, sw: document.documentElement.scrollWidth, group: !!window.__dd.wyrm.state.group };
  });
  check('390x844: the wyrm bar is visible inside the viewport, the boss is meshed and nothing scrolls sideways', !pv.hidden && pv.left >= 0 && pv.right <= pv.vw && pv.w > 200 && pv.sw <= pv.vw && pv.group, JSON.stringify(pv));

  // 11. no Math.random in the boss section
  const src = fs.readFileSync(__dirname + '/../games/deepdelve/deepdelve.js', 'utf8');
  const sec = src.slice(src.indexOf('// ---------- Rock Wyrm boss (seeded)'), src.indexOf('// ---------- test hooks'));
  check('the boss section has no Math.random', sec.length > 3000 && !/Math\.random/.test(sec));

  const errs = [].concat(...all.map((o) => o.errors));
  check('no console errors', errs.length === 0, JSON.stringify(errs));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
