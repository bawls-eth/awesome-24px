// Unit tests for shared/mm-creatures.js. Run: node game/tests/shared-mm-creatures.test.js
const C = require('../shared/mm-creatures.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const done = () => { console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exitCode = failed ? 1 : 0; };
const clone = (o) => JSON.parse(JSON.stringify(o));
const all = C.list();

check('roster builds with zero validation errors', C.errors().length === 0, JSON.stringify(C.errors()));
check('roster has 35+ creatures with unique ids', all.length >= 35 && new Set(all.map((d) => d.id)).size === all.length, String(all.length));
check('five biomes: meadow, jungle, tundra, reef, mars', C.BIOMES.join() === 'meadow,jungle,tundra,reef,mars');
check('every biome has 6-8 creatures', C.BIOMES.every((b) => C.byBiome(b).length >= 6 && C.byBiome(b).length <= 8), C.BIOMES.map((b) => C.byBiome(b).length).join());
check('every biome has BIG creatures (L/XL)', C.BIOMES.every((b) => C.big(b).length >= 2 && C.byBiome(b).some((d) => d.size === 'L' || d.size === 'XL')));
check('jungle, tundra, reef and mars each have a boss', ['jungle', 'tundra', 'reef', 'mars'].every((b) => C.byTier('boss', b).length >= 1));
check('all four tiers are used', C.TIERS.every((t) => C.byTier(t).length > 0));
check('all three taming methods are used', C.METHODS.every((m) => C.byMethod(m).length >= 3));
check('all sizes S/M/L/XL are used', ['S', 'M', 'L', 'XL'].every((s) => all.some((d) => d.size === s)));
check('byBiome only returns that biome; unknown biome gives []', C.byBiome('jungle').every((d) => d.biome === 'jungle') && C.byBiome('nope').length === 0 && C.byBiome(null).length === 0 && C.byBiome({}).length === 0);
check('get() finds ids and rejects junk, __proto__ and constructor', C.get('raptor') === null && C.get('fernraptor').id === 'fernraptor' && C.get('__proto__') === null && C.get('constructor') === null && C.get(null) === null && C.get(5) === null && C.get({}) === null);
check('every def validates and clean() round-trips it', all.every((d) => C.validate(d).ok && JSON.stringify(C.clean(clone(d))) === JSON.stringify(d)));
check('defs and tables are deeply frozen (mutation is a no-op)', (() => {
  const d = C.get('tusktop');
  try { d.hp = 1; d.tame.need = 1; d.diet.push('x'); C.FOODS.apple.quality = 9; C.DROP_TABLES.nothing.push(1); C.SIZES.S.px = 1; } catch (e) { /* strict mode throws */ }
  return d.hp === 420 && d.tame.need === 8 && d.diet.length === 2 && C.FOODS.apple.quality === 1 && C.DROP_TABLES.nothing.length === 0 && C.SIZES.S.px === 48 && Object.isFrozen(C) && Object.isFrozen(d.ride);
})());
check('bad size, base, diet, tier, biome, id, numbers are rejected', (() => {
  const b = clone(C.get('fernraptor')); const bad = (k, v) => { const x = clone(b); x[k] = v; return !C.validate(x).ok && C.clean(x) === null; };
  return bad('size', 'HUGE') && bad('size', '__proto__') && bad('base', 'laser') && bad('diet', ['pizza']) && bad('diet', 'raw_meat') && bad('tier', 'friendly') && bad('biome', 'moon') && bad('id', 'Bad Id!') && bad('hp', -5) && bad('hp', NaN) && bad('speed', Infinity);
})());
check('rideables have a ride block, are M or bigger, tameable, and the flags agree', all.every((d) => (d.ride !== null) === d.rideable && (!d.rideable || (d.size !== 'S' && d.tameable && d.ride.speed > 0.5 && d.needsSaddle === (d.ride.saddle !== null)))) && C.rideable().length >= 8);
check('a ride block on a small creature is rejected', (() => { const x = clone(C.get('fernraptor')); x.ride = { saddle: null, speed: 1.2, ability: 'dash', swim: false, fly: false, lift: 10 }; return !C.validate(x).ok; })());
check('L/XL attackers have windup >= 0.4', all.filter((d) => (d.size === 'L' || d.size === 'XL') && d.attack).every((d) => d.attack.windup >= C.BIG_MIN_WINDUP) && all.filter((d) => d.attack).length > 20);
check('a big creature with a short windup is rejected', (() => { const x = clone(C.get('tusktop')); x.attack.windup = 0.2; return !C.validate(x).ok; })());
check('tier rules: passive has no attack, hostile/boss aggro, neutral retaliates', all.every((d) => (d.tier === 'passive' ? d.attack === null && !d.behaviours.includes('aggro') : d.attack !== null)) &&
  all.filter((d) => d.tier === 'hostile' || d.tier === 'boss').every((d) => d.behaviours.includes('aggro') && d.aggroR > 0) && all.filter((d) => d.tier === 'neutral').every((d) => d.behaviours.includes('retaliate')));
check('tameable creatures have diet, tame block and companion; others have none', all.every((d) => (d.tameable ? d.diet.length > 0 && d.tame && d.companion : d.tame === null && d.companion === null)));
check('knockout creatures have torpor and sleep long enough to feed', C.byMethod('knockout').every((d) => d.tame.torpor > 0 && d.tame.sleep >= (d.tame.need - 1) * d.tame.feedEvery * 1.2));
check('feed/calm creatures have no torpor or sleep', [...C.byMethod('feed'), ...C.byMethod('calm')].every((d) => d.tame.torpor === 0 && d.tame.sleep === 0));
check('vinecoil, icicle_bat, frost_dragon, tide_hydra, dust_devil are not tameable', ['vinecoil', 'icicle_bat', 'frost_dragon', 'tide_hydra', 'dust_devil'].every((id) => C.get(id).tame === null));
check('drop table keys and diet foods all exist', all.every((d) => d.drops.length > 0 && d.drops.every((k) => C.dropTable(k) !== null) && d.diet.every((f) => C.food(f) !== null)));
check('drop tables are well formed [item,min,max,weight]', Object.values(C.DROP_TABLES).every((t) => t.every((r) => typeof r[0] === 'string' && r[1] >= 1 && r[2] >= r[1] && r[3] > 0)));
check('tame target times sit in the size bands (S 20-45, M 40-90, L 70-150, XL 110-220, boss 100-260)', all.filter((d) => d.tame).every((d) => {
  const bands = { S: [20, 45], M: [40, 90], L: [70, 150], XL: [110, 220] }; const [lo, hi] = d.tier === 'boss' ? [100, 260] : bands[d.size];
  return d.tame.time >= lo && d.tame.time <= hi;
}));
check('size info and px classes', C.sizeInfo('S').px === 48 && C.sizeInfo('M').px === 64 && C.sizeInfo('L').px === 96 && C.sizeInfo('XL').px === 128 && C.sizeInfo('XXL') === null && C.sizeInfo('__proto__') === null);
check('hit radius grows with size', all.every((d) => d.rad === C.SIZES[d.size].rad) && C.SIZES.S.rad < C.SIZES.M.rad && C.SIZES.M.rad < C.SIZES.L.rad && C.SIZES.L.rad < C.SIZES.XL.rad);
check('companion roles come from the role list; every role is used', all.filter((d) => d.companion).every((d) => C.ROLES.includes(d.companion.role)) && C.ROLES.every((r) => C.byRole(r).length > 0));
check('eatenBy finds creatures; levelBand returns a copy', C.eatenBy('raw_meat').length >= 4 && C.eatenBy('pizza').length === 0 && (() => { const b = C.levelBand(C.get('tusktop')); b[0] = 99; return C.get('tusktop').lv[0] === 8 && C.levelBand(null) === null; })());
check('hostile input never throws and yields null / invalid', (() => {
  const evil = [null, undefined, 0, 1, NaN, 'x', '', true, [], [1], () => 1, Symbol('s'), JSON.parse('{"__proto__":{"id":"hax"}}'), JSON.parse('{"__proto__":null}'),
    { id: 'a'.repeat(100000) }, { get id() { throw new Error('boom'); } }, new Proxy({}, { get() { throw new Error('boom'); }, has() { throw new Error('boom'); } }),
    Object.create({ id: 'inherited' })];
  try { evil.forEach((e) => { const r = C.validate(e); if (r.ok || C.clean(e) !== null) throw new Error('accepted junk'); }); return true; } catch (e) { console.log(e.message); return false; }
})());
check('cyclic input is handled without throwing', (() => { const cyc = clone(C.get('fernraptor')); cyc.self = cyc; try { C.validate(cyc); C.clean(cyc); return true; } catch (e) { return false; } })());
check('clean() drops unknown keys and never copies __proto__ payloads', (() => {
  const x = clone(C.get('fernraptor')); x.evil = { a: 1 };
  const j = JSON.parse(JSON.stringify(x).replace('{', '{"__proto__":{"polluted":1},'));
  const c = C.clean(j); return c !== null && !('evil' in c) && ({}).polluted === undefined && c.polluted === undefined;
})());
check('lookups return fresh arrays (callers cannot corrupt the registry)', (() => { C.list().length = 0; C.byBiome('jungle').pop(); return C.list().length === all.length && C.byBiome('jungle').length >= 6; })());
done();
