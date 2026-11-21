// MMDDSpawn: Deepdelve first-spawn site. Pure and deterministic (MMRng seeded by the world seed), no DOM.
//   site(seed, surf)  -> { x, z, dx, dz, ms, spawn:{x,z} } a cave mouth (a 3-wide ramp that dives into the hill) 10..18 blocks
//                        from the world centre, plus a spawn column 6 blocks back from its entrance, so a new world opens next to something to explore.
//   cells(site)       -> [[wx,wy,wz,blockId]...] the blocks to set (air for the ramp, dirt where the floor would be missing)
// y grows downward: a cell wy is air when wy < surface. The ramp floor drops one block per step.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rng.js'));
  else root.MMDDSpawn = factory(root.MMRng);
})(typeof self !== 'undefined' ? self : this, function (Rng) {
  const CENTRE = 64, LEN = 10, BACK = 6, AIR = 0, DIRT = 2;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  function site(seed, surf) {
    const rng = Rng.create('dd-mouth:' + seed);
    let x = 74, z = 64, tries = 0;
    do { x = CENTRE + rng.int(-18, 18); z = CENTRE + rng.int(-18, 18); tries++; } while ((Math.hypot(x - CENTRE, z - CENTRE) < 10 || Math.hypot(x - CENTRE, z - CENTRE) > 18) && tries < 60);
    const d = rng.pick(DIRS), dx = d[0], dz = d[1];
    const ms = typeof surf === 'function' ? surf(x, z) : 4;
    return { x, z, dx, dz, ms, len: LEN, spawn: { x: x - dx * BACK, z: z - dz * BACK } };
  }
  function cells(st) {
    const out = [], px = st.dz !== 0 ? 1 : 0, pz = st.dx !== 0 ? 1 : 0;
    for (let i = 0; i < st.len; i++) for (let l = -1; l <= 1; l++) {
      const wx = st.x + st.dx * i + px * l, wz = st.z + st.dz * i + pz * l, floor = st.ms + i;
      for (let wy = (i < 3 ? st.ms - 3 : floor - 3); wy < floor; wy++) out.push([wx, wy, wz, AIR]);
      if (i < 3) out.push([wx, floor, wz, DIRT]);
    }
    return out;
  }
  return { site, cells, CENTRE, LEN, BACK };
});
