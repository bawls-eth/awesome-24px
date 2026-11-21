// MMIsleArt: optional real-PNG tile art for the Hearthvale Isles terrain (Codex batch b30, jungle-terrain-base: 12 terrains x variants a..d, 32x32).
// Sits on top of MMChunkBake: it loads the tile images once, maps pack terrain ids (appended ids 22..33) to the b30 tile ids
// (tile_<terrain>_<a..d>) and bakes chunks with MMChunkBake.bakeChunk, which picks the variant by an integer hash of the world tile coords.
// Anything missing (image failed, art:false, no Image/drawImage) falls back to the code-drawn palette, so the island never goes blank.
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
  // names (optional id->name list, default NAMES) -> { terrainId: terrainName } for the 12 b30 terrains
  function idMap(names) {
    const list = Array.isArray(names) ? names : NAMES, out = {};
    TERRAINS.forEach((t) => { const i = list.indexOf(t); if (i >= 0) out[i] = t; });
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
  // load(opts) -> Promise<{ [terrainId]: [image, ...] } | null>. opts: {base, names, loadImage(url)->Promise<image|null>}
  // Never rejects; a terrain with no loaded variant is simply absent (the bake falls back for it). Resolves null when nothing loaded.
  function load(opts) {
    const o = opts && typeof opts === 'object' ? opts : {};
    const base = typeof o.base === 'string' ? o.base : BASE;
    const li = typeof o.loadImage === 'function' ? o.loadImage : defaultLoadImage;
    const map = idMap(o.names), art = {}, jobs = [];
    Object.keys(map).forEach((id) => {
      art[id] = [];
      VARIANTS.forEach((v, k) => {
        jobs.push(Promise.resolve().then(() => li(base + 'tiles/' + tileId(map[id], v) + '.png')).then((im) => { if (im) art[id][k] = im; }, () => {}));
      });
    });
    return Promise.all(jobs).then(() => {
      let any = false;
      Object.keys(art).forEach((id) => { art[id] = art[id].filter(Boolean); if (art[id].length) any = true; else delete art[id]; });
      return any ? art : null;
    });
  }

  // create(opts) -> isle art baker.
  //  opts: {art: false to force the code-drawn fallback, base, names, palette, loadImage, create (canvas factory), cap (cache size)}
  //  .ready: Promise resolving to this once images are loaded (or failed). .active(): true when real art is in use.
  //  .chunk(terrain, w, cx, cy): cached baked canvas (null when no canvas is available). Bakes with the art that is loaded NOW.
  //  .bake(ctx, terrain, w, cx, cy): paints straight onto a ctx (returns tiles painted).
  function create(opts) {
    const o = opts && typeof opts === 'object' ? opts : {};
    const names = Array.isArray(o.names) ? o.names : NAMES;
    const palette = o.palette || PALETTE;
    const cache = Bake.makeCache(o.cap);
    let art = null;
    const self = {
      palette: palette, names: names,
      active: () => !!art,
      bake: (ctx, terrain, w, cx, cy) => Bake.bakeChunk(ctx, terrain, w, cx, cy, palette, art, { names: names }),
      chunk: (terrain, w, cx, cy) => cache.get(cx + ',' + cy, () => Bake.bakeChunkCanvas(o.create, terrain, w, cx, cy, palette, art, { names: names })),
      clear: () => cache.clear(),
      cacheSize: () => cache.size()
    };
    self.ready = o.art === false ? Promise.resolve(self)
      : load({ base: o.base, names: names, loadImage: o.loadImage }).then((a) => { art = a; cache.clear(); return self; }, () => self);
    return self;
  }

  return { BASE: BASE, VARIANTS: VARIANTS, NAMES: NAMES, TERRAINS: TERRAINS, PALETTE: PALETTE, tileId: tileId, idMap: idMap, load: load, create: create };
});
