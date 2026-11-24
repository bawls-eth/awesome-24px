// cycle1 L-10 (perf): the Town cave (underground.js) built 3 new THREE.Vector3 per frame for the walk direction, one more
// Vector3 + a THREE.Euler per frame for the look direction in third-person view, and a new THREE.Matrix4 for every block that is
// placed or hidden. They are scratch objects on the world now. three.js is an ES module (its classes cannot be wrapped), so this
// counts the DISTINCT objects that the per-frame maths runs on: a new object per frame shows up as one receiver per frame.
// OFFLINE: helpers.offlineStub (database blocked, Firebase SDK answered empty). Never chats, never writes to Firebase.
// Run: BASE=http://localhost:9711/game/index.html NODE_PATH=$(npm root -g) node game/tests/cave-frame-alloc.test.js
const { chromium } = require('playwright');
const { check, done, offlineStub, exposeGame, joinOffline } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const FRAMES = 120;

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const db = await offlineStub(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await exposeGame(page);
  await page.goto(BASE);
  await joinOffline(page, 'ADMINcave');
  await page.evaluate(() => window.__g.scene.getScene('Town').enterUnderground());
  await page.waitForFunction(() => { const t = window.__g.scene.getScene('Town'); return t.inUnderground && t.underground && typeof THREE !== 'undefined'; }, null, { timeout: 40000 });
  await page.waitForTimeout(1000);

  // 1. walk forward for N cave updates in third-person view; count the distinct objects the walk / look maths runs on
  const r = await page.evaluate((FRAMES) => new Promise((res) => {
    const u = window.__g.scene.getScene('Town').underground;
    u.setViewMode ? u.setViewMode('third') : (u.viewMode = 'third');
    const seen = { euler: new Set(), look: new Set(), walk: new Set() };
    const V = THREE.Vector3.prototype; const ae = V.applyEuler; const asv = V.addScaledVector;
    V.applyEuler = function (e) { seen.look.add(this); seen.euler.add(e); return ae.call(this, e); };
    V.addScaledVector = function (v, k) { if (this !== u.camera.position) seen.walk.add(this); return asv.call(this, v, k); };
    const upd = u._update; let frames = 0; let raf = 0; const p0 = u.rig.position.clone();
    u._update = function (d) { frames++; return upd.call(this, d); };
    u.keys.w = true;
    const step = () => {
      if (frames < FRAMES && ++raf < FRAMES * 20) return requestAnimationFrame(step);
      u.keys.w = false; V.applyEuler = ae; V.addScaledVector = asv; u._update = upd;
      const p1 = u.rig.position;
      res({ frames, look: seen.look.size, euler: seen.euler.size, walk: seen.walk.size, moved: Math.hypot(p1.x - p0.x, p1.z - p0.z), view: u.viewMode, physics: u.physicsEnabled });
    };
    requestAnimationFrame(step);
  }), FRAMES);
  console.log('walking, third person, ' + r.frames + ' cave updates: ' + JSON.stringify(r));
  check('the probe saw ' + FRAMES + ' cave updates with physics on, third-person view', r.frames >= FRAMES && r.physics === true && r.view === 'third', JSON.stringify(r));
  check('holding W still moves the player', r.moved > 0.5, 'moved ' + r.moved.toFixed(2));
  check('look direction: one reused vector, not one per frame (was ' + FRAMES + ')', r.look <= 2, 'distinct vectors=' + r.look);
  check('look direction: one reused Euler, not one per frame (was ' + FRAMES + ')', r.euler <= 2, 'distinct eulers=' + r.euler);
  check('walk direction: one reused vector, not one per frame (was ' + FRAMES + ')', r.walk <= 2, 'distinct vectors=' + r.walk);

  // 2. the look direction still has the right value, and a caller that needs to keep it gets what it copied
  const look = await page.evaluate(() => {
    const u = window.__g.scene.getScene('Town').underground; const py = [u.pitch, u.yaw]; const out = [];
    [[0, 0], [0.4, 1.1], [-0.9, -2.3], [1.2, 3.0]].forEach(([pitch, yaw]) => {
      u.pitch = pitch; u.yaw = yaw; const v = u._forwardVector();
      const want = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
      out.push(Math.max(Math.abs(v.x - want[0]), Math.abs(v.y - want[1]), Math.abs(v.z - want[2])));
    });
    u.pitch = 0.3; u.yaw = 0.7; u._raycastTargets(); const d1 = u.raycaster.ray.direction.clone();
    u.pitch = -0.3; u.yaw = 2.0; u._forwardVector(); // a later call must not change the ray that was already set
    const kept = d1.distanceTo(u.raycaster.ray.direction);
    u.pitch = py[0]; u.yaw = py[1];
    return { err: Math.max.apply(null, out), kept };
  });
  check('_forwardVector() gives the same direction as before for 4 pitch / yaw pairs', look.err < 1e-9, JSON.stringify(look));
  check('the mining ray keeps its own copy of the direction', look.kept < 1e-12, JSON.stringify(look));

  // 3. block edits: place 4 blocks and hide them again; the matrix is one scratch object, and the blocks really are stored
  const ed = await page.evaluate(() => {
    const u = window.__g.scene.getScene('Town').underground; const B = THREE.Matrix4.prototype; const mt = B.makeTranslation; const seen = new Set();
    B.makeTranslation = function (x, y, z) { seen.add(this); return mt.call(this, x, y, z); };
    const pool = u.pools.wall; const cells = [[40, 30, 40], [41, 30, 40], [42, 30, 40], [43, 30, 40]].filter((c) => !u.occupied.has(c.join(',')));
    const next0 = pool.next; const free0 = pool.free.length; let ok = 0; const at = []; const m = new THREE.Matrix4();
    cells.forEach((c) => { if (u._putBlock('wall', c[0], c[1], c[2])) ok++; });
    for (let i = 0; i < ok; i++) { const slot = next0 + i; pool.mesh.getMatrixAt(slot, m); at.push([m.elements[12], m.elements[13], m.elements[14]]); }
    const placed = seen.size;
    for (let i = 0; i < ok; i++) u._hidePlacedInstance(pool, next0 + i);
    const hid = []; for (let i = 0; i < ok; i++) { pool.mesh.getMatrixAt(next0 + i, m); hid.push(m.elements[13]); }
    cells.forEach((c) => { u.occupied.delete(c.join(',')); if (u.lookup) u.lookup.delete(c.join(',')); });
    B.makeTranslation = mt;
    return { cells: cells.length, ok, usedFree: free0 > 0, at, want: cells.map((c) => c.map((v) => v * UG_BLOCK)), hid, placed, all: seen.size };
  });
  console.log('block edits: ' + JSON.stringify(ed));
  check('4 blocks placed', ed.ok === 4 && ed.cells === 4, JSON.stringify(ed));
  if (!ed.usedFree) check('each placed block sits at its own cell (the shared matrix is copied into the mesh)', JSON.stringify(ed.at) === JSON.stringify(ed.want), JSON.stringify([ed.at, ed.want]));
  if (!ed.usedFree) check('hiding moves each of them away', ed.hid.every((y) => y === -9999), JSON.stringify(ed.hid));
  check('8 block edits use one matrix, not one each (was 8)', ed.all <= 1, 'distinct matrices=' + ed.all);

  check('no page errors', errors.length === 0, errors.join(' | '));
  check('offline: no database request was attempted', db.attempts() === 0, JSON.stringify(db.http.concat(db.ws).slice(0, 3)));
  await browser.close();
  done();
})();
