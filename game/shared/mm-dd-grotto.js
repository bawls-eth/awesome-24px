// MMDDGrotto: the Deepdelve crystal grotto band (NEXT-SLICES-3 MG2). Pure and deterministic (seeded spatial hash), no DOM.
// An ADDITIVE layer over MMChunks: rows BAND.min..BAND.max (world y, depth grows downward) turn some plain stone into glowstone
// clumps. Nothing above the band changes (tests/dd-bands-golden.test.js), ores, lava, air and the Lava Lake are left alone.
//   worldOpts(seed) -> { filter, yMin, yMax, maxId } for MMChunks.createWorld(seed, diffs, opts)
//   filter(seed)    -> (wx, wy, wz, id) -> id   the per-cell rule (also used by setBlock to keep diffs exact)
// New block ids (they continue MMChunks.B): GLOWSTONE 13 (the grotto ore), GLOW_LAMP 14 (a calm, steady light), BRICK 15.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMDDGrotto = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const BAND = { min: 25, max: 40 };
  const ID = { GLOWSTONE: 13, GLOW_LAMP: 14, BRICK: 15 };
  const MAX_ID = 15, STONE = 3;
  const CLUMP = 0.07, FILL = 0.55; // a 2x2x2 clump cell is a glowstone clump with CLUMP, then each stone in it with FILL
  function hash(a, b, c, seed) {
    let h = (Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647) ^ Math.imul(seed | 0, 1274126177)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 2246822519) >>> 0;
    return (h >>> 0) / 4294967296;
  }
  const inBand = (wy) => wy >= BAND.min && wy <= BAND.max;
  function filter(seed) {
    const s1 = (seed | 0) + 313, s2 = (seed | 0) + 317;
    return function (wx, wy, wz, id) {
      if (id !== STONE || !inBand(wy)) return id;
      if (hash(wx >> 1, wy >> 1, wz >> 1, s1) < CLUMP && hash(wx, wy, wz, s2) < FILL) return ID.GLOWSTONE;
      return id;
    };
  }
  const worldOpts = (seed) => ({ filter: filter(seed), yMin: BAND.min, yMax: BAND.max, maxId: MAX_ID });
  // Count glowstone in a chunk's bytes (tests and the HUD hint use it).
  function countGlow(data) { let n = 0; for (let i = 0; i < data.length; i++) if (data[i] === ID.GLOWSTONE) n++; return n; }
  return { BAND, ID, MAX_ID, inBand, filter, worldOpts, countGlow };
});
