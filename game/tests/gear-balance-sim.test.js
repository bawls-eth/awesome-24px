// G15 / GB gear balance sim (node, deterministic, no server). Run: node game/tests/gear-balance-sim.test.js
// Runs every GEAR-DROPS-BUILD-PLAN (g) target for all 14 classes, with the MMGearSets bonuses off and on, prints one table and fails on the FIRST
// gated row that misses (GB acceptance 2). Tuning is done only in MMGear.TIERS / MMGearDrops.TABLES / the MMGearAffix ranges, never here.
//
// Model (plan (g) "Sim"):
//  - Hero: realm.js _calcStats in world mode: dmg = (1 + MMGear.weaponBonus) x class profile x MMUnlocks mul x MMDifficulty.heroScale; rate = 7.5 x
//    profile x unlocks x (1 + swift); crit = keen (cap 0.5) + the style's crit; venom = MMGearAffix's own V (status chance at half weight); blast =
//    the realm `blast` splash { r 24 + blast, frac 0.30, max 3 } on styles without their own splash. Affixes: the MEAN of 1000 MMGearAffix.roll seeds.
//    Weapon item: `sparkwand` for the class bolt (amount 0.5); every hero is at the zone's level (z0 L3, z1 L8, z2 L14, z3 L20, never below the gate).
//  - Creatures: 6 per fight (RM_ENEMIES spiral/aimed/ring x2), hp = ceil(ceil(hp x MMZones.statMultipliers) x MMDifficulty.zoneScale(zone, mid, ttk)),
//    as realm-world spawnZ + scaleEnemy. They close in from 320 px like class-weapon-sim; bolts are resolved geometrically (count / spread / pierce /
//    splash / chain as class-weapon-sim) and land after their flight time (580 px/s x spd), so bolts already flying at a creature that dies are wasted.
//    After each kill the hero needs AIM_S to pick the next target (human retarget). Single-creature TTK = the median of the 6 kill-to-kill intervals.
//  - Zone mid tier = round(sum t x p) of the zone's MMGearDrops mob row.
//  - Z3 boss solo: hp = ceil(RM_BOSS_HP x z3 hpMul / BOSS.hp) (realm-world spawnBoss), one r 34 target, 3.2 s shielded (spawn 1.2 + 2 phase changes),
//    and the hero lands bolts BOSS_UPTIME of the fight (the rest is spent dodging the boss's spiral / ring patterns).
//  - Incoming: one z3 bolt = round(8 x dmgMul) with dmgMul = MMZones z3 dmgMul x zoneScale dmg, through _guarded (max(dmg - guard, 25%)).
//  - Drop pacing: the seeded godlands walk of shared-mm-gear-drops.test.js (3 boss sites, 1200 s cooldown, the real MMZones bag -> rollGear -> pityStep
//    pipeline). The gated rows draw each fight from the plan's T10 Common window (90-180 s); a report-only row per class uses its own simulated
//    T10 Common time. Kills to the first T12 are fixed by values shared-mm-gear-drops.test.js pins (z3 boss T12 5% +-0.3%, pity +0.5% per kill,
//    GEAR_CHANCE), so the first-T12 median sits near 1.55 h; more margin needs one of those pins changed (owner decision).
// The class-median rows (TTK, boss) are gated on the median of the 14 classes: the class profiles spread single-target DPS ~2x, wider than a band.
// AIM_S / ACCURACY / BOSS_DIST / BOSS_UPTIME are engagement-model constants, not tuning knobs: change them only with a plan update.
const W = require('../shared/mm-weapons.js');
const C = require('../shared/mm-classes.js');
const U = require('../shared/mm-unlocks.js');
const SP = require('../shared/mm-splash.js');
const G = require('../shared/mm-gear.js');
const A = require('../shared/mm-gear-affix.js');
const D = require('../shared/mm-gear-drops.js');
const S = require('../shared/mm-gear-sets.js');
const Z = require('../shared/mm-zones.js');
const DF = require('../shared/mm-difficulty.js');
const RNG = require('../shared/rng.js');

// ---- model constants (mirrors of realm.js / realm-world.js; the two behaviour constants are documented above) ----
const FIRE = 7.5, SPEED_PX = 580, HP_L1 = 100, HP_PER_LEVEL = 8, BOLT = 8, RM_BOSS_HP = 120;
const ENEMY = { spiral: { hp: 16, r: 17 }, aimed: { hp: 8, r: 13 }, ring: { hp: 11, r: 15 } };
const GROUP = ['spiral', 'aimed', 'ring', 'spiral', 'aimed', 'ring'];
const BOSS_R = 34, BOSS_SHIELD_S = 3.2;
const AIM_S = 0.7;         // seconds to find and swing onto the next creature after a kill
const ACCURACY = 0.5;      // share of the bolts aimed at a moving creature that land (no aim lead; creatures strafe and the hero dodges)
const BOSS_DIST = 150;     // px the hero fights a boss from (every bolt of a volley inside the boss radius + 4 + size x 2 lands)
const BOSS_UPTIME = 0.2;   // share of a z3 boss fight the hero is firing on target (the rest is spent dodging the spiral / ring patterns)
const V = { slowed: 0.3, weak: 0.15, dazed: 0.15, armorBroken: 0.25, curse: 0.2, bleed: 0.3, rooted: 0.3, marked: 0.1 }; // class-weapon-sim values
const ZONE_LEVEL = [3, 8, 14, 20];
const SEEDS = 1000;
const CLASSES = Object.keys(W.CLASS_FAMILY);
const T12_SIG = 'venom'; // worst case for power creep: the signature with the largest DPS weight (plan: void_oracle venom+)

// ---- hero ----
const affCache = new Map();
function meanAffixes(id, t, r, sig) { // mean weapon affix totals over 1000 seeds, with the Dread pair boost when `dread`
  const key = id + ':' + t + ':' + r + ':' + (sig || '');
  if (affCache.has(key)) return affCache.get(key);
  const acc = { off: {}, on: {}, pOff: 0, pOn: 0, maxOn: 0 };
  for (let a = 1; a <= SEEDS; a++) {
    const off = t >= 7 ? A.roll(id, 'weapon', t, r, a, sig) : [];
    const eq = { weapon: { id: id, r: r, t: t, a: a, sig: sig }, armor: { id: 'arm_sig_dread', r: 0, t: 12 } };
    const on = t >= 7 ? S.weaponAffixes(eq) : [];
    const so = A.sum(off), sn = A.sum(on);
    Object.keys(so).forEach((k) => { acc.off[k] = (acc.off[k] || 0) + so[k] / SEEDS; });
    Object.keys(sn).forEach((k) => { acc.on[k] = (acc.on[k] || 0) + sn[k] / SEEDS; });
    acc.pOff += A.value(off) / SEEDS; acc.pOn += A.value(on) / SEEDS; acc.maxOn = Math.max(acc.maxOn, A.value(on), A.value(off));
  }
  affCache.set(key, acc);
  return acc;
}
// hero(cls, t, r, level, sets) -> { dmg, rate, crit, statusMul, splash, hp, guard } (t 0 = no tiered weapon: the T0 Spark Wand at rarity r)
function hero(cls, t, r, level, sets, opt) {
  const o = opt || {};
  const prof = C.arenaProfile(cls), hs = DF.heroScale();
  let dmg = 1 + (t ? G.weaponBonus(0.5, t, r) : 0.5 * [1, 1.6, 2.4, 3.6][r]), rate = FIRE, uExtra = 1;
  if (o.noWeapon) dmg = 1;
  const um = U.forLevel(cls, level);
  let mD = 1, mR = 1;
  um.forEach((nd) => nd.mods.forEach((m) => {
    if (m.op === 'mul' && m.stat === 'dmg') mD *= m.v;
    if (m.op === 'mul' && m.stat === 'rate') mR *= m.v;
    if (m.op === 'onHit' && V[m.status]) uExtra *= (m.chance * V[m.status]) * 0.5 + 1;
  }));
  dmg *= prof.dmg * mD * hs.dmg; rate *= prof.rate * mR * hs.rate;
  const af = t >= 7 && !o.noWeapon ? meanAffixes('sparkwand', t, r, t === 12 ? T12_SIG : undefined) : null;
  const ax = af ? (sets ? af.on : af.off) : {};
  const g = (k) => ax[k] || 0;
  rate *= 1 + g('swift');
  return { dmg: dmg, rate: rate, crit: Math.min(0.5, g('keen')), statusMul: (1 + 0.5 * g('venom')) * uExtra, blast: g('blast'), pierce: Math.min(3, g('pierce')), power: af ? (sets ? af.pOn : af.pOff) : 1, maxPower: af ? af.maxOn : 1 };
}
function spec(cls, h) {
  const s = W.resolve(cls, 'base', 0);
  const sp = s.splash && s.splash.r > 0 ? s.splash : h.blast > 0 ? { r: 24 + h.blast, frac: 0.3, inner: 0.35, edge: 0.5, max: 3 } : null;
  return { s: s, splash: sp, crit: Math.min(0.5, s.crit + h.crit), pierce: s.pierce + h.pierce };
}

// ---- creature group fight ----
function zoneHp(type, zone) {
  const m = Z.statMultipliers(zone, zone), sc = DF.zoneScale(zone, NaN, { ttk: true });
  return Math.max(1, Math.ceil(Math.ceil(ENEMY[type].hp * m.hpMul) * sc.hp));
}
function groupFight(cls, h, zone) {
  const sp = spec(cls, h), s = sp.s, DT = 1 / 60;
  const statusMul = (s.onHit && s.onHit.status && V[s.onHit.status] ? 1 + s.onHit.chance * V[s.onHit.status] : 1) * h.statusMul;
  const perBolt = h.dmg * s.dmg * (1 + sp.crit) * statusMul;
  const en = GROUP.map((type, i) => {
    const a = i * Math.PI / 3 + 0.4, rad = [48, 30, 40, 20, 44, 26][i];
    return { x: 320 + rad * Math.cos(a), y: rad * Math.sin(a), hp: zoneHp(type, zone), r: ENEMY[type].r + 4, alive: true, side: i % 2 ? 1 : -1 };
  });
  const alive = () => en.filter((e) => e.alive);
  const origin = (e) => Math.hypot(e.x, e.y);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const pending = []; // [time, enemy, dmg]
  const kills = [];
  const queueHit = (t, e, d) => pending.push([t + origin(e) / (SPEED_PX * s.spd), e, d * ACCURACY]);
  function volley(t) {
    const tgt = alive().sort((a, b) => origin(a) - origin(b))[0];
    if (!tgt) return;
    const aim = Math.atan2(tgt.y, tgt.x), range = s.spd * SPEED_PX * s.life, cnt = s.count;
    for (let i = 0; i < cnt; i++) {
      const a = aim + (cnt > 1 ? (i / (cnt - 1) - 0.5) * s.spread : 0), dx = Math.cos(a), dy = Math.sin(a);
      const list = alive().map((e) => ({ e, t: e.x * dx + e.y * dy, off: Math.abs(e.y * dx - e.x * dy) }))
        .filter((q) => q.t > 0 && q.t <= range && q.off <= q.e.r + s.size * 2).sort((x, y) => x.t - y.t);
      list.slice(0, 1 + sp.pierce).forEach((q, hi) => {
        queueHit(t, q.e, perBolt);
        if (sp.splash && hi === 0) alive().filter((e) => e !== q.e).map((e) => ({ e, d: Math.max(0, dist(e, q.e) - e.r) })).filter((z) => z.d <= sp.splash.r)
          .sort((x, y) => x.d - y.d).slice(0, sp.splash.max).forEach((z) => queueHit(t, z.e, perBolt * sp.splash.frac * SP.frac(z.d, sp.splash)));
        let from = q.e, f = 1;
        for (let c = 0; c < s.chain.n; c++) {
          f *= s.chain.falloff;
          const nx = alive().filter((e) => e !== from && dist(e, from) <= s.chain.range).sort((x, y) => dist(x, from) - dist(y, from))[0];
          if (!nx) break; queueHit(t, nx, perBolt * f); from = nx;
        }
      });
    }
  }
  const interval = 1 / (h.rate * s.rate);
  let t = 0, next = 0, hold = 0;
  while (alive().length && t < 60) {
    if (t >= next && t >= hold) { for (let b = 0; b < s.burst.n; b++) volley(t + b * s.burst.gap); next = t + interval; }
    for (let i = pending.length - 1; i >= 0; i--) {
      const p = pending[i];
      if (p[0] > t) continue;
      pending.splice(i, 1);
      if (!p[1].alive) continue; // wasted: the creature is already dead
      p[1].hp -= p[2];
      if (p[1].hp <= 0) { p[1].alive = false; kills.push(t); hold = t + AIM_S; }
    }
    alive().forEach((e) => { const d = origin(e); if (d > 40) { e.x -= (e.x / d * 45 + e.side * e.y / d * 6) * DT; e.y -= (e.y / d * 45 - e.side * e.x / d * 6) * DT; } });
    t += DT;
  }
  const iv = kills.map((k, i) => k - (i ? kills[i - 1] : 0)).sort((a, b) => a - b);
  while (iv.length < GROUP.length) iv.push(60);
  return (iv[2] + iv[3]) / 2;
}
// single-target damage per second on a big target (all bolts of a volley that reach an r 34 boss at 200 px)
function singleDps(cls, h) {
  const sp = spec(cls, h), s = sp.s;
  const statusMul = (s.onHit && s.onHit.status && V[s.onHit.status] ? 1 + s.onHit.chance * V[s.onHit.status] : 1) * h.statusMul;
  let hits = 0;
  for (let i = 0; i < s.count; i++) { const a = s.count > 1 ? (i / (s.count - 1) - 0.5) * s.spread : 0; if (Math.abs(BOSS_DIST * Math.sin(a)) <= BOSS_R + 4 + s.size * 2) hits++; }
  return h.dmg * s.dmg * (1 + sp.crit) * statusMul * hits * s.burst.n * h.rate * s.rate;
}
const BOSS_HP = Math.ceil(RM_BOSS_HP * Z.statMultipliers(3, 3, true).hpMul / Z.TABLES.BOSS.hp);
const bossSolo = (cls, h) => BOSS_SHIELD_S + BOSS_HP / (singleDps(cls, h) * BOSS_UPTIME);

// ---- incoming (hits to die) ----
function hitsToDie(cls, level, t, sets) {
  const fam = G.armorFamilyOf(cls), id = G.armorId(fam, t), as = G.armorStats(id, t, 0);
  const eq = { weapon: { id: 'sparkwand', r: 0, t: t }, armor: { id: id, r: 0, t: t } };
  const sx = sets ? S.extras(eq) : { vital: 0, ward: 0 };
  const prof = C.arenaProfile(cls);
  let hp = (HP_L1 + HP_PER_LEVEL * (level - 1) + as.hp);
  const um = U.forLevel(cls, level); let mH = 1; um.forEach((n) => n.mods.forEach((m) => { if (m.op === 'mul' && m.stat === 'hp') mH *= m.v; }));
  hp = Math.max(1, Math.round(Math.max(1, Math.round(hp * prof.hp)) * mH));
  hp = Math.max(1, Math.round(hp * (1 + sx.vital)));
  const guard = as.guard + sx.ward;
  const dm = Z.statMultipliers(3, 3).dmgMul * DF.zoneScale(3, NaN, { ttk: true }).dmg;
  const raw = Math.round(BOLT * dm), took = Math.max(Math.ceil(raw * 0.25), raw - guard);
  return Math.ceil(hp / took);
}

// ---- drop pacing (the shared-mm-gear-drops walk, with this sim's fight time) ----
const Q = (a, p) => { const x = a.slice().sort((u, v) => u - v); return x[Math.min(x.length - 1, Math.floor(p * x.length))]; };
const Z3_BOSSES = Object.keys(D.TABLES.BOSS_ZONE).filter((b) => D.TABLES.BOSS_ZONE[b] === 3);
const pacingCache = new Map();
function pacing(fightS, cls) {
  const key = Math.round(fightS) + ':' + G.armorFamilyOf(cls);
  if (pacingCache.has(key)) return pacingCache.get(key);
  const h11 = [], h12 = [], k12 = [];
  for (let c = 0; c < 1500; c++) {
    const R = RNG.create('walk:' + c), cd = Z.TABLES.BOSS.cooldown[3], end = 12 * 3600;
    const sites = [0, 1, 2].map(() => ({ boss: Z3_BOSSES[R.int(0, Z3_BOSSES.length - 1)], ready: 0 }));
    let t = 0, gp = { b: 0, d: 0 }, kills = 0, s = 0, f11 = 0, f12 = 0, kk = 0;
    while (t < end && kills < 400 && !(f11 && f12)) {
      const site = sites[s]; s = (s + 1) % 3;
      t = Math.max(t + 60, site.ready) + fightS * (2 / 3 + R.next() * 2 / 3); site.ready = t + cd; kills++;
      const bag = Z.rollDrop({ zone: 3, boss: true }, 'walk:' + c + ':' + kills).bag;
      const res = bag.items.map((it, k) => D.rollGear({ src: 'boss', boss: site.boss, zone: 3, k: k, r: it.r, bagTier: bag.tierIndex, gp: gp, cls: cls }, D.seedFor('walk' + c, site.boss, kills, 'me')));
      gp = D.pityStep(gp, { src: 'boss', zone: 3 }, res);
      res.forEach((r) => { if (r && r.t >= 11 && !f11) f11 = t; if (r && r.t >= 12 && !f12) { f12 = t; kk = kills; } });
    }
    h11.push(f11 ? f11 / 3600 : Infinity); h12.push(f12 ? f12 / 3600 : Infinity); k12.push(kk || Infinity);
  }
  const out = { t11: Q(h11, 0.5), t12: Q(h12, 0.5), p99: Q(k12, 0.99) };
  pacingCache.set(key, out);
  return out;
}

// ---- rows ----
const MID_T = D.TABLES.MOB.map((row) => Math.round(row.reduce((a, e) => a + e.t * e.p, 0)));
const TTK = [[1, 2], [1.5, 3], [2, 4], [2.5, 4.5]];
const rows = []; // { name, value, target, ok, gated }
const fmt = (v) => (typeof v === 'number' ? (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2)) : String(v));
function row(name, value, target, ok, gated) { rows.push({ name, value, target, ok: !!ok, gated: gated !== false }); }
const med = (a) => { const x = a.slice().sort((u, v) => u - v); return x.length % 2 ? x[(x.length - 1) / 2] : (x[x.length / 2 - 1] + x[x.length / 2]) / 2; };

[false, true].forEach((sets) => {
  const tag = sets ? 'sets on ' : 'sets off';
  // 1. median single-creature TTK per zone (zone mid tier, Common): every class, and the class median
  for (let z = 0; z < 4; z++) {
    const lv = Math.max(ZONE_LEVEL[z], G.gate(MID_T[z])), [lo, hi] = TTK[z];
    const per = CLASSES.map((c) => groupFight(c, hero(c, MID_T[z], 0, lv, sets), z));
    row(tag + ' TTK z' + z + ' T' + MID_T[z] + ' Common, class median (min ' + fmt(Math.min(...per)) + ' / max ' + fmt(Math.max(...per)) + ')', med(per), lo + '-' + hi + ' s', med(per) >= lo && med(per) <= hi);
  }
  // 2. z3 boss solo: the class median is gated (the plan target is one band; the 14 class profiles spread ~2x), every class is printed
  const b10s = CLASSES.map((c) => bossSolo(c, hero(c, 10, 0, 20, sets))), b12s = CLASSES.map((c) => bossSolo(c, hero(c, 12, 3, 20, sets)));
  row(tag + ' z3 boss solo T10 Common, class median (min ' + fmt(Math.min(...b10s)) + ' / max ' + fmt(Math.max(...b10s)) + ')', med(b10s), '90-180 s', med(b10s) >= 90 && med(b10s) <= 180);
  row(tag + ' z3 boss solo T12 Epic, class median (min ' + fmt(Math.min(...b12s)) + ')', med(b12s), '>= 55 s', med(b12s) >= 55);
  CLASSES.forEach((c, i) => {
    row(tag + ' ' + c + ' z3 boss solo T10 Common', b10s[i], '90-180 s', b10s[i] >= 90 && b10s[i] <= 180, false);
    row(tag + ' ' + c + ' z3 boss solo T12 Epic', b12s[i], '>= 55 s', b12s[i] >= 55, false);
    row(tag + ' ' + c + ' z3 boss T12 Epic faster than T10 Common by <= 2x', b10s[i] / b12s[i], '1-2', b10s[i] / b12s[i] > 1 && b10s[i] / b12s[i] <= 2);
    // 3. DPS ratios (single target, every class)
    const h12 = hero(c, 12, 3, 20, sets), d12 = singleDps(c, h12), d9 = singleDps(c, hero(c, 9, 0, 20, sets)), dOld = singleDps(c, hero(c, 0, 3, 20, sets));
    row(tag + ' ' + c + ' DPS T12 Epic / T9 Common', d12 / d9, '<= 1.85', d12 / d9 <= 1.85);
    row(tag + ' ' + c + ' DPS T12 Epic / old Epic Spark Wand', d12 / dOld, '1.4-1.9', d12 / dOld >= 1.4 && d12 / dOld <= 1.9);
    row(tag + ' ' + c + ' T12 weapon affix power (max over seeds) inside the cap', h12.maxPower, '<= ' + A.cap(12), h12.maxPower <= A.cap(12) + 1e-9);
    // 4. hits to die, L20, zone 3, mid-tier armor (every class)
    const fam = G.armorFamilyOf(c), need = { light: 12, robe: 11, heavy: 15 }[fam], htd = hitsToDie(c, 20, MID_T[3], sets);
    row(tag + ' ' + c + ' hits to die L20 z3 T' + MID_T[3] + ' ' + fam + ' armor', htd, '>= ' + need, htd >= need);
    // 5b. drop pacing with this class's own simulated T10 Common fight time (printed; the gated row below uses the plan's fight window)
    const pc = pacing(b10s[i], c);
    row(tag + ' ' + c + ' first T12 median, own ' + fmt(b10s[i]) + ' s fights', pc.t12, '1.5-4 h', pc.t12 >= 1.5 && pc.t12 <= 4, false);
  });
  // 5. drop pacing (plan: seeded godlands walk, 3 boss sites, 1200 s cooldown; fights drawn from the T10 Common target window 90-180 s)
  const pw = pacing(135, 'ranger');
  row(tag + ' first T11 median (godlands walk)', pw.t11, '<= 1 h', pw.t11 <= 1);
  row(tag + ' first T12 median (godlands walk)', pw.t12, '1.5-4 h', pw.t12 >= 1.5 && pw.t12 <= 4);
  row(tag + ' first T12 p99 boss kills', pw.p99, '<= 60', pw.p99 <= 60);
});
// 6. splash styles (plan row; MMWeapons owns these numbers: report-only here, class-weapon-sim gates the group-clear band)
['bow_blast', 'wand_burst', 'staff_comet', 'pistol_flak'].forEach((id) => CLASSES.filter((c) => W.stylesFor(c).indexOf(id) >= 0).forEach((c) => {
  const st = W.resolve(c, id, 0), b = W.resolve(c, 'base', 0);
  const one = (x) => { let h = 0; for (let i = 0; i < x.count; i++) { const a = x.count > 1 ? (i / (x.count - 1) - 0.5) * x.spread : 0; if (Math.abs(200 * Math.sin(a)) <= 19 + x.size * 2) h++; } return x.dmg * x.rate * h * x.burst.n * (1 + x.crit); };
  const r = one(st) / one(b);
  row('splash ' + id + ' ' + c + ' single target vs own base', r, '>= 0.85', r >= 0.85, false);
}));

// ---- table + verdict ----
const w = Math.max(...rows.map((r) => r.name.length));
console.log('GB gear balance sim (' + CLASSES.length + ' classes, sets off/on, AIM_S ' + AIM_S + ' s, BOSS_UPTIME ' + BOSS_UPTIME + ', boss hp ' + BOSS_HP + ', mid tiers ' + MID_T.join('/') + ')');
console.log('row'.padEnd(w) + '  value     target     result');
rows.forEach((r) => console.log(r.name.padEnd(w) + '  ' + fmt(r.value).padEnd(9) + ' ' + r.target.padEnd(10) + ' ' + (r.ok ? 'ok' : r.gated ? 'MISS' : 'miss (report-only)')));
const first = rows.find((r) => r.gated && !r.ok);
const gated = rows.filter((r) => r.gated).length;
if (first) { console.log('FAIL first miss: ' + first.name + ' = ' + fmt(first.value) + ' (target ' + first.target + ')'); process.exitCode = 1; }
else console.log('ALL PASSED (' + gated + ' gated rows, ' + (rows.length - gated) + ' report-only)');
