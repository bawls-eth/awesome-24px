// Realm World (unified Realm slices 5-7): the big scrolling overworld on the standalone Mad Maze page (?mode=world[&seed=N], or ?world=1).
// A controller that drives RealmArena from outside, like dungeon.js: it generates the island with MMOverworld, installs tile collision and
// the camera through arena.setWorld, draws the terrain in code into cached 512x512 chunk canvases (16x16 tiles, LRU), shows a zone HUD and
// a minimap, and saves to its OWN additive key `pixeltown-realm-v1` (never touches pixeltown-save-v1's format).
// Needs: MMRng, MMOverworld, MMZones, realm.js. Optional: MMArt (terrain tiles `tile_<terrain>_a..d` from INDEX.json, code fallback).
(function () {
  'use strict';
  const SAVE_KEY = 'pixeltown-realm-v1';
  // Tiered gear drops (G9): ON by default since the save-tolerance slice (G7) shipped (PR #32): every build since keeps `t` / `a` / `gp` / `eq.armor`.
  // ?gear=0 is the kill switch and always wins (also over save.gearOn); ?gear=1 forces it on.
  const GEAR_DEFAULT_ON = true;
  const TILE = 32; const CH = 16; const CPX = TILE * CH; const MAX_CHUNKS = 24;
  const SEED_RE = /^[A-Za-z0-9_-]{1,24}$/;
  const AT_RE = /^(\d{1,4}),(\d{1,4})$/;
  // Beta S-06: INDEX.json / manifests through MMArt's per-page JSON cache (one request per url for the whole page); plain fetch without it.
  const rwJson = (u) => (typeof window !== 'undefined' && window.MMArt && typeof window.MMArt.fetchJson === 'function' ? window.MMArt.fetchJson(u) : fetch(u).then((r) => (r.ok ? r.json() : null)));

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
    Object.keys(o).forEach((k) => { if (/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(k) && !/^(v|seed|version|pos|stats|returnTo|evT|evDone|finds|discovered|shrineAt|chests|quests|bossKeys|bossPortal|questBags|gp|gearOn|fb|seatPos|zk|errand)$/.test(k)) out[k] = o[k]; }); // keep unknown (future) keys
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
    // boss keys (additive, BK2): keys held (0..9) and an open boss portal ({boss:{x,y,openedAt,expiresAt}} on the event clock, ms), cleaned by MMPortals
    if (o.bossKeys !== undefined) { const k = Math.floor(Number(o.bossKeys)); out.bossKeys = Number.isFinite(k) ? Math.max(0, Math.min(9, k)) : 0; }
    // quest reward bags waiting to drop (additive, RB3): [{ q: quest id, d: 'YYYY-MM-DD' }]; the items are re-derived from MMQuests.rewardBag, never stored
    if (Array.isArray(o.questBags)) { const qb = []; o.questBags.forEach((b) => { if (b && typeof b === 'object' && typeof b.q === 'string' && /^[a-z_]{1,24}$/.test(b.q) && typeof b.d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.d) && !qb.some((x) => x.q === b.q && x.d === b.d) && qb.length < 3) qb.push({ q: b.q, d: b.d }); }); if (qb.length) out.questBags = qb; }
    if (o.bossPortal !== undefined && window.MMPortals) { const bp = window.MMPortals.clean(o.bossPortal); if (bp.boss) out.bossPortal = bp; }
    // gear pity (additive, G9): {b: z3 boss kills since the last T12, d: crypt boss kills since the last T10+}, each an int 0..9999; garbage -> defaults (key left out)
    if (o.gp && typeof o.gp === 'object' && !Array.isArray(o.gp)) { const g = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(9999, Math.floor(v))) : 0); const gp = { b: g(o.gp.b), d: g(o.gp.d) }; if (gp.b || gp.d) out.gp = gp; }
    if (o.gearOn === true) out.gearOn = true;
    // co-op seat positions (additive, beta S-04): only written with ?party=local; {'0'..'3': {x, y}}, at most 4 entries, key left out when empty
    if (o.seatPos && typeof o.seatPos === 'object' && !Array.isArray(o.seatPos)) {
      const sp = {}; ['0', '1', '2', '3'].forEach((k) => { const q = o.seatPos[k]; if (q && typeof q === 'object' && Number.isInteger(q.x) && Number.isInteger(q.y) && q.x >= 0 && q.y >= 0 && q.x < 4096 && q.y < 4096) sp[k] = { x: q.x, y: q.y }; });
      if (Object.keys(sp).length) out.seatPos = sp;
    }
    if (Number.isInteger(o.zk) && o.zk > 0 && o.zk < 16) out.zk = o.zk; // ID-13 (additive): bit z set once the first world boss of zone z died (first-kill bag floor spent); garbage -> key left out
    if (o.errand !== undefined && window.MMErrands) { const er = window.MMErrands.cleanRealm(o.errand); if (er.p) out.errand = er; } // ID-12 (additive): the Realm leg of the parcel errand; not started -> key left out
    else if (o.errand !== undefined) out.errand = o.errand; // a page without MMErrands keeps the value as it is (never drops progress)
    if (o.fb === 1) out.fb = 1; // FT2 (additive): this save has picked up its first world bag, so the first-bag guarantee is spent
    const r = o.returnTo && typeof o.returnTo === 'object' ? o.returnTo : null;
    if (o.finds !== undefined) out.finds = window.MMStash ? MMStash.cleanFinds(o.finds) : o.finds; // owned by MMStash (Lantern payout)
    out.returnTo = r && Number.isInteger(r.x) && Number.isInteger(r.y) && r.x >= 0 && r.y >= 0 && r.x < 4096 && r.y < 4096 && cleanSeed(r.seed) ? { x: r.x, y: r.y, seed: cleanSeed(r.seed) } : null;
    return out;
  }
  function readSave() { try { return cleanSave(localStorage.getItem(SAVE_KEY)); } catch (e) { return cleanSave(null); } }
  // Beta S-04 (b14-06): the co-op seat of this page (0-3), or -1 solo; set by create() from the world team (?party=local only).
  let saveSeat = () => -1;
  // Merge what another page saved meanwhile (same seed only): discovered fog = union of the bitsets, kill/portal counters = max,
  // opened chests = union, shrine use = latest, event clock = max. Position: in co-op each seat writes seatPos[seat] and only
  // seat 0 (or solo) writes the canonical `pos`; solo saves keep exactly today's shape (no seatPos key).
  function mergeStored(c, cur) {
    const st = cleanSave(cur);
    if (st.zk) c.zk = ((c.zk | 0) | st.zk) & 15;
    if (st.errand && window.MMErrands) { const E = window.MMErrands; const a = E.cleanRealm(st.errand), b = E.cleanRealm(c.errand); const p = a.p | b.p; c.errand = { id: E.ID, p: p, d: p ? (a.d | b.d) : 0 }; } // ID-12: the errand only moves forward // ID-13: zone first-kill bits are per hero, not per island: union with what another tab spent
    if (st.seed !== c.seed) return c;
    const F = window.MMFog;
    if (F && st.discovered) {
      const a = F.decode(st.discovered), b = c.discovered ? F.decode(c.discovered) : null;
      if (a && b) { for (let i = 0; i < a.length; i++) a[i] |= b[i]; c.discovered = F.encode(a); } else if (a && !b) c.discovered = st.discovered;
    }
    if (st.stats && c.stats) Object.keys(st.stats).forEach((k) => { c.stats[k] = Math.max(c.stats[k] || 0, st.stats[k] || 0); });
    if (st.chests) { const u = (c.chests || []).slice(); st.chests.forEach((id) => { if (u.indexOf(id) < 0 && u.length < 64) u.push(id); }); c.chests = u; }
    if (st.shrineAt) { const m = Object.assign({}, st.shrineAt, c.shrineAt || {}); Object.keys(st.shrineAt).forEach((k) => { m[k] = Math.max(m[k] || 0, st.shrineAt[k]); }); c.shrineAt = m; }
    c.evT = Math.max(c.evT || 0, st.evT || 0);
    const seat = saveSeat();
    if (seat >= 0) {
      // b14-06: every OTHER seat's entry comes from storage (that seat's own page wrote it last); only this page's seat comes from memory.
      // The old order let this page's stale copy of seat 0 win, so seat 0 reopened on its start tile.
      const k = String(seat), mine = c.pos ? { x: c.pos.x, y: c.pos.y } : (c.seatPos && c.seatPos[k]) || (st.seatPos && st.seatPos[k]) || null;
      const sp = Object.assign({}, c.seatPos || {}, st.seatPos || {});
      if (mine) sp[k] = mine; else delete sp[k];
      c.seatPos = sp;
      if (seat > 0) c.pos = st.pos; // only seat 0 moves the canonical position
    }
    return c;
  }
  function writeSave(s) {
    try {
      let c = cleanSave(s); // `finds` belongs to MMStash: always keep what storage holds (never an older in-memory copy)
      let cur = null; try { cur = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { cur = null; }
      if (cur && typeof cur === 'object' && cur.finds !== undefined) c.finds = window.MMStash ? MMStash.cleanFinds(cur.finds) : cur.finds; else delete c.finds;
      if (cur && typeof cur === 'object' && !Array.isArray(cur)) c = mergeStored(c, cur);
      if (c.seatPos && !Object.keys(c.seatPos).length) delete c.seatPos;
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
    if (save.seed !== seed) { save.pos = null; save.returnTo = null; delete save.discovered; delete save.shrineAt; delete save.chests; delete save.bossPortal; } // a new island starts fully fogged (one seed's discovery is kept at a time)
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
    // R4-D2 (b12-r2-04, b04-03): the DRAWN terrain. The generator thresholds a detail noise, which leaves 1-tile holes inside snow (the
    // "snow frames with square holes") and plus / cross shaped lava specks. A cardinal-majority filter, on walkable land
    // tiles only (never water, roads or solid tiles, so the drawn ground always matches collision): a tile with 3-4 neighbours of one other
    // terrain, or with no same-terrain neighbour, draws as that neighbour terrain (repeated until stable, at most 4 passes). Gameplay terrain (speed, zone, spawns) is untouched.
    // ?smooth=0 draws the raw generator terrain.
    const SMOOTH = !/[?&]smooth=0(&|$)/.test(qs0);
    const drawT = new Uint8Array(terrain);
    const smoothStat = { changed: 0 };
    if (SMOOTH) {
      const keep = (t) => t === T.deep_water || t === T.shallow_water || t === T.dirt_road;
      for (let pass = 0, moved = 1; pass < 4 && moved; pass++) { // until stable (at most 4 passes)
        const src = new Uint8Array(drawT); moved = 0;
        for (let y = 1; y < wh - 1; y++) for (let x = 1; x < ww - 1; x++) {
          const i = y * ww + x; const t = src[i];
          if (solid[i] || keep(t)) continue;
          const nb = [src[i - ww], src[i + 1], src[i + ww], src[i - 1]];
          let same = 0; for (let k = 0; k < 4; k++) if (nb[k] === t) same++;
          if (same >= 2) continue;
          let best = -1, bestN = 0;
          for (let k = 0; k < 4; k++) {
            const o = nb[k]; if (o === t || keep(o)) continue;
            let n = 0; for (let j = 0; j < 4; j++) if (nb[j] === o) n++;
            if (n > bestN) { bestN = n; best = o; }
          }
          if (best >= 0 && (bestN >= 3 || (same === 0 && bestN >= 2))) { drawT[i] = best; smoothStat.changed++; moved = 1; }
        }
      }
    }

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
    const tileArt = Object.create(null); // terrain id -> fixed a-h slots
    // R4-D2: batches load in parallel, so a remake must win BY RANK, not by load order: r01 (Codex R01 realm terrain remake, 8 variants a-h,
    // organic transitions) beats the older b10t / b11a / b11b art for the same id; any terrain or blend r01 lacks keeps its old art.
    const tileRank = new Map(); // image bank slot -> rank of the batch that filled it
    const TILE_RANK = (folder) => (/^r01-/.test(folder) && !/[?&]r01=0(&|$)/.test(qs0) ? 2 : /^r01-/.test(folder) ? -1 : 1);
    const edgeArt = Object.create(null); // terrain id -> blend id -> mask slots
    let artTiles = 0;
    function loadTileArt(root) {
      if (!root || typeof fetch !== 'function') return Promise.resolve(0);
      const join = (a, b) => a.replace(/\/+$/, '') + '/' + String(b).replace(/^\/+/, '');
      const okPath = (p) => typeof p === 'string' && /^[A-Za-z0-9_][A-Za-z0-9_.\/-]*\.png$/.test(p) && p.indexOf('..') < 0;
      return rwJson(join(root, 'INDEX.json')).then((idx) => {
        const batches = idx && Array.isArray(idx.batches) ? idx.batches : [];
        return Promise.all(batches.map((b) => {
          const id = b && typeof b.path === 'string' ? b.path.replace(/\/+$/, '').split('/').pop() : '';
          if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(id)) return null;
          const rank = TILE_RANK(id); if (rank < 0) return null;
          return rwJson(join(join(root, id), 'manifest.json')).then((m) => {
            const assets = m && Array.isArray(m.assets) ? m.assets : [];
            return Promise.all(assets.map((a) => {
              const mt = a && typeof a.id === 'string' ? /^tile_([a-z_]+)_([a-h]|edge_\d{2})$/.exec(a.id) : null;
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
                    const rk = tileRank.get(bank) || []; if (!variant) tileRank.set(bank, rk);
                    if (variant) { const vr = tileRank.get(banks) || {}; tileRank.set(banks, vr); const cur = vr[tid] || 0; if (rank < cur) { res(); return; } if (rank > cur) { if (bank.length) { artTiles -= bank.filter(Boolean).length; bank.length = 0; } vr[tid] = rank; } }
                    else if ((rk[slot] || 0) > rank) { res(); return; }
                    if (!bank[slot]) artTiles++;
                    bank[slot] = img; if (!variant) rk[slot] = rank;
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
      const neighbours = [drawT[i - ww], drawT[i + 1], drawT[i + ww], drawT[i - 1]];
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
    // Godlands readability: scenery there is dim, desaturated and non-round so the bright round shapes are only bullets (?props=classic restores the old look).
    const PROPS_CLASSIC = typeof location !== 'undefined' && /[?&]props=classic(&|$)/.test(location.search);
    const DIM_SAT = 0.22; const DIM_VAL = 0.5; // HSV caps for dimmed props: max channel <= 128 (50%), saturation <= 0.22
    const GOD_TERRAIN = { godland_ash: 1, blood_ruins: 1, cracked_stone: 1, lava_rock: 1 };
    const GOD_POOL = {
      godland_ash: ['prop_tree_dead', 'prop_rock_b', 'prop_tombstone_cross', 'prop_pillar_ruin_a', 'prop_obelisk', 'prop_boulder_cluster', 'prop_grave_a'],
      blood_ruins: ['prop_tombstone_cross', 'prop_pillar_ruin_b', 'prop_rock_b', 'prop_obelisk', 'prop_tree_dead', 'prop_grave_b'],
      cracked_stone: ['prop_rock_b', 'prop_pillar_ruin_a', 'prop_obelisk', 'prop_boulder_cluster', 'prop_grave_a'],
      lava_rock: ['prop_rock_a', 'prop_rock_b', 'prop_boulder_cluster', 'prop_tree_dead'],
    };
    const dimCache = new Map();
    function dimOf(a) { // cached desaturated + darkened copy of a prop strip (pixel-level, no per-frame work)
      let d = dimCache.get(a); if (d) return d;
      d = { img: a.img, fw: a.fw, fh: a.fh, ax: a.ax, ay: a.ay, ok: false };
      try {
        const cv = document.createElement('canvas'); cv.width = a.img.naturalWidth; cv.height = a.img.naturalHeight;
        const c = cv.getContext('2d'); c.drawImage(a.img, 0, 0);
        const im = c.getImageData(0, 0, cv.width, cv.height); const px = im.data;
        for (let i = 0; i < px.length; i += 4) {
          if (!px[i + 3]) continue;
          const r = px[i] / 255; const gg = px[i + 1] / 255; const b = px[i + 2] / 255;
          const mx = Math.max(r, gg, b); const mn = Math.min(r, gg, b); const l = (mx + mn) / 2; const grey = 0.3 * r + 0.59 * gg + 0.11 * b;
          let k = 1; const sat = mx ? (mx - mn) / mx : 0; if (sat > DIM_SAT) k = DIM_SAT / sat; // pull colour toward grey until saturation <= cap
          let nr = grey + (r - grey) * k; let ng = grey + (gg - grey) * k; let nb = grey + (b - grey) * k;
          const nm = Math.max(nr, ng, nb); const sc = nm > DIM_VAL ? DIM_VAL / nm : 1;
          void l; px[i] = Math.floor(nr * sc * 255); px[i + 1] = Math.floor(ng * sc * 255); px[i + 2] = Math.floor(nb * sc * 255);
        }
        c.putImageData(im, 0, 0); d.img = cv; d.ok = true;
      } catch (e) { /* tainted canvas: fall back to the original strip at reduced alpha */ }
      dimCache.set(a, d); return d;
    }
    function godPropPalette() { // every opaque colour a dimmed Godlands prop can show ([r,g,b] strings), for the readability test
      const out = new Set(['94,90,85', '74,58,52', '26,16,16', '42,32,34']);
      const ids = {}; Object.keys(GOD_POOL).forEach((k) => GOD_POOL[k].forEach((id) => { ids[id] = 1; })); ids.prop_skeleton_bones = 1; ids.prop_crystal_red = 1; Object.keys(B26_SET).forEach((id) => { ids[id] = 1; });
      Object.keys(ids).forEach((id) => {
        const a = wArt[id]; if (!a) return; const d = dimOf(a); if (!d.ok) return;
        const px = d.img.getContext('2d').getImageData(0, 0, d.img.width, d.img.height).data;
        for (let i = 0; i < px.length; i += 4) if (px[i + 3]) out.add(px[i] + ',' + px[i + 1] + ',' + px[i + 2]);
      });
      return Array.from(out);
    }
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
        case 'bones': g.strokeStyle = PROPS_CLASSIC ? '#eee6cf' : '#5e5a55'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx - 6, cy - 2); g.lineTo(cx + 6, cy + 6); g.moveTo(cx + 6, cy - 2); g.lineTo(cx - 6, cy + 6); g.stroke(); break;
        case 'ember_vent': g.fillStyle = '#1a1010'; g.beginPath(); g.arc(cx, cy, 8, 0, Math.PI * 2); g.fill(); g.fillStyle = PROPS_CLASSIC ? '#ff7a2a' : '#4a3a34'; g.beginPath(); g.arc(cx, cy, 4, 0, Math.PI * 2); g.fill(); break;
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
    // Terrain depth (bug bash): seeded per-tile detail baked ONCE into the chunk canvas (no per-frame work): soft light / shade patches on a
    // 4-tile grid so open ground reads as rolling, plus 0-2 tiny square pebbles / tufts per tile. Low-contrast squares only (never round, so the
    // bright round shapes stay bullets). ?tiledetail=0 = the flat look.
    const TILE_DETAIL = !/[?&]tiledetail=0(&|$)/.test(qs0);
    const GOD_LOOK = TILE_DETAIL && !/[?&]godlook=0(&|$)/.test(qs0); // W-03: ?godlook=0 = the old grey ash
    const edgeStat = { drawn: 0, skipped: 0 }, shadeStat = { dithered: 0, ash: 0 }; // bake counters (test hooks)
    // W-03 (b04-01): a patch side that borders a different shade class fades out over 8 px as a 2-colour checker (baked), not a hard seam.
    // R4-D2 (b04-01): the shade classes came from two offset 4x4-tile grids, so every patch was an axis-aligned rectangle (the quilt look).
    // Now a smooth value noise (bilinear, smoothstep, 5-tile cells, two octaves): patches follow organic tile-step outlines instead.
    const vnoise = (x, y, s) => { const xi = Math.floor(x), yi = Math.floor(y); let fx = x - xi, fy = y - yi; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
      const a = h2(xi, yi, s), b = h2(xi + 1, yi, s), c = h2(xi, yi + 1, s), d = h2(xi + 1, yi + 1, s); return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy; };
    const shadeOf = (wx, wy) => { const v = vnoise(wx / 5.3, wy / 5.3, 501) * 0.7 + vnoise(wx / 2.1, wy / 2.1, 502) * 0.3; return v < 0.33 ? -1 : v > 0.68 ? 1 : 0; };
    function shadePatch(g, wx, wy, px, py, col) {
      const sc = shadeOf(wx, wy); const n = shadeOf(wx, wy - 1) === sc, s = shadeOf(wx, wy + 1) === sc, w = shadeOf(wx - 1, wy) === sc, e = shadeOf(wx + 1, wy) === sc;
      const x0 = w ? 0 : 8, x1 = e ? TILE : TILE - 8, y0 = n ? 0 : 8, y1 = s ? TILE : TILE - 8;
      rect(g, col, px + x0, py + y0, x1 - x0, y1 - y0);
      g.fillStyle = col; // the 8 px rim on the open sides: every other 2x2 cell (checker), so the patch dissolves into the ground
      for (let yy = 0; yy < TILE; yy += 2) for (let xx = 0; xx < TILE; xx += 2) {
        if (xx >= x0 && xx < x1 && yy >= y0 && yy < y1) continue;
        if (((xx + yy) >> 1) & 1) continue;
        if ((xx < 4 && !w) || (xx >= TILE - 4 && !e) || (yy < 4 && !n) || (yy >= TILE - 4 && !s)) continue; // outer 4 px: ground only
        g.fillRect(px + xx, py + yy, 2, 2);
      }
      shadeStat.dithered++;
    }
    function tileDetail(g, wx, wy, px, py) {
      const sc = shadeOf(wx, wy);
      if (sc < 0) shadePatch(g, wx, wy, px, py, 'rgba(0,0,0,0.08)');
      else if (sc > 0) shadePatch(g, wx, wy, px, py, 'rgba(255,255,255,0.05)');
      const n = Math.floor(h2(wx, wy, 503) * 3); // 0..2 specks
      for (let k = 0; k < n; k++) {
        const r = h2(wx + k * 17, wy, 504); const sx = px + 2 + Math.floor(h2(wx, wy + k * 13, 505) * (TILE - 6)); const sy = py + 2 + Math.floor(h2(wx * 3 + k, wy * 5, 506) * (TILE - 6));
        rect(g, r < 0.5 ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.10)', sx, sy, r < 0.25 ? 3 : 2, 2);
      }
    }
    // Cycle 1 art (G): open grass fields on a phone read calm (one flat green per screen). A seeded, sparse pass adds tiny flowers
    // (a 3x3 plus of one petal colour round a yellow / white centre), pebbles (2x2 grey with a 1 px light and dark pixel) and darker
    // grass tufts on grass / tall grass / meadow / dark grass ground. Square pixel clusters only (bullets stay the only bright round
    // shapes), never on solid or water tiles, baked once per chunk. ?fielddetail=0 = off.
    const FIELD_DETAIL = TILE_DETAIL && !/[?&]fielddetail=0(&|$)/.test(qs0);
    const fieldStat = { flowers: 0, pebbles: 0, tufts: 0, ms: 0, chunks: 0, maxMs: 0, cur: 0, chunkMs: 0, chunkMaxMs: 0 };
    const FIELD_PETALS = ['#f4f1e6', '#ffd23f', '#e86a92', '#9fc6ff', '#c9a7ff'];
    function fieldDetail(g, t, wx, wy, px, py) {
      const kind = t === T.flower_meadow ? 2 : t === T.dark_grass ? 1 : 0; // meadow: more flowers; dark grass: no flowers, more tufts
      const r = h2(wx, wy, 701);
      const fx = px + 3 + Math.floor(h2(wx, wy, 702) * (TILE - 8)), fy = py + 3 + Math.floor(h2(wx, wy, 703) * (TILE - 8));
      if (kind !== 1 && r < (kind === 2 ? 0.34 : 0.1)) {
        const pc = FIELD_PETALS[Math.floor(h2(wx, wy, 704) * FIELD_PETALS.length)];
        rect(g, 'rgba(0,0,0,0.18)', fx, fy + 2, 3, 1); // tiny ground shadow
        rect(g, pc, fx + 1, fy - 1, 1, 3); rect(g, pc, fx, fy, 3, 1);
        rect(g, pc === '#ffd23f' ? '#f4f1e6' : '#ffd23f', fx + 1, fy, 1, 1);
        fieldStat.flowers++;
      } else if (r < (kind === 2 ? 0.4 : 0.17)) {
        rect(g, '#7d8580', fx, fy, 2, 2); rect(g, '#b7bdb4', fx, fy, 1, 1); rect(g, '#4b524f', fx + 1, fy + 1, 1, 1);
        fieldStat.pebbles++;
      } else if (r < (kind === 1 ? 0.4 : 0.3)) {
        const c = 'rgba(16,40,20,0.34)'; rect(g, c, fx, fy, 1, 3); rect(g, c, fx + 2, fy - 1, 1, 4); rect(g, c, fx + 4, fy + 1, 1, 2);
        fieldStat.tufts++;
      }
    }
    // R4-D2 (b12-r2-04 "snow frames with square holes"): the b10t / b11 edge tiles draw a notch of the blend terrain in every corner whose
    // two cardinal sides are open, because the 4-bit mask cannot see diagonals. Inside a 2x2 (or larger) patch the four notches meet and
    // read as a square hole. When the diagonal neighbour is the same terrain too, the notch is painted back with the terrain's own
    // variant art (or its base colour), so only real concave corners keep the notch.
    const CORNER = 10;
    const cornerStat = { filled: 0 };
    function fillInnerCorners(g, wx, wy, t, px, py, art, pal) {
      if (wx < 1 || wy < 1 || wx >= ww - 1 || wy >= wh - 1) return;
      const at = (x, y) => drawT[y * ww + x] === t;
      const src = art && art.length ? art[Math.floor(h2(wx, wy, 91) * art.length)] : null;
      const C = [[0, -1, 1, 0, 1, -1, TILE - CORNER, 0], [0, 1, 1, 0, 1, 1, TILE - CORNER, TILE - CORNER], [0, 1, -1, 0, -1, 1, 0, TILE - CORNER], [0, -1, -1, 0, -1, -1, 0, 0]];
      for (let k = 0; k < 4; k++) {
        const c = C[k];
        if (!at(wx + c[0], wy + c[1]) || !at(wx + c[2], wy + c[3]) || !at(wx + c[4], wy + c[5])) continue;
        if (src) g.drawImage(src, c[6], c[7], CORNER, CORNER, px + c[6], py + c[7], CORNER, CORNER);
        else rect(g, pal[0], px + c[6], py + c[7], CORNER, CORNER);
        cornerStat.filled++;
      }
    }
    // Cycle 3 art (G), R01b stopgap: Highlands / Godlands seams (snow, lava rock, dry grass, gravel). A tile whose four cardinal
    // neighbours are its own terrain draws its plain variant, so where the diagonal neighbour is another terrain the two neighbours' edge
    // strips meet at a square stair-step. Here that corner (CORNER x CORNER) is copied from the terrain's OWN edge tile toward that
    // diagonal terrain, the mask whose two sides at that corner are connected (it carries the art's notch = an inner corner in the
    // artist's own pixels). Bake time only. ?icorner=0 = off. Hook: smoothStats().icorners.
    const ICORNER = !(typeof location !== 'undefined' && /[?&]icorner=0(&|$)/.test(location.search));
    const ICORNER_T = new Set(['snow', 'lava_rock', 'dry_grass', 'gravel'].filter((n) => Object.prototype.hasOwnProperty.call(T, n)).map((n) => T[n]));
    const icornerStat = { on: ICORNER, filled: 0 };
    function innerCorners(g, wx, wy, t, px, py) {
      if (wx < 1 || wy < 1 || wx >= ww - 1 || wy >= wh - 1) return;
      const banks = edgeArt[t]; if (!banks) return;
      // [dx, dy, maskForCorner (two connected sides + the side opposite the first), ox, oy]
      const C = [[1, -1, 1 | 2 | 4, TILE - CORNER, 0], [1, 1, 4 | 2 | 1, TILE - CORNER, TILE - CORNER], [-1, 1, 4 | 8 | 1, 0, TILE - CORNER], [-1, -1, 1 | 8 | 4, 0, 0]];
      for (let k = 0; k < 4; k++) {
        const c = C[k]; const d = drawT[(wy + c[1]) * ww + wx + c[0]];
        if (d === t || !banks[d]) continue;
        if (drawT[(wy + c[1]) * ww + wx] !== t || drawT[wy * ww + wx + c[0]] !== t) continue;
        const src = banks[d][c[2]]; if (!src) continue;
        g.drawImage(src, c[3], c[4], CORNER, CORNER, px + c[3], py + c[4], CORNER, CORNER);
        icornerStat.filled++;
      }
    }
    function buildChunk(cx, cy) {
      // fieldStat: ms / maxMs = the field pass alone (its added bake cost); chunkMs / chunkMaxMs = the whole chunk bake, for scale
      const ft0 = performance.now(); fieldStat.cur = 0;
      const out = buildChunk0(cx, cy);
      const all = performance.now() - ft0;
      if (fieldStat.cur > 0) { fieldStat.chunks++; fieldStat.ms += fieldStat.cur; fieldStat.maxMs = Math.max(fieldStat.maxMs, fieldStat.cur); fieldStat.chunkMs += all; fieldStat.chunkMaxMs = Math.max(fieldStat.chunkMaxMs, all); }
      return out;
    }
    function buildChunk0(cx, cy) {
      chunkBuilds++;
      const cv = document.createElement('canvas'); cv.width = CPX; cv.height = CPX;
      const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
      const variants = TN.map((_, id) => tileArt[id]?.filter(Boolean));
      const x0 = cx * CH; const y0 = cy * CH; let water = false;
      for (let ty = 0; ty < CH; ty++) for (let tx = 0; tx < CH; tx++) {
        const wx = x0 + tx; const wy = y0 + ty; const px = tx * TILE; const py = ty * TILE;
        if (wx >= ww || wy >= wh) { rect(g, PAL.deep_water[0], px, py, TILE, TILE); continue; }
        const i = wy * ww + wx; const t = drawT[i]; const pal = PAL[TN[t]] || PAL.grass;
        const art = variants[t];
        if (t === T.deep_water || t === T.shallow_water) water = true;
        const transition = transitionAt(wx, wy, t);
        if (transition) { g.drawImage(transition, px, py, TILE, TILE); fillInnerCorners(g, wx, wy, t, px, py, art, pal); }
        else if (art && art.length) { g.drawImage(art[Math.floor(h2(wx, wy, 91) * art.length)], px, py, TILE, TILE); if (ICORNER && ICORNER_T.has(t)) innerCorners(g, wx, wy, t, px, py); }
        else {
          rect(g, pal[0], px, py, TILE, TILE);
          for (let k = 0; k < 3; k++) { const r = h2(wx * 3 + k, wy, 7); if (r < 0.55) rect(g, r < 0.27 ? pal[1] : pal[2], px + Math.floor(h2(wx, wy * 5 + k, 11) * 26), py + Math.floor(h2(wx * 7 + k, wy, 13) * 26), t === T.flower_meadow ? 3 : 6, t === T.flower_meadow ? 3 : 4); }
        }
        if (TILE_DETAIL && t !== T.deep_water && t !== T.shallow_water && !solid[i]) tileDetail(g, wx, wy, px, py);
        if (FIELD_DETAIL && !solid[i] && (t === T.grass || t === T.tall_grass || t === T.flower_meadow || t === T.dark_grass)) { const f0 = performance.now(); fieldDetail(g, t, wx, wy, px, py); fieldStat.cur += performance.now() - f0; }
        if (GOD_LOOK && t === T.godland_ash) { // W-03 (b04-02): ash gets a dark ember wash and sparse ember specks (palette lava_rock accent)
          rect(g, 'rgba(36,8,18,0.42)', px, py, TILE, TILE);
          if (h2(wx, wy, 601) < 0.22) { const ex = px + 3 + Math.floor(h2(wx, wy, 602) * (TILE - 8)), ey = py + 3 + Math.floor(h2(wx, wy, 603) * (TILE - 8)); rect(g, '#ff7a2a', ex, ey, 2, 2); rect(g, 'rgba(255,122,42,0.35)', ex - 1, ey + 2, 4, 1); }
          shadeStat.ash++;
        }
        if (solid[i] && t !== T.deep_water) { rect(g, 'rgba(0,0,0,0.28)', px, py, TILE, TILE); rect(g, 'rgba(255,255,255,0.18)', px, py, TILE, 4); rect(g, 'rgba(0,0,0,0.35)', px, py + TILE - 5, TILE, 5); }
        // Transition sprites already draw the terrain boundary.
        if (transition) continue;
        // W-03 (b12-03): one edge per border. A neighbour that draws a transition tile (b10t edge art) already paints this boundary, so the
        // 2 px line is skipped there (it used to run parallel to the blend, one tile away: the double outline).
        const e = pal[3];
        const edgeTo = (nx, ny) => { const nt = drawT[ny * ww + nx]; if (nt === t) return false; if (transitionAt(nx, ny, nt)) { edgeStat.skipped++; return false; } edgeStat.drawn++; return true; };
        if (wx + 1 < ww && edgeTo(wx + 1, wy)) rect(g, e, px + TILE - 2, py, 2, TILE);
        if (wx > 0 && edgeTo(wx - 1, wy)) rect(g, e, px, py, 2, TILE);
        if (wy + 1 < wh && edgeTo(wx, wy + 1)) rect(g, e, px, py + TILE - 2, TILE, 2);
        if (wy > 0 && edgeTo(wx, wy - 1)) rect(g, e, px, py, TILE, 2);
      }
      const list = propsBy[cy * ccols + cx];
      if (list) for (let k = 0; k < list.length; k++) {
        const b = b26Code(list[k]); // b26: Godlands bones / dead trees as the muted Codex sprites; the dim code drawing stays the fallback
        if (b) { const d = dimOf(b); g.drawImage(d.ok ? d.img : b.img, 0, 0, b.fw, b.fh, (list[k].x - x0) * TILE + 16 - b.ax, (list[k].y - y0) * TILE + 30 - b.ay, b.fw, b.fh); artDraws.b26++; continue; }
        drawProp(g, list[k].kind, (list[k].x - x0) * TILE, (list[k].y - y0) * TILE, false);
      }
      if (artOn) {
        const al = chunkProps(cx, cy);
        for (let k = 0; k < al.length; k++) { let a = wArt[al[k].id] || (al[k].base ? wArt[al[k].base] : null); if (a && al[k].id !== al[k].base && B26_SET[al[k].id] && wArt[al[k].id]) artDraws.b26++; if (a && TREE_FIX && TREE_FIX_IDS[al[k].id] && !al[k].dim) { const fa = treeFixOf(al[k].id, a); if (fa !== a) { a = fa; treeFixStat.draws++; } } if (a && al[k].dim) { a = dimOf(a); if (!a.ok) g.globalAlpha = 0.5; } if (a) g.drawImage(a.img, 0, 0, a.fw, a.fh, (al[k].x - x0) * TILE + 16 - a.ax, (al[k].y - y0) * TILE + 30 - a.ay, a.fw, a.fh); g.globalAlpha = 1; }
      }
      let wcv = null;
      if (water) { // a sparse highlight layer, faded / nudged per frame for a cheap shimmer
        wcv = document.createElement('canvas'); wcv.width = CPX; wcv.height = CPX;
        const wg = wcv.getContext('2d');
        for (let ty = 0; ty < CH; ty++) for (let tx = 0; tx < CH; tx++) {
          const wx = x0 + tx; const wy = y0 + ty; if (wx >= ww || wy >= wh) continue;
          const t = drawT[wy * ww + wx]; if (t !== T.deep_water && t !== T.shallow_water) continue;
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
      g.font = 'bold 12px ui-monospace, Menlo, Consolas, monospace'; /* cyc11 art: mono like the portal labels */ g.textAlign = 'center'; g.fillStyle = '#000'; g.fillText(q.label, q.x + 1, q.y - 37); g.fillStyle = q.col; g.fillText(q.label, q.x, q.y - 38);
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
    const artDraws = { portal: 0, shrine: 0, chest: 0, beacon: 0, pad: 0, b26: 0 };
    // b26 (Codex godlands-props-fix): muted obelisks, bone piles and dead trees replace the Godlands props BY ID. The art pool keeps its seeded
    // positions (only the id changes, the old id stays as `base` and is drawn dimmed if the new strip is missing); the generator's code-drawn
    // `bones` / `dead_tree` on Godlands ground draw the bone-pile / dead-tree strips when loaded, else the dim code drawing. ?props=classic or ?art=0: off.
    const B26_ON = artOn && !PROPS_CLASSIC;
    const B26_SWAP = { prop_obelisk: ['prop_godlands_obelisk_a', 'prop_godlands_obelisk_b'], prop_tree_dead: ['prop_godlands_dead_tree_a', 'prop_godlands_dead_tree_b'] };
    const B26_CODE = { bones: ['prop_godlands_bone_pile_a', 'prop_godlands_bone_pile_b'], dead_tree: ['prop_godlands_dead_tree_a', 'prop_godlands_dead_tree_b'] };
    const B26_SET = {}; [B26_SWAP, B26_CODE].forEach((m) => Object.keys(m).forEach((k) => m[k].forEach((id) => { B26_SET[id] = 1; })));
    const b26Pick = (pair, x, y) => pair[h2(x, y, 261) < 0.5 ? 0 : 1];
    function b26Code(p) { // a loaded b26 strip for a generator prop on Godlands ground, or null (code fallback)
      if (!B26_ON || !B26_CODE[p.kind] || p.x < 0 || p.y < 0 || p.x >= ww || p.y >= wh || GOD_TERRAIN[TN[terrain[p.y * ww + p.x]]] !== 1) return null;
      return wArt[b26Pick(B26_CODE[p.kind], p.x, p.y)] || null;
    }
    // Cycle 1 art (G): the R03 prop_tree_medium / prop_tree_small canopies read as one round ball on a stick at 1x (and the medium one
    // floats 4 px above its trunk). At bake time, once per strip (cached), the canopy rows are re-drawn from an original clump map:
    // 4-6 overlapping leaf clumps with dark seams, lit top-left, a scalloped outline, the medium canopy reaching down to its trunk.
    // Colours come from the strip itself (outline = its darkest px, then dark / mid / light leaf by brightness), so the palette stays
    // R03's. Only rows above the trunk are replaced; a strip of another size is left alone. ?treefix=0 = the R03 pixels.
    // Map letters: A outline, B light leaf, C dark leaf, D mid leaf, '.' transparent.
    const TREE_FIX = !/[?&]treefix=0(&|$)/.test(qs0);
    const TREE_MAPS = {
      prop_tree_medium: { w: 32, h: 64, rows: [
        '................................',
        '................................',
        '................................',
        '..........AAAAA...AAAAAA........',
        '.........ABBBDDA.ABBBDDDA.......',
        '........ABBBDDDDABBBDDDDDA......',
        '.......ABBBDDDDDBBBDDDDDDDA.....',
        '......ABBBDDDDDDBBDDDDDDDDA.....',
        '......ABBDDDDDDCCDDDDDDDDCCA....',
        '......ABDDDDDDBBBDDDDDDDCCCA....',
        '......ADDDDDBBBBDDDDDDDCCCA.....',
        '.....AADCDDBBBBDDDDDDDCCCCDA....',
        '....ABBBCDBBBBDDDDDDDDDCCDDDA...',
        '...ABBBBDCBBBDDDDDDDDDDCDDDDDA..',
        '..ABBBBDDDCBDDDDDDDDDDCDDDDDDDA.',
        '..ABBBDDDCCDDDDDDDDDDCCCDDDDDDA.',
        '..ABBDDDDDCDDDDDDDDDCCCDDDDDDCCA',
        '.ABBDDDDDDCDDDDDDDDCCCCDDDDDCCCA',
        '..ADDDDDDDCCDDDDDDCCCCCDDDDCCCA.',
        '..ADDDDDDDDCCDDDDCCCCCDDDDCCCCA.',
        '..ADDDDDDDCCCCCCCCCCCDDDDCCCCA..',
        '...ADDDDDCCCCCCCCCCDCCDDCCCCA...',
        '....ACCCCCCCCDDDDDDDDCCCCCCA....',
        '.....AABCCBDDDDDDDDDDDDDCCA.....',
        '......ABBBDDDDDDDDDDDDDCCCA.....',
        '......ABBDDDDDDDDDDDDDCCCCA.....',
        '......ABDDDDDDDDDDDDDCCCCCA.....',
        '......ADDDDDDDDDDDDDCCCCCCA.....',
        '.......ADDDDDDDDDDDCCCCCCA......',
        '.......ADDDDDDDDDDCCCCCCCA......',
        '........ADDDDDDDDCCCCCCCA.......',
        '.........ADDDDDDCCCCCCCA........',
        '..........AACCCCCCCCCAA.........',
        '............AACCCCCAA...........'] },
      prop_tree_small: { w: 32, h: 32, rows: [
        '................................',
        '..............AAAAA.............',
        '............AABBBDDAA...........',
        '...........ABBBBDDDDDA..........',
        '.....AAAAAAABBBDDDDDDA..........',
        '....ABBBDDDABBDDDDDDCA.AAAA.....',
        '...ABBBDDDDCBDDDDDDCCCABBBDAA...',
        '..ABBBDDDDDDCDDDDDCCCBBBBDDDDA..',
        '..ABBDDDDDDDCDDDDCCCCBBBDDDDDDA.',
        '.ABBDDDDDDDDCDDDCCCCBBBDDDDDDDA.',
        '.ABDDDDDDDDCCCCCCCCABBDDDDDDDCA.',
        '..ADDDDDDDCCCBBBDDDDCDDDDDDDCCA.',
        '..ADDDDDDCCCCBBDDDDDCDDDDDDCCCA.',
        '...ADDDDCCCCBBDDDDDDCCDDDDCCCCA.',
        '....ACCCCCCBBDDDDDDDDCCDDCCCCA..',
        '.....AAAABBBDDDDDDDDDDDCCCCAA...',
        '........ABBDDDDDDDDDDDCCAAA.....',
        '........ABDDDDDDDDDDDCCCA.......',
        '........ADDDDDDDDDDDCCCCA.......',
        '........ADDDDDDDDDDCCCCCA.......',
        '.........ADDDDDDDDCCCCCA........',
        '..........ADDDDDDCCCCCA.........',
        '...........ACCCCCCCCCA..........',
        '............AACCCCCAA...........'] },
    };
    const TREE_FIX_IDS = { prop_tree_medium: 1, prop_tree_small: 1 };
    const treeFixStat = { built: 0, draws: 0, ms: 0 };
    const treeFixed = {};
    function treeFixOf(id, a) {
      const map = TREE_MAPS[id];
      if (!TREE_FIX || !map || !a || a.frames !== 1 || a.fw !== map.w || a.fh !== map.h) return a;
      if (treeFixed[id] && treeFixed[id].src === a) return treeFixed[id].out;
      const t0 = performance.now(); let out = a;
      try {
        const W = a.fw, H = a.fh, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        const g = cv.getContext('2d'); g.drawImage(a.img, 0, 0, W, H, 0, 0, W, H);
        const im = g.getImageData(0, 0, W, H), d = im.data, R = map.rows.length;
        let ol = null; const leaves = {};
        for (let i = 0; i < W * R * 4; i += 4) {
          if (d[i + 3] < 128) continue; const l = d[i] + d[i + 1] + d[i + 2];
          if (!ol || l < ol[3]) ol = [d[i], d[i + 1], d[i + 2], l];
          if (d[i + 1] > d[i] + 8 && d[i + 1] >= d[i + 2]) leaves[d[i] + ',' + d[i + 1] + ',' + d[i + 2]] = l;
        }
        if (ol) delete leaves[ol[0] + ',' + ol[1] + ',' + ol[2]]; // the outline is a dark teal, not a leaf colour
        const lv = Object.keys(leaves).sort((p, q) => leaves[p] - leaves[q]).map((k) => k.split(',').map(Number));
        if (ol && lv.length >= 3) {
          const P = { A: ol, C: lv[0], D: lv[Math.floor(lv.length / 2)], B: lv[lv.length - 1] };
          for (let y = 0; y < R; y++) for (let x = 0; x < W; x++) {
            const ch = map.rows[y][x], i = (y * W + x) * 4, c = P[ch];
            if (c) { d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; } else d[i + 3] = 0;
          }
          g.putImageData(im, 0, 0);
          out = Object.assign({}, a, { img: cv, treeFix: true });
          treeFixStat.built++;
        }
      } catch (e) { out = a; }
      treeFixStat.ms += performance.now() - t0;
      treeFixed[id] = { src: a, out };
      return out;
    }
    function treeFixApi() { return { on: TREE_FIX, built: treeFixStat.built, draws: treeFixStat.draws, ms: treeFixStat.ms, art: (id) => { const a = wArt[id]; if (!a) return null; return { src: a.src, orig: a.img, fixed: treeFixOf(id, a).img, fw: a.fw, fh: a.fh }; } }; }
    let wArtLoading = false;
    function drawArt(g, a, f, x, y) { g.drawImage(a.img, f * a.fw, 0, a.fw, a.fh, Math.round(x - a.ax), Math.round(y - a.ay), a.fw, a.fh); }
    function frameOf(a, tt, reduced) { return reduced || a.frames < 2 ? 0 : Math.floor(tt * a.fps) % a.frames; } // time-sliced, reduce-motion = frame 0
    function loadWorldArt(root) {
      if (!artOn || !root || typeof fetch !== 'function') return Promise.resolve(0);
      wArtLoading = true;
      const join = (a, b) => a.replace(/\/+$/, '') + '/' + String(b).replace(/^\/+/, '');
      const okPath = (p) => typeof p === 'string' && /^[A-Za-z0-9_][A-Za-z0-9_.\/-]*\.png$/.test(p) && p.indexOf('..') < 0;
      const WANT = /^(portal_[a-z]+|spawn_pad|shrine_(heal|rage|ward)|event_beacon|loot_chest_gold|prop_[a-z0-9_]+|coin_f[1-4]|xp_orb_f[1-4]|heart_pickup|focus_pickup|potion_(life|focus|power|swift|guard|wit)|key_boss)$/;
      let got = 0;
      return rwJson(join(root, 'INDEX.json')).then((idx) => {
        const batches = idx && Array.isArray(idx.batches) ? idx.batches : [];
        return Promise.all(batches.map((b) => {
          const id = b && typeof b.path === 'string' ? b.path.replace(/\/+$/, '').split('/').pop() : '';
          if (!/^(b1[2345]|b2[26]|r03)-[a-z0-9-]{1,48}$/.test(id)) return null; // b26 = the Godlands prop fix, b22 = key_boss (BK2)
          // R4-D2: r03 (Codex R03 nature props remake: same ids, cells and anchors as b12, outlined and shaded) wins over b12 by rank, not load order. ?r03=0: b12.
          const rank = /^r03-/.test(id) ? (/[?&]r03=0(&|$)/.test(qs0) ? -1 : 2) : 1; if (rank < 0) return null;
          return rwJson(join(join(root, id), 'manifest.json')).then((m) => {
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
                img.onload = () => { if (img.naturalWidth === fw * frames && img.naturalHeight === fh && !(wArt[a.id] && wArt[a.id].rank > rank)) { wArt[a.id] = { img, frames, fw, fh, fps: Number(a.fps) > 0 ? Math.min(Number(a.fps), 24) : 8, ax, ay, rank, src: id }; got++; } res(); };
                img.onerror = () => res();
                img.src = join(join(root, id), a.path);
              });
            }));
          }).catch(() => null);
        }));
      }).then(() => { wArtLoading = false; if (got) { dropChunks(); if (nxOpen) nxDrawPlaza(); } return got; }) // an open Nexus plaza redraws once with the art.catch(() => { wArtLoading = false; return 0; });
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
          const tn = TN[terrain[i]]; const god = !PROPS_CLASSIC && GOD_TERRAIN[tn] === 1;
          const pool = god ? GOD_POOL[tn] : NAT[tn]; if (!pool) continue; // water and the roads themselves stay clear
          let bad = false;
          for (let k = 0; k < exPts.length && !bad; k++) { const e = exPts[k]; if (Math.abs(e.x - wx) <= e.r && Math.abs(e.y - wy) <= e.r) bad = true; }
          for (let k = 0; k < L.length && !bad; k++) if (Math.abs(L[k].x - wx) < 3 && Math.abs(L[k].y - wy) < 3) bad = true;
          if (bad) continue;
          let near = false;
          for (let oy = -2; oy <= 2 && !near; oy++) for (let ox = -2; ox <= 2 && !near; ox++) { const x2 = wx + ox; const y2 = wy + oy; if (x2 >= 0 && y2 >= 0 && x2 < ww && y2 < wh && isRoad(terrain[y2 * ww + x2])) near = true; }
          for (let k = 0; k < campPts.length && !near; k++) if (Math.abs(campPts[k].x - wx) <= 7 && Math.abs(campPts[k].y - wy) <= 7) near = true;
          const id = near && roll < 0.6 ? STRUCT[Math.floor(roll2 * STRUCT.length)] : pool[Math.floor(roll2 * pool.length)];
          const sw = B26_ON && god && B26_SWAP[id] ? b26Pick(B26_SWAP[id], wx, wy) : null;
          L.push({ x: wx, y: wy, id: sw || id, base: sw ? id : undefined, dim: !PROPS_CLASSIC && (god || id === 'prop_skeleton_bones' || /^prop_crystal_/.test(id)) });
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
    // ---------- ID-02 zone danger meter (cycle 1 S; markup + classes: design/beta/cycle1-ui.md). MMDanger turns the smooth
    // MMOverworld.difficultyAt under the hero into an area level and compares it with the hero level: comfortable / tough / too hot.
    // Text label + icon + bar (colour is never the only cue), written once a second from goalTick and only when it changes. ?danger=0 = off.
    const DANGER_ON = !/[?&]danger=0(&|$)/.test(qs0) && !!window.MMDanger && typeof O.difficultyAt === 'function';
    const dangerEl = document.createElement('span'); dangerEl.id = 'rw-danger'; dangerEl.className = 'rw-danger hidden';
    dangerEl.innerHTML = '<span class="rw-danger-ico" aria-hidden="true"></span><span class="rw-danger-bar" aria-hidden="true"><span class="rw-danger-fill"></span></span><span class="rw-danger-txt"></span>';
    const dIco = dangerEl.querySelector('.rw-danger-ico'); const dFill = dangerEl.querySelector('.rw-danger-fill'); const dTxt = dangerEl.querySelector('.rw-danger-txt');
    let dangerKey = ''; let dangerNow = null;
    if (DANGER_ON) zoneEl.appendChild(dangerEl);
    // Cycle 8 S (ID-51 follow-up): a small "Resting" chip while the idle-hero rest is on, so a returning player knows why the enemies stand
    // still. Shown / hidden only when arena.resting changes (no per-frame DOM write); role=status, the word is the cue (not a colour).
    const restEl = document.createElement('span'); restEl.id = 'rw-rest'; restEl.className = 'rw-rest hidden'; restEl.setAttribute('role', 'status');
    restEl.innerHTML = '<span aria-hidden="true">💤</span> Resting<span class="rw-rest-more">: move to play</span>'; zoneEl.appendChild(restEl);
    let restShown = false;
    function restTick() { const on = !!arena.resting && !nxOpen; if (on !== restShown) { restShown = on; restEl.classList.toggle('hidden', !on); } }
    function dangerTick(hide) {
      if (!DANGER_ON) return;
      try {
        const p = arena.player; const lv = Math.max(1, (arena.save && arena.save.level) | 0);
        const r = MMDanger.rate(lv, O.difficultyAt(world, p.x / TILE, p.y / TILE), world.bands || 'classic');
        dangerNow = r; if (nxOpen) hide = true; // the Nexus plaza covers the world: no danger reading there
        const key = r.id + '|' + r.area + '|' + r.hero + '|' + r.fill;
        if (key !== dangerKey) {
          dangerKey = key;
          dangerEl.dataset.level = r.id; dangerEl.dataset.area = String(r.area);
          dangerEl.setAttribute('aria-label', r.text); dangerEl.title = r.text;
          dFill.style.setProperty('--rw-danger', String(r.fill));
          if (dIco.textContent !== r.icon) dIco.textContent = r.icon;
          if (dTxt.textContent !== r.label) dTxt.textContent = r.label; // the word changes only with the bucket: no aria-live spam
        }
        dangerEl.classList.toggle('hidden', !!hide);
      } catch (e) { dangerEl.classList.add('hidden'); }
    }
    // ---------- 'Next goal' line (bug bash): ONE short HUD line from the existing goal sources, no new state: an unclaimed daily quest reward,
    // else the first open daily quest (MMQuests) with its progress, else the next zone inland (MMZones recLv), else a boss altar.
    // textContent only, refreshed at most once a second, hidden while the first-run coach talks or a phone panel covers the corner. ?goal=0 = off.
    const GOAL_ON = !/[?&]goal=0(&|$)/.test(qs0);
    const goalEl = document.createElement('div'); goalEl.id = 'rw-goal'; goalEl.className = 'hidden';
    if (GOAL_ON) ov.appendChild(goalEl);
    let goalTxt = ''; let goalT = 0;
    function goalText(zi) {
      try {
        if (window.MMQuests && save.quests) {
          const rows = MMQuests.summary(save.quests, questDate());
          if (rows.some((q) => q.done && !q.claimed)) return 'Claim your quest reward at the Nexus';
          // G-06: a daily quest leads the goal line only when it is in reach: its zone's recLv <= hero level + 2 (a boss quest: the Midlands
          // recLv, where the first altars wake). A Lv 1 hero keeps the level goal instead of "Defeat 20 creatures in the Highlands".
          const zq = (Z.TABLES && Z.TABLES.ZONES) || []; const lvq = arena.save && arena.save.level | 0;
          const reach = (r) => { const zz = Number.isInteger(r.zone) && r.zone >= 0 && r.zone <= 3 ? r.zone : r.kind === 'boss' ? 1 : -1; return zz < 0 || (((zq[zz] || {}).recLv | 0) <= lvq + 2); };
          const q = rows.find((r) => !r.done); // the next quest on the board; out of reach = the level goal stays (no skipping ahead)
          if (q && reach(q)) return q.text + (q.need > 1 ? ` (${Math.min(q.p, q.need)}/${q.need})` : '');
        }
        const zs = (Z.TABLES && Z.TABLES.ZONES) || []; const z = zi && zi.zone >= 0 && zi.zone <= 3 ? zi.zone : 0;
        const next = zs[z + 1]; const lv = arena.save && arena.save.level | 0;
        // cyc1 U-05: no "(Lv N)" suffix: the hero's level is already on the info line right above, and the suffix wrapped the goal onto a 2nd phone line
        if (next && next.name) return lv >= (next.recLv | 0) ? `Head inland to the ${next.name}` : `Reach Lv ${next.recLv} for the ${next.name}`;
        return 'Find a boss altar and defeat its guardian';
      } catch (e) { return ''; }
    }
    function goalTick(zi, force) {
      goalT -= 0.25; if (goalT > 0 && !force) return; goalT = 1;
      dangerTick(panelHid || !!bossRect() || (RUSH_ON && rush.on));
      zonePlace();
      if (!GOAL_ON) return;
      const coach = document.getElementById('mm-coach');
      const coachUp = !!coach && !coach.classList.contains('hidden') && coach.getClientRects().length > 0 && getComputedStyle(coach).display !== 'none';
      const t = goalText(zi); const txt = t ? 'Next goal: ' + t : '';
      if (txt !== goalTxt) { goalTxt = txt; goalEl.textContent = txt; goalEl.title = txt; }
      const bossUp = !!bossRect() || (RUSH_ON && rush.on); // a boss fight / the Trial of Six is the goal right now: the line steps aside
      goalEl.classList.toggle('hidden', !txt || coachUp || panelHid || bossUp);
      if (txt && !coachUp && !panelHid && !bossUp) goalPlace();
    }
    // Phone (zone line on the left, under the XP bar): with big text the top row wraps and pushes the XP bar down onto the fixed zone line.
    // Once a second, put the zone line back under the XP bar when they overlap (the CSS position otherwise).
    function zonePlace() {
      try {
        if (zoneEl.style.top) zoneEl.style.top = '';
        const xp = document.getElementById('realm-xp'); if (!xp || !xp.getClientRects().length || !zoneEl.getClientRects().length) return;
        const r = xp.getBoundingClientRect(); const zr = zoneEl.getBoundingClientRect(); const o = ov.getBoundingClientRect();
        if (zr.left > o.left + o.width / 2) return; // the zone sits right (desktop)
        let bottom = -1; // the lowest bar it would cover: the XP bar, and the boss bar while a boss fight runs
        [r, bossRect()].forEach((b) => { if (b && !(zr.right < b.left || zr.left > b.right) && zr.top < b.bottom + 2 && zr.bottom > b.top) bottom = Math.max(bottom, b.bottom); });
        if (bottom >= 0) { zoneEl.style.top = Math.round(bottom - o.top + 4) + 'px'; const z2 = zoneEl.getBoundingClientRect(); const b2 = bossRect(); if (b2 && z2.top < b2.bottom + 2 && z2.bottom > b2.top && !(z2.right < b2.left || z2.left > b2.right)) zoneEl.style.top = Math.round(b2.bottom - o.top + 4) + 'px'; }
      } catch (e) { /* the CSS position stays */ }
    }
    function bossRect() { const e = document.getElementById('realm-boss'); return e && !e.classList.contains('hidden') && e.getClientRects().length ? e.getBoundingClientRect() : null; }
    // Sit just under the XP bar (and under the zone line when that is on the left, as on phones), whatever the text size: once a second, no layout per frame.
    function goalPlace() {
      try {
        const xp = document.getElementById('realm-xp'); const r = xp && xp.getClientRects().length ? xp.getBoundingClientRect() : null; const o = ov.getBoundingClientRect();
        let top = r ? r.bottom : 0; let left = r ? r.left : 10;
        const zr = zoneEl.getClientRects().length ? zoneEl.getBoundingClientRect() : null;
        if (zr && zr.left < o.left + o.width / 2 && zr.bottom > top - 4) { top = Math.max(top, zr.bottom); left = Math.min(left, zr.left); }
        const gw = goalEl.getBoundingClientRect().width || 200;
        ['realm-partner', 'realm-boss'].forEach((id) => { // co-op partner chip / boss bar: never under them
          const e = document.getElementById(id); if (!e || e.classList.contains('hidden') || !e.getClientRects().length) return;
          const b = e.getBoundingClientRect(); if (b.left < left + gw && b.right > left && b.bottom > top && b.top < top + 24) top = Math.max(top, b.bottom);
        });
        let mw = ''; const chip = document.querySelector('.mm-team-hud'); // co-op distance chip beside the minimap: the goal line stops short of it
        if (chip && chip.style.display !== 'none' && chip.getClientRects().length) { const c = chip.getBoundingClientRect(); if (c.top < top + 28 && c.bottom > top && c.left > left) mw = Math.max(80, Math.floor(c.left - left - 6)) + 'px'; }
        if (goalEl.style.maxWidth !== mw) goalEl.style.maxWidth = mw;
        const t = Math.round(top - o.top + 4) + 'px'; const l = Math.round(Math.max(0, left - o.left)) + 'px';
        if (goalEl.style.top !== t) goalEl.style.top = t; if (goalEl.style.left !== l) goalEl.style.left = l;
      } catch (e) { /* the CSS position stays */ }
    }
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
    // G-18 (b04-11): M toggles the big map in the overworld too (the dungeon already had it); never while typing or in the Nexus
    window.addEventListener('keydown', (event) => {
      if ((event.key !== 'm' && event.key !== 'M') || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      const t = event.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ''))) return;
      if (typeof nxOpen !== 'undefined' && nxOpen) return;
      toggleMinimap();
    });
    const zName = zoneEl.querySelector('.rw-zname'); // cyc10-ui: two spans (name + " · danger word"), so the 195 px strip can show the name alone with
    // an ellipsis; zName.textContent stays "Shore · Safe-ish" for hudText() and every older check
    const zNm = document.createElement('span'); zNm.className = 'rw-zn'; const zDw = document.createElement('span'); zDw.className = 'rw-zd'; zName.append(zNm, zDw);
    const zArrow = zoneEl.querySelector('.rw-arrow'); const zCoords = zoneEl.querySelector('.rw-coords');
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
      if (n > 0) { save.discovered = FOG.encode(fogBits); miniKey = ''; writeSave(save); if (exploreLive) exploreCells += n; }
      return n;
    }
    // FT2 exploration trickle: a map cell revealed for the first time on this island (fog bits are saved in `discovered`, so a cell never pays twice) is
    // worth ~0.5% of the current level's XP bar, paid as one "+N xp" at most every EXPLORE_EVERY s, so a long walk to the next zone still moves the bar.
    // Cells revealed around the arrival point at the start of a visit pay nothing. ?explorexp=0 turns it off (and fog off has no cells to pay).
    const EXPLORE_ON = fogOn && !/[?&]explorexp=0(&|$)/.test(qs0); const EXPLORE_EVERY = 6; const EXPLORE_PCT = 0.005;
    let exploreLive = false; let exploreCells = 0; let exploreT = 0; let exploreXp = 0;
    function exploreTick(dt) {
      if ((exploreT -= dt) > 0 || !exploreCells) return;
      exploreT = EXPLORE_EVERY; const n = exploreCells; exploreCells = 0;
      if (!EXPLORE_ON || arena.state !== 'play' || typeof arena._gainXp !== 'function' || typeof rmXpNeeded !== 'function') return;
      const xp = Math.max(1, Math.round(n * EXPLORE_PCT * rmXpNeeded(arena.save.level || 1)));
      exploreXp += xp; arena._gainXp(xp);
    }
    // R4 D1 quiet-stretch pity (first-ten world-shore-f: a 62 s stretch with no reward on some days): when nothing has paid (no xp, no kill,
    // no shards, no item) for QUIET_AFTER s and no enemy is alive within QUIET_R, the nearest cleared group in range respawns now instead of
    // waiting out its zone timer (Shore 60 s), and the nearest live enemy is provoked and comes over; again every QUIET_AGAIN s while it stays quiet. ?quietpity=0 turns it off.
    const QUIET_ON = !/[?&]quietpity=0(&|$)/.test(qs0); const QUIET_AFTER = 15; const QUIET_AGAIN = 6; const QUIET_R = 14 * TILE;
    let qS0 = -1, qS1 = -1, qS2 = -1, qS3 = -1, qS4 = -1, qS5 = -1; let quietT = 0; let quietNudges = 0;
    function quietTick(dt) {
      if (!QUIET_ON || !zones || arena.state !== 'play' || typeof zones.hurry !== 'function') return;
      if (arena.resting) { quietT = 0; return; } // ID-51: never pull enemies onto a resting (idle) hero; the count starts again on the next input
      // cycle 3 (L hot path): the six numbers are compared as numbers (a 'level|xp|kills|shards|items|uid' string was built every frame)
      const sv = arena.save || {}; const s0 = sv.level | 0, s1 = sv.xp | 0, s2 = kills, s3 = sv.shards | 0, s4 = sv.items ? sv.items.length : 0, s5 = sv.nextUid | 0;
      if (s0 !== qS0 || s1 !== qS1 || s2 !== qS2 || s3 !== qS3 || s4 !== qS4 || s5 !== qS5) { qS0 = s0; qS1 = s1; qS2 = s2; qS3 = s3; qS4 = s4; qS5 = s5; quietT = 0; return; }
      if ((quietT += dt) < QUIET_AFTER) return;
      quietT = QUIET_AFTER - QUIET_AGAIN; // still quiet: nudge again every QUIET_AGAIN s until something pays
      const p = arena.player; let near = false;
      live.forEach((e) => { if (!near && e.active && Math.hypot(e.x - p.x, e.y - p.y) < QUIET_R) near = true; });
      if (near) return;
      if (zones.hurry(p.x, p.y) >= 0) quietNudges++; // a cleared group in range respawns now
      // and the nearest live enemy (the live groups may stand out of reach, e.g. across water) is provoked and comes to the hero
      let best = null, bd = Infinity;
      live.forEach((e) => { if (!e.active) return; const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; best = e; } });
      if (best) { best.provT = Math.max(best.provT || 0, 12); quietNudges++; }
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
      const key = (tx >> 1) + ',' + (ty >> 1) + ',' + bossesKey() + ',' + evMiniKey + ',' + siteMiniKey() + ',' + lairMiniKey();
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
      const lq = KEYS_ON && save.bossPortal ? save.bossPortal.boss : null; // BK2: an open boss portal is pinged (always shown, fog or not)
      if (lq) { const lx = lq.x / TILE * sx; const ly = lq.y / TILE * sy; g.strokeStyle = '#000'; g.lineWidth = 3; g.beginPath(); g.arc(lx, ly, 5, 0, Math.PI * 2); g.stroke(); g.strokeStyle = '#ff5fa2'; g.lineWidth = 2; g.beginPath(); g.arc(lx, ly, 5, 0, Math.PI * 2); g.stroke(); g.fillStyle = '#ffd45a'; g.fillRect(lx - 1.5, ly - 1.5, 3, 3); }
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
      const cap = ebCapFor(zi.zone) + rushCapExtraNow(); // ID-36: a Trial fight 4-6 raises the cap by its layers' own bolts (0 otherwise)
      if (!arena.fireBudget || arena.fireBudget.cap !== cap) arena.fireBudget = { cap, travel: Z.TABLES.EB_TRAVEL || 0.6, zone: zi.zone };
    }
    function syncHud(force) {
      const p = arena.player; const tx = Math.floor(p.x / TILE); const ty = Math.floor(p.y / TILE);
      const zi = Z.zoneInfoAt(world, tx, ty); lastZone = zi; zoneCross(zi, tx, ty); fireBudgetFor(zi); if (gearHintSt.checked) gearHintNote();
      const txt = `${zi.name} · ${zi.danger}`;
      if (txt !== zoneTxt || force) { zoneTxt = txt; zNm.textContent = zi.name; zDw.textContent = ` · ${zi.danger}`; zName.style.color = zi.color; zoneEl.dataset.zone = String(zi.zone); }
      goalTick(zi, force);
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
      // cyc2 U-10: on a phone (<= 560 px, the one-line zone HUD) the zone line below already names the zone; the info line drops it
      const wn = window.innerWidth <= 560 ? '' : zi.name;
      const w = document.getElementById('realm-wave'); if (w && w.textContent !== wn) w.textContent = wn;
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
    // ---------- tiered gear drops (G9): MMGearDrops.rollGear per bag item, per-player seeded; on by default (GEAR_DEFAULT_ON), ?gear=0 turns it off ----------
    const GM = window.MMGear; const GD = window.MMGearDrops;
    const gearQs = /[?&]gear=(\d)(&|$)/.exec(qs0); const gearQ = typeof rmFlag === 'function' ? rmFlag('gear') : gearQs ? gearQs[1] : null; // rmFlag: the one ?gear= parser (realm.js, review F15)
    const GEAR_ON = !!(GM && GD) && gearQ !== '0' && (gearQ === '1' || save.gearOn === true || GEAR_DEFAULT_ON);
    const SIG_ON = typeof RM_FORGE_ON !== 'undefined' && RM_FORGE_ON === true; // T12 boss signatures (`sig`) on new drops only with the GW gate open (realm.js RM_FORGE_ON: default on since P2, ?forge=0 off)
    // Per-player seed id: each co-op seat rolls its own drops locally, nothing is shared. Seat N of a world team (MMWorldTeam: opts.team, arena.worldTeam
    // or setTeam) rolls as 'p' + N, so two seats on the same seed and kill get different streams; solo (no seat yet) stays 'p0' = today's seat-0 stream.
    // setGearPlayer (test hook) overrides it.
    let gearPlayerSet = null; let gearTeam = opts.team || null;
    saveSeat = () => { // beta S-04: same seat rule as gearPlayerId, but solo (no team) is -1 so solo saves never get seatPos
      const tm = gearTeam || arena.worldTeam || null; let st = -1; try { st = tm && tm.ok !== false ? Number(tm.seat) : -1; } catch (e) { st = -1; }
      return Number.isInteger(st) && st >= 0 && st < 4 ? st : -1;
    };
    function gearPlayerId() {
      if (gearPlayerSet !== null) return gearPlayerSet;
      const tm = gearTeam || arena.worldTeam || null; let st = -1; try { st = tm && tm.ok !== false ? Number(tm.seat) : -1; } catch (e) { st = -1; }
      return Number.isInteger(st) && st >= 0 && st < 16 ? 'p' + st : 'p0';
    }
    function gearCtx(info, k, it, bag) {
      const cls = arena.heroClass ? arena.heroClass() : null;
      return { src: info.src || (info.boss ? 'boss' : 'mob'), boss: info.bossId || '', zone: info.zone | 0, eventTier: info.eventTier | 0, cls: cls || '', level: arena.heroLevel ? arena.heroLevel() : 1,
        gp: save.gp || { b: 0, d: 0 }, k: k, r: it.r | 0, bagTier: bag.tierIndex | 0, always: dropAll };
    }
    function gearRollItem(info, k, it, bag) {
      if (!GEAR_ON || info.quest || !info.tag) return null;
      let g = null;
      try { g = GD.rollGear(gearCtx(info, k, it, bag), GD.seedFor(seed, info.tag, kills, gearPlayerId())); } catch (e) { g = null; }
      return g;
    }
    function gearPity() {
      const gp = GD ? GD.cleanGp(save.gp) : { b: 0, d: 0 }; const v = GD ? GD.pityView(gp) : null;
      return { on: GEAR_ON, b: gp.b, d: gp.d, text: v ? v.text : '', cryptText: v ? v.cryptText : '', bonusPct: v ? v.bonusPct : 0, bossKillsLeft: v ? v.bossKillsLeft : 60 };
    }
    function giveBag(x, y, bag, info) {
      const got = { zone: info.zone, boss: !!info.boss, src: info.src || (info.boss ? 'boss' : 'mob'), tier: bag.tier, tierIndex: bag.tierIndex, firstKill: info.firstKill === true, items: [], shards: bag.shards, potions: bag.potions };
      const rolls = []; let toasted = false;
      // review F12: the pity counter lives in storage and another world tab may have spent (or raised) it since this page loaded: re-read it right
      // before a boss roll / pityStep, so two tabs at b = 60 give ONE forced T12, not two. Unreadable storage keeps the in-memory value.
      if (GEAR_ON && info.tag && info.boss) {
        let raw = null; try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { raw = null; }
        if (raw) { const st = cleanSave(raw); if (st.gp) save.gp = { b: st.gp.b, d: st.gp.d }; else delete save.gp; }
      }
      bag.items.forEach((it, k) => {
        let g = gearRollItem(info, k, it, bag); rolls.push(g);
        let id = it.id; let gear = null;
        if (g) {
          id = g.id;
          const usable = (x) => typeof RM_ITEM_BY_ID === 'undefined' || !!(RM_ITEM_BY_ID[x] && !RM_ITEM_BY_ID[x].inert); // an inert def is a saved id this build cannot use
          if (!usable(id) && GM.isSig && GM.isSig(id)) id = GM.armorId(GM.sigInfo(id).family, 12); // a boss relic on an arena that does not register relics yet: its family's T12 piece
          if (!usable(id)) id = 'sparkwand'; // an arena without the armor slot yet: the tier stays, as a wand
          gear = { t: g.t }; if (g.a) gear.a = g.a; if (g.sig && id === g.id && SIG_ON) gear.sig = g.sig; // GW: the T12 boss signature rides on the bag (MMGear.clean drops it where it does not fit); SIG_ON: the GW gate (review F3)
        }
        const b = arena.dropBag(x + (k - (bag.items.length - 1) / 2) * 18, y + 10, it.r, id, bag, gear);
        if (!b) return;
        if (rushCollect) rushCollect.push(b); // RE2: a Trial of Six bag goes straight into the pack (safe return: nothing is left on the floor)
        b.fb = fbFresh() && !info.quest; if (b.fb) { fbDropped = true; b.lifetime = Infinity; } // FT2: a fresh profile's first bag(s) come to the hero (fbTick)
        b.gear = gear || null; // pooled bags are reused: never leave an earlier drop's tier on a classic bag
        const dd = typeof RM_ITEM_BY_ID !== 'undefined' ? RM_ITEM_BY_ID[b.id] : null;
        const ent = { id: b.id, r: it.r, name: dd ? dd.name : b.id, rolled: it.id };
        if (gear) {
          const d = GM.describe({ id: b.id, r: it.r, t: gear.t, a: gear.a });
          ent.t = gear.t; if (gear.a) ent.a = gear.a; ent.name = d ? d.name : ent.name; ent.tierLabel = d ? d.tierLabel : 'T' + gear.t; ent.tierColor = d ? d.tierColor : '#fff';
          ent.soulbound = !!(d && d.soulbound); ent.gate = d ? d.gate : 0; ent.locked = (arena.heroLevel ? arena.heroLevel() : 1) < ent.gate; if (gear.sig) ent.sig = gear.sig; if (GM.isSig && GM.isSig(b.id)) ent.relic = true;
          if (!toasted) { toasted = true; arena._floatText(x, y - 48, ent.name + (ent.soulbound ? ' (soulbound)' : ''), ent.tierColor); }
        }
        got.items.push(ent);
      }); // the recap lists what actually dropped (a styled wpn_ weapon replaces the rolled wand; tiered gear shows 'T7 Name')
      if (GEAR_ON && info.tag) { const ng = GD.pityStep(save.gp, gearCtx(info, 0, { r: 0 }, bag), rolls); if (ng.b !== (save.gp ? save.gp.b : 0) || ng.d !== (save.gp ? save.gp.d : 0)) { save.gp = { b: ng.b, d: ng.d }; writeSave(save); } }
      if (bag.shards > 0) { arena.save.shards += bag.shards; arena.run.shards += bag.shards; arena._floatText(x, y - 34, `+${bag.shards} 💎`, '#8fe9ff'); }
      if (bag.potions > 0) arena._sigHeal(12 * bag.potions);
      lastDrops.push(got); if (lastDrops.length > 12) lastDrops.shift();
      arena.onSave(arena.save); arena._syncHud();
      return got;
    }
    function rollFor(info, x, y, tag) {
      const rs = seed + ':' + tag + ':' + kills;
      const force = fbForce(info);
      if (!dropAll && !force && MMRng.create('dropchance:' + rs).next() >= Z.dropChance(info)) return null;
      let bag = Z.rollDrop(info, rs).bag;
      for (let k = 0; force && !bag.items.length && k < 16; k++) bag = Z.rollDrop(info, rs + ':fb' + k).bag; // the guaranteed first bag holds an item (still seeded)
      return giveBag(x, y, bag, Object.assign({ tag: tag }, info));
    }
    // ---------- FT2 first-bag guarantee ----------
    // A fresh profile (this realm save never picked a world bag up, and the backpack is empty) gets its first bag by its FIRSTBAG_KILL-th shore kill at
    // the latest: the normal seeded roll still comes first, and the guaranteed one reuses the same seeded roll (forced past the drop chance). Until it is
    // picked up, that first bag never despawns and drifts to the hero (a new player sees loot land in the backpack in the first minute even while kiting).
    // Saved as `fb: 1` once the backpack has an item; ?firstbag=0 turns it all off (pure rolls, today's lifetime).
    const FIRSTBAG_ON = !/[?&]firstbag=0(&|$)/.test(qs0); const FIRSTBAG_KILL = 4; const FIRSTBAG_SPEED = 260;
    let fbKills = 0; let fbDropped = false; let fbForced = 0;
    const fbFresh = () => FIRSTBAG_ON && save.fb !== 1 && !!arena.save && Array.isArray(arena.save.items) && arena.save.items.length === 0;
    function fbForce(info) {
      if (!fbFresh() || fbDropped || !info || info.boss || info.quest || (info.zone | 0) !== 0) return false;
      fbKills++;
      if (fbKills < FIRSTBAG_KILL) return false;
      fbForced++; return true;
    }
    function fbTick(dt) {
      if (!FIRSTBAG_ON || save.fb === 1) return;
      if (arena.save && Array.isArray(arena.save.items) && arena.save.items.length > 0) { save.fb = 1; writeSave(save); return; } // spent: the first item is in
      const p = arena.player;
      for (let i = 0; i < arena.bags.length; i++) {
        const b = arena.bags[i]; if (!b.active || !b.fb) continue;
        b.lifetime = Infinity; if (b.t < 0.6) continue;
        const dx = p.x - b.x; const dy = p.y - b.y; const d = Math.hypot(dx, dy) || 1; if (d > 900 || d < 16) continue;
        const k = Math.min(d - 12, FIRSTBAG_SPEED * dt) / d; b.x += dx * k; b.y += dy * k;
      }
    }
    // ---- ID-04 Hero notebook (MMNotebook, own key pixeltown-notebook-v1): a page on the FIRST meet only. The in-memory copy answers
    // "seen already?" per kill (no storage read); a new page re-reads, merges and writes once. Knowledge only: no stat, drop or price changes.
    const NB = window.MMNotebook && !/[?&]notebook=0(&|$)/.test(qs0) ? window.MMNotebook : null;
    let nbSave = null; let nbNew = 0;
    // cycle 3 (L): the disk copy is MERGED into what this page already knows, never put in its place. With storage that refuses the write
    // (quota, private window) the disk never holds this visit's pages, so replacing wiped them on every new page: A, B, A announced A twice.
    function nbLoad() { if (NB) { let disk = null; try { disk = NB.load(localStorage); } catch (e) { disk = null; } nbSave = nbSave && disk ? NB.merge(nbSave, disk) : (nbSave || disk || NB.defaults()); } return nbSave; }
    function nbMeet(id, name) {
      if (!NB || !id) return false;
      if (!nbSave) nbLoad();
      if (NB.has(nbSave, id)) return false;
      try { NB.record(localStorage, id); } catch (e) { /* storage blocked */ }
      nbLoad(); // what is on disk now: this page plus any other tab's pages
      if (!NB.has(nbSave, id) && !NB.add(nbSave, id, Date.now())) return false; // blocked storage keeps the page for this visit; a full notebook takes nothing
      nbNew++; nbSyncBtn();
      try { arena._notice('New notebook page: ' + name, '#ffe27a'); } catch (e) { /* no float text */ }
      return true;
    }
    // ---- ID-12 Town-to-Realm errand (MMErrands): this page writes ONLY the Realm save's `errand`; the Town save is read, never written ----
    const ER = window.MMErrands && !/[?&]errands=0(&|$)/.test(qs0) ? window.MMErrands : null;
    function erTown() { try { const o = JSON.parse(localStorage.getItem('pixeltown-save-v1') || 'null'); return o && typeof o === 'object' ? o.errand : null; } catch (e) { return null; } }
    function erKill(zone) {
      if (!ER || !save.errand) return false; // nothing delivered yet: no work per kill
      const r = ER.trophy(save.errand, zone); if (!r.ok) return false;
      save.errand = r.realm; writeSave(save);
      try { arena._notice('Trophy for Mocha! Take it back to town.', '#ffe27a'); } catch (e) { /* no float text */ }
      return true;
    }
    // the Vendor's errand line (and the delivery itself), or null when the Town has no errand running
    function erVendor() {
      if (!ER) return null;
      const town = erTown(); const st = ER.stage(town, save.errand);
      if (st === 'carry') { const r = ER.deliver(save.errand, town); if (r.ok) { save.errand = r.realm; writeSave(save); return 'A parcel from Mocha? Thank you! ' + ER.LINES.hunt; } }
      if (st === 'hunt' || st === 'return') return ER.LINES[st];
      return null;
    }
    function onEnemyHit(e, dmg) { if (evOnHit(e, dmg)) return; if (zones && e.zid >= 0) zones.markCombat(e.zid); }
    function onEnemyKilled(e) {
      if (e.rushStep) { rushKilled(e); return; }
      if (e.campId) { e.campId = null; kills++; save.stats.kills++; return; }
      if (e.evid) { evOnKilled(e); return; }
      if (!zones) return;
      if (e.zid >= 0) {
        const info = zones.markDead(e.zid, arena.clock); live.delete(e.zid); e.zid = -1;
        if (!info) return;
        kills++; save.stats.kills++; nxQuestEvent({ type: 'kill', zone: info.zone, n: 1 });
        nbMeet(NB ? NB.ids.kill(info.type, info.creature, info.zone) : null, info.creature); // ID-04: first kill of this creature in this zone
        erKill(info.zone); // ID-12: a Midlands-or-deeper kill after the parcel delivery gives the Vendor's trophy (once)
        // cyc2-S bug fix: the elite test read e.type, which is the bolt pattern ('aimed'), never 'giant_spider_queen', so the elite never rolled
        // its own gear row (MMGearDrops ELITE). The creature id lives on the zone group (info.creature).
        const elite = info.creature === 'giant_spider_queen';
        rollFor({ zone: info.zone, tier: info.tier, src: elite ? 'elite' : 'mob', bossId: elite ? info.creature : '' }, e.x, e.y, 'g' + info.group);
        spawnPickups(e.x, e.y, 'g' + info.group, kills, info.tier);
        return;
      }
      for (let i = 0; i < bossLive.length; i++) {
        if (bossLive[i] !== e) continue;
        const site = world.bossSites[i]; bossLive[i] = null; bossReadyNow[i] = 0; miniKey = '';
        zones.bossDefeated(site, arena.clock); kills++; save.stats.bossKills++; nxQuestEvent({ type: 'kill', zone: site.zone, boss: true, n: 1 });
        nbMeet(NB ? NB.ids.boss(site.boss, site.zone) : null, BOSS_NAME[i]); // ID-04
        // ID-13: the FIRST world boss of a zone rolls with the bag floor (MMZones FIRST_KILL_BAG_FLOOR); the bit is set and saved once (writeSave below).
        // Trial of Six kills (rushKilled) never come here, so they neither read nor set zk.
        // cycle 4 (L): the bit is read from storage too. A second tab opened before the first kill kept zk = 0 in memory, so the same hero
        // got the first-kill floor once per open tab (the write below only merged the bit afterwards). One read per boss kill.
        const zdisk = readSave().zk | 0; if (zdisk & ~(save.zk | 0)) save.zk = ((save.zk | 0) | zdisk) & 15;
        const zbit = 1 << Math.max(0, Math.min(3, site.zone | 0)); const fk = !((save.zk | 0) & zbit);
        rollFor({ zone: site.zone, tier: site.zone, boss: true, src: 'boss', bossId: site.boss, firstKill: fk }, e.x, e.y + 30, 'boss' + i);
        if (fk) save.zk = ((save.zk | 0) | zbit) & 15;
        spawnPickups(e.x, e.y + 20, 'boss' + i, kills, 5);
        dropKey(e.x + 24, e.y + 26, 'boss' + i); // BK2: every world boss drops a boss key
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
    const bossWarned = new Set(); // G-07: "above your level" said once per altar per visit
    function rushOnNow() { try { return RUSH_ON && rush.on; } catch (e) { return false; } } // G-27 (TDZ-safe: the Trial block sits later in this file)
    let bossGateWarn = 0; // b04-13 soft gate warnings shown (test hook)
    function bossTick() {
      if (rush.on) return; // RE2: no altar boss wakes during the Trial of Six
      const p = arena.player; const alive = bossAlive();
      const pz0 = Z.zoneInfoAt(world, p.x / TILE, p.y / TILE).zone; const pzone = pz0 >= 0 && pz0 <= 3 ? pz0 : -1; // G-07: the void (255) wakes nothing
      for (let i = 0; i < bossLive.length; i++) {
        const b = world.bossSites[i]; const bx = (b.x + 0.5) * TILE; const by = (b.y + 0.5) * TILE; const d = Math.hypot(p.x - bx, p.y - by);
        const e = bossLive[i];
        bossReadyNow[i] = !e && zones.bossReady(b, arena.clock) ? 1 : 0;
        if (e && !e.active) { bossLive[i] = null; miniKey = ''; continue; }
        if (e) { if (d > 40 * TILE) { e.active = false; bossLive[i] = null; arena._syncBoss(); miniKey = ''; } continue; } // walked away: it rests (no cooldown)
        // G-07 (b01-02, b04-13): an altar wakes only for a hero standing in its zone or deeper (or right on the altar, 3 tiles): a Midlands
        // boss never wakes for a hero still on a Shore tile beside the border. A hero below its recommended level gets a one-time note.
        // b04-13 soft gate (Godlands altars): a hero below the zone's recommended level gets a clear warning at the wake radius and the boss waits; stepping onto
        // the altar (3 tiles) still wakes it on purpose (not a hard block).
        const rl = (((Z.TABLES && Z.TABLES.ZONES) || [])[b.zone] || {}).recLv | 0; const lv = (arena.save && arena.save.level) | 0; const under = rl > lv; const gate = under && b.zone >= 3; // the gate: Godlands (Lethal) only
        if (alive < 0 && !arena._boss() && d < 9 * TILE && zones.bossReady(b, arena.clock) && (pzone >= b.zone || d < 3 * TILE)) {
          if (gate && d >= 3 * TILE) { if (!bossWarned.has(i)) { bossWarned.add(i); bossGateWarn++; say(BOSS_NAME[i] + ' is far above your level (rec. Lv ' + rl + '). It sleeps for now: step onto its altar to wake it anyway.'); } continue; }
          spawnBoss(i); // never next to a raid boss
          if (bossLive[i] && under && !bossWarned.has(i)) { bossWarned.add(i); say(BOSS_NAME[i] + ' is above your level (rec. Lv ' + rl + ')'); }
        }
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
        res.bag = giveBag(p.x, p.y - 26, rew.bag, { zone: st.plan.region, boss: true, event: true, src: 'event', eventTier: Math.max(0, tier - 1), tag: 'ev:' + st.id });
        arena.save.shards += rew.shards; arena.run.shards += rew.shards; res.shards = rew.shards; res.fame = rew.fame;
        save.stats.eventWins++;
        dropKey(p.x + 24, p.y - 30, st.id); // BK2: a won world event drops a boss key
        if (api.onEventFame) api.onEventFame(rew.fame, res);
        arena.onSave(arena.save); arena._syncHud();
        arena._showBanner(`🏆 ${evTitle(st)} won! ${ZT.EVENT_TIERS[tier]} · +${rew.shards} 💎 · +${rew.fame} fame`, 2.6);
      } else arena._showBanner(`${evTitle(st)} is over. Deal damage to earn a share of the reward.`, 2.2);
      st.reward = res; lastEvReward = res;
      evFinish(st, 'won');
      return res;
    }
    function evTick() {
      // G-15 (b08-04): no Raid / Swarm countdown while the first-run coach is still teaching (it starts once the coach is done or skipped)
      try { const tu = window.__mmTutorial; if (tu && typeof tu.current === 'function' && tu.current() !== 'done') { evList = []; evFocus = null; syncEventHud(); return; } } catch (e) { /* no coach: events as usual */ }
      try { if (RUSH_ON && rush.on) { evList = []; evFocus = null; syncEventHud(); return; } } catch (e) { /* the Trial is set up later in this file */ } // G-27 (b03-09): no Raid / Swarm timer over a Trial fight
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
    // DV1: a z2+ portal names its dungeon's seeded mutator on a small label above the prompt (MMEndgame.mutatorsFor on the portal's own seed; ?mut=0 none)
    const portalMut = document.createElement('div'); portalMut.id = 'rw-portal-mut'; portalMut.className = 'hidden'; portalMut.setAttribute('role', 'note'); ov.appendChild(portalMut);
    const MUT_OFF = /[?&]mut=0(&|$)/.test(qs0);
    function portalMutOf(i) {
      const q = portals[i]; if (!q || MUT_OFF || !window.MMEndgame) return null;
      let m = null; try { m = MMEndgame.mutatorsFor(BIOME_NAME[q.biome] ? q.biome : 'warren', undefined, portalSeed(i), {}); } catch (e) { m = null; }
      return m && m.list.length ? m : null;
    }
    let promptFor = -1; let leaving = false;
    // PLAYTEST-REVIEW-2 #14: no keyboard hints ("(Enter)", "(E)") on a coarse pointer / touch device
    const isCoarse = () => (typeof document !== 'undefined' && document.body.classList.contains('touch-device')) || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
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
        if (near >= 0) { const bn = BIOME_NAME[portals[near].biome] || 'Warren'; portalBtn.textContent = `Enter ${bn} dungeon`; portalBtn.setAttribute('aria-label', `Enter ${bn} dungeon (${portals[near].label}${isCoarse() ? '' : ', Enter'})`); }
        const pm = near >= 0 ? portalMutOf(near) : null; portalMut.classList.toggle('hidden', !pm); portalMut.textContent = pm ? '✦ Mutator: ' + pm.label : ''; portalMut.title = pm ? pm.text : '';
        if (pm) portalBtn.setAttribute('aria-label', portalBtn.getAttribute('aria-label') + ', mutator ' + pm.label);
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
    // Tiered gear rides on the world bag (b.gear = { t, a? }); the arena's pickup pushes a plain { n, id, r }, so the tier and affix seed are put on the
    // new backpack entry here, BEFORE the stash record and the save write that follow onItem. Only the bag just picked up (inactive, under the hero) matches.
    if (GEAR_ON) {
      const prevOnItem = arena.onItem;
      arena.onItem = (it) => {
        try {
          let best = null, bd = 30;
          arena.bags.forEach((b) => { if (b.active || !b.gear || b.id !== it.id || b.r !== it.r) return; const d = Math.hypot(b.x - arena.player.x, b.y - arena.player.y); if (d < bd) { bd = d; best = b; } });
          if (it.t && !arena.save.gv && window.MMBackup && MMBackup.snapshotPregear) MMBackup.snapshotPregear(localStorage); // the pickup already carried the bag's tier (realm.js passes b.gear, review F11): same once-only snapshot
          if (best && !it.t) {
            const c = GM.clean({ n: it.n, id: it.id, r: it.r, t: best.gear.t, a: best.gear.a, sig: best.gear.sig });
            if (c && c.t) {
              if (!arena.save.gv && window.MMBackup && MMBackup.snapshotPregear) MMBackup.snapshotPregear(localStorage); // GH: once, before the first tiered item is written to a gear-less save
              it.t = c.t; if (c.a) it.a = c.a; if (c.sig) it.sig = c.sig;
            }
            best.gear = null;
          }
        } catch (e) { /* the item stays classic */ }
        if (prevOnItem) prevOnItem(it);
      };
    }

    // ---------- downgrade hint (GH): an old tab (pre-G7 cleaner) can strip every `t` from the town save. Remember the backpack size while the save holds
    // tiered gear (own key, per device, never in a backup); a later visit whose save says gv:1 but has no tiered item and fewer items gets ONE calm note.
    // Nothing is restored automatically: the player decides (Lantern backup).
    const GEAR_HINT_KEY = 'pixeltown-gearhint-v1';
    const GEAR_HINT_TEXT = 'Your gear may have been reset by an old tab: restore from Lantern backup';
    // Review F3: it also remembers whether the save holds the GW `dust` key (d) and how many items carry a forged `f` (f); a pre-GW tab strips both.
    // A salvage / sell / combine in a realm.js tab lowers the remembered counts itself (rmGearHintOwn, review F10), so those never trigger the note.
    const gearHintSt = { n: 0, shown: false, checked: false, now: false, d: 0, f: 0 };
    const gearHintOf = (sv) => (typeof rmGearHintOf === 'function' ? rmGearHintOf(sv) : { n: sv.items.length, d: sv.dust !== undefined ? 1 : 0, f: sv.items.filter((x) => x && x.f).length });
    function gearHintRead() {
      let o = null; try { o = JSON.parse(localStorage.getItem(GEAR_HINT_KEY)); } catch (e) { o = null; }
      const cnt = (v) => (Number.isInteger(v) && v >= 0 && v <= 999 ? v : 0);
      return { n: cnt(o && o.n), shown: !!(o && o.shown === 1), d: o && o.d === 1 ? 1 : 0, f: cnt(o && o.f) };
    }
    function gearHintWrite(n, shown, d, f) {
      d = d ? 1 : 0; f = f | 0;
      try { localStorage.setItem(GEAR_HINT_KEY, JSON.stringify({ n, shown: shown ? 1 : 0, d, f })); } catch (e) { /* storage full or blocked */ }
      gearHintSt.n = n; gearHintSt.shown = shown; gearHintSt.d = d; gearHintSt.f = f;
    }
    function gearHintNote() { // called from the HUD sync: cheap in-memory test, a write only when a remembered value changes
      const sv = arena.save; if (!sv || !Array.isArray(sv.items)) return;
      const h = gearHintOf(sv);
      if ((sv.items.some((x) => x && x.t) || h.d || h.f) && (h.n !== gearHintSt.n || h.d !== gearHintSt.d || h.f !== gearHintSt.f || gearHintSt.shown)) gearHintWrite(h.n, false, h.d, h.f);
    }
    function gearHintCheck() {
      if (gearHintSt.checked) return; gearHintSt.checked = true;
      const st = gearHintRead(); gearHintSt.n = st.n; gearHintSt.shown = st.shown; gearHintSt.d = st.d; gearHintSt.f = st.f;
      const sv = arena.save; const items = sv && Array.isArray(sv.items) ? sv.items : [];
      const h = sv ? gearHintOf(sv) : { n: 0, d: 0, f: 0 };
      const tGone = sv && sv.gv === 1 && !items.some((x) => x && x.t) && items.length < st.n;
      const fGone = (st.d === 1 && !h.d) || (st.f > 0 && h.f < st.f); // dust key or forged affixes gone (review F3)
      if (sv && (tGone || fGone) && !st.shown) {
        gearHintWrite(st.n, true, st.d, st.f); gearHintSt.now = true;
        say(GEAR_HINT_TEXT); noteT = 9;
      } else gearHintNote();
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
      lastReturn = { from, to: { x: to.x, y: to.y }, moved: to.x !== from.x || to.y !== from.y, events: sites.map((q) => q.id), shield: SAFE_SHIELD, iframes: p.iframes };
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
    // cycle 3 (L hot path): plain loops and plain numbers. Each frame this built 3 closures, one {x, y} object per shrine and per NPC (sPx)
    // and two key strings per shrine, for sites that are almost always off screen. Same draws in the same order.
    const SHRINE_GK = {}; const SHRINE_AK = {};
    function drawSites(g, vx0, vy0, vx1, vy1, tt, reduced) {
      const sh = SITES.shrines, cps = SITES.camps, nps = SITES.npcs;
      for (let i = 0; i < sh.length; i++) {
        const q = sh[i]; const cx = (q.x + 0.5) * TILE, cy = (q.y + 0.5) * TILE; if (cx < vx0 || cx > vx1 || cy < vy0 - 60 || cy > vy1 + 60) continue;
        const lit = shrineReady(q);
        const gk = SHRINE_GK[q.kind] || (SHRINE_GK[q.kind] = 'g' + q.kind);
        if (lit) { if (!sc[gk]) sc[gk] = glowSprite(SHRINE_COL[q.kind]); g.globalAlpha = reduced ? 0.45 : 0.35 + 0.2 * Math.sin(tt * 2.4 + q.x); g.drawImage(sc[gk], cx - 64, cy - 80); g.globalAlpha = 1; }
        const sa = wArt[SHRINE_AK[q.kind] || (SHRINE_AK[q.kind] = 'shrine_' + q.kind)];
        if (sa) { if (!lit) g.globalAlpha = 0.6; drawArt(g, sa, lit ? frameOf(sa, tt, reduced) : 0, cx, cy + 18); g.globalAlpha = 1; artDraws.shrine++; }
        else g.drawImage(shrineSprite(q.kind, lit), cx - 24, cy - 70);
      }
      for (let i = 0; i < cps.length; i++) {
        const q = cps[i]; const cx = (q.chest.x + 0.5) * TILE; const cy = (q.chest.y + 0.5) * TILE; if (cx < vx0 || cx > vx1 || cy < vy0 || cy > vy1) continue;
        const ca = wArt.loot_chest_gold;
        if (ca) {
          const t0c = chestAnimT.get(q.id); let f = chestOpen.has(q.id) ? ca.frames - 1 : 0;
          if (t0c !== undefined && !reduced) f = Math.max(0, Math.min(ca.frames - 1, Math.floor((tt - t0c) / 0.12)));
          drawArt(g, ca, f, cx, cy + 18); artDraws.chest++;
        } else g.drawImage(chestSprite(chestOpen.has(q.id)), cx - 22, cy - 22);
      }
      for (let i = 0; i < nps.length; i++) {
        const q = nps[i]; const cx = (q.x + 0.5) * TILE, cy = (q.y + 0.5) * TILE; if (cx < vx0 || cx > vx1 || cy < vy0 - 50 || cy > vy1 + 50) continue;
        const s = npcSprite(q.npc); g.drawImage(s, cx - s.width / 2, cy + 14 - s.height);
      }
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
        arena.buffDmg = on ? (b.value / 1.25 > 1 ? b.value / 1.25 : 1) : b.value; if (arena.markStatsDirty) arena.markStatsDirty(); arena._calcStats(); arena._floatText(p.x, p.y - 30, 'Fury!', '#ff6a4a');
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
      const info = { zone: q.zone, tier: q.zone, src: 'chest', tag: 'chest:' + q.id };
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
      if (rageEnd && now >= rageEnd) { rageEnd = 0; arena.buffDmg = 1; if (arena.markStatsDirty) arena.markStatsDirty(); arena._calcStats(); }
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
        if (best.kind === 'shrine') { const l = shrineLeft(best.q); const ek = isCoarse() ? '' : ' (E)'; txt = l ? `${SHRINE_TXT[best.q.kind]} (${fmtT(l / 1000)})` : `Pray at ${SHRINE_TXT[best.q.kind]}${ek}`; }
        else if (best.kind === 'chest') txt = 'Open chest' + (isCoarse() ? '' : ' (E)'); else txt = `Talk to ${NPC_NAME[best.q.npc] || 'traveller'}` + (isCoarse() ? '' : ' (E)');
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
      const pv = !portalBtn.classList.contains('hidden'); const sv = !siteBtn.classList.contains('hidden');
      const lb = document.getElementById('rw-lair'); const lv = !!lb && !lb.classList.contains('hidden'); // BK2: the boss key / lair prompt stacks on top
      const phone = typeof matchMedia === 'function' && matchMedia('(max-width: 560px)').matches;
      const ab = phone ? document.getElementById('realm-abilities') : null; const ar = ab ? ab.getBoundingClientRect() : null;
      if (ar && ar.height > 0) { // phone: the prompts stack in the free band ABOVE the 2x2 ability grid (never over it or a stick), centred
        const base = Math.max(8, Math.round(innerHeight - ar.top + 8)); const px = (n) => `${n}px`;
        siteBtn.style.bottom = sv ? px(base) : ''; portalBtn.style.bottom = pv ? px(sv ? base + 56 : base) : ''; // hidden prompts keep no inline override
        const n0 = (pv ? 1 : 0) + (sv ? 1 : 0); if (lb) lb.style.bottom = lv ? px(base + n0 * 56) : '';
        const n = n0 + (lv ? 1 : 0); const top = base + n * 56;
        hintEl.style.bottom = px(top); siteNote.style.bottom = px(top + (hintEl.classList.contains('hidden') ? 0 : 40));
        return;
      }
      siteBtn.style.bottom = pv && sv ? `calc(170px + ${BOT})` : '';
      portalBtn.style.bottom = pv && sv ? `calc(236px + ${BOT})` : '';
      if (lb) lb.style.bottom = lv && (pv || sv) ? `calc(${pv && sv ? 302 : 236}px + ${BOT})` : '';
      hintEl.style.bottom = ''; siteNote.style.bottom = '';
    }
    let promptObs = null; if (typeof MutationObserver === 'function') { promptObs = new MutationObserver(layoutPrompts); [portalBtn, siteBtn, hintEl].forEach((b) => promptObs.observe(b, { attributes: true, attributeFilter: ['class'] })); }
    if (typeof window !== 'undefined') { window.addEventListener('resize', layoutPrompts); window.addEventListener('orientationchange', layoutPrompts); }
    // ---------- the minimap and zone text step aside while a panel (backpack / board / menu / shop / hero) is open ----------
    const PANEL_IDS = { 'realm-backpack': 1, 'realm-board': 1, 'realm-pause': 1, 'realm-shop': 1, 'realm-hero': 1, 'realm-death': 1 };
    let panelHid = false;
    function syncPanels() {
      const open = !!arena.panel && typeof matchMedia === 'function' && matchMedia('(max-width: 700px)').matches; // phone width only: there the panels cover the corner HUD // the arena's own panel state (backpack / board / menu / shop / hero), read-only; the DOM mutations below only say when to look
      if (open === panelHid) return;
      panelHid = open; mini.style.display = open ? 'none' : ''; zoneEl.style.display = open ? 'none' : '';
      if (GOAL_ON) goalEl.classList.toggle('hidden', open || !goalTxt);
    }
    if (typeof window !== 'undefined') window.addEventListener('resize', syncPanels);
    if (typeof MutationObserver === 'function') new MutationObserver((recs) => { for (let i = 0; i < recs.length; i++) if (PANEL_IDS[recs[i].target.id]) { syncPanels(); return; } }).observe(ov, { attributes: true, subtree: true, attributeFilter: ['class', 'style'] });
    window.addEventListener('keydown', (ev) => { if ((ev.key === 'e' || ev.key === 'E' || ev.key === 'Shift') && !ev.repeat && siteFor && arena.active && !arena.paused && arena.state === 'play') { ev.preventDefault(); siteAct(); } });

    // ---------- live pickups (MMPickups): coins, XP orbs, hearts and life potions rolled per kill, seeded by (world seed, group, kill index) ----------
    // World sprites on the overlay layer (drawImage from the loaded b15 art, or a tiny cached code sprite). Magnet 120 px (64 px with ?ttk=0), cap 60 (oldest culled),
    // lifetime per tier, no per-frame Graphics. RB3: focus orbs and all 6 potions spawn too. Focus (orb, potion_focus) goes through arena.restoreFocus(amount)
    // when the arena has a focus bar (else it is picked up with no effect); power / swift / guard / wit are timed statuses through arena.applyStatus
    // (damaging / swift / armored / inspired, MMStatus), so they show in the status icon row with their time left.
    const PK = window.MMPickups || null;
    const PICK_ON = !!PK && !/[?&]pickups=0(&|$)/.test(typeof location !== 'undefined' ? location.search : '');
    const PICK_CAP = 60;
    const MAGNET_R = TTK_ON && PK && PK.MAGNET_RADIUS_WORLD > 0 ? PK.MAGNET_RADIUS_WORLD : (PK ? PK.MAGNET_RADIUS : 64);
    const picks = []; let pickSave = false; let pickTotal = 0; const pickGot = { coin: 0, xp: 0, heart: 0, potion: 0, focus: 0 };
    const POTION_STATUS = { pow: 'damaging', swf: 'swift', grd: 'armored', wit: 'inspired' }; // MMPickups buff stat -> MMStatus id
    const POTION_COL = { potion_life: '#5be38a', potion_focus: '#6ab8ff', potion_power: '#ff6a4a', potion_swift: '#7ee7ff', potion_guard: '#c9d1d9', potion_wit: '#ffe27a' };
    const POTION_NAME = { potion_life: 'Life', potion_focus: 'Focus', potion_power: 'Power', potion_swift: 'Swift', potion_guard: 'Guard', potion_wit: 'Wit' };
    const pickSpr = {};
    function pickSprite(type, art) { // cached code sprite (24x24) used until the art loads or when art is off
      const k = type === 'potion' ? (POTION_COL[art] ? art : 'potion_life') : type; if (pickSpr[k]) return pickSpr[k];
      const c = mk(24, 24); const g = c.getContext('2d');
      if (type === 'coin') { g.fillStyle = '#7a5a12'; g.beginPath(); g.arc(12, 12, 8, 0, 7); g.fill(); g.fillStyle = '#ffd45a'; g.beginPath(); g.arc(12, 12, 6.5, 0, 7); g.fill(); g.fillStyle = '#fff0a8'; g.fillRect(9, 8, 2, 6); }
      else if (type === 'xp') { g.fillStyle = '#4a2a8a'; g.beginPath(); g.arc(12, 12, 8, 0, 7); g.fill(); g.fillStyle = '#b48cff'; g.beginPath(); g.arc(12, 12, 6, 0, 7); g.fill(); g.fillStyle = '#efe0ff'; g.fillRect(9, 8, 3, 3); }
      else if (type === 'heart') { g.fillStyle = '#7a1022'; g.beginPath(); g.arc(8, 9, 5.5, 0, 7); g.arc(16, 9, 5.5, 0, 7); g.fill(); g.beginPath(); g.moveTo(3, 11); g.lineTo(21, 11); g.lineTo(12, 21); g.fill(); g.fillStyle = '#ff5f6b'; g.beginPath(); g.arc(8, 9, 4, 0, 7); g.arc(16, 9, 4, 0, 7); g.fill(); g.beginPath(); g.moveTo(5, 11); g.lineTo(19, 11); g.lineTo(12, 19); g.fill(); }
      else if (type === 'focus') { g.fillStyle = '#10264a'; g.beginPath(); g.arc(12, 12, 8, 0, 7); g.fill(); g.fillStyle = '#6ab8ff'; g.beginPath(); g.arc(12, 12, 6, 0, 7); g.fill(); g.fillStyle = '#e0f0ff'; g.fillRect(9, 8, 3, 3); }
      else { g.fillStyle = '#1a1a24'; g.fillRect(9, 4, 6, 5); g.fillRect(6, 9, 12, 12); g.fillStyle = POTION_COL[k] || '#5be38a'; g.fillRect(8, 11, 8, 8); g.fillStyle = '#ffffff'; g.fillRect(9, 12, 2, 4); }
      pickSpr[k] = c; return c;
    }
    const pickOk = (d) => d.type === 'coin' || (d.type === 'xp' && typeof arena._gainXp === 'function') || d.type === 'heart' || d.type === 'focus' || (d.type === 'potion' && !!POTION_COL[d.art]);
    const focusMax = () => { let m = 0; try { const f = typeof arena.focusState === 'function' ? arena.focusState() : null; m = f && Number(f.max) > 0 ? Number(f.max) : 0; } catch (e) { m = 0; } return m || 100; };
    function giveFocus(n) { // -> true when the arena has a focus bar to fill (defensive: the focus bar lands in its own slice)
      if (typeof arena.restoreFocus !== 'function' || !(n > 0)) return false;
      try { arena.restoreFocus(n); } catch (e) { return false; }
      return true;
    }
    const potionLog = [];
    function drinkPotion(art) { // the 6 potions (MMPickups.POTIONS): heal, focus, or a 30 s status. Returns what happened, for tests
      const p = arena.player; const o = PK.use({ type: 'potion', art }, { hp: p.hp, maxHp: arena.stats.maxHp, focus: 0, maxFocus: focusMax() });
      const res = { art, hp: 0, focus: 0, status: '', ok: false };
      if (o.hp > p.hp) { res.hp = Math.round(o.hp - p.hp); arena._floatText(p.x, p.y - 26, `+${res.hp}`, '#5be38a'); p.hp = o.hp; res.ok = true; }
      else if (o.focus > 0) { res.focus = Math.round(o.focus); res.ok = giveFocus(res.focus); if (res.ok) arena._floatText(p.x, p.y - 26, `+${res.focus} focus`, '#6ab8ff'); }
      else if (o.buff && POTION_STATUS[o.buff.stat] && typeof arena.applyStatus === 'function') {
        res.status = POTION_STATUS[o.buff.stat]; res.ok = arena.applyStatus('player', res.status, { sec: o.buff.sec, src: 'potion' }) !== false;
        arena._floatText(p.x, p.y - 26, `${POTION_NAME[art] || 'Potion'}!`, POTION_COL[art] || '#fff');
      }
      potionLog.push(res); if (potionLog.length > 12) potionLog.shift();
      arena._syncHud(); return res;
    }
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
      else if (q.type === 'focus') { if (giveFocus(q.value)) arena._floatText(p.x, p.y - 26, `+${q.value} focus`, '#6ab8ff'); }
      else if (q.type === 'potion') drinkPotion(q.art);
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
    // PLAYTEST-REVIEW-2 #5 (walkable Nexus, default; ?nexuswalk=0 restores the button screen): the same overlay, but the stage is a camera view onto the
    // plaza canvas (drawn ONCE, offscreen) and the hero walks around it with the arena's own input (arena.keys from WASD / arrows and arena.moveVec from
    // the move stick, which is lifted above the overlay). A real arena.setWorld swap was studied and not used: it would rebuild the pools, the zone
    // spawner, the event clock, the fog and the camera, and live enemies / bullets would have to be parked and restored; the frozen arena keeps the
    // Realm position exactly, so the Realm portal (or Back) returns to the same tile. Portals and NPCs are walk-up interactables with one 44 px prompt
    // button (E / Enter on a keyboard). No enemies and no firing in the plaza (fire / ability / panel keys are swallowed while walking).
    const NX = window.MMNexus || null;
    const NX_ON = !!NX && !!window.MMQuests && !/[?&]nexus=0(&|$)/.test(typeof location !== 'undefined' ? location.search : '');
    const NX_WALK = NX_ON && !/[?&]nexuswalk=0(&|$)/.test(typeof location !== 'undefined' ? location.search : '');
    // W-04 (b04-07): portrait phones get a tall walk view (400x540 world px) so the plaza fills >= 55% of the screen instead of a 4:3 strip
    const NX_TALL = typeof window !== 'undefined' && window.innerWidth < 600 && window.innerHeight > window.innerWidth * 1.3;
    const NX_VW = NX_TALL ? 400 : 640; const NX_VH = NX_TALL ? 540 : 480; const NX_R = 10; // walk view (world px) and the hero's collision radius
    // Cycle 3 art (G): plaza life in the walk view. Torches play their 4 b13 frames with a warm additive glow that flickers, the three
    // banners' cloth sways (2 px row bands sheared from the crossbar, the pole and crossbar fixed), the 7 NPC portraits bob 1 px on
    // their own phase. The animated props / portraits are left out of the baked plaza and drawn per frame (no double-draw ghosting).
    // Reduced motion = still frame 0, steady glow. ?nxlife=0 = the old static bake. Only while the plaza is open; cost in nxLifeStat.
    const NX_LIFE = NX_WALK && !/[?&]nxlife=0(&|$)/.test(typeof location !== 'undefined' ? location.search : '');
    const nxLife = []; const nxLifeStat = { on: NX_LIFE, frames: 0, ms: 0, torches: 0, banners: 0, npcs: 0, lastSway: 0, lastBob: 0, lastTorchF: -1 }; let nxGlow = null;
    const nxHero = { x: 0, y: 0, moving: false, aim: 0, mx: 0, my: 1, iframes: 0 }; let nxRaf = 0; let nxLast = 0; let nxNearI = null; const nxCam = { x: 0, y: 0 };
    // Shown name of a Nexus portal (display only; MMNexus keeps its ids and labels): the vault says where it leads (NAV-AUDIT 4.1 renames).
    const nxPortalName = (q) => (q && q.id === 'vault' ? 'Lantern vault' : q ? q.label : '');
    const nxSite = NX_ON ? (() => { const f = nearestFree(world.spawnPoint.x + 3, world.spawnPoint.y - 1, 8) || nearestFree(world.spawnPoint.x - 3, world.spawnPoint.y, 8); return f ? { tx: f.x, ty: f.y, x: (f.x + 0.5) * TILE, y: (f.y + 0.5) * TILE } : null; })() : null;
    const nxBtn = document.createElement('button'); nxBtn.id = 'rw-nexus-go'; nxBtn.type = 'button'; nxBtn.className = 'hidden'; nxBtn.textContent = 'Visit the Nexus (Enter)'; nxBtn.setAttribute('aria-label', 'Visit the Nexus hub'); ov.appendChild(nxBtn);
    let nxNear = false; let nxOpen = false; let nxEnterTile = null; let nxTalkN = 0; const nxPortrait = {}; let nxDom = null;
    const todayUtc = questDate;
    const nxCss = document.createElement('style');
    nxCss.textContent = '#rw-nexus-go{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(290px + env(safe-area-inset-bottom,0px));z-index:3;min-height:48px;min-width:44px;padding:0 18px;border-radius:24px;border:2px solid #a98bff;background:rgba(30,20,60,.92);color:#fff;font:700 15px var(--px-font,monospace);white-space:nowrap}#rw-nexus-go.hidden{display:none}'
      // PLAYTEST-REVIEW-3 #3: the pill shares z-index 3 with the backpack and comes later in the DOM: never over an open Realm panel or dialog
      + 'body:has(#realm-backpack:not(.hidden),#realm-board:not(.hidden),#realm-shop:not(.hidden),#realm-hero:not(.hidden),#realm-pause:not(.hidden),#realm-death:not(.hidden),#mm-settings:not(.hidden),#mm-summary:not(.hidden)) #rw-nexus-go{display:none}'
      + '#rw-nexus{position:fixed;inset:0;z-index:80;background:#120e1f;color:#f3eefc;display:flex;flex-direction:column;overflow-x:hidden;overflow-y:auto;font:14px/1.4 var(--px-font,monospace);padding:env(safe-area-inset-top,0px) 16px env(safe-area-inset-bottom,0px);box-sizing:border-box}#rw-nexus.hidden{display:none}'
      + '#rw-nexus .nx-head{display:flex;align-items:center;gap:12px;padding:8px 0;flex-wrap:wrap}#rw-nexus h2{margin:0;font-size:18px;flex:1;min-width:120px}'
      + '#rw-nexus button{min-height:44px;min-width:44px;padding:0 14px;border-radius:10px;border:2px solid #7a63c9;background:#2a2150;color:#fff;font:700 14px var(--px-font,monospace);cursor:pointer}#rw-nexus button:focus-visible{outline:3px solid #ffe27a}'
      + '#rw-nexus .nx-stage{position:relative;box-sizing:border-box;flex:0 0 auto;width:min(100%,max(320px,calc((100vh - 230px)*4/3)));max-width:760px;aspect-ratio:4/3;margin:0 auto;border:4px solid #2a2150;border-radius:0;box-shadow:0 0 0 2px #7a63c9,4px 4px 0 2px #000;overflow:hidden;background:#1b1530}#rw-nexus canvas{display:block;width:100%;height:100%;image-rendering:pixelated}'
      + '#rw-nexus .nx-spot{position:absolute;transform:translate(-50%,-50%);padding:0;border-radius:50%;background:rgba(255,255,255,.04);border:1px dashed rgba(255,255,255,.25)}'
      + '#rw-nexus .nx-lists{max-width:760px;width:100%;margin:10px auto 0;display:flex;flex-direction:column;gap:8px}#rw-nexus .nx-row{display:flex;flex-wrap:wrap;gap:8px}#rw-nexus .nx-row>b{flex:0 0 100%;font-size:12px;color:#c9bff0;font-weight:600}'
      + '#rw-nexus .nx-talk{max-width:760px;width:100%;margin:10px auto;box-sizing:border-box;padding:10px 12px;border-radius:10px;background:#231b42;border:1px solid #4a3d85;min-height:44px}#rw-nexus .nx-talk b{color:#ffe27a}'
      + '#rw-nx-act{display:block;margin:8px auto 0;min-height:48px !important;border-color:#ffe27a !important;background:#3a2c10 !important;max-width:100%;white-space:normal}#rw-nx-act.hidden{visibility:hidden}#rw-nexus .nx-stage:focus-visible{outline:3px solid #ffe27a}'
      + 'body.nx-walking #realm-stick-move{z-index:90}body.touch-device.nx-walking #rw-nexus{padding-bottom:calc(170px + env(safe-area-inset-bottom,0px))}'
      + '#rw-nexus.nx-tall .nx-stage{aspect-ratio:400/540;width:min(100%,calc((100vh - 250px)*400/540))}#rw-nexus .nx-talk{flex:0 0 auto;overflow-wrap:anywhere}' // W-04
      + 'body.nx-walking:has(#rw-nx-stall:not(.hidden)) .realm-stick,body.nx-walking:has(#rw-nx-board:not(.hidden)) .realm-stick{display:none !important}' // W-04 (b04-06, b02-13): no stick over the Buy / Claim rows
      + '@media (min-width:1000px) and (min-height:560px){#rw-nexus .nx-board:not(.hidden){position:fixed;right:16px;top:64px;width:min(400px,calc(50vw - 350px));max-height:calc(100vh - 80px);overflow-y:auto;z-index:2;margin:0}}' // W-04 (b04-10): the board opens beside the plaza, not below the fold
      + '#rw-nexus .nx-board{max-width:760px;width:100%;margin:0 auto 12px;box-sizing:border-box;padding:10px 12px;border-radius:10px;background:#1d2a2a;border:1px solid #3b6b5f}#rw-nexus .nx-board.hidden{display:none}#rw-nexus .nx-q{display:flex;align-items:center;gap:10px;padding:6px 0;border-top:1px solid #2f4a45}#rw-nexus .nx-q:first-of-type{border-top:0}#rw-nexus .nx-q span{flex:1}#rw-nexus .nx-q em{color:#8fe9ff;font-style:normal}'
      // PLAYTEST-REVIEW-2 #8: an unfinished quest's Claim is outline-only (dashed, muted, no fill) and the row carries a progress bar
      + '#rw-nexus .nx-stall{background:#2a2418;border-color:#6b5a36}#rw-nexus .nx-st-head{display:flex;align-items:center;gap:8px;justify-content:space-between}#rw-nexus .nx-st-note,#rw-nexus .nx-st-wallet{margin:6px 0;font-size:13px}#rw-nexus .nx-st-sub{display:block;margin:10px 0 6px;font-size:12px;color:#e8d9b0}#rw-nexus .nx-stall button{height:auto;padding:6px 10px;white-space:normal;max-width:100%;text-align:left}#rw-nexus .nx-stall button:disabled{background:transparent;border-style:dashed;border-color:#6b6390;color:#a59cc4;cursor:not-allowed}#rw-nexus .nx-st-q{flex:0 0 100%}#rw-nx-forge{margin:4px 0}'
      + '#rw-nexus .nx-q button:disabled{background:transparent;border-style:dashed;border-color:#6b6390;color:#a59cc4;cursor:not-allowed}#rw-nexus .nx-bar{display:block;height:6px;margin-top:5px;border-radius:3px;background:#2f4a45;overflow:hidden}#rw-nexus .nx-bar>i{display:block;height:100%;background:#5be38a}';
    // ID-04 notebook panel: the same .nx-board card as the quest board (EIGHTBIT-STYLE: pixel border, no blur), one list per category
    nxCss.textContent += '#rw-nx-more{position:fixed;left:calc(16px + env(safe-area-inset-left,0px));bottom:calc(8px + env(safe-area-inset-bottom,0px));z-index:81;pointer-events:none;padding:4px 12px;background:#ffe27a;color:#120e1f;border:2px solid #000;box-shadow:2px 2px 0 #000;font:700 13px var(--px-font,monospace);white-space:nowrap}#rw-nx-more.hidden{display:none}'; // cyc5-ui (b04-r3-01) scroll cue
    nxCss.textContent += '#rw-nexus .nx-notebook{background:#221d3a;border-color:#7a63c9}#rw-nexus .nx-nb-head{display:flex;align-items:center;gap:8px;justify-content:space-between}#rw-nexus .nx-nb-head h3{margin:0;font-size:16px}'
      + '#rw-nexus .nx-nb-note{margin:4px 0 8px;font-size:13px;color:#c9bff0}#rw-nexus .nx-nb-cat{margin:10px 0 4px;font-size:13px;color:#ffe27a}#rw-nexus .nx-nb-list{list-style:none;margin:0;padding:0}'
      + '#rw-nexus .nx-nb-list li{padding:6px 0;border-top:1px solid #3b3166;font-size:max(13px,1em);overflow-wrap:anywhere}#rw-nexus .nx-nb-list li:first-child{border-top:0}#rw-nexus .nx-nb-list b{color:#fff}#rw-nexus .nx-nb-list em{color:#8fe9ff;font-style:normal;margin-left:6px}#rw-nexus .nx-nb-list span{display:block;color:#d9d1f5}'
      + '#rw-nexus .nx-nb-empty{color:#a59cc4;font-size:13px;margin:2px 0}'
      // cyc3 U review (EIGHTBIT-STYLE / phone / a11y): square card with a hard ring and a whole-pixel drop shadow (no 10 px blob), pixel
      // font titles, the Text size preference scales the panel, and the walking Nexus move stick steps aside while the notebook is open
      + '#rw-nexus .nx-notebook{border-radius:0;border:2px solid #7a63c9;box-shadow:0 0 0 2px #000,4px 4px 0 2px #000}'
      + '#rw-nexus .nx-nb-head h3,#rw-nexus .nx-nb-cat{font-family:var(--px-font,ui-monospace,Menlo,Consolas,monospace);letter-spacing:.04em;text-transform:uppercase}'
      + 'body.mm-hud-big #rw-nexus .nx-nb-head h3{font-size:calc(16px * var(--mm-hud-scale,1))}body.mm-hud-big #rw-nexus .nx-nb-note,body.mm-hud-big #rw-nexus .nx-nb-cat,body.mm-hud-big #rw-nexus .nx-nb-empty,body.mm-hud-big #rw-nexus .nx-nb-list li{font-size:calc(13px * var(--mm-hud-scale,1))}'
      + 'body.nx-walking:has(#rw-nx-notebook:not(.hidden)) .realm-stick{display:none !important}';
    document.head.appendChild(nxCss);
    function nxLoadPortrait(id, done) { // b21 idle_down, first frame, cached; the plaza redraws when one arrives
      if (nxPortrait[id] !== undefined || !opts.assetRoot || !artOn) return;
      nxPortrait[id] = null;
      const img = new Image();
      img.onload = () => { if (img.naturalHeight >= 64) { nxPortrait[id] = img; if (done) done(); } };
      img.src = opts.assetRoot.replace(/\/+$/, '') + '/b21-npcs-and-vendors/enemies/' + id + '/' + id + '_idle_down.png';
    }
    const nxLabels = []; // W-04 test hook: portal label rects in plaza px (rebuilt per plaza draw)
    const NX_FLOOR_CLASSIC = /[?&]nxfloor=classic(&|$)/.test(qs0);
    const nxFloorStat = { tiles: 0, ring: 0 };
    function nxFloor(g, L) {
      const STONE = ['#4a4460', '#524b69', '#5a5372'], RING = ['#6a5468', '#735c70', '#7c6578'], MORTAR = '#2c2740', HI = 'rgba(255,255,255,0.10)', SH = 'rgba(0,0,0,0.22)';
      const cx = L.spawn.x / TILE, cy = L.spawn.y / TILE;
      for (let ty = 1; ty < L.h - 1; ty++) for (let tx = 1; tx < L.w - 1; tx++) {
        const px = tx * TILE, py = ty * TILE, d = Math.hypot(tx + 0.5 - cx, ty + 0.5 - cy), ring = d >= 2.2 && d <= 3.6;
        const ramp = ring ? RING : STONE, v = h2(tx, ty, 911);
        g.fillStyle = MORTAR; g.fillRect(px, py, TILE, TILE);
        if (ring) { // four cut stones per tile
          for (let k = 0; k < 4; k++) { const sx = px + (k & 1) * 16 + 1, sy = py + (k >> 1) * 16 + 1; g.fillStyle = ramp[Math.floor(h2(tx * 2 + (k & 1), ty * 2 + (k >> 1), 913) * 3)]; g.fillRect(sx, sy, 14, 14); g.fillStyle = HI; g.fillRect(sx, sy, 14, 1); g.fillRect(sx, sy, 1, 14); g.fillStyle = SH; g.fillRect(sx, sy + 13, 14, 1); g.fillRect(sx + 13, sy, 1, 14); }
          nxFloorStat.ring++;
        } else {
          const off = (ty & 1) ? 8 : 0; // running bond: every other row shifts the joint
          g.fillStyle = ramp[Math.floor(v * 3)]; g.fillRect(px + 2, py + 2, TILE - 2, TILE - 2);
          g.fillStyle = MORTAR; g.fillRect(px + 2 + off + 12, py + 2, 2, TILE - 2); // one vertical joint inside the slab
          g.fillStyle = HI; g.fillRect(px + 2, py + 2, TILE - 2, 1); g.fillRect(px + 2, py + 2, 1, TILE - 2);
          g.fillStyle = SH; g.fillRect(px + 2, py + TILE - 1, TILE - 2, 1); g.fillRect(px + TILE - 1, py + 2, 1, TILE - 2);
          if (v > 0.86) { g.fillStyle = MORTAR; const kx = px + 6 + Math.floor(h2(tx, ty, 915) * 16); for (let k = 0; k < 4; k++) g.fillRect(kx + k, py + 8 + k * 3, 1, 3); } // crack
          else if (v < 0.07) { g.fillStyle = '#3f6a48'; g.fillRect(px + 3, py + TILE - 5, 4, 2); g.fillRect(px + 5, py + TILE - 7, 2, 2); } // moss in the joint
        }
        nxFloorStat.tiles++;
      }
    }
    function nxDrawPlaza() { // one static draw per open / art arrival (1280x960 = the 40x30 tile plaza at 32 px)
      if (!nxDom) return; nxLabels.length = 0;
      const L = NX.layout(); const c = nxDom.plaza; const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
      g.fillStyle = '#0e0a18'; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#2e2742'; g.fillRect(0, 0, L.w * TILE, L.h * TILE); g.fillStyle = '#3d3457'; for (let i = 0; i < L.w; i++) { g.fillRect(i * TILE + 2, 2, TILE - 4, TILE - 6); g.fillRect(i * TILE + 2, (L.h - 1) * TILE + 2, TILE - 4, TILE - 6); } for (let j = 1; j < L.h - 1; j++) { g.fillRect(2, j * TILE + 2, TILE - 4, TILE - 6); g.fillRect((L.w - 1) * TILE + 2, j * TILE + 2, TILE - 4, TILE - 6); } // W-04: a stone kerb ring, never a void band
      // R4-D2 (b12-r2-08): flagstone plaza instead of the flat purple checkerboard. Per tile a seeded stone tone (3-step ramp), a dark
      // mortar line on the top / left, a 1 px top-left highlight, a bottom-right shade, rare cracks and moss; a warm mosaic ring of
      // smaller cut stones around the spawn. All baked once per open (nxDrawPlaza). ?nxfloor=classic: the old checkerboard.
      if (NX_FLOOR_CLASSIC) { for (let ty = 1; ty < L.h - 1; ty++) for (let tx = 1; tx < L.w - 1; tx++) { g.fillStyle = (tx + ty) % 2 ? '#4b4660' : '#554f6c'; g.fillRect(tx * TILE, ty * TILE, TILE, TILE); } }
      else nxFloor(g, L);
      g.fillStyle = '#6d6788'; for (let i = 1; i < L.w - 1; i++) { g.fillRect(i * TILE, TILE, TILE, 2); g.fillRect(i * TILE, (L.h - 2) * TILE + 30, TILE, 2); }
      const pad = wArt.spawn_pad; const sp = L.spawn;
      if (pad) drawArt(g, pad, 0, sp.x, sp.y + 16); else { g.fillStyle = '#7a63c9'; g.beginPath(); g.arc(sp.x, sp.y, 20, 0, 7); g.fill(); g.fillStyle = '#a98bff'; g.beginPath(); g.arc(sp.x, sp.y, 13, 0, 7); g.fill(); }
      nxLife.length = 0;
      L.props.forEach((p) => {
        const a = wArt[p.art]; const x = (p.tx + 0.5) * TILE; const y = (p.ty + 0.5) * TILE + 16;
        if (a && NX_LIFE && (/torch/.test(p.id) || /banner/.test(p.id))) { nxLife.push({ kind: /torch/.test(p.id) ? 'torch' : 'banner', p, a, x, y, ph: (MMRng.hash(p.id) % 1000) / 1000 }); return; } // cycle 3: drawn per frame
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
        // W-04 (b04-07, b02-15): pixel font, and the label is kept inside the floor the camera can show (it was cut at the plaza edges)
        g.font = 'bold 20px ui-monospace, Menlo, Consolas, monospace'; g.textAlign = 'center'; const nmP = nxPortalName(q); const lw = g.measureText(nmP).width;
        const lx = Math.max(TILE + lw / 2 + 4, Math.min((L.w - 1) * TILE - lw / 2 - 4, q.x)); nxLabels.push({ id: q.id, x: lx - lw / 2, y: q.y - 56, w: lw, h: 24 });
        g.fillStyle = '#000'; g.fillText(nmP, lx + 2, q.y - 36); g.fillStyle = '#e8dcff'; g.fillText(nmP, lx, q.y - 38);
        const nm = nxMutOf(q); if (nm) { g.font = 'bold 15px ui-monospace, Menlo, Consolas, monospace'; const mw = g.measureText('+ ' + nm.label).width; const mx = Math.max(TILE + mw / 2 + 4, Math.min((L.w - 1) * TILE - mw / 2 - 4, q.x)); g.fillStyle = '#000'; g.fillText('✦ ' + nm.label, mx + 2, q.y - 58); g.fillStyle = '#c9b6ff'; g.fillText('✦ ' + nm.label, mx, q.y - 60); }
      });
      if (RUSH_ON && L.trial) { // RE2: the Trial gate, code-drawn (no art id): a gold ring and its name
        const q = L.trial; g.save(); g.globalAlpha = 0.3; g.fillStyle = '#ffd45a'; g.beginPath(); g.arc(q.x, q.y, 30, 0, 7); g.fill(); g.globalAlpha = 1; g.strokeStyle = '#ffd45a'; g.lineWidth = 4; g.beginPath(); g.arc(q.x, q.y, 24, 0, 7); g.stroke(); g.restore();
        g.font = 'bold 20px ui-monospace, Menlo, Consolas, monospace'; g.textAlign = 'center'; g.fillStyle = '#000'; g.fillText(q.label, q.x + 1, q.y - 37); g.fillStyle = '#ffe27a'; g.fillText(q.label, q.x, q.y - 38);
      }
      L.npcs.forEach((n) => {
        const im = nxPortrait[n.npc]; const x = n.x; const y = n.y;
        if (im && NX_LIFE) nxLife.push({ kind: 'npc', im, x, y, ph: (MMRng.hash(n.npc) % 1000) / 1000 }); // cycle 3: drawn per frame (idle bob)
        else if (im) g.drawImage(im, 0, 0, im.naturalHeight, im.naturalHeight, x - 40, y - 60, 80, 80);
        else { const h = MMRng.hash(n.npc); g.fillStyle = '#000'; g.fillRect(x - 13, y - 14, 26, 36); g.fillStyle = 'hsl(' + (h % 360) + ',45%,48%)'; g.fillRect(x - 11, y - 12, 22, 32); g.fillStyle = '#f0cfa6'; g.beginPath(); g.arc(x, y - 22, 10, 0, 7); g.fill(); }
        g.font = 'bold 18px ui-monospace, Menlo, Consolas, monospace'; g.textAlign = 'center'; g.fillStyle = '#000'; g.fillText(NPC_NAME[n.npc] || n.id, x + 2, y + 38); /* R4-D2: pixel (mono) font like the portal labels */ g.fillStyle = '#ffe27a'; g.fillText(NPC_NAME[n.npc] || n.id, x, y + 36);
      });
    }
    function nxMutOf(q) { // DV1: the seeded mutator of a Nexus dungeon portal (same seed as nxUrl), or null
      if (!q || !BIOME_NAME[q.id] || !window.MMEndgame || MUT_OFF) return null;
      let m = null; try { m = MMEndgame.mutatorsFor(q.id, undefined, String(MMRng.hash(seed + ':nexus:' + q.id) % 100000), {}); } catch (e) { m = null; }
      return m && m.list.length ? m : null;
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
      arena.stop(); nxWalkStop(); nxDom.root.classList.add('hidden'); nxOpen = false;
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
    // ---------- RE2: the boss rush "Trial of Six" (MMEndgame.rushLadder) ----------
    // A gate in the Nexus (heroes Lv 20+, entered only by choice) runs the six godland bosses one after another, here in the Realm beside the Nexus,
    // with the arena's own boss fight and telegraphs. Each boss is the world boss at its zone 3 multipliers with the ladder's small capped ramp.
    // Between fights a calm choice: the next fight, "Rest here" (nothing is restored beyond normal resting) or "Leave with your loot". No timer,
    // no lives, no entry fee, no lockout. Each kill is one normal boss bag (giveBag: one MMGearDrops.pityStep, the storage re-read before the roll)
    // and its bag goes straight into the pack, so leaving or falling keeps every drop. No extra loot: no pickups or keys from rush bosses.
    // ?rush=0 hides the gate. Session-only state: nothing new is saved.
    const RUSH_ON = NX_ON && !!window.MMEndgame && typeof MMEndgame.rushLadder === 'function' && !/[?&]rush=0(&|$)/.test(qs0);
    const rush = { on: false, ladder: null, i: 0, e: null, kills: 0, phase: '', n: 0, log: [] };
    let rushCollect = null; let rushEl = null; let rushGoEl = null;
    const rushLevel = () => (arena.heroLevel ? arena.heroLevel() : 1);
    function rushLadderNow() { return MMEndgame.rushLadder(seed + ':' + rush.n, rushLevel()); }
    function rushStart() {
      if (!RUSH_ON || rush.on || leaving || !arena.active) return null;
      const L = rushLadderNow();
      if (!L.ok) { if (nxDom && nxOpen) nxSay('Trial of Six', L.text); return null; }
      if (nxOpen) nexusClose();
      rush.on = true; rush.ladder = L; rush.i = 0; rush.kills = 0; rush.e = null; rush.log = []; rush.phase = 'fight'; rush.n++;
      // G-27 (b03-09): the Trial is fought on a clear field: the world mobs around (and their bolts) rest until it ends; no new ones spawn meanwhile
      live.forEach((e, id) => { if (e && e.active && e.zid === id && !e.rushStep) { e.active = false; e.zid = -1; } if (zones) zones.markDead(id, arena.clock); });
      live.clear(); arena.eBullets.forEach((b) => { b.active = false; });
      rushSpawn();
      return 'rush';
    }
    function rushSpawn() {
      if (!rush.on || rush.phase !== 'fight' || rush.e) return null;
      const st = rush.ladder.steps[rush.i]; const p = arena.player;
      const f = nearestFree(Math.floor(p.x / TILE), Math.floor(p.y / TILE) - 5, 6) || { x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) - 3 };
      const e = arena.spawnEnemy('boss', (f.x + 0.5) * TILE, (f.y + 0.5) * TILE);
      if (!e) return null; // pool full: rushTick tries again
      e.maxHp = Math.max(1, Math.ceil(RM_BOSS_HP * st.hpMul / Z.TABLES.BOSS.hp)); e.hp = e.maxHp;
      e.phase = 1; e.invuln = 1.2; e.cd = 1.2; e.cd2 = 2.4; e.angle = 0;
      e.dmgMul = st.dmgMul; e.bossName = st.name; e.bossTier = 4; e.art = st.boss; e.bossArt = st.boss; e.rushStep = st.step;
      arena.bossT0 = arena.clock; rush.e = e; arena._syncBoss(); rushHide(); rushLayerReset(e, st);
      arena._showBanner('Trial of Six · ' + st.text, 1.8);
      return e;
    }
    function rushKilled(e) {
      const st = rush.ladder.steps[rush.i]; e.rushStep = 0; rush.e = null;
      rush.kills++; kills++; save.stats.bossKills++;
      rushCollect = arena.bags.filter((b) => b.active && b.t === 0 && Math.hypot(b.x - e.x, b.y - e.y) < 120); // the arena's own two boss bags (_bossDefeated), dropped just now
      let got = null; try { got = rollFor({ zone: 3, tier: 3, boss: true, src: 'boss', bossId: st.boss }, e.x, e.y + 30, 'rush' + rush.n + ':' + rush.i); } finally {
        const bags = rushCollect || []; rushCollect = null;
        bags.forEach((b) => { if (b.active) { const g = b.gear; b.active = false; arena.collectItem(b.id, b.r, g || undefined); b.gear = null; } });
      }
      writeSave(save);
      rush.log.push({ step: st.step, boss: st.boss, items: got ? got.items.length : 0 });
      rush.i++; rush.phase = rush.i >= rush.ladder.steps.length ? 'done' : 'rest'; rushCapSync();
      rushPanel();
    }
    function rushBuild() {
      if (rushEl) return;
      rushEl = document.createElement('div'); rushEl.id = 'rw-rush'; rushEl.className = 'hidden'; rushEl.setAttribute('role', 'group'); rushEl.setAttribute('aria-label', 'Trial of Six');
      rushGoEl = document.createElement('button'); rushGoEl.type = 'button'; rushGoEl.id = 'rw-rush-go'; rushGoEl.className = 'hidden';
      rushGoEl.addEventListener('click', () => rushPanel());
      ov.appendChild(rushEl); ov.appendChild(rushGoEl);
    }
    function rushPanel() {
      if (!rush.on) return; rushBuild();
      const steps = rush.ladder.steps; const done = steps[rush.i - 1]; const next = steps[rush.i];
      rushEl.textContent = '';
      const p = document.createElement('p');
      p.textContent = rush.phase === 'done' ? 'The Trial of Six is done: ' + done.name + ' was the last. Every drop is already in your pack.'
        : 'Step ' + done.step + ' of ' + steps.length + ' done: ' + done.name + '. Next is ' + next.name + '. Take your time; every drop is already in your pack.';
      if (rush.phase === 'rest') { // ID-36 carried-HP readout (cycle 6 S): the HP the hero takes into the next fight
        const hp = document.createElement('p'); hp.id = 'rw-rush-hp'; hp.className = 'rw-rush-hp';
        hp.textContent = 'You carry ' + Math.max(0, Math.ceil(arena.player.hp)) + ' of ' + Math.round(arena.stats.maxHp) + ' HP into it.';
        rushHpEl = hp;
      } else rushHpEl = null;
      const row = document.createElement('div'); row.className = 'rw-rush-btns';
      const btn = (id, text, fn) => { const b = document.createElement('button'); b.type = 'button'; b.id = id; b.textContent = text; b.addEventListener('click', fn); row.appendChild(b); return b; };
      if (rush.phase === 'rest') { btn('rw-rush-next', 'Next fight: ' + next.name, () => rushNext()); btn('rw-rush-rest', done.restText, () => rushRest()); }
      btn('rw-rush-leave', done.leaveText, () => rushEnd('leave'));
      rushEl.append(p); if (rushHpEl) rushEl.append(rushHpEl); rushEl.append(row); rushEl.classList.remove('hidden'); rushGoEl.classList.add('hidden');
    }
    let rushHpEl = null;
    function rushHide() { if (rushEl) rushEl.classList.add('hidden'); if (rushGoEl) rushGoEl.classList.add('hidden'); }
    function rushRest() { // the panel folds into a small pill; the hero walks, heals and shops as usual
      if (!rush.on || rush.phase !== 'rest') return false;
      rushHide(); rushGoEl.textContent = 'Trial of Six: ready for ' + rush.ladder.steps[rush.i].name; rushGoEl.classList.remove('hidden');
      return true;
    }
    function rushNext() { if (!rush.on || rush.phase !== 'rest') return null; rush.phase = 'fight'; return rushSpawn(); }
    function rushEnd(why) {
      if (!rush.on) return false;
      if (rush.e) { rush.e.rushStep = 0; rush.e.active = false; rush.e = null; arena._syncBoss(); }
      rush.on = false; rush.phase = why === 'fell' ? 'fell' : 'left'; rushHide(); rush.lay = null; rushCapSync();
      if (why === 'leave' && nxSite && arena.state === 'play') { const p = arena.player; p.x = nxSite.x; p.y = nxSite.y + TILE; p.iframes = Math.max(p.iframes, 1.5); arena._showBanner('You left the Trial of Six with your loot', 1.8); }
      writeSave(save); arena.onSave(arena.save);
      return true;
    }
    const rushDcPrev = arena.onDeathCache; // a fall ends the trial at once (the arena stops ticking the world while it is down)
    arena.onDeathCache = (c) => {
      if (rush.on) { // G-27 (b03-10): say how far the Trial went (after the fall line), not only the generic world fall
        const n = rush.ladder && rush.ladder.steps ? rush.ladder.steps.length : 6, at = Math.min(n, rush.i + 1), beat = rush.kills;
        rushEnd('fell'); rush.lastFall = { at, n, beat };
        setTimeout(() => { try { arena._showBanner('Trial of Six: you fell at fight ' + at + ' of ' + n + ' · ' + beat + ' beaten · every drop is in your pack', 3); } catch (e) { /* cosmetic */ } }, 2700);
      }
      if (typeof rushDcPrev === 'function') rushDcPrev(c);
    };
    function rushTick(dt) {
      if (!rush.on) return;
      if (arena.state === 'dead' || !arena.active) { rushEnd('fell'); return; } // a fall ends the trial: the hero is back by the Nexus, every drop already kept
      if (rush.phase === 'fight') { if (rush.e && !rush.e.active) { rush.e.rushStep = 0; rush.e = null; } if (!rush.e) rushSpawn(); }
      rushLayerTick(dt);
    }
    // ---------- ID-36 (cycle 5 S): the Trial ramp layers (MMEndgame.LAYERS; spec in game/design/beta/cycle4-design.md) ----------
    // Fight 4 adds A "lead shot", fight 5 A + B "slow arm", fight 6 A + B + C "edge sweep". Layer bolts carry the boss's own damage multiplier.
    // The clock is the arena sim clock from the boss's spawn; nothing fires while the boss is shielded (spawn invuln 1.2 s) or before each
    // layer's own wind-up (0.6 s, 0.8 s for the sweep), and every layer is telegraphed (drawn in rushLayerDraw). ?trialramp=0 = fights 4-6 as before.
    const RAMP_ON = RUSH_ON && typeof MMEndgame.rushLayers === 'function' && !/[?&]trialramp=0(&|$)/.test(qs0);
    // The cap: the bosses' own patterns keep the zone's cap for THEIR bolts (fights 1-3 exactly as before); the layers' bolts ride on top.
    // So the live cap is zone cap + the layer bolts alive now (rush.capAdd, at most the fight's MMEndgame.rushCapExtra), and a layer bolt is
    // fired against zone cap + that maximum. Layer bolts carry a token (b.rl) so they are counted apart from the boss's.
    function rushCapExtraNow() { try { return RAMP_ON && rush.on && rush.phase === 'fight' && rush.lay ? rush.lay.capAdd : 0; } catch (e) { return 0; } } // TDZ-safe (fireBudgetFor runs earlier)
    function rushCapMaxNow() { try { return RAMP_ON && rush.on && rush.phase === 'fight' && rush.ladder && rush.ladder.steps[rush.i] ? MMEndgame.rushCapExtra(rush.ladder.steps[rush.i].step) : 0; } catch (e) { return 0; } }
    function rushLayerReset(e, st) {
      const LY = MMEndgame.LAYERS; const ids = RAMP_ON && st ? MMEndgame.rushLayers(st.step) : [];
      const t0 = (e && e.invuln > 0 ? e.invuln : 0);
      rush.lay = { ids, t: 0, hist: [], k: 0, pend: null, capAdd: 0, tok: rush.n * 10 + (st ? st.step : 0), nLead: t0 + LY.lead.windup + LY.lead.every, nArm: t0 + LY.arm.windup, nSweep: t0 + LY.sweep.every, fired: { lead: 0, arm: 0, sweep: 0 }, dropped: 0, sweeps: [] };
      rushCapSync(); // the fire budget picks up the new cap at once
    }
    function rushCapSync() { const fb = arena.fireBudget; if (FB_ON && fb && fb.zone >= 0) fb.cap = ebCapFor(fb.zone) + rushCapExtraNow(); }
    function rushLayerFire(e, x, y, ang, speed, kind, life) {
      const L = rush.lay; const fb = arena.fireBudget; const was = arena._curDm; arena._curDm = e.dmgMul || 1;
      if (fb && FB_ON && fb.zone >= 0) fb.cap = ebCapFor(fb.zone) + rushCapMaxNow(); // a layer bolt is checked against the full Trial cap
      let b = null; try { b = arena.fireEnemyBullet(x, y, ang, speed, kind, e); } finally { arena._curDm = was; }
      if (b) { b.rl = L.tok; if (life > 0 && b.life > life) b.life = life; L.capAdd = Math.min(rushCapMaxNow(), L.capAdd + 1); } else L.dropped++;
      rushCapSync();
      return b;
    }
    function rushLayerLive() { const L = rush.lay; let n = 0; if (!L) return 0; const eb = arena.eBullets; for (let i = 0; i < eb.length; i++) if (eb[i].active && eb[i].rl === L.tok) n++; return n; }
    function rushLayerTick(dt) {
      const L = rush.lay; const e = rush.e;
      if (!L || !L.ids.length || rush.phase !== 'fight' || !e || !e.active || arena.state !== 'play') return;
      const LY = MMEndgame.LAYERS; const p = arena.player;
      L.capAdd = Math.min(rushCapMaxNow(), rushLayerLive()); rushCapSync(); // the bosses' own bolts keep the zone cap for themselves
      L.t += Math.min(Math.max(dt || 0, 0), 0.1);
      L.hist.push([L.t, p.x, p.y]); while (L.hist.length > 2 && L.hist[1][0] <= L.t - LY.lead.velWin) L.hist.shift();
      if (e.invuln > 0) return; // shielded: the layers wait (their timers are measured from the spawn, after the shield)
      if (L.ids.indexOf('lead') >= 0 && L.t >= L.nLead) {
        L.nLead += LY.lead.every; const h = L.hist[0]; const w = Math.max(1e-3, L.t - h[0]);
        const vx = (p.x - h[1]) / w, vy = (p.y - h[2]) / w;
        if (rushLayerFire(e, e.x, e.y, MMEndgame.leadAim(e.x, e.y, p.x, p.y, vx, vy), LY.lead.speed, 0, LY.lead.life)) L.fired.lead++;
      }
      if (L.ids.indexOf('arm') >= 0 && L.t >= L.nArm) {
        L.nArm += LY.arm.every; const ang = MMEndgame.armAngles(L.t);
        for (let k = 0; k < ang.length; k++) if (rushLayerFire(e, e.x, e.y, ang[k], LY.arm.speed, 1, LY.arm.life)) L.fired.arm++;
      }
      if (L.ids.indexOf('sweep') >= 0) {
        if (!L.pend && L.t >= L.nSweep - LY.sweep.warn) { L.pend = Object.assign({ at: L.nSweep, t0: L.t }, MMEndgame.sweepLine(L.k, p.x, p.y, ((L.k % 2) ? (arena._dv ? arena._dv.vh || arena.H : arena.H) : (arena._dv ? arena._dv.vw : arena.W)) / 2)); L.k++; }
        if (L.pend && L.t >= L.pend.at) {
          const q = L.pend; L.pend = null; L.nSweep += LY.sweep.every; let n = 0;
          for (let k = 0; k < q.pts.length; k++) if (rushLayerFire(e, q.pts[k].x, q.pts[k].y, q.dir, q.speed, 2, 0)) n++;
          L.fired.sweep += n; L.sweeps.push({ t: +L.t.toFixed(2), warnS: +(q.at - q.t0).toFixed(2), n, gapFrom: q.gapFrom, dir: q.dir });
        }
      }
    }
    function rushLayerDraw(g) { // telegraphs: the lead shot's aim line in its last 0.6 s, the sweep's faded bolts for 0.8 s
      const L = rush.lay; const e = rush.e;
      if (!L || !L.ids.length || !rush.on || rush.phase !== 'fight' || !e || !e.active) return;
      const LY = MMEndgame.LAYERS; const p = arena.player;
      g.save();
      if (L.ids.indexOf('lead') >= 0 && e.invuln <= 0) {
        const k = (L.nLead - L.t) / LY.lead.windup;
        if (k >= 0 && k <= 1) { g.strokeStyle = '#ffb347'; g.globalAlpha = 0.25 + 0.45 * (1 - k); g.lineWidth = 2; g.setLineDash([6, 6]); g.beginPath(); g.moveTo(e.x, e.y); g.lineTo(p.x, p.y); g.stroke(); g.setLineDash([]); }
      }
      if (L.pend) {
        const k = Math.max(0, Math.min(1, (L.t - L.pend.t0) / LY.sweep.warn));
        g.fillStyle = '#c9a0ff'; g.strokeStyle = '#ffffff'; g.lineWidth = 1.5;
        for (const q of L.pend.pts) { g.globalAlpha = 0.15 + 0.35 * k; g.beginPath(); g.arc(q.x, q.y, 7, 0, 7); g.fill(); g.globalAlpha = 0.4 * k; g.stroke(); }
      }
      g.restore();
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
      const erLine = n.role === 'shop' ? erVendor() : null; // ID-12: the Vendor takes Mocha's parcel / names the trophy, then opens the stall as always
      if (n.stall && nxStallOn()) { nxStallOpen(n.stall); if (n.stall === 'forge') { const fb = document.getElementById('rw-nx-forge'); if (fb) { fb.classList.add('nx-hi'); try { fb.focus({ preventScroll: true }); } catch (e) { /* focus is cosmetic */ } } } // G-18 (b04-09): the Blacksmith points at the Forge button in this stall
        nxSay(name, erLine || (n.stall === 'forge' ? 'The anvil is yours to use. Tap "Open the Forge" below to salvage and reforge your gear.' : 'Same goods, same prices, every day. Take your time.')); return; }
      if (n.role === 'shop' && typeof arena.setShop === 'function') { nxSay(name, erLine || 'Take a look. Everything is priced in 💎 shards, same every day.'); nxStallShop(); return; } // forge/stall off: the vendor still opens the classic shop
      const key = n.role === 'rumours' ? 'rumours' : n.role === 'shop' ? 'vendor' : n.role === 'combine' ? 'blacksmith' : 'guide';
      if (erLine) { nxSay(name, erLine); return; }
      const L = NX_LINES[key]; nxSay(name, L[(MMRng.hash(todayUtc() + n.id) + nxTalkN) % L.length]);
    }
    // ---------- VN: the vendor / forge stall (arena.vendorStock / vendorBuy / vendorSellBack / openForge; realm.js owns the save) ----------
    // Calm by design: a fixed T1-T3 list at fixed dust prices, no timer, no rotation, no random pack, no real money. Follows the forge gate (?forge=0 hides it).
    let nxStallAsk = 0; // uid waiting for the sell-back confirm
    const nxStallOn = () => typeof arena.vendorOn === 'function' && arena.vendorOn();
    function nxStallBtn(text, label, fn) { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.setAttribute('aria-label', label || text); b.addEventListener('click', fn); return b; }
    function nxStallRender() {
      const el = nxDom.stall; el.textContent = '';
      if (!nxStallOn()) { el.classList.add('hidden'); return; }
      const sv = arena.save; const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
      const forge = nxStallKind === 'forge'; // b04-09: the Blacksmith opens the same stall, titled as his forge (the shelf stays below it)
      el.setAttribute('aria-label', forge ? 'Blacksmith forge' : 'Vendor stall');
      const head = mk('div', 'nx-st-head'); head.appendChild(mk('b', '', forge ? "Blacksmith's forge" : 'Vendor stall'));
      head.appendChild(nxStallBtn(forge ? 'Close forge' : 'Close stall', forge ? 'Close the Blacksmith forge' : 'Close the vendor stall', () => nxStallHide()));
      el.appendChild(head);
      el.appendChild(mk('p', 'nx-st-note', forge ? 'Salvage and reforge your gear in the Forge. The shared shelf (fixed prices in dust) is below.' : 'Fixed prices in dust. The shelf is the same every day.'));
      el.appendChild(mk('p', 'nx-st-wallet', 'You have ' + (sv.dust || 0) + ' dust · ' + sv.items.length + ' items carried'));
      const fg = nxStallBtn('⚒ Open the Forge', 'Open the Forge in your backpack', () => nxStallForge()); fg.id = 'rw-nx-forge'; el.appendChild(fg);
      // The classic shop (priced in 💎 shards, every unlocked rarity) stays one tap away: the dust stall only sells fixed T1-T3 goods, and dust starts at 0.
      const sh = nxStallBtn('🛒 Shop (💎 shards)', 'Open the shop: buy gear with shards', () => nxStallShop()); sh.id = 'rw-nx-shop'; el.appendChild(sh);
      if (!(sv.dust > 0)) el.appendChild(mk('p', 'nx-st-note', 'No dust yet. Sell T1-T3 gear back here or salvage in the Forge to earn some; the Shop above takes shards.'));
      el.appendChild(mk('b', 'nx-st-sub', 'Buy'));
      const buy = mk('div', 'nx-row'); buy.id = 'rw-nx-buy';
      (arena.vendorStock() || []).forEach((o) => {
        const why = !o.room ? ' (backpack full)' : !o.afford ? ' (not enough dust)' : '';
        const b = nxStallBtn(o.name + ' T' + o.t + ' · ' + o.price + ' dust', 'Buy ' + o.name + ' tier ' + o.t + ' for ' + o.price + ' dust' + why, () => { arena.vendorBuy(o.id, o.t); nxStallRender(); });
        b.dataset.vbuy = o.id + ':' + o.t; b.dataset.price = String(o.price); if (why) b.disabled = true; buy.appendChild(b);
      });
      el.appendChild(buy);
      el.appendChild(mk('b', 'nx-st-sub', 'Sell back (T1-T3)'));
      const back = mk('div', 'nx-row'); back.id = 'rw-nx-sell'; let any = false;
      const eqd = new Set(Object.keys(sv.eq || {}).map((k) => sv.eq[k])); // G-03 (b02-14): the equipped piece says so in the Sell-back list
      sv.items.forEach((it) => {
        const info = arena.vendorBuyBackInfo(it.n); if (!info) return; any = true;
        const def = (typeof RM_ITEM_BY_ID !== 'undefined' && RM_ITEM_BY_ID[it.id] ? RM_ITEM_BY_ID[it.id].name : it.id) + (eqd.has(it.n) ? ' (equipped)' : '');
        if (nxStallAsk === it.n) {
          const q = mk('span', 'nx-st-q', 'Sell ' + def + ' T' + it.t + ' back for ' + info.dust + ' dust?'); back.appendChild(q);
          const y = nxStallBtn('Confirm +' + info.dust + ' dust', 'Confirm: sell ' + def + ' back for ' + info.dust + ' dust', () => { nxStallAsk = 0; arena.vendorSellBack(it.n); nxStallRender(); }); y.dataset.vyes = String(it.n); back.appendChild(y);
          back.appendChild(nxStallBtn('Cancel', 'Keep ' + def, () => { nxStallAsk = 0; nxStallRender(); }));
        } else {
          const b = nxStallBtn(def + ' T' + it.t + ' · +' + info.dust + ' dust', 'Sell ' + def + ' tier ' + it.t + ' back for ' + info.dust + ' dust (asks first)', () => { nxStallAsk = it.n; nxStallRender(); });
          b.dataset.vsell = String(it.n); back.appendChild(b);
        }
      });
      if (!any) back.appendChild(mk('span', 'nx-st-note', 'Nothing to sell back. Tier 1 to 3 gear can be sold here.'));
      el.appendChild(back);
      // G-03 (b02-14): after every stall re-render Buy / Sell back / Confirm are inert for 300 ms, so a double-tap buys (or sells) once
      const armed = Array.from(el.querySelectorAll('button[data-vbuy], button[data-vsell], button[data-vyes]')).filter((b) => !b.disabled);
      armed.forEach((b) => { b.disabled = true; b.dataset.arm = '1'; });
      setTimeout(() => armed.forEach((b) => { if (b.isConnected && b.dataset.arm) { b.disabled = false; delete b.dataset.arm; } }), 300);
    }
    let nxStallKind = 'shop';
    // cyc4 U: the board / stall replaces an open notebook; when focus was inside the notebook (its Close), it moves to the new panel's
    // first button instead of falling to <body> (the notebook is emptied). Focus anywhere else is left alone.
    const nbHadFocus = () => !!(nxDom && nxDom.notebook && !nxDom.notebook.classList.contains('hidden') && nxDom.notebook.contains(document.activeElement));
    const nxFocusFirst = (el) => { const f = el && el.querySelector('button:not([disabled])'); if (f) { try { f.focus({ preventScroll: true }); } catch (e) { /* focus is cosmetic */ } } };
    function nxStallOpen(kind) { nxBuild(); if (!nxStallOn()) return false; nxStallKind = kind === 'forge' ? 'forge' : 'shop'; nxStallAsk = 0; nxDom.board.classList.add('hidden'); const had = nbHadFocus(); nbHide(false); nxStallRender(); nxDom.stall.classList.remove('hidden'); if (had) nxFocusFirst(nxDom.stall); nxMoreSync(); return true; }
    // PLAYTEST-REVIEW-3 #7: Shop and Forge open over the Nexus (the plaza closes underneath) and closing them returns to the Nexus stall.
    // nxReturn remembers that origin only for a panel opened from the stall; any other panel, a death or a leave forgets it.
    let nxReturn = null;
    function nxStallShop() { nxStallHide(); nexusClose(); if (typeof arena.setShop === 'function') { arena.setShop(true); nxReturn = arena.panel === 'shop' ? 'shop' : null; } return true; }
    function nxStallForge() { if (!nxStallOn()) return false; nxStallHide(); nexusClose(); const ok = arena.openForge(); nxReturn = ok && arena.panel === 'bp' ? 'bp' : null; return ok; }
    const nxPanelHook = arena.onPanel;
    arena.onPanel = (name, prev) => {
      if (typeof nxPanelHook === 'function') nxPanelHook(name, prev);
      if (!nxReturn) return;
      if (name) { if (name !== 'shop' && name !== 'bp') nxReturn = null; return; } // shop <-> backpack keeps the origin; a menu / board / hero panel drops it
      nxReturn = null;
      if (leaving || !arena.active || arena.state !== 'play') return;
      if (nexusOpen()) nxStallOpen(nxStallKind);
    };
    function nxStallHide() { nxStallAsk = 0; if (!nxDom || !nxDom.stall) return; nxDom.stall.classList.add('hidden'); nxDom.stall.textContent = ''; } // emptied: no hidden buttons linger
    function nxBuild() {
      if (nxDom) return nxDom;
      const root = document.createElement('div'); root.id = 'rw-nexus'; root.className = 'hidden'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'The Nexus');
      const head = document.createElement('div'); head.className = 'nx-head';
      const back = document.createElement('button'); back.type = 'button'; back.id = 'rw-nx-back'; back.textContent = 'Back to the Realm'; back.setAttribute('aria-label', 'Back to the Realm');
      const h = document.createElement('h2'); h.textContent = 'The Nexus'; head.appendChild(back); head.appendChild(h);
      let nbBtn = null; let notebook = null;
      if (NB) { // ID-04: the hero notebook, a real button in the header (keyboard / touch / screen reader), Esc closes it
        nbBtn = document.createElement('button'); nbBtn.type = 'button'; nbBtn.id = 'rw-nx-notebook-btn'; nbBtn.setAttribute('aria-controls', 'rw-nx-notebook'); nbBtn.setAttribute('aria-expanded', 'false');
        nbBtn.addEventListener('click', () => (nxDom && nxDom.notebook && !nxDom.notebook.classList.contains('hidden') ? nbHide(true) : nbShow()));
        head.appendChild(nbBtn);
        notebook = document.createElement('div'); notebook.className = 'nx-board nx-notebook hidden'; notebook.id = 'rw-nx-notebook'; notebook.setAttribute('role', 'region'); notebook.setAttribute('aria-label', 'Hero notebook');
      }
      const stage = document.createElement('div'); stage.className = 'nx-stage';
      const cv = document.createElement('canvas'); cv.width = NX_WALK ? NX_VW : NX.W * TILE; cv.height = NX_WALK ? NX_VH : NX.H * TILE; cv.setAttribute('aria-hidden', 'true'); stage.appendChild(cv);
      let plaza = cv; let act = null;
      if (NX_WALK) { // the plaza is drawn once offscreen; the stage canvas shows a camera window onto it with the walking hero
        plaza = document.createElement('canvas'); plaza.width = NX.W * TILE; plaza.height = NX.H * TILE;
        root.classList.add('nx-walk'); if (NX_TALL) root.classList.add('nx-tall'); stage.tabIndex = 0; stage.setAttribute('role', 'application'); stage.setAttribute('aria-label', 'The Nexus plaza: walk with WASD, the arrow keys or the move stick');
        act = document.createElement('button'); act.type = 'button'; act.id = 'rw-nx-act'; act.className = 'hidden'; act.tabIndex = -1; act.addEventListener('click', () => nxAct());
      }
      const L = NX.layout(); const lists = document.createElement('div'); lists.className = 'nx-lists';
      const rowP = document.createElement('div'); rowP.className = 'nx-row'; const rowPl = document.createElement('b'); rowPl.textContent = 'Portals'; rowP.appendChild(rowPl);
      const rowN = document.createElement('div'); rowN.className = 'nx-row'; const rowNl = document.createElement('b'); rowNl.textContent = 'Talk to'; rowN.appendChild(rowNl);
      const spot = (x, y, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'nx-spot'; b.tabIndex = -1; b.setAttribute('aria-hidden', 'true'); b.style.left = (x / cv.width * 100) + '%'; b.style.top = (y / cv.height * 100) + '%'; b.addEventListener('click', fn); stage.appendChild(b); };
      if (!NX_WALK) L.portals.forEach((q) => {
        const b = document.createElement('button'); b.type = 'button'; b.dataset.portal = q.id; b.textContent = q.id === 'realm' ? 'Back to the Realm portal' : q.id === 'vault' ? 'Lantern vault: your stash' : q.label + ' portal'; b.setAttribute('aria-label', q.id === 'vault' ? 'Lantern vault portal: open the Lantern stash' : q.id === 'realm' ? 'Realm portal: go back to the Realm' : 'Enter the ' + q.label + ' dungeon');
        { const m = nxMutOf(q); if (m) { b.title = 'Mutator: ' + m.text; b.dataset.mut = m.ids.join(','); b.setAttribute('aria-label', b.getAttribute('aria-label') + ', mutator ' + m.label); } } // DV1: the dungeon's seeded mutator (same seed as nxUrl)
        b.addEventListener('click', () => nxPortal(q)); rowP.appendChild(b); spot(q.x, q.y, () => nxPortal(q));
      });
      if (!NX_WALK && RUSH_ON && L.trial) { const q = L.trial; const b = document.createElement('button'); b.type = 'button'; b.dataset.trial = '1'; b.id = 'rw-nx-trial'; b.textContent = 'Trial of Six'; b.setAttribute('aria-label', 'Trial of Six: six godland bosses, leave after any fight (level ' + MMEndgame.RUSH.minLevel + '+)'); b.addEventListener('click', () => rushStart()); rowP.appendChild(b); spot(q.x, q.y, () => rushStart()); }
      if (!NX_WALK) L.npcs.forEach((n) => {
        const b = document.createElement('button'); b.type = 'button'; b.dataset.npc = n.id; b.textContent = NPC_NAME[n.npc] || n.id; b.setAttribute('aria-label', 'Talk to ' + (NPC_NAME[n.npc] || n.id));
        b.addEventListener('click', () => nxTalk(n)); rowN.appendChild(b); spot(n.x, n.y - 10, () => nxTalk(n));
      });
      lists.appendChild(rowP); lists.appendChild(rowN);
      const talk = document.createElement('div'); talk.className = 'nx-talk'; talk.setAttribute('role', 'status'); talk.textContent = nxHint();
      const board = document.createElement('div'); board.className = 'nx-board hidden'; board.id = 'rw-nx-board';
      const stall = document.createElement('div'); stall.className = 'nx-board nx-stall hidden'; stall.id = 'rw-nx-stall'; stall.setAttribute('role', 'region'); stall.setAttribute('aria-label', 'Vendor stall');
      root.appendChild(head); root.appendChild(stage); if (act) root.appendChild(act); root.appendChild(talk); root.appendChild(board); if (nxStallOn()) root.appendChild(stall); if (notebook) root.appendChild(notebook); /* after the quest board: '#rw-nexus .nx-board' still finds the board first */ if (!NX_WALK) root.appendChild(lists); ov.appendChild(root);
      back.addEventListener('click', () => nexusClose());
      nxDom = { root, cv, plaza, act, stage, talk, board, stall, back, nbBtn, notebook, last: null };
      nbSyncBtn();
      return nxDom;
    }
    function nbSyncBtn() {
      if (!nxDom || !nxDom.nbBtn) return;
      const n = NB.count(nbSave || nbLoad());
      nxDom.nbBtn.textContent = 'Notebook (' + n + ')';
      nxDom.nbBtn.setAttribute('aria-label', 'Hero notebook: ' + n + (n === 1 ? ' page' : ' pages') + (nbNew ? ', ' + nbNew + ' new this visit' : ''));
    }
    function nbShow() {
      if (!NB || !nxOpen || !nxDom || !nxDom.notebook) return false;
      nxDom.board.classList.add('hidden'); nxStallHide();
      const el = nxDom.notebook; el.textContent = ''; nbLoad();
      const hd = document.createElement('div'); hd.className = 'nx-nb-head';
      const h3 = document.createElement('h3'); h3.id = 'rw-nx-nb-title'; h3.textContent = 'Hero notebook'; hd.appendChild(h3);
      const close = document.createElement('button'); close.type = 'button'; close.id = 'rw-nx-nb-close'; close.textContent = 'Close'; close.setAttribute('aria-label', 'Close the notebook'); close.addEventListener('click', () => nbHide(true)); hd.appendChild(close);
      el.appendChild(hd); el.setAttribute('aria-labelledby', 'rw-nx-nb-title');
      const note = document.createElement('p'); note.className = 'nx-nb-note'; note.textContent = NB.count(nbSave) + ' pages. A page fills in the first time you beat, clear or tame something. Knowledge only: pages never change your stats.'; el.appendChild(note);
      NB.sections(nbSave).forEach((sec) => {
        const c = document.createElement('h4'); c.className = 'nx-nb-cat'; c.textContent = sec.title + ' (' + sec.pages.length + ')'; el.appendChild(c);
        if (!sec.pages.length) { const p = document.createElement('p'); p.className = 'nx-nb-empty'; p.textContent = sec.id === 'kill' ? 'Beat a creature to start this page.' : sec.id === 'boss' ? 'Beat a world boss at its altar.' : sec.id === 'clear' ? 'Beat a dungeon boss.' : 'Tame a creature on the Isles.'; el.appendChild(p); return; }
        const ul = document.createElement('ul'); ul.className = 'nx-nb-list'; ul.dataset.cat = sec.id;
        sec.pages.forEach((pg) => {
          const li = document.createElement('li'); li.dataset.page = pg.id;
          const b = document.createElement('b'); b.textContent = pg.title; li.appendChild(b);
          if (pg.where) { const w = document.createElement('em'); w.textContent = pg.where; li.appendChild(w); }
          if (pg.hint) { const t = document.createElement('span'); t.textContent = pg.hint; li.appendChild(t); }
          ul.appendChild(li);
        });
        el.appendChild(ul);
      });
      el.classList.remove('hidden'); nxDom.nbBtn.setAttribute('aria-expanded', 'true');
      close.focus({ preventScroll: true }); el.scrollIntoView({ block: 'nearest' });
      return true;
    }
    function nbHide(refocus) {
      if (!nxDom || !nxDom.notebook || nxDom.notebook.classList.contains('hidden')) return false;
      nxDom.notebook.classList.add('hidden'); nxDom.notebook.textContent = ''; nxDom.nbBtn.setAttribute('aria-expanded', 'false');
      if (refocus) nxDom.nbBtn.focus({ preventScroll: true });
      return true;
    }
    function nxTouch() { return document.body.classList.contains('touch-device'); }
    function nxHint() {
      if (!NX_WALK) return 'Pick a portal, or say hello to someone.';
      return nxTouch() ? 'Walk with the move stick. Walk up to a portal or a person, then tap the button.' : 'Walk with WASD or the arrow keys. Walk up to a portal or a person and press E.';
    }
    function nxFree(x, y) { // inside the plaza walls, off solid props, not inside an NPC
      if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
      for (let k = 0; k < 4; k++) if (!NX.walkable(Math.floor((x + (k & 1 ? NX_R : -NX_R)) / TILE), Math.floor((y + (k & 2 ? NX_R : -NX_R)) / TILE))) return false;
      const ns = NX.layout().npcs; for (let i = 0; i < ns.length; i++) if (Math.hypot(ns[i].x - x, ns[i].y - y) < 22) return false;
      return true;
    }
    function nxLabel(it) {
      if (!it) return '';
      if (it.kind === 'trial') return rushLevel() >= MMEndgame.RUSH.minLevel ? 'Enter the Trial of Six' : 'Trial of Six: opens at level ' + MMEndgame.RUSH.minLevel;
      if (it.kind === 'npc') { const nm = NPC_NAME[it.ref.npc] || it.ref.id; return it.ref.role === 'quests' ? 'Quest board: ' + nm : 'Talk to ' + nm; }
      const q = it.ref; return q.id === 'realm' ? 'Back to the Realm' : q.id === 'vault' ? 'Lantern vault: open your stash' : 'Enter the ' + q.label + ' dungeon';
    }
    function nxNearest() {
      const L = NX.layout(); const h = nxHero; let best = null; let bd = Infinity;
      L.portals.forEach((q) => { const d = Math.hypot(q.x - h.x, q.y - h.y); if (d < 52 && d < bd) { bd = d; best = { kind: 'portal', ref: q }; } });
      L.npcs.forEach((n) => { const d = Math.hypot(n.x - h.x, n.y - h.y); if (d < 60 && d < bd) { bd = d; best = { kind: 'npc', ref: n }; } });
      if (RUSH_ON && L.trial) { const d = Math.hypot(L.trial.x - h.x, L.trial.y - h.y); if (d < 52 && d < bd) { bd = d; best = { kind: 'trial', ref: L.trial }; } }
      return best;
    }
    function nxAct() {
      const it = nxNearI; if (!nxOpen || !it) return null;
      if (it.kind === 'npc') { nxTalk(it.ref); return 'talk'; }
      if (it.kind === 'trial') return rushStart();
      return nxPortal(it.ref);
    }
    function nxSyncPrompt() {
      const it = nxNearest(); const same = it && nxNearI && it.kind === nxNearI.kind && it.ref === nxNearI.ref;
      if (same || (!it && !nxNearI)) return;
      nxNearI = it; const b = nxDom.act; if (!b) return;
      if (!it) { b.classList.add('hidden'); b.tabIndex = -1; return; }
      const t = nxLabel(it); b.textContent = t + (nxTouch() ? '' : ' (E)'); b.setAttribute('aria-label', t); b.tabIndex = 0; b.classList.remove('hidden');
    }
    function nxWalkStep(dt, mxIn, myIn) { // one movement step with the arena's input (or injected mx / my), clamped to the plaza and its props
      const h = nxHero; let mx = mxIn; let my = myIn;
      if (!Number.isFinite(mx) || !Number.isFinite(my)) {
        const k = arena.keys || {}; const mv = arena.moveVec || { x: 0, y: 0 }; mx = mv.x || 0; my = mv.y || 0;
        if (k.a || k.arrowleft) mx -= 1;
        if (k.d || k.arrowright) mx += 1;
        if (k.w || k.arrowup) my -= 1;
        if (k.s || k.arrowdown) my += 1;
      }
      const len = Math.hypot(mx, my); h.moving = len > 0.05;
      if (len > 1) { mx /= len; my /= len; }
      if (h.moving) {
        h.mx = mx; h.my = my;
        const sp = arena.stats && Number.isFinite(arena.stats.speed) && arena.stats.speed > 0 ? Math.min(arena.stats.speed, 600) : 220; const st = sp * Math.min(Math.max(dt, 0), 0.05);
        const c = NX.clampPoint(h.x + mx * st, h.y + my * st);
        if (nxFree(c.x, h.y)) h.x = c.x;
        if (nxFree(h.x, c.y)) h.y = c.y;
      }
      nxSyncPrompt();
    }
    // R4-D2 (b04-14): the Nexus hero fallback in the established style: 16x24 native at 2x, dark colour-matched outline, 3-tone cloak,
    // top-left light, facing the move direction (side view mirrored for left, back view when walking up). No face dots on the back.
    const nxHeroStat = { code: 0 };
    function nxCodeHero(g, h) {
      const P = 2, up = h.my < -0.3 && Math.abs(h.my) >= Math.abs(h.mx), side = Math.abs(h.mx) > Math.abs(h.my), flip = side && h.mx < 0;
      const step = h.moving ? (Math.floor(performance.now() / 140) & 1) : 0;
      const ox = Math.round(h.x) - 8 * P, oy = Math.round(h.y) - 18 * P;
      const px = (x, y, w, hh, c) => { g.fillStyle = c; g.fillRect(ox + (flip ? 16 - x - w : x) * P, oy + y * P, w * P, hh * P); };
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(h.x, h.y + 12, 12, 5, 0, 0, Math.PI * 2); g.fill();
      const OUT = '#1b1430', C1 = '#3d5aa8', C2 = '#5274c4', C3 = '#7a9be0', SKIN = '#f0c9a0', SKIN2 = '#c99a78', BOOT = '#4a3020';
      px(4, 1, 8, 8, OUT); px(3, 8, 10, 11, OUT); px(4, 18, 3, 5, OUT); px(9, 18, 3, 5, OUT); // outline silhouette
      px(5, 2, 6, 6, C1); px(5, 2, 5, 1, C3); px(5, 2, 1, 5, C2); // hood: dark / mid / light from the top-left
      if (!up) { px(side ? 8 : 6, 4, side ? 3 : 4, 3, SKIN); px(side ? 8 : 6, 6, side ? 3 : 4, 1, SKIN2); px(side ? 10 : 7, 5, 1, 1, OUT); if (!side) px(8, 5, 1, 1, OUT); }
      px(4, 9, 8, 9, C1); px(4, 9, 7, 1, C3); px(4, 9, 1, 8, C2); px(5, 13, 6, 1, '#c9a24a'); // cloak + belt
      px(5, 18, 2, 4 - step, BOOT); px(9, 18, 2, 3 + step, BOOT); // boots (walk alternates)
      nxHeroStat.code++;
    }
    function nxLifeDraw(g) {
      const t0 = performance.now(); const red = !!arena._reduced; const t = red ? 0 : t0 / 1000; const st = nxLifeStat;
      if (!nxGlow) { // one warm radial glow, built once
        nxGlow = document.createElement('canvas'); nxGlow.width = nxGlow.height = 96; const c = nxGlow.getContext('2d');
        const gr = c.createRadialGradient(48, 48, 2, 48, 48, 48); gr.addColorStop(0, 'rgba(255,190,90,0.55)'); gr.addColorStop(0.5, 'rgba(255,140,50,0.18)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
        c.fillStyle = gr; c.fillRect(0, 0, 96, 96);
      }
      let nt = 0, nb = 0, nn = 0;
      for (let i = 0; i < nxLife.length; i++) {
        const it = nxLife[i];
        if (it.kind === 'torch') {
          const fr = it.p.frames || [it.p.art]; const k = red ? 0 : Math.floor((t + it.ph) * 8) % fr.length; const a = wArt[fr[k]] || it.a;
          drawArt(g, a, 0, it.x, it.y); st.lastTorchF = k; nt++;
          const fl = red ? 0.8 : 0.72 + 0.12 * Math.sin(t * 9.1 + it.ph * 6) + 0.08 * Math.sin(t * 23.7 + it.ph * 11);
          const ga = g.globalAlpha, op = g.globalCompositeOperation; g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.max(0, Math.min(1, fl));
          g.drawImage(nxGlow, Math.round(it.x - a.ax + a.fw / 2 - 48), Math.round(it.y - a.ay + a.fh * 0.34 - 48)); g.globalAlpha = ga; g.globalCompositeOperation = op;
        } else if (it.kind === 'banner') {
          const a = it.a; const ox = Math.round(it.x - a.ax), oy = Math.round(it.y - a.ay); const c0 = Math.round(a.fh * 0.25), c1 = Math.round(a.fh * 0.66); // cloth rows (b13: 16..42 of 64)
          const sw = red ? 0 : Math.sin(t * 2.2 + it.ph * 6.28);
          g.drawImage(a.img, 0, 0, a.fw, c0, ox, oy, a.fw, c0); g.drawImage(a.img, 0, c1, a.fw, a.fh - c1, ox, oy + c1, a.fw, a.fh - c1);
          let last = 0;
          for (let r = c0; r < c1; r += 2) { const h = Math.min(2, c1 - r); last = Math.round(2 * sw * (r - c0) / (c1 - c0)); g.drawImage(a.img, 0, r, a.fw, h, ox + last, oy + r, a.fw, h); }
          st.lastSway = last; nb++;
        } else {
          const im = it.im; const b = red ? 0 : (Math.floor((t + it.ph * 2) / 0.9) & 1);
          g.drawImage(im, 0, 0, im.naturalHeight, im.naturalHeight, it.x - 40, it.y - 60 - b, 80, 80); st.lastBob = b; nn++;
        }
      }
      st.torches = nt; st.banners = nb; st.npcs = nn; st.frames++; st.ms += performance.now() - t0;
    }
    function nxWalkDraw() {
      const c = nxDom.cv; const g = c.getContext('2d'); const h = nxHero; const L = NX.layout(); g.imageSmoothingEnabled = false;
      const cl = (v, lo, hi) => (hi < lo ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v))); // W-04 (b04-05): the view stays on the floor (ring excluded); a plaza smaller than the view is centred
      nxCam.x = Math.round(cl(h.x - NX_VW / 2, TILE, (L.w - 1) * TILE - NX_VW)); nxCam.y = Math.round(cl(h.y - NX_VH / 2, TILE, (L.h - 1) * TILE - NX_VH));
      g.drawImage(nxDom.plaza, nxCam.x, nxCam.y, NX_VW, NX_VH, 0, 0, NX_VW, NX_VH);
      g.save(); g.translate(-nxCam.x, -nxCam.y);
      if (NX_LIFE && nxLife.length) nxLifeDraw(g);
      if (nxNearI) { const r = nxNearI.ref; g.strokeStyle = '#ffe27a'; g.lineWidth = 3; g.beginPath(); g.arc(r.x, r.y, nxNearI.kind === 'npc' ? 30 : 36, 0, Math.PI * 2); g.stroke(); }
      let ok = false;
      if (arena._heroArt && typeof arena._drawHero === 'function') { // the arena's own hero sprite (walk / idle, facing the move direction)
        const m0 = arena._mx; const m1 = arena._my; arena._mx = h.mx; arena._my = h.my;
        try { ok = !!arena._drawHero(g, h); } catch (e) { ok = false; }
        arena._mx = m0; arena._my = m1;
      }
      if (!ok) nxCodeHero(g, h); // R4-D2 (b04-14): a code-drawn pixel adventurer, not the yellow dot (hero art missing / no hero yet)
      g.restore();
    }
    function nxWalkFrame(now) {
      nxRaf = 0; if (!nxOpen || !NX_WALK) return;
      const dt = Math.min(0.05, Math.max(0, (now - nxLast) / 1000)); nxLast = now;
      nxWalkStep(dt); nxWalkDraw();
      nxRaf = requestAnimationFrame(nxWalkFrame);
    }
    function nxWalkStart() {
      const sp = NX.layout().spawn; nxHero.x = sp.x; nxHero.y = sp.y; nxHero.mx = 0; nxHero.my = 1; nxHero.moving = false; nxNearI = null;
      if (nxDom.act) { nxDom.act.classList.add('hidden'); nxDom.act.tabIndex = -1; }
      document.body.classList.add('nx-walking'); nxSyncPrompt(); nxWalkDraw();
      nxDom.stage.focus({ preventScroll: true });
      nxLast = performance.now(); if (!nxRaf) nxRaf = requestAnimationFrame(nxWalkFrame);
    }
    function nxWalkStop() {
      if (nxRaf) cancelAnimationFrame(nxRaf);
      nxRaf = 0; nxNearI = null;
      document.body.classList.remove('nx-walking');
    }
    // G-23 (b03-01): the Nexus never opens (and so never pauses the arena) mid Trial of Six or while a world boss is awake within its leash
    // (bossLive is cleared when you walk 40 tiles away). Used by Enter, the button and the prompt.
    function nexusAllowed() {
      if (rush.on && (rush.phase === 'fight' || rush.phase === 'rest')) return false;
      for (let i = 0; i < bossLive.length; i++) if (bossLive[i] && bossLive[i].active) return false;
      return true;
    }
    function nexusOpen() {
      if (!NX_ON || !nxSite || nxOpen || leaving || !arena.active || arena.state !== 'play' || arena.paused || !nexusAllowed()) return false;
      nxBuild(); nxEnterTile = { x: Math.floor(arena.player.x / TILE), y: Math.floor(arena.player.y / TILE) };
      nxOpen = true; arena.paused = true; savePos(true);
      nxBtn.classList.add('hidden'); portalBtn.classList.add('hidden'); siteBtn.classList.add('hidden'); if (typeof lairBtn !== 'undefined') { lairBtn.classList.add('hidden'); lairTxt = ''; }
      nxDom.root.classList.remove('hidden'); nxDom.board.classList.add('hidden'); nxStallHide(); nbHide(false); nbSyncBtn();
      NX.layout().npcs.forEach((n) => nxLoadPortrait(n.npc, nxDrawPlaza)); nxDrawPlaza();
      nxDom.talk.textContent = nxHint();
      if (NX_WALK) nxWalkStart(); else nxDom.back.focus({ preventScroll: true });
      // Cycle 6 L: the open Nexus owns the shared Back entry: Back returns to the Realm (like its own button), the page stays.
      try { if (window.MMNav && MMNav.backLayer) MMNav.backLayer('rw-nexus', () => { nbHide(true); nexusClose(); }); } catch (e) { /* history unavailable */ }
      return true;
    }
    function nexusClose() {
      if (!nxOpen) return false;
      try { if (window.MMNav && MMNav.backRelease) MMNav.backRelease('rw-nexus'); } catch (e) { /* ignore */ }
      nxOpen = false; nxWalkStop(); nxDom.root.classList.add('hidden'); arena.paused = false; arena.player.iframes = Math.max(arena.player.iframes, 1.5);
      nxNear = true; return true; // the prompt shows again next tick if the player is still beside the portal
    }
    window.addEventListener('keydown', (ev) => {
      if (nxOpen && ev.key === 'Escape') { // G-12: Esc closes the quest board / stall first, the Nexus on the next press
        ev.preventDefault(); ev.stopImmediatePropagation();
        if (nbHide(true)) return; // ID-04: the notebook closes first
        if (nxDom && !nxDom.board.classList.contains('hidden')) { nxDom.board.classList.add('hidden'); return; }
        if (nxDom && nxDom.stall && !nxDom.stall.classList.contains('hidden')) { nxStallHide(); return; }
        nexusClose(); return;
      }
      if (nxOpen && NX_WALK) { // walking: E / Enter / Space use the nearby portal or NPC; fire, ability and panel keys do nothing in the plaza
        const k = String(ev.key || '').toLowerCase(); const onBtn = !!(ev.target && ev.target.closest && ev.target.closest('button'));
        if ((k === 'e' || k === 'shift' || ((k === 'enter' || k === ' ') && !onBtn)) && nxNearI && !ev.repeat) { ev.preventDefault(); ev.stopImmediatePropagation(); nxAct(); return; }
        if (/^(e|q|r|f|b|i|k|v|p|shift)$/.test(k) || (k === ' ' && !onBtn)) { ev.preventDefault(); ev.stopImmediatePropagation(); return; }
      }
      if (ev.key === 'Enter' && !nxOpen && nxNear && promptFor < 0 && !siteFor && arena.active && !arena.paused && arena.state === 'play' && nexusAllowed()) { ev.preventDefault(); nexusOpen(); } // G-23: blocked = Enter stays a fire key
    }, true);
    nxBtn.addEventListener('click', () => nexusOpen());
    function nexusTick() {
      if (!NX_ON || !nxSite || nxOpen) return;
      const p = arena.player; const near = arena.state === 'play' && !arena.paused && (p.x - nxSite.x) ** 2 + (p.y - nxSite.y) ** 2 < 48 * 48;
      nxNear = near;
      const show = near && promptFor < 0 && !siteFor;
      const ok = nexusAllowed(); // G-23: while a fight is on the prompt says so and the button is disabled
      if (show) { const t = ok ? 'Visit the Nexus' + (isCoarse() ? '' : ' (Enter)') : 'Finish the fight first'; if (nxBtn.textContent !== t) nxBtn.textContent = t; if (nxBtn.disabled !== !ok) nxBtn.disabled = !ok; }
      nxBtn.classList.toggle('hidden', !show);
    }
    function drawNexusPortal(g, tt, reduced) {
      const a = wArt.portal_nexus; const q = nxSite;
      if (a) { drawArt(g, a, frameOf(a, tt, reduced), q.x, q.y + 23); artDraws.portal++; }
      else drawPortalCode(g, { x: q.x, y: q.y, col: '#ffd45a' }, tt, reduced);
      g.font = 'bold 12px ui-monospace, Menlo, Consolas, monospace'; /* cyc11 art: mono like the portal labels */ g.textAlign = 'center'; g.fillStyle = '#000'; g.fillText('Nexus', q.x + 1, q.y - 37); g.fillStyle = '#ffd45a'; g.fillText('Nexus', q.x, q.y - 38);
    }

    // ---------- boss keys and the boss portal (NEXT-SLICES BK2, MMPortals N3 rules) ----------
    // World bosses and won world events drop a `key_boss` (b22) on the ground: walk over it (the pickup magnet pulls it in) and it is saved under the
    // additive `bossKeys` count. Holding a key beside the Nexus portal or a boss altar shows "Use boss key": MMPortals.openBoss opens a `portal_boss`
    // (b14) next to that spot for 120 s (Realm only: the Nexus overlay and dungeons never open one), with a minimap ping and the `portal` cue.
    // The open portal is saved under `bossPortal` (event clock, ms; MMPortals.clean), so a reload keeps the time it has left. Entering it opens a
    // dungeon through the usual portal URL flow plus `&lair=1` (read by a later dungeon slice, ignored until then) and returns to the portal tile.
    // ?keys=0: no key drops, no prompt, no portal.
    const PT = window.MMPortals || null;
    const KEYS_ON = !!PT && !/[?&]keys=0(&|$)/.test(qs0);
    const KEY_MAX = 9; const KEY_USE_R = 6 * TILE; const LAIR_R = 40; const KEY_GROUND = 4;
    const LAIR_BIOME = ['warren', 'bramble', 'meadow', 'crypt']; // zone 0..3 -> the dungeon biome of a lair opened there
    const keyDrops = []; let keyGot = 0; let lairNear = false; let keyNear = null; let lairTxt = ''; let lastLair = null; let lairT = 0;
    const lairBtn = document.createElement('button'); lairBtn.id = 'rw-lair'; lairBtn.type = 'button'; lairBtn.className = 'hidden'; ov.appendChild(lairBtn);
    const lairCss = document.createElement('style');
    lairCss.textContent = '#rw-lair{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(170px + env(safe-area-inset-bottom,0px));z-index:3;min-height:48px;min-width:44px;max-width:92vw;padding:0 18px;border-radius:24px;border:2px solid #ffd45a;background:#7a1f4a;color:#fff;font:700 15px var(--px-font,monospace);white-space:nowrap;pointer-events:auto;touch-action:manipulation;box-shadow:0 0 12px rgba(255,95,162,.6)}#rw-lair.hidden{display:none}'
      // PLAYTEST-REVIEW-2 #14: on a phone the banner ("The Realm · island #N", zone toasts) stays below the zone line and the minimap (never clipped under them)
      + '@media (max-width:560px){body.world-mode #realm-banner{top:max(34%,calc(250px + env(safe-area-inset-top,0px)));max-width:calc(100vw - 32px);box-sizing:border-box}}';
    document.head.appendChild(lairCss);
    const keyNow = () => Math.floor(eventClock() * 1000);
    const keySec = () => Math.floor(eventClock()) * 1000; // whole seconds: the saved event clock (evT) is whole seconds, so a reload never lands before openedAt
    const keyCount = () => (KEYS_ON ? Math.max(0, Math.min(KEY_MAX, save.bossKeys | 0)) : 0);
    const lairPortal = () => (KEYS_ON ? PT.bossPortal(save.bossPortal, keyNow()) : null);
    let keySpr = null;
    function keySprite() { // 24x24 code key until the b22 art loads (or with ?art=0)
      if (keySpr) return keySpr;
      const c = mk(24, 24); const g = c.getContext('2d');
      g.fillStyle = '#5a3a08'; g.beginPath(); g.arc(7, 12, 6, 0, 7); g.fill(); g.fillRect(10, 10, 13, 5);
      g.fillStyle = '#ffd45a'; g.beginPath(); g.arc(7, 12, 4.5, 0, 7); g.fill(); g.fillRect(10, 11, 12, 3); g.fillRect(17, 14, 2, 4); g.fillRect(20, 14, 2, 3);
      g.fillStyle = '#5a3a08'; g.beginPath(); g.arc(7, 12, 1.8, 0, 7); g.fill();
      keySpr = c; return c;
    }
    function dropKey(x, y, src) { // a key on the ground (at most 4; it never expires while you are on the island)
      if (!KEYS_ON) return null;
      let px = x; let py = y; if (solidAt(px, py)) { px = arena.player.x; py = arena.player.y; }
      if (keyDrops.length >= KEY_GROUND) keyDrops.shift();
      const k = { x: px, y: py, src: String(src || ''), ph: keyDrops.length * 1.7 }; keyDrops.push(k); return { x: k.x, y: k.y, src: k.src };
    }
    function collectKey() {
      const p = arena.player; save.bossKeys = Math.min(KEY_MAX, keyCount() + 1); keyGot++; writeSave(save);
      arena._floatText(p.x, p.y - 30, '+1 boss key', '#ffd45a');
      say('Boss key! Use it beside the Nexus portal or a boss altar to open a boss portal for 2 minutes.');
      lairTxt = '-'; lairT = 0; // the prompt re-evaluates now
    }
    function keyAnchor() { // the Nexus portal or a boss altar within 6 tiles: where a key can be used
      const p = arena.player; let best = null; let bd = KEY_USE_R * KEY_USE_R;
      const test = (kind, x, y, i) => { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = { kind, x, y, i }; } };
      if (NX_ON && nxSite) test('nexus', nxSite.x, nxSite.y, -1);
      for (let i = 0; i < world.bossSites.length; i++) { const b = world.bossSites[i]; test('boss', (b.x + 0.5) * TILE, (b.y + 0.5) * TILE, i); }
      return best;
    }
    function useKey() { // -> the open portal descriptor, or null (no key, nothing near, one already open, not playing)
      if (!KEYS_ON || keyCount() < 1 || leaving || nxOpen || !arena.active || arena.state !== 'play' || arena.paused || lairPortal()) return null;
      const a = keyAnchor(); if (!a) return null;
      const p = arena.player; const ang = Math.atan2(p.y - a.y, p.x - a.x) || 0; // three tiles from the anchor, on the hero's side
      const f = nearestFree(Math.floor((a.x + Math.cos(ang) * 3 * TILE) / TILE), Math.floor((a.y + Math.sin(ang) * 3 * TILE) / TILE), 4) || { x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) };
      const r = PT.openBoss(save.bossPortal, PT.BOSS_KEY, { x: (f.x + 0.5) * TILE, y: (f.y + 0.5) * TILE }, keySec(), 'realm');
      if (!r.ok) return null;
      if (r.consume) save.bossKeys = keyCount() - 1;
      save.bossPortal = r.state; save.evT = Math.max(save.evT || 0, Math.floor(eventClock())); writeSave(save); miniKey = ''; lairTxt = '-'; lairT = 0;
      if (typeof arena._snd === 'function') arena._snd('portal');
      arena._showBanner('A boss portal opens! It stays for 2:00', 1.8);
      return r.portal;
    }
    function lairUrl(q) {
      const tx = Math.floor(q.x / TILE); const ty = Math.floor(q.y / TILE);
      const ret = 'index.html?mode=world&seed=' + seed + '&at=' + tx + ',' + ty + (opts.test ? '&test=1' : '');
      const z = Z.zoneInfoAt(world, tx, ty).zone; const biome = LAIR_BIOME[z >= 0 && z <= 3 ? z : 0];
      const url = 'index.html?mode=dungeon&seed=' + String(MMRng.hash(seed + ':lair:' + tx + ',' + ty) % 100000) + '&lv=2&biome=' + biome + '&lair=1&return=' + encodeURIComponent(ret) + (opts.test ? '&test=1' : '');
      return { tx, ty, biome, ret: RETURN_RE.test(ret) ? ret : null, url };
    }
    function enterLair() {
      if (!KEYS_ON || leaving || nxOpen || !arena.active) return null;
      const c = PT.canEnter('boss', save.bossPortal, 'realm', keyNow()); const q = lairPortal();
      if (!c.ok || !q) return null;
      const u = lairUrl(q); if (!u.ret) return null;
      leaving = true; lastLair = u;
      save.bossPortal = null; save.pos = { x: u.tx, y: u.ty }; save.returnTo = { x: u.tx, y: u.ty, seed }; save.stats.portals++; nxQuestEvent({ type: 'portal' });
      writeSave(save); arena.onSave(arena.save); settle('portal');
      api.lastLairUrl = u.url;
      arena.stop(); lairBtn.classList.add('hidden'); portalBtn.classList.add('hidden');
      if (opts.navigate !== false) location.href = u.url;
      return u.url;
    }
    function lairAct() { if (lairNear) return enterLair(); if (keyNear) return useKey(); return null; }
    lairBtn.addEventListener('click', lairAct);
    if (promptObs) promptObs.observe(lairBtn, { attributes: true, attributeFilter: ['class'] });
    function keyTick(dt) {
      if (!KEYS_ON) return;
      const p = arena.player; const play = arena.state === 'play' && !arena.paused && !nxOpen;
      if (play) for (let i = keyDrops.length - 1; i >= 0; i--) { // ground keys ride the pickup magnet
        const k = keyDrops[i]; let got = false;
        if (PK) { const m = PK.magnetStep(k, p, Math.min(dt, 0.1), MAGNET_R); k.x = m.x; k.y = m.y; got = m.collected; } else got = Math.hypot(p.x - k.x, p.y - k.y) < 20;
        if (got) { keyDrops.splice(i, 1); collectKey(); }
      }
      lairT -= dt; if (lairT > 0) return; lairT = 0.25;
      if (save.bossPortal && !lairPortal()) { save.bossPortal = null; writeSave(save); miniKey = ''; } // the 120 s ran out (PT.tick rule)
      const q = lairPortal();
      lairNear = !!(play && q && (p.x - q.x) ** 2 + (p.y - q.y) ** 2 < LAIR_R * LAIR_R);
      keyNear = play && !q && keyCount() > 0 ? keyAnchor() : null;
      const hint = isCoarse() ? '' : ' (Enter)';
      const txt = lairNear ? `Enter the boss lair (${fmtT(q.leftMs / 1000)} left)${hint}` : keyNear ? `Use boss key (${keyCount()})${hint}` : '';
      if (txt !== lairTxt) { lairTxt = txt; lairBtn.classList.toggle('hidden', !txt); if (txt) { lairBtn.textContent = txt; lairBtn.setAttribute('aria-label', txt.replace(' (Enter)', '')); } }
    }
    window.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && !ev.repeat && lairTxt && promptFor < 0 && !nxNear && !nxOpen && arena.active && !arena.paused && arena.state === 'play') { ev.preventDefault(); lairAct(); } });
    function drawLair(g, vx0, vy0, vx1, vy1, tt, reduced) {
      const q = lairPortal(); if (!q || q.x < vx0 || q.x > vx1 || q.y < vy0 || q.y > vy1) return;
      const a = wArt.portal_boss;
      if (a) { drawArt(g, a, frameOf(a, tt, reduced), q.x, q.y + 23); artDraws.portal++; } else drawPortalCode(g, { x: q.x, y: q.y, col: '#ff5fa2' }, tt, reduced);
      const label = `Boss lair · ${fmtT(q.leftMs / 1000)}`;
      g.font = 'bold 12px ui-monospace, Menlo, Consolas, monospace'; /* cyc11 art: mono like the portal labels */ g.textAlign = 'center'; g.fillStyle = '#000'; g.fillText(label, q.x + 1, q.y - 37); g.fillStyle = '#ff8ac0'; g.fillText(label, q.x, q.y - 38);
    }
    function drawKeys(g, cam) {
      if (!keyDrops.length) return;
      const tt = arena.clock; const reduced = arena._reduced; const a = wArt.key_boss;
      for (let i = 0; i < keyDrops.length; i++) {
        const k = keyDrops[i]; if (k.x < cam.x - 32 || k.x > cam.x + arena.W + 32 || k.y < cam.y - 32 || k.y > cam.y + arena.H + 32) continue;
        const bob = reduced ? 0 : Math.round(Math.sin(tt * 3 + k.ph) * 2);
        if (a) drawArt(g, a, 0, k.x, k.y + 14 + bob); else g.drawImage(keySprite(), Math.round(k.x - 12), Math.round(k.y - 12 + bob));
      }
    }
    const lairMiniKey = () => { const q = KEYS_ON && save.bossPortal ? save.bossPortal.boss : null; return q ? Math.floor(q.x / TILE) + ':' + Math.floor(q.y / TILE) : ''; };

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
      const bx = document.createElement('button'); bx.type = 'button'; bx.id = 'rw-nx-board-close'; bx.textContent = 'Close'; bx.setAttribute('aria-label', 'Close the quest board'); // G-12
      bx.style.cssText = 'float:right;min-height:44px;min-width:44px'; bx.addEventListener('click', () => { b.classList.add('hidden'); nxMoreSync(); }); b.insertBefore(bx, h);
      MMQuests.summary(save.quests, questDate()).forEach((q) => {
        const row = document.createElement('div'); row.className = 'nx-q'; row.dataset.quest = q.id;
        const t = document.createElement('span'); t.textContent = q.text + ' (' + q.p + '/' + q.need + ') '; const r = document.createElement('em'); r.textContent = '+' + q.reward.shards + ' 💎' + (QBAG_ON && q.reward.bag ? ' · ' + q.reward.bag + ' bag' : '') + (MMQuests.levelHint && MMQuests.levelHint(q) ? ' · ' + MMQuests.levelHint(q) : ''); t.appendChild(r);
        if (!q.claimed) { const bar = document.createElement('i'); bar.className = 'nx-bar'; bar.setAttribute('aria-hidden', 'true'); const fill = document.createElement('i'); fill.style.width = Math.round(100 * Math.min(1, q.p / Math.max(1, q.need))) + '%'; bar.appendChild(fill); t.appendChild(bar); } // PLAYTEST-REVIEW-2 #8: progress in the row
        row.appendChild(t);
        if (q.claimed) { const d = document.createElement('span'); d.textContent = 'Claimed'; d.style.flex = '0 0 auto'; row.appendChild(d); }
        else { const c = document.createElement('button'); c.type = 'button'; c.dataset.claim = q.id; c.textContent = 'Claim'; c.disabled = !q.done; c.setAttribute('aria-label', q.done ? 'Claim ' + q.text : q.text + ', not finished yet'); c.addEventListener('click', () => nxClaim(q.id)); row.appendChild(c); }
        b.appendChild(row);
      });
    }
    function nxBoardOpen() { nxBuild(); const had = nbHadFocus(); nbHide(false); nxBoardRender(); nxDom.board.classList.remove('hidden'); nxStallHide(); if (had) nxFocusFirst(nxDom.board); nxBoardReveal(); }
    // cyc5-ui (b04-r3-01): on a phone the board opened below the plaza (top 736 of 844: one row seen, Claim buttons off screen, and
    // #rw-nexus scrolled inside itself with no cue). Where the board is not the fixed side card (narrow / short screens) the Nexus now
    // scrolls the whole board into view as it opens, and a "More below" cue shows whenever a panel still runs past the bottom edge.
    const nxWide = () => { try { return window.matchMedia('(min-width:1000px) and (min-height:560px)').matches; } catch (e) { return false; } };
    function nxBoardReveal() {
      if (!nxDom || nxWide()) { nxMoreSync(); return; }
      const b = nxDom.board, r = b.getBoundingClientRect(), root = nxDom.root;
      if (r.bottom > innerHeight - 4 || r.top < 0) { const want = Math.min(r.top - 8, r.bottom - innerHeight + 8); root.scrollTop += r.height + 16 > innerHeight ? r.top - 8 : want; }
      nxMoreSync();
    }
    function nxMoreSync() {
      if (!nxDom) return; const root = nxDom.root;
      let cue = document.getElementById('rw-nx-more');
      if (!cue) {
        cue = document.createElement('div'); cue.id = 'rw-nx-more'; cue.setAttribute('aria-hidden', 'true'); cue.textContent = 'More below \u25BE swipe up'; cue.className = 'hidden';
        root.appendChild(cue); root.addEventListener('scroll', nxMoreSync, { passive: true }); window.addEventListener('resize', nxMoreSync);
      }
      let below = false;
      if (!root.classList.contains('hidden')) {
        [nxDom.board, nxDom.stall, nxDom.notebook].forEach((p) => { if (p && p.isConnected && !p.classList.contains('hidden')) { const r = p.getBoundingClientRect(); if (r.height && r.bottom > innerHeight + 4 && r.top < innerHeight) below = true; } });
        if (!below && root.scrollHeight - root.scrollTop - root.clientHeight > 24) { const last = Array.from(root.children).filter((e) => e !== cue && e.offsetParent && !e.classList.contains('hidden')).pop(); if (last && last.getBoundingClientRect().top > innerHeight - 4) below = true; }
      }
      cue.classList.toggle('hidden', !below);
    }
    function nxClaim(id) {
      const out = MMQuests.claim(save.quests, id, questDate()); save.quests = out.state;
      if (out.reward) {
        arena.save.shards += out.reward.shards; arena.run.shards += out.reward.shards; arena.onSave(arena.save); arena._syncHud();
        const bagged = QBAG_ON && out.reward.bagItems && out.reward.bagItems.length > 0;
        if (bagged) { const qb = (save.questBags || []).filter((b) => !(b.q === id && b.d === questDate())); qb.push({ q: id, d: questDate() }); save.questBags = qb.slice(-3); }
        if (nxDom) nxSay('Quest Giver', 'Well earned. +' + out.reward.shards + ' shards.' + (bagged ? ' Your ' + out.reward.bag + ' bag waits by the Nexus portal.' : ''));
      }
      writeSave(save); qDirty = false; if (nxDom) nxBoardRender();
      return out.reward;
    }

    // ---------- quest reward bags (RB3, QB1 MMQuests.rewardBag): a claim queues the bag in the save (`questBags`), it drops as a real loot bag beside the
    // hero as soon as the Realm runs again (Back from the Nexus, or the next start after a reload) and leaves the queue when it drops: one bag per claim.
    // Gear goes through giveBag / arena.dropBag, so picking it up records it for the Lantern stash (arena.onItem). The realm backpack has no armour slot:
    // armour pieces become the charm / ring of the same feel (light -> Swift Charm, robe -> Scholar Ring, heavy -> Hearty Charm) at the bag's rarity;
    // a wpn_ style the build does not know becomes a Spark Wand. The bag's potions drop beside it as potion pickups.
    const QBAG_ON = !!(window.MMQuests && MMQuests.rewardBag);
    const ARMOR_AS = { light: 'swiftcharm', robe: 'scholarring', heavy: 'heartcharm' };
    const QBAG_TIER = { brown: 0, pink: 1, purple: 2 };
    let lastQuestBag = null;
    function questBagFor(qid, date) {
      const q = MMQuests.quests(date).find((x) => x.id === qid); if (!q) return null;
      const b = MMQuests.rewardBag(q.reward, date + ':' + q.id); if (!b) return null; // the same seed MMQuests.claim uses for bagItems
      const known = (id) => typeof RM_ITEM_BY_ID !== 'undefined' && !!RM_ITEM_BY_ID[id];
      const items = []; const potions = [];
      b.items.forEach((it) => {
        if (/^potion_/.test(it.id)) { for (let k = 0; k < Math.max(1, it.n | 0); k++) potions.push(it.id); return; }
        const am = /^armor_([a-z]+)_t\d$/.exec(it.id);
        const id = am ? ARMOR_AS[am[1]] || 'heartcharm' : known(it.id) ? it.id : 'sparkwand';
        items.push({ id, r: Math.max(0, Math.min(2, it.r | 0)), from: it.id });
      });
      return { quest: qid, date, tier: b.tier, tierIndex: QBAG_TIER[b.tier] || 0, items, potions, raw: b.items };
    }
    function deliverQuestBags() {
      if (!QBAG_ON || !save.questBags || !save.questBags.length || leaving || nxOpen || !arena.active || arena.state !== 'play' || arena.paused) return 0;
      const p = arena.player; const list = save.questBags; let n = 0;
      delete save.questBags;
      list.forEach((qb, j) => {
        const b = questBagFor(qb.q, qb.d); if (!b) return;
        const x = p.x + (j - (list.length - 1) / 2) * 36; const y = p.y - 34;
        const asPick = PICK_ON && !!PK; // ?pickups=0: the bag's potions are plain bag potions (a small heal each, the classic bag rule)
        const got = b.items.length || !asPick ? giveBag(x, y, { tier: b.tier, tierIndex: b.tierIndex, items: b.items, shards: 0, potions: asPick ? 0 : b.potions.length, lifetime: 180 }, { zone: 0, boss: false, quest: b.quest }) : null;
        if (asPick) b.potions.forEach((art, k) => { if (picks.length >= PICK_CAP) picks.shift(); picks.push({ type: 'potion', art, frames: null, value: 1, tier: 3, x: x + (k ? 14 : -14), y: y + 24, bornMs: arena.clock * 1000, lifeMs: PK ? PK.LIFETIME_MS[5] : 40000, ph: k * 2 }); pickTotal++; });
        lastQuestBag = { quest: b.quest, date: b.date, tier: b.tier, raw: b.raw, items: b.items.map((it) => ({ id: it.id, r: it.r, from: it.from })), potions: b.potions.slice(), dropped: got ? got.items.length : 0 };
        n++;
      });
      writeSave(save);
      if (n) arena._showBanner(n > 1 ? `${n} quest bags!` : `Quest bag (${lastQuestBag.tier})!`, 1.6);
      return n;
    }

    // G12 boss ground-slam: from phase 2 a non-shore world boss winds up a ring zone for MMSplash.SLAM.WIND (0.9 s, shown by tgFor + a drawn zone),
    // then hits whoever is still inside it. Needs the visible telegraph (solo world, not ?telegraph=0), so there is never an unwarned hit;
    // ?bosses=classic and ?bossslam=0 turn it off. One slam per boss at a time. Damage: MMSplash.slamDmg (capped, dmgMul carries MMDifficulty).
    const SLAM_ON = typeof MMSplash !== 'undefined' && !!MMSplash.slamStep && !bossesClassic && !/[?&]bossslam=0(&|$)/.test(typeof location !== 'undefined' ? location.search : '');
    let slamHits = 0; let slamWinds = 0;
    const slamEvery = (e) => (e.phase >= 3 ? 5.5 : 7.5);
    function slamTick(dt) {
      if (!SLAM_ON || arena.state !== 'play' || !arena._tgOn()) return;
      for (let i = 0; i < arena.enemies.length; i++) {
        const e = arena.enemies[i];
        if (!e.active || e.type !== 'boss' || !(e.bossTier >= 2)) continue; // tier 1 = the shore: never slams
        if (!(e.phase >= 2)) { e._sl = null; continue; }
        if (!e._sl) e._sl = MMSplash.slamNew(slamEvery(e));
        const r = MMSplash.slamStep(e._sl, dt, e.invuln <= 0, slamEvery(e));
        if (r === 1) slamWinds++;
        if (r !== 3) continue;
        const R = MMSplash.slamR(e.bossTier); const p = arena.player; const d = Math.hypot(p.x - e.x, p.y - e.y) - 12;
        arena._burst(e.x, e.y, '#ff4a4a', 14, 170); arena._snd('hit');
        const dmg = MMSplash.slamDmg(e.dmgMul || 1, Math.max(0, d), R);
        if (dmg > 0) { slamHits++; arena._hitPlayer(arena._guarded(dmg)); }
      }
    }
    function drawSlams(g) {
      if (!SLAM_ON || !arena._tgOn()) return;
      const look = typeof MMTelegraph !== 'undefined' ? MMTelegraph.forVolley('ring', 3, true, { reduced: !!arena._reduced, palette: arena.acc ? arena.acc.palette : 'normal' }) : null;
      for (let i = 0; i < arena.enemies.length; i++) {
        const e = arena.enemies[i];
        if (e.active && e._sl && e._sl.w > 0) MMSplash.drawSlam(g, e.x, e.y, MMSplash.slamR(e.bossTier), 1 - e._sl.w / MMSplash.SLAM.WIND, !!arena._reduced, look ? look.color : null);
      }
    }
    if (SLAM_ON && typeof arena._tgBoss === 'function' && !arena._slamWrapped) { // the arena clears a boss's telegraph each frame it has no volley coming: re-raise the slam ring after it
      arena._slamWrapped = true; const tgBoss0 = arena._tgBoss.bind(arena);
      arena._tgBoss = (e, hold, p) => { tgBoss0(e, hold, p); if (e._sl && e._sl.w > 0 && e.active) arena.tgFor(e, 'ring', e._sl.w); };
    }
    // ---------- cycle 10 S, ID-53: just-in-time hint (L + U review conditions, design/IDEAS.md "L review, cycle 9" / "U review of ID-53..55") ----------
    // ONE dismissible DOM line (role=status, aria-live polite, 12 px floor, a 44 px close button) after JH_SEC game seconds with no rewarding thing
    // (a kill, a pickup, XP, shards, a level, a new item). It names one verb that is NOT "move" (walk over the drops / ability 1 / the Menu) and only
    // after the hero has moved once this visit. Never while resting (the count restarts when the rest ends), in a dungeon, in the Trial of Six,
    // with a boss or a world event live, with a panel / the Nexus / the coach / a toast / a banner up. Max 3 per visit (memory only, no save key).
    // The check runs once a second (one subtraction per frame); it never moves: it sits above the sticks / ability grid / prompts, centred.
    const JH_ON = !/[?&]jithint=0(&|$)/.test(qs0); const JH_SEC = 20; const JH_MAX = 3; const JH_LIFE = 12;
    const jhEl = document.createElement('div'); jhEl.id = 'rw-jhint'; jhEl.className = 'hidden'; jhEl.setAttribute('role', 'status'); jhEl.setAttribute('aria-live', 'polite');
    const jhTxt = document.createElement('span'); jhTxt.className = 'rw-jhint-txt'; jhEl.appendChild(jhTxt);
    const jhX = document.createElement('button'); jhX.type = 'button'; jhX.className = 'rw-jhint-x'; jhX.setAttribute('aria-label', 'Dismiss hint'); jhX.textContent = '✕'; jhEl.appendChild(jhX);
    if (JH_ON) ov.appendChild(jhEl);
    const jh = { t: 0, sec: 0, sig: -1, shown: 0, on: false, life: 0, verb: '', used: {}, moved: false, abUsed: false, panelSeen: false, why: '', log: [] };
    function jhSig() { const sv = arena.save || {}; return (sv.kills | 0) + (sv.level | 0) * 1e6 + (sv.xp | 0) * 3 + (sv.shards | 0) * 7 + ((sv.items && sv.items.length) | 0) * 11 + pickTotal * 13; }
    function jhVisible(el) { return !!el && !el.classList.contains('hidden') && !el.hidden && el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none'; }
    function jhBlock() { // why the hint may not show right now ('' = it may)
      if (arena.state !== 'play' || arena.down || !arena.active) return 'state';
      if (arena.resting) return 'resting';
      if (arena.dungeon || arena.team) return 'dungeon';
      if (rush.on) return 'trial';
      if (bossRect()) return 'boss';
      let ev = false; evState.forEach((st) => { if (st.phase === 'active') ev = true; }); if (ev) return 'event';
      if (arena.panel || arena.paused || nxOpen || panelHid) return 'panel';
      if (feOpen) return 'card';
      if (arena._noticeT > 0) return 'toast';
      if (jhVisible(hintEl) || jhVisible(document.getElementById('realm-banner')) || jhVisible(document.getElementById('mm-coach')) || jhVisible(document.getElementById('mm-coach-toast'))) return 'toast';
      return '';
    }
    function jhPick() { // the one next verb, never "move", never one already shown this visit
      const coarse = isCoarse();
      if (!jh.used.bag && picks.length > 0) return { verb: 'bag', text: 'Walk over the drops on the ground to pick them up', short: 'Pick up the drops' };
      if (!jh.used.ab && !jh.abUsed) return { verb: 'ab', text: coarse ? 'Tap ability 1 to use your class skill' : 'Press Q (ability 1) to use your class skill', short: coarse ? 'Tap ability 1' : 'Press Q' };
      if (!jh.used.menu && !jh.panelSeen) return { verb: 'menu', text: coarse ? 'Open the Menu (☰) for your quests and bag' : 'Press Esc to open the Menu: quests and bag', short: coarse ? 'Open the Menu (☰)' : 'Press Esc: Menu' };
      // every verb shown once: repeat one the player has still not done (never the one just shown); the 3-per-visit cap is the limit
      const again = [!jh.abUsed && jh.verb !== 'ab' && 'ab', !jh.panelSeen && jh.verb !== 'menu' && 'menu'].filter(Boolean)[0];
      if (again) { jh.used[again] = 0; return jhPick(); }
      return null;
    }
    function jhPlace() { // above every bottom control (sticks + 40 px, ability grid, prompts), centred; layout read only when it shows
      try {
        const o = ov.getBoundingClientRect(); let top = o.bottom - 8;
        const bot = [['realm-abilities', 8], ['realm-stick-move', 40], ['realm-stick-aim', 40], ['realm-help', 6]];
        bot.forEach(([id, gap]) => { const e = document.getElementById(id); if (jhVisible(e)) { const r = e.getBoundingClientRect(); if (r.height > 0) top = Math.min(top, r.top - gap); } });
        [portalBtn, siteBtn, lairBtn, siteNote].forEach((e) => { if (jhVisible(e)) top = Math.min(top, e.getBoundingClientRect().top - 6); });
        jhEl.style.top = ''; jhEl.style.left = ''; jhEl.style.transform = ''; jhEl.style.maxWidth = '';
        jhEl.style.bottom = Math.max(4, Math.round(o.bottom - top)) + 'px';
      } catch (e) { /* the CSS position stays */ }
    }
    // 195x422 (cycle 10): the band above the ability grid is full (zone strip, goal line, minimap). Second slot: under the top HUD, left of the
    // minimap, short wording, wraps to 2 lines. Used only when the first slot touches something; the overlap check still decides.
    function jhPlaceAlt() {
      try {
        const o = ov.getBoundingClientRect(); let top = o.top + 4; let right = o.right - 8;
        ['realm-hud', 'realm-xp', 'realm-partner', 'realm-boss'].forEach((id) => { const e = document.getElementById(id); if (jhVisible(e)) top = Math.max(top, e.getBoundingClientRect().bottom + 4); });
        if (jhVisible(mini)) { const r = mini.getBoundingClientRect(); if (r.top < top + 60 && r.bottom > top) right = Math.min(right, r.left - 6); }
        jhEl.style.bottom = 'auto'; jhEl.style.transform = 'none'; jhEl.style.left = '8px'; jhEl.style.top = Math.round(top - o.top) + 'px';
        jhEl.style.maxWidth = Math.max(100, Math.round(right - o.left - 8)) + 'px';
      } catch (e) { /* the first slot stays */ }
    }
    function jhHits() { // the named HUD strips plus EVERY visible control (button / link / role=button, e.g. the Daily and gear buttons) except its own
      const hr = jhEl.getBoundingClientRect(); const ctl = Array.prototype.filter.call(document.querySelectorAll('button, a[href], [role="button"]'), (e) => !jhEl.contains(e));
      for (const e of [zoneEl, goalEl, mini, document.getElementById('realm-hud'), document.getElementById('realm-xp'), document.getElementById('realm-abilities'), document.getElementById('realm-stick-move'), document.getElementById('realm-stick-aim')].concat(ctl)) { if (!e || !e.getClientRects().length || getComputedStyle(e).visibility === 'hidden' || !jhVisible(e)) continue; const r = e.getBoundingClientRect(); if (r.left < hr.right && r.right > hr.left && r.top < hr.bottom && r.bottom > hr.top) return true; } return hr.left < -0.5 || hr.top < -0.5 || hr.right > innerWidth + 0.5 || hr.bottom > innerHeight + 0.5; }
    function jhHide(why) { if (!jh.on) return; jh.on = false; jh.why = why; jhEl.classList.add('hidden'); jh.log.push({ verb: jh.verb, why }); jh.t = 0; }
    function jhShow(p) {
      jh.on = true; jh.verb = p.verb; jh.used[p.verb] = 1; jh.shown++; jh.life = JH_LIFE; jh.why = '';
      const narrow = ov.getBoundingClientRect().width < 300;
      jhTxt.textContent = '💡 ' + (narrow && p.short ? p.short : p.text); jhEl.classList.remove('hidden'); jhPlace();
      // never over the goal / zone strip, the minimap, the ability grid or a stick: try the second slot, else it does not show (waits 20 s more)
      if (jhHits()) { jhPlaceAlt(); if (jhHits()) { jh.shown--; jh.used[p.verb] = 0; jhHide('overlap'); jh.log.pop(); } }
    }
    jhX.addEventListener('click', () => jhHide('close'));
    function jhTick(dt) {
      if (!JH_ON) return;
      const p = arena.player; if (p && p.moving) jh.moved = true;
      jh.sec -= dt; if (jh.sec > 0) return; jh.sec = 1;
      const d = 1; // one game second (the world tick only runs while the arena plays: a hidden tab adds nothing)
      if (arena.panel) jh.panelSeen = true;
      if (arena.abilityCd && arena.abilityCd.some((c) => c > 0)) jh.abUsed = true;
      const sig = jhSig(); const reward = sig !== jh.sig; jh.sig = sig;
      const block = jhBlock();
      if (jh.on) {
        jh.life -= d;
        if (reward) jhHide('reward'); else if (block) jhHide(block); else if (jh.life <= 0) jhHide('timeout');
        else if ((jh.verb === 'ab' && jh.abUsed) || (jh.verb === 'menu' && jh.panelSeen) || (jh.verb === 'bag' && !picks.length)) jhHide('done');
        return;
      }
      if (reward || block) { jh.t = 0; return; } // a resting hero, a fight, a panel...: the 20 s start again afterwards
      jh.t += d;
      if (jh.t < JH_SEC || jh.shown >= JH_MAX || !jh.moved) return;
      const pk = jhPick(); if (!pk) { jh.t = 0; return; }
      jhShow(pk);
    }
    // Esc closes the hint. With the Menu hint up ("Press Esc to open the Menu") the key also goes through, so the Menu opens as the text says
    // (L review, cycle 10); for the other verbs it is swallowed so dismissing a tip never opens the Menu by surprise.
    function onHintKey(ev) { if (ev.key !== 'Escape' || !jh.on) return; if (jh.verb === 'menu') { jhHide('esc-menu'); return; } ev.preventDefault(); ev.stopImmediatePropagation(); jhHide('esc'); }
    if (JH_ON && typeof window !== 'undefined') window.addEventListener('keydown', onHintKey, true);

    // ---------- cycle 10 S, ID-55: first-session ending card (L + U review conditions) ----------
    // The first-ever Realm session (this tab: the hero was Lv <= 3 at the first world load and realm.firstEndSeen is absent) that reaches FE_SEC
    // GAME seconds in the world (counted per tab in sessionStorage, so a dungeon trip keeps it; a hidden tab adds nothing), or that comes back
    // from its first dungeon clear, gets ONE card: Level / Tames / Shards (the save's own numbers, MMMiniKit.fmt) and one next goal (the Isles
    // while there is no tame, else the next zone inland), "Go: <goal>" and "Not now". MMMiniKit.panel builds it; focus on Not now; Esc and
    // Back close it; focus returns to the game. Shown only at a quiet moment (no enemy within 420 px, no boss / event / Trial / dungeon / panel /
    // Nexus); an enemy coming within 300 px closes it (the world does not pause). Shown once: realm.firstEndSeen = 1 (additive, Backup carries the
    // whole pixeltown-save-v1); a failed save never shows it again this visit (in-memory flag first).
    const FE_ON = !/[?&]firstend=0(&|$)/.test(qs0) && !!window.MMMiniKit && typeof MMMiniKit.panel === 'function';
    const FE_TEST = /[?&]test=1(&|$)/.test(qs0); const feQ = /[?&]fesec=(\d{1,4})(&|$)/.exec(qs0);
    const FE_SEC = FE_TEST && feQ ? Math.max(1, +feQ[1]) : 480; const FE_KEY = 'pixeltown-firstend-s'; const FE_QUIET = 420; const FE_NEAR = 300;
    let feOpen = false; let feDone = false; let feSec = 1; let feCard = null; let feBack = null; let feWhy = ''; let feGoal = null;
    function feDeep() { try { const o = JSON.parse(localStorage.getItem('pixeltown-deep-v1') || 'null'); const f = o && o.f && typeof o.f === 'object' ? o.f : {}; return Object.keys(f).filter((k) => Number.isInteger(f[k]) && f[k] > 0).length; } catch (e) { return 0; } }
    function feTames() { try { const o = JSON.parse(localStorage.getItem('pixeltown-tames-v1') || 'null'); return o && Array.isArray(o.roster) ? o.roster.length : 0; } catch (e) { return 0; } }
    const fe = (() => { // per-tab session: {ok, t (game seconds), d (dungeon clears at the start)}
      let s = null; try { s = JSON.parse(sessionStorage.getItem(FE_KEY) || 'null'); } catch (e) { s = null; }
      if (!s || typeof s !== 'object' || !(s.ok === 0 || s.ok === 1)) s = { ok: (arena.save && arena.save.firstEndSeen !== 1 && (arena.save.level | 0) <= 3) ? 1 : 0, t: 0, d: feDeep() };
      s.t = Math.max(0, Math.min(1e6, Number(s.t) || 0)); s.d = Math.max(0, Number(s.d) | 0);
      return s;
    })();
    function feStore() { try { sessionStorage.setItem(FE_KEY, JSON.stringify(fe)); } catch (e) { /* session storage blocked: the clock restarts on a reload */ } }
    if (FE_ON) { feStore(); if (typeof window !== 'undefined') window.addEventListener('pagehide', () => { if (fe.ok === 1) feStore(); }); }
    let feStoreN = 0;
    const feEl = document.createElement('section'); feEl.id = 'rw-firstend'; feEl.hidden = true; feEl.setAttribute('role', 'dialog'); feEl.setAttribute('aria-labelledby', 'rw-fe-head');
    if (FE_ON) ov.appendChild(feEl);
    function feQuietWhy() {
      if (arena.state !== 'play' || arena.down || !arena.active) return 'state';
      if (arena.dungeon || arena.team) return 'dungeon';
      if (rush.on) return 'trial';
      if (bossRect()) return 'boss';
      let ev = false; evState.forEach((st) => { if (st.phase === 'active') ev = true; }); if (ev) return 'event';
      if (arena.panel || arena.paused || nxOpen) return 'panel';
      const p = arena.player; const es = arena.enemies || [];
      for (let i = 0; i < es.length; i++) { const e = es[i]; if (e && e.active && Math.hypot(e.x - p.x, e.y - p.y) < FE_QUIET) return 'enemy'; }
      return '';
    }
    function feGoalNow() {
      if (feTames() === 0) return { kind: 'isles', label: 'the Isles', text: 'Next goal: tame your first creature on the Isles', url: '../isles/index.html' };
      const zs = (Z.TABLES && Z.TABLES.ZONES) || []; const zi = Z.zoneInfoAt(world, arena.player.x / TILE, arena.player.y / TILE); const z = zi && zi.zone >= 0 && zi.zone <= 3 ? zi.zone : 0;
      const nx = zs[z + 1]; const lv = arena.save.level | 0;
      if (!nx || !nx.name) return { kind: 'boss', label: 'a boss altar', text: 'Next goal: find a boss altar and defeat its guardian', url: '' };
      return { kind: 'zone', label: nx.name, text: lv >= (nx.recLv | 0) ? `Next goal: head inland to the ${nx.name}` : `Next goal: reach Lv ${nx.recLv}, then head inland to the ${nx.name}`, url: '' };
    }
    function feClose(why) {
      if (!feOpen) return; feOpen = false; feWhy = why; feEl.hidden = true;
      if (feBack) { try { feBack.stop(); } catch (e) { /* nav hook */ } feBack = null; }
      const cw = document.getElementById('realm-canvas-wrap'); if (cw) { try { cw.focus({ preventScroll: true }); } catch (e) { cw.focus(); } }
    }
    function feGo(opts) {
      const g = feGoal; feClose('go');
      if (!g) return null;
      if (g.url) { try { arena.onSave(arena.save); savePos(true); } catch (e) { /* best effort */ } api.lastFirstEndUrl = g.url; if (!(opts && opts.navigate === false)) location.href = g.url; return g.url; }
      try { arena._showBanner(g.text.replace(/^Next goal: /, ''), 2.5); } catch (e) { /* cosmetic */ }
      return null;
    }
    function feShow() {
      feDone = true; // in memory first: a failed save never shows it twice in this visit
      const sv = arena.save; const K = MMMiniKit; feGoal = feGoalNow();
      const vm = K.result({ headline: 'Nice first run!', stats: [{ label: 'Level', value: K.fmt(sv.level), id: 'rw-fe-lv' }, { label: 'Tames', value: K.fmt(feTames()), id: 'rw-fe-tames' }, { label: 'Shards', value: K.fmt(sv.shards), id: 'rw-fe-shards' }],
        goalText: feGoal.text, more: [{ id: 'rw-fe-later', label: 'Not now' }], ids: { again: 'rw-fe-go', goal: 'rw-fe-goal', head: 'rw-fe-head' } });
      feCard = K.panel(feEl, vm, { again: () => feGo(), more: [() => feClose('later')], keyReady: () => false, holdMs: 600 });
      if (!feCard) return; // not built: not marked seen (L review, cycle 10)
      try { sv.firstEndSeen = 1; arena.onSave(sv); } catch (e) { /* storage blocked: shown once this visit anyway */ }
      fe.ok = 0; feStore();
      feCard.again.textContent = 'Go: ' + feGoal.label;
      feEl.hidden = false; feOpen = true; feWhy = '';
      if (jh.on) jhHide('card');
      if (!feBack && window.MMNav && MMNav.backWatch) { try { feBack = MMNav.backWatch(feEl, () => feClose('back'), 'rw-firstend'); } catch (e) { feBack = null; } }
      const later = feCard.more[0]; try { later.focus({ preventScroll: true }); } catch (e) { later.focus(); }
    }
    function feTick(dt) {
      if (!FE_ON) return;
      if (feOpen) { // close it when the world gets dangerous again (the world never pauses for it)
        feSec -= dt; if (feSec > 0) return; feSec = 1;
        const p = arena.player; const es = arena.enemies || []; let near = false;
        for (let i = 0; i < es.length && !near; i++) { const e = es[i]; if (e && e.active && Math.hypot(e.x - p.x, e.y - p.y) < FE_NEAR) near = true; }
        if (near || bossRect() || rush.on || arena.state !== 'play') feClose('danger');
        return;
      }
      if (feDone || fe.ok !== 1) return;
      fe.t += Math.min(dt, 0.1); // game time only
      feSec -= dt; if (feSec > 0) return; feSec = 1;
      if (++feStoreN >= 5) { feStoreN = 0; feStore(); } // every 5 s (and on pagehide), not every second (L review, cycle 10)
      const due = fe.t >= FE_SEC || feDeep() > fe.d;
      if (!due) return;
      feWhy = feQuietWhy(); if (feWhy) return; // wait for the next quiet moment
      feShow();
    }
    function onFeKey(ev) { if (feOpen && ev.key === 'Escape') { ev.preventDefault(); ev.stopImmediatePropagation(); feClose('esc'); } }
    if (FE_ON && typeof window !== 'undefined') window.addEventListener('keydown', onFeKey, true);

    const hooks = {
      onStart() {
        exploreLive = false; exploreCells = 0; exploreT = 0;
        const back = !!pendingAt; // an arrival through ?at= (the return from a dungeon portal)
        if (pendingAt) { placeAt(pendingAt.x, pendingAt.y); pendingAt = null; } else placeAt(world.spawnPoint.x, world.spawnPoint.y);
        prevZ = null; slowUntil = 0; // a (re)start is not a border crossing
        arena.run.wave = 0; arena.biome = 0;
        resetZones();
        kills = 0; spawned = 0; despawned = 0; lastDrops.length = 0; picks.length = 0; lairTxt = '-'; lairT = 0;
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
        savePos(true); evTick(); syncHud(true); gearHintCheck();
        exploreLive = true; // from here on a newly revealed cell pays exploration XP
      },
      tick(dt) {
        slamTick(dt);
        if (zones) {
          const p = arena.player; const out = zones.update(p.x, p.y, Math.min(dt, 0.1), arena.clock);
          for (let k = 0; k < out.despawn.length; k++) { const id = out.despawn[k]; const e = live.get(id); if (e && e.active && e.zid === id) { e.active = false; e.zid = -1; despawned++; } live.delete(id); } // free pool slots first
          for (let k = 0; k < out.spawn.length; k++) if (rushOnNow() || !spawnZ(out.spawn[k])) zones.markDead(out.spawn[k].id, arena.clock); // pool full (or G-27: the Trial of Six is on): the spawner must not count it
          bossT -= dt; if (bossT <= 0) { bossT = 0.5; bossTick(); }
          sweepT -= dt; if (sweepT <= 0) { sweepT = 1; sweepLost(); }
        }
        restTick(); jhTick(dt); feTick(dt); portalTick(); pickTick(dt); nexusTick(); keyTick(dt); fbTick(dt); exploreTick(dt); quietTick(dt); rushTick(dt);
        if (save.questBags) deliverQuestBags();
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
          g.font = 'bold 12px ui-monospace, Menlo, Consolas, monospace'; /* cyc11 art: mono like the portal labels */ g.textAlign = 'center'; g.fillStyle = '#000'; g.fillText(BOSS_NAME[i], bx + 1, by - 29); g.fillStyle = '#ff8a8a'; g.fillText(BOSS_NAME[i], bx, by - 30);
        }
        if (nxSite && NX_ON && nxSite.x > vx0 && nxSite.x < vx1 && nxSite.y > vy0 && nxSite.y < vy1) drawNexusPortal(g, tt, reduced);
        const pad = wArt.spawn_pad; const padX = (world.spawnPoint.x + 0.5) * TILE; const padY = (world.spawnPoint.y + 0.5) * TILE;
        if (pad && padX > vx0 && padX < vx1 && padY > vy0 && padY < vy1) { drawArt(g, pad, frameOf(pad, tt, reduced), padX, padY + 16); artDraws.pad++; }
        if (SITES) drawSites(g, vx0, vy0, vx1, vy1, tt, reduced);
        if (KEYS_ON) drawLair(g, vx0, vy0, vx1, vy1, tt, reduced);
        evState.forEach((st) => { // event sites: a beacon (upcoming: gold, active: orange) above the ring of stones
          if (st.phase !== 'upcoming' && st.phase !== 'active') return;
          const c = siteXY(st); if (c.x < vx0 - 80 || c.x > vx1 + 80 || c.y < vy0 - 80 || c.y > vy1 + 80) return;
          const col = st.phase === 'active' ? '#ff8a2a' : '#ffe27a';
          g.globalAlpha = reduced ? 0.3 : 0.2 + 0.12 * Math.sin(tt * 2.5); g.fillStyle = col; g.beginPath(); g.arc(c.x, c.y, 70, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
          const ba = wArt.event_beacon;
          if (ba) { drawArt(g, ba, frameOf(ba, tt, reduced), c.x, c.y + 6); artDraws.beacon++; }
          else drawBeacon(g, c.x, c.y - 30 + (reduced ? 0 : Math.sin(tt * 2) * 4), 12, col, tt, reduced);
          const label = `${evTitle(st)} · ${st.phase === 'active' ? fmtT(st.ev.endsAt - eventClock()) + ' left' : 'in ' + fmtT(st.ev.startsAt - eventClock())}`;
          g.font = 'bold 12px ui-monospace, Menlo, Consolas, monospace'; /* cyc11 art: mono like the portal labels */ g.textAlign = 'center'; g.fillStyle = '#000'; g.fillText(label, c.x + 1, c.y - 51); g.fillStyle = col; g.fillText(label, c.x, c.y - 52);
        });
      },
      drawOver(g, cam) { drawPicks(g, cam); drawKeys(g, cam); drawSlams(g); if (RUSH_ON) rushLayerDraw(g); // a raid boss telegraphs its next burst: a red ring that closes in during the last second
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
    // ID-51 idle-hero rest (owner-approved): a solo hero on a Shore or Midlands tile (zone <= 1; Midlands added in cycle 9 from the
    // cyc8-design-inland-passive data: 6/6 idle Lv 1 heroes fell there within 30 s), outside the Trial of Six, may rest after
    // RM_IDLE_REST_S (5 s) with no input. Highlands and Godlands keep today's rules on purpose. ?idlerest=0 turns it off.
    const REST_ON = !/[?&]idlerest=0(&|$)/.test(qs0);
    const restOk = (p) => REST_ON && !rush.on && Z.zoneInfoAt(world, p.x / TILE, p.y / TILE).zone <= 1;
    arena.setWorld({ w: WW, h: WH, tile: TILE, camera: true, solidAt, shotSolidAt, moveScaleAt, restOk, onStart: hooks.onStart, tick: hooks.tick, drawUnder: hooks.drawUnder, drawOver: hooks.drawOver, pools: { enemies: 72, eBullets: 700 } });
    if (typeof window !== 'undefined') window.addEventListener('pagehide', () => { savePos(true); settle('leave'); });
    if (opts.assetRoot && opts.tileArt !== false) loadTileArt(opts.assetRoot);
    if (artOn) loadWorldArt(opts.assetRoot);

    const api = {
      seed, world, genMs, SAVE_KEY, TILE, CPX, MAX_CHUNKS,
      chunkCount: () => chunks.size, chunkBuilds: () => chunkBuilds, fieldStats: () => Object.assign({ on: FIELD_DETAIL }, fieldStat), treeFix: () => treeFixApi(), bakeChunk: (cx, cy) => buildChunk(cx, cy).cv, terrainName: (tx, ty) => TN[terrain[ty * ww + tx]] || '', hasTransition: (tx, ty) => !!transitionAt(tx, ty, drawT[ty * ww + tx]), drawName: (tx, ty) => TN[drawT[ty * ww + tx]] || '', smoothStats: () => Object.assign({}, smoothStat, { corners: cornerStat.filled, icorners: icornerStat.filled, icornerOn: icornerStat.on }), bakeStats: () => ({ edge: Object.assign({}, edgeStat), shade: Object.assign({}, shadeStat) }),  artTiles: () => artTiles, miniDraws: () => miniDraws, // W-03 hooks: bakeChunk / terrainName / hasTransition / bakeStats
      slam: { on: SLAM_ON, hits: () => slamHits, winds: () => slamWinds }, zone: () => lastZone, fireBudget: { on: FB_ON, capFor: ebCapFor, now: () => (arena.fireBudget ? Object.assign({}, arena.fireBudget) : null), live: () => arena._ebLive, capped: () => arena._ebCapped }, danger: () => ({ on: DANGER_ON, now: dangerNow, hidden: dangerEl.classList.contains('hidden'), el: dangerEl.isConnected }), zoneGrad: { on: ZGRAD, bands: world.bands || 'classic', recLv, last: () => lastCross, crossings: () => crossN, slowLeft: () => Math.max(0, slowUntil - arena.clock), moveScale: () => moveScaleAt(arena.player.x, arena.player.y) }, hudText: () => ({ zone: zName.textContent, coords: zCoords.textContent, arrow: arrowDeg }),
      tileAt: (x, y) => O.tileAt(world, Math.floor(x / TILE), Math.floor(y / TILE)), solidAt, shotSolidAt, nearestFree,
      tileCenter: (tx, ty) => ({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE }),
      save: () => readSave(), savePos, portals: () => portals.map((q) => ({ i: q.i, x: q.x, y: q.y, tx: q.tx, ty: q.ty, biome: q.biome })),
      syncHud, loadTileArt, loadWorldArt,
      artState: () => ({ on: artOn, loaded: Object.keys(wArt), draws: Object.assign({}, artDraws), loading: wArtLoading }), artSrc: (id) => (wArt[id] ? wArt[id].src : null), tileSrcRank: () => { const o = {}; const vr = tileRank.get(tileArt) || {}; Object.keys(vr).forEach((k) => { o[TN[k]] = vr[k]; }); return o; }, tileVariants: (name) => (tileArt[T[name]] || []).filter(Boolean).length, artProps: (cx, cy) => chunkProps(cx, cy).map((q) => ({ x: q.x, y: q.y, id: q.id, dim: q.dim, base: q.base || null })),
      b26: () => ({ on: B26_ON, ids: Object.keys(B26_SET), loaded: Object.keys(B26_SET).filter((id) => !!wArt[id]), draws: artDraws.b26, codeProps: world.props.filter((p) => b26Code(p)).length, codeCandidates: world.props.filter((p) => B26_CODE[p.kind] && GOD_TERRAIN[TN[terrain[p.y * ww + p.x]]] === 1).length, codeIds: Array.from(new Set(world.props.filter((p) => b26Code(p)).map((p) => b26Pick(B26_CODE[p.kind], p.x, p.y)))) }), propsClassic: () => PROPS_CLASSIC, godPropPalette: () => godPropPalette(), chunkGrid: () => ({ cols: ccols, rows: crows }),
      panelHidden: () => panelHid,
      // minimap fog (slice A1)
      discovered: () => ({ on: fogOn, count: FOG ? FOG.count(fogBits) : 0, b64: FOG ? FOG.encode(fogBits) : '', has: (cx, cy) => (FOG ? FOG.has(fogBits, cx, cy) : false) }),
      revealAt: (tx, ty) => { const n = revealAt(tx, ty); if (n > 0) drawMini(false); return n; },
      // slice 6
      diffOn: !!DIFF, diffMode, diffAt, spawner: () => zones, spawned: () => spawned, despawned: () => despawned,
      liveCount: () => { let n = 0; live.forEach((e, id) => { if (e.active && e.zid === id) n++; }); return n; },
      liveEnemies: () => { const o = []; live.forEach((e, id) => { if (e.active && e.zid === id) o.push({ id, x: e.x, y: e.y, type: e.type, zone: e.zone, tier: e.tier, art: e.art, hp: e.maxHp, spd: e.spdMul, dmg: e.dmgMul, diff: e.diff || null }); }); return o; },
      enemyById: (id) => live.get(id) || null, setDropAll: (on) => { dropAll = !!on; }, lastDrops: () => lastDrops.slice(), kills: () => kills, gearOn: GEAR_ON, gearDefaultOn: GEAR_DEFAULT_ON, gearPity, setGearPlayer: (id) => { gearPlayerSet = id === null ? null : String(id).slice(0, 60); }, gearPlayerId, setTeam: (t) => { gearTeam = t || null; }, gearHint: () => Object.assign({}, gearHintSt), gearSave: () => ({ gp: save.gp || null }), errand: () => (save.errand ? Object.assign({}, save.errand) : null), erKill, erVendor, debugCleanSave: () => { try { return cleanSave(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; } }, forceSave: () => writeSave(save), zk: () => save.zk | 0, testDrop: (info, tag) => { kills++; return rollFor(info, arena.player.x, arena.player.y, tag || 't'); }, // test hook: one kill's worth of drops with the real seed/pity path
      
      bossesClassic, rosterClassic, bandsClassic, bossArtIds: () => world.bossSites.map((b) => b.boss),
      bossSites: () => world.bossSites.map((b, i) => ({ i, x: b.x, y: b.y, zone: b.zone, boss: b.boss, name: BOSS_NAME[i], live: !!(bossLive[i] && bossLive[i].active), ready: !!zones && zones.bossReady(b, arena.clock) })),
      bossEntity: (i) => bossLive[i] || null, bossTick, bossGateWarns: () => bossGateWarn,
      // slice 7
      rush: { on: RUSH_ON, start: rushStart, next: rushNext, rest: rushRest, leave: () => rushEnd('leave'), entity: () => rush.e, ladder: () => rush.ladder, state: () => ({ on: rush.on, phase: rush.phase, i: rush.i, kills: rush.kills, n: rush.n, log: rush.log.slice() }),
        ramp: { on: RAMP_ON, layers: () => (rush.lay ? { ids: rush.lay.ids.slice(), t: rush.lay.t, fired: Object.assign({}, rush.lay.fired), dropped: rush.lay.dropped, sweeps: rush.lay.sweeps.slice(), pending: rush.lay.pend ? { pts: rush.lay.pend.pts.length, gapFrom: rush.lay.pend.gapFrom } : null } : null), capExtra: rushCapMaxNow, capNow: rushCapExtraNow, layerLive: rushLayerLive } },
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
      ttk: { on: TTK_ON }, quiet: () => ({ on: QUIET_ON, nudges: quietNudges }), firstBag: { on: FIRSTBAG_ON, kill: FIRSTBAG_KILL, fresh: fbFresh, kills: () => fbKills, dropped: () => fbDropped, forced: () => fbForced, spent: () => save.fb === 1 }, explore: { on: EXPLORE_ON, every: EXPLORE_EVERY, pct: EXPLORE_PCT, xp: () => exploreXp, pending: () => exploreCells },
      pickups: { on: PICK_ON, cap: PICK_CAP, magnet: MAGNET_R, list: () => picks.map((q) => ({ type: q.type, art: q.art, value: q.value, tier: q.tier, x: q.x, y: q.y, lifeMs: q.lifeMs })), spawn: spawnPickups, got: () => Object.assign({}, pickGot), total: () => pickTotal },
      notebook: { on: !!NB, save: () => JSON.parse(JSON.stringify(nbSave || nbLoad() || {})), meet: (id, name) => nbMeet(id, name || id), open: () => nbShow(), close: () => nbHide(false), newThisVisit: () => nbNew },
      nexus: { on: NX_ON, site: nxSite, portalName: (id) => (NX_ON ? nxPortalName(NX.layout().portals.find((q) => q.id === id)) : ''), promptFor: (id) => { const q = NX_ON ? NX.layout().portals.find((p) => p.id === id) : null; return q ? nxLabel({ kind: 'portal', ref: q }) : ''; }, open: nexusOpen, close: nexusClose, isOpen: () => nxOpen, near: () => nxNear, enterTile: () => nxEnterTile, talk: (id) => { const n = NX_ON && NX.layout().npcs.find((x) => x.id === id); if (n) { nxBuild(); nxTalk(n); } return nxDom && nxDom.last; }, stall: { on: () => NX_ON && nxStallOn(), open: () => NX_ON && nxStallOpen(), isOpen: () => !!(nxDom && nxDom.stall && nxDom.stall.isConnected && !nxDom.stall.classList.contains('hidden')), forge: () => NX_ON && nxStallForge() }, portal: (id) => { const q = NX_ON && NX.layout().portals.find((x) => x.id === id); return q ? nxPortal(q) : null; }, lastUrl: () => api.lastNexusUrl || null, today: todayUtc,
        // walkable plaza (PLAYTEST-REVIEW-2 #5); step(mx, my, dt) injects input for tests, place() only accepts free plaza points
        walk: { on: NX_WALK, view: { w: NX_VW, h: NX_VH }, labels: () => nxLabels.map((r) => Object.assign({}, r)), floor: () => Object.assign({ classic: NX_FLOOR_CLASSIC }, nxFloorStat), codeHero: () => nxHeroStat.code, life: () => Object.assign({ items: nxLife.length }, nxLifeStat), tall: NX_TALL, hero: () => ({ x: nxHero.x, y: nxHero.y, tx: Math.floor(nxHero.x / TILE), ty: Math.floor(nxHero.y / TILE), moving: nxHero.moving }), cam: () => ({ x: nxCam.x, y: nxCam.y }),
          near: () => (nxNearI ? { kind: nxNearI.kind, id: nxNearI.ref.id } : null), act: () => nxAct(), step: (mx, my, dt) => { if (nxOpen && NX_WALK) nxWalkStep(Number(dt) || 1 / 60, Number(mx) || 0, Number(my) || 0); return { x: nxHero.x, y: nxHero.y }; },
          place: (x, y) => { if (!nxOpen || !NX_WALK || !nxFree(Number(x), Number(y))) return false; nxHero.x = Number(x); nxHero.y = Number(y); nxSyncPrompt(); return true; }, running: () => nxRaf !== 0 } },
      quests: { date: questDate, list: () => MMQuests.quests(questDate()), summary: () => MMQuests.summary(save.quests, questDate()), state: () => JSON.parse(JSON.stringify(save.quests || MMQuests.fresh(questDate()))), event: nxQuestEvent, claim: nxClaim, flush: () => { qDirty = false; return writeSave(save); } },
      // BK2: boss keys and the boss lair portal
      bossKeys: { on: KEYS_ON, count: keyCount, drop: dropKey, ground: () => keyDrops.map((k) => ({ x: k.x, y: k.y, src: k.src })), got: () => keyGot, use: useKey, anchor: keyAnchor, portal: lairPortal, enter: enterLair, url: (q) => lairUrl(q || lairPortal() || arena.player), last: () => lastLair, prompt: () => ({ text: lairBtn.textContent, hidden: lairBtn.classList.contains('hidden') }), now: keyNow, tick: () => { lairT = 0; keyTick(0); } },
      // RB3: quest bags, focus orbs and buff potions
      rewards: { questBags: () => (save.questBags || []).map((b) => ({ q: b.q, d: b.d })), bagFor: questBagFor, deliver: deliverQuestBags, lastBag: () => lastQuestBag, drink: (art) => (PK && POTION_COL[art] ? drinkPotion(art) : null), potions: () => potionLog.slice(), focusApi: () => typeof arena.restoreFocus === 'function', statusApi: () => typeof arena.applyStatus === 'function' },
      settle, stashNote, lastSettle: () => lastSettle, finds: () => (ST ? ST.readFinds(localStorage) : null),
      // cycle 10 S: ID-53 just-in-time hint and ID-55 first-session ending card (test hooks, read-only state)
      jitHint: { on: JH_ON, sec: JH_SEC, max: JH_MAX, state: () => ({ on: jh.on, t: jh.t, shown: jh.shown, verb: jh.verb, why: jh.why, moved: jh.moved, block: jhBlock(), text: jhTxt.textContent, log: jh.log.slice() }), showNow: () => { if (jh.on) return true; const pk = jhPick(); if (pk) jhShow(pk); return jh.on; } },
      firstEnd: { on: FE_ON, sec: FE_SEC, state: () => ({ open: feOpen, done: feDone, ok: fe.ok, t: fe.t, d: fe.d, why: feWhy, goal: feGoal ? Object.assign({}, feGoal) : null }), go: feGo, close: feClose }, lastFirstEndUrl: null,
    };
    return { api, hooks };
  }

  window.RealmWorld = { create, cleanSave, cleanSeed, readSave, writeSave, SAVE_KEY, PAL };
})();
