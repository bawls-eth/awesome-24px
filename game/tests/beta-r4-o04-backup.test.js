// R4 O-04 (b14-05 P2, b14-13 P3): ONE Backup covers every game save key AND all settings (device-specific flags excepted), with a
// build stamp, a compatibility check and a preview. Restore accepts the old town-only file, an old (pre-R4) Lantern bundle and the new
// bundle; unknown / damaged keys are skipped by name; a file of only unknown keys is refused; nothing is written on any failure.
// Node only (MMBackup via require). Run: node game/tests/beta-r4-o04-backup.test.js
const B = require('../shared/mm-backup.js');
const FX = require('./save-compat-fixtures.js');
const { check, done } = require('./helpers');
const fake = (init, opts) => {
  const m = Object.assign({}, init || {});
  return {
    _m: m,
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { if (opts && opts.full) throw new Error('QuotaExceededError'); m[k] = String(v); },
    removeItem: (k) => { delete m[k]; }
  };
};
const SETTINGS = ['mm-sfx-muted', 'mm-music', 'mm-high-contrast', 'mm-reduce-motion', 'mm-aim-assist', 'mm-aim-toggle', 'mm-bullet-shapes', 'mm-auto-fire'];

// 1. settings are in the bundle (failed before R4: none of them was in KNOWN)
const dev = {};
FX.KEYS.filter((k) => B.KNOWN.indexOf(k) >= 0).forEach((k) => { dev[k] = FX.rawOf(k); });
SETTINGS.forEach((k, i) => { dev[k] = i % 2 ? '1' : '0'; });
dev['pixeltown-realm-audio-v1'] = '{"v":1,"ambience":true}';
dev['pixeltown-hub-hint-v1'] = '1';
dev['pixeltown-calm-v1'] = '{"v":1,"dismissed":["jam:medal"],"hidden":0}';
dev['pixeltown-access-v1'] = '{"v":1,"palette":"deuteranopia","hudScale":1.25,"flashes":"reduced","bulletOutline":true,"lowGfx":true}';
// device-only keys that must NOT travel
dev['pixeltown-nav-v1'] = '{"v":1,"last":{"id":"town","url":"../index.html","t":1}}';
dev['pixeltown-backupnote-v1'] = '{"v":1,"at":"2026-11-20"}';
dev['pixeltown-save-v1-prev'] = '{"name":"old"}';
const b = B.bundle(fake(dev));
check('[1] every setting flag is in the bundle', SETTINGS.every((k) => b.keys[k] === dev[k]), SETTINGS.filter((k) => b.keys[k] !== dev[k]).join(','));
check('[1] realm ambience, hub hint and hidden hub ideas are in the bundle', b.keys['pixeltown-realm-audio-v1'] && b.keys['pixeltown-hub-hint-v1'] === '1' && b.keys['pixeltown-calm-v1']);
check('[1] device-only keys stay out (nav, backup note, -prev copy)', !b.keys['pixeltown-nav-v1'] && !b.keys['pixeltown-backupnote-v1'] && !b.keys['pixeltown-save-v1-prev']);
check('[1] the file carries a version stamp (format v2, build, made, scope all)', b.format === 'pixeltown-backup' && b.v === 2 && b.build === B.BUILD && isFinite(Date.parse(b.made)) && b.scope === 'all');
check('[1] the bundle stays inside MAX_KEYS', Object.keys(b.keys).length <= B.MAX_KEYS && B.KNOWN.length <= B.MAX_KEYS, B.KNOWN.length + ' known');

// 2. round trip onto a fresh device: settings restore, lowGfx stays the device's own
const p = B.plan(JSON.stringify(b));
check('[2] plan ok; preview splits saves and settings', p.ok && p.kind === 'bundle' && p.settings.length >= 9 && p.saves.indexOf('pixeltown-save-v1') >= 0 && p.settings.indexOf('pixeltown-save-v1') < 0, JSON.stringify({ s: p.settings, e: p.error }));
check('[2] preview carries build and date', p.build === B.BUILD && p.made === b.made);
const phone = fake({ 'pixeltown-access-v1': '{"v":1,"palette":"normal","hudScale":1,"flashes":"on","bulletOutline":false,"lowGfx":false}' });
const r = B.apply(phone, p);
check('[2] apply ok and every setting restored', r.ok && SETTINGS.every((k) => phone._m[k] === dev[k]));
const acc = JSON.parse(phone._m['pixeltown-access-v1']);
check('[2] accessibility prefs come from the file but lowGfx stays the device value', acc.palette === 'deuteranopia' && acc.lowGfx === false, phone._m['pixeltown-access-v1']);
const fresh = fake();
B.apply(fresh, p);
check('[2] on a device with no access prefs, lowGfx is not imported', !('lowGfx' in JSON.parse(fresh._m['pixeltown-access-v1'])));

// 3. old files: town-only file, pre-R4 Lantern bundle (no stamp, only pixeltown-* keys)
const town = JSON.parse(FX.rawOf('pixeltown-save-v1'));
const pt = B.plan(JSON.stringify(town));
check('[3] old town-only file restores as the town save', pt.ok && pt.kind === 'town' && pt.keys.join() === 'pixeltown-save-v1');
const old = { format: 'pixeltown-backup', v: 2, keys: { 'pixeltown-save-v1': FX.rawOf('pixeltown-save-v1'), 'pixeltown-mm-v1': FX.rawOf('pixeltown-mm-v1'), 'pixeltown-panel-collapsed': '1' } };
const po = B.plan(JSON.stringify(old));
check('[3] old Lantern bundle (no build stamp) restores every key', po.ok && po.keys.length === 3 && po.build === null && po.made === null && !po.message, JSON.stringify(po).slice(0, 200));

// 4. validation: damaged flag skipped by name; unknown skipped by name; all-unknown refused; newer format named
const dmg = JSON.parse(JSON.stringify(b)); dmg.keys['mm-music'] = 'yes please'; dmg.keys['pixeltown-future-v9'] = '{}';
const pd = B.plan(dmg);
check('[4] a damaged setting is skipped and named', pd.ok && pd.keys.indexOf('mm-music') < 0 && /music setting/.test(pd.message), pd.message);
check('[4] an unknown key is skipped and named', pd.skipped.some((x) => x.key === 'pixeltown-future-v9' && /not known/.test(x.why)) && /pixeltown-future-v9/.test(pd.message));
const pu = B.plan({ format: 'pixeltown-backup', v: 2, keys: { 'pixeltown-future-v9': '{}', 'mm-future': '1' } });
check('[4] a file of only unknown keys is refused', !pu.ok && pu.error === 'unknown-key' && /nothing was changed/.test(pu.message));
const pn = B.plan({ format: 'pixeltown-backup', v: 7, build: '2027-01-01-r9', keys: { 'mm-music': '1' } });
check('[4] a newer format restores what this build knows and says it is newer', pn.ok && pn.newer && /newer version/.test(pn.message), pn.message);

// 5. nothing is written on failure: refused file, full storage
const keep = fake({ 'pixeltown-save-v1': '{"name":"keep"}', 'mm-music': '0' });
const snap = JSON.stringify(keep._m);
['{bad', '[]', 'null', JSON.stringify({ format: 'pixeltown-backup', v: 2, keys: { 'mm-music': 'x' } }), JSON.stringify(pu)].forEach((f) => {
  const pl = B.plan(f); if (pl.ok) B.apply(keep, pl);
});
check('[5] refused files leave storage byte-identical', JSON.stringify(keep._m) === snap);
const full = fake({ 'mm-music': '0' }, { full: true });
const fr = B.apply(full, p);
check('[5] a full storage fails cleanly and keeps the old value', !fr.ok && full._m['mm-music'] === '0' && Object.keys(full._m).length === 1);

// 6. fuzz: 3000 random bundles of known / unknown keys and hostile values: never throws; a refused plan never writes
let threw = 0, wroteOnFail = 0, okN = 0;
let seed = 20261124;
const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
const VALS = ['1', '0', '"1"', 'true', '{}', '{"v":1}', '[]', 'null', '{bad', '', 'x'.repeat(50), '{"__proto__":{"p":1}}', '{"name":"z","resources":{"wood":-5}}', '9e999'];
const POOL = B.KNOWN.concat(['pixeltown-future-v9', 'mm-new', '__proto__', 'constructor', 'pixeltown-nav-v1']);
for (let i = 0; i < 3000; i++) {
  const keys = {};
  const n = 1 + Math.floor(rnd() * 8);
  for (let j = 0; j < n; j++) keys[POOL[Math.floor(rnd() * POOL.length)]] = VALS[Math.floor(rnd() * VALS.length)];
  const st = fake({ 'pixeltown-save-v1': '{"name":"me"}' });
  const before = JSON.stringify(st._m);
  try {
    const pl = B.plan({ format: 'pixeltown-backup', v: 1 + Math.floor(rnd() * 3), keys: keys });
    if (pl.ok) { okN++; B.apply(st, pl); if (Object.keys(st._m).some((k) => B.KNOWN.indexOf(k) < 0)) wroteOnFail++; } else if (JSON.stringify(st._m) !== before) wroteOnFail++;
  } catch (e) { threw++; }
}
check('[6] 3000 fuzzed bundles: no throw, refusals write nothing, only known keys are ever written', threw === 0 && wroteOnFail === 0 && okN > 100, JSON.stringify({ threw, wroteOnFail, okN }));
check('[6] Object.prototype untouched', ({}).p === undefined);
done();
