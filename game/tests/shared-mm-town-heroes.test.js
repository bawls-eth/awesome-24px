// Unit tests for shared/mm-town-heroes.js (no browser). Run: node game/tests/shared-mm-town-heroes.test.js
const fs = require('fs');
const path = require('path');
const H = require('../shared/mm-town-heroes.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const done = () => { console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exitCode = failed ? 1 : 0; };
const LEGACY = ['coolcats', 'punks', 'pudgypenguins', 'doge', 'apes', 'zombies', 'mohawks', 'blondies', 'aliens', 'alienclan', 'apepunks',
  'coolcats_dragons', 'coolcats_frogs', 'coolcats_ninjas', 'coolcats_pirates', 'coolcats_unicorns', 'genius', 'goldenpunks', 'halloweenpunks',
  'phunks', 'punkettes', 'avalanchepunks', 'punks_sepia', 'mooncats', 'punkrocks', 'boredapes'];

check('exactly the 10 hero classes', H.HEROES.length === 10 && new Set(H.CLASSES).size === 10
  && ['warrior', 'ranger', 'mage', 'cleric', 'rogue', 'warlock', 'paladin', 'berserker', 'druid', 'necromancer'].every((c) => H.CLASSES.includes(c)));
check('every hero has a name and a one-line role', H.HEROES.every((h) => h.name && h.role && h.role.length <= 40));
check('hero keys round-trip', H.CLASSES.every((c) => H.classOfKey(H.heroKey(c)) === c && H.isHeroKey('hero_' + c)));
check('junk keys are not hero keys', [null, 5, '', 'hero_', 'hero_punk', 'punks', {}].every((k) => H.classOfKey(k) === null));
check('heroKey of unknown class falls back to ranger', H.heroKey('nope') === 'hero_ranger');

// Legacy mapping: deterministic, in range, never throws, spreads over several classes.
const seen = new Set(); let ok = true;
LEGACY.forEach((k) => { for (let f = 0; f < 9; f++) { const c = H.classFor(k, f); if (!H.CLASSES.includes(c) || H.classFor(k, f) !== c) ok = false; seen.add(c); } });
check('legacy species+frame -> a hero class, stable', ok);
check('legacy mapping uses all 10 classes', seen.size === 10, String(seen.size));
check('mapping depends on the frame too', new Set([0, 1, 2, 3, 4, 5, 6, 7, 8].map((f) => H.classFor('punks', f))).size > 1);
check('hash is FNV-1a (fixed vectors)', H.hash('') === 0x811c9dc5 && H.hash('a') === 0xe40c292c);
check('junk species/frame never throw', [[undefined, undefined], [null, 'x'], [42, -1], [{}, 1.5], ['punks', NaN]].every(([s, f]) => H.CLASSES.includes(H.classFor(s, f))));
check('hero key maps to itself whatever the frame', H.classFor('hero_druid', 7) === 'druid');

// resolve: heroes and legacy both render as hero textures (frame 0); ?legacyart keeps a loaded old sheet.
const r1 = H.resolve('hero_mage', 3);
check('resolve hero key', r1.key === 'hero_mage' && r1.frame === 0);
const r2 = H.resolve('punks', 4);
check('resolve legacy key -> mapped hero', r2.key === 'hero_' + H.classFor('punks', 4) && r2.frame === 0 && !r2.legacy);
const r3 = H.resolve('punks', 4, (k) => k === 'punks');
check('resolve with legacy art on keeps the old sheet', r3.key === 'punks' && r3.frame === 4 && r3.legacy);
check('resolve junk -> a hero texture', H.isHeroKey(H.resolve(undefined, undefined).key));

// pickStart: keeps the stored value (never rewritten) and highlights the mapped hero.
const p1 = H.pickStart('goldenpunks', 5);
check('pickStart keeps a legacy key unchanged', p1.key === 'goldenpunks' && p1.frame === 5 && p1.cls === H.classFor('goldenpunks', 5));
check('pickStart hero key', H.pickStart('hero_rogue', 0).cls === 'rogue');
check('pickStart default is ranger', H.pickStart(undefined).key === 'hero_ranger' && H.pickStart('').cls === 'ranger');

check('legacyArt switch only on ?legacyart=1', H.legacyArt('?legacyart=1') && H.legacyArt('?a=b&legacyart=1') && !H.legacyArt('') && !H.legacyArt('?legacyart=0') && !H.legacyArt('?legacyart=10'));

// Assets exist for every hero: 6 strips + a portrait.
const GAME = path.join(__dirname, '..');
let missing = [];
H.CLASSES.forEach((c) => {
  ['idle', 'walk'].forEach((a) => H.DIRS.forEach((d) => { const u = H.stripUrl(c, a, d); if (!fs.existsSync(path.join(GAME, u))) missing.push(u); }));
  if (!fs.existsSync(path.join(GAME, H.portraitUrl(c)))) missing.push(H.portraitUrl(c));
});
check('all hero strips and portraits exist', missing.length === 0, missing.join(','));
check('no url points at the legacy sheets', H.CLASSES.every((c) => !/\/i\/|mooncats|strip\.png/.test(H.stripUrl(c, 'idle', 'down') + H.portraitUrl(c))));

// Frame layout and selection.
const layout = H.frameLayout();
check('layout: idle_down_0 first, 30 frames', layout.length === 3 * 4 + 3 * 6 && layout[0].name === 'idle_down_0');
check('dirFor', H.dirFor(100, 0) === 'right' && H.dirFor(-100, 5) === 'right' && H.dirFor(0, -50) === 'up' && H.dirFor(3, 60) === 'down' && H.dirFor(0, 0, 'up') === 'up');
check('frameName idle cycles 4 frames at 6 fps', H.frameName('down', false, 0) === 'idle_down_0' && H.frameName('down', false, 1000 / 6 + 1) === 'idle_down_1' && H.frameName('down', false, 4000 / 6 + 1) === 'idle_down_0');
check('frameName walk cycles 6 frames', H.frameName('right', true, 500 + 1) === 'walk_right_5' && H.frameName('up', true, 600 + 1) === 'walk_up_0');
check('frameName bad dir -> down', H.frameName('left', false, 0) === 'idle_down_0');
check('every frameName is in the layout', ['down', 'up', 'right'].every((d) => [0, 77, 333, 999, 12345].every((t) => [true, false].every((m) => layout.some((f) => f.name === H.frameName(d, m, t, 17))))));

// downsample: integer box filter with crisp alpha.
{
  const W = 16, Hh = 16, data = new Uint8ClampedArray(W * Hh * 4);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const k = (y * W + x) * 4; data[k] = 200; data[k + 1] = 100; data[k + 2] = 50; data[k + 3] = 255; }
  for (let y = 8; y < 16; y++) for (let x = 0; x < 2; x++) { const k = (y * W + x) * 4; data[k + 3] = 255; } // 2/8 coverage -> transparent
  const out = H.downsample(data, W, Hh, 0, 0, 2, 8);
  check('downsample: full block -> opaque mean colour', out[0] === 200 && out[1] === 100 && out[2] === 50 && out[3] === 255);
  check('downsample: empty block -> transparent', out[7] === 0);
  check('downsample: thin coverage -> transparent', out[11] === 0);
  const off = H.downsample(data, W, Hh, -100, -100, 2, 8);
  check('downsample: crop outside the source never throws', off.length === 16 && off.every((v) => v === 0));
}
check('crop puts the feet anchor on the bottom row', H.CROP_X === 128 - 96 && (231 - H.CROP_Y) / H.FACTOR >= 22 && (231 - H.CROP_Y) / H.FACTOR < 24);
{
  const px = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 0]);
  H.stoneTint(px);
  check('stoneTint greys opaque pixels, keeps alpha', Math.abs(px[0] - px[1]) <= 8 && Math.abs(px[1] - px[2]) <= 8 && px[3] === 255 && px[6] === 255 && px[7] === 0);
}
done();
