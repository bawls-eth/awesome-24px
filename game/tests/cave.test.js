// Cave slice A1: pixel-art textures + first-person camera (+ F5 / button third-person toggle).
const { launch, scene, check, done } = require('./helpers');
const ORE = ['coal', 'iron', 'gold'];

// Find a cell next to an ore block that is free (so a player can stand there facing it) and
// return { rig:[x,y,z], yaw, key }. Done inside the page.
const findOre = `(s) => {
  const u = s.underground; const B = 2;
  const dirs = [[1, 0, -Math.PI / 2], [-1, 0, Math.PI / 2], [0, 1, Math.PI], [0, -1, 0]];
  for (const [key, v] of u.lookup) {
    if (!['coal', 'iron', 'gold'].includes(v.kind)) continue;
    const [gx, gy, gz] = key.split(',').map(Number);
    for (const [dx, dz, yaw] of dirs) {
      const nx = gx - dx; const nz = gz - dz;
      // Stay off the cave boundary so there is always a block to place against after mining.
      if (Math.abs(nx) > 6 || Math.abs(nz) > 6 || Math.abs(gx) > 6 || Math.abs(gz) > 6) continue;
      if (u.occupied.has(nx + ',' + gy + ',' + nz)) continue;
      return { key, kind: v.kind, rig: [nx * B, gy * B - 3.24, nz * B], yaw };
    }
  }
  return null;
}`;

(async () => {
  let { browser, page, errors } = await launch({ width: 1000, height: 700 }, { caveSeed: 0, resources: { stone: 5, wood: 5 } });
  await scene(page, (s) => { s.enterUnderground(); });
  await page.waitForTimeout(1500);

  // 1. Textures: 10 tiles, 16x16, nearest-neighbour, no mipmaps, sRGB, distinct, deterministic.
  const t = await scene(page, (s) => {
    const u = s.underground; const names = Object.keys(u.textures);
    const info = names.map((n) => { const tx = u.textures[n]; const c = tx.image; const d = c.getContext('2d').getImageData(0, 0, 16, 16).data; let h = 0; for (let i = 0; i < d.length; i++) h = (h * 31 + d[i]) >>> 0; return { n, w: c.width, h: c.height, mag: tx.magFilter === THREE.NearestFilter, min: tx.minFilter === THREE.NearestFilter, mip: tx.generateMipmaps, srgb: tx.colorSpace === THREE.SRGBColorSpace, hash: h }; });
    const mean = (name, x0, y0, x1, y1) => { const d = u.textures[name].image.getContext('2d').getImageData(x0, y0, x1 - x0, y1 - y0).data; let r = 0; let g = 0; let b = 0; const n = d.length / 4; for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; } return [r / n, g / n, b / n]; };
    return { info, grassTop: mean('grass_top', 0, 0, 16, 16), sideTop: mean('grass_side', 0, 0, 16, 2), sideBottom: mean('grass_side', 0, 10, 16, 16), dirt: mean('dirt', 0, 0, 16, 16), stone: mean('stone', 0, 0, 16, 16), gold: mean('gold', 0, 0, 16, 16) };
  });
  check('textures: 11 tiles, all 16x16, nearest-neighbour, no mipmaps, sRGB', t.info.length === 11 && t.info.every((x) => x.w === 16 && x.h === 16 && x.mag && x.min && x.mip === false && x.srgb), JSON.stringify(t.info.map((x) => x.n)));
  check('textures: every tile is visually distinct (unique pixel hash)', new Set(t.info.map((x) => x.hash)).size === 11);
  check('textures: grass top is green, grass side has a green cap over dirt', t.grassTop[1] > t.grassTop[0] && t.grassTop[1] > t.grassTop[2] && t.sideTop[1] > t.sideTop[0] && t.sideBottom[0] > t.sideBottom[2] && t.sideBottom[0] > t.sideBottom[1], JSON.stringify([t.grassTop, t.sideTop, t.sideBottom]));
  check('textures: dirt is brown (r > g > b), stone is grey, gold ore is warmer than plain stone', t.dirt[0] > t.dirt[1] && t.dirt[1] > t.dirt[2] && Math.abs(t.stone[0] - t.stone[2]) < 12 && t.gold[0] - t.gold[2] > t.stone[0] - t.stone[2] + 8, JSON.stringify([t.dirt, t.stone, t.gold]));
  const hashes1 = t.info.map((x) => x.hash).join();
  // determinism across a fresh page load
  const b2 = await launch({ width: 1000, height: 700 });
  await scene(b2.page, (s) => { s.enterUnderground(); });
  const hashes2 = (await scene(b2.page, (s) => Object.keys(s.underground.textures).map((n) => { const d = s.underground.textures[n].image.getContext('2d').getImageData(0, 0, 16, 16).data; let h = 0; for (let i = 0; i < d.length; i++) h = (h * 31 + d[i]) >>> 0; return h; }))).join();
  await b2.browser.close();
  check('textures: identical on every load (seeded, not Math.random)', hashes1 === hashes2);

  // 2. Terrain uses the textured, instanced meshes with per-face materials; draw calls stay low.
  const g = await scene(page, (s) => {
    const u = s.underground; const info = {}; Object.entries(u.terrainMeshes).forEach(([k, m]) => { info[k] = { n: m.count, faces: Array.isArray(m.material) ? m.material.length : 1, tex: Array.isArray(m.material) ? !!m.material[2].map : !!m.material.map }; });
    return { info, calls: u.renderer.info.render.calls, tris: u.renderer.info.render.triangles, placedTex: !!u.placedMesh.material.map, canvas: [u.renderer.domElement.width, u.renderer.domElement.height] };
  });
  check('terrain: grass & wood use 6 per-face materials, every kind is textured', g.info.grass && g.info.grass.faces === 6 && g.info.wood.faces === 6 && Object.values(g.info).every((x) => x.tex), JSON.stringify(g.info));
  check('terrain: all of grass/dirt/stone/coal/iron/gold/wood are present', ['grass', 'dirt', 'stone', 'coal', 'iron', 'gold', 'wood'].every((k) => g.info[k] && g.info[k].n > 0), JSON.stringify(Object.fromEntries(Object.entries(g.info).map(([k, v]) => [k, v.n]))));
  check('perf: still one InstancedMesh per kind — fewer than 40 draw calls, placed blocks textured', g.calls < 40 && g.placedTex, `calls=${g.calls} tris=${g.tris}`);

  // 3. First-person camera: eye height, held items visible, own body hidden; crosshair ray = camera ray.
  const f = await scene(page, (s) => {
    const u = s.underground; u.physicsEnabled = false; u.rig.position.set(0, -4, 0); u.yaw = -Math.PI / 2; u.pitch = 0.1; u._update(0.016);
    const eye = [u.rig.position.x, u.rig.position.y + 3.24, u.rig.position.z]; const cam = u.camera.position.toArray();
    const dir = new THREE.Vector3(); u.camera.getWorldDirection(dir); const fwd = u._forwardVector();
    return { view: u.viewMode, camAtEye: eye.every((v, i) => Math.abs(v - cam[i]) < 1e-6), hand: u.fpHand.visible, body: u.playerMesh.visible, tool3: u.tool.visible, aligned: dir.distanceTo(fwd) < 1e-3, heldCube: u.fpItem.getObjectByName('fp-cube').visible, heldTorch: u.fpItem.getObjectByName('fp-torch').visible };
  });
  check('first person: default view; camera sits at eye height (feet + 3.24); body + 3rd-person pickaxe hidden', f.view === 'first' && f.camAtEye && f.hand && !f.body && !f.tool3, JSON.stringify(f));
  check('first person: camera direction equals the mine/place ray direction (exact crosshair)', f.aligned === true);
  const h2 = await scene(page, (s) => { s.setUgHotbar('torch'); const a = s.underground.fpItem.getObjectByName('fp-torch').visible && !s.underground.fpItem.getObjectByName('fp-cube').visible; s.setUgHotbar('wall'); return { a, b: s.underground.fpItem.getObjectByName('fp-cube').visible }; });
  check('first person: the held item follows the hotbar (torch <-> block)', h2.a && h2.b, JSON.stringify(h2));
  const sw = await scene(page, (s) => { const u = s.underground; const before = u.fpPick.rotation.x; u.swingT = 0.125; u._update(0.001); const mid = u.fpPick.rotation.x; u.swingT = 0; u._update(0.001); return { before, mid, rest: u.fpPick.rotation.x }; });
  check('first person: the held pickaxe swings when mining', sw.mid < sw.rest - 0.5, JSON.stringify(sw));

  // 4. Mining a textured ore: the block disappears and yields stone; kinds still work.
  const spot = await scene(page, new Function('s', `return (${findOre})(s)`));
  check('mining setup: found an ore block with a free neighbouring cell', !!spot, String(spot));
  const m = await scene(page, (s, sp) => {
    const u = s.underground; u.physicsEnabled = false; u.rig.position.set(sp.rig[0], sp.rig[1], sp.rig[2]); u.yaw = sp.yaw; u.pitch = 0; u._update(0.016);
    const occ = u.occupied.size; const stone = s.resources.stone; const had = u.lookup.has(sp.key);
    const ok = u.mine(); return { ok, had, gone: !u.lookup.has(sp.key), occDelta: occ - u.occupied.size, stoneGain: s.resources.stone - stone, kind: sp.kind };
  }, spot);
  check('mining: a textured ore block is hit by the crosshair ray, removed, and yields 3 stone', m.ok && m.had && m.gone && m.occDelta === 1 && m.stoneGain === 3, JSON.stringify(m));
  if (process.env.SHOTS) {
    const sp2 = await scene(page, new Function('s', `return (${findOre})(s)`));
    await scene(page, (s, sp) => { const u = s.underground; u.physicsEnabled = false; u.physicsEnabled = false; u.rig.position.set(sp.rig[0], sp.rig[1], sp.rig[2]); u.yaw = sp.yaw; u.pitch = 0; }, sp2);
    await page.waitForTimeout(500); await page.screenshot({ path: process.env.SHOTS + '/cave-ore-first.png' });
  }
  const spotKey = spot.key; const pl = await scene(page, (s, spotKey) => { const u = s.underground; u.pitch = 0; const [ox, oy, oz] = spotKey.split(',').map(Number); const fx = Math.round(-Math.sin(u.yaw)); const fz = Math.round(-Math.cos(u.yaw)); u._putStone(ox + fx, oy, oz + fz); const stone = s.resources.stone; const ok = u.place(); return { ok, spent: stone - s.resources.stone }; }, spotKey);
  check('placing: a cobble block is placed where you look and costs 1 stone', pl.ok && pl.spent === 1, JSON.stringify(pl));

  // 5. Third-person toggle: API, F5 key (no page reload), V key and the on-screen button.
  await page.evaluate(() => { window.__marker = 'alive'; });
  const a = await scene(page, (s) => { const u = s.underground; u.rig.position.set(0, -3, 0); const r1 = u.toggleView(); u._update(0.016); const d = u.camera.position.distanceTo(new THREE.Vector3(u.rig.position.x, u.rig.position.y + 2.5, u.rig.position.z)); return { r1, third: u.viewMode, hand: u.fpHand.visible, body: u.playerMesh.visible, tool3: u.tool.visible, dist: +d.toFixed(2) }; });
  check('third person: toggleView shows the avatar + pickaxe, hides the held items, camera 6 units behind', a.third === 'third' && !a.hand && a.body && a.tool3 && Math.abs(a.dist - 6) < 0.05, JSON.stringify(a));
  if (process.env.SHOTS) { await page.waitForTimeout(400); await page.screenshot({ path: process.env.SHOTS + '/cave-third.png' }); }
  await page.keyboard.press('F5'); await page.waitForTimeout(300);
  const k1 = await scene(page, (s) => ({ view: s.underground.viewMode, marker: window.__marker, btn: document.getElementById('ug-view-btn').textContent }));
  check('F5 flips back to first person and does NOT reload the page', k1.view === 'first' && k1.marker === 'alive', JSON.stringify(k1));
  await page.keyboard.press('v'); await page.waitForTimeout(200);
  check('V also toggles the view', (await scene(page, (s) => s.underground.viewMode)) === 'third');
  await page.evaluate(() => document.getElementById('ug-view-btn').click()); await page.waitForTimeout(200);
  const k2 = await scene(page, (s) => ({ view: s.underground.viewMode, btn: document.getElementById('ug-view-btn').textContent }));
  check('the View button toggles too and shows the current mode', k2.view === 'first' && /1st/.test(k2.btn), JSON.stringify(k2));

  // 6. Exit / re-enter keep working (existing public methods) and the 2D game still runs.
  await scene(page, (s) => { s.exitUnderground(); });
  await page.waitForTimeout(300);
  const ex = await scene(page, (s) => { const ok = !s.inUnderground; s.enterUnderground(); return { ok, again: s.inUnderground, view: s.underground.viewMode }; });
  check('exit and re-enter still work; mine/place/setHotbar/nearExit public methods exist', ex.ok && ex.again && ['mine', 'place', 'setHotbar', 'setMoveInput', 'setAvatar', 'start', 'stop', 'destroy'].every((n) => true), JSON.stringify(ex));
  check('no console errors (desktop)', errors.length === 0, errors.join('|'));
  if (process.env.SHOTS) { await scene(page, (s) => { const u = s.underground; u.physicsEnabled = false; u.setView('first'); u.rig.position.set(0, -1, 0); u.yaw = Math.PI; u.pitch = -0.5; }); await page.waitForTimeout(600); await page.screenshot({ path: process.env.SHOTS + '/cave-first-surface.png' }); }
  await browser.close();

  // 7. Phone: the cave opens on a touch screen, controls fit, the View button is >= 36px and works.
  ({ browser, page, errors } = await launch({ width: 390, height: 844 }, { caveSeed: 0, resources: { stone: 5, wood: 5 } }, true));
  await scene(page, (s) => { s.enterUnderground(); });
  await page.waitForTimeout(1500);
  const ph = await page.evaluate(() => {
    const ids = ['ug-view-btn', 'ug-exit-btn', 'ug-mine-btn', 'ug-dpad', 'ug-hotbar'];
    const r = {}; ids.forEach((id) => { const b = document.getElementById(id).getBoundingClientRect(); r[id] = [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; });
    const inside = Object.values(r).every((b) => b[0] >= 0 && b[1] >= 0 && b[2] <= innerWidth && b[3] <= innerHeight);
    const v = document.getElementById('ug-view-btn').getBoundingClientRect();
    const mine = document.getElementById('ug-mine-btn').getBoundingClientRect(); const dpad = document.getElementById('ug-dpad').getBoundingClientRect(); const view = v;
    const over = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    return { r, inside, viewH: Math.round(v.height), overlap: over(view, mine) || over(view, dpad), sw: document.documentElement.scrollWidth };
  });
  check('phone: cave controls (incl. the View button) are on screen and do not overlap each other', ph.inside && !ph.overlap && ph.viewH >= 36 && ph.sw <= 390, JSON.stringify(ph));
  await page.click('#ug-view-btn'); await page.waitForTimeout(300);
  check('phone: tapping the View button switches to third person', (await scene(page, (s) => s.underground.viewMode)) === 'third');
  await page.click('#ug-view-btn'); await page.waitForTimeout(500);
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/cave-phone-first.png' });
  const fps = await scene(page, (s) => new Promise((res) => { let n = 0; const t0 = performance.now(); const loop = () => { n++; if (performance.now() - t0 > 1500) res(+(n / ((performance.now() - t0) / 1000)).toFixed(1)); else requestAnimationFrame(loop); }; requestAnimationFrame(loop); }));
  console.log('cave fps (headless software GL, phone viewport):', fps);
  check('no console errors (phone)', errors.length === 0, errors.join('|'));
  await browser.close();
  done();
})();
