// Run: node game/tests/shared-mm-access.test.js   (AC1: accessibility prefs on pixeltown-access-v1 + backup KNOWN)
const A = require('../shared/mm-access.js'), B = require('../shared/mm-backup.js');
const P = A.prefs;
let n = 0, bad = 0;
function check(name, ok) { n++; if (!ok) { bad++; console.log('FAIL ' + name); } }
function fake(init, opts) {
  const m = Object.assign({}, init || {});
  return { getItem: (k) => { if (opts && opts.throwGet) throw new Error('x'); return k in m ? m[k] : null; }, setItem: (k, v) => { if (opts && opts.throwSet) throw new Error('full'); m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, _m: m };
}
const K = 'pixeltown-access-v1';
const D = P.defaults();
const J = JSON.stringify;
check('key name', P.KEY === K);
check('defaults', D.palette === 'normal' && D.hudScale === 1 && D.flashes === true && D.bulletOutline === true && D.lowGfx === false && D.v === 1);
check('defaults() returns a fresh copy', P.defaults() !== P.defaults() && Object.isFrozen(P.DEFAULTS));
check('empty storage -> defaults', J(P.load(fake())) === J(D));
check('save then load round trip', (() => { const st = fake(); P.save(st, { palette: 'protanopia', hudScale: 1.5, flashes: false, bulletOutline: false, lowGfx: true }); const l = P.load(st); return l.palette === 'protanopia' && l.hudScale === 1.5 && l.flashes === false && l.bulletOutline === false && l.lowGfx === true && typeof st._m[K] === 'string'; })());
check('every palette name is accepted', A.names().every((nm) => P.clean({ palette: nm }).palette === nm));
check('unknown palette -> normal', P.clean({ palette: 'neon' }).palette === 'normal' && P.clean({ palette: '__proto__' }).palette === 'normal' && P.clean({ palette: 'toString' }).palette === 'normal' && P.clean({ palette: 5 }).palette === 'normal');
check('hudScale only 1 / 1.25 / 1.5', P.clean({ hudScale: 1.25 }).hudScale === 1.25 && P.clean({ hudScale: 2 }).hudScale === 1 && P.clean({ hudScale: '1.5' }).hudScale === 1 && P.clean({ hudScale: NaN }).hudScale === 1 && P.clean({ hudScale: Infinity }).hudScale === 1 && P.clean({ hudScale: -1.5 }).hudScale === 1);
check('booleans must be real booleans', P.clean({ flashes: 'false' }).flashes === true && P.clean({ flashes: 0 }).flashes === true && P.clean({ lowGfx: 1 }).lowGfx === false && P.clean({ lowGfx: 'yes' }).lowGfx === false && P.clean({ bulletOutline: null }).bulletOutline === true);
check('non-object input -> defaults', [null, undefined, 5, 'str', true, [], [1, 2]].every((v) => J(P.clean(v)) === J(D)));
check('unknown keys dropped', Object.keys(P.clean(JSON.parse('{"palette":"tritanopia","evil":1,"__proto__":{"x":1},"constructor":5}'))).sort().join() === 'bulletOutline,flashes,hudScale,lowGfx,palette,v');
check('input never mutated', (() => { const i = { palette: 'x', hudScale: 9, extra: 1 }; const s = J(i); P.clean(i); return J(i) === s; })());
check('corrupt JSON -> defaults', ['{', 'not json', '[1,', '', 'null', '"palette"', '12'].every((s) => J(P.load(fake({ [K]: s }))) === J(D)));
check('oversized value -> defaults', J(P.load(fake({ [K]: J({ palette: 'protanopia', pad: 'x'.repeat(5000) }) }))) === J(D));
check('partly bad save keeps the good fields', (() => { const l = P.load(fake({ [K]: '{"palette":"protanopia","hudScale":7,"lowGfx":true,"flashes":"no"}' })); return l.palette === 'protanopia' && l.hudScale === 1 && l.lowGfx === true && l.flashes === true; })());
check('throwing storage never throws', J(P.load(fake({}, { throwGet: true }))) === J(D) && P.save(fake({}, { throwSet: true }), { palette: 'protanopia' }) === null && J(P.load(null)) === J(D) && P.save(null, {}) === null);
check('save stores cleaned data only', (() => { const st = fake(); const r = P.save(st, { palette: 'neon', hudScale: 99, junk: 1 }); return J(r) === J(D) && JSON.parse(st._m[K]).junk === undefined; })());
check('existing palette helpers still work', A.palette('deuteranopia').name === 'deuteranopia' && A.palette('nope').name === 'normal' && A.passesContrast('normal') && A.remap({ a: 'x' }, 'b', 'y').ok);

// backup integration
check('MMBackup.KNOWN has access and gift keys', B.KNOWN.indexOf(K) >= 0 && B.KNOWN.indexOf('pixeltown-gift-v1') >= 0);
check('backup bundle exports the access key', B.bundle(fake({ [K]: '{"palette":"protanopia"}' })).keys[K] === '{"palette":"protanopia"}');
check('restore cleans access prefs through the owner', (() => { const st = fake(); const r = B.restore(st, { format: 'pixeltown-backup', v: 2, keys: { [K]: '{"palette":"neon","hudScale":1.25,"x":1}' } }); const v = JSON.parse(st._m[K]); return r.ok && v.palette === 'normal' && v.hudScale === 1.25 && v.x === undefined; })());
check('a v2 backup without the new keys still restores', B.restore(fake(), { format: 'pixeltown-backup', v: 2, keys: { 'pixeltown-save-v1': '{"name":"Bo"}' } }).ok);
check('restore of a non-object access value is cleaned to defaults', (() => { const p = B.plan({ format: 'pixeltown-backup', v: 2, keys: { [K]: '[1,2]' } }); return p.ok && J(JSON.parse(p.entries[K])) === J(D); })());
// chrome-8bit: the shared Settings panel (MMSettings) writes the same access key, keeps unknown-to-it fields, and the owner still reads it.
{
  const S = require('../shared/mm-settings.js');
  const st = fake({ [K]: '{"v":1,"palette":"protanopia","hudScale":1,"flashes":true,"bulletOutline":false,"lowGfx":false}' });
  check('settings: text size 1.5 is stored as hudScale and read back by MMAccess', S.set(st, 'text-size', 1.5) && P.load(st).hudScale === 1.5);
  check('settings: palette and bulletOutline are kept when settings write', P.load(st).palette === 'protanopia' && P.load(st).bulletOutline === false);
  check('settings: low graphics + flashes off land in the access prefs', S.set(st, 'low-gfx', true) && S.set(st, 'flashes', false) && P.load(st).lowGfx === true && P.load(st).flashes === false);
  check('settings: bad text size refused, stored value unchanged', S.set(st, 'text-size', 9) === false && P.load(st).hudScale === 1.5);
  check('settings: one-thumb sets mm-auto-fire and mm-aim-toggle', S.set(st, 'one-thumb', true) && st._m['mm-auto-fire'] === '1' && st._m['mm-aim-toggle'] === '1' && S.read(st)['one-thumb'] === true);
  check('settings: sound off = mm-sfx-muted 1; aim assist defaults on', S.set(st, 'sound', false) && st._m['mm-sfx-muted'] === '1' && S.read(fake())['aim-assist'] === true);
  check('settings: corrupt access key reads defaults, throwing storage never throws', S.read(fake({ [K]: '{bad' }))['text-size'] === 1 && S.read(fake({}, { throwGet: true })).sound === true && S.set(fake({}, { throwSet: true }), 'music', true) === false);
  check('settings: four groups Play/See/Hear/Help and the five universal controls', S.GROUPS.map((g) => g.title).join() === 'Play,See,Hear,Help' && S.CONTROLS.map((c) => c[0]).join() === 'Move,Primary,Secondary,Menu,Restart');
}
console.log((bad ? 'FAILED ' + bad + ' of ' : 'ok ') + n + ' assertions'); process.exit(bad ? 1 : 0);
