// Cycle 13 S: the ID-56 shop "saving for" pin (`mm-shop-pin`, {"v":1,"id":"<item>:<rarity>"}, realm.js rmShopPinGet) is in the ONE Backup:
// export carries it, Restore writes it back, and Restore ignores (skips, never writes) a pin that rmShopPinGet would not read
// (wrong v, bad id, not an object, extra fields dropped). Node only: MMBackup bundle / plan / apply on an in-memory storage.
// Before this change the export left the key out and a restore file holding it reported it as "not known by this version".
// Run: node game/tests/cyc13-s-backup-shop-pin.test.js
const B = require('../shared/mm-backup.js');
const { check, done } = require('./helpers');

const mem = (init) => {
  const m = Object.assign({}, init || {});
  return { _m: m, getItem: (k) => (Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, get length() { return Object.keys(m).length; }, key: (i) => Object.keys(m)[i] || null };
};
const TOWN = JSON.stringify({ name: 'ADMINpin', species: 'cat', frame: 0 });
const PIN = '{"v":1,"id":"wand_spark:0"}';

check('KNOWN includes mm-shop-pin, it is a setting, and it has a plain label', B.KNOWN.indexOf('mm-shop-pin') >= 0 && B.isSetting('mm-shop-pin') && B.labelOf('mm-shop-pin') === 'shop saving-for pin', JSON.stringify([B.KNOWN.indexOf('mm-shop-pin'), B.labelOf('mm-shop-pin')]));
check('KNOWN stays inside MAX_KEYS', B.KNOWN.length <= B.MAX_KEYS, B.KNOWN.length + ' / ' + B.MAX_KEYS);

const src = mem({ 'pixeltown-save-v1': TOWN, 'mm-shop-pin': PIN });
const b = B.bundle(src);
check('export: the bundle carries mm-shop-pin exactly as stored', b.keys['mm-shop-pin'] === PIN, JSON.stringify(b.keys));

const dst = mem({ 'pixeltown-save-v1': TOWN });
const p = B.plan(JSON.stringify(b));
check('restore plan: mm-shop-pin will restore, listed as a setting, nothing skipped', p.ok && p.keys.indexOf('mm-shop-pin') >= 0 && p.settings.indexOf('mm-shop-pin') >= 0 && !(p.skipped || []).length, JSON.stringify(p).slice(0, 400));
const r = B.apply(dst, p);
check('restore apply: the pin is written back, same value', r.ok && dst._m['mm-shop-pin'] === PIN, JSON.stringify([r, dst._m['mm-shop-pin']]));

const file = (pin) => JSON.stringify({ format: B.FORMAT, v: B.VERSION, keys: { 'pixeltown-save-v1': TOWN, 'mm-shop-pin': pin } });
const BAD = [
  ['wrong version', '{"v":2,"id":"wand_spark:0"}'],
  ['id without rarity', '{"v":1,"id":"wand_spark"}'],
  ['id with a bad character', '{"v":1,"id":"<img>:0"}'],
  ['rarity of 3 digits', '{"v":1,"id":"wand_spark:100"}'],
  ['id not a string', '{"v":1,"id":7}'],
  ['an array', '[1,2]'],
  ['a number', '5'],
  ['not JSON', '{oops'],
  ['a raw flag', '1']
];
BAD.forEach(([what, pin]) => {
  const d = mem({ 'pixeltown-save-v1': '{"name":"ADMINkeep"}', 'mm-shop-pin': '{"v":1,"id":"keep_me:2"}' });
  const pl = B.plan(file(pin));
  const ap = pl.ok ? B.apply(d, pl) : { ok: false };
  const skipped = pl.ok && pl.keys.indexOf('mm-shop-pin') < 0 && pl.skipped.some((x) => x.key === 'mm-shop-pin');
  check(`restore ignores an invalid pin (${what}): skipped, the rest restores, this device's pin is untouched`,
    skipped && ap.ok && d._m['mm-shop-pin'] === '{"v":1,"id":"keep_me:2"}' && d._m['pixeltown-save-v1'] === TOWN, JSON.stringify([pl.keys, pl.skipped, d._m]));
});

const extra = B.plan(file('{"v":1,"id":"wand_spark:3","evil":{"__proto__":1},"x":2}'));
check('restore keeps only {v, id} of a valid pin (extra fields dropped)', extra.ok && extra.entries['mm-shop-pin'] === '{"v":1,"id":"wand_spark:3"}', JSON.stringify(extra.entries));

const damaged = B.bundle(mem({ 'pixeltown-save-v1': TOWN, 'mm-shop-pin': '{"v":9}' }));
check('export: a damaged stored pin is left out and named in warnings (not written into the file)', !('mm-shop-pin' in damaged.keys) && damaged.warnings.some((w) => w.key === 'mm-shop-pin'), JSON.stringify([damaged.keys, damaged.warnings]));

const unknown = B.plan(JSON.stringify({ format: B.FORMAT, v: B.VERSION, keys: { 'pixeltown-save-v1': TOWN, 'mm-shop-pin': PIN, 'mm-shop-pin-v9': '{}' } }));
check('an unknown neighbour key is still only named as skipped (unknown values ignored)', unknown.ok && unknown.keys.indexOf('mm-shop-pin') >= 0 && unknown.skipped.some((x) => x.key === 'mm-shop-pin-v9' && x.why === 'not known by this version'), JSON.stringify(unknown.skipped));
done();
