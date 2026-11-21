// MMHeroStats: pure formatting helpers for the Realm hero picker and stats panel. No DOM, no I/O, never throws on hostile input.
// UMD: browser global MMHeroStats, or require(). `Classes` is MMClasses (passed in, so the tests can stub it).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMHeroStats = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic'];
  const ZONE_NAMES = ['Shore', 'Midlands', 'Highlands', 'Godlands'];
  const has = (o, k) => !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
  const num = (v, d) => { v = Number(v); return v === v && Math.abs(v) !== Infinity && v !== null ? v : d; };
  const clean = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>]/g, '').slice(0, max || 40) : '');
  const round = (v, p) => { const k = Math.pow(10, p || 0); return Math.round(num(v, 0) * k) / k; };

  function classDef(Classes, id) {
    const C = Classes && Classes.CLASSES;
    return typeof id === 'string' && has(C, id) ? C[id] : null;
  }
  function className(Classes, id) { const c = classDef(Classes, id); return c ? clean(c.name, 40) : (clean(id, 20) || 'Unknown'); }

  // 83 -> "1m 23s"; 3700 -> "1h 01m"; junk -> "0s".
  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(num(sec, 0)));
    if (sec >= 3600) return Math.floor(sec / 3600) + 'h ' + String(Math.floor(sec % 3600 / 60)).padStart(2, '0') + 'm';
    if (sec >= 60) return Math.floor(sec / 60) + 'm ' + String(sec % 60).padStart(2, '0') + 's';
    return sec + 's';
  }
  // multiplier -> signed percent text: 1.3 -> "+30%", 0.83 -> "-17%", 1 -> "0%".
  function fmtMult(m) {
    const p = Math.round((num(m, 1) - 1) * 100);
    return (p > 0 ? '+' : '') + p + '%';
  }
  function rarityName(r) { const i = Math.floor(num(r, 0)); return RARITIES[i >= 0 && i < RARITIES.length ? i : 0]; }
  function zoneName(z) { if (z === null || z === undefined || z === '') return 'None yet'; const i = Math.floor(num(z, -1)); return i >= 0 && i < ZONE_NAMES.length ? ZONE_NAMES[i] : 'None yet'; }

  // Fire tag text from an arenaProfile: "2 bolts, fan 0.12, pierce 0, x0.75 dmg each, crit 10%".
  function fireText(p) {
    p = p && typeof p === 'object' ? p : {};
    const shots = Math.max(1, Math.floor(num(p.shots, 1)));
    const bits = [shots + (shots === 1 ? ' bolt' : ' bolts')];
    if (num(p.spread, 0) > 0) bits.push('fan ' + round(p.spread, 2));
    bits.push('pierce ' + Math.max(0, Math.floor(num(p.pierce, 0))));
    bits.push('x' + round(num(p.shotDmg, 1), 2) + ' dmg each');
    if (num(p.critChance, 0) > 0) bits.push('crit ' + Math.round(num(p.critChance, 0) * 100) + '%');
    if (num(p.boltSpeed, 1) !== 1) bits.push('bolt speed ' + fmtMult(p.boltSpeed));
    return bits.join(', ');
  }

  // Ability lines: the class ability plus the signature on F.
  function abilityRows(Classes, id) {
    const out = [];
    const c = classDef(Classes, id);
    if (c && c.ability) {
      const nm = clean(c.ability.name, 30) || 'Ability';
      const cost = Math.max(0, Math.floor(num(c.ability.cost, 0)));
      out.push({ key: 'class', name: nm, cost, cd: round(c.ability.cd, 1), text: nm + ' - ' + cost + ' focus, ' + round(c.ability.cd, 1) + 's cooldown' });
    }
    let sig = null;
    try { sig = c && typeof Classes.arenaSignature === 'function' ? Classes.arenaSignature(id) : null; } catch (e) { sig = null; }
    if (sig) out.push({ key: 'F', name: clean(sig.name, 30), cost: 0, cd: round(sig.cooldown, 1), text: clean(sig.name, 30) + ' - ' + round(sig.cooldown, 1) + 's cooldown (F, Lv ' + Math.floor(num(sig.level, 7)) + ')' });
    return out;
  }

  // How to unlock a class: starters are free; others need a level on another hero.
  function lockHint(Classes, id) {
    const c = classDef(Classes, id);
    if (!c) return 'Locked';
    const u = c.unlock || {};
    if (!u.from) return 'Starter hero';
    const lv = Math.max(1, Math.floor(num(u.level, 1)));
    if (u.from === '*') return 'Reach level ' + lv + ' with any hero';
    return 'Reach level ' + lv + ' with a ' + className(Classes, u.from);
  }

  // Picker data from a CLEANED profile: owned heroes (selectable) + locked classes (dimmed, not selectable).
  function pickerList(profile, Classes, activeId) {
    const heroes = profile && Array.isArray(profile.heroes) ? profile.heroes : [];
    const owned = [], have = Object.create(null), ok = Object.create(null);
    heroes.forEach((h) => {
      if (!h || typeof h !== 'object' || typeof h.id !== 'string') return;
      const cls = typeof h.cls === 'string' ? h.cls : 'ranger';
      have[cls] = true;
      owned.push({ id: h.id.slice(0, 40), name: clean(h.name, 24) || 'Hero', cls, clsName: className(Classes, cls), level: Math.max(1, Math.floor(num(h.level, 1))), active: h.id === activeId, locked: false });
      try { (Classes.unlocks(cls, h.level) || []).forEach((c) => { ok[c] = true; }); } catch (e) { /* ignore */ }
    });
    const locked = [];
    const C = Classes && Classes.CLASSES;
    if (C && typeof C === 'object') {
      Object.keys(C).forEach((id) => {
        let start = false; try { start = !!Classes.isStart(id); } catch (e) { start = false; }
        if (have[id] || ok[id] || start) return;
        locked.push({ id: 'locked:' + id, name: className(Classes, id), cls: id, clsName: className(Classes, id), level: 0, active: false, locked: true, hint: lockHint(Classes, id) });
      });
    }
    return { owned, locked };
  }

  // Gear tier (1-12) of a save item: absent / junk -> 0 (a classic T0 item). Soulbound = T11+ (derived, as in the gear plan).
  function tierOf(it) { const t = it && typeof it === 'object' ? it.t : 0; return typeof t === 'number' && t === Math.floor(t) && t >= 1 && t <= 12 ? t : 0; }
  // Equipped items: items = realm save items [{n,id,r,t?}], eq = {weapon:uid,...}, defs = id -> {name, slot}. Four slots (armor added).
  function itemRows(items, eq, defs) {
    const out = [];
    if (!eq || typeof eq !== 'object' || !Array.isArray(items)) return out;
    ['weapon', 'armor', 'charm', 'ring'].forEach((slot) => {
      const it = items.find((x) => x && x.n === eq[slot]);
      const d = it && has(defs, it.id) ? defs[it.id] : null;
      const t = d ? tierOf(it) : 0, tier = t ? 'T' + t : '';
      const nm = d ? clean(d.name, 30) : '';
      out.push({ slot, name: nm, rarity: d ? rarityName(it.r) : '', tier, soulbound: t >= 11, text: d ? (tier ? tier + ' ' : '') + nm + ' (' + rarityName(it.r) + ')' : 'empty' });
    });
    return out;
  }

  // ---- Stats table builders (plan section e). Pure, never throw, output text never contains '<'.
  // A stats object uses the arena names: maxHp|hp, dmg, rate, count, speed, range, guard, crit, splashR, splashFrac, status, resist, leech, regen, bonus.
  // pct values are fractions (0.1 = 10%). est. DPS = dmg x rate x count x (1 + crit).
  const STAT_DEFS = [
    { key: 'hp', label: 'HP', short: 'HP', unit: '', p: 0, from: ['maxHp', 'hp'], core: true },
    { key: 'dmg', label: 'Damage per bolt', short: 'Damage', unit: '', p: 2, from: ['dmg'], core: true },
    { key: 'rate', label: 'Attack rate', short: 'Attack rate', unit: '/s', p: 1, from: ['rate'], core: true },
    { key: 'dps', label: 'Est. DPS', short: 'DPS', unit: '', p: 1, from: [], core: true },
    { key: 'speed', label: 'Speed', short: 'Speed', unit: ' px/s', p: 0, from: ['speed'], core: true },
    { key: 'range', label: 'Range', short: 'Range', unit: ' px', p: 0, from: ['range'], core: true },
    { key: 'guard', label: 'Guard', short: 'Guard', unit: '', p: 0, from: ['guard'], core: true },
    { key: 'crit', label: 'Crit chance', short: 'Crit chance', unit: 'pct', p: 1, from: ['crit'] },
    { key: 'splash', label: 'Splash', short: 'Splash radius', unit: ' px', p: 0, from: ['splashR'] },
    { key: 'status', label: 'Status chance', short: 'Status chance', unit: 'pct', p: 1, from: ['status'] },
    { key: 'resist', label: 'Resists', short: 'Resists', unit: 'pct', p: 1, from: ['resist'] },
    { key: 'leech', label: 'Lifesteal', short: 'Lifesteal', unit: 'pct', p: 1, from: ['leech'] },
    { key: 'regen', label: 'Regen', short: 'Regen', unit: ' HP/s', p: 1, from: ['regen'] },
    { key: 'bonus', label: 'Shard/XP bonus', short: 'Shard and XP bonus', unit: 'pct', p: 1, from: ['bonus'] },
  ];
  const sn = (v) => (typeof v === 'number' && v === v && v !== Infinity && v !== -Infinity ? v : null); // strict finite number or null
  const rnd = (v, p) => { const k = Math.pow(10, p); return Math.round(v * k) / k; };
  function statVal(o, d) {
    if (!o || typeof o !== 'object') return null;
    if (d.key === 'dps') {
      const dm = sn(has(o, 'dmg') ? o.dmg : null), rt = sn(has(o, 'rate') ? o.rate : null);
      if (dm === null || rt === null) return null;
      const ct = has(o, 'count') ? sn(o.count) : 1, cr = has(o, 'crit') ? sn(o.crit) : 0;
      return dm * rt * (ct === null || ct < 1 ? 1 : ct) * (1 + (cr === null ? 0 : cr));
    }
    for (let i = 0; i < d.from.length; i++) if (has(o, d.from[i])) { const v = sn(o[d.from[i]]); if (v !== null) return v; }
    return null;
  }
  const fmtVal = (v, d) => (d.unit === 'pct' ? rnd(v * 100, d.p) + '%' : rnd(v, d.p) + d.unit);
  // Signed delta text with an arrow so direction never relies on colour: 0.3 -> "▲ +0.3", -2 -> "▼ -2", 0 -> "= 0".
  function fmtDelta(v, unit) {
    const x = sn(typeof v === 'number' ? v : null);
    const d = { unit: typeof unit === 'string' ? clean(unit, 12) : '', p: unit === 'pct' ? 1 : (unit === ' px' || unit === ' px/s') ? 0 : unit === ' HP/s' || unit === '/s' ? 1 : 2 };
    if (x === null) return '= 0';
    const r = rnd(unit === 'pct' ? x * 100 : x, d.p);
    if (r === 0) return '= 0';
    const body = Math.abs(r) + (unit === 'pct' ? '%' : d.unit);
    return r > 0 ? '\u25B2 +' + body : '\u25BC -' + body;
  }
  // statTable(total, base) -> [{key, label, unit, total, base, gear, totalText, baseText, gearText, aria}] (gear = total - base).
  function statTable(total, base) {
    const out = [];
    try {
      STAT_DEFS.forEach((d) => {
        const tv = statVal(total, d), bv = statVal(base, d);
        if (tv === null && bv === null) return;
        const t = tv === null ? (total && typeof total === 'object' ? 0 : bv) : tv, b = bv === null ? (base && typeof base === 'object' ? 0 : t) : bv;
        if (!d.core && !t && !b) return;
        const g = rnd(t - b, d.unit === 'pct' ? d.p + 2 : d.p);
        let totalText = fmtVal(t, d);
        if (d.key === 'splash') {
          const fr = sn(total && has(total, 'splashFrac') ? total.splashFrac : null);
          totalText = 'r ' + rnd(t, 0) + ' px' + (fr !== null && fr > 0 ? ', ' + rnd(fr * 100, 0) + '%' : '');
        }
        let baseTextS = null;
        if (d.key === 'splash') baseTextS = 'r ' + rnd(b, 0) + ' px';
        const gearText = fmtDelta(g, d.unit).replace(/^\u25B2 |^\u25BC /, '').replace(/^= 0$/, '0');
        const baseText = baseTextS || fmtVal(b, d);
        out.push({ key: d.key, label: d.label, unit: d.unit, total: rnd(t, 4), base: rnd(b, 4), gear: g, totalText, baseText, gearText,
          aria: d.short + ': total ' + totalText + ', base ' + baseText + ', gear ' + (g === 0 ? 'none' : (g > 0 ? 'plus ' : 'minus ') + gearText.replace(/^[+-]/, '')) });
      });
    } catch (e) { return []; }
    return out;
  }
  // compareRows(cur, cand) -> only the rows that change: [{key, label, cur, cand, delta, dir:'up'|'down', text:'▲ +0.3', aria:'Damage up 0.3'}].
  function compareRows(cur, cand) {
    const out = [];
    try {
      STAT_DEFS.forEach((d) => {
        const a = statVal(cur, d), b = statVal(cand, d);
        if (a === null && b === null) return;
        const x = a === null ? 0 : a, y = b === null ? 0 : b;
        const shown = d.unit === 'pct' ? rnd((y - x) * 100, d.p) : rnd(y - x, d.p);
        if (shown === 0) return;
        const up = shown > 0, mag = fmtVal(Math.abs(y - x), d).replace('%', ' percent');
        out.push({ key: d.key, label: d.label, cur: rnd(x, 4), cand: rnd(y, 4), delta: rnd(y - x, 4), dir: up ? 'up' : 'down', text: fmtDelta(y - x, d.unit),
          aria: d.short + (up ? ' up ' : ' down ') + mag });
      });
    } catch (e) { return []; }
    return out;
  }
  // Boss-luck text from realm.gp {b, d}: "+7% (T12 guaranteed in 46 kills)"; "" when gp is not an object.
  function bossLuck(gp) {
    if (!gp || typeof gp !== 'object') return '';
    const b = Math.max(0, Math.min(60, Math.floor(num(gp.b, 0))));
    const left = 60 - b;
    return '+' + Math.min(10, Math.floor(b * 5) / 10) + '% (T12 guaranteed in ' + left + (left === 1 ? ' kill)' : ' kills)');
  }

  // Weapon group rows (only when src.weapon is given): src.weapon = {style, family, pattern, rarity, affixes[]}.
  function weaponRows(w) {
    if (!w || typeof w !== 'object') return [];
    const out = [];
    const style = clean(w.style, 30), fam = clean(w.family, 20), pat = clean(w.pattern, 120);
    if (style) out.push({ label: 'Style', value: style + (fam ? ' (' + fam + ')' : '') });
    if (pat) out.push({ label: 'Fire pattern', value: pat });
    if (has(w, 'rarity')) out.push({ label: 'Rarity', value: rarityName(w.rarity) });
    const aff = Array.isArray(w.affixes) ? w.affixes.map((a) => clean(a, 20)).filter(Boolean).slice(0, 3) : [];
    if (aff.length) out.push({ label: 'Affixes', value: aff.join(', ') });
    return out;
  }
  // Passive rows (only when src.passives is given): {level, unlocks (MMUnlocks, optional; falls back to the global/require)}.
  // One row per class node reached (ticked) or still locked ("Lv N"), then a "Next" row for the first locked node.
  function passiveRows(Classes, cls, pz) {
    if (!pz || typeof pz !== 'object') return [];
    let U = pz.unlocks;
    if (!U) { try { U = typeof MMUnlocks !== 'undefined' ? MMUnlocks : (typeof require === 'function' ? require('./mm-unlocks.js') : null); } catch (e) { U = null; } }
    if (!U || typeof U.forLevel !== 'function') return [];
    const level = Math.max(0, Math.min(20, Math.floor(num(pz.level, 0))));
    const id = typeof cls === 'string' ? cls : '';
    let all = [], nx = null;
    try { all = U.nodes(id) || []; nx = U.next(id, level); } catch (e) { return []; }
    const out = [];
    all.forEach((n) => {
      if (!n || typeof n !== 'object' || /^(nova2|dash2)_/.test(String(n.id))) return; // shared actives are shown on the ability bar
      const nm = clean(n.name, 24) || 'Passive';
      out.push({ label: nm, value: num(n.lv, 99) <= level ? '[x] ' + clean(n.text, 80) : 'Lv ' + Math.floor(num(n.lv, 0)) });
    });
    if (nx) out.push({ label: 'Next', value: 'Lv ' + Math.floor(num(nx.lv, 0)) + ' ' + (clean(nx.name, 24) || 'Passive') });
    return out;
  }
  // Status rows (only when src.status is a non-empty array): [{id, name, sec, stacks}] -> "Slowed x2, 1.5s".
  function statusRows(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    list.slice(0, 12).forEach((s) => {
      if (!s || typeof s !== 'object') return;
      const nm = clean(s.name, 24) || clean(s.id, 24);
      if (!nm) return;
      const st = Math.floor(num(s.stacks, 1));
      out.push({ label: nm, value: (st > 1 ? 'x' + Math.min(st, 9) + ', ' : '') + round(Math.max(0, num(s.sec, 0)), 1) + 's left' });
    });
    return out;
  }

  // Full stats panel model. src: {hero, profile (arenaProfile), stats (arena.stats), save (arena.save), run:{kills,deepest,portals,time}, defs}.
  function panelRows(Classes, src) {
    src = src && typeof src === 'object' ? src : {};
    const hero = src.hero && typeof src.hero === 'object' ? src.hero : {};
    const p = src.profile && typeof src.profile === 'object' ? src.profile : {};
    const st = src.stats && typeof src.stats === 'object' ? src.stats : {};
    const sv = src.save && typeof src.save === 'object' ? src.save : {};
    const run = src.run && typeof src.run === 'object' ? src.run : {};
    const cd = classDef(Classes, hero.cls);
    const rows = [];
    const add = (group, label, value) => rows.push({ group, label, value: String(value) });
    add('Hero', 'Name', clean(hero.name, 24) || 'Hero');
    add('Hero', 'Class', className(Classes, hero.cls));
    add('Hero', 'Level', Math.max(1, Math.floor(num(hero.level, 1))));
    add('Hero', 'XP', Math.max(0, Math.floor(num(hero.xp, 0))));
    if (has(sv, 'level')) add('Hero', 'Realm level', Math.max(1, Math.floor(num(sv.level, 1))) + (has(sv, 'xp') ? ' (' + Math.max(0, Math.floor(num(sv.xp, 0))) + ' xp)' : ''));
    add('Class stats', 'HP', Math.round(num(st.maxHp, 100 * num(p.hp, 1))) + ' (' + fmtMult(p.hp) + ')');
    add('Class stats', 'Damage', round(num(st.dmg, num(p.dmg, 1)), 2) + ' (' + fmtMult(p.dmg) + ')');
    add('Class stats', 'Attack rate', round(num(st.rate, 7.5 * num(p.rate, 1)), 1) + ' shots/s (' + fmtMult(p.rate) + ')');
    add('Class stats', 'Speed', Math.round(num(st.speed, 235 * num(p.speed, 1))) + ' (' + fmtMult(p.speed) + ')');
    add('Class stats', 'Safe time', fmtMult(p.iframes));
    add('Class stats', 'Fire', fireText(p));
    if (cd && cd.base) add('Class stats', 'Base stats', 'POW ' + num(cd.base.pow, 0) + ' / GRD ' + num(cd.base.grd, 0) + ' / SWF ' + num(cd.base.swf, 0) + ' / KNK ' + num(cd.base.knk, 0));
    abilityRows(Classes, hero.cls).forEach((a) => add('Abilities', a.key === 'F' ? 'Signature' : 'Class ability', a.text));
    weaponRows(src.weapon).forEach((r) => add('Weapon', r.label, r.value));
    passiveRows(Classes, hero.cls, src.passives).forEach((r) => add('Passives', r.label, r.value));
    statusRows(src.status).forEach((r) => add('Status', r.label, r.value));
    if (src.statsBase && typeof src.statsBase === 'object') statTable(st, src.statsBase).forEach((r) => add('Gear stats', r.label, r.totalText + ' (base ' + r.baseText + ', gear ' + (r.gear === 0 ? '0' : r.gearText) + ')'));
    if (src.gp && typeof src.gp === 'object') add('Gear stats', 'Boss luck', bossLuck(src.gp));
    add('Gear', 'Shards', Math.max(0, Math.floor(num(sv.shards, 0))));
    itemRows(sv.items, sv.eq, src.defs).forEach((r) => add('Gear', r.slot.charAt(0).toUpperCase() + r.slot.slice(1), r.text));
    add('Run', 'Kills', Math.max(0, Math.floor(num(run.kills, 0))));
    add('Run', 'Deepest zone', zoneName(run.deepest));
    add('Run', 'Portals', Math.max(0, Math.floor(num(run.portals, 0))));
    add('Run', 'Time', fmtTime(run.time));
    return rows;
  }

  return { RARITIES, ZONE_NAMES, clean, fmtTime, fmtMult, rarityName, zoneName, fireText, abilityRows, lockHint, pickerList, itemRows, tierOf, statTable, compareRows, fmtDelta, bossLuck, STAT_DEFS, weaponRows, passiveRows, statusRows, panelRows, className };
}));
