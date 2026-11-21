// MMGear: tiered gear core (GEAR-DROPS-BUILD-PLAN sections (a) and (b), slice G1).
// Tier `t` (1-12) is a new axis beside rarity `r` (0-3, a quality multiplier) and style (wpn_<style>). Items without `t` are T0 and keep today's formulas.
// Pure: no DOM, no clock, no Math.random. Frozen output. Hostile input returns null / [] / safe defaults, inputs are never mutated.
// Item entry (additive): { n, id, r, t?, a? }. `a` is a uint32 affix seed, kept only when t >= 7. Soulbound is derived (t >= 11), never stored.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./mm-items.js'), require('./mm-weapon-items.js'));
  else root.MMGear = factory(root.MMItems || null, root.MMWeaponItems || null);
})(typeof self !== 'undefined' ? self : this, function (MMItems, MMWeaponItems) {
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const isInt = (v) => typeof v === 'number' && Number.isFinite(v) && Math.floor(v) === v;
  const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const MAX_T = 12, MAX_R = 3, MAX_N = 1e9, MAX_A = 4294967295, AFFIX_MIN_T = 7;

  // [t, equip level, weapon +dmg (Common), armor HP, armor GRD, resist %, bag index, bag art, affix count, sell add]
  const ROWS = [
    [1, 1, 0.70, 6, 1, 0, 0, 'bag_brown', 0, 2], [2, 2, 0.85, 10, 1, 0, 0, 'bag_brown', 0, 4],
    [3, 4, 1.00, 14, 2, 5, 1, 'bag_pink', 0, 6], [4, 6, 1.15, 18, 2, 5, 1, 'bag_pink', 0, 8],
    [5, 8, 1.30, 24, 3, 10, 2, 'bag_purple', 0, 10], [6, 10, 1.45, 30, 3, 10, 2, 'bag_purple', 0, 12],
    [7, 12, 1.60, 36, 4, 15, 3, 'bag_cyan', 1, 14], [8, 14, 1.75, 44, 4, 15, 3, 'bag_cyan', 1, 16],
    [9, 16, 1.90, 52, 5, 20, 4, 'bag_blue', 2, 18], [10, 18, 2.10, 60, 5, 20, 4, 'bag_blue', 2, 20],
    [11, 20, 2.30, 70, 6, 25, 5, 'bag_gold', 2, 22], [12, 20, 2.55, 80, 7, 30, 5, 'bag_red', 2, 24],
  ];
  const TIERS = Object.freeze(ROWS.map((r) => Object.freeze({
    t: r[0], gate: r[1], wd: r[2], hp: r[3], grd: r[4], res: r[5], bagIndex: r[6], bagArt: r[7], affixes: r[8], signature: r[0] === 12 ? 1 : 0,
    sellAdd: r[9], soulbound: r[0] >= 11,
  })));
  const Q = Object.freeze([1, 1.12, 1.25, 1.40]);
  const RARITY_SELL = Object.freeze([3, 7, 15, 30]); // realm.js RM_RARITIES sell values
  const TIER_COLORS = Object.freeze(['#c9d1d9', '#c9d1d9', '#7ee787', '#7ee787', '#79c0ff', '#79c0ff', '#d2a8ff', '#d2a8ff', '#ffb36b', '#ffb36b', '#ffd36b', '#ff6b6b']);
  const NEUTRAL_COLOR = '#9aa4af';

  // ---------- armor ----------
  const FAMILIES = Object.freeze({
    light: Object.freeze({ name: 'Light', hp: 0.85, grd: 0.75, speed: Object.freeze([2, 4, 6, 8, 10, 12]), resists: Object.freeze(['slowed', 'rooted', 'dazed']), statusChance: Object.freeze([0, 0, 0, 0, 0, 0]) }),
    robe: Object.freeze({ name: 'Robe', hp: 0.75, grd: 0.5, speed: Object.freeze([0, 0, 0, 0, 0, 0]), resists: Object.freeze(['curse', 'weak', 'sick']), statusChance: Object.freeze([0.01, 0.02, 0.03, 0.04, 0.05, 0.06]) }),
    heavy: Object.freeze({ name: 'Heavy', hp: 1.0, grd: 1.0, speed: Object.freeze([0, 0, -2, -4, -4, -6]), resists: Object.freeze(['bleed', 'armorBroken', 'slowed']), statusChance: Object.freeze([0, 0, 0, 0, 0, 0]) }),
  });
  const FAMILY_KEYS = Object.freeze(['light', 'robe', 'heavy']);
  const ARMOR_LIST = [
    ['arm_light_scout', 'light', 'armor_jerkin_scout', 'Scout Jerkin'], ['arm_light_ranger', 'light', 'ranger_jerkin', 'Ranger Jerkin'],
    ['arm_light_warden', 'light', 'armor_jerkin_warden', 'Warden Jerkin'], ['arm_light_storm', 'light', 'armor_jerkin_storm', 'Storm Jerkin'],
    ['arm_light_shade', 'light', 'rogue_leather_armor', 'Shade Leathers'], ['arm_light_dread', 'light', 'armor_jerkin_dread', 'Dread Jerkin'],
    ['arm_robe_linen', 'robe', 'clothing_robe_linen', 'Linen Robe'], ['arm_robe_mage', 'robe', 'mage_robe', 'Mage Robe'],
    ['arm_robe_moon', 'robe', 'clothing_robe_moon', 'Moon Robe'], ['arm_robe_druid', 'robe', 'druid_leaf_cloak', 'Druid Cloak'],
    ['arm_robe_cursed', 'robe', 'warlock_cursed_robe', 'Cursed Robe'], ['arm_robe_twilight', 'robe', 'clothing_robe_twilight', 'Twilight Robe'],
    ['arm_heavy_iron', 'heavy', 'armor_cuirass_iron', 'Iron Cuirass'], ['arm_heavy_warden', 'heavy', 'armor_cuirass_warden', 'Warden Cuirass'],
    ['arm_heavy_ember', 'heavy', 'armor_cuirass_ember', 'Ember Cuirass'], ['arm_heavy_frost', 'heavy', 'armor_cuirass_frost', 'Frost Cuirass'],
    ['arm_heavy_paladin', 'heavy', 'paladin_breastplate', 'Paladin Breastplate'], ['arm_heavy_dread', 'heavy', 'armor_cuirass_dread', 'Dread Cuirass'],
  ];
  const ARMOR_IDS = {}; FAMILY_KEYS.forEach((f) => { ARMOR_IDS[f] = []; });
  const ARMOR_ART = {}, ARMOR_NAMES = {}, ARMOR_INFO = Object.create(null);
  ARMOR_LIST.forEach((a) => {
    const band = ARMOR_IDS[a[1]].length + 1;
    ARMOR_IDS[a[1]].push(a[0]); ARMOR_ART[a[0]] = a[2]; ARMOR_NAMES[a[0]] = a[3];
    ARMOR_INFO[a[0]] = Object.freeze({ id: a[0], family: a[1], band: band, art: a[2], name: a[3] });
  });
  FAMILY_KEYS.forEach((f) => Object.freeze(ARMOR_IDS[f]));
  Object.freeze(ARMOR_IDS); Object.freeze(ARMOR_ART); Object.freeze(ARMOR_NAMES);
  const GEAR_ID_RE = /^arm_[a-z]{3,8}_[a-z]{3,10}$/;
  const WPN_ID_RE = /^wpn_[a-z_]{3,24}$/;
  const SAFE_ID_RE = /^[a-z][a-z0-9_]{1,31}$/;
  const LEGACY_ARMOR_RE = /^armor_(light|robe|heavy)_t(\d{1,2})$/;
  const BLOCKED_IDS = Object.freeze(['constructor', 'prototype', 'hasownproperty', 'tostring', 'valueof']);

  // class -> armor family, from MMItems.CLASS_DEFS (lowercase keys). Empty when MMItems is missing.
  const CLASS_ARMOR = {};
  if (MMItems && MMItems.CLASS_DEFS) Object.keys(MMItems.CLASS_DEFS).forEach((k) => { CLASS_ARMOR[k] = MMItems.CLASS_DEFS[k].armor; });
  Object.freeze(CLASS_ARMOR);
  function armorFamilyOf(cls) {
    if (typeof cls !== 'string') return null;
    const k = cls.toLowerCase();
    return has(CLASS_ARMOR, k) ? CLASS_ARMOR[k] : null;
  }

  // ---------- tier helpers ----------
  const tierOf = (t) => (isInt(t) && t >= 1 && t <= MAX_T ? TIERS[t - 1] : null);
  const gate = (t) => { const r = tierOf(t); return r ? r.gate : 0; };
  const band = (t) => (tierOf(t) ? Math.ceil(t / 2) : 0);
  const soulbound = (t) => !!(tierOf(t) && t >= 11);
  function bagFor(t) {
    const r = tierOf(t);
    if (!r) return null;
    return Object.freeze({ index: r.bagIndex, art: r.bagArt, soulbound: r.t >= 11, sparkle: r.t === 12 ? 'bag_soulbound_sparkle' : null });
  }
  function armorId(fam, t) {
    if (typeof fam !== 'string' || !has(ARMOR_IDS, fam) || !tierOf(t)) return null;
    return ARMOR_IDS[fam][band(t) - 1];
  }
  const armorInfo = (id) => (typeof id === 'string' && has(ARMOR_INFO, id) ? ARMOR_INFO[id] : null);
  const isWeaponId = (id) => typeof id === 'string' && (id === 'sparkwand' || WPN_ID_RE.test(id));

  // alias(id): legacy MMItems/quest id armor_<fam>_t<n> -> { id: 'arm_<fam>_<band>', t: max(1, n) }; null for anything else (or n > 12).
  function alias(id) {
    if (typeof id !== 'string') return null;
    const m = LEGACY_ARMOR_RE.exec(id);
    if (!m) return null;
    const n = parseInt(m[2], 10);
    if (n > MAX_T) return null;
    const t = Math.max(1, n);
    return Object.freeze({ id: armorId(m[1], t), t: t });
  }

  // clean(raw): one backpack entry -> frozen { n, id, r, t?, a? } or null. Old items (no t) stay T0.
  //  - an invalid `t` (13, '1e3', 1.5, NaN) is dropped (the item survives as T0); `t` is only kept on sparkwand / wpn_ / arm_ ids, never on quickwand
  //  - arm_ ids are clamped into their band; legacy armor_<fam>_t<n> ids are aliased; `a` is kept only when t >= 7 and 1 <= a <= 2^32-1
  function clean(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const n = raw.n, rid = raw.id;
    if (!isInt(n) || n < 1 || n > MAX_N || typeof rid !== 'string') return null;
    let id = rid, t = isInt(raw.t) && raw.t >= 1 && raw.t <= MAX_T ? raw.t : 0;
    const al = alias(id);
    if (al) { id = al.id; if (!t) t = al.t; }
    if (!SAFE_ID_RE.test(id) || BLOCKED_IDS.indexOf(id) >= 0) return null;
    const rn = Number(raw.r);
    const r = typeof raw.r === 'number' && Number.isFinite(rn) ? clampInt(Math.floor(rn), 0, MAX_R) : 0;
    const info = armorInfo(id);
    if (info) {
      if (!t) t = info.band * 2 - 1; // an armor piece always has a tier
      t = clampInt(t, info.band * 2 - 1, info.band * 2);
    } else if (GEAR_ID_RE.test(id)) { /* unknown arm_ id: inert, t kept as given */ }
    else if (!isWeaponId(id) || id === 'quickwand') t = 0;
    const out = { n: n, id: id, r: r };
    if (t) out.t = t;
    if (t >= AFFIX_MIN_T && isInt(raw.a) && raw.a >= 1 && raw.a <= MAX_A) out.a = raw.a;
    return Object.freeze(out);
  }

  // ---------- numbers ----------
  const clampR = (r) => (typeof r === 'number' && Number.isFinite(r) ? clampInt(Math.floor(r), 0, MAX_R) : 0);
  function sellValue(r, t) {
    const base = RARITY_SELL[clampR(r)];
    return base + (tierOf(t) ? tierOf(t).sellAdd : 0);
  }
  // weaponBonus(amount, t, r): dmg += amount/0.5 x WD[t] x Q[r]. T0 (no tier) -> null: the caller keeps amount x RM_RARITIES[r].mult.
  function weaponBonus(amount, t, r) {
    const row = tierOf(t);
    if (!row || typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return null;
    return amount / 0.5 * row.wd * Q[clampR(r)];
  }
  // armorStats(id, t, r) -> frozen { hp, guard, speed, res, statusChance, family } or null. `t` is clamped into the id's band.
  function armorStats(id, t, r) {
    const info = armorInfo(id);
    if (!info || !isInt(t) || t < 1 || t > MAX_T) return null;
    const tt = clampInt(t, info.band * 2 - 1, info.band * 2), row = TIERS[tt - 1], fam = FAMILIES[info.family], rr = clampR(r);
    const hp = Math.max(1, Math.round(row.hp * Q[rr] * fam.hp));
    const guard = Math.max(1, Math.round((row.grd + (rr >= 2 ? 1 : 0)) * fam.grd));
    return Object.freeze({ hp: hp, guard: guard, speed: fam.speed[info.band - 1], res: row.res / 100, statusChance: fam.statusChance[info.band - 1], family: info.family, t: tt });
  }

  // canEquip(id, t, cls, level) -> { ok, reason }. reason: '' | 'unknown' | 'class' | 'level'. Level gate is the caller's hero or account level.
  function canEquip(id, t, cls, level) {
    const no = (reason) => Object.freeze({ ok: false, reason: reason });
    if (typeof id !== 'string') return no('unknown');
    const info = armorInfo(id);
    if (info) {
      const fam = armorFamilyOf(cls);
      if (!fam || fam !== info.family) return no('class');
    } else if (WPN_ID_RE.test(id) && MMWeaponItems && MMWeaponItems.get(id)) {
      if (!MMWeaponItems.canEquip(id, cls)) return no('class');
    } else if (id !== 'sparkwand' && !isWeaponId(id) && !GEAR_ID_RE.test(id)) return no('unknown');
    if (tierOf(t)) {
      const lv = typeof level === 'number' && Number.isFinite(level) ? level : 0;
      if (lv < gate(t)) return no('level');
    }
    return Object.freeze({ ok: true, reason: '' });
  }

  function baseName(id) {
    if (id === 'sparkwand') return 'Spark Wand';
    const info = armorInfo(id);
    if (info) return info.name;
    if (MMWeaponItems && MMWeaponItems.get(id)) return MMWeaponItems.get(id).name;
    return String(id).replace(/^(wpn|arm)_/, '').replace(/_/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase());
  }
  // describe(item) -> frozen { name: 'T7 Triple Shot', tierLabel: 'T7', tierColor, soulbound, gate } or null.
  function describe(item) {
    const c = item && typeof item === 'object' && !Array.isArray(item) && typeof item.id === 'string' ? clean({ n: 1, id: item.id, r: item.r, t: item.t, a: item.a }) : null;
    if (!c) return null;
    const t = c.t || 0;
    return Object.freeze({ id: c.id, name: (t ? 'T' + t + ' ' : '') + baseName(c.id), tierLabel: t ? 'T' + t : '', tierColor: t ? TIER_COLORS[t - 1] : NEUTRAL_COLOR, soulbound: soulbound(t), gate: t ? gate(t) : 0 });
  }

  // gearStats(items, eq, defs, cls): totals from the equipped tiered gear. `items` = backpack entries, `eq` = { slot: uid }, `defs` = { id: { amount } }.
  // T0 weapons add nothing here (the caller keeps the classic formula). Missing or hostile input yields zeros.
  function gearStats(items, eq, defs, cls) {
    const out = { weaponDmg: 0, weaponT: 0, hp: 0, guard: 0, speed: 0, res: 0, statusChance: 0, armorId: null, armorT: 0 };
    if (!Array.isArray(items) || !eq || typeof eq !== 'object') return Object.freeze(out);
    const find = (uid) => { for (let i = 0; i < items.length; i++) if (items[i] && items[i].n === uid) return clean(items[i]); return null; };
    if (isInt(eq.weapon)) {
      const w = find(eq.weapon);
      if (w && w.t && isWeaponId(w.id) && w.id !== 'quickwand') {
        const d = defs && typeof defs === 'object' && has(defs, w.id) && defs[w.id] ? defs[w.id] : null;
        const amt = d && typeof d.amount === 'number' ? d.amount : (w.id === 'sparkwand' ? 0.5 : 0.45);
        out.weaponDmg = weaponBonus(amt, w.t, w.r) || 0; out.weaponT = w.t;
      }
    }
    if (isInt(eq.armor)) {
      const a = find(eq.armor);
      const s = a && a.t ? armorStats(a.id, a.t, a.r) : null;
      if (s && (!cls || canEquip(a.id, a.t, cls, 99).ok)) { out.hp = s.hp; out.guard = s.guard; out.speed = s.speed; out.res = s.res; out.statusChance = s.statusChance; out.armorId = a.id; out.armorT = a.t; }
    }
    return Object.freeze(out);
  }

  return Object.freeze({
    TIERS, Q, TIER_COLORS, FAMILIES, FAMILY_KEYS, CLASS_ARMOR, ARMOR_IDS, ARMOR_ART, ARMOR_NAMES, GEAR_ID_RE, MAX_T, AFFIX_MIN_T,
    tierOf, gate, band, bagFor, soulbound, armorId, armorFamilyOf, alias, clean, sellValue, weaponBonus, armorStats, canEquip, describe, gearStats,
  });
});
