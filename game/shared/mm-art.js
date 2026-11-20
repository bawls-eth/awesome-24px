// MMArt: manifest-driven hero animation loader and drawer (UMD, browser global MMArt).
// Reads the arcane pack manifests (id, class, action, dir, path, frames, frame_w/h, fps, loop, anchor, muzzle),
// loads the strips, and draws frames feet-anchored with left mirrored from right. Never throws:
// a missing manifest, a failed strip or an unknown class just yields null so callers use their procedural sprite.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.MMArt = factory(root);
}(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  var ASSET_ROOT = 'assets/arcane/';
  // Registry of shipped packs: which classes each one carries. Add b02.. here as they land.
  var PACKS = [
    { id: 'b00-warrior', classes: ['warrior'] },
    { id: 'b01-ranger-mage-cleric', classes: ['ranger', 'mage', 'cleric'] },
    { id: 'b02-rogue-warlock-paladin', classes: ['rogue', 'warlock', 'paladin'] },
    { id: 'b03-berserker-druid-necromancer', classes: ['berserker', 'druid', 'necromancer'] }
  ];
  // Mad Maze class id -> art class id (classes without art are absent: callers keep their sprite).
  var CLASS_MAP = { bruiser: 'warrior', ranger: 'ranger', frostcaller: 'mage', herald: 'cleric',
    rogue: 'rogue', warlock: 'warlock', paladin: 'paladin', berserker: 'berserker', druid: 'druid', necromancer: 'necromancer' };
  var DIRS = { down: 1, up: 1, right: 1 };
  // Mad Maze arena enemy type (RM_ENEMIES key) -> art creature id. The boss and unknown types are absent (procedural sprite stays).
  var ENEMY_MAP = { spiral: 'moth', aimed: 'archer', ring: 'puffcap' };
  // Biome-aware skins: biome id -> { enemy type -> art creature id }. Looked up before ENEMY_MAP; types/biomes not listed fall back to ENEMY_MAP.
  // Deterministic (no randomness): the dark spider is the Frost Mire's ranged 'aimed' enemy. Hitboxes and stats are untouched (art only).
  var BIOME_ENEMY_MAP = { frost: { aimed: 'dark_spider' } };
  // Ambient drifter kind -> art creature id.
  var DRIFTER_MAP = { wisp: 'mothling', cinder: 'beetle', puff: 'sprout' };
  // Visible creature width in px at scale 1 (cells are 256 wide, creatures fill about half): callers size the art off this.
  var ENEMY_VISIBLE_W = 130;
  // Arena boss art (batch b07-frontier-bosses, 384px cells, 'down' only). BOSS_MAP is indexed by boss tier (0 = the first boss, Gloomheart ->
  // void_oracle, whose pink/purple fits); later tiers walk the rest of the list and wrap. Deterministic: no randomness, same tier -> same boss.
  var BOSS_MAP = ['void_oracle', 'bone_colossus', 'inferno_wyrm', 'crystal_titan', 'forest_warden', 'dread_knight', 'storm_harbinger', 'mire_queen'];
  var BOSS_ACTIONS = ['idle', 'move', 'attack_a', 'attack_b', 'hit', 'death'];
  var BOSS_VISIBLE_W = 220; // typical visible body width in px inside a 384 cell

  function artClassFor(mmClass) {
    return typeof mmClass === 'string' && Object.prototype.hasOwnProperty.call(CLASS_MAP, mmClass) ? CLASS_MAP[mmClass] : null;
  }
  function enemyArtFor(type, biomeId) {
    if (typeof type === 'string' && typeof biomeId === 'string' && Object.prototype.hasOwnProperty.call(BIOME_ENEMY_MAP, biomeId)) {
      var bm = BIOME_ENEMY_MAP[biomeId];
      if (Object.prototype.hasOwnProperty.call(bm, type)) return bm[type];
    }
    return typeof type === 'string' && Object.prototype.hasOwnProperty.call(ENEMY_MAP, type) ? ENEMY_MAP[type] : null;
  }
  function drifterArtFor(kind) {
    return typeof kind === 'string' && Object.prototype.hasOwnProperty.call(DRIFTER_MAP, kind) ? DRIFTER_MAP[kind] : null;
  }
  function bossArtFor(tier) {
    var t = Math.floor(Number(tier));
    if (!isFinite(t) || t < 0) t = 0;
    return BOSS_MAP[t % BOSS_MAP.length];
  }
  function packFor(artClass) {
    for (var i = 0; i < PACKS.length; i++) if (PACKS[i].classes.indexOf(artClass) >= 0) return PACKS[i];
    return null;
  }
  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function join(base, rel) {
    base = String(base || '');
    if (base && base.charAt(base.length - 1) !== '/') base += '/';
    return base + String(rel || '');
  }

  function ArtSet() {
    this.registry = Object.create(null); // class -> 'action_dir' -> entry
    this.warned = Object.create(null);
  }
  ArtSet.prototype.classes = function () { return Object.keys(this.registry); };
  ArtSet.prototype.has = function (heroClass) { return !!this.registry[heroClass]; };
  ArtSet.prototype._warn = function (key, msg) {
    if (this.warned[key]) return;
    this.warned[key] = 1;
    try { if (root.console && root.console.warn) root.console.warn('[MMArt] ' + msg); } catch (e) { /* ignore */ }
  };
  // Merge another set (several packs behind one registry). Later packs win on duplicate keys.
  ArtSet.prototype.merge = function (other) {
    if (!other || !other.registry) return this;
    Object.keys(other.registry).forEach(function (c) {
      if (!this.registry[c]) this.registry[c] = Object.create(null);
      Object.keys(other.registry[c]).forEach(function (k) { this.registry[c][k] = other.registry[c][k]; }, this);
    }, this);
    return this;
  };
  // Resolve a strip. Left is the mirror of right (the caller passes flip to draw()). null when absent or not loaded.
  ArtSet.prototype.anim = function (heroClass, action, dir) {
    var c = this.registry[heroClass]; if (!c) return null;
    if (dir === 'left') dir = 'right';
    var e = c[action + '_' + dir];
    if (!e || !e.ready) return null;
    return e.anim;
  };
  // Draw frame for time t (seconds since the animation started). Feet-anchored at x,y; flip mirrors about the anchor.
  // Returns the frame index drawn, or -1 when nothing was drawn.
  ArtSet.prototype.draw = function (ctx, anim, t, x, y, scale, flip) {
    if (!ctx || !anim || !anim.img) return -1;
    var f = frameAt(anim, t);
    var s = num(scale, 1) > 0 ? num(scale, 1) : 1;
    // Per-view display scale (scales.json) equalises standing height; the feet anchor stays put because ax/ay scale with it.
    var k = num(anim.scale, 1); if (!(k > 0)) k = 1;
    s *= k;
    var smooth = ctx.imageSmoothingEnabled;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(Math.round(num(x, 0)), Math.round(num(y, 0)));
    if (flip) ctx.scale(-1, 1);
    // One fixed scale for every frame: never per-frame rescaling.
    ctx.drawImage(anim.img, f * anim.fw, 0, anim.fw, anim.fh, -anim.ax * s, -anim.ay * s, anim.fw * s, anim.fh * s);
    ctx.restore();
    ctx.imageSmoothingEnabled = smooth;
    return f;
  };

  function frameAt(anim, t) {
    var n = Math.max(1, anim.frames | 0);
    var i = Math.floor(Math.max(0, num(t, 0)) * Math.max(0, anim.fps));
    if (anim.loop) return i % n;
    return Math.min(n - 1, i);
  }
  function duration(anim) { return anim && anim.fps > 0 ? anim.frames / anim.fps : 0; }

  var imageCache = Object.create(null); // url -> Promise<Image|null>
  function loadImage(url) {
    if (imageCache[url]) return imageCache[url];
    imageCache[url] = new Promise(function (resolve) {
      try {
        var img = new root.Image();
        img.onload = function () { resolve(img); };
        img.onerror = function () { resolve(null); };
        img.src = url;
      } catch (e) { resolve(null); }
    });
    return imageCache[url];
  }
  function fetchJson(url) {
    return root.fetch(url).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }

  // scales.json: { scales: { <asset id>: { display_scale } } }. Missing or malformed file -> every scale is 1.
  function scaleFor(table, id) {
    var e = table && typeof id === 'string' && Object.prototype.hasOwnProperty.call(table, id) ? table[id] : null;
    var v = e && typeof e === 'object' ? Number(e.display_scale) : NaN;
    return isFinite(v) && v > 0.25 && v < 4 ? v : 1;
  }
  function loadScales(assetRoot) {
    return fetchJson(join(assetRoot || ASSET_ROOT, 'scales.json')).then(function (j) {
      return j && typeof j === 'object' && j.scales && typeof j.scales === 'object' ? j.scales : {};
    }).catch(function () { return {}; });
  }

  // load(baseUrl, manifestUrl, opts?) -> Promise<ArtSet>. Never rejects.
  // opts.only: array of classes to load; opts.actions: array of actions to load (e.g. ['idle']); opts.dirs likewise.
  function load(baseUrl, manifestUrl, opts) {
    opts = opts || {};
    var set = new ArtSet();
    var murl = /^(?:[a-z]+:)?\//i.test(String(manifestUrl || '')) || !baseUrl ? manifestUrl : join(baseUrl, manifestUrl);
    return fetchJson(murl).then(function (m) {
      var assets = m && Array.isArray(m.assets) ? m.assets : [];
      var jobs = [];
      assets.forEach(function (a) {
        var key = a && typeof a.class === 'string' ? a.class : (a && typeof a.enemy === 'string' ? a.enemy : (a && typeof a.boss === 'string' ? a.boss : null)); // heroes are keyed by class, enemies by creature name, bosses by boss id (items have no action/dir and are skipped here)
        if (!a || typeof a !== 'object' || typeof a.path !== 'string' || !key || typeof a.action !== 'string' || !DIRS[a.dir]) return;
        if (opts.only && opts.only.indexOf(key) < 0) return;
        if (opts.actions && opts.actions.indexOf(a.action) < 0) return;
        if (opts.dirs && opts.dirs.indexOf(a.dir) < 0) return;
        if (opts.actionDirs && Object.prototype.hasOwnProperty.call(opts.actionDirs, a.action) && opts.actionDirs[a.action].indexOf(a.dir) < 0) return; // per-action dir limit (e.g. death: down/right only)
        var frames = Math.max(1, Math.floor(num(a.frames, 1)));
        var fw = num(a.frame_w, 256), fh = num(a.frame_h, 256);
        if (fw <= 0 || fh <= 0 || frames > 64) return;
        var anc = a.anchor && typeof a.anchor === 'object' ? a.anchor : {};
        var entry = { ready: false, anim: null };
        var c = set.registry[key] || (set.registry[key] = Object.create(null));
        c[a.action + '_' + a.dir] = entry;
        var url = join(baseUrl, a.path);
        jobs.push(loadImage(url).then(function (img) {
          if (!img || !img.naturalWidth || img.naturalWidth < fw * frames || img.naturalHeight < fh) { set._warn(a.id || url, 'strip missing or too small: ' + url); return; }
          var muz = Array.isArray(a.muzzle) ? a.muzzle.filter(function (p) { return p && isFinite(p.x) && isFinite(p.y); }) : [];
          entry.anim = {
            id: String(a.id || ''), img: img, frames: frames, fw: fw, fh: fh,
            fps: num(a.fps, 8), loop: !!a.loop, scale: scaleFor(opts.scales, a.id), ax: num(anc.x, fw / 2), ay: num(anc.y, fh - 25), muzzle: muz
          };
          entry.ready = true;
        }));
      });
      return Promise.all(jobs).then(function () { return set; });
    }).catch(function () { return set; });
  }

  // The pack folders to load: every batch listed in INDEX.json (new batches appear with no code change), plus the static registry above as a floor.
  function packIds(assetRoot) {
    var ids = PACKS.map(function (p) { return p.id; });
    return fetchJson(join(assetRoot || ASSET_ROOT, 'INDEX.json')).then(function (idx) {
      if (idx && Array.isArray(idx.batches)) idx.batches.forEach(function (b) {
        var id = b && typeof b.path === 'string' ? b.path.replace(/\/+$/, '').split('/').pop() : '';
        if (/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(id) && ids.indexOf(id) < 0) ids.push(id);
      });
      return ids;
    });
  }
  function loadPacks(assetRoot, opts) {
    return Promise.all([packIds(assetRoot), loadScales(assetRoot)]).then(function (r) {
      var ids = r[0], o = {}; for (var k in opts || {}) o[k] = opts[k];
      if (!o.scales) o.scales = r[1];
      return Promise.all(ids.map(function (id) { return load(join(assetRoot || ASSET_ROOT, id), 'manifest.json', o); }));
    }).then(function (sets) { var s = new ArtSet(); sets.forEach(function (x) { s.merge(x); }); return s; });
  }
  // loadClass(assetRoot, artClass, opts?) -> Promise<ArtSet>: only that class's strips are loaded (every pack's manifest is read).
  function loadClass(assetRoot, artClass, opts) {
    if (typeof artClass !== 'string' || !artClass) return Promise.resolve(new ArtSet());
    var o = {}; for (var k in opts || {}) o[k] = opts[k];
    o.only = [artClass];
    return loadPacks(assetRoot, o);
  }
  // loadAll(assetRoot, opts?) -> one set holding every pack listed in INDEX.json (plus the registered ones).
  function loadAll(assetRoot, opts) { return loadPacks(assetRoot, opts); }

  // loadEnemies(assetRoot) -> Promise<ArtSet> holding only the mapped arena creatures: idle/move/attack, plus death for the down/right dirs only (memory).
  function loadEnemies(assetRoot, opts) {
    var o = {}; for (var k in opts || {}) o[k] = opts[k];
    var only = [];
    var maps = [ENEMY_MAP, DRIFTER_MAP];
    Object.keys(BIOME_ENEMY_MAP).forEach(function (b) { maps.push(BIOME_ENEMY_MAP[b]); });
    maps.forEach(function (m) { Object.keys(m).forEach(function (t) { if (only.indexOf(m[t]) < 0) only.push(m[t]); }); });
    o.only = only; o.actions = ['idle', 'move', 'attack', 'death']; o.actionDirs = { death: ['down', 'right'] };
    return loadPacks(assetRoot, o);
  }

  // ---------- item icons (separate from the animation loader) ----------
  // Realm item id -> item art id (art ids come from the item manifests). Rarity never changes the art (CSS tints the border).
  // Unknown ids or art that is not shipped resolve to null so callers keep their emoji.
  var ITEM_ICON_MAP = {
    sparkwand: 'wand_spark', quickwand: 'wand_ember',
    heartcharm: 'accessory_red_garnet_heart_pendant', swiftcharm: 'accessory_gold_feather_brooch',
    luckring: 'accessory_copper_emerald_ring', scholarring: 'accessory_sapphire_wave_ring', wardring: 'accessory_gold_ruby_signet'
  };
  var ITEM_BATCH_RE = /(items|weapons|armor|headgear|clothing|accessories|consumables)/;
  var lastItemSet = null;

  function ItemSet() { this.byId = Object.create(null); this.images = Object.create(null); this.bad = Object.create(null); }
  ItemSet.prototype.has = function (id) { return typeof id === 'string' && !!this.byId[id]; };
  ItemSet.prototype.ids = function () { return Object.keys(this.byId); };
  ItemSet.prototype.tags = function (id) { var e = this.has(id) ? this.byId[id] : null; return e ? e.tags.slice() : []; };
  // Url for a game item id (via ITEM_ICON_MAP) or a raw art id. null when unmapped, unknown, or the PNG already failed to load. Never throws.
  ItemSet.prototype.iconUrl = function (id) {
    try {
      if (typeof id !== 'string') return null;
      var art = Object.prototype.hasOwnProperty.call(ITEM_ICON_MAP, id) ? ITEM_ICON_MAP[id] : id;
      var e = this.byId[art];
      if (!e || this.bad[art]) return null;
      this.image(art);
      return e.url;
    } catch (err) { return null; }
  };
  // Lazily creates and caches the Image for an art id (null when unknown).
  ItemSet.prototype.image = function (art) {
    try {
      var e = this.byId[art]; if (!e) return null;
      if (this.images[art]) return this.images[art];
      var img = new root.Image(), self = this;
      img.onerror = function () { self.bad[art] = 1; };
      img.src = e.url;
      this.images[art] = img;
      return img;
    } catch (err) { return null; }
  };
  ItemSet.prototype.markBad = function (id) {
    var art = Object.prototype.hasOwnProperty.call(ITEM_ICON_MAP, id) ? ITEM_ICON_MAP[id] : id;
    if (typeof art === 'string') this.bad[art] = 1;
  };

  // loadItems(assetRoot) -> Promise<ItemSet>. Reads INDEX.json and only the item batch manifests; no PNGs are fetched until used. Never rejects.
  function loadItems(assetRoot) {
    var base = assetRoot || ASSET_ROOT, set = new ItemSet();
    return fetchJson(join(base, 'INDEX.json')).then(function (idx) {
      var ids = [];
      if (idx && Array.isArray(idx.batches)) idx.batches.forEach(function (b) {
        var id = b && typeof b.path === 'string' ? b.path.replace(/\/+$/, '').split('/').pop() : '';
        if (/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(id) && ITEM_BATCH_RE.test(id) && ids.indexOf(id) < 0) ids.push(id);
      });
      return Promise.all(ids.map(function (id) {
        return fetchJson(join(join(base, id), 'manifest.json')).then(function (m) {
          (m && Array.isArray(m.assets) ? m.assets : []).forEach(function (a) {
            if (!a || a.category !== 'item' || typeof a.id !== 'string' || typeof a.path !== 'string') return;
            if (!/^[A-Za-z0-9_.\/-]+$/.test(a.path) || a.path.indexOf('..') >= 0) return;
            set.byId[a.id] = { url: join(join(base, id), a.path), tags: Array.isArray(a.tags) ? a.tags.filter(function (t) { return typeof t === 'string'; }) : [] };
          });
        });
      }));
    }).then(function () { lastItemSet = set; return set; }).catch(function () { return set; });
  }
  // itemIconUrl(id, set?) -> url string or null (uses the most recently loaded ItemSet when none is given). Never throws.
  function itemIconUrl(id, set) {
    try { var s = set || lastItemSet; return s && typeof s.iconUrl === 'function' ? s.iconUrl(id) : null; } catch (e) { return null; }
  }

  // loadBosses(assetRoot, ids?, opts?) -> Promise<ArtSet> holding only the named bosses (default: the tier-0 boss), idle/move/attack_a/attack_b/hit/death.
  function loadBosses(assetRoot, ids, opts) {
    var o = {}; for (var k in opts || {}) o[k] = opts[k];
    var only = (Array.isArray(ids) ? ids : [BOSS_MAP[0]]).filter(function (x) { return BOSS_MAP.indexOf(x) >= 0; });
    if (!only.length) return Promise.resolve(new ArtSet());
    o.only = only; o.actions = o.actions || BOSS_ACTIONS;
    return loadPacks(assetRoot, o);
  }

  return { bossArtFor: bossArtFor, loadBosses: loadBosses, BOSS_MAP: BOSS_MAP, BOSS_VISIBLE_W: BOSS_VISIBLE_W, BOSS_ACTIONS: BOSS_ACTIONS, loadItems: loadItems, itemIconUrl: itemIconUrl, ITEM_ICON_MAP: ITEM_ICON_MAP, ItemSet: ItemSet, enemyArtFor: enemyArtFor, drifterArtFor: drifterArtFor, loadEnemies: loadEnemies, ENEMY_MAP: ENEMY_MAP, BIOME_ENEMY_MAP: BIOME_ENEMY_MAP, DRIFTER_MAP: DRIFTER_MAP, ENEMY_VISIBLE_W: ENEMY_VISIBLE_W, load: load, loadClass: loadClass, loadAll: loadAll, packIds: packIds, artClassFor: artClassFor, packFor: packFor, frameAt: frameAt, scaleFor: scaleFor, duration: duration, PACKS: PACKS, CLASS_MAP: CLASS_MAP, ArtSet: ArtSet };
}));
