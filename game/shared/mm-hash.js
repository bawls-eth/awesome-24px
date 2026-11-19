// MMHash: uniform-grid spatial hash for circle-vs-circle hit tests (bullets vs enemies).
// Usage: const g = MMHash.create(64); each frame g.clear(); g.insert(id,x,y,r) ...; g.query(x,y,r,cb).
// cb(id, x, y, r) is called once per candidate whose grid cells overlap the query circle's bounding cells;
// the caller does the exact circle test. No per-call allocation: buffers are reused across frames.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMHash = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function create(cellSize) {
    const cs = cellSize > 0 ? cellSize : 64;
    const inv = 1 / cs;
    const cells = new Map();   // integer key -> reusable array of item indices
    const used = [];           // cells touched this frame, so clear() resets only those
    let usedN = 0;
    const ids = [], xs = [], ys = [], rs = [], stamp = [];
    let n = 0;
    let queryStamp = 0;
    const key = (cx, cy) => (cx + 32768) * 65536 + (cy + 32768);

    function clear() {
      for (let i = 0; i < usedN; i++) { used[i].length = 0; used[i] = null; }
      usedN = 0; n = 0;
    }

    function insert(id, x, y, r) {
      const idx = n++;
      ids[idx] = id; xs[idx] = x; ys[idx] = y; rs[idx] = r; stamp[idx] = 0;
      const x0 = Math.floor((x - r) * inv), x1 = Math.floor((x + r) * inv);
      const y0 = Math.floor((y - r) * inv), y1 = Math.floor((y + r) * inv);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          const k = key(cx, cy);
          let c = cells.get(k);
          if (!c) { c = []; cells.set(k, c); }
          if (c.length === 0) used[usedN++] = c;
          c.push(idx);
        }
      }
    }

    function query(x, y, r, cb) {
      const x0 = Math.floor((x - r) * inv), x1 = Math.floor((x + r) * inv);
      const y0 = Math.floor((y - r) * inv), y1 = Math.floor((y + r) * inv);
      const s = ++queryStamp;
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          const c = cells.get(key(cx, cy));
          if (!c) continue;
          for (let i = 0; i < c.length; i++) {
            const idx = c[i];
            if (stamp[idx] === s) continue;
            stamp[idx] = s;
            cb(ids[idx], xs[idx], ys[idx], rs[idx]);
          }
        }
      }
    }

    return { clear, insert, query, get size() { return n; }, cellSize: cs };
  }
  return { create };
});
