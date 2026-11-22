// MMDDCraft: Deepdelve crafting-panel logic on top of MMRecipes. Pure, no DOM, deterministic.
// annotate(inv, ctx) -> one row per recipe: { id, cost, out, held, can, ready, reason }.
//   ctx = { furnace: bool, bench: bool }. `held` = you hold at least one of the inputs; `can` = you hold all of them;
//   `ready` = can + the needed station is near. reason is '' when ready.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./mm-recipes.js'));
  else root.MMDDCraft = factory(root.MMRecipes);
})(typeof self !== 'undefined' ? self : this, function (R) {
  // Station rules that Deepdelve enforces: the furnace for 'furnace' recipes (as before) and a placed workbench
  // for the household sets. Picks, the table itself, the furnace, torches and the village bench goods stay free.
  const BENCH_ONLY = ['ladder', 'door', 'chest', 'bed', 'rail'];
  const needsBench = (id) => BENCH_ONLY.indexOf(id) >= 0;
  const outText = (r) => Object.keys(r.out).map((k) => k.replace(/_/g, ' ') + (r.out[k] > 1 ? ' x' + r.out[k] : '')).join(', ');
  function annotate(inv, ctx) {
    ctx = ctx || {};
    return R.RECIPES.map((r) => {
      const keys = Object.keys(r.cost);
      const can = R.canCraft(inv, r.id);
      const held = keys.some((k) => ((inv && inv[k]) | 0) > 0);
      let reason = '';
      if (!can) reason = 'Missing ' + keys.filter((k) => ((inv && inv[k]) | 0) < r.cost[k]).map((k) => k.replace(/_/g, ' ')).join(', ');
      else if (r.station === 'furnace' && !ctx.furnace) reason = 'Stand near a furnace';
      else if (needsBench(r.id) && !ctx.bench) reason = 'Stand near a workbench';
      return { id: r.id, cost: r.cost, out: r.out, station: r.station, held, can, ready: can && !reason, reason };
    });
  }
  // Benches are plain [x,y,z] cells; near = any within `reach` (xz) and 3 cells in y of the player cell.
  function benchNear(benches, px, py, pz, reach) {
    reach = reach || 4;
    return (benches || []).some((b) => Math.abs(b[0] - px) <= reach && Math.abs(b[2] - pz) <= reach && Math.abs(b[1] - py) <= 3);
  }
  // Benches from an untrusted saved doc: array of [int,int,int] in range, capped, no duplicates.
  function cleanBenches(raw, max) {
    const out = [], seen = {};
    if (!Array.isArray(raw)) return out;
    for (const b of raw) {
      if (!Array.isArray(b) || b.length !== 3 || !b.every((v) => Number.isInteger(v) && v >= 0 && v < 4096)) continue;
      const k = b.join(',');
      if (seen[k]) continue;
      seen[k] = 1; out.push([b[0], b[1], b[2]]);
      if (out.length >= (max || 32)) break;
    }
    return out;
  }
  // ---------- MG2 (additive): crystal grotto recipes + blueprint crafts. Kept apart from MMRecipes so the 24-row list is unchanged. ----------
  // grotto: always listed, they need glowstone (depth 25-40). blueprint: listed locked until the blueprint item is held.
  const X = (id, kind, station, cost, out, extra) => Object.assign({ id, kind, station, cost, out }, extra || {});
  const EXTRA = [
    X('glow_lamp', 'grotto', 'hand', { glowstone: 2, stone: 1 }, { glow_lamp: 1 }),
    X('glow_torch', 'grotto', 'hand', { glowstone: 1, wood: 1 }, { torch: 6 }),
    X('glow_furnace', 'grotto', 'hand', { glowstone: 1, stone: 5 }, { furnace: 1 }),
    X('glow_pick', 'grotto', 'table', { glowstone: 2, stone: 4 }, { pick1: 1 }, { tier: 1 }),
    X('stone_brick', 'blueprint', 'hand', { stone: 2 }, { stone_brick: 2 }, { blueprint: 'bp_hut' }),
    X('brick_span', 'blueprint', 'hand', { stone: 3, coal: 1 }, { stone_brick: 5 }, { blueprint: 'bp_bridge' }),
    X('beacon_lamp', 'blueprint', 'hand', { glowstone: 1, gold: 1 }, { glow_lamp: 3 }, { blueprint: 'bp_lighthouse' }),
  ];
  const extraById = {}; EXTRA.forEach((r) => { extraById[r.id] = r; });
  const extra = (id) => extraById[id] || null;
  const has = (inv, k, n) => ((inv && inv[k]) | 0) >= n;
  const unlocked = (inv, r) => !r.blueprint || has(inv, r.blueprint, 1);
  function canCraftExtra(inv, id) { const r = extra(id); return !!r && unlocked(inv, r) && Object.keys(r.cost).every((k) => has(inv, k, r.cost[k])); }
  // Consumes exactly r.cost and adds r.out; inv untouched on failure.
  function craftExtra(inv, id) {
    if (!canCraftExtra(inv, id)) return false;
    const r = extra(id);
    for (const k of Object.keys(r.cost)) inv[k] = (inv[k] | 0) - r.cost[k];
    for (const k of Object.keys(r.out)) inv[k] = (inv[k] | 0) + r.out[k];
    return true;
  }
  // Same row shape as annotate() plus { kind, locked, blueprint }.
  function annotateExtra(inv, ctx) {
    void ctx;
    return EXTRA.map((r) => {
      const keys = Object.keys(r.cost), locked = !unlocked(inv, r), can = canCraftExtra(inv, r.id);
      const held = keys.some((k) => ((inv && inv[k]) | 0) > 0);
      let reason = '';
      if (locked) reason = 'Find the ' + r.blueprint.replace(/^bp_/, '') + ' blueprint';
      else if (!can) reason = 'Missing ' + keys.filter((k) => ((inv && inv[k]) | 0) < r.cost[k]).map((k) => k.replace(/_/g, ' ')).join(', ');
      return { id: r.id, kind: r.kind, cost: r.cost, out: r.out, station: r.station, blueprint: r.blueprint || '', locked, held, can, ready: can && !reason, reason };
    });
  }
  return { BENCH_ONLY, needsBench, outText, annotate, benchNear, cleanBenches, EXTRA, extra, canCraftExtra, craftExtra, annotateExtra };
});
