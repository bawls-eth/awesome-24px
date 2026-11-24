// MMIsleArt: optional real-PNG tile art for the Hearthvale Isles terrain (Codex batch b30, jungle-terrain-base: 12 terrains x variants a..d, 32x32).
// Sits on top of MMChunkBake: it loads the tile images once, maps pack terrain ids (appended ids 22..33) to the b30 tile ids
// (tile_<terrain>_<a..d>) and bakes chunks with MMChunkBake.bakeChunk, which picks the variant by an integer hash of the world tile coords.
// Anything missing (image failed, art:false, no Image/drawImage) falls back to the code-drawn palette, so the island never goes blank.
// b35 meadow-home (Hearth Isle, provisional): 4 home terrains x variants a..d plus 16 edge masks each (tile_<terrain>_edge_NN, mask bits
// N 1 / E 2 / S 4 / W 8 = neighbour is the same terrain), blended into grass (tilled_wet into tilled_soil); and its props (garden plots,
// dock, stable, nest, workbench, launch pad, boat). opts.pack picks the set ('jungle' default = b30 + b33, 'meadow' = b35); a tile with
// no loaded art bakes with the code palette. b34b crafting icons: ITEM_ICONS / iconUrl(id) for the craft panel (text label fallback).
// No Firebase, no network except the PNG loads. Browser: window.MMIsleArt (needs mm-chunk-bake.js first). Node: require().
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./mm-chunk-bake.js'));
  else root.MMIsleArt = factory(root.MMChunkBake);
})(typeof self !== 'undefined' ? self : this, function (Bake) {
  const BASE = '../../assets/arcane/b30-jungle-terrain-base/';
  const VARIANTS = ['a', 'b', 'c', 'd'];
  // MMOverworld.TERRAIN_EXT_NAMES 18..33 (append-only ids); the b30 terrain names equal the pack terrain names.
  const EXT = ['tilled_soil', 'tilled_wet', 'clover_patch', 'garden_path', 'jungle_floor', 'jungle_moss', 'fern_thicket', 'mud', 'mud_deep', 'river_murk',
    'black_sand', 'temple_stone', 'temple_moss', 'orchid_moss', 'vine_root', 'jungle_cliff'];
  const NAMES = Bake.NAMES.concat(EXT);
  const TERRAINS = ['jungle_floor', 'jungle_moss', 'fern_thicket', 'mud', 'mud_deep', 'river_murk', 'black_sand', 'temple_stone', 'temple_moss', 'orchid_moss', 'vine_root', 'jungle_cliff'];
  // code-drawn fallback colours for the 12 pack terrains (base, shade, shade, edge); the realm ones come from the jungle palette
  const PACK_PALETTE = {
    jungle_floor: ['#3f7a35', '#376d2f', '#4a8740', '#285423'], jungle_moss: ['#4f8f4a', '#468342', '#5a9d54', '#316030'], fern_thicket: ['#2f7040', '#286536', '#3a7e4a', '#1c4a2a'],
    mud: ['#6b5236', '#5f482f', '#775c3d', '#43321f'], mud_deep: ['#4a3524', '#402e1f', '#563f2b', '#2c1f15'], river_murk: ['#3d6b5a', '#366052', '#487867', '#274a3d'],
    black_sand: ['#3a3634', '#322f2d', '#45403d', '#242120'], temple_stone: ['#7d8a78', '#727e6d', '#899685', '#56604f'], temple_moss: ['#a9b59e', '#9ca892', '#b5c0ab', '#76806c'],
    orchid_moss: ['#8f5d8a', '#835481', '#9b6896', '#5f3b5c'], vine_root: ['#1c4a38', '#174031', '#235642', '#0f3b2e'], jungle_cliff: ['#2e4a3c', '#284236', '#355644', '#1d3128']
  };
  const PALETTE = Object.assign({}, Bake.BIOME_PALETTES.jungle, PACK_PALETTE);

  const tileId = (terrain, v) => 'tile_' + terrain + '_' + v;
  const edgeId = (terrain, m) => 'tile_' + terrain + '_edge_' + (m < 10 ? '0' : '') + m;

  // ---- b35 meadow-home tile set (Hearth Isle only). pack terrain name -> b35 terrain name (equal today; the table keeps it explicit
  // like the jungle mapping) and the terrains each one's edge masks blend into.
  const MEADOW_BASE = '../../assets/arcane/b35-meadow-home/';
  const GRASSY = ['grass', 'tall_grass', 'flower_meadow'];
  const MEADOW_TILES = { tilled_soil: 'tilled_soil', tilled_wet: 'tilled_wet', clover_patch: 'clover_patch', garden_path: 'garden_path' };
  const MEADOW_BLEND = { tilled_soil: GRASSY, tilled_wet: ['tilled_soil'], clover_patch: GRASSY, garden_path: GRASSY };
  // code fallback for the four (base, shade, shade, edge) on top of the home palette; the page passes its own pack palette over this
  const MEADOW_PALETTE = Object.assign({}, Bake.BIOME_PALETTES.home, {
    tilled_soil: ['#6b4a2f', '#5f4129', '#775336', '#4a3320'], tilled_wet: ['#4f3622', '#45301e', '#5a3e28', '#33231a'],
    clover_patch: ['#4f9a3f', '#468c38', '#5aa84a', '#356b2b'], garden_path: ['#cbb890', '#bfac84', '#d6c49d', '#9a8a66'], dock_planks: ['#8a5a3b', '#7c5034', '#966444', '#5a3a22']
  });
  // b35 edge masks (AW3: Codex's grass-edge redo) paint their grass in Hearth Isle's own ramp (#6cbf55 base, #78c960 light, #60ad4d
  // dark) and are drawn as delivered; the old 3-colour swap for the darker first delivery is gone (tests/shared-mm-isle-art pixel-checks
  // every mask against the island grass so a dark halo cannot come back unnoticed).
  const SETS = {
    jungle: { base: BASE, tiles: null, terrains: TERRAINS, palette: PALETTE, edges: null },
    meadow: { base: MEADOW_BASE, tiles: MEADOW_TILES, terrains: Object.keys(MEADOW_TILES), palette: MEADOW_PALETTE, edges: MEADOW_BLEND }
  };
  const setOf = (pack) => (typeof pack === 'string' && Object.prototype.hasOwnProperty.call(SETS, pack) ? SETS[pack] : SETS.jungle);
  const artName = (set, t) => (set.tiles ? set.tiles[t] : t);
  // names (optional id->name list, default NAMES) -> { terrainId: terrainName } for the set's terrains (default the 12 b30 jungle ones)
  function idMap(names, pack) {
    const list = Array.isArray(names) ? names : NAMES, out = {};
    setOf(pack).terrains.forEach((t) => { const i = list.indexOf(t); if (i >= 0) out[i] = t; });
    return out;
  }
  function defaultLoadImage(url) {
    return new Promise((res) => {
      if (typeof Image === 'undefined') return res(null);
      const im = new Image();
      im.onload = () => res(im); im.onerror = () => res(null);
      im.src = url;
    });
  }
  // load(opts) -> Promise<{ [terrainId]: [image, ...] } | null>. opts: {base, names, pack, loadImage(url)->Promise<image|null>}
  // Never rejects; a terrain with no loaded variant is simply absent (the bake falls back for it). Resolves null when nothing loaded.
  // A set with edge masks (meadow) also loads tile_<t>_edge_00..15 and puts them on the result's non-enumerable `edges`:
  // {terrainId: {imgs: [16], blend: {terrainId: 1}}} (the MMChunkBake opts.edges shape); a terrain whose variants all failed gets none.
  function load(opts) {
    const o = opts && typeof opts === 'object' ? opts : {};
    const set = setOf(o.pack);
    const base = typeof o.base === 'string' ? o.base : set.base;
    const li = typeof o.loadImage === 'function' ? o.loadImage : defaultLoadImage;
    const names = Array.isArray(o.names) ? o.names : NAMES;
    const map = idMap(names, o.pack), art = {}, edge = {}, jobs = [];
    const get = (url, put) => jobs.push(Promise.resolve().then(() => li(url)).then((im) => { if (im) put(im); }, () => {}));
    Object.keys(map).forEach((id) => {
      art[id] = [];
      const nm = artName(set, map[id]);
      VARIANTS.forEach((v, k) => get(base + 'tiles/' + tileId(nm, v) + '.png', (im) => { art[id][k] = im; }));
      if (set.edges && set.edges[map[id]]) {
        const blend = {};
        set.edges[map[id]].forEach((b) => { const i = names.indexOf(b); if (i >= 0) blend[i] = 1; });
        edge[id] = { imgs: new Array(16).fill(null), blend: blend };
        for (let m = 0; m < 16; m++) get(base + 'tiles/' + edgeId(nm, m) + '.png', (im) => { edge[id].imgs[m] = im; });
      }
    });
    return Promise.all(jobs).then(() => {
      let any = false;
      Object.keys(art).forEach((id) => { art[id] = art[id].filter(Boolean); if (art[id].length) any = true; else { delete art[id]; delete edge[id]; } });
      if (!any) return null;
      if (set.edges) Object.defineProperty(art, 'edges', { value: edge, enumerable: false });
      return art;
    });
  }

  // create(opts) -> isle art baker.
  //  opts: {art: false to force the code-drawn fallback, pack ('jungle' | 'meadow'), base, names, palette, loadImage, create (canvas
  //         factory), cap (cache size), props (also load the set's prop PNGs), propBase}
  //  .ready: Promise resolving to this once images are loaded (or failed). .active(): true when real art is in use.
  //  .chunk(terrain, w, cx, cy): cached baked canvas (null when no canvas is available). Bakes with the art that is loaded NOW.
  //  .bake(ctx, terrain, w, cx, cy): paints straight onto a ctx (returns tiles painted).
  function create(opts) {
    const o = opts && typeof opts === 'object' ? opts : {};
    const names = Array.isArray(o.names) ? o.names : NAMES;
    const set = setOf(o.pack), pack = set === SETS.meadow ? 'meadow' : 'jungle';
    const palette = o.palette || set.palette;
    const cache = Bake.makeCache(o.cap);
    let art = null, props = null;
    const bo = { names: names, edges: null };
    const self = {
      palette: palette, names: names, pack: pack,
      active: () => !!art,
      props: () => props,
      propsActive: () => !!props,
      bake: (ctx, terrain, w, cx, cy) => Bake.bakeChunk(ctx, terrain, w, cx, cy, palette, art, bo),
      chunk: (terrain, w, cx, cy) => cache.get(cx + ',' + cy, () => Bake.bakeChunkCanvas(o.create, terrain, w, cx, cy, palette, art, bo)),
      clear: () => cache.clear(),
      cacheSize: () => cache.size()
    };
    // props load beside the tiles only when asked (opts.props), so callers that bake terrain only keep their exact request set
    self.ready = o.art === false ? Promise.resolve(self)
      : Promise.all([load({ base: o.base, names: names, pack: pack, loadImage: o.loadImage }),
        o.props ? loadProps({ propBase: o.propBase, pack: pack, loadImage: o.loadImage }) : null])
        .then((r) => { art = r[0]; bo.edges = art && art.edges ? art.edges : null; props = r[1] || null; cache.clear(); return self; }, () => self);
    return self;
  }

  // ---- b33 jungle props (one transparent PNG each, ground anchor; the hanging vine hangs from its top-centre anchor) ----
  const PROP_BASE = '../../assets/arcane/b33-jungle-props/props/';
  const PROPS = {
    jungle_tree_a: [64, 64, 32, 62], jungle_tree_b: [64, 64, 32, 62], giant_fern: [32, 64, 16, 62], banana_plant: [32, 64, 16, 62],
    hanging_vine: [32, 64, 16, 4], temple_pillar: [32, 64, 16, 62], temple_idol: [32, 32, 16, 30], amber_node: [32, 32, 16, 30]
  };
  // pack prop id -> b33 ids (a list picks one by the world tile hash, so a forest mixes both trees)
  const PROP_ALIAS = { jungle_tree: ['jungle_tree_a', 'jungle_tree_b'] };
  const HANGING = { hanging_vine: true };
  // b35 meadow-home props [w, h, ax, ay, frames] (frames > 1: a horizontal strip; the bake draws frame 0). Pack / page ids -> b35 ids:
  // the pack `garden_plot` prop mixes the four growth stages by tile hash, the homestead `pen` shows the stable.
  const MEADOW_PROP_BASE = MEADOW_BASE + 'props/';
  const MEADOW_PROPS = {
    stable: [96, 64, 48, 52, 1], nest: [32, 32, 16, 26, 1], garden_plot_s1: [32, 32, 16, 26, 1], garden_plot_s2: [32, 32, 16, 26, 1], garden_plot_s3: [32, 32, 16, 26, 1],
    garden_plot_s4: [32, 32, 16, 26, 1], dock: [64, 32, 32, 26, 1], launch_pad: [96, 96, 48, 79, 1], workbench_isle: [32, 32, 16, 26, 1], boat: [64, 32, 32, 26, 2]
  };
  const MEADOW_ALIAS = { garden_plot: ['garden_plot_s1', 'garden_plot_s2', 'garden_plot_s3', 'garden_plot_s4'], pen: ['stable'], workbench: ['workbench_isle'] };
  const PROP_SETS = { jungle: { base: PROP_BASE, props: PROPS, alias: PROP_ALIAS }, meadow: { base: MEADOW_PROP_BASE, props: MEADOW_PROPS, alias: MEADOW_ALIAS } };
  // loadProps(opts) -> Promise<{id: {img, w, h, ax, ay, frames}} | null>; never rejects, a failed PNG is simply absent (the code prop stays).
  // opts: {pack ('jungle' b33 default | 'meadow' b35), propBase, loadImage}. The result carries its alias table (non-enumerable).
  function loadProps(opts) {
    const o = opts && typeof opts === 'object' ? opts : {};
    const ps = o.pack === 'meadow' ? PROP_SETS.meadow : PROP_SETS.jungle;
    const base = typeof o.propBase === 'string' ? o.propBase : ps.base;
    const li = typeof o.loadImage === 'function' ? o.loadImage : defaultLoadImage;
    const out = {};
    return Promise.all(Object.keys(ps.props).map((id) => Promise.resolve().then(() => li(base + id + '.png')).then((im) => {
      if (im) { const p = ps.props[id]; out[id] = { img: im, w: p[0], h: p[1], ax: p[2], ay: p[3], frames: p[4] > 1 ? p[4] : 1 }; }
    }, () => {}))).then(() => {
      if (!Object.keys(out).length) return null;
      Object.defineProperty(out, 'alias', { value: ps.alias, enumerable: false });
      return out;
    });
  }
  // propFor(props, kind, wx, wy) -> the loaded prop for a pack prop id at world tile (wx, wy), or null (draw the code prop)
  function propFor(props, kind, wx, wy) {
    if (!props || typeof kind !== 'string') return null;
    const alias = props.alias || PROP_ALIAS;
    if (Object.prototype.hasOwnProperty.call(alias, kind)) {
      const list = alias[kind].filter((id) => !!props[id]);
      return list.length ? props[list[Math.floor(Bake.hash(wx | 0, wy | 0, 57) * list.length)]] : null;
    }
    return Object.prototype.hasOwnProperty.call(props, kind) ? props[kind] : null;
  }
  // drawPropArt(ctx, p, kind, px, py, tile): a ground prop stands on the tile's bottom centre, a hanging one hangs from its top centre
  function drawPropArt(ctx, p, kind, px, py, tile) {
    if (!ctx || !p || typeof ctx.drawImage !== 'function') return false;
    const T = tile > 0 ? tile : Bake.TILE;
    const x = Math.round(px + T / 2 - p.ax), y = Math.round(HANGING[kind] ? py - p.ay + 2 : py + T - 2 - p.ay);
    if (p.frames > 1) ctx.drawImage(p.img, 0, 0, p.w, p.h, x, y, p.w, p.h); // a strip (the boat): its first frame
    else ctx.drawImage(p.img, x, y, p.w, p.h);
    return true;
  }

  // ---- b34b crafting icons (32x32 items, provisional): recipe / item id -> icon PNG. Ids without an icon keep the text label.
  const ICON_BASE = '../../assets/arcane/b34b-crafting-icons/items/';
  const ITEM_ICONS = ['saddle_tusktop', 'saddle_stegolith', 'saddle_tyrant', 'saddle_shagtusk', 'saddle_sabrefang', 'saddle_tidesteed', 'saddle_skimray',
    'saddle_strider', 'saddle_grazer', 'saddle_titan', 'raft', 'rocket_core', 'warm_cloak', 'o2_tank', 'gear_dust'];
  const iconUrl = (id) => (typeof id === 'string' && ITEM_ICONS.indexOf(id) >= 0 ? ICON_BASE + 'icon_' + id + '.png' : null);

  // X6: the b33 boss arena ring (128x128, centre anchor). It is not delivered yet, so the page draws its code ring; loadArena() only
  // requests the PNG once ARENA.delivered is true (no 404s in the console), or when a caller forces it.
  const ARENA = Object.freeze({ id: 'boss_arena_ring', w: 128, h: 128, ax: 64, ay: 64, delivered: false });
  // loadArena(opts) -> Promise<{img, w, h, ax, ay} | null>; never rejects. opts: {propBase, loadImage, force}
  function loadArena(opts) {
    const o = opts && typeof opts === 'object' ? opts : {};
    if (!ARENA.delivered && o.force !== true) return Promise.resolve(null);
    const base = typeof o.propBase === 'string' ? o.propBase : PROP_BASE;
    const li = typeof o.loadImage === 'function' ? o.loadImage : defaultLoadImage;
    return Promise.resolve().then(() => li(base + ARENA.id + '.png')).then((im) => (im ? { img: im, w: ARENA.w, h: ARENA.h, ax: ARENA.ax, ay: ARENA.ay } : null), () => null);
  }

  // 8B: code-drawn terrain detail, painted ONCE onto a baked chunk (never per frame) so big fields do not look flat: 8 seeded tile variants
  // (plain, speckle pair, grass tuft, pebble, dash, cross, checker dither, shade corner) in the tile's own palette shades, wave dashes on
  // water, and stepped (stair) edges where two terrains meet (the neighbour's base colour in 4 px steps). Pure in its inputs: the same
  // terrain + seed paint the same pixels. pal: name -> [base, shade, light, edge]. Returns the number of tiles touched.
  const DETAIL_VARIANTS = 8;
  function dhash(x, y, s) { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2246822519)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function detailVariant(wx, wy, seed) { return Math.floor(dhash(wx, wy, seed) * DETAIL_VARIANTS); }
  const WATERY = /water|sea|lagoon|murk|reef_deep|ocean/;
  // one tile's detail pixels (variant v, offset cell q 0..15) and its stepped east / south edges, as fillRects at the tile origin
  function paintTile(ctx, nm, p, v, q, T, u, eCol, sCol, par) {
    const ox = u * (2 + 3 * (q & 3)), oy = u * (2 + 3 * (q >> 2));
    if (WATERY.test(nm)) {
      if (v < 3) { ctx.fillStyle = p[2]; ctx.fillRect(ox, oy, u * 3, u); ctx.fillRect(ox + u * 3, oy - u, u * 2, u); }
    } else if (v === 1) { ctx.fillStyle = p[1]; ctx.fillRect(ox, oy, u, u); ctx.fillRect(ox + u * 3, oy + u * 2, u, u); }
    else if (v === 2) { ctx.fillStyle = p[2]; ctx.fillRect(ox, oy, u, u * 2); ctx.fillRect(ox - u, oy - u, u, u); ctx.fillRect(ox + u, oy - u, u, u); }
    else if (v === 3) { ctx.fillStyle = p[3]; ctx.fillRect(ox, oy + u, u * 2, u); ctx.fillStyle = p[2]; ctx.fillRect(ox, oy, u * 2, u); }
    else if (v === 4) { ctx.fillStyle = p[2]; ctx.fillRect(ox, oy, u * 3, u); }
    else if (v === 5) { ctx.fillStyle = p[1]; ctx.fillRect(ox + u, oy, u, u * 3); ctx.fillRect(ox, oy + u, u * 3, u); }
    else if (v === 6) { ctx.fillStyle = p[1]; for (let k = 0; k < 4; k++) ctx.fillRect(ox + (k & 1) * u, oy + (k >> 1) * u * 2 + (k & 1) * u, u, u); }
    else if (v === 7) { ctx.fillStyle = p[1]; ctx.fillRect(0, 0, u * 2, u * 2); }
    if (eCol) { ctx.fillStyle = eCol; for (let k = (par >> 1) * 2 * u; k < T; k += 4 * u) ctx.fillRect(T - u, k, u, 2 * u); }
    if (sCol) { ctx.fillStyle = sCol; for (let k = (par & 1) * 2 * u; k < T; k += 4 * u) ctx.fillRect(k, T - u, 2 * u, u); }
  }
  // an offset view of a context, so paintTile draws straight onto a chunk (the plain path; the node test inspects it)
  function shifted(ctx, px, py) {
    return { set fillStyle(v) { ctx.fillStyle = v; }, fillRect: (x, y, w2, h2) => ctx.fillRect(px + x, py + y, w2, h2) };
  }
  // opts.create(w, h) -> canvas turns on stamps: each distinct tile look (terrain, variant, offset cell, edge colours) is painted once into
  // a small cached canvas and placed with ONE drawImage per detailed tile, so a chunk bake stays about one call per tile.
  const STAMPS = new Map();
  function detail(ctx, terrain, w, h, cx, cy, opts) {
    try {
      const o = opts && typeof opts === 'object' ? opts : {};
      const names = o.names || NAMES, pal = o.palette || PALETTE, T = o.tile | 0 || 32, CH = o.ch | 0 || 16, seed = o.seed | 0;
      if (!ctx || typeof ctx.fillRect !== 'function' || !terrain) return 0;
      const mk = typeof o.create === 'function' && typeof ctx.drawImage === 'function' ? o.create : null;
      const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? terrain[y * w + x] | 0 : -1);
      const u = Math.max(1, Math.round(T / 16)); // one art pixel (2 px on a 32 px tile)
      let n = 0;
      for (let ty = 0; ty < CH; ty++) for (let tx = 0; tx < CH; tx++) {
        const wx = cx * CH + tx, wy = cy * CH + ty, t = at(wx, wy);
        if (t < 0) continue;
        const nm = names[t], p = pal[nm];
        if (!p) continue;
        n++;
        const v = detailVariant(wx, wy, seed), q = Math.floor(dhash(wy, wx, seed + 7) * 16);
        const e = at(wx + 1, wy), s2 = at(wx, wy + 1);
        const eCol = e >= 0 && e !== t && pal[names[e]] ? pal[names[e]][0] : null, sCol = s2 >= 0 && s2 !== t && pal[names[s2]] ? pal[names[s2]][0] : null;
        const par = (eCol ? (wy & 1) << 1 : 0) | (sCol ? wx & 1 : 0);
        if ((WATERY.test(nm) ? v >= 3 : v === 0) && !eCol && !sCol) continue;
        const px = tx * T, py = ty * T;
        if (!mk) { paintTile(shifted(ctx, px, py), nm, p, v, q, T, u, eCol, sCol, par); continue; }
        const key = nm + '|' + v + '|' + q + '|' + (eCol || '') + '|' + (sCol || '') + '|' + par + '|' + T + '|' + p[0] + p[1] + p[2] + p[3];
        let st = STAMPS.get(key);
        if (!st) {
          if (STAMPS.size >= 1500) STAMPS.clear();
          st = mk(T, T);
          const sg = st && st.getContext ? st.getContext('2d') : null;
          if (!sg) { paintTile(shifted(ctx, px, py), nm, p, v, q, T, u, eCol, sCol, par); continue; }
          paintTile(sg, nm, p, v, q, T, u, eCol, sCol, par);
          STAMPS.set(key, st);
        }
        ctx.drawImage(st, px, py);
      }
      return n;
    } catch (e) { return 0; }
  }

  // Cycle 2 art (G): field detail. A SEPARATE overlay after detail() (whose output the node tests pin): on grass-like terrain only, seeded
  // flowers (3x3 plus in 5 petal colours), pebbles (2x2 with a light and a dark pixel) and dark tufts, square clusters in art pixels (bullets
  // and pickups stay the only bright round shapes). Terrains missing from opts.palette (the PNG terrains on an art bake) are never touched.
  // Pure in its inputs, bake time only. Returns { flowers, pebbles, tufts }. The Isles page turns it off with ?islefield=0.
  const FIELD_TERRAINS = { grass: 0.10, tall_grass: 0.08, flower_meadow: 0.34, dry_grass: 0.06, clover_patch: 0.18, jungle_moss: 0.08, tundra_moss: 0.06, orchid_moss: 0.2 };
  const FIELD_PETALS = ['#f4e9c8', '#f2c94c', '#e98fa6', '#9db8f0', '#c99be8'];
  const FIELD_PEBBLE = ['#8a8478', '#b4ad9e', '#5f594f'];
  function fieldDetail(ctx, terrain, w, h, cx, cy, opts) {
    const out = { flowers: 0, pebbles: 0, tufts: 0 };
    try {
      const o = opts && typeof opts === 'object' ? opts : {};
      const names = o.names || NAMES, pal = o.palette || PALETTE, T = o.tile | 0 || 32, CH = o.ch | 0 || 16, seed = (o.seed | 0) + 4409;
      if (!ctx || typeof ctx.fillRect !== 'function' || !terrain) return out;
      const u = Math.max(1, Math.round(T / 16));
      for (let ty = 0; ty < CH; ty++) for (let tx = 0; tx < CH; tx++) {
        const wx = cx * CH + tx, wy = cy * CH + ty;
        if (wx < 0 || wy < 0 || wx >= w || wy >= h) continue;
        const nm = names[terrain[wy * w + wx] | 0], rate = FIELD_TERRAINS[nm], p = pal[nm];
        if (rate === undefined || !p) continue;
        const r = dhash(wx, wy, seed), q = dhash(wy, wx, seed + 3);
        const ox = tx * T + u * (3 + ((q * 9) | 0)), oy = ty * T + u * (3 + ((dhash(wx, wy, seed + 5) * 9) | 0));
        if (r < rate) { // flower: a 3x3 plus with a centre pixel (petal colour per tile, centre warm yellow or white)
          const pc = FIELD_PETALS[(q * 97 | 0) % FIELD_PETALS.length];
          ctx.fillStyle = p[1]; ctx.fillRect(ox + u, oy + 3 * u, u, u); // stem shadow
          ctx.fillStyle = pc; ctx.fillRect(ox + u, oy, u, u); ctx.fillRect(ox, oy + u, u * 3, u); ctx.fillRect(ox + u, oy + 2 * u, u, u);
          ctx.fillStyle = pc === '#f2c94c' ? '#fff6d8' : '#f2c94c'; ctx.fillRect(ox + u, oy + u, u, u);
          out.flowers++;
        } else if (r < rate + 0.05) { // pebble: 2x2 grey, a lit top-left pixel and a dark bottom-right one
          ctx.fillStyle = FIELD_PEBBLE[0]; ctx.fillRect(ox, oy, u * 2, u * 2);
          ctx.fillStyle = FIELD_PEBBLE[1]; ctx.fillRect(ox, oy, u, u);
          ctx.fillStyle = FIELD_PEBBLE[2]; ctx.fillRect(ox + u, oy + u, u, u);
          out.pebbles++;
        } else if (r < rate + 0.13) { // tuft: three dark blades in the tile's own shade
          ctx.fillStyle = p[1]; ctx.fillRect(ox, oy + u, u, u * 2); ctx.fillRect(ox + u, oy, u, u * 3); ctx.fillRect(ox + 2 * u, oy + u, u, u * 2);
          out.tufts++;
        }
      }
    } catch (e) { /* bake keeps going without the overlay */ }
    return out;
  }

  // Cycle 4 art (G): biome ground detail for the Frostfang Tundra and the Verdant Jungle. A SEPARATE overlay painted after detail() /
  // warmSand() / fieldDetail() on the baked chunk (bake time only, never per frame); detail()'s own output and the b30 tile PNGs (the
  // isle-art-bake pins) are not changed, this only draws on the chunk canvas the page owns. Seeded per world tile, pure in its inputs.
  //  tundra: snow drifts (a lit crest over a soft blue shadow) and sparkles on snow, jagged cracks with a lit lip on ice, frost on rock / moss.
  //  jungle: dark roots with a lit top edge, fallen leaf litter (2x1 leaves in 4 browns / olive) and small moss clumps.
  //  seams: where a tundra / jungle tile meets another terrain, seeded bumps of the neighbour's base colour (1-2 art px deep) break the
  //  straight 32 px seam into an uneven edge. opts.biomes: { tundra: bool, jungle: bool } (default both). Returns counts.
  const BIOME_GROUND = {
    snow: 's', packed_snow: 's', powder_snow: 's', deep_snow: 's', ice_sheet: 'i', ice_thin: 'i', slush: 'i', frost_rock: 'f', permafrost: 'f',
    frozen_rock: 'f', frozen_road: 'f', tundra_moss: 'm',
    jungle_floor: 'j', jungle_moss: 'j', fern_thicket: 'j', vine_root: 'j', temple_moss: 'j', orchid_moss: 'j', mud: 'j'
  };
  function mixHex(a, b, f) { const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16), m = (s2) => Math.round(((x >> s2) & 255) * (1 - f) + ((y >> s2) & 255) * f);
    return '#' + ((1 << 24) | (m(16) << 16) | (m(8) << 8) | m(0)).toString(16).slice(1); }
  const SOFT = new Map(); // base|edge -> the soft seam tone (or '' when a colour is not #rrggbb)
  function softEdge(b, e) {
    const k = b + '|' + e; let v = SOFT.get(k);
    if (v === undefined) { v = /^#[0-9a-f]{6}$/i.test(b) && /^#[0-9a-f]{6}$/i.test(e) ? mixHex(b, e, 0.4) : ''; if (SOFT.size > 256) SOFT.clear(); SOFT.set(k, v); }
    return v;
  }
  const LEAVES = ['rgba(138,106,42,0.85)', 'rgba(168,132,58,0.85)', 'rgba(107,74,36,0.85)', 'rgba(95,122,42,0.85)'];
  function biomeDetail(ctx, terrain, w, h, cx, cy, opts) {
    const out = { drifts: 0, sparkles: 0, cracks: 0, frost: 0, roots: 0, litter: 0, moss: 0, seams: 0, tiles: 0 };
    try {
      const o = opts && typeof opts === 'object' ? opts : {};
      const names = o.names || NAMES, pal = o.palette || PALETTE, T = o.tile | 0 || 32, CH = o.ch | 0 || 16, seed = (o.seed | 0) + 7717;
      const bi = o.biomes && typeof o.biomes === 'object' ? o.biomes : { tundra: true, jungle: true };
      if (!ctx || typeof ctx.fillRect !== 'function' || !terrain) return out;
      const u = Math.max(1, Math.round(T / 16)), A = 16; // art pixels per tile side
      const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? terrain[y * w + x] | 0 : -1);
      const R = (x, y, ww, hh) => ctx.fillRect(x, y, ww, hh);
      for (let ty = 0; ty < CH; ty++) for (let tx = 0; tx < CH; tx++) {
        const wx = cx * CH + tx, wy = cy * CH + ty, t = at(wx, wy);
        if (t < 0) continue;
        const nm = names[t], k = BIOME_GROUND[nm];
        if (!k || (k === 'j' ? !bi.jungle : !bi.tundra)) continue;
        out.tiles++;
        const px = tx * T, py = ty * T, r = dhash(wx, wy, seed), q = dhash(wy, wx, seed + 1), q2 = dhash(wx + 31, wy - 17, seed + 2);
        const gx = (n) => px + u * n, gy = (n) => py + u * n;
        const ax = 2 + ((q * 9) | 0), ay = 3 + ((q2 * 9) | 0); // decal anchor in art px (inside the tile, clear of the seam rows)
        if (k === 's') {
          if (r < 0.24) { // drift: lit crest row, a longer soft shadow row under it
            const L = 4 + ((q2 * 4) | 0);
            ctx.fillStyle = 'rgba(255,255,255,0.85)'; R(gx(ax + 1), gy(ay), u * L, u);
            ctx.fillStyle = 'rgba(70,100,150,0.20)'; R(gx(ax), gy(ay + 1), u * (L + 2), u);
            ctx.fillStyle = 'rgba(70,100,150,0.10)'; R(gx(ax + 1), gy(ay + 2), u * L, u);
            out.drifts++;
          } else if (r < 0.40) { // sparkle: a white pixel with a faint blue twin
            ctx.fillStyle = 'rgba(255,255,255,0.95)'; R(gx(ax), gy(ay), u, u);
            ctx.fillStyle = 'rgba(120,160,220,0.35)'; R(gx(ax + 3), gy(ay + 2), u, u);
            out.sparkles++;
          }
        } else if (k === 'i') {
          if (r < (nm === 'ice_thin' ? 0.5 : 0.3)) { // crack: a jagged 1 art px line, each step with a lit lip below-right
            let x = ax, y = Math.min(ay, 6);
            const n = 5 + ((q2 * 4) | 0);
            for (let s = 0; s < n; s++) {
              ctx.fillStyle = 'rgba(30,60,110,0.50)'; R(gx(x), gy(y), u, u);
              ctx.fillStyle = 'rgba(255,255,255,0.50)'; R(gx(x + 1), gy(y + 1), u, u);
              const d = dhash(wx * 7 + s, wy * 5 - s, seed + 3);
              if (d < 0.45) x++; else if (d < 0.6 && x > 1) x--; y++;
              if (x > A - 3 || y > A - 3) break;
            }
            out.cracks++;
          } else if (r < 0.45) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; R(gx(ax), gy(ay), u * 2, u); out.sparkles++; }
        } else if (k === 'f' || k === 'm') {
          if (r < (k === 'm' ? 0.3 : 0.4)) { // frost: a small cluster of pale pixels (moss also gets a 3x2 snow patch)
            ctx.fillStyle = 'rgba(232,242,255,0.80)'; R(gx(ax), gy(ay), u, u); R(gx(ax + 1), gy(ay + 1), u, u); R(gx(ax + 3), gy(ay), u, u); R(gx(ax + 2), gy(ay + 3), u, u);
            if (k === 'm') { ctx.fillStyle = 'rgba(240,246,255,0.9)'; R(gx(ax + 5), gy(ay + 2), u * 3, u); R(gx(ax + 6), gy(ay + 1), u, u); ctx.fillStyle = 'rgba(70,100,150,0.2)'; R(gx(ax + 5), gy(ay + 3), u * 3, u); }
            out.frost++;
          }
        } else if (k === 'j') {
          if (r < 0.12) { // root: a dark meandering run with a lit top edge
            let y = ay; const L = 6 + ((q2 * 5) | 0);
            for (let s = 0; s < L && ax + s < A - 1; s++) {
              ctx.fillStyle = 'rgba(46,30,18,0.75)'; R(gx(ax + s), gy(y), u, u);
              ctx.fillStyle = 'rgba(150,110,64,0.55)'; R(gx(ax + s), gy(y - 1), u, u);
              const d = dhash(wx * 3 + s, wy * 11, seed + 4); if (d < 0.25 && y > 3) y--; else if (d > 0.75 && y < A - 3) y++;
            }
            out.roots++;
          } else if (r < 0.34) { // leaf litter: 2-3 leaves of 2x1 art px with a dark under pixel
            const n = 2 + ((q2 * 2) | 0);
            for (let s = 0; s < n; s++) {
              const lx = ax + ((dhash(wx, wy + s, seed + 5) * 6) | 0) - 2, ly = ay + ((dhash(wy, wx + s, seed + 6) * 6) | 0) - 2, c = LEAVES[(dhash(wx + s, wy, seed + 7) * 4) | 0];
              ctx.fillStyle = c; R(gx(lx), gy(ly), u * 2, u);
              ctx.fillStyle = 'rgba(30,20,12,0.35)'; R(gx(lx + 1), gy(ly + 1), u, u);
            }
            out.litter++;
          } else if (r < 0.44) { // moss clump: 2x2 bright moss and one lit pixel
            ctx.fillStyle = 'rgba(112,178,72,0.60)'; R(gx(ax), gy(ay), u * 2, u * 2); R(gx(ax + 2), gy(ay + 1), u, u);
            ctx.fillStyle = 'rgba(176,220,120,0.65)'; R(gx(ax), gy(ay), u, u);
            out.moss++;
          }
        }
        // seam softening on all four sides: neighbour-colour bumps pushed into this tile at seeded spots
        const sides = [[0, -1], [1, 0], [0, 1], [-1, 0]];
        for (let sd = 0; sd < 4; sd++) {
          const n2 = at(wx + sides[sd][0], wy + sides[sd][1]);
          if (n2 < 0 || n2 === t) continue;
          const np = pal[names[n2]], op = pal[nm];
          if (!np) continue;
          // the bake's 2 px dark edge line plus detail()'s neighbour dashes read as a dashed box: the outer art row becomes a soft mid tone
          const soft = op ? softEdge(op[0], op[3]) : null;
          if (soft) {
            ctx.fillStyle = soft;
            if (sd === 0) R(px, py, T, u); else if (sd === 2) R(px, py + T - u, T, u); else if (sd === 1) R(px + T - u, py, u, T); else R(px, py, u, T);
          }
          ctx.fillStyle = np[0];
          let any = false;
          for (let i = 1; i < A - 2; i += 3) {
            const b = dhash(wx * 17 + i, wy * 13 + sd, seed + 8);
            if (b > 0.55) continue;
            const len = b < 0.2 ? 3 : 2, dep = b < 0.12 ? 2 : 1;
            if (sd === 0) R(gx(i), py, u * len, u * dep);
            else if (sd === 2) R(gx(i), py + T - u * dep, u * len, u * dep);
            else if (sd === 1) R(px + T - u * dep, gy(i), u * dep, u * len);
            else R(px, gy(i), u * dep, u * len);
            any = true;
          }
          if (any) out.seams++;
        }
      }
    } catch (e) { /* the bake keeps going without the overlay */ }
    return out;
  }

  // Cycle 0 art (b12-r2-09): the b30 black-sand tiles are 95% #323039 blue-black and read as a void block beside the jungle start.
  // The tile PNGs stay untouched (tests/isle-art-bake pins them); this is an OVERLAY pass the Isles page runs on its own baked chunk:
  // every black_sand tile is re-lit into a warm volcanic-sand ramp by each pixel's brightness (so the b30 grain pattern survives) plus
  // seeded light / dark grains. Bake time only (one get/putImageData per black-sand tile), never per frame. Returns the tile count.
  const WARM_SAND = ['#3b3029', '#4d4038', '#5a4e45', '#6b5d52', '#83725f'];
  function warmSand(ctx, terrain, w, cx, cy, opts) {
    try {
      const o = opts && typeof opts === 'object' ? opts : {};
      const names = o.names || NAMES, T = o.tile | 0 || 32, CH = o.ch | 0 || 16, id = names.indexOf('black_sand');
      if (id < 0 || !ctx || typeof ctx.getImageData !== 'function' || !terrain) return 0;
      const ramp = WARM_SAND.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
      const u = Math.max(1, Math.round(T / 16));
      let n = 0;
      for (let ty = 0; ty < CH; ty++) for (let tx = 0; tx < CH; tx++) {
        const wx = cx * CH + tx, wy = cy * CH + ty;
        if (wx < 0 || wy < 0 || wx >= w || (terrain[wy * w + wx] | 0) !== id) continue;
        const im = ctx.getImageData(tx * T, ty * T, T, T), d = im.data;
        let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i] * 0.3 + d[i + 1] * 0.55 + d[i + 2] * 0.15;
        const mean = sum / (d.length / 4);
        for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
          const i = (y * T + x) * 4, L = d[i] * 0.3 + d[i + 1] * 0.55 + d[i + 2] * 0.15;
          let k = L < mean - 10 ? 1 : L > mean + 18 ? 4 : L > mean + 6 ? 3 : 2;
          const g = dhash(wx * 16 + ((x / u) | 0), wy * 16 + ((y / u) | 0), 9173); // one grain per art pixel, seeded by world tile
          if (k === 2) { if (g < 0.07) k = 1; else if (g > 0.985) k = 4; else if (g > 0.93) k = 3; }
          if (k === 1 && g < 0.02) k = 0;
          const c = ramp[k]; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
        }
        ctx.putImageData(im, tx * T, ty * T);
        n++;
      }
      return n;
    } catch (e) { return 0; }
  }

  return { BIOME_GROUND: BIOME_GROUND, biomeDetail: biomeDetail, WARM_SAND: WARM_SAND, warmSand: warmSand, fieldDetail: fieldDetail, FIELD_TERRAINS: FIELD_TERRAINS, DETAIL_VARIANTS: DETAIL_VARIANTS, detailVariant: detailVariant, detail: detail, SETS: SETS, MEADOW_BASE: MEADOW_BASE, MEADOW_TILES: MEADOW_TILES, MEADOW_BLEND: MEADOW_BLEND, MEADOW_PALETTE: MEADOW_PALETTE, MEADOW_PROPS: MEADOW_PROPS,
    MEADOW_ALIAS: MEADOW_ALIAS, edgeId: edgeId, ICON_BASE: ICON_BASE, ITEM_ICONS: ITEM_ICONS, iconUrl: iconUrl, ARENA: ARENA, loadArena: loadArena, PROP_BASE: PROP_BASE, PROPS: PROPS, PROP_ALIAS: PROP_ALIAS, loadProps: loadProps, propFor: propFor, drawPropArt: drawPropArt,
    BASE: BASE, VARIANTS: VARIANTS, NAMES: NAMES, TERRAINS: TERRAINS, PALETTE: PALETTE, tileId: tileId, idMap: idMap, load: load, create: create };
});
