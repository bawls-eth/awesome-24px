// Cycle 9 art (G): Town wildlife drawn from Codex T-batch PNG strips (original art, game/assets/arcane/tNN-*/fauna/).
// Each strip is a 4x export (every art pixel a 4x4 block). The Town draws fauna at the hero's pixel density (W-06: deer ~31 px,
// fox ~25 px next to the 24 px hero), so every frame is baked ONCE at create into ONE canvas texture per animal at HALF native size
// (deer 64 -> 32 px cell, fox / owl 48 -> 24 px cell) with a 2x2 mode filter: a cell is opaque when 2+ of its 4 native pixels are,
// its colour is the most common one (ties -> darker), and a single very dark pixel (an eye) in a solid cell wins so faces keep eyes.
// Frames: <action>_<dir>_<n> on texture fft_<id>; Phaser anims fft_<id>_<action>_<dir>. A strip that fails to load, a missing module
// or ?ffstrips=0 leaves the species on its SVG / pixelized SVG art (unchanged fallback). Nothing runs per frame.
(function (root) {
  'use strict';
  const BASE = 'assets/arcane/';
  // id -> batch folder + native cell. Actions per the T-format: idle 2 f, move 4 f, caught 1 f; dirs right (left = flipX) + down.
  const SPECS = {
    deer: { batch: 't17-deer', cell: 64, fps: { idle: 2, move: 8 } },
    fox: { batch: 't17-fox', cell: 48, fps: { idle: 2, move: 8 } },
    owl: { batch: 't17-owl', cell: 48, fps: { idle: 2, move: 8 } },
  };
  const STRIPS = [
    { action: 'idle', dir: 'right', file: 'idle' }, { action: 'idle', dir: 'down', file: 'idle_down' },
    { action: 'move', dir: 'right', file: 'move' }, { action: 'move', dir: 'down', file: 'move_down' },
    { action: 'caught', dir: 'right', file: 'caught' }, { action: 'caught', dir: 'down', file: 'caught_down' },
  ];
  const enabled = () => { try { return !/[?&]ffstrips=0(&|$)/.test(root.location.search); } catch (e) { return true; } };
  const srcKey = (id, file) => `ffsrc_${id}_${file}`;
  const url = (id, file) => `${BASE}${SPECS[id].batch}/fauna/ff_${id}_${file}.png`;
  const lum = (r, g, b) => r * 0.3 + g * 0.59 + b * 0.11;

  // 4x PNG image -> native RGBA (sample the centre of each 4x4 block).
  function nativeData(img) {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0);
    const src = cx.getImageData(0, 0, w, h).data;
    const nw = w >> 2, nh = h >> 2, out = new Uint8ClampedArray(nw * nh * 4);
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
      const s = ((y * 4 + 1) * w + (x * 4 + 1)) * 4, d = (y * nw + x) * 4;
      out[d] = src[s]; out[d + 1] = src[s + 1]; out[d + 2] = src[s + 2]; out[d + 3] = src[s + 3] > 127 ? 255 : 0;
    }
    return { w: nw, h: nh, data: out };
  }

  // native RGBA -> half size, 2x2 mode filter (see the header).
  function halve(n) {
    const hw = n.w >> 1, hh = n.h >> 1, out = new Uint8ClampedArray(hw * hh * 4), p = n.data;
    for (let y = 0; y < hh; y++) for (let x = 0; x < hw; x++) {
      const cols = [];
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        const s = ((y * 2 + j) * n.w + (x * 2 + i)) * 4;
        if (p[s + 3]) cols.push([p[s], p[s + 1], p[s + 2]]);
      }
      const d = (y * hw + x) * 4;
      if (cols.length < 2) continue;
      const count = (c) => cols.filter((o) => o[0] === c[0] && o[1] === c[1] && o[2] === c[2]).length;
      let best = cols[0];
      cols.forEach((c) => {
        const k = count(c), kb = count(best);
        if (k > kb || (k === kb && lum(c[0], c[1], c[2]) < lum(best[0], best[1], best[2]))) best = c;
      });
      if (cols.length === 4) {
        const dark = cols.reduce((a, c) => (lum(c[0], c[1], c[2]) < lum(a[0], a[1], a[2]) ? c : a), cols[0]);
        if (count(dark) === 1 && lum(dark[0], dark[1], dark[2]) < 70 && lum(best[0], best[1], best[2]) - lum(dark[0], dark[1], dark[2]) > 90) best = dark;
      }
      out[d] = best[0]; out[d + 1] = best[1]; out[d + 2] = best[2]; out[d + 3] = 255;
    }
    return { w: hw, h: hh, data: out };
  }

  const MMTownFauna = {
    SPECS,
    enabled,
    ids: () => Object.keys(SPECS),
    url,
    // Phaser preload: queue every strip as a plain image (the bake slices it).
    preload(scene) {
      if (!enabled()) return;
      Object.keys(SPECS).forEach((id) => STRIPS.forEach((s) => scene.load.image(srcKey(id, s.file), url(id, s.file))));
    },
    // Phaser create: one canvas texture + anims per species whose 6 strips all loaded. Returns the wired ids.
    bake(scene) {
      const st = scene.ffStrips = { on: enabled(), ids: [], cells: {}, ms: 0, caughtUrl: {} };
      if (!st.on) return st;
      const t0 = performance.now();
      Object.keys(SPECS).forEach((id) => {
        try {
          if (!STRIPS.every((s) => scene.textures.exists(srcKey(id, s.file)))) return;
          const half = SPECS[id].cell >> 1;
          const parts = STRIPS.map((s) => {
            const n = nativeData(scene.textures.get(srcKey(id, s.file)).getSourceImage());
            return { s, n, frames: Math.round(n.w / SPECS[id].cell) };
          });
          const total = parts.reduce((a, p) => a + p.frames, 0);
          const cv = document.createElement('canvas'); cv.width = total * half; cv.height = half;
          const cx = cv.getContext('2d');
          const slots = [];
          let col = 0;
          parts.forEach((p) => {
            for (let f = 0; f < p.frames; f++) {
              const cell = { w: SPECS[id].cell, h: SPECS[id].cell, data: new Uint8ClampedArray(SPECS[id].cell * SPECS[id].cell * 4) };
              for (let y = 0; y < cell.h; y++) {
                const so = (y * p.n.w + f * cell.w) * 4;
                cell.data.set(p.n.data.subarray(so, so + cell.w * 4), y * cell.w * 4);
              }
              const h2 = halve(cell);
              cx.putImageData(new ImageData(h2.data, h2.w, h2.h), col * half, 0);
              slots.push({ name: `${p.s.action}_${p.s.dir}_${f}`, col });
              col++;
            }
            // The journal shows the caught pose at an integer zoom of the NATIVE art (crisp in the 160 px card).
            if (p.s.action === 'caught' && p.s.dir === 'right') {
              const z = SPECS[id].cell >= 64 ? 2 : 3, c2 = document.createElement('canvas');
              c2.width = p.n.w * z; c2.height = p.n.h * z;
              const t = document.createElement('canvas'); t.width = p.n.w; t.height = p.n.h;
              t.getContext('2d').putImageData(new ImageData(p.n.data, p.n.w, p.n.h), 0, 0);
              const g2 = c2.getContext('2d'); g2.imageSmoothingEnabled = false; g2.drawImage(t, 0, 0, c2.width, c2.height);
              st.caughtUrl[id] = c2.toDataURL('image/png');
            }
          });
          const key = `fft_${id}`;
          if (scene.textures.exists(key)) scene.textures.remove(key);
          const tex = scene.textures.addCanvas(key, cv);
          slots.forEach((sl) => tex.add(sl.name, 0, sl.col * half, 0, half, half));
          STRIPS.forEach((s) => {
            if (s.action === 'caught') return;
            const ak = `${key}_${s.action}_${s.dir}`;
            if (scene.anims.exists(ak)) return;
            const frames = slots.filter((sl) => sl.name.startsWith(`${s.action}_${s.dir}_`)).map((sl) => ({ key, frame: sl.name }));
            scene.anims.create({ key: ak, frames, frameRate: SPECS[id].fps[s.action], repeat: -1 });
          });
          st.ids.push(id);
          st.cells[id] = half;
        } catch (e) { /* this species keeps its SVG art */ }
      });
      st.ms = Math.round(performance.now() - t0);
      return st;
    },
    has(scene, id) { return !!(scene.ffStrips && scene.ffStrips.ids.indexOf(id) >= 0); },
    // Which strip to show: down when moving mostly toward the camera, else the profile (left = flipX of right).
    pick(dx, dy) { return dy > Math.abs(dx) ? 'down' : 'right'; },
    play(sprite, id, action, dir) {
      const ak = `fft_${id}_${action}_${dir}`;
      if (sprite.anims && sprite.anims.currentAnim && sprite.anims.currentAnim.key === ak && sprite.anims.isPlaying) return;
      sprite.play(ak, true);
    },
    _halve: halve,
  };
  root.MMTownFauna = MMTownFauna;
  if (typeof module !== 'undefined' && module.exports) module.exports = MMTownFauna;
})(typeof window !== 'undefined' ? window : globalThis);
