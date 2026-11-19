// Realm slice B1: the Realm Gate, twin-stick bullet-hell arena, three enemy patterns, pooling, death penalty.
// Combat is driven by stepping realm._update() with a fixed dt, so results do not depend on the headless frame rate.
const { launch, scene, check, done } = require('./helpers');
const SAVE = 'pixeltown-save-v1';
const seed = { caveSeed: 0, resources: { stone: 1 }, realm: { shards: 100, bestWave: 2, kills: 5, deaths: 1 } };

(async () => {
  let { browser, page, errors } = await launch({ width: 1000, height: 700 }, seed);

  // 1. The gate in the village: hint, enter with E, village pauses, Esc leaves with no penalty.
  const gate = await scene(page, (s) => {
    const out = { pos: [REALM_GATE_POS.x, REALM_GATE_POS.y] };
    s.localBody.setPosition(REALM_GATE_POS.x + 600, REALM_GATE_POS.y + 400); s.interact(); out.farEnters = !!s.inRealm;
    s.localBody.setPosition(REALM_GATE_POS.x, REALM_GATE_POS.y + 30); s.updateRealmGateHint();
    out.hintNear = !document.getElementById('realm-gate-hint').classList.contains('hidden');
    s.localBody.setPosition(REALM_GATE_POS.x + 400, REALM_GATE_POS.y + 300); s.updateRealmGateHint();
    out.hintFar = document.getElementById('realm-gate-hint').classList.contains('hidden');
    s.localBody.setPosition(REALM_GATE_POS.x, REALM_GATE_POS.y + 30);
    out.label = s.children.list.some((c) => c.type === 'Text' && /Realm Gate/.test(c.text));
    return out;
  });
  check('gate: a labelled Realm Gate stands in the village; the hint shows only when you are beside it; far away E does nothing', gate.label && gate.hintNear && gate.hintFar && !gate.farEnters, JSON.stringify(gate));
  await page.keyboard.press('e'); await page.waitForTimeout(400);
  const inR = await scene(page, (s) => ({ inRealm: s.inRealm, paused: s.scene.isPaused(), overlay: !document.getElementById('realm-overlay').classList.contains('hidden'), hud: document.getElementById('hud').classList.contains('hidden'), canvas: !!document.getElementById('realm-canvas'), size: [document.getElementById('realm-canvas').width, document.getElementById('realm-canvas').height], state: s.realm.state, hint: document.getElementById('realm-gate-hint').classList.contains('hidden'), shards: document.getElementById('realm-shards').textContent }));
  check('gate: pressing E enters the Realm — village paused, HUD hidden, canvas arena ready, shard bank shown', inR.inRealm && inR.paused && inR.overlay && inR.hud && inR.canvas && inR.state === 'banner' && inR.hint && /100/.test(inR.shards), JSON.stringify(inR));
  await scene(page, (s) => { const r = s.realm; r.stop(); r.active = true; window.__st = (n, dt = 1 / 60) => { for (let i = 0; i < n; i++) r._update(dt); }; });
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  const out = await scene(page, (s) => ({ inRealm: s.inRealm, paused: s.scene.isPaused(), overlay: document.getElementById('realm-overlay').classList.contains('hidden'), hud: !document.getElementById('hud').classList.contains('hidden'), shards: s.realm.save.shards, nearGate: Math.hypot(s.localBody.x - REALM_GATE_POS.x, s.localBody.y - REALM_GATE_POS.y) < 110, canAct: s.canAct() }));
  // (Esc was pressed while the arena was stopped-then-reactivated, so it went through the arena's own key handler)
  check('leaving with Esc: back in the village, scene resumed, HUD back, you stand beside the gate and nothing is lost', !out.inRealm && !out.paused && out.overlay && out.hud && out.shards === 100 && out.nearGate && out.canAct, JSON.stringify(out));

  // Re-enter for the combat tests.
  await scene(page, (s) => { s.localBody.setPosition(REALM_GATE_POS.x, REALM_GATE_POS.y + 30); s.interact(); const r = s.realm; r.stop(); r.active = true; window.__st = (n, dt = 1 / 60) => { for (let i = 0; i < n; i++) r._update(dt); }; r.rng = (() => { let t = 12345; return () => { t = (t * 1664525 + 1013904223) >>> 0; return t / 4294967296; }; })(); });

  // 2. Waves: starts with a banner, wave 1 brings 3 enemies, clearing it pays a bonus and the next wave is bigger.
  const w1 = await scene(page, (s) => {
    const r = s.realm; const o = { state0: r.state }; window.__st(100);
    o.state1 = r.state; o.wave = r.run.wave; o.types = r.enemies.filter((e) => e.active).map((e) => e.type).sort(); o.banner = document.getElementById('realm-banner').textContent; o.waveHud = document.getElementById('realm-wave').textContent;
    return o;
  });
  check('waves: a "get ready" banner, then wave 1 spawns 2 Snipers and 1 Burster and the HUD says Wave 1', w1.state0 === 'banner' && w1.state1 === 'play' && w1.wave === 1 && w1.types.join() === 'aimed,aimed,ring' && /Wave 1/.test(w1.waveHud), JSON.stringify(w1));

  // 3. The three patterns, one enemy at a time (the player is invulnerable so only the pattern is measured).
  const pat = await scene(page, (s) => {
    const r = s.realm; const p = r.player; const res = {};
    const reset = () => { [r.enemies, r.eBullets, r.pBullets].forEach((pool) => pool.forEach((o) => { o.active = false; })); p.iframes = 999; p.x = 700; p.y = 400; r.state = 'play'; r.run.wave = 1; };
    // Spiral: steady stream, constant angular step.
    reset(); const sp = r.spawnEnemy('spiral', 300, 270); sp.cd = 0; sp.ax = 300; sp.ay = 270; const a0 = sp.angle; window.__st(60);
    const spShots = Math.round((sp.angle - a0) / 0.47); res.spiral = { bullets: r.eBullets.filter((b) => b.active && b.kind === 1).length, shots: spShots, step: +((sp.angle - a0) / spShots).toFixed(3) };
    // Aimed: a burst of three centred on the player, 0.22 rad apart.
    reset(); const ai = r.spawnEnemy('aimed', 200, 150); ai.cd = 0; r._update(0.001);
    const bs = r.eBullets.filter((b) => b.active).map((b) => Math.atan2(b.vy, b.vx)).sort((a, b) => a - b);
    const want = Math.atan2(p.y - ai.y, p.x - ai.x);
    res.aimed = { n: bs.length, centre: +(bs[1] - want).toFixed(3), gap1: +(bs[1] - bs[0]).toFixed(3), gap2: +(bs[2] - bs[1]).toFixed(3) };
    // Ring: 14 evenly spaced bolts.
    reset(); const rg = r.spawnEnemy('ring', 300, 270); rg.cd = 0; r._update(0.001);
    const ra = r.eBullets.filter((b) => b.active).map((b) => ((Math.atan2(b.vy, b.vx) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)).sort((a, b) => a - b);
    const gaps = ra.map((a, i) => (i ? a - ra[i - 1] : 0)).slice(1);
    res.ring = { n: ra.length, minGap: +Math.min(...gaps).toFixed(3), maxGap: +Math.max(...gaps).toFixed(3), speed: Math.round(Math.hypot(...[r.eBullets.find((b) => b.active)].map((b) => [b.vx, b.vy])[0])) };
    return res;
  });
  check('pattern: Whirlers fire a steady spiral (about 11 bolts a second, a fixed 0.47 rad turn each)', pat.spiral.bullets >= 9 && pat.spiral.bullets <= 13 && pat.spiral.bullets === pat.spiral.shots && Math.abs(pat.spiral.step - 0.47) < 0.005, JSON.stringify(pat.spiral));
  check('pattern: Snipers fire a three-bolt burst aimed at you (centre bolt on target, 0.22 rad apart)', pat.aimed.n === 3 && Math.abs(pat.aimed.centre) < 0.03 && Math.abs(pat.aimed.gap1 - 0.22) < 0.03 && Math.abs(pat.aimed.gap2 - 0.22) < 0.03, JSON.stringify(pat.aimed));
  check('pattern: Bursters fire a ring of 14 evenly spaced bolts', pat.ring.n === 14 && Math.abs(pat.ring.minGap - (Math.PI * 2 / 14)) < 0.02 && Math.abs(pat.ring.maxGap - (Math.PI * 2 / 14)) < 0.02 && pat.ring.speed === 140, JSON.stringify(pat.ring));

  // 4. Shooting: hold fire toward the pointer, bolts fly that way, kill an enemy, bank shards, clear the wave.
  const sh = await scene(page, (s) => {
    const r = s.realm; const p = r.player; const o = {};
    [r.enemies, r.eBullets, r.pBullets].forEach((pool) => pool.forEach((x) => { x.active = false; })); p.iframes = 999; p.x = 200; p.y = 300; r.state = 'play'; r.run.wave = 1; r.run.shards = 0; r.run.kills = 0;
    const e = r.spawnEnemy('aimed', 600, 300); e.cd = 999; e.hp = e.maxHp = 3; e.dir = 0; // a stationary target
    r.mouse = { x: 600, y: 300, down: true, seen: true };
    window.__st(30); const first = r.pBullets.filter((b) => b.active || true).length;
    const shots = r.pBullets.filter((b) => b.active).map((b) => Math.atan2(b.vy, b.vx));
    o.shotsDir = shots.every((a) => Math.abs(a) < 0.01); o.rate = Math.round(r.pBullets.filter((b) => b.active).length + (3 - e.hp));
    window.__st(60); r.mouse.down = false;
    o.dead = !e.active; o.kills = r.run.kills; o.runShards = r.run.shards; o.bank = r.save.shards; o.state = r.state; o.texts = r.texts.filter((t) => t.active).length + 0; o.particles = r.countActive('particles');
    o.saved = JSON.parse(localStorage.getItem('pixeltown-save-v1')).realm;
    return o;
  });
  check('shooting: holding fire sends bolts straight at the pointer and kills the target', sh.shotsDir && sh.dead && sh.kills === 1, JSON.stringify(sh));
  check('reward: a kill banks shards (+2), pops particles, and the run clears the wave for a +5 bonus', sh.runShards === 2 + 5 && sh.bank === 107 && sh.state === 'banner', JSON.stringify(sh));
  check('save: kills, shards and best wave are written under the additive `realm` key', sh.saved && sh.saved.shards === 107 && sh.saved.kills === 6 && sh.saved.bestWave === 2, JSON.stringify(sh.saved));
  const w2 = await scene(page, (s) => { const r = s.realm; window.__st(Math.ceil(2.6 * 60)); return { wave: r.run.wave, n: r.enemiesAlive(), state: r.state }; });
  check('waves: the next wave arrives after the pause and is bigger (wave 2 has 4 enemies)', w2.wave === 2 && w2.n === 4 && w2.state === 'play', JSON.stringify(w2));

  // 5. Taking damage: bolts hurt, invulnerability frames protect, the HP bar follows, death costs 20% and sends you home.
  const dm = await scene(page, (s) => {
    const r = s.realm; const p = r.player; const o = {};
    [r.enemies, r.eBullets, r.pBullets].forEach((pool) => pool.forEach((x) => { x.active = false; })); r.state = 'play'; p.hp = 100; p.iframes = 0; p.x = 400; p.y = 300;
    const put = () => { const b = r.eBullets.find((x) => !x.active); b.active = true; b.x = p.x; b.y = p.y; b.vx = 0; b.vy = 0; b.life = 5; b.kind = 0; };
    put(); r._update(0.001); o.hp1 = p.hp; o.fill1 = document.getElementById('realm-hp-fill').style.width; o.flash = r.flash > 0.5; o.shake = r.shake > 4;
    put(); r._update(0.001); o.hp2 = p.hp; // inside the invulnerability window: no second hit
    window.__st(40); put(); r._update(0.001); o.hp3 = p.hp;
    return o;
  });
  check('damage: a bolt costs 8 HP, the red flash + shake fire, the bar shows 92%, a second bolt inside the i-frames does nothing', dm.hp1 === 92 && dm.fill1 === '92%' && dm.flash && dm.shake && dm.hp2 === 92 && dm.hp3 === 84, JSON.stringify(dm));
  const dth = await scene(page, (s) => {
    const r = s.realm; const p = r.player; const before = r.save.shards; const deaths = r.save.deaths;
    p.hp = 5; p.iframes = 0; const b = r.eBullets.find((x) => !x.active); b.active = true; b.x = p.x; b.y = p.y; b.vx = 0; b.vy = 0; b.life = 5; r._update(0.001);
    const o = { state: r.state, before, after: r.save.shards, deaths: r.save.deaths - deaths, banner: document.getElementById('realm-banner').textContent, saved: JSON.parse(localStorage.getItem('pixeltown-save-v1')).realm };
    window.__st(Math.ceil(2.8 * 60)); o.inRealm = s.inRealm; o.hud = !document.getElementById('hud').classList.contains('hidden');
    return o;
  });
  await page.waitForTimeout(250); // Phaser applies pause/resume on its next step
  dth.paused = await scene(page, (s) => s.scene.isPaused());
  check('death: you lose 20% of the banked shards, the death is counted and saved, and a message says so', dth.state === 'dead' && dth.after === dth.before - Math.floor(dth.before * 0.2) && dth.deaths === 1 && dth.saved.shards === dth.after && /lost/.test(dth.banner), JSON.stringify(dth));
  check('death: after the message you are returned to the running village', !dth.inRealm && !dth.paused && dth.hud, JSON.stringify(dth));

  // 6. Pools never grow, and the per-frame cost stays tiny even with a screen full of bolts.
  await scene(page, (s) => { s.localBody.setPosition(REALM_GATE_POS.x, REALM_GATE_POS.y + 30); s.interact(); const r = s.realm; r.stop(); r.active = true; window.__st = (n, dt = 1 / 60) => { for (let i = 0; i < n; i++) r._update(dt); }; });
  const pool = await scene(page, (s) => {
    const r = s.realm; const p = r.player; const refs = [r.pBullets, r.eBullets, r.enemies, r.particles, r.texts]; const lens = refs.map((a) => a.length); const first = refs.map((a) => a[0]);
    r.run.wave = 7; r.state = 'play'; p.iframes = 1e9; p.x = r.W / 2; p.y = r.H / 2; r.mouse = { x: 800, y: 100, down: true, seen: true };
    for (let i = 0; i < 10; i++) r.spawnEnemy(['spiral', 'aimed', 'ring'][i % 3], 60 + i * 80, 60 + (i % 4) * 100);
    let peakE = 0; let peakP = 0; const t0 = performance.now();
    for (let i = 0; i < 60 * 25; i++) { r._update(1 / 60); peakE = Math.max(peakE, r.countActive('eBullets')); peakP = Math.max(peakP, r.countActive('pBullets')); r.enemies.forEach((e) => { if (e.active) e.hp = e.maxHp = 999; }); }
    const upd = (performance.now() - t0) / (60 * 25);
    const t1 = performance.now(); for (let i = 0; i < 120; i++) r._draw(); const drw = (performance.now() - t1) / 120;
    return { same: refs.every((a, i) => a.length === lens[i] && a[0] === first[i]), peakE, peakP, upd: +upd.toFixed(3), drw: +drw.toFixed(2), caps: [r.eBullets.length, r.pBullets.length] };
  });
  check('pooling: after 25 simulated seconds of heavy fire every pool is the same fixed array (nothing allocated), bolts stay under the caps', pool.same && pool.peakE <= pool.caps[0] && pool.peakE > 150 && pool.peakP <= pool.caps[1], JSON.stringify(pool));
  check('perf: simulating a frame costs < 1.5 ms and drawing one < 6 ms even with hundreds of bolts (headless, software)', pool.upd < 1.5 && pool.drw < 6, JSON.stringify(pool));

  // 7. Controls: WASD moves, Space fires (no pointer yet), the Leave button works.
  const ctl = await scene(page, (s) => {
    const r = s.realm; const p = r.player; [r.enemies, r.eBullets, r.pBullets].forEach((pl) => pl.forEach((x) => { x.active = false; })); r.mouse.seen = false; r.mouse.down = false; r.state = 'play'; p.x = 300; p.y = 300;
    r.keys = { d: true }; window.__st(30); const dx = p.x - 300; r.keys = { s: true }; const y0 = p.y; window.__st(30); const dy = p.y - y0; r.keys = { d: true, s: true }; const x1 = p.x; const y1 = p.y; window.__st(30); const diag = Math.hypot(p.x - x1, p.y - y1);
    r.keys = { a: true }; p.x = 20; window.__st(60); const wall = p.x; r.keys = {};
    return { dx: Math.round(dx), dy: Math.round(dy), diag: Math.round(diag), wall };
  });
  check('controls: WASD moves at ~235 px/s, diagonals are not faster, and walls stop you', ctl.dx >= 112 && ctl.dx <= 122 && ctl.dy >= 112 && ctl.dy <= 122 && ctl.diag >= 112 && ctl.diag <= 122 && ctl.wall >= 11, JSON.stringify(ctl));
  await page.evaluate(() => { document.getElementById('realm-leave-btn').click(); }); await page.waitForTimeout(300);
  check('controls: the Leave button returns to the village', (await scene(page, (s) => !s.inRealm && !s.scene.isPaused())) === true);
  check('no console errors (desktop)', errors.length === 0, errors.join('|'));
  if (process.env.SHOTS) {
    await scene(page, (s) => { s.localBody.setPosition(REALM_GATE_POS.x, REALM_GATE_POS.y + 60); });
    await page.waitForTimeout(500); await page.screenshot({ path: process.env.SHOTS + '/realm-gate-village.png' });
    await scene(page, (s) => { s.interact(); const r = s.realm; r.stop(); r.active = true; r.rng = (() => { let t = 7; return () => { t = (t * 1664525 + 1013904223) >>> 0; return t / 4294967296; }; })(); r.mouse = { x: 760, y: 140, down: true, seen: true }; for (let i = 0; i < 60 * 9; i++) { r._update(1 / 60); if (r.player.hp < 40) r.player.hp = 40; } r.player.iframes = 0; r._draw(); });
    await page.screenshot({ path: process.env.SHOTS + '/realm-desktop.png' });
  }
  await browser.close();

  // 8. Corrupt saves can't mint shards.
  ({ browser, page, errors } = await launch({ width: 1000, height: 700 }, { caveSeed: 0, realm: { shards: -5, bestWave: 'x', kills: 2.7, deaths: 1e12, bogus: 9 } }));
  const cs = await scene(page, (s) => { s.localBody.setPosition(REALM_GATE_POS.x, REALM_GATE_POS.y + 30); s.interact(); const r = s.realm; const o = { ...r.save }; r.stop(); s.exitRealm(); return o; });
  check('corrupt realm save is sanitised: negatives and text become 0, fractions floored, huge values capped, unknown keys dropped', cs.shards === 0 && cs.bestWave === 0 && cs.kills === 2 && cs.deaths === 9999999 && !('bogus' in cs), JSON.stringify(cs));
  await browser.close();

  // 9. Phone: portrait arena, HUD fits, both sticks work (left moves, right aims and fires), nothing overlaps.
  ({ browser, page, errors } = await launch({ width: 390, height: 844 }, seed, true));
  await scene(page, (s) => { s.localBody.setPosition(REALM_GATE_POS.x, REALM_GATE_POS.y + 30); s.interact(); const r = s.realm; r.stop(); r.active = true; r.rng = (() => { let t = 99; return () => { t = (t * 1664525 + 1013904223) >>> 0; return t / 4294967296; }; })(); window.__st = (n, dt = 1 / 60) => { for (let i = 0; i < n; i++) r._update(dt); }; r._resize(); });
  const ph = await page.evaluate(() => {
    const r = (id) => document.getElementById(id).getBoundingClientRect(); const over = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const hud = r('realm-hud'); const hp = r('realm-hp'); const leave = r('realm-leave-btn'); const ms = r('realm-stick-move'); const as = r('realm-stick-aim');
    const rr = window.__g.scene.getScene('Town').realm;
    return { inside: [hp, leave, ms, as].every((b) => b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= innerHeight), sticks: ms.width >= 100 && as.width >= 100, leaveH: Math.round(leave.height), overlap: [over(ms, as), over(ms, hud), over(as, hud), over(ms, leave), over(as, leave)].filter(Boolean).length, arena: [rr.W, rr.H], sw: document.documentElement.scrollWidth };
  });
  check('phone: portrait arena (taller than wide), HUD + Leave button + both sticks fit on screen, sticks >= 100px, no overlaps, no sideways scroll', ph.inside && ph.sticks && ph.leaveH >= 40 && ph.overlap === 0 && ph.arena[1] > ph.arena[0] && ph.sw <= 390, JSON.stringify(ph));
  const st = await page.evaluate(() => {
    const s = window.__g.scene.getScene('Town'); const r = s.realm; const move = document.getElementById('realm-stick-move'); const aim = document.getElementById('realm-stick-aim');
    const mb = move.getBoundingClientRect(); const ab = aim.getBoundingClientRect();
    const ev = (el, type, x, y) => el.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: type.startsWith('pointer') ? 7 : 1, bubbles: true, pointerType: 'touch' }));
    [r.enemies, r.eBullets, r.pBullets].forEach((pl) => pl.forEach((x) => { x.active = false; })); r.state = 'play'; r.player.x = 200; r.player.y = 400; r.player.iframes = 1e9;
    ev(move, 'pointerdown', mb.left + mb.width / 2 + 40, mb.top + mb.height / 2); const mv = { ...r.moveVec }; const x0 = r.player.x; window.__st(30); const moved = r.player.x - x0; ev(move, 'pointerup', 0, 0); const mvEnd = { ...r.moveVec };
    ev(aim, 'pointerdown', ab.left + ab.width / 2, ab.top + ab.height / 2 - 40); const av = { ...r.aimVec }; window.__st(30); const shots = r.countActive('pBullets'); const up = r.pBullets.filter((b) => b.active).every((b) => b.vy < -300 && Math.abs(b.vx) < 5); ev(aim, 'pointerup', 0, 0); const avEnd = { ...r.aimVec };
    return { mv, moved: Math.round(moved), mvEnd, av, shots, up, avEnd };
  });
  check('phone: dragging the left stick moves you (right, ~0.87 of max speed) and releasing stops you', st.mv.x > 0.8 && st.moved > 90 && st.mvEnd.x === 0 && st.mvEnd.y === 0, JSON.stringify(st));
  check('phone: dragging the right stick up aims and auto-fires straight up; releasing stops firing', st.av.on && st.av.y < -0.8 && st.shots >= 3 && st.up && !st.avEnd.on, JSON.stringify(st));
  if (process.env.SHOTS) {
    await scene(page, (s) => { const r = s.realm; r.mouse.seen = false; r.run.wave = 3; r.state = 'play'; r.player.iframes = 1e9; r.player.hp = 70; [0, 1, 2, 0, 1].forEach((k, i) => r.spawnEnemy(['spiral', 'aimed', 'ring'][k], 80 + i * 55, 90 + (i % 3) * 60)); r.aimVec = { x: 0.2, y: -0.9, on: true }; window.__st(60 * 6); r.player.iframes = 0; r._draw(); });
    await page.screenshot({ path: process.env.SHOTS + '/realm-phone.png' });
  }
  check('no console errors (phone)', errors.length === 0, errors.join('|'));
  await browser.close();
  done();
})();
