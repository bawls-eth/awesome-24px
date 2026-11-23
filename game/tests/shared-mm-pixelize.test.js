// Unit tests for shared/mm-pixelize.js pure pixel ops (no browser). Run: node game/tests/shared-mm-pixelize.test.js
const P = require('../shared/mm-pixelize.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const done = () => { console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exitCode = failed ? 1 : 0; };

// Tiny synthetic sprite: 64x64, a soft-edged green disc with a red "eye" and a blue gradient belly, antialiased alpha.
function synth() {
  const w = 64, h = 64, a = P.image(w, h), d = a.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, dx = x + 0.5 - 32, dy = y + 0.5 - 34, r = Math.sqrt(dx * dx + dy * dy);
    const cov = Math.max(0, Math.min(1, 24 - r));
    if (!cov) continue;
    let c = [60, 170, 80];
    if (dy > 6) c = [40, 90 + Math.round(dy * 4), 200];
    if (Math.hypot(x - 40, y - 26) < 4) c = [220, 40, 40];
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = Math.round(cov * 255);
  }
  return a;
}

{ // area downscale
  const a = P.image(4, 4); for (let i = 0; i < 16; i++) { a.data[i * 4] = i < 8 ? 200 : 0; a.data[i * 4 + 3] = 255; }
  const s = P.areaDownscale(a, 2, 2);
  check('area downscale averages 2x2 blocks', s.w === 2 && s.data[0] === 200 && s.data[8] === 0 && s.data[3] === 255);
  const t = P.image(2, 1); t.data.set([255, 0, 0, 255, 0, 0, 0, 0]);
  const u = P.areaDownscale(t, 1, 1);
  check('downscale is alpha-premultiplied (no dark fringe from transparent pixels)', u.data[0] === 255 && Math.abs(u.data[3] - 128) <= 1, Array.from(u.data).join(','));
  const f = P.areaDownscale(synth(), 21, 21);
  check('fractional footprints keep total coverage', f.w === 21 && f.data.some((v, i) => i % 4 === 3 && v === 255));
}
{ // threshold
  const a = P.image(3, 1); a.data.set([10, 10, 10, 50, 20, 20, 20, 200, 30, 30, 30, 255]);
  const t = P.alphaThreshold(a, 128);
  check('alpha threshold gives only 0 or 255', Array.from(t.data).filter((_, i) => i % 4 === 3).join() === '0,255,255' && t.data[0] === 0);
}
{ // median cut
  const a = P.alphaThreshold(P.areaDownscale(synth(), 30, 30), 110);
  const pal = P.medianCut(a, 6);
  check('median cut returns at most n colours, sorted by luminance', pal.length <= 6 && pal.length >= 3 && pal.every((c, i) => i === 0 || (c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114) >= (pal[i - 1][0] * 0.299 + pal[i - 1][1] * 0.587 + pal[i - 1][2] * 0.114)));
  const q = P.quantise(a, pal, 0);
  check('quantise leaves only palette colours', P.countColors(q) <= pal.length, P.countColors(q));
  check('median cut is deterministic', JSON.stringify(P.medianCut(a, 6)) === JSON.stringify(pal));
  const qd = P.quantise(a, pal, 1);
  check('dither changes some pixels but stays in the palette', P.hash(qd) !== P.hash(q) && P.countColors(qd) <= pal.length);
}
{ // outline
  const a = P.image(5, 5); const i = (2 * 5 + 2) * 4; a.data.set([200, 100, 50, 255], i);
  const o = P.outline(a, 0.6);
  const at = (x, y) => Array.from(o.data.slice((y * 5 + x) * 4, (y * 5 + x) * 4 + 4));
  check('outline adds 4-neighbours only', at(2, 1)[3] === 255 && at(1, 2)[3] === 255 && at(3, 2)[3] === 255 && at(2, 3)[3] === 255 && at(1, 1)[3] === 0);
  const c = at(2, 1);
  check('outline is colour-matched dark, not pure black', c[0] < 200 && c[0] > c[2] && (c[0] + c[1] + c[2]) > 0, c.join(','));
  check('outline strength 0 is off', P.countColors(P.outline(a, 0)) === 1 && P.stats(P.outline(a, 0)).opaque === 1);
}
{ // full pipeline + golden
  const src = synth();
  const r = P.pixelize(src, { size: 16 });
  const st = P.stats(r);
  check('pixelize returns the native size', r.w === 16 && r.h === 16);
  check('no semi-transparent pixels', st.semi === 0);
  check('colour count is capped (12-20 budget)', r.colors >= 4 && r.colors <= P.DEFAULTS.maxColors, r.colors);
  check('sprite fits inside the canvas with the outline on the 1 px pad', (() => { let bodyOnBorder = 0; const body = P.pixelize(src, { size: 16, outline: 0 });
    for (let k = 0; k < 16; k++) for (const [x, y] of [[k, 0], [0, k], [15, k], [k, 15]]) if (body.data[(y * 16 + x) * 4 + 3]) bodyOnBorder++; return bodyOnBorder === 0; })());
  const darkest = r.palette.map((h) => parseInt(h.slice(1), 16)).map((n) => ((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255));
  check('outline present: edge pixels are darker than the body', (() => {
    // the first opaque pixel in the centre column from the top is outline; the pixel below it is body
    for (let y = 0; y < 16; y++) { const i = (y * 16 + 8) * 4; if (r.data[i + 3]) { const j = i + 64 * 2; return (r.data[i] + r.data[i + 1] + r.data[i + 2]) < (r.data[j] + r.data[j + 1] + r.data[j + 2]); } }
    return false; })(), darkest.join(','));
  check('pixelize is deterministic', P.hash(P.pixelize(src, { size: 16 })) === P.hash(r));
  const GOLDEN16 = 'dd42395c', GOLDEN32 = '0fb4be72';
  const g16 = P.hash(r), g32 = P.hash(P.pixelize(src, { size: 32, dither: 0.5 }));
  check('golden output 16 px', g16 === GOLDEN16, g16);
  check('golden output 32 px with dither', g32 === GOLDEN32, g32);
  const fixed = P.pixelize(src, { size: 16, ramp: ['#1d2b53', '#008751', '#ff004d', '#29adff', '#fff1e8'], maxColors: 0, outline: 0, highlight: 0, shade: 0, saturate: 0 });
  check('fixed ramp maps only to ramp colours', fixed.palette.every((h) => ['#1d2b53', '#008751', '#ff004d', '#29adff', '#fff1e8'].includes(h)), fixed.palette.join(','));
  const empty = P.pixelize(P.image(8, 8), { size: 16 });
  check('empty source returns an empty sprite', empty.w === 16 && empty.colors === 0);
}
{ // size classes + switch
  check('size classes by species', P.sizeClassFor({ category: 'microscopic', size_cm: 0.01 }) === 'S16' && P.sizeClassFor({ category: 'insect', size_cm: 2 }) === 'S16'
    && P.sizeClassFor({ category: 'aquatic_fish', size_cm: 30 }) === 'M32' && P.sizeClassFor({ category: 'mammal', size_cm: 120 }) === 'L48'
    && P.sizeClassFor({ category: 'mammal', size_cm: 2000 }) === 'XL64' && P.sizeClassFor({ category: 'tree', size_cm: 50 }) === 'XL64');
  check('every registry species gets a class', require('../species-registry.json').species.every((s) => P.SIZE_CLASSES[P.sizeClassFor(s)]));
  check('?pixelize=0 switches it off', P.enabled('?pixelize=0') === false && P.enabled('?a=1&pixelize=0') === false && P.enabled('?pixelize=1') === true && P.enabled('') === true);
}
{ // purity
  const src = require('fs').readFileSync(require.resolve('../shared/mm-pixelize.js'), 'utf8');
  check('no Math.random / Date / network in the module', !/Math\.random|Date\.now|new Date|fetch\(|XMLHttpRequest|WebSocket/.test(src));
}
done();
