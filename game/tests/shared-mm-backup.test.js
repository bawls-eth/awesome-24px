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

// A5: Biome Archipelago keys (tames, archipelago progress, isles medals)
const ISLE_KEYS = ['pixeltown-tames-v1', 'pixeltown-archipelago-v1', 'pixeltown-medals-isles-v1'];
ISLE_KEYS.forEach((k) => check('KNOWN includes ' + k, B.KNOWN.indexOf(k) >= 0));
check('version stays 2', B.VERSION === 2);
const isleSrc = fake({
  'pixeltown-save-v1': '{"name":"Bo"}',
  'pixeltown-tames-v1': JSON.stringify({ v: 1, n: 1, roster: [{ id: 't1', sp: 'raptor', nm: 'Rex', lv: 3 }], party: ['t1'], mount: null }),
  'pixeltown-archipelago-v1': JSON.stringify({ v: 1, at: 'jungle', unlock: ['jungle', 'ice'], isles: { jungle: { pos: { x: 10, y: 20 } } } }),
  'pixeltown-medals-isles-v1': '{"v":1,"m":["tame1"]}'
});
const isleBun = B.bundle(isleSrc);
check('export includes the three new keys', ISLE_KEYS.every((k) => typeof isleBun.keys[k] === 'string'));
const isleDst = fake();
const isleR = B.restore(isleDst, JSON.parse(JSON.stringify(isleBun)));
check('bundle -> plan -> apply keeps all three keys', isleR.ok && ISLE_KEYS.every((k) => k in isleDst._m) && JSON.parse(isleDst._m['pixeltown-tames-v1']).roster[0].nm === 'Rex' && JSON.parse(isleDst._m['pixeltown-archipelago-v1']).isles.jungle.pos.x === 10 && JSON.parse(isleDst._m['pixeltown-medals-isles-v1']).m[0] === 'tame1');
check('restore writes only keys that were in the bundle', (() => { const st = fake({ 'pixeltown-save-v1': '{"keep":1}' }); const r = B.restore(st, key('pixeltown-tames-v1', '{}')); return r.ok && st._m['pixeltown-save-v1'] === '{"keep":1}' && Object.keys(st._m).length === 2; })());
check('tames are cleaned on restore (caps, bad names, bad party)', (() => {
  const roster = []; for (let i = 0; i < 100; i++) roster.push({ id: 't' + i.toString(36), sp: 'raptor', nm: '<b>' + 'x'.repeat(40), lv: 99 });
  const p = B.plan(key('pixeltown-tames-v1', JSON.stringify({ roster, party: ['t0', 't1', 't2', 'zz'], mount: 'nope' })));
  const v = p.ok && JSON.parse(p.entries['pixeltown-tames-v1']);
  return p.ok && v.roster.length === 60 && v.party.length === 2 && v.mount === null && v.roster[0].lv === 30 && v.roster[0].nm.length <= 16 && v.roster[0].nm.indexOf('<') < 0;
})());
check('archipelago is cleaned on restore (grid cap, wild cap, junk dropped)', (() => {
  const grid = []; for (let i = 0; i < 700; i++) grid.push([i % 20, Math.floor(i / 20) % 20, 'fence']);
  const wild = {}; for (let i = 0; i < 9; i++) wild['jungle:g' + i + ':1'] = { torpor: 5, prog: 1, eff: 0.5, until: 5000 + i };
  const p = B.plan(key('pixeltown-archipelago-v1', JSON.stringify({ at: 'moon', evil: 1, home: { grid }, wild, unlock: ['ice', 'bogus'] })));
  const v = p.ok && JSON.parse(p.entries['pixeltown-archipelago-v1']);
  return p.ok && v.at === 'home' && v.evil === undefined && v.home.grid.length === 400 && Object.keys(v.wild).length === 4 && v.unlock.indexOf('bogus') < 0 && v.unlock.indexOf('ice') >= 0;
})());
check('medals are whitelisted on restore', (() => { const p = B.plan(key('pixeltown-medals-isles-v1', '{"v":1,"m":["tame1","evil","tame1"]}')); return p.ok && JSON.parse(p.entries['pixeltown-medals-isles-v1']).m.join() === 'tame1'; })());
check('non-object values for the new keys are refused, nothing written', ISLE_KEYS.every((k) => { const st = fake(); const r = B.restore(st, key(k, '[1,2]')); return !r.ok && r.error === 'bad-value' && Object.keys(st._m).length === 0; }) && ISLE_KEYS.every((k) => B.plan(key(k, 'garbage{')).error === 'bad-value'));
check('oversized new-key value rejected', B.plan(key('pixeltown-archipelago-v1', '{"a":"' + 'x'.repeat(2100000) + '"}')).error === 'bad-value');
check('hostile new-key values never throw', [null, 5, '"x"', '{"__proto__":{"a":1}}', '{"roster":{"length":1e9}}'].every((v) => { try { B.plan(key('pixeltown-tames-v1', v)); B.plan(key('pixeltown-archipelago-v1', v)); return true; } catch (e) { return false; } }));
check('an old v2 bundle without the new keys restores identically', (() => { const st = fake(); const r = B.restore(st, { format: 'pixeltown-backup', v: 2, keys: { 'pixeltown-save-v1': '{"name":"Old"}', 'pixeltown-jam-v1': '{"offset":0}' } }); return r.ok && r.restored.length === 2 && st._m['pixeltown-jam-v1'] === '{"offset":0}' && !ISLE_KEYS.some((k) => k in st._m); })());
check('old bundle plus new keys together round trip', (() => { const st = fake(); const bk = JSON.parse(JSON.stringify(bun)); ISLE_KEYS.forEach((k) => { bk.keys[k] = isleBun.keys[k]; }); const r = B.restore(st, bk); return r.ok && r.restored.length === 8; })());
check('the new keys have readable labels', ISLE_KEYS.every((k) => B.labelOf(k) !== k));

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
