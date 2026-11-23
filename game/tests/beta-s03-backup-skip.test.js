// Beta S-03 (b14-04, P1): one damaged key no longer blocks a whole backup restore, and the export leaves a damaged key out with a warning.
// Node only (MMBackup + its owner cleaners via require). Uses the old-format fixtures from save-compat-fixtures.js.
// Run: node game/tests/beta-s03-backup-skip.test.js
const B = require('../shared/mm-backup.js');
const FX = require('./save-compat-fixtures.js');
const { check, done } = require('./helpers');
const GIFT = 'pixeltown-gift-v1';
const fake = (init) => {
  const m = Object.assign({}, init || {});
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, _m: m };
};

// a full device: every fixture key the backup knows
const device = {};
FX.KEYS.filter((k) => B.KNOWN.indexOf(k) >= 0).forEach((k) => { device[k] = FX.rawOf(k); });
const good = B.bundle(fake(device));
const n = Object.keys(good.keys).length;
check('fixture bundle has many keys incl. the daily gift', n >= 30 && typeof good.keys[GIFT] === 'string', String(n));
check('a clean device exports with no warnings', Array.isArray(good.warnings) && good.warnings.length === 0, JSON.stringify(good.warnings));
check('warnings never land in the exported file', !('warnings' in JSON.parse(JSON.stringify(good))));

// 1. one damaged key (the gift): plan ok, n-1 entries, 1 skipped with the gift label
const bad = JSON.parse(JSON.stringify(good));
bad.keys[GIFT] = '{bad';
const p = B.plan(bad);
check('[1] plan ok with one damaged key', p.ok === true, p.message);
check('[1] all other keys planned', p.keys.length === n - 1 && p.keys.indexOf(GIFT) < 0, `${p.keys.length} of ${n}`);
check('[1] skipped lists the gift by label', Array.isArray(p.skipped) && p.skipped.length === 1 && p.skipped[0].key === GIFT && p.skipped[0].label === 'daily gift', JSON.stringify(p.skipped));
check('[1] the message says what will and cannot be restored', /Will restore: /.test(p.message) && /Cannot restore \(damaged in the file\): daily gift/.test(p.message), p.message);

// 2. apply: the good keys are written, the device's own gift key is untouched
const target = fake({ [GIFT]: '{"v":1,"mine":true}' });
const r = B.apply(target, p);
check('[2] apply writes every planned key', r.ok === true && r.restored.length === n - 1, JSON.stringify(r).slice(0, 200));
check('[2] the device\'s existing gift key is untouched', target._m[GIFT] === '{"v":1,"mine":true}');
check('[2] the town save was restored', typeof target._m['pixeltown-save-v1'] === 'string' && target._m['pixeltown-save-v1'] === p.entries['pixeltown-save-v1']);

// the town save damaged: it is called out first
const badTown = JSON.parse(JSON.stringify(bad));
badTown.keys['pixeltown-save-v1'] = '[1,2]';
const pt = B.plan(badTown);
check('[1] a damaged town save is listed first', pt.ok === true && pt.skipped.length === 2 && pt.skipped[0].key === 'pixeltown-save-v1', JSON.stringify(pt.skipped));

// 3. every key damaged: ok false, storage untouched
const allBad = { format: 'pixeltown-backup', v: 2, keys: {} };
Object.keys(good.keys).forEach((k) => { allBad.keys[k] = '{bad'; });
const pa = B.plan(allBad);
check('[3] every key damaged -> plan fails', pa.ok === false && pa.error === 'bad-value', JSON.stringify(pa).slice(0, 120));
const st3 = fake({ x: '1' });
const r3 = B.restore(st3, allBad);
check('[3] restore of an all-damaged file changes nothing', r3.ok === false && Object.keys(st3._m).length === 1 && st3._m.x === '1');

// 4. export on a device with one corrupt key: file keeps the good keys, warnings name the bad one
const sick = Object.assign({}, device, { [GIFT]: '{not json' });
const out = B.bundle(fake(sick));
check('[4] the export leaves the damaged key out', !(GIFT in out.keys) && Object.keys(out.keys).length === n - 1);
check('[4] warnings name the damaged key by label', out.warnings.length === 1 && out.warnings[0].key === GIFT && out.warnings[0].label === 'daily gift', JSON.stringify(out.warnings));
check('[4] that export restores cleanly elsewhere', B.plan(JSON.parse(JSON.stringify(out))).ok === true && B.plan(JSON.parse(JSON.stringify(out))).skipped.length === 0);

// 5. limits still enforced
const big = { format: 'pixeltown-backup', v: 2, keys: { 'pixeltown-stalk-v1': '{"a":"' + 'x'.repeat(2100000) + '"}', 'pixeltown-jam-v1': '{"offset":0}' } };
const pb = B.plan(big);
check('[5] an oversized key is skipped, the small one restores', pb.ok === true && pb.keys.join() === 'pixeltown-jam-v1' && pb.skipped[0].key === 'pixeltown-stalk-v1');
check('[5] the panel-collapsed special case still validated', B.plan({ format: 'pixeltown-backup', v: 2, keys: { 'pixeltown-panel-collapsed': '"1"' } }).entries['pixeltown-panel-collapsed'] === '1' && B.plan({ format: 'pixeltown-backup', v: 2, keys: { 'pixeltown-panel-collapsed': 'yes' } }).ok === false);
check('[5] an unknown key still refuses the whole file', B.plan({ format: 'pixeltown-backup', v: 2, keys: { 'pixeltown-jam-v1': '{}', 'evil-key': '{}' } }).error === 'unknown-key');
// QA -> PS 4: the G-25 / G-26 additive keys are part of the Backup now (cleaned, labelled), so a Backup / Restore keeps them
{
  const nodes = JSON.stringify({ v: 1, isles: { reef: { n: [[3, 99999], [1, 'x']], p: { berry: 5 } } } });
  const deep = JSON.stringify({ v: 1, f: { crypt: 2, BAD: 9 } });
  const b = B.bundle(fake({ 'pixeltown-isle-nodes-v1': nodes, 'pixeltown-deep-v1': deep }));
  check('[keys] isle nodes + deep floors are in KNOWN and exported', B.KNOWN.indexOf('pixeltown-isle-nodes-v1') >= 0 && B.KNOWN.indexOf('pixeltown-deep-v1') >= 0 && b.keys['pixeltown-isle-nodes-v1'] === nodes && b.keys['pixeltown-deep-v1'] === deep);
  const st = fake();
  const r = B.restore(st, JSON.parse(JSON.stringify(b)));
  check('[keys] they restore, cleaned (bad node entry / bad biome dropped)', r.ok && JSON.parse(st._m['pixeltown-isle-nodes-v1']).isles.reef.n.length === 1 && JSON.parse(st._m['pixeltown-deep-v1']).f.crypt === 2 && !('BAD' in JSON.parse(st._m['pixeltown-deep-v1']).f));
  check('[keys] they have readable labels', B.labelOf('pixeltown-isle-nodes-v1') !== 'pixeltown-isle-nodes-v1' && B.labelOf('pixeltown-deep-v1') === 'deepest dungeon floors');
  check('[keys] a non-object value is refused', B.plan({ format: 'pixeltown-backup', v: 2, keys: { 'pixeltown-deep-v1': '[1]' } }).ok === false);
}
done();
