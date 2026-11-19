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
const s1 = fake({ 'pixeltown-save-v1': JSON.stringify({ realm: { level: 3 }, coins: 9 }), 'pixeltown-mm-v1': JSON.stringify(prof), 'pixeltown-other': '{"a":1}', unrelated: 'x' });
const bun = B.bundle(s1);
check('bundle has both keys + extras, not unrelated', bun.v >= 1 && bun.keys['pixeltown-save-v1'] && bun.keys['pixeltown-mm-v1'] && bun.keys['pixeltown-other'] && !bun.keys.unrelated);
const s2 = fake();
const rr = B.restore(s2, JSON.parse(JSON.stringify(bun)));
check('round trip equal', rr.ok && JSON.stringify(B.bundle(s2)) === JSON.stringify(bun));
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
done();
