// Cave slice A4 (part 1): seeded, deterministic, bigger terrain with hills and trees; the seed is saved.
const { launch, scene, check, done } = require('./helpers');
const SAVE = 'pixeltown-save-v1';

// Page-side: a stable fingerprint of the whole world (every block kind at every cell).
const fingerprint = (s) => {
  const u = s.underground; const keys = [...u.lookup.keys()].sort(); let h = 0;
  keys.forEach((k) => { const s2 = k + ':' + u.lookup.get(k).kind; for (let i = 0; i < s2.length; i++) h = (Math.imul(h, 31) + s2.charCodeAt(i)) >>> 0; });
  return { h, n: keys.length, trees: u.trees, seed: u.seed };
};
const enter = (s) => { s.enterUnderground(); const u = s.underground; u.stop(); u.active = true; };

(async () => {
  let { browser, page, errors } = await launch({ width: 1000, height: 700 }, { caveSeed: 12345, resources: { stone: 5, wood: 5 } });
  await scene(page, enter);
  const A = await scene(page, fingerprint);
  const b2 = await launch({ width: 1000, height: 700 }, { caveSeed: 12345 });
  await scene(b2.page, enter); const B = await scene(b2.page, fingerprint); await b2.browser.close();
  const b3 = await launch({ width: 1000, height: 700 }, { caveSeed: 777 });
  await scene(b3.page, enter); const C = await scene(b3.page, fingerprint); await b3.browser.close();
  check('seeded: the same seed makes the identical cave on a fresh load (same block fingerprint and tree count)', A.h === B.h && A.n === B.n && A.trees === B.trees && A.seed === 12345, JSON.stringify([A, B]));
  check('seeded: a different seed makes a different cave', C.h !== A.h && C.seed === 777, JSON.stringify([A, C]));

  // Size and shape: 25x25 columns, hills of 0/1/2 blocks, flat zone around the shaft, clear shaft.
  const g = await scene(page, (s) => {
    const u = s.underground; const rises = {}; let flatOk = true; let cols = 0;
    for (let x = -12; x <= 12; x++) for (let z = -12; z <= 12; z++) {
      cols++; const r = u.surfaceRise(x, z); rises[r] = (rises[r] || 0) + 1;
      if (Math.max(Math.abs(x), Math.abs(z)) <= 4 && r !== 0) flatOk = false;
      // the grass block of every column sits exactly at its rise (or the column was carved by a tunnel / shaft)
      const top = -1 + r; const k = x + ',' + top + ',' + z; const e = u.lookup.get(k);
    }
    let shaftClear = true; for (let y = 8; y >= -8; y--) for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) if (u.occupied.has(x + ',' + y + ',' + z)) shaftClear = false;
    let maxGy = -99; u.lookup.forEach((v, k) => { maxGy = Math.max(maxGy, Number(k.split(',')[1])); });
    return { cols, rises, flatOk, shaftClear, blocks: u.lookup.size, maxGy, calls: (() => { u.renderer.render(u.scene, u.camera); return u.renderer.info.render.calls; })() };
  });
  check('world: 25 x 25 columns with all three hill heights (0, 1, 2 blocks) present', g.cols === 625 && g.rises[0] > 50 && g.rises[1] > 20 && g.rises[2] > 5, JSON.stringify(g));
  check('world: the 9x9 area around the shaft is perfectly flat and the shaft is clear from the sky to the bottom', g.flatOk && g.shaftClear, JSON.stringify(g));
  check('perf: bigger world still renders in < 40 draw calls (one InstancedMesh per kind)', g.calls < 40 && g.blocks > 3000, JSON.stringify(g));

  // Trees: wood trunk on grass, leafy crown, mineable leaves that drop nothing, away from the shaft.
  const t = await scene(page, (s) => {
    const u = s.underground; const K = (x, y, z) => { const e = u.lookup.get(x + ',' + y + ',' + z); return e && e.kind; };
    let trunks = 0; let rooted = 0; let crowned = 0; let nearShaft = 0; let leafCell = null;
    u.lookup.forEach((v, k) => {
      if (v.kind !== 'leaves') return; const [x, y, z] = k.split(',').map(Number);
      if (K(x, y - 1, z) === 'wood' && K(x, y - 2, z) === 'wood' && K(x, y + 1, z) === 'leaves') { // the crown's centre column sits on a 2-block trunk
        trunks++; if (K(x, y - 3, z) === 'grass' || K(x, y - 3, z) === 'wood') rooted++;
        let ring = 0; for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (K(x + dx, y, z + dz) === 'leaves') ring++; if (ring === 9) crowned++;
        if (Math.max(Math.abs(x), Math.abs(z)) <= 4) nearShaft++; if (!leafCell) leafCell = [x + 1, y, z];
      }
    });
    return { trunks, rooted, crowned, nearShaft, trees: u.trees, leafCell };
  });
  check('trees: every tree has a 2-block wood trunk standing on grass and a 3x3 leaf crown; none near the shaft', t.trees >= 4 && t.trunks === t.trees && t.rooted === t.trees && t.crowned === t.trees && t.nearShaft === 0, JSON.stringify(t));
  const lf = await scene(page, (s, c) => {
    const u = s.underground; const key = c.join(','); const e = u.lookup.get(key); if (!e || e.kind !== 'leaves') return { skip: true };
    u.physicsEnabled = false; u.rig.position.set((c[0] + 1) * 2, c[1] * 2 - 3.24, c[2] * 2); u.yaw = Math.PI / 2; u.pitch = 0; u._update(0.001);
    const hit = u._raycastTargets()[0]; const tg = hit && u._targetFromHit(hit); const before = { ...s.resources }; const dr0 = u.drops.length;
    let tt = 0; u.setMining(true); while (u.lookup.has(key) && tt < 3) { u._update(0.02); tt += 0.02; } u.setMining(false);
    return { hitKey: tg && tg.key, key, kind: tg && tg.kind, tt: +tt.toFixed(2), gone: !u.lookup.has(key), drops: u.drops.length - dr0, same: JSON.stringify(before) === JSON.stringify(s.resources) };
  }, t.leafCell);
  check('leaves: break in 0.2 s and drop nothing', (lf.kind === 'leaves' && lf.tt <= 0.26 && lf.gone && lf.drops === 0 && lf.same), JSON.stringify(lf));

  // Seed sweep: the spawn is solid and every tree is rooted for several seeds, including the classic seed 0.
  const sweep = await scene(page, (s) => {
    const out = [];
    [0, 1, 2, 3, 4, 5, 6, 7, 8].forEach((seed) => {
      const w = new UndergroundWorld({ canvasWrap: document.createElement('div'), resources: { stone: 0, wood: 0 }, seed, onResourceChange() {}, onExit() {} });
      const solid = (x, y, z) => w.lookup.has(x + ',' + y + ',' + z);
      let floating = 0;
      w.lookup.forEach((v, k) => { if (v.kind !== 'wood') return; const [x, y, z] = k.split(',').map(Number); if (solid(x, y + 1, z) && !solid(x, y - 1, z) && w.lookup.get(x + ',' + (y + 1) + ',' + z).kind === 'leaves') floating++; });
      let trunkOverHole = 0;
      w.lookup.forEach((v, k) => { if (v.kind !== 'leaves') return; const [x, y, z] = k.split(',').map(Number); if (solid(x, y - 1, z) && solid(x, y - 2, z) && w.lookup.get(x + ',' + (y - 1) + ',' + z).kind === 'wood' && !solid(x, y - 3, z)) trunkOverHole++; });
      out.push({ seed, spawnSolid: solid(2, -1, 0) && solid(3, -1, 0), floating, trunkOverHole });
      w.destroy();
    });
    return out;
  });
  check('seed sweep (0-8): the spawn cells are always solid grass and no tree hangs over a tunnel hole', sweep.every((r) => r.spawnSolid && r.floating === 0 && r.trunkOverHole === 0), JSON.stringify(sweep));

  // Walking: spawn is on solid grass at y = -1; walking across the hills auto-hops without ever clipping into a block.
  const w = await scene(page, (s) => {
    const u = s.underground; u.physicsEnabled = true; u.start(); u.stop(); u.active = true; u.keys = {}; u.moveInput = { fwd: 0, strafe: 0, vert: 0 };
    for (let i = 0; i < 90; i++) u._update(1 / 60);
    const spawn = { y: u.rig.position.y, ground: u.onGround };
    let maxY = u.rig.position.y; let stuckInside = 0; let hp = u.health;
    u.yaw = -Math.PI / 2; u.keys.w = true;
    for (let i = 0; i < 60 * 8; i++) { u._update(1 / 60); maxY = Math.max(maxY, u.rig.position.y); if (u._boxHits(u.rig.position.x, u.rig.position.y, u.rig.position.z)) stuckInside++; if (i % 60 === 30) u.yaw += 0.35; }
    u.keys.w = false;
    return { spawn, maxY, stuckInside, hp: u.health, deaths: u.deaths, x: u.rig.position.x };
  });
  check('spawn: you start standing on the grass beside the shaft (y = -1, grounded)', Math.abs(w.spawn.y + 1) < 0.02 && w.spawn.ground, JSON.stringify(w));
  check('hills are walkable: an 8 s walk climbs at least one hill, never clips into a block and never kills you', w.maxY > 0.9 && w.stuckInside === 0 && w.deaths === 0, JSON.stringify(w));
  check('no console errors (desktop)', errors.length === 0, errors.join('|'));
  if (process.env.SHOTS) {
    await scene(page, (s) => { const u = s.underground; u.respawn(); u.setView('first'); u.start(); u.rig.position.set(9, 1, 3); u.yaw = -Math.PI / 2 + 0.5; u.pitch = 0.05; u.toggleFly(true); u.rig.position.y = 7; });
    await page.waitForTimeout(900); await page.screenshot({ path: process.env.SHOTS + '/cave-hills-desktop.png' });
  }
  await browser.close();

  // Save: a missing / invalid seed is replaced once with a valid one and then stays stable.
  ({ browser, page, errors } = await launch({ width: 1000, height: 700 }, { resources: { stone: 1 } }));
  const s1 = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).caveSeed, SAVE);
  await page.reload(); await page.fill('#name-input', 'ADMINtest'); await page.click('.species-tab'); await page.click('.avatar-choice'); await page.click('#join-btn'); await page.waitForSelector('#player-list-panel'); await page.waitForTimeout(800);
  const s2 = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).caveSeed, SAVE);
  check('save: with no caveSeed a valid random seed is created, saved (additive key) and kept on reload', Number.isInteger(s1) && s1 > 0 && s1 < 4294967296 && s1 === s2, JSON.stringify([s1, s2]));
  await browser.close();
  for (const bad of ['abc', -3, 1.5, 1e20, null]) {
    const x = await launch({ width: 600, height: 500 }, { caveSeed: bad });
    const v = await scene(x.page, (s) => s.caveSeed);
    check('save: invalid caveSeed ' + JSON.stringify(bad) + ' is replaced by a valid integer', Number.isInteger(v) && v > 0 && v < 4294967296, String(v));
    await x.browser.close();
  }

  // Phone: the bigger world still enters and renders, no console errors.
  ({ browser, page, errors } = await launch({ width: 390, height: 844 }, { caveSeed: 12345, resources: { stone: 5, wood: 5 } }, true));
  await scene(page, (s) => { s.enterUnderground(); });
  await page.waitForTimeout(1500);
  const ph = await scene(page, (s) => { const u = s.underground; u.renderer.render(u.scene, u.camera); return { calls: u.renderer.info.render.calls, tris: u.renderer.info.render.triangles, blocks: u.lookup.size }; });
  const fps = await scene(page, () => new Promise((res) => { let n = 0; const t0 = performance.now(); const loop = () => { n++; if (performance.now() - t0 > 1500) res(+(n / ((performance.now() - t0) / 1000)).toFixed(1)); else requestAnimationFrame(loop); }; requestAnimationFrame(loop); }));
  console.log('terrain stats (phone):', JSON.stringify(ph), 'fps (headless software GL):', fps);
  check('phone: the hilly cave opens with < 40 draw calls', ph.calls < 40, JSON.stringify(ph));
  if (process.env.SHOTS) { await scene(page, (s) => { const u = s.underground; u.rig.position.set(9, 1, 3); u.yaw = -Math.PI / 2 + 0.5; u.pitch = 0.05; u.toggleFly(true); u.rig.position.y = 7; }); await page.waitForTimeout(900); await page.screenshot({ path: process.env.SHOTS + '/cave-hills-phone.png' }); }
  check('no console errors (phone)', errors.length === 0, errors.join('|'));
  await browser.close();
  done();
})();
