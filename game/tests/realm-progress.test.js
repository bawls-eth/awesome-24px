// Realm slice B2: XP and levels, loot bags and rarities, equipment + backpack UI, four abilities.
// Combat is stepped with fixed dt so it does not depend on the headless frame rate.
const { launch, scene, check, done } = require('./helpers');
const SAVE = 'pixeltown-save-v1';
const seed = { caveSeed: 0, resources: { stone: 1 }, realm: { shards: 100, bestWave: 2, kills: 5, deaths: 1 } };

const enter = (s) => {
  s.localBody.setPosition(REALM_GATE_POS.x, REALM_GATE_POS.y + 30); s.interact();
  const r = s.realm; r.stop(); r.active = true;
  window.__st = (n, dt = 1 / 60) => { for (let i = 0; i < n; i++) r._update(dt); };
  let t = 4242; r.rng = () => { t = (t * 1664525 + 1013904223) >>> 0; return t / 4294967296; };
  [r.enemies, r.eBullets, r.pBullets, r.bags].forEach((p) => p.forEach((o) => { o.active = false; }));
  r.state = 'play'; r.run.wave = 1; r.player.iframes = 0; r.player.x = 300; r.player.y = 300;
};

(async () => {
  let { browser, page, errors } = await launch({ width: 1000, height: 700 }, seed);
  await scene(page, enter);

  // 1. XP and levels.
  const x1 = await scene(page, (s) => {
    const r = s.realm; const o = { lvl0: r.save.level, xp0: r.save.xp, hp0: r.stats.maxHp, hud0: document.getElementById('realm-level').textContent };
    const e = r.spawnEnemy('spiral', 700, 100); e.hp = 1; e.cd = 999; r._hitEnemy(e, 1); o.afterKill = r.save.xp; // a Whirler is worth 7 xp at wave 1
    o.bar = document.getElementById('realm-xp-fill').style.width; o.barText = document.getElementById('realm-xp-text').textContent;
    r.player.hp = 50; r._gainXp(25); // 7 + 25 = 32 -> level 2 with 2 xp left (30 needed)
    o.lvl1 = r.save.level; o.xp1 = r.save.xp; o.hp1 = r.stats.maxHp; o.healed = r.player.hp; o.banner = document.getElementById('realm-banner').textContent; o.hud1 = document.getElementById('realm-level').textContent;
    o.saved = JSON.parse(localStorage.getItem('pixeltown-save-v1')).realm; o.need2 = rmXpNeeded(2);
    r._gainXp(60); o.lvl2 = r.save.level; o.banner3 = document.getElementById('realm-banner').textContent; // level 2 needs 50: 2 + 60 = 62 -> level 3
    return o;
  });
  check('xp: kills give xp (Whirler = 7), the bar and counter show it', x1.lvl0 === 1 && x1.afterKill === 7 && x1.bar === '23.3333%' && /7 \/ 30/.test(x1.barText) && x1.hud0 === 'Lv 1', JSON.stringify(x1));
  check('level up: 32 xp = level 2 with 2 xp left, +8 max HP, a heal, the banner and HUD say Level 2', x1.lvl1 === 2 && x1.xp1 === 2 && x1.hp1 === x1.hp0 + 8 && x1.healed > 50 && /Level 2/.test(x1.banner) && x1.hud1 === 'Lv 2', JSON.stringify(x1));
  check('level up: reaching level 3 announces the Nova ability that it unlocks; level and xp are saved', x1.lvl2 === 3 && /Level 3/.test(x1.banner3) && /Nova/.test(x1.banner3) && x1.saved.level === 2 && x1.saved.xp === 2 && x1.need2 === 50, JSON.stringify(x1));
  const cap = await scene(page, (s) => { const r = s.realm; r.save.level = 19; r.save.xp = 0; r._calcStats(); r._gainXp(100000); const a = { lvl: r.save.level, xp: r.save.xp, bar: document.getElementById('realm-xp-fill').style.width, txt: document.getElementById('realm-xp-text').textContent }; r._gainXp(50); a.after = r.save.level; r.save.level = 3; r.save.xp = 0; r._calcStats(); return a; });
  check('level cap: level 20 is the maximum — the bar fills, xp stops, MAX is shown', cap.lvl === 20 && cap.xp === 0 && cap.bar === '100%' && cap.txt === 'MAX' && cap.after === 20, JSON.stringify(cap));

  // 2. Loot bags.
  const l1 = await scene(page, (s) => {
    const r = s.realm; const o = {}; const n0 = r.save.items.length;
    r.bags.forEach((x) => { x.active = false; }); r.texts.forEach((x) => { x.active = false; });
    const b = r.dropBag(500, 300, 2, 'sparkwand'); o.dropped = !!b && r.countActive('bags') === 1;
    r.player.x = 300; r.player.y = 300; window.__st(60); o.stillThere = r.countActive('bags'); // far away: stays put
    b.x = 310; b.y = 300; b.vx = b.vy = 0; window.__st(40);
    o.n = r.save.items.length - n0; o.item = r.save.items[r.save.items.length - 1]; o.bags = r.countActive('bags'); o.text = r.texts.filter((t) => t.active).map((t) => t.text).join('|');
    o.saved = JSON.parse(localStorage.getItem('pixeltown-save-v1')).realm.items.length;
    return o;
  });
  check('loot: a bag drops, waits until you walk over it, then the item goes to your backpack (rare Spark Wand) and is saved', l1.dropped && l1.n === 1 && l1.bags === 0 && l1.item.id === 'sparkwand' && l1.item.r === 2 && l1.item.n >= 1 && /Spark Wand/.test(l1.text) && l1.saved === l1.n, JSON.stringify(l1));
  const l2 = await scene(page, (s) => {
    const r = s.realm; let t = 99; r.rng = () => { t = (t * 1664525 + 1013904223) >>> 0; return t / 4294967296; };
    const tally = (wave) => { r.run.wave = wave; const c = [0, 0, 0]; for (let i = 0; i < 4000; i++) c[r.rollRarity()]++; return c.map((v) => +(v / 4000).toFixed(3)); };
    const w1 = tally(1); const w8 = tally(8);
    let drops = 0; const orig = r.dropBag.bind(r); r.dropBag = (...a) => { drops++; return orig(...a); };
    r.run.wave = 1; for (let i = 0; i < 400; i++) { const e = r.spawnEnemy('aimed', 600, 100); e.hp = 1; e.cd = 999; r._hitEnemy(e, 1); r.bags.forEach((b) => { b.active = false; }); }
    r.dropBag = orig; r.run.wave = 1;
    const uids = new Set(r.save.items.map((i) => i.n));
    return { w1, w8, dropRate: +(drops / 400).toFixed(3), uniq: uids.size === r.save.items.length };
  });
  check('loot: about 30% of kills drop a bag; common items dominate wave 1, rarer ones become likelier by wave 8', Math.abs(l2.dropRate - 0.3) < 0.06 && l2.w1[0] > 0.72 && l2.w1[2] < 0.08 && l2.w8[2] > l2.w1[2] * 2 && l2.w8[0] < l2.w1[0] - 0.2, JSON.stringify(l2));
  const l3 = await scene(page, (s) => {
    const r = s.realm; r.save.items = []; for (let i = 0; i < 24; i++) r.save.items.push({ n: 100 + i, id: 'swiftcharm', r: 0 }); r.save.nextUid = 200;
    r.texts.forEach((x) => { x.active = false; });
    const sh = r.save.shards; r.collectItem('luckring', 2);
    return { n: r.save.items.length, gained: r.save.shards - sh, sold: r.texts.some((t) => t.active && /sold Lucky Ring/.test(t.text)) };
  });
  check('loot: with a full backpack (24) a new item is sold on the spot for shards (rare = 15)', l3.n === 24 && l3.gained === 15 && l3.sold, JSON.stringify(l3));

  // 3. Equipment and the backpack UI.
  const e1 = await scene(page, (s) => {
    const r = s.realm; r.save.items = [{ n: 1, id: 'sparkwand', r: 2 }, { n: 2, id: 'quickwand', r: 0 }, { n: 3, id: 'heartcharm', r: 1 }, { n: 4, id: 'scholarring', r: 0 }, { n: 5, id: 'luckring', r: 0 }]; r.save.nextUid = 6; r.save.eq = {};
    r._calcStats(); const base = { ...r.stats };
    r.setPaused(true); const o = { paused: r.paused, open: !document.getElementById('realm-backpack').classList.contains('hidden'), rows: document.querySelectorAll('#realm-bp-list li').length, statLine: document.getElementById('realm-bp-stats').textContent };
    document.querySelector('#realm-bp-list button[data-act="equip"][data-uid="1"]').click(); o.dmg = r.stats.dmg; o.base = base.dmg; o.line = document.getElementById('realm-bp-stats').textContent;
    document.querySelector('#realm-bp-list button[data-act="equip"][data-uid="2"]').click(); o.swapped = r.save.eq.weapon; o.rate = r.stats.rate; o.dmgBack = r.stats.dmg; // one weapon at a time
    document.querySelector('#realm-bp-list button[data-act="equip"][data-uid="3"]').click(); o.maxHp = r.stats.maxHp; o.baseHp = base.maxHp; // uncommon Hearty Charm: +12 * 1.6 = 19
    document.querySelector('#realm-bp-list button[data-act="equip"][data-uid="4"]').click(); o.xp = r.stats.xp;
    o.on = document.querySelectorAll('#realm-bp-list li.on').length;
    o.saved = JSON.parse(localStorage.getItem('pixeltown-save-v1')).realm.eq;
    return o;
  });
  check('backpack: opening it pauses the fight and lists every item with Equip / Sell buttons and a stat summary', e1.paused && e1.open && e1.rows === 5 && /HP/.test(e1.statLine) && /shots\/s/.test(e1.statLine), JSON.stringify(e1));
  check('equip: a rare Spark Wand adds +1.2 damage, equipping another weapon swaps it, an uncommon Hearty Charm adds 19 max HP, a Scholar Ring +12% xp', Math.abs(e1.dmg - (e1.base + 1.2)) < 0.01 && e1.swapped === 2 && Math.abs(e1.rate - 9) < 0.01 && e1.dmgBack === e1.base && e1.maxHp === e1.baseHp + 19 && Math.abs(e1.xp - 1.12) < 0.001 && e1.on === 3, JSON.stringify(e1));
  check('equip: the loadout is saved by item id under the realm key', e1.saved && e1.saved.weapon === 2 && e1.saved.charm === 3 && e1.saved.ring === 4, JSON.stringify(e1.saved));
  const e2 = await scene(page, (s) => {
    const r = s.realm; const o = {};
    const e = r.spawnEnemy('aimed', 600, 100); e.cd = 999; e.dir = 0; const x0 = e.x; const t0 = e.t; window.__st(30); o.frozen = e.x === x0 && e.t === t0; // paused: nothing moves
    r.setPaused(false); o.resumed = !r.paused && document.getElementById('realm-backpack').classList.contains('hidden'); window.__st(30); o.moved = e.t > t0;
    r.setPaused(true);
    const sh = r.save.shards; document.querySelector('#realm-bp-list button[data-act="discard"][data-uid="2"]').click();
    o.sold = r.save.shards - sh; o.gone = !r.save.items.some((i) => i.n === 2); o.unequipped = r.save.eq.weapon === undefined; o.rate = r.stats.rate; o.rows = document.querySelectorAll('#realm-bp-list li').length;
    r.setPaused(false); e.active = false;
    return o;
  });
  check('backpack: the game is frozen while it is open and resumes when closed', e2.frozen && e2.resumed && e2.moved, JSON.stringify(e2));
  check('sell: selling an equipped common item pays 3 shards, removes it, unequips it and the stat bonus goes away', e2.sold === 3 && e2.gone && e2.unequipped && Math.abs(e2.rate - 7.5) < 0.01 && e2.rows === 4, JSON.stringify(e2));
  const e3 = await scene(page, (s) => {
    const r = s.realm; const run = (withWand) => {
      r.save.items = [{ n: 1, id: 'sparkwand', r: 2 }]; r.save.eq = withWand ? { weapon: 1 } : {}; r._calcStats();
      [r.enemies, r.pBullets].forEach((p) => p.forEach((o) => { o.active = false; })); r.player.x = 100; r.player.y = 300; r.state = 'play'; r.player.iframes = 999; r.player.fireCd = 0;
      const e = r.spawnEnemy('spiral', 600, 300); e.cd = 999; e.hp = e.maxHp = 2; e.ax = 600; e.ay = 300; r.mouse = { x: 600, y: 300, down: true, seen: true };
      let t = 0; while (e.active && t < 3) { window.__st(1); t += 1 / 60; } r.mouse.down = false; return +t.toFixed(2);
    };
    const wand = run(true); const dmg = r.stats.dmg; const plain = run(false);
    return { wand, plain, dmg };
  });
  check('equip in play: a rare Spark Wand (2.2 damage) kills a 2 HP enemy with the first bolt; bare-handed it takes a second bolt (~0.13 s later)', e3.dmg > 2.19 && e3.wand < e3.plain - 0.1 && e3.wand < 1, JSON.stringify(e3));
  await scene(page, (s) => { const r = s.realm; r.save.items = []; r.save.eq = {}; r._calcStats(); });

  // Swapping gear must never heal (the review's free-heal exploit).
  const heal = await scene(page, (s) => {
    const r = s.realm; r.save.items = [{ n: 1, id: 'heartcharm', r: 2 }, { n: 2, id: 'swiftcharm', r: 0 }]; r.save.nextUid = 3; r.save.eq = {}; r._calcStats();
    r.player.hp = 10; r.setPaused(true); const o = { maxBase: r.stats.maxHp }; const hps = [];
    for (let i = 0; i < 6; i++) { r.equip(1); hps.push(r.player.hp); }
    r.equip(2); hps.push(r.player.hp); r.equip(1); hps.push(r.player.hp); // switching charm types too
    r.setPaused(false); o.hps = hps; o.max = r.stats.maxHp;
    return o;
  });
  check('equip: toggling or swapping a charm in the backpack never heals — HP stays 10 however many times you swap', heal.hps.every((h) => h === 10), JSON.stringify(heal));
  const proto = await scene(page, (s) => ({ a: rmCleanSave({ items: [{ n: 1, id: '__proto__', r: 0 }, { n: 2, id: 'constructor', r: 0 }, { n: 3, id: 'toString', r: 0 }, { n: 4, id: 7, r: 0 }, { n: 5, id: 'luckring', r: 0 }] }).items.map((i) => i.id), big: rmCleanSave({ items: Array.from({ length: 100000 }, (_, i) => ({ n: i + 1, id: 'luckring', r: 0 })) }).items.length }));
  check('save: built-in object names (__proto__, constructor, toString) and non-string ids are rejected as items; a huge array is trimmed fast', proto.a.join() === 'luckring' && proto.big === 24, JSON.stringify(proto));

  // 4. Abilities.
  const a1 = await scene(page, (s) => {
    const r = s.realm; r.save.level = 1; r.save.xp = 0; r._calcStats(); r._syncAbilities(); const o = {};
    o.lockedCast = r.cast(1); o.lockedHud = document.getElementById('realm-ab-1').classList.contains('locked') && document.getElementById('realm-ab-1').textContent.includes('Lv3');
    o.dashOpen = r.abilityUnlocked(0);
    r.player.x = 300; r.player.y = 300; r.player.iframes = 0; r.keys = { d: true }; window.__st(1); r.keys = {};
    const x0 = r.player.x; o.dash = r.cast(0); o.dx = Math.round(r.player.x - x0); o.iframes = r.player.iframes > 0.35; o.again = r.cast(0);
    o.cdHud = document.getElementById('realm-ab-0').textContent.replace(/[^0-9]/g, ''); o.cooling = document.getElementById('realm-ab-0').classList.contains('cooling');
    window.__st(60 * 3 + 5); o.ready = r.abilityCd[0] === 0 && r.cast(0);
    return o;
  });
  check('abilities: Dash is open at level 1 — it jumps 150 px the way you move, gives i-frames, then cools down 3 s with a countdown; Nova shows "Lv3" and is locked', a1.dash && a1.dx >= 148 && a1.dx <= 160 && a1.iframes && a1.again === false && a1.cdHud === '3' && a1.cooling && a1.ready && a1.lockedCast === false && a1.lockedHud, JSON.stringify(a1));
  const a2 = await scene(page, (s) => {
    const r = s.realm; r.save.level = 8; r._calcStats(); r._syncAbilities(); r.abilityCd = [0, 0, 0, 0]; const o = {};
    [r.enemies, r.eBullets, r.pBullets].forEach((p) => p.forEach((x) => { x.active = false; })); r.player.iframes = 0;
    // Nova: a ring of 16 bolts
    o.nova = r.cast(1); const ang = r.pBullets.filter((b) => b.active).map((b) => ((Math.atan2(b.vy, b.vx) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)).sort((a, b) => a - b);
    o.novaN = ang.length; o.novaGap = +Math.min(...ang.slice(1).map((v, i) => v - ang[i])).toFixed(3);
    // Shield: soaks three hits, the fourth hurts
    r.pBullets.forEach((b) => { b.active = false; }); o.shield = r.cast(2); r.player.hp = r.stats.maxHp; const hp0 = r.player.hp; const hits = [];
    for (let i = 0; i < 4; i++) { r.player.iframes = 0; const b = r.eBullets.find((x) => !x.active); b.active = true; b.x = r.player.x; b.y = r.player.y; b.vx = b.vy = 0; b.life = 5; r._update(0.001); hits.push(hp0 - r.player.hp); }
    o.shieldHits = hits;
    // Overdrive: fire rate doubles for 4 s
    r.pBullets.forEach((b) => { b.active = false; }); r.state = 'play'; r.player.iframes = 999; r.mouse = { x: 900, y: 300, down: true, seen: true }; r.player.x = 100; r.player.y = 300;
    let normal = 0; for (let i = 0; i < 60; i++) { r._update(1 / 60); } normal = r.pBullets.filter((b) => b.active).length + 0;
    r.pBullets.forEach((b) => { b.active = false; });
    o.od = r.cast(3); const f0 = r.overdriveT; let fast = 0; r.player.fireCd = 0; for (let i = 0; i < 60; i++) { r._update(1 / 60); } fast = r.pBullets.filter((b) => b.active).length; r.mouse.down = false;
    o.normal = normal; o.fast = fast; o.f0 = f0;
    return o;
  });
  check('abilities: Nova fires 16 evenly spaced bolts', a2.nova && a2.novaN === 16 && Math.abs(a2.novaGap - Math.PI * 2 / 16) < 0.01, JSON.stringify(a2));
  check('abilities: Shield blocks exactly three hits and the fourth gets through', a2.shield && a2.shieldHits[0] === 0 && a2.shieldHits[1] === 0 && a2.shieldHits[2] === 0 && a2.shieldHits[3] > 0, JSON.stringify(a2.shieldHits));
  check('abilities: Overdrive doubles your fire rate while it lasts', a2.od && a2.f0 === 4 && a2.fast >= a2.normal * 1.7, JSON.stringify([a2.normal, a2.fast]));
  await page.keyboard.press('q');
  const key = await scene(page, (s) => { const r = s.realm; r.abilityCd = [0, 0, 0, 0]; r.paused = false; return r.abilityCd[0]; });
  await page.keyboard.press('q');
  check('abilities: the Q key casts Dash (cooldown starts)', (await scene(page, (s) => s.realm.abilityCd[0])) > 2.5, String(key));

  // 5. Saves: old saves load as level 1, corrupt data is cleaned.
  const sv = await scene(page, (s) => ({
    old: rmCleanSave({ shards: 50, bestWave: 3, kills: 9, deaths: 1 }),
    bad: rmCleanSave({ level: 99, xp: 1e9, items: [{ n: 1, id: 'sparkwand', r: 0 }, { n: 1, id: 'sparkwand', r: 0 }, { n: 2, id: 'bogus', r: 0 }, { n: 3, id: 'luckring', r: 7 }, { n: 4, id: 'heartcharm', r: 1.9 }, null, 'x', { n: -5, id: 'swiftcharm', r: 0 }], eq: { weapon: 4, charm: 4, ring: 1, hat: 1 }, nextUid: 'x' }),
    many: rmCleanSave({ items: Array.from({ length: 60 }, (_, i) => ({ n: i + 1, id: 'swiftcharm', r: 0 })) }).items.length,
  }));
  check('save: an old save (no level / items) loads as level 1 with an empty backpack', sv.old.level === 1 && sv.old.xp === 0 && sv.old.items.length === 0 && sv.old.shards === 50 && Object.keys(sv.old.eq).length === 0, JSON.stringify(sv.old));
  check('save: corrupt levels, duplicate / unknown / malformed items and mismatched equipment are cleaned; the backpack is capped at 24', sv.bad.level === 20 && sv.bad.xp === 0 && sv.bad.items.length === 2 && sv.bad.items[0].id === 'sparkwand' && sv.bad.items[1].id === 'heartcharm' && sv.bad.items[1].r === 1 && sv.bad.eq.weapon === undefined && sv.bad.eq.charm === 4 && sv.bad.eq.ring === undefined && sv.bad.nextUid >= 5 && sv.many === 24, JSON.stringify(sv));
  check('no console errors (desktop)', errors.length === 0, errors.join('|'));
  if (process.env.SHOTS) {
    await scene(page, (s) => { const r = s.realm; r.save.level = 8; r.save.xp = 40; r.save.items = [{ n: 1, id: 'sparkwand', r: 2 }, { n: 2, id: 'heartcharm', r: 1 }, { n: 3, id: 'luckring', r: 0 }]; r.save.eq = { weapon: 1, charm: 2 }; r._calcStats(); r._syncHud(); r.run.wave = 4; r.state = 'play'; r.player.iframes = 999; r.player.x = 400; r.player.y = 300; r.player.hp = r.stats.maxHp * 0.7; r.abilityCd = [0, 4, 0, 11]; r._syncAbilities(); r.shield.hits = 3; r.shield.t = 5; r.mouse = { x: 800, y: 120, down: true, seen: true }; [0, 1, 2, 0].forEach((k, i) => r.spawnEnemy(['spiral', 'aimed', 'ring'][k], 120 + i * 140, 70)); r.dropBag(480, 330, 2, 'quickwand'); r.dropBag(330, 330, 1, 'swiftcharm'); window.__st(60 * 4); r.player.iframes = 0; r._draw(); });
    await page.screenshot({ path: process.env.SHOTS + '/realm2-desktop.png' });
    await scene(page, (s) => { s.realm.setPaused(true); }); await page.screenshot({ path: process.env.SHOTS + '/realm2-backpack.png' });
  }
  await browser.close();

  // 6. Phone: ability buttons sit above the aim stick, the backpack fits and works by touch.
  ({ browser, page, errors } = await launch({ width: 390, height: 844 }, { ...seed, realm: { shards: 100, level: 8, xp: 10, items: [{ n: 1, id: 'sparkwand', r: 2 }, { n: 2, id: 'heartcharm', r: 1 }, { n: 3, id: 'luckring', r: 0 }, { n: 4, id: 'swiftcharm', r: 0 }, { n: 5, id: 'quickwand', r: 1 }, { n: 6, id: 'wardring', r: 2 }], nextUid: 7 } }, true));
  await scene(page, (s) => { enter_(s); function enter_(s) { s.localBody.setPosition(REALM_GATE_POS.x, REALM_GATE_POS.y + 30); s.interact(); const r = s.realm; r.stop(); r.active = true; window.__st = (n, dt = 1 / 60) => { for (let i = 0; i < n; i++) r._update(dt); }; r._resize(); r.state = 'play'; r.run.wave = 2; } });
  const ph = await page.evaluate(() => {
    const r = (id) => document.getElementById(id).getBoundingClientRect(); const over = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const abs = [0, 1, 2, 3].map((i) => r(`realm-ab-${i}`)); const aim = r('realm-stick-aim'); const move = r('realm-stick-move'); const hud = r('realm-hud'); const leave = r('realm-leave-btn'); const bp = r('realm-bp-btn'); const xp = r('realm-xp'); const hp = r('realm-hp');
    const others = [aim, move, hud, leave, bp];
    let overlaps = 0; abs.forEach((a, i) => { others.forEach((o) => { if (over(a, o)) overlaps++; }); abs.forEach((b, j) => { if (j > i && over(a, b)) overlaps++; }); });
    return { inside: abs.every((b) => b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= innerHeight) && bp.right <= innerWidth && leave.right <= innerWidth, minSize: Math.round(Math.min(...abs.map((b) => Math.min(b.width, b.height)), bp.width, bp.height)), overlaps, xpClear: !over(xp, hud) || xp.top >= hp.bottom - 2, hudOver: over(bp, leave), sw: document.documentElement.scrollWidth };
  });
  check('phone: four 50px ability buttons (2x2) above the aim stick, the backpack and Leave buttons fit — nothing overlaps, no sideways scroll', ph.inside && ph.minSize >= 40 && ph.overlaps === 0 && !ph.hudOver && ph.sw <= 390, JSON.stringify(ph));
  const pt = await page.evaluate(() => {
    const s = window.__g.scene.getScene('Town'); const r = s.realm; const el = document.getElementById('realm-ab-0'); r.abilityCd = [0, 0, 0, 0]; r.player.x = 200; r.player.y = 400;
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', pointerId: 3 }));
    return { cd: r.abilityCd[0], level: r.save.level, items: r.save.items.length };
  });
  check('phone: tapping an ability button casts it; a level-8 save with 6 items loads correctly', pt.cd > 2.5 && pt.level === 8 && pt.items === 6, JSON.stringify(pt));
  await page.tap('#realm-bp-btn'); await page.waitForTimeout(200);
  const bp = await page.evaluate(() => {
    const card = document.querySelector('.realm-bp-card').getBoundingClientRect(); const btns = [...document.querySelectorAll('#realm-bp-list button')].map((b) => b.getBoundingClientRect()); const close = document.getElementById('realm-bp-close').getBoundingClientRect();
    return { open: !document.getElementById('realm-backpack').classList.contains('hidden'), fits: card.left >= 0 && card.right <= innerWidth && card.bottom <= innerHeight, rows: document.querySelectorAll('#realm-bp-list li').length, minBtn: Math.round(Math.min(...btns.map((b) => b.height), close.height)), btnsIn: btns.every((b) => b.right <= innerWidth + 0.5) };
  });
  check('phone: the backpack opens by tapping 🎒, fits the screen, lists 6 items with >= 40px buttons', bp.open && bp.fits && bp.rows === 6 && bp.minBtn >= 40 && bp.btnsIn, JSON.stringify(bp));
  await page.tap('#realm-bp-list button[data-act="equip"][data-uid="1"]'); await page.waitForTimeout(100);
  const eqp = await scene(page, (s) => ({ eq: s.realm.save.eq, dmg: s.realm.stats.dmg }));
  check('phone: tapping Equip equips the item (rare Spark Wand: damage 2.2)', eqp.eq.weapon === 1 && Math.abs(eqp.dmg - 2.2) < 0.01, JSON.stringify(eqp));
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/realm2-backpack-phone.png' });
  await page.tap('#realm-bp-close'); await page.waitForTimeout(100);
  if (process.env.SHOTS) { await scene(page, (s) => { const r = s.realm; r.player.iframes = 999; r.abilityCd = [2, 0, 5, 0]; r._syncAbilities(); r.run.wave = 3; [0, 1, 2, 1].forEach((k, i) => r.spawnEnemy(['spiral', 'aimed', 'ring'][k], 70 + i * 80, 120)); r.aimVec = { x: 0.1, y: -1, on: true }; window.__st(60 * 4); r.player.iframes = 0; r._draw(); }); await page.screenshot({ path: process.env.SHOTS + '/realm2-phone.png' }); }
  check('no console errors (phone)', errors.length === 0, errors.join('|'));
  await browser.close();
  done();
})();
