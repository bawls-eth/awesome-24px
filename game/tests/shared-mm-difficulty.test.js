// Pure-node tests for shared/mm-difficulty.js. Run: node game/tests/shared-mm-difficulty.test.js
const D = require('../shared/mm-difficulty.js');
const T = D.TABLES, K = D.KEYS;
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const inClamp = (s) => K.every((k) => Number.isFinite(s[k]) && s[k] >= T.CLAMP[k][0] && s[k] <= T.CLAMP[k][1]);
const BIOMES = ['warren', 'bramble', 'meadow', 'crypt'];

// ---- zones: walk from the coast (dw 0.97) to the centre (0) in fine steps ----
const zoneAt = (d) => (d >= 0.68 ? 0 : d >= 0.40 ? 1 : d >= 0.20 ? 2 : 3);
let mono = true, clampOk = true, prev = null, lastBad = '';
for (let d = 0.97; d >= 0; d -= 0.005) {
  const s = D.zoneScale(zoneAt(d), d);
  if (!inClamp(s)) clampOk = false;
  if (prev) for (const k of ['hp', 'dmg', 'spd', 'count', 'fire']) if (s[k] < prev[k] - 1e-9) { mono = false; lastBad = k + '@' + d; }
  prev = s;
}
check('zoneScale is monotonic coast -> centre for every key', mono, lastBad);
check('zoneScale stays inside the documented clamps', clampOk);
const zc = [0, 1, 2, 3].map((z) => D.zoneScale(z, [0.82, 0.54, 0.30, 0.1][z]));
check('zone centres are strictly ordered shore < midlands < highlands < godlands (hp, dmg)', zc[0].hp < zc[1].hp && zc[1].hp < zc[2].hp && zc[2].hp < zc[3].hp && zc[0].dmg < zc[1].dmg && zc[1].dmg < zc[2].dmg && zc[2].dmg < zc[3].dmg, JSON.stringify(zc));
check('continuous across a zone border (shore inner edge == midlands outer edge)', JSON.stringify(D.zoneScale(0, 0.68)) === JSON.stringify(D.zoneScale(1, 0.68)));

// ---- easy start ----
const shore = []; for (let d = 0.97; d >= 0.68; d -= 0.01) shore.push(D.zoneScale(0, d));
check('shore creatures have 60% hp at the coast', D.zoneScale(0, 0.97).hp === 0.6 && shore.every((s) => s.hp <= 0.7));
check('shore bolts deal <= 6% of a level-1 hero\'s hp (every shore position)', shore.every((s) => D.boltDamage(s.dmg) <= 0.06 * D.heroHp(1) + 1e-9), JSON.stringify(shore[shore.length - 1]));
const hs = D.heroScale();
check('easy start: the world hero scale lets 7.5 bolts/s of 1 dmg kill a 12 hp shore creature in about a second (>= 12 dps, <= 2x)', hs.dmg * 7.5 * hs.rate >= 12 && hs.dmg <= 2 && hs.rate === 1 && D.heroScale() !== D.heroScale(), JSON.stringify(hs));
check('heroHp mirrors realm.js (100 at level 1, 252 at level 20, clamped)', D.heroHp(1) === 100 && D.heroHp(20) === 252 && D.heroHp(99) === 252 && D.heroHp(-5) === 100);
const first3 = [1, 2, 3].map((i) => D.dungeonScale('warren', i, 8, false));
check('the first three dungeon rooms are weak (hp <= 0.7x, dmg <= 0.8x in the warren)', first3.every((s) => s.hp <= 0.7 && s.dmg <= 0.8 && s.count < 1), JSON.stringify(first3));
check('the first three rooms are weak in every biome (hp and dmg multipliers below 1)', BIOMES.every((b) => [1, 2, 3].every((i) => { const s = D.dungeonScale(b, i, 8, false); return s.hp < 1 && s.dmg < 1; })));

// ---- hard cap ----
const worst = D.zoneScale(3, 0);
check('godlands: one bolt (with the existing zone x tier x boss stat multipliers 2.2 * 1.3 * 1.4) <= 35% of a level-20 hero\'s hp', D.boltDamage(worst.dmg * 2.2 * 1.3 * 1.4) <= 0.35 * D.heroHp(20), String(D.boltDamage(worst.dmg * 2.2 * 1.3 * 1.4)));
check('the clamp itself caps a bolt below 35% of a level-20 hero even at the dmg ceiling x the existing table', D.boltDamage(T.CLAMP.dmg[1] * 2.2 * 1.3 * 1.4) <= 0.35 * D.heroHp(20));
check('a 14-bolt ring at the count ceiling never exceeds the 40-bolt arena cap', D.capBolts(14 * T.CLAMP.count[1]) <= D.BOLT_CAP && D.capBolts(1e9) === 40 && D.capBolts(-3) === 1 && D.BOLT_CAP === 40);
check('godlands are harder than any early room (hp and dmg)', worst.hp > D.dungeonScale('warren', 1, 8, false).hp && worst.dmg > D.dungeonScale('warren', 1, 8, false).dmg);

// ---- dungeon ----
for (const b of BIOMES) {
  let ok = true, cl = true, p = null;
  for (let i = 1; i <= 12; i++) {
    const s = D.dungeonScale(b, i, 12, false);
    if (!inClamp(s)) cl = false;
    if (p) for (const k of K) if (s[k] < p[k] - 1e-9) ok = false;
    p = s;
  }
  const boss = D.dungeonScale(b, 12, 12, true);
  check('dungeonScale ' + b + ': monotonic in room index, clamped, boss >= last room', ok && cl && inClamp(boss) && boss.hp >= p.hp && boss.dmg >= p.dmg);
}
let order = true;
for (let i = 1; i <= 8; i++) for (let k = 0; k < 3; k++) { const a = D.dungeonScale(BIOMES[k], i, 8, false), c = D.dungeonScale(BIOMES[k + 1], i, 8, false); if (!(a.hp <= c.hp && a.dmg <= c.dmg && a.spd <= c.spd)) order = false; }
check('biomes are ordered warren <= bramble <= meadow <= crypt at every room', order);
check('room 1 is weaker than room 6 (same biome)', D.dungeonScale('bramble', 1, 8, false).hp < D.dungeonScale('bramble', 6, 8, false).hp && D.dungeonScale('bramble', 1, 8, false).dmg < D.dungeonScale('bramble', 6, 8, false).dmg);
check('a short dungeon (2 rooms) is valid and rises to the boss', inClamp(D.dungeonScale('crypt', 2, 2, true)) && D.dungeonScale('crypt', 1, 2, false).hp <= D.dungeonScale('crypt', 2, 2, true).hp);

// ---- waves ----
let wm = true, wc = true, wp = null;
for (let w = 1; w <= 60; w++) { const s = D.waveScale(w); if (!inClamp(s)) wc = false; if (wp) for (const k of K) if (s[k] < wp[k] - 1e-9) wm = false; wp = s; }
check('waveScale is monotonic over 60 waves and clamped', wm && wc);
check('wave 1 is gentle and wave 30+ plateaus', D.waveScale(1).hp < 1 && D.waveScale(1).dmg < 1 && JSON.stringify(D.waveScale(30)) === JSON.stringify(D.waveScale(500)));

// ---- picnic ----
const n = D.zoneScale(2, 0.3), pk = D.zoneScale(2, 0.3, { mode: 'picnic' });
check('picnic mode: damage x0.8, hp and speed untouched', Math.abs(pk.dmg - n.dmg * 0.8) < 0.002 && pk.hp === n.hp && pk.spd === n.spd);
check('picnic never breaks the clamps (even at the floor)', inClamp(D.waveScale(1, { mode: 'picnic' })) && inClamp(D.dungeonScale('warren', 1, 8, false, { mode: 'picnic' })));
check('classic / unknown / hostile modes behave like classic', JSON.stringify(D.zoneScale(2, 0.3, { mode: 'hardcore' })) === JSON.stringify(n) && JSON.stringify(D.zoneScale(2, 0.3, { mode: { x: 1 } })) === JSON.stringify(n) && JSON.stringify(D.zoneScale(2, 0.3, null)) === JSON.stringify(n));

// ---- hostile input ----
const bad = [NaN, Infinity, -Infinity, -1, 1e12, 'abc', '', null, undefined, {}, [], '2', true];
let hostileOk = true, why = '';
for (const a of bad) for (const b of bad) {
  try {
    for (const s of [D.zoneScale(a, b), D.dungeonScale(a, b, a, !!b), D.dungeonScale('crypt', a, b, true), D.waveScale(a)]) if (!inClamp(s)) { hostileOk = false; why = String(a) + ',' + String(b); }
  } catch (e) { hostileOk = false; why = 'threw ' + e.message; }
}
check('hostile input never throws and every output stays inside the clamps', hostileOk, why);
check('unknown biome behaves as warren; "__proto__" / "constructor" biomes do not crash', JSON.stringify(D.dungeonScale('nope', 3, 8, false)) === JSON.stringify(D.dungeonScale('warren', 3, 8, false)) && inClamp(D.dungeonScale('__proto__', 3, 8, false)) && inClamp(D.dungeonScale('constructor', 3, 8, false)));
check('zone out of range clamps to shore / godlands; missing distance = middle of the zone', JSON.stringify(D.zoneScale(-4, 0.9)) === JSON.stringify(D.zoneScale(0, 0.9)) && JSON.stringify(D.zoneScale(77, 0)) === JSON.stringify(D.zoneScale(3, 0)) && D.zoneScale(1).hp > D.zoneScale(0, 0.97).hp);
check('pure and deterministic: same input twice gives deep-equal output', JSON.stringify(D.zoneScale(1, 0.5)) === JSON.stringify(D.zoneScale(1, 0.5)) && JSON.stringify(D.dungeonScale('meadow', 4, 9, false)) === JSON.stringify(D.dungeonScale('meadow', 4, 9, false)));
check('isOff only matches ?difficulty=off as a whole param', D.isOff('?mode=world&difficulty=off') && D.isOff('?difficulty=off') && !D.isOff('?difficulty=offx') && !D.isOff('?x=difficulty=off') && !D.isOff(null) && !D.isOff(undefined) && !D.isOff('?difficulty=on'));
check('IDENTITY is all ones and frozen', K.every((k) => D.IDENTITY[k] === 1) && Object.isFrozen(D.IDENTITY));
// PLAYTEST-REVIEW-2 #3 (added): opts.ttk halves shore hp (after the clamp) and nothing else; other zones and the default call are unchanged
check('opts.ttk: shore hp x0.5 (0.3 at the coast), dmg/spd untouched, midlands identical, no ttk = old numbers', D.zoneScale(0, 0.97, { ttk: true }).hp === 0.3 && D.zoneScale(0, 0.97).hp === 0.6 && D.zoneScale(0, 0.8, { ttk: true }).dmg === D.zoneScale(0, 0.8).dmg && JSON.stringify(D.zoneScale(1, 0.5, { ttk: true })) === JSON.stringify(D.zoneScale(1, 0.5)) && D.zoneScale(0, 0.68, { ttk: true }).hp <= D.zoneScale(1, 0.68, { ttk: true }).hp);
// PLAYTEST-REVIEW-2 #1 (added): opts.bands 'wide' reads the wide zone bands (MMOverworld.ZONE_BANDS_WIDE); the default stays classic
{
  const O = require('../shared/mm-overworld.js');
  check('BANDS_WIDE mirrors MMOverworld.ZONE_BANDS_WIDE, BANDS mirrors ZONE_BANDS_CLASSIC', D.TABLES.BANDS_WIDE.every((b, z) => b.min === O.ZONE_BANDS_WIDE[z].dwMin && b.max === O.ZONE_BANDS_WIDE[z].dwMax) && D.TABLES.BANDS.every((b, z) => b.min === O.ZONE_BANDS_CLASSIC[z].dwMin));
  check('wide bands: continuous at the wide shore/midlands border, default call unchanged', JSON.stringify(D.zoneScale(0, 0.62, { bands: 'wide' })) === JSON.stringify(D.zoneScale(1, 0.62, { bands: 'wide' })) && D.zoneScale(0, 0.97, { bands: 'wide' }).hp === 0.6 && JSON.stringify(D.zoneScale(1, 0.5)) === JSON.stringify(D.zoneScale(1, 0.5, {})));
}

console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
