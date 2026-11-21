// Run: node game/tests/shared-mm-pickups.test.js
const fs = require('fs'), path = require('path');
const P = require('../shared/mm-pickups.js');
let n = 0, bad = 0;
function check(name, ok) { n++; if (!ok) { bad++; console.log('FAIL ' + name); } }
const art = new Set(JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/arcane/b15-loot-bags-and-drops/manifest.json'), 'utf8')).assets.map((a) => a.id));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

check('magnet radius is 64 px', P.MAGNET_RADIUS === 64);
check('lifetime per tier rises 1..5', [1, 2, 3, 4, 5].every((t) => P.LIFETIME_MS[t] > 0) && [2, 3, 4, 5].every((t) => P.LIFETIME_MS[t] > P.LIFETIME_MS[t - 1]));
check('every art id exists in b15', P.COIN_FRAMES.concat(P.XP_FRAMES, P.POTION_IDS, ['heart_pickup', 'focus_pickup']).every((a) => art.has(a)) && P.POTION_IDS.length === 6);
check('roll deterministic for (seed, group, kill)', eq(P.roll(7, 'g1', 3, 2), P.roll(7, 'g1', 3, 2)) && eq(P.roll('s', 'g', 'k', 5), P.roll('s', 'g', 'k', 5)));
let differs = false;
for (let k = 0; k < 40; k++) if (!eq(P.roll(7, 'g1', k, 3), P.roll(7, 'g1', 0, 3))) differs = true;
check('different kills vary', differs);
check('group and seed change the stream', (() => { let a = 0, b = 0; for (let k = 0; k < 300; k++) { if (!eq(P.roll(1, 'x', k, 5), P.roll(2, 'x', k, 5))) a++; if (!eq(P.roll(1, 'x', k, 5), P.roll(1, 'y', k, 5))) b++; } return a > 0 && b > 0; })());
check('always a coin and an xp orb', [1, 2, 3, 4, 5].every((t) => { const r = P.roll(1, 'g', 1, t); return r[0].type === 'coin' && r[1].type === 'xp'; }));
check('coins stay within tier range and cap 6', (() => { for (let t = 1; t <= 5; t++) for (let k = 0; k < 200; k++) { const c = P.roll(3, 'g', k, t)[0].value; if (c < P.TABLE[t].coins[0] || c > P.TABLE[t].coins[1] || c > 6) return false; } return true; })());
check('xp scales with tier', P.roll(1, 'g', 1, 5)[1].value > P.roll(1, 'g', 1, 1)[1].value);
check('drops only use known types/art and lifetimes of the tier', (() => { for (let t = 1; t <= 5; t++) for (let k = 0; k < 300; k++) for (const d of P.roll(9, 'g', k, t)) { if (P.TYPES.indexOf(d.type) < 0 || !art.has(d.art) || d.lifeMs !== P.LIFETIME_MS[t] || d.tier !== t || !(d.value >= 1)) return false; } return true; })());
check('potion rate rises with tier (statistically)', (() => { const c = (t) => { let x = 0; for (let k = 0; k < 4000; k++) if (P.roll(5, 'g', k, t).some((d) => d.type === 'potion')) x++; return x; }; return c(5) > c(1) && c(1) < 200; })());
check('all 6 potions can drop', (() => { const seen = new Set(); for (let k = 0; k < 6000; k++) P.roll(5, 'g', k, 5).forEach((d) => { if (d.type === 'potion') seen.add(d.art); }); return seen.size === 6; })());
check('hostile tier clamps', [NaN, -3, 0, 99, 'x', null, undefined, {}].every((t) => { const r = P.roll(1, 'g', 1, t); return r.length >= 2 && r[0].tier >= 1 && r[0].tier <= 5; }));
check('hostile seed/group/kill do not throw', (() => { try { P.roll(undefined, null, {}, 3); P.roll(NaN, [], Infinity, 1); return true; } catch (e) { return false; } })());
check('heal capped at max HP', P.heal(90, 100, 50) === 100 && P.heal(10, 100, 20) === 30 && P.heal(100, 100, 1) === 100);
check('heal hostile input', P.heal(NaN, 100, 10) === 10 && P.heal(50, 100, -20) === 50 && P.heal(50, 100, NaN) === 50 && P.heal(5, 0, 10) === 0 && P.heal(500, 100, 0) === 100 && P.heal(-5, 100, 0) === 0);
const st = { hp: 50, maxHp: 100, focus: 10, maxFocus: 100 }, snap = JSON.stringify(st);
check('life potion heals 40% capped; no mutation', P.use({ type: 'potion', art: 'potion_life' }, st).hp === 90 && P.use({ type: 'potion', art: 'potion_life' }, { hp: 90, maxHp: 100 }).hp === 100 && JSON.stringify(st) === snap);
check('focus potion and orb capped', P.use({ type: 'potion', art: 'potion_focus' }, st).focus === 60 && P.use({ type: 'focus', value: 500 }, st).focus === 100);
check('buff potions give timed buff', ['potion_power', 'potion_swift', 'potion_guard', 'potion_wit'].every((id) => { const b = P.use({ type: 'potion', art: id }, st).buff; return b && b.sec === 30 && b.amount === 4; }));
check('heart heals capped', P.use({ type: 'heart', value: 26 }, st).hp === 76 && P.use({ type: 'heart', value: 1e9 }, st).hp === 100);
check('use hostile input is a no-op', eq(P.use(null, st), { hp: 50, focus: 10, buff: null }) && eq(P.use({ type: 'potion', art: '__proto__' }, st), { hp: 50, focus: 10, buff: null }) && P.use({ type: 'heart', value: 5 }, null).hp === 0);
check('magnet: outside 64 px stays put', eq(P.magnetStep({ x: 0, y: 0 }, { x: 65, y: 0 }, 0.1), { x: 0, y: 0, collected: false, magnet: false }));
check('magnet: inside 64 px moves toward player', (() => { const r = P.magnetStep({ x: 0, y: 0 }, { x: 60, y: 0 }, 0.05); return r.magnet && r.x > 0 && r.x <= 60 && r.y === 0 && !r.collected; })());
check('magnet: collected within 16 px and never overshoots', P.magnetStep({ x: 0, y: 0 }, { x: 10, y: 0 }, 0.1).collected && (() => { let p = { x: 0, y: 0 }; for (let i = 0; i < 60; i++) { const r = P.magnetStep(p, { x: 50, y: 0 }, 1 / 60); if (r.x > 50) return false; p = r; if (r.collected) return true; } return false; })());
check('magnet hostile input safe', !P.magnetStep(null, { x: 1, y: 1 }, 1).collected && !P.magnetStep({ x: NaN, y: 0 }, { x: 1, y: 1 }, 1).collected && P.magnetStep({ x: 0, y: 0 }, { x: 40, y: 0 }, NaN).x === 0 && P.magnetStep({ x: 0, y: 0 }, { x: 40, y: 0 }, 1e9).x <= 40);
// PLAYTEST-REVIEW-2 #3 (added): an optional magnet radius (the overworld passes MAGNET_RADIUS_WORLD = 120); without it the 64 px magnet is unchanged
check('magnet radius param: 120 px pulls a drop 100 px away, the default still ignores it, bad radii fall back to 64', P.MAGNET_RADIUS_WORLD === 120 && P.magnetStep({ x: 0, y: 0 }, { x: 100, y: 0 }, 0.05, P.MAGNET_RADIUS_WORLD).magnet && !P.magnetStep({ x: 0, y: 0 }, { x: 100, y: 0 }, 0.05).magnet && !P.magnetStep({ x: 0, y: 0 }, { x: 100, y: 0 }, 0.05, NaN).magnet && !P.magnetStep({ x: 0, y: 0 }, { x: 100, y: 0 }, 0.05, -5).magnet && !P.magnetStep({ x: 0, y: 0 }, { x: 500, y: 0 }, 0.05, 1e9).magnet);
check('expired by tier lifetime', !P.expired({ bornMs: 0, lifeMs: P.LIFETIME_MS[2] }, P.LIFETIME_MS[2] - 1) && P.expired({ bornMs: 0, lifeMs: P.LIFETIME_MS[2] }, P.LIFETIME_MS[2]) && P.expired(null, 0) && P.expired({ bornMs: 0, lifeMs: 1e12 }, P.LIFETIME_MS[5]));
check('clean accepts good pickup', (() => { const c = P.clean({ type: 'coin', value: 3, tier: 2, x: 10, y: 20, bornMs: 5, evil: 1 }); return c && c.art === 'coin_f1' && c.lifeMs === P.LIFETIME_MS[2] && !('evil' in c); })());
check('clean rejects bad pickups', [null, 5, {}, { type: 'gold', x: 1, y: 1 }, { type: 'coin', x: 'a', y: 1 }, { type: 'potion', art: 'sword', x: 1, y: 1 }, { type: '__proto__', x: 1, y: 1 }].every((r) => P.clean(r) === null));
check('clean clamps value and coords', (() => { const c = P.clean({ type: 'heart', value: 1e12, x: 1e12, y: -1e12, tier: 99 }); return c.value === 1000 && c.x === 1e6 && c.y === -1e6 && c.tier === 5; })());
console.log((bad ? 'FAILED ' + bad + ' of ' : 'ok ') + n + ' assertions'); process.exit(bad ? 1 : 0);
