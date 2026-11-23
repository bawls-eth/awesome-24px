// MMMiniArt (game/shared/mm-mini-art.js): the m01-m08 minigame sprite loader with procedural fallbacks.
// Node only, no server, no network: the loader runs against an in-memory fake fetch / Image. Reads files; writes nothing.
'use strict';
const fs = require('fs'), path = require('path');
const M = require('../shared/mm-mini-art.js');
let fail = 0;
const check = (n, c, x) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' ' + (x || ''))); if (!c) fail++; };

// 1. spec table matches CODEX-MINIGAME-ART-ASKS.md
const asks = fs.readFileSync(path.join(__dirname, '..', 'design', 'CODEX-MINIGAME-ART-ASKS.md'), 'utf8');
check('eight batches m01..m08', Object.keys(M.BATCHES).join() === 'm01,m02,m03,m04,m05,m06,m07,m08');
['m01', 'm02', 'm03', 'm04', 'm05', 'm06', 'm07', 'm08'].forEach((b) => check(b + ' label is the one in the asks doc', asks.indexOf('label `' + M.BATCHES[b].label + '`') >= 0, M.BATCHES[b].label));
check('m02: 24 species x (swim, flop, icon) + the lanternfish glow = 73 ids', M.ids('m02').length === 73, M.ids('m02').length);
const sw = M.spec('fish_eel_swim_right'), fl = M.spec('fish_minnow_flop_right'), ic = M.spec('fish_koi_icon');
check('fish strips: L eel 64 native (256 cell) 4 f 8 fps loop; S minnow flop 3 f 10 fps', sw.w === 64 && sw.up === 4 && sw.frames === 4 && sw.fps === 8 && sw.loop && fl.w === 32 && fl.frames === 3 && fl.fps === 10);
check('journal icon is 32x32 1x, one frame', ic.kind === 'icon' && ic.w === 32 && ic.h === 32 && ic.up === 1 && ic.frames === 1);
check('pop tiles 1..11, medals, trophies and backdrops are in the table', [1, 11].every((n) => M.spec('pop_tile_' + n)) && M.spec('medal_gold') && M.spec('trophy_isles') && M.spec('angler_spot_isles_cove_night').w === 390 && M.spec('jam_stage_bg').h === 220);
check('any bug species id resolves to m03 (idle 2 f, move 4 f, icon 32)', M.spec('bug_ladybird_idle').frames === 2 && M.spec('bug_ladybird_move').frames === 4 && M.spec('bug_ladybird_icon').w === 32 && M.batchFor('bug_x_move') === 'm03');
check('unknown / hostile ids are null', M.spec('nope') === null && M.spec('../x') === null && M.spec('__proto__') === null && M.spec(42) === null && M.pixels('nope') === null);
let dupe = 0; const seen = {}; Object.keys(M.BATCHES).forEach((b) => M.ids(b).forEach((id) => { if (seen[id]) dupe++; seen[id] = 1; }));
check('no id is owned by two batches', dupe === 0, dupe);

// 2. procedural fallback: every id draws, deterministic, crisp, outlined, on the 16 colour palette + rim
const allowed = new Set(M.PAL.concat([M.RIM]).map((h) => h.toLowerCase()));
const hex = (d, q) => '#' + [d[q], d[q + 1], d[q + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
let bad = [], softA = 0, offPal = 0, noRim = 0, empty = 0;
M.ids().forEach((id) => {
  const s = M.spec(id), p = M.pixels(id, 0);
  if (!p || p.w !== s.w || p.h !== s.h || p.data.length !== s.w * s.h * 4) { bad.push(id); return; }
  let op = 0, rim = 0;
  for (let q = 0; q < p.data.length; q += 4) {
    const a = p.data[q + 3]; if (a !== 0 && a !== 255) softA++;
    if (a) { op++; const h = hex(p.data, q); if (!allowed.has(h)) offPal++; if (h === M.RIM) rim++; }
  }
  if (!op) empty++;
  if (s.kind !== 'tile' && s.kind !== 'backdrop' && !rim) noRim++;
});
check('every spec id has a native-size fallback', bad.length === 0, bad.slice(0, 5).join());
check('fallbacks are crisp (alpha 0 or 255 only)', softA === 0, softA);
check('fallbacks use only the MM8 palette + the navy rim', offPal === 0, offPal);
check('every sprite / icon fallback has a navy outline, none is empty', noRim === 0 && empty === 0, noRim + ' / ' + empty);
const a1 = M.pixels('fish_trout_swim_right', 1), a2 = M.pixels('fish_trout_swim_right', 1), a0 = M.pixels('fish_trout_swim_right', 0);
check('fallback is deterministic per (id, frame) and strips animate across frames', Buffer.compare(Buffer.from(a1.data), Buffer.from(a2.data)) === 0 && Buffer.compare(Buffer.from(a0.data), Buffer.from(a1.data)) !== 0);
const tile = M.pixels('dd_tile_stone'); let tOp = true; for (let q = 3; q < tile.data.length; q += 4) if (tile.data[q] !== 255) tOp = false;
check('tiles are opaque', tOp);
const n1 = M.pixels('jam_lane_note_1'), n4 = M.pixels('jam_lane_note_4'), cnt = (p) => { let c = 0; for (let q = 3; q < p.data.length; q += 4) if (p.data[q]) c++; return c; };
check('lane notes differ by SHAPE (circle vs square), not only colour', cnt(n1) !== cnt(n4));
const src = fs.readFileSync(path.join(__dirname, '..', 'shared', 'mm-mini-art.js'), 'utf8');
check('no Math.random / Date / storage / Firebase in the module', !/Math\.random|Date\.|new Date|localStorage|firebase/i.test(src));

// 3. loader against a fake INDEX / manifest / Image
const files = {
  'R/INDEX.json': { batches: [{ id: 'b12', path: 'assets/arcane/b12-overworld-props-nature' }, { id: 'm02', path: 'assets/arcane/m02-angler-fish' }, { id: 'm08', path: 'assets/arcane/m08-minigame-ui' }] },
  'R/m02-angler-fish/manifest.json': { assets: [
    { id: 'fish_trout_swim_right', path: 'fish/fish_trout_swim_right.png', frames: 4, frame_w: 192, frame_h: 192, fps: 8, loop: true, anchor: { x: 96, y: 96 } },
    { id: 'fish_koi_icon', path: 'fish/fish_koi_icon.png', frames: 1, frame_w: 32, frame_h: 32 },
    { id: 'fish_pike_swim_right', path: 'fish/short.png', frames: 4, frame_w: 192, frame_h: 192 },
    { id: 'fish_carp_icon', path: '../../evil.png', frames: 1, frame_w: 32, frame_h: 32 },
    { id: 'medal_gold', path: 'x/medal_gold.png', frames: 1, frame_w: 32, frame_h: 32 },
    { id: 'not_an_id', path: 'x.png' }] },
  'R/m08-minigame-ui/manifest.json': { assets: [{ id: 'medal_gold', path: 'ui/medal_gold.png', frames: 1, frame_w: 32, frame_h: 32 }, { id: 'medal_silver', path: 'ui/missing.png' }] }
};
const sizes = { 'R/m02-angler-fish/fish/fish_trout_swim_right.png': [768, 192], 'R/m02-angler-fish/fish/fish_koi_icon.png': [32, 32], 'R/m02-angler-fish/fish/short.png': [384, 192], 'R/m08-minigame-ui/ui/medal_gold.png': [32, 32] };
const fetched = [];
const fakeFetch = (u) => { fetched.push(u); return Promise.resolve(files[u] ? { ok: true, json: () => Promise.resolve(files[u]) } : { ok: false }); };
function FakeImage() { this.naturalWidth = 0; this.naturalHeight = 0; }
Object.defineProperty(FakeImage.prototype, 'src', { set(u) { this._src = u; const s = sizes[u]; setTimeout(() => { if (s) { this.naturalWidth = s[0]; this.naturalHeight = s[1]; this.onload(); } else this.onerror(); }, 0); }, get() { return this._src; } });

check('pickFolders keeps only mNN-<label> folders', JSON.stringify(M.pickFolders(files['R/INDEX.json'])) === JSON.stringify({ m02: 'm02-angler-fish', m08: 'm08-minigame-ui' }));
(async () => {
  const none = await M.load(null, { root: 'R', fetch: () => Promise.reject(new Error('offline')), Image: FakeImage });
  check('offline: load resolves with every id on the code fallback', none.has('fish_trout_swim_right') === false && none.source('fish_trout_swim_right') === 'code');
  const set = await M.load(['m02', 'm08'], { root: 'R', fetch: fakeFetch, Image: FakeImage });
  check('a registered m02 strip and icon load as art', set.has('fish_trout_swim_right') && set.has('fish_koi_icon') && set.source('fish_koi_icon') === 'art');
  check('a strip smaller than frames x cell stays on the fallback', !set.has('fish_pike_swim_right') && set.source('fish_pike_swim_right') === 'code');
  check('a path with .. is never fetched', !set.has('fish_carp_icon') && !fetched.some((u) => /evil/.test(u)));
  check('an id from another batch inside m02 is rejected; m08 loads it from its own folder', set.has('medal_gold') && set.art.medal_gold.img.src === 'R/m08-minigame-ui/ui/medal_gold.png');
  check('a missing PNG stays on the fallback and is reported', !set.has('medal_silver') && set.warn.some((w) => /medal_silver/.test(w)));
  check('a 4x strip draws at native size: up = 4, anchor from the manifest', set.art.fish_trout_swim_right.up === 4 && set.art.fish_trout_swim_right.ax === 96);
  check('frameAt loops a loop strip and clamps a one-shot fallback', set.frameAt('fish_trout_swim_right', 0.5) === 0 && set.frameAt('fish_trout_swim_right', 0.2) === 1 && set.frameAt('pop_fx_pop', 99) === 4);
  const calls = []; const ctx = { imageSmoothingEnabled: true, drawImage(...a) { calls.push(a.concat([this.imageSmoothingEnabled])); }, save() {}, restore() {}, translate() {}, scale() {} };
  check('draw uses the art at native size x scale and turns smoothing off', set.draw(ctx, 'fish_trout_swim_right', 0, 100, 100, { scale: 2 }) === 'art' && calls[0][7] === 96 && calls[0][8] === 96 && calls[0][5] === 52 && calls[0][9] === false && ctx.imageSmoothingEnabled === true);
  check('draw never throws on bad input', set.draw(null, 'medal_gold', 0, 0, 0) === '' && set.draw(ctx, 'nope', 0, 0, 0) === '');
  console.log(fail ? fail + ' FAILED' : 'ALL PASSED'); process.exit(fail ? 1 : 0);
})();
