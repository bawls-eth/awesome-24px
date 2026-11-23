// MMGhost: compact run-path ghosts. 4 Hz sampling, delta-encoded, <= 3 KB payload. Pure.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMGhost = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const HZ = 4, STEP_MS = 1000 / HZ, MAX_BYTES = 3072;
  function recorder() {
    const pts = []; let last = -Infinity;
    return {
      tick(tMs, x, y) {
        if (typeof tMs !== 'number' || typeof x !== 'number' || typeof y !== 'number') return false;
        if (!isFinite(tMs + x + y) || tMs - last < STEP_MS) return false;
        last = tMs; pts.push([Math.round(x), Math.round(y)]); return true;
      },
      points() { return pts.slice(); },
      finish(timeMs) { return encode({ timeMs, points: pts }); }
    };
  }
  const enc = (n) => n.toString(36);
  // payload: "g1|<stride>|<timeMs b36>|dx,dy,dx,dy..." (deltas b36); stride thins samples to fit the cap.
  function build(points, stride, timeMs) {
    const out = []; let px = 0, py = 0;
    for (let i = 0; i < points.length; i += stride) {
      const p = points[i];
      out.push(enc(p[0] - px), enc(p[1] - py)); px = p[0]; py = p[1];
    }
    return 'g1|' + stride + '|' + enc(Math.round(timeMs)) + '|' + out.join(',');
  }
  function encode(ghost) {
    if (!ghost || !Array.isArray(ghost.points)) return null;
    const pts = ghost.points.filter((p) => Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]))
      .map((p) => [Math.round(p[0]), Math.round(p[1])]);
    const t = typeof ghost.timeMs === 'number' && isFinite(ghost.timeMs) && ghost.timeMs >= 0 ? ghost.timeMs : 0;
    let stride = 1, s = build(pts, stride, t);
    while (s.length > MAX_BYTES && stride < 4096) { stride *= 2; s = build(pts, stride, t); }
    return s.length > MAX_BYTES ? null : s;
  }
  function decode(str) {
    if (typeof str !== 'string' || str.length > MAX_BYTES) return null;
    const parts = str.split('|');
    if (parts.length !== 4 || parts[0] !== 'g1') return null;
    const stride = /^[0-9]{1,4}$/.test(parts[1]) ? parseInt(parts[1], 10) : NaN, timeMs = /^[0-9a-z]{1,12}$/.test(parts[2]) ? parseInt(parts[2], 36) : NaN;
    if (!(stride >= 1 && stride <= 4096) || !isFinite(timeMs) || timeMs < 0) return null; // encode never writes these
    // strict base-36 ints: parseInt alone read '1x!' as 1 and 'ab.c' as 371, so junk decoded to a plausible path
    const nums = parts[3] === '' ? [] : parts[3].split(',').map((v) => (/^-?[0-9a-z]{1,12}$/.test(v) ? parseInt(v, 36) : NaN));
    if (nums.length % 2 || nums.some((n) => !isFinite(n))) return null;
    const points = []; let x = 0, y = 0;
    for (let i = 0; i < nums.length; i += 2) { x += nums[i]; y += nums[i + 1]; points.push([x, y]); }
    return { timeMs, stepMs: STEP_MS * stride, points };
  }
  function topN(ghosts, n) {
    if (!Array.isArray(ghosts)) return [];
    const k = n > 0 ? Math.floor(n) : 0;
    return ghosts.filter((g) => g && typeof g === 'object' && typeof g.timeMs === 'number' && isFinite(g.timeMs) && g.timeMs > 0)
      .sort((a, b) => a.timeMs - b.timeMs).slice(0, k);
  }
  return { HZ, MAX_BYTES, recorder, encode, decode, topN };
});
