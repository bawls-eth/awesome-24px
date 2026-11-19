// Realm slice B3: biomes with hazards, wandering critters, the Gloomheart boss with three phases, the kill board.
// Combat is stepped with fixed dt, so results do not depend on the headless frame rate.
const { launch, scene, check, done } = require('./helpers');
const SAVE = 'pixeltown-save-v1';
const seed = { caveSeed: 0, resources: { stone: 1 }, realm: { shards: 100, bestWave: 2, kills: 5, deaths: 1 } };

const enter = (s) => {
  s.localBody.setPosition(REALM_GATE_POS.x, REALM_GATE_POS.y + 30); s.interact();
  const r = s.realm; r.stop(); r.active = true;
  window.__st = (n, dt = 1 / 60) => { for (let i = 0; i < n; i++) r._update(dt); };
  let t = 777; r.rng = () => { t = (t * 1664525 + 1013904223) >>> 0; return t / 4294967296; };
  window.__clear = () => { [r.enemies, r.eBullets, r.pBullets, r.bags, r.drifters, r.hazards, r.texts].forEach((p) => p.forEach((o) => { o.active = false; })); r.player.iframes = 0; r.player.x = 300; r.player.y = 400; r.state = 'play'; };
  window.__wave = (w) => { window.__clear(); r.run.wave = w - 1; r.state = 'banner'; r.nextWaveIn = 0; r._update(0.001); };
  window.__clear();
};

(async () => {
  let { browser, page, errors } = await launch({ width: 1000, height: 700 }, seed);
  await scene(page, enter);

  // 1. Biomes: three themes by wave, each with its own floor, border, wanderers and hazard.
  const bio = await scene(page, (s) => {
    const r = s.realm; const o = { idx: [1, 3, 4, 6, 7, 9, 10, 13].map((w) => rmBiomeIndex(w)) };
    window.__wave(1); o.w1 = { biome: r.biome, banner: document.getElementById('realm-banner').textContent, haz: r.countActive('hazards'), label: document.getElementById('realm-biome').textContent };
    window.__wave(4); o.w4 = { biome: r.biome, banner: document.getElementById('realm-banner').textContent, haz: r.hazards.filter((h) => h.active).map((h) => h.kind), label: document.getElementById('realm-biome').textContent, types: r.enemies.filter((e) => e.active).map((e) => e.type) };
    window.__wave(7); o.w7 = { biome: r.biome, banner: document.getElementById('realm-banner').textContent, haz: r.hazards.filter((h) => h.active).map((h) => h.kind) };
    const hash = (c) => { const d = c.getContext('2d').getImageData(0, 0, 64, 64).data; let h = 0; for (let i = 0; i < d.length; i++) h = (Math.imul(h, 31) + d[i]) >>> 0; return h; };
    o.floors = new Set(r.sprites.floors.map(hash)).size;
    // placed away from the player and not on top of each other
    window.__wave(4); const hz = r.hazards.filter((h) => h.active); o.sep = hz.every((h, i) => hz.every((g, j) => i === j || Math.hypot(h.x - g.x, h.y - g.y) >= 90)) && hz.every((h) => Math.hypot(h.x - r.player.x, h.y - r.player.y) >= 130);
    return o;
  });
  check('biomes: waves 1-3 Violet Hollow, 4-6 Ember Waste, 7-9 Frost Mire, then it loops', bio.idx.join() === '0,0,1,1,2,2,0,1', JSON.stringify(bio.idx));
  check('biomes: the banner and HUD name the new biome; Hollow has no hazard, Ember has 3 lava pools, Frost 3 ice pools', /Violet Hollow/.test(bio.w1.banner) && bio.w1.haz === 0 && /Ember Waste/.test(bio.w4.banner) && bio.w4.label === 'Ember Waste' && bio.w4.haz.join() === 'lava,lava,lava' && /Frost Mire/.test(bio.w7.banner) && bio.w7.haz.join() === 'ice,ice,ice', JSON.stringify(bio));
  check('biomes: each has its own floor tile, hazards keep clear of you and of each other, Ember sends more Bursters', bio.floors === 3 && bio.sep && bio.w4.types.filter((t) => t === 'ring').length >= 2, JSON.stringify([bio.floors, bio.sep, bio.w4.types]));
  const hz = await scene(page, (s) => {
    const r = s.realm; const o = {};
    window.__wave(4); [r.enemies].forEach((p) => p.forEach((e) => { e.active = false; })); const keep = r.spawnEnemy('spiral', r.W - 50, r.H - 50); keep.cd = 1e9; keep.hp = keep.maxHp = 1e9; keep.ax = keep.x; keep.ay = keep.y; const lava = r.hazards.find((h) => h.active); r.player.x = lava.x; r.player.y = lava.y; r.player.iframes = 0; const hp0 = r.player.hp;
    o.ticks = []; for (let i = 0; i < 160; i++) { const before = r.player.hp; window.__st(1); if (r.player.hp < before) o.ticks.push(+(i / 60).toFixed(2)); }
    o.lostLava = hp0 - r.player.hp;
    r.player.x = 20; r.player.y = 20; r.player.iframes = 0; const hpEdge = r.player.hp; window.__st(120); o.safe = r.player.hp === hpEdge;
    window.__wave(7); [r.enemies].forEach((p) => p.forEach((e) => { e.active = false; })); const ice = r.hazards.find((h) => h.active);
    r.keys = { d: true }; r.player.x = Math.max(60, ice.x - 20); r.player.y = ice.y; r.player.iframes = 999; window.__st(1); o.slow = r._speedMul; const x0 = r.player.x; window.__st(30); o.iceMoved = Math.round(r.player.x - x0);
    r.player.x = 20; r.player.y = 20; r.keys = { d: true }; const x1 = r.player.x; window.__st(30); r.keys = {}; o.freeMoved = Math.round(r.player.x - x1);
    return o;
  });
  check('hazards: standing in lava burns 5 HP about every 0.7 s; the far corner is safe', hz.ticks.length >= 3 && hz.lostLava >= 15 && hz.lostLava <= 25 && hz.safe, JSON.stringify(hz));
  check('hazards: ice slows you to 55% (about 64 px in half a second instead of 117)', hz.slow === 0.55 && hz.iceMoved <= 70 && hz.freeMoved >= 112, JSON.stringify(hz));

  // 2. Wanderers: harmless critters for small rewards, not needed to clear the wave.
  const dr = await scene(page, (s) => {
    const r = s.realm; const o = {};
    window.__wave(2); const n = r.countActive('drifters'); o.n = n; o.kind = r.drifters.find((d) => d.active).kind;
    const d0 = r.drifters.filter((d) => d.active).map((d) => [d.x, d.y]); window.__st(120); const d1 = r.drifters.filter((d) => d.active).map((d) => [d.x, d.y]); o.moved = d1.some((p, i) => Math.hypot(p[0] - d0[i][0], p[1] - d0[i][1]) > 30);
    o.inside = r.drifters.every((d) => !d.active || (d.x >= 15 && d.x <= r.W - 15 && d.y >= 15 && d.y <= r.H - 15));
    const hp0 = r.player.hp; const d = r.drifters.find((x) => x.active); r.player.x = d.x; r.player.y = d.y; r.player.iframes = 0; r.eBullets.forEach((b) => { b.active = false; }); window.__st(20); o.harmless = r.player.hp === hp0;
    r.player.x = 400; r.player.y = 500;
    const sh = r.save.shards; const xp0 = r.save.xp + r.save.level * 1000; const kb0 = r.save.kb.drifter; const target = r.drifters.find((x) => x.active);
    r.pBullets[0].active = true; r.pBullets[0].x = target.x; r.pBullets[0].y = target.y; r.pBullets[0].vx = r.pBullets[0].vy = 0; r.pBullets[0].life = 1; r._update(0.001);
    o.gained = r.save.shards - sh; o.kb = r.save.kb.drifter - kb0; o.xp = (r.save.xp + r.save.level * 1000) - xp0; o.left = r.countActive('drifters');
    r.enemies.forEach((e) => { if (e.active) { e.hp = 0.5; r._hitEnemy(e, 1); } }); window.__st(1); o.stateAfterClear = r.state; // killing every enemy clears the wave even with wanderers alive
    return o;
  });
  check('wanderers: 3-5 spawn each wave (wisps in Hollow), they drift around inside the arena and touching them is harmless', dr.n >= 3 && dr.n <= 5 && dr.kind === 'wisp' && dr.moved && dr.inside && dr.harmless, JSON.stringify(dr));
  check('wanderers: one bolt pops one for +1 shard and a little XP, and it is counted on the kill board; wave clears without them', dr.gained >= 1 && dr.kb === 1 && dr.xp >= 2 && dr.left === dr.n - 1 && dr.stateAfterClear === 'banner', JSON.stringify(dr));

  // 3. The boss.
  const b1 = await scene(page, (s) => {
    const r = s.realm; const o = {};
    window.__wave(5); const e = r._boss(); o.exists = !!e; o.onlyBoss = r.enemies.filter((x) => x.active).length === 1; o.hp = e && e.maxHp; o.banner = document.getElementById('realm-banner').textContent;
    o.hud = { shown: !document.getElementById('realm-boss').classList.contains('hidden'), name: document.getElementById('realm-boss-name').textContent, w: document.getElementById('realm-boss-fill').style.width };
    o.shielded = e.invuln > 1; r.player.iframes = 1e9; r.player.x = 120; r.player.y = 600;
    r._hitEnemy(e, 50); o.afterShieldHit = e.hp === e.maxHp; // spawn shield: no damage yet
    window.__st(80); o.vulnerable = e.invuln === 0;
    return o;
  });
  check('boss: wave 5 is Gloomheart alone (120 HP) with a name banner, a boss bar at full, and a short spawn shield', b1.exists && b1.onlyBoss && b1.hp === 120 && /Gloomheart/.test(b1.banner) && b1.hud.shown && /phase 1/.test(b1.hud.name) && b1.hud.w === '100%' && b1.shielded && b1.afterShieldHit && b1.vulnerable, JSON.stringify(b1));
  const ph = await scene(page, (s) => {
    const r = s.realm; const o = {}; const e = r._boss(); r.player.iframes = 1e9; r.player.x = 120; r.player.y = 600; e.invuln = 0; e.cd = 0; e.cd2 = 99; e.angle = 0;
    // phase 1: a three-armed spiral
    r.eBullets.forEach((b) => { b.active = false; }); r._update(0.001); const a1 = r.eBullets.filter((b) => b.active).map((b) => ((Math.atan2(b.vy, b.vx) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)).sort((x, y) => x - y);
    o.p1 = { n: a1.length, gap: +((a1[1] - a1[0])).toFixed(3) };
    // crossing 66%: phase 2, bullets cleared, banner, shielded, two Snipers summoned
    const before = r.countActive('enemies'); r._hitEnemy(e, e.hp - e.maxHp * 0.65); window.__sd = null;
    o.p2 = { phase: e.phase, cleared: r.countActive('eBullets') === 0, banner: document.getElementById('realm-banner').textContent, shield: e.invuln > 0.9, adds: r.countActive('enemies') - before, bar: document.getElementById('realm-boss-name').textContent, hud: document.getElementById('realm-boss-fill').style.width };
    r._hitEnemy(e, 10); o.shieldBlocks = e.hp === Math.ceil(e.maxHp * 0.65) || Math.abs(e.hp - e.maxHp * 0.65) < 0.001;
    window.__st(70); r.enemies.forEach((x) => { if (x.active && x !== e) x.active = false; }); e.cd = 0; e.cd2 = 99; r.eBullets.forEach((b) => { b.active = false; }); r._update(0.001);
    const ring = r.eBullets.filter((b) => b.active && b.kind === 2).map((b) => ((Math.atan2(b.vy, b.vx) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)).sort((x, y) => x - y);
    o.p2ring = { n: ring.length, gap: +(ring[1] - ring[0]).toFixed(3) };
    // crossing 33%: phase 3 enraged
    r._hitEnemy(e, e.hp - e.maxHp * 0.3); o.p3 = { phase: e.phase, banner: document.getElementById('realm-banner').textContent, dataPhase: document.getElementById('realm-boss').dataset.phase };
    window.__st(70); e.cd = 0; e.cd2 = 99; r.eBullets.forEach((b) => { b.active = false; }); r._update(0.001);
    const dbl = r.eBullets.filter((b) => b.active && b.kind === 1).map((b) => Math.atan2(b.vy, b.vx)); o.p3dbl = { n: dbl.length, opposite: dbl.length === 2 && Math.abs(Math.abs(dbl[0] - dbl[1]) - Math.PI) < 0.01 };
    // density: bolts fired over one second in phase 1 vs phase 3
    const rate = (ph) => { e.phase = ph; e.invuln = 0; e.cd = 0; e.cd2 = 0.5; r.eBullets.forEach((b) => { b.active = false; }); window.__st(60); return r.countActive('eBullets'); };
    o.rate1 = rate(1); o.rate3 = rate(3);
    return o;
  });
  check('boss phase 1: a three-armed spiral (3 bolts 120 degrees apart per step)', ph.p1.n === 3 && Math.abs(ph.p1.gap - Math.PI * 2 / 3) < 0.01, JSON.stringify(ph.p1));
  check('boss phase 2 (below 66%): bolts cleared, "summons help" banner, spawn shield, two Snipers join, the bar turns to phase 2; damage is blocked while shielded', ph.p2.phase === 2 && ph.p2.cleared && /summons/.test(ph.p2.banner) && ph.p2.shield && ph.p2.adds === 2 && /phase 2/.test(ph.p2.bar) && ph.shieldBlocks, JSON.stringify(ph.p2));
  check('boss phase 2: rings of 20 evenly spaced bolts', ph.p2ring.n === 20 && Math.abs(ph.p2ring.gap - Math.PI * 2 / 20) < 0.02, JSON.stringify(ph.p2ring));
  check('boss phase 3 (below 33%): ENRAGED banner, a double spiral (two opposite bolts per step) and it fires more than in phase 1', ph.p3.phase === 3 && /ENRAGED/.test(ph.p3.banner) && ph.p3.dataPhase === '3' && ph.p3dbl.opposite && ph.rate3 > ph.rate1, JSON.stringify([ph.p3, ph.p3dbl, ph.rate1, ph.rate3]));
  const kill = await scene(page, (s) => {
    const r = s.realm; const o = {}; const e = r._boss(); r.player.iframes = 1e9; e.invuln = 0; r.enemies.forEach((x) => { if (x !== e) x.active = false; });
    r.bags.forEach((b) => { b.active = false; }); const sh = r.save.shards; const kb0 = r.save.kb.boss; const xp0 = r.save.xp + 1000 * r.save.level; const best0 = r.save.bossBestT; r.clock = r.bossT0 + 47.3;
    r._hitEnemy(e, e.hp + 1);
    o.dead = !e.active; o.gain = r.save.shards - sh; o.kb = r.save.kb.boss - kb0; o.best = r.save.bossBestT; o.best0 = best0; o.banner = document.getElementById('realm-banner').textContent; o.barHidden = document.getElementById('realm-boss').classList.contains('hidden');
    o.bags = r.bags.filter((b) => b.active).map((b) => b.r); o.xpGain = (r.save.xp + 1000 * r.save.level) - xp0;
    o.saved = JSON.parse(localStorage.getItem('pixeltown-save-v1')).realm; window.__st(1); o.state = r.state;
    return o;
  });
  check('boss defeat: +50 shards, a kill-board entry, 100 XP, the bar disappears and the wave clears', kill.dead && kill.gain >= 50 && kill.kb === 1 && kill.xpGain >= 100 && kill.barHidden && kill.state === 'banner' && /defeated/.test(kill.banner), JSON.stringify(kill));
  check('boss defeat: two loot bags drop, the first guaranteed rare; the fastest time (47.3 s) is recorded and saved', kill.bags.length === 2 && kill.bags[0] === 2 && kill.best === 473 && kill.saved.bossBestT === 473 && kill.saved.kb.boss === 1 && /New best time/.test(kill.banner), JSON.stringify(kill));
  const tier = await scene(page, (s) => {
    const r = s.realm; window.__wave(10); const e = r._boss(); const o = { hp: e.maxHp, biome: r.biome, tier: r.run.wave / 5 };
    r.save.bossBestT = 473; r.clock = r.bossT0 + 90; e.invuln = 0; r._hitEnemy(e, e.hp + 1); o.keptBest = r.save.bossBestT; // slower than the record: best stays
    window.__wave(6); o.after = { boss: !!r._boss(), enemies: r.countActive('enemies'), biome: r.biome };
    return o;
  });
  check('boss scaling: the wave-10 boss has 160 HP; a slower kill does not replace the best time; wave 6 is a normal Ember wave again', tier.hp === 160 && tier.keptBest === 473 && !tier.after.boss && tier.after.enemies >= 6 && tier.after.biome === 1, JSON.stringify(tier));

  // 4. The kill board.
  await scene(page, (s) => { const r = s.realm; r.save.kb = { spiral: 12, aimed: 34, ring: 5, drifter: 21, boss: 2 }; r.save.bossBestT = 473; r.save.bestWave = 11; r.save.deaths = 3; r.onSave(r.save); });
  await page.keyboard.press('k'); await page.waitForTimeout(100);
  const bd = await scene(page, (s) => { const r = s.realm; return { paused: r.paused, open: !document.getElementById('realm-board').classList.contains('hidden'), bpHidden: document.getElementById('realm-backpack').classList.contains('hidden'), text: [...document.querySelectorAll('.realm-board-row')].map((r) => r.children[0].textContent + ' ' + r.children[1].textContent).join(' | '), rows: document.querySelectorAll('.realm-board-row').length }; });
  check('board: K opens the kill board and pauses; it lists best wave, level, shards, falls, kills per enemy type, wanderers, boss kills and the fastest boss time', bd.paused && bd.open && bd.bpHidden && bd.rows === 10 && /Best wave 11/.test(bd.text) && /Snipers 34/.test(bd.text) && /Wanderers 21/.test(bd.text) && /Gloomheart defeated 2/.test(bd.text) && /47\.3 s/.test(bd.text) && /Falls 3/.test(bd.text), JSON.stringify(bd));
  await page.keyboard.press('b'); await page.waitForTimeout(100);
  const sw = await scene(page, (s) => ({ panel: s.realm.panel, board: document.getElementById('realm-board').classList.contains('hidden'), bp: !document.getElementById('realm-backpack').classList.contains('hidden') }));
  check('board: opening the backpack (B) swaps panels — only one is ever open', sw.panel === 'bp' && sw.board && sw.bp, JSON.stringify(sw));
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  const esc = await scene(page, (s) => ({ panel: s.realm.panel, paused: s.realm.paused, inRealm: s.inRealm }));
  check('board: Esc closes the open panel first (you stay in the Realm), the game resumes', esc.panel === null && !esc.paused && esc.inRealm, JSON.stringify(esc));
  const dead = await scene(page, (s) => { const r = s.realm; window.__clear(); r.state = 'dead'; r.deadT = 2; r.setBoard(true); r.setPaused(true); const o = { paused: r.paused, panel: r.panel }; r.state = 'play'; return o; });
  check('death: the backpack and kill board cannot be opened during the death message (the exit would freeze)', dead.paused === false && dead.panel !== 'bp' && dead.panel !== 'board', JSON.stringify(dead));
  check('no console errors (desktop)', errors.length === 0, errors.join('|'));
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).realm, SAVE);
  if (process.env.SHOTS) {
    await scene(page, (s) => { const r = s.realm; r.save.level = 8; r._calcStats(); r.player.hp = r.stats.maxHp * 0.8; window.__wave(5); const e = r._boss(); e.invuln = 0; e.hp = e.maxHp * 0.5; e.phase = 2; r._syncBoss(); r.player.iframes = 1e9; r.player.x = 220; r.player.y = 520; r.mouse = { x: 600, y: 140, down: true, seen: true }; r.abilityCd = [0, 3, 0, 6]; r._syncAbilities(); window.__st(60 * 3); r.player.iframes = 0; r._draw(); });
    await page.screenshot({ path: process.env.SHOTS + '/realm3-boss.png' });
    await scene(page, (s) => { const r = s.realm; window.__wave(4); r.player.iframes = 1e9; r.player.x = 400; r.player.y = 520; window.__st(60 * 3); r._draw(); });
    await page.screenshot({ path: process.env.SHOTS + '/realm3-ember.png' });
    await scene(page, (s) => { const r = s.realm; window.__wave(7); r.player.iframes = 1e9; window.__st(60 * 2); r._draw(); });
    await page.screenshot({ path: process.env.SHOTS + '/realm3-frost.png' });
    await page.keyboard.press('k'); await page.waitForTimeout(150); await page.screenshot({ path: process.env.SHOTS + '/realm3-board.png' });
  }
  await browser.close();

  // 5. Saves: the board persists across a reload; old / corrupt saves are cleaned.
  ({ browser, page, errors } = await launch({ width: 1000, height: 700 }, { caveSeed: 0, realm: { shards: 10, kb: { spiral: 3, aimed: '7', ring: -4, drifter: 2.9, boss: 1e12, bogus: 5 }, bossBestT: 'x' } }));
  const cs = await scene(page, (s) => ({ ...rmCleanSave(s.realmSave), oldKb: rmCleanSave({ shards: 5 }).kb.boss, oldBest: rmCleanSave({ shards: 5 }).bossBestT }));
  check('save: corrupt kill-board numbers are cleaned (text/negative -> 0, fractions floored, capped), unknown keys dropped, an old save has an empty board', cs.kb.spiral === 3 && cs.kb.aimed === 7 && cs.kb.ring === 0 && cs.kb.drifter === 2 && cs.kb.boss === 9999999 && !('bogus' in cs.kb) && cs.bossBestT === 0 && cs.oldKb === 0 && cs.oldBest === 0, JSON.stringify(cs.kb));
  await browser.close();
  ({ browser, page, errors } = await launch({ width: 1000, height: 700 }, { caveSeed: 0, realm: saved }));
  const re = await scene(page, (s) => { s.localBody.setPosition(REALM_GATE_POS.x, REALM_GATE_POS.y + 30); s.interact(); const r = s.realm; r.stop(); r.setBoard(true); return { kb: r.save.kb, best: r.save.bossBestT, text: [...document.querySelectorAll('.realm-board-row')].map((r) => r.children[0].textContent + ' ' + r.children[1].textContent).join(' | ') }; });
  check('save: the kill board and best boss time survive a reload and show in the board', re.kb.boss === 2 && re.best === 473 && /47\.3 s/.test(re.text) && re.kb.aimed >= 34, JSON.stringify(re));
  await browser.close();

  // 6. Phone: HUD with both panel buttons fits, boss bar clear of the HUD, board fits and works by touch.
  ({ browser, page, errors } = await launch({ width: 390, height: 844 }, { caveSeed: 0, realm: { shards: 100, level: 8, kb: { spiral: 3, aimed: 4, ring: 5, drifter: 6, boss: 1 }, bossBestT: 612 } }, true));
  await scene(page, enter);
  await scene(page, (s) => { const r = s.realm; r._resize(); window.__wave(5); r.player.iframes = 1e9; });
  const phn = await page.evaluate(() => {
    const r = (id) => document.getElementById(id).getBoundingClientRect(); const over = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const boss = r('realm-boss'); const hud = [r('realm-hp'), r('realm-bp-btn'), r('realm-board-btn'), r('realm-leave-btn'), r('realm-info')]; const xp = r('realm-xp');
    const btns = ['realm-bp-btn', 'realm-board-btn', 'realm-leave-btn'].map(r);
    return { bossIn: boss.left >= 0 && boss.right <= innerWidth && boss.top > 0, bossOverlaps: hud.filter((h) => over(boss, h)).length + (over(boss, xp) ? 1 : 0), btnsIn: btns.every((b) => b.right <= innerWidth && b.left >= 0), btnOverlap: over(btns[0], btns[1]) || over(btns[1], btns[2]) || over(btns[0], btns[2]), minH: Math.round(Math.min(...btns.map((b) => b.height))), sw: document.documentElement.scrollWidth };
  });
  check('phone: backpack, board and Leave buttons fit the HUD row (>= 40px), the boss bar sits clear of the HUD and the XP bar, no sideways scroll', phn.bossIn && phn.bossOverlaps === 0 && phn.btnsIn && !phn.btnOverlap && phn.minH >= 40 && phn.sw <= 390, JSON.stringify(phn));
  await page.tap('#realm-board-btn'); await page.waitForTimeout(200);
  const pb = await page.evaluate(() => { const card = document.querySelector('#realm-board .realm-bp-card').getBoundingClientRect(); const c = document.getElementById('realm-board-close').getBoundingClientRect(); return { open: !document.getElementById('realm-board').classList.contains('hidden'), fits: card.left >= 0 && card.right <= innerWidth && card.bottom <= innerHeight, closeH: Math.round(c.height), text: document.getElementById('realm-board-body').textContent }; });
  check('phone: tapping 📊 opens the kill board (fits the screen, 40px close button) and ✖ closes it', pb.open && pb.fits && pb.closeH >= 40 && /61\.2 s/.test(pb.text), JSON.stringify(pb));
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/realm3-board-phone.png' });
  await page.tap('#realm-board-close'); await page.waitForTimeout(150);
  check('phone: closing resumes play', (await scene(page, (s) => !s.realm.paused)) === true);
  if (process.env.SHOTS) { await scene(page, (s) => { const r = s.realm; const e = r._boss(); e.invuln = 0; e.hp = e.maxHp * 0.25; e.phase = 3; r._syncBoss(); r.aimVec = { x: 0.1, y: -1, on: true }; r.player.x = 200; r.player.y = 650; window.__st(60 * 3); r.player.iframes = 0; r._draw(); }); await page.screenshot({ path: process.env.SHOTS + '/realm3-boss-phone.png' }); }
  check('no console errors (phone)', errors.length === 0, errors.join('|'));
  await browser.close();
  done();
})();
