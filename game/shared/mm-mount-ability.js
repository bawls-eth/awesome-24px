// MMMountAbility (slice XD1, NEXT-SLICES-3): one active ability per mount, for the 12 MMCreatures ride.ability values. Pure data +
// functions: no DOM, no timers, no network, no random source (nothing here is random: the same state, input and dt always give the same
// result). UMD: browser global MMMountAbility, or require().
//
// def(id) -> the frozen ability: { id, name, kind, cd (s, 3..12), dur (s), windup (s), cost: 0, ...effect numbers }.
// init(id) -> a frozen state { a, ph: 'ready'|'wind'|'active'|'cool', cd, t, w, breath, uses, ev: [] } (null for an unknown id).
// step(state, input, dt) -> the next frozen state. input = { press, under } (press = the ability button this step; under = the rider
//   is in deep water, for `dive`). dt is clamped to [0, 0.25] s. A press only fires from 'ready': no cost, never skips a cooldown.
//   state.ev lists what happened this step: 'start' (the effect fires; call apply()), 'end', 'ready'.
// apply(state | id, ctx) -> the one-shot effect of a firing, as plain numbers for the page to carry out:
//   { move: {dx, dy} | null (tiles), stun: [{id, s}], knock: [{id, dx, dy}] (tiles), untargetable (s), dmg: 0 }.
//   ctx = { x, y (rider tile), face: {x, y}, creatures: [{ id, x, y (tiles), size, tame, boss }], solidAt(tx, ty), terrainAt(tx, ty) }.
//   Abilities never deal damage, never hit tames / party / bosses, never touch items, and never hurt the rider; every list is capped.
// mods(state) -> what holds while the ability is active, every frame: { speedMul, pass: [terrain], noSlow: [terrain], noBurn, warmR,
//   breath, platform, untargetable }.
// KILL_FLAG = 'ability': ?ability=0 turns the abilities off (enabled(search) reads it); riding then works as it did before.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMMountAbility = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const own = Object.prototype.hasOwnProperty;
  const KILL_FLAG = 'ability';
  const MAX_TARGETS = 8, MAX_KNOCK = 3, MAX_MOVE = 6, DT_MAX = 0.25, MAX_USES = 99999;
  const SMALL = ['S'], SMALL_MED = ['S', 'M'];

  // kind: speed (a timed speed boost), dash (a line move + knock-back), ring (a ring stun), aura (a timed area buff for the party),
  // swim (cross deep water on a breath meter), terrain (cross terrain freely for a while), leap_to (jump to a target), hop (jump one solid
  // tile), platform (others can stand on you), burrow (a short untargetable dash). Distances are in tiles.
  const D = (o) => Object.assign({ windup: 0, cost: 0, dmg: 0 }, o);
  const DEFS = {
    sprint: D({ name: 'Sprint', kind: 'speed', cd: 8, dur: 3, speedMul: 1.4, desc: 'Run 40% faster for 3 seconds.' }),
    charge: D({ name: 'Charge', kind: 'dash', cd: 6, dur: 0.4, windup: 0.5, dist: 5, width: 1, knock: 2, sizes: ['S', 'M', 'L'], desc: 'After a short windup line, dash ahead and push small foes aside.' }),
    stomp: D({ name: 'Stomp', kind: 'ring', cd: 8, dur: 0.3, r: 3, stun: 1.5, sizes: SMALL, desc: 'Stun small creatures around you.' }),
    roar: D({ name: 'Roar', kind: 'ring', cd: 10, dur: 0.4, r: 5, stun: 2, sizes: SMALL_MED, desc: 'Stun small and medium creatures in a wide ring.' }),
    warm_aura: D({ name: 'Warm aura', kind: 'aura', cd: 12, dur: 8, warmR: 3, desc: 'No warmth drain within 3 tiles for you and your party.' }),
    pounce: D({ name: 'Pounce', kind: 'leap_to', cd: 5, dur: 0.3, range: 4, desc: 'Leap to the nearest creature ahead.' }),
    dive: D({ name: 'Dive', kind: 'swim', cd: 6, dur: 10, breath: 8, breathRefill: 2, pass: ['deep_water', 'abyss'], desc: 'Cross deep water while your breath lasts. Breath refills at the surface.' }),
    skim: D({ name: 'Skim', kind: 'terrain', cd: 7, dur: 5, noSlow: ['kelp_bed', 'coral_shallows'], desc: 'Cross kelp beds and coral shallows at full speed.' }),
    float_dock: D({ name: 'Float dock', kind: 'platform', cd: 12, dur: 10, desc: 'Your party can stand on its shell while it swims.' }),
    leap: D({ name: 'Leap', kind: 'hop', cd: 3, dur: 0.3, over: ['crater_rim'], hop: 2, desc: 'Jump over one crater rim tile.' }),
    hover: D({ name: 'Hover', kind: 'terrain', cd: 9, dur: 4, pass: ['dust_shallows', 'lava_vent'], noBurn: true, desc: 'Float over dust shallows and lava vents without a burn.' }),
    burrow: D({ name: 'Burrow', kind: 'burrow', cd: 7, dur: 0.8, dist: 3, untargetable: 0.8, desc: 'Dig a short tunnel ahead; nothing can target you on the way.' }),
  };
  Object.keys(DEFS).forEach((k) => { DEFS[k].id = k; Object.keys(DEFS[k]).forEach((f) => { if (Array.isArray(DEFS[k][f])) Object.freeze(DEFS[k][f]); }); Object.freeze(DEFS[k]); });
  Object.freeze(DEFS);
  const IDS = Object.freeze(Object.keys(DEFS));
  const def = (id) => (typeof id === 'string' && own.call(DEFS, id) ? DEFS[id] : null);

  const num = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
  const r4 = (v) => Math.round(v * 10000) / 10000;
  function mk(a, ph, cd, t, w, breath, uses, ev) {
    return Object.freeze({ a: a, ph: ph, cd: r4(cd), t: r4(t), w: r4(w), breath: r4(breath), uses: uses, ev: Object.freeze(ev || []) });
  }
  function init(id) { const d = def(id); return d ? mk(d.id, 'ready', 0, 0, 0, d.breath || 0, 0) : null; }
  // a saved / foreign state -> a valid state for its ability (null when the ability is unknown)
  function clean(s) {
    if (!s || typeof s !== 'object') return null;
    const d = def(s.a); if (!d) return null;
    const ph = ['ready', 'wind', 'active', 'cool'].indexOf(s.ph) >= 0 ? s.ph : 'ready';
    return mk(d.id, ph, ph === 'cool' ? num(s.cd, 0, d.cd, d.cd) : 0, ph === 'active' ? num(s.t, 0, d.dur, 0) : 0, ph === 'wind' ? num(s.w, 0, d.windup, 0) : 0,
      num(s.breath, 0, d.breath || 0, d.breath || 0), Number.isInteger(s.uses) ? Math.max(0, Math.min(MAX_USES, s.uses)) : 0);
  }

  function step(state, input, dt) {
    const s = clean(state); if (!s) return null;
    const d = DEFS[s.a], inp = input && typeof input === 'object' ? input : {};
    dt = num(dt, 0, DT_MAX, 0);
    let ph = s.ph, cd = s.cd, t = s.t, w = s.w, breath = s.breath, uses = s.uses;
    const ev = [];
    const under = d.kind === 'swim' && inp.under === true;
    if (ph === 'wind') { w -= dt; if (w <= 0) { ph = 'active'; w = 0; t = d.dur; ev.push('start'); } }
    else if (ph === 'active') {
      t -= dt;
      if (under) breath = Math.max(0, breath - dt);
      if (t <= 0 || (d.kind === 'swim' && breath <= 0)) { ph = 'cool'; t = 0; cd = d.cd; ev.push('end'); }
    } else if (ph === 'cool') { cd -= dt; if (cd <= 0) { ph = 'ready'; cd = 0; ev.push('ready'); } }
    if (d.kind === 'swim' && !under) breath = Math.min(d.breath, breath + d.breathRefill * dt); // refills at the surface only
    if (inp.press === true && ph === 'ready') {
      uses = Math.min(MAX_USES, uses + 1);
      if (d.windup > 0) { ph = 'wind'; w = d.windup; } else { ph = 'active'; t = d.dur; ev.push('start'); }
    }
    return mk(d.id, ph, cd, t, w, breath, uses, ev);
  }

  function unit(f) { const x = f && typeof f.x === 'number' && isFinite(f.x) ? f.x : 0, y = f && typeof f.y === 'number' && isFinite(f.y) ? f.y : 0; const l = Math.hypot(x, y); return l > 0 ? { x: x / l, y: y / l } : { x: 0, y: 1 }; }
  // who an ability may affect: a live wild creature that is not a tame, a party member, or a boss, in the def's sizes
  const fair = (c, sizes) => c && typeof c === 'object' && typeof c.x === 'number' && typeof c.y === 'number' && isFinite(c.x) && isFinite(c.y) &&
    c.tame !== true && c.party !== true && c.boss !== true && (!sizes || sizes.indexOf(c.size) >= 0);
  const byDist = (cx, cy) => (a, b) => (Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy)) || (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);
  const capMove = (dx, dy) => { const l = Math.hypot(dx, dy); const k = l > MAX_MOVE ? MAX_MOVE / l : 1; return { dx: r4(dx * k), dy: r4(dy * k) }; };

  function apply(stateOrId, ctx) {
    const d = typeof stateOrId === 'string' ? def(stateOrId) : (stateOrId && def(stateOrId.a));
    const out = { move: null, stun: [], knock: [], untargetable: 0, dmg: 0 };
    if (!d) return Object.freeze(out);
    const c = ctx && typeof ctx === 'object' ? ctx : {};
    const x = num(c.x, -1e6, 1e6, 0), y = num(c.y, -1e6, 1e6, 0), f = unit(c.face);
    const list = Array.isArray(c.creatures) ? c.creatures.slice(0, 256) : [];
    const solidAt = typeof c.solidAt === 'function' ? c.solidAt : () => false, terrainAt = typeof c.terrainAt === 'function' ? c.terrainAt : () => '';
    if (d.kind === 'ring') {
      list.filter((k) => fair(k, d.sizes) && Math.hypot(k.x - x, k.y - y) <= d.r).sort(byDist(x, y)).slice(0, MAX_TARGETS).forEach((k) => out.stun.push({ id: k.id, s: d.stun }));
    } else if (d.kind === 'dash') {
      out.move = capMove(f.x * d.dist, f.y * d.dist);
      list.filter((k) => {
        if (!fair(k, d.sizes)) return false;
        const rx = k.x - x, ry = k.y - y, along = rx * f.x + ry * f.y, side = Math.abs(rx * -f.y + ry * f.x);
        return along >= 0 && along <= d.dist && side <= d.width;
      }).sort(byDist(x, y)).slice(0, MAX_TARGETS).forEach((k) => {
        const side = (k.x - x) * -f.y + (k.y - y) * f.x, sx = side >= 0 ? 1 : -1, kn = Math.min(MAX_KNOCK, d.knock);
        out.knock.push({ id: k.id, dx: r4(-f.y * sx * kn), dy: r4(f.x * sx * kn) });
      });
    } else if (d.kind === 'leap_to') {
      const tg = list.filter((k) => fair(k, null) && Math.hypot(k.x - x, k.y - y) <= d.range && ((k.x - x) * f.x + (k.y - y) * f.y) > 0).sort(byDist(x, y))[0];
      if (tg) { const dx = tg.x - x, dy = tg.y - y, l = Math.hypot(dx, dy), k = Math.max(0, l - 1) / (l || 1); out.move = capMove(dx * k, dy * k); }
    } else if (d.kind === 'hop') {
      const sx = Math.round(f.x), sy = Math.round(f.y), ax = Math.round(x) + sx, ay = Math.round(y) + sy, bx = ax + sx, by = ay + sy;
      if ((sx || sy) && solidAt(ax, ay) && d.over.indexOf(terrainAt(ax, ay)) >= 0 && !solidAt(bx, by)) out.move = { dx: sx * d.hop, dy: sy * d.hop };
    } else if (d.kind === 'burrow') {
      out.move = capMove(f.x * d.dist, f.y * d.dist); out.untargetable = d.untargetable;
    }
    Object.freeze(out.stun); Object.freeze(out.knock); out.stun.forEach(Object.freeze); out.knock.forEach(Object.freeze); if (out.move) Object.freeze(out.move);
    return Object.freeze(out);
  }

  const NONE = Object.freeze({ speedMul: 1, pass: Object.freeze([]), noSlow: Object.freeze([]), noBurn: false, warmR: 0, breath: null, platform: false, untargetable: false });
  function mods(state) {
    const s = clean(state); if (!s) return NONE;
    const d = DEFS[s.a], on = s.ph === 'active';
    if (!on && d.kind !== 'swim') return NONE;
    return Object.freeze({
      speedMul: on && d.speedMul ? d.speedMul : 1, pass: on && d.pass ? d.pass : NONE.pass, noSlow: on && d.noSlow ? d.noSlow : NONE.noSlow,
      noBurn: on && d.noBurn === true, warmR: on && d.warmR ? d.warmR : 0, breath: d.kind === 'swim' ? Object.freeze({ left: s.breath, max: d.breath }) : null,
      platform: on && d.kind === 'platform', untargetable: on && d.kind === 'burrow',
    });
  }
  // 0..1 of the cooldown ring (1 = ready), for the page's button
  function ready(state) { const s = clean(state); if (!s) return 0; if (s.ph === 'ready') return 1; if (s.ph === 'cool') return r4(1 - s.cd / DEFS[s.a].cd); return 0; }
  // ?ability=0 (or a URLSearchParams / query string with it) -> false; anything else -> true
  function enabled(search) {
    let v = null;
    if (search && typeof search.get === 'function') v = search.get(KILL_FLAG);
    else if (typeof search === 'string') { const m = new RegExp('[?&]' + KILL_FLAG + '=([^&#]*)').exec(search.charAt(0) === '?' ? search : '?' + search); v = m ? m[1] : null; }
    return v !== '0';
  }

  return Object.freeze({ KILL_FLAG, IDS, DEFS, MAX_TARGETS, MAX_KNOCK, MAX_MOVE, DT_MAX, def, init, clean, step, apply, mods, ready, enabled });
}));
