// Realm World (unified Realm slices 5-7): the big scrolling overworld on the standalone Mad Maze page (?mode=world[&seed=N], or ?world=1).
// A controller that drives RealmArena from outside, like dungeon.js: it generates the island with MMOverworld, installs tile collision and
// the camera through arena.setWorld, draws the terrain in code into cached 512x512 chunk canvases (16x16 tiles, LRU), shows a zone HUD and
// a minimap, and saves to its OWN additive key `pixeltown-realm-v1` (never touches pixeltown-save-v1's format).
// Needs: MMRng, MMOverworld, MMZones, realm.js. Optional: MMArt (terrain tiles `tile_<terrain>_a..d` from INDEX.json, code fallback).
(function () {
  'use strict';
  const SAVE_KEY = 'pixeltown-realm-v1';
  const TILE = 32; const CH = 16; const CPX = TILE * CH; const MAX_CHUNKS = 24;
  const SEED_RE = /^[A-Za-z0-9_-]{1,24}$/;
  const AT_RE = /^(\d{1,4}),(\d{1,4})$/;

  // ---------- code palette per terrain: base, two noise shades, edge line ----------
  const PAL = {
    deep_water: ['#1d3f7a', '#1a386f', '#24498a', '#132a55'], shallow_water: ['#3f7fc2', '#3874b4', '#4c8dd0', '#2c5f99'],
    sand: ['#e8d7a1', '#dccb8f', '#f1e2b3', '#b9a676'], wet_sand: ['#c9b27a', '#bca56d', '#d4be88', '#9a8658'],
    grass: ['#5fae4e', '#55a145', '#6bba5a', '#3f7f33'], tall_grass: ['#4c9a3e', '#438c36', '#58a749', '#336f2a'],
    dirt_road: ['#a07a4c', '#936f43', '#ad8757', '#73552f'], flower_meadow: ['#6fbf5a', '#e58bc0', '#f2d55c', '#4f8f3f'],
    highland_rock: ['#8b8a84', '#7f7e78', '#98978f', '#5f5e59'], gravel: ['#9c958a', '#8f887e', '#a9a296', '#706a61'],
    dry_grass: ['#b9a85a', '#ad9c50', '#c5b467', '#867838'], snow: ['#e8eef4', '#dbe3eb', '#f5f8fb', '#aab6c4'],
    stone_road: ['#8a8794', '#7e7b88', '#96939f', '#5d5a66'], cracked_stone: ['#6e6676', '#625a6a', '#7b7383', '#47404f'],
    godland_ash: ['#4a4450', '#403a46', '#55505b', '#2d2832'], blood_ruins: ['#6a2a32', '#5e242c', '#78333b', '#431a20'],
    dark_grass: ['#2f5a34', '#294f2e', '#37653b', '#1d3a21'], lava_rock: ['#3a2a2a', '#ff7a2a', '#2e2020', '#1e1414'],
  };
  const BIOME_COL = { warren: '#a98bff', bramble: '#7ee787', meadow: '#ffd45a', crypt: '#7fd0ff' };
  const BIOME_NAME = { warren: 'Warren', bramble: 'Bramble', meadow: 'Meadow', crypt: 'Crypt' };

  function h2(x, y, s) { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

  // ---------- save (additive key, every field sanitised; a corrupt value recovers to defaults) ----------
  function cleanSeed(v) {
    if (typeof v !== 'string' && typeof v !== 'number') return null;
    const s = String(v).trim();
    if (/^\d{1,15}$/.test(s)) return String(Math.min(Number(s), 2147483647)); // numeric seeds are clamped to int32
    return SEED_RE.test(s) ? s : null;
  }
  function cleanSave(raw) {
    let o = raw;
    if (typeof o === 'string') { try { o = JSON.parse(o); } catch (e) { o = null; } }
    if (!o || typeof o !== 'object' || Array.isArray(o)) o = {};
    const out = {};
    Object.keys(o).forEach((k) => { if (/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(k) && !/^(v|seed|version|pos|stats|returnTo|evT|evDone|finds|discovered|shrineAt|chests)$/.test(k)) out[k] = o[k]; }); // keep unknown (future) keys
    out.v = 1;
    out.seed = cleanSeed(o.seed);
    out.version = Number.isInteger(o.version) && o.version > 0 && o.version < 1000 ? o.version : 0;
    const p = o.pos && typeof o.pos === 'object' ? o.pos : null;
    out.pos = p && Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.y >= 0 && p.x < 4096 && p.y < 4096 ? { x: p.x, y: p.y } : null;
    const st = o.stats && typeof o.stats === 'object' ? o.stats : {};
    const n = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.min(Math.floor(Number(v)), 9999999) : 0);
    out.stats = { kills: n(st.kills), bossKills: n(st.bossKills), portals: n(st.portals), events: n(st.events), eventWins: n(st.eventWins) };
    // world events (additive): the event clock (s) and the ids of events already finished on it, so a reload never replays them
    out.evT = Number.isFinite(Number(o.evT)) && Number(o.evT) > 0 ? Math.min(Math.floor(Number(o.evT)), 1e9) : 0;
    out.evDone = (Array.isArray(o.evDone) ? o.evDone : []).filter((id) => typeof id === 'string' && /^ev:\d{1,9}:[1-3]$/.test(id)).slice(-12);
    // minimap fog (additive): base64 bitset of discovered 8x8-tile cells; absent or corrupt -> fully fogged (key left out)
    // world sites (additive): shrine id -> event-clock ms of last use, and the camp ids whose chest was opened
    const sa = {}; if (o.shrineAt && typeof o.shrineAt === 'object' && !Array.isArray(o.shrineAt)) Object.keys(o.shrineAt).slice(0, 64).forEach((k) => { const v = o.shrineAt[k]; if (/^shrine_\d_\d{1,3}$/.test(k) && Number.isFinite(v) && v > 0 && v < 1e12) sa[k] = Math.floor(v); });
    if (Object.keys(sa).length) out.shrineAt = sa;
    const ch = (Array.isArray(o.chests) ? o.chests : []).filter((id, i, a) => typeof id === 'string' && /^camp_\d_\d{1,3}$/.test(id) && a.indexOf(id) === i).slice(0, 64);
    if (ch.length) out.chests = ch;
    const disc = window.MMFog ? MMFog.clean(o.discovered) : '';
    if (disc) out.discovered = disc;
    const r = o.returnTo && typeof o.returnTo === 'object' ? o.returnTo : null;
    if (o.finds !== undefined) out.finds = window.MMStash ? MMStash.cleanFinds(o.finds) : o.finds; // owned by MMStash (Lantern payout)
    out.returnTo = r && Number.isInteger(r.x) && Number.isInteger(r.y) && r.x >= 0 && r.y >= 0 && r.x < 4096 && r.y < 4096 && cleanSeed(r.seed) ? { x: r.x, y: r.y, seed: cleanSeed(r.seed) } : null;
    return out;
  }
  function readSave() { try { return cleanSave(localStorage.getItem(SAVE_KEY)); } catch (e) { return cleanSave(null); } }
  function writeSave(s) {
    try {
      const c = cleanSave(s); // `finds` belongs to MMStash: always keep what storage holds (never an older in-memory copy)
      let cur = null; try { cur = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { cur = null; }
      if (cur && typeof cur === 'object' && cur.finds !== undefined) c.finds = window.MMStash ? MMStash.cleanFinds(cur.finds) : cur.finds; else delete c.finds;
      localStorage.setItem(SAVE_KEY, JSON.stringify(c)); return true;
    } catch (e) { return false; }
  }

  function create(arena, opts) {
    opts = opts || {};
    const O = window.MMOverworld; const Z = window.MMZones;
    const T = O.TERRAIN; const TN = O.TERRAIN_NAMES;
    const save = readSave();
    let seed = cleanSeed(opts.seed) || save.seed;
    if (!seed) seed = String(Math.floor(Math.random() * 900000) + 100000); // first visit: a fresh island, remembered below
    if (save.seed !== seed) { save.pos = null; save.returnTo = null; delete save.discovered; delete save.shrineAt; delete save.chests; } // a new island starts fully fogged (one seed's discovery is kept at a time)
    save.seed = seed;
    const t0 = performance.now();
    const world = O.generate(seed);
    const genMs = performance.now() - t0;
    save.version = world.version || O.VERSION;
    writeSave(save);
    const WW = world.w * TILE; const WH = world.h * TILE;
    const ww = world.w; const wh = world.h;
    const terrain = world.terrain; const solid = world.solid;

    // ---------- collision: every solid tile blocks walking; deep water lets bolts fly over it ----------
    const moveScaleAt = (x, y) => {
      const tx = Math.floor(x / TILE); const ty = Math.floor(y / TILE);
      return tx >= 0 && ty >= 0 && tx < ww && ty < wh && terrain[ty * ww + tx] === T.shallow_water ? 0.7 : 1;
    };
    const solidAt = (x, y) => { const tx = Math.floor(x / TILE); const ty = Math.floor(y / TILE); return tx < 0 || ty < 0 || tx >= ww || ty >= wh || solid[ty * ww + tx] === 1; };
    const shotSolidAt = (x, y) => { const tx = Math.floor(x / TILE); const ty = Math.floor(y / TILE); if (tx < 0 || ty < 0 || tx >= ww || ty >= wh) return true; const i = ty * ww + tx; return solid[i] === 1 && terrain[i] !== T.deep_water; };
    const tileFree = (tx, ty) => tx >= 0 && ty >= 0 && tx < ww && ty < wh && solid[ty * ww + tx] === 0;
    function nearestFree(tx, ty, r) {
      if (tileFree(tx, ty)) return { x: tx, y: ty };
      for (let d = 1; d <= r; d++) for (let oy = -d; oy <= d; oy++) for (let ox = -d; ox <= d; ox++) if ((Math.abs(ox) === d || Math.abs(oy) === d) && tileFree(tx + ox, ty + oy)) return { x: tx + ox, y: ty + oy };
      return null;
    }

    // ---------- props by chunk (built once) ----------
    const ccols = Math.ceil(ww / CH); const crows = Math.ceil(wh / CH);
    const propsBy = new Array(ccols * crows);
    world.props.forEach((p) => { if (/^portal_/.test(p.kind)) return; const k = Math.floor(p.y / CH) * ccols + Math.floor(p.x / CH); (propsBy[k] = propsBy[k] || []).push(p); });
    world.structures.forEach((s) => { if (s.kind !== 'event_site') return; const k = Math.floor(s.y / CH) * ccols + Math.floor(s.x / CH); (propsBy[k] = propsBy[k] || []).push({ x: s.x, y: s.y, kind: 'event_ring' }); });

    // ---------- optional terrain art: tile_<terrain>_a..d from any registered batch (none delivered yet: code fallback) ----------
    const tileArt = Object.create(null); // terrain id -> fixed a-d slots
    const edgeArt = Object.create(null); // terrain id -> blend id -> mask slots
    let artTiles = 0;
    function loadTileArt(root) {
      if (!root || typeof fetch !== 'function') return Promise.resolve(0);
      const join = (a, b) => a.replace(/\/+$/, '') + '/' + String(b).replace(/^\/+/, '');
      const okPath = (p) => typeof p === 'string' && /^[A-Za-z0-9_][A-Za-z0-9_.\/-]*\.png$/.test(p) && p.indexOf('..') < 0;
      return fetch(join(root, 'INDEX.json')).then((r) => (r.ok ? r.json() : null)).then((idx) => {
        const batches = idx && Array.isArray(idx.batches) ? idx.batches : [];
        return Promise.all(batches.map((b) => {
          const id = b && typeof b.path === 'string' ? b.path.replace(/\/+$/, '').split('/').pop() : '';
          if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(id)) return null;
          return fetch(join(join(root, id), 'manifest.json')).then((r) => (r.ok ? r.json() : null)).then((m) => {
            const assets = m && Array.isArray(m.assets) ? m.assets : [];
            return Promise.all(assets.map((a) => {
              const mt = a && typeof a.id === 'string' ? /^tile_([a-z_]+)_([a-d]|edge_\d{2})$/.exec(a.id) : null;
              if (!mt || !Object.prototype.hasOwnProperty.call(T, mt[1]) || !okPath(a.path)) return null;
              const tid = T[mt[1]];
              const variant = mt[2].length === 1;
              const slot = variant ? mt[2].charCodeAt(0) - 97 : Number(mt[2].slice(5));
              if (!variant && (slot >= 15 || slot !== a.edge_mask || a.blend === mt[1] ||
                !Object.prototype.hasOwnProperty.call(T, a.blend))) return null;
              return new Promise((res) => {
                const img = new Image();
                img.onload = () => {
                  if (img.naturalWidth === TILE && img.naturalHeight === TILE) {
                    const banks = variant ? tileArt : (edgeArt[tid] ||= Object.create(null));
                    const bank = (banks[variant ? tid : T[a.blend]] ||= []);
                    if (!bank[slot]) artTiles++;
                    bank[slot] = img;
                  }
                  res();
                };
                img.onerror = () => res();
                img.src = join(join(root, id), a.path);
              });
            }));
          }).catch(() => null);
        }));
      }).then(() => { if (artTiles) dropChunks(); return artTiles; }).catch(() => 0);
    }

    function transitionAt(x, y, t) {
      const blends = edgeArt[t];
      if (!blends || x === 0 || y === 0 || x === ww - 1 || y === wh - 1) return null;
      const i = y * ww + x;
      const neighbours = [terrain[i - ww], terrain[i + 1], terrain[i + ww], terrain[i - 1]];
      let mask = 0;
      let blend = null;
      for (let dir = 0; dir < neighbours.length; dir++) {
        const other = neighbours[dir];
        if (other === t) mask |= 1 << dir;
        else if (blend === null) blend = other;
        else if (blend !== other) return null;
      }
      return blend === null ? null : blends[blend]?.[mask] || null;
    }

    // ---------- chunk renderer: 16x16 tiles into a cached 512x512 canvas, LRU-evicted (max MAX_CHUNKS) ----------
    const chunks = new Map(); // key -> {cv, water, used, cx, cy}
    let frameNo = 0; let chunkBuilds = 0;
    function dropChunks() { chunks.clear(); }
    function rect(g, c, x, y, w, h) { g.fillStyle = c; g.fillRect(x, y, w, h); }
    function drawProp(g, kind, x, y, sd) { // x, y = tile top-left inside the chunk canvas
      const cx = x + 16; const cy = y + 16;
      switch (kind) {
        case 'tree': rect(g, '#5b3d22', cx - 2, cy + 2, 5, 10); g.fillStyle = '#245f28'; g.beginPath(); g.arc(cx, cy - 2, 11, 0, Math.PI * 2); g.fill(); g.fillStyle = '#3f8f3c'; g.beginPath(); g.arc(cx - 3, cy - 5, 5, 0, Math.PI * 2); g.fill(); break;
        case 'pine': g.fillStyle = '#1f4f33'; g.beginPath(); g.moveTo(cx, cy - 13); g.lineTo(cx + 10, cy + 8); g.lineTo(cx - 10, cy + 8); g.closePath(); g.fill(); rect(g, '#f4f8fb', cx - 3, cy - 10, 6, 3); rect(g, '#4a3220', cx - 2, cy + 8, 4, 5); break;
        case 'bush': g.fillStyle = '#2f7a2e'; g.beginPath(); g.arc(cx, cy + 2, 8, 0, Math.PI * 2); g.fill(); rect(g, '#d94b63', cx - 3, cy, 2, 2); rect(g, '#d94b63', cx + 3, cy + 3, 2, 2); break;
        case 'flower': rect(g, '#f7a8d0', cx - 6, cy - 2, 3, 3); rect(g, '#fff07a', cx + 3, cy + 2, 3, 3); rect(g, '#c9a7ff', cx - 1, cy + 6, 3, 3); break;
        case 'shell': g.strokeStyle = '#fff6e6'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy + 4, 4, Math.PI, 0); g.stroke(); break;
        case 'rock': g.fillStyle = '#5f5e59'; g.beginPath(); g.ellipse(cx, cy + 4, 10, 7, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = '#a3a29b'; g.beginPath(); g.ellipse(cx - 2, cy + 1, 6, 4, 0, 0, Math.PI * 2); g.fill(); break;
        case 'dead_bush': g.strokeStyle = '#6e5530'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx, cy + 8); g.lineTo(cx - 6, cy - 2); g.moveTo(cx, cy + 8); g.lineTo(cx + 5, cy - 3); g.moveTo(cx, cy + 8); g.lineTo(cx, cy - 5); g.stroke(); break;
        case 'dead_tree': g.strokeStyle = '#2a2022'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx, cy + 12); g.lineTo(cx, cy - 8); g.moveTo(cx, cy - 2); g.lineTo(cx - 8, cy - 9); g.moveTo(cx, cy + 2); g.lineTo(cx + 8, cy - 6); g.stroke(); break;
        case 'bones': g.strokeStyle = '#eee6cf'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx - 6, cy - 2); g.lineTo(cx + 6, cy + 6); g.moveTo(cx + 6, cy - 2); g.lineTo(cx - 6, cy + 6); g.stroke(); break;
        case 'ember_vent': g.fillStyle = '#1a1010'; g.beginPath(); g.arc(cx, cy, 8, 0, Math.PI * 2); g.fill(); g.fillStyle = '#ff7a2a'; g.beginPath(); g.arc(cx, cy, 4, 0, Math.PI * 2); g.fill(); break;
        case 'campfire': rect(g, '#5b3d22', cx - 8, cy + 4, 16, 3); rect(g, '#5b3d22', cx - 3, cy + 1, 6, 8); g.fillStyle = '#ff9a2a'; g.beginPath(); g.moveTo(cx, cy - 8); g.lineTo(cx + 5, cy + 3); g.lineTo(cx - 5, cy + 3); g.closePath(); g.fill(); rect(g, '#ffe27a', cx - 1, cy - 2, 3, 4); break;
        case 'tent': g.fillStyle = '#c9a46a'; g.beginPath(); g.moveTo(cx, cy - 12); g.lineTo(cx + 13, cy + 10); g.lineTo(cx - 13, cy + 10); g.closePath(); g.fill(); g.fillStyle = '#6b4a2a'; g.beginPath(); g.moveTo(cx, cy - 2); g.lineTo(cx + 4, cy + 10); g.lineTo(cx - 4, cy + 10); g.closePath(); g.fill(); break;
        case 'gravestone': rect(g, '#3a3640', cx - 6, cy - 6, 12, 15); rect(g, '#8d8896', cx - 5, cy - 8, 10, 15); rect(g, '#5d5966', cx - 1, cy - 5, 2, 7); rect(g, '#5d5966', cx - 3, cy - 3, 6, 2); break;
        case 'tower': rect(g, '#4d4858', x, y, 64, 64); rect(g, '#6e6878', x + 4, y + 4, 56, 52); for (let k = 0; k < 4; k++) rect(g, '#4d4858', x + 6 + k * 14, y + 4, 8, 8); rect(g, '#2a2632', x + 26, y + 34, 12, 18); break;
        case 'ruin_pillar': rect(g, '#4d4858', cx - 6, cy - 12, 12, 24); rect(g, '#8a8496', cx - 5, cy - 13, 10, 22); rect(g, '#a8a2b4', cx - 7, cy - 14, 14, 4); break;
        case 'shrine': g.fillStyle = 'rgba(201,167,255,0.35)'; g.beginPath(); g.arc(cx, cy, 14, 0, Math.PI * 2); g.fill(); rect(g, '#5d5966', cx - 7, cy - 4, 14, 12); rect(g, '#c9a7ff', cx - 3, cy - 12, 6, 9); break;
        case 'boss_altar': g.fillStyle = '#2a1d24'; g.beginPath(); g.arc(cx, cy, 15, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#d94b4b'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, 11, 0, Math.PI * 2); g.stroke(); rect(g, '#d94b4b', cx - 1, cy - 7, 3, 14); rect(g, '#d94b4b', cx - 6, cy - 1, 13, 3); break;
        case 'event_ring': g.strokeStyle = 'rgba(255,226,122,0.55)'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, 70, 0, Math.PI * 2); g.stroke(); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; rect(g, '#8d8896', cx + Math.cos(a) * 70 - 4, cy + Math.sin(a) * 70 - 4, 8, 8); } break;
        default: if (sd) rect(g, '#000', cx - 1, cy - 1, 2, 2);
      }
    }
    function buildChunk(cx, cy) {
      chunkBuilds++;
      const cv = document.createElement('canvas'); cv.width = CPX; cv.height = CPX;
      const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
      const variants = TN.map((_, id) => tileArt[id]?.filter(Boolean));
      const x0 = cx * CH; const y0 = cy * CH; let water = false;
      for (let ty = 0; ty < CH; ty++) for (let tx = 0; tx < CH; tx++) {
        const wx = x0 + tx; const wy = y0 + ty; const px = tx * TILE; const py = ty * TILE;
        if (wx >= ww || wy >= wh) { rect(g, PAL.deep_water[0], px, py, TILE, TILE); continue; }
        const i = wy * ww + wx; const t = terrain[i]; const pal = PAL[TN[t]] || PAL.grass;
        const art = variants[t];
        if (t === T.deep_water || t === T.shallow_water) water = true;
        const transition = transitionAt(wx, wy, t);
        if (transition) g.drawImage(transition, px, py, TILE, TILE);
        else if (art && art.length) g.drawImage(art[Math.floor(h2(wx, wy, 91) * art.length)], px, py, TILE, TILE);
        else {
          rect(g, pal[0], px, py, TILE, TILE);
          for (let k = 0; k < 3; k++) { const r = h2(wx * 3 + k, wy, 7); if (r < 0.55) rect(g, r < 0.27 ? pal[1] : pal[2], px + Math.floor(h2(wx, wy * 5 + k, 11) * 26), py + Math.floor(h2(wx * 7 + k, wy, 13) * 26), t === T.flower_meadow ? 3 : 6, t === T.flower_meadow ? 3 : 4); }
        }
        if (solid[i] && t !== T.deep_water) { rect(g, 'rgba(0,0,0,0.28)', px, py, TILE, TILE); rect(g, 'rgba(255,255,255,0.18)', px, py, TILE, 4); rect(g, 'rgba(0,0,0,0.35)', px, py + TILE - 5, TILE, 5); }
        // Transition sprites already draw the terrain boundary.
        if (transition) continue;
        const e = pal[3];
        if (wx + 1 < ww && terrain[wy * ww + wx + 1] !== t) rect(g, e, px + TILE - 2, py, 2, TILE);
        if (wx > 0 && terrain[wy * ww + wx - 1] !== t) rect(g, e, px, py, 2, TILE);
        if (wy + 1 < wh && terrain[(wy + 1) * ww + wx] !== t) rect(g, e, px, py + TILE - 2, TILE, 2);
        if (wy > 0 && terrain[(wy - 1) * ww + wx] !== t) rect(g, e, px, py, TILE, 2);
      }
      const list = propsBy[cy * ccols + cx];
      if (list) for (let k = 0; k < list.length; k++) drawProp(g, list[k].kind, (list[k].x - x0) * TILE, (list[k].y - y0) * TILE, false);
      let wcv = null;
      if (water) { // a sparse highlight layer, faded / nudged per frame for a cheap shimmer
        wcv = document.createElement('canvas'); wcv.width = CPX; wcv.height = CPX;
        const wg = wcv.getContext('2d');
        for (let ty = 0; ty < CH; ty++) for (let tx = 0; tx < CH; tx++) {
          const wx = x0 + tx; const wy = y0 + ty; if (wx >= ww || wy >= wh) continue;
          const t = terrain[wy * ww + wx]; if (t !== T.deep_water && t !== T.shallow_water) continue;
          for (let k = 0; k < 2; k++) rect(wg, 'rgba(220,240,255,0.55)', tx * TILE + Math.floor(h2(wx, wy, 31 + k) * 22), ty * TILE + Math.floor(h2(wx, wy, 41 + k) * 28), 8, 2);
        }
      }
      return { cv, water: wcv, used: 0, cx, cy };
    }
    function evict() {
      if (chunks.size <= MAX_CHUNKS) return;
      while (chunks.size > MAX_CHUNKS) {
        let oldK = -1; let oldU = Infinity;
        chunks.forEach((v, k) => { if (v.used < oldU) { oldU = v.used; oldK = k; } });
        if (oldK < 0 || oldU >= frameNo) break; // never evict what this frame drew
        chunks.delete(oldK);
      }
    }

    // ---------- portals / boss sites (drawn in world space, behind entities) ----------
    const portals = world.portalSites.map((p, i) => ({ i, x: (p.x + 0.5) * TILE, y: (p.y + 0.5) * TILE, tx: p.x, ty: p.y, biome: p.biome, zone: p.zone, col: BIOME_COL[p.biome] || '#a98bff', label: `${BIOME_NAME[p.biome] || 'Warren'} portal` }));
    const DASH = [10, 8];
    function drawPortal(g, q, tt, reduced) {
      g.save(); g.translate(q.x, q.y);
      g.globalAlpha = 0.25; g.fillStyle = q.col; g.beginPath(); g.arc(0, 0, 30, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
      g.rotate(reduced ? 0 : tt * 1.4); g.strokeStyle = q.col; g.lineWidth = 4; g.setLineDash(DASH); g.beginPath(); g.arc(0, 0, 26, 0, Math.PI * 2); g.stroke();
      g.rotate(reduced ? 0 : -tt * 2.8); g.lineWidth = 2; g.strokeStyle = '#fff'; g.beginPath(); g.arc(0, 0, 16, 0, Math.PI * 2); g.stroke(); g.setLineDash(EMPTY);
      g.restore();
      g.font = 'bold 12px system-ui, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#000'; g.fillText(q.label, q.x + 1, q.y - 37); g.fillStyle = q.col; g.fillText(q.label, q.x, q.y - 38);
    }
    const EMPTY = [];

    // ---------- minimap (base image cached once) + zone HUD ----------
    const mini = document.createElement('canvas'); mini.id = 'rw-minimap'; mini.width = 96; mini.height = 96; mini.setAttribute('aria-label', 'World map (tap to enlarge)'); mini.setAttribute('role', 'button'); mini.tabIndex = 0; mini.setAttribute('aria-pressed', 'false');
    const zoneEl = document.createElement('div'); zoneEl.id = 'rw-zone'; zoneEl.setAttribute('aria-live', 'polite');
    zoneEl.innerHTML = '<div class="rw-zname"></div><div class="rw-zsub"><span class="rw-arrow" aria-hidden="true">➤</span> <span class="rw-coords"></span></div>';
    const ov = document.getElementById('realm-overlay') || document.body;
    ov.appendChild(mini); ov.appendChild(zoneEl);
    function toggleMinimap() {
      const expanded = mini.classList.toggle('big');
      mini.setAttribute('aria-pressed', String(expanded));
    }
    mini.addEventListener('click', toggleMinimap);
    mini.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) toggleMinimap();
    });
    const zName = zoneEl.querySelector('.rw-zname'); const zArrow = zoneEl.querySelector('.rw-arrow'); const zCoords = zoneEl.querySelector('.rw-coords');
    let miniBase = null;
    // fog of discovered tiles: 8x8-tile cells (MMFog), revealed within ~12 tiles of the player, saved in `discovered`; ?fog=0 turns it off
    const FOG = window.MMFog; const FOG_R = 12;
    const fogOn = !!FOG && !/[?&]fog=0(&|$)/.test(typeof location !== 'undefined' ? location.search : '');
    const fogBits = FOG ? (FOG.decode(save.discovered) || FOG.make()) : null;
    let fogKey = '';
    const fogged = (tx, ty) => fogOn && !FOG.has(fogBits, FOG.cellOf(tx), FOG.cellOf(ty));
    function revealAt(tx, ty) { // -> number of newly revealed cells; the minimap redraws (and the save updates) only when it is > 0
      if (!FOG) return 0;
      const n = FOG.reveal(fogBits, Math.floor(tx), Math.floor(ty), FOG_R);
      if (n > 0) { save.discovered = FOG.encode(fogBits); miniKey = ''; writeSave(save); }
      return n;
    }
    function buildMiniBase() {
      const c = document.createElement('canvas'); c.width = ww; c.height = wh;
      const g = c.getContext('2d'); const img = g.createImageData(ww, wh); const d = img.data;
      const rgb = {}; Object.keys(PAL).forEach((k) => { const h = PAL[k][0]; rgb[T[k]] = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; });
      for (let i = 0; i < ww * wh; i++) { const c3 = rgb[terrain[i]] || [0, 0, 0]; const k = solid[i] && terrain[i] !== T.deep_water ? 0.6 : 1; d[i * 4] = c3[0] * k; d[i * 4 + 1] = c3[1] * k; d[i * 4 + 2] = c3[2] * k; d[i * 4 + 3] = 255; }
      g.putImageData(img, 0, 0);
      return c;
    }
    let miniKey = ''; let hudT = 0; let zoneTxt = ''; let arrowDeg = -1; let miniDraws = 0; let lastZone = null;
    function drawMini(force) {
      const p = arena.player; const tx = Math.floor(p.x / TILE); const ty = Math.floor(p.y / TILE);
      const key = (tx >> 1) + ',' + (ty >> 1) + ',' + bossesKey() + ',' + evMiniKey + ',' + siteMiniKey();
      if (!force && key === miniKey) return;
      miniKey = key; miniDraws++;
      if (!miniBase) miniBase = buildMiniBase();
      const g = mini.getContext('2d'); const sx = mini.width / ww; const sy = mini.height / wh;
      g.imageSmoothingEnabled = true; g.drawImage(miniBase, 0, 0, ww, wh, 0, 0, mini.width, mini.height);
      if (fogOn) {
        const cw = FOG.CELL * sx; const ch = FOG.CELL * sy; g.fillStyle = '#0a0d14';
        for (let cy = 0; cy < FOG.SIDE; cy++) for (let cx = 0; cx < FOG.SIDE; cx++) if (!FOG.has(fogBits, cx, cy)) g.fillRect(Math.floor(cx * cw), Math.floor(cy * ch), Math.ceil(cw), Math.ceil(ch));
      }
      for (let i = 0; i < portals.length; i++) { const q = portals[i]; if (fogged(q.tx, q.ty)) continue; g.fillStyle = '#000'; g.fillRect(q.tx * sx - 2.5, q.ty * sy - 2.5, 5, 5); g.fillStyle = q.col; g.fillRect(q.tx * sx - 1.5, q.ty * sy - 1.5, 3, 3); }
      for (let i = 0; i < world.bossSites.length; i++) { const b = world.bossSites[i]; if (fogged(b.x, b.y)) continue; g.fillStyle = bossMarkCol(i); g.beginPath(); g.arc(b.x * sx, b.y * sy, 2, 0, Math.PI * 2); g.fill(); }
      if (SITES) {
        SITES.shrines.forEach((q) => { if (fogged(q.x, q.y)) return; g.fillStyle = '#000'; g.fillRect(q.x * sx - 2.5, q.y * sy - 2.5, 5, 5); g.fillStyle = shrineReady(q) ? SHRINE_COL[q.kind] : '#6b6b6b'; g.fillRect(q.x * sx - 1.5, q.y * sy - 1.5, 3, 3); });
        SITES.camps.forEach((q) => { if (fogged(q.x, q.y)) return; g.fillStyle = chestOpen.has(q.id) ? '#6b6b6b' : '#d98a2b'; g.fillRect(q.x * sx - 1, q.y * sy - 1, 3, 3); });
        SITES.npcs.forEach((q) => { if (fogged(q.x, q.y)) return; g.fillStyle = '#7fe0ff'; g.fillRect(q.x * sx - 1, q.y * sy - 1, 2, 2); });
      }
      evState.forEach((st) => { if (st.phase === 'upcoming' || st.phase === 'active') drawBeacon(g, st.plan.site.x * sx, st.plan.site.y * sy, st.phase === 'active' ? 4 : 3, st.phase === 'active' ? '#ff8a2a' : '#ffe27a', 0, true); });
      g.fillStyle = '#000'; g.fillRect(tx * sx - 2.5, ty * sy - 2.5, 5, 5); g.fillStyle = '#fff'; g.fillRect(tx * sx - 1.5, ty * sy - 1.5, 3, 3);
    }
    function syncHud(force) {
      const p = arena.player; const tx = Math.floor(p.x / TILE); const ty = Math.floor(p.y / TILE);
      const zi = Z.zoneInfoAt(world, tx, ty); lastZone = zi;
      const txt = `${zi.name} · ${zi.danger}`;
      if (txt !== zoneTxt || force) { zoneTxt = txt; zName.textContent = txt; zName.style.color = zi.color; zoneEl.dataset.zone = String(zi.zone); }
      const dx = world.center.x - tx; const dy = world.center.y - ty; const dist = Math.round(Math.hypot(dx, dy));
      let goal = null;
      let goalDistance = Infinity;
      for (const portal of portals) {
        const distance = (portal.tx - tx) ** 2 + (portal.ty - ty) ** 2;
        if (distance < goalDistance) { goal = portal; goalDistance = distance; }
      }
      zArrow.title = goal ? 'Nearest dungeon portal' : 'Island centre';
      zArrow.setAttribute('aria-label', zArrow.title);
      const heading = goal ? Math.atan2(goal.ty - ty, goal.tx - tx) : Math.atan2(dy, dx);
      const deg = Math.round(heading * 180 / Math.PI / 5) * 5;
      if (deg !== arrowDeg) { arrowDeg = deg; zArrow.style.transform = `rotate(${deg}deg)`; }
      const ct = `${tx},${ty} · centre ${dist}`;
      if (zCoords.textContent !== ct) zCoords.textContent = ct;
      const w = document.getElementById('realm-wave'); if (w && w.textContent !== zi.name) w.textContent = zi.name;
      const b = document.getElementById('realm-biome'); if (b && b.textContent !== zi.danger) b.textContent = zi.danger;
      if (fogOn) { const fk = tx + ',' + ty; if (fk !== fogKey) { fogKey = fk; revealAt(tx, ty); } }
      drawMini(force);
    }

    // ---------- zone spawner (MMZones) -> arena enemies; drops; boss sites (slice 6) ----------
    let zones = null; const live = new Map(); // spawner enemy id -> pooled arena enemy
    const bossLive = world.bossSites.map(() => null);
    let kills = 0; let bossT = 0; let dropAll = false; const lastDrops = []; let spawned = 0; let despawned = 0;
    const pretty = (id) => String(id).split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const BOSS_NAME = world.bossSites.map((b) => pretty(b.boss));
    const groups = world.spawnGroups;
    function resetZones() {
      // despawn at 1.4x the activation radius (not 2.5x): otherwise the groups you just walked past fill the 60-enemy cap and the
      // next zone stays empty until you are 3750 px away
      zones = Z.createSpawner(world, { tile: TILE, deactivateMul: 1.4 });
      live.clear(); for (let i = 0; i < bossLive.length; i++) bossLive[i] = null;
    }
    // An arena enemy that vanished without dying through _hitEnemy (pool cleared, a test, a future hook): tell the spawner it is gone
    // (no drop, no kill credit) so its slot frees up and the group can respawn later.
    let sweepT = 0;
    function sweepLost() {
      live.forEach((e, id) => { if (!e.active || e.zid !== id) { live.delete(id); zones.markDead(id, arena.clock); } });
    }
    // ---------- difficulty curve (MMDifficulty, applied at spawn time only: generation and seeded rolls are untouched; ?difficulty=off = 1x) ----------
    const DIFF = window.MMDifficulty && !MMDifficulty.isOff(typeof location !== 'undefined' ? location.search : '') ? MMDifficulty : null;
    let diffMode = 'classic'; try { if (window.MMProfile) diffMode = MMProfile.clean(localStorage.getItem(MMProfile.KEY)).mode; } catch (e) { diffMode = 'classic'; }
    const REALM_R = world.w * 0.47; // nominal coast radius in tiles (MMOverworld.generate)
    function diffAt(zone, px, py) { // px/py in pixels -> MMDifficulty.zoneScale for that spot (1x everywhere when off)
      if (!DIFF) return { hp: 1, dmg: 1, spd: 1, count: 1, fire: 1 };
      const d = Math.hypot(px / TILE - world.center.x, py / TILE - world.center.y) / REALM_R;
      return DIFF.zoneScale(zone, d, { mode: diffMode });
    }
    function scaleEnemy(e, zone, hpBase) { // multiply an arena enemy already carrying its zone stats
      const s = diffAt(zone, e.x, e.y);
      e.maxHp = Math.max(1, Math.ceil(hpBase * s.hp)); e.hp = e.maxHp; e.spdMul = (e.spdMul || 1) * s.spd; e.dmgMul = (e.dmgMul || 1) * s.dmg; e.diff = DIFF ? s : null;
    }
    function spawnZ(rec) {
      let x = rec.x; let y = rec.y;
      if (solidAt(x, y)) { const g = groups[rec.group]; x = (g.x + 0.5) * TILE; y = (g.y + 0.5) * TILE; }
      const e = arena.spawnEnemy(rec.type, x, y);
      if (!e) return null;
      const def = RM_ENEMIES[rec.type];
      e.maxHp = Math.max(1, Math.ceil(def.hp * rec.hpMul)); e.hp = e.maxHp;
      e.spdMul = rec.speedMul; e.dmgMul = rec.dmgMul; e.xpMul = rec.xpMul; e.shardMul = rec.shardMul;
      scaleEnemy(e, rec.zone, def.hp * rec.hpMul);
      e.art = rec.creature; e.zid = rec.id; e.zone = rec.zone; e.tier = rec.tier;
      live.set(rec.id, e); spawned++;
      return e;
    }
    function giveBag(x, y, bag, info) {
      const got = { zone: info.zone, boss: !!info.boss, tier: bag.tier, items: [], shards: bag.shards, potions: bag.potions };
      bag.items.forEach((it, k) => { const b = arena.dropBag(x + (k - (bag.items.length - 1) / 2) * 18, y + 10, it.r, it.id, bag); if (b) got.items.push({ id: it.id, r: it.r }); });
      if (bag.shards > 0) { arena.save.shards += bag.shards; arena.run.shards += bag.shards; arena._floatText(x, y - 34, `+${bag.shards} 💎`, '#8fe9ff'); }
      if (bag.potions > 0) arena._sigHeal(12 * bag.potions);
      lastDrops.push(got); if (lastDrops.length > 12) lastDrops.shift();
      arena.onSave(arena.save); arena._syncHud();
      return got;
    }
    function rollFor(info, x, y, tag) {
      const rs = seed + ':' + tag + ':' + kills;
      if (!dropAll && MMRng.create('dropchance:' + rs).next() >= Z.dropChance(info)) return null;
      return giveBag(x, y, Z.rollDrop(info, rs).bag, info);
    }
    function onEnemyHit(e, dmg) { if (evOnHit(e, dmg)) return; if (zones && e.zid >= 0) zones.markCombat(e.zid); }
    function onEnemyKilled(e) {
      if (e.campId) { e.campId = null; kills++; save.stats.kills++; return; }
      if (e.evid) { evOnKilled(e); return; }
      if (!zones) return;
      if (e.zid >= 0) {
        const info = zones.markDead(e.zid, arena.clock); live.delete(e.zid); e.zid = -1;
        if (!info) return;
        kills++; save.stats.kills++;
        rollFor({ zone: info.zone, tier: info.tier }, e.x, e.y, 'g' + info.group);
        return;
      }
      for (let i = 0; i < bossLive.length; i++) {
        if (bossLive[i] !== e) continue;
        const site = world.bossSites[i]; bossLive[i] = null; bossReadyNow[i] = 0; miniKey = '';
        zones.bossDefeated(site, arena.clock); kills++; save.stats.bossKills++;
        rollFor({ zone: site.zone, tier: site.zone, boss: true }, e.x, e.y + 30, 'boss' + i);
        writeSave(save);
      }
    }
    function bossAlive() { for (let i = 0; i < bossLive.length; i++) if (bossLive[i] && bossLive[i].active) return i; return -1; }
    function spawnBoss(i) {
      const site = world.bossSites[i]; const rec = Z.bossEnemy(site, TILE);
      const e = arena.spawnEnemy('boss', rec.x, rec.y);
      if (!e) return null;
      e.maxHp = Math.max(1, Math.ceil(RM_BOSS_HP * rec.hpMul / Z.TABLES.BOSS.hp)); e.hp = e.maxHp;
      e.phase = 1; e.invuln = 1.2; e.cd = 1.2; e.cd2 = 2.4; e.angle = 0;
      e.dmgMul = rec.dmgMul; e.bossName = BOSS_NAME[i]; e.bossTier = site.zone + 1; e.art = site.boss;
      arena.bossT0 = arena.clock; bossLive[i] = e; arena._syncBoss();
      arena._showBanner(`${BOSS_NAME[i]} awakens!`, 1.8);
      miniKey = '';
      return e;
    }
    const bossReadyNow = new Uint8Array(world.bossSites.length); // refreshed by bossTick (2 Hz) so drawing never builds lookup strings
    function bossTick() {
      const p = arena.player; const alive = bossAlive();
      for (let i = 0; i < bossLive.length; i++) {
        const b = world.bossSites[i]; const bx = (b.x + 0.5) * TILE; const by = (b.y + 0.5) * TILE; const d = Math.hypot(p.x - bx, p.y - by);
        const e = bossLive[i];
        bossReadyNow[i] = !e && zones.bossReady(b, arena.clock) ? 1 : 0;
        if (e && !e.active) { bossLive[i] = null; miniKey = ''; continue; }
        if (e) { if (d > 40 * TILE) { e.active = false; bossLive[i] = null; arena._syncBoss(); miniKey = ''; } continue; } // walked away: it rests (no cooldown)
        if (alive < 0 && !arena._boss() && d < 9 * TILE && zones.bossReady(b, arena.clock)) spawnBoss(i); // never next to a raid boss
      }
    }
    function bossesKey() { let k = ''; for (let i = 0; i < bossLive.length; i++) k += bossLive[i] ? 'L' : zones && zones.bossReady(world.bossSites[i], arena.clock) ? 'R' : 'c'; return k; }
    function bossMarkCol(i) { return bossLive[i] ? '#ff5fa2' : zones && zones.bossReady(world.bossSites[i], arena.clock) ? '#ff3b3b' : '#6b6b6b'; }

    // ---------- world events (MMZones.eventsFor + eventPlan): announce, beacon, spawn at the site, contribution, reward, expiry ----------
    // Time source: the event clock = evBase + arena.clock (game time: pause freezes it). evBase carries the saved clock across visits and
    // is what the test hook setEventClock moves. Everything else is seeded (eventsFor / eventPlan / eventReward): no Math.random here.
    const ZT = Z.TABLES;
    const REGION_NAME = ['Shore', 'Midlands', 'Highlands', 'Godlands'];
    const KIND_NAME = { boss: 'Raid', swarm: 'Swarm' };
    const evState = new Map(); // event id -> {id, ev, plan, phase: upcoming|active|won|expired, ents, total, dealt, announced, reward}
    const evDone = new Set(save.evDone);
    let evBase = 0; let evT = 0; let evStarted = false; let lastEvClock = 0; let evCredit = true; let evList = []; let evFocus = null; let lastEvReward = null; let evMiniKey = ''; let hintT = 0; let spawnHint = '';
    const evEl = document.createElement('div'); evEl.className = 'rw-event hidden'; evEl.id = 'rw-event'; zoneEl.appendChild(evEl);
    const hintEl = document.createElement('div'); hintEl.id = 'rw-event-hint'; hintEl.className = 'hidden'; hintEl.setAttribute('role', 'status'); ov.appendChild(hintEl);
    const eventClock = () => evBase + arena.clock;
    const fmtT = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
    const siteXY = (st) => ({ x: (st.plan.site.x + 0.5) * TILE, y: (st.plan.site.y + 0.5) * TILE });
    function evTitle(st) { return st.plan.kind === 'boss' ? `${pretty(st.plan.boss)} raid` : `${REGION_NAME[st.plan.region]} swarm`; }
    function evStateFor(ev) {
      let st = evState.get(ev.id);
      if (!st) {
        st = { id: ev.id, ev, plan: Z.eventPlan(world, ev), phase: evDone.has(ev.id) ? 'won' : 'upcoming', ents: [], total: 0, dealt: 0, announced: false, reward: null, spawns: 0 };
        evState.set(ev.id, st);
      } else st.ev = ev;
      return st;
    }
    function evAliveEnts(st) { let n = 0; for (let i = 0; i < st.ents.length; i++) { const e = st.ents[i]; if (e.active && e.evid === st.id) n++; } return n; }
    function evRest(st) { // despawn its creatures without a result (walked away, restart): it can spawn again while it lasts
      for (let i = 0; i < st.ents.length; i++) { const e = st.ents[i]; if (e.active && e.evid === st.id) e.active = false; if (e.evid === st.id) e.evid = null; }
      st.ents = []; st.total = 0; st.dealt = 0; arena._syncBoss();
    }
    function evFinish(st, phase) {
      st.phase = phase; evMiniKey = ''; miniKey = '';
      if (phase === 'won') { evDone.add(st.id); save.evDone = Array.from(evDone).slice(-12); } // expired ones drop out of eventsFor by themselves
      if (phase === 'expired') evRest(st);
      writeSave(save);
    }
    function spawnEvent(st) {
      const p = st.plan; st.ents = []; st.total = 0; st.dealt = 0; st.spawns++;
      if (p.kind === 'boss') {
        const rec = Z.bossEnemy({ x: p.site.x, y: p.site.y, zone: p.region }, TILE);
        const e = arena.spawnEnemy('boss', rec.x, rec.y);
        if (!e) return false;
        e.maxHp = Math.max(1, Math.ceil(RM_BOSS_HP * rec.hpMul / ZT.BOSS.hp)); e.hp = e.maxHp;
        e.phase = 1; e.invuln = 1.2; e.cd = 1.2; e.cd2 = 2.4; e.angle = 0;
        e.dmgMul = rec.dmgMul; e.bossName = pretty(p.boss); e.bossTier = p.region + 1; e.art = p.boss; e.evid = st.id;
        st.ents.push(e); st.total = e.maxHp; arena.bossT0 = arena.clock; arena._syncBoss();
        hintT = 3.5; spawnHint = hintEl.textContent = `⚠ ${e.bossName}: a red ring flashes 1 s before each burst. Move when you see it.`;
      } else {
        for (let k = 0; k < p.swarm.length; k++) {
          const r = p.swarm[k]; let x = r.x; let y = r.y;
          if (solidAt(x, y)) { const f = nearestFree(Math.floor(x / TILE), Math.floor(y / TILE), 6) || nearestFree(p.site.x, p.site.y, 6); if (!f) continue; x = (f.x + 0.5) * TILE; y = (f.y + 0.5) * TILE; }
          const e = arena.spawnEnemy(r.type, x, y);
          if (!e) break; // pool full: the swarm is smaller
          const def = RM_ENEMIES[r.type];
          e.maxHp = Math.max(1, Math.ceil(def.hp * r.hpMul)); e.hp = e.maxHp;
          e.spdMul = r.speedMul; e.dmgMul = r.dmgMul; e.xpMul = r.xpMul; e.shardMul = r.shardMul; scaleEnemy(e, r.zone, def.hp * r.hpMul); e.art = r.creature; e.zone = r.zone; e.tier = r.tier; e.evid = st.id;
          st.ents.push(e); st.total += e.maxHp;
        }
        if (!st.ents.length) return false;
        hintT = 3; spawnHint = hintEl.textContent = `⚠ ${st.ents.length} creatures swarm the site. Clear them all before the timer ends!`;
      }
      arena._showBanner(`${evTitle(st)}! ${fmtT(st.ev.endsAt - eventClock())} to win it`, 1.8);
      evMiniKey = ''; miniKey = '';
      return true;
    }
    function evWin(st) {
      const tier = Z.eventTier(st.dealt, st.total);
      const rew = tier ? Z.eventReward(st.ev, tier, seed + ':' + st.id) : null;
      const p = arena.player;
      const res = { id: st.id, kind: st.plan.kind, region: st.plan.region, tier, tierName: ZT.EVENT_TIERS[tier], dealt: st.dealt, total: st.total, share: st.total ? st.dealt / st.total : 0, shards: 0, fame: 0, bag: null };
      save.stats.events++;
      if (rew) {
        res.bag = giveBag(p.x, p.y - 26, rew.bag, { zone: st.plan.region, boss: true, event: true });
        arena.save.shards += rew.shards; arena.run.shards += rew.shards; res.shards = rew.shards; res.fame = rew.fame;
        save.stats.eventWins++;
        if (api.onEventFame) api.onEventFame(rew.fame, res);
        arena.onSave(arena.save); arena._syncHud();
        arena._showBanner(`🏆 ${evTitle(st)} won! ${ZT.EVENT_TIERS[tier]} · +${rew.shards} 💎 · +${rew.fame} fame`, 2.6);
      } else arena._showBanner(`${evTitle(st)} is over. Deal damage to earn a share of the reward.`, 2.2);
      st.reward = res; lastEvReward = res;
      evFinish(st, 'won');
      return res;
    }
    function evTick() {
      const now = eventClock(); const p = arena.player;
      evList = Z.eventsFor(world, now);
      const seen = new Set();
      for (let i = 0; i < evList.length; i++) {
        const ev = evList[i]; seen.add(ev.id);
        const st = evStateFor(ev);
        if (st.phase === 'won' || st.phase === 'expired') continue;
        if (!ev.active) {
          st.phase = 'upcoming';
          if (!st.announced && ev.countdown <= ZT.EVENT_ANNOUNCE) { st.announced = true; arena._showBanner(`⚑ ${evTitle(st)} in ${Math.ceil(ev.countdown)} s (${REGION_NAME[st.plan.region]}, see the map)`, 2); }
          continue;
        }
        if (st.phase === 'upcoming') { st.phase = 'active'; st.announced = true; evMiniKey = ''; }
        const c = siteXY(st); const d = Math.hypot(p.x - c.x, p.y - c.y);
        if (st.ents.length) {
          if (evAliveEnts(st) === 0) evRest(st); // its creatures vanished without dying (restart, pool cleared): it can spawn again
          else if (d > ZT.EVENT_LEASH * TILE) evRest(st); // walked away: it rests
        }
        if (!st.ents.length && d < ZT.EVENT_SPAWN_RADIUS * TILE && arena.state === 'play' && !(st.plan.kind === 'boss' && (bossAlive() >= 0 || arena._boss()))) spawnEvent(st);
      }
      evState.forEach((st, id) => { // eventsFor omits finished events: an unresolved one that dropped out has expired
        if (seen.has(id)) return;
        if (st.phase === 'active' || st.phase === 'upcoming') {
          const was = st.phase === 'active' && (st.ents.length > 0 || st.dealt > 0);
          evFinish(st, 'expired');
          if (was) arena._showBanner(`⌛ The ${evTitle(st)} faded away.`, 2);
        } else if (now > st.ev.endsAt + ZT.EVENT_PERIOD || now < st.ev.startsAt - ZT.EVENT_PERIOD) evState.delete(id);
      });
      evFocus = null; let best = Infinity; // the HUD follows the event you are in, else the nearest active one, else the next to start
      for (let i = 0; i < evList.length; i++) {
        const st = evState.get(evList[i].id); if (!st || st.phase === 'won' || st.phase === 'expired') continue;
        const c = siteXY(st); const d = Math.hypot(p.x - c.x, p.y - c.y);
        const score = st.ents.length ? d : st.phase === 'active' ? 1e7 + d : 2e7 + st.ev.startsAt;
        if (score < best) { best = score; evFocus = st; }
      }
      syncEventHud();
      const k = evKey(); if (k !== evMiniKey) { evMiniKey = k; miniKey = ''; }
    }
    function evKey() { let k = ''; evState.forEach((st) => { if (st.phase === 'upcoming' || st.phase === 'active') k += st.id + st.phase[0] + (st.ents.length ? 'L' : '') + ';'; }); return k; }
    function syncEventHud() {
      const st = evFocus;
      if (!st) { if (!evEl.classList.contains('hidden')) { evEl.classList.add('hidden'); evEl.textContent = ''; } evEl.dataset.state = ''; return; }
      const now = eventClock();
      const share = st.total ? Math.floor(st.dealt / st.total * 100) : 0;
      const txt = st.phase === 'active'
        ? `⚑ ${KIND_NAME[st.plan.kind]}: ${st.plan.kind === 'boss' ? pretty(st.plan.boss) : REGION_NAME[st.plan.region]} · ${fmtT(st.ev.endsAt - now)} left${st.ents.length ? ` · you ${share}%` : ''}`
        : `⚑ ${KIND_NAME[st.plan.kind]} in ${fmtT(st.ev.startsAt - now)} · ${REGION_NAME[st.plan.region]}`;
      if (evEl.textContent !== txt) evEl.textContent = txt;
      evEl.classList.remove('hidden');
      evEl.dataset.state = st.phase; evEl.dataset.kind = st.plan.kind; evEl.dataset.id = st.id;
    }
    function evHint(dt) { // the telegraphed-attack banner: a boss raid's next burst, and the spawn hints
      let show = false; let incoming = '';
      if (hintT > 0) { hintT -= dt; show = true; }
      evState.forEach((st) => { // an incoming burst outranks the spawn hint
        if (st.phase !== 'active' || st.plan.kind !== 'boss') return;
        const e = st.ents[0]; if (!e || !e.active || e.evid !== st.id || e.invuln > 0) return;
        if (e.cd2 < 1 && Math.hypot(arena.player.x - e.x, arena.player.y - e.y) < 20 * TILE) incoming = e.phase === 1 ? `⚠ ${e.bossName}: aimed fan incoming. Sidestep!` : `⚠ ${e.bossName}: ring burst incoming. Slip through a gap!`;
      });
      if (incoming) { show = true; if (hintEl.textContent !== incoming) hintEl.textContent = incoming; } else if (show && hintT > 0 && spawnHint && hintEl.textContent !== spawnHint) hintEl.textContent = spawnHint;
      if (show === hintEl.classList.contains('hidden')) hintEl.classList.toggle('hidden', !show);
    }
    function evOnHit(e, dmg) {
      if (!e.evid) return false;
      const st = evState.get(e.evid); if (!st || st.ents.indexOf(e) < 0) return true;
      if (evCredit && dmg > 0) st.dealt = Math.min(st.total, st.dealt + Math.min(dmg, Math.max(0, e.hp)));
      return true;
    }
    function evOnKilled(e) {
      const st = evState.get(e.evid); e.evid = null;
      if (!st || st.ents.indexOf(e) < 0 || st.phase !== 'active') return;
      let left = 0; for (let i = 0; i < st.ents.length; i++) if (st.ents[i].active && st.ents[i].evid === st.id) left++;
      if (left === 0) evWin(st);
    }
    function drawBeacon(g, x, y, r, col, tt, reduced) { // the event_beacon marker, drawn in code (minimap and world)
      const k = reduced ? 1 : 0.8 + 0.2 * Math.sin(tt * 4);
      g.fillStyle = '#000'; g.beginPath(); g.moveTo(x, y - r - 1.5); g.lineTo(x + r + 1.5, y); g.lineTo(x, y + r + 1.5); g.lineTo(x - r - 1.5, y); g.closePath(); g.fill();
      g.fillStyle = col; g.globalAlpha = k; g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath(); g.fill(); g.globalAlpha = 1;
    }
    function evMarkers() { const o = []; evState.forEach((st) => { if (st.phase === 'upcoming' || st.phase === 'active') o.push({ id: st.id, x: st.plan.site.x, y: st.plan.site.y, phase: st.phase, kind: st.plan.kind }); }); return o; }

    // ---------- portals into Warren dungeons and back (slice 7) ----------
    const RETURN_RE = /^index\.html\?mode=world&seed=[A-Za-z0-9_-]{1,24}&at=\d{1,4},\d{1,4}(&test=1)?$/;
    const portalBtn = document.createElement('button'); portalBtn.id = 'rw-portal'; portalBtn.type = 'button'; portalBtn.className = 'hidden'; portalBtn.textContent = 'Enter Warren dungeon'; // retitled per portal biome in portalTick
    ov.appendChild(portalBtn);
    let promptFor = -1; let leaving = false;
    function portalSeed(i) { return String(MMRng.hash(seed + ':portal:' + i) % 100000); }
    function portalUrls(i) {
      const q = portals[i];
      const ret = 'index.html?mode=world&seed=' + seed + '&at=' + q.tx + ',' + q.ty + (opts.test ? '&test=1' : '');
      const url = 'index.html?mode=dungeon&seed=' + portalSeed(i) + '&lv=2&biome=' + (BIOME_NAME[q.biome] ? q.biome : 'warren') + '&return=' + encodeURIComponent(ret) + (opts.test ? '&test=1' : '');
      return { ret: RETURN_RE.test(ret) ? ret : null, url };
    }
    function enterPortal(i) {
      if (leaving || !(i >= 0 && i < portals.length) || !arena.active) return null;
      const q = portals[i]; const u = portalUrls(i);
      if (!u.ret) return null;
      leaving = true;
      save.pos = { x: q.tx, y: q.ty }; save.returnTo = { x: q.tx, y: q.ty, seed }; save.stats.portals++;
      writeSave(save); arena.onSave(arena.save); settle('portal');
      api.lastPortalUrl = u.url;
      arena.stop(); portalBtn.classList.add('hidden');
      if (opts.navigate !== false) location.href = u.url;
      return u.url;
    }
    portalBtn.addEventListener('click', () => { if (promptFor >= 0) enterPortal(promptFor); });
    window.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && promptFor >= 0 && arena.active && !arena.paused && arena.state === 'play') { ev.preventDefault(); enterPortal(promptFor); } });
    function portalTick() {
      const p = arena.player; let near = -1;
      if (arena.state === 'play' && !arena.paused) for (let i = 0; i < portals.length; i++) { const dx = p.x - portals[i].x; const dy = p.y - portals[i].y; if (dx * dx + dy * dy < 40 * 40) { near = i; break; } }
      if (near !== promptFor) {
        promptFor = near; portalBtn.classList.toggle('hidden', near < 0);
        if (near >= 0) { const bn = BIOME_NAME[portals[near].biome] || 'Warren'; portalBtn.textContent = `Enter ${bn} dungeon`; portalBtn.setAttribute('aria-label', `Enter ${bn} dungeon (${portals[near].label}, Enter)`); }
      }
    }

    // ---------- Lantern stash payout (MMStash): finds recorded on pickup, settled at the end of a leg ----------
    const ST = window.MMStash && window.MMProfile ? window.MMStash : null;
    const shards0 = arena.save.shards; const sess = { items: 0, fame: 0, waiting: 0 }; let lastSettle = null;
    const shardsGained = () => Math.max(0, arena.save.shards - shards0);
    function settle(src) {
      if (!ST) return null;
      let r = null; try { r = ST.settle(localStorage, { Profile: MMProfile, realmItems: arena.save.items, shards: shardsGained(), src: 'world', force: src === 'test' }); } catch (e) { r = null; }
      if (r && r.ok) { sess.items += r.items; sess.fame += r.fame; sess.waiting = r.waiting; lastSettle = { src, items: r.items, stash: r.stash, hero: r.hero, waiting: r.waiting, fame: r.fame, dropped: r.dropped }; }
      return r;
    }
    const stashNote = () => (ST ? ST.text({ items: sess.items, shards: shardsGained(), fame: sess.fame, waiting: sess.waiting }) : '');
    if (ST) {
      arena.onItem = (it) => { try { ST.recordTo(localStorage, it, 'world'); } catch (e) { /* storage blocked */ } };
      arena.onDeathCache = (c) => { try { if (c && c.n) ST.recordTo(localStorage, { n: c.n, id: c.id, r: c.rarity }, 'cache'); } catch (e) { /* storage blocked */ } settle('death'); }; // Survivor's Cache: shards kept, the cache item is a find
      arena.onMenuOpen = () => settle('menu');
      arena.menuNote = stashNote;
    }

    // ---------- the hooks the arena calls ----------
    let pendingAt = null;
    if (typeof opts.at === 'string' && AT_RE.test(opts.at)) { const m = AT_RE.exec(opts.at); pendingAt = { x: Math.min(ww - 1, Number(m[1])), y: Math.min(wh - 1, Number(m[2])) }; }
    let saveT = 0; let lastSavedKey = '';
    function savePos(force) {
      const p = arena.player; const pos = { x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) };
      const k = pos.x + ',' + pos.y;
      if (!force && k === lastSavedKey) return;
      lastSavedKey = k; save.pos = pos; save.evT = Math.floor(eventClock()); writeSave(save);
    }
    function placeAt(tx, ty) {
      const f = nearestFree(tx, ty, 8) || world.spawnPoint;
      const p = arena.player; p.x = (f.x + 0.5) * TILE; p.y = (f.y + 0.5) * TILE; p.iframes = Math.max(p.iframes, 2);
    }
    // ---------- world sites (MMSites): shrines (timed buffs), camps (chest + patrol), NPC greeters ----------
    const SITES = window.MMSites && !/[?&]sites=0(&|$)/.test(typeof location !== 'undefined' ? location.search : '') ? MMSites.generate(world, seed) : null;
    const NPC_IDS = window.MMSites ? MMSites.NPC_IDS : [];
    const SHRINE_COL = { heal: '#5be38a', rage: '#ff6a4a', ward: '#6ab8ff' };
    const SHRINE_TXT = { heal: 'Shrine of Mending', rage: 'Shrine of Fury', ward: 'Shrine of Warding' };
    const GREET = ['Safe roads, traveller.', 'The island keeps its secrets, but the shrines are generous.', 'Mind the camps past the hills.', 'I hear the beacons are lit tonight.', 'Take your time. Nothing here is in a hurry.', 'Have you tried the portals yet?'];
    const NPC_NAME = { npc_nexus_guide: 'Nexus Guide', npc_vendor: 'Vendor', npc_healer: 'Healer', npc_quest_giver: 'Quest Giver', npc_blacksmith: 'Blacksmith', npc_wanderer: 'Wanderer', npc_ghost_guide: 'Ghost Guide' };
    const SITE_R = 56; const chestOpen = new Set(save.chests || []); const shrineAt = Object.assign({}, save.shrineAt || {}); let greetN = 0;
    const campSt = new Map(); // camp id -> { ents, cleared }
    let rageEnd = 0; let wardEnd = 0; let noteT = 0; let siteFor = null; let siteKeyShown = ''; let siteTickT = 0;
    const siteNote = document.createElement('div'); siteNote.id = 'rw-site-note'; siteNote.className = 'hidden'; siteNote.setAttribute('role', 'status'); ov.appendChild(siteNote);
    const siteBtn = document.createElement('button'); siteBtn.id = 'rw-site'; siteBtn.type = 'button'; siteBtn.className = 'hidden'; ov.appendChild(siteBtn);
    const sNow = () => Math.floor(eventClock() * 1000);
    const shrineLeft = (q) => MMSites.cooldownLeft(shrineAt[q.id], sNow());
    const shrineReady = (q) => shrineLeft(q) === 0;
    const siteMiniKey = () => { if (!SITES) return ''; let k = chestOpen.size + ':'; SITES.shrines.forEach((q) => { k += shrineReady(q) ? 1 : 0; }); return k; };
    const sPx = (q) => ({ x: (q.x + 0.5) * TILE, y: (q.y + 0.5) * TILE });
    function say(text) { siteNote.textContent = text; siteNote.classList.remove('hidden'); noteT = 3.2; }
    const sc = {}; // cached site sprites (code drawn once)
    function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
    function glowSprite(col) { const c = mk(128, 128); const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return c; }
    function shrineSprite(kind, lit) {
      const key = 's' + kind + (lit ? 1 : 0); if (sc[key]) return sc[key];
      const c = mk(48, 88); const g = c.getContext('2d'); const col = lit ? SHRINE_COL[kind] : '#6b7078';
      g.fillStyle = '#000'; g.fillRect(8, 72, 32, 12); g.fillStyle = '#8b8a84'; g.fillRect(10, 72, 28, 10); g.fillStyle = '#5f5e59'; g.fillRect(10, 78, 28, 4);
      g.fillStyle = '#000'; g.fillRect(14, 22, 20, 52); g.fillStyle = '#a9a8a0'; g.fillRect(16, 22, 16, 50); g.fillStyle = '#7f7e78'; g.fillRect(26, 22, 6, 50);
      g.fillStyle = col; g.fillRect(20, 40, 8, 12); g.fillRect(22, 36, 4, 20);
      g.fillStyle = '#000'; g.beginPath(); g.arc(24, 14, 11, 0, Math.PI * 2); g.fill(); g.fillStyle = col; g.beginPath(); g.arc(24, 14, 8, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(20, 10, 4, 4);
      return (sc[key] = c);
    }
    function chestSprite(open) {
      const key = 'c' + (open ? 1 : 0); if (sc[key]) return sc[key];
      const c = mk(44, 36); const g = c.getContext('2d');
      g.fillStyle = '#000'; g.fillRect(2, 12, 40, 22); g.fillStyle = '#8a5a2b'; g.fillRect(4, 14, 36, 18); g.fillStyle = '#6b4220'; g.fillRect(4, 26, 36, 6);
      g.fillStyle = '#d9b341'; g.fillRect(4, 20, 36, 3); g.fillRect(19, 18, 6, 9);
      if (open) { g.fillStyle = '#000'; g.fillRect(2, 2, 40, 12); g.fillStyle = '#5a3a1c'; g.fillRect(4, 4, 36, 8); g.fillStyle = '#ffe27a'; g.fillRect(8, 14, 28, 4); }
      else { g.fillStyle = '#000'; g.fillRect(2, 4, 40, 10); g.fillStyle = '#a06a33'; g.fillRect(4, 6, 36, 8); g.fillStyle = '#d9b341'; g.fillRect(4, 8, 36, 3); }
      return (sc[key] = c);
    }
    const npcSpr = {};
    function npcSprite(id) { // b21 art (idle, facing down, first frame) cached once; a code figure until it loads or when art is off
      if (npcSpr[id]) return npcSpr[id];
      const c = mk(56, 72); const g = c.getContext('2d'); const h = MMRng.hash(id);
      g.fillStyle = '#000'; g.fillRect(14, 28, 28, 42); g.fillStyle = 'hsl(' + (h % 360) + ',45%,48%)'; g.fillRect(16, 30, 24, 38);
      g.fillStyle = '#000'; g.beginPath(); g.arc(28, 20, 13, 0, Math.PI * 2); g.fill(); g.fillStyle = '#f0cfa6'; g.beginPath(); g.arc(28, 20, 11, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#222'; g.fillRect(23, 18, 3, 4); g.fillRect(31, 18, 3, 4);
      npcSpr[id] = c;
      if (opts.assetRoot && NPC_IDS.indexOf(id) >= 0) {
        const img = new Image();
        img.onload = () => { if (img.naturalHeight >= 64) { const a = mk(72, 72); const ag = a.getContext('2d'); ag.imageSmoothingEnabled = false; ag.drawImage(img, 0, 0, img.naturalHeight, img.naturalHeight, 0, 0, 72, 72); npcSpr[id] = a; } };
        img.src = opts.assetRoot.replace(/\/+$/, '') + '/b21-npcs-and-vendors/enemies/' + id + '/' + id + '_idle_down.png';
      }
      return c;
    }
    function drawSites(g, vx0, vy0, vx1, vy1, tt, reduced) {
      SITES.shrines.forEach((q) => {
        const c = sPx(q); if (c.x < vx0 || c.x > vx1 || c.y < vy0 - 60 || c.y > vy1 + 60) return;
        const lit = shrineReady(q);
        if (lit) { if (!sc['g' + q.kind]) sc['g' + q.kind] = glowSprite(SHRINE_COL[q.kind]); g.globalAlpha = reduced ? 0.45 : 0.35 + 0.2 * Math.sin(tt * 2.4 + q.x); g.drawImage(sc['g' + q.kind], c.x - 64, c.y - 80); g.globalAlpha = 1; }
        g.drawImage(shrineSprite(q.kind, lit), c.x - 24, c.y - 70);
      });
      SITES.camps.forEach((q) => {
        const cx = (q.chest.x + 0.5) * TILE; const cy = (q.chest.y + 0.5) * TILE; if (cx < vx0 || cx > vx1 || cy < vy0 || cy > vy1) return;
        g.drawImage(chestSprite(chestOpen.has(q.id)), cx - 22, cy - 22);
      });
      SITES.npcs.forEach((q) => {
        const c = sPx(q); if (c.x < vx0 || c.x > vx1 || c.y < vy0 - 50 || c.y > vy1 + 50) return;
        const s = npcSprite(q.npc); g.drawImage(s, c.x - s.width / 2, c.y + 14 - s.height);
      });
    }
    function applyBuff(b) {
      const p = arena.player; const now = arena.clock;
      if (b.kind === 'heal') { const add = Math.ceil(arena.stats.maxHp * b.value); p.hp = Math.min(arena.stats.maxHp, p.hp + add); arena._floatText(p.x, p.y - 30, `+${add}`, '#5be38a'); }
      else if (b.kind === 'rage') { rageEnd = now + b.durationMs / 1000; arena.buffDmg = b.value; arena._calcStats(); arena._floatText(p.x, p.y - 30, 'Fury!', '#ff6a4a'); }
      else if (b.kind === 'ward') { wardEnd = now + b.durationMs / 1000; arena.buffTaken = b.value; arena._floatText(p.x, p.y - 30, 'Ward!', '#6ab8ff'); }
      arena._syncHud();
    }
    function useShrine(i) {
      const q = SITES && SITES.shrines[i]; if (!q) return { ok: false, left: 0 };
      const r = MMSites.useShrine(shrineAt, q, sNow());
      if (!r.ok) { say(`${SHRINE_TXT[q.kind]} is resting (${fmtT(r.left / 1000)})`); return { ok: false, left: r.left }; }
      Object.assign(shrineAt, r.state); save.shrineAt = Object.assign({}, shrineAt); writeSave(save); miniKey = '';
      applyBuff(r.buff);
      say(`${SHRINE_TXT[q.kind]}: ${{ heal: 'restored', rage: 'more damage for 60s', ward: 'less damage taken for 60s' }[q.kind]}`); siteKeyShown = '';
      return { ok: true, buff: r.buff, left: 0 };
    }
    function openChest(i) {
      const q = SITES && SITES.camps[i]; if (!q || chestOpen.has(q.id)) return { ok: false };
      chestOpen.add(q.id); save.chests = Array.from(chestOpen); writeSave(save); miniKey = '';
      const info = { zone: q.zone, tier: q.zone };
      const got = giveBag((q.chest.x + 0.5) * TILE, (q.chest.y + 0.5) * TILE, Z.rollDrop(info, seed + ':chest:' + q.id).bag, info);
      say(got.items.length ? 'Chest opened: loot spills out' : 'Chest opened'); siteKeyShown = '';
      return { ok: true, items: got.items.length, shards: got.shards };
    }
    function talk(i) {
      const q = SITES && SITES.npcs[i]; if (!q) return null;
      const t = `${NPC_NAME[q.npc] || 'Traveller'}: ${MMRng.create(seed + ':greet:' + q.id + ':' + (greetN++)).pick(GREET)}`; say(t); return t;
    }
    function campTick() {
      const p = arena.player;
      SITES.camps.forEach((q) => {
        const c = sPx(q); const d = Math.hypot(p.x - c.x, p.y - c.y); let st = campSt.get(q.id);
        if (!st) { st = { ents: [], cleared: false }; campSt.set(q.id, st); }
        if (st.ents.length) {
          let alive = 0; st.ents.forEach((e) => { if (e.active && e.campId === q.id) alive++; });
          if (!alive) { st.ents = []; st.cleared = true; }
          else if (d > 26 * TILE) { st.ents.forEach((e) => { if (e.active && e.campId === q.id) { e.active = false; e.campId = null; } }); st.ents = []; }
        } else if (!st.cleared && d < 15 * TILE) {
          q.patrol.forEach((m) => {
            const e = arena.spawnEnemy(m.type, (m.x + 0.5) * TILE, (m.y + 0.5) * TILE); if (!e) return;
            scaleEnemy(e, q.zone, e.maxHp); e.art = m.art; e.zone = q.zone; e.tier = q.zone; e.campId = q.id; e.zid = -1; st.ents.push(e);
          });
        }
      });
    }
    function siteTick(dt) {
      if (noteT > 0) { noteT -= dt; if (noteT <= 0) siteNote.classList.add('hidden'); }
      const now = arena.clock;
      if (rageEnd && now >= rageEnd) { rageEnd = 0; arena.buffDmg = 1; arena._calcStats(); }
      if (wardEnd && now >= wardEnd) { wardEnd = 0; arena.buffTaken = 1; }
      siteTickT -= dt; if (siteTickT > 0) return; siteTickT = 0.25;
      campTick();
      const p = arena.player; let best = null; let bd = SITE_R * SITE_R;
      if (arena.state === 'play' && !arena.paused) {
        const test = (kind, i, q, c) => { const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2; if (d < bd) { bd = d; best = { kind, i, q }; } };
        SITES.shrines.forEach((q, i) => test('shrine', i, q, sPx(q)));
        SITES.camps.forEach((q, i) => { if (!chestOpen.has(q.id)) test('chest', i, q, { x: (q.chest.x + 0.5) * TILE, y: (q.chest.y + 0.5) * TILE }); });
        SITES.npcs.forEach((q, i) => test('npc', i, q, sPx(q)));
      }
      siteFor = best;
      let key = ''; let txt = '';
      if (best) {
        if (best.kind === 'shrine') { const l = shrineLeft(best.q); txt = l ? `${SHRINE_TXT[best.q.kind]} (${fmtT(l / 1000)})` : `Pray at ${SHRINE_TXT[best.q.kind]} (E)`; }
        else if (best.kind === 'chest') txt = 'Open chest (E)'; else txt = `Talk to ${NPC_NAME[best.q.npc] || 'traveller'} (E)`;
        key = best.kind + best.i + txt;
      }
      if (key !== siteKeyShown) { siteKeyShown = key; siteBtn.classList.toggle('hidden', !best); if (best) { siteBtn.textContent = txt; siteBtn.setAttribute('aria-label', txt); } }
    }
    function siteAct() {
      if (!siteFor) return;
      const s = siteFor; if (s.kind === 'shrine') useShrine(s.i); else if (s.kind === 'chest') openChest(s.i); else talk(s.i);
      siteTickT = 0;
    }
    siteBtn.addEventListener('click', siteAct);
    window.addEventListener('keydown', (ev) => { if ((ev.key === 'e' || ev.key === 'E') && !ev.repeat && siteFor && arena.active && !arena.paused && arena.state === 'play') { ev.preventDefault(); siteAct(); } });

    const hooks = {
      onStart() {
        if (pendingAt) { placeAt(pendingAt.x, pendingAt.y); pendingAt = null; } else placeAt(world.spawnPoint.x, world.spawnPoint.y);
        arena.run.wave = 0; arena.biome = 0;
        resetZones();
        kills = 0; spawned = 0; despawned = 0; lastDrops.length = 0;
        bossReadyNow.fill(0); bossT = 0; sweepT = 0;
        promptFor = -2; leaving = false;
        rageEnd = 0; wardEnd = 0; arena.buffDmg = 1; arena.buffTaken = 1; campSt.clear(); siteKeyShown = '';
        if (save.returnTo) { save.returnTo = null; writeSave(save); } // back from a dungeon: the trip is over
        // events: the clock continues from the save (or from where this visit was, on a restart); creatures of a running event rest
        if (evStarted) settle('restart'); // a restart ends the leg too
        evBase = Math.max(save.evT, evStarted ? lastEvClock : 0) - arena.clock; evStarted = true;
        evState.forEach((st) => { if (st.phase === 'active' || st.phase === 'upcoming') evRest(st); });
        evT = 0; hintT = 0; hintEl.classList.add('hidden');
        arena._showBanner(`The Realm · island #${seed}`, 1.8);
        savePos(true); evTick(); syncHud(true);
      },
      tick(dt) {
        if (zones) {
          const p = arena.player; const out = zones.update(p.x, p.y, Math.min(dt, 0.1), arena.clock);
          for (let k = 0; k < out.despawn.length; k++) { const id = out.despawn[k]; const e = live.get(id); if (e && e.active && e.zid === id) { e.active = false; e.zid = -1; despawned++; } live.delete(id); } // free pool slots first
          for (let k = 0; k < out.spawn.length; k++) if (!spawnZ(out.spawn[k])) zones.markDead(out.spawn[k].id, arena.clock); // pool full: the spawner must not count it
          bossT -= dt; if (bossT <= 0) { bossT = 0.5; bossTick(); }
          sweepT -= dt; if (sweepT <= 0) { sweepT = 1; sweepLost(); }
        }
        portalTick();
        if (SITES) siteTick(dt);
        lastEvClock = eventClock();
        evT -= dt; if (evT <= 0) { evT = 0.25; evTick(); }
        evHint(dt);
        hudT -= dt; saveT -= dt;
        if (hudT <= 0) { hudT = 0.25; syncHud(false); }
        if (saveT <= 0) { saveT = 2; savePos(false); }
      },
      drawUnder(g, cam) {
        frameNo++;
        g.fillStyle = PAL.deep_water[0]; g.fillRect(cam.x - 80, cam.y - 80, arena.W + 160, arena.H + 160);
        const c0 = Math.max(0, Math.floor((cam.x - 8) / CPX)); const c1 = Math.min(ccols - 1, Math.floor((cam.x + arena.W + 8) / CPX));
        const r0 = Math.max(0, Math.floor((cam.y - 8) / CPX)); const r1 = Math.min(crows - 1, Math.floor((cam.y + arena.H + 8) / CPX));
        const tt = arena.clock; const reduced = arena._reduced;
        for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
          const key = cy * ccols + cx;
          let e = chunks.get(key);
          if (!e) { e = buildChunk(cx, cy); chunks.set(key, e); }
          e.used = frameNo;
          g.drawImage(e.cv, cx * CPX, cy * CPX);
          if (e.water) { g.globalAlpha = reduced ? 0.35 : 0.2 + 0.25 * (0.5 + 0.5 * Math.sin(tt * 1.6 + cx + cy)); g.drawImage(e.water, cx * CPX + (reduced ? 0 : Math.round(Math.sin(tt * 0.9 + cy) * 3)), cy * CPX); g.globalAlpha = 1; }
        }
        evict();
        const vx0 = cam.x - 80; const vy0 = cam.y - 80; const vx1 = cam.x + arena.W + 80; const vy1 = cam.y + arena.H + 80;
        for (let i = 0; i < portals.length; i++) { const q = portals[i]; if (q.x > vx0 && q.x < vx1 && q.y > vy0 && q.y < vy1) drawPortal(g, q, tt, reduced); }
        for (let i = 0; i < world.bossSites.length; i++) { // a ready altar glows (the boss wakes when you come close)
          const b = world.bossSites[i]; const bx = (b.x + 0.5) * TILE; const by = (b.y + 0.5) * TILE;
          if (bx < vx0 || bx > vx1 || by < vy0 || by > vy1 || bossLive[i] || !bossReadyNow[i]) continue;
          g.globalAlpha = reduced ? 0.5 : 0.35 + 0.25 * Math.sin(tt * 3); g.strokeStyle = '#ff3b3b'; g.lineWidth = 3; g.beginPath(); g.arc(bx, by, 22, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
          g.font = 'bold 12px system-ui, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#000'; g.fillText(BOSS_NAME[i], bx + 1, by - 29); g.fillStyle = '#ff8a8a'; g.fillText(BOSS_NAME[i], bx, by - 30);
        }
        if (SITES) drawSites(g, vx0, vy0, vx1, vy1, tt, reduced);
        evState.forEach((st) => { // event sites: a beacon (upcoming: gold, active: orange) above the ring of stones
          if (st.phase !== 'upcoming' && st.phase !== 'active') return;
          const c = siteXY(st); if (c.x < vx0 - 80 || c.x > vx1 + 80 || c.y < vy0 - 80 || c.y > vy1 + 80) return;
          const col = st.phase === 'active' ? '#ff8a2a' : '#ffe27a';
          g.globalAlpha = reduced ? 0.3 : 0.2 + 0.12 * Math.sin(tt * 2.5); g.fillStyle = col; g.beginPath(); g.arc(c.x, c.y, 70, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
          drawBeacon(g, c.x, c.y - 30 + (reduced ? 0 : Math.sin(tt * 2) * 4), 12, col, tt, reduced);
          const label = `${evTitle(st)} · ${st.phase === 'active' ? fmtT(st.ev.endsAt - eventClock()) + ' left' : 'in ' + fmtT(st.ev.startsAt - eventClock())}`;
          g.font = 'bold 12px system-ui, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#000'; g.fillText(label, c.x + 1, c.y - 51); g.fillStyle = col; g.fillText(label, c.x, c.y - 52);
        });
      },
      drawOver(g) { // a raid boss telegraphs its next burst: a red ring that closes in during the last second
        evState.forEach((st) => {
          if (st.phase !== 'active' || st.plan.kind !== 'boss') return;
          const e = st.ents[0]; if (!e || !e.active || e.evid !== st.id || e.invuln > 0 || !(e.cd2 < 1)) return;
          const k = Math.max(0, Math.min(1, e.cd2));
          g.strokeStyle = '#ff3b3b'; g.globalAlpha = 0.85 - 0.5 * k; g.lineWidth = 4; g.beginPath(); g.arc(e.x, e.y, 44 + 90 * k, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
        });
      },
    };
    arena.onEnemyKilled = onEnemyKilled; arena.onEnemyHit = onEnemyHit;
    arena.setMode('world');
    arena.setWorld({ w: WW, h: WH, tile: TILE, camera: true, solidAt, shotSolidAt, moveScaleAt, onStart: hooks.onStart, tick: hooks.tick, drawUnder: hooks.drawUnder, drawOver: hooks.drawOver, pools: { enemies: 72, eBullets: 700 } });
    if (typeof window !== 'undefined') window.addEventListener('pagehide', () => { savePos(true); settle('leave'); });
    if (opts.assetRoot && opts.tileArt !== false) loadTileArt(opts.assetRoot);

    const api = {
      seed, world, genMs, SAVE_KEY, TILE, CPX, MAX_CHUNKS,
      chunkCount: () => chunks.size, chunkBuilds: () => chunkBuilds, artTiles: () => artTiles, miniDraws: () => miniDraws,
      zone: () => lastZone, hudText: () => ({ zone: zName.textContent, coords: zCoords.textContent, arrow: arrowDeg }),
      tileAt: (x, y) => O.tileAt(world, Math.floor(x / TILE), Math.floor(y / TILE)), solidAt, shotSolidAt, nearestFree,
      tileCenter: (tx, ty) => ({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE }),
      save: () => readSave(), savePos, portals: () => portals.map((q) => ({ i: q.i, x: q.x, y: q.y, tx: q.tx, ty: q.ty, biome: q.biome })),
      syncHud, loadTileArt,
      // minimap fog (slice A1)
      discovered: () => ({ on: fogOn, count: FOG ? FOG.count(fogBits) : 0, b64: FOG ? FOG.encode(fogBits) : '', has: (cx, cy) => (FOG ? FOG.has(fogBits, cx, cy) : false) }),
      revealAt: (tx, ty) => { const n = revealAt(tx, ty); if (n > 0) drawMini(false); return n; },
      // slice 6
      diffOn: !!DIFF, diffMode, diffAt, spawner: () => zones, spawned: () => spawned, despawned: () => despawned,
      liveCount: () => { let n = 0; live.forEach((e, id) => { if (e.active && e.zid === id) n++; }); return n; },
      liveEnemies: () => { const o = []; live.forEach((e, id) => { if (e.active && e.zid === id) o.push({ id, x: e.x, y: e.y, type: e.type, zone: e.zone, tier: e.tier, art: e.art, hp: e.maxHp, spd: e.spdMul, dmg: e.dmgMul, diff: e.diff || null }); }); return o; },
      enemyById: (id) => live.get(id) || null, setDropAll: (on) => { dropAll = !!on; }, lastDrops: () => lastDrops.slice(), kills: () => kills,
      bossSites: () => world.bossSites.map((b, i) => ({ i, x: b.x, y: b.y, zone: b.zone, boss: b.boss, name: BOSS_NAME[i], live: !!(bossLive[i] && bossLive[i].active), ready: !!zones && zones.bossReady(b, arena.clock) })),
      bossEntity: (i) => bossLive[i] || null, bossTick,
      // slice 7
      portalPrompt: () => promptFor, portalUrls, portalSeed, enterPortal, lastPortalUrl: null, RETURN_RE,
      // world events (slice A): the clock hook moves the event clock (deterministic: same clock => same events, plans and rewards)
      eventClock, setEventClock: (t) => { evBase = Math.max(0, Number(t) || 0) - arena.clock; evT = 0; evTick(); return eventClock(); },
      jumpEventClock: (dt) => { evBase += Number(dt) || 0; evT = 0; evTick(); return eventClock(); },
      eventTick: () => evTick(), eventsNow: () => Z.eventsFor(world, eventClock()), eventMarkers: evMarkers,
      events: () => { const o = []; evState.forEach((st) => o.push({ id: st.id, kind: st.plan.kind, region: st.plan.region, boss: st.plan.boss, site: st.plan.site, phase: st.phase, startsAt: st.ev.startsAt, endsAt: st.ev.endsAt, alive: evAliveEnts(st), spawned: st.ents.length, total: st.total, dealt: st.dealt, reward: st.reward })); return o; },
      eventEntities: (id) => { const st = evState.get(id); return st ? st.ents.filter((e) => e.active && e.evid === id) : []; },
      eventHud: () => ({ text: evEl.textContent, hidden: evEl.classList.contains('hidden'), state: evEl.dataset.state || '', hint: hintEl.classList.contains('hidden') ? '' : hintEl.textContent }),
      setEventCredit: (on) => { evCredit = !!on; }, lastEventReward: () => lastEvReward,
      onEventFame: ST ? (n) => { try { ST.addFameTo(localStorage, n); } catch (e) { /* storage blocked */ } } : null,
      // Lantern stash payout (slice B)
      sites: () => (SITES ? { shrines: SITES.shrines.map((q, i) => ({ i, id: q.id, x: q.x, y: q.y, kind: q.kind, zone: q.zone, ready: shrineReady(q), left: shrineLeft(q) })), camps: SITES.camps.map((q, i) => ({ i, id: q.id, x: q.x, y: q.y, chest: q.chest, patrol: q.patrol.length, opened: chestOpen.has(q.id), alive: (campSt.get(q.id) || { ents: [] }).ents.filter((e) => e.active && e.campId === q.id).length })), npcs: SITES.npcs.map((q, i) => ({ i, id: q.id, x: q.x, y: q.y, npc: q.npc })) } : null),
      useShrine, openChest, talkNpc: talk, sitePrompt: () => (siteFor ? { kind: siteFor.kind, i: siteFor.i, text: siteBtn.textContent, hidden: siteBtn.classList.contains('hidden') } : null), siteNote: () => ({ text: siteNote.textContent, hidden: siteNote.classList.contains('hidden') }), siteTick,
      settle, stashNote, lastSettle: () => lastSettle, finds: () => (ST ? ST.readFinds(localStorage) : null),
    };
    return { api, hooks };
  }

  window.RealmWorld = { create, cleanSave, cleanSeed, readSave, writeSave, SAVE_KEY, PAL };
})();
