// G16: soulbound + co-op guards. Node: node game/tests/shared-mm-gear-soulbound.test.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const S = require('../shared/mm-stash.js');
const P = require('../shared/mm-profile.js');
let pass = 0, fail = 0;
function check(name, cond, info) { if (cond) pass++; else { fail++; console.log('FAIL: ' + name + (info ? ' ' + info : '')); } }
const prof = (extra) => P.clean(Object.assign({ heroes: [{ id: 'h1', name: 'Bo', cls: 'ranger', level: 5 }] }, extra));
const pay = (items, opts) => {
  const f = items.reduce((acc, it, i) => S.record(acc, Object.assign({ n: i + 1 }, it), 'world'), null);
  return S.payout(prof(), items.map((_, i) => ({ n: i + 1 })), f, opts || { heroId: 'h1' });
};

// 1. soulbound items are refused; everything below T11 moves and keeps t/a
const r = pay([{ id: 'sparkwand', r: 1, t: 11 }, { id: 'sparkwand', r: 3, t: 12, a: 99 }, { id: 'sparkwand', r: 0, t: 10, a: 5 }, { id: 'wpn_bow_triple', r: 2, t: 3, a: 7 }, { id: 'sparkwand', r: 1 }]);
const all = r.profile.stash.filter(Boolean).concat(r.profile.heroes[0].items);
check('T11 and T12 are refused', r.soulbound === 2 && !all.some((i) => i.t >= 11), JSON.stringify(all));
check('three other items moved', r.items === 3 && all.length === 3);
check('T10 keeps t and a', all.some((i) => i.t === 10 && i.a === 5));
check('T3 keeps t but a is dropped (a only from T7)', all.some((i) => i.id === 'wpn_bow_triple' && i.t === 3 && i.a === undefined));
check('old item {id,r} stays exactly that', JSON.stringify(all.find((i) => i.id === 'sparkwand' && i.r === 1 && !i.t)) === '{"id":"sparkwand","r":1}');
check('refused finds are not left waiting', r.waiting === 0 && r.finds.pending.length === 0);
check('text mentions soulbound calmly', /soulbound/.test(S.text(r)) && !/urgent|hurry|now!/i.test(S.text(r)));
check('S.soulbound helper', S.soulbound({ t: 11 }) && S.soulbound({ t: 12 }) && !S.soulbound({ t: 10 }) && !S.soulbound({}) && !S.soulbound({ t: '12' }) && !S.soulbound(null));
// T3 round-trips through settle() on a storage double
const m = {}; const st = { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } };
m['pixeltown-mm-v1'] = JSON.stringify(prof());
m['pixeltown-save-v1'] = JSON.stringify({ realm: { items: [{ n: 4, id: 'wpn_bow_triple', r: 2, t: 3 }, { n: 5, id: 'sparkwand', r: 1, t: 12, a: 9 }] } });
S.recordTo(st, { n: 4, id: 'wpn_bow_triple', r: 2, t: 3 }, 'world'); S.recordTo(st, { n: 5, id: 'sparkwand', r: 1, t: 12, a: 9 }, 'world');
const sr = S.settle(st, { Profile: P });
const saved = JSON.parse(m['pixeltown-mm-v1']);
check('settle(): T3 deposit round-trips t, T12 stays out', sr.ok && saved.stash[0] && saved.stash[0].t === 3 && saved.stash.filter(Boolean).length === 1 && sr.soulbound === 1, JSON.stringify(saved.stash.slice(0, 2)));

// 2. hostile input
const hos = pay([{ id: 'sparkwand', r: 0, t: '12' }, { id: 'sparkwand', r: 0, t: 13 }, { id: 'sparkwand', r: 0, t: -1 }, { id: 'sparkwand', r: 0, t: 1.5 }, { id: 'sparkwand', r: 0, t: 7, a: 2 ** 32 }, { id: 'sparkwand', r: 0, t: 7, a: '5' }, { id: 'sparkwand', r: 0, t: NaN }]);
const hi = hos.profile.stash.filter(Boolean);
check('hostile t/a never survive as-is', hi.length === 7 && hi.every((i) => i.t === undefined || (i.t === 7 && i.a === undefined)), JSON.stringify(hi));
check('string t "12" does not smuggle a soulbound past the guard (it is dropped to T0)', hos.soulbound === 0 && hi[0].t === undefined);
const pol = S.cleanFinds(JSON.parse('{"pending":[{"n":1,"id":"sparkwand","r":0,"t":11,"__proto__":{"x":1},"extra":1}]}'));
check('cleanFinds drops unknown keys and keeps valid t', pol.pending[0].t === 11 && pol.pending[0].extra === undefined && ({}).x === undefined);
const frozen = Object.freeze({ n: 1, id: 'sparkwand', r: 0, t: 12, a: 1 });
check('record/payout never mutate input', (() => { const f = S.record(null, frozen, 'world'); return f.pending[0].t === 12 && frozen.t === 12; })());

// 3. profile: old fixtures identical, additive t/a
const OLD = { v: 1, heroes: [{ id: 'a', name: 'Aya', cls: 'ranger', level: 3, xp: 4, fame: 5, bonus: 0, mode: 'classic', items: [{ id: 'sparkwand', r: 2, n: 5 }, { id: 'wpn_bow_triple', r: 1 }], keepsake: { id: 'keepsake', r: 0, keepsake: true, from: 'Bo', cls: 'ranger', level: 4 } }], stash: [{ id: 'sparkwand', r: 3 }].concat(new Array(15).fill(null)), fame: 9, mode: 'classic', hall: [], migratedFrom: null };
const c1 = JSON.stringify(P.clean(OLD));
check('old profile fixture re-cleans byte-identical', JSON.stringify(P.clean(JSON.parse(c1))) === c1);
check('old items gain no t/a keys', !/"t":|"a":/.test(c1.replace(/"mode"|"cls"/g, '')));
const NEW = P.clean({ heroes: [{ id: 'a', items: [{ id: 'sparkwand', r: 1, t: 8, a: 123 }, { id: 'sparkwand', r: 1, t: 3, a: 123 }, { id: 'sparkwand', r: 1, t: 99, a: 1 }, { id: 'sparkwand', r: 1, t: '5' }, { id: 'sparkwand', r: 1, t: 12, a: 0 }] }], stash: [{ id: 'sparkwand', r: 0, t: 11, a: 4294967295 }] });
const ii = NEW.heroes[0].items;
check('profile keeps t/a when valid', ii[0].t === 8 && ii[0].a === 123 && NEW.stash[0].t === 11 && NEW.stash[0].a === 4294967295);
check('profile drops a below T7, invalid t, string t, a=0', ii[1].t === 3 && ii[1].a === undefined && ii[2].t === undefined && ii[3].t === undefined && ii[4].t === 12 && ii[4].a === undefined);
check('profile with t/a is stable on re-clean', JSON.stringify(P.clean(JSON.parse(JSON.stringify(NEW)))) === JSON.stringify(NEW));
const leg = P.importLegacy({ level: 2, xp: 0, items: [{ n: 1, id: 'sparkwand', r: 0, t: 9, a: 5 }, { n: 2, id: 'sparkwand', r: 1 }] });
check('importLegacy carries t/a and leaves old items alone', leg.heroes[0].items[0].t === 9 && leg.heroes[0].items[0].a === 5 && JSON.stringify(leg.heroes[0].items[1]) === '{"id":"sparkwand","r":1,"n":2}');

// 4. co-op guard: the team `loot` event never carries t (realm-team.js is not a module, so check the source and the clamp itself)
const rt = fs.readFileSync(path.join(__dirname, '..', 'realm-team.js'), 'utf8');
const rtNumSrc = (rt.match(/function rtNum\(v, min, max, def\) \{[\s\S]*?\n\}/) || [''])[0];
const rtNum = rtNumSrc ? vm.runInNewContext('(' + rtNumSrc.replace(/^function rtNum/, 'function') + ')') : null;
check('rtNum clamps loot rarity to 0..2 (and drops garbage)', !!rtNum && rtNum(3, 0, 2, 0) === 2 && rtNum(-5, 0, 2, 0) === 0 && rtNum('x', 0, 2, 0) === 0 && rtNum(99, 0, 2, 0) === 2);
const lootLine = rt.split('\n').filter((l) => /e\.k === 'loot'/.test(l)).join('\n');
check('loot receiver reads only d[0] (id) and d[1] (rarity)', /d\[0\]/.test(lootLine) && /d\[1\]/.test(lootLine) && !/d\[2\]/.test(lootLine) && !/\bt\b\s*[:=]|\.t\b/.test(lootLine.replace(/e\.k/g, '')), lootLine.slice(0, 120));
const rj = fs.readFileSync(path.join(__dirname, '..', 'realm.js'), 'utf8');
const emit = rj.split('\n').filter((l) => /\.team\.ev\('loot'/.test(l));
check('loot emit sends exactly [id, rarity]', emit.length >= 1 && emit.every((l) => /ev\('loot', \[b\.id, b\.r\]/.test(l)), emit.join('|').slice(0, 160));
check('shareKill is not tiered (no t in the shared-kill path of realm-team.js)', !/\bshareKill\b[^\n]*\bt:/.test(rt));

console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
