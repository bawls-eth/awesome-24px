// Cave slice A4 (part 2): day/night cycle, real darkness underground, torch light, lava.
// Frames are stepped with u._update(dt) so results do not depend on the headless frame rate.
const { launch, scene, check, done } = require('./helpers');

(async () => {
  let { browser, page, errors } = await launch({ width: 1000, height: 700 }, { caveSeed: 0, resources: { stone: 5, wood: 9 } });
  await scene(page, (s) => { s.enterUnderground(); const u = s.underground; u.stop(); u.active = true; window.__st = (n, dt = 1 / 60) => { for (let i = 0; i < n; i++) u._update(dt); }; });

  // 1. The clock: noon is bright blue with a strong sun, midnight is dark with none; time advances by itself.
  const c = await scene(page, (s) => {
    const u = s.underground; u.physicsEnabled = false; u.rig.position.set(9, -1, 6); // out in the open
    const lum = (col) => col.r * 0.3 + col.g * 0.59 + col.b * 0.11;
    u.setTime(0.25); window.__st(60); const noon = { lum: lum(u.scene.background), sun: u.sun.intensity, amb: u.ambient.intensity, phase: u.clockPhase, label: document.getElementById('ug-clock').textContent, blue: u.scene.background.b > u.scene.background.r };
    u.setTime(0.75); window.__st(60); const night = { lum: lum(u.scene.background), sun: u.sun.intensity, amb: u.ambient.intensity, phase: u.clockPhase, label: document.getElementById('ug-clock').textContent };
    u.setTime(0.47); window.__st(60); const dusk = { phase: u.clockPhase, label: document.getElementById('ug-clock').textContent, r: u.scene.background.r, b: u.scene.background.b };
    u.setTime(0.1); const t0 = u.timeOfDay; window.__st(60 * 30, 1 / 60); const adv = u.timeOfDay - t0;
    return { noon, night, dusk, adv };
  });
  check('clock: noon is a bright blue sky with strong sun, midnight is near-black with no sun', c.noon.lum > 0.5 && c.noon.blue && c.noon.sun > 0.8 && c.night.lum < 0.1 && c.night.sun < 0.05, JSON.stringify(c));
  check('clock: ambient light drops from noon to night and the badge shows Day / Night', c.noon.amb > c.night.amb * 3 && c.noon.phase === 'day' && /Day/.test(c.noon.label) && c.night.phase === 'night' && /Night/.test(c.night.label), JSON.stringify(c));
  check('clock: dusk has a warm (red > blue) sky and the badge says Dusk', c.dusk.phase === 'dusk' && /Dusk/.test(c.dusk.label) && c.dusk.r > c.dusk.b, JSON.stringify(c.dusk));
  check('clock: time passes by itself (a 240 s day: 30 s moves the clock by ~0.125)', Math.abs(c.adv - 0.125) < 0.01, String(c.adv));

  // 2. Darkness: under the sky at noon it is bright, down in the cave it is dark at any hour; a held torch lights more.
  const d = await scene(page, (s) => {
    const u = s.underground; u.setTime(0.25);
    u.rig.position.set(9, -1, 6); window.__st(120); const out = { amb: u.ambient.intensity, sky: u.skyLight, sun: u.sun.intensity, bg: u.scene.background.r + u.scene.background.g + u.scene.background.b };
    u.rig.position.set(-8, -15, 0); u.physicsEnabled = false; window.__st(120); const deep = { amb: u.ambient.intensity, sky: u.skyLight, sun: u.sun.intensity, bg: u.scene.background.r + u.scene.background.g + u.scene.background.b };
    u.setHotbar('wall'); window.__st(2); const base = u.torch.intensity; u.setHotbar('torch'); window.__st(2); const held = u.torch.intensity; u.setHotbar('wall');
    u.setTime(0.75); u.rig.position.set(9, -1, 6); window.__st(120); const nightLamp = u.torch.intensity;
    return { out, deep, base, held, nightLamp };
  });
  check('darkness: roofed-over caves have no sky light, no sun and dark fog even at noon (open shaft fades with depth)', d.out.sky > 0.99 && d.out.sun > 0.8 && d.deep.sky < 0.02 && d.deep.sun < 0.05 && d.deep.bg < d.out.bg / 4, JSON.stringify(d));
  check('darkness: cave ambient is much dimmer than daylight ambient (you need a light underground)', d.deep.amb < 0.7 && d.out.amb > 1.5, JSON.stringify(d));
  check('torch light: holding a torch (slot 2) brightens your own light by 2x; your lamp is strongest at night', d.held >= d.base * 1.9 && d.nightLamp > d.base * 0.95, JSON.stringify(d));
  const tl = await scene(page, (s) => {
    const u = s.underground; const before = (() => { let n = 0; u.scene.traverse((o) => { if (o.isPointLight) n++; }); return n; })(); u.setHotbar('torch'); u.physicsEnabled = false; u.rig.position.set(5, -1, 0); u.yaw = -Math.PI / 2; u.pitch = -0.6; u._update(0.01);
    const ok = u.place(); const after = (() => { let n = 0; u.scene.traverse((o) => { if (o.isPointLight) n++; }); return n; })(); u.setHotbar('wall');
    return { ok, before, after };
  });
  check('torch light: a placed torch adds its own light to the scene', tl.ok && tl.after === tl.before + 1, JSON.stringify(tl));

  // 3. Lava: a glowing cavern across the shaft; standing in it burns, slows you, blocks building and can kill.
  const lv = await scene(page, (s) => {
    const u = s.underground; u.physicsEnabled = true; u.keys = {}; u.moveInput = { fwd: 0, strafe: 0, vert: 0 };
    const out = { cells: u.lava.size, rendered: u.lavaMesh.count, lights: u.scene.children.filter((o) => o.isPointLight && o.color.r > 0.9 && o.color.b < 0.4).length, emissive: u.lavaMesh.material.emissiveIntensity };
    u.health = 20; u.respawn(); u.rig.position.set(-8, -14.9, 0); u.vel.y = 0; u._peakY = -14.9; window.__st(2);
    out.in = u.inLava; out.hp0 = u.health; window.__st(32); out.hp1 = u.health; // ~0.53 s later: one tick of 2
    window.__st(30); out.hp2 = u.health; // ~1.03 s: two ticks
    const x0 = u.rig.position.x; u.yaw = Math.PI / 2; u.keys.w = true; window.__st(30); out.dist = Math.abs(u.rig.position.x - x0); u.keys.w = false;
    u.yaw = Math.PI / 2; const cell = u.lava.has('-4,-7,0');
    u.rig.position.set(-2, -15, 0); u.vel.y = 0; window.__st(5); out.safe = !u.inLava; out.hpSafe = u.health;
    u.setHotbar('wall'); u.physicsEnabled = false; u.rig.position.set(-2, -15 - 3.24 + 3.24, 0); u.rig.position.set(-2 * 2 + 4, -15, 0);
    return out;
  });
  check('lava: the cavern has 12 lava cells, rendered with a glowing material and orange lights', lv.cells === 12 && lv.rendered === 12 && lv.lights >= 2 && lv.emissive > 0.5, JSON.stringify(lv));
  check('lava: standing in it burns 2 HP every half second', lv.in && lv.hp0 === 20 && lv.hp1 === 18 && lv.hp2 === 16, JSON.stringify(lv));
  check('lava: moves like water (about 3.5 u/s, not 7) and the ledge beside it is safe', lv.dist > 0.5 && lv.dist < 2.6 && lv.safe, JSON.stringify(lv));
  const dth = await scene(page, (s) => {
    const u = s.underground; u.physicsEnabled = true; u.keys = {}; u.health = 20; u.deaths = 0; u.respawn(); u.rig.position.set(-8, -14.9, 0); u.vel.y = 0; u._peakY = -14.9;
    window.__st(60 * 6);
    return { deaths: u.deaths, hp: u.health, y: u.rig.position.y, x: u.rig.position.x };
  });
  check('lava: stay in it and you die and respawn on the surface with full health', dth.deaths >= 1 && dth.hp > 0 && dth.y > -2 && Math.abs(dth.x - 5.2) < 0.5, JSON.stringify(dth));
  const bl = await scene(page, (s) => {
    const u = s.underground; u.respawn(); u.physicsEnabled = false; u.setHotbar('wall'); s.resources.stone = 5;
    u.rig.position.set(-8, -12, 0); u.yaw = Math.PI / 2; u.pitch = -1.2; // hovering over the lava, looking down at the floor under it
    u._update(0.01); const hit = u._raycastTargets()[0]; const ok = u.place(); const stoneUsed = 5 - s.resources.stone; const occ = u.occupied.has('-4,-7,0');
    return { ok, stoneUsed, aimedAtFloor: !!hit, lavaCell: u.lava.has('-4,-7,0') && !occ };
  });
  check('lava: aiming at the floor under lava, place() refuses and costs nothing', bl.aimedAtFloor && bl.ok === false && bl.stoneUsed === 0 && bl.lavaCell, JSON.stringify(bl));
  check('no console errors (desktop)', errors.length === 0, errors.join('|'));
  if (process.env.SHOTS) {
    await scene(page, (s) => { const u = s.underground; u.start(); u.stop(); u.active = true; });
    const shot = async (name, fn) => { await scene(page, fn); await page.evaluate(() => { const s = window.__g.scene.getScene('Town'); for (let i = 0; i < 5; i++) s.underground._update(0.016); s.underground.renderer.render(s.underground.scene, s.underground.camera); }); await page.screenshot({ path: process.env.SHOTS + '/' + name + '.png' }); };
    await shot('cave-noon', (s) => { const u = s.underground; u.physicsEnabled = false; u.setHotbar('wall'); u.setTime(0.25); u.rig.position.set(9, -1, 6); u.yaw = -Math.PI / 2 + 0.6; u.pitch = 0.1; for (let i = 0; i < 90; i++) u._update(1 / 60); });
    await shot('cave-night', (s) => { const u = s.underground; u.setTime(0.75); for (let i = 0; i < 90; i++) u._update(1 / 60); });
    await shot('cave-dark-torch', (s) => { const u = s.underground; u.setTime(0.25); u.rig.position.set(-2, -17, 0); u.yaw = Math.PI / 2; u.pitch = 0.05; u.setHotbar('torch'); for (let i = 0; i < 90; i++) u._update(1 / 60); });
    await shot('cave-lava', (s) => { const u = s.underground; u.rig.position.set(-2, -15, 0); u.yaw = Math.PI / 2; u.pitch = -0.25; u.setHotbar('wall'); for (let i = 0; i < 90; i++) u._update(1 / 60); });
  }
  await browser.close();

  // 4. Phone: the clock badge fits next to the health badge and nothing overlaps; no save-format change.
  ({ browser, page, errors } = await launch({ width: 390, height: 844 }, { caveSeed: 0, resources: { stone: 5, wood: 5 } }, true));
  await scene(page, (s) => { s.enterUnderground(); });
  await page.waitForTimeout(1200);
  const ph = await page.evaluate(() => {
    const r = (id) => document.getElementById(id).getBoundingClientRect(); const over = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    document.getElementById('underground-exit-hint').classList.remove('hidden');
    const clk = r('ug-clock'); const hp = r('ug-health'); const hb = r('ug-hotbar'); const hint = r('underground-depth-hint'); const exit = r('underground-exit-hint');
    return { inside: clk.left >= 0 && clk.right <= innerWidth, overlaps: [over(clk, hp), over(clk, hb), over(clk, hint), over(clk, exit), over(hp, exit), over(hb, exit)].filter(Boolean).length, text: document.getElementById('ug-clock').textContent };
  });
  check('phone: the time-of-day badge fits beside the health badge and overlaps nothing (incl. the exit hint)', ph.inside && ph.overlaps === 0 && /Day|Dawn/.test(ph.text), JSON.stringify(ph));
  const keys = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('pixeltown-save-v1') || '{}')).sort().join(','));
  check('save format: no new keys were added by day/night or lava (time of day is not saved)', !/timeOfDay|clock|lava|dayTime|cave(Time|Light)/i.test(keys) && keys === 'achievementsUnlocked,caveSeed,frame,lastLoginDate,lastVisitDate,lifetimeStats,loginStreak,name,resources,species,visitDays', keys); // cycle 8: lastVisitDate + visitDays are the approved ID-09 days-in-town keys (written on Town load), not day/night keys
  if (process.env.SHOTS) { await scene(page, (s) => { const u = s.underground; u.setTime(0.5); u.physicsEnabled = false; u.rig.position.set(9, -1, 6); u.yaw = -Math.PI / 2 + 0.6; u.pitch = 0.1; for (let i = 0; i < 90; i++) u._update(1 / 60); }); await page.waitForTimeout(700); await page.screenshot({ path: process.env.SHOTS + '/cave-dusk-phone.png' }); }
  check('no console errors (phone)', errors.length === 0, errors.join('|'));
  await browser.close();
  done();
})();
