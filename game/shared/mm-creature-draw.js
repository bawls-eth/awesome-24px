// MMCreatureDraw: code-drawn placeholder creatures for the Biome Archipelago (BIOME-ARCH-PLAN 2.5, A6).
// Seven archetypes (blob, quadruped, biped, winged, serpent, giant, mount), each baked ONCE per (id, archetype, size class, dpr bucket,
// palette) into cached canvases at display size: 4 idle + 4 move frames (a small bob / leg swing / wing flap), plus one shared
// ellipse shadow per size class. Nothing is scaled per frame. Real art later replaces the cache entries, not the callers.
// No DOM needed: draw functions take any 2D context (real canvas or a test stub); bake takes a canvas factory.
// Deterministic (no Math.random), hostile arguments are clamped and never thrown on. Only palette colours are used (shadow aside).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMCreatureDraw = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const ARCHETYPES = ['blob', 'quadruped', 'biped', 'winged', 'serpent', 'giant', 'mount'];
  const ACTIONS = ['idle', 'move'];
  const FRAMES = 4;
  const SIZES = { S: 48, M: 64, L: 96, XL: 128 };       // display px per size class
  const HIT_RADIUS = { S: 12, M: 18, L: 26, XL: 36 };
  const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
  const SHADOW = 'rgba(0,0,0,0.28)';
  const CACHE_CAP = 96;
  const PI = Math.PI, TAU = PI * 2;

  // body, belly, accent, eye, line
  const PALETTES = {
    home: { body: '#e8b86a', belly: '#f6e2b0', accent: '#d9684a', eye: '#2a1f2d', line: '#5a3a24' },
    jungle: { body: '#4f9a45', belly: '#c9d98a', accent: '#e07a3a', eye: '#1e1a22', line: '#244a22' },
    ice: { body: '#9cc9e6', belly: '#eef6fb', accent: '#5b86c9', eye: '#1c2433', line: '#3b5f85' },
    reef: { body: '#3fb7b0', belly: '#f3e6b8', accent: '#ef7f6f', eye: '#1b2a33', line: '#1f6a6a' },
    mars: { body: '#c0673f', belly: '#e8b98a', accent: '#f0d27a', eye: '#2a1a1a', line: '#6a3320' }
  };
  const PAL_KEYS = ['body', 'belly', 'accent', 'eye', 'line'];

  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const num = (v, d) => { v = typeof v === 'number' ? v : Number(v); return Number.isFinite(v) ? v : d; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const archOf = (a) => (typeof a === 'string' && ARCHETYPES.indexOf(a) >= 0 ? a : 'blob');
  const sizeOf = (s) => (typeof s === 'string' && has(SIZES, s) ? s : 'M');
  // dpr bucket: 1, 1.5 or 2 (a phone at 3x still bakes at 2x to keep canvases small)
  const dprBucket = (d) => { d = num(d, 1); return d <= 1.25 ? 1 : d <= 1.75 ? 1.5 : 2; };
  const px = (sizeClass, dpr) => Math.round(SIZES[sizeOf(sizeClass)] * dprBucket(dpr));

  // Merge a (possibly hostile) palette over a base: only 4/7-char hex strings are accepted per key.
  function palette(p, base) {
    const b = typeof base === 'string' && has(PALETTES, base) ? PALETTES[base] : PALETTES.jungle;
    const out = {};
    PAL_KEYS.forEach((k) => { out[k] = isObj(p) && typeof p[k] === 'string' && HEX.test(p[k]) ? p[k] : b[k]; });
    return out;
  }
  const paletteFor = (biome) => palette(null, biome);

  // ---- drawing, in a 100 x 100 unit box with the feet on y = 90 ----
  const ell = (c, x, y, rx, ry, rot) => { c.save(); c.translate(x, y); if (rot) c.rotate(rot); c.scale(Math.max(0.01, rx), Math.max(0.01, ry)); c.beginPath(); c.arc(0, 0, 1, 0, TAU); c.restore(); };
  const fillEll = (c, x, y, rx, ry, col, rot) => { ell(c, x, y, rx, ry, rot); c.fillStyle = col; c.fill(); };
  const disc = (c, x, y, r, col) => { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = col; c.fill(); };
  const line = (c, x1, y1, x2, y2, w, col) => { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.lineWidth = w; c.strokeStyle = col; c.stroke(); };
  const tri = (c, x1, y1, x2, y2, x3, y3, col) => { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.lineTo(x3, y3); c.closePath(); c.fillStyle = col; c.fill(); };
  const eye = (c, x, y, r, P) => { disc(c, x, y, r * 1.5, P.belly); disc(c, x + r * 0.2, y, r * 0.9, P.eye); };

  // bob (vertical units) and swing (leg / wing phase) per action and frame
  const BOB = { idle: [0, -1.5, -2.5, -1], move: [0, -3, 0, -3] };
  const SWING = { idle: [0, 0, 0, 0], move: [-1, 0, 1, 0] };

  const BODIES = {
    blob(c, f, a, P) {
      const sq = a === 'idle' ? [0, 2, 3, 1][f] : [3, 0, 3, 0][f];
      const y = 64 + BOB[a][f] * 0.4;
      fillEll(c, 50, y, 32 + sq, 27 - sq, P.body);
      fillEll(c, 50, y + 9, 22 + sq * 0.5, 14 - sq * 0.4, P.belly);
      tri(c, 44, y - 24 + sq, 50, y - 38, 56, y - 24 + sq, P.accent);
      eye(c, 40, y - 6, 4, P); eye(c, 60, y - 6, 4, P);
      c.beginPath(); c.arc(50, y + 2, 5, 0.2, PI - 0.2); c.lineWidth = 2; c.strokeStyle = P.line; c.stroke();
    },
    quadruped(c, f, a, P) {
      const b = BOB[a][f], s = SWING[a][f] * 6;
      line(c, 34, 64, 34 + s, 88, 7, P.line); line(c, 44, 66, 44 - s, 88, 7, P.line);
      line(c, 58, 66, 58 + s, 88, 7, P.line); line(c, 68, 64, 68 - s, 88, 7, P.line);
      c.beginPath(); c.moveTo(22, 50 + b); c.quadraticCurveTo(8, 40 + b, 12, 28 + b); c.lineWidth = 5; c.strokeStyle = P.body; c.stroke();
      fillEll(c, 50, 56 + b, 30, 18, P.body); fillEll(c, 50, 63 + b, 22, 9, P.belly);
      fillEll(c, 50, 44 + b, 20, 5, P.accent);
      fillEll(c, 80, 44 + b, 12, 11, P.body); fillEll(c, 90, 48 + b, 6, 5, P.belly);
      tri(c, 74, 36 + b, 78, 26 + b, 83, 36 + b, P.accent);
      eye(c, 82, 41 + b, 2.6, P);
    },
    biped(c, f, a, P) {
      const b = BOB[a][f], s = SWING[a][f] * 7;
      c.beginPath(); c.moveTo(34, 56 + b); c.quadraticCurveTo(14, 66 + b, 8, 80); c.lineWidth = 7; c.strokeStyle = P.body; c.stroke();
      line(c, 44, 68, 44 + s, 88, 8, P.line); line(c, 56, 68, 56 - s, 88, 8, P.line);
      fillEll(c, 48, 52 + b, 17, 24, P.body, -0.15); fillEll(c, 52, 58 + b, 10, 15, P.belly, -0.15);
      line(c, 58, 50 + b, 68, 58 + b + s * 0.2, 4, P.line);
      fillEll(c, 62, 26 + b, 12, 10, P.body); tri(c, 70, 22 + b, 90, 28 + b, 70, 34 + b, P.body);
      tri(c, 52, 18 + b, 56, 6 + b, 60, 17 + b, P.accent); tri(c, 60, 16 + b, 66, 4 + b, 68, 17 + b, P.accent);
      eye(c, 64, 24 + b, 2.6, P);
    },
    winged(c, f, a, P) {
      const b = BOB[a][f] - (a === 'move' ? 4 : 0);
      const wy = (a === 'move' ? [-22, -8, 8, -8] : [-10, -6, -2, -6])[f];
      line(c, 46, 76 + b, 46, 88, 4, P.line); line(c, 54, 76 + b, 54, 88, 4, P.line);
      c.beginPath(); c.moveTo(40, 52 + b); c.lineTo(8, 44 + b + wy); c.lineTo(20, 66 + b + wy * 0.4); c.lineTo(42, 66 + b); c.closePath(); c.fillStyle = P.accent; c.fill();
      c.beginPath(); c.moveTo(60, 52 + b); c.lineTo(92, 44 + b + wy); c.lineTo(80, 66 + b + wy * 0.4); c.lineTo(58, 66 + b); c.closePath(); c.fillStyle = P.accent; c.fill();
      fillEll(c, 50, 60 + b, 14, 19, P.body); fillEll(c, 50, 66 + b, 8, 11, P.belly);
      disc(c, 50, 36 + b, 11, P.body); tri(c, 46, 38 + b, 54, 38 + b, 50, 48 + b, P.accent);
      eye(c, 45, 33 + b, 2.4, P); eye(c, 55, 33 + b, 2.4, P);
    },
    serpent(c, f, a, P) {
      const ph = f * (TAU / FRAMES) * (a === 'move' ? 1 : 0.25);
      const n = 9;
      for (let i = n - 1; i >= 0; i--) {
        const x = 12 + i * 9, y = 66 + Math.sin(ph + i * 0.75) * 9 + BOB[a][f] * 0.3, r = 5 + i * 0.9;
        disc(c, x, y, r, i % 2 ? P.body : P.accent);
        disc(c, x, y + r * 0.35, r * 0.55, P.belly);
      }
      const hx = 12 + (n - 1) * 9, hy = 66 + Math.sin(ph + (n - 1) * 0.75) * 9 + BOB[a][f] * 0.3;
      eye(c, hx + 2, hy - 5, 2.4, P);
      line(c, hx + 10, hy + 2, hx + 17, hy + 2 + (f % 2 ? 2 : -2), 1.5, P.accent);
    },
    giant(c, f, a, P) {
      const b = BOB[a][f] * 0.5, s = SWING[a][f] * 6;
      line(c, 38, 64, 38 + s, 90, 14, P.line); line(c, 62, 64, 62 - s, 90, 14, P.line);
      line(c, 22, 40 + b, 14 - s, 66 + b, 10, P.body); line(c, 78, 40 + b, 86 + s, 66 + b, 10, P.body);
      fillEll(c, 50, 50 + b, 30, 28, P.body); fillEll(c, 50, 58 + b, 18, 17, P.belly);
      tri(c, 22, 30 + b, 26, 12 + b, 36, 28 + b, P.accent); tri(c, 64, 28 + b, 74, 12 + b, 78, 30 + b, P.accent);
      fillEll(c, 50, 22 + b, 13, 12, P.body); line(c, 42, 28 + b, 58, 28 + b, 3, P.line);
      eye(c, 45, 20 + b, 2.8, P); eye(c, 55, 20 + b, 2.8, P);
    },
    mount(c, f, a, P) {
      const b = BOB[a][f], s = SWING[a][f] * 6;
      line(c, 30, 66, 30 + s, 88, 9, P.line); line(c, 42, 68, 42 - s, 88, 9, P.line);
      line(c, 60, 68, 60 + s, 88, 9, P.line); line(c, 72, 66, 72 - s, 88, 9, P.line);
      fillEll(c, 50, 58 + b, 33, 20, P.body); fillEll(c, 50, 66 + b, 24, 9, P.belly);
      c.fillStyle = P.accent; c.fillRect(36, 36 + b, 26, 8);                      // saddle
      c.fillStyle = P.line; c.fillRect(40, 44 + b, 4, 14); c.fillRect(54, 44 + b, 4, 14);   // straps
      fillEll(c, 82, 46 + b, 12, 11, P.body); fillEll(c, 91, 50 + b, 6, 5, P.belly);
      tri(c, 76, 38 + b, 80, 28 + b, 85, 38 + b, P.accent);
      eye(c, 84, 43 + b, 2.6, P);
    }
  };

  // Cycle 0 art (b06-r2-03): per-id features for the two Isles bosses that have no PNG strips yet, drawn on top of (front) and behind
  // (back) their archetype body so they read as the creature they are instead of a recoloured humanoid. Palette colours only.
  const EXTRAS = {
    frost_dragon: {
      back(c, f, a, P) { // bat wings (flap per frame), a spiked tail
        const b = BOB[a][f] * 0.5, wy = (a === 'move' ? [-14, -4, 8, 1] : [-6, -3, 0, -2])[f]; // every frame a different wing pose
        [[-1, 30], [1, 70]].forEach(([s, x0]) => {
          c.beginPath(); c.moveTo(x0, 40 + b); c.lineTo(50 + s * 48, 8 + b + wy); c.lineTo(50 + s * 44, 40 + b + wy * 0.5); c.lineTo(50 + s * 34, 34 + b + wy * 0.6);
          c.lineTo(50 + s * 30, 56 + b + wy * 0.3); c.lineTo(50 + s * 20, 50 + b); c.lineTo(x0, 58 + b); c.closePath(); c.fillStyle = P.accent; c.fill();
          line(c, x0, 40 + b, 50 + s * 48, 8 + b + wy, 2.5, P.line); line(c, x0 + s * 4, 44 + b, 50 + s * 44, 40 + b + wy * 0.5, 1.5, P.line);
          line(c, x0 + s * 2, 48 + b, 50 + s * 30, 56 + b + wy * 0.3, 1.5, P.line);
        });
        c.beginPath(); c.moveTo(40, 72 + b); c.quadraticCurveTo(18, 92, 4, 78 + (f % 2 ? 2 : 0)); c.lineWidth = 7; c.strokeStyle = P.body; c.stroke();
        tri(c, 2, 74, 10, 78, 4, 86, P.belly); tri(c, 16, 84, 22, 80, 24, 88, P.belly);
      },
      front(c, f, a, P) { // long snout, swept horns, frost crest, belly scales, cold eyes
        const b = BOB[a][f] * 0.5;
        tri(c, 56, 16 + b, 76, 24 + b, 56, 30 + b, P.body); line(c, 60, 27 + b, 74, 25 + b, 1.5, P.line);
        tri(c, 40, 16 + b, 28, 2 + b, 44, 12 + b, P.belly); tri(c, 56, 14 + b, 62, 0 + b, 60, 15 + b, P.belly);
        for (let i = 0; i < 4; i++) tri(c, 44 - i * 3, 34 + i * 7 + b, 38 - i * 3, 30 + i * 7 + b, 41 - i * 3, 40 + i * 7 + b, P.belly);
        for (let i = 0; i < 3; i++) line(c, 40, 52 + i * 6 + b, 60, 52 + i * 6 + b, 1.2, P.accent);
        disc(c, 47, 20 + b, 2.2, P.accent); disc(c, 55, 20 + b, 2.2, P.accent);
      }
    },
    red_titan: {
      back(c, f, a, P) { // basalt spines along the back
        const b = BOB[a][f] * 0.5;
        tri(c, 30, 34 + b, 26, 14 + b, 40, 28 + b, P.line); tri(c, 60, 28 + b, 74, 14 + b, 70, 34 + b, P.line); tri(c, 44, 28 + b, 50, 6 + b, 56, 28 + b, P.line);
      },
      front(c, f, a, P) { // rock shoulder plates, curled horns, glowing lava seams and eyes (glow pulses per frame)
        const b = BOB[a][f] * 0.5, glow = f % 2 ? P.accent : P.belly;
        fillEll(c, 24, 38 + b, 12, 9, P.line, -0.3); fillEll(c, 76, 38 + b, 12, 9, P.line, 0.3);
        fillEll(c, 22, 35 + b, 6, 3, P.body, -0.3); fillEll(c, 74, 35 + b, 6, 3, P.body, 0.3);
        c.beginPath(); c.moveTo(42, 16 + b); c.quadraticCurveTo(30, 4 + b, 34, 20 + b); c.lineWidth = 4; c.strokeStyle = P.belly; c.stroke();
        c.beginPath(); c.moveTo(58, 16 + b); c.quadraticCurveTo(70, 4 + b, 66, 20 + b); c.lineWidth = 4; c.strokeStyle = P.belly; c.stroke();
        c.beginPath(); c.moveTo(38, 44 + b); c.lineTo(46, 52 + b); c.lineTo(42, 60 + b); c.lineTo(50, 68 + b); c.lineWidth = 2; c.strokeStyle = glow; c.stroke();
        c.beginPath(); c.moveTo(62, 42 + b); c.lineTo(56, 50 + b); c.lineTo(62, 58 + b); c.lineWidth = 2; c.strokeStyle = glow; c.stroke();
        disc(c, 45, 20 + b, 2.4, P.accent); disc(c, 55, 20 + b, 2.4, P.accent);
      }
    }
  };
  function drawExtra(ctx, id, layer, w, h, frame, action, pal) {
    const E = typeof id === 'string' && has(EXTRAS, id) ? EXTRAS[id][layer] : null;
    if (!E || !ctx || typeof ctx.save !== 'function') return false;
    const act = action === 'move' ? 'move' : 'idle', f = ((Math.floor(num(frame, 0)) % FRAMES) + FRAMES) % FRAMES;
    ctx.save();
    ctx.scale(clamp(num(w, 64), 1, 1024) / 100, clamp(num(h, 64), 1, 1024) / 100);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    try { E(ctx, f, act, palette(pal, 'jungle')); } finally { ctx.restore(); }
    return true;
  }
  // Cycle 0 art: pixel finish for a baked frame on a real canvas (needs get/putImageData; test stubs skip it). Alpha is snapped to
  // 0 / 255 (no soft vector edge) and every empty pixel touching the shape gets the palette's dark line colour, t px thick
  // (t = dpr bucket, i.e. one art pixel), the same colour-matched outline the PNG creatures have. Bake time only.
  function pixelFinish(g, W, H, lineHex, t) {
    if (!g || typeof g.getImageData !== 'function' || typeof g.putImageData !== 'function') return false;
    const im = g.getImageData(0, 0, W, H), d = im.data, n = W * H, on = new Uint8Array(n);
    for (let i = 0; i < n; i++) { const a = d[i * 4 + 3]; if (a >= 128) { on[i] = 1; d[i * 4 + 3] = 255; } else d[i * 4 + 3] = 0; }
    const lr = parseInt(lineHex.slice(1, 3), 16), lg = parseInt(lineHex.slice(3, 5), 16), lb = parseInt(lineHex.slice(5, 7), 16);
    const r = Math.max(1, t | 0);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (on[i]) continue;
      let hit = false;
      for (let dy = -r; dy <= r && !hit; dy++) for (let dx = -r; dx <= r && !hit; dx++) {
        const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < W && Y < H && on[Y * W + X]) hit = true;
      }
      if (hit) { const o = i * 4; d[o] = lr; d[o + 1] = lg; d[o + 2] = lb; d[o + 3] = 255; }
    }
    g.putImageData(im, 0, 0);
    return true;
  }

  // Draw one frame onto ctx, filling a w x h box (scaled from the 100-unit design box). Returns true when drawn.
  function drawFrame(ctx, archetype, w, h, frame, action, pal) {
    if (!ctx || typeof ctx.save !== 'function' || typeof ctx.arc !== 'function') return false;
    const a = archOf(archetype), act = action === 'move' ? 'move' : 'idle', f = ((Math.floor(num(frame, 0)) % FRAMES) + FRAMES) % FRAMES;
    const P = palette(pal, 'jungle');
    ctx.save();
    ctx.scale(clamp(num(w, 64), 1, 1024) / 100, clamp(num(h, 64), 1, 1024) / 100);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    try { BODIES[a](ctx, f, act, P); } finally { ctx.restore(); }
    return true;
  }
  // One baked shadow per size class: a flat ellipse at the feet.
  function drawShadow(ctx, w, h) {
    if (!ctx || typeof ctx.save !== 'function' || typeof ctx.arc !== 'function') return false;
    const W = clamp(num(w, 64), 1, 1024), H = clamp(num(h, 16), 1, 1024);
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(W * 0.46, H * 0.4); ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fillStyle = SHADOW; ctx.fill(); ctx.restore();
    return true;
  }

  const defaultCreate = (w, h) => {
    if (typeof document === 'undefined' || !document.createElement) return null;
    const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  };

  // makeBaker(create, cap): bake(spec, opts) -> {key, id, archetype, sizeClass, px, dpr, w, h, frames:{idle:[4],move:[4]}, shadow, ax, ay, hit}
  //   spec = {id, archetype, size:'S|M|L|XL', palette:{body,belly,accent,eye,line} | biome:'jungle'}; opts = {dpr}
  // The same spec returns the SAME cached object. Returns null when no canvas can be made.
  // opts3 = {finish: false} turns the cycle-0 pixel finish (alpha snap + outline) off for this baker.
  function makeBaker(create, cap, opts3) {
    const make = typeof create === 'function' ? create : defaultCreate;
    const finish = !(isObj(opts3) && opts3.finish === false);
    const max = clamp(Math.floor(num(cap, CACHE_CAP)), 1, 512);
    const cache = new Map(), shadows = new Map();
    function shadowFor(sizeClass, dpr) {
      const k = sizeClass + '|' + dpr;
      if (shadows.has(k)) return shadows.get(k);
      const W = px(sizeClass, dpr), H = Math.max(4, Math.round(W / 4));
      let cv = null;
      try { cv = make(W, H); const g = cv && cv.getContext && cv.getContext('2d'); if (!g || !drawShadow(g, W, H)) cv = null; } catch (e) { cv = null; }
      if (cv) shadows.set(k, cv);
      return cv;
    }
    function bake(spec, opts) {
      try {
        const s = isObj(spec) ? spec : {};
        const arch = archOf(s.archetype), sc = sizeOf(s.size), dpr = dprBucket(isObj(opts) ? opts.dpr : 1);
        const biome = typeof s.biome === 'string' && has(PALETTES, s.biome) ? s.biome : 'jungle';
        const P = palette(s.palette, biome);
        const id = typeof s.id === 'string' && /^[a-z0-9_]{1,24}$/.test(s.id) ? s.id : arch;
        const key = [id, arch, sc, dpr, PAL_KEYS.map((k) => P[k]).join('')].join('|') + (finish ? '' : '|raw');
        if (cache.has(key)) { const v = cache.get(key); cache.delete(key); cache.set(key, v); return v; }
        const W = px(sc, dpr);
        const frames = { idle: [], move: [] };
        for (let ai = 0; ai < ACTIONS.length; ai++) {
          for (let f = 0; f < FRAMES; f++) {
            const cv = make(W, W);
            const g = cv && cv.getContext && cv.getContext('2d');
            if (!g) return null;
            drawExtra(g, id, 'back', W, W, f, ACTIONS[ai], P);
            if (!drawFrame(g, arch, W, W, f, ACTIONS[ai], P)) return null;
            drawExtra(g, id, 'front', W, W, f, ACTIONS[ai], P);
            if (finish) pixelFinish(g, W, W, P.line, dpr >= 2 ? 2 : 1);
            frames[ACTIONS[ai]].push(cv);
          }
        }
        const out = { key: key, id: id, archetype: arch, sizeClass: sc, px: SIZES[sc], dpr: dpr, w: W, h: W, frames: frames,
          shadow: shadowFor(sc, dpr), ax: W / 2, ay: Math.round(W * 0.9), hit: HIT_RADIUS[sc] };
        cache.set(key, out);
        while (cache.size > max) cache.delete(cache.keys().next().value);
        return out;
      } catch (e) { return null; }
    }
    return { bake: bake, size: () => cache.size, clear: () => { cache.clear(); shadows.clear(); } };
  }
  // A frame index for an animation clock: idle 4 fps, move 8 fps (callers pass seconds).
  const frameAt = (action, t) => Math.floor(Math.max(0, num(t, 0)) * (action === 'move' ? 8 : 4)) % FRAMES;

  const shared = makeBaker(null);
  return {
    ARCHETYPES: ARCHETYPES, ACTIONS: ACTIONS, FRAMES: FRAMES, SIZES: SIZES, HIT_RADIUS: HIT_RADIUS, PALETTES: PALETTES, SHADOW: SHADOW,
    dprBucket: dprBucket, px: px, palette: palette, paletteFor: paletteFor, drawFrame: drawFrame, drawShadow: drawShadow,
    EXTRA_IDS: Object.keys(EXTRAS), drawExtra: drawExtra, pixelFinish: pixelFinish,
    makeBaker: makeBaker, bake: shared.bake, frameAt: frameAt, defaultCreate: defaultCreate
  };
});
