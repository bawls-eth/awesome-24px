// Run: node game/tests/shared-mm-gear-forge.test.js
const fs = require('fs'), path = require('path');
const F = require('../shared/mm-gear-forge.js');
const G = require('../shared/mm-gear.js');
const A = require('../shared/mm-gear-affix.js');
let n = 0, bad = 0;
function check(name, ok) { n++; if (!ok) { bad++; console.log('FAIL ' + name); } }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const w9 = { n: 5, id: 'wpn_triple_shot', r: 2, t: 9, a: 12345 };
const a12 = { n: 6, id: 'arm_heavy_dread', r: 3, t: 12, a: 777 };
const snap = JSON.stringify(w9);

// ---- salvage ----
const s1 = F.salvage(w9);
check('salvage deterministic', eq(s1, F.salvage(w9)) && s1.dust === 1 + 9 * 3);
const w7 = (r, t) => ({ n: 1, id: 'wpn_triple_shot', r: r, t: t });
check('salvage dust rises with t and r', F.salvage(w7(0, 7)).dust < F.salvage(w7(0, 8)).dust && F.salvage(w7(0, 7)).dust < F.salvage(w7(3, 7)).dust);
check('soulbound can be salvaged', F.salvage(a12) && F.salvage(a12).soulbound === true && F.salvage(a12).dust > 0);
check('T0 item salvages', F.salvage({ n: 1, id: 'sparkwand', r: 1 }).dust === 1);
check('salvage frozen, input untouched', Object.isFrozen(s1) && JSON.stringify(w9) === snap);

// ---- reforge options ----
const opts = F.reforgeOptions(w9);
const rolled = A.roll(w9.id, 'weapon', 9, 2, 12345, null).map((e) => e.id);
check('options: only weapon affixes, none already rolled', opts.length > 0 && opts.every((o) => A.SLOTS.weapon.indexOf(o.id) >= 0 && rolled.indexOf(o.id) < 0));
check('options: lists every legal affix', opts.length === A.SLOTS.weapon.filter((i) => A.rangeOf(i, 9) && rolled.indexOf(i) < 0).length);
check('options: value inside range, fixed, exact cost and text', opts.every((o) => { const rg = A.rangeOf(o.id, 9); return o.v >= rg[0] && o.v <= rg[1] && o.cost.dust === 80 && o.cost.shards === 75 /* cycle 3 D: 25 x (t - 6), was 3 */ && typeof o.text === 'string' && o.text.length > 0; }) && eq(opts, F.reforgeOptions(w9)));
check('options: T7 has no leech/pierce', !F.reforgeOptions(w7(0, 7)).some((o) => o.id === 'leech' || o.id === 'pierce'));
check('options: armor slot', F.reforgeOptions(a12).length > 0 && F.reforgeOptions(a12).every((o) => A.SLOTS.armor.indexOf(o.id) >= 0));
check('single forged power affix stays under the cap', [7, 9, 11, 12].every((t) => [0, 1, 2, 3].every((r) => F.reforgeOptions(w7(r, t)).every((o) => A.value([{ id: o.id, v: o.v }]) <= A.cap(t) + 1e-9))));
check('options: t < 7 or T0 returns null', F.reforgeOptions(w7(0, 6)) === null && F.reforgeOptions({ n: 1, id: 'sparkwand', r: 0 }) === null);

// ---- reforge ----
const o0 = opts[0], o1 = opts[1];
const r1 = F.reforge(w9, o0.id);
check('reforge sets f to the previewed value', r1 && r1.f.id === o0.id && r1.f.v === o0.v && r1.t === 9 && r1.a === 12345 && r1.n === 5 && r1.id === w9.id && r1.r === 2);
check('reforge never mutates and returns a new item', JSON.stringify(w9) === snap && r1 !== w9 && Object.isFrozen(r1) && !('f' in w9));
const r2 = F.reforge(r1, o1.id);
check('reforging again replaces the forged affix', r2.f.id === o1.id && Object.keys(r2.f).length === 2);
check('forged item: option marked current', F.reforgeOptions(r1).find((o) => o.id === o0.id).current === true);
check('reforge deterministic', eq(F.reforge(w9, o0.id), F.reforge(w9, o0.id)));
check('reforge rejects illegal ids', ['keen\u0000', 'vital', '', 'nope', '__proto__', 'constructor', 5, null, undefined].every((x) => F.reforge(w9, x) === null) && F.reforge(w7(0, 6), 'keen') === null);
check('a hostile stored f is ignored and replaced', F.reforge({ n: 1, id: 'wpn_triple_shot', r: 0, t: 8, f: { id: '__proto__', v: 1e9 } }, 'keen').f.v < 1);

// ---- vendor ----
const st = F.vendorStock('2026-W47');
check('vendor: fixed list of T1-T3, never soulbound', st.length > 0 && st.every((e) => e.t >= 1 && e.t <= 3 && !G.soulbound(e.t) && e.r === 0 && e.price > 0 && Number.isInteger(e.price)));
check('vendor: same list every week, fixed prices', eq(st, F.vendorStock('2027-W01')) && st.every((e) => e.price === G.sellValue(0, e.t) * F.PRICE_MULT));
check('vendor: every entry is a valid item', st.every((e) => { const c = G.clean({ n: 1, id: e.id, r: e.r, t: e.t }); return c && c.t === e.t; }));
check('vendor: bad week key', ['', 'x', 5, null, {}, '2026-47', '__proto__', '2026-W47x'].every((k) => F.vendorStock(k) === null));
check('vendor: frozen', Object.isFrozen(st) && Object.isFrozen(st[0]));

// ---- buy back ----
const bb = F.buyBack({ n: 1, id: 'sparkwand', r: 2, t: 2 });
check('buyBack pays dust at the sellValue ratio', bb.dust === Math.floor(G.sellValue(2, 2) * F.BUYBACK_RATIO) && F.BUYBACK_RATIO > 0 && F.BUYBACK_RATIO < 1);
check('buyBack of a vendor item never exceeds its price', st.every((e) => F.buyBack({ n: 1, id: e.id, r: 0, t: e.t }).dust < e.price));
check('buyBack refuses soulbound and non-vendor tiers', F.buyBack(a12) === null && F.buyBack(w9) === null);

// ---- hostile ----
const hostile = [null, undefined, 0, 1, 'x', [], [1], true, () => 1, NaN, {}, { id: 5 }, { id: 'sparkwand', n: 1e30 }, { id: 'sparkwand', n: 1, t: 1e309 }, { id: 'sparkwand', n: 1, t: 13 }, { id: 'sparkwand', n: 1, t: -1 },
  { id: 'wpn_triple_shot', n: 1, r: 99, t: 9 }, { id: 'wpn_triple_shot', n: 1, r: NaN, t: 9 }, { id: 'wpn_triple_shot', n: 1, r: 1, t: 9, a: 1e30 }, { id: '__proto__', n: 1 }, { id: 'constructor', n: 1 },
  JSON.parse('{"__proto__":{"t":9},"id":"wpn_triple_shot","n":1}'), { id: 'wpn_triple_shot', n: 1, t: '9' }, { id: 'wpn_triple_shot', n: 1, t: 1.5 }, { id: 'a'.repeat(1e5), n: 1 }];
check('hostile input returns null on every entry point', hostile.every((x) => F.salvage(x) === null && F.reforgeOptions(x) === null && F.reforge(x, 'keen') === null && F.buyBack(x) === null));
check('Object.prototype not polluted', ({}).t === undefined && ({}).f === undefined);

// ---- determinism by source ----
const src = fs.readFileSync(path.join(__dirname, '../shared/mm-gear-forge.js'), 'utf8');
check('source has no random / MMRng / Date', !/random|MMRng|\bDate\b|performance\.now|rng\.js/i.test(src));
check('module frozen', Object.isFrozen(F));

console.log(n - bad + '/' + n + ' passed');
process.exit(bad ? 1 : 0);
