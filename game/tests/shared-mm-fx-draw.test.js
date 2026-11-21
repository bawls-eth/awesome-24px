// Run: node game/tests/shared-mm-fx-draw.test.js  (stub 2D ctx, no DOM)
const F = require('../shared/mm-fx-draw.js');
let n = 0, bad = 0;
function check(name, ok) { n++; if (!ok) { bad++; console.log('FAIL ' + name); } }

// Stub ctx: records every call; any property write is stored. Tracks save/restore balance.
function stub() {
  const calls = [], state = {}; let depth = 0, minDepth = 0;
  const methods = ['save', 'restore', 'translate', 'rotate', 'scale', 'beginPath', 'moveTo', 'lineTo', 'arc', 'closePath', 'fill', 'stroke', 'quadraticCurveTo', 'fillText', 'fillRect'];
  const ctx = { calls, state, depth: () => depth, minDepth: () => minDepth };
  methods.forEach((m) => { ctx[m] = (...a) => { calls.push({ m, a }); if (m === 'save') depth++; if (m === 'restore') { depth--; minDepth = Math.min(minDepth, depth); } }; });
  return ctx;
}
const finite = (c) => c.calls.every((k) => k.a.every((v) => typeof v !== 'number' || Number.isFinite(v)));
const count = (c, m) => c.calls.filter((k) => k.m === m).length;

check('11 shapes and 17 glyphs listed', F.SHAPES.length === 11 && F.GLYPHS.length === 17 && new Set(F.SHAPES).size === 11 && new Set(F.GLYPHS).size === 17);

F.SHAPES.forEach((s) => {
  const c = stub();
  const ok = F.drawShape(c, s, 100, 50, 8, 0.7, '#ff00ff');
  check('shape ' + s + ' draws paths and stays balanced', ok && (count(c, 'fill') + count(c, 'stroke')) >= 1 && c.depth() === 0 && c.minDepth() === 0 && finite(c));
  check('shape ' + s + ' translates then rotates', c.calls[1].m === 'translate' && c.calls[1].a[0] === 100 && c.calls[2].m === 'rotate' && c.calls[2].a[0] === 0.7);
});

const REQUIRED = ['damaging', 'berserk', 'swift', 'armored', 'healing', 'shielded', 'inspired', 'weak', 'dazed', 'slowed', 'rooted', 'stunned', 'armorBroken', 'curse', 'bleed', 'sick', 'marked'];
check('every catalogue status id has a glyph', REQUIRED.every((id) => F.isGlyph(id)) && REQUIRED.length === F.GLYPHS.length);
check('negatives and positives classified', ['damaging', 'berserk', 'swift', 'armored', 'healing', 'shielded', 'inspired'].every(F.isPositive) && ['weak', 'dazed', 'slowed', 'rooted', 'stunned', 'armorBroken', 'curse', 'bleed', 'sick', 'marked'].every((k) => !F.isPositive(k)));
check('glyph colours match the catalogue', F.statusColor('damaging') === '#ffb347' && F.statusColor('marked') === '#ff8fa8' && F.statusColor('curse') === '#a050ff');
F.GLYPHS.forEach((id) => {
  const c = stub();
  const ok = F.drawGlyph(c, id, 20, 20, 14);
  check('glyph ' + id + ' draws and stays balanced', ok && (count(c, 'fill') + count(c, 'stroke')) >= 1 && c.depth() === 0 && finite(c));
  const i = stub();
  check('icon ' + id + ' draws disc, ring and glyph', F.drawIcon(i, id, 9, 9, 18, { frac: 0.4, stacks: 3, sec: 2 }) && count(i, 'arc') >= 3 && count(i, 'fillText') === 1 && i.depth() === 0 && finite(i));
});

// pie
const p = stub();
const sweep = F.pie(p, 10, 10, 8, 0.5, '#000');
const arc = p.calls.find((k) => k.m === 'arc');
check('50% pie draws an arc of PI starting at 12 o\'clock, clockwise', Math.abs(sweep - Math.PI) < 1e-9 && Math.abs(arc.a[4] - arc.a[3] - Math.PI) < 1e-9 && Math.abs(arc.a[3] + Math.PI / 2) < 1e-9 && arc.a[5] === false);
check('pie 0 draws nothing, pie 1 is a full circle, junk is clamped', F.pie(stub(), 0, 0, 5, 0) === 0 && Math.abs(F.pie(stub(), 0, 0, 5, 1) - Math.PI * 2) < 1e-9 && F.pie(stub(), 0, 0, 5, 7) === Math.PI * 2 && F.pie(stub(), 0, 0, 5, 'x') === 0 && F.pie(stub(), 0, 0, 5, NaN) === 0);
const ip = stub(); F.drawIcon(ip, 'bleed', 0, 0, 18, { frac: 0.75 });
check('icon pie covers the elapsed quarter', ip.calls.some((k) => k.m === 'arc' && Math.abs(k.a[4] - k.a[3] - Math.PI / 2) < 1e-9));
const ring = (c) => c.calls.filter((k) => k.m === 'stroke').length;
check('icon: stack digit only above 1', count((() => { const c = stub(); F.drawIcon(c, 'bleed', 0, 0, 18, { stacks: 1 }); return c; })(), 'fillText') === 0);
check('icon blinks in the last second but not with reduced motion', (() => {
  const a = stub(), b = stub(); F.drawIcon(a, 'curse', 0, 0, 18, { sec: 0.5, nowMs: 150 }); F.drawIcon(b, 'curse', 0, 0, 18, { sec: 0.5, nowMs: 150, reduceMotion: true });
  return a.globalAlpha === 0.45 && b.globalAlpha === undefined && ring(a) >= 1;
})());

// hostile input
const h = stub();
check('hostile shape/glyph args do not throw', (() => {
  try {
    F.drawShape(h, '__proto__', NaN, Infinity, -5, 'x', { a: 1 }); F.drawShape(h, 'constructor', 'a', null, 1e9, undefined, 'y'.repeat(100));
    F.drawGlyph(h, '__proto__', 0, 0, 10); F.drawGlyph(h, 'toString', 0, 0, 10); F.drawIcon(h, 'constructor', 0, 0, 10, null);
    F.drawIcon(h, 'bleed', NaN, NaN, NaN, { frac: 'q', stacks: {}, sec: [] }); F.pie(h, NaN, NaN, NaN, 0.3);
    return true;
  } catch (e) { return false; }
})() && finite(h) && h.depth() === 0);
check('null/invalid ctx returns false instead of throwing', F.drawShape(null, 'dot', 0, 0, 5, 0, '#fff') === false && F.drawGlyph({}, 'bleed', 0, 0, 5) === false && F.drawIcon(undefined, 'bleed', 0, 0, 5) === false && F.pie(null, 0, 0, 5, 0.5) === 0);
check('unknown shape falls back to a dot, unknown glyph draws nothing', (() => { const a = stub(), b = stub(); F.drawShape(a, 'nope', 0, 0, 5, 0, '#fff'); return count(a, 'arc') >= 1 && F.drawGlyph(b, 'nope', 0, 0, 5) === false && b.calls.length === 0; })());

// cache
let made = 0;
const cache = F.makeCache((w, h) => { made++; return { w, h, getContext: () => stub() }; }, 3);
const a1 = cache.get('a', 18, 18, (cx) => F.drawGlyph(cx, 'bleed', 9, 9, 12));
check('cache draws once and reuses', a1 && cache.get('a', 18, 18, () => { throw new Error('redraw'); }) === a1 && made === 1);
cache.get('b', 4, 4, () => {}); cache.get('c', 4, 4, () => {}); cache.get('a', 18, 18, () => {}); cache.get('d', 4, 4, () => {});
check('cache evicts least recently used past its cap', cache.size() === 3 && cache.get('b', 4, 4, () => {}) !== null && made === 5);
check('cache survives missing factory, no context, and a throwing draw', F.makeCache(null).get('x', 5, 5, () => {}) === null && F.makeCache(() => ({})).get('x', 5, 5, () => {}) === null && F.makeCache(() => ({ getContext: () => stub() })).get('x', 5, 5, () => { throw new Error('boom'); }) === null);
check('cache clamps canvas size', (() => { let sz; F.makeCache((w, hh) => { sz = [w, hh]; return { getContext: () => stub() }; }).get('k', 99999, -4, () => {}); return sz[0] === 512 && sz[1] === 1; })());
check('defaultCreate is null in node', F.defaultCreate(4, 4) === null);

console.log((bad ? 'FAILED ' + bad : 'ok') + ' (' + n + ' checks)');
process.exit(bad ? 1 : 0);
