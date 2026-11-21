// MMGearSets: the two gear set bonuses of slice GB (NEXT-SLICES-2 Wave 2, "GB acceptance" 1).
//  - "Banded": the equipped armor's band equals the equipped weapon's band (band = ceil(t / 2); a signature relic is band 6): +4% HP, and +1 GRD at band >= 4.
//  - "Dread pair": an `arm_*_dread` body piece (arm_light_dread, arm_heavy_dread or the arm_sig_dread relic) with a T11-12 weapon that carries a boss
//    signature affix (item.sig, rolled by MMGearAffix at T12): that signature affix +25%.
// At most MAX_ACTIVE (2) sets are active. Every bonus stays inside the existing weapon affix power cap (MMGearAffix.cap(t)): the signature boost is
// trimmed so the weapon's affix power product (MMGearAffix.value) never passes the cap; HP / GRD carry no weapon power.
// Pure: no DOM, no clock, no Math.random (affix values come from the seeded MMGearAffix.roll). Frozen output; hostile input yields [] / zeros; inputs
// are never mutated. Duels and `?gear=0` are the caller's job (realm.js simply does not call this there).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./mm-gear.js'), require('./mm-gear-affix.js'));
  else root.MMGearSets = factory(root.MMGear, root.MMGearAffix);
})(typeof self !== 'undefined' ? self : this, function (MMGear, MMGearAffix) {
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const MAX_ACTIVE = 2;
  const BANDED_HP = 0.04, BANDED_GRD = 1, BANDED_GRD_BAND = 4, DREAD_SIG = 0.25, DREAD_MIN_T = 11;
  const DREAD_RE = /^arm_[a-z]{3,8}_dread$/;
  const SETS = Object.freeze({
    banded: Object.freeze({ id: 'banded', name: 'Banded set', rule: 'Armor band equals weapon band', hp: BANDED_HP, grd: BANDED_GRD, grdBand: BANDED_GRD_BAND }),
    dread: Object.freeze({ id: 'dread', name: 'Dread pair', rule: 'Dread armor with a T11-12 signature weapon', sig: DREAD_SIG, minT: DREAD_MIN_T }),
  });
  const ORDER = Object.freeze(['banded', 'dread']);
  const EXTRA_KEYS = Object.freeze(['vital', 'ward', 'keen', 'blast', 'venom', 'swift', 'reach', 'leech', 'pierce']);

  // pick(eqItems) -> { weapon, armor } as MMGear.clean entries (null when missing). eqItems: { weapon, armor } or an array of the equipped entries.
  function pick(eqItems) {
    const out = { weapon: null, armor: null };
    if (!eqItems || typeof eqItems !== 'object') return out;
    const list = Array.isArray(eqItems) ? eqItems.slice(0, 8) : [has(eqItems, 'weapon') ? eqItems.weapon : null, has(eqItems, 'armor') ? eqItems.armor : null];
    list.forEach((raw) => {
      const c = raw && typeof raw === 'object' && !Array.isArray(raw) ? MMGear.clean(Object.assign({ n: 1 }, { id: raw.id, r: raw.r, t: raw.t, a: raw.a, sig: raw.sig })) : null;
      if (!c || !c.t) return;
      const info = MMGear.armorStats(c.id, c.t, c.r) ? c : null;
      if (info) { if (!out.armor) out.armor = c; return; }
      if ((c.id === 'sparkwand' || /^wpn_[a-z_]{3,24}$/.test(c.id)) && !out.weapon) out.weapon = c;
    });
    return out;
  }
  const armorBand = (a) => { const s = MMGear.armorStats(a.id, a.t, a.r); return s ? MMGear.band(s.t) : 0; };

  // sigBoost(weapon) -> { id, v } the capped extra value of the weapon's signature affix, or null when it has none (or the cap leaves no room).
  function sigBoost(w) {
    if (!w || !w.sig || !w.a || w.t < DREAD_MIN_T) return null;
    const list = MMGearAffix.roll(w.id, 'weapon', w.t, w.r, w.a, w.sig);
    const e = list.find((x) => x.id === w.sig && x === list[list.length - 1]); // roll appends the signature last
    if (!e || !(e.v > 0)) return null;
    const def = MMGearAffix.get(e.id);
    const q = (v) => (def.unit === 'int' ? Math.round(v) : def.unit === 'pct' ? Math.floor(v * 1000) / 1000 : Math.floor(v * 10) / 10);
    let add = q(e.v * DREAD_SIG);
    const capOk = (d) => MMGearAffix.value(list.map((x) => (x === e ? { id: x.id, v: x.v + d } : x))) <= MMGearAffix.cap(w.t) + 1e-12;
    if (!capOk(0)) return null;
    if (!capOk(add)) { // trim the boost so the product sits at the cap (never above it)
      let lo = 0, hi = add;
      for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (capOk(mid)) lo = mid; else hi = mid; }
      add = q(lo); while (add > 0 && !capOk(add)) add = q(add - (def.unit === 'int' ? 1 : def.unit === 'pct' ? 0.001 : 0.1));
    }
    return add > 0 ? { id: e.id, v: add } : null;
  }

  // active(eqItems) -> frozen [{ id, name, text, bonus: { affixId: value } }], at most MAX_ACTIVE entries, in ORDER.
  function active(eqItems) {
    const { weapon, armor } = pick(eqItems), out = [];
    if (weapon && armor) {
      const b = MMGear.band(weapon.t);
      if (b > 0 && b === armorBand(armor)) {
        const bonus = { vital: BANDED_HP }; if (b >= BANDED_GRD_BAND) bonus.ward = BANDED_GRD;
        out.push({ id: 'banded', name: SETS.banded.name, text: 'Banded set: +4% HP' + (bonus.ward ? ', +1 GRD' : ''), bonus: bonus });
      }
      if (DREAD_RE.test(armor.id) && weapon.t >= DREAD_MIN_T) {
        const sb = sigBoost(weapon);
        if (sb) out.push({ id: 'dread', name: SETS.dread.name, text: 'Dread pair: signature ' + sb.id + ' +25%', bonus: { [sb.id]: sb.v } });
      }
    }
    return Object.freeze(out.slice(0, MAX_ACTIVE).map((s) => Object.freeze({ id: s.id, name: s.name, text: s.text, bonus: Object.freeze(s.bonus) })));
  }

  // extras(eqItems | activeList) -> frozen { vital, ward, keen, blast, venom, swift, reach, leech, pierce }: the summed set bonuses in MMGearAffix units,
  // ready to add into _calcStats' gear extras exactly like an affix sum. Always every key (0 = nothing).
  function extras(x) {
    const list = Array.isArray(x) && x.every((s) => s && typeof s === 'object' && typeof s.id === 'string' && s.bonus) ? x : active(x);
    const out = {}; EXTRA_KEYS.forEach((k) => { out[k] = 0; });
    list.slice(0, MAX_ACTIVE).forEach((s) => { Object.keys(s.bonus).forEach((k) => { if (has(out, k) && typeof s.bonus[k] === 'number' && Number.isFinite(s.bonus[k])) out[k] += s.bonus[k]; }); });
    return Object.freeze(out);
  }

  // weaponAffixes(eqItems) -> the equipped weapon's affix list with the Dread pair boost folded in (frozen), [] without a T7+ weapon.
  // MMGearAffix.value(result) <= MMGearAffix.cap(t) always holds.
  function weaponAffixes(eqItems) {
    const { weapon } = pick(eqItems);
    if (!weapon || !weapon.a || weapon.t < MMGearAffix.MIN_T) return Object.freeze([]);
    const list = MMGearAffix.roll(weapon.id, 'weapon', weapon.t, weapon.r, weapon.a, weapon.sig);
    const d = active(eqItems).find((s) => s.id === 'dread');
    if (!d) return list;
    const k = Object.keys(d.bonus)[0];
    return Object.freeze(list.map((e, i) => Object.freeze(e.id === k && i === list.length - 1 ? { id: e.id, v: Math.round((e.v + d.bonus[k]) * 1000) / 1000 } : { id: e.id, v: e.v })));
  }

  return Object.freeze({ SETS, ORDER, MAX_ACTIVE, EXTRA_KEYS, active, extras, weaponAffixes });
});
