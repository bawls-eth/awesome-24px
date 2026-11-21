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

  // Equipped items: items = realm save items [{n,id,r}], eq = {weapon:uid,...}, defs = id -> {name, slot}.
  function itemRows(items, eq, defs) {
    const out = [];
    if (!eq || typeof eq !== 'object' || !Array.isArray(items)) return out;
    ['weapon', 'charm', 'ring'].forEach((slot) => {
      const it = items.find((x) => x && x.n === eq[slot]);
      const d = it && has(defs, it.id) ? defs[it.id] : null;
      out.push({ slot, name: d ? clean(d.name, 30) : '', rarity: d ? rarityName(it.r) : '', text: d ? clean(d.name, 30) + ' (' + rarityName(it.r) + ')' : 'empty' });
    });
    return out;
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
    add('Gear', 'Shards', Math.max(0, Math.floor(num(sv.shards, 0))));
    itemRows(sv.items, sv.eq, src.defs).forEach((r) => add('Gear', r.slot.charAt(0).toUpperCase() + r.slot.slice(1), r.text));
    add('Run', 'Kills', Math.max(0, Math.floor(num(run.kills, 0))));
    add('Run', 'Deepest zone', zoneName(run.deepest));
    add('Run', 'Portals', Math.max(0, Math.floor(num(run.portals, 0))));
    add('Run', 'Time', fmtTime(run.time));
    return rows;
  }

  return { RARITIES, ZONE_NAMES, clean, fmtTime, fmtMult, rarityName, zoneName, fireText, abilityRows, lockHint, pickerList, itemRows, weaponRows, passiveRows, statusRows, panelRows, className };
}));
