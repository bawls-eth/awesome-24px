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
    Object.keys(o).forEach((k) => { if (/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(k) && !/^(v|seed|version|pos|stats|returnTo)$/.test(k)) out[k] = o[k]; }); // keep unknown (future) keys
    out.v = 1;
    out.seed = cleanSeed(o.seed);
    out.version = Number.isInteger(o.version) && o.version > 0 && o.version < 1000 ? o.version : 0;
    const p = o.pos && typeof o.pos === 'object' ? o.pos : null;
    out.pos = p && Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.y >= 0 && p.x < 4096 && p.y < 4096 ? { x: p.x, y: p.y } : null;
    const st = o.stats && typeof o.stats === 'object' ? o.stats : {};
    const n = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.min(Math.floor(Number(v)), 9999999) : 0);
    out.stats = { kills: n(st.kills), bossKills: n(st.bossKills), portals: n(st.portals) };
    const r = o.returnTo && typeof o.returnTo === 'object' ? o.returnTo : null;
    out.returnTo = r && Number.isInteger(r.x) && Number.isInteger(r.y) && r.x >= 0 && r.y >= 0 && r.x < 4096 && r.y < 4096 && cleanSeed(r.seed) ? { x: r.x, y: r.y, seed: cleanSeed(r.seed) } : null;
    return out;
  }
  function readSave() { try { return cleanSave(localStorage.getItem(SAVE_KEY)); } catch (e) { return cleanSave(null); } }
  function writeSave(s) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(cleanSave(s))); return true; } catch (e) { return false; } }

  function create(arena, opts) {
    opts = opts || {};
    const O = window.MMOverworld; const Z = window.MMZones;
    const T = O.TERRAIN; const TN = O.TERRAIN_NAMES;
    const save = readSave();
    let seed = cleanSeed(opts.seed) || save.seed;
    if (!seed) seed = String(Math.floor(Math.random() * 900000) + 100000); // first visit: a fresh island, remembered below
    if (save.seed !== seed) { save.pos = null; save.returnTo = null; }
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
    const tileArt = Object.create(null); // terrain id -> [img...]
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
              const mt = a && typeof a.id === 'string' ? /^tile_([a-z_]+)_([a-d])$/.exec(a.id) : null;
              if (!mt || !Object.prototype.hasOwnProperty.call(T, mt[1]) || !okPath(a.path)) return null;
              return new Promise((res) => {
                const img = new Image();
                img.onload = () => { if (img.naturalWidth >= 16) { const tid = T[mt[1]]; (tileArt[tid] = tileArt[tid] || []).push(img); artTiles++; } res(); };
                img.onerror = () => res();
                img.src = join(join(root, id), a.path);
              });
            }));
          }).catch(() => null);
        }));
      }).then(() => { if (artTiles) dropChunks(); return artTiles; }).catch(() => 0);
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
      const x0 = cx * CH; const y0 = cy * CH; let water = false;
      for (let ty = 0; ty < CH; ty++) for (let tx = 0; tx < CH; tx++) {
        const wx = x0 + tx; const wy = y0 + ty; const px = tx * TILE; const py = ty * TILE;
        if (wx >= ww || wy >= wh) { rect(g, PAL.deep_water[0], px, py, TILE, TILE); continue; }
        const i = wy * ww + wx; const t = terrain[i]; const pal = PAL[TN[t]] || PAL.grass;
        const art = tileArt[t];
        if (t === T.deep_water || t === T.shallow_water) water = true;
        if (art && art.length) g.drawImage(art[Math.floor(h2(wx, wy, 91) * art.length)], px, py, TILE, TILE);
        else {
          rect(g, pal[0], px, py, TILE, TILE);
          for (let k = 0; k < 3; k++) { const r = h2(wx * 3 + k, wy, 7); if (r < 0.55) rect(g, r < 0.27 ? pal[1] : pal[2], px + Math.floor(h2(wx, wy * 5 + k, 11) * 26), py + Math.floor(h2(wx * 7 + k, wy, 13) * 26), t === T.flower_meadow ? 3 : 6, t === T.flower_meadow ? 3 : 4); }
        }
        if (solid[i] && t !== T.deep_water) { rect(g, 'rgba(0,0,0,0.28)', px, py, TILE, TILE); rect(g, 'rgba(255,255,255,0.18)', px, py, TILE, 4); rect(g, 'rgba(0,0,0,0.35)', px, py + TILE - 5, TILE, 5); }
      }
      // darker edge line where neighbouring terrain differs
      for (let ty = 0; ty < CH; ty++) for (let tx = 0; tx < CH; tx++) {
        const wx = x0 + tx; const wy = y0 + ty; if (wx >= ww || wy >= wh) continue;
        const t = terrain[wy * ww + wx]; const e = (PAL[TN[t]] || PAL.grass)[3]; const px = tx * TILE; const py = ty * TILE;
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
    const mini = document.createElement('canvas'); mini.id = 'rw-minimap'; mini.width = 96; mini.height = 96; mini.setAttribute('aria-label', 'World map (tap to enlarge)'); mini.setAttribute('role', 'img');
    const zoneEl = document.createElement('div'); zoneEl.id = 'rw-zone'; zoneEl.setAttribute('aria-live', 'polite');
    zoneEl.innerHTML = '<div class="rw-zname"></div><div class="rw-zsub"><span class="rw-arrow" aria-hidden="true">➤</span> <span class="rw-coords"></span></div>';
    const ov = document.getElementById('realm-overlay') || document.body;
    ov.appendChild(mini); ov.appendChild(zoneEl);
    mini.addEventListener('click', () => mini.classList.toggle('big'));
    const zName = zoneEl.querySelector('.rw-zname'); const zArrow = zoneEl.querySelector('.rw-arrow'); const zCoords = zoneEl.querySelector('.rw-coords');
    let miniBase = null;
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
      const key = (tx >> 1) + ',' + (ty >> 1) + ',' + bossesKey();
      if (!force && key === miniKey) return;
      miniKey = key; miniDraws++;
      if (!miniBase) miniBase = buildMiniBase();
      const g = mini.getContext('2d'); const k = 96 / ww;
      g.imageSmoothingEnabled = true; g.drawImage(miniBase, 0, 0, ww, wh, 0, 0, 96, 96);
      for (let i = 0; i < portals.length; i++) { const q = portals[i]; g.fillStyle = '#000'; g.fillRect(q.tx * k - 2.5, q.ty * k - 2.5, 5, 5); g.fillStyle = q.col; g.fillRect(q.tx * k - 1.5, q.ty * k - 1.5, 3, 3); }
      for (let i = 0; i < world.bossSites.length; i++) { const b = world.bossSites[i]; g.fillStyle = bossMarkCol(i); g.beginPath(); g.arc(b.x * k, b.y * k, 2, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#000'; g.fillRect(tx * k - 2.5, ty * k - 2.5, 5, 5); g.fillStyle = '#fff'; g.fillRect(tx * k - 1.5, ty * k - 1.5, 3, 3);
    }
    function syncHud(force) {
      const p = arena.player; const tx = Math.floor(p.x / TILE); const ty = Math.floor(p.y / TILE);
      const zi = Z.zoneInfoAt(world, tx, ty); lastZone = zi;
      const txt = `${zi.name} · ${zi.danger}`;
      if (txt !== zoneTxt || force) { zoneTxt = txt; zName.textContent = txt; zName.style.color = zi.color; zoneEl.dataset.zone = String(zi.zone); }
      const dx = world.center.x - tx; const dy = world.center.y - ty; const dist = Math.round(Math.hypot(dx, dy));
      const deg = Math.round(Math.atan2(dy, dx) * 180 / Math.PI / 5) * 5;
      if (deg !== arrowDeg) { arrowDeg = deg; zArrow.style.transform = `rotate(${deg}deg)`; }
      const ct = `${tx},${ty} · centre ${dist}`;
      if (zCoords.textContent !== ct) zCoords.textContent = ct;
      const w = document.getElementById('realm-wave'); if (w && w.textContent !== zi.name) w.textContent = zi.name;
      const b = document.getElementById('realm-biome'); if (b && b.textContent !== zi.danger) b.textContent = zi.danger;
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
    function spawnZ(rec) {
      let x = rec.x; let y = rec.y;
      if (solidAt(x, y)) { const g = groups[rec.group]; x = (g.x + 0.5) * TILE; y = (g.y + 0.5) * TILE; }
      const e = arena.spawnEnemy(rec.type, x, y);
      if (!e) return null;
      const def = RM_ENEMIES[rec.type];
      e.maxHp = Math.max(1, Math.ceil(def.hp * rec.hpMul)); e.hp = e.maxHp;
      e.spdMul = rec.speedMul; e.dmgMul = rec.dmgMul; e.xpMul = rec.xpMul; e.shardMul = rec.shardMul;
      e.art = rec.creature; e.zid = rec.id; e.zone = rec.zone; e.tier = rec.tier;
      live.set(rec.id, e); spawned++;
      return e;
    }
    function giveBag(x, y, bag, info) {
      const got = { zone: info.zone, boss: !!info.boss, tier: bag.tier, items: [], shards: bag.shards, potions: bag.potions };
      bag.items.forEach((it, k) => { const b = arena.dropBag(x + (k - (bag.items.length - 1) / 2) * 18, y + 10, it.r, it.id); if (b) got.items.push({ id: it.id, r: it.r }); });
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
    function onEnemyHit(e) { if (zones && e.zid >= 0) zones.markCombat(e.zid); }
    function onEnemyKilled(e) {
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
        if (alive < 0 && d < 9 * TILE && zones.bossReady(b, arena.clock)) spawnBoss(i);
      }
    }
    function bossesKey() { let k = ''; for (let i = 0; i < bossLive.length; i++) k += bossLive[i] ? 'L' : zones && zones.bossReady(world.bossSites[i], arena.clock) ? 'R' : 'c'; return k; }
    function bossMarkCol(i) { return bossLive[i] ? '#ff5fa2' : zones && zones.bossReady(world.bossSites[i], arena.clock) ? '#ff3b3b' : '#6b6b6b'; }

    // ---------- portals into Warren dungeons and back (slice 7) ----------
    const RETURN_RE = /^index\.html\?mode=world&seed=[A-Za-z0-9_-]{1,24}&at=\d{1,4},\d{1,4}(&test=1)?$/;
    const portalBtn = document.createElement('button'); portalBtn.id = 'rw-portal'; portalBtn.type = 'button'; portalBtn.className = 'hidden'; portalBtn.textContent = 'Enter Warren dungeon';
    ov.appendChild(portalBtn);
    let promptFor = -1; let leaving = false;
    function portalSeed(i) { return String(MMRng.hash(seed + ':portal:' + i) % 100000); }
    function portalUrls(i) {
      const q = portals[i];
      const ret = 'index.html?mode=world&seed=' + seed + '&at=' + q.tx + ',' + q.ty + (opts.test ? '&test=1' : '');
      const url = 'index.html?mode=dungeon&seed=' + portalSeed(i) + '&lv=2&return=' + encodeURIComponent(ret) + (opts.test ? '&test=1' : '');
      return { ret: RETURN_RE.test(ret) ? ret : null, url };
    }
    function enterPortal(i) {
      if (leaving || !(i >= 0 && i < portals.length) || !arena.active) return null;
      const q = portals[i]; const u = portalUrls(i);
      if (!u.ret) return null;
      leaving = true;
      save.pos = { x: q.tx, y: q.ty }; save.returnTo = { x: q.tx, y: q.ty, seed }; save.stats.portals++;
      writeSave(save); arena.onSave(arena.save);
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
        if (near >= 0) portalBtn.setAttribute('aria-label', `Enter Warren dungeon (${portals[near].label}, Enter)`);
      }
    }

    // ---------- the hooks the arena calls ----------
    let pendingAt = null;
    if (typeof opts.at === 'string' && AT_RE.test(opts.at)) { const m = AT_RE.exec(opts.at); pendingAt = { x: Math.min(ww - 1, Number(m[1])), y: Math.min(wh - 1, Number(m[2])) }; }
    let saveT = 0; let lastSavedKey = '';
    function savePos(force) {
      const p = arena.player; const pos = { x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) };
      const k = pos.x + ',' + pos.y;
      if (!force && k === lastSavedKey) return;
      lastSavedKey = k; save.pos = pos; writeSave(save);
    }
    function placeAt(tx, ty) {
      const f = nearestFree(tx, ty, 8) || world.spawnPoint;
      const p = arena.player; p.x = (f.x + 0.5) * TILE; p.y = (f.y + 0.5) * TILE; p.iframes = Math.max(p.iframes, 2);
    }
    const hooks = {
      onStart() {
        if (pendingAt) { placeAt(pendingAt.x, pendingAt.y); pendingAt = null; } else placeAt(world.spawnPoint.x, world.spawnPoint.y);
        arena.run.wave = 0; arena.biome = 0;
        resetZones(); kills = 0; promptFor = -2; leaving = false;
        if (save.returnTo) { save.returnTo = null; writeSave(save); } // back from a dungeon: the trip is over
        arena._showBanner(`The Realm · island #${seed}`, 1.8);
        savePos(true); syncHud(true);
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
      },
      drawOver() {},
    };
    arena.onEnemyKilled = onEnemyKilled; arena.onEnemyHit = onEnemyHit;
    arena.setMode('world');
    arena.setWorld({ w: WW, h: WH, tile: TILE, camera: true, solidAt, shotSolidAt, onStart: hooks.onStart, tick: hooks.tick, drawUnder: hooks.drawUnder, drawOver: hooks.drawOver, pools: { enemies: 72, eBullets: 700 } });
    if (typeof window !== 'undefined') window.addEventListener('pagehide', () => savePos(true));
    if (opts.assetRoot && opts.tileArt !== false) loadTileArt(opts.assetRoot);

    const api = {
      seed, world, genMs, SAVE_KEY, TILE, CPX, MAX_CHUNKS,
      chunkCount: () => chunks.size, chunkBuilds: () => chunkBuilds, artTiles: () => artTiles, miniDraws: () => miniDraws,
      zone: () => lastZone, hudText: () => ({ zone: zName.textContent, coords: zCoords.textContent, arrow: arrowDeg }),
      tileAt: (x, y) => O.tileAt(world, Math.floor(x / TILE), Math.floor(y / TILE)), solidAt, shotSolidAt, nearestFree,
      tileCenter: (tx, ty) => ({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE }),
      save: () => readSave(), savePos, portals: () => portals.map((q) => ({ i: q.i, x: q.x, y: q.y, tx: q.tx, ty: q.ty, biome: q.biome })),
      syncHud, loadTileArt,
      // slice 6
      spawner: () => zones, spawned: () => spawned, despawned: () => despawned,
      liveCount: () => { let n = 0; live.forEach((e, id) => { if (e.active && e.zid === id) n++; }); return n; },
      liveEnemies: () => { const o = []; live.forEach((e, id) => { if (e.active && e.zid === id) o.push({ id, x: e.x, y: e.y, type: e.type, zone: e.zone, tier: e.tier, art: e.art, hp: e.maxHp, spd: e.spdMul, dmg: e.dmgMul }); }); return o; },
      enemyById: (id) => live.get(id) || null, setDropAll: (on) => { dropAll = !!on; }, lastDrops: () => lastDrops.slice(), kills: () => kills,
      bossSites: () => world.bossSites.map((b, i) => ({ i, x: b.x, y: b.y, zone: b.zone, boss: b.boss, name: BOSS_NAME[i], live: !!(bossLive[i] && bossLive[i].active), ready: !!zones && zones.bossReady(b, arena.clock) })),
      bossEntity: (i) => bossLive[i] || null, bossTick,
      // slice 7
      portalPrompt: () => promptFor, portalUrls, portalSeed, enterPortal, lastPortalUrl: null, RETURN_RE,
    };
    return { api, hooks };
  }

  window.RealmWorld = { create, cleanSave, cleanSeed, readSave, writeSave, SAVE_KEY, PAL };
})();
