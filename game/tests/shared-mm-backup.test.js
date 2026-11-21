// Node: node game/tests/shared-mm-backup.test.js   (Backup v2: all pixeltown-* game keys)
const B = require('../shared/mm-backup.js');
let pass = 0, fail = 0;
function check(name, cond) { if (cond) pass++; else { fail++; console.log('FAIL: ' + name); } }
function fake(init) {
  const m = Object.assign({}, init || {});
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, _m: m };
}
const NEW = ['pixeltown-realm-v1', 'pixeltown-arms-v1', 'pixeltown-stalk-v1', 'pixeltown-jam-v1'];
check('version field is 2', B.VERSION === 2 && B.bundle(fake()).v === 2 && B.bundle(fake()).format === 'pixeltown-backup');
NEW.concat(['pixeltown-save-v1', 'pixeltown-mm-v1']).forEach((k) => check('KNOWN includes ' + k, B.KNOWN.indexOf(k) >= 0));

const src = fake({ 'pixeltown-save-v1': '{"name":"Bo"}', 'pixeltown-realm-v1': '{"level":3,"finds":[1,2]}', 'pixeltown-arms-v1': '{"v":1,"seen":["a"]}',
  'pixeltown-stalk-v1': '{"bells":5}', 'pixeltown-jam-v1': '{"offset":0}', 'pixeltown-unrelated': 'x' });
const bun = B.bundle(src);
check('export has realm/arms/stalk/jam/save', NEW.concat(['pixeltown-save-v1']).every((k) => typeof bun.keys[k] === 'string'));
check('export skips unrelated keys', !('pixeltown-unrelated' in bun.keys));
const dst = fake();
const r = B.restore(dst, JSON.parse(JSON.stringify(bun)));
check('round trip restores all', r.ok && r.restored.length === 5 && JSON.parse(dst._m['pixeltown-realm-v1']).level === 3 && dst._m['pixeltown-jam-v1'] === '{"offset":0}');

// v1 backup (older bundle version and plain town save)
const v1 = B.restore(fake(), { format: 'pixeltown-backup', v: 1, keys: { 'pixeltown-save-v1': '{"name":"Old"}' } });
check('v1 bundle still restores', v1.ok && v1.restored[0] === 'pixeltown-save-v1');
const plain = B.restore(fake(), { name: 'Old', species: 'cat' });
check('old plain town save still restores', plain.ok);

// hostile input
const key = (k, v) => ({ format: 'pixeltown-backup', v: 2, keys: { [k]: v } });
const st = fake({ 'pixeltown-realm-v1': '{"keep":1}' });
const unk = B.restore(st, { format: 'pixeltown-backup', v: 2, keys: { 'pixeltown-realm-v1': '{}', 'pixeltown-evil-v1': '{}' } });
check('unknown key rejects whole bundle, writes nothing', !unk.ok && unk.error === 'unknown-key' && st._m['pixeltown-realm-v1'] === '{"keep":1}' && !('pixeltown-evil-v1' in st._m));
check('not json', B.plan('{{').error === 'not-json');
check('array / null / number rejected', [[], null, 5].every((x) => !B.plan(x).ok));
check('bad value string rejected', B.plan(key('pixeltown-jam-v1', 'garbage{')).error === 'bad-value');
check('array value rejected for realm', !B.plan(key('pixeltown-realm-v1', '[1,2]')).ok);
check('oversized value rejected', B.plan(key('pixeltown-stalk-v1', '{"a":"' + 'x'.repeat(2100000) + '"}')).error === 'bad-value');
const big = {};
NEW.forEach((k) => { big[k] = '{"a":"' + 'x'.repeat(1900000) + '"}'; });
big['pixeltown-save-v1'] = '{"name":"' + 'y'.repeat(1900000) + '"}';
check('oversized total rejected with a message', (() => { const p = B.plan({ format: 'pixeltown-backup', v: 2, keys: big }); return !p.ok && p.error === 'too-big' && /too big/.test(p.message); })());
const many = {}; for (let i = 0; i < 60; i++) many['pixeltown-k' + i] = '{}';
check('too many keys rejected', B.plan({ format: 'pixeltown-backup', v: 2, keys: many }).error === 'too-many-keys');
const deep = '{"a":'.repeat(30) + '1' + '}'.repeat(30);
check('over-deep value rejected', !B.plan(key('pixeltown-arms-v1', deep)).ok);
const pol = B.plan(key('pixeltown-realm-v1', '{"__proto__":{"evil":1},"constructor":{"x":1},"ok":1,"n":{"__proto__":{"z":1}}}'));
const pv = pol.ok && JSON.parse(pol.entries['pixeltown-realm-v1']);
check('prototype keys dropped, rest kept', pol.ok && pv.ok === 1 && !Object.prototype.hasOwnProperty.call(pv, 'constructor') && ({}).evil === undefined && ({}).z === undefined);
check('plan has messages and never throws on junk', [undefined, NaN, () => 1, { format: 'pixeltown-backup' }, { format: 'pixeltown-backup', v: 2, keys: [] }].every((x) => { const p = B.plan(x); return p.ok === false && typeof p.message === 'string'; }));
check('plan alone writes nothing', (() => { const s = fake(); B.plan(key('pixeltown-jam-v1', '{}')); return Object.keys(s._m).length === 0; })());
const failing = fake(); failing.setItem = () => { throw new Error('quota'); };
check('write failure reports, no throw', B.restore(failing, key('pixeltown-jam-v1', '{}')).ok === false);

// AC1/GF1: the two new additive keys
['pixeltown-access-v1', 'pixeltown-gift-v1'].forEach((k) => check('KNOWN includes ' + k, B.KNOWN.indexOf(k) >= 0));
check('backup round-trips the access prefs', (() => { const st = fake(); const r = B.restore(st, key('pixeltown-access-v1', '{"palette":"protanopia","lowGfx":true}')); return r.ok && JSON.parse(st._m['pixeltown-access-v1']).palette === 'protanopia'; })());
check('backup cleans the gift save', (() => { const st = fake(); const r = B.restore(st, key('pixeltown-gift-v1', '{"days":1e99,"evil":1}')); const v = JSON.parse(st._m['pixeltown-gift-v1']); return r.ok && v.days === 99999 && v.evil === undefined; })());
check('a bundle without the new keys still restores', B.restore(fake(), key('pixeltown-jam-v1', '{}')).ok);

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
