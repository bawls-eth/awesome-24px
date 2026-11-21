// MMFxDraw: code-drawn projectile shapes (11) and status glyphs (17) for the Mad Maze arena (CLASS-WEAPON-BUILD-PLAN.md sections a, c).
// No DOM, no globals: every function draws on the 2D context it is given (real canvas, Phaser canvas texture, or a test stub) and only
// uses save/restore/translate/rotate/scale, path calls, fill/stroke and fillText. Hostile arguments are clamped, never thrown on.
// Cache friendly: draw once into a small canvas with makeCache(), then blit it each frame (no per-frame Graphics redraws).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMFxDraw = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const num = (v, d) => { v = Number(v); return Number.isFinite(v) ? v : d; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const PI = Math.PI, TAU = Math.PI * 2;
  const GOLD = '#ffd24a', RED = '#ff5f6b', DISC = 'rgba(20,16,28,0.88)', DARK = '#14101c';

  const SHAPES = ['dot', 'arrow', 'shard', 'orb', 'star', 'blade', 'page', 'axe', 'hammer', 'fist', 'ray'];
  // Status id -> {pos: positive effect, color}. Order follows the catalogue in the build plan section c.
  const STATUS = {
    damaging: { pos: true, color: '#ffb347' }, berserk: { pos: true, color: '#ff6a4a' }, swift: { pos: true, color: '#7ee7ff' },
    armored: { pos: true, color: '#6ab8ff' }, healing: { pos: true, color: '#7ee787' }, shielded: { pos: true, color: '#8fe9ff' },
    inspired: { pos: true, color: '#ffe27a' }, weak: { pos: false, color: '#b9b0cc' }, dazed: { pos: false, color: '#d2a8ff' },
    slowed: { pos: false, color: '#8fb8ff' }, rooted: { pos: false, color: '#5fbf6a' }, stunned: { pos: false, color: '#fff3c4' },
    armorBroken: { pos: false, color: '#c39bff' }, curse: { pos: false, color: '#a050ff' }, bleed: { pos: false, color: '#ff5f6b' },
    sick: { pos: false, color: '#9acd32' }, marked: { pos: false, color: '#ff8fa8' },
  };
  const GLYPHS = Object.keys(STATUS);

  const isShape = (s) => typeof s === 'string' && SHAPES.indexOf(s) >= 0;
  const isGlyph = (s) => typeof s === 'string' && has(STATUS, s);
  const statusColor = (id) => (isGlyph(id) ? STATUS[id].color : '#cccccc');
  const isPositive = (id) => isGlyph(id) && STATUS[id].pos;

  // ---- path helpers (all coordinates in the caller's current transform) ----
  function poly(c, pts, close) {
    c.beginPath();
    for (let i = 0; i < pts.length; i += 2) { if (i === 0) c.moveTo(pts[i], pts[i + 1]); else c.lineTo(pts[i], pts[i + 1]); }
    if (close) c.closePath();
  }
  function star(c, cx, cy, ro, ri, n, rot) {
    c.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = (rot || -PI / 2) + (i * PI) / n, r = i % 2 ? ri : ro;
      if (i === 0) c.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); else c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    c.closePath();
  }
  const disc = (c, x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, TAU); };
  function style(c, fill, stroke, lw) {
    if (fill) c.fillStyle = fill;
    if (stroke) c.strokeStyle = stroke;
    if (lw) c.lineWidth = lw;
    c.lineJoin = 'round'; c.lineCap = 'round';
  }

  // ---- projectile shapes: drawn at the origin, pointing along +x, radius ~r ----
  const SHAPE_DRAW = {
    dot(c, r, col) { style(c, col); disc(c, 0, 0, r * 0.7); c.fill(); style(c, '#ffffff'); disc(c, -r * 0.15, -r * 0.15, r * 0.25); c.fill(); },
    arrow(c, r, col) {
      style(c, col, col, Math.max(1, r * 0.22));
      poly(c, [-r, 0, r * 0.35, 0], false); c.stroke();
      poly(c, [r, 0, r * 0.3, -r * 0.5, r * 0.3, r * 0.5], true); c.fill();
      poly(c, [-r, 0, -r * 1.3, -r * 0.4, -r * 0.6, 0, -r * 1.3, r * 0.4], true); c.fill();
    },
    shard(c, r, col) { style(c, col); poly(c, [r * 1.1, 0, 0, -r * 0.45, -r, 0, 0, r * 0.45], true); c.fill(); style(c, '#ffffff'); poly(c, [r * 0.7, 0, 0, -r * 0.15, -r * 0.4, 0, 0, r * 0.15], true); c.fill(); },
    orb(c, r, col) { style(c, col); disc(c, 0, 0, r * 0.85); c.fill(); style(c, '#ffffff', '#ffffff', Math.max(1, r * 0.15)); disc(c, -r * 0.25, -r * 0.25, r * 0.28); c.fill(); },
    star(c, r, col) { style(c, col, '#ffffff', Math.max(1, r * 0.1)); star(c, 0, 0, r, r * 0.45, 5, 0); c.fill(); c.stroke(); },
    blade(c, r, col) {
      style(c, col, col, Math.max(1, r * 0.2));
      c.beginPath(); c.moveTo(-r * 0.6, -r * 0.9); c.quadraticCurveTo(r * 1.2, -r * 0.2, -r * 0.6, r * 0.9); c.quadraticCurveTo(r * 0.3, 0, -r * 0.6, -r * 0.9); c.closePath(); c.fill();
    },
    page(c, r, col) {
      style(c, col, '#ffffff', Math.max(1, r * 0.1));
      poly(c, [-r * 0.7, -r * 0.9, r * 0.5, -r * 0.9, r * 0.9, -r * 0.5, r * 0.9, r * 0.9, -r * 0.7, r * 0.9], true); c.fill(); c.stroke();
      style(c, null, DARK, Math.max(1, r * 0.1)); poly(c, [-r * 0.4, -r * 0.3, r * 0.5, -r * 0.3], false); c.stroke(); poly(c, [-r * 0.4, r * 0.2, r * 0.5, r * 0.2], false); c.stroke();
    },
    axe(c, r, col) {
      style(c, '#b98a56', '#b98a56', Math.max(1, r * 0.2)); poly(c, [-r, 0, r * 0.4, 0], false); c.stroke();
      style(c, col, '#ffffff', Math.max(1, r * 0.08));
      c.beginPath(); c.moveTo(r * 0.2, -r * 0.2); c.quadraticCurveTo(r * 1.1, -r * 1.0, r * 0.9, 0); c.quadraticCurveTo(r * 1.1, r * 1.0, r * 0.2, r * 0.2); c.closePath(); c.fill(); c.stroke();
    },
    hammer(c, r, col) {
      style(c, '#b98a56', '#b98a56', Math.max(1, r * 0.22)); poly(c, [-r, 0, r * 0.3, 0], false); c.stroke();
      style(c, col, '#ffffff', Math.max(1, r * 0.08)); poly(c, [r * 0.2, -r * 0.7, r * 1.0, -r * 0.7, r * 1.0, r * 0.7, r * 0.2, r * 0.7], true); c.fill(); c.stroke();
    },
    fist(c, r, col) {
      style(c, col, '#ffffff', Math.max(1, r * 0.1)); disc(c, 0, 0, r * 0.75); c.fill(); c.stroke();
      style(c, null, DARK, Math.max(1, r * 0.12)); for (let i = -1; i <= 1; i++) { poly(c, [r * 0.3, i * r * 0.3, r * 0.75, i * r * 0.3], false); c.stroke(); }
    },
    ray(c, r, col) {
      style(c, col, col, Math.max(2, r * 0.7)); c.globalAlpha = 0.45; poly(c, [-r * 1.4, 0, r * 1.4, 0], false); c.stroke(); c.globalAlpha = 1;
      style(c, null, '#ffffff', Math.max(1, r * 0.28)); poly(c, [-r * 1.4, 0, r * 1.4, 0], false); c.stroke();
    },
  };

  // drawShape(ctx, shape, x, y, r, angle, color): unknown shape draws as a dot. Always leaves the ctx state as it found it.
  function drawShape(ctx, shape, x, y, r, angle, color) {
    if (!ctx || typeof ctx.save !== 'function') return false;
    const fn = SHAPE_DRAW[isShape(shape) ? shape : 'dot'];
    const rad = clamp(num(r, 6), 1, 200);
    ctx.save();
    ctx.translate(num(x, 0), num(y, 0)); ctx.rotate(num(angle, 0));
    fn(ctx, rad, typeof color === 'string' && color.length < 40 ? color : '#ffffff');
    ctx.restore();
    return true;
  }

  // ---- status glyphs: drawn centred at the origin in a box of half-size s ----
  function plus(c, s, w) { poly(c, [-w, -s, w, -s, w, -w, s, -w, s, w, w, w, w, s, -w, s, -w, w, -s, w, -s, -w, -w, -w], true); }
  const shieldPath = (c, s) => poly(c, [-s * 0.7, -s * 0.75, s * 0.7, -s * 0.75, s * 0.7, 0, 0, s * 0.95, -s * 0.7, 0], true);
  const GLYPH_DRAW = {
    damaging(c, s, col) { style(c, col); poly(c, [0, -s, s * 0.4, s * 0.1, s * 0.14, s * 0.1, s * 0.14, s * 0.8, -s * 0.14, s * 0.8, -s * 0.14, s * 0.1, -s * 0.4, s * 0.1], true); c.fill(); },
    berserk(c, s, col) { style(c, null, col, s * 0.28); poly(c, [-s * 0.7, 0, 0, -s * 0.55, s * 0.7, 0], false); c.stroke(); poly(c, [-s * 0.7, s * 0.7, 0, s * 0.15, s * 0.7, s * 0.7], false); c.stroke(); },
    swift(c, s, col) { style(c, col, col, s * 0.2); poly(c, [s, 0, s * 0.1, -s * 0.65, s * 0.1, s * 0.65], true); c.fill(); poly(c, [-s * 0.95, -s * 0.28, 0, -s * 0.28], false); c.stroke(); poly(c, [-s * 0.95, s * 0.28, 0, s * 0.28], false); c.stroke(); },
    armored(c, s, col) { style(c, col); shieldPath(c, s); c.fill(); style(c, null, DARK, s * 0.12); poly(c, [0, -s * 0.45, 0, s * 0.45], false); c.stroke(); },
    healing(c, s, col) { style(c, col); plus(c, s * 0.9, s * 0.3); c.fill(); },
    shielded(c, s, col) { style(c, null, col, s * 0.22); disc(c, 0, 0, s * 0.75); c.stroke(); style(c, col); disc(c, 0, 0, s * 0.28); c.fill(); },
    inspired(c, s, col) { style(c, col); star(c, 0, 0, s, s * 0.42, 5); c.fill(); },
    weak(c, s, col) { style(c, null, col, s * 0.26); poly(c, [-s * 0.7, s * 0.85, -s * 0.15, s * 0.1, s * 0.2, s * 0.1, s * 0.7, -s * 0.85], false); c.stroke(); },
    dazed(c, s, col) { style(c, null, col, s * 0.2); c.beginPath(); for (let i = 0; i <= 28; i++) { const a = i * 0.45, r = (i / 28) * s * 0.9; if (i === 0) c.moveTo(0, 0); else c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.stroke(); },
    slowed(c, s, col) { style(c, null, col, s * 0.28); poly(c, [-s * 0.65, -s * 0.7, 0, -s * 0.05, s * 0.65, -s * 0.7], false); c.stroke(); poly(c, [-s * 0.65, s * 0.05, 0, s * 0.7, s * 0.65, s * 0.05], false); c.stroke(); },
    rooted(c, s, col) { style(c, null, col, s * 0.24); c.beginPath(); c.arc(-s * 0.3, 0, s * 0.5, 0, TAU); c.stroke(); c.beginPath(); c.arc(s * 0.3, 0, s * 0.5, 0, TAU); c.stroke(); poly(c, [0, s * 0.45, 0, s], false); c.stroke(); },
    stunned(c, s, col) { style(c, col); star(c, -s * 0.45, s * 0.35, s * 0.4, s * 0.17, 4, 0); c.fill(); star(c, s * 0.45, s * 0.35, s * 0.4, s * 0.17, 4, 0); c.fill(); star(c, 0, -s * 0.5, s * 0.5, s * 0.2, 4, 0); c.fill(); },
    armorBroken(c, s, col) { style(c, null, col, s * 0.22); shieldPath(c, s); c.stroke(); poly(c, [-s * 0.1, -s * 0.7, s * 0.2, -s * 0.15, -s * 0.2, s * 0.15, s * 0.1, s * 0.7], false); c.stroke(); },
    curse(c, s, col) {
      style(c, col); disc(c, 0, -s * 0.15, s * 0.7); c.fill(); poly(c, [-s * 0.4, s * 0.3, s * 0.4, s * 0.3, s * 0.3, s * 0.85, -s * 0.3, s * 0.85], true); c.fill();
      style(c, DARK); disc(c, -s * 0.28, -s * 0.15, s * 0.19); c.fill(); disc(c, s * 0.28, -s * 0.15, s * 0.19); c.fill();
    },
    bleed(c, s, col) { style(c, col); c.beginPath(); c.moveTo(0, -s); c.quadraticCurveTo(s * 0.85, s * 0.1, s * 0.55, s * 0.5); c.arc(0, s * 0.35, s * 0.55, 0, PI, false); c.quadraticCurveTo(-s * 0.85, s * 0.1, 0, -s); c.closePath(); c.fill(); },
    sick(c, s, col) { style(c, col); plus(c, s * 0.85, s * 0.26); c.fill(); style(c, null, DARK, s * 0.2); poly(c, [-s * 0.8, s * 0.8, s * 0.8, -s * 0.8], false); c.stroke(); },
    marked(c, s, col) { style(c, null, col, s * 0.2); disc(c, 0, 0, s * 0.6); c.stroke(); poly(c, [0, -s, 0, -s * 0.3], false); c.stroke(); poly(c, [0, s * 0.3, 0, s], false); c.stroke(); poly(c, [-s, 0, -s * 0.3, 0], false); c.stroke(); poly(c, [s * 0.3, 0, s, 0], false); c.stroke(); },
  };

  // drawGlyph(ctx, id, cx, cy, size, color): size = box edge in px. Unknown id draws nothing and returns false.
  function drawGlyph(ctx, id, cx, cy, size, color) {
    if (!ctx || typeof ctx.save !== 'function' || !isGlyph(id)) return false;
    const s = clamp(num(size, 12), 2, 400) / 2;
    ctx.save();
    ctx.translate(num(cx, 0), num(cy, 0));
    GLYPH_DRAW[id](ctx, s, typeof color === 'string' && color.length < 40 ? color : STATUS[id].color);
    ctx.restore();
    return true;
  }

  // pie(ctx, cx, cy, r, frac, color): clockwise sector from 12 o'clock covering `frac` (0..1) of the circle. frac 0 draws nothing.
  function pie(ctx, cx, cy, r, frac, color) {
    if (!ctx || typeof ctx.save !== 'function') return 0;
    const f = clamp(num(frac, 0), 0, 1);
    if (f <= 0) return 0;
    const rad = clamp(num(r, 8), 1, 400), a0 = -PI / 2, sweep = f * TAU;
    ctx.save();
    ctx.fillStyle = typeof color === 'string' && color.length < 40 ? color : 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    if (f < 1) ctx.moveTo(num(cx, 0), num(cy, 0));
    ctx.arc(num(cx, 0), num(cy, 0), rad, a0, a0 + sweep, false);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    return sweep;
  }

  // drawIcon: the HUD status icon. opts {frac: remaining fraction 0..1, stacks, sec: seconds left, nowMs, reduceMotion, positive}.
  // Dark disc, 2 px ring (gold positive / red negative), vector glyph, elapsed-time pie, stack digit, blink in the last second.
  function drawIcon(ctx, id, x, y, size, opts) {
    if (!ctx || typeof ctx.save !== 'function' || !isGlyph(id)) return false;
    const o = opts && typeof opts === 'object' ? opts : {};
    const d = clamp(num(size, 18), 8, 200), r = d / 2;
    const positive = typeof o.positive === 'boolean' ? o.positive : isPositive(id);
    const frac = o.frac == null ? 1 : clamp(num(o.frac, 1), 0, 1);
    const blink = !o.reduceMotion && num(o.sec, 99) <= 1 && num(o.sec, 99) > 0 && Math.floor(num(o.nowMs, 0) / 150) % 2 === 1;
    ctx.save();
    if (blink) ctx.globalAlpha = 0.45;
    ctx.fillStyle = DISC; ctx.beginPath(); ctx.arc(num(x, 0), num(y, 0), r, 0, TAU); ctx.fill();
    drawGlyph(ctx, id, x, y, d * 0.6);
    pie(ctx, x, y, r - 1, 1 - frac, 'rgba(0,0,0,0.5)');
    ctx.strokeStyle = positive ? GOLD : RED; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(num(x, 0), num(y, 0), r - 1, 0, TAU); ctx.stroke();
    const st = Math.floor(num(o.stacks, 1));
    if (st > 1 && typeof ctx.fillText === 'function') {
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold ' + Math.round(d * 0.5) + 'px sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.fillText(String(Math.min(st, 9)), num(x, 0) + r, num(y, 0) + r);
    }
    ctx.restore();
    return true;
  }

  // Enemy pip: a small disc in the status colour (5 px by default).
  function drawPip(ctx, id, x, y, size) {
    if (!ctx || typeof ctx.save !== 'function' || !isGlyph(id)) return false;
    const r = clamp(num(size, 5), 2, 40) / 2;
    ctx.save();
    ctx.fillStyle = STATUS[id].color; ctx.beginPath(); ctx.arc(num(x, 0), num(y, 0), r, 0, TAU); ctx.fill();
    ctx.strokeStyle = isPositive(id) ? GOLD : RED; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
    return true;
  }

  // makeCache(createCanvas, max): draw once into an off-screen canvas, blit each frame. createCanvas(w, h) must return an object
  // with getContext('2d') (document canvas, OffscreenCanvas, or a test stub). get() returns the canvas, or null when it cannot be made.
  function makeCache(createCanvas, max) {
    const map = new Map(), cap = clamp(Math.floor(num(max, 128)), 1, 1024);
    return {
      get(key, w, h, drawFn) {
        key = String(key);
        if (map.has(key)) { const v = map.get(key); map.delete(key); map.set(key, v); return v; }
        const W = clamp(Math.ceil(num(w, 0)), 1, 512), H = clamp(Math.ceil(num(h, 0)), 1, 512);
        let cv = null;
        try {
          cv = typeof createCanvas === 'function' ? createCanvas(W, H) : null;
          const cx = cv && typeof cv.getContext === 'function' ? cv.getContext('2d') : null;
          if (!cx) return null;
          drawFn(cx, W, H);
        } catch (e) { return null; }
        map.set(key, cv);
        if (map.size > cap) map.delete(map.keys().next().value);
        return cv;
      },
      size: () => map.size,
      clear: () => map.clear(),
    };
  }
  // A browser/worker canvas factory (null when no canvas is available, e.g. node).
  function defaultCreate(w, h) {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    if (typeof document !== 'undefined' && document.createElement) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
    return null;
  }

  return { SHAPES: SHAPES.slice(), GLYPHS: GLYPHS.slice(), isShape, isGlyph, isPositive, statusColor, drawShape, drawGlyph, drawIcon, drawPip, pie, makeCache, defaultCreate };
});
