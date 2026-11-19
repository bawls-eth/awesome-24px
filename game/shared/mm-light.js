// MMLight: block + sky light levels (0..15) over a plain grid. Pure, deterministic, no DOM.
// grid = { w, h, d, blocks: Uint8Array } indexed x + z*w + y*w*d ; y is depth (0 = top/sky).
// Torch: block id 11 (opts.torch overrides). Opaque: opts.opaque(id), default not air(0)/water(9)/torch(11).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMLight = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const TORCH_LIGHT = 14, SKY_LIGHT = 15, TORCH_ID = 11;
  const defOpaque = (id) => id !== 0 && id !== 9 && id !== TORCH_ID;
  function bfs(grid, seeds, opaque, out) {
    const { w, h, d, blocks } = grid;
    const q = [];
    for (const s of seeds) if (s[1] > out[s[0]]) { out[s[0]] = s[1]; q.push(s[0]); }
    for (let head = 0; head < q.length; head++) {
      const i = q[head], lv = out[i];
      if (lv <= 1) continue;
      const x = i % w, z = Math.floor(i / w) % d, y = Math.floor(i / (w * d));
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, z > 0 ? i - w : -1, z < d - 1 ? i + w : -1, y > 0 ? i - w * d : -1, y < h - 1 ? i + w * d : -1];
      for (const n of nb) if (n >= 0 && !opaque(blocks[n]) && out[n] < lv - 1) { out[n] = lv - 1; q.push(n); }
    }
  }
  // Returns { sky, block, light } Uint8Arrays (light = max of both).
  function propagate(grid, opts) {
    opts = opts || {};
    const opaque = opts.opaque || defOpaque;
    const torchId = opts.torch === undefined ? TORCH_ID : opts.torch;
    const { w, h, d, blocks } = grid, n = w * h * d;
    const sky = new Uint8Array(n), block = new Uint8Array(n);
    const skySeeds = [], torchSeeds = [];
    for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) { const i = x + z * w + y * w * d; if (opaque(blocks[i])) break; skySeeds.push([i, SKY_LIGHT]); }
    }
    for (let i = 0; i < n; i++) if (blocks[i] === torchId) torchSeeds.push([i, TORCH_LIGHT]);
    bfs(grid, skySeeds, opaque, sky);
    bfs(grid, torchSeeds, opaque, block);
    const light = new Uint8Array(n);
    for (let i = 0; i < n; i++) light[i] = Math.max(sky[i], block[i]);
    return { sky, block, light };
  }
  return { TORCH_LIGHT, SKY_LIGHT, propagate };
});
