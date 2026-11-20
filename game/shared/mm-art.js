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
    { id: 'b01-ranger-mage-cleric', classes: ['ranger', 'mage', 'cleric'] }
  ];
  // Mad Maze class id -> art class id (classes without art are absent: callers keep their sprite).
  var CLASS_MAP = { bruiser: 'warrior', ranger: 'ranger', frostcaller: 'mage', herald: 'cleric' };
  var DIRS = { down: 1, up: 1, right: 1 };

  function artClassFor(mmClass) {
    return typeof mmClass === 'string' && Object.prototype.hasOwnProperty.call(CLASS_MAP, mmClass) ? CLASS_MAP[mmClass] : null;
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
        if (!a || typeof a !== 'object' || typeof a.path !== 'string' || typeof a.class !== 'string' || typeof a.action !== 'string' || !DIRS[a.dir]) return;
        if (opts.only && opts.only.indexOf(a.class) < 0) return;
        if (opts.actions && opts.actions.indexOf(a.action) < 0) return;
        if (opts.dirs && opts.dirs.indexOf(a.dir) < 0) return;
        var frames = Math.max(1, Math.floor(num(a.frames, 1)));
        var fw = num(a.frame_w, 256), fh = num(a.frame_h, 256);
        if (fw <= 0 || fh <= 0 || frames > 64) return;
        var anc = a.anchor && typeof a.anchor === 'object' ? a.anchor : {};
        var entry = { ready: false, anim: null };
        var c = set.registry[a.class] || (set.registry[a.class] = Object.create(null));
        c[a.action + '_' + a.dir] = entry;
        var url = join(baseUrl, a.path);
        jobs.push(loadImage(url).then(function (img) {
          if (!img || !img.naturalWidth || img.naturalWidth < fw * frames || img.naturalHeight < fh) { set._warn(a.id || url, 'strip missing or too small: ' + url); return; }
          var muz = Array.isArray(a.muzzle) ? a.muzzle.filter(function (p) { return p && isFinite(p.x) && isFinite(p.y); }) : [];
          entry.anim = {
            id: String(a.id || ''), img: img, frames: frames, fw: fw, fh: fh,
            fps: num(a.fps, 8), loop: !!a.loop, ax: num(anc.x, fw / 2), ay: num(anc.y, fh - 25), muzzle: muz
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
    return packIds(assetRoot).then(function (ids) {
      return Promise.all(ids.map(function (id) { return load(join(assetRoot || ASSET_ROOT, id), 'manifest.json', opts); }));
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

  return { load: load, loadClass: loadClass, loadAll: loadAll, packIds: packIds, artClassFor: artClassFor, packFor: packFor, frameAt: frameAt, duration: duration, PACKS: PACKS, CLASS_MAP: CLASS_MAP, ArtSet: ArtSet };
}));
