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
  function detail(ctx, terrain, w, h, cx, cy, opts) {
    try {
      const o = opts && typeof opts === 'object' ? opts : {};
      const names = o.names || NAMES, pal = o.palette || PALETTE, T = o.tile | 0 || 32, CH = o.ch | 0 || 16, seed = o.seed | 0;
      if (!ctx || typeof ctx.fillRect !== 'function' || !terrain) return 0;
      const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? terrain[y * w + x] | 0 : -1);
      const u = Math.max(1, Math.round(T / 16)); // one art pixel (2 px on a 32 px tile)
      let n = 0;
      for (let ty = 0; ty < CH; ty++) for (let tx = 0; tx < CH; tx++) {
        const wx = cx * CH + tx, wy = cy * CH + ty, t = at(wx, wy);
        if (t < 0) continue;
        const nm = names[t], p = pal[nm];
        if (!p) continue;
        const px = tx * T, py = ty * T, v = detailVariant(wx, wy, seed), r2 = dhash(wy, wx, seed + 7);
        const ox = px + u * (2 + Math.floor(r2 * 10)), oy = py + u * (2 + Math.floor(dhash(wx + 3, wy, seed) * 10));
        if (WATERY.test(nm)) {
          if (v < 3) { ctx.fillStyle = p[2]; ctx.fillRect(ox, oy, u * 3, u); ctx.fillRect(ox + u * 3, oy - u, u * 2, u); }
        } else if (v === 1) { ctx.fillStyle = p[1]; ctx.fillRect(ox, oy, u, u); ctx.fillRect(ox + u * 3, oy + u * 2, u, u); }
        else if (v === 2) { ctx.fillStyle = p[2]; ctx.fillRect(ox, oy, u, u * 2); ctx.fillRect(ox - u, oy - u, u, u); ctx.fillRect(ox + u, oy - u, u, u); }
        else if (v === 3) { ctx.fillStyle = p[3]; ctx.fillRect(ox, oy + u, u * 2, u); ctx.fillStyle = p[2]; ctx.fillRect(ox, oy, u * 2, u); }
        else if (v === 4) { ctx.fillStyle = p[2]; ctx.fillRect(ox, oy, u * 3, u); }
        else if (v === 5) { ctx.fillStyle = p[1]; ctx.fillRect(ox + u, oy, u, u * 3); ctx.fillRect(ox, oy + u, u * 3, u); }
        else if (v === 6) { ctx.fillStyle = p[1]; for (let k = 0; k < 4; k++) ctx.fillRect(ox + (k & 1) * u, oy + (k >> 1) * u * 2 + (k & 1) * u, u, u); }
        else if (v === 7) { ctx.fillStyle = p[1]; ctx.fillRect(px, py, u * 2, u * 2); }
        // stepped edges: where the east / south neighbour is another terrain, its base colour bites in 4-px steps (an 8-bit stair line)
        const e = at(wx + 1, wy), s2 = at(wx, wy + 1);
        if (e >= 0 && e !== t && pal[names[e]]) { ctx.fillStyle = pal[names[e]][0]; for (let k = (wy & 1) * 2 * u; k < T; k += 4 * u) ctx.fillRect(px + T - u, py + k, u, 2 * u); }
        if (s2 >= 0 && s2 !== t && pal[names[s2]]) { ctx.fillStyle = pal[names[s2]][0]; for (let k = (wx & 1) * 2 * u; k < T; k += 4 * u) ctx.fillRect(px + k, py + T - u, 2 * u, u); }
        n++;
      }
      return n;
    } catch (e) { return 0; }
  }

  return { DETAIL_VARIANTS: DETAIL_VARIANTS, detailVariant: detailVariant, detail: detail, SETS: SETS, MEADOW_BASE: MEADOW_BASE, MEADOW_TILES: MEADOW_TILES, MEADOW_BLEND: MEADOW_BLEND, MEADOW_PALETTE: MEADOW_PALETTE, MEADOW_PROPS: MEADOW_PROPS,
    MEADOW_ALIAS: MEADOW_ALIAS, edgeId: edgeId, ICON_BASE: ICON_BASE, ITEM_ICONS: ITEM_ICONS, iconUrl: iconUrl, ARENA: ARENA, loadArena: loadArena, PROP_BASE: PROP_BASE, PROPS: PROPS, PROP_ALIAS: PROP_ALIAS, loadProps: loadProps, propFor: propFor, drawPropArt: drawPropArt,
    BASE: BASE, VARIANTS: VARIANTS, NAMES: NAMES, TERRAINS: TERRAINS, PALETTE: PALETTE, tileId: tileId, idMap: idMap, load: load, create: create };
});
