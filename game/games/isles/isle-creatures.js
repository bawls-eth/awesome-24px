// Isle creatures (BIOME-ARCH-PLAN slice B9): the pure glue between the isles page and the shared creature modules.
// Maps the jungle pack's spawn-group ids to MMCreatures species, picks each species' attack shape / reach / wind-up for the telegraph,
// tests whether the hero stands inside an attack shape, rolls a seeded wild level, and picks food from the pouch.
// No DOM, no storage, no network, no unseeded randomness. UMD: browser global IsleCreatures, or require().
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../../shared/rng.js'), require('../../shared/mm-creatures.js'), require('../../shared/mm-biome-packs.js'));
  else root.IsleCreatures = factory(root.MMRng, root.MMCreatures, root.MMBiomePacks);
}(typeof self !== 'undefined' ? self : this, function (MMRng, MMCreatures, MMBiomePacks) {
  'use strict';
  const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);

  // X1: the species canon lives in MMBiomePacks.CANON / canon(id). This table is only the fallback when that module is missing
  // (an old cached page); it stays exported. pack placeholder id -> the MMCreatures species it plays as. The spawn id is kept on the creature.
  const ALIAS = { parrotlet: 'chompbill', shellback: 'canopy_glider', raptor_jr: 'fernraptor', raptor: 'fernraptor', stegolith: 'stegolith' };
  // a herd that plays as a bigger species in every Nth spawn group (seed-stable: decided by the group index only)
  const GROUP_ALIAS = { boarhog: { kind: 'tusktop', every: 3 } };
  // body plan for each jungle species (MMCreatureDraw archetypes)
  const ARCH = { fernraptor: 'biped', tusktop: 'quadruped', stegolith: 'giant', chompbill: 'winged', canopy_glider: 'winged',
    glimmerfrog: 'blob', vinecoil: 'serpent', fernjaw_tyrant: 'giant' };
  // attack pattern -> telegraph shape. A pounce / charge is a line, a stomp / slam a ring, a sweep / bite a cone.
  const SHAPE = { pounce: 'line', charge: 'line', dash: 'line', lunge: 'line', leap_slam: 'ring', stomp: 'ring', slam: 'ring', bump: 'ring',
    pinch: 'ring', ring_spit: 'ring', whirl: 'ring', titan_quake: 'ring', tail_sweep: 'cone', swoop: 'cone', tyrant_bite: 'cone', bite: 'cone',
    frost_breath: 'cone', hydra_heads: 'cone', bolt: 'line' };
  const REACH = { S: 46, M: 60, L: 92, XL: 120 };   // px past the body edge an attack covers
  const CONE_HALF = 0.6;                            // radians each side of the facing
  const LINE_HALF = 16;                             // px half width of a line attack
  const STARTER_POUCH = { jungle_berry: 12, raw_meat: 12, bug: 8 }; // free play: every visit starts with a full pouch

  const canonOf = (sp) => (MMBiomePacks && typeof MMBiomePacks.canon === 'function' ? MMBiomePacks.canon(sp) : null);
  // kindOf(sp, gi): the MMCreatures species a spawn id plays as. MMBiomePacks.canon() first; then (fallback only) the local tables.
  function kindOf(sp, gi) {
    if (typeof sp !== 'string') return null;
    const k = canonOf(sp);
    if (k && MMCreatures && MMCreatures.get(k)) return k;
    if (has(GROUP_ALIAS, sp)) { const ga = GROUP_ALIAS[sp]; if (typeof gi === 'number' && gi >= 0 && gi % ga.every === 0) return ga.kind; }
    if (has(ALIAS, sp)) return ALIAS[sp];
    return MMCreatures && MMCreatures.get(sp) ? sp : null;
  }
  const shapeOf = (pattern) => (typeof pattern === 'string' && has(SHAPE, pattern) ? SHAPE[pattern] : 'ring');
  const big = (size) => size === 'L' || size === 'XL';

  // attackOf(def, size) -> {shape, windup, reach, cd, big}. Untyped (plain pack) creatures bump with a short ring.
  function attackOf(def, size) {
    const sz = has(REACH, size) ? size : 'S';
    const a = def && def.attack ? def.attack : null;
    const shape = a ? shapeOf(a.pattern) : 'ring';
    const info = MMCreatures && MMCreatures.sizeInfo(sz);
    let windup = a ? a.windup : (info ? info.windup : 0.3);
    if (big(sz)) windup = Math.max(windup, MMCreatures ? MMCreatures.BIG_MIN_WINDUP : 0.4);
    const reach = shape === 'ring' && !a ? Math.round(REACH[sz] * 0.5) : REACH[sz];
    return { shape: shape, windup: windup, reach: reach, cd: big(sz) ? 1.6 : 0.9, big: big(sz), pattern: a ? a.pattern : 'bump' };
  }

  // Is a point (hero centre, radius r) inside an attack launched from (ox,oy) facing `ang`? rad = the attacker's body radius.
  function inShape(shape, ox, oy, ang, rad, reach, px, py, r) {
    const dx = px - ox, dy = py - oy, d = Math.hypot(dx, dy);
    const far = rad + reach + r;
    if (shape === 'ring') return d <= far;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const along = dx * ca + dy * sa, side = -dx * sa + dy * ca;
    if (shape === 'line') return along >= -rad && along <= far && Math.abs(side) <= LINE_HALF + r;
    if (d > far) return false;
    if (d <= rad + r) return true;
    return Math.abs(Math.atan2(side, along)) <= CONE_HALF;
  }

  // seeded wild level inside the species band
  function levelFor(def, seed, wid) {
    if (!def || !def.lv) return 1;
    const r = MMRng.create('isles|lv|' + seed + '|' + wid).next();
    return def.lv[0] + Math.floor(r * (def.lv[1] - def.lv[0] + 1));
  }
  // foodFor(def, pouch, inv, reserve) -> {id, have, from, kept}: the most-liked diet item the pouch holds; IF1: else a diet item from the
  // pack (`inv`) above its `reserve` (what a locked travel recipe still needs); else the favourite (have:false; `kept` names a pack food
  // held back for a recipe). Without inv it is the old pouch-only pick (from 'pouch' or '').
  function foodFor(def, pouch, inv, reserve) {
    if (!def || !def.diet || !def.diet.length) return null;
    const p = pouch || {};
    for (let i = 0; i < def.diet.length; i++) if ((p[def.diet[i]] | 0) > 0) return { id: def.diet[i], have: true, from: 'pouch', kept: '' };
    let kept = '';
    if (inv && typeof inv === 'object') for (let i = 0; i < def.diet.length; i++) {
      const k = def.diet[i], n = has(inv, k) ? inv[k] | 0 : 0;
      if (n <= 0) continue;
      if (n > (reserve && has(reserve, k) ? reserve[k] | 0 : 0)) return { id: k, have: true, from: 'inv', kept: '' };
      if (!kept) kept = k;
    }
    return { id: kept || def.diet[0], have: false, from: '', kept: kept };
  }
  const foodName = (id) => String(id || '').replace(/_/g, ' ');

  // X1 rare spawns: rareSpot(world, pack, seed, walkable(tx,ty)) -> {creature, zone, x, y} or null. One rare per island (the pack's
  // first `rare` entry), placed on a seeded walkable tile of its zone at least 20 tiles from the spawn point. Pure and seed-stable:
  // the candidate tiles are scanned in grid order and one is picked with MMRng('isles|rare|<pack>|<seed>').
  function rareSpot(world, pack, seed, walkable) {
    if (!world || !pack || !pack.rare || typeof walkable !== 'function') return null;
    const ids = Object.keys(pack.rare).sort();
    if (!ids.length) return null;
    const id = ids[0], zone = pack.rare[id] && pack.rare[id].zone;
    if (!(zone >= 0)) return null;
    const W = world.w, H = world.h, sp = world.spawnPoint || { x: -999, y: -999 };
    let n = 0;
    const ok = (x, y) => world.zone[y * W + x] === zone && Math.hypot(x - sp.x, y - sp.y) >= 20 && walkable(x, y);
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) if (ok(x, y)) n++;
    if (!n) return null;
    let pick = Math.floor(MMRng.create('isles|rare|' + pack.id + '|' + seed).next() * n);
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) if (ok(x, y) && pick-- === 0) return { creature: id, zone: zone, x: x, y: y };
    return null;
  }

  return Object.freeze({ ALIAS: ALIAS, GROUP_ALIAS: GROUP_ALIAS, ARCH: ARCH, SHAPE: SHAPE, REACH: REACH, CONE_HALF: CONE_HALF, LINE_HALF: LINE_HALF,
    STARTER_POUCH: STARTER_POUCH, kindOf: kindOf, shapeOf: shapeOf, attackOf: attackOf, inShape: inShape, levelFor: levelFor, foodFor: foodFor, foodName: foodName, big: big,
    rareSpot: rareSpot, canonOf: canonOf });
}));
