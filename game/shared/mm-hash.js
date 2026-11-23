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
    // Footprints over BIG cells (a huge or infinite radius) are not spread over the grid: that loop would hang the frame.
    // They go in one overflow list every query scans; a query that big scans every item instead. NaN positions never hit.
    const BIG = 1024, big = [];
    let bigN = 0;
    const span = (x0, x1, y0, y1) => (x1 - x0 + 1) * (y1 - y0 + 1);
    const key = (cx, cy) => (cx + 32768) * 65536 + (cy + 32768);

    function clear() {
      for (let i = 0; i < usedN; i++) { used[i].length = 0; used[i] = null; }
      usedN = 0; n = 0; bigN = 0;
    }

    function insert(id, x, y, r) {
      const idx = n++;
      ids[idx] = id; xs[idx] = x; ys[idx] = y; rs[idx] = r; stamp[idx] = 0;
      if (typeof x !== 'number' || typeof y !== 'number' || x !== x || y !== y || !isFinite(x) || !isFinite(y)) return; // stored, never a candidate
      if (!(r >= 0)) r = 0;
      const x0 = Math.floor((x - r) * inv), x1 = Math.floor((x + r) * inv);
      const y0 = Math.floor((y - r) * inv), y1 = Math.floor((y + r) * inv);
      if (!(span(x0, x1, y0, y1) <= BIG)) { big[bigN++] = idx; return; }
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
      if (!(span(x0, x1, y0, y1) <= BIG)) { // huge (or NaN) query: every finite item is a candidate
        if (x !== x || y !== y) return;
        for (let idx = 0; idx < n; idx++) { if (isFinite(xs[idx]) && isFinite(ys[idx])) { stamp[idx] = s; cb(ids[idx], xs[idx], ys[idx], rs[idx]); } }
        return;
      }
      for (let i = 0; i < bigN; i++) { const idx = big[i]; stamp[idx] = s; cb(ids[idx], xs[idx], ys[idx], rs[idx]); }
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
