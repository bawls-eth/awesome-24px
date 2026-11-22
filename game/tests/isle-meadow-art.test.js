// Browser test (AW2): Codex b35 meadow-home tiles / props, b36 meadow creatures and b34b crafting icons on Hearth Isle (?isle=meadow).
// 1 the meadow chunks bake from the b35 PNGs (screen pixels of a garden path tile are b35 palette colours; AW3: the redone edge masks
//   are drawn as delivered and a pixel probe proves no dark halo round a path), the dock / boat / garden plots are baked PNG props and the homestead pen shows the b35 stable;
// 2 ?art=0 requests no b35 / b36 / b34b PNG and paints the flat code palette; 3 a meadow creature (Puffwool) draws from its b36 strip
//   and Hearth Isle preloads exactly the seven b36 species; 4 the craft panel shows the b34b icon by recipe id (text label kept, no icon
//   for an id without art, none with ?art=0); 5 phone 390x844 renders with no horizontal scroll; plus 0 DB requests, no offsite
//   requests and a clean console everywhere.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/isle-meadow-art.test.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/isles/index.html';
const pal = (d) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'assets', 'arcane', d, 'palette.json'), 'utf8')).colors;
const B35_PAL = pal('b35-meadow-home');
const B36_PAL = pal('b36-meadow-creatures');
const HOME_GRASS = ['#6cbf55', '#62b24c', '#78cb62', '#468a38']; // MMChunkBake home grass (the code-drawn grass beside a b35 edge mask)
const EDGE_RAMP = ['#6cbf55', '#78c960', '#60ad4d']; // AW3: the b35 grass-edge redo paints mask grass in this ramp (drawn as delivered)

const opened = [];
async function open(browser, opts, query, seed) {
  const ctx = await browser.newContext(opts);
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  const errors = [], offsite = [], pngs = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith(ORIGIN + '/') && !u.startsWith('data:')) offsite.push(u); });
  page.on('response', (r) => { const u = r.url(); if (/assets\/arcane\/b3[1-6][a-z]{0,2}-/.test(u)) pngs.push({ u: u.replace(/^.*\/arcane\//, ''), s: r.status() }); });
  await page.addInitScript((s) => { if (sessionStorage.seeded) return; sessionStorage.seeded = '1'; localStorage.clear(); Object.keys(s).forEach((k) => localStorage.setItem(k, s[k])); }, seed || {});
  await page.goto(PAGE + '?test=1&seed=123&isle=meadow' + (query || ''));
  await page.waitForFunction(() => window.__isles && window.__isles.world);
  await page.evaluate(async () => { await window.__isles.stripsReady(); await window.__isles.isleArt(); });
  const o = { ctx, page, errors, offsite, pngs, db };
  opened.push(o);
  return o;
}
const ev = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__isles, ${JSON.stringify(arg === undefined ? null : arg)})`);

// screen pixels of world tile (a.x, a.y) with the hero 4 tiles above it: share that are in a.pal
const TILE_PX = (I, a) => {
  I.pause(true); I.god(true); I.clearCreatures(); I.teleport(a.x, a.y - 4); I.step(0, 0, 0.02); I.render(); I.render();
  const cv = document.getElementById('view'), g = cv.getContext('2d'), dpr = cv.width / window.innerWidth, h = I.hero();
  const sx = Math.round((a.x * 32 - h.x + window.innerWidth / 2) * dpr), sy = Math.round((a.y * 32 - h.y + window.innerHeight / 2) * dpr), n = Math.round(32 * dpr);
  const d = g.getImageData(sx, sy, n, n).data, set = new Set(a.pal.map((c) => c.toLowerCase()));
  let inPal = 0;
  for (let i = 0; i < d.length; i += 4) if (set.has('#' + [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join(''))) inPal++;
  return { ratio: inPal / (n * n), n: n * n };
};
// a lone creature's screen pixels (render with it, then without): how many changed and how many are exact palette colours
const CREATURE_PX = (I, a) => {
  const cv = document.getElementById('view'), g = cv.getContext('2d'), dpr = cv.width / window.innerWidth;
  I.pause(true); I.god(true); I.clearCreatures(); const t = I.findTile('grass', 8); I.teleport(t.x, t.y); I.step(0, 0, 0.02);
  const h = I.hero(), uid = I.spawn(a.sp, h.tx + 3, h.ty);
  I.step(0, 0, 0.02); I.render();
  const c = I.creatures().find((x) => x.uid === uid);
  const sx = Math.round((c.x - h.x + window.innerWidth / 2) * dpr), sy = Math.round((c.y - h.y + window.innerHeight / 2) * dpr), R = Math.round(40 * dpr);
  const box = [sx - R, sy - 2 * R, 2 * R, 2 * R + Math.round(6 * dpr)];
  const withC = g.getImageData(box[0], box[1], box[2], box[3]).data;
  const info = { src: c.src, drawn: c.drawn };
  I.clearCreatures(); I.render();
  const without = g.getImageData(box[0], box[1], box[2], box[3]).data, set = new Set(a.pal.map((x) => x.toLowerCase()));
  let changed = 0, inPal = 0;
  for (let i = 0; i < withC.length; i += 4) {
    if (withC[i] === without[i] && withC[i + 1] === without[i + 1] && withC[i + 2] === without[i + 2]) continue;
    changed++;
    if (set.has('#' + [withC[i], withC[i + 1], withC[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join(''))) inPal++;
  }
  return Object.assign(info, { changed, ratio: changed ? inPal / changed : 0 });
};
// AW3 halo probe: a garden path tile with grass on a side and the grass tile beyond it. Every greenish screen pixel of the path's edge mask
// must be the edge ramp, and the grass strip touching the path the home code grass, none darker than the code grass shade (no dark ring).
const HALO_PX = (I, a) => {
  const w = I.world, W = w.w || w.width, T = w.terrain, AL = window.MMOverworld.TERRAIN_ALL, P = AL.garden_path, G = AL.grass;
  let spot = null;
  for (let y = 3; y < (T.length / W) - 3 && !spot; y++) for (let x = 3; x < W - 3 && !spot; x++) {
    if (T[y * W + x] !== P) continue;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const d of dirs) if (T[(y + d[1]) * W + x + d[0]] === G && T[(y + 2 * d[1]) * W + x + 2 * d[0]] === G) { spot = { x, y, dx: d[0], dy: d[1] }; break; }
  }
  if (!spot) return null;
  I.pause(true); I.god(true); I.clearCreatures(); I.teleport(spot.x, spot.y - 4); I.step(0, 0, 0.02); I.render(); I.render();
  const cv = document.getElementById('view'), g = cv.getContext('2d'), dpr = cv.width / window.innerWidth, h = I.hero(), n = Math.round(32 * dpr);
  const grab = (tx, ty) => g.getImageData(Math.round((tx * 32 - h.x + window.innerWidth / 2) * dpr), Math.round((ty * 32 - h.y + window.innerHeight / 2) * dpr), n, n).data;
  const hex = (d, i) => '#' + [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
  const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  const ramp = new Set(a.ramp), home = new Set(a.home), out = { spot, edgeGreen: 0, edgeBad: [], grassBad: [], grassPx: 0, floor: a.floor };
  const e = grab(spot.x, spot.y);
  for (let i = 0; i < e.length; i += 4) {
    if (!(e[i + 1] > e[i] + 20 && e[i + 1] > e[i + 2])) continue; // greenish = mask grass (the path ramp is brown / tan)
    out.edgeGreen++;
    if (!ramp.has(hex(e, i)) || lum(e, i) < a.floor) out.edgeBad.push(hex(e, i));
  }
  // the 4 px strip of the grass tile that touches the path (where a code edge line or a dark halo would sit)
  const q = grab(spot.x + spot.dx, spot.y + spot.dy), k = Math.round(4 * dpr);
  for (let yy = 0; yy < n; yy++) for (let xx = 0; xx < n; xx++) {
    const near = spot.dx === 1 ? xx < k : spot.dx === -1 ? xx >= n - k : spot.dy === 1 ? yy < k : yy >= n - k;
    if (!near) continue;
    const i = (yy * n + xx) * 4; out.grassPx++;
    if (lum(q, i) < a.floor || !home.has(hex(q, i))) out.grassBad.push(hex(q, i));
  }
  out.edgeBad = out.edgeBad.slice(0, 5); out.grassBad = out.grassBad.slice(0, 5);
  return out;
};
const SPOTS = (I) => ({ path: I.findTile('garden_path', 1), dock: I.dock(), home: I.home() });

(async () => {
  const browser = await chromium.launch();

  // ---- 1 desktop, art on ----
  const d = await open(browser, { viewport: { width: 1000, height: 700 } });
  const art = await ev(d.page, (I) => I.isleArt());
  check('1a Hearth Isle loads the b35 set: meadow tiles active and the 10 b35 props', art.pack === 'meadow' && art.tiles === true && art.props.length === 10
    && art.props.indexOf('stable') >= 0 && art.props.indexOf('boat') >= 0, JSON.stringify(art));
  const spots = await ev(d.page, SPOTS);
  const px = await ev(d.page, TILE_PX, { x: spots.path.x, y: spots.path.y, pal: B35_PAL });
  check('1b a garden path tile on screen is b35 art (>= 90% b35 palette, its edge grass included as delivered)', px.ratio >= 0.9 && EDGE_RAMP.every((c) => B35_PAL.map((x) => x.toLowerCase()).indexOf(c) >= 0), JSON.stringify(px) + ' ' + JSON.stringify(spots.path));
  const lum = (h) => 0.299 * parseInt(h.slice(1, 3), 16) + 0.587 * parseInt(h.slice(3, 5), 16) + 0.114 * parseInt(h.slice(5, 7), 16);
  const HALO = { ramp: EDGE_RAMP, home: HOME_GRASS.slice(0, 3), floor: Math.min(lum(HOME_GRASS[0]), lum(HOME_GRASS[1])) - 6 };
  const halo = await ev(d.page, HALO_PX, HALO);
  check('1h no dark halo: a path edge mask next to grass shows only the edge grass ramp, and the grass beside it is plain code grass (no edge line)',
    !!halo && halo.edgeGreen > 40 && halo.edgeBad.length === 0 && halo.grassPx > 100 && halo.grassBad.length === 0, JSON.stringify(halo));
  const codeOnly = await ev(d.page, TILE_PX, { x: spots.path.x, y: spots.path.y, pal: ['#cbb890', '#bfac84', '#d6c49d', '#9a8a66'] });
  check('1c ... and not the code palette for that tile', codeOnly.ratio < 0.2, JSON.stringify(codeOnly));
  const tilePngs = d.pngs.filter((p) => /^b35-meadow-home\/tiles\//.test(p.u));
  check('1d the 80 b35 tile PNGs (16 variants + 64 edge masks) were each fetched once, all 200', tilePngs.length === 80 && new Set(tilePngs.map((p) => p.u)).size === 80 && tilePngs.every((p) => p.s === 200), tilePngs.length);
  const dock = await ev(d.page, (I, a) => { I.teleport(a.dock.x, a.dock.y); I.step(0, 0, 0.02); for (let i = 0; i < 12; i++) I.render(); return I.propsBaked(); }, spots);
  check('1e the dock / boat / garden plots bake as b35 PNG props', dock.png >= 2, JSON.stringify(dock));
  // the homestead pen draws the b35 stable: b35 palette pixels over the pen cell (the code pen is two flat colours)
  const pen = spots.home.grid.find((c) => c[2] === 'pen');
  const st = await ev(d.page, TILE_PX, { x: spots.home.origin.x + pen[0], y: spots.home.origin.y + pen[1], pal: B35_PAL });
  check('1f the homestead pen shows the b35 stable (its tile is mostly b35 palette)', !!pen && st.ratio > 0.5, JSON.stringify(st));

  // ---- 3 meadow creature from its b36 strip ----
  const ready = await ev(d.page, (I) => I.stripsReady());
  check('3a Hearth Isle preloads exactly the seven b36 species (98 strips), no jungle strips', ready.on && ready.count === 98
    && ready.kinds.join() === 'clover_hopper,puffwool,bumble_mote,pebble_tortle,thistle_boar,meadow_strider,oakback', JSON.stringify(ready));
  const cp = await ev(d.page, CREATURE_PX, { sp: 'puffwool', pal: B36_PAL });
  check('3b a Puffwool draws from its b36 strip (src png, b36 palette pixels)', cp.src === 'png' && /^puffwool_(idle|move)_(down|up|right)$/.test(cp.drawn) && cp.changed > 300 && cp.ratio > 0.6, JSON.stringify(cp));
  const oak = await ev(d.page, (I) => { const h = I.hero(); const uid = I.spawn('oakback', h.tx + 3, h.ty); I.step(0, 0, 0.02); I.render(); const c = I.creatures().find((x) => x.uid === uid); return { src: c.src, drawn: c.drawn, size: c.size }; });
  check('3c the XL Oakback draws from its b36 strip too', oak.src === 'png' && /^oakback_/.test(oak.drawn) && oak.size === 'XL', JSON.stringify(oak));
  // AW3 size redo: every species bakes to its size-class cell (S 48 / M 64 / L 96 / XL 128 native, no 2x override), feet near the cell
  // bottom, and the visible body fills a sensible share of it (the ground shadow is sized to that body)
  const sizes = await ev(d.page, (I) => ['clover_hopper', 'puffwool', 'bumble_mote', 'pebble_tortle', 'thistle_boar', 'meadow_strider', 'oakback'].map((k) => {
    const s = I.stripSize(k, 'idle', 0), u = I.spawn(k, I.hero().tx + 2, I.hero().ty), c = I.creatures().find((x) => x.uid === u); I.clearCreatures();
    return Object.assign({ k, size: c.size }, s);
  }));
  const CLS = { S: 48, M: 64, L: 96, XL: 128 };
  check('3d b36 strips bake at their size class (S 48, M 64, L 96, XL 128), feet 0.85..0.92 down the cell, body 35..95% of the cell wide and 40..95% tall',
    sizes.every((s) => s.w === CLS[s.size] && s.h === s.w && s.ay / s.h > 0.85 && s.ay / s.h < 0.92 && s.span / s.w > 0.35 && s.span / s.w < 0.95 && (s.ay - s.top) / s.h > 0.4 && (s.ay - s.top) / s.h < 0.95)
    && sizes.map((s) => s.size).join() === 'S,S,S,S,M,L,XL', JSON.stringify(sizes));

  // ---- 3e a ridden Meadow Strider (L, 384 px cells, no saddle overlay): its own strip, the hero on the manifest seat inside the body ----
  const STRIDER = JSON.stringify({ v: 1, n: 1, roster: [{ id: 't1', sp: 'meadow_strider', nm: 'Stridey', lv: 4, xp: 0, bond: 2, aff: 0, cos: '', isle: 'meadow', d: '2026-11-01' }], party: [], mount: 't1' });
  for (const [lab, vp] of [['desktop', { viewport: { width: 1000, height: 700 } }], ['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }]]) {
    const rs = await open(browser, vp, '', { 'pixeltown-tames-v1': STRIDER });
    const rr = await ev(rs.page, (I) => {
      I.pause(true); I.god(true); I.clearCreatures(); const t = I.findTile('grass', 8); I.teleport(t.x, t.y);
      const on = I.ride(); I.face(0, 1); I.step(0, 0, 0.02); I.render(); const idle = I.riding();
      I.face(1, 0); I.step(1, 0, 0.13); I.render(); const move = I.riding();
      const MS = window.MMCreatureStrips, seat = { x: 0, y: 0 }, body = I.stripSize('meadow_strider', 'move', MS.RIGHT);
      const ok = MS.seatOffset('meadow_strider', true, MS.RIGHT, 0, seat);
      return { on, idle: idle && idle.drawn, idleSad: idle && idle.saddle, move: move && move.drawn, seat: ok ? seat : null, body };
    });
    const bh = rr.body ? rr.body.ay - rr.body.top : 0;
    check('3e ' + lab + ': a ridden Meadow Strider draws its 96 px b36 strip (idle down, move right, no saddle overlay), the hero sits on the seat inside the body',
      rr.on && rr.idle === 'meadow_strider_idle_down' && rr.idleSad === '' && rr.move === 'meadow_strider_move_right' && rr.body && rr.body.w === 96
      && rr.seat && rr.seat.y === (347 - 159) / 4 && rr.seat.y > bh * 0.4 && rr.seat.y < bh && Math.abs(rr.seat.x) < 2 && rs.errors.length === 0 && rs.db.count() === 0, JSON.stringify(rr) + rs.errors.join(' | '));
  }

  // ---- 4 craft panel icons ----
  await d.page.waitForFunction(() => window.__isles.craftIcons().length === 14, null, { timeout: 5000 }).catch(() => {});
  const icons = await ev(d.page, async (I) => {
    I.openPanel('craft');
    await Promise.all(Array.from(document.querySelectorAll('img.rc-ico')).map((im) => (im.complete && im.naturalWidth ? null : im.decode().catch(() => null)))); // the icons are new img elements: wait for them
    const row = (id) => document.querySelector('.recipe[data-recipe="' + id + '"]');
    const ico = (id) => { const im = row(id) && row(id).querySelector('img.rc-ico'); return im ? { src: im.getAttribute('src'), w: im.naturalWidth } : null; };
    const out = { loaded: I.craftIcons(), raft: ico('raft'), drift: ico('rocket_core_drift'), steg: ico('saddle_stegolith'), feast: ico('feast'), feastText: row('feast').querySelector('.rc-name').textContent,
      raftText: row('raft').querySelector('.rc-name').textContent, n: document.querySelectorAll('img.rc-ico').length };
    I.closePanel();
    return out;
  });
  // XW1: icons are by output item; the drift rocket core row shows the rocket core icon too and the kelp O2 tank row the O2 tank icon (14 icons on 16 of the ALL_IDS rows)
  check('4a every recipe with b34b art shows its icon by id (14 icons, on 16 rows: both rocket core and both O2 tank builds)', icons.loaded.length === 14 && icons.n === 16 && /icon_rocket_core\.png$/.test(icons.drift.src) && /b34b-crafting-icons\/items\/icon_raft\.png$/.test(icons.raft.src)
    && icons.raft.w === 32 && /icon_saddle_stegolith\.png$/.test(icons.steg.src), JSON.stringify(icons));
  check('4b the text label stays; a recipe with no icon (feast) is text only', icons.raftText === 'Raft' && icons.feast === null && icons.feastText === 'Feast', JSON.stringify(icons));
  check('1g desktop: no console errors, no offsite requests, 0 DB requests, every b3x PNG 200, no jungle strips fetched',
    d.errors.length === 0 && d.offsite.length === 0 && d.db.count() === 0 && d.pngs.every((p) => p.s === 200) && !d.pngs.some((p) => /^b3(1a|1b|2|2s)-/.test(p.u)),
    d.errors.concat(d.offsite).join(' | ') + ' ' + JSON.stringify(d.pngs.filter((p) => p.s !== 200 || /^b3(1a|1b|2|2s)-/.test(p.u)).slice(0, 5)));

  // ---- 2 ?art=0 ----
  const z = await open(browser, { viewport: { width: 1000, height: 700 } }, '&art=0');
  const zart = await ev(z.page, (I) => I.isleArt());
  const zpx = await ev(z.page, TILE_PX, { x: spots.path.x, y: spots.path.y, pal: B35_PAL });
  const zflat = await ev(z.page, TILE_PX, { x: spots.path.x, y: spots.path.y, pal: ['#cbb890'] });
  const zc = await ev(z.page, CREATURE_PX, { sp: 'puffwool', pal: B36_PAL });
  const zi = await ev(z.page, (I) => { I.openPanel('craft'); const n = document.querySelectorAll('img.rc-ico').length; const t = document.querySelector('.recipe[data-recipe="raft"] .rc-name').textContent; I.closePanel(); return { n, t, loaded: I.craftIcons() }; });
  check('2a ?art=0 requests no b35 / b36 / b34b PNG and has no isle art', z.pngs.length === 0 && zart.tiles === false && zart.props.length === 0, JSON.stringify(zart) + ' ' + z.pngs.length);
  check('2b ?art=0 paints the path tile flat in the code palette (no b35 pixels)', zpx.ratio < 0.05 && zflat.ratio > 0.9, JSON.stringify([zpx, zflat]));
  check('2c ?art=0: the Puffwool is the code bake, the craft panel is text only', zc.src === 'code' && zi.n === 0 && zi.t === 'Raft' && zi.loaded.length === 0, JSON.stringify([zc, zi]));
  check('2d ?art=0: no console errors, no offsite requests, 0 DB requests', z.errors.length === 0 && z.offsite.length === 0 && z.db.count() === 0, z.errors.join(' | '));

  // a failed b35 tile falls back per tile: block every garden_path variant, the path paints its code palette, the rest stays b35
  const fctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const fdb = await blockDb(fctx);
  await fctx.route(/tile_garden_path_[a-d]\.png$/, (r) => r.fulfill({ status: 404, body: 'nope' }));
  const fp = await fctx.newPage(); const ferr = [];
  fp.on('pageerror', (e) => ferr.push(e.message)); fp.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) ferr.push(m.text()); });
  await fp.goto(PAGE + '?test=1&seed=123&isle=meadow');
  await fp.waitForFunction(() => window.__isles && window.__isles.world);
  await fp.evaluate(() => window.__isles.isleArt());
  const fpx = await ev(fp, TILE_PX, { x: spots.path.x, y: spots.path.y, pal: ['#cbb890', '#bfac84', '#d6c49d', '#9a8a66'] });
  const fart = await ev(fp, (I) => I.isleArt());
  check('2e missing garden path PNGs fall back to the code palette for that terrain only', fart.tiles === true && fpx.ratio > 0.6 && ferr.length === 0 && fdb.count() === 0, JSON.stringify([fart, fpx]) + ferr.join(' | '));
  await fctx.close();

  // ---- 5 phone ----
  const p = await open(browser, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const ppx = await ev(p.page, TILE_PX, { x: spots.path.x, y: spots.path.y, pal: B35_PAL });
  const pc = await ev(p.page, CREATURE_PX, { sp: 'clover_hopper', pal: B36_PAL });
  const phalo = await ev(p.page, HALO_PX, HALO);
  const scroll = await p.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check('5 phone 390x844 (dpr 2): b35 tiles (no dark halo) and a 48 px b36 Clover Hopper draw, no horizontal scroll, no errors, 0 DB requests',
    ppx.ratio >= 0.9 && pc.src === 'png' && pc.ratio > 0.6 && !!phalo && phalo.edgeBad.length === 0 && phalo.grassBad.length === 0 && phalo.edgeGreen > 100
    && scroll && p.errors.length === 0 && p.offsite.length === 0 && p.db.count() === 0, JSON.stringify([ppx, pc, phalo]) + p.errors.join(' | '));

  // ---- source guards: no Firebase on the isles page, the chunk bake stays bake-time only ----
  const html = fs.readFileSync(path.join(__dirname, '..', 'games', 'isles', 'index.html'), 'utf8');
  check('6 the isles page never loads firebase / net.js', !/firebase|net\.js/i.test(html));

  for (const o of opened) await o.ctx.close();
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
