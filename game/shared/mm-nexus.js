// MMNexus: pure layout of the Nexus hub plaza (NEXT-SLICES N1). 40x30 tiles, no enemies, fixed and identical on every call.
// No DOM, no Math.random, no mutation of inputs. All art ids exist in the arcane manifests (b13 props, b14 portals, b21 NPCs).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMNexus = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const W = 40, H = 30, TILE = 32;
  const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const CX = 20, CY = 15; // fountain centre tile

  // Portal ring around the fountain: realm, vault, 4 biomes (6 portals, 60 degree steps).
  const PORTAL_DEFS = [
    { id: 'realm', art: 'portal_return', dest: 'realm', label: 'Realm' },
    { id: 'warren', art: 'portal_warren', dest: 'biome:warren', label: 'Warren' },
    { id: 'bramble', art: 'portal_bramble', dest: 'biome:bramble', label: 'Bramble' },
    { id: 'vault', art: 'portal_vault', dest: 'vault', label: 'Vault' },
    { id: 'meadow', art: 'portal_meadow', dest: 'biome:meadow', label: 'Meadow' },
    { id: 'crypt', art: 'portal_crypt', dest: 'biome:crypt', label: 'Crypt' },
  ];
  // 4 vendor slots on the south arc, 3 more NPCs (guide, wanderer, oracle = ghost guide, no oracle art exists).
  const VENDOR_DEFS = [
    { id: 'vendor', npc: 'npc_vendor', role: 'shop', x: 12, y: 24, stall: 'shop' },
    { id: 'blacksmith', npc: 'npc_blacksmith', role: 'combine', x: 17, y: 25, stall: 'forge' },
    { id: 'healer', npc: 'npc_healer', role: 'heal', x: 23, y: 25 },
    { id: 'quest', npc: 'npc_quest_giver', role: 'quests', x: 28, y: 24 },
  ];
  const OTHER_NPCS = [
    { id: 'guide', npc: 'npc_nexus_guide', role: 'guide', x: 23, y: 19 }, // beside the spawn pad; (20,21) sat on the vault portal (20,22) in the walkable plaza
    { id: 'wanderer', npc: 'npc_wanderer', role: 'rumours', x: 6, y: 9 },
    { id: 'oracle', npc: 'npc_ghost_guide', role: 'oracle', x: 34, y: 9 },
  ];
  const TRIAL = { x: 35, y: 24 }; // RE2: the Trial of Six gate tile (walkable, clear of the ring, NPCs and props)
  const TORCH = ['prop_torch_post_f1', 'prop_torch_post_f2', 'prop_torch_post_f3', 'prop_torch_post_f4'];

  function deepFreeze(o) { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.keys(o).forEach((k) => deepFreeze(o[k])); } return o; }

  function build() {
    const portals = PORTAL_DEFS.map((p, i) => {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / PORTAL_DEFS.length;
      const tx = Math.round(CX + Math.cos(a) * 11), ty = Math.round(CY + Math.sin(a) * 7);
      return { id: p.id, art: p.art, dest: p.dest, label: p.label, tx: tx, ty: ty, x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2, r: 40 };
    });
    const npcs = VENDOR_DEFS.concat(OTHER_NPCS).map((n) => ({ id: n.id, npc: n.npc, role: n.role, tx: n.x, ty: n.y, x: n.x * TILE + TILE / 2, y: n.y * TILE + TILE / 2, r: 48, vendor: VENDOR_DEFS.indexOf(n) >= 0, stall: n.stall || null }));
    const props = [
      { id: 'fountain', art: 'prop_fountain_f1', frames: ['prop_fountain_f1', 'prop_fountain_f2', 'prop_fountain_f3', 'prop_fountain_f4'], tx: CX, ty: CY, solid: true, w: 3, h: 3 },
      { id: 'banner_red', art: 'prop_banner_red', tx: 14, ty: 4, solid: false, w: 1, h: 1 },
      { id: 'banner_blue', art: 'prop_banner_blue', tx: 20, ty: 3, solid: false, w: 1, h: 1 },
      { id: 'banner_green', art: 'prop_banner_green', tx: 26, ty: 4, solid: false, w: 1, h: 1 },
      { id: 'torch_w', art: TORCH[0], frames: TORCH, tx: 8, ty: 20, solid: true, w: 1, h: 1 },
      { id: 'torch_e', art: TORCH[0], frames: TORCH, tx: 32, ty: 20, solid: true, w: 1, h: 1 },
      { id: 'signpost', art: 'prop_signpost', tx: 20, ty: 27, solid: true, w: 1, h: 1 },
    ];
    const blocked = [];
    props.forEach((p) => { if (p.solid) for (let dy = 0; dy < p.h; dy++) for (let dx = 0; dx < p.w; dx++) blocked.push((p.ty - (p.h >> 1) + dy) * W + (p.tx - (p.w >> 1) + dx)); });
    const spawn = { tx: 20, ty: 19, x: 20 * TILE + TILE / 2, y: 19 * TILE + TILE / 2, art: 'spawn_pad' };
    // RE2 (additive): the "Trial of Six" boss-rush gate in the south-east corner, kept OUT of `portals` (the six-door ring stays as it is).
    // No art id (the page draws it in code), heroes Lv 20+ (MMEndgame.RUSH.minLevel; the page checks it).
    const trial = { id: 'trial', art: null, dest: 'rush', label: 'Trial of Six', minLevel: 20, tx: TRIAL.x, ty: TRIAL.y, x: TRIAL.x * TILE + TILE / 2, y: TRIAL.y * TILE + TILE / 2, r: 40 };
    return deepFreeze({ version: 1, w: W, h: H, tile: TILE, noEnemies: true, enemies: [], spawn: spawn, fountain: props[0], props: props, npcs: npcs, vendorSlots: npcs.filter((n) => n.vendor), portals: portals, blocked: blocked, trial: trial });
  }

  let cache = null;
  // layout(): the same frozen object on every call.
  function layout() { return cache || (cache = build()); }

  // walkable(tx, ty): inside the plaza (1-tile wall border) and not on a solid prop. Hostile input -> false.
  function walkable(tx, ty) {
    tx = Math.floor(num(tx, NaN)); ty = Math.floor(num(ty, NaN));
    if (!Number.isFinite(tx) || !Number.isFinite(ty) || tx < 1 || ty < 1 || tx > W - 2 || ty > H - 2) return false;
    return layout().blocked.indexOf(ty * W + tx) < 0;
  }
  // clampPoint(x, y): pixel position pulled inside the plaza walls. Hostile input -> the spawn pad.
  function clampPoint(x, y) {
    const s = layout().spawn;
    return { x: clamp(num(x, s.x), TILE, (W - 1) * TILE), y: clamp(num(y, s.y), TILE, (H - 1) * TILE) };
  }
  function hit(list, x, y) {
    x = num(x, NaN); y = num(y, NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    let best = null, bd = Infinity;
    list.forEach((p) => { const d = Math.hypot(p.x - x, p.y - y); if (d <= p.r && d < bd) { bd = d; best = p; } });
    return best;
  }
  function portalAt(x, y) { return hit(layout().portals, x, y); }
  function trialAt(x, y) { return hit([layout().trial], x, y); } // RE2: the Trial of Six gate, or null
  function npcAt(x, y) { return hit(layout().npcs, x, y); }
  // VN: the NPCs that run the vendor / forge stall ('shop': the fixed T1-T3 dust list + buy-back; 'forge': the same stall, opening the Forge).
  // The stall itself (prices, stock) lives in MMGearForge; the plaza only says who keeps it.
  function stallNpcs() { return layout().npcs.filter((n) => !!n.stall); }
  function portalById(id) { return typeof id === 'string' ? layout().portals.find((p) => p.id === id) || null : null; }

  // artIds(): every art id the plaza draws (for manifest validation).
  function artIds() {
    const L = layout(), s = new Set([L.spawn.art]);
    L.portals.forEach((p) => s.add(p.art));
    L.npcs.forEach((n) => s.add(n.npc));
    L.props.forEach((p) => { s.add(p.art); (p.frames || []).forEach((f) => s.add(f)); });
    return Array.from(s);
  }
  return { W, H, TILE, layout, walkable, clampPoint, portalAt, npcAt, portalById, artIds, stallNpcs, trialAt };
});
