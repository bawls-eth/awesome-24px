// MMHomestead: the LOCAL-ONLY home island layer (BIOME-ARCH-PLAN B10, BIOME-WORLD-CONCEPT "Home grows from away").
// Decor and a tame pen on a 20x20 grid of Hearth Isle tiles, a seeded starter layout, pick-up / place / undo, and the cozy
// daily-free gather spots (one pick per spot per day, per the pack's resources table) with a small collection log.
// It mutates plain objects that live inside the archipelago save (`pixeltown-archipelago-v1`, written by MMIsles.write):
//   save.home = { grid:[[x,y,kind]...], stable, inv:{kind:n}, seeded:0|1 }   save.gather = { day, got:{isle:[idx]}, log:{res:n} }
// It NEVER uses the Town building code, the Town 'blocks' ref, Firebase or the network, and never touches `pixeltown-save-v1`.
// Pure: no DOM, no storage, no unseeded randomness (MMRng). UMD: browser global MMHomestead, or require().
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rng.js'));
  else root.MMHomestead = factory(root.MMRng);
}(typeof self !== 'undefined' ? self : this, function (MMRng) {
  'use strict';
  const GRID_W = 20;                 // matches MMIsles GRID_W (cells 0..19)
  const MAX_ITEMS = 120;             // well under the MMIsles 400-cell cap
  const MAX_INV = 99;
  const MAX_SPOTS = 8;               // gather spots per island per day
  const MAX_GOT = 16;
  const MAX_LOG = 40;
  const PEN_GUESTS = 3;
  const UNDO_MS = 10000;
  const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
  const RES_RE = /^[a-z][a-z0-9_]{0,23}$/;
  const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

  // the decor catalogue (code-drawn on the page; names are shown with textContent)
  const KINDS = {
    flowerbed: { name: 'Flower bed', col: '#e86a8a', alt: '#4f9a3f' },
    lantern: { name: 'Lantern', col: '#f2d55c', alt: '#5a4a3a' },
    bench: { name: 'Bench', col: '#a0703a', alt: '#5a3a22' },
    fence: { name: 'Fence', col: '#c8a070', alt: '#7a5a3a' },
    birdbath: { name: 'Bird bath', col: '#9ad0e8', alt: '#8a8a8a' },
    pen: { name: 'Tame pen', col: '#b08050', alt: '#6a8a3a', pen: true },
  };
  const ORDER = ['flowerbed', 'lantern', 'bench', 'fence', 'birdbath', 'pen'];
  const STARTER_INV = { flowerbed: 4, lantern: 2, bench: 1, fence: 8, birdbath: 1, pen: 1 };
  const STARTER_LAYOUT = ['pen', 'flowerbed', 'flowerbed', 'lantern', 'bench'];

  const intIn = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi);
  function defaults() { return { grid: [], inv: Object.assign({}, STARTER_INV), seeded: 0 }; }

  // clean(home): the decor fields of save.home (other fields such as stable are left to MMIsles). Corrupt -> defaults.
  function clean(raw) {
    const out = defaults();
    if (!isObj(raw)) return out;
    const seen = Object.create(null);
    const grid = [];
    (Array.isArray(raw.grid) ? raw.grid.slice(0, 800) : []).forEach((c) => {
      if (grid.length >= MAX_ITEMS || !Array.isArray(c)) return;
      const x = c[0], y = c[1], k = c[2];
      if (!intIn(x, 0, GRID_W - 1) || !intIn(y, 0, GRID_W - 1) || typeof k !== 'string' || !own(KINDS, k)) return;
      if (seen[x + ',' + y]) return;
      seen[x + ',' + y] = 1; grid.push([x, y, k]);
    });
    out.grid = grid;
    out.seeded = raw.seeded === 1 || raw.seeded === true ? 1 : 0;
    if (isObj(raw.inv)) {
      const inv = {};
      ORDER.forEach((k) => { const n = raw.inv[k]; inv[k] = Number.isInteger(n) ? Math.max(0, Math.min(MAX_INV, n)) : 0; });
      out.inv = inv;
    } else if (out.seeded) out.inv = {};
    ORDER.forEach((k) => { if (!own(out.inv, k)) out.inv[k] = 0; });
    return out;
  }
  // write the decor fields back into a save.home object (keeps its other fields)
  function apply(home, cleaned) { home.grid = cleaned.grid; home.inv = cleaned.inv; home.seeded = cleaned.seeded; return home; }
  function ensure(home) { return apply(home, clean(home)); }

  const itemAt = (home, x, y) => { const g = home && Array.isArray(home.grid) ? home.grid : []; for (let i = 0; i < g.length; i++) if (g[i][0] === x && g[i][1] === y) return g[i][2]; return null; };
  const count = (home, kind) => (home && Array.isArray(home.grid) ? home.grid.filter((c) => !kind || c[2] === kind).length : 0);
  const pens = (home) => (home && Array.isArray(home.grid) ? home.grid.filter((c) => c[2] === 'pen').map((c) => ({ x: c[0], y: c[1] })) : []);

  // free(x, y) -> true when grid cell (x, y) maps to open land on the page (walkable, not water). Optional: without it any cell is free.
  function canPlace(home, x, y, kind, free) {
    if (!own(KINDS, kind)) return 'kind';
    if (!intIn(x, 0, GRID_W - 1) || !intIn(y, 0, GRID_W - 1)) return 'outside';
    if (itemAt(home, x, y)) return 'taken';
    if (typeof free === 'function' && !free(x, y)) return 'ground';
    if (!((home.inv && home.inv[kind]) > 0)) return 'none';
    if (count(home) >= MAX_ITEMS) return 'full';
    return '';
  }
  // place / pickUp return {ok, why, act}; act = {op, x, y, kind, at} for undo (within 10 s)
  function place(home, x, y, kind, free, nowMs) {
    ensure(home);
    const why = canPlace(home, x, y, kind, free);
    if (why) return { ok: false, why: why };
    home.inv[kind] -= 1;
    home.grid.push([x, y, kind]);
    return { ok: true, why: '', act: { op: 'place', x: x, y: y, kind: kind, at: Number(nowMs) || 0 } };
  }
  function pickUp(home, x, y, nowMs) {
    ensure(home);
    const i = home.grid.findIndex((c) => c[0] === x && c[1] === y);
    if (i < 0) return { ok: false, why: 'empty' };
    const kind = home.grid[i][2];
    home.grid.splice(i, 1);
    home.inv[kind] = Math.min(MAX_INV, (home.inv[kind] | 0) + 1);
    return { ok: true, why: '', kind: kind, act: { op: 'pick', x: x, y: y, kind: kind, at: Number(nowMs) || 0 } };
  }
  function undo(home, act, nowMs) {
    if (!isObj(act) || !own(KINDS, act.kind)) return false;
    if (Number.isFinite(nowMs) && Number.isFinite(act.at) && nowMs - act.at > UNDO_MS) return false;
    ensure(home);
    if (act.op === 'place') { const i = home.grid.findIndex((c) => c[0] === act.x && c[1] === act.y && c[2] === act.kind); if (i < 0) return false; home.grid.splice(i, 1); home.inv[act.kind] = Math.min(MAX_INV, (home.inv[act.kind] | 0) + 1); return true; }
    if (act.op === 'pick') { if (itemAt(home, act.x, act.y) || !(home.inv[act.kind] > 0)) return false; home.inv[act.kind] -= 1; home.grid.push([act.x, act.y, act.kind]); return true; }
    return false;
  }

  // The seeded starter layout: on the first visit the pen and a few decor items are set out on free cells near the grid centre.
  // Same seed + same free() -> the same cells. Does nothing once home.seeded is 1 (picking everything up keeps it empty).
  function layoutCells(seed, free) {
    const rng = MMRng.create('homestead|layout|' + String(seed));
    const cells = [];
    for (let y = 4; y < GRID_W - 4; y++) for (let x = 4; x < GRID_W - 4; x++) if (typeof free !== 'function' || free(x, y)) cells.push([x, y]);
    return rng.shuffle(cells);
  }
  function seedLayout(home, seed, free) {
    ensure(home);
    if (home.seeded) return [];
    const cells = layoutCells(seed, free), placed = [];
    for (let i = 0; i < STARTER_LAYOUT.length && i < cells.length; i++) {
      const r = place(home, cells[i][0], cells[i][1], STARTER_LAYOUT[i], free, 0);
      if (r.ok) placed.push([cells[i][0], cells[i][1], STARTER_LAYOUT[i]]);
    }
    home.seeded = 1;
    return placed;
  }
  // grid origin on the island: a 20x20 block centred between the spawn pad and the island centre, clamped into the map
  function origin(spawn, center, w, h) {
    const sx = spawn && Number.isFinite(spawn.x) ? spawn.x : w / 2, sy = spawn && Number.isFinite(spawn.y) ? spawn.y : h / 2;
    const cx = center && Number.isFinite(center.x) ? center.x : w / 2, cy = center && Number.isFinite(center.y) ? center.y : h / 2;
    const mx = Math.round(sx + (cx - sx) * 0.55), my = Math.round(sy + (cy - sy) * 0.55);
    return { x: Math.max(0, Math.min(w - GRID_W, mx - GRID_W / 2)), y: Math.max(0, Math.min(h - GRID_W, my - GRID_W / 2)) };
  }
  // tames that rest in the pens: roster entries that are neither in the party nor the mount, PEN_GUESTS per pen
  function penGuests(home, tames) {
    const n = pens(home).length * PEN_GUESTS;
    if (!n || !isObj(tames) || !Array.isArray(tames.roster)) return [];
    const party = Array.isArray(tames.party) ? tames.party : [];
    return tames.roster.filter((t) => t && typeof t.id === 'string' && party.indexOf(t.id) < 0 && t.id !== tames.mount).slice(0, n);
  }

  // ---- cozy gathering: daily-free spots ----
  // nodes = world.resources [{x,y,kind}]. Returns up to MAX_SPOTS {idx, x, y, kind}, seeded by key (isle|seed) and day; every resource
  // kind of the pack is represented first, then the rest are filled at random.
  function dailySpots(nodes, key, day, n) {
    const list = Array.isArray(nodes) ? nodes : [];
    const want = Math.max(0, Math.min(MAX_SPOTS, n === undefined ? MAX_SPOTS : n | 0));
    if (!list.length || !want) return [];
    const rng = MMRng.create('homestead|gather|' + String(key) + '|' + (DAY_RE.test(day) ? day : ''));
    const idx = rng.shuffle(list.map((_, i) => i));
    const out = [], kinds = Object.create(null);
    idx.forEach((i) => { const r = list[i]; if (out.length < want && r && !kinds[r.kind]) { kinds[r.kind] = 1; out.push(i); } });
    idx.forEach((i) => { if (out.length < want && out.indexOf(i) < 0) out.push(i); });
    return out.sort((a, b) => a - b).map((i) => ({ idx: i, x: list[i].x, y: list[i].y, kind: list[i].kind }));
  }
  function cleanGather(raw) {
    const out = { day: '', got: {}, log: {} };
    if (!isObj(raw)) return out;
    out.day = typeof raw.day === 'string' && DAY_RE.test(raw.day) ? raw.day : '';
    if (isObj(raw.got)) Object.keys(raw.got).slice(0, 8).forEach((k) => {
      if (!RES_RE.test(k) || !Array.isArray(raw.got[k])) return;
      const a = [];
      raw.got[k].slice(0, MAX_GOT * 2).forEach((i) => { if (a.length < MAX_GOT && intIn(i, 0, 99999) && a.indexOf(i) < 0) a.push(i); });
      out.got[k] = a;
    });
    if (isObj(raw.log)) Object.keys(raw.log).slice(0, MAX_LOG * 2).forEach((k) => {
      if (Object.keys(out.log).length >= MAX_LOG || !RES_RE.test(k) || k === '__proto__' || k === 'constructor' || k === 'prototype') return;
      const n = raw.log[k];
      if (Number.isInteger(n) && n > 0) out.log[k] = Math.min(99999, n);
    });
    return out;
  }
  // a new day frees every spot again (nothing is lost, nothing piles up)
  function rollDay(gather, day) {
    if (!DAY_RE.test(day)) return gather;
    if (gather.day !== day) { gather.day = day; gather.got = {}; }
    return gather;
  }
  const taken = (gather, isle, idx) => !!(gather && isObj(gather.got) && Array.isArray(gather.got[isle]) && gather.got[isle].indexOf(idx) >= 0);
  // gather(g, isle, spot, day) -> {ok, why, kind, total}. Mutates g (a cleaned gather object).
  function gather(g, isle, spot, day) {
    if (!isObj(g) || !RES_RE.test(String(isle)) || !spot || !intIn(spot.idx, 0, 99999) || !RES_RE.test(String(spot.kind))) return { ok: false, why: 'bad' };
    rollDay(g, day);
    if (!isObj(g.got)) g.got = {};
    if (!isObj(g.log)) g.log = {};
    if (taken(g, isle, spot.idx)) return { ok: false, why: 'today' };
    if (!Array.isArray(g.got[isle])) g.got[isle] = [];
    if (g.got[isle].length >= MAX_GOT) return { ok: false, why: 'today' };
    if (!own(g.log, spot.kind) && Object.keys(g.log).length >= MAX_LOG) return { ok: false, why: 'full' };
    g.got[isle].push(spot.idx);
    g.log[spot.kind] = Math.min(99999, (g.log[spot.kind] | 0) + 1);
    return { ok: true, why: '', kind: spot.kind, total: g.log[spot.kind] };
  }
  const resName = (id) => String(id || '').replace(/_/g, ' ');

  return Object.freeze({ GRID_W: GRID_W, MAX_ITEMS: MAX_ITEMS, MAX_SPOTS: MAX_SPOTS, PEN_GUESTS: PEN_GUESTS, UNDO_MS: UNDO_MS, KINDS: KINDS, ORDER: ORDER,
    STARTER_INV: STARTER_INV, STARTER_LAYOUT: STARTER_LAYOUT, defaults: defaults, clean: clean, apply: apply, ensure: ensure, itemAt: itemAt, count: count,
    pens: pens, canPlace: canPlace, place: place, pickUp: pickUp, undo: undo, layoutCells: layoutCells, seedLayout: seedLayout, origin: origin,
    penGuests: penGuests, dailySpots: dailySpots, cleanGather: cleanGather, rollDay: rollDay, taken: taken, gather: gather, resName: resName });
}));
