// Browser test (AW4): the Codex b38a-f Coral Reef creature strips on the Hearthvale Isles page (?isle=reef).
// 1 the reef isle preloads its eight biome species (reef_puffer, shellcrab, glowjelly, fin_raider, tidesteed, skimray, isleback_turtle, and
//   since AW5 the b38g tide_hydra boss: 108 + 15 = 123 PNGs, every one answered 200, nothing from another biome) and each species draws from its PNG strip (screen pixels are its batch
//   palette, not the code bake), at its size class (S 48, L 96, XL 128 native px, feet anchors from the manifests);
// 2 the glowjelly (no sleep / eat strips) falls back to idle; a killed glowjelly plays its death strip;
// 3 a ridden Tidesteed / Skimray draws its body strip plus the separate saddle overlay (idle down, move right) with the hero on the
//   manifest seat (lift and x from MMCreatureStrips.seatOffset; the b38c / b38f revisions); the Isleback Turtle (saddle: null) rides bare,
//   the hero on its shell at the revised manifest seat (no drawn-seat nudge);
// 4 phone 390x844 dpr 2: the same strips draw, no horizontal scroll; 5 ?art=0 loads no b38 PNG and every reef species (and the ride)
//   is the MMCreatureDraw code bake; plus no console errors, no offsite requests and 0 DB requests (blockDb) everywhere.
// Run: python3 -m http.server 9221 (repo root), then BASE=http://localhost:9221/game/index.html NODE_PATH=$(npm root -g) node game/tests/isle-reef-art.test.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/isles/index.html';
const pal = (d) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'assets', 'arcane', d, 'palette.json'), 'utf8')).colors;
const REEF = [['reef_puffer', 'b38a-reef-puffer', 48], ['shellcrab', 'b38b-shellcrab', 48], ['glowjelly', 'b38d-glowjelly', 48], ['fin_raider', 'b38e-fin-raider', 48],
  ['tidesteed', 'b38c-reef-mounts', 96], ['skimray', 'b38c-reef-mounts', 96], ['isleback_turtle', 'b38f-isleback-turtle', 128]];
const DESK = { viewport: { width: 1000, height: 700 } };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
const stable = (sp) => JSON.stringify({ v: 1, n: 1, roster: [{ id: 't1', sp, nm: 'Rider', lv: 3, xp: 0, bond: 2, aff: 0, cos: '', isle: 'reef', d: '2026-11-01' }], party: [], mount: 't1' });

const opened = [];
async function open(browser, opts, query, seed) {
  const ctx = await browser.newContext(opts);
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  const errors = [], offsite = [], pngs = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith(ORIGIN + '/') && !u.startsWith('data:')) offsite.push(u); });
  page.on('response', (r) => { const u = r.url(); if (/assets\/arcane\/b3[1-8][a-z]{0,2}-.*\.png$/.test(u)) pngs.push({ u: u.replace(/^.*\/arcane\//, ''), s: r.status() }); });
  await page.addInitScript((s) => {
    if (sessionStorage.seeded) return;
    sessionStorage.seeded = '1';
    localStorage.clear();
    Object.keys(s || {}).forEach((k) => localStorage.setItem(k, s[k]));
  }, Object.assign({ 'pixeltown-archipelago-v1': JSON.stringify({ v: 1, sg: 1 }) }, seed || {}));
  await page.goto(PAGE + '?test=1&seed=7&isle=reef&saddles=0' + (query || ''));
  await page.waitForFunction(() => window.__isles && window.__isles.world, null, { timeout: 20000 });
  await page.evaluate(async () => { await window.__isles.stripsReady(); });
  const o = { ctx, page, errors, offsite, pngs, db };
  opened.push(o);
  return o;
}
const ev = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__isles, ${JSON.stringify(arg === undefined ? null : arg)})`);
// (a few renders so every chunk on screen is baked before pixels are compared)
const SETUP = (I) => { I.pause(true); I.god(true); I.clearCreatures(); const t = I.findTile(null, 8); I.teleport(t.x, t.y); I.step(0, 0, 0.05); for (let i = 0; i < 6; i++) I.render(); return t; };

// screen pixels a lone creature adds (render with it, then without it) and how many are exact palette colours
const PIXELS = (I, a) => {
  const cv = document.getElementById('view'), g = cv.getContext('2d'), dpr = cv.width / window.innerWidth;
  const h = I.hero();
  const uid = I.spawn(a.sp, h.tx + 4, h.ty);
  I.step(0, 0, 0.02); I.render();
  const c = I.creatures().find((x) => x.uid === uid);
  const sx = Math.round((c.x - h.x + window.innerWidth / 2) * dpr), sy = Math.round((c.y - h.y + window.innerHeight / 2) * dpr), R = Math.round(a.r * dpr);
  const box = [sx - R, sy - 2 * R, 2 * R, 2 * R + Math.round(6 * dpr)];
  const withC = g.getImageData(box[0], box[1], box[2], box[3]).data;
  const info = { sp: a.sp, src: c.src, drawn: c.drawn };
  I.clearCreatures(); I.render();
  const without = g.getImageData(box[0], box[1], box[2], box[3]).data;
  const set = new Set(a.pal.map((x) => x.toLowerCase()));
  const hex = (d, i) => '#' + [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
  let changed = 0, inPal = 0;
  for (let i = 0; i < withC.length; i += 4) {
    if (withC[i] === without[i] && withC[i + 1] === without[i + 1] && withC[i + 2] === without[i + 2]) continue;
    changed++;
    if (set.has(hex(withC, i))) inPal++;
  }
  return Object.assign(info, { changed, ratio: changed ? Math.round(inPal / changed * 100) / 100 : 0 });
};
async function species(o) {
  await ev(o.page, SETUP);
  const out = [];
  for (const [sp, dir, cell] of REEF) out.push(await ev(o.page, PIXELS, { sp, pal: pal(dir), r: cell * 0.6 }));
  return out;
}
const pngOk = (sp, r) => r.src === 'png' && new RegExp('^' + sp + '_(idle|move)_(down|up|right)$').test(r.drawn) && r.changed > 150 && r.ratio > 0.6;

(async () => {
  const browser = await chromium.launch();

  // ---- 1 desktop: the seven reef species from PNG ----
  const d = await open(browser, DESK);
  const ready = await ev(d.page, (I) => I.stripsReady());
  const b38 = d.pngs.filter((p) => /^b38[a-f]-/.test(p.u)), crit = d.pngs.filter((p) => /\/(creatures|enemies)\//.test(p.u));
  check('1a the reef isle preloads its eight biome species: 108 b38a-f PNGs (14+14+12+14+20+20+14) + 15 b38g hydra, all 200, no other creature batch (b31 / b32 / b36)',
    ready.on && ready.kinds.join() === REEF.map((r) => r[0]).concat(['tide_hydra']).join() && ready.count === 123 && b38.length === 108 && b38.every((p) => p.s === 200) && crit.length === 123
    && d.pngs.filter((p) => /^b38g-tide-hydra\/creatures\/tide_hydra\//.test(p.u)).length === 15 && d.pngs.every((p) => p.s === 200)
    && b38.some((p) => p.u === 'b38c-reef-mounts/creatures/tidesteed/tidesteed_saddle_move_right.png'), JSON.stringify(ready) + ' ' + d.pngs.length);
  const px = await species(d);
  const bad = px.filter((r) => !pngOk(r.sp, r));
  check('1b every reef species draws from its own PNG strip (its batch palette on screen, not the code bake)', bad.length === 0, JSON.stringify(bad));
  const size = await ev(d.page, (I) => ['shellcrab', 'glowjelly', 'fin_raider', 'tidesteed', 'skimray', 'isleback_turtle'].map((k) => I.stripSize(k, 'idle', 0)));
  check('1c size classes from the PNGs: S 48 (feet 96,171), L 96 (feet 192,347), XL 128 (feet 256,463)', size.slice(0, 3).every((s) => s.w === 48 && s.ax === 24 && s.ay === 171 / 4)
    && size.slice(3, 5).every((s) => s.w === 96 && s.ax === 48 && s.ay === 347 / 4) && size[5].w === 128 && size[5].ax === 64 && size[5].ay === 463 / 4, JSON.stringify(size));
  const more = await ev(d.page, (I) => ({ jsleep: I.stripSize('glowjelly', 'sleep', 0), csleep: I.stripSize('shellcrab', 'sleep', 3), teat: I.stripSize('isleback_turtle', 'eat', 2),
    fatk: I.stripSize('fin_raider', 'attack', 3), sdie: I.stripSize('skimray', 'death', 1) }));
  check('2a glowjelly (core 12 only) falls back to idle for sleep; the others have their sleep / eat / attack / death strips', more.jsleep.id === 'glowjelly_idle_down'
    && more.csleep.id === 'shellcrab_sleep_down' && more.teat.id === 'isleback_turtle_eat_down' && more.fatk.id === 'fin_raider_attack_right' && more.sdie.id === 'skimray_death_up', JSON.stringify(more));
  const death = await ev(d.page, (I) => { I.clearCreatures(); const h = I.hero(); const before = I.deathsShown(); const uid = I.spawn('glowjelly', h.tx + 2, h.ty);
    for (let i = 0; i < 60 && I.creatures().some((c) => c.uid === uid); i++) { const c = I.creatures().find((x) => x.uid === uid); const hh = I.hero(); I.soothe(false); I.fire(c.x - hh.x, c.y - 8 - hh.y); I.step(0, 0, 0.1); }
    I.render(); return { before, mid: I.deathsShown(), gone: !I.creatures().some((c) => c.uid === uid) }; });
  check('2b a killed glowjelly plays its death strip from the pool', death.gone && death.mid === death.before + 1, JSON.stringify(death));
  check('1d desktop: no console errors, no offsite requests, 0 DB requests', d.errors.length === 0 && d.offsite.length === 0 && d.db.count() === 0, d.errors.concat(d.offsite).join(' | '));

  // ---- 3 the swim mounts: body + saddle overlay, the hero on the manifest seat; the turtle rides bare ----
  const RIDE = (I) => {
    I.pause(true); I.god(true); I.clearCreatures(); const t = I.findTile(null, 8); I.teleport(t.x, t.y);
    const on = I.ride(); I.face(0, 1); I.render(); const idle = I.riding();
    I.step(1, 0, 0.2); I.render(); const move = I.riding();
    return { on, idle, move };
  };
  for (const [sp, saddle, sx, sys, sdy] of [['tidesteed', true, 180, [120, 136], 0], ['skimray', true, 184, [180, 196], 0], ['isleback_turtle', false, 236, [176, 176], 0]]) {
    const ay = sp === 'isleback_turtle' ? 463 : 347, ax = sp === 'isleback_turtle' ? 256 : 192;
    const r = await open(browser, DESK, '', { 'pixeltown-tames-v1': stable(sp) });
    const out = await ev(r.page, RIDE);
    // the hero is drawn at lift = 5 - seat (native px above the feet) and x = the seat's x offset; the seat y spans the manifest frames
    const lo = 5 - (ay - sys[0]) / 4 + sdy, hi = 5 - (ay - sys[1]) / 4 + sdy;
    const ok = out.on && out.idle.drawn === sp + '_idle_down' && out.move.drawn === sp + '_move_right'
      && (saddle ? out.idle.saddle === sp + '_saddle_idle_down' && out.move.saddle === sp + '_saddle_move_right' : out.idle.saddle === '' && out.move.saddle === '')
      && out.idle.seatX === 0 && out.move.seatX === Math.round((sx - ax) / 4) && out.move.seatY >= lo - 1e-9 && out.move.seatY <= hi + 1e-9 && out.idle.seatY < -30;
    check('3 a ridden ' + sp + ' draws its strip' + (saddle ? ' + the saddle overlay' : ' bare (no saddle strips)') + ' (idle down, move right), the hero on the manifest seat'
      + (sdy ? ' (6 px lower, in front of the coral crown)' : '') + '; no errors, 0 DB', ok && r.errors.length === 0 && r.db.count() === 0, JSON.stringify(out) + ' ' + [lo, hi] + r.errors.join(' | '));
  }

  // ---- 4 phone ----
  const p = await open(browser, PHONE);
  const pp = await species(p);
  const pbad = pp.filter((r) => !pngOk(r.sp, r));
  const scroll = await p.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check('4 phone 390x844 dpr 2: every reef species draws from its PNG strip, no horizontal scroll, no errors, 0 DB', pbad.length === 0 && scroll && p.errors.length === 0 && p.offsite.length === 0 && p.db.count() === 0,
    JSON.stringify(pbad) + p.errors.join(' | '));

  // ---- 5 ?art=0: the code bake ----
  const z = await open(browser, DESK, '&art=0', { 'pixeltown-tames-v1': stable('tidesteed') });
  const zr = await ev(z.page, (I) => I.stripsReady());
  const zp = await species(z);
  const zride = await ev(z.page, (I) => { I.clearCreatures(); const on = I.ride(); I.face(0, 1); I.render(); return { on, r: I.riding() }; });
  check('5 ?art=0 loads no strip PNG; every reef species is the MMCreatureDraw code bake; a ridden tidesteed is the code bake, no saddle overlay',
    !zr.on && z.pngs.length === 0 && zp.every((r) => r.src === 'code' && r.drawn === r.sp && r.changed > 100) && zride.on && zride.r.drawn === 'tidesteed' && zride.r.saddle === ''
    && z.errors.length === 0 && z.db.count() === 0, JSON.stringify([zr, zp, zride]) + z.errors.join(' | '));

  check('DB: 0 requests across every page', opened.every((o) => o.db.count() === 0));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
