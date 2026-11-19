// MMItems: pure Mad Maze item tiers, bags, drops, XP and potions (REALM-DESIGN.md sections 3.4, 5, 6.1). No DOM.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMItems = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const MAX_TIER = { weapon: 8, armor: 8, ability: 4, charm: 4 };
  const KLASSES = ['ranger', 'frostcaller', 'herald', 'punk', 'bruiser', 'gravetender', 'trickster', 'shadowpaw'];

  // Per class: weapon type, T0 and T8 damage ranges (design table 3.4), armor family, ability name.
  const CLASS_DEFS = {
    ranger:      { weapon: 'slingbow',    t0: [12, 20], t8: [40, 56],  armor: 'light', ability: 'Yarn Snare' },
    frostcaller: { weapon: 'frostwand',   t0: [14, 22], t8: [42, 58],  armor: 'robe',  ability: 'Blizzard Burst' },
    herald:      { weapon: 'squeakstaff', t0: [8, 14],  t8: [26, 38],  armor: 'robe',  ability: 'Good Boy Aura' },
    punk:        { weapon: 'riffblade',   t0: [28, 40], t8: [80, 104], armor: 'heavy', ability: 'Mosh Shield' },
    bruiser:     { weapon: 'knuckle',     t0: [10, 16], t8: [30, 42],  armor: 'heavy', ability: 'Ground Pound' },
    gravetender: { weapon: 'bonewand',    t0: [16, 24], t8: [46, 62],  armor: 'robe',  ability: 'Grave Siphon' },
    trickster:   { weapon: 'raypistol',   t0: [9, 15],  t8: [28, 40],  armor: 'light', ability: 'Blink Decoy' },
    shadowpaw:   { weapon: 'shuriken',    t0: [10, 16], t8: [30, 42],  armor: 'light', ability: 'Smoke Step' },
  };

  const clampTier = (t, max) => Math.max(0, Math.min(max, Math.floor(Number(t)) || 0));

  // Linear T0..T8 (average +4 per tier for every weapon in the design table).
  function damageRange(klass, tier) {
    const d = CLASS_DEFS[klass];
    if (!d) return null;
    const t = clampTier(tier, 8);
    const lerp = (a, b) => Math.round(a + (b - a) * t / 8);
    return [lerp(d.t0[0], d.t8[0]), lerp(d.t0[1], d.t8[1])];
  }

  function makeWeapon(klass, tier) {
    const d = CLASS_DEFS[klass];
    if (!d) return null;
    const t = clampTier(tier, 8);
    return { id: d.weapon + '_t' + t, kind: 'weapon', slot: 'weapon', weaponType: d.weapon, klass, tier: t,
      dmg: damageRange(klass, t), stats: t >= 6 ? { KNK: 1 } : {} }; // T6+ gets +1 KNK
  }
  function makeArmor(family, tier) {
    const t = clampTier(tier, 8);
    return { id: 'armor_' + family + '_t' + t, kind: 'armor', slot: 'armor', family, tier: t, stats: { GRD: 2 * t } };
  }
  function makeAbility(klass, tier) {
    const d = CLASS_DEFS[klass];
    if (!d) return null;
    const t = clampTier(tier, 4);
    return { id: 'ability_' + klass + '_t' + t, kind: 'ability', slot: 'ability', klass, tier: t,
      name: d.ability, effectMult: 1 + 0.12 * t, focusCost: -3 * t };
  }
  function makeCharm(id, tier, stat, amount) {
    const t = clampTier(tier, 4);
    return { id: id + '_t' + t, kind: 'charm', slot: 'charm', tier: t, stats: stat ? { [stat]: amount } : {} };
  }

  // The 7 legacy realm.js ids -> new items. Rarity 0/1/2 (common/uncommon/rare) -> tier 0/1/2.
  // Legacy rings have no ring slot in Mad Maze: they become charms (design 5.1, "ring equivalent").
  const LEGACY = {
    sparkwand:   { kind: 'weapon', klass: 'ranger' },
    quickwand:   { kind: 'weapon', klass: 'trickster' },
    heartcharm:  { kind: 'charm', stat: 'LIFE', amount: 4 },
    swiftcharm:  { kind: 'charm', stat: 'SWF', amount: 2 },
    luckring:    { kind: 'charm', stat: 'WIT', amount: 2 },
    scholarring: { kind: 'charm', stat: 'WIT', amount: 2, xpBonus: 0.12 },
    wardring:    { kind: 'charm', stat: 'GRD', amount: 2 },
  };
  function fromLegacy(id, rarity) {
    if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(LEGACY, id)) return null;
    const m = LEGACY[id];
    const tier = Math.max(0, Math.min(2, Math.floor(Number(rarity)) || 0));
    let it;
    if (m.kind === 'weapon') it = makeWeapon(m.klass, tier);
    else { it = makeCharm(id, tier, m.stat, m.amount * (tier + 1)); if (m.xpBonus) it.xpBonus = m.xpBonus; }
    it.legacyId = id;
    return it;
  }

  function canEquip(item, klass) {
    if (!item || typeof item !== 'object' || !CLASS_DEFS[klass]) return false;
    const d = CLASS_DEFS[klass];
    switch (item.kind) {
      case 'weapon': return item.weaponType === d.weapon;
      case 'ability': return item.klass === klass;
      case 'armor': return item.family === d.armor;
      case 'charm': return true;
      default: return false;
    }
  }

  // Bag colours (design 5.3). Later in the list = better.
  const BAG_ORDER = ['brown', 'pink', 'purple', 'cyan', 'blue', 'gold', 'white'];
  function bagColor(item) {
    if (!item) return null;
    const t = Number(item.tier) || 0;
    switch (item.kind) {
      case 'weapon': case 'armor': return t <= 2 ? 'brown' : t <= 4 ? 'pink' : t <= 6 ? 'purple' : 'cyan';
      case 'ability': case 'charm': return t <= 1 ? 'pink' : t <= 3 ? 'purple' : 'cyan';
      case 'potion': return 'blue';
      case 'relic': return 'white';
      case 'egg': case 'set': return 'gold';
      case 'petfood': return 'purple';
      default: return 'brown'; // snacks, tea
    }
  }
  function bestBagColor(items) {
    let best = null;
    (items || []).forEach((it) => {
      const c = bagColor(it);
      if (c && (best === null || BAG_ORDER.indexOf(c) > BAG_ORDER.indexOf(best))) best = c;
    });
    return best;
  }

  // Common-enemy drop table (design 5.5). Tiers 1 and 3 are from the doc; 2, 4, 5 are interpolated/extended.
  const COMMON_DROPS = {
    1: { brown: 0.10, pink: 0.01, purple: 0 },
    2: { brown: 0.11, pink: 0.025, purple: 0.005 },
    3: { brown: 0.12, pink: 0.04, purple: 0.01 },
    4: { brown: 0.13, pink: 0.055, purple: 0.02 },
    5: { brown: 0.14, pink: 0.07, purple: 0.03 },
  };
  // rng: a function returning [0,1) or an MMRng instance ({next}). Independent rolls; returns the bag colours dropped.
  function dropBag(rng, enemyTier) {
    const next = typeof rng === 'function' ? rng : rng && typeof rng.next === 'function' ? () => rng.next() : Math.random;
    const t = Math.max(1, Math.min(5, Math.floor(Number(enemyTier)) || 1));
    const row = COMMON_DROPS[t];
    const out = [];
    ['brown', 'pink', 'purple'].forEach((c) => { if (row[c] > 0 && next() < row[c]) out.push(c); });
    return out;
  }

  // Design 6.1: 40*L + 10*L^2 (L1 = 50, L10 = 1400, L19 = 4370, total to 20 = 32300). Matches the roadmap.
  function xpToNext(level) {
    const L = Math.max(1, Math.floor(Number(level)) || 1);
    return 40 * L + 10 * L * L;
  }
  function totalXpToLevel(level) {
    let sum = 0;
    for (let L = 1; L < level; L++) sum += xpToNext(L);
    return sum;
  }

  // Potions (design 5.4): level 20 required; +2 small stats, +10 LIFE/FOC, Greater doubles; refused at cap.
  const POTION_GAIN = { LIFE: 10, FOC: 10, POW: 2, GRD: 2, SWF: 2, KNK: 2, VIG: 2, WIT: 2 };
  const STAT_ORDER = ['POW', 'GRD', 'SWF', 'KNK', 'VIG', 'WIT'];
  const CLASS_CAPS = {
    ranger: { LIFE: 560, FOC: 260, caps: [45, 25, 50, 50, 40, 40] },
    frostcaller: { LIFE: 480, FOC: 300, caps: [50, 25, 45, 45, 35, 50] },
    herald: { LIFE: 560, FOC: 280, caps: [40, 30, 45, 40, 50, 50] },
    punk: { LIFE: 640, FOC: 220, caps: [45, 40, 45, 40, 45, 35] },
    bruiser: { LIFE: 640, FOC: 220, caps: [50, 35, 40, 40, 45, 35] },
    gravetender: { LIFE: 520, FOC: 280, caps: [50, 30, 35, 45, 50, 45] },
    trickster: { LIFE: 500, FOC: 260, caps: [45, 25, 50, 50, 40, 45] },
    shadowpaw: { LIFE: 500, FOC: 260, caps: [50, 25, 50, 50, 35, 40] },
  };
  function capFor(klass, stat) {
    const c = CLASS_CAPS[klass];
    if (!c) return null;
    if (stat === 'LIFE' || stat === 'FOC') return c[stat];
    const i = STAT_ORDER.indexOf(stat);
    return i < 0 ? null : c.caps[i];
  }
  // cap: the class cap for that stat (default 50). Returns {ok, reason, gain, value}; on refusal the potion stays in the bag.
  function canDrink(level, stat, current, cap, greater) {
    const cur = Number(current) || 0;
    if (!Object.prototype.hasOwnProperty.call(POTION_GAIN, stat)) return { ok: false, reason: 'unknown stat', gain: 0, value: cur };
    if ((Math.floor(Number(level)) || 0) < 20) return { ok: false, reason: 'level 20 required', gain: 0, value: cur };
    const capV = cap === undefined || cap === null || !Number.isFinite(Number(cap)) ? 50 : Number(cap);
    if (cur >= capV) return { ok: false, reason: 'already maxed', gain: 0, value: cur };
    const gain = Math.min(POTION_GAIN[stat] * (greater ? 2 : 1), capV - cur);
    return { ok: true, reason: '', gain, value: cur + gain };
  }

  // ---- Friendly names, icons and tier labels (display only; safe for any id string) ----
  const BASE_NAMES = {
    sparkwand: 'Spark Wand', quickwand: 'Quick Wand', heartcharm: 'Heart Charm', swiftcharm: 'Swift Charm',
    luckring: 'Luck Ring', scholarring: 'Scholar Ring', wardring: 'Ward Ring',
    slingbow: 'Slingbow', frostwand: 'Frost Wand', squeakstaff: 'Squeak Staff', riffblade: 'Riff Blade',
    knuckle: 'Knuckle Duster', bonewand: 'Bone Wand', raypistol: 'Ray Pistol', shuriken: 'Shuriken',
  };
  const BASE_ICONS = { sparkwand: '\u2728', quickwand: '\u26A1', heartcharm: '\u2764\uFE0F', swiftcharm: '\uD83D\uDCA8', luckring: '\uD83C\uDF40', scholarring: '\uD83D\uDCD6', wardring: '\uD83D\uDEE1\uFE0F' };
  const KIND_ICONS = { weapon: '\u2694\uFE0F', armor: '\uD83D\uDEE1\uFE0F', ability: '\uD83C\uDF1F', charm: '\uD83D\uDC8E', potion: '\uD83E\uDDEA', relic: '\uD83C\uDFFA', egg: '\uD83E\uDD5A', keepsake: '\uD83D\uDD6F\uFE0F' };
  const TIER_COLORS = ['#b9b0cc', '#8fdc9a', '#6fc3ff', '#c39bff', '#ffb36b', '#ff8fa8', '#ffd36b', '#fff3c4', '#ffffff'];
  const title = (w) => w.charAt(0).toUpperCase() + w.slice(1);
  function words(s) { return String(s).replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').filter(Boolean).map(title).join(' '); }
  // Any stored item {id, r} -> {name, icon, kind, tier, tierLabel, color}. Never returns a raw underscore id.
  function describe(id, rarity) {
    id = typeof id === 'string' ? id.slice(0, 40) : '';
    let tier = Math.max(0, Math.min(8, Math.floor(Number(rarity)) || 0));
    let base = id, kind = null;
    const m = /^(.*)_t([0-8])$/.exec(id);
    if (m) { base = m[1]; tier = Number(m[2]); }
    const own = Object.prototype.hasOwnProperty;
    let name;
    if (own.call(BASE_NAMES, base)) name = BASE_NAMES[base];
    else if (/^armor_/.test(base)) { kind = 'armor'; name = words(base.slice(6)) + ' Armor'; }
    else if (/^ability_/.test(base)) { kind = 'ability'; const k = base.slice(8); name = (own.call(CLASS_DEFS, k) ? CLASS_DEFS[k].ability : words(k)) + ' Gem'; }
    else name = words(base) || 'Mystery Item';
    if (!kind) kind = own.call(BASE_ICONS, base) ? (/ring|charm/.test(base) ? 'charm' : 'weapon') : /wand|staff|bow|blade|knuckle|pistol|shuriken/.test(base) ? 'weapon' : 'charm';
    const icon = own.call(BASE_ICONS, base) ? BASE_ICONS[base] : KIND_ICONS[kind];
    return { name, icon, kind, tier, tierLabel: 'T' + tier, color: TIER_COLORS[tier] };
  }

  return { MAX_TIER, KLASSES, CLASS_DEFS, BAG_ORDER, COMMON_DROPS, CLASS_CAPS, POTION_GAIN,
    damageRange, makeWeapon, makeArmor, makeAbility, makeCharm, fromLegacy, canEquip,
    bagColor, bestBagColor, dropBag, describe, TIER_COLORS, KIND_ICONS, xpToNext, totalXpToLevel, capFor, canDrink };
});
