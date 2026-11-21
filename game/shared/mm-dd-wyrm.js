// MMDDWyrm: the Deepdelve Rock Wyrm boss. Pure, deterministic (seeded MMRng only, no ambient randomness), no DOM.
//   spawnSite(seed, surf)       -> { wx, wy, wz (cell centre), rx, ry, c:{x,y,z} render centre } seeded cavern, >= MIN_DEPTH below the surface
//   arenaCells(site)            -> [[wx,wy,wz]...] ellipsoid of cells to hollow out
//   phaseOf(hp, max)            -> 1 | 2 | 3 by HP thirds
//   attackStep(st, dt, phase)   -> next attack state (circle -> [burrow] -> telegraph -> lunge -> recover), with events
//   orbitPos / clampToArena / followChain / shouldWake / shouldFreeze / meleeDamage / knockback  small rule helpers
// Render coordinates: y is up (depth is negative), so a cell wy spans y in [-wy-1, -wy].
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rng.js'), require('./mm-dd-mobs.js'));
  else root.MMDDWyrm = factory(root.MMRng, root.MMDDMobs);
})(typeof self !== 'undefined' ? self : this, function (Rng, Mobs) {
  const MAX_HP = 30, MIN_DEPTH = 40, WAKE_DIST = 26, FREEZE_DIST = 60, SEGMENTS = 8, SPACING = 0.9, RING_R = 2.4;
  const RX = 9, RY = 4, WORLD_MIN = 24, WORLD_MAX = 104, KEEP_OUT = 30, CENTRE = 64, MAX_WY = 56;
  // Timers per phase (index = phase - 1), seconds. Phase 1 never burrows.
  const T = {
    circle: [3.2, 2.4, 1.5], burrow: [0, 1.6, 1.0], telegraph: [1.1, 0.95, 0.75], lunge: [0.6, 0.5, 0.4], recover: [1.3, 1.1, 0.8],
  };
  const COMBO = [1, 1, 2]; // lunges in a row before recovering
  const ORBIT_SPEED = [0.7, 0.95, 1.25]; // radians per second
  const phaseOf = (hp, max) => {
    const f = (hp || 0) / (max || MAX_HP);
    return f > 2 / 3 ? 1 : f > 1 / 3 ? 2 : 3;
  };
  // surf(wx, wz) -> surface cell y. One cavern per world seed, away from the spawn column, deep enough.
  function spawnSite(seed, surf) {
    const rng = Rng.create('dd-wyrm:' + seed);
    let wx = 0, wz = 0, tries = 0;
    do { wx = rng.int(WORLD_MIN, WORLD_MAX); wz = rng.int(WORLD_MIN, WORLD_MAX); tries++; } while (Math.hypot(wx - CENTRE, wz - CENTRE) < KEEP_OUT && tries < 50);
    const s = typeof surf === 'function' ? surf(wx, wz) : 4;
    const wy = Math.min(MAX_WY, s + MIN_DEPTH + rng.int(1, 4));
    return { wx, wy, wz, rx: RX, ry: RY, surface: s, c: { x: wx + 0.5, y: -(wy + 0.5), z: wz + 0.5 } };
  }
  function arenaCells(site) {
    const out = [];
    for (let y = -site.ry; y <= site.ry; y++) for (let z = -site.rx; z <= site.rx; z++) for (let x = -site.rx; x <= site.rx; x++) {
      if ((x * x + z * z) / (site.rx * site.rx) + (y * y) / (site.ry * site.ry) <= 1) out.push([site.wx + x, site.wy + y, site.wz + z]);
    }
    return out;
  }
  const floorY = (site) => -(site.wy + site.ry + 1); // top of the floor in render y
  // Keeps a render-space point inside the cavern (with a margin for the body).
  function clampToArena(site, x, y, z, margin) {
    const m = margin === undefined ? 1 : margin, rx = site.rx - m, ry = site.ry - m * 0.5;
    let dx = x - site.c.x, dy = y - site.c.y, dz = z - site.c.z;
    const u = Math.hypot(dx / rx, dy / ry, dz / rx);
    if (u > 1) { dx /= u; dy /= u; dz /= u; }
    return { x: site.c.x + dx, y: site.c.y + dy, z: site.c.z + dz };
  }
  const inArena = (site, x, y, z) => ((x - site.c.x) ** 2 + (z - site.c.z) ** 2) / (site.rx * site.rx) + ((y - site.c.y) ** 2) / (site.ry * site.ry) <= 1;
  // The head circles the cavern at radius ~5 with a slow wave in height.
  function orbitPos(site, ang, phase) {
    const r = 5 + Math.sin(ang * 0.5) * 0.8;
    return { x: site.c.x + Math.cos(ang) * r, y: site.c.y + Math.sin(ang * 1.7 + (phase || 1)) * 1.2, z: site.c.z + Math.sin(ang) * r };
  }
  // Attack state machine. st = { s: 'circle'|'burrow'|'telegraph'|'lunge'|'recover', t: seconds in state, n: lunges done in this combo }.
  // Returns { st, events } where events are the state names entered this step (in order). Pure: does not mutate the input.
  const newAttack = () => ({ s: 'circle', t: 0, n: 0 });
  function attackStep(st, dt, phase) {
    const p = Math.max(1, Math.min(3, phase | 0)) - 1, cur = { s: st.s, t: st.t + dt, n: st.n }, events = [];
    for (let guard = 0; guard < 8 && cur.t >= T[cur.s][p]; guard++) {
      const over = cur.t - T[cur.s][p];
      let next;
      if (cur.s === 'circle') next = T.burrow[p] > 0 ? 'burrow' : 'telegraph';
      else if (cur.s === 'burrow') next = 'telegraph';
      else if (cur.s === 'telegraph') next = 'lunge';
      else if (cur.s === 'lunge') { cur.n++; next = cur.n < COMBO[p] ? 'telegraph' : 'recover'; }
      else { next = 'circle'; cur.n = 0; }
      cur.s = next; cur.t = over; events.push(next);
    }
    return { st: cur, events };
  }
  // Chain follow: each segment trails the one before it at a fixed spacing. segs is [{x,y,z}], segs[0] is the head. Mutates segs.
  function followChain(segs, spacing) {
    const sp = spacing || SPACING;
    for (let i = 1; i < segs.length; i++) {
      const a = segs[i - 1], b = segs[i];
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = Math.hypot(dx, dy, dz) || 1;
      b.x = a.x + dx / d * sp; b.y = a.y + dy / d * sp; b.z = a.z + dz / d * sp;
    }
    return segs;
  }
  // Wake only when the player is deep enough (cells below the local surface) and near the cavern; never once defeated.
  const shouldWake = (dist, depthBelowSurface, defeated) => !defeated && depthBelowSurface >= MIN_DEPTH - 6 && dist <= WAKE_DIST;
  const shouldFreeze = (dist) => dist > FREEZE_DIST;
  const meleeDamage = (tier) => Mobs.meleeDamage(tier);
  const knockback = (dx, dz, strength) => Mobs.knockback(dx, dz, strength);
  // A lunge hurts 2, brushing the body 1.
  const contactDamage = (state) => (state === 'lunge' ? 2 : 1);
  // True when the player stands inside the dust ring at the lunge target (horizontal radius, small vertical slack).
  const inRing = (tx, ty, tz, px, py, pz) => Math.hypot(px - tx, pz - tz) <= RING_R && Math.abs(py - ty) <= 2.2;
  return { MAX_HP, MIN_DEPTH, WAKE_DIST, FREEZE_DIST, SEGMENTS, SPACING, RING_R, T, COMBO, ORBIT_SPEED, phaseOf, spawnSite, arenaCells, floorY, clampToArena, inArena, orbitPos, newAttack, attackStep, followChain, shouldWake, shouldFreeze, meleeDamage, knockback, contactDamage, inRing };
});
