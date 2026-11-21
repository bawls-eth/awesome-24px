// Run: node game/tests/shared-mm-creature-draw.test.js  (stub 2D ctx, no DOM)
const D = require('../shared/mm-creature-draw.js');
let n = 0, bad = 0;
function check(name, ok) { n++; if (!ok) { bad++; console.log('FAIL ' + name); } }

// Stub ctx: records calls, every fillStyle / strokeStyle assignment, and save/restore balance.
function stub() {
  const calls = [], styles = []; let depth = 0, minDepth = 0;
  const ctx = { calls, styles, depth: () => depth, minDepth: () => minDepth };
  ['save', 'restore', 'translate', 'rotate', 'scale', 'beginPath', 'moveTo', 'lineTo', 'arc', 'closePath', 'fill', 'stroke', 'quadraticCurveTo', 'fillRect'].forEach((m) => {
    ctx[m] = (...a) => { calls.push({ m, a }); if (m === 'save') depth++; if (m === 'restore') { depth--; minDepth = Math.min(minDepth, depth); } };
  });
  let fs = '', ss = '';
  Object.defineProperty(ctx, 'fillStyle', { get: () => fs, set: (v) => { fs = v; styles.push(v); } });
  Object.defineProperty(ctx, 'strokeStyle', { get: () => ss, set: (v) => { ss = v; styles.push(v); } });
  return ctx;
}
const finite = (c) => c.calls.every((k) => k.a.every((v) => typeof v !== 'number' || Number.isFinite(v)));
const count = (c, m) => c.calls.filter((k) => k.m === m).length;
const sig = (c) => JSON.stringify(c.calls);
let made = [];
const factory = () => { made = []; return (w, h) => { const cv = { w, h, ctx: stub(), getContext() { return this.ctx; } }; made.push(cv); return cv; }; };

check('7 archetypes, 2 actions, 4 frames', D.ARCHETYPES.length === 7 && new Set(D.ARCHETYPES).size === 7 && D.ACTIONS.join() === 'idle,move' && D.FRAMES === 4 && ['blob', 'quadruped', 'biped', 'winged', 'serpent', 'giant', 'mount'].every((a) => D.ARCHETYPES.indexOf(a) >= 0));
check('size classes are 48/64/96/128', D.SIZES.S === 48 && D.SIZES.M === 64 && D.SIZES.L === 96 && D.SIZES.XL === 128 && D.HIT_RADIUS.S === 12 && D.HIT_RADIUS.XL === 36);

const pal = D.palette(null, 'jungle');
const palCols = Object.keys(pal).map((k) => pal[k]);
D.ARCHETYPES.forEach((a) => {
  D.ACTIONS.forEach((act) => {
    const frames = [0, 1, 2, 3].map((f) => { const c = stub(); const ok = D.drawFrame(c, a, 64, 64, f, act, pal); return { c, ok }; });
    check(a + '/' + act + ': all 4 frames draw, balanced, finite', frames.every((x) => x.ok && (count(x.c, 'fill') + count(x.c, 'stroke')) >= 4 && x.c.depth() === 0 && x.c.minDepth() === 0 && finite(x.c)));
    check(a + '/' + act + ': only palette colours', frames.every((x) => x.c.styles.every((s) => palCols.indexOf(s) >= 0)));
    const sigs = new Set(frames.map((x) => sig(x.c)));
    check(a + '/' + act + ': frames differ (animation)', act === 'idle' ? sigs.size >= 2 : sigs.size === 4 || sigs.size >= 2);
  });
});
check('drawFrame is deterministic', D.ARCHETYPES.every((a) => { const x = stub(), y = stub(); D.drawFrame(x, a, 96, 96, 2, 'move', pal); D.drawFrame(y, a, 96, 96, 2, 'move', pal); return sig(x) === sig(y); }));
check('palette parameter changes the colours used', (() => { const x = stub(), y = stub(); D.drawFrame(x, 'quadruped', 64, 64, 0, 'idle', D.paletteFor('ice')); D.drawFrame(y, 'quadruped', 64, 64, 0, 'idle', D.paletteFor('mars')); return x.styles.indexOf(D.PALETTES.ice.body) >= 0 && y.styles.indexOf(D.PALETTES.mars.body) >= 0 && x.styles.indexOf(D.PALETTES.mars.body) < 0; })());
check('every biome palette is valid hex for all 5 keys', Object.keys(D.PALETTES).every((b) => ['body', 'belly', 'accent', 'eye', 'line'].every((k) => /^#[0-9a-f]{6}$/i.test(D.PALETTES[b][k]))));
check('hostile palettes fall back per key', (() => { const p = D.palette({ body: 'red', belly: '#12', accent: 5, eye: null, line: '#abcdef', evil: 'x' }, 'ice'); return p.body === D.PALETTES.ice.body && p.belly === D.PALETTES.ice.belly && p.accent === D.PALETTES.ice.accent && p.eye === D.PALETTES.ice.eye && p.line === '#abcdef' && !('evil' in p) && D.palette('x', 'nope').body === D.PALETTES.jungle.body; })());

// baking
check('bake: 4 idle + 4 move canvases and a shadow, at display size x dpr', (() => {
  const b = D.makeBaker(factory()); const r = b.bake({ id: 'raptor', archetype: 'biped', size: 'L', biome: 'jungle' }, { dpr: 1 });
  return r && r.frames.idle.length === 4 && r.frames.move.length === 4 && r.shadow && r.w === 96 && r.h === 96 && r.frames.idle.every((c) => c.w === 96 && c.h === 96) && r.hit === 26 && r.ax === 48 && r.ay === 86;
})());
check('frame sizes are 48/64/96/128 x the dpr bucket', [1, 1.5, 2].every((dpr) => ['S', 'M', 'L', 'XL'].every((sc) => { const b = D.makeBaker(factory()); const r = b.bake({ archetype: 'blob', size: sc }, { dpr }); return r.w === D.SIZES[sc] * dpr && r.frames.move[3].w === D.SIZES[sc] * dpr; })));
check('dpr buckets: junk -> 1, 1.2 -> 1, 1.5 -> 1.5, 3 -> 2', D.dprBucket(NaN) === 1 && D.dprBucket('x') === 1 && D.dprBucket(1.2) === 1 && D.dprBucket(1.5) === 1.5 && D.dprBucket(3) === 2 && D.dprBucket(-4) === 1);
check('a second bake returns the cached object, no new canvases', (() => { const f = factory(); const b = D.makeBaker(f); const a = b.bake({ id: 'x', archetype: 'winged', size: 'M' }); const k = made.length; const c = b.bake({ id: 'x', archetype: 'winged', size: 'M' }); return a === c && made.length === k && b.size() === 1; })());
check('different size / dpr / palette / id make different cache entries', (() => { const b = D.makeBaker(factory()); const s = { id: 'x', archetype: 'blob', size: 'S' }; const r1 = b.bake(s), r2 = b.bake(Object.assign({}, s, { size: 'M' })), r3 = b.bake(s, { dpr: 2 }), r4 = b.bake(Object.assign({}, s, { palette: { body: '#123456' } })), r5 = b.bake(Object.assign({}, s, { id: 'y' })); return new Set([r1, r2, r3, r4, r5]).size === 5 && b.size() === 5; })());
check('every archetype bakes every action in each size class', D.ARCHETYPES.every((a) => ['S', 'M', 'L', 'XL'].every((sc) => { const b = D.makeBaker(factory()); const r = b.bake({ archetype: a, size: sc }); return r && r.frames.idle.length === 4 && r.frames.move.length === 4 && r.frames.idle.concat(r.frames.move).every((cv) => cv.ctx.depth() === 0 && cv.ctx.calls.length > 10) && r.archetype === a; })));
check('baked frames are drawn once: baking draws, reading does not', (() => { const b = D.makeBaker(factory()); const r = b.bake({ archetype: 'giant', size: 'XL' }); const k = r.frames.idle[0].ctx.calls.length; b.bake({ archetype: 'giant', size: 'XL' }); return k > 0 && r.frames.idle[0].ctx.calls.length === k; })());
check('shadow is one flat ellipse, shared per size class', (() => { const b = D.makeBaker(factory()); const r1 = b.bake({ id: 'a', archetype: 'blob', size: 'M' }), r2 = b.bake({ id: 'b', archetype: 'biped', size: 'M' }); const sh = r1.shadow; return sh === r2.shadow && sh.w === 64 && sh.h === 16 && count(sh.ctx, 'arc') === 1 && sh.ctx.styles[0] === D.SHADOW; })());
check('cache evicts least recently used past its cap', (() => { const b = D.makeBaker(factory(), 3); const f = (i) => b.bake({ id: 'c' + i, archetype: 'blob', size: 'S' }); const a0 = f(0); f(1); f(2); f(0); f(3); return b.size() === 3 && f(0) === a0 && f(1) !== undefined; })());
check('cache cap is clamped', D.makeBaker(factory(), -5).size() === 0 && (() => { const b = D.makeBaker(factory(), 1); b.bake({ id: 'a', archetype: 'blob' }); b.bake({ id: 'b', archetype: 'blob' }); return b.size() === 1; })());
check('no canvas factory in node: bake returns null, never throws', D.bake({ archetype: 'blob' }) === null && D.defaultCreate(4, 4) === null && D.makeBaker(null).bake({}) === null);
check('factory that returns junk / throws gives null', D.makeBaker(() => null).bake({ archetype: 'blob' }) === null && D.makeBaker(() => ({})).bake({ archetype: 'blob' }) === null && D.makeBaker(() => { throw new Error('x'); }).bake({ archetype: 'blob' }) === null);

// hostile
check('hostile spec / opts do not throw and fall back to a blob', [null, undefined, 5, 'x', [], { archetype: '__proto__', size: 'constructor', id: '<b>', palette: 'x' }, { archetype: { a: 1 }, size: 9 }].every((s) => { const r = D.makeBaker(factory()).bake(s, { dpr: NaN }); return r && r.archetype === 'blob' && r.sizeClass === 'M' && r.w === 64; }) && D.makeBaker(factory()).bake({}, null) !== null);
check('hostile id is replaced, never used raw in the key', (() => { const r = D.makeBaker(factory()).bake({ id: '<script>alert(1)</script>', archetype: 'quadruped' }); return r.id === 'quadruped' && r.key.indexOf('<') < 0; })());
check('hostile drawFrame args never throw and stay balanced', (() => {
  try {
    const c = stub();
    D.drawFrame(c, '__proto__', NaN, Infinity, 'x', { a: 1 }, 'junk'); D.drawFrame(c, 'constructor', -5, 1e9, -7, 'move', null); D.drawFrame(c, 'giant', 'a', null, Infinity, 5, { body: 7 });
    return finite(c) && c.depth() === 0 && c.minDepth() === 0;
  } catch (e) { return false; }
})());
check('null / invalid ctx returns false', D.drawFrame(null, 'blob', 1, 1, 0, 'idle', pal) === false && D.drawFrame({}, 'blob', 1, 1, 0, 'idle', pal) === false && D.drawShadow(undefined, 4, 4) === false);
check('drawFrame restores the ctx even when a body throws', (() => { const c = stub(); c.lineTo = () => { throw new Error('boom'); }; try { D.drawFrame(c, 'biped', 64, 64, 0, 'idle', pal); } catch (e) { /* expected */ } return c.depth() === 0; })());
check('frameAt cycles 0..3 at 4 fps idle and 8 fps move; junk is 0', D.frameAt('idle', 0.3) === 1 && D.frameAt('idle', 1) === 0 && D.frameAt('move', 0.25) === 2 && D.frameAt('move', NaN) === 0 && D.frameAt('move', -5) === 0 && D.frameAt('move', 1e9) >= 0);
check('no Math.random and no per-frame canvas work in the module', (() => { const src = require('fs').readFileSync(require.resolve('../shared/mm-creature-draw.js'), 'utf8').replace(/\/\/.*$/gm, ''); return !/Math\.random/.test(src) && !/requestAnimationFrame|setInterval/.test(src); })());

console.log((bad ? 'FAILED ' + bad : 'ok') + ' (' + n + ' checks)');
process.exit(bad ? 1 : 0);
