// Pixeltown hub page: a Mario-World-style overworld drawn on a canvas with procedural pixel art.
// Pure logic lives in shared/mm-map.js (MMMap) and shared/profile.js (MMHubProfile).
// Own key `pixeltown-hub-v1`; the town save and the profile key are only READ here, never written.
// No network, no innerHTML: every string reaches the DOM through textContent / attributes.
(function () {
  'use strict';
  const KEY = 'pixeltown-hub-v1';
  const T = 16;            // logical pixels per tile
  const SPEED = 7;         // tiles per second while walking
  const MAP = MMMap.MAP;
  const byId = Object.create(null);
  MAP.nodes.forEach((n) => { byId[n.id] = n; });
  const wIdx = Object.create(null);
  MAP.worlds.forEach((w, i) => { wIdx[w.id] = i; });
  const wName = Object.create(null);
  MAP.worlds.forEach((w) => { wName[w.id] = w.name; });

  // Real pages (relative to /game/hub/). Nodes without one are cross-game goals (W0 levels, the Festival Finale: the card
  // lists the goal) or HIDDEN below; "Coming soon" is only a fallback for a node with neither.
  const FROM_HUB = '../index.html?from=hub';
  const LINKS = Object.assign(Object.create(null), {
    'w0-square': FROM_HUB, // G-14 (b08-05): the default node (where a fresh map opens) is never a "Coming soon" dead end: it opens the Town square
    'w0-hearthvale': FROM_HUB,
    'w1-hearthvale': FROM_HUB,
    'w2-lantern': '../games/mad-maze/lantern.html?from=hub',
    'w4-angler': '../games/angler/index.html',
    'w3-deepdelve': '../games/deepdelve/index.html',
    'w5-safari': '../games/festival/bugs.html',
    'w2-catacombs': '../games/mad-maze/index.html?mode=dungeon&seed=1&from=hub',
    'w7-isles': '../games/isles/index.html?from=hub',
    'w5-jam': '../games/jam/index.html',
    'w5-stalk': '../games/stalk/index.html',
    'w5-pop': '../games/pop/index.html',
    'w5-dash': '../games/dash/index.html',
    'w5-stack': '../games/stack/index.html',
    'w5-echo': '../games/echo/index.html',
    // Level nodes open the game (and sub-mode) whose own save clears them (goals: MMHubProfile.MILESTONES).
    'w2-burrow': '../games/mad-maze/index.html?mode=dungeon&from=hub',
    'w2-keep': '../games/mad-maze/index.html?mode=world&from=hub',
    'w3-depth8': '../games/deepdelve/index.html', 'w3-iron': '../games/deepdelve/index.html',
    'w3-lava': '../games/deepdelve/index.html', 'w3-crystal': '../games/deepdelve/index.html',
    'w4-west': '../games/angler/index.html', 'w4-east': '../games/angler/index.html', 'w4-river': '../games/angler/index.html',
    'w4-pier': '../games/angler/index.html', 'w4-whiskers': '../games/angler/index.html',
    'w6-trout': '../games/angler/index.html', 'w6-expert': '../games/jam/index.html',
    // Hearthvale places live in the Town (the Town reports their exits itself).
    'w1-sparkle': FROM_HUB, 'w1-weed': FROM_HUB, 'w1-turnip': FROM_HUB, 'w1-museum': FROM_HUB,
    'w1-bonus': FROM_HUB, 'w1-castle': FROM_HUB, 'w6-night': FROM_HUB,
  });
  const TOWN_NODES = new Set(['w1-sparkle', 'w1-weed', 'w1-turnip', 'w1-museum', 'w1-bonus', 'w1-castle', 'w6-night']);
  // Not buildable yet (no game or sub-mode can report them): hidden from the map, its taps and the completion total.
  // Daily Maze / Sunken Lantern need the Realm to report a daily run; Mazewright Remix and Deepdelve Hardcore have no mode.
  const HIDDEN = new Set(['w2-daily', 'w2-sunken', 'w6-remix', 'w6-hardcore']);
  const shown = (id) => !HIDDEN.has(id);
  const VISIBLE_MAP = Object.assign({}, MAP, { nodes: MAP.nodes.filter((n) => shown(n.id)) });
  const PATH_BY_ID = Object.create(null);
  MAP.paths.forEach((p) => { PATH_BY_ID[p.id] = p; });
  // NAV slice D: every game node with a real page is always open to play (from a fresh save too). Map paths,
  // medals and the unlock rules are unchanged: they are a bonus goal (walking the map), never a gate on a game.
  const GAME_ICON = { 'w1-hearthvale': '\u{1F3E1}', 'w2-lantern': '\u{1F3EE}', 'w3-deepdelve': '\u26CF\uFE0F', 'w4-angler': '\u{1F3A3}',
    'w5-safari': '\u{1F98B}', 'w5-jam': '\u{1F3B8}', 'w5-stalk': '\u{1F96C}', 'w5-pop': '\u{1F9E9}', 'w5-dash': '\u{1F56F}\uFE0F', 'w5-stack': '\u{1F3EF}', 'w5-echo': '\u{1F337}', 'w7-isles': '\u{1F3DD}\uFE0F' };
  // cycle 0 art (b12-r2-11): map node -> MMPixelIcons id (code-drawn 16x16); ?pxicons=0 keeps the emoji
  const PX_OF = { 'w1-hearthvale': 'town', 'w2-lantern': 'lantern', 'w3-deepdelve': 'deepdelve', 'w4-angler': 'angler', 'w5-safari': 'bugs', 'w5-jam': 'jam',
    'w5-stalk': 'stalk', 'w5-pop': 'pop', 'w5-dash': 'dash', 'w5-stack': 'stack', 'w5-echo': 'echo', 'w7-isles': 'isles' };
  const PXI = !/(?:^|&)pxicons=0(?:&|$)/.test(location.search.slice(1)) && window.MMPixelIcons ? window.MMPixelIcons : null;
  const playable = (n) => !!n && (n.type === 'game' || n.type === 'gate') && !!LINKS[n.id];
  const GAME_NODES = MAP.nodes.filter((n) => n.type === 'game' && LINKS[n.id]);

  const $ = (id) => document.getElementById(id);
  const canvas = $('map');
  const ctx = canvas.getContext('2d');
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

  // ---------- storage ----------
  function readKey(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function parse(s) { try { return JSON.parse(s); } catch (e) { return null; } }

  function loadHub() {
    const raw = parse(readKey(KEY));
    const st = MMMap.sanitizeState(raw);
    const at = isObj(raw) && MMMap.hasNode(raw.at) ? raw.at : MAP.start;
    return { at, state: st };
  }
  let hub = loadHub();
  function saveHub() {
    try {
      const s = hub.state;
      localStorage.setItem(KEY, JSON.stringify({ v: 1, at: hub.at, nodes: s.nodes, seenPaths: s.seenPaths, keys: s.keys, keysUsed: s.keysUsed, comets: s.comets }));
    } catch (e) { /* storage blocked: the map still works for this visit */ }
  }

  // Profile: read-only. If the profile key is absent, seed in memory from the town save (never written).
  function loadProfile() {
    const raw = parse(readKey(MMHubProfile.KEY));
    if (isObj(raw)) return MMHubProfile.sanitize(raw);
    return MMHubProfile.seedFromTown(readKey(MMHubProfile.TOWN_KEY), Date.now());
  }
  const profile = loadProfile();

  function union(a, b) { return a.concat(b.filter((x) => !a.includes(x))); }
  // Effective state = hub state merged with what the games reported to the profile.
  function effective() {
    const h = hub.state;
    const nodes = Object.create(null);
    const ids = Object.keys(h.nodes).concat(Object.keys(profile.nodes).filter((i) => !(i in h.nodes)));
    ids.forEach((id) => {
      const a = h.nodes[id] || { exits: [], medals: {} };
      const b = profile.nodes[id] || { exits: [], medals: {} };
      const medals = {};
      MMMap.MEDALS.forEach((m) => { medals[m] = !!(a.medals && a.medals[m]) || !!(b.medals && b.medals[m]); });
      nodes[id] = { exits: union(a.exits || [], b.exits || []), medals };
    });
    return MMMap.sanitizeState({
      nodes, seenPaths: union(h.seenPaths, profile.map.seenPaths), keys: Math.max(h.keys, profile.keys),
      keysUsed: union(h.keysUsed, profile.keysUsed), comets: union(h.comets, profile.comets),
    });
  }

  // ---------- derived map state ----------
  let E, openIds, openSet, reach;
  function recompute() {
    E = effective();
    openIds = MMMap.openPathIds(MAP, E).filter((pid) => { const p = PATH_BY_ID[pid]; return shown(p.from) && shown(p.to); });
    openSet = new Set(openIds);
    reach = new Set();
    MAP.nodes.forEach((n) => { if (shown(n.id) && MMMap.bfs(MAP, hub.at, n.id, openIds)) reach.add(n.id); });
  }

  // ---------- geometry per world ----------
  function poly(a, b) {
    const pts = [{ x: a.x, y: a.y }];
    if (b.x !== a.x) pts.push({ x: b.x, y: a.y });
    if (b.y !== a.y) pts.push({ x: b.x, y: b.y });
    return pts;
  }
  let geo = Object.create(null);
  let wantRows = 0; // phones: pad the map vertically so it fills the stage (set by resize)
  function geoFor(w) {
    if (geo[w]) return geo[w];
    const ns = MAP.nodes.filter((n) => n.world === w);
    const minX = Math.min.apply(null, ns.map((n) => n.x)) - 3;
    const maxX = Math.max.apply(null, ns.map((n) => n.x)) + 3;
    const minY = Math.min.apply(null, ns.map((n) => n.y)) - 3;
    const maxY = Math.max.apply(null, ns.map((n) => n.y)) + 3;
    const g = { w, minX, maxX: Math.max(maxX, minX + 13), minY, maxY: Math.max(maxY, minY + 9), paths: [], stubs: [], tiles: new Set() };
    g.cols = g.maxX - g.minX + 1; g.rows = g.maxY - g.minY + 1;
    if (wantRows > g.rows) { const ex = wantRows - g.rows, top = Math.floor(ex / 2); g.minY -= top; g.maxY += ex - top; g.rows = wantRows; }
    MAP.paths.forEach((p) => {
      const a = byId[p.from], b = byId[p.to];
      if (!shown(a.id) || !shown(b.id)) return;
      if (a.world === w && b.world === w) {
        const pts = poly(a, b);
        const tiles = [];
        for (let i = 0; i + 1 < pts.length; i++) {
          const s = pts[i], e = pts[i + 1];
          const dx = Math.sign(e.x - s.x), dy = Math.sign(e.y - s.y);
          for (let x = s.x, y = s.y; ; x += dx, y += dy) { tiles.push({ x, y }); if (x === e.x && y === e.y) break; }
        }
        g.paths.push({ p, tiles });
        tiles.forEach((t) => g.tiles.add(t.x + ',' + t.y));
      } else if (a.world === w || b.world === w) {
        const here = a.world === w ? a : b, there = a.world === w ? b : a;
        const dir = wIdx[there.world] > wIdx[w] ? 1 : -1;
        const sx = dir > 0 ? g.maxX - 1 : g.minX + 1;
        const tiles = [];
        for (let x = here.x; x !== sx + dir; x += dir) tiles.push({ x, y: here.y });
        g.paths.push({ p, tiles });
        tiles.forEach((t) => g.tiles.add(t.x + ',' + t.y));
        g.stubs.push({ x: sx, y: here.y, dir, here: here.id, target: there.id, path: p });
      }
    });
    geo[w] = g;
    return g;
  }

  function hash(x, y, s) {
    let h = (x * 374761393 + y * 668265263 + (s || 0) * 2147483647) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    return (h ^ (h >>> 16)) >>> 0;
  }
  function px(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }

  // ---------- terrain (cached per world) ----------
  let bgCache = Object.create(null);
  function buildBg(w) {
    if (bgCache[w]) return bgCache[w];
    const g = geoFor(w);
    const cv = document.createElement('canvas');
    cv.width = g.cols * T; cv.height = g.rows * T;
    const c = cv.getContext('2d');
    const near = (x, y, r) => {
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
        if (g.tiles.has((x + dx) + ',' + (y + dy))) return true;
      }
      return false;
    };
    const seed = wIdx[w] + 3;
    const GR = ['#4c8a3f', '#478539', '#52913f', '#4a8a45'];
    for (let ty = 0; ty < g.rows; ty++) for (let tx = 0; tx < g.cols; tx++) {
      const wx = tx + g.minX, wy = ty + g.minY, X = tx * T, Y = ty * T;
      const h = hash(wx, wy, seed);
      const edge = tx === 0 || ty === 0 || tx === g.cols - 1 || ty === g.rows - 1;
      const noise = Math.sin(wx * 0.45 + seed) + Math.cos(wy * 0.4 + seed * 2) + Math.sin((wx + wy) * 0.25);
      const isWater = !edge && noise > 1.45 && !near(wx, wy, 2);
      if (isWater) {
        px(c, X, Y, T, T, '#2f6fb5');
        for (let i = 0; i < 3; i++) { const hh = hash(wx, wy, 11 + i); px(c, X + (hh % 12), Y + ((hh >> 5) % 14), 4, 1, '#6fa6dd'); }
        continue;
      }
      px(c, X, Y, T, T, GR[h & 3]);
      for (let i = 0; i < 3; i++) { const hh = hash(wx, wy, 5 + i); px(c, X + (hh % 15), Y + ((hh >> 4) % 15), 1, 2, '#3b7632'); }
      if (!edge && (h >> 6) % 11 === 0 && !g.tiles.has(wx + ',' + wy)) { // flower
        const col = ['#f4e36a', '#f08fb0', '#fff'][(h >> 10) % 3];
        px(c, X + 6, Y + 6, 2, 2, col); px(c, X + 7, Y + 8, 1, 2, '#2f6a2a');
      }
      if (edge) { // tree border
        px(c, X + 6, Y + 9, 4, 6, '#6b4423');
        px(c, X + 2, Y + 1, 12, 5, '#2f6a2a'); px(c, X + 3, Y + 5, 10, 5, '#2a6226'); px(c, X + 4, Y + 2, 3, 2, '#4f9a3c');
      }
    }
    bgCache[w] = { cv, g };
    return bgCache[w];
  }

  // ---------- state of view / walker ----------
  const view = { world: byId[hub.at].world, hover: null, t: 0 };
  const hue = (function () {
    const s = profile.name + '|' + profile.species + '|' + profile.frame;
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    return h;
  }());
  const walker = { x: byId[hub.at].x, y: byId[hub.at].y, face: 1, wps: null, i: 0, openCard: false };
  let cardFor = null;

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) || profile.settings.reduceMotion === true || !!(window.MMSideAccess && window.MMSideAccess.reduced());
  }

  function neighbors(id) {
    const out = [];
    MAP.paths.forEach((p) => {
      if (!openSet.has(p.id)) return;
      if (p.from === id) out.push(p.to); else if (p.to === id) out.push(p.from);
    });
    return out;
  }

  function buildWaypoints(route) {
    const first = byId[route[0]];
    const wps = [{ x: first.x, y: first.y, world: first.world }];
    for (let i = 0; i + 1 < route.length; i++) {
      const a = byId[route[i]], b = byId[route[i + 1]];
      if (a.world === b.world) {
        const pts = poly(a, b);
        pts.slice(1).forEach((p) => wps.push({ x: p.x, y: p.y, world: a.world }));
        wps[wps.length - 1].node = b.id;
        if (pts.length === 1) wps.push({ x: b.x, y: b.y, world: b.world, node: b.id });
      } else {
        const dir = wIdx[b.world] > wIdx[a.world] ? 1 : -1;
        const g = geoFor(a.world);
        const sx = dir > 0 ? g.maxX - 1 : g.minX + 1;
        wps.push({ x: a.x, y: a.y, world: a.world });
        wps.push({ x: sx, y: a.y, world: a.world });
        wps.push({ x: b.x, y: b.y, world: b.world, hop: true, node: b.id });
      }
    }
    return wps;
  }

  function placeAt(id) {
    const n = byId[id];
    hub.at = id; walker.x = n.x; walker.y = n.y; view.world = n.world;
  }

  function travel(id, openCard) {
    if (walker.wps) return false;
    if (id === hub.at) { if (openCard) openNode(id); return true; }
    const route = MMMap.bfs(MAP, hub.at, id, openIds);
    if (!route) { toast('That path is locked.'); return false; }
    const wps = buildWaypoints(route);
    if (reducedMotion()) {
      placeAt(id); saveHub(); afterMove(); if (openCard) openNode(id);
      return true;
    }
    walker.wps = wps; walker.i = 1; walker.openCard = !!openCard;
    closeCard();
    return true;
  }

  function arrive(wp) {
    if (wp.hop) { view.world = wp.world; resize(); walker.x = wp.x; walker.y = wp.y; }
    if (wp.node) { hub.at = wp.node; view.world = byId[wp.node].world; }
  }
  function finishWalk() {
    const open = walker.openCard;
    walker.wps = null; walker.openCard = false;
    saveHub(); afterMove();
    if (open) openNode(hub.at);
  }
  function afterMove() { recompute(); resize(); updateHud(); }

  function stepWalk(dt) {
    if (!walker.wps) return;
    let left = SPEED * dt;
    while (left > 0 && walker.wps) {
      const wp = walker.wps[walker.i];
      if (wp.hop) { arrive(wp); if (++walker.i >= walker.wps.length) finishWalk(); continue; }
      const dx = wp.x - walker.x, dy = wp.y - walker.y, d = Math.hypot(dx, dy);
      if (dx) walker.face = dx > 0 ? 1 : -1;
      if (d <= left) {
        walker.x = wp.x; walker.y = wp.y; left -= d;
        arrive(wp);
        if (++walker.i >= walker.wps.length) finishWalk();
      } else { walker.x += (dx / d) * left; walker.y += (dy / d) * left; left = 0; }
    }
  }

  // ---------- drawing ----------
  function drawPaths(g, ox, oy) {
    g.paths.forEach((pp) => {
      const open = openSet.has(pp.p.id);
      pp.tiles.forEach((t) => {
        const X = (t.x - g.minX) * T, Y = (t.y - g.minY) * T;
        const h = hash(t.x, t.y, 9);
        if (open) {
          px(ctx, X + 1, Y + 1, 14, 14, '#c9a66b');
          px(ctx, X + 1, Y + 1, 14, 1, '#dcc08a'); px(ctx, X + 1, Y + 14, 14, 1, '#a98a52');
          px(ctx, X + 3 + (h % 8), Y + 4 + ((h >> 4) % 8), 2, 1, '#a98a52');
        } else {
          px(ctx, X + 4, Y + 4, 8, 8, '#8e866f');
          px(ctx, X + 6, Y + 6, 4, 4, '#6f6955');
        }
      });
    });
  }
  function drawStub(g, s) {
    const X = (s.x - g.minX) * T, Y = (s.y - g.minY) * T, open = openSet.has(s.path.id);
    px(ctx, X + 7, Y + 5, 2, 10, '#6b4423');
    px(ctx, X + 2, Y + 2, 12, 6, open ? '#e9d8a6' : '#8e866f');
    px(ctx, X + 2, Y + 2, 12, 1, '#3a2a14'); px(ctx, X + 2, Y + 7, 12, 1, '#3a2a14');
    const ax = s.dir > 0 ? X + 9 : X + 4;
    px(ctx, ax, Y + 4, 3, 2, '#3a2a14');
    px(ctx, s.dir > 0 ? X + 11 : X + 3, Y + 3, 1, 4, '#3a2a14');
  }

  function medalDots(n, cx, cy) {
    const st = E.nodes[n.id];
    ['b', 's', 'g'].forEach((m, i) => {
      const on = st && st.medals[m];
      px(ctx, cx - 6 + i * 5, cy + 10, 4, 4, '#0c140f');
      px(ctx, cx - 5 + i * 5, cy + 11, 2, 2, on ? { b: '#c27b3c', s: '#e2e8ee', g: '#f2c230' }[m] : '#4a4f4c');
    });
  }
  function drawNode(g, n) {
    const cx = (n.x - g.minX) * T + 8, cy = (n.y - g.minY) * T + 8;
    const locked = !reach.has(n.id) && !playable(n);
    const st = E.nodes[n.id];
    const cleared = !!(st && st.exits.length);
    px(ctx, cx - 7, cy + 5, 14, 3, 'rgba(0,0,0,.25)');
    if (locked) {
      px(ctx, cx - 5, cy - 4, 10, 10, '#4b4f4c'); px(ctx, cx - 4, cy - 5, 8, 12, '#4b4f4c');
      px(ctx, cx - 3, cy - 7, 6, 4, '#8d928f'); px(ctx, cx - 2, cy - 6, 4, 3, '#4b4f4c'); // shackle
      px(ctx, cx - 5, cy - 2, 10, 8, '#8d928f'); px(ctx, cx - 1, cy, 2, 3, '#2a2d2b');
    } else if (n.type === 'start') {
      px(ctx, cx - 1, cy - 8, 2, 14, '#e9e2c8');
      px(ctx, cx + 1, cy - 8, 7, 3, '#e2483c'); px(ctx, cx + 1, cy - 5, 5, 2, '#e2483c'); px(ctx, cx + 1, cy - 3, 3, 1, '#e2483c');
      px(ctx, cx - 4, cy + 5, 8, 2, '#6b4423');
    } else if (n.type === 'gate') {
      px(ctx, cx - 7, cy - 6, 3, 12, '#9a9a9a'); px(ctx, cx + 4, cy - 6, 3, 12, '#9a9a9a');
      px(ctx, cx - 7, cy - 8, 14, 3, '#b8b8b8'); px(ctx, cx - 4, cy - 5, 8, 2, '#f2b84b');
      px(ctx, cx - 4, cy - 3, 8, 9, '#2c4a2a');
    } else if (n.type === 'snack') {
      px(ctx, cx - 7, cy - 1, 14, 7, '#8a5a2c'); px(ctx, cx - 7, cy - 1, 14, 2, '#b07a3c');
      for (let i = 0; i < 7; i++) px(ctx, cx - 8 + i * 2 + 1, cy - 7, 2, 5, i % 2 ? '#f4f0e0' : '#e2483c');
      px(ctx, cx - 8, cy - 8, 16, 1, '#a52f26');
    } else if (n.type === 'game') {
      px(ctx, cx - 6, cy - 1, 12, 8, '#d8c79a'); px(ctx, cx - 7, cy - 3, 14, 2, '#c4533f');
      px(ctx, cx - 5, cy - 5, 10, 2, '#c4533f'); px(ctx, cx - 3, cy - 7, 6, 2, '#c4533f');
      px(ctx, cx - 2, cy + 2, 4, 5, '#6b4423'); px(ctx, cx + 3, cy, 2, 2, '#7ec8e3');
    } else if (n.type === 'castle') {
      px(ctx, cx - 6, cy - 4, 12, 11, '#9fa6ad'); px(ctx, cx - 6, cy - 7, 3, 3, '#9fa6ad');
      px(ctx, cx - 1, cy - 7, 3, 3, '#9fa6ad'); px(ctx, cx + 3, cy - 7, 3, 3, '#9fa6ad');
      px(ctx, cx - 2, cy + 2, 4, 5, '#4a3320'); px(ctx, cx - 4, cy - 2, 2, 2, '#2f3a44'); px(ctx, cx + 2, cy - 2, 2, 2, '#2f3a44');
    } else { // level
      const col = cleared ? '#58c46a' : '#e8693b';
      px(ctx, cx - 5, cy - 7, 10, 14, '#0c140f'); px(ctx, cx - 7, cy - 5, 14, 10, '#0c140f');
      px(ctx, cx - 4, cy - 6, 8, 12, col); px(ctx, cx - 6, cy - 4, 12, 8, col);
      px(ctx, cx - 4, cy - 5, 6, 2, 'rgba(255,255,255,.4)');
      if (n.comet) { px(ctx, cx - 1, cy - 3, 2, 6, '#fff'); px(ctx, cx - 3, cy - 1, 6, 2, '#fff'); }
    }
    if (n.medals && !locked) medalDots(n, cx, cy);
  }
  // Labels under every game / gate node (canvas text at the map's pixel scale), kept inside the canvas.
  let labelsDrawn = [];
  function drawLabels(g) {
    labelsDrawn = [];
    ctx.save();
    ctx.font = 'bold 8px ui-monospace, Menlo, Consolas, monospace';
    ctx.textBaseline = 'top';
    MAP.nodes.forEach((n) => {
      if (n.world !== view.world || !(n.type === 'game' || n.type === 'gate')) return;
      const text = n.name;
      const w = Math.ceil(ctx.measureText(text).width) + 4, h = 10;
      const cx = (n.x - g.minX) * T + 8, cy = (n.y - g.minY) * T + 8;
      let x = Math.round(cx - w / 2), y = cy + (n.medals ? 15 : 9);
      x = Math.max(1, Math.min(canvas.width - w - 1, x));
      y = Math.max(1, Math.min(canvas.height - h - 1, y));
      px(ctx, x, y, w, h, 'rgba(12,20,15,.85)');
      ctx.fillStyle = '#fff7d6';
      ctx.fillText(text, x + 2, y + 1);
      labelsDrawn.push({ id: n.id, text, x, y, w, h });
    });
    // signposts at the map edge name the world they lead to
    g.stubs.forEach((st) => {
      const t = byId[st.target];
      const text = (st.dir > 0 ? '' : '< ') + wName[t.world] + (st.dir > 0 ? ' >' : '');
      const w = Math.ceil(ctx.measureText(text).width) + 4, h = 10;
      const cx = (st.x - g.minX) * T + 8, cy = (st.y - g.minY) * T;
      let x = Math.round(cx - w / 2), y = cy - h - 1;
      x = Math.max(1, Math.min(canvas.width - w - 1, x));
      y = Math.max(1, Math.min(canvas.height - h - 1, y));
      px(ctx, x, y, w, h, 'rgba(58,42,20,.9)');
      ctx.fillStyle = '#fff7d6';
      ctx.fillText(text, x + 2, y + 1);
      labelsDrawn.push({ id: 'stub:' + st.target, text, x, y, w, h });
    });
    ctx.restore();
  }

  function drawVillager(g) {
    const X = (walker.x - g.minX) * T + 8, Y = (walker.y - g.minY) * T + 8;
    const moving = !!walker.wps;
    const bob = !moving && !reducedMotion() ? (Math.floor(view.t * 3) % 2) : (moving ? Math.floor(view.t * 10) % 2 : 0);
    const by = Y - 14 - (moving ? bob : bob === 1 ? 1 : 0);
    const body = 'hsl(' + hue + ',60%,52%)', dark = 'hsl(' + hue + ',55%,32%)';
    px(ctx, X - 5, Y + 3, 10, 3, 'rgba(0,0,0,.3)');
    px(ctx, X - 3, by + 15, 2, 3, dark); px(ctx, X + 1, by + 15, 2, 3, dark);
    px(ctx, X - 4, by + 8, 8, 8, body); px(ctx, X - 4, by + 14, 8, 2, dark);
    px(ctx, X - 5, by + 9, 1, 4, body); px(ctx, X + 4, by + 9, 1, 4, body);
    px(ctx, X - 4, by + 1, 8, 8, '#f1d2a8');
    px(ctx, X - 5, by, 10, 3, dark); px(ctx, X - 5, by + 2, 2, 3, dark); px(ctx, X + 3, by + 2, 2, 3, dark);
    const ex = walker.face > 0 ? 1 : -2;
    px(ctx, X + ex - 1, by + 5, 1, 2, '#1c1c1c'); px(ctx, X + ex + 2, by + 5, 1, 2, '#1c1c1c');
  }

  function dots(g) {
    let pts = null;
    if (walker.wps) pts = [{ x: walker.x, y: walker.y, world: view.world }].concat(walker.wps.slice(walker.i));
    else if (view.hover && view.hover !== hub.at && reach.has(view.hover)) {
      const r = MMMap.bfs(MAP, hub.at, view.hover, openIds);
      if (r) pts = buildWaypoints(r);
    }
    if (!pts) return;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      if (b.hop || a.world !== view.world || b.world !== view.world) continue;
      const len = Math.hypot(b.x - a.x, b.y - a.y) * T, n = Math.floor(len / 4);
      for (let k = 0; k <= n; k++) {
        const f = n ? k / n : 0;
        const x = (a.x + (b.x - a.x) * f - g.minX) * T + 7, y = (a.y + (b.y - a.y) * f - g.minY) * T + 7;
        px(ctx, x - 1, y - 1, 4, 4, '#0c140f'); px(ctx, x, y, 2, 2, '#fff7d6');
      }
    }
  }

  function draw() {
    const { cv, g } = buildBg(view.world);
    if (canvas.width !== cv.width || canvas.height !== cv.height) { canvas.width = cv.width; canvas.height = cv.height; }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(cv, 0, 0);
    drawPaths(g);
    g.stubs.forEach((s) => drawStub(g, s));
    MAP.nodes.forEach((n) => { if (n.world === view.world && shown(n.id)) drawNode(g, n); });
    dots(g);
    drawVillager(g);
    drawLabels(g);
  }

  // ---------- layout ----------
  function resize() {
    const stage = $('stage');
    const sw = stage.clientWidth, sh = stage.clientHeight;
    let g = geoFor(view.world);
    // Portrait: scale to the width, then add map rows so the canvas fills the height (no empty bands).
    const s0 = Math.min(sw / (g.cols * T), 4);
    const need = s0 > 0 && sh / sw > (g.rows / g.cols) ? Math.min(60, Math.floor(sh / (s0 * T))) : 0;
    if (need !== wantRows && (need > 0 || wantRows > 0)) {
      wantRows = need; geo = Object.create(null); bgCache = Object.create(null); g = geoFor(view.world);
    }
    let s = Math.min(sw / (g.cols * T), sh / (g.rows * T), 4);
    if (s >= 1) s = Math.floor(s * 4) / 4;
    canvas.width = g.cols * T; canvas.height = g.rows * T;
    canvas.style.width = Math.floor(g.cols * T * s) + 'px';
    canvas.style.height = Math.floor(g.rows * T * s) + 'px';
  }

  // ---------- HUD, toast, card ----------
  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('on'), 1600);
  }
  function updateHud() {
    $('hud-name').textContent = profile.name;
    const n = byId[hub.at];
    $('hud-world').textContent = wName[n.world] + ' - ' + n.name;
    $('hud-tokens').textContent = String(profile.tokens);
    $('hud-medals').textContent = String(MMMap.medalCount(E));
    $('hud-pct').textContent = String(MMMap.completion(E, VISIBLE_MAP));
  }

  // Per-game medal strip from the game's own summary key (read-only; see medals.js).
  function achievements() { try { return MMHubMedals.read(localStorage, window.MMJamSongs); } catch (e) { return MMHubMedals.read({ getItem() { return null; } }); } }
  function renderAch(id) {
    const ul = $('card-ach');
    while (ul.firstChild) ul.removeChild(ul.firstChild);
    const g = MMHubMedals.gameOfNode(id);
    const cnt = $('card-ach-n');
    ul.hidden = !g;
    if (cnt) cnt.hidden = !g;
    if (!g) return;
    const got = achievements()[g];
    if (cnt) cnt.textContent = got.length + ' of ' + MMHubMedals.GAMES[g].medals.length + ' medals';
    MMHubMedals.GAMES[g].medals.forEach((m) => {
      const li = document.createElement('li');
      const on = got.indexOf(m[0]) >= 0;
      li.className = on ? 'on' : '';
      li.dataset.medal = m[0];
      li.textContent = (on ? '[x] ' : '[ ] ') + m[1];
      ul.appendChild(li);
    });
  }

  // How a node is cleared: the game milestones (MMHubProfile.goalsFor, read-only) or a Town note. Returns the count shown.
  function renderGoals(id) {
    const ul = $('card-goals'), head = $('card-goals-n');
    while (ul.firstChild) ul.removeChild(ul.firstChild);
    let goals = [];
    if (!MMHubMedals.gameOfNode(id)) { try { goals = MMHubProfile.goalsFor(profile, id); } catch (e) { goals = []; } } // games with a medal strip show that instead
    if (!goals.length && TOWN_NODES.has(id)) goals = [{ label: 'Played in the Town: the Town marks this place on the map', done: !!(E.nodes[id] && E.nodes[id].exits.length), town: true }];
    goals.forEach((g) => {
      const li = document.createElement('li');
      li.className = g.done ? 'on' : '';
      if (g.id) li.dataset.goal = g.game + ':' + g.id;
      li.textContent = (g.done ? '[x] ' : '[ ] ') + g.label;
      ul.appendChild(li);
    });
    ul.hidden = !goals.length; head.hidden = !goals.length;
    return goals.length;
  }
  function openNode(id) {
    const n = byId[id];
    if (!n) return;
    cardFor = id;
    $('card-title').textContent = n.name;
    $('card-world').textContent = wName[n.world];
    const med = $('card-medals');
    while (med.firstChild) med.removeChild(med.firstChild);
    const st = E.nodes[id];
    let got = 0;
    if (n.medals) {
      MMMap.MEDALS.forEach((m) => {
        const d = document.createElement('span');
        const on = !!(st && st.medals[m]);
        if (on) got++;
        d.className = 'medal ' + m + (on ? ' on' : '');
        med.appendChild(d);
      });
    }
    med.hidden = !n.medals;
    renderAch(id);
    const goals = renderGoals(id);
    $('card-status').textContent = n.medals ? (got + ' of 3 medals') : (st && st.exits.length ? 'Visited' : 'Not visited yet');
    const bonus = $('card-bonus');
    if (bonus) {
      bonus.hidden = !playable(n);
      bonus.textContent = !playable(n) ? '' : n.medals
        ? (reach.has(id) ? 'Open to play any time. Medals are a bonus.' : 'Open to play any time. Walking here on the map is a bonus: earn medals to open the path.')
        : 'Open any time.';
    }
    const href = LINKS[id];
    const play = $('card-play');
    if (href) { play.setAttribute('href', href); play.hidden = false; $('card-soon').hidden = true; }
    else { play.removeAttribute('href'); play.hidden = true; $('card-soon').hidden = goals > 0; }
    $('card').hidden = false;
    if (href) play.focus(); else $('card-close').focus();
  }
  function closeCard() { $('card').hidden = true; cardFor = null; try { canvas.focus(); } catch (e) { /* ignore */ } }

  function iris(x, y, done) {
    const el = $('iris');
    el.style.setProperty('--ix', x + 'px'); el.style.setProperty('--iy', y + 'px');
    el.classList.add('on');
    const t0 = performance.now(), D = 350, R0 = Math.hypot(innerWidth, innerHeight);
    (function f(now) {
      const k = Math.min(1, (now - t0) / D);
      el.style.setProperty('--r', Math.round(R0 * (1 - k)) + 'px');
      if (k < 1) requestAnimationFrame(f); else done();
    }(t0));
  }

  $('card-play').addEventListener('click', (e) => {
    const id = cardFor, href = $('card-play').getAttribute('href');
    if (!id || !href) { e.preventDefault(); return; }
    const n = byId[id];
    if ((n.type === 'game' || n.type === 'gate') && reach.has(id)) { // visiting (after walking there) is an exit of kind "visit" (opens the next paths)
      hub.state = MMMap.unlock(MAP, hub.state, { node: id, exit: 'visit' }).state;
    }
    saveHub();
    if (reducedMotion() || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    const r = canvas.getBoundingClientRect(), g = geoFor(view.world), k = r.width / canvas.width;
    iris(r.left + ((walker.x - g.minX) * T + 8) * k, r.top + ((walker.y - g.minY) * T + 4) * k, () => { location.href = href; });
  });
  $('card-close').addEventListener('click', closeCard);
  $('open-btn').addEventListener('click', () => { if (!walker.wps) openNode(hub.at); });
  if ($('map-play')) $('map-play').addEventListener('click', () => { if (!walker.wps) openNode(hub.at); });

  // ---------- input ----------
  function canvasPoint(e) {
    const r = canvas.getBoundingClientRect();
    const g = geoFor(view.world), k = r.width / canvas.width;
    return { tx: (e.clientX - r.left) / k / T + g.minX - 0.5, ty: (e.clientY - r.top) / k / T + g.minY - 0.5, k };
  }
  function hit(e) {
    const g = geoFor(view.world), p = canvasPoint(e);
    const rad = Math.max(1.1, 24 / (T * p.k));
    let best = null, bd = rad;
    MAP.nodes.forEach((n) => {
      if (n.world !== view.world || !shown(n.id)) return;
      const d = Math.hypot(n.x - p.tx, n.y - p.ty);
      if (d < bd) { bd = d; best = n.id; }
    });
    g.stubs.forEach((s) => {
      const d = Math.hypot(s.x - p.tx, s.y - p.ty);
      if (d < bd && d < rad) { bd = d; best = s.target; }
    });
    return best;
  }
  canvas.addEventListener('click', (e) => {
    if (walker.wps || !$('card').hidden) return;
    const id = hit(e);
    if (!id) return;
    if (!reach.has(id)) {
      if (playable(byId[id])) { openNode(id); return; } // a game is always open; walking there stays a bonus
      toast('Locked - finish earlier stops first.'); return;
    }
    travel(id, true);
  });
  canvas.addEventListener('mousemove', (e) => { view.hover = hit(e); });
  canvas.addEventListener('mouseleave', () => { view.hover = null; });

  function step(dx, dy) {
    if (walker.wps) return;
    const a = byId[hub.at];
    let best = null, bs = 0.3;
    neighbors(hub.at).forEach((id) => {
      const b = byId[id];
      let vx, vy;
      if (b.world === a.world) { vx = b.x - a.x; vy = b.y - a.y; } else { vx = wIdx[b.world] > wIdx[a.world] ? 1 : -1; vy = 0; }
      const len = Math.hypot(vx, vy) || 1;
      const s = (vx * dx + vy * dy) / len;
      if (s > bs) { bs = s; best = id; }
    });
    if (best) travel(best, false); else toast('No open path that way.');
  }
  const KEYDIR = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0], W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0] };
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!$('card').hidden) { if (e.key === 'Escape') closeCard(); return; }
    // CONTROLS.md: Esc / P is Menu. With nothing else open (book, gift card, a text field) it opens the shared Menu.
    if ((e.key === 'Escape' || e.key === 'p' || e.key === 'P') && window.MMNav && MMNav.mounted && MMNav.mounted() && !MMNav.isOpen()) {
      const t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      const up = (id) => { const n = document.getElementById(id); return !!(n && !n.hidden); };
      if (!typing && !up('coll-sheet') && !up('gift-card') && !up('mmset')) { e.preventDefault(); MMNav.open(); return; }
    }
    if (homeOn()) return; // HS1: the home screen is a normal page (links / buttons); the map's keys wait for the map view
    const d = KEYDIR[e.key];
    if (d) { e.preventDefault(); step(d[0], d[1]); return; }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.tagName !== 'BUTTON') { e.preventDefault(); if (!walker.wps) openNode(hub.at); }
  });

  const homeOn = () => document.body.classList.contains('home-on');
  const pad = { dir: '', a: false, b: false, st: false };
  // Home screen with a pad: the d-pad walks the focus through the home links and footer buttons, A presses, B closes a card.
  function homeTargets() {
    return Array.prototype.filter.call(document.querySelectorAll('#home a[href], #home button, #bar a[href], #bar button'),
      (n) => !n.hidden && !n.disabled && n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden');
  }
  function homePad(dir, a, b) {
    const sheetOpen = (id) => { const n = document.getElementById(id); return !!(n && !n.hidden); };
    if (dir && dir !== pad.dir && !sheetOpen('coll-sheet') && !sheetOpen('gift-card')) {
      const f = homeTargets();
      if (f.length) {
        const i = f.indexOf(document.activeElement);
        const k = i < 0 ? 0 : (i + (dir === 'd' || dir === 'r' ? 1 : -1) + f.length) % f.length;
        try { f[k].focus(); f[k].scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignore */ }
      }
    }
    pad.dir = dir;
    if (a && !pad.a) { const n = document.activeElement; if (n && n !== document.body && n.click) n.click(); else { const p = $('home-play'); if (p) p.focus(); } }
    if (b && !pad.b) {
      if (sheetOpen('coll-sheet')) { const x = $('coll-close'); if (x) x.click(); }
      else if (sheetOpen('gift-card')) { const x = $('gift-close'); if (x) x.click(); }
    }
    pad.a = a; pad.b = b;
  }
  function pollPad() {
    let gp = null;
    try { const l = navigator.getGamepads ? navigator.getGamepads() : []; for (let i = 0; i < l.length; i++) if (l[i]) { gp = l[i]; break; } } catch (e) { return; }
    if (!gp) return;
    const bt = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    let dir = '';
    if (bt(12) || gp.axes[1] < -0.6) dir = 'u'; else if (bt(13) || gp.axes[1] > 0.6) dir = 'd';
    else if (bt(14) || gp.axes[0] < -0.6) dir = 'l'; else if (bt(15) || gp.axes[0] > 0.6) dir = 'r';
    // Start opens the shared Menu (CONTROLS.md); while the Menu or a dialog is up the pad belongs to it (MMNav polls its own).
    const st = bt(9), wasSt = pad.st; pad.st = st;
    const navOpen = !!(window.MMNav && MMNav.isOpen && MMNav.isOpen());
    const setOpen = (() => { const d = document.getElementById('mmset'); return !!(d && !d.hidden); })();
    if (navOpen || setOpen) { if (navOpen && st && !wasSt) MMNav.close(); pad.dir = dir; pad.a = bt(0); pad.b = bt(1); return; } // Start toggles the Menu
    if (st && !wasSt && window.MMNav && MMNav.open && $('card').hidden) { pad.dir = dir; pad.a = bt(0); pad.b = bt(1); MMNav.open(); return; }
    if (homeOn()) { homePad(dir, bt(0), bt(1)); return; }
    if (dir && dir !== pad.dir && $('card').hidden) step({ l: -1, r: 1 }[dir] || 0, { u: -1, d: 1 }[dir] || 0);
    pad.dir = dir;
    const a = bt(0), b = bt(1);
    if (a && !pad.a) { if ($('card').hidden) { if (!walker.wps) openNode(hub.at); } else if (!$('card-play').hidden) $('card-play').click(); }
    if (b && !pad.b && !$('card').hidden) closeCard();
    pad.a = a; pad.b = b;
  }

  // ---------- loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now; view.t += dt;
    pollPad();
    stepWalk(dt);
    draw();
    requestAnimationFrame(frame);
  }

  // ---------- NAV slice D: games strip, shared Menu, phone hint chip ----------
  (function gamesStrip() {
    const nav = $('hub-games');
    if (!nav) return;
    GAME_NODES.forEach((n) => {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.node = n.id;
      b.setAttribute('aria-label', n.name + ' (' + wName[n.world] + ')');
      const ic = document.createElement('span'); ic.className = 'g-ico'; ic.setAttribute('aria-hidden', 'true'); ic.textContent = GAME_ICON[n.id] || '';
      if (PXI && PX_OF[n.id]) PXI.apply(ic, PX_OF[n.id], 16, GAME_ICON[n.id] || ''); // cycle 0 art: pixel icon, emoji kept as hidden fallback
      b.appendChild(ic);
      b.appendChild(document.createTextNode(n.name));
      b.addEventListener('click', () => { if (!walker.wps) openNode(n.id); });
      nav.appendChild(b);
    });
  }());
  // Continue hint: the last game played (read before mount records this page). On a hub reload the last place is the
  // map itself, so the one before it is used. Hidden when there is nothing to continue or MMNav is absent.
  (function continueCard() {
    const a = $('hub-continue');
    if (!a || !window.MMNav || typeof MMNav.continueTarget !== 'function') return;
    let t = null;
    try {
      const st = MMNav.state();
      t = MMNav.continueTarget(st, 'map') || (st.prev ? MMNav.continueTarget({ v: 1, last: st.prev }, 'map') : null);
    } catch (e) { t = null; }
    const href = t && MMNav.urlFor(t.url, 'game/hub/index.html');
    if (!t || !href || t.id === 'town') return; // the Town has its own button in the bar
    a.setAttribute('href', href);
    a.dataset.place = t.id;
    a.setAttribute('aria-label', t.label);
    a.querySelector('.c-ico').textContent = t.icon || '';
    if (PXI && PXI.has(t.id)) PXI.apply(a.querySelector('.c-ico'), t.id, 16, t.icon || '');
    a.querySelector('.c-txt').textContent = t.label;
    a.hidden = false;
  }());
  if (window.MMNav) {
    try { MMNav.mount({ page: 'map', avoid: '#hud .hud-main' }); } catch (e) { /* the map works without it */ }
  }
  (function hintChip() {
    const chip = $('hint-chip'), x = $('hint-chip-x'), K = 'pixeltown-hub-hint-v1';
    if (!chip || !x) return;
    if (readKey(K) !== '1') chip.hidden = false;
    x.addEventListener('click', () => { chip.hidden = true; try { localStorage.setItem(K, '1'); } catch (e) { /* storage blocked */ } });
  }());

  window.addEventListener('resize', resize);
  try { if (window.ResizeObserver) new ResizeObserver(() => resize()).observe(document.getElementById('stage')); } catch (e) { /* older browsers: window resize only */ } // cards above the map load after the first layout
  recompute();
  placeAt(hub.at);
  saveHub(); // writes the sanitised state back (drops unknown keys, repairs a corrupt value)
  updateHud();
  resize();
  requestAnimationFrame(frame);

  // Test hook (read-only view of the state; no write paths).
  window.__hub = {
    get at() { return hub.at; },
    get world() { return view.world; },
    get walking() { return !!walker.wps; },
    get reduced() { return reducedMotion(); },
    isReachable: (id) => reach.has(id),
    isShown: (id) => shown(id),
    progress: () => ({ medals: MMMap.medalCount(E), pct: MMMap.completion(E, VISIBLE_MAP), tokens: profile.tokens, open: openIds.slice(), comets: E.comets.slice(),
      nodes: JSON.parse(JSON.stringify(E.nodes)) }),
    isPlayable: (id) => playable(byId[id]),
    labels: () => labelsDrawn.map((l) => Object.assign({}, l)),
    gameNodes: () => GAME_NODES.map((n) => n.id),
    links: () => Object.assign({}, LINKS),
    achievements,
    nodeClient(id) {
      const n = byId[id], g = geoFor(n.world), r = canvas.getBoundingClientRect(), k = r.width / canvas.width;
      return { x: r.left + ((n.x - g.minX) * T + 8) * k, y: r.top + ((n.y - g.minY) * T + 8) * k };
    },
  };
}());
