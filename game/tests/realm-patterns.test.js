// Realm enemy-bolt geometry: what realm.js fires must equal the pure MMPatterns output and the historical values.
const { launch, scene, check, done } = require('./helpers');
const MMP = require('../shared/mm-patterns.js');
const seed = { caveSeed: 0, resources: { stone: 1 }, realm: { shards: 100, bestWave: 2, kills: 5, deaths: 1 } };
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

(async () => {
  const { browser, page, errors } = await launch({ width: 1000, height: 700 }, seed);
  const res = await scene(page, (s) => {
    s.enterRealm(); const r = s.realm; r.stop(); r.active = true;
    const log = [];
    r.fireEnemyBullet = function (x, y, a, sp, kind) { log.push({ a, sp, kind }); };
    r.rng = () => 0.25; // fixed phase = PI/2
    const out = {};
    const run = (type, setup) => {
      log.length = 0;
      r.enemies.forEach((e) => { e.active = false; });
      const e = r.spawnEnemy(type, 300, 200); if (!e) return null;
      r.player.x = 500; r.player.y = 420; r.player.hp = 1e6; r.player.iframes = 1;
      e.cd = 0; e.cd2 = 0; e.angle = 0.5; e.invuln = 0; if (setup) setup(e);
      const x0 = e.x, y0 = e.y;
      r._updateEnemies(0.001);
      const res = { shots: log.slice(), base: Math.atan2(r.player.y - y0, r.player.x - x0), angle: e.angle };
      e.active = false; return res;
    };
    out.ring = run('ring'); out.aimed = run('aimed'); out.spiral = run('spiral');
    for (const ph of [1, 2, 3]) {
      log.length = 0;
      r.enemies.forEach((e) => { e.active = false; });
      const b = r.spawnEnemy('boss', 500, 132); if (!b) continue;
      b.phase = ph; b.invuln = 0; b.cd = 0; b.cd2 = 0; b.angle = 0.5; b.hp = b.maxHp;
      r.player.x = 500; r.player.y = 420; r.player.hp = 1e6; r.player.iframes = 1;
      const x0 = b.x, y0 = b.y; r._updateBoss(b, 0.001);
      out['boss' + ph] = { shots: log.slice(), angle: b.angle };
      b.active = false;
    }
    return out;
  });
  const sh = (o) => (o && o.shots) || [];
  // Ring of 14 (Burster)
  const ring = sh(res.ring);
  check('ring fires 14 bolts', ring.length === 14, String(ring.length));
  const pure14 = MMP.ring(14, { x: 0, y: 0 }, 140, Math.PI / 2);
  check('ring matches pure MMPatterns.ring angles', ring.every((b, i) => close(Math.cos(b.a), pure14[i].vx / 140) && close(Math.sin(b.a), pure14[i].vy / 140)));
  check('ring spacing is 25.714 degrees', ring.every((b, i) => i === 0 || close((b.a - ring[i - 1].a) * 180 / Math.PI, 360 / 14, 1e-6)));
  check('ring phase = rng*2pi and kind 2 speed 140', close(ring[0].a, Math.PI / 2) && ring.every((b) => b.kind === 2 && b.sp === 140));
  // Aimed 3-bolt
  const aim = sh(res.aimed);
  check('aimed fires 3 bolts', aim.length === 3, String(aim.length));
  check('aimed centre bolt is dead on target, kind 0 speed 235', aim.length === 3 && close(aim[1].a, res.aimed.base, 0.2) && aim.every((b) => b.kind === 0 && b.sp === 235));
  check('aimed bolts 0.22 rad apart (spread 0.44)', aim.length === 3 && close(aim[1].a - aim[0].a, 0.22) && close(aim[2].a - aim[1].a, 0.22));
  const pa = MMP.aimed({ x: 0, y: 0 }, { x: 1, y: 0 }, 0.44, 3, { speed: 1 });
  check('aimed offsets match pure MMPatterns.aimed', aim.length === 3 && pa.every((p, i) => close(Math.atan2(p.vy, p.vx) - Math.atan2(pa[1].vy, pa[1].vx), aim[i].a - aim[1].a)));
  // Spiral
  const sp = sh(res.spiral);
  check('spiral fires 1 bolt and steps angle by 0.47', sp.length === 1 && close(res.spiral.angle, 0.97) && close(sp[0].a, 0.97), JSON.stringify(res.spiral));
  // Boss phases
  const b1 = sh(res.boss1);
  check('boss p1: 3 spiral arms 120deg apart then 5-bolt aimed fan 0.18 apart', b1.length === 8 && close(b1[1].a - b1[0].a, 2 * Math.PI / 3) && close(b1[2].a - b1[1].a, 2 * Math.PI / 3) && close(b1[0].a, 0.78) && close(b1[4].a - b1[3].a, 0.18) && close(b1[7].a - b1[3].a, 0.72), JSON.stringify(b1.map((b) => b.a)));
  const b2 = sh(res.boss2);
  check('boss p2: ring of 20 (18 deg) + aimed 3 fan 0.2 apart', b2.length === 23 && b2.slice(0, 20).every((b, i) => i === 0 || close(b.a - b2[i - 1].a, 2 * Math.PI / 20)) && close(b2[21].a - b2[20].a, 0.2), String(b2.length));
  const b3 = sh(res.boss3);
  check('boss p3: double spiral opposite arms + ring of 16 (22.5 deg)', b3.length === 18 && close(b3[1].a - b3[0].a, Math.PI) && close(b3[0].a, 0.9) && b3.slice(2).every((b, i) => i === 0 || close(b.a - b3[i + 1].a, Math.PI / 8)), String(b3.length));
  // Pure generators
  const r12 = MMP.ring(12, { x: 0, y: 0 }, 1, 0);
  check('pure ring 12/20 variants even', r12.length === 12 && MMP.ring(20, { x: 0, y: 0 }, 1, 0).length === 20 && close(wrap(Math.atan2(r12[1].vy, r12[1].vx)), Math.PI / 6));
  check('allocation-free helpers match pure ones', close(MMP.ringAngle(3, 14, 0.2), 0.2 + 3 / 14 * 2 * Math.PI) && close(MMP.aimedAngle(1, 2, 3, 0.44), 1.22) && close(MMP.spiralAngle(0.5, 1, 2), 0.5 + Math.PI));
  check('no page errors', errors.length === 0, errors.join('|'));
  await browser.close();
  done();
})();
