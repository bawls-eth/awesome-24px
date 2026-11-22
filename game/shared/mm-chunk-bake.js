// MMChunkBake: code-drawn placeholder terrain for the Biome Archipelago (BIOME-ARCH-PLAN 1.1, A6).
// bakeChunk(ctx, terrain, w, cx, cy, palette, tileArt, opts) paints ONE 16x16-tile chunk (512 px at TILE 32) onto a 2D context, once.
// The pattern per tile is a base fill plus up to 3 speckles chosen by an integer hash of the WORLD tile coordinates (no noise function,
// no Math.random), so chunks are deterministic and neighbouring chunks line up. Only palette colours are ever used:
// palette[terrainName] = [base, shade1, shade2, edge]. A tile whose neighbour is another terrain gets a 2 px edge line (pal[3]).
// No DOM and no globals: draw into any ctx (real canvas, Phaser canvas texture, or a test stub), then blit the cached canvas.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMChunkBake = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const TILE = 32, CH = 16, CPX = TILE * CH;
  const NAMES = ['deep_water', 'shallow_water', 'sand', 'wet_sand', 'grass', 'tall_grass', 'dirt_road', 'flower_meadow', 'highland_rock',
    'gravel', 'dry_grass', 'snow', 'stone_road', 'cracked_stone', 'godland_ash', 'blood_ruins', 'dark_grass', 'lava_rock'];
  const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const int = (v, lo, hi, d) => { v = Math.floor(Number(v)); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };

  // Shared realm terrain (ids 0..17) keeps its look in every biome; each biome overrides or adds colours (palettes: base, 2 shades, edge).
  const REALM = {
    deep_water: ['#1d3f7a', '#1a386f', '#24498a', '#132a55'], shallow_water: ['#3f7fc2', '#3874b4', '#4c8dd0', '#2c5f99'],
    sand: ['#e8d7a1', '#dccb8f', '#f1e2b3', '#b9a676'], wet_sand: ['#c9b27a', '#bca56d', '#d4be88', '#9a8658'],
    grass: ['#5fae4e', '#55a145', '#6bba5a', '#3f7f33'], tall_grass: ['#4c9a3e', '#438c36', '#58a749', '#336f2a'],
    dirt_road: ['#a07a4c', '#936f43', '#ad8757', '#73552f'], flower_meadow: ['#6fbf5a', '#e58bc0', '#f2d55c', '#4f8f3f'],
    highland_rock: ['#8b8a84', '#7f7e78', '#98978f', '#5f5e59'], gravel: ['#9c958a', '#8f887e', '#a9a296', '#706a61'],
    dry_grass: ['#b9a85a', '#ad9c50', '#c5b467', '#867838'], snow: ['#e8eef4', '#dbe3eb', '#f5f8fb', '#aab6c4'],
    stone_road: ['#8a8794', '#7e7b88', '#96939f', '#5d5a66'], cracked_stone: ['#6e6676', '#625a6a', '#7b7383', '#47404f'],
    godland_ash: ['#4a4450', '#403a46', '#55505b', '#2d2832'], blood_ruins: ['#6a2a32', '#5e242c', '#78333b', '#431a20'],
    dark_grass: ['#2f5a34', '#294f2e', '#37653b', '#1d3a21'], lava_rock: ['#3a2a2a', '#ff7a2a', '#2e2020', '#1e1414']
  };
  const extend = (extra) => Object.assign({}, REALM, extra);
  const BIOME_PALETTES = {
    home: extend({ grass: ['#6cbf55', '#62b24c', '#78cb62', '#468a38'], sand: ['#efe0a8', '#e3d296', '#f6eabb', '#bfae7c'] }),
    jungle: extend({
      jungle_floor: ['#3f7a35', '#376d2f', '#4a8740', '#285423'], vine_thicket: ['#2c5e2c', '#255325', '#376d36', '#183a1a'],
      mud: ['#6b5236', '#5f482f', '#775c3d', '#43321f'], river_reed: ['#4d8f5a', '#448450', '#5a9d66', '#2f6139'],
      canopy_rock: ['#6c7a66', '#616e5c', '#788773', '#46503f'], ruin_moss: ['#587a52', '#4e6e48', '#64875d', '#364d33']
    }),
    ice: extend({
      ice_floor: ['#cfe6f3', '#c1dcec', '#dff0f9', '#8fb5cc'], frost_pine: ['#3d6b7a', '#35606e', '#477889', '#254651'],
      deep_snow: ['#f0f5fa', '#e3ebf3', '#fbfdff', '#b4c3d3'], frozen_rock: ['#7d8fa6', '#72849b', '#8a9cb1', '#52627a'],
      crevasse: ['#3c5f8c', '#345582', '#4670a0', '#223a5c']
    }),
    reef: extend({
      reef_sand: ['#f0dfae', '#e4d09c', '#f7ebc4', '#c2ad7a'], coral_bed: ['#e0766f', '#d46862', '#eb867f', '#a8453f'],
      kelp: ['#2f8f7a', '#278270', '#3a9f89', '#1b5f52'], lagoon: ['#47c2c9', '#3cb5bd', '#58d0d6', '#27868d'],
      tide_rock: ['#6a8791', '#5f7b85', '#76939d', '#415a63']
    }),
    mars: extend({
      rust_dust: ['#b4623c', '#a65a36', '#c06c44', '#7d3f24'], red_rock: ['#8a4a35', '#7d4230', '#97543c', '#5a2e21'],
      ochre_flat: ['#c98f4f', '#bc8447', '#d69b5a', '#936130'], crater: ['#5e3a30', '#543229', '#6a443a', '#3a211b'],
      dome_floor: ['#7f95a3', '#748999', '#8ba1af', '#52626d']
    })
  };

  // Integer hash of world tile coordinates -> [0,1). Pure, platform independent.
  function hash(x, y, s) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  // A palette entry is valid when it holds 4 hex strings; anything else falls back to the first valid entry (or a neutral grey).
  const GREY = ['#808080', '#767676', '#8a8a8a', '#505050'];
  const goodEntry = (e) => Array.isArray(e) && e.length >= 4 && e.slice(0, 4).every((c) => typeof c === 'string' && HEX.test(c));
  function resolvePalette(palette) {
    const out = {};
    let first = null;
    if (isObj(palette)) Object.keys(palette).forEach((k) => { if (k !== '__proto__' && goodEntry(palette[k])) { out[k] = palette[k].slice(0, 4); if (!first) first = out[k]; } });
    out.__fallback = first || GREY;
    return out;
  }
  // Every colour a baked chunk can use for this palette (tests: "a baked chunk uses only palette colours").
  function colorsOf(palette) {
    const set = {};
    const p = resolvePalette(palette);
    Object.keys(p).forEach((k) => p[k].forEach((c) => { set[c] = 1; }));
    return Object.keys(set);
  }
  const paletteFor = (biome) => (typeof biome === 'string' && has(BIOME_PALETTES, biome) ? BIOME_PALETTES[biome] : BIOME_PALETTES.home);

  // tile pattern: 0 speckle dots, 1 diagonal tufts, 2 short bars. Chosen from the world coordinates only.
  function speckle(c, pal, wx, wy, px, py) {
    const kind = Math.floor(hash(wx, wy, 3) * 3);
    for (let k = 0; k < 3; k++) {
      const r = hash(wx * 3 + k, wy, 7);
      if (r >= 0.55) continue;
      const col = r < 0.27 ? pal[1] : pal[2];
      const ox = Math.floor(hash(wx, wy * 5 + k, 11) * 26), oy = Math.floor(hash(wx * 7 + k, wy, 13) * 26);
      c.fillStyle = col;
      if (kind === 0) c.fillRect(px + ox, py + oy, 3, 3);
      else if (kind === 1) { c.fillRect(px + ox, py + oy, 2, 2); c.fillRect(px + ox + 2, py + oy + 2, 2, 2); }
      else c.fillRect(px + ox, py + oy, 5, 2);
    }
  }

  // bakeChunk(ctx, terrain, w, cx, cy, palette, tileArt, opts)
  //  terrain: Uint8Array/Array of terrain ids, w tiles wide (height = terrain.length / w unless opts.h)
  //  palette: {terrainName:[base,shade1,shade2,edge]}   tileArt: optional {id:[image,...]} (used instead of the pattern when drawImage exists)
  //  opts: {names:[id->name] (default the 18 realm names), h, tile (default 32),
  //         edges: optional {id: {imgs:[16 masks], blend:{id:1}}}: a tile with art whose 4-neighbour set is not all the same terrain, and
  //         whose differing neighbours are all in its blend set, draws edges[id].imgs[mask] (mask bits N 1, E 2, S 4, W 8 = neighbour is the
  //         same terrain; off-map counts as the same) instead of a variant. Missing mask image -> the variant. A 16-mask set has grass in
  //         every corner, so where two connected sides meet over a same-terrain diagonal (a wide path) that quarter is repainted from the
  //         variant. A code-drawn tile skips its 2 px edge line toward a neighbour whose edge masks blend into it (no box round a path).}
  // Returns the number of tiles painted (0 when ctx is unusable). Never throws.
  function bakeChunk(ctx, terrain, w, cx, cy, palette, tileArt, opts) {
    try {
      if (!ctx || typeof ctx.fillRect !== 'function' || !terrain || typeof terrain.length !== 'number') return 0;
      const o = isObj(opts) ? opts : {};
      const names = Array.isArray(o.names) ? o.names : NAMES;
      const ww = Math.min(4096, Math.floor(Number(w)));
      if (!(ww >= 1)) return 0;
      const wh = int(o.h, 1, 4096, Math.floor(terrain.length / ww));
      const T = int(o.tile, 4, 64, TILE);
      cx = int(cx, -4096, 4096, 0); cy = int(cy, -4096, 4096, 0);
      const pal = resolvePalette(palette);
      const entry = (t) => { const nm = names[t]; return (typeof nm === 'string' && has(pal, nm) && nm !== '__fallback') ? pal[nm] : pal.__fallback; };
      const deep = has(pal, 'deep_water') ? pal.deep_water : pal.__fallback;
      const art = isObj(tileArt) && typeof ctx.drawImage === 'function' ? tileArt : null;
      const edges = art && isObj(o.edges) ? o.edges : null;
      // terrain at (x, y), `d` off the map; soft(v, t): neighbour v has loaded art + edge masks that blend into t
      const at = (x, y, d) => (x >= 0 && y >= 0 && x < ww && y < wh ? terrain[y * ww + x] | 0 : d);
      const soft = (v, t) => !!edges && has(edges, v) && isObj(edges[v].blend) && has(edges[v].blend, t) && Array.isArray(art[v]) && art[v].length > 0;
      const x0 = cx * CH, y0 = cy * CH;
      let painted = 0;
      for (let ty = 0; ty < CH; ty++) {
        for (let tx = 0; tx < CH; tx++) {
          const wx = x0 + tx, wy = y0 + ty, px = tx * T, py = ty * T;
          if (wx < 0 || wy < 0 || wx >= ww || wy >= wh) { ctx.fillStyle = deep[0]; ctx.fillRect(px, py, T, T); painted++; continue; }
          const t = terrain[wy * ww + wx] | 0;
          const p = entry(t);
          const imgs = art && Array.isArray(art[t]) ? art[t].filter(Boolean) : null;
          if (imgs && imgs.length) {
            const ed = edges && has(edges, t) ? edges[t] : null;
            const vimg = imgs[Math.floor(hash(wx, wy, 91) * imgs.length)];
            let eimg = null, mask = 15;
            if (ed && Array.isArray(ed.imgs) && isObj(ed.blend)) {
              const n = at(wx, wy - 1, t), e = at(wx + 1, wy, t), s = at(wx, wy + 1, t), wv = at(wx - 1, wy, t);
              mask = (n === t ? 1 : 0) | (e === t ? 2 : 0) | (s === t ? 4 : 0) | (wv === t ? 8 : 0);
              if (mask !== 15 && (n === t || has(ed.blend, n)) && (e === t || has(ed.blend, e)) && (s === t || has(ed.blend, s)) && (wv === t || has(ed.blend, wv))) eimg = ed.imgs[mask] || null;
            }
            ctx.drawImage(eimg || vimg, px, py, T, T);
            if (eimg) {
              // inner corners: two connected sides over a same-terrain diagonal -> that quarter from the variant (no grass notch)
              const hq = T / 2, iw = vimg.naturalWidth || vimg.width || T, ih = vimg.naturalHeight || vimg.height || T;
              for (let q = 0; q < 4; q++) {
                const dx = q === 0 || q === 1 ? 1 : -1, dy = q === 1 || q === 2 ? 1 : -1;
                const sideA = dy < 0 ? 1 : 4, sideB = dx > 0 ? 2 : 8;
                if ((mask & sideA) && (mask & sideB) && at(wx + dx, wy + dy, t) === t) {
                  const ox = dx > 0 ? hq : 0, oy = dy > 0 ? hq : 0;
                  ctx.drawImage(vimg, ox * iw / T, oy * ih / T, iw / 2, ih / 2, px + ox, py + oy, hq, hq);
                }
              }
            }
          } else {
            ctx.fillStyle = p[0]; ctx.fillRect(px, py, T, T);
            speckle(ctx, p, wx, wy, px, py);
            ctx.fillStyle = p[3];
            if (wx + 1 < ww && terrain[wy * ww + wx + 1] !== t && !soft(terrain[wy * ww + wx + 1], t)) ctx.fillRect(px + T - 2, py, 2, T);
            if (wx > 0 && terrain[wy * ww + wx - 1] !== t && !soft(terrain[wy * ww + wx - 1], t)) ctx.fillRect(px, py, 2, T);
            if (wy + 1 < wh && terrain[(wy + 1) * ww + wx] !== t && !soft(terrain[(wy + 1) * ww + wx], t)) ctx.fillRect(px, py + T - 2, T, 2);
            if (wy > 0 && terrain[(wy - 1) * ww + wx] !== t && !soft(terrain[(wy - 1) * ww + wx], t)) ctx.fillRect(px, py, T, 2);
          }
          painted++;
        }
      }
      return painted;
    } catch (e) { return 0; }
  }

  const defaultCreate = (w, h) => {
    if (typeof document === 'undefined' || !document.createElement) return null;
    const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  };

  // Bake one chunk onto a fresh canvas from create(w,h) (defaults to a DOM canvas). Returns the canvas, or null.
  function bakeChunkCanvas(create, terrain, w, cx, cy, palette, tileArt, opts) {
    try {
      const T = isObj(opts) ? int(opts.tile, 4, 64, TILE) : TILE;
      const cv = (typeof create === 'function' ? create : defaultCreate)(T * CH, T * CH);
      const g = cv && typeof cv.getContext === 'function' ? cv.getContext('2d') : null;
      if (!g) return null;
      g.imageSmoothingEnabled = false;
      return bakeChunk(g, terrain, w, cx, cy, palette, tileArt, opts) > 0 ? cv : null;
    } catch (e) { return null; }
  }

  // Small LRU of baked chunk canvases (the realm-world pattern: 24 chunks). get(cx, cy, buildFn?) bakes on a miss.
  function makeCache(cap) {
    const max = int(cap, 1, 256, 24);
    const m = new Map();
    return {
      get(key, build) {
        const k = String(key);
        if (m.has(k)) { const v = m.get(k); m.delete(k); m.set(k, v); return v; }
        let v = null;
        try { v = typeof build === 'function' ? build() : null; } catch (e) { v = null; }
        if (v == null) return null;
        m.set(k, v);
        while (m.size > max) m.delete(m.keys().next().value);
        return v;
      },
      size: () => m.size, clear: () => m.clear()
    };
  }

  return {
    TILE: TILE, CH: CH, CPX: CPX, NAMES: NAMES, BIOME_PALETTES: BIOME_PALETTES, hash: hash, resolvePalette: resolvePalette, colorsOf: colorsOf,
    paletteFor: paletteFor, bakeChunk: bakeChunk, bakeChunkCanvas: bakeChunkCanvas, makeCache: makeCache, defaultCreate: defaultCreate
  };
});
