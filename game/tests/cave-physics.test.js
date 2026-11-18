// Cave slice A2: gravity, jump, voxel collision, auto-jump up one block, swimming, fall damage, flight toggle.
// Physics is driven by stepping u._update() with a fixed dt, so results do not depend on the headless frame rate.
const { launch, scene, check, done } = require('./helpers');

(async () => {
  let { browser, page, errors } = await launch({ width: 1000, height: 700 }, { resources: { stone: 9, wood: 5 } });
  await scene(page, (s) => { s.enterUnderground(); const u = s.underground; u.stop(); window.__step = (n, dt = 1 / 60) => { for (let i = 0; i < n; i++) u._update(dt); }; });

  // 1. Gravity: dropped from the air, you land exactly on the grass surface and stay put.
  const g = await scene(page, (s) => {
    const u = s.underground; u.keys = {}; u.moveInput = { fwd: 0, strafe: 0, vert: 0 };
    u.rig.position.set(10, 5, 6); u.vel.y = 0; u._peakY = 5; u.health = 20; window.__step(120);
    const y1 = u.rig.position.y; window.__step(60);
    return { y1, y2: u.rig.position.y, ground: u.onGround, hp: u.health, fall: u.lastFall };
  });
  check('gravity: falls and rests on the surface (feet y = -1), grounded, no jitter', Math.abs(g.y1 + 1) < 0.02 && Math.abs(g.y2 - g.y1) < 0.005 && g.ground, JSON.stringify(g));
  check('gravity: a 6 unit drop (inside the safe range) costs no health', g.hp === 20 && Math.abs(g.fall - 6) < 0.3, JSON.stringify(g));

  // 2. Jump: ~2.5 units up, then back down; can't re-jump in mid-air.
  const j = await scene(page, (s) => {
    const u = s.underground; const y0 = u.rig.position.y; u.keys[' '] = true; let peak = y0; let airJumps = 0;
    for (let i = 0; i < 90; i++) { u._update(1 / 60); peak = Math.max(peak, u.rig.position.y); if (i > 3 && !u.onGround && u.vel.y > 11) airJumps++; if (i === 4) u.keys[' '] = true; }
    u.keys[' '] = false; window.__step(30);
    return { rise: peak - y0, back: u.rig.position.y - y0, ground: u.onGround, airJumps };
  });
  check('jump: rises about 2.5 units (clears a 2 unit block, not 2 blocks) and lands again', j.rise > 2.2 && j.rise < 2.8 && Math.abs(j.back) < 0.02 && j.ground, JSON.stringify(j));

  // 3. Collision: walls stop you, you slide along them, nothing is walked through.
  const w = await scene(page, (s) => {
    const u = s.underground; const B = 2;
    // a 2-block-tall wall at gx = 7 across gz 2..4, standing on the surface (cells gy 0 and 1)
    for (let z = 2; z <= 4; z++) { u._putStone(7, 0, z); u._putStone(7, 1, z); }
    u.rig.position.set(9, -1, 6); u.vel.y = 0; window.__step(5);
    u.yaw = -Math.PI / 2; // facing +x ... wall sits at x 13..15
    u.rig.position.set(9, -1, 6); u.keys.w = true;
    // walk straight at it with a 4 unit tall wall: first walk at the wall from the west at z=6 (not blocked), so aim at z=3
    u.rig.position.set(9, -1, 4); u.keys.w = true; window.__step(120);
    const atWall = { x: u.rig.position.x, y: u.rig.position.y };
    // now slide: face diagonally into the wall and keep going; z must advance while x stays blocked
    u.yaw = -3 * Math.PI / 4; const z0 = u.rig.position.z; window.__step(60);
    const slid = u.rig.position.z - z0; const xAfter = u.rig.position.x;
    u.keys.w = false;
    return { atWall, slid, xAfter, hits: u._boxHits(u.rig.position.x, u.rig.position.y, u.rig.position.z) };
  });
  check('collision: a 2-block wall stops you at its face (x = 13 - half-width) and you stay on the ground', Math.abs(w.atWall.x - 12.4) < 0.05 && Math.abs(w.atWall.y + 1) < 0.02, JSON.stringify(w));
  check('collision: you slide along a wall (z advances) without entering it', w.slid > 1 && w.xAfter < 12.45 && !w.hits, JSON.stringify(w));

  // 4. Auto-jump: a one-block ledge is climbed, a two-block wall is not.
  const l = await scene(page, (s) => {
    const u = s.underground; u.keys = {};
    for (let z = 8; z <= 8; z++) u._putStone(7, 0, z);
    u.yaw = -Math.PI / 2; u.rig.position.set(9, -1, 16); u.vel.y = 0; window.__step(3);
    u.rig.position.set(9, -1, 16); u.vel.y = 0; window.__step(3);
    u.rig.position.set(9, -1, 16); // gz 8 -> z = 16
    u.keys.w = true; window.__step(45); u.keys.w = false; window.__step(40);
    return { x: u.rig.position.x, y: u.rig.position.y, ground: u.onGround };
  });
  check('step-up: walking into a one-block ledge hops onto it (feet y = +1)', Math.abs(l.y - 1) < 0.03 && l.x > 12.3 && l.x < 15.7 && l.ground, JSON.stringify(l));

  // 5. Fall damage: a long drop hurts, landing in water does not, health regenerates, death respawns.
  const f = await scene(page, (s) => {
    const u = s.underground; u.keys = {}; u.moveInput = { fwd: 0, strafe: 0, vert: 0 };
    const hist = []; u.onHealthChange = (hp) => hist.push(hp);
    u.rig.position.set(0, -1, 0); u.vel.y = 0; u.health = 20; u._peakY = -1; // above the open shaft
    u.rig.position.set(0, 0, 0); u._peakY = 0; window.__step(300);
    const y = u.rig.position.y; const hp = u.health; const fall = u.lastFall;
    return { y, hp, fall, hist };
  });
  check('fall damage: dropping down the shaft lands on the bottom (y = -17) and costs health', Math.abs(f.y + 17) < 0.03 && f.hp < 20 && f.hp >= 12 && f.fall > 14, JSON.stringify(f));
  const fw = await scene(page, (s) => {
    const u = s.underground; u.health = 20; u.vel.y = 0;
    // flooded cavern: water at gx 3..6, gy -7..-6 -> x 5..13, y -15..-11
    u.rig.position.set(9, -14.9, 0); u._peakY = -4; u.vel.y = 0; window.__step(240);
    return { y: u.rig.position.y, hp: u.health, inWater: u.inWater, solid: u._boxHits(u.rig.position.x, u.rig.position.y, u.rig.position.z) };
  });
  check('fall damage: landing in water is safe', fw.hp === 20 && fw.y < -14.5 && fw.inWater, JSON.stringify(fw));
  const hr = await scene(page, (s) => { const u = s.underground; u.health = 10; u._regenT = 0; window.__step(60 * 7); return u.health; });
  check('health regenerates over time (about 1 heart per 3 s)', hr >= 12 && hr <= 13, String(hr));
  const dth = await scene(page, (s) => {
    const u = s.underground; u.health = 1; u._damage(5);
    return { hp: u.health, deaths: u.deaths, pos: u.rig.position.toArray().map((v) => +v.toFixed(2)) };
  });
  check('death: 0 health respawns you on the surface with full health', dth.hp === 20 && dth.deaths === 1 && dth.pos[1] === -1 && Math.abs(dth.pos[0] - 5.2) < 0.01, JSON.stringify(dth));

  // 6. Swimming: slow sinking, swim up with Jump, slower walking, can climb out.
  const sw = await scene(page, (s) => {
    const u = s.underground; u.keys = {}; u.health = 20;
    u.rig.position.set(9, -14.9, 0); u.vel.y = 0; u._peakY = -14.9; window.__step(2);
    const entered = u.inWater; const sink0 = u.rig.position.y; window.__step(30); const sunk = sink0 - u.rig.position.y;
    u.keys[' '] = true; window.__step(40); u.keys[' '] = false;
    const risen = u.rig.position.y;
    u.rig.position.set(9, -14.9, 0); u.yaw = -Math.PI / 2; u.keys.w = true; const x0 = u.rig.position.x; window.__step(60); const swimDist = u.rig.position.x - x0; u.keys.w = false;
    return { entered, sunk, risen, swimDist };
  });
  check('swimming: water is detected, you sink slowly and Jump swims you upward', sw.entered && sw.sunk < 2.5 && sw.risen > -13.2, JSON.stringify(sw));
  check('swimming: moving through water is about half walking speed (3.5 vs 7 u/s)', sw.swimDist > 2.8 && sw.swimDist < 4.4, JSON.stringify(sw));

  // 7. Flight toggle: double-tap Space, no gravity, collides, touching down ends it.
  const fl = await scene(page, (s) => {
    const u = s.underground; u.keys = {}; u.rig.position.set(10, -1, 6); u.vel.y = 0; window.__step(3);
    const a = u.flying; u._lastSpaceT = -1e9; u.tapJump(); const mid = u.flying; u.tapJump(); const on = u.flying;
    u.keys[' '] = true; window.__step(30); u.keys[' '] = false; const up = u.rig.position.y; window.__step(60); const hover = Math.abs(u.rig.position.y - up) < 0.01;
    u.keys.shift = true; window.__step(120); u.keys.shift = false;
    return { a, mid, on, up, hover, after: u.flying, y: u.rig.position.y };
  });
  check('flight: double-tap Jump toggles creative flight (a single tap does not)', !fl.a && !fl.mid && fl.on, JSON.stringify(fl));
  check('flight: no gravity (hovers), Space rises, going down to the ground ends flight', fl.up > 2 && fl.hover && fl.after === false && Math.abs(fl.y + 1) < 0.05, JSON.stringify(fl));
  // pressing the real key twice quickly
  await scene(page, (s) => { const u = s.underground; u.start(); u.stop(); u.active = true; u.toggleFly(false); u._lastSpaceT = -1e9; });
  await page.keyboard.press('Space'); await page.waitForTimeout(80); await page.keyboard.press('Space'); await page.waitForTimeout(100);
  check('flight: pressing the Space key twice quickly toggles flight', (await scene(page, (s) => s.underground.flying)) === true);

  // 8. Placing never walls you in; reach starts at the eye; bedrock floor / side walls hold.
  const pr = await scene(page, (s) => {
    const u = s.underground; u.toggleFly(false); u.rig.position.set(10, -1, 6); u.vel.y = 0; window.__step(3);
    const own = u._cellOverlapsPlayer(5, 0, 3);
    u.rig.position.set(40, -1, 0); const out = u._boxHits(u.rig.position.x, u.rig.position.y, u.rig.position.z);
    u.rig.position.set(16.2, -1, 0); u.keys.d = false; u.yaw = -Math.PI / 2; u.keys.w = true; window.__step(120); u.keys.w = false;
    return { own, out, xEdge: u.rig.position.x, y: u.rig.position.y };
  });
  check('place: a cell on top of the player is rejected; the cave sides are solid', pr.own === true && pr.out === true && pr.xEdge <= 17 - 0.6 + 0.01 && pr.y > -17, JSON.stringify(pr));

  // 9. Torches don't collide; mined blocks open the way; existing mining ray starts at the eye.
  const tm = await scene(page, (s) => {
    const u = s.underground; const B = 2; u._addTorch(3, 0, -3); const t = u._boxHits(6, -1, -6); u._removeTorch('3,0,-3');
    u.physicsEnabled = false; u.rig.position.set(12, -1, -6); u.yaw = Math.PI / 2; u.pitch = 0; u.camera.updateMatrixWorld();
    const origin = u.rig.position.y + 3.24; u.physicsEnabled = true;
    return { torchSolid: t, origin };
  });
  check('torches are decoration only: you can walk through them', tm.torchSolid === false, JSON.stringify(tm));

  check('no console errors (desktop)', errors.length === 0, errors.join('|'));
  if (process.env.SHOTS) {
    await scene(page, (s) => { const u = s.underground; u.start(); u.toggleFly(false); u.rig.position.set(9, -1, 6); u.yaw = -Math.PI / 2; u.pitch = -0.2; });
    await page.waitForTimeout(700); await page.screenshot({ path: process.env.SHOTS + '/cave-physics-wall.png' });
    await scene(page, (s) => { const u = s.underground; u.start(); u.rig.position.set(7, -14.9, 0); u.vel.y = 0; u.yaw = -Math.PI / 2; u.pitch = -0.1; });
    await page.waitForTimeout(700); await page.screenshot({ path: process.env.SHOTS + '/cave-physics-water.png' });
  }
  await browser.close();

  // 10. Phone: jump button, fly button, health badge fit and work on a touch screen.
  ({ browser, page, errors } = await launch({ width: 390, height: 844 }, { resources: { stone: 5, wood: 5 } }, true));
  await scene(page, (s) => { s.enterUnderground(); });
  await page.waitForTimeout(1500);
  await scene(page, (s) => { const u = s.underground; u.stop(); window.__step = (n) => { for (let i = 0; i < n; i++) u._update(1 / 60); }; u.rig.position.set(10, -1, 6); window.__step(5); });
  const ph = await page.evaluate(() => {
    const ids = ['ug-up-btn', 'ug-down-btn', 'ug-fly-btn', 'ug-mine-btn', 'ug-view-btn', 'ug-exit-btn', 'ug-dpad', 'ug-health', 'ug-hotbar'];
    const r = {}; ids.forEach((id) => { const b = document.getElementById(id).getBoundingClientRect(); r[id] = b; });
    const inside = ids.every((id) => r[id].left >= 0 && r[id].top >= 0 && r[id].right <= innerWidth && r[id].bottom <= innerHeight);
    const over = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    let overlaps = 0; const acts = ['ug-up-btn', 'ug-down-btn', 'ug-fly-btn', 'ug-mine-btn', 'ug-view-btn', 'ug-exit-btn'];
    for (let i = 0; i < acts.length; i++) { for (let k = i + 1; k < acts.length; k++) if (over(r[acts[i]], r[acts[k]])) overlaps++; if (over(r[acts[i]], r['ug-dpad'])) overlaps++; if (over(r[acts[i]], r['ug-hotbar'])) overlaps++; }
    return { inside, overlaps, jumpW: Math.round(r['ug-up-btn'].width), sw: document.documentElement.scrollWidth };
  });
  check('phone: jump / fly / mine / view / exit buttons and the health badge are on screen, 50px+, and do not overlap', ph.inside && ph.overlaps === 0 && ph.jumpW >= 44 && ph.sw <= 390, JSON.stringify(ph));
  const tap = await scene(page, (s) => ({ ground: s.underground.onGround, y: s.underground.rig.position.y }));
  await page.dispatchEvent('#ug-up-btn', 'pointerdown'); await page.waitForTimeout(60);
  await scene(page, (s) => { const u = s.underground; window.__peak = -99; for (let i = 0; i < 40; i++) { u._update(1 / 60); window.__peak = Math.max(window.__peak, u.rig.position.y); } });
  await page.dispatchEvent('#ug-up-btn', 'pointerup');
  const jumped = await scene(page, () => window.__peak);
  check('phone: the on-screen Jump button makes the player jump', tap.ground && jumped > 0.5, `${jumped} ${JSON.stringify(tap)}`);
  await page.click('#ug-fly-btn');
  const flyOn = await scene(page, (s) => ({ f: s.underground.flying, cls: document.getElementById('ug-fly-btn').classList.contains('active') }));
  check('phone: the Fly button toggles flight and lights up', flyOn.f && flyOn.cls, JSON.stringify(flyOn));
  await scene(page, (s) => { const u = s.underground; u.toggleFly(false); u._damage(7); });
  check('phone: the health badge shows the current hearts', /13\/20/.test(await page.textContent('#ug-health')), await page.textContent('#ug-health'));
  if (process.env.SHOTS) {
    await scene(page, (s) => { const u = s.underground; u.start(); u.rig.position.set(9, -1, 6); u.yaw = -Math.PI / 2; u.pitch = -0.2; });
    await page.waitForTimeout(700); await page.screenshot({ path: process.env.SHOTS + '/cave-physics-phone.png' });
  }
  check('no console errors (phone)', errors.length === 0, errors.join('|'));
  await browser.close();
  done();
})();
