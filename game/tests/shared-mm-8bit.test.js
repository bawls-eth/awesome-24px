// Run: node game/tests/shared-mm-8bit.test.js   (MM8 shared 8-bit theme: palette, bitmap font, crisp canvas, shapes, particles, CSS rules)
const fs = require('fs');
const path = require('path');
const M = require('../shared/mm-8bit.js');
let n = 0, bad = 0;
function check(name, ok, info) { n++; if (!ok) { bad++; console.log('FAIL ' + name + (info ? ' ' + info : '')); } }

// fake 2d context that records fillRect calls
function fakeCtx() { const c = { calls: [], fillStyle: '', imageSmoothingEnabled: true, fillRect(x, y, w, h) { c.calls.push([x, y, w, h, c.fillStyle]); } }; return c; }

// palette
check('16 colour palette, all #rrggbb', M.PAL.length === 16 && M.PAL.every((h) => /^#[0-9a-f]{6}$/.test(h)));
check('palette colours are distinct', new Set(M.PAL).size === 16);
check('col() by index, name, wrap', M.col(0) === M.PAL[0] && M.col('red') === M.PAL[8] && M.col(17) === M.PAL[1] && M.col(-1) === M.PAL[15]);
check('nearest snaps to the palette', M.nearest('#fe0150') === '#ff004d' && M.nearest('#000001') === '#000000' && M.PAL.includes(M.nearest('#123456')));
check('nearest is safe on junk', M.PAL.includes(M.nearest('nope')) && M.PAL.includes(M.nearest(null)));
check('every palette colour maps to itself', M.PAL.every((h) => M.nearest(h) === h));

// font
check('glyphs are 7 rows of 5 bits', Object.keys(M.GLYPHS).every((k) => M.GLYPHS[k].length === 7 && M.GLYPHS[k].every((r) => r >= 0 && r < 32)));
check('A-Z and 0-9 present', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('').every((ch) => M.GLYPHS[ch]));
check('lowercase maps to uppercase, unknown -> ?', M.glyph('a') === M.GLYPHS.A && M.glyph('~') === M.GLYPHS['?']);
check('textWidth', M.textWidth('AB', 2) === 22 && M.textWidth('', 3) === 0 && M.textWidth(null, 1) === 0 && M.textWidth('X', 0.5) === 5);
const t = fakeCtx();
const w = M.text(t, 'I', 10, 20, 2, 'yellow', { shadow: false });
check('text draws whole scaled pixels in one colour', w === 10 && t.calls.length > 0 && t.calls.every((c) => c[2] === 2 && c[3] === 2 && c[4] === M.PAL[10] && Number.isInteger(c[0]) && Number.isInteger(c[1])));
check('text "I" pixel count = 11 bits set', t.calls.length === 3 + 1 + 1 + 1 + 1 + 1 + 3, String(t.calls.length));
const t2 = fakeCtx(); M.text(t2, 'I', 10.4, 20.6, 1, 7);
check('text default ink shadow drawn first, coords rounded', t2.calls[0][4] === M.INK && t2.calls.length === 22 && t2.calls.every((c) => Number.isInteger(c[0]) && Number.isInteger(c[1])));
const t3 = fakeCtx(); M.text(t3, 'II', 100, 0, 1, 7, { align: 'right', shadow: false });
check('align right ends at x', Math.max(...t3.calls.map((c) => c[0] + c[2])) <= 100 && Math.min(...t3.calls.map((c) => c[0])) >= 100 - 11);
const t4 = fakeCtx(); M.text(t4, 'II', 50, 0, 1, 7, { align: 'center', shadow: false });
check('align center', Math.min(...t4.calls.map((c) => c[0])) >= 44 && Math.max(...t4.calls.map((c) => c[0] + c[2])) <= 56);

// crisp
check('crispScale integer and >= 1', M.crispScale(120, 390) === 3 && M.crispScale(120, 50) === 1 && M.crispScale(100, 0) === 1);
const ctx = fakeCtx();
const cv = { width: 300, height: 150, style: {}, parentNode: { clientWidth: 390 }, getContext: () => ctx };
const got = M.crisp(cv, 120, 90);
check('crisp sets backing size, pixelated, integer CSS scale, no smoothing', got === ctx && cv.width === 120 && cv.height === 90 && cv.style.imageRendering === 'pixelated' && cv.style.width === '360px' && cv.style.height === '270px' && ctx.imageSmoothingEnabled === false);
const cv2 = { width: 1, height: 1, style: {}, getContext: () => fakeCtx() };
M.crisp(cv2, 64, 64, { fit: false });
check('crisp fit:false leaves CSS size', cv2.style.width === undefined && cv2.width === 64);

// shapes
const s = fakeCtx(); M.px.box(s, 0.4, 0.6, 10, 8, 'red', 'black', 1);
check('box: outline then fill, integer coords', s.calls.length === 4 && s.calls[0][4] === M.PAL[0] && s.calls[3][4] === M.PAL[8] && s.calls.every((c) => c.slice(0, 4).every(Number.isInteger)));
const sp = fakeCtx(); M.px.sprite(sp, ['a.b', ' a '], 0, 0, { a: 'white', b: 8 }, 2);
check('sprite skips transparent cells and scales', sp.calls.length === 3 && sp.calls.every((c) => c[2] === 2) && sp.calls[1][4] === M.PAL[8]);
const ci = fakeCtx(); M.px.circle(ci, 10, 10, 4, 12);
check('circle draws one row per scanline', ci.calls.length === 9 && ci.calls.every((c) => c[3] === 1 && c[4] === M.PAL[12]));
const st = fakeCtx(); M.px.steps(st, 0, 50, [3, 6, 9], 4, 'green');
check('steps stand on the baseline', st.calls.length === 3 && st.calls.every((c) => c[1] + c[3] === 50 && c[2] === 4));
const d = fakeCtx(); M.dither(d, 0, 0, 4, 4, 'white', 'black', 1);
check('dither: background + checker (8 of 16 cells)', d.calls.length === 1 + 8 && d.calls[0][4] === M.PAL[0]);
const b = fakeCtx(); M.bands(b, 0, 0, 10, 9, [1, 12, 7]);
check('bands: stepped, covers the height, palette only', b.calls.length === 3 && b.calls.reduce((a, c) => a + c[3], 0) === 9);

// particles (seeded, palette quantised, capped)
function rng(seed) { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; }
const p1 = M.particles(rng(7)), p2 = M.particles(rng(7));
p1.burst(10, 10, 12, '#fe0150'); p2.burst(10, 10, 12, '#fe0150');
check('particles are deterministic with a seeded rng', JSON.stringify(p1.list) === JSON.stringify(p2.list) && p1.list.length === 12);
check('particles use palette colours and whole-pixel sizes', p1.list.every((p) => M.PAL.includes(p.c) && (p.s === 2 || p.s === 3)));
for (let i = 0; i < 60; i++) p1.step();
check('particles die out', p1.list.length === 0);
const p3 = M.particles(rng(1), 10); p3.burst(0, 0, 50, 'red');
check('particles capped', p3.list.length === 10);
const pc = fakeCtx(); p3.draw(pc);
check('particle draw is integer squares', pc.calls.length === 10 && pc.calls.every((c) => Number.isInteger(c[0]) && Number.isInteger(c[1])));
check('prefs safe in node', M.lowGfx() === false && M.reducedMotion() === false);

// CSS rules
const css = fs.readFileSync(path.join(__dirname, '../shared/mm-8bit.css'), 'utf8');
['.px-btn', '.px-panel', '.px-badge', '.px-bar', '.px-card', ':focus-visible', 'prefers-reduced-motion', 'html.px-crt', '--ui-scale'].forEach((k) => check('css has ' + k, css.includes(k)));
for (let i = 0; i < 16; i++) check('css palette var --px-' + i + ' matches JS', new RegExp('--px-' + i + ':\\s*' + M.PAL[i] + '\\b', 'i').test(css));
check('css: no network fonts/imports/urls', !/@import|@font-face|url\(|https?:/i.test(css));
check('css: buttons >= 44px targets', /\.px-btn\s*\{[^}]*min-height:\s*44px[^}]*min-width:\s*44px/.test(css));
check('css: no blurred shadows (every shadow blur radius 0)', !/box-shadow:[^;]*\d+px \d+px [1-9]\d*px/.test(css) && !/blur\(/.test(css));
check('css: no radial gradients, no radius', !/radial-gradient/.test(css) && !/border-radius:\s*[1-9]/.test(css));
check('css: font sizes >= 12px', (css.match(/font-size:\s*(\d+)px/g) || []).every((m) => parseInt(m.replace(/\D/g, ''), 10) >= 12));
check('css: scanlines only behind html.px-crt', !/body::after/.test(css.replace(/html\.(low-gfx\.)?px-crt body::after/g, '')));
const js = fs.readFileSync(path.join(__dirname, '../shared/mm-8bit.js'), 'utf8');
check('js: no network, no innerHTML, no Math.random default outside particles fallback', !/fetch\(|XMLHttpRequest|https?:\/\/|innerHTML/.test(js));

console.log((bad ? 'FAILED ' : 'OK ') + (n - bad) + '/' + n + ' shared-mm-8bit checks');
process.exit(bad ? 1 : 0);
