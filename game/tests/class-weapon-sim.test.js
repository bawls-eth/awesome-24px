// S15 time-to-kill sim (node). Run: node game/tests/class-weapon-sim.test.js [--table]
// For every class x {base + family styles} a deterministic fixed-step sim clears one zone-1 (Midlands) enemy group; the clear
// time must be within 0.7-1.4x of the ranger plain bolt. Uses MMWeapons / MMClasses / MMUnlocks only; no RNG.
// Model: 4 enemies (spiral/aimed/ring/aimed hp, x zone-1 multiplier 1.8 x tier 1.1) in a scatter of radius 48 px close in on the
// hero at 45 px/s from 320 px. The hero aims at the nearest enemy each volley. Bolts are resolved geometrically (hit radius =
// enemy r + 4): pierce, homing (70 deg cone, 260 px), chain, lob (area at the aim point), boomerang (re-hit on return),
// bounce (a missed bolt may ricochet back once), orbit (hits enemies within radius + r). Crit and onHit statuses use their
// expected value (1 + crit, 1 + chance * V). Splash styles (G4): the first hit of a bolt also damages the nearest `splash.max` other
// enemies within `splash.r` (MMSplash.frac falloff x splash.frac), once per bolt. Configs per style: common L0, common with the L19 unlock nodes, epic L0.
const W = require('../shared/mm-weapons.js');
const C = require('../shared/mm-classes.js');
const U = require('../shared/mm-unlocks.js');
const SP = require('../shared/mm-splash.js');
let n = 0, bad = 0;
function check(name, ok, extra) { n++; if (!ok) { bad++; console.log('FAIL ' + name + (extra ? ' ' + extra : '')); } }

const ZONE1_HP = 1.8 * 1.1; // MMZones ZONE_MUL.hp[1] * TIER_MUL.hp[1]
const GROUP = [{ hp: 16, r: 17 }, { hp: 8, r: 13 }, { hp: 11, r: 15 }, { hp: 8, r: 13 }]; // realm RM_ENEMIES spiral/aimed/ring/aimed
// Sim-local status values (independent of the MMWeapons index weights, so calibrating those cannot hide a bad style).
const V = { slowed: 0.3, weak: 0.15, dazed: 0.15, armorBroken: 0.25, curse: 0.2, bleed: 0.3, rooted: 0.3, marked: 0.1 };
const DT = 1 / 60, SPEED_PX = 580, FIRE = 7.5;

function simulate(spec, level) {
  const prof = C.arenaProfile(spec.classId);
  let dmgMul = prof.dmg, rateMul = prof.rate, extra = 1;
  const statusMul = (oh) => (oh && oh.status && V[oh.status] ? 1 + oh.chance * V[oh.status] : 1);
  if (level) {
    U.forLevel(spec.classId, level).forEach((nd) => nd.mods.forEach((m) => {
      if (m.op === 'mul' && m.stat === 'dmg') dmgMul *= m.v;
      if (m.op === 'mul' && m.stat === 'rate') rateMul *= m.v;
      if (m.op === 'onHit') extra *= (statusMul(m) - 1) * 0.5 + 1; // node statuses: half weight (they land mid-fight)
    }));
  }
  const en = GROUP.map((g, i) => {
    const a = i * Math.PI / 2 + 0.4, rad = [48, 30, 48, 20][i]; // scattered inside MMZones SPREAD_PX (48)
    return { x: 320 + rad * Math.cos(a), y: rad * Math.sin(a), hp: Math.ceil(g.hp * ZONE1_HP), r: g.r + 4, alive: true, side: i % 2 ? 1 : -1 };
  });
  const perBolt = dmgMul * spec.dmg * (1 + spec.crit) * statusMul(spec.onHit) * extra;
  const alive = () => en.filter((e) => e.alive);
  const hit = (e, d) => { e.hp -= d; if (e.hp <= 0) e.alive = false; };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const origin = (e) => Math.hypot(e.x, e.y);
  function fireVolley() {
    const tgt = alive().sort((a, b) => origin(a) - origin(b))[0];
    if (!tgt) return;
    const aim = Math.atan2(tgt.y, tgt.x), range = spec.spd * SPEED_PX * spec.life, cnt = spec.count;
    for (let i = 0; i < cnt; i++) {
      const a = aim + (cnt > 1 ? (i / (cnt - 1) - 0.5) * spec.spread : 0);
      const dx = Math.cos(a), dy = Math.sin(a);
      if (spec.lob.radius > 0) { // lands at the aim point (capped at maxRange), area damage
        const d = Math.min(origin(tgt), spec.lob.maxRange), px = dx * d, py = dy * d;
        alive().forEach((e) => { if (Math.hypot(e.x - px, e.y - py) <= spec.lob.radius + e.r) hit(e, perBolt); });
        continue;
      }
      const passes = spec.boomerang ? 2 : 1;
      const done = new Set();
      for (let p = 0; p < passes; p++) {
        const list = alive().map((e) => ({ e, t: e.x * dx + e.y * dy, off: Math.abs(e.y * dx - e.x * dy) }))
          .filter((o) => o.t > 0 && o.t <= range && o.off <= o.e.r + spec.size * 2).sort((x, y) => x.t - y.t);
        let hits = list.slice(0, 1 + spec.pierce);
        if (!hits.length && spec.homing > 0) { // homing: turns onto the nearest enemy in the 70 degree cone within 260 px
          const near = alive().filter((e) => origin(e) <= 260 && Math.abs(Math.atan2(Math.sin(Math.atan2(e.y, e.x) - a), Math.cos(Math.atan2(e.y, e.x) - a))) <= 1.22).sort((x, y) => origin(x) - origin(y))[0];
          if (near) hits = [{ e: near }];
        }
        if (!hits.length && spec.bounce > 0 && p === 0 && range > origin(tgt)) { // a miss ricochets back once into the group
          const back = alive().sort((x, y) => origin(x) - origin(y))[0];
          if (back) hits = [{ e: back }];
        }
        hits.forEach((o, hi) => {
          if (done.has(o.e) && p === 0) return;
          done.add(o.e);
          hit(o.e, perBolt * (p ? 0.85 : 1)); // the return pass connects 85% (targets drift off the line)
          if (spec.splash && spec.splash.r > 0 && hi === 0 && p === 0) { // splash: once per bolt, never the primary
            const others = alive().filter((e) => e !== o.e).map((e) => ({ e, d: Math.max(0, dist(e, o.e) - e.r) })).filter((q) => q.d <= spec.splash.r).sort((x, y) => x.d - y.d).slice(0, spec.splash.max);
            others.forEach((q) => hit(q.e, perBolt * spec.splash.frac * SP.frac(q.d, spec.splash)));
          }
          let from = o.e, f = 1;
          for (let c = 0; c < spec.chain.n; c++) {
            f *= spec.chain.falloff;
            const nx = alive().filter((e) => e !== from && !done.has(e) && dist(e, from) <= spec.chain.range).sort((x, y) => dist(x, from) - dist(y, from))[0];
            if (!nx) break;
            done.add(nx); hit(nx, perBolt * f * (p ? 0.85 : 1)); from = nx;
          }
        });
        if (p === 0) done.clear(); // the return pass may hit each enemy once more
      }
    }
  }
  const interval = 1 / (FIRE * rateMul * spec.rate);
  const orbitDps = spec.orbit.n > 0 ? spec.orbit.n * spec.orbit.dmg * dmgMul * (1 + spec.crit) / spec.orbit.rehit : 0;
  let t = 0, next = 0; const queue = [];
  while (alive().length && t < 60) {
    if (t >= next) { for (let b = 0; b < spec.burst.n; b++) queue.push(t + b * spec.burst.gap); next += interval; }
    while (queue.length && queue[0] <= t) { queue.shift(); fireVolley(); }
    alive().forEach((e) => { // enemies close in until 40 px from the hero
      const d = origin(e);
      if (d > 40) { const side = e.side; e.x -= (e.x / d * 45 + side * e.y / d * 6) * DT; e.y -= (e.y / d * 45 - side * e.x / d * 6) * DT; } // spiral in: orbiter-style drift breaks the lines up
      if (orbitDps && d <= spec.orbit.radius + e.r) hit(e, orbitDps * DT);
    });
    t += DT;
  }
  return alive().length ? 60 : t;
}

const ranger = simulate(W.resolve('ranger', 'base', 0), 0);
const rangerL19 = simulate(W.resolve('ranger', 'base', 0), 19);
const classes = Object.keys(W.CLASS_FAMILY);
const table = [], outliers = [];
let count = 0;
classes.forEach((cls) => {
  W.stylesFor(cls).forEach((sid) => {
    [[0, 0, ranger], [0, 19, rangerL19], [3, 0, ranger]].forEach(([rar, lvl, ref]) => {
      const tt = simulate(W.resolve(cls, sid, rar), lvl), ratio = tt / ref;
      count++;
      if (!rar && !lvl) table.push(cls + ' ' + sid + ' ' + tt.toFixed(2) + 's ' + ratio.toFixed(2) + 'x');
      if (ratio < 0.7 || ratio > 1.4) outliers.push(cls + '/' + sid + ' r' + rar + ' L' + lvl + ' ' + ratio.toFixed(2) + 'x');
    });
  });
});
if (process.argv.includes('--table')) console.log(table.join('\n'));
check('ranger plain bolt clears a zone-1 group in a sane time', ranger > 0.5 && ranger < 20, String(ranger));
check('sim covers every class x style x 3 configs (' + count + ')', count >= (14 + 30) * 3, String(count));
check('every class x style within 0.7-1.4x of the ranger time (common L0, common L19, epic L0)', outliers.length === 0, outliers.join('; '));
check('no class times out (60 s)', classes.every((c) => simulate(W.resolve(c, 'base', 0), 0) < 60));
check('sim is deterministic', simulate(W.resolve('rogue', 'dagger_fan', 1), 9) === simulate(W.resolve('rogue', 'dagger_fan', 1), 9));
// G4 additions: splash styles are modelled and stay inside the group-clear band; single target stays near the base
const splashIds = ['bow_blast', 'wand_burst', 'staff_comet', 'pistol_flak'];
check('G4 splash styles are in the sim (a class of each family)', splashIds.every((id) => classes.some((c) => W.stylesFor(c).indexOf(id) >= 0)));
check('G4 splash styles group-clear 0.7-1.4x the ranger base', splashIds.every((id) => classes.filter((c) => W.stylesFor(c).indexOf(id) >= 0).every((c) => { const r = simulate(W.resolve(c, id, 0), 0) / ranger; return r >= 0.7 && r <= 1.4; })));
check('G4 splash helps against a group (splash model on beats off)', (() => { const sp = W.resolve('druid', 'staff_comet', 0), off = Object.assign({}, sp, { splash: { r: 0, frac: 0, inner: 0.35, edge: 0.5, max: 0 } }); return simulate(sp, 0) < simulate(off, 0); })());
// (the plan's >= 0.85x single-target target is G15's tuning job; here only a floor so a splash style is never a dead weapon on one enemy)
check('G4 single-target damage per second >= 0.6x the base', splashIds.every((id) => classes.filter((c) => W.stylesFor(c).indexOf(id) >= 0).every((c) => { const s = W.resolve(c, id, 0), b = W.resolve(c, 'base', 0); return (s.dmg * s.rate * s.count * s.burst.n * (1 + s.crit)) / (b.dmg * b.rate * b.count * (1 + b.crit)) >= 0.6; })));
console.log(bad ? bad + ' FAILED of ' + n : 'ALL PASSED (' + n + ')');
process.exitCode = bad ? 1 : 0;
