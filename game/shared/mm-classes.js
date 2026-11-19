// MMClasses: pure Mad Maze class data + ability effect descriptors (REALM-DESIGN.md section 4).
// No DOM, no globals, no game objects: cast() returns plain effect descriptors.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMClasses = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

  // life/foc: [L1, gain per level, cap]; st: POW,GRD,SWF,KNK,VIG,WIT at L1; statCap in the same order (doc 4.2).
  const mk = (id, name, species, life, foc, st, statCap, ab, unlock) => ({
    id, name, species,
    base: { life: life[0], foc: foc[0], pow: st[0], grd: st[1], swf: st[2], knk: st[3], vig: st[4], wit: st[5] },
    gain: { life: life[1], foc: foc[1] },
    cap: { life: life[2], foc: foc[2], pow: statCap[0], grd: statCap[1], swf: statCap[2], knk: statCap[3], vig: statCap[4], wit: statCap[5] },
    ability: ab, unlock,
  });
  const CLASSES = {
    ranger: mk('ranger', 'Thicket Ranger', 'coolcats', [120, 18, 560], [100, 7, 260], [10, 0, 12, 12, 8, 8], [45, 25, 50, 50, 40, 40],
      { id: 'yarnSnare', name: 'Yarn Snare', cost: 40, cd: 1, range: 7, radius: 2.5, rootSec: 2, dmgTakenMult: 1.15 }, { from: null, level: 0 }),
    frostcaller: mk('frostcaller', 'Frostcaller', 'pudgypenguins', [100, 15, 480], [120, 9, 300], [14, 0, 8, 10, 6, 12], [50, 25, 45, 45, 35, 50],
      { id: 'shards', name: 'Blizzard Burst', cost: 60, cd: 1, range: 8, shards: 12, dmgMin: 30, dmgMax: 45, slow: 0.3, slowSec: 2 }, { from: null, level: 0 }),
    herald: mk('herald', 'Good-Dog Herald', 'doge', [130, 18, 560], [110, 8, 280], [8, 2, 10, 8, 12, 12], [40, 30, 45, 40, 50, 50],
      { id: 'heal', name: 'Good Boy Aura', cost: 55, cd: 1.5, radius: 5, healBase: 60, healPerWit: 2, grdBonus: 10, grdSec: 4 }, { from: null, level: 0 }),
    punk: mk('punk', 'Riff Punk', 'punks', [140, 22, 640], [90, 6, 220], [12, 6, 10, 8, 10, 6], [45, 40, 45, 40, 45, 35],
      { id: 'moshShield', name: 'Mosh Shield', cost: 50, cd: 1, shieldSec: 2, arcDeg: 120, stunRadius: 3, stunSec: 1.5 }, { from: 'ranger', level: 5 }),
    bruiser: mk('bruiser', 'Jungle Bruiser', 'apes', [140, 22, 640], [90, 6, 220], [14, 4, 8, 8, 10, 6], [50, 35, 40, 40, 45, 35],
      { id: 'groundPound', name: 'Ground Pound', cost: 50, cd: 1, radius: 3, dmgBase: 90, dmgPerPow: 2, knockback: 2, unhittableSec: 0.3 }, { from: 'herald', level: 5 }),
    graveTender: mk('graveTender', 'Grave Tender', 'zombies', [110, 17, 520], [110, 8, 280], [14, 2, 6, 9, 12, 10], [50, 30, 35, 45, 50, 45],
      { id: 'siphon', name: 'Grave Siphon', cost: 65, cd: 1, range: 8, radius: 3.5, dmgBase: 70, dmgPerPow: 2, healFrac: 0.5, healCap: 120 }, { from: 'frostcaller', level: 10 }),
    trickster: mk('trickster', 'Saucer Trickster', 'aliens', [110, 16, 500], [100, 7, 260], [10, 0, 14, 12, 8, 10], [45, 25, 50, 50, 40, 45],
      { id: 'blink', name: 'Blink Decoy', cost: 45, cd: 1, dist: 4, tries: 100, decoySec: 3 }, { from: '*', level: 10 }),
    shadowPaw: mk('shadowPaw', 'Shadow Paw', 'coolcats_ninjas', [110, 16, 500], [100, 7, 260], [12, 0, 14, 14, 6, 8], [50, 25, 50, 50, 35, 40],
      { id: 'smoke', name: 'Smoke Step', cost: 55, cd: 1, invisSec: 2.5, volleyMult: 1.5 }, { from: 'trickster', level: 20 }),
  };
  const START = ['ranger', 'frostcaller', 'herald'];

  // Focus regen per second: 0.5 + 0.12 * WIT (doc section 3).
  function focusRegen(wit) { return 0.5 + 0.12 * Math.max(0, num(wit, 0)); }
  function maxFocus(klass, level, bonus) {
    const c = CLASSES[klass]; if (!c) return 0;
    const lv = Math.max(1, Math.floor(num(level, 1)));
    return Math.min(c.cap.foc, c.base.foc + c.gain.foc * (lv - 1) + num(bonus, 0));
  }
  // Ability cost with ability-gear tier (-3 FOC per tier, doc 5.1), never below 1.
  function abilityCost(klass, tier) {
    const c = CLASSES[klass]; if (!c) return 0;
    return Math.max(1, c.ability.cost - 3 * Math.max(0, num(tier, 0)));
  }
  function regenFocus(focus, max, wit, dt) {
    return Math.max(0, Math.min(num(max, 0), num(focus, 0) + focusRegen(wit) * Math.max(0, num(dt, 0))));
  }
  // Pay: returns {ok, focus}; focus never goes negative, unchanged on failure.
  function spend(focus, cost) {
    const f = Math.max(0, num(focus, 0)), c = Math.max(0, num(cost, 0));
    return f >= c ? { ok: true, focus: f - c } : { ok: false, focus: f };
  }

  // Unlocks (doc 4.1): Ranger L5 -> Punk, Herald L5 -> Bruiser, Frostcaller L10 -> Grave Tender,
  // any class L10 -> Trickster, Trickster L20 -> Shadow Paw. Returns ids unlocked by `klass` at `level`.
  function unlocks(klass, level) {
    const lv = num(level, 0), out = [];
    if (!CLASSES[klass]) return out;
    Object.keys(CLASSES).forEach((id) => {
      const u = CLASSES[id].unlock;
      if (!u.from || id === klass) return;
      if ((u.from === '*' || u.from === klass) && lv >= u.level) out.push(id);
    });
    return out;
  }
  function isStart(klass) { return START.indexOf(klass) >= 0; }

  // Bolt originating at (fromX,fromY) hits caster at (cx,cy) facing facingRad: blocked if the origin
  // lies within the frontal arc (arcDeg total, default 120).
  function shieldBlocks(cx, cy, facingRad, fromX, fromY, arcDeg) {
    const dx = fromX - cx, dy = fromY - cy;
    if (dx === 0 && dy === 0) return true;
    let d = Math.atan2(dy, dx) - facingRad;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    return Math.abs(d) <= (num(arcDeg, 120) / 2) * Math.PI / 180 + 1e-9;
  }

  const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  function toward(from, aim, maxD) {
    const d = dist(from, aim);
    if (d <= maxD || d === 0) return { x: aim.x, y: aim.y };
    return { x: from.x + (aim.x - from.x) / d * maxD, y: from.y + (aim.y - from.y) / d * maxD };
  }
  function pathClear(a, b, isWall) {
    const n = Math.max(1, Math.ceil(dist(a, b) * 2));
    for (let i = 1; i <= n; i++) {
      const x = a.x + (b.x - a.x) * i / n, y = a.y + (b.y - a.y) * i / n;
      if (isWall(Math.floor(x), Math.floor(y))) return false;
    }
    return true;
  }
  // Blink: up to 4 tiles toward aim; never ends in or passes through a wall. 100 random tries
  // (first try is the full distance along aim); if all fail, stay put.
  function blink(caster, world) {
    const isWall = (world && world.isWall) || (() => false);
    const rng = (world && world.rng) || Math.random;
    const D = CLASSES.trickster.ability.dist, tries = CLASSES.trickster.ability.tries;
    const from = { x: num(caster.x, 0), y: num(caster.y, 0) };
    const aim = caster.aim || { x: from.x + 1, y: from.y };
    const base = (aim.x === from.x && aim.y === from.y) ? 0 : Math.atan2(aim.y - from.y, aim.x - from.x);
    for (let i = 0; i < tries; i++) {
      let to;
      if (i === 0) to = toward(from, aim, D);
      else {
        const a = base + (rng() - 0.5) * Math.PI * (i < 50 ? 0.5 : 2);
        const r = rng() * D;
        to = { x: from.x + Math.cos(a) * r, y: from.y + Math.sin(a) * r };
      }
      if (!isWall(Math.floor(to.x), Math.floor(to.y)) && pathClear(from, to, isWall)) return { moved: true, from, to, tries: i + 1 };
    }
    return { moved: false, from, to: from, tries };
  }

  // cast(klass, abilityId, caster, world) -> { ok, reason?, cost, cd, focusAfter, effects: [...] }
  // caster: { x, y, aim:{x,y}, facing(rad), focus, pow, wit, tier }; world: { isWall, rng, hitCount }.
  function cast(klass, abilityId, caster, world) {
    const c = CLASSES[klass]; caster = caster || {}; world = world || {};
    if (!c || c.ability.id !== abilityId) return { ok: false, reason: 'unknown', cost: 0, effects: [] };
    const a = c.ability, cost = abilityCost(klass, caster.tier);
    const pay = spend(caster.focus, cost);
    if (!pay.ok) return { ok: false, reason: 'focus', cost, cd: 0, focusAfter: pay.focus, effects: [] };
    const pos = { x: num(caster.x, 0), y: num(caster.y, 0) };
    const aim = caster.aim || pos;
    const pow = num(caster.pow, 0), wit = num(caster.wit, 0);
    const res = { ok: true, cost, cd: a.cd, focusAfter: pay.focus, effects: [] };
    const fx = res.effects;
    switch (a.id) {
      case 'yarnSnare': {
        const at = toward(pos, aim, a.range);
        fx.push({ type: 'root', at, radius: a.radius, sec: a.rootSec },
          { type: 'vulnerable', at, radius: a.radius, sec: a.rootSec, dmgTakenMult: a.dmgTakenMult });
        break;
      }
      case 'shards': {
        const at = toward(pos, aim, a.range);
        fx.push({ type: 'ring', at, count: a.shards, dmgMin: a.dmgMin, dmgMax: a.dmgMax,
          dmgMult: 0.5 + Math.min(50, Math.max(0, pow)) / 40, slow: a.slow, slowSec: a.slowSec });
        break;
      }
      case 'heal':
        fx.push({ type: 'heal', at: pos, radius: a.radius, amount: a.healBase + a.healPerWit * wit, self: true },
          { type: 'buffGrd', at: pos, radius: a.radius, grd: a.grdBonus, sec: a.grdSec });
        break;
      case 'moshShield':
        fx.push({ type: 'shield', arcDeg: a.arcDeg, facing: num(caster.facing, 0), sec: a.shieldSec },
          { type: 'stunRing', at: pos, radius: a.stunRadius, sec: a.stunSec, delay: a.shieldSec });
        break;
      case 'groundPound':
        fx.push({ type: 'damage', at: pos, radius: a.radius, amount: a.dmgBase + a.dmgPerPow * pow },
          { type: 'knockback', at: pos, radius: a.radius, tiles: a.knockback },
          { type: 'unhittable', sec: a.unhittableSec });
        break;
      case 'siphon': {
        const at = toward(pos, aim, a.range);
        const dmg = a.dmgBase + a.dmgPerPow * pow;
        const n = Math.max(0, Math.floor(num(world.hitCount, 1)));
        fx.push({ type: 'damage', at, radius: a.radius, amount: dmg },
          { type: 'heal', target: 'self', amount: Math.min(a.healCap, a.healFrac * dmg * n), cap: a.healCap });
        break;
      }
      case 'blink': {
        const b = blink({ x: pos.x, y: pos.y, aim }, world);
        fx.push({ type: 'teleport', from: b.from, to: b.to, moved: b.moved },
          { type: 'decoy', at: b.from, sec: a.decoySec, aggro: 'all' });
        break;
      }
      case 'smoke':
        fx.push({ type: 'invisible', sec: a.invisSec, decoyAt: pos }, { type: 'nextVolley', mult: a.volleyMult });
        break;
    }
    return res;
  }
  // Siphon heal: 50% of damage dealt, capped at 120.
  function siphonHeal(damageDealt) { return Math.min(CLASSES.graveTender.ability.healCap, Math.max(0, num(damageDealt, 0)) * 0.5); }

  return { CLASSES, START, cast, blink, shieldBlocks, unlocks, isStart, focusRegen, maxFocus, abilityCost, regenFocus, spend, siphonHeal };
});
