// MMRecipes: the 24 Deepdelve/workbench recipes with exact-input checks. Pure data + logic.
// inv is a plain { item: count } object. craft() mutates it only on success.
// Recipes 1-12 are the village workbench goods (ids kept from main.js RECIPES), 13-15 the pickaxe
// upgrades (PICK_RECIPES tiers), 16 the cave crafting table (4 wood), then ladder/door/chest/bed
// sets and the furnace/torch/glass/rail basics.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMRecipes = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const R = (id, station, cost, out, extra) => Object.assign({ id, station, cost, out }, extra || {});
  const RECIPES = [
    R('plank', 'bench', { wood: 3 }, { plank: 1 }),
    R('brick', 'bench', { stone: 3 }, { brick: 1 }),
    R('stew', 'bench', { fish: 2, fruit: 1 }, { stew: 1 }),
    R('bugjar', 'bench', { bugs: 3, wood: 1 }, { bugjar: 1 }),
    R('pie', 'bench', { fruit: 4 }, { pie: 1 }),
    R('crown', 'bench', { flowers: 4 }, { crown: 1 }),
    R('chime', 'bench', { shells: 3, wood: 1 }, { chime: 1 }),
    R('lantern', 'bench', { stone: 2, wood: 2, bugs: 2 }, { lantern: 1 }),
    R('wreath', 'bench', { flowers: 5, wood: 1 }, { wreath: 1 }, { season: 'spring' }),
    R('umbrella', 'bench', { shells: 4, wood: 2 }, { umbrella: 1 }, { season: 'summer' }),
    R('jacko', 'bench', { fruit: 4, bugs: 2 }, { jacko: 1 }, { season: 'autumn' }),
    R('snowman', 'bench', { stone: 4, wood: 2 }, { snowman: 1 }, { season: 'winter' }),
    R('stone_pick', 'table', { stone: 6, wood: 2 }, { pick1: 1 }, { tier: 1 }),
    R('iron_pick', 'table', { iron: 4, wood: 2 }, { pick2: 1 }, { tier: 2 }),
    R('gold_pick', 'table', { gold: 3, iron: 3 }, { pick3: 1 }, { tier: 3 }),
    R('table', 'hand', { wood: 4 }, { table: 1 }),
    R('furnace', 'table', { stone: 8 }, { furnace: 1 }),
    R('torch', 'hand', { wood: 1, coal: 1 }, { torch: 4 }),
    R('ladder', 'table', { wood: 7 }, { ladder: 3 }),
    R('door', 'table', { wood: 6 }, { door: 1 }),
    R('chest', 'table', { wood: 8 }, { chest: 1 }),
    R('bed', 'table', { wood: 3, slime: 3 }, { bed: 1 }),
    R('glass', 'furnace', { stone: 4, coal: 1 }, { glass: 2 }),
    R('rail', 'table', { iron: 6, wood: 1 }, { rail: 16 }),
  ];
  const byId = new Map(RECIPES.map((r) => [r.id, r]));
  const MODES = {
    survival: { id: 'survival', fallDamage: true, flight: false },
    creative: { id: 'creative', fallDamage: false, flight: true },
  };
  const get = (id) => byId.get(id) || null;
  const has = (inv, k, n) => ((inv && inv[k]) | 0) >= n;
  function canCraft(inv, id) {
    const r = get(id);
    if (!r) return false;
    return Object.keys(r.cost).every((k) => has(inv, k, r.cost[k]));
  }
  // Consumes exactly r.cost and adds r.out. Returns true on success; leaves inv untouched otherwise.
  function craft(inv, id) {
    if (!canCraft(inv, id)) return false;
    const r = get(id);
    for (const k of Object.keys(r.cost)) inv[k] = (inv[k] | 0) - r.cost[k];
    for (const k of Object.keys(r.out)) inv[k] = (inv[k] | 0) + r.out[k];
    return true;
  }
  const mode = (name) => MODES[name] || MODES.survival;
  return { RECIPES, MODES, get, canCraft, craft, mode, ids: () => RECIPES.map((r) => r.id) };
});
