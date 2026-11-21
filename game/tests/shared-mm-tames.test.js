// Run: node game/tests/shared-mm-tames.test.js  (pure module, no DOM)
const T = require('../shared/mm-tames.js');
let n = 0, bad = 0;
function check(name, ok) { n++; if (!ok) { bad++; console.log('FAIL ' + name); } }
function fake(init) {
  const m = Object.assign({}, init || {}); const writes = [];
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { writes.push(k); m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, _m: m, writes };
}
const GOOD = { id: 't1', sp: 'raptor', nm: 'Rex', lv: 3, xp: 20, bond: 3, aff: 120, cos: 'red_scarf', isle: 'jungle', d: '2026-11-21' };

check('key and caps', T.KEY === 'pixeltown-tames-v1' && T.MAX_TAMES === 60 && T.MAX_PARTY === 2 && T.MAX_LV === 30);
const d = T.defaults();
check('defaults are an empty stable', d.v === 1 && d.n === 0 && d.roster.length === 0 && d.party.length === 0 && d.mount === null);
check('a good entry survives clean unchanged', (() => { const c = T.clean({ v: 1, n: 1, roster: [GOOD], party: ['t1'], mount: 't1' }); const t = c.roster[0]; return t.id === 't1' && t.sp === 'raptor' && t.nm === 'Rex' && t.lv === 3 && t.xp === 20 && t.bond === 3 && t.aff === 120 && t.cos === 'red_scarf' && t.isle === 'jungle' && t.d === '2026-11-21' && c.party[0] === 't1' && c.mount === 't1'; })());
check('clean is idempotent', (() => { const a = T.clean({ n: 5, roster: [GOOD, Object.assign({}, GOOD, { id: 't2' })], party: ['t2', 't1'] }); return JSON.stringify(T.clean(a)) === JSON.stringify(a); })());
check('corrupt values recover to the empty stable', [null, undefined, 5, 'x', [], true, NaN, () => 1].every((v) => JSON.stringify(T.clean(v)) === JSON.stringify(d)));
check('junk fields inside a save recover', (() => { const c = T.clean({ roster: 'nope', party: 7, mount: {}, n: 'x' }); return JSON.stringify(c) === JSON.stringify(d); })());
check('bad entries are dropped, good kept', (() => { const c = T.clean({ roster: [null, 5, 'x', [], {}, { id: 'bad id', sp: 'raptor' }, { id: 't9' }, { id: 't1', sp: 'Bad Sp' }, GOOD] }); return c.roster.length === 1 && c.roster[0].id === 't1'; })());
check('id must match /^t[0-9a-z]{1,6}$/', ['t', 'x1', 'T1', 't1234567', 't-1', 't1 ', '__proto__'].every((id) => T.clean({ roster: [Object.assign({}, GOOD, { id })] }).roster.length === 0) && T.clean({ roster: [Object.assign({}, GOOD, { id: 't123456' })] }).roster.length === 1);
check('level clamps to 1..30, xp below the level need', (() => { const hi = T.clean({ roster: [Object.assign({}, GOOD, { lv: 99, xp: 5000 })] }).roster[0]; const lo = T.clean({ roster: [Object.assign({}, GOOD, { lv: -4, xp: 5000 })] }).roster[0]; return hi.lv === 30 && hi.xp === 0 && lo.lv === 1 && lo.xp === T.xpNeed(1) - 1; })());
check('bond and affinity are clamped; NaN becomes defaults', (() => { const t = T.clean({ roster: [Object.assign({}, GOOD, { bond: 1e9, aff: -5 })] }).roster[0]; const u = T.clean({ roster: [Object.assign({}, GOOD, { bond: NaN, aff: 'x', lv: Infinity })] }).roster[0]; return t.bond === 10 && t.aff === 0 && u.bond === 1 && u.aff === 0 && u.lv === 1; })());
check('names are at most 16 chars, no markup or control chars', (() => { const t = T.clean({ roster: [Object.assign({}, GOOD, { nm: '<img src=x onerror=1>\u0000\n' + 'A'.repeat(40) })] }).roster[0]; return t.nm.length <= 16 && !/[<>\u0000\n"]/.test(t.nm); })());
check('non-string names become empty', [5, null, {}, [], NaN].every((nm) => T.clean({ roster: [Object.assign({}, GOOD, { nm })] }).roster[0].nm === ''));
check('bad date / cosmetic / isle are blanked', (() => { const t = T.clean({ roster: [Object.assign({}, GOOD, { d: '2026-13-45', cos: '<b>', isle: 'A B' })] }).roster[0]; return t.d === '' && t.cos === '' && t.isle === ''; })());
check('duplicate ids keep only the first', T.clean({ roster: [GOOD, Object.assign({}, GOOD, { nm: 'Other' })] }).roster.length === 1);
check('unknown species stay as inert entries', (() => { const c = T.clean({ roster: [Object.assign({}, GOOD, { id: 't2', sp: 'future_beast' })], party: ['t2'] }); return c.roster.length === 1 && c.roster[0].sp === 'future_beast' && c.party[0] === 't2'; })());

// caps
const many = []; for (let i = 0; i < 200; i++) many.push(Object.assign({}, GOOD, { id: 't' + i.toString(36) }));
check('roster caps at 60', T.clean({ roster: many }).roster.length === 60);
check('party caps at 2 and only lists roster ids, unique', (() => { const c = T.clean({ roster: many.slice(0, 5), party: ['t0', 't0', 'nope', 't1', 't2', 't3'] }); return c.party.length === 2 && c.party[0] === 't0' && c.party[1] === 't1'; })());
check('mount must be in the roster', T.clean({ roster: [GOOD], mount: 'zzz' }).mount === null && T.clean({ roster: [GOOD], mount: 't1' }).mount === 't1');
check('n never goes below the highest id', T.clean({ n: 0, roster: [Object.assign({}, GOOD, { id: 'tzz' })] }).n >= 36 * 35 + 35);

// prototype pollution
check('prototype pollution keys do nothing', (() => { const c = T.clean(JSON.parse('{"__proto__":{"evil":1},"constructor":{"x":1},"roster":[{"id":"t1","sp":"raptor","__proto__":{"z":1}}]}')); return ({}).evil === undefined && ({}).z === undefined && c.roster.length === 1 && !Object.prototype.hasOwnProperty.call(c.roster[0], 'z'); })());

// operations
const s = T.defaults();
const a = T.add(s, { sp: 'parrotlet', nm: 'Kiwi', isle: 'jungle', d: '2026-11-21' });
check('add creates an entry with a valid id and bumps n', a && /^t[0-9a-z]{1,6}$/.test(a.id) && a.lv === 1 && s.n === 1 && s.roster.length === 1);
check('add rejects junk', [null, {}, { sp: 'Bad' }, { sp: '' }, 5].every((x) => T.add(T.defaults(), x) === null) && T.add(null, { sp: 'x' }) === null);
check('add refuses past 60', (() => { const q = T.defaults(); for (let i = 0; i < 60; i++) T.add(q, { sp: 'raptor' }); return T.add(q, { sp: 'raptor' }) === null && q.roster.length === 60; })());
check('ids never repeat after a release', (() => { const q = T.defaults(); const x = T.add(q, { sp: 'a' }); T.release(q, x.id); const y = T.add(q, { sp: 'a' }); return x.id !== y.id; })());
check('setParty enforces 2 and existing ids', (() => { const q = T.defaults(); const ids = [1, 2, 3].map(() => T.add(q, { sp: 'raptor' }).id); const r = T.setParty(q, ids.concat(['nope'])); return r.length === 2 && q.party.length === 2 && T.setParty(q, 'x').length === 0; })());
check('release removes from party and mount', (() => { const q = T.defaults(); const x = T.add(q, { sp: 'raptor' }); T.setParty(q, [x.id]); T.setMount(q, x.id); return T.release(q, x.id) && q.party.length === 0 && q.mount === null && !T.release(q, x.id); })());
check('setMount validates and can clear', (() => { const q = T.defaults(); const x = T.add(q, { sp: 'raptor' }); return T.setMount(q, x.id) && q.mount === x.id && !T.setMount(q, 'nope') && T.setMount(q, null) && q.mount === null && !T.setMount(q, {}); })());
check('rename sanitises; cosmetic validates', (() => { const q = T.defaults(); const x = T.add(q, { sp: 'raptor' }); return T.rename(q, x.id, '<b>Rexy</b>'.repeat(5)) && q.roster[0].nm.length <= 16 && !/</.test(q.roster[0].nm) && T.setCosmetic(q, x.id, 'hat_1') && !T.setCosmetic(q, x.id, '<x>') && T.setCosmetic(q, x.id, '') && !T.rename(q, 'nope', 'a'); })());
check('gainXp levels up and stops at 30', (() => { const q = T.defaults(); const x = T.add(q, { sp: 'raptor' }); const g = T.gainXp(q, x.id, T.xpNeed(1) + T.xpNeed(2) + 3); const g2 = T.gainXp(q, x.id, 1e9); return g === 2 && g2 > 0 && x.lv === 30 && x.xp === 0 && T.gainXp(q, x.id, 50) === 0 && T.gainXp(q, 'nope', 5) === 0; })());
check('gainXp ignores junk amounts', (() => { const q = T.defaults(); const x = T.add(q, { sp: 'raptor' }); T.gainXp(q, x.id, NaN); T.gainXp(q, x.id, -50); T.gainXp(q, x.id, 'x'); return x.lv === 1 && x.xp === 0; })());
check('addAffinity clamps and raises bond', (() => { const q = T.defaults(); const x = T.add(q, { sp: 'raptor' }); T.addAffinity(q, x.id, 250); const b = x.bond; T.addAffinity(q, x.id, 1e9); T.addAffinity(q, x.id, -1e9); return b === 3 && x.aff === 0 && x.bond >= 3; })());

// storage
check('load of corrupt storage gives defaults, never throws', [null, 'garbage{', '[]', '5', '{"roster":"x"}'].every((v) => JSON.stringify(T.load(fake(v === null ? {} : { [T.KEY]: v }))) === JSON.stringify(d)) && JSON.stringify(T.load({ getItem() { throw new Error('x'); } })) === JSON.stringify(d) && JSON.stringify(T.load(null)) === JSON.stringify(d));
check('write cleans, round trips, and only ever writes its own key', (() => { const st = fake({ 'pixeltown-save-v1': '{"name":"Bo"}' }); const q = T.defaults(); T.add(q, { sp: 'raptor', nm: 'Rex' }); q.roster[0].nm = '<b>' + 'x'.repeat(40); const ok = T.write(st, q); const back = T.load(st); return ok && back.roster.length === 1 && back.roster[0].nm.length <= 16 && st.writes.every((k) => k === T.KEY) && st._m['pixeltown-save-v1'] === '{"name":"Bo"}'; })());
check('write failure returns false, no throw', T.write({ setItem() { throw new Error('quota'); } }, T.defaults()) === false);
check('a full 60-tame save stays small (under 20 KB)', JSON.stringify(T.clean({ roster: many })).length < 20000);
check('module never references the town save key', !/save-v1/.test(require('fs').readFileSync(require.resolve('../shared/mm-tames.js'), 'utf8').replace(/\/\/.*$/gm, '')));

console.log((bad ? 'FAILED ' + bad : 'ok') + ' (' + n + ' checks)');
process.exit(bad ? 1 : 0);
