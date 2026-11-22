/* MM8: shared 8-bit helpers (palette, crisp canvas, 5x7 bitmap font, pixel shapes, dither, particles).
   Browser: window.MM8. Node: module.exports. No network; no randomness of its own (pass a seeded rng to particles). */
(function (root) {
  'use strict';
  // PICO-8-like 16 colour ramp (indices 0..15)
  var PAL = ['#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
    '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa'];
  var NAMES = { black: 0, navy: 1, plum: 2, green: 3, brown: 4, grey: 5, silver: 6, white: 7, red: 8, orange: 9, yellow: 10, lime: 11, blue: 12, lilac: 13, pink: 14, peach: 15 };
  var INK = '#0b0d1a', BG = '#12142a';

  function hexRgb(h) { var s = String(h || '').replace('#', ''); if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    if (!/^[0-9a-fA-F]{6}$/.test(s)) return [0, 0, 0]; var n = parseInt(s, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function nearest(color) { var c = hexRgb(color), best = 0, bd = Infinity;
    for (var i = 0; i < PAL.length; i++) { var p = hexRgb(PAL[i]);
      var d = (p[0] - c[0]) * (p[0] - c[0]) * 0.3 + (p[1] - c[1]) * (p[1] - c[1]) * 0.59 + (p[2] - c[2]) * (p[2] - c[2]) * 0.11;
      if (d < bd) { bd = d; best = i; } } return PAL[best]; }
  function col(c) { if (typeof c === 'number') return PAL[((Math.floor(c) % 16) + 16) % 16];
    if (typeof c === 'string' && Object.prototype.hasOwnProperty.call(NAMES, c)) return PAL[NAMES[c]]; return c || PAL[7]; }

  // 5x7 bitmap font: each glyph = 7 rows of 5 bits (16 = leftmost)
  var G = {
    'A': [14, 17, 17, 31, 17, 17, 17], 'B': [30, 17, 17, 30, 17, 17, 30], 'C': [14, 17, 16, 16, 16, 17, 14], 'D': [30, 17, 17, 17, 17, 17, 30],
    'E': [31, 16, 16, 30, 16, 16, 31], 'F': [31, 16, 16, 30, 16, 16, 16], 'G': [14, 17, 16, 23, 17, 17, 15], 'H': [17, 17, 17, 31, 17, 17, 17],
    'I': [14, 4, 4, 4, 4, 4, 14], 'J': [7, 2, 2, 2, 2, 18, 12], 'K': [17, 18, 20, 24, 20, 18, 17], 'L': [16, 16, 16, 16, 16, 16, 31],
    'M': [17, 27, 21, 21, 17, 17, 17], 'N': [17, 17, 25, 21, 19, 17, 17], 'O': [14, 17, 17, 17, 17, 17, 14], 'P': [30, 17, 17, 30, 16, 16, 16],
    'Q': [14, 17, 17, 17, 21, 18, 13], 'R': [30, 17, 17, 30, 20, 18, 17], 'S': [15, 16, 16, 14, 1, 1, 30], 'T': [31, 4, 4, 4, 4, 4, 4],
    'U': [17, 17, 17, 17, 17, 17, 14], 'V': [17, 17, 17, 17, 17, 10, 4], 'W': [17, 17, 17, 21, 21, 21, 10], 'X': [17, 17, 10, 4, 10, 17, 17],
    'Y': [17, 17, 10, 4, 4, 4, 4], 'Z': [31, 1, 2, 4, 8, 16, 31],
    '0': [14, 17, 19, 21, 25, 17, 14], '1': [4, 12, 4, 4, 4, 4, 14], '2': [14, 17, 1, 2, 4, 8, 31], '3': [31, 2, 4, 2, 1, 17, 14],
    '4': [2, 6, 10, 18, 31, 2, 2], '5': [31, 16, 30, 1, 1, 17, 14], '6': [6, 8, 16, 30, 17, 17, 14], '7': [31, 1, 2, 4, 8, 8, 8],
    '8': [14, 17, 17, 14, 17, 17, 14], '9': [14, 17, 17, 15, 1, 2, 12],
    ' ': [0, 0, 0, 0, 0, 0, 0], '.': [0, 0, 0, 0, 0, 12, 12], ',': [0, 0, 0, 0, 12, 4, 8], '!': [4, 4, 4, 4, 4, 0, 4], '?': [14, 17, 1, 2, 4, 0, 4],
    ':': [0, 12, 12, 0, 12, 12, 0], '-': [0, 0, 0, 31, 0, 0, 0], '+': [0, 4, 4, 31, 4, 4, 0], '/': [1, 1, 2, 4, 8, 16, 16], "'": [4, 4, 8, 0, 0, 0, 0],
    '%': [24, 25, 2, 4, 8, 19, 3], '#': [10, 10, 31, 10, 31, 10, 10], '*': [0, 4, 21, 14, 21, 4, 0],
    '(': [2, 4, 8, 8, 8, 4, 2], ')': [8, 4, 2, 2, 2, 4, 8], '=': [0, 0, 31, 0, 31, 0, 0], '<': [2, 4, 8, 16, 8, 4, 2], '>': [8, 4, 2, 1, 2, 4, 8]
  };
  function glyph(ch) { return G[ch] || G[String(ch).toUpperCase()] || G['?']; }
  function textWidth(str, scale) { var s = String(str == null ? '' : str); scale = Math.max(1, Math.floor(scale || 1)); return s.length ? (s.length * 6 - 1) * scale : 0; }
  // MM8.text(ctx, str, x, y, scale, color, opts): top-left at (x,y); opts { align: 'left'|'center'|'right', shadow: color|false }
  function text(ctx, str, x, y, scale, color, opts) {
    var s = String(str == null ? '' : str); scale = Math.max(1, Math.floor(scale || 1)); opts = opts || {};
    var w = textWidth(s, scale); if (opts.align === 'center') x -= Math.floor(w / 2); else if (opts.align === 'right') x -= w;
    x = Math.round(x); y = Math.round(y);
    var shadow = opts.shadow === undefined ? INK : opts.shadow;
    function pass(dx, dy, c) { ctx.fillStyle = c;
      for (var i = 0; i < s.length; i++) { var g = glyph(s[i]);
        for (var r = 0; r < 7; r++) { var row = g[r]; if (!row) continue;
          for (var b = 0; b < 5; b++) if (row & (16 >> b)) ctx.fillRect(x + dx + (i * 6 + b) * scale, y + dy + r * scale, scale, scale); } } }
    if (shadow) pass(scale, scale, col(shadow));
    pass(0, 0, col(color));
    return w;
  }

  // integer CSS scale that fits availW (always >= 1)
  function crispScale(logicalW, availW) { var s = Math.floor((availW || logicalW) / logicalW); return Math.max(1, s || 1); }
  // MM8.crisp(canvas, logicalW, logicalH, opts): backing store = logical size, pixelated, integer CSS scale (opts.fit:false keeps CSS size)
  function crisp(canvas, logicalW, logicalH, opts) {
    opts = opts || {};
    if (canvas.width !== logicalW) canvas.width = logicalW;
    if (canvas.height !== logicalH) canvas.height = logicalH;
    var st = canvas.style; st.imageRendering = 'pixelated';
    if (opts.fit !== false) {
      var avail = opts.maxW || (canvas.parentNode && canvas.parentNode.clientWidth) || logicalW;
      var s = crispScale(logicalW, avail);
      st.width = (logicalW * s) + 'px'; st.height = (logicalH * s) + 'px';
    }
    var ctx = canvas.getContext && canvas.getContext('2d'); if (ctx) ctx.imageSmoothingEnabled = false; return ctx;
  }

  // pixel shapes (all coordinates rounded to whole pixels)
  var px = {
    rect: function (ctx, x, y, w, h, c) { ctx.fillStyle = col(c); ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); },
    // stepped box: corner notch n px; optional 1px outline colour
    box: function (ctx, x, y, w, h, c, outline, n) { x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h); n = n == null ? 1 : n;
      if (outline) { ctx.fillStyle = col(outline); ctx.fillRect(x + n, y - 1, w - 2 * n, h + 2); ctx.fillRect(x - 1, y + n, w + 2, h - 2 * n);
        if (n > 1) { ctx.fillRect(x, y, w, h); } }
      ctx.fillStyle = col(c); ctx.fillRect(x + n, y, w - 2 * n, h); ctx.fillRect(x, y + n, w, h - 2 * n);
      if (n > 1) { ctx.fillRect(x + 1, y + 1, w - 2, h - 2); } },
    // bevel: light top/left, dark bottom/right, u px thick
    bevel: function (ctx, x, y, w, h, light, dark, u) { u = u || 1; x = Math.round(x); y = Math.round(y);
      ctx.fillStyle = col(light); ctx.fillRect(x, y, w, u); ctx.fillRect(x, y, u, h);
      ctx.fillStyle = col(dark); ctx.fillRect(x, y + h - u, w, u); ctx.fillRect(x + w - u, y, u, h); },
    // filled pixel circle, row by row
    circle: function (ctx, cx, cy, r, c) { ctx.fillStyle = col(c); cx = Math.round(cx); cy = Math.round(cy); r = Math.max(1, Math.round(r));
      for (var dy = -r; dy <= r; dy++) { var dx = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy + r * 0.8))); ctx.fillRect(cx - dx, cy + dy, dx * 2 + 1, 1); } },
    // bitmap sprite: array of strings, map char -> colour (' ' and '.' are transparent)
    sprite: function (ctx, rows, x, y, map, scale) { scale = scale || 1; x = Math.round(x); y = Math.round(y);
      for (var r = 0; r < rows.length; r++) for (var i = 0; i < rows[r].length; i++) { var ch = rows[r][i]; if (ch === ' ' || ch === '.') continue;
        var c = map[ch]; if (c == null) continue; ctx.fillStyle = col(c); ctx.fillRect(x + i * scale, y + r * scale, scale, scale); } },
    // stepped skyline / hills: heights[i] columns w px wide standing on baseY
    steps: function (ctx, x, baseY, heights, w, c) { ctx.fillStyle = col(c);
      for (var i = 0; i < heights.length; i++) ctx.fillRect(Math.round(x + i * w), Math.round(baseY - heights[i]), w, Math.round(heights[i])); }
  };

  // checker dither of colour a over b (cell px)
  function dither(ctx, x, y, w, h, a, b, cell) { cell = cell || 1; x = Math.round(x); y = Math.round(y);
    if (b) { ctx.fillStyle = col(b); ctx.fillRect(x, y, w, h); }
    ctx.fillStyle = col(a);
    for (var yy = 0; yy < h; yy += cell) for (var xx = ((yy / cell) & 1) * cell; xx < w; xx += cell * 2) ctx.fillRect(x + xx, y + yy, Math.min(cell, w - xx), Math.min(cell, h - yy)); }
  // stepped vertical bands instead of a gradient
  function bands(ctx, x, y, w, h, colors) { var n = colors.length, bh = Math.ceil(h / n);
    for (var i = 0; i < n; i++) { ctx.fillStyle = col(colors[i]); ctx.fillRect(x, y + i * bh, w, Math.max(0, Math.min(bh, h - i * bh))); } }

  function hasDoc() { return typeof document !== 'undefined' && !!document.documentElement; }
  function lowGfx() { try {
    if (hasDoc() && document.documentElement.classList.contains('low-gfx')) return true;
    if (root.MMAccess && typeof localStorage !== 'undefined') return !!root.MMAccess.prefs.load(localStorage).lowGfx;
  } catch (e) { /* ignore */ } return false; }
  function reducedMotion() { try {
    if (hasDoc() && document.documentElement.classList.contains('reduce-motion')) return true;
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) { return false; } }

  // palette-quantised square particles; rng should be seeded (returns [0,1))
  function particles(rng, cap) { var list = []; cap = cap || 64;
    return {
      list: list,
      burst: function (x, y, n, color, speed) { var r = rng || Math.random, c = nearest(col(color)); speed = speed || 2;
        if (lowGfx()) n = Math.min(n, 4);
        n = Math.max(0, Math.min(n, cap - list.length));
        for (var i = 0; i < n; i++) { var a = r() * Math.PI * 2, v = speed * (0.4 + r() * 0.8);
          list.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: 18 + Math.floor(r() * 12), c: c, s: r() < 0.5 ? 2 : 3 }); } },
      step: function () { for (var i = list.length - 1; i >= 0; i--) { var p = list[i]; p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life--; if (p.life <= 0) list.splice(i, 1); } },
      draw: function (ctx) { for (var i = 0; i < list.length; i++) { var p = list[i]; ctx.fillStyle = p.life < 6 ? PAL[5] : p.c; ctx.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s); } },
      clear: function () { list.length = 0; }
    }; }

  function init() { if (!hasDoc()) return;
    try { if (/[?&]crt=1(&|$)/.test(location.search)) document.documentElement.classList.add('px-crt'); } catch (e) { /* ignore */ }
    if (document.body) document.body.classList.add('px8'); }

  var MM8 = { PAL: PAL, NAMES: NAMES, INK: INK, BG: BG, col: col, nearest: nearest, hexRgb: hexRgb, text: text, textWidth: textWidth, glyph: glyph, GLYPHS: G,
    crisp: crisp, crispScale: crispScale, px: px, dither: dither, bands: bands, particles: particles, lowGfx: lowGfx, reducedMotion: reducedMotion, init: init };
  if (typeof module !== 'undefined' && module.exports) module.exports = MM8;
  if (typeof window !== 'undefined') { window.MM8 = MM8;
    if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init(); } }
})(typeof window !== 'undefined' ? window : this);
