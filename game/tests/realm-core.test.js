// Realm core: (A) cross-tab save merge, (B) tile walls + sliding, (C) guard + hit-box dot.
// Runs on the standalone Mad Maze page (no Firebase). Serve the repo root first, then:
//   BASE=http://localhost:8443/game/index.html NODE_PATH=$(npm root -g) node game/tests/realm-core.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1';
const KEY = 'pixeltown-save-v1';

async function open(ctx) {
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', (e) => page.errs.push(e.message));
  await page.goto(URL);
  await page.waitForFunction(() => window.__mm && window.__mm.arena);
  return page;
}
const arenaOf = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, ${JSON.stringify(arg)})`);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });

  // ---------- A. cross-tab merge ----------
  const p1 = await open(ctx);
  const seed = { caveSeed: 5, resources: { stone: 1, wood: 2 }, zzCustom: { a: [1, 2, { b: 3 }] }, realm: { shards: 100, level: 1, kills: 2 } };
  await p1.evaluate((v) => localStorage.setItem('pixeltown-save-v1', v), JSON.stringify(seed));
  await p1.reload(); await p1.waitForFunction(() => window.__mm && window.__mm.arena);
  const p2 = await open(ctx);
  await arenaOf(p1, (a) => { a.stop(); a.save.shards += 50; a.save.level = 3; a.save.kills = 9; a.save.items.push({ n: a.save.nextUid, id: 'sparkwand', r: 1 }); a.save.nextUid += 1; a.onSave(a.save); });
  await p2.waitForTimeout(200);
  // p2 got a storage event from p1 and merged it in memory; then it makes its own progress.
  const resynced = await arenaOf(p2, (a) => ({ shards: a.save.shards, level: a.save.level, items: a.save.items.length }));
  check('A: a storage event from the other tab resyncs the in-memory save (no write needed)', resynced.shards === 150 && resynced.level === 3 && resynced.items === 1, JSON.stringify(resynced));
  await arenaOf(p2, (a) => { a.stop(); a.save.shards += 20; a.save.kills = 12; a.save.items.push({ n: a.save.nextUid, id: 'heartcharm', r: 0 }); a.save.nextUid += 1; a.onSave(a.save); });
  await p1.waitForTimeout(200);
  const st = JSON.parse(await p1.evaluate((k) => localStorage.getItem(k), KEY));
  check('A: both tabs\' progress survives (shards 100+50+20, level 3, kills 12, both items)', st.realm.shards === 170 && st.realm.level === 3 && st.realm.kills === 12 && st.realm.items.length === 2 && new Set(st.realm.items.map((i) => i.n)).size === 2, JSON.stringify(st.realm));
  check('A: every other key in pixeltown-save-v1 is preserved byte-identically', JSON.stringify(st.caveSeed) === '5' && JSON.stringify(st.resources) === JSON.stringify(seed.resources) && JSON.stringify(st.zzCustom) === JSON.stringify(seed.zzCustom));
  const back = await arenaOf(p1, (a) => ({ shards: a.save.shards, items: a.save.items.length, kills: a.save.kills }));
  check('A: the first tab sees the second tab\'s write through the storage event', back.shards === 170 && back.items === 2 && back.kills === 12, JSON.stringify(back));
  // The same uid minted in both tabs for different items: both survive with distinct uids.
  await arenaOf(p1, (a) => { a.save.items.push({ n: a.save.nextUid, id: 'luckring', r: 0 }); a.save.nextUid += 1; });
  await arenaOf(p2, (a) => { a.save.items.push({ n: a.save.nextUid, id: 'wardring', r: 0 }); a.save.nextUid += 1; a.onSave(a.save); });
  await arenaOf(p1, (a) => { a.onSave(a.save); });
  const col = await p1.evaluate((k) => JSON.parse(localStorage.getItem(k)).realm, KEY);
  check('A: a uid collision between two tabs keeps both items under distinct uids', col.items.length >= 3 && new Set(col.items.map((i) => i.n)).size === col.items.length && col.items.some((i) => i.id === 'luckring') && col.items.some((i) => i.id === 'wardring'), JSON.stringify(col.items));
  // Opus review fixes: a sold item must not come back, and a uid collision must not multiply items on repeated syncs.
  const mg = await p1.evaluate(() => {
    const base = (items, nextUid) => ({ level: 1, xp: 0, shards: 10, bestWave: 0, kills: 0, deaths: 0, nextUid, items, eq: {}, kb: {} });
    const o = {};
    // tab B still holds #5; tab A sold it and wrote (storage no longer has it); B knew #5 at its last sync
    const sold = rmMergeSave(base([{ n: 5, id: 'sparkwand', r: 0 }, { n: 6, id: 'luckring', r: 0 }], 7), base([{ n: 6, id: 'luckring', r: 0 }], 7), { base: 10, known: new Set([5, 6]) });
    o.soldGone = !sold.items.some((i) => i.n === 5) && sold.items.some((i) => i.n === 6);
    // an item looted here (never in storage) is kept; an item new in storage (never known here) is taken
    const mix = rmMergeSave(base([{ n: 9, id: 'heartcharm', r: 0 }], 10), base([{ n: 8, id: 'swiftcharm', r: 0 }], 10), { base: 10, known: new Set() });
    o.kept = mix.items.some((i) => i.n === 9) && mix.items.some((i) => i.n === 8);
    // an item this tab sold (still in storage, known here) stays gone
    const mine = rmMergeSave(base([], 7), base([{ n: 5, id: 'sparkwand', r: 0 }], 7), { base: 10, known: new Set([5]) });
    o.soldHere = mine.items.length === 0;
    // collision: A has sword#10, B wrote ring#10; merging repeatedly in both directions never multiplies
    let A = base([{ n: 10, id: 'sparkwand', r: 0 }], 11); let B = base([{ n: 10, id: 'luckring', r: 0 }], 11);
    let sa = rmMergeSave(A, B, { base: 10, known: new Set() });
    for (let i = 0; i < 4; i++) { sa = rmMergeSave(sa, sa, { base: 10, known: new Set(sa.items.map((x) => x.n)) }); }
    const sb = rmMergeSave(B, sa, { base: 10, known: new Set([10]) });
    o.once = sa.items.filter((i) => i.id === 'sparkwand').length === 1 && sb.items.filter((i) => i.id === 'sparkwand').length === 1 && sb.items.filter((i) => i.id === 'luckring').length === 1;
    // equipping a renumbered item follows its new uid
    const eqm = rmMergeSave({ ...base([{ n: 10, id: 'sparkwand', r: 0 }], 11), eq: { weapon: 10 } }, base([{ n: 10, id: 'luckring', r: 0 }], 11), { base: 10, known: new Set() });
    const sw = eqm.items.find((i) => i.id === 'sparkwand');
    o.eq = sw && eqm.eq.weapon === sw.n;
    return o;
  });
  check('A: an item sold in another tab stays gone, new items from either tab are kept, an item sold here stays gone', mg.soldGone && mg.kept && mg.soldHere, JSON.stringify(mg));
  check('A: a uid collision never multiplies items across repeated syncs, and an equipped item follows its new uid', mg.once && mg.eq, JSON.stringify(mg));
  // Corrupt shapes still load.
  const shapes = ['"junk"', '[1,2,3]', '{"realm":"x"}', '{"realm":[1]}', '{"realm":{"level":"zz","items":"a","eq":7,"shards":-5}}', '{{not json'];
  let okShapes = 0;
  await p2.close();
  for (const sh of shapes) {
    await p1.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, sh]);
    await p1.reload(); await p1.waitForFunction(() => window.__mm && window.__mm.arena);
    const r = await arenaOf(p1, (a) => { a.stop(); a.save.shards += 5; a.onSave(a.save); return a.save.level >= 1 && a.save.shards >= 5 && Array.isArray(a.save.items); });
    if (r && p1.errs.length === 0) okShapes++;
  }
  check('A: corrupt / odd stored shapes still load and save without errors', okShapes === shapes.length, okShapes + ' ' + p1.errs.join('|'));

  // ---------- B. walls ----------
  const wallRes = await arenaOf(p1, (a) => {
    const o = {};
    a.stop(); a.active = true; a.state = 'play'; a.run.wave = 1; a.keys = {}; a.mouse.seen = false;
    [a.enemies, a.eBullets, a.pBullets].forEach((pl) => pl.forEach((x) => { x.active = false; }));
    const reset = (x, y) => { a.player.x = x; a.player.y = y; a.player.iframes = 0; };
    const run = (n) => { for (let i = 0; i < n; i++) a._updatePlayer(1 / 60); };
    o.defaultNull = a.walls === null;
    reset(150, 100); a.keys.d = true; run(60); o.freeX = a.player.x; // no grid: walks straight on
    // Vertical wall at tile column 5 (x 200..240), rows 0..9.
    a.setWalls(Array.from({ length: 10 }, () => '.....#.........'));
    reset(150, 100); a.keys = { d: true }; run(60); o.stopX = a.player.x;
    reset(150, 100); a.keys = { d: true, s: true }; const y0 = a.player.y; run(30); o.slideX = a.player.x; o.slideDy = a.player.y - y0;
    // Diagonal speed equals straight speed (open ground, 0.25 s).
    a.setWalls(Array.from({ length: 10 }, () => '...............'));
    reset(40, 40); a.keys = { d: true }; run(15); o.straight = a.player.x - 40;
    reset(40, 40); a.keys = { d: true, s: true }; run(15); o.diag = Math.hypot(a.player.x - 40, a.player.y - 40);
    a.keys = {};
    // Bolts stop at walls.
    a.setWalls(Array.from({ length: 10 }, () => '.....#.........'));
    reset(150, 100); a.firePlayerBullet(0); for (let i = 0; i < 30; i++) a._updateBullets(1 / 60); o.boltGone = !a.pBullets.some((b) => b.active);
    a.setWalls(null); reset(150, 100); a.firePlayerBullet(0); for (let i = 0; i < 10; i++) a._updateBullets(1 / 60); o.boltFree = a.pBullets.some((b) => b.active && b.x > 240);
    return o;
  });
  check('B: default is no wall grid and the player walks freely', wallRes.defaultNull && wallRes.freeX > 250, JSON.stringify(wallRes));
  check('B: the player cannot enter a wall tile', wallRes.stopX <= 200 - 11 + 0.01 && wallRes.stopX > 170, JSON.stringify(wallRes));
  check('B: moving diagonally into a wall slides along it', Math.abs(wallRes.slideDy) > 40 && wallRes.slideX <= 189.01, JSON.stringify(wallRes));
  check('B: diagonal speed equals straight speed', Math.abs(wallRes.straight - wallRes.diag) < 0.5, JSON.stringify(wallRes));
  check('B: bolts stop at walls when a grid is set (and fly on without one)', wallRes.boltGone && wallRes.boltFree, JSON.stringify(wallRes));

  // ---------- C. guard + hit-box dot ----------
  const gres = await arenaOf(p1, (a) => {
    const o = {};
    a.setWalls(null); a.stop(); a.active = true; a.state = 'play'; a.run.wave = 1;
    a.eBullets.forEach((x) => { x.active = false; });
    const hit = () => { a.player.iframes = 0; a.player.hp = a.stats.maxHp; a.shield.hits = 0; a.fireEnemyBullet(a.player.x, a.player.y, 0, 0, 0); a._updateBullets(1 / 60); return a.stats.maxHp - a.player.hp; };
    a.player.x = 300; a.player.y = 300;
    o.guard0 = a.stats.guard; o.base = hit();
    a.extraGuard = 4; a._calcStats(); o.ten4 = a._guarded(10);
    o.real = hit(); // RM_ENEMY_BULLET_DAMAGE 8 with guard 4
    a.extraGuard = 40; a._calcStats(); o.floor = a._guarded(10); o.realFloor = hit();
    a.extraGuard = 0; a._calcStats();
    // Dot: present in the draw call.
    const g = a.ctx; const orig = g.drawImage.bind(g); let dot = 0; g.drawImage = (img, ...r) => { if (img === a.sprites.hitDot) dot++; return orig(img, ...r); };
    a.state = 'play'; a._draw(); g.drawImage = orig; o.dot = dot; o.dotBaked = a.sprites.hitDot instanceof HTMLCanvasElement;
    return o;
  });
  check('C: default guard is 0 and enemy bolt damage is unchanged (8)', gres.guard0 === 0 && gres.base === 8, JSON.stringify(gres));
  check('C: 10 damage vs guard 4 = 6', gres.ten4 === 6, JSON.stringify(gres));
  check('C: a real enemy bolt vs guard 4 deals 8-4 = 4', gres.real === 4, JSON.stringify(gres));
  check('C: huge guard hits the 25% floor (10 -> 3, bolt 8 -> 2)', gres.floor === 3 && gres.realFloor === 2, JSON.stringify(gres));
  check('C: the hit-box dot is a baked sprite drawn at the player centre each frame', gres.dot === 1 && gres.dotBaked, JSON.stringify(gres));
  check('no page errors', p1.errs.length === 0, p1.errs.join('|'));

  await browser.close();
  done();
})();
