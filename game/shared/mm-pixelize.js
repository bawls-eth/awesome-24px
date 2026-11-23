/* MMPixelize: bake any sprite source (SVG/PNG image, canvas, strip frame) into a clean 8-bit pixel sprite ONCE at load.
   Interim art improvement until the hand-made remakes land. Browser: window.MMPixelize. Node: module.exports.
   Pure pixel ops work on { w, h, data: Uint8ClampedArray RGBA } and are deterministic (no randomness, no clock, no network).
   Pipeline: area-average downscale -> alpha threshold -> palette quantise (median cut or a fixed ramp, optional ordered
   2-tone dither) -> bottom-right shade + top-left highlight -> 1 px colour-matched dark outline -> final colour cap.
   Docs: game/design/PIXELIZE.md */
(function (root) {
  'use strict';

  var SIZE_CLASSES = { S16: 16, M32: 32, L48: 48, XL64: 64 };
  var DEFAULTS = {
    size: 32,          // native output size in px (square); use sizeClassFor() / SIZE_CLASSES
    pad: 1,            // transparent border kept free for the outline
    alpha: 80,         // alpha threshold (0..255): >= becomes opaque, below becomes transparent
    colors: 7,         // median-cut palette size for the body (before shade/highlight/outline)
    maxColors: 16,     // final cap on distinct colours after every pass
    ramp: null,        // optional fixed ramp: array of '#rrggbb' (e.g. MM8.PAL); overrides median cut
    dither: 0,         // 0..1 ordered (Bayer 2x2) dither strength applied before palette mapping
    outline: 0.72,     // 0..1 how much darker the outline is than the pixel it wraps (colour-matched, never pure black)
    highlight: 0.22,   // 0..1 lighten toward warm white on top-left edge pixels (0 = off)
    shade: 0.18,       // 0..1 darken bottom-right edge pixels for a cheap 2-tone volume (0 = off)
    saturate: 0.12     // 0..1 small saturation boost so flat vector fills read as deliberate colour
  };

  function img(w, h, data) { return { w: w, h: h, data: data || new Uint8ClampedArray(w * h * 4) }; }
  function clone(a) { return img(a.w, a.h, new Uint8ClampedArray(a.data)); }
  function merge(o) { var r = {}, k; for (k in DEFAULTS) r[k] = DEFAULTS[k]; if (o) for (k in o) if (o[k] !== undefined) r[k] = o[k]; return r; }
  function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : Math.round(v); }
  function hexRgb(h) { var s = String(h || '').replace('#', ''); if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    var n = parseInt(s, 16); return isNaN(n) ? [0, 0, 0] : [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

  // (a) Area-average downscale of a sw x sh RGBA buffer into tw x th. Alpha-premultiplied so transparent pixels never
  // bleed dark fringes into the colour. Handles fractional source footprints exactly (box filter).
  function areaDownscale(src, tw, th) {
    var sw = src.w, sh = src.h, s = src.data, out = img(tw, th), o = out.data;
    var fx = sw / tw, fy = sh / th;
    for (var ty = 0; ty < th; ty++) {
      var y0 = ty * fy, y1 = y0 + fy;
      for (var tx = 0; tx < tw; tx++) {
        var x0 = tx * fx, x1 = x0 + fx, r = 0, g = 0, b = 0, a = 0, area = 0;
        for (var sy = Math.floor(y0); sy < Math.ceil(y1) && sy < sh; sy++) {
          var wy = Math.min(y1, sy + 1) - Math.max(y0, sy);
          if (wy <= 0) continue;
          for (var sx = Math.floor(x0); sx < Math.ceil(x1) && sx < sw; sx++) {
            var wx = Math.min(x1, sx + 1) - Math.max(x0, sx);
            if (wx <= 0) continue;
            var w = wx * wy, i = (sy * sw + sx) * 4, al = s[i + 3] * w;
            r += s[i] * al; g += s[i + 1] * al; b += s[i + 2] * al; a += al; area += w;
          }
        }
        var j = (ty * tw + tx) * 4;
        if (a > 0) { o[j] = clamp(r / a); o[j + 1] = clamp(g / a); o[j + 2] = clamp(b / a); }
        o[j + 3] = area > 0 ? clamp(a / area) : 0;
      }
    }
    return out;
  }

  // (c) Hard pixel edges: alpha >= t -> 255, else fully transparent (rgb cleared).
  function alphaThreshold(a, t) {
    var out = clone(a), d = out.data; t = t == null ? DEFAULTS.alpha : t;
    for (var i = 0; i < d.length; i += 4) { if (d[i + 3] >= t) d[i + 3] = 255; else { d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0; } }
    return out;
  }

  // (b) Median cut over opaque pixels, weighted by count. Deterministic: ties split on the lower channel index, boxes
  // are processed in a fixed order, palette sorted by luminance. Returns an array of [r,g,b].
  function medianCut(a, n) {
    var d = a.data, hist = {}, keys = [], i;
    for (i = 0; i < d.length; i += 4) { if (d[i + 3] < 255) continue;
      var k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      if (hist[k] === undefined) { hist[k] = 0; keys.push(k); } hist[k]++; }
    if (!keys.length) return [];
    keys.sort(function (x, y) { return x - y; });
    var cols = keys.map(function (k) { return [(k >> 16) & 255, (k >> 8) & 255, k & 255, hist[k]]; });
    var boxes = [cols];
    while (boxes.length < n) {
      var bi = -1, bestRange = 0, bc = 0;
      for (i = 0; i < boxes.length; i++) { if (boxes[i].length < 2) continue;
        for (var c = 0; c < 3; c++) { var lo = 255, hi = 0;
          for (var m = 0; m < boxes[i].length; m++) { var v = boxes[i][m][c]; if (v < lo) lo = v; if (v > hi) hi = v; }
          var rng = (hi - lo) * (c === 1 ? 1.2 : 1); if (rng > bestRange) { bestRange = rng; bi = i; bc = c; } } }
      if (bi < 0) break;
      var box = boxes[bi].slice().sort(function (x, y) { return x[bc] - y[bc] || x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; });
      var total = 0; for (i = 0; i < box.length; i++) total += box[i][3];
      var acc = 0, cut = 1; for (i = 0; i < box.length - 1; i++) { acc += box[i][3]; if (acc >= total / 2) { cut = i + 1; break; } cut = i + 1; }
      boxes.splice(bi, 1, box.slice(0, cut), box.slice(cut));
    }
    var pal = boxes.map(function (b) { var r = 0, g = 0, bl = 0, w = 0;
      for (var q = 0; q < b.length; q++) { r += b[q][0] * b[q][3]; g += b[q][1] * b[q][3]; bl += b[q][2] * b[q][3]; w += b[q][3]; }
      return [Math.round(r / w), Math.round(g / w), Math.round(bl / w)]; });
    pal.sort(function (x, y) { return lum(x) - lum(y) || x[0] - y[0] || x[1] - y[1]; });
    return pal;
  }
  function lum(c) { return c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114; }
  function nearestIdx(pal, r, g, b) { var best = 0, bd = Infinity;
    for (var i = 0; i < pal.length; i++) { var p = pal[i], dr = p[0] - r, dg = p[1] - g, db = p[2] - b;
      var dd = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11; if (dd < bd) { bd = dd; best = i; } } return best; }

  // Map every opaque pixel to the palette. dither (0..1) adds a 2x2 Bayer offset first, giving a 2-tone checker on gradients.
  var BAYER = [-0.375, 0.125, 0.375, -0.125];
  function quantise(a, palette, dither) {
    var out = clone(a), d = out.data, amt = (dither || 0) * 48;
    if (!palette || !palette.length) return out;
    for (var y = 0; y < a.h; y++) for (var x = 0; x < a.w; x++) { var i = (y * a.w + x) * 4; if (d[i + 3] < 255) continue;
      var off = amt ? BAYER[(y & 1) * 2 + (x & 1)] * amt : 0;
      var p = palette[nearestIdx(palette, d[i] + off, d[i + 1] + off, d[i + 2] + off)];
      d[i] = p[0]; d[i + 1] = p[1]; d[i + 2] = p[2]; }
    return out;
  }

  function saturate(a, s) {
    if (!s) return a; var out = clone(a), d = out.data;
    for (var i = 0; i < d.length; i += 4) { if (!d[i + 3]) continue; var l = lum([d[i], d[i + 1], d[i + 2]]);
      d[i] = clamp(l + (d[i] - l) * (1 + s)); d[i + 1] = clamp(l + (d[i + 1] - l) * (1 + s)); d[i + 2] = clamp(l + (d[i + 2] - l) * (1 + s)); }
    return out;
  }

  function opaqueAt(a, x, y) { return x >= 0 && y >= 0 && x < a.w && y < a.h && a.data[(y * a.w + x) * 4 + 3] === 255; }

  // (d) Light from top-left: lighten edge pixels whose top or left neighbour is empty; darken those whose bottom or
  // right neighbour is empty. Reads the input mask, so passes never feed each other.
  function lightPass(a, highlight, shade) {
    var out = clone(a), d = out.data;
    for (var y = 0; y < a.h; y++) for (var x = 0; x < a.w; x++) { if (!opaqueAt(a, x, y)) continue;
      var i = (y * a.w + x) * 4, top = !opaqueAt(a, x, y - 1) || !opaqueAt(a, x - 1, y), bot = !opaqueAt(a, x, y + 1) || !opaqueAt(a, x + 1, y);
      if (highlight && top && !bot) { d[i] = clamp(d[i] + (255 - d[i]) * highlight); d[i + 1] = clamp(d[i + 1] + (248 - d[i + 1]) * highlight); d[i + 2] = clamp(d[i + 2] + (225 - d[i + 2]) * highlight * 0.8); }
      else if (shade && bot && !top) { d[i] = clamp(d[i] * (1 - shade)); d[i + 1] = clamp(d[i + 1] * (1 - shade)); d[i + 2] = clamp(d[i + 2] * (1 - shade * 0.6)); }
    }
    return out;
  }

  // (d) 1 px colour-matched dark outline: every empty pixel 4-adjacent to the sprite takes the darkest neighbour colour,
  // darkened by `strength` and pulled slightly toward a cool ink so it never reads as pure black.
  function outline(a, strength) {
    var out = clone(a), d = out.data, s = a.data; strength = strength == null ? DEFAULTS.outline : strength;
    if (strength <= 0) return out;
    var NB = [[0, -1], [-1, 0], [1, 0], [0, 1]];
    for (var y = 0; y < a.h; y++) for (var x = 0; x < a.w; x++) { if (opaqueAt(a, x, y)) continue;
      var best = -1, bl = Infinity;
      for (var n = 0; n < 4; n++) { var nx = x + NB[n][0], ny = y + NB[n][1]; if (!opaqueAt(a, nx, ny)) continue;
        var j = (ny * a.w + nx) * 4, l = lum([s[j], s[j + 1], s[j + 2]]); if (l < bl) { bl = l; best = j; } }
      if (best < 0) continue;
      var i = (y * a.w + x) * 4, k = 1 - strength;
      d[i] = clamp(s[best] * k + 14 * strength); d[i + 1] = clamp(s[best + 1] * k + 12 * strength); d[i + 2] = clamp(s[best + 2] * k + 30 * strength); d[i + 3] = 255;
    }
    return out;
  }

  function countColors(a) { var seen = {}, n = 0, d = a.data;
    for (var i = 0; i < d.length; i += 4) { if (!d[i + 3]) continue; var k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]; if (!seen[k]) { seen[k] = 1; n++; } }
    return n; }
  function paletteOf(a) { var seen = {}, out = [], d = a.data;
    for (var i = 0; i < d.length; i += 4) { if (!d[i + 3]) continue; var k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      if (!seen[k]) { seen[k] = 1; out.push('#' + (0x1000000 + k).toString(16).slice(1)); } }
    return out.sort(); }

  // Keep the sprite inside [pad, size-pad) and centred: crop to opaque bounds of the hi-res source, fit preserving aspect.
  function opaqueBounds(a, t) { var x0 = a.w, y0 = a.h, x1 = -1, y1 = -1, d = a.data;
    for (var y = 0; y < a.h; y++) for (var x = 0; x < a.w; x++) if (d[(y * a.w + x) * 4 + 3] >= t) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }; }
  function crop(a, r) { var out = img(r.w, r.h);
    for (var y = 0; y < r.h; y++) out.data.set(a.data.subarray(((r.y + y) * a.w + r.x) * 4, ((r.y + y) * a.w + r.x + r.w) * 4), y * r.w * 4);
    return out; }
  function placeOn(a, size, ox, oy) { var out = img(size, size);
    for (var y = 0; y < a.h; y++) out.data.set(a.data.subarray(y * a.w * 4, (y + 1) * a.w * 4), ((oy + y) * size + ox) * 4);
    return out; }

  // Full pure pipeline on a hi-res RGBA buffer. Returns { w, h, data, palette, colors }.
  function pixelize(src, opts) {
    var o = merge(opts), size = Math.max(4, Math.floor(o.size)), pad = Math.max(0, Math.min(Math.floor(o.pad), 4));
    var inner = size - pad * 2, b = opaqueBounds(src, 8);
    if (!b) { var e = img(size, size); e.palette = []; e.colors = 0; return e; }
    var fit = Math.min(inner / b.w, inner / b.h);
    var tw = Math.max(1, Math.round(b.w * fit)), th = Math.max(1, Math.round(b.h * fit));
    if (!o.upscale && b.w <= inner && b.h <= inner) { tw = b.w; th = b.h; } // already pixel art at/below the target: keep 1:1
    var small = (tw === b.w && th === b.h) ? crop(src, b) : areaDownscale(crop(src, b), tw, th);
    small = alphaThreshold(small, o.alpha);
    small = saturate(small, o.saturate);
    var pal = o.ramp && o.ramp.length ? o.ramp.map(hexRgb) : medianCut(small, o.colors);
    small = quantise(small, pal, o.dither);
    var placed = placeOn(small, size, pad + Math.floor((inner - tw) / 2), pad + (inner - th)); // feet on the baseline
    placed = lightPass(placed, o.highlight, o.shade);
    placed = outline(placed, o.outline);
    var cap = o.maxColors ? Math.min(o.maxColors, 8 + Math.floor(size / 4)) : 0; // S16: 12, M32: 16, L48+: maxColors
    if (cap && countColors(placed) > cap) placed = quantise(placed, medianCut(placed, cap), 0);
    placed.palette = paletteOf(placed); placed.colors = placed.palette.length;
    return placed;
  }

  // Species size class from game/species-registry.json fields (size_cm, category).
  function sizeClassFor(sp) {
    sp = sp || {}; var cat = String(sp.category || ''), cm = +sp.size_cm || 0;
    if (cat === 'microscopic') return 'S16';
    if (cat === 'tree') return 'XL64';
    if (cm > 0 && cm <= 4) return 'S16';
    if (cm <= 60) return 'M32';
    if (cm <= 250) return 'L48';
    return 'XL64';
  }

  // Determinism / golden helper: FNV-1a over the RGBA bytes.
  function hash(a) { var h = 0x811c9dc5, d = a.data; for (var i = 0; i < d.length; i++) { h ^= d[i]; h = Math.imul(h, 0x01000193) >>> 0; } return ('00000000' + h.toString(16)).slice(-8); }

  // Quality checks used by tests and the review page.
  function stats(a) { var semi = 0, opaque = 0, edge = 0, d = a.data;
    for (var i = 0; i < d.length; i += 4) { if (d[i + 3] > 0 && d[i + 3] < 255) semi++; if (d[i + 3] === 255) opaque++; }
    for (var y = 0; y < a.h; y++) for (var x = 0; x < a.w; x++) if (opaqueAt(a, x, y) && (!opaqueAt(a, x - 1, y) || !opaqueAt(a, x + 1, y) || !opaqueAt(a, x, y - 1) || !opaqueAt(a, x, y + 1))) edge++;
    return { semi: semi, opaque: opaque, edge: edge, colors: countColors(a) }; }

  // ---------- Browser layer: bake once, cache, draw crisp ----------
  var cache = {}, counters = { bakes: 0, hits: 0, ms: 0 };
  var hasDoc = typeof document !== 'undefined';
  function makeCanvas(w, h) {
    if (hasDoc) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    return null;
  }
  function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0; }

  // bake(source, opts): source = HTMLImageElement | HTMLCanvasElement | ImageBitmap | { image, sx, sy, sw, sh }.
  // opts.key names the cache entry (default: the image src + frame + options). Returns { canvas, w, h, palette, colors, data, key }.
  function bake(source, opts) {
    opts = opts || {};
    var srcImg = source && source.image ? source.image : source;
    var fr = source && source.image ? source : null;
    var o = merge(opts), key = opts.key || ((srcImg && (srcImg.currentSrc || srcImg.src)) || 'canvas') + '|' + (fr ? [fr.sx, fr.sy, fr.sw, fr.sh].join(',') : '') + '|' + JSON.stringify(o);
    if (cache[key]) { counters.hits++; return cache[key]; }
    var t0 = now();
    var sw = fr ? fr.sw : (srcImg.naturalWidth || srcImg.width), sh = fr ? fr.sh : (srcImg.naturalHeight || srcImg.height);
    // Rasterise vector sources at a work size of ~4x the target so the area average has real coverage data.
    var work = Math.max(sw, sh) > o.size * 2 ? 1 : Math.max(1, Math.ceil((o.size * 4) / Math.max(sw, sh)));
    if (srcImg && /\.svg(\?|#|$)/i.test(srcImg.src || '')) { work = 1; sw = sh = Math.min(256, o.size * 4); }
    if (fr) work = 1; // pixel-art strip frames: never resample up
    var ww = Math.round(sw * work), wh = Math.round(sh * work), c = makeCanvas(ww, wh), g = c.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingEnabled = !fr;
    if (fr) g.drawImage(srcImg, fr.sx, fr.sy, fr.sw, fr.sh, 0, 0, ww, wh); else g.drawImage(srcImg, 0, 0, ww, wh);
    var raw = g.getImageData(0, 0, ww, wh), res = pixelize(img(ww, wh, raw.data), o);
    var out = makeCanvas(res.w, res.h), og = out.getContext('2d');
    og.putImageData(new ImageData(res.data, res.w, res.h), 0, 0);
    var ent = { canvas: out, w: res.w, h: res.h, palette: res.palette, colors: res.colors, data: res.data, key: key, ms: now() - t0 };
    counters.bakes++; counters.ms += ent.ms;
    cache[key] = ent; return ent;
  }
  // loadAndBake(url, opts) -> Promise of a baked entry. Fetches nothing remote: pass same-origin asset URLs.
  function loadAndBake(url, opts) {
    var key = (opts && opts.key) || url + '|' + JSON.stringify(merge(opts));
    if (cache[key]) { counters.hits++; return Promise.resolve(cache[key]); }
    return new Promise(function (res, rej) { var im = new Image(); im.onload = function () {
      try { res(bake(im, Object.assign({}, opts, { key: key }))); } catch (e) { rej(e); } }; im.onerror = function () { rej(new Error('load failed: ' + url)); }; im.src = url; });
  }
  // Integer-scaled crisp draw onto a 2D context.
  function draw(ctx, ent, x, y, scale) { scale = Math.max(1, Math.floor(scale || 1)); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(ent.canvas, Math.round(x), Math.round(y), ent.w * scale, ent.h * scale); }
  // Off-switch: ?pixelize=0 in the page URL.
  function enabled(search) { var s = search != null ? search : (typeof location !== 'undefined' ? location.search : '');
    return !/[?&]pixelize=0(&|$)/.test(String(s || '')); }

  var API = {
    SIZE_CLASSES: SIZE_CLASSES, DEFAULTS: DEFAULTS,
    areaDownscale: areaDownscale, alphaThreshold: alphaThreshold, medianCut: medianCut, quantise: quantise,
    lightPass: lightPass, outline: outline, saturate: saturate, pixelize: pixelize, sizeClassFor: sizeClassFor,
    countColors: countColors, paletteOf: paletteOf, stats: stats, hash: hash, image: img,
    bake: bake, loadAndBake: loadAndBake, draw: draw, enabled: enabled,
    cacheSize: function () { return Object.keys(cache).length; }, counters: function () { return { bakes: counters.bakes, hits: counters.hits, ms: counters.ms }; },
    clearCache: function () { cache = {}; counters.bakes = counters.hits = 0; counters.ms = 0; }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.MMPixelize = API;
})(typeof window !== 'undefined' ? window : this);
