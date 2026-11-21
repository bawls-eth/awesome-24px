// MMWeapons: pure weapon-style data for the Mad Maze arena (CLASS-WEAPON-BUILD-PLAN.md sections a, b).
// 14 generated base styles (one per class, read from MMClasses FIRE tags) + 26 alternate styles = 40.
// No DOM, no Math.random, inputs are never mutated, hostile input falls back to the class base style.
// resolve(classId, styleId, rarity) returns a frozen spec whose damage index is normalised against the class base,
// so every style is a sidegrade (index within [0.95, 1.10] of its base).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./mm-classes.js'));
  else root.MMWeapons = factory(root.MMClasses);
})(typeof self !== 'undefined' ? self : this, function (MMClasses) {
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const r4 = (v) => Math.round(v * 10000) / 10000;

  const SHAPES = ['dot', 'arrow', 'shard', 'orb', 'star', 'blade', 'page', 'axe', 'hammer', 'fist', 'ray'];
  const FAMILIES = ['bow', 'wand', 'staff', 'tome', 'blade', 'hammer', 'axe', 'fist', 'dagger', 'star', 'pistol'];
  const CLASS_FAMILY = {
    ranger: 'bow', frostcaller: 'wand', graveTender: 'wand', warlock: 'staff', druid: 'staff', necromancer: 'staff',
    herald: 'tome', punk: 'blade', paladin: 'hammer', berserker: 'axe', bruiser: 'fist', rogue: 'dagger', shadowPaw: 'star', trickster: 'pistol',
  };
  // Status value V used by the index (plan section a). Statuses are the MMStatus ids.
  const STATUS_VALUE = { slowed: 0.2, weak: 0.15, dazed: 0.15, armorBroken: 0.25, curse: 0.2, bleed: 0.3, rooted: 0.25, marked: 0.1 };
  const RARITY_MULT = [1, 1.6, 2.4, 3.6]; // common..epic, the +0.45 / +0.72 / +1.08 / +1.62 item multiplier
  const AFFIX_CAP = [1, 1.03, 1.06, 1.10]; // max index gain by rarity
  const AFFIX_IDS = ['reach', 'velocity', 'pierce', 'keen', 'venom', 'extra', 'seek'];
  const BOLT_BUDGET = 40;
  const FIRE_RATE = 7.5, SPEED_PX = 580;

  // Fill a (possibly partial) style with schema defaults. Pure; returns a new plain object.
  function norm(s) {
    const w = s.wave || {}, ch = s.chain || {}, ob = s.orbit || {}, bu = s.burst || {}, lo = s.lob || {}, oh = s.onHit || {};
    return {
      id: s.id, family: s.family, name: s.name, shape: s.shape,
      count: s.count === undefined ? 1 : s.count, spread: s.spread || 0, spd: s.spd === undefined ? 1 : s.spd,
      life: s.life === undefined ? 0.85 : s.life, size: s.size === undefined ? 1 : s.size, rate: s.rate === undefined ? 1 : s.rate,
      dmg: s.dmg === undefined ? 1 : s.dmg, crit: s.crit || 0, pierce: s.pierce || 0, bounce: s.bounce || 0, homing: s.homing || 0,
      wave: { amp: w.amp || 0, cycles: w.cycles === undefined ? 2.75 : w.cycles, alt: !!w.alt },
      boomerang: !!s.boomerang,
      chain: { n: ch.n || 0, range: ch.range === undefined ? 120 : ch.range, falloff: ch.falloff === undefined ? 0.7 : ch.falloff },
      orbit: { n: ob.n || 0, radius: ob.radius === undefined ? 34 : ob.radius, period: ob.period === undefined ? 0.9 : ob.period, dmg: ob.dmg || 0, rehit: ob.rehit === undefined ? 0.3 : ob.rehit },
      burst: { n: bu.n === undefined ? 1 : bu.n, gap: bu.gap || 0 },
      lob: { radius: lo.radius || 0, maxRange: lo.maxRange === undefined ? 260 : lo.maxRange },
      knock: s.knock || 0,
      onHit: { status: oh.status || null, chance: oh.chance || 0, sec: oh.sec || 0 },
      tune: s.tune === undefined ? 1 : s.tune,
      affix: s.affix ? s.affix.slice() : [],
    };
  }

  // Index of a (normalised) style: relative damage output per second at point-blank, ranger plain bolt = 1.
  function shapeIdx(s) {
    if (!s || typeof s !== 'object') return 0;
    const w = s.wave || {}, ch = s.chain || {}, ob = s.orbit || {}, bu = s.burst || {}, lo = s.lob || {}, oh = s.onHit || {};
    const count = num(s.count, 1), burstN = num(bu.n, 1);
    let v = count * burstN * num(s.dmg, 1) * num(s.rate, 1);
    v *= 1 + 0.25 * num(s.pierce, 0);
    v *= 1 + num(s.crit, 0);
    v *= 1 + 0.12 * num(s.bounce, 0);
    if (num(s.homing, 0) > 0) v *= 1.15;
    if (s.boomerang) v *= 1.25;
    v *= 1 + 0.3 * num(ch.n, 0) * num(ch.falloff, 0.7);
    if (count * burstN === 1 && num(w.amp, 0) > 0) v *= 0.95;
    v *= 1 + Math.min(0.4, num(lo.radius, 0) / 100);
    if (oh.status && has(STATUS_VALUE, oh.status)) v *= 1 + num(oh.chance, 0) * STATUS_VALUE[oh.status];
    if (num(ob.n, 0) > 0) v += num(ob.n, 0) * num(ob.dmg, 0) / Math.max(0.05, num(ob.rehit, 0.3)) / FIRE_RATE;
    return v;
  }

  // ---- the 26 alternate styles (plan section a); fields: count/spread/spd/life/pierce, extras, nominal dmg, rate, tune.
  const ALT = [
    { id: 'bow_triple', family: 'bow', name: 'Triple Shot', shape: 'arrow', count: 3, spread: 0.18, spd: 1, life: 0.75, dmg: 0.40, rate: 1, tune: 1.06, affix: ['reach', 'keen', 'extra'] },
    { id: 'bow_longshot', family: 'bow', name: 'Longshot', shape: 'arrow', spd: 1.25, life: 0.85, pierce: 1, dmg: 0.85, rate: 0.85, affix: ['velocity', 'keen', 'seek'] },
    { id: 'bow_leaf', family: 'bow', name: 'Leaf Volley', shape: 'shard', count: 2, spread: 0.06, wave: { amp: 10, alt: true }, dmg: 0.55, affix: ['reach', 'keen', 'extra'] },
    { id: 'wand_seeker', family: 'wand', name: 'Seeker Wand', shape: 'orb', spd: 0.85, life: 1.0, homing: 4.0, dmg: 0.85, tune: 0.95, affix: ['reach', 'venom', 'keen'] },
    { id: 'wand_chain', family: 'wand', name: 'Chain Wand', shape: 'orb', spd: 1.1, life: 0.8, chain: { n: 2, range: 120, falloff: 0.7 }, dmg: 0.70, rate: 0.9, affix: ['reach', 'velocity', 'keen'] },
    { id: 'wand_frostshard', family: 'wand', name: 'Frost Shard', shape: 'shard', pierce: 1, onHit: { status: 'slowed', chance: 0.25, sec: 1.5 }, dmg: 0.80, affix: ['venom', 'reach', 'keen'] },
    { id: 'staff_helix', family: 'staff', name: 'Helix Staff', shape: 'orb', count: 2, spd: 0.9, life: 0.95, pierce: 1, wave: { amp: 14, alt: true }, dmg: 0.50, affix: ['reach', 'keen', 'extra'] },
    { id: 'staff_orb', family: 'staff', name: 'Great Orb', shape: 'orb', spd: 0.6, life: 1.4, pierce: 3, size: 2, dmg: 0.60, rate: 0.7, affix: ['reach', 'velocity', 'keen'] },
    { id: 'staff_bloom', family: 'staff', name: 'Bloom Staff', shape: 'orb', spd: 0.8, lob: { radius: 40, maxRange: 260 }, onHit: { status: 'rooted', chance: 0.1, sec: 0.6 }, dmg: 0.90, rate: 0.55, tune: 1.04, affix: ['venom', 'reach', 'keen'] },
    { id: 'tome_page', family: 'tome', name: 'Page Burst', shape: 'page', life: 0.8, burst: { n: 3, gap: 0.05 }, dmg: 0.40, rate: 0.8, affix: ['reach', 'keen', 'seek'] },
    { id: 'tome_orbit', family: 'tome', name: 'Orbit Tome', shape: 'page', life: 0.85, orbit: { n: 2, radius: 34, period: 0.9, dmg: 0.25, rehit: 0.3 }, dmg: 0.70, affix: ['reach', 'keen', 'seek'] },
    { id: 'tome_psalm', family: 'tome', name: 'Psalm Tome', shape: 'page', spd: 0.8, life: 1.0, pierce: 2, size: 1.5, wave: { amp: 20 }, dmg: 0.60, rate: 0.9, affix: ['reach', 'keen', 'seek'] },
    { id: 'blade_arc', family: 'blade', name: 'Arc Slash', shape: 'blade', count: 3, spread: 0.7, spd: 0.9, life: 0.3, pierce: 2, dmg: 0.55, rate: 0.9, tune: 1.08, affix: ['reach', 'keen', 'venom'] },
    { id: 'blade_riff', family: 'blade', name: 'Riff Blade', shape: 'blade', count: 2, spread: 0.15, life: 0.8, wave: { amp: 8, cycles: 4 }, onHit: { status: 'dazed', chance: 0.15, sec: 1 }, dmg: 0.60, affix: ['venom', 'reach', 'extra'] },
    { id: 'hammer_throw', family: 'hammer', name: 'Hammer Throw', shape: 'hammer', life: 1.1, pierce: 3, boomerang: true, dmg: 0.70, rate: 0.7, affix: ['reach', 'velocity', 'keen'] },
    { id: 'hammer_smite', family: 'hammer', name: 'Smite', shape: 'hammer', spd: 0.9, lob: { radius: 48, maxRange: 260 }, onHit: { status: 'armorBroken', chance: 0.2, sec: 2 }, dmg: 1.0, rate: 0.6, tune: 1.04, affix: ['venom', 'reach', 'keen'] },
    { id: 'axe_twin', family: 'axe', name: 'Twin Axes', shape: 'axe', count: 2, spread: 0.3, life: 0.9, pierce: 1, boomerang: true, dmg: 0.40, rate: 0.85, affix: ['reach', 'keen', 'venom'] },
    { id: 'axe_cleave', family: 'axe', name: 'Cleave', shape: 'axe', count: 5, spread: 0.9, spd: 0.9, life: 0.35, onHit: { status: 'bleed', chance: 0.15, sec: 3 }, dmg: 0.25, rate: 0.9, tune: 1.08, affix: ['venom', 'reach', 'keen'] },
    { id: 'fist_flurry', family: 'fist', name: 'Flurry', shape: 'fist', spd: 1.2, life: 0.3, burst: { n: 3, gap: 0.04 }, knock: 6, dmg: 0.45, tune: 1.08, affix: ['reach', 'keen', 'venom'] },
    { id: 'fist_shockwave', family: 'fist', name: 'Shockwave', shape: 'fist', count: 3, spread: 0.5, spd: 0.8, life: 0.4, pierce: 1, knock: 12, dmg: 0.45, rate: 0.8, tune: 1.05, affix: ['reach', 'keen', 'venom'] },
    { id: 'dagger_fan', family: 'dagger', name: 'Dagger Fan', shape: 'blade', count: 3, spread: 0.3, spd: 1.15, life: 0.7, crit: 0.10, dmg: 0.38, tune: 1.02, affix: ['reach', 'keen', 'extra'] },
    { id: 'dagger_venom', family: 'dagger', name: 'Venom Daggers', shape: 'blade', count: 2, spread: 0.08, spd: 1.1, crit: 0.10, onHit: { status: 'bleed', chance: 0.25, sec: 3 }, dmg: 0.45, affix: ['venom', 'reach', 'extra'] },
    { id: 'star_bounce', family: 'star', name: 'Bounce Stars', shape: 'star', count: 2, spread: 0.2, spd: 1.1, life: 0.95, bounce: 2, crit: 0.10, dmg: 0.42, affix: ['reach', 'keen', 'extra'] },
    { id: 'star_seeker', family: 'star', name: 'Seeker Stars', shape: 'star', count: 3, spread: 0.5, life: 0.9, homing: 3.0, crit: 0.10, dmg: 0.32, tune: 0.95, affix: ['reach', 'keen', 'velocity'] },
    { id: 'pistol_ricochet', family: 'pistol', name: 'Ricochet', shape: 'ray', spd: 1.2, bounce: 3, dmg: 0.80, affix: ['reach', 'keen', 'velocity'] },
    { id: 'pistol_burst', family: 'pistol', name: 'Burst Pistol', shape: 'ray', spd: 1.2, life: 0.7, burst: { n: 3, gap: 0.06 }, dmg: 0.38, rate: 0.9, affix: ['reach', 'keen', 'velocity'] },
  ];

  // ---- the 14 base styles, generated from MMClasses.arenaProfile (FIRE tags); never copied.
  const BASE_SHAPE = { ranger: 'dot', frostcaller: 'shard', herald: 'orb', punk: 'blade', bruiser: 'fist', graveTender: 'orb', trickster: 'ray',
    shadowPaw: 'star', rogue: 'blade', warlock: 'orb', paladin: 'hammer', berserker: 'axe', druid: 'orb', necromancer: 'orb' };
  const CLASS_IDS = Object.keys(CLASS_FAMILY);
  function baseSpec(classId) {
    const p = MMClasses.arenaProfile(classId);
    const spd = p.boltSpeed || 1;
    return norm({
      id: 'base_' + classId, family: CLASS_FAMILY[classId], name: (MMClasses.CLASSES[classId] ? MMClasses.CLASSES[classId].name : classId) + ' Bolt', shape: BASE_SHAPE[classId],
      count: p.shots, spread: p.spread, spd, life: r4(0.85 / spd), pierce: p.pierce, dmg: p.shotDmg, crit: p.critChance,
    });
  }

  function deepFreeze(o) {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.keys(o).forEach((k) => deepFreeze(o[k])); }
    return o;
  }
  const STYLES = {};
  const BASES = {};
  CLASS_IDS.forEach((c) => { const b = baseSpec(c); BASES[c] = b; STYLES[b.id] = deepFreeze(b); });
  ALT.forEach((a) => { STYLES[a.id] = deepFreeze(norm(a)); });
  deepFreeze(STYLES);

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const isClass = (c) => typeof c === 'string' && has(CLASS_FAMILY, c);
  const rarityOf = (r) => clamp(Math.floor(typeof r === 'number' && Number.isFinite(r) ? r : 0), 0, 3);

  function familyOf(classId) { return isClass(classId) ? CLASS_FAMILY[classId] : null; }
  function get(styleId) { return typeof styleId === 'string' && has(STYLES, styleId) ? STYLES[styleId] : null; }
  function styleIds() { return Object.keys(STYLES); }
  function altIds() { return ALT.map((a) => a.id); }
  function stylesForFamily(family) { return ALT.filter((a) => a.family === family).map((a) => a.id); }
  // Style ids a class may use: 'base' plus the alternates of its family.
  function stylesFor(classId) { return isClass(classId) ? ['base'].concat(stylesForFamily(CLASS_FAMILY[classId])) : ['base']; }
  // Style id for an equipped item ({style, family}); anything not matching the class family gives 'base'.
  function styleFor(classId, item) {
    if (!isClass(classId) || !item || typeof item !== 'object') return 'base';
    const sid = typeof item.style === 'string' ? item.style : '';
    const st = has(STYLES, sid) && !/^base_/.test(sid) ? STYLES[sid] : null;
    return st && st.family === CLASS_FAMILY[classId] ? st.id : 'base';
  }

  // Apply one affix to a working copy (mutates the copy only). Returns a fixed index gain for effects the shape formula misses.
  function applyAffix(w, id) {
    switch (id) {
      case 'reach': w.life = r4(w.life * 1.10); return 1.01;
      case 'velocity': w.spd = r4(w.spd * 1.10); return 1.01;
      case 'pierce': w.pierce = Math.min(3, w.pierce + 1); return 1;
      case 'keen': w.crit = r4(w.crit + 0.05); return 1;
      case 'venom':
        if (w.onHit.status) w.onHit.chance = r4(Math.min(1, w.onHit.chance + 0.10));
        else w.onHit = { status: 'bleed', chance: 0.10, sec: 3 };
        return 1;
      case 'extra': {
        const n = w.count;
        w.spread = n > 1 ? r4(w.spread * (n + 1) / n) : 0.08;
        w.count = Math.min(5, n + 1);
        w.dmg = w.dmg * n / w.count; // renormalised: no net index change
        return 1;
      }
      case 'seek': w.homing = r4(w.homing + 1); return 1;
    }
    return 1;
  }

  // resolve(classId, styleId, rarity) -> frozen spec. Unknown class/style/hostile input -> the class base (unknown class -> ranger base).
  function resolve(classId, styleId, rarity) {
    const cid = isClass(classId) ? classId : 'ranger';
    const r = rarityOf(rarity);
    const st = (typeof styleId === 'string' && has(STYLES, styleId) && styleId !== 'base' && !/^base_/.test(styleId) && STYLES[styleId].family === CLASS_FAMILY[cid]) ? STYLES[styleId] : null;
    if (!st) {
      const b = clone(BASES[cid]);
      const p = MMClasses.arenaProfile(cid);
      b.base = true; b.plain = cid === 'ranger'; b.classId = cid; b.rarity = r; b.affixes = []; b.k = 1;
      b.idx = shapeIdx(b); b.baseIdx = b.idx; b.affixIdx = 1; b.range = Math.round(b.spd * SPEED_PX * b.life); b.profile = { dmg: p.dmg, rate: p.rate };
      return deepFreeze(b);
    }
    const p = MMClasses.arenaProfile(cid);
    const baseIdx = p.shots * p.shotDmg * (1 + 0.25 * p.pierce) * (1 + p.critChance);
    const w = clone(st);
    const applied = r > 0 ? st.affix.slice(0, r).filter((a) => AFFIX_IDS.indexOf(a) >= 0) : [];
    const before = shapeIdx(w);
    let fixed = 1;
    applied.forEach((a) => { fixed *= applyAffix(w, a); });
    const raw = shapeIdx(w) / before * fixed;
    // the total ratio to the base stays inside [0.95, 1.10] at every rarity
    const cap = Math.max(1, Math.min(AFFIX_CAP[r], 1.10 / st.tune));
    const affixIdx = clamp(raw, 1, cap);
    const target = baseIdx * st.tune * affixIdx;
    const k = target / shapeIdx(w);
    w.dmg = w.dmg * k;
    if (w.orbit.n > 0) w.orbit.dmg = w.orbit.dmg * k;
    w.base = false; w.plain = false; w.classId = cid; w.rarity = r; w.affixes = applied; w.k = k;
    w.baseIdx = baseIdx; w.affixIdx = affixIdx; w.idx = shapeIdx(w);
    w.range = Math.round(w.spd * SPEED_PX * w.life); w.profile = { dmg: p.dmg, rate: p.rate };
    return deepFreeze(w);
  }

  // Live bolts one hero can have at once (engine bound <= 40).
  function boltBound(spec) {
    if (!spec || typeof spec !== 'object') return 0;
    const bu = spec.burst || {};
    return num(spec.count, 1) * num(bu.n, 1) * Math.ceil(num(spec.life, 0.85) * FIRE_RATE * num(spec.rate, 1));
  }

  const NOUN = { dot: 'bolt', arrow: 'arrow', shard: 'shard', orb: 'orb', star: 'star', blade: 'blade', page: 'page', axe: 'axe', hammer: 'hammer', fist: 'fist', ray: 'ray' };
  // One-line description for tooltips, e.g. "3 arrows, fan 10 deg, range 435 px, wave, bleed 15%".
  function describe(spec) {
    if (!spec || typeof spec !== 'object') return '';
    const noun = NOUN[spec.shape] || 'bolt', c = num(spec.count, 1), bu = spec.burst || {}, parts = [];
    parts.push(c + ' ' + noun + (c === 1 ? '' : 's'));
    if (num(bu.n, 1) > 1) parts.push('burst of ' + bu.n);
    if (c > 1 && num(spec.spread, 0) > 0) parts.push('fan ' + Math.round(spec.spread * 180 / Math.PI) + ' deg');
    const lob = spec.lob || {};
    if (num(lob.radius, 0) > 0) parts.push('lobbed, radius ' + Math.round(lob.radius) + ' px');
    else parts.push('range ' + Math.round(num(spec.spd, 1) * SPEED_PX * num(spec.life, 0.85)) + ' px');
    if (num(spec.pierce, 0) > 0) parts.push('pierce ' + spec.pierce);
    if (num(spec.bounce, 0) > 0) parts.push('bounce ' + spec.bounce);
    if (num(spec.homing, 0) > 0) parts.push('homing');
    if (spec.wave && num(spec.wave.amp, 0) > 0) parts.push(spec.wave.alt ? 'helix wave' : 'wave');
    if (spec.boomerang) parts.push('boomerang');
    if (spec.chain && num(spec.chain.n, 0) > 0) parts.push('chains ' + spec.chain.n);
    if (spec.orbit && num(spec.orbit.n, 0) > 0) parts.push('orbits ' + spec.orbit.n);
    if (num(spec.knock, 0) > 0) parts.push('knockback');
    if (num(spec.crit, 0) > 0) parts.push('crit ' + Math.round(spec.crit * 100) + '%');
    const oh = spec.onHit;
    if (oh && oh.status && has(STATUS_VALUE, oh.status)) parts.push(oh.status + ' ' + Math.round(num(oh.chance, 0) * 100) + '%');
    return parts.join(', ');
  }

  // Schema check for a style object (used by tests and future data). Returns a list of problems (empty = valid).
  function validate(s) {
    const bad = [];
    if (!s || typeof s !== 'object') return ['not an object'];
    const rng = (name, v, a, b, int) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < a || v > b || (int && !Number.isInteger(v))) bad.push(name + '=' + v); };
    if (typeof s.id !== 'string' || !/^[A-Za-z_]{3,24}$/.test(s.id)) bad.push('id');
    if (FAMILIES.indexOf(s.family) < 0) bad.push('family');
    if (typeof s.name !== 'string' || !s.name) bad.push('name');
    if (SHAPES.indexOf(s.shape) < 0) bad.push('shape');
    rng('count', s.count, 1, 5, true); rng('spread', s.spread, 0, 1, false); rng('spd', s.spd, 0.4, 1.4, false);
    rng('life', s.life, 0.1, 2, false); rng('size', s.size, 0.5, 3, false); rng('rate', s.rate, 0.3, 1.5, false);
    rng('dmg', s.dmg, 0.05, 2, false); rng('crit', s.crit, 0, 0.5, false); rng('pierce', s.pierce, 0, 3, true);
    rng('bounce', s.bounce, 0, 3, true); rng('homing', s.homing, 0, 8, false); rng('knock', s.knock, 0, 40, false);
    rng('tune', s.tune, 0.95, 1.08, false);
    if (!s.wave) bad.push('wave'); else { rng('wave.amp', s.wave.amp, 0, 40, false); rng('wave.cycles', s.wave.cycles, 0.5, 8, false); }
    if (!s.chain) bad.push('chain'); else rng('chain.n', s.chain.n, 0, 3, true);
    if (!s.orbit) bad.push('orbit'); else rng('orbit.n', s.orbit.n, 0, 3, true);
    if (!s.burst) bad.push('burst'); else { rng('burst.n', s.burst.n, 1, 5, true); rng('burst.gap', s.burst.gap, 0, 0.5, false); }
    if (!s.lob) bad.push('lob'); else rng('lob.radius', s.lob.radius, 0, 100, false);
    if (!s.onHit) bad.push('onHit');
    else if (s.onHit.status !== null && !has(STATUS_VALUE, s.onHit.status)) bad.push('onHit.status');
    if (!Array.isArray(s.affix) || s.affix.length > 3 || s.affix.some((a) => AFFIX_IDS.indexOf(a) < 0)) bad.push('affix');
    return bad;
  }

  return { STYLES, FAMILIES, SHAPES, CLASS_FAMILY, STATUS_VALUE, RARITY_MULT, AFFIX_CAP, AFFIX_IDS, BOLT_BUDGET,
    get, styleIds, altIds, stylesForFamily, stylesFor, familyOf, styleFor, shapeIdx, resolve, boltBound, describe, validate };
});
