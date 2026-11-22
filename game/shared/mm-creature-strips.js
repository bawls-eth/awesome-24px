// MMCreatureStrips: real PNG animation strips for the Hearthvale Isles creatures (Codex b31a jungle-creatures-core, b32 jungle-big-and-boss,
// b31b jungle-creatures-rest: vinecoil + canopy_glider, provisional; its moth_lantern has no MMCreatures def yet, so it is not wired;
// b31af glimmerfrog sleep + eat; b32s the XL stegolith with saddle overlays + seat; b36 the seven Hearth Isle meadow tameables at their
// size-class cells after the AW3 redo; b38a the reef puffer; b38b-f the rest of the Coral Reef: shellcrab, glowjelly (core 12 only),
// fin raider (S), the tidesteed / skimray swim mounts (L, body + saddle overlays + per-frame seat) and the isleback turtle (XL, seat, no
// saddle: it is ridden bare), all provisional).
// The strip table below mirrors the batch manifests (the node test checks it against manifest.json). Each strip is one row of square
// cells (4x pixel art: 192 / 256 / 384 / 512 px cells hold 48 / 64 / 96 / 128 px native art for the S / M / L / XL size classes), facing
// down / up / right; left is the mirrored right. A strip's cell is its manifest frame_h (= the PNG height); the loader trusts the PNG.
// Pure helpers (no DOM): dirCode (facing from a movement vector, with hysteresis), actionFor (which action a creature state shows, with
// per-creature fallbacks), frameIndex (time -> frame, loop or hold), stripId (precomputed ids, no string building per frame).
// create(opts) loads every PNG ONCE and bakes each strip to its native size (1/4) on a canvas, so a frame is one unscaled blit.
// Anything missing (image failed, no canvas) leaves that creature on the code-drawn MMCreatureDraw bake. Browser: window.MMCreatureStrips.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMCreatureStrips = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const B31A = '../../assets/arcane/b31a-jungle-creatures-core/enemies/';
  const B32 = '../../assets/arcane/b32-jungle-big-and-boss/creatures/';
  const B31B = '../../assets/arcane/b31b-jungle-creatures-rest/enemies/';
  const B31AF = '../../assets/arcane/b31af-glimmerfrog-rest/enemies/';
  const B32S = '../../assets/arcane/b32s-stegolith/creatures/';
  const B36 = '../../assets/arcane/b36-meadow-creatures/enemies/';
  const B38A = '../../assets/arcane/b38a-reef-puffer/creatures/';
  const B38B = '../../assets/arcane/b38b-shellcrab/creatures/';
  const B38C = '../../assets/arcane/b38c-reef-mounts/creatures/';
  const B38D = '../../assets/arcane/b38d-glowjelly/creatures/';
  const B38E = '../../assets/arcane/b38e-fin-raider/creatures/';
  const B38F = '../../assets/arcane/b38f-isleback-turtle/creatures/';
  const DIRS = ['down', 'up', 'right'];       // dir codes 0 1 2; code 3 = left (the right strip, mirrored)
  const DOWN = 0, UP = 1, RIGHT = 2, LEFT = 3;
  const SCALE = 4;                            // cells are 4x upscaled pixel art: draw at 1/4 (native) so every pixel stays crisp
  // per-action [frames, fps, loop, onlyDown]; the same timing in every b31a / b31b / b32 manifest
  const ACT = { idle: [4, 6, 1, 0], move: [6, 10, 1, 0], attack: [5, 12, 0, 0], death: [5, 10, 0, 0], sleep: [4, 6, 1, 1], eat: [4, 8, 1, 1],
    roar: [5, 12, 0, 0], saddle_idle: [4, 6, 1, 0], saddle_move: [6, 10, 1, 0] };
  const CORE = ['idle', 'move', 'attack', 'death'];
  // creature -> {dir, cell (manifest frame_w = frame_h), ax / ay (feet anchor in cell px), actions, biome (the island that preloads it),
  //   adir (per-action folder), fps (per-action fps override)}
  const MEADOW = (k, extra) => Object.assign({ dir: B36 + k + '/', cell: 256, ax: 128, ay: 231, acts: CORE.concat(['sleep', 'eat']), biome: 'meadow', fps: { death: 9 } }, extra || {});
  // b36 small-size redo: S class, 192 px cells (48 px native), feet 96,173 (puffwool 96,169), death at 10 fps
  const MEADOW_S = (k, ay) => MEADOW(k, { cell: 192, ax: 96, ay: ay || 173, fps: {} });
  const SPECS = {
    chompbill: { dir: B31A + 'chompbill/', cell: 256, ax: 128, ay: 231, acts: CORE.concat(['sleep', 'eat']) },
    fernraptor: { dir: B31A + 'fernraptor/', cell: 256, ax: 128, ay: 231, acts: CORE.concat(['sleep', 'eat']) },
    glimmerfrog: { dir: B31A + 'glimmerfrog/', cell: 256, ax: 128, ay: 231, acts: CORE.concat(['sleep', 'eat']), adir: { sleep: B31AF + 'glimmerfrog/', eat: B31AF + 'glimmerfrog/' } },
    // b31b (same conventions as b31a: 256 px cells, feet anchor 128,231, the 12 core strips)
    vinecoil: { dir: B31B + 'vinecoil/', cell: 256, ax: 128, ay: 231, acts: CORE.slice() },
    canopy_glider: { dir: B31B + 'canopy_glider/', cell: 256, ax: 128, ay: 231, acts: CORE.slice() },
    tusktop: { dir: B32 + 'tusktop/', cell: 384, ax: 192, ay: 350, acts: CORE.concat(['sleep', 'eat', 'saddle_idle', 'saddle_move']),
      seat: { x: [192, 192, 172], idle: [[160, 156, 152, 156], [184, 180, 176, 180], [212, 208, 204, 208]],
        move: [[160, 152, 148, 156, 152, 148], [184, 176, 172, 180, 176, 172], [212, 204, 200, 208, 204, 200]] } },
    fernjaw_tyrant: { dir: B32 + 'fernjaw_tyrant/', cell: 512, ax: 256, ay: 463, acts: CORE.concat(['sleep', 'eat', 'roar', 'saddle_idle', 'saddle_move']),
      seat: { x: [256, 256, 232], idle: [[184, 180, 176, 180], [216, 208, 204, 208], [248, 244, 240, 244]],
        move: [[184, 176, 168, 180, 176, 168], [216, 204, 200, 208, 204, 200], [248, 240, 236, 244, 240, 236]] } },
    // b32s: XL body strips (512 px cells, feet 256,463) + separate saddle overlays; seat per frame from the manifest
    stegolith: { dir: B32S + 'stegolith/', cell: 512, ax: 256, ay: 463, acts: CORE.concat(['sleep', 'eat', 'saddle_idle', 'saddle_move']),
      seat: { x: [252, 252, 256], idle: [[224, 220, 216, 220], [224, 220, 216, 220], [224, 220, 216, 220]],
        move: [[224, 216, 220, 224, 216, 220], [224, 216, 220, 224, 216, 220], [224, 216, 220, 224, 216, 220]] } },
    // b36 Hearth Isle meadow, the 14 strips each: S small four (192 px), M thistle boar (256, feet 128,231), L strider (384, feet 192,347,
    // per-frame seat), XL oakback (512, feet 256,463); the M / L / XL death runs at 9 fps
    clover_hopper: MEADOW_S('clover_hopper'), puffwool: MEADOW_S('puffwool', 169), bumble_mote: MEADOW_S('bumble_mote'), pebble_tortle: MEADOW_S('pebble_tortle'),
    thistle_boar: MEADOW('thistle_boar'),
    meadow_strider: MEADOW('meadow_strider', { cell: 384, ax: 192, ay: 347, seat: { x: [192, 192, 189], idle: [[165, 171, 165, 159], [165, 171, 165, 159], [165, 171, 165, 159]],
      move: [[159, 171, 165, 153, 165, 171], [159, 171, 165, 153, 165, 171], [159, 171, 165, 153, 165, 171]] } }),
    oakback: MEADOW('oakback', { cell: 512, ax: 256, ay: 463 }),
    // b38a Coral Reef: the reef puffer (S, 192 px cells, feet 96,171, the 14 strips, death at 9 fps)
    reef_puffer: { dir: B38A + 'reef_puffer/', cell: 192, ax: 96, ay: 171, acts: CORE.concat(['sleep', 'eat']), biome: 'reef', fps: { death: 9 } },
    // b38b-f the rest of the reef: S shellcrab / glowjelly / fin raider (192, feet 96,171; the glowjelly has no sleep / eat), L tidesteed /
    // skimray swim mounts (384, feet 192,347, saddle overlays, per-frame seat), XL isleback turtle (512, feet 256,463, seat, no saddle)
    shellcrab: { dir: B38B + 'shellcrab/', cell: 192, ax: 96, ay: 171, acts: CORE.concat(['sleep', 'eat']), biome: 'reef' },
    glowjelly: { dir: B38D + 'glowjelly/', cell: 192, ax: 96, ay: 171, acts: CORE.slice(), biome: 'reef' },
    fin_raider: { dir: B38E + 'fin_raider/', cell: 192, ax: 96, ay: 171, acts: CORE.concat(['sleep', 'eat']), biome: 'reef' },
    tidesteed: { dir: B38C + 'tidesteed/', cell: 384, ax: 192, ay: 347, acts: CORE.concat(['sleep', 'eat', 'saddle_idle', 'saddle_move']), biome: 'reef',
      seat: { x: [192, 192, 180], idle: [[152, 148, 152, 156], [152, 148, 152, 156], [160, 156, 160, 164]],
        move: [[152, 144, 148, 156, 160, 156], [152, 144, 148, 156, 160, 156], [160, 152, 156, 164, 168, 164]] } },
    skimray: { dir: B38C + 'skimray/', cell: 384, ax: 192, ay: 347, acts: CORE.concat(['sleep', 'eat', 'saddle_idle', 'saddle_move']), biome: 'reef',
      seat: { x: [192, 192, 184], idle: [[156, 152, 156, 160], [156, 152, 156, 160], [148, 144, 148, 152]],
        move: [[156, 148, 152, 160, 164, 160], [156, 148, 152, 160, 164, 160], [148, 140, 144, 152, 156, 152]] } },
    // sdy: the turtle's manifest seat (y 152-164) puts the rider inside the coral crown; drawn 6 native px lower, on the shell in front of
    // the crown (the crown reads as a backrest). Only the drawn seat moves; the table still mirrors the manifest.
    isleback_turtle: { dir: B38F + 'isleback_turtle/', cell: 512, ax: 256, ay: 463, acts: CORE.concat(['sleep', 'eat']), biome: 'reef', sdy: 6,
      seat: { x: [256, 256, 232], idle: [[152, 148, 152, 156], [152, 148, 152, 156], [160, 156, 160, 164]],
        move: [[152, 144, 148, 156, 156, 152], [152, 144, 148, 156, 156, 152], [160, 152, 156, 164, 164, 160]] } }
  };
  const KINDS = Object.keys(SPECS);
  const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  KINDS.forEach((k) => { if (!SPECS[k].biome) SPECS[k].biome = 'jungle'; });
  // kindsFor(biome, extra): the species an island preloads: its own biome's plus any listed (the stable roster), table order
  function kindsFor(biome, extra) {
    const more = Array.isArray(extra) ? extra : [];
    return KINDS.filter((k) => SPECS[k].biome === biome || more.indexOf(k) >= 0);
  }
  // fpsOf(act, kind): the action's fps (a batch may override it per creature)
  const fpsOf = (act, kind) => { const sp = kind && has(SPECS, kind) ? SPECS[kind] : null; return sp && sp.fps && sp.fps[act] > 0 ? sp.fps[act] : (has(ACT, act) ? ACT[act][1] : ACT.idle[1]); };

  // ID[kind][act] = [down, up, right, left(=right)] strip ids, built once
  const ID = {};
  KINDS.forEach((k) => {
    ID[k] = {};
    SPECS[k].acts.forEach((a) => {
      const one = ACT[a][3];
      const ids = DIRS.map((d, i) => k + '_' + a + '_' + (one && i ? 'down' : d));
      ids.push(ids[2]);
      ID[k][a] = ids;
    });
  });
  const stripId = (kind, act, dir) => (has(ID, kind) && has(ID[kind], act) ? ID[kind][act][dir & 3] : null);
  // every PNG to load: [{id, kind, act, dir, url}]
  function files(kinds) {
    const out = [];
    (Array.isArray(kinds) ? kinds : KINDS).forEach((k) => {
      if (!has(SPECS, k)) return;
      SPECS[k].acts.forEach((a) => {
        const dirs = ACT[a][3] ? ['down'] : DIRS;
        const base = SPECS[k].adir && SPECS[k].adir[a] ? SPECS[k].adir[a] : SPECS[k].dir;
        dirs.forEach((d) => { const id = k + '_' + a + '_' + d; out.push({ id: id, kind: k, act: a, dir: d, url: base + id + '.png' }); });
      });
    });
    return out;
  }

  // dirCode(vx, vy, prev): facing from a movement vector. Below `still` px/s the previous facing is kept; a near-diagonal keeps the
  // previous axis (hysteresis) so a creature does not flicker between side and front views.
  function dirCode(vx, vy, prev, still) {
    const p = prev === UP || prev === RIGHT || prev === LEFT ? prev : DOWN;
    vx = Number(vx) || 0; vy = Number(vy) || 0;
    const ax = Math.abs(vx), ay = Math.abs(vy);
    if (ax + ay < (still > 0 ? still : 4)) return p;
    const side = p === RIGHT || p === LEFT;
    const horiz = side ? ax >= ay * 0.8 : ax > ay * 1.25;
    if (horiz) return vx < 0 ? LEFT : RIGHT;
    return vy < 0 ? UP : DOWN;
  }
  // frameIndex(act, t, kind): frame for an animation clock in seconds (looping actions wrap, one-shots hold their last frame);
  // kind (optional) applies that creature's fps override
  function frameIndex(act, t, kind) {
    const a = has(ACT, act) ? ACT[act] : ACT.idle;
    const f = Math.floor(Math.max(0, Number(t) || 0) * (kind ? fpsOf(act, kind) : a[1]));
    return a[2] ? f % a[0] : Math.min(a[0] - 1, f);
  }
  // seconds a one-shot action takes (death / attack / roar)
  const duration = (act, kind) => (has(ACT, act) ? ACT[act][0] / (kind ? fpsOf(act, kind) : ACT[act][1]) : 0);
  // actionFor(kind, st): st = {dying, ko, eating, ph:'wind'|'strike'|'rest'|'', moving}. Falls back to an action the creature has.
  //   dying -> death; eating (just fed) -> eat; ko -> sleep; wind-up -> roar (when it has one, the boss telegraph) else attack; strike -> attack;
  //   moving -> move; else idle. A creature without sleep / eat shows idle.
  function actionFor(kind, st) {
    const acts = has(ID, kind) ? ID[kind] : null;
    if (!acts || !st) return 'idle';
    if (st.dying) return 'death';
    if (st.eating && acts.eat) return 'eat';
    if (st.ko) return acts.sleep ? 'sleep' : 'idle';
    if (st.ph === 'wind') return acts.roar ? 'roar' : 'attack';
    if (st.ph === 'strike') return 'attack';
    return st.moving ? 'move' : 'idle';
  }
  // the saddle overlay shown on top of the mount's own idle / move strip while ridden (null when it has none)
  // seatOffset(kind, moving, dir, frame, out): where the rider sits, in native px from the feet anchor (out.x right, out.y up; left mirrors
  // x). Writes into `out` (no allocation) and returns true, or false when the creature has no seat data.
  function seatOffset(kind, moving, dir, frame, out) {
    const sp = has(SPECS, kind) ? SPECS[kind] : null;
    if (!sp || !sp.seat || !out) return false;
    const d = dir === LEFT ? RIGHT : (dir === UP ? UP : dir === RIGHT ? RIGHT : DOWN);
    const ys = sp.seat[moving ? 'move' : 'idle'][d];
    const f = ((frame | 0) % ys.length + ys.length) % ys.length;
    out.x = (sp.seat.x[d] - sp.ax) / SCALE * (dir === LEFT ? -1 : 1);
    out.y = (sp.ay - ys[f]) / SCALE - (sp.sdy || 0);
    return true;
  }
  // flip: a left-facing strip is the right strip mirrored; down-only actions (sleep, eat) never mirror
  const flipFor = (act, dir) => dir === LEFT && !(has(ACT, act) && ACT[act][3]);
  const saddleFor = (kind, moving) => { const a = moving ? 'saddle_move' : 'saddle_idle'; return has(ID, kind) && ID[kind][a] ? a : null; };

  function defaultLoadImage(url) {
    return new Promise((res) => {
      if (typeof Image === 'undefined') return res(null);
      const im = new Image();
      im.onload = () => res(im); im.onerror = () => res(null);
      im.src = url;
    });
  }
  const defaultCreate = (w, h) => {
    if (typeof document === 'undefined' || !document.createElement) return null;
    const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  };

  // create(opts) -> strip set. opts: {art:false (load nothing), kinds, loadImage(url)->Promise<image|null>, create(w,h)->canvas}
  //  .ready: Promise resolving once every load settled. .has(kind): its idle + move strips (all three views) are in.
  //  .get(kind, act, dir) -> baked strip {id, src, frames, sw, sh, w, h, ax, ay, top, span} (falls back to idle of the same view, then idle down)
  //  .draw(ctx, strip, frame, x, y, scale): blits one cell with its anchor on (x, y). Never throws.
  function create(opts) {
    const o = opts && typeof opts === 'object' ? opts : {};
    const li = typeof o.loadImage === 'function' ? o.loadImage : defaultLoadImage;
    const mk = typeof o.create === 'function' ? o.create : defaultCreate;
    const baked = {};      // id -> strip
    const okKind = {};
    function bake(f, im) {
      const sp = SPECS[f.kind], n = ACT[f.act][0];
      const iw = im.naturalWidth || im.width || 0, ih = im.naturalHeight || im.height || 0;
      // the cell is the PNG height (square cells, the manifest frame_h); a redo that changed the cell size still bakes at 1/4 with the
      // anchor scaled to it. A height under 64 px or not a 4x multiple is rejected.
      const cell = ih >= 64 && ih % SCALE === 0 ? ih : 0, r = cell / sp.cell;
      if (!cell || !(iw >= cell)) return null;
      const frames = Math.max(1, Math.min(n, Math.floor(iw / cell)));
      const w = cell / SCALE, h = cell / SCALE;
      let src = im, sw = cell, top = 0, span = w;
      try {
        const cv = mk(w * frames, h);
        const g = cv && cv.getContext && cv.getContext('2d');
        if (g) {
          g.imageSmoothingEnabled = false; g.drawImage(im, 0, 0, cell * frames, cell, 0, 0, w * frames, h); src = cv; sw = w;
          // first opaque row over all frames (for the health bar / tame icons above the head), measured once here
          if (typeof g.getImageData === 'function') {
            const d = g.getImageData(0, 0, w * frames, h).data, rw = w * frames * 4;
            top = h;
            for (let y = 0; y < h && top === h; y++) for (let i = y * rw + 3; i < (y + 1) * rw; i += 4) if (d[i] > 0) { top = y; break; }
            if (top === h) top = 0;
            // widest opaque run of any frame (native px): the ground shadow is sized to the body, not the cell (an S body fills ~half its cell)
            let best = 0;
            for (let fi = 0; fi < frames; fi++) {
              let lo = w, hi = -1;
              for (let y = top; y < h; y++) for (let x = 0; x < w; x++) if (d[y * rw + (fi * w + x) * 4 + 3] > 0) { if (x < lo) lo = x; if (x > hi) hi = x; }
              if (hi - lo + 1 > best) best = hi - lo + 1;
            }
            if (best > 0) span = best;
          }
        }
      } catch (e) { src = im; sw = cell; top = 0; span = w; }
      // w / h / ax / ay / top / span in native (drawn) px; sw / sh the source cell
      return { id: f.id, kind: f.kind, act: f.act, src: src, frames: frames, sw: sw, sh: sw, w: w, h: h, ax: sp.ax * r / SCALE, ay: sp.ay * r / SCALE, top: top, span: span };
    }
    const self = {
      kinds: KINDS,
      has: (kind) => okKind[kind] === true,
      count: () => Object.keys(baked).length,
      get(kind, act, dir) {
        if (okKind[kind] !== true) return null;
        const d = dir & 3;
        return baked[stripId(kind, act, d)] || baked[stripId(kind, 'idle', d)] || baked[stripId(kind, 'idle', DOWN)] || null;
      },
      draw(ctx, s, frame, x, y, scale, flip) {
        if (!s || !ctx) return false;
        const k = scale > 0 ? scale : 1, f = ((frame | 0) % s.frames + s.frames) % s.frames;
        const dw = s.w * k, dh = s.h * k;
        if (flip) {
          ctx.save(); ctx.translate(x, 0); ctx.scale(-1, 1);
          ctx.drawImage(s.src, f * s.sw, 0, s.sw, s.sh, -s.ax * k, y - s.ay * k, dw, dh);
          ctx.restore();
        } else ctx.drawImage(s.src, f * s.sw, 0, s.sw, s.sh, x - s.ax * k, y - s.ay * k, dw, dh);
        return true;
      }
    };
    if (o.art === false) { self.ready = Promise.resolve(self); return self; }
    const list = files(o.kinds);
    self.ready = Promise.all(list.map((f) => Promise.resolve().then(() => li(f.url)).then((im) => {
      if (!im) return;
      const s = bake(f, im);
      if (s) baked[f.id] = s;
    }, () => {}))).then(() => {
      // a creature uses its strips only when idle and move are complete in all three views (else the code bake, never a half set)
      KINDS.forEach((k) => { okKind[k] = ['idle', 'move'].every((a) => DIRS.every((d, i) => !!baked[stripId(k, a, i)])); });
      return self;
    });
    return self;
  }

  return { SPECS: SPECS, ACT: ACT, DIRS: DIRS, KINDS: KINDS, SCALE: SCALE, DOWN: DOWN, UP: UP, RIGHT: RIGHT, LEFT: LEFT,
    stripId: stripId, files: files, kindsFor: kindsFor, fpsOf: fpsOf, dirCode: dirCode, frameIndex: frameIndex, duration: duration, actionFor: actionFor, saddleFor: saddleFor, seatOffset: seatOffset, flipFor: flipFor, create: create };
});
