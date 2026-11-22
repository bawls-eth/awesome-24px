// MMDDBuild: Deepdelve blueprints (NEXT-SLICES-3 MG2). Pure, deterministic, no DOM, no randomness.
// A blueprint is an item found while digging (bp_hut, bp_bridge, bp_lighthouse). Holding it unlocks its crafts in MMDDCraft
// and its build goal, which is checked by block pattern around the cell the player just placed:
//   hut        a 3x3 ring of stone brick, 2 rows high (one doorway gap allowed in the lower row), hollow centre, any solid roof cell
//   bridge     5 stone bricks in a straight row (x or z) with air under the middle 3 (it spans a gap)
//   lighthouse a column of 4 stone bricks with a glow lamp on top
// World y grows DOWNWARD (a smaller wy is higher). get(wx, wy, wz) -> block id.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMDDBuild = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const AIR = 0, TORCH = 11, WATER = 9, LAVA = 8, GLOWSTONE = 13, GLOW_LAMP = 14, BRICK = 15;
  const BLUEPRINTS = [
    { id: 'hut', item: 'bp_hut', name: 'Hut', goal: 'buildHut', find: 'Dig down to depth 6.', desc: 'A 3x3 ring of stone brick, 2 high, hollow inside, with a roof block over the middle (one doorway allowed).' },
    { id: 'bridge', item: 'bp_bridge', name: 'Bridge', goal: 'buildBridge', find: 'Dig down to depth 15.', desc: '5 stone bricks in a straight row with open air under the middle 3.' },
    { id: 'lighthouse', item: 'bp_lighthouse', name: 'Lighthouse', goal: 'buildLighthouse', find: 'Mine glowstone in the crystal grotto.', desc: 'A column of 4 stone bricks with a glow lamp on top.' },
  ];
  const byId = {}; BLUEPRINTS.forEach((b) => { byId[b.id] = b; });
  // Which blueprint (if any) the player finds by mining block `id` at row `wy`. `has(item)` says whether it is already held.
  function findOnMine(id, wy, has) {
    const h = typeof has === 'function' ? has : () => false;
    if (id === GLOWSTONE && !h('bp_lighthouse')) return byId.lighthouse;
    if (wy >= 15 && !h('bp_bridge')) return byId.bridge;
    if (wy >= 6 && !h('bp_hut')) return byId.hut;
    return null;
  }
  const solid = (id) => id !== AIR && id !== TORCH && id !== WATER && id !== LAVA;
  const RING = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  function hutAt(get, cx, wy0, cz) { // wy0 = lower wall row, wy0-1 upper row, wy0-2 roof row
    if (solid(get(cx, wy0, cz)) || solid(get(cx, wy0 - 1, cz)) || !solid(get(cx, wy0 - 2, cz))) return false;
    let gaps = 0;
    for (const r of RING) {
      if (get(cx + r[0], wy0 - 1, cz + r[1]) !== BRICK) return false;
      if (get(cx + r[0], wy0, cz + r[1]) !== BRICK) gaps++;
    }
    return gaps <= 1;
  }
  function hut(get, x, y, z) {
    for (let dy = 0; dy <= 2; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (hutAt(get, x + dx, y + dy, z + dz)) return true;
    return false;
  }
  function bridgeAt(get, x, y, z, ax, az) { // (x,y,z) = first brick, row runs along (ax, az)
    for (let i = 0; i < 5; i++) if (get(x + ax * i, y, z + az * i) !== BRICK) return false;
    for (let i = 1; i <= 3; i++) if (get(x + ax * i, y + 1, z + az * i) !== AIR) return false;
    return true;
  }
  function bridge(get, x, y, z) {
    for (let s = -4; s <= 0; s++) if (bridgeAt(get, x + s, y, z, 1, 0) || bridgeAt(get, x, y, z + s, 0, 1)) return true;
    return false;
  }
  function lighthouseAt(get, x, top, z) {
    if (get(x, top, z) !== GLOW_LAMP) return false;
    for (let i = 1; i <= 4; i++) if (get(x, top + i, z) !== BRICK) return false;
    return true;
  }
  function lighthouse(get, x, y, z) {
    for (let t = y - 4; t <= y; t++) if (lighthouseAt(get, x, t, z)) return true;
    return false;
  }
  const CHECK = { hut, bridge, lighthouse };
  // Build ids whose pattern now stands at/around the placed cell, among the blueprints `has(item)` holds.
  function check(get, x, y, z, has) {
    const h = typeof has === 'function' ? has : () => true;
    return BLUEPRINTS.filter((b) => h(b.item) && CHECK[b.id](get, x, y, z)).map((b) => b.id);
  }
  // Hub medals from the build goals: build1 = any one build, build3 = all three.
  function medals(goals) {
    const g = goals || {}, n = BLUEPRINTS.filter((b) => g[b.goal] === true).length;
    return { n, build1: n >= 1, build3: n >= 3 };
  }
  return { BLUEPRINTS, byId, findOnMine, check, hut, bridge, lighthouse, medals, ID: { BRICK, GLOW_LAMP, GLOWSTONE } };
});
