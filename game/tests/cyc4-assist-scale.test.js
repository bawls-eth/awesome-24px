// ID-06 assist (cycle 4 S), node part: the mm-assist pref contract (clean / read / write / scale maths / aim cone / Assisted rule)
// and its place in the ONE Backup (a setting like mm-aim-assist: round trip, hostile values cleaned, never thrown).
const { check, done } = require('./helpers');
const A = require('../shared/mm-assist.js');
const B = require('../shared/mm-backup.js');

const fake = (init) => { const m = Object.assign({}, init || {}); return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, _m: m }; };

check('key and steps: mm-assist, dmg 100..50 in 6 steps (never 0), aim 0..3', A.KEY === 'mm-assist' && A.DMG_STEPS.join() === '100,90,80,70,60,50' && A.AIM_STEPS.join() === '0,1,2,3' && A.AIM_WORDS.join() === 'Off,Light,Medium,Strong');
check('scale: 50 percent of 8 = 4', A.scaleDamage(8, { dmg: 50, aim: 0 }) === 4);
check('scale: min 1 (a 1-damage hit at 50 percent stays 1; 3 at 50 rounds to 2)', A.scaleDamage(1, { dmg: 50 }) === 1 && A.scaleDamage(3, { dmg: 50 }) === 2);
check('scale: 100 percent returns the hit unchanged (byte-identical default)', [1, 7, 8, 13, 250].every((d) => A.scaleDamage(d, { dmg: 100 }) === d) && A.scaleDamage(13, null) === 13);
check('scale: each step', A.DMG_STEPS.map((p) => A.scaleDamage(20, { dmg: p })).join() === '20,18,16,14,12,10');
check('clean: out of range and junk read as clamped / default', JSON.stringify(A.clean({ dmg: 0, aim: 9 })) === '{"dmg":50,"aim":3}' && JSON.stringify(A.clean({ dmg: 140, aim: -2 })) === '{"dmg":100,"aim":0}'
  && JSON.stringify(A.clean({ dmg: 74, aim: 1.6 })) === '{"dmg":70,"aim":2}' && JSON.stringify(A.clean('x')) === '{"dmg":100,"aim":0}' && JSON.stringify(A.clean({ dmg: NaN, aim: Infinity, x: 1 })) === '{"dmg":100,"aim":0}');
const st = fake();
check('read: missing key = default', JSON.stringify(A.read(st)) === '{"dmg":100,"aim":0}' && A.isDefault(A.read(st)));
check('write stores the cleaned JSON and read returns it', JSON.stringify(A.write(st, { dmg: 63, aim: 2, evil: 1 })) === '{"dmg":60,"aim":2}' && st._m['mm-assist'] === '{"dmg":60,"aim":2}' && A.read(st).dmg === 60);
check('read: garbage stored = default, no throw', (() => { const s2 = fake({ 'mm-assist': '{oops' }); return A.read(s2).dmg === 100 && A.read({ getItem: () => { throw new Error('blocked'); } }).dmg === 100; })());
check('reset removes the key', (() => { A.reset(st); return !('mm-assist' in st._m); })());
check('Assisted only when damage taken < 100 (aim help alone does not tag)', A.isAssisted({ dmg: 90 }) && !A.isAssisted({ dmg: 100, aim: 3 }) && !A.isAssisted(null));
check('aim cone: 14 / 20 / 26 / 32 degrees (Off = the old MMAim default)', [0, 1, 2, 3].map((a) => A.aimCone({ aim: a })).join() === '14,20,26,32');

// Backup: a setting, so it joins the ONE Backup like mm-aim-assist (device-only fields such as lowGfx stay out).
check('Backup KNOWN includes mm-assist, labelled, and counted as a setting', B.KNOWN.indexOf('mm-assist') >= 0 && B.labelOf('mm-assist') === 'assist setting' && B.isSetting('mm-assist'));
const src = fake({ 'mm-assist': '{"dmg":70,"aim":1}', 'pixeltown-jam-v1': '{"offset":0}' });
const bun = B.bundle(src);
check('bundle carries the raw pref', bun.keys['mm-assist'] === '{"dmg":70,"aim":1}');
const dst = fake();
const r = B.restore(dst, JSON.parse(JSON.stringify(bun)));
check('restore round trip writes the cleaned pref', r.ok && dst._m['mm-assist'] === '{"dmg":70,"aim":1}', JSON.stringify(r));
const bad = B.plan({ format: 'pixeltown-backup', v: 2, keys: { 'mm-assist': '{"dmg":-5,"aim":99,"__proto__":{"a":1}}' } });
check('hostile pref is clamped, never 0 damage', bad.ok && bad.entries['mm-assist'] === '{"dmg":50,"aim":3}', JSON.stringify(bad));
check('non-object pref is refused', !B.plan({ format: 'pixeltown-backup', v: 2, keys: { 'mm-assist': '[1]' } }).ok);
done();
