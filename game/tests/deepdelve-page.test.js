// Deepdelve standalone page. Serve the repo root: python3 -m http.server 8457 &
// Run: BASE=http://localhost:8457/game/index.html NODE_PATH=$(npm root -g) node game/tests/deepdelve-page.test.js
// Set SHOTS=<dir> for desktop/phone screenshots, THREE_JS=<file> to serve three.js locally instead of the CDN.
// No Firebase; the only allowed off-origin request is the pinned three.js CDN script.
const { chromium } = require('playwright');
const fs = require('fs');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = (q) => ORIGIN + '/game/games/deepdelve/index.html?test=1' + (q || '');
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
const DESKTOP = { viewport: { width: 1000, height: 700 } };
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

async function open(browser, q, opts) {
  const ctx = await browser.newContext(opts || DESKTOP);
  const page = await ctx.newPage();
  const errors = [], reqs = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', (r) => reqs.push(r.url()));
  if (process.env.THREE_JS) await page.route(THREE_URL, (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(process.env.THREE_JS) }));
  await page.goto(URL(q));
  await page.waitForFunction(() => window.__dd && window.__dd.ready);
  return { ctx, page, errors, reqs };
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const a = await open(browser, '&seed=5');
  const p = a.page;

  // 1. same seed, same terrain; another seed differs
  const b = await open(browser, '&seed=5');
  const c = await open(browser, '&seed=6');
  const [h1, h2, h3] = await Promise.all([a, b, c].map((o) => o.page.evaluate(() => window.__dd.terrainHash())));
  check('same seed gives the same terrain hash', h1 === h2, h1 + ' vs ' + h2);
  check('a different seed gives different terrain', h1 !== h3, h1 + ' vs ' + h3);
  await b.ctx.close(); await c.ctx.close();

  // 2. gravity: falls and lands exactly on the grass surface
  const g = await p.evaluate(() => {
    const d = window.__dd, s = d.surfaceY(64, 64);
    d.setPos(64.5, -s + 6, 64.5); d.step(1 / 60, 150);
    return { y: d.player.y, want: -s, ground: d.player.onGround };
  });
  check('player falls and lands on the ground', Math.abs(g.y - g.want) < 0.01 && g.ground, JSON.stringify(g));

  // 3. solid block stops the player (flat strip found by scanning)
  const w = await p.evaluate(() => {
    const d = window.__dd;
    let fx = -1, s = 0;
    for (let x = 20; x < 110 && fx < 0; x++) {
      s = d.surfaceY(x, 64); let ok = true;
      for (let z = 50; z <= 66; z++) if (d.surfaceY(x, z) !== s) ok = false;
      if (ok) fx = x;
    }
    if (fx < 0) return { skip: true };
    const cells = [];
    for (let wy = s - 3; wy < s; wy++) cells.push(wy);
    d.inv.stone = 20;
    d.setPos(fx + 0.5, -s, 64.5); d.step(1 / 60, 10);
    cells.forEach((wy) => d.placeAt(fx, wy, 62, 'stone'));
    d.player.yaw = 0; d.walk(1, 0, 180);
    const blockedZ = d.player.z;
    cells.forEach((wy) => d.mineAt(fx, wy, 62));
    d.walk(1, 0, 120);
    return { blockedZ, freeZ: d.player.z, wallBlocks: cells.length };
  });
  check('player cannot walk through a solid block', !w.skip && w.blockedZ >= 63.29 && w.blockedZ < 64.4, JSON.stringify(w));
  check('after mining the wall the player walks on through', !w.skip && w.freeZ < 62.5, JSON.stringify(w));

  // 4. mining removes a block and fills the hotbar; placing puts it back
  const m = await p.evaluate(() => {
    const d = window.__dd, s = d.surfaceY(40, 40);
    const before = d.getBlock(40, s + 5, 40), hb0 = d.hotbar().length;
    const ok = d.mineAt(40, s + 5, 40);
    const after = d.getBlock(40, s + 5, 40), item = d.hotbar();
    const stoneN = (item.find((i) => i.item === 'stone') || {}).count | 0;
    d.setPos(45.5, -s, 45.5);
    const placed = d.placeAt(40, s + 5, 40, 'stone');
    return { before, ok, after, hb0, hb1: item.length, stoneN, placed, back: d.getBlock(40, s + 5, 40), left: d.inv.stone };
  });
  check('mining removes the block (to air) and adds it to the hotbar', m.ok && m.before !== 0 && m.after === 0 && m.hb1 >= 1 && m.stoneN >= 1, JSON.stringify(m));
  check('placing puts a block back and spends one from the hotbar', m.placed && m.back === 3 && m.left === m.stoneN - 1, JSON.stringify(m));

  // 5. torch crafting from MMRecipes then placing it
  const t = await p.evaluate(() => {
    const d = window.__dd, s = d.surfaceY(30, 30);
    const before = { wood: d.inv.wood, coal: d.inv.coal };
    d.craft();
    const crafted = d.inv.torch | 0;
    d.setPos(34.5, -s, 34.5);
    const ok = d.placeAt(30, s + 8, 30, 'torch') || (d.mineAt(30, s + 8, 30), d.placeAt(30, s + 8, 30, 'torch'));
    return { before, crafted, ok, block: d.getBlock(30, s + 8, 30), wood: d.inv.wood };
  });
  check('torch recipe consumes 1 wood + 1 coal for 4 torches and a torch can be placed', t.crafted === 4 && t.wood === t.before.wood - 1 && t.block === 11, JSON.stringify(t));

  // 6. hidden faces are not meshed
  const f = await p.evaluate(() => {
    const d = window.__dd;
    d.settle();
    const deep = d.faceStats(4, 2, 4), top = d.faceStats(4, 0, 4);
    return { deep, top, meshFaces: d.meshFaces(), meshes: d.loadedMeshes() };
  });
  check('hidden faces are not meshed (solid chunk draws a tiny fraction of its 6 faces per block)', f.deep.faces < f.deep.naive * 0.2 && f.top.faces < f.top.naive * 0.5 && f.meshFaces > 0, JSON.stringify(f));

  // 7. edit persists across reload via IndexedDB
  const e = await open(browser, '&seed=77');
  const s0 = await e.page.evaluate(async () => {
    const d = window.__dd, s = d.surfaceY(50, 50);
    const was = d.getBlock(50, s + 4, 50);
    d.mineAt(50, s + 4, 50);
    const saved = await d.flush();
    return { s, was, saved, diffs: d.world.diffCount() };
  });
  await e.page.reload();
  await e.page.waitForFunction(() => window.__dd && window.__dd.ready);
  const s1 = await e.page.evaluate((s) => ({ now: window.__dd.getBlock(50, s + 4, 50), diffs: window.__dd.world.diffCount(), inv: window.__dd.hotbar().length }), s0.s);
  check('an edit persists across reload (IndexedDB)', s0.was !== 0 && s0.saved === true && s1.now === 0 && s1.diffs >= 1 && s1.inv >= 1, JSON.stringify({ s0, s1 }));
  const dbs = await e.page.evaluate(async () => (indexedDB.databases ? (await indexedDB.databases()).map((x) => x.name) : ['pixeltown-deepdelve-v1']));
  check('data lives under the new pixeltown-deepdelve-v1 key space', dbs.indexOf('pixeltown-deepdelve-v1') >= 0, JSON.stringify(dbs));
  await e.ctx.close();

  // 8. view distance: desktop 5, phone 3
  const ph = await open(browser, '&seed=5', PHONE);
  const vd = { desktop: await p.evaluate(() => window.__dd.view), phone: await ph.page.evaluate(() => window.__dd.view) };
  check('view distance is 5 chunks on desktop and 3 on a phone viewport', vd.desktop === 5 && vd.phone === 3, JSON.stringify(vd));

  // 9. hostile seed falls back to the default
  const hs = await open(browser, '&seed=' + encodeURIComponent('<img src=x onerror=alert(1)>'));
  const hv = await hs.page.evaluate(() => ({ seed: window.__dd.seed, img: document.querySelectorAll('img').length, hud: document.getElementById('hud-seed').textContent }));
  check('hostile ?seed=<img> falls back to the default seed and injects nothing', hv.seed === 1 && hv.img === 0 && hv.hud === 'Seed 1', JSON.stringify(hv));
  const big = await open(browser, '&seed=99999999999');
  check('seed is clamped to an integer range', (await big.page.evaluate(() => window.__dd.seed)) === 999999999);
  await big.ctx.close();

  // 10. phone layout: no horizontal scroll, back links, canvas fills
  await ph.page.waitForTimeout(500);
  const lay = await ph.page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, hub: document.getElementById('back-hub').getAttribute('href'), town: document.getElementById('back-town').getAttribute('href'), cw: document.getElementById('gl').clientWidth, touch: !document.getElementById('touch').hidden }));
  check('390x844: no horizontal scroll, touch controls shown, back links present', lay.sw <= lay.iw && lay.hub === '../../hub/index.html' && lay.town === '../../index.html' && lay.touch && lay.cw >= 380, JSON.stringify(lay));

  // 11. screenshots
  if (process.env.SHOTS) {
    fs.mkdirSync(process.env.SHOTS, { recursive: true });
    const dress = (pg) => pg.evaluate(() => {
      const d = window.__dd, s = d.surfaceY(64, 64);
      d.inv.stone = 30; d.inv.coal = 5; d.inv.torch = 8; d.inv.iron = 3; d.inv.dirt = 7; d.select('stone');
      d.player.yaw = 0.6; d.player.pitch = -0.3;
      // dig a short tunnel with a torch so the light is visible
      for (let i = 0; i < 6; i++) for (let h = 0; h < 2; h++) d.mineAt(64, s + 1 + h, 64 - i);
      d.placeAt(64, s + 2, 62, 'torch');
      d.setPos(64.5, -(s + 2), 64.5); d.step(1 / 60, 60); d.player.yaw = 0; d.player.pitch = -0.1;
      d.settle(); d.settle();
    });
    await dress(p); await dress(ph.page);
    await p.waitForTimeout(400); await ph.page.waitForTimeout(400);
    await p.screenshot({ path: process.env.SHOTS + '/deepdelve-desktop.png' });
    await ph.page.screenshot({ path: process.env.SHOTS + '/deepdelve-phone.png' });
  }

  // 12. no console errors, no off-origin requests except the pinned three.js script
  const all = [a, ph, hs];
  const offs = [];
  all.forEach((o) => o.reqs.forEach((u) => { if (!u.startsWith(ORIGIN) && !u.startsWith('data:') && !u.startsWith('blob:') && u !== THREE_URL) offs.push(u); }));
  const errs = [].concat(...all.map((o) => o.errors));
  check('no console errors', errs.length === 0, JSON.stringify(errs));
  check('no off-origin requests except the three.js script', offs.length === 0, JSON.stringify(offs));
  const sawThree = a.reqs.indexOf(THREE_URL) >= 0;
  check('three.js is loaded from the one pinned CDN URL', sawThree);

  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
