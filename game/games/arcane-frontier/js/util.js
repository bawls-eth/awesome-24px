/* Arcane Frontier - small math helpers, seeded RNG, spatial hash. */
(function () {
  const U = (AF.U = {});
  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.dist2 = (ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; };
  U.angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

  // mulberry32 seeded RNG -> function returning [0,1)
  U.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  U.rand = Math.random;
  U.range = (a, b, r) => a + (b - a) * (r || Math.random)();
  U.irange = (a, b, r) => Math.floor(a + (b - a + 1) * (r || Math.random)());

  // entries: [[value, weight], ...] or {key: weight}
  U.weighted = function (entries, r) {
    const list = Array.isArray(entries) ? entries : Object.keys(entries).map((k) => [k, entries[k]]);
    let total = 0; for (const e of list) total += Math.max(0, e[1]);
    if (total <= 0) return null;
    let x = (r || Math.random)() * total;
    for (const e of list) { x -= Math.max(0, e[1]); if (x < 0) return e[0]; }
    return list[list.length - 1][0];
  };

  // Does segment (x0,y0)->(x1,y1) pass within rad of (cx,cy)? Returns t in [0,1] of closest approach or -1.
  U.segCircle = function (x0, y0, x1, y1, cx, cy, rad) {
    const dx = x1 - x0, dy = y1 - y0;
    const fx = x0 - cx, fy = y0 - cy;
    const L = dx * dx + dy * dy;
    let t = L > 0 ? -(fx * dx + fy * dy) / L : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = fx + dx * t, py = fy + dy * t;
    return px * px + py * py <= rad * rad ? t : -1;
  };

  // Uniform-grid spatial hash for circles. Rebuilt every sim step (cheap: ~O(n)).
  class SpatialHash {
    constructor(cell) { this.cell = cell; this.map = new Map(); this.pool = []; this.used = []; }
    clear() {
      for (const arr of this.used) { arr.length = 0; this.pool.push(arr); }
      this.used.length = 0; this.map.clear();
    }
    key(cx, cy) { return (cx + 4096) * 8192 + (cy + 4096); }
    insert(obj) {
      const c = this.cell, r = obj.r || 0;
      const x0 = Math.floor((obj.x - r) / c), x1 = Math.floor((obj.x + r) / c);
      const y0 = Math.floor((obj.y - r) / c), y1 = Math.floor((obj.y + r) / c);
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
        const k = this.key(cx, cy);
        let arr = this.map.get(k);
        if (!arr) { arr = this.pool.pop() || []; this.map.set(k, arr); this.used.push(arr); }
        arr.push(obj);
      }
    }
    // Calls fn(obj) for objects in cells overlapping the AABB; objects can repeat across cells -> caller dedupes via stamp.
    query(minX, minY, maxX, maxY, fn) {
      const c = this.cell;
      const x0 = Math.floor(minX / c), x1 = Math.floor(maxX / c), y0 = Math.floor(minY / c), y1 = Math.floor(maxY / c);
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
        const arr = this.map.get(this.key(cx, cy));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) if (fn(arr[i]) === false) return;
      }
    }
  }
  U.SpatialHash = SpatialHash;
  let stamp = 1;
  U.nextStamp = () => ++stamp;
})();
