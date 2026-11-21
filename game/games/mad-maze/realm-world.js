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
  function questDate() { // UTC day of the daily quests; ?qdate=YYYY-MM-DD only under ?test=1 (tests pin a day)
    let d = null;
    try { const m = /[?&]qdate=(\d{4}-\d{2}-\d{2})(&|$)/.exec(location.search); if (m && /[?&]test=1(&|$)/.test(location.search) && window.MMDaily) d = window.MMDaily.cleanDate(m[1]); } catch (e) { d = null; }
    return d || new Date().toISOString().slice(0, 10);
  }
  function cleanSave(raw) {
    let o = raw;
    if (typeof o === 'string') { try { o = JSON.parse(o); } catch (e) { o = null; } }
    if (!o || typeof o !== 'object' || Array.isArray(o)) o = {};
    const out = {};
    Object.keys(o).forEach((k) => { if (/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(k) && !/^(v|seed|version|pos|stats|returnTo|evT|evDone|finds|discovered|shrineAt|chests|quests)$/.test(k)) out[k] = o[k]; }); // keep unknown (future) keys
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
    if (o.quests !== undefined && window.MMQuests) out.quests = window.MMQuests.clean(o.quests, questDate()); // daily quests (additive): bad shape or another day -> fresh
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
    let bossesClassic = false; try { bossesClassic = /[?&]bosses=classic(&|$)/.test(location.search); } catch (e) { bossesClassic = false; } // b23: ?bosses=classic restores the original eight boss ids
    let rosterClassic = false; try { rosterClassic = /[?&]roster=classic(&|$)/.test(location.search); } catch (e) { rosterClassic = false; } // b24: ?roster=classic restores the original creature table (positions are identical either way)
    // PLAYTEST-REVIEW-2 #1: wide zone bands + border toasts/slow by default; ?zonegrad=0 restores all of today's behaviour (classic bands, no toasts),
    // ?bands=classic only the old generation (the toasts stay)
    const qs0 = typeof location !== 'undefined' ? location.search : '';
    const ZGRAD = !/[?&]zonegrad=0(&|$)/.test(qs0);
    const bandsClassic = !ZGRAD || /[?&]bands=classic(&|$)/.test(qs0);
    const gopts = {}; if (bossesClassic) gopts.bosses = 'classic'; if (rosterClassic) gopts.roster = 'classic'; if (bandsClassic) gopts.bands = 'classic';
    const world = O.generate(seed, bossesClassic || rosterClassic || bandsClassic ? gopts : undefined);
    const genMs = performance.now() - t0;
    save.version = world.version || O.VERSION;
    writeSave(save);
    const WW = world.w * TILE; const WH = world.h * TILE;
    const ww = world.w; const wh = world.h;
    const terrain = world.terrain; const solid = world.solid;

    // ---------- collision: every solid tile blocks walking; deep water lets bolts fly over it ----------
    let slowUntil = 0; // zone gradient: a brief slow on the first crossing into a zone above the hero's level (arena clock, s)
    const moveScaleAt = (x, y) => {
      const tx = Math.floor(x / TILE); const ty = Math.floor(y / TILE);
      const k = tx >= 0 && ty >= 0 && tx < ww && ty < wh && terrain[ty * ww + tx] === T.shallow_water ? 0.7 : 1;
      return slowUntil > 0 && arena.clock < slowUntil ? k * ZSLOW : k;
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
      if (artOn) {
        const al = chunkProps(cx, cy);
        for (let k = 0; k < al.length; k++) { const a = wArt[al[k].id]; if (a) g.drawImage(a.img, 0, 0, a.fw, a.fh, (al[k].x - x0) * TILE + 16 - a.ax, (al[k].y - y0) * TILE + 30 - a.ay, a.fw, a.fh); }
      }
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
      const pa = wArt['portal_' + q.biome];
      if (pa) { drawArt(g, pa, frameOf(pa, tt, reduced), q.x, q.y + 23); artDraws.portal++; }
      else drawPortalCode(g, q, tt, reduced);
      g.font = 'bold 12px system-ui, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#000'; g.fillText(q.label, q.x + 1, q.y - 37); g.fillStyle = q.col; g.fillText(q.label, q.x, q.y - 38);
    }
    function drawPortalCode(g, q, tt, reduced) {
      g.save(); g.translate(q.x, q.y);
      g.globalAlpha = 0.25; g.fillStyle = q.col; g.beginPath(); g.arc(0, 0, 30, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
      g.rotate(reduced ? 0 : tt * 1.4); g.strokeStyle = q.col; g.lineWidth = 4; g.setLineDash(DASH); g.beginPath(); g.arc(0, 0, 26, 0, Math.PI * 2); g.stroke();
      g.rotate(reduced ? 0 : -tt * 2.8); g.lineWidth = 2; g.strokeStyle = '#fff'; g.beginPath(); g.arc(0, 0, 16, 0, Math.PI * 2); g.stroke(); g.setLineDash(EMPTY);
      g.restore();
    }
    const EMPTY = [];

    // ---------- world art (b12 nature props, b13 structures, b14 portals / shrines / chest / beacon / spawn pad) ----------
    // Everything draws from sprite strips with drawImage (no Graphics); the code visuals stay as the fallback (art missing or ?art=0).
    const artOn = !!opts.assetRoot && !/[?&]art=0(&|$)/.test(typeof location !== 'undefined' ? location.search : '');
    const wArt = Object.create(null); // id -> { img, frames, fw, fh, fps, ax, ay }
    const artDraws = { portal: 0, shrine: 0, chest: 0, beacon: 0, pad: 0 };
    let wArtLoading = false;
    function drawArt(g, a, f, x, y) { g.drawImage(a.img, f * a.fw, 0, a.fw, a.fh, Math.round(x - a.ax), Math.round(y - a.ay), a.fw, a.fh); }
    function frameOf(a, tt, reduced) { return reduced || a.frames < 2 ? 0 : Math.floor(tt * a.fps) % a.frames; } // time-sliced, reduce-motion = frame 0
    function loadWorldArt(root) {
      if (!artOn || !root || typeof fetch !== 'function') return Promise.resolve(0);
      wArtLoading = true;
      const join = (a, b) => a.replace(/\/+$/, '') + '/' + String(b).replace(/^\/+/, '');
      const okPath = (p) => typeof p === 'string' && /^[A-Za-z0-9_][A-Za-z0-9_.\/-]*\.png$/.test(p) && p.indexOf('..') < 0;
      const WANT = /^(portal_[a-z]+|spawn_pad|shrine_(heal|rage|ward)|event_beacon|loot_chest_gold|prop_[a-z0-9_]+|coin_f[1-4]|xp_orb_f[1-4]|heart_pickup|potion_life)$/;
      let got = 0;
      return fetch(join(root, 'INDEX.json')).then((r) => (r.ok ? r.json() : null)).then((idx) => {
        const batches = idx && Array.isArray(idx.batches) ? idx.batches : [];
        return Promise.all(batches.map((b) => {
          const id = b && typeof b.path === 'string' ? b.path.replace(/\/+$/, '').split('/').pop() : '';
          if (!/^b1[2345]-[a-z0-9-]{1,48}$/.test(id)) return null;
          return fetch(join(join(root, id), 'manifest.json')).then((r) => (r.ok ? r.json() : null)).then((m) => {
            const assets = m && Array.isArray(m.assets) ? m.assets : [];
            return Promise.all(assets.map((a) => {
              if (!a || typeof a.id !== 'string' || !WANT.test(a.id) || !okPath(a.path)) return null;
              const frames = Number.isInteger(a.frames) && a.frames >= 1 && a.frames <= 16 ? a.frames : 0;
              const fw = Number(a.frame_w); const fh = Number(a.frame_h);
              if (!frames || !(fw >= 8 && fw <= 128) || !(fh >= 8 && fh <= 128)) return null;
              const an = Array.isArray(a.anchor) ? { x: a.anchor[0], y: a.anchor[1] } : a.anchor;
              const ax = an && Number.isFinite(an.x) ? an.x : fw / 2; const ay = an && Number.isFinite(an.y) ? an.y : fh - 2;
              return new Promise((res) => {
                const img = new Image();
                img.onload = () => { if (img.naturalWidth === fw * frames && img.naturalHeight === fh) { wArt[a.id] = { img, frames, fw, fh, fps: Number(a.fps) > 0 ? Math.min(Number(a.fps), 24) : 8, ax, ay }; got++; } res(); };
                img.onerror = () => res();
                img.src = join(join(root, id), a.path);
              });
            }));
          }).catch(() => null);
        }));
      }).then(() => { wArtLoading = false; if (got) dropChunks(); return got; }).catch(() => { wArtLoading = false; return 0; });
    }

    // ---------- decorative props (purely visual, baked into the chunk canvas; seeded per chunk, never blocks, world generation untouched) ----------
    const NAT = {
      grass: ['prop_tree_small', 'prop_tree_medium', 'prop_bush_a', 'prop_bush_b', 'prop_rock_a', 'prop_flower_red', 'prop_flower_blue', 'prop_flower_yellow', 'prop_stump', 'prop_log', 'prop_bush_berry'],
      tall_grass: ['prop_tree_medium', 'prop_tree_large', 'prop_bush_a', 'prop_bush_berry', 'prop_log', 'prop_mushroom_ring', 'prop_stump'],
      flower_meadow: ['prop_flower_red', 'prop_flower_blue', 'prop_flower_yellow', 'prop_flower_red', 'prop_flower_yellow', 'prop_bush_b', 'prop_mushroom_ring', 'prop_tree_small'],
      sand: ['prop_shell', 'prop_driftwood', 'prop_tree_palm', 'prop_rock_a'],
      wet_sand: ['prop_shell', 'prop_reeds', 'prop_driftwood', 'prop_rock_b'],
      dry_grass: ['prop_cactus', 'prop_tree_dead', 'prop_skeleton_bones', 'prop_rock_b'],
      snow: ['prop_tree_pine', 'prop_ice_spike', 'prop_rock_a'],
      highland_rock: ['prop_rock_a', 'prop_rock_b', 'prop_rock_big', 'prop_boulder_cluster', 'prop_crystal_blue', 'prop_tree_pine'],
      gravel: ['prop_rock_a', 'prop_rock_b', 'prop_boulder_cluster', 'prop_tree_dead'],
      dark_grass: ['prop_tree_dead', 'prop_tree_pine', 'prop_mushroom_ring', 'prop_grave_a', 'prop_grave_b', 'prop_bush_a'],
      godland_ash: ['prop_skeleton_bones', 'prop_tree_dead', 'prop_crystal_red', 'prop_rock_b'],
      blood_ruins: ['prop_skeleton_bones', 'prop_crystal_red', 'prop_tombstone_cross', 'prop_rock_b'],
      cracked_stone: ['prop_rock_b', 'prop_crystal_green', 'prop_skeleton_bones'],
      lava_rock: ['prop_rock_a', 'prop_crystal_red'],
    };
    const STRUCT = ['prop_hut', 'prop_tower_ruin', 'prop_pillar_ruin_a', 'prop_pillar_ruin_b', 'prop_arch_ruin', 'prop_fence_h', 'prop_fence_v', 'prop_signpost', 'prop_crate', 'prop_barrel', 'prop_well', 'prop_tent_a', 'prop_tent_b'];
    const propCache = new Map(); let exPts = null; let campPts = null;
    function buildExclusions() { // spawn, portals, sites, bosses, event rings and the generator's own props keep a clear radius
      exPts = []; campPts = [];
      const add = (x, y, r) => { if (Number.isFinite(x) && Number.isFinite(y)) exPts.push({ x, y, r }); };
      add(world.spawnPoint.x, world.spawnPoint.y, 4);
      world.portalSites.forEach((q) => add(q.x, q.y, 4));
      world.bossSites.forEach((q) => add(q.x, q.y, 4));
      world.structures.forEach((q) => add(q.x, q.y, 4));
      world.props.forEach((q) => add(q.x, q.y, 1));
      if (SITES) {
        SITES.shrines.forEach((q) => add(q.x, q.y, 3));
        SITES.npcs.forEach((q) => add(q.x, q.y, 3));
        SITES.camps.forEach((q) => { add(q.x, q.y, 3); if (q.chest) add(q.chest.x, q.chest.y, 3); campPts.push(q); });
      }
    }
    const isRoad = (t) => t === T.dirt_road || t === T.stone_road;
    function chunkProps(cx, cy) {
      const key = cy * ccols + cx; let L = propCache.get(key); if (L) return L;
      L = [];
      if (artOn && cx >= 0 && cy >= 0 && cx < ccols && cy < crows) {
        if (!exPts) buildExclusions();
        const rng = MMRng.create(seed + ':art:' + cx + ',' + cy);
        const target = 2 + rng.int(0, 4); // 2..6 per 256 tiles: at most ~1 per 40 tiles
        for (let tries = 0; tries < target * 8 && L.length < target; tries++) {
          const wx = cx * CH + rng.int(1, 14); const wy = cy * CH + rng.int(2, 15); const roll = rng.next(); const roll2 = rng.next(); // the same draws every try: order-stable
          if (wx >= ww || wy >= wh) continue;
          const i = wy * ww + wx; if (solid[i]) continue;
          const pool = NAT[TN[terrain[i]]]; if (!pool) continue; // water and the roads themselves stay clear
          let bad = false;
          for (let k = 0; k < exPts.length && !bad; k++) { const e = exPts[k]; if (Math.abs(e.x - wx) <= e.r && Math.abs(e.y - wy) <= e.r) bad = true; }
          for (let k = 0; k < L.length && !bad; k++) if (Math.abs(L[k].x - wx) < 3 && Math.abs(L[k].y - wy) < 3) bad = true;
          if (bad) continue;
          let near = false;
          for (let oy = -2; oy <= 2 && !near; oy++) for (let ox = -2; ox <= 2 && !near; ox++) { const x2 = wx + ox; const y2 = wy + oy; if (x2 >= 0 && y2 >= 0 && x2 < ww && y2 < wh && isRoad(terrain[y2 * ww + x2])) near = true; }
          for (let k = 0; k < campPts.length && !near; k++) if (Math.abs(campPts[k].x - wx) <= 7 && Math.abs(campPts[k].y - wy) <= 7) near = true;
          const id = near && roll < 0.6 ? STRUCT[Math.floor(roll2 * STRUCT.length)] : pool[Math.floor(roll2 * pool.length)];
          L.push({ x: wx, y: wy, id });
        }
        L.sort((a, b) => a.y - b.y || a.x - b.x);
      }
      propCache.set(key, L); return L;
    }

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
    // ---------- zone gradient (PLAYTEST-REVIEW-2 #1): a toast at every border crossing, a 1 s slow on the first crossing above the hero's level ----------
    const ZSLOW = 0.5; const ZSLOW_S = 1; const ZTOAST_GAP = 4; // move x0.5 for 1 s; the same border re-toasts at most every 4 s
    let prevZ = null; let prevTx = 0; let prevTy = 0; let lastToastT = -1e9; let lastCross = null; let crossN = 0; const crossed = new Set();
    const ZJUMP = 4; // tiles between two HUD syncs (0.25 s): more than this is a teleport (a placement, a test hook), not a walk: no toast
    const recLv = (z) => { const Zd = Z.TABLES.ZONES[z]; return Zd && Zd.recLv > 0 ? Zd.recLv : 1; };
    function zoneCross(zi, tx, ty) {
      if (!ZGRAD || !(zi.zone >= 0 && zi.zone <= 3)) return; // the void (deep water) never counts as a zone
      const jump = Math.abs(tx - prevTx) > ZJUMP || Math.abs(ty - prevTy) > ZJUMP; prevTx = tx; prevTy = ty;
      if (prevZ === null || jump) { if (prevZ === null) crossed.add(zi.zone); prevZ = zi.zone; return; } // where the visit starts, or a teleport: no toast
      if (zi.zone === prevZ) return;
      prevZ = zi.zone; crossN++;
      const first = !crossed.has(zi.zone); crossed.add(zi.zone);
      const rec = recLv(zi.zone); const lv = Math.max(1, (arena.save && arena.save.level) | 0);
      const slowed = first && lv < rec && arena.state === 'play';
      if (slowed) slowUntil = arena.clock + ZSLOW_S;
      const text = `${zi.name}: ${zi.danger}, recommended Lv ${rec}`;
      if (first || arena.clock - lastToastT >= ZTOAST_GAP) { lastToastT = arena.clock; arena._showBanner(text, 2.2); }
      lastCross = { zone: zi.zone, text, first, slowed, rec, lv, t: arena.clock };
    }
    // ---------- enemy fire budget (PLAYTEST-REVIEW-2 #2): per-zone live enemy-bullet cap + capped bolt travel; ?firebudget=0 = today's bullets ----------
    const FB_ON = !/[?&]firebudget=0(&|$)/.test(qs0);
    const ebCapFor = (z) => { const c = Z.TABLES.EB_CAP; return c && c[z] > 0 ? c[z] : (c ? c[c.length - 1] : 0); };
    function fireBudgetFor(zi) {
      if (!FB_ON || !(zi.zone >= 0 && zi.zone <= 3)) return; // the void keeps the last zone's budget
      const cap = ebCapFor(zi.zone);
      if (!arena.fireBudget || arena.fireBudget.cap !== cap) arena.fireBudget = { cap, travel: Z.TABLES.EB_TRAVEL || 0.6, zone: zi.zone };
    }
    function syncHud(force) {
      const p = arena.player; const tx = Math.floor(p.x / TILE); const ty = Math.floor(p.y / TILE);
      const zi = Z.zoneInfoAt(world, tx, ty); lastZone = zi; zoneCross(zi, tx, ty); fireBudgetFor(zi);
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
    // early TTK + loot loop (PLAYTEST-REVIEW-2 #3): softer shore creatures (MMDifficulty SHORE_TTK) and a pickup magnet the size of a fight's
    // reach (MMPickups.MAGNET_RADIUS_WORLD); ?ttk=0 restores today's hp and the 64 px magnet
    const TTK_ON = !/[?&]ttk=0(&|$)/.test(qs0);
    function diffAt(zone, px, py) { // px/py in pixels -> MMDifficulty.zoneScale for that spot (1x everywhere when off)
      if (!DIFF) return { hp: 1, dmg: 1, spd: 1, count: 1, fire: 1 };
      const d = Math.hypot(px / TILE - world.center.x, py / TILE - world.center.y) / REALM_R;
      const o = { mode: diffMode }; if (world.bands === 'wide') o.bands = 'wide'; if (TTK_ON) o.ttk = true;
      return DIFF.zoneScale(zone, d, o);
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
      bag.items.forEach((it, k) => { const b = arena.dropBag(x + (k - (bag.items.length - 1) / 2) * 18, y + 10, it.r, it.id, bag); if (b) { const dd = typeof RM_ITEM_BY_ID !== 'undefined' ? RM_ITEM_BY_ID[b.id] : null; got.items.push({ id: b.id, r: it.r, name: dd ? dd.name : b.id, rolled: it.id }); } }); // the recap lists what actually dropped (a styled wpn_ weapon replaces the rolled wand)
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
        kills++; save.stats.kills++; nxQuestEvent({ type: 'kill', zone: info.zone, n: 1 });
        rollFor({ zone: info.zone, tier: info.tier }, e.x, e.y, 'g' + info.group);
        spawnPickups(e.x, e.y, 'g' + info.group, kills, info.tier);
        return;
      }
      for (let i = 0; i < bossLive.length; i++) {
        if (bossLive[i] !== e) continue;
        const site = world.bossSites[i]; bossLive[i] = null; bossReadyNow[i] = 0; miniKey = '';
        zones.bossDefeated(site, arena.clock); kills++; save.stats.bossKills++; nxQuestEvent({ type: 'kill', zone: site.zone, boss: true, n: 1 });
        rollFor({ zone: site.zone, tier: site.zone, boss: true }, e.x, e.y + 30, 'boss' + i);
        spawnPickups(e.x, e.y + 20, 'boss' + i, kills, 5);
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
      e.dmgMul = rec.dmgMul; e.bossName = BOSS_NAME[i]; e.bossTier = site.zone + 1; e.art = site.boss; e.bossArt = site.boss;
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
        e.dmgMul = rec.dmgMul; e.bossName = pretty(p.boss); e.bossTier = p.region + 1; e.art = p.boss; e.bossArt = p.boss; e.evid = st.id;
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
      save.pos = { x: q.tx, y: q.ty }; save.returnTo = { x: q.tx, y: q.ty, seed }; save.stats.portals++; nxQuestEvent({ type: 'portal' });
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
    // ---------- safe return from a portal (PLAYTEST-REVIEW-2 #4): a 3 s spawn shield, and a hop away from a live event in view ----------
    // Only for an arrival through ?at= (back from a dungeon). The hero still lands on the returnTo tile; only when a live (active, unfinished)
    // event's site is inside the view (+64 px) does it move to the nearest quiet tile within SAFE_HOP tiles: free and at least the event's
    // spawn radius from every such site (else the free tile there farthest from them). ?safereturn=0 = today's 2 s and no hop.
    const SAFE_ON = !/[?&]safereturn=0(&|$)/.test(qs0);
    const SAFE_SHIELD = 3; const SAFE_HOP = 6; const SAFE_MARGIN = 64;
    let lastReturn = null;
    function safeReturn() {
      const p = arena.player; const now = eventClock();
      const from = { x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) };
      p.iframes = Math.max(p.iframes, SAFE_SHIELD);
      const hw = arena.W / 2 + SAFE_MARGIN; const hh = arena.H / 2 + SAFE_MARGIN; const sites = [];
      const evs = Z.eventsFor(world, now);
      for (let i = 0; i < evs.length; i++) {
        const ev = evs[i]; if (!ev.active || evDone.has(ev.id)) continue;
        const st = evStateFor(ev); if (st.phase === 'won' || st.phase === 'expired') continue;
        const c = siteXY(st); if (Math.abs(c.x - p.x) <= hw && Math.abs(c.y - p.y) <= hh) sites.push({ id: ev.id, tx: st.plan.site.x, ty: st.plan.site.y });
      }
      let to = from;
      if (sites.length) {
        const R = ZT.EVENT_SPAWN_RADIUS; let best = null; let bestD = Infinity; let far = null; let farD = -1;
        const minSite = (x, y) => { let m = Infinity; for (let k = 0; k < sites.length; k++) m = Math.min(m, Math.hypot(x - sites[k].tx, y - sites[k].ty)); return m; };
        for (let oy = -SAFE_HOP; oy <= SAFE_HOP; oy++) for (let ox = -SAFE_HOP; ox <= SAFE_HOP; ox++) {
          const x = from.x + ox; const y = from.y + oy; if (!tileFree(x, y)) continue;
          const ms = minSite(x, y); const d = Math.hypot(ox, oy);
          if (ms >= R + 0.5 && (d < bestD || (d === bestD && best && (y < best.y || (y === best.y && x < best.x))))) { best = { x, y }; bestD = d; }
          if (ms > farD) { far = { x, y }; farD = ms; }
        }
        to = best || far || from;
        if (to !== from) { p.x = (to.x + 0.5) * TILE; p.y = (to.y + 0.5) * TILE; }
      }
      lastReturn = { from, to: { x: to.x, y: to.y }, moved: to.x !== from.x || to.y !== from.y, events: sites.map((q) => q.id), shield: SAFE_SHIELD };
      return lastReturn;
    }
    // ---------- world sites (MMSites): shrines (timed buffs), camps (chest + patrol), NPC greeters ----------
    const SITES = window.MMSites && !/[?&]sites=0(&|$)/.test(typeof location !== 'undefined' ? location.search : '') ? MMSites.generate(world, seed) : null;
    const NPC_IDS = window.MMSites ? MMSites.NPC_IDS : [];
    const SHRINE_COL = { heal: '#5be38a', rage: '#ff6a4a', ward: '#6ab8ff' };
    const SHRINE_TXT = { heal: 'Shrine of Mending', rage: 'Shrine of Fury', ward: 'Shrine of Warding' };
    const GREET = ['Safe roads, traveller.', 'The island keeps its secrets, but the shrines are generous.', 'Mind the camps past the hills.', 'I hear the beacons are lit tonight.', 'Take your time. Nothing here is in a hurry.', 'Have you tried the portals yet?'];
    const NPC_NAME = { npc_nexus_guide: 'Nexus Guide', npc_vendor: 'Vendor', npc_healer: 'Healer', npc_quest_giver: 'Quest Giver', npc_blacksmith: 'Blacksmith', npc_wanderer: 'Wanderer', npc_ghost_guide: 'Ghost Guide' };
    const SITE_R = 56; const chestOpen = new Set(save.chests || []); const shrineAt = Object.assign({}, save.shrineAt || {}); let greetN = 0;
    const chestAnimT = new Map(); // camp id -> arena clock when its opening animation began
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
        const sa = wArt['shrine_' + q.kind];
        if (sa) { if (!lit) g.globalAlpha = 0.6; drawArt(g, sa, lit ? frameOf(sa, tt, reduced) : 0, c.x, c.y + 18); g.globalAlpha = 1; artDraws.shrine++; }
        else g.drawImage(shrineSprite(q.kind, lit), c.x - 24, c.y - 70);
      });
      SITES.camps.forEach((q) => {
        const cx = (q.chest.x + 0.5) * TILE; const cy = (q.chest.y + 0.5) * TILE; if (cx < vx0 || cx > vx1 || cy < vy0 || cy > vy1) return;
        const ca = wArt.loot_chest_gold;
        if (ca) {
          const t0c = chestAnimT.get(q.id); let f = chestOpen.has(q.id) ? ca.frames - 1 : 0;
          if (t0c !== undefined && !reduced) f = Math.max(0, Math.min(ca.frames - 1, Math.floor((tt - t0c) / 0.12)));
          drawArt(g, ca, f, cx, cy + 18); artDraws.chest++;
        } else g.drawImage(chestSprite(chestOpen.has(q.id)), cx - 22, cy - 22);
      });
      SITES.npcs.forEach((q) => {
        const c = sPx(q); if (c.x < vx0 || c.x > vx1 || c.y < vy0 - 50 || c.y > vy1 + 50) return;
        const s = npcSprite(q.npc); g.drawImage(s, c.x - s.width / 2, c.y + 14 - s.height);
      });
    }
    // ---------- world status (S11): shrines show their buff as a status icon; world creatures apply debuffs from their bolts ----------
    // realm.js enemy bolts carry no `st` field and have no player-hit callback, so this hooks the instance: arena._guarded is only ever called for an
    // enemy-bolt hit (never lava or contact), so it flags the hit, and the wrapped arena._hitPlayer then attributes it to the nearest live enemy
    // and rolls its table entry (seeded MMRng, never Math.random). The arena owns the 0.5 s limiter (fromBolt), boss immunities and Picnic halving
    // (picnic), so this file only decides WHO may apply WHAT. realm.js is untouched.
    const STATUS_ON = !/[?&]status=0(&|$)/.test(typeof location !== 'undefined' ? location.search : '');
    // creature id -> { id: status, ch: chance 0..1, sec } (plan section c). Shore (zone 0) creatures are absent on purpose and are also gated by zone.
    const BOLT_ST = {
      ice_wraith: { id: 'slowed', ch: 0.3, sec: 1.5 },
      skeleton_archer: { id: 'weak', ch: 0.2, sec: 2 }, bone_knight: { id: 'weak', ch: 0.2, sec: 2 },
      ember_imp: { id: 'bleed', ch: 0.25, sec: 3 }, dark_spider: { id: 'bleed', ch: 0.2, sec: 3 },
      toxic_serpent: { id: 'sick', ch: 0.25, sec: 3 }, swamp_leech: { id: 'sick', ch: 0.25, sec: 3 },
      goblin_shaman: { id: 'curse', ch: 0.2, sec: 4 },
      storm_harbinger: { id: 'dazed', ch: 0.25, sec: 2 }, dread_knight: { id: 'armorBroken', ch: 0.25, sec: 3 },
      void_oracle: { id: 'curse', ch: 0.3, sec: 4 }, bone_colossus: { id: 'slowed', ch: 0.25, sec: 2 },
      ghoul: { id: 'sick', ch: 0.25, sec: 3 }, thorn_vine: { id: 'sick', ch: 0.2, sec: 3 }, wraith_knight: { id: 'weak', ch: 0.2, sec: 2 }, // b24 wave 2 (shore ones stay absent)
      fire_elemental: { id: 'bleed', ch: 0.25, sec: 3 }, giant_spider_queen: { id: 'bleed', ch: 0.3, sec: 3 },
    };
    let stRolls = 0; const stLog = { applied: 0, last: null };
    const zoneAtPx = (x, y) => { const tx = Math.floor(x / TILE); const ty = Math.floor(y / TILE); return tx < 0 || ty < 0 || tx >= world.w || ty >= world.h ? 0 : world.zone[ty * world.w + tx]; };
    function stSource(p) { // the nearest live enemy within about one view diagonal of the player (the bolt's most likely shooter)
      let best = null; let bd = (arena.W * arena.W + arena.H * arena.H) * 1.5;
      for (let i = 0; i < arena.enemies.length; i++) { const e = arena.enemies[i]; if (!e.active) continue; const d = (e.x - p.x) * (e.x - p.x) + (e.y - p.y) * (e.y - p.y); if (d < bd) { bd = d; best = e; } }
      return best;
    }
    // creature + zone -> the status that a bolt of it may apply (or null). Shore creatures and the Shore itself never apply anything.
    function boltStatusFor(creature, zone) { const t = BOLT_ST[creature]; return t && zone > 0 && STATUS_ON ? t : null; }
    function boltRoll(creature, zone, force) { // one hit by `creature`: roll its chance (force = always), apply through the arena. Returns the status id applied or ''.
      const t = boltStatusFor(creature, zone); if (!t || zoneAtPx(arena.player.x, arena.player.y) === 0) return '';
      if (!force && MMRng.create(seed + ':wst:' + (stRolls++)).next() >= t.ch) return '';
      const ok = arena.applyStatus('player', t.id, { sec: t.sec, src: 'world:' + creature, fromBolt: true, picnic: diffMode === 'picnic', safe: false });
      if (ok) { stLog.applied++; stLog.last = { id: t.id, creature, t: arena.clock }; } return ok ? t.id : '';
    }
    if (STATUS_ON) {
      const g0 = arena._guarded; const h0 = arena._hitPlayer; let boltHit = false;
      arena._guarded = function (dmg) { boltHit = true; return g0.call(this, dmg); };
      arena._hitPlayer = function (dmg) {
        const flagged = boltHit; boltHit = false; const soaked = this.shield && this.shield.hits > 0; const hp0 = this.player.hp;
        const r = h0.call(this, dmg);
        if (flagged && !soaked && this.player.hp < hp0 && this.mode === 'world' && !this.dungeon) {
          const e = stSource(this.player);
          if (e && e.art) boltRoll(e.art, e.zone | 0);
        }
        return r;
      };
    }
    // Shrines: the instant heal stays; Fury / Ward also show as damaging / armored for 60 s. The status carries a fixed x1.25 / x0.75, so buffDmg and
    // buffTaken (kept as aliases, read by realm.js) hold only what is left of the shrine's value, and the total stays what the shrine promised.
    function applyBuff(b) {
      const p = arena.player; const now = arena.clock; const sec = b.durationMs / 1000;
      if (b.kind === 'heal') {
        const add = Math.ceil(arena.stats.maxHp * b.value); p.hp = Math.min(arena.stats.maxHp, p.hp + add); arena._floatText(p.x, p.y - 30, `+${add}`, '#5be38a'); if (arena.fxHeal) arena.fxHeal();
        arena.applyStatus('player', 'healing', { sec: 5, src: 'shrine' });
      } else if (b.kind === 'rage') {
        rageEnd = now + sec; const on = arena.applyStatus('player', 'damaging', { sec, src: 'shrine' });
        arena.buffDmg = on ? (b.value / 1.25 > 1 ? b.value / 1.25 : 1) : b.value; arena._calcStats(); arena._floatText(p.x, p.y - 30, 'Fury!', '#ff6a4a');
      } else if (b.kind === 'ward') {
        wardEnd = now + sec; const on = arena.applyStatus('player', 'armored', { sec, src: 'shrine' });
        arena.buffTaken = on ? Math.min(0.999, b.value / 0.75) : b.value; arena._floatText(p.x, p.y - 30, 'Ward!', '#6ab8ff');
      }
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
      chestOpen.add(q.id); chestAnimT.set(q.id, arena.clock); save.chests = Array.from(chestOpen); writeSave(save); miniKey = '';
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
    // ---------- prompt layout: with both a portal and a site prompt open they stack (site below, portal above) and never overlap ----------
    const BOT = 'env(safe-area-inset-bottom, 0px)';
    [portalBtn, siteBtn].forEach((b) => { b.style.whiteSpace = 'nowrap'; });
    function layoutPrompts() {
      const both = !portalBtn.classList.contains('hidden') && !siteBtn.classList.contains('hidden');
      siteBtn.style.bottom = both ? `calc(170px + ${BOT})` : '';
      portalBtn.style.bottom = both ? `calc(236px + ${BOT})` : '';
    }
    if (typeof MutationObserver === 'function') { const po = new MutationObserver(layoutPrompts); po.observe(portalBtn, { attributes: true, attributeFilter: ['class'] }); po.observe(siteBtn, { attributes: true, attributeFilter: ['class'] }); }
    // ---------- the minimap and zone text step aside while a panel (backpack / board / menu / shop / hero) is open ----------
    const PANEL_IDS = { 'realm-backpack': 1, 'realm-board': 1, 'realm-pause': 1, 'realm-shop': 1, 'realm-hero': 1, 'realm-death': 1 };
    let panelHid = false;
    function syncPanels() {
      const open = !!arena.panel && typeof matchMedia === 'function' && matchMedia('(max-width: 700px)').matches; // phone width only: there the panels cover the corner HUD // the arena's own panel state (backpack / board / menu / shop / hero), read-only; the DOM mutations below only say when to look
      if (open === panelHid) return;
      panelHid = open; mini.style.display = open ? 'none' : ''; zoneEl.style.display = open ? 'none' : '';
    }
    if (typeof window !== 'undefined') window.addEventListener('resize', syncPanels);
    if (typeof MutationObserver === 'function') new MutationObserver((recs) => { for (let i = 0; i < recs.length; i++) if (PANEL_IDS[recs[i].target.id]) { syncPanels(); return; } }).observe(ov, { attributes: true, subtree: true, attributeFilter: ['class', 'style'] });
    window.addEventListener('keydown', (ev) => { if ((ev.key === 'e' || ev.key === 'E') && !ev.repeat && siteFor && arena.active && !arena.paused && arena.state === 'play') { ev.preventDefault(); siteAct(); } });

    // ---------- live pickups (MMPickups): coins, XP orbs, hearts and life potions rolled per kill, seeded by (world seed, group, kill index) ----------
    // World sprites on the overlay layer (drawImage from the loaded b15 art, or a tiny cached code sprite). Magnet 120 px (64 px with ?ttk=0), cap 60 (oldest culled),
    // lifetime per tier, no per-frame Graphics. Focus orbs and stat-buff potions need arena resources that do not exist yet: they are never spawned.
    const PK = window.MMPickups || null;
    const PICK_ON = !!PK && !/[?&]pickups=0(&|$)/.test(typeof location !== 'undefined' ? location.search : '');
    const PICK_CAP = 60;
    const MAGNET_R = TTK_ON && PK && PK.MAGNET_RADIUS_WORLD > 0 ? PK.MAGNET_RADIUS_WORLD : (PK ? PK.MAGNET_RADIUS : 64);
    const picks = []; let pickSave = false; let pickTotal = 0; const pickGot = { coin: 0, xp: 0, heart: 0, potion: 0 };
    const pickSpr = {};
    function pickSprite(type, art) { // cached code sprite (24x24) used until the art loads or when art is off
      const k = type === 'potion' ? 'potion' : type; if (pickSpr[k]) return pickSpr[k];
      const c = mk(24, 24); const g = c.getContext('2d');
      if (type === 'coin') { g.fillStyle = '#7a5a12'; g.beginPath(); g.arc(12, 12, 8, 0, 7); g.fill(); g.fillStyle = '#ffd45a'; g.beginPath(); g.arc(12, 12, 6.5, 0, 7); g.fill(); g.fillStyle = '#fff0a8'; g.fillRect(9, 8, 2, 6); }
      else if (type === 'xp') { g.fillStyle = '#4a2a8a'; g.beginPath(); g.arc(12, 12, 8, 0, 7); g.fill(); g.fillStyle = '#b48cff'; g.beginPath(); g.arc(12, 12, 6, 0, 7); g.fill(); g.fillStyle = '#efe0ff'; g.fillRect(9, 8, 3, 3); }
      else if (type === 'heart') { g.fillStyle = '#7a1022'; g.beginPath(); g.arc(8, 9, 5.5, 0, 7); g.arc(16, 9, 5.5, 0, 7); g.fill(); g.beginPath(); g.moveTo(3, 11); g.lineTo(21, 11); g.lineTo(12, 21); g.fill(); g.fillStyle = '#ff5f6b'; g.beginPath(); g.arc(8, 9, 4, 0, 7); g.arc(16, 9, 4, 0, 7); g.fill(); g.beginPath(); g.moveTo(5, 11); g.lineTo(19, 11); g.lineTo(12, 19); g.fill(); }
      else { g.fillStyle = '#143a24'; g.fillRect(9, 4, 6, 5); g.fillRect(6, 9, 12, 12); g.fillStyle = '#5be38a'; g.fillRect(8, 11, 8, 8); g.fillStyle = '#d8ffe6'; g.fillRect(9, 12, 2, 4); }
      pickSpr[k] = c; return c;
    }
    const pickOk = (d) => d.type === 'coin' || (d.type === 'xp' && typeof arena._gainXp === 'function') || d.type === 'heart' || (d.type === 'potion' && d.art === 'potion_life');
    function spawnPickups(x, y, group, killIdx, tier) {
      if (!PICK_ON) return 0;
      const list = PK.roll(seed, group, killIdx, tier).filter(pickOk);
      const r = MMRng.create('pickpos:' + seed + ':' + group + ':' + killIdx);
      let n = 0;
      for (let i = 0; i < list.length; i++) {
        const d = list[i]; const a = r.next() * Math.PI * 2; const rad = 10 + r.next() * 22;
        let px = x + Math.cos(a) * rad; let py = y + Math.sin(a) * rad;
        if (solidAt(px, py)) { px = x; py = y; }
        if (picks.length >= PICK_CAP) picks.shift();
        picks.push({ type: d.type, art: d.art, frames: d.frames || null, value: d.value, tier: d.tier, x: px, y: py, bornMs: arena.clock * 1000, lifeMs: d.lifeMs, ph: r.next() * 6.28 });
        n++; pickTotal++;
      }
      return n;
    }
    function collectPick(q) {
      const p = arena.player; pickGot[q.type] = (pickGot[q.type] || 0) + 1;
      if (q.type === 'coin') { arena.save.shards += q.value; arena.run.shards += q.value; arena._floatText(p.x, p.y - 26, `+${q.value} 💎`, '#8fe9ff'); pickSave = true; }
      else if (q.type === 'xp') { arena._gainXp(Math.max(1, Math.round(q.value * (arena.stats ? arena.stats.xp : 1)))); pickSave = true; }
      else {
        const o = PK.use(q, { hp: p.hp, maxHp: arena.stats.maxHp, focus: 0, maxFocus: 0 });
        if (o.hp > p.hp) { arena._floatText(p.x, p.y - 26, `+${Math.round(o.hp - p.hp)}`, '#5be38a'); p.hp = o.hp; arena._syncHud(); }
      }
    }
    function pickTick(dt) {
      if (!picks.length) return;
      const p = arena.player; const now = arena.clock * 1000; const d = Math.min(dt, 0.1);
      for (let i = picks.length - 1; i >= 0; i--) {
        const q = picks[i];
        if (PK.expired(q, now)) { picks.splice(i, 1); continue; }
        if (arena.state !== 'play') continue;
        const m = PK.magnetStep(q, p, d, MAGNET_R); q.x = m.x; q.y = m.y;
        if (m.collected) { picks.splice(i, 1); collectPick(q); }
      }
      if (pickSave) { pickSave = false; arena.onSave(arena.save); arena._syncHud(); }
    }
    function drawPicks(g, cam) {
      if (!picks.length) return;
      const tt = arena.clock; const reduced = arena._reduced; const now = tt * 1000;
      const x0 = cam.x - 24; const y0 = cam.y - 24; const x1 = cam.x + arena.W + 24; const y1 = cam.y + arena.H + 24;
      for (let i = 0; i < picks.length; i++) {
        const q = picks[i]; if (q.x < x0 || q.x > x1 || q.y < y0 || q.y > y1) continue;
        const left = q.lifeMs - (now - q.bornMs);
        if (left < 4000 && !reduced && Math.floor(tt * 8) % 2) continue; // blinks out in the last 4 s
        const bob = reduced ? 0 : Math.round(Math.sin(tt * 4 + q.ph) * 2);
        let art = null;
        if (q.frames) art = wArt[q.frames[reduced ? 0 : Math.floor(tt * 10 + q.ph) % q.frames.length]]; else art = wArt[q.art];
        if (art) drawArt(g, art, 0, q.x, q.y + 8 + bob);
        else g.drawImage(pickSprite(q.type, q.art), Math.round(q.x - 12), Math.round(q.y - 12 + bob));
      }
    }

    // ---------- the Nexus (MMNexus hub plaza), reached through a `portal_nexus` next to the world spawn ----------
    // Design: an OVERLAY SCREEN inside the same page, not a second arena world. Swapping arena.setWorld would rebuild the pools, the zone spawner, the event
    // clock and the camera (all owned by this controller), so instead the arena is frozen (arena.paused) behind a full-screen plaza drawn once into a canvas
    // from the MMNexus layout (fountain, torches, banners, 6 portals, 7 NPCs). Everything is a real button; Back (or Escape) unfreezes the arena with the
    // player exactly where they stood, so Back returns to the same tile. The vault portal opens the Lantern stash page; biome portals enter a dungeon that
    // returns to this tile; the Realm portal is Back. Visuals come from the registered art with code fallbacks.
    const NX = window.MMNexus || null;
    const NX_ON = !!NX && !!window.MMQuests && !/[?&]nexus=0(&|$)/.test(typeof location !== 'undefined' ? location.search : '');
    const NX_NAME = { realm: 'The Realm', warren: 'Warren dungeon', bramble: 'Bramble dungeon', vault: 'Lantern stash (vault)', meadow: 'Meadow dungeon', crypt: 'Crypt dungeon' };
    const nxSite = NX_ON ? (() => { const f = nearestFree(world.spawnPoint.x + 3, world.spawnPoint.y - 1, 8) || nearestFree(world.spawnPoint.x - 3, world.spawnPoint.y, 8); return f ? { tx: f.x, ty: f.y, x: (f.x + 0.5) * TILE, y: (f.y + 0.5) * TILE } : null; })() : null;
    const nxBtn = document.createElement('button'); nxBtn.id = 'rw-nexus-go'; nxBtn.type = 'button'; nxBtn.className = 'hidden'; nxBtn.textContent = 'Visit the Nexus (Enter)'; nxBtn.setAttribute('aria-label', 'Visit the Nexus hub (Enter)'); ov.appendChild(nxBtn);
    let nxNear = false; let nxOpen = false; let nxEnterTile = null; let nxTalkN = 0; const nxPortrait = {}; let nxDom = null;
    const todayUtc = questDate;
    const nxCss = document.createElement('style');
    nxCss.textContent = '#rw-nexus-go{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(290px + env(safe-area-inset-bottom,0px));z-index:3;min-height:48px;min-width:44px;padding:0 18px;border-radius:24px;border:2px solid #a98bff;background:rgba(30,20,60,.92);color:#fff;font:700 15px system-ui,sans-serif;white-space:nowrap}#rw-nexus-go.hidden{display:none}'
      + '#rw-nexus{position:fixed;inset:0;z-index:80;background:#120e1f;color:#f3eefc;display:flex;flex-direction:column;overflow-x:hidden;overflow-y:auto;font:14px/1.4 system-ui,sans-serif;padding:env(safe-area-inset-top,0px) 16px env(safe-area-inset-bottom,0px);box-sizing:border-box}#rw-nexus.hidden{display:none}'
      + '#rw-nexus .nx-head{display:flex;align-items:center;gap:12px;padding:8px 0;flex-wrap:wrap}#rw-nexus h2{margin:0;font-size:18px;flex:1;min-width:120px}'
      + '#rw-nexus button{min-height:44px;min-width:44px;padding:0 14px;border-radius:10px;border:2px solid #7a63c9;background:#2a2150;color:#fff;font:700 14px system-ui,sans-serif;cursor:pointer}#rw-nexus button:focus-visible{outline:3px solid #ffe27a}'
      + '#rw-nexus .nx-stage{position:relative;box-sizing:border-box;width:100%;max-width:760px;aspect-ratio:4/3;margin:0 auto;border:2px solid #3a2f66;border-radius:10px;overflow:hidden;background:#1b1530}#rw-nexus canvas{display:block;width:100%;height:100%;image-rendering:pixelated}'
      + '#rw-nexus .nx-spot{position:absolute;transform:translate(-50%,-50%);padding:0;border-radius:50%;background:rgba(255,255,255,.04);border:1px dashed rgba(255,255,255,.25)}'
      + '#rw-nexus .nx-lists{max-width:760px;width:100%;margin:10px auto 0;display:flex;flex-direction:column;gap:8px}#rw-nexus .nx-row{display:flex;flex-wrap:wrap;gap:8px}#rw-nexus .nx-row>b{flex:0 0 100%;font-size:12px;color:#c9bff0;font-weight:600}'
      + '#rw-nexus .nx-talk{max-width:760px;width:100%;margin:10px auto;box-sizing:border-box;padding:10px 12px;border-radius:10px;background:#231b42;border:1px solid #4a3d85;min-height:44px}#rw-nexus .nx-talk b{color:#ffe27a}'
      + '#rw-nexus .nx-board{max-width:760px;width:100%;margin:0 auto 12px;box-sizing:border-box;padding:10px 12px;border-radius:10px;background:#1d2a2a;border:1px solid #3b6b5f}#rw-nexus .nx-board.hidden{display:none}#rw-nexus .nx-q{display:flex;align-items:center;gap:10px;padding:6px 0;border-top:1px solid #2f4a45}#rw-nexus .nx-q:first-of-type{border-top:0}#rw-nexus .nx-q span{flex:1}#rw-nexus .nx-q em{color:#8fe9ff;font-style:normal}';
    document.head.appendChild(nxCss);
    function nxLoadPortrait(id, done) { // b21 idle_down, first frame, cached; the plaza redraws when one arrives
      if (nxPortrait[id] !== undefined || !opts.assetRoot || !artOn) return;
      nxPortrait[id] = null;
      const img = new Image();
      img.onload = () => { if (img.naturalHeight >= 64) { nxPortrait[id] = img; if (done) done(); } };
      img.src = opts.assetRoot.replace(/\/+$/, '') + '/b21-npcs-and-vendors/enemies/' + id + '/' + id + '_idle_down.png';
    }
    function nxDrawPlaza() { // one static draw per open / art arrival (1280x960 = the 40x30 tile plaza at 32 px)
      if (!nxDom) return;
      const L = NX.layout(); const c = nxDom.cv; const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
      g.fillStyle = '#0e0a18'; g.fillRect(0, 0, c.width, c.height);
      for (let ty = 1; ty < L.h - 1; ty++) for (let tx = 1; tx < L.w - 1; tx++) { g.fillStyle = (tx + ty) % 2 ? '#4b4660' : '#554f6c'; g.fillRect(tx * TILE, ty * TILE, TILE, TILE); }
      g.fillStyle = '#6d6788'; for (let i = 1; i < L.w - 1; i++) { g.fillRect(i * TILE, TILE, TILE, 2); g.fillRect(i * TILE, (L.h - 2) * TILE + 30, TILE, 2); }
      const pad = wArt.spawn_pad; const sp = L.spawn;
      if (pad) drawArt(g, pad, 0, sp.x, sp.y + 16); else { g.fillStyle = '#7a63c9'; g.beginPath(); g.arc(sp.x, sp.y, 20, 0, 7); g.fill(); g.fillStyle = '#a98bff'; g.beginPath(); g.arc(sp.x, sp.y, 13, 0, 7); g.fill(); }
      L.props.forEach((p) => {
        const a = wArt[p.art]; const x = (p.tx + 0.5) * TILE; const y = (p.ty + 0.5) * TILE + 16;
        if (a) { drawArt(g, a, 0, x, y); return; }
        if (p.id === 'fountain') { g.fillStyle = '#7d8aa3'; g.beginPath(); g.arc(x, y - 16, 44, 0, 7); g.fill(); g.fillStyle = '#4fa8e0'; g.beginPath(); g.arc(x, y - 16, 34, 0, 7); g.fill(); g.fillStyle = '#bfe6ff'; g.fillRect(x - 4, y - 44, 8, 26); }
        else if (/torch/.test(p.id)) { g.fillStyle = '#5a4026'; g.fillRect(x - 3, y - 30, 6, 28); g.fillStyle = '#ffb347'; g.beginPath(); g.arc(x, y - 34, 7, 0, 7); g.fill(); }
        else if (/banner/.test(p.id)) { g.fillStyle = /red/.test(p.id) ? '#c0394b' : /blue/.test(p.id) ? '#3d6fc0' : '#3f9a55'; g.fillRect(x - 10, y - 44, 20, 38); }
        else { g.fillStyle = '#8a6a3c'; g.fillRect(x - 10, y - 30, 20, 26); }
      });
      L.portals.forEach((q) => {
        const a = wArt[q.art]; g.save();
        if (a) drawArt(g, a, 0, q.x, q.y + 23);
        else { g.globalAlpha = 0.3; g.fillStyle = '#a98bff'; g.beginPath(); g.arc(q.x, q.y, 30, 0, 7); g.fill(); g.globalAlpha = 1; g.strokeStyle = '#a98bff'; g.lineWidth = 4; g.beginPath(); g.arc(q.x, q.y, 24, 0, 7); g.stroke(); }
        g.restore();
        g.font = 'bold 22px system-ui, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#000'; g.fillText(q.label, q.x + 1, q.y - 37); g.fillStyle = '#e8dcff'; g.fillText(q.label, q.x, q.y - 38);
      });
      L.npcs.forEach((n) => {
        const im = nxPortrait[n.npc]; const x = n.x; const y = n.y;
        if (im) g.drawImage(im, 0, 0, im.naturalHeight, im.naturalHeight, x - 40, y - 60, 80, 80);
        else { const h = MMRng.hash(n.npc); g.fillStyle = '#000'; g.fillRect(x - 13, y - 14, 26, 36); g.fillStyle = 'hsl(' + (h % 360) + ',45%,48%)'; g.fillRect(x - 11, y - 12, 22, 32); g.fillStyle = '#f0cfa6'; g.beginPath(); g.arc(x, y - 22, 10, 0, 7); g.fill(); }
        g.font = 'bold 20px system-ui, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#000'; g.fillText(NPC_NAME[n.npc] || n.id, x + 1, y + 37); g.fillStyle = '#ffe27a'; g.fillText(NPC_NAME[n.npc] || n.id, x, y + 36);
      });
    }
    function nxSay(name, text) { const t = nxDom.talk; t.textContent = ''; const b = document.createElement('b'); b.textContent = name + ': '; t.appendChild(b); t.appendChild(document.createTextNode(text)); nxDom.last = { name, text }; }
    function nxUrl(biome) { // dungeon trip that returns to the tile the player left from
      const tx = nxEnterTile ? nxEnterTile.x : Math.floor(arena.player.x / TILE); const ty = nxEnterTile ? nxEnterTile.y : Math.floor(arena.player.y / TILE);
      const ret = 'index.html?mode=world&seed=' + seed + '&at=' + tx + ',' + ty + (opts.test ? '&test=1' : '');
      if (!RETURN_RE.test(ret) || !BIOME_NAME[biome]) return null;
      return { tx, ty, url: 'index.html?mode=dungeon&seed=' + String(MMRng.hash(seed + ':nexus:' + biome) % 100000) + '&lv=2&biome=' + biome + '&return=' + encodeURIComponent(ret) + (opts.test ? '&test=1' : '') };
    }
    function nxLeaveTo(url) {
      if (leaving) return null; leaving = true;
      savePos(true); writeSave(save); arena.onSave(arena.save); settle('portal');
      arena.stop(); nxDom.root.classList.add('hidden'); nxOpen = false;
      api.lastNexusUrl = url; if (opts.navigate !== false) location.href = url; return url;
    }
    function nxPortal(q) {
      if (q.dest === 'realm') { nexusClose(); return 'realm'; }
      if (q.dest === 'vault') {
        const c = window.MMPortals ? MMPortals.canEnter('vault', null, 'nexus', 0) : { ok: true, dest: 'lantern-stash' };
        if (!c.ok) return null;
        return nxLeaveTo('lantern.html');
      }
      const b = /^biome:([a-z]+)$/.exec(q.dest); if (!b) return null;
      const u = nxUrl(b[1]); if (!u) return null;
      if (typeof nxQuestEvent === 'function') nxQuestEvent({ type: 'portal' });
      save.stats.portals++; save.pos = { x: u.tx, y: u.ty }; save.returnTo = { x: u.tx, y: u.ty, seed };
      return nxLeaveTo(u.url);
    }
    const NX_LINES = {
      guide: ['Welcome to the Nexus. Every road in the Realm ends up here, sooner or later.', 'The ring of doors leads to the dungeons. The plain one takes you home.', 'Nothing here bites. Take your time.'],
      vendor: ['Wares and bargains are on the Realm menu while you wander. Come back when your pockets are heavy.', 'I keep the good stock behind the counter. It will be on the shelf soon.'],
      blacksmith: ['Bring me two matching blades and an idea. Combining is on its way.', 'The forge is warming up. Not long now.'],
      rumours: ['They say the Godlands hum at night.', 'Camps past the hills guard a chest apiece.', 'A shrine will mend you or sharpen you, never both.'],
    };
    function nxTalk(n) {
      const name = NPC_NAME[n.npc] || n.id; nxTalkN++;
      if (n.role === 'heal') { const p = arena.player; const was = p.hp; p.hp = arena.stats.maxHp; arena._syncHud(); nxSay(name, was < p.hp ? 'There. Whole again, no charge.' : 'You look perfectly well to me.'); return; }
      if (n.role === 'oracle') { const o = MMQuests.oracle(todayUtc()); nxSay(name, o ? o.text : 'The mists are quiet.'); return; }
      if (n.role === 'quests') { if (typeof nxBoardOpen === 'function') nxBoardOpen(); nxSay(name, 'Here is the day\'s board. Three jobs, free to take.'); return; }
      const key = n.role === 'rumours' ? 'rumours' : n.role === 'shop' ? 'vendor' : n.role === 'combine' ? 'blacksmith' : 'guide';
      const L = NX_LINES[key]; nxSay(name, L[(MMRng.hash(todayUtc() + n.id) + nxTalkN) % L.length]);
    }
    function nxBuild() {
      if (nxDom) return nxDom;
      const root = document.createElement('div'); root.id = 'rw-nexus'; root.className = 'hidden'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'The Nexus');
      const head = document.createElement('div'); head.className = 'nx-head';
      const back = document.createElement('button'); back.type = 'button'; back.id = 'rw-nx-back'; back.textContent = 'Back to the Realm'; back.setAttribute('aria-label', 'Back to the Realm');
      const h = document.createElement('h2'); h.textContent = 'The Nexus'; head.appendChild(back); head.appendChild(h);
      const stage = document.createElement('div'); stage.className = 'nx-stage';
      const cv = document.createElement('canvas'); cv.width = NX.W * TILE; cv.height = NX.H * TILE; cv.setAttribute('aria-hidden', 'true'); stage.appendChild(cv);
      const L = NX.layout(); const lists = document.createElement('div'); lists.className = 'nx-lists';
      const rowP = document.createElement('div'); rowP.className = 'nx-row'; const rowPl = document.createElement('b'); rowPl.textContent = 'Portals'; rowP.appendChild(rowPl);
      const rowN = document.createElement('div'); rowN.className = 'nx-row'; const rowNl = document.createElement('b'); rowNl.textContent = 'Talk to'; rowN.appendChild(rowNl);
      const spot = (x, y, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'nx-spot'; b.tabIndex = -1; b.setAttribute('aria-hidden', 'true'); b.style.left = (x / cv.width * 100) + '%'; b.style.top = (y / cv.height * 100) + '%'; b.addEventListener('click', fn); stage.appendChild(b); };
      L.portals.forEach((q) => {
        const b = document.createElement('button'); b.type = 'button'; b.dataset.portal = q.id; b.textContent = q.id === 'realm' ? 'Back to the Realm portal' : q.id === 'vault' ? 'Vault: Lantern stash' : q.label + ' portal'; b.setAttribute('aria-label', q.id === 'vault' ? 'Vault portal: open the Lantern stash' : q.id === 'realm' ? 'Realm portal: go back to the Realm' : 'Enter the ' + q.label + ' dungeon');
        b.addEventListener('click', () => nxPortal(q)); rowP.appendChild(b); spot(q.x, q.y, () => nxPortal(q));
      });
      L.npcs.forEach((n) => {
        const b = document.createElement('button'); b.type = 'button'; b.dataset.npc = n.id; b.textContent = NPC_NAME[n.npc] || n.id; b.setAttribute('aria-label', 'Talk to ' + (NPC_NAME[n.npc] || n.id));
        b.addEventListener('click', () => nxTalk(n)); rowN.appendChild(b); spot(n.x, n.y - 10, () => nxTalk(n));
      });
      lists.appendChild(rowP); lists.appendChild(rowN);
      const talk = document.createElement('div'); talk.className = 'nx-talk'; talk.setAttribute('role', 'status'); talk.textContent = 'Pick a portal, or say hello to someone.';
      const board = document.createElement('div'); board.className = 'nx-board hidden'; board.id = 'rw-nx-board';
      root.appendChild(head); root.appendChild(stage); root.appendChild(talk); root.appendChild(board); root.appendChild(lists); ov.appendChild(root);
      back.addEventListener('click', () => nexusClose());
      nxDom = { root, cv, talk, board, back, last: null };
      return nxDom;
    }
    function nexusOpen() {
      if (!NX_ON || !nxSite || nxOpen || leaving || !arena.active || arena.state !== 'play' || arena.paused) return false;
      nxBuild(); nxEnterTile = { x: Math.floor(arena.player.x / TILE), y: Math.floor(arena.player.y / TILE) };
      nxOpen = true; arena.paused = true; savePos(true);
      nxBtn.classList.add('hidden'); portalBtn.classList.add('hidden'); siteBtn.classList.add('hidden');
      nxDom.root.classList.remove('hidden'); nxDom.board.classList.add('hidden');
      NX.layout().npcs.forEach((n) => nxLoadPortrait(n.npc, nxDrawPlaza)); nxDrawPlaza();
      nxDom.talk.textContent = 'Pick a portal, or say hello to someone.';
      nxDom.back.focus({ preventScroll: true });
      return true;
    }
    function nexusClose() {
      if (!nxOpen) return false;
      nxOpen = false; nxDom.root.classList.add('hidden'); arena.paused = false; arena.player.iframes = Math.max(arena.player.iframes, 1.5);
      nxNear = true; return true; // the prompt shows again next tick if the player is still beside the portal
    }
    window.addEventListener('keydown', (ev) => {
      if (nxOpen && ev.key === 'Escape') { ev.preventDefault(); ev.stopImmediatePropagation(); nexusClose(); return; }
      if (ev.key === 'Enter' && !nxOpen && nxNear && promptFor < 0 && !siteFor && arena.active && !arena.paused && arena.state === 'play') { ev.preventDefault(); nexusOpen(); }
    }, true);
    nxBtn.addEventListener('click', () => nexusOpen());
    function nexusTick() {
      if (!NX_ON || !nxSite || nxOpen) return;
      const p = arena.player; const near = arena.state === 'play' && !arena.paused && (p.x - nxSite.x) ** 2 + (p.y - nxSite.y) ** 2 < 48 * 48;
      nxNear = near;
      nxBtn.classList.toggle('hidden', !(near && promptFor < 0 && !siteFor));
    }
    function drawNexusPortal(g, tt, reduced) {
      const a = wArt.portal_nexus; const q = nxSite;
      if (a) { drawArt(g, a, frameOf(a, tt, reduced), q.x, q.y + 23); artDraws.portal++; }
      else drawPortalCode(g, { x: q.x, y: q.y, col: '#ffd45a' }, tt, reduced);
      g.font = 'bold 12px system-ui, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#000'; g.fillText('Nexus', q.x + 1, q.y - 37); g.fillStyle = '#ffd45a'; g.fillText('Nexus', q.x, q.y - 38);
    }

    // ---------- daily quests (MMQuests): 3 per UTC day, progress from kills / boss kills / portals, claimed at the Quest Giver in the Nexus ----------
    let qDirty = false;
    function nxQuestEvent(ev) {
      if (!window.MMQuests) return;
      save.quests = MMQuests.progress(save.quests, ev, questDate()); qDirty = true;
      if (nxOpen && nxDom && !nxDom.board.classList.contains('hidden')) nxBoardRender();
    }
    function nxBoardRender() {
      const b = nxDom.board; b.textContent = '';
      const h = document.createElement('b'); h.textContent = 'Daily quests · ' + questDate(); b.appendChild(h);
      MMQuests.summary(save.quests, questDate()).forEach((q) => {
        const row = document.createElement('div'); row.className = 'nx-q'; row.dataset.quest = q.id;
        const t = document.createElement('span'); t.textContent = q.text + ' (' + q.p + '/' + q.need + ') '; const r = document.createElement('em'); r.textContent = '+' + q.reward.shards + ' 💎'; t.appendChild(r); row.appendChild(t);
        if (q.claimed) { const d = document.createElement('span'); d.textContent = 'Claimed'; d.style.flex = '0 0 auto'; row.appendChild(d); }
        else { const c = document.createElement('button'); c.type = 'button'; c.dataset.claim = q.id; c.textContent = 'Claim'; c.disabled = !q.done; c.setAttribute('aria-label', q.done ? 'Claim ' + q.text : q.text + ', not finished yet'); c.addEventListener('click', () => nxClaim(q.id)); row.appendChild(c); }
        b.appendChild(row);
      });
    }
    function nxBoardOpen() { nxBuild(); nxBoardRender(); nxDom.board.classList.remove('hidden'); }
    function nxClaim(id) {
      const out = MMQuests.claim(save.quests, id, questDate()); save.quests = out.state;
      if (out.reward) { arena.save.shards += out.reward.shards; arena.run.shards += out.reward.shards; arena.onSave(arena.save); arena._syncHud(); nxSay('Quest Giver', 'Well earned. +' + out.reward.shards + ' shards.'); }
      writeSave(save); qDirty = false; if (nxDom) nxBoardRender();
      return out.reward;
    }

    const hooks = {
      onStart() {
        const back = !!pendingAt; // an arrival through ?at= (the return from a dungeon portal)
        if (pendingAt) { placeAt(pendingAt.x, pendingAt.y); pendingAt = null; } else placeAt(world.spawnPoint.x, world.spawnPoint.y);
        prevZ = null; slowUntil = 0; // a (re)start is not a border crossing
        arena.run.wave = 0; arena.biome = 0;
        resetZones();
        kills = 0; spawned = 0; despawned = 0; lastDrops.length = 0; picks.length = 0;
        bossReadyNow.fill(0); bossT = 0; sweepT = 0;
        promptFor = -2; leaving = false;
        rageEnd = 0; wardEnd = 0; arena.buffDmg = 1; arena.buffTaken = 1; campSt.clear(); siteKeyShown = '';
        if (save.returnTo) { save.returnTo = null; writeSave(save); } // back from a dungeon: the trip is over
        // events: the clock continues from the save (or from where this visit was, on a restart); creatures of a running event rest
        if (evStarted) settle('restart'); // a restart ends the leg too
        evBase = Math.max(save.evT, evStarted ? lastEvClock : 0) - arena.clock; evStarted = true;
        evState.forEach((st) => { if (st.phase === 'active' || st.phase === 'upcoming') evRest(st); });
        evT = 0; hintT = 0; hintEl.classList.add('hidden');
        if (back && SAFE_ON) safeReturn(); // before the first evTick, so a raid in view never spawns on top of the arrival
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
        portalTick(); pickTick(dt); nexusTick();
        if (SITES) siteTick(dt);
        lastEvClock = eventClock();
        evT -= dt; if (evT <= 0) { evT = 0.25; evTick(); }
        evHint(dt);
        hudT -= dt; saveT -= dt;
        if (hudT <= 0) { hudT = 0.25; syncHud(false); }
        if (saveT <= 0) { saveT = 2; savePos(false); if (qDirty) { qDirty = false; writeSave(save); } }
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
        if (nxSite && NX_ON && nxSite.x > vx0 && nxSite.x < vx1 && nxSite.y > vy0 && nxSite.y < vy1) drawNexusPortal(g, tt, reduced);
        const pad = wArt.spawn_pad; const padX = (world.spawnPoint.x + 0.5) * TILE; const padY = (world.spawnPoint.y + 0.5) * TILE;
        if (pad && padX > vx0 && padX < vx1 && padY > vy0 && padY < vy1) { drawArt(g, pad, frameOf(pad, tt, reduced), padX, padY + 16); artDraws.pad++; }
        if (SITES) drawSites(g, vx0, vy0, vx1, vy1, tt, reduced);
        evState.forEach((st) => { // event sites: a beacon (upcoming: gold, active: orange) above the ring of stones
          if (st.phase !== 'upcoming' && st.phase !== 'active') return;
          const c = siteXY(st); if (c.x < vx0 - 80 || c.x > vx1 + 80 || c.y < vy0 - 80 || c.y > vy1 + 80) return;
          const col = st.phase === 'active' ? '#ff8a2a' : '#ffe27a';
          g.globalAlpha = reduced ? 0.3 : 0.2 + 0.12 * Math.sin(tt * 2.5); g.fillStyle = col; g.beginPath(); g.arc(c.x, c.y, 70, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
          const ba = wArt.event_beacon;
          if (ba) { drawArt(g, ba, frameOf(ba, tt, reduced), c.x, c.y + 6); artDraws.beacon++; }
          else drawBeacon(g, c.x, c.y - 30 + (reduced ? 0 : Math.sin(tt * 2) * 4), 12, col, tt, reduced);
          const label = `${evTitle(st)} · ${st.phase === 'active' ? fmtT(st.ev.endsAt - eventClock()) + ' left' : 'in ' + fmtT(st.ev.startsAt - eventClock())}`;
          g.font = 'bold 12px system-ui, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#000'; g.fillText(label, c.x + 1, c.y - 51); g.fillStyle = col; g.fillText(label, c.x, c.y - 52);
        });
      },
      drawOver(g, cam) { drawPicks(g, cam); // a raid boss telegraphs its next burst: a red ring that closes in during the last second
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
    if (artOn) loadWorldArt(opts.assetRoot);

    const api = {
      seed, world, genMs, SAVE_KEY, TILE, CPX, MAX_CHUNKS,
      chunkCount: () => chunks.size, chunkBuilds: () => chunkBuilds, artTiles: () => artTiles, miniDraws: () => miniDraws,
      zone: () => lastZone, fireBudget: { on: FB_ON, capFor: ebCapFor, now: () => (arena.fireBudget ? Object.assign({}, arena.fireBudget) : null), live: () => arena._ebLive, capped: () => arena._ebCapped }, zoneGrad: { on: ZGRAD, bands: world.bands || 'classic', recLv, last: () => lastCross, crossings: () => crossN, slowLeft: () => Math.max(0, slowUntil - arena.clock), moveScale: () => moveScaleAt(arena.player.x, arena.player.y) }, hudText: () => ({ zone: zName.textContent, coords: zCoords.textContent, arrow: arrowDeg }),
      tileAt: (x, y) => O.tileAt(world, Math.floor(x / TILE), Math.floor(y / TILE)), solidAt, shotSolidAt, nearestFree,
      tileCenter: (tx, ty) => ({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE }),
      save: () => readSave(), savePos, portals: () => portals.map((q) => ({ i: q.i, x: q.x, y: q.y, tx: q.tx, ty: q.ty, biome: q.biome })),
      syncHud, loadTileArt, loadWorldArt,
      artState: () => ({ on: artOn, loaded: Object.keys(wArt), draws: Object.assign({}, artDraws), loading: wArtLoading }), artProps: (cx, cy) => chunkProps(cx, cy).map((q) => ({ x: q.x, y: q.y, id: q.id })), chunkGrid: () => ({ cols: ccols, rows: crows }),
      panelHidden: () => panelHid,
      // minimap fog (slice A1)
      discovered: () => ({ on: fogOn, count: FOG ? FOG.count(fogBits) : 0, b64: FOG ? FOG.encode(fogBits) : '', has: (cx, cy) => (FOG ? FOG.has(fogBits, cx, cy) : false) }),
      revealAt: (tx, ty) => { const n = revealAt(tx, ty); if (n > 0) drawMini(false); return n; },
      // slice 6
      diffOn: !!DIFF, diffMode, diffAt, spawner: () => zones, spawned: () => spawned, despawned: () => despawned,
      liveCount: () => { let n = 0; live.forEach((e, id) => { if (e.active && e.zid === id) n++; }); return n; },
      liveEnemies: () => { const o = []; live.forEach((e, id) => { if (e.active && e.zid === id) o.push({ id, x: e.x, y: e.y, type: e.type, zone: e.zone, tier: e.tier, art: e.art, hp: e.maxHp, spd: e.spdMul, dmg: e.dmgMul, diff: e.diff || null }); }); return o; },
      enemyById: (id) => live.get(id) || null, setDropAll: (on) => { dropAll = !!on; }, lastDrops: () => lastDrops.slice(), kills: () => kills,
      bossesClassic, rosterClassic, bandsClassic, bossArtIds: () => world.bossSites.map((b) => b.boss),
      bossSites: () => world.bossSites.map((b, i) => ({ i, x: b.x, y: b.y, zone: b.zone, boss: b.boss, name: BOSS_NAME[i], live: !!(bossLive[i] && bossLive[i].active), ready: !!zones && zones.bossReady(b, arena.clock) })),
      bossEntity: (i) => bossLive[i] || null, bossTick,
      // slice 7
      safeReturn: { on: SAFE_ON, shield: SAFE_SHIELD, hop: SAFE_HOP, last: () => lastReturn }, portalPrompt: () => promptFor, portalUrls, portalSeed, enterPortal, lastPortalUrl: null, RETURN_RE,
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
      // slice 11: world debuffs (roll(creature, zone, force) = one bolt hit; table = creature -> status; shown by arena.statusOf)
      worldStatus: { on: STATUS_ON, table: BOLT_ST, forCreature: boltStatusFor, roll: boltRoll, log: stLog },
      ttk: { on: TTK_ON }, pickups: { on: PICK_ON, cap: PICK_CAP, magnet: MAGNET_R, list: () => picks.map((q) => ({ type: q.type, art: q.art, value: q.value, tier: q.tier, x: q.x, y: q.y, lifeMs: q.lifeMs })), spawn: spawnPickups, got: () => Object.assign({}, pickGot), total: () => pickTotal },
      nexus: { on: NX_ON, site: nxSite, open: nexusOpen, close: nexusClose, isOpen: () => nxOpen, near: () => nxNear, enterTile: () => nxEnterTile, talk: (id) => { const n = NX_ON && NX.layout().npcs.find((x) => x.id === id); if (n) { nxBuild(); nxTalk(n); } return nxDom && nxDom.last; }, portal: (id) => { const q = NX_ON && NX.layout().portals.find((x) => x.id === id); return q ? nxPortal(q) : null; }, lastUrl: () => api.lastNexusUrl || null, today: todayUtc },
      quests: { date: questDate, list: () => MMQuests.quests(questDate()), summary: () => MMQuests.summary(save.quests, questDate()), state: () => JSON.parse(JSON.stringify(save.quests || MMQuests.fresh(questDate()))), event: nxQuestEvent, claim: nxClaim, flush: () => { qDirty = false; return writeSave(save); } },
      settle, stashNote, lastSettle: () => lastSettle, finds: () => (ST ? ST.readFinds(localStorage) : null),
    };
    return { api, hooks };
  }

  window.RealmWorld = { create, cleanSave, cleanSeed, readSave, writeSave, SAVE_KEY, PAL };
})();
