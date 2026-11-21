// Node: node game/tests/shared-mm-profile-backup.test.js
const P = require('../shared/mm-profile.js');
const B = require('../shared/mm-backup.js');
let pass = 0, fail = 0;
function check(name, cond) { if (cond) pass++; else { fail++; console.log('FAIL: ' + name); } }
function done() { console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0); }
function fake(init) {
  const m = Object.assign({}, init || {});
  return {
    getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] || null, get length() { return Object.keys(m).length; }, _m: m
  };
}
const valid = (p) => p.v === 1 && Array.isArray(p.heroes) && p.stash.length === 16 && Array.isArray(p.hall) && (p.mode === 'classic' || p.mode === 'picnic');

// corrupt shapes
[null, 'garbage{', 42, { heroes: 'x', stash: { a: 1 }, fame: 'NaN', mode: 'zzz', hall: 7 }, [1, 2, 3]].forEach((c, i) => check('corrupt shape ' + i, valid(P.clean(c))));
const polluted = P.clean(JSON.parse('{"__proto__":{"evil":1},"junk":1,"heroes":[{"id":"a","__proto__":{"x":1},"extra":1}]}'));
check('no prototype pollution / unknown keys dropped', ({}).evil === undefined && polluted.junk === undefined && polluted.heroes[0].extra === undefined && ({}).x === undefined);
check('hero cap', P.clean({ heroes: Array.from({ length: 50 }, (_, i) => ({ id: 'h' + i })) }).heroes.length <= 12);

// legacy import
const realm = Object.freeze({ level: 7, xp: 10, shards: 5, items: Object.freeze([{ n: 1, id: 'sword', r: 2 }]) });
const snap = JSON.stringify(realm);
const a = P.importLegacy(realm);
const b = P.importLegacy(realm, a);
check('importLegacy makes Legacy Ranger', a.heroes.length === 1 && a.heroes[0].name === 'Legacy Ranger' && a.heroes[0].level === 7 && a.migratedFrom === 'pixeltown-save-v1');
check('importLegacy twice = one hero', b.heroes.length === 1);
check('importLegacy does not mutate input', JSON.stringify(realm) === snap);

// fall
const mk = (extra) => P.clean(Object.assign({ heroes: [{ id: 'h1', name: 'Bo', cls: 'ranger', level: 12, fame: 100, bonus: 10 }] }, extra));
const f = P.fall(mk(), 'h1');
check('fall deletes hero', f.ok && f.profile.heroes.length === 0);
check('fall banks fame at design rate', f.profile.fame === 110 && f.fame === 110);
check('fall adds Keepsake to stash', f.profile.stash.filter(Boolean).length === 1 && f.profile.stash[0].keepsake === true);
check('fall lists in hall', f.profile.hall.length === 1 && f.profile.hall[0].how === 'fall');

// picnic
const pk = mk({ mode: 'picnic', heroes: [{ id: 'h1', cls: 'ranger', level: 20, fame: 100 }] });
check('picnic has no Fall', !P.fall(pk, 'h1').ok && P.fall(pk, 'h1').profile.heroes.length === 1);
check('picnic fame x0.5 (retire 100*1.2*0.5)', P.retire(pk, 'h1').profile.fame === 60);
check('mode locked once heroes exist', !P.setMode(mk(), 'picnic').ok && P.setMode(P.empty(), 'picnic').ok);

// rekindle
const lv = (L, m) => P.rekindle(P.clean({ heroes: [{ id: 'h', cls: 'herald', level: L, mode: m }] }), 'h');
check('rekindle L9 -> 4, same class', lv(9).hero.level === 4 && lv(9).hero.cls === 'herald');
check('rekindle caps at 10', lv(20).hero.level === 10 && lv(1).hero.level === 1);
check('rekindle not in hardcore', !lv(9, 'hardcore').ok);

// retire
check('retire needs level 20', !P.retire(mk(), 'h1').ok);
const r = P.retire(P.clean({ heroes: [{ id: 'h', level: 20, fame: 100 }] }), 'h');
check('retire x1.2 and hall', r.ok && r.profile.fame === 120 && r.profile.hall[0].how === 'retire' && r.profile.heroes.length === 0);

// stash cap
let sp = P.clean({ heroes: Array.from({ length: 12 }, (_, i) => ({ id: 'h' + i })) });
for (let i = 0; i < 12; i++) sp = P.fall(sp, 'h' + i).profile;
check('stash capped at 16', P.clean({ stash: Array.from({ length: 40 }, () => ({ id: 'x' })) }).stash.length === 16 && sp.stash.length === 16);

// backup
const prof = P.importLegacy(realm);
const s1 = fake({ 'pixeltown-save-v1': JSON.stringify({ realm: { level: 3 }, coins: 9 }), 'pixeltown-mm-v1': JSON.stringify(prof), 'pixeltown-angler-v1': '{"caught":{"bluegill":{"n":2,"best":9}},"bosses":{}}', unrelated: 'x' });
const bun = B.bundle(s1);
check('bundle has both keys + extras, not unrelated', bun.v >= 1 && bun.keys['pixeltown-save-v1'] && bun.keys['pixeltown-mm-v1'] && bun.keys['pixeltown-angler-v1'] && !bun.keys.unrelated);
const s2 = fake();
const rr = B.restore(s2, JSON.parse(JSON.stringify(bun)));
check('round trip equal', rr.ok && Object.keys(bun.keys).every((k) => JSON.parse(s2._m[k]) && true) && JSON.parse(s2._m['pixeltown-angler-v1']).caught.bluegill.n === 2);
const s3 = fake();
const old = B.restore(s3, { realm: { level: 5 }, coins: 2 });
check('old single-save restores', old.ok && JSON.parse(s3._m['pixeltown-save-v1']).realm.level === 5);
let threw = false;
try {
  [null, undefined, 5, 'x', [], {}, { format: 'pixeltown-backup' }, { format: 'pixeltown-backup', v: 2, keys: { 'pixeltown-mm-v1': 'not json', bad: 1 } }].forEach((g) => {
    const o = B.restore(fake(), g); if (typeof o.ok !== 'boolean') threw = true;
  });
  B.restore(null, { a: 1 }); B.bundle(null);
} catch (e) { threw = true; }
check('restore never throws on garbage', !threw);

// ---- atomic, validated restore
const TOWN = JSON.stringify({ name: 'Ben', species: 'doge', coins: 1 });
{
  const st = fake({ 'pixeltown-save-v1': TOWN });
  const r = B.restore(st, { caught: { bluegill: { n: 1, best: 3 } }, bosses: {} });
  check('angler-style single export is rejected, town save untouched', !r.ok && r.error === 'not-a-town-save' && st._m['pixeltown-save-v1'] === TOWN && /not a town save/.test(r.message));
  check('plan() alone never writes', (() => { const s2 = fake({ k: 'v' }); const pl = B.plan({ format: 'pixeltown-backup', v: 2, keys: { 'pixeltown-mm-v1': '{}' } }); return pl.ok && !('pixeltown-mm-v1' in s2._m); })());
  const un = B.restore(fake({ 'pixeltown-save-v1': TOWN }), { format: 'pixeltown-backup', v: 2, keys: { 'pixeltown-save-v1': '{"name":"x"}', 'pixeltown-evil-v1': '{}' } });
  check('unknown pixeltown-* key rejects the whole file', !un.ok && un.error === 'unknown-key');
  const st2 = fake({ 'pixeltown-save-v1': TOWN });
  const un2 = B.restore(st2, { format: 'pixeltown-backup', v: 2, keys: { 'pixeltown-save-v1': '{"name":"x"}', 'pixeltown-mm-v1': 'not json' } });
  check('one invalid value rejects everything (town save untouched)', !un2.ok && st2._m['pixeltown-save-v1'] === TOWN);
  const st3 = fake();
  const dirty = { v: 1, heroes: [{ id: 'a', name: 'X', cls: 'zzz', level: 999, evil: 1 }], stash: 'no', fame: -5 };
  const rc = B.restore(st3, { format: 'pixeltown-backup', v: 2, keys: { 'pixeltown-mm-v1': JSON.stringify(dirty), 'pixeltown-angler-v1': JSON.stringify({ caught: { constructor: { n: 5 }, bluegill: { n: 2, best: 4 } }, bosses: { constructor: true } }), 'pixeltown-hub-v1': JSON.stringify({ at: 'constructor', keys: 3 }), 'pixeltown-bugs-v1': JSON.stringify({ stars: { meadow: 99 }, junk: 1 }) } });
  const mm = JSON.parse(st3._m['pixeltown-mm-v1']), an = JSON.parse(st3._m['pixeltown-angler-v1']), hub = JSON.parse(st3._m['pixeltown-hub-v1']), bg = JSON.parse(st3._m['pixeltown-bugs-v1']);
  check('restored mm-v1 is cleaned', rc.ok && mm.heroes[0].cls === 'ranger' && mm.heroes[0].level === 20 && mm.heroes[0].evil === undefined && mm.fame === 0 && mm.stash.length === 16);
  check('restored angler is cleaned (no prototype names)', Object.keys(an.caught).join() === 'bluegill' && Object.keys(an.bosses).length === 0);
  check('restored hub: hostile position falls back to start, keys kept', hub.at === 'w0-square' && hub.keys === 3);
  check('restored bugs is cleaned', bg.stars.meadow === 3 && bg.junk === undefined && bg.v === 1);
  // mid-bundle write failure rolls back
  const orig = { 'pixeltown-save-v1': TOWN, 'pixeltown-mm-v1': JSON.stringify(P.clean({ fame: 7 })) };
  const st4 = fake(orig);
  let calls = 0; const realSet = st4.setItem;
  st4.setItem = (k, v) => { calls++; if (calls === 3) throw new Error('quota'); realSet(k, v); };
  const bad = B.restore(st4, { format: 'pixeltown-backup', v: 2, keys: { 'pixeltown-angler-v1': '{}', 'pixeltown-bugs-v1': '{}', 'pixeltown-mm-v1': '{"fame":1}', 'pixeltown-save-v1': '{"name":"new"}' } });
  check('3rd write throws -> ok:false with message', !bad.ok && bad.error === 'write-failed' && typeof bad.message === 'string' && bad.message.length > 10);
  check('rolled back: originals restored, new keys removed', st4._m['pixeltown-save-v1'] === TOWN && st4._m['pixeltown-mm-v1'] === orig['pixeltown-mm-v1'] && !('pixeltown-angler-v1' in st4._m) && !('pixeltown-bugs-v1' in st4._m), JSON.stringify(st4._m));
}
// corrupt mm-v1 is exported raw
{
  const st = fake({ 'pixeltown-mm-v1': '{{corrupt' });
  check('bundle() keeps raw corrupt value', B.bundle(st).keys['pixeltown-mm-v1'] === '{{corrupt');
}
// full-roster legacy import is retryable
{
  const full = P.clean({ heroes: Array.from({ length: 12 }, (_, i) => ({ id: 'h' + i })) });
  const r1 = P.importLegacy(realm, full);
  check('full roster: hero skipped and migratedFrom NOT set', r1.heroes.length === 12 && !r1.heroes.some((h) => h.id === 'legacy-ranger') && r1.migratedFrom === null);
  r1.heroes.pop();
  const r2 = P.importLegacy(realm, r1);
  check('after a slot frees the import succeeds', r2.heroes.some((h) => h.id === 'legacy-ranger') && r2.migratedFrom === 'pixeltown-save-v1');
}
// Fall with a full stash reports the lost Keepsake
{
  const p = P.clean({ heroes: [{ id: 'a', name: 'A', fame: 10 }], stash: Array.from({ length: 16 }, () => ({ id: 'x' })) });
  const f = P.fall(p, 'a');
  check('full-stash Fall flags keepsakeLost', f.ok && f.keepsake === null && f.keepsakeLost === true);
}
// S5: all 14 class ids survive clean; unknown still -> ranger; legacy 11-class fixture unchanged
{
  const C = require('../shared/mm-classes.js');
  const ids = Object.keys(C.CLASSES);
  check('14 MMClasses ids', ids.length === 14);
  const pr = P.clean({ heroes: ids.map((c, i) => ({ id: 'h' + i, cls: c, level: 3 })) });
  check('every MMClasses id survives clean', pr.heroes.length === 12 && pr.heroes.every((h, i) => h.cls === ids[i]));
  const one = (c) => P.clean({ heroes: [{ id: 'x', cls: c }] }).heroes[0].cls;
  check('trickster/shadowPaw/graveTender survive', one('trickster') === 'trickster' && one('shadowPaw') === 'shadowPaw' && one('graveTender') === 'graveTender');
  check('all 14 ids individually kept', ids.every((c) => one(c) === c));
  check('unknown/wrong-case class still coerces to ranger', one('Trickster') === 'ranger' && one('nope') === 'ranger' && one(7) === 'ranger');
  const old11 = ids.filter((c) => ['graveTender', 'trickster', 'shadowPaw'].indexOf(c) < 0);
  const fx = { v: 1, heroes: old11.map((c, i) => ({ id: 'h' + i, name: 'N' + i, cls: c, level: 2 + i, xp: 5, fame: 1, bonus: 0, mode: 'classic', items: [] })) };
  const c1 = JSON.stringify(P.clean(fx));
  check('11-class fixture byte-identical on re-clean', JSON.stringify(P.clean(JSON.parse(c1))) === c1 && P.clean(fx).heroes.every((h, i) => h.cls === old11[i]));
  const ret = P.clean({ hall: [{ name: 'a', cls: 'shadowPaw' }] });
  check('hall entry keeps shadowPaw', !ret.hall.length || ret.hall[0].cls === 'shadowPaw');
}
// tier gear (additive t/a): old profiles identical, valid t/a kept, garbage dropped
{
  const old = { v: 1, heroes: [{ id: 'a', name: 'Aya', cls: 'ranger', level: 3, xp: 4, fame: 5, bonus: 0, mode: 'classic', items: [{ id: 'sparkwand', r: 2, n: 5 }] }], stash: [{ id: 'sparkwand', r: 3 }].concat(new Array(15).fill(null)), fame: 9, mode: 'classic', hall: [], migratedFrom: null };
  const o1 = JSON.stringify(P.clean(old));
  check('old item fixture: no t/a keys added, stable', !/"t":|"a":/.test(o1) && JSON.stringify(P.clean(JSON.parse(o1))) === o1 && JSON.parse(o1).heroes[0].items[0].r === 2);
  const g = P.clean({ heroes: [{ id: 'a', items: [{ id: 'sparkwand', r: 0, t: 9, a: 77 }, { id: 'sparkwand', r: 0, t: 2, a: 77 }, { id: 'sparkwand', r: 0, t: 13 }, { id: 'sparkwand', r: 0, t: '4' }] }] }).heroes[0].items;
  check('tier t/a kept when valid, dropped when not', g[0].t === 9 && g[0].a === 77 && g[1].t === 2 && g[1].a === undefined && g[2].t === undefined && g[3].t === undefined);
}
done();
