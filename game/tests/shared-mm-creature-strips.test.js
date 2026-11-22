// Node test for MMCreatureStrips (b31a / b32 creature PNG strips) and the b33 prop helpers in MMIsleArt: the strip table matches the batch
// manifests, facing / action / frame math, seat offsets, the loader + per-creature fallback with stub images, and prop id mapping.
// Run: node game/tests/shared-mm-creature-strips.test.js   (no DOM, no browser, no network)
const fs = require('fs');
const path = require('path');
const M = require('../shared/mm-creature-strips.js');
const A = require('../shared/mm-isle-art.js');
let failed = 0;
function check(name, ok, extra) { console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' ' + (extra || ''))); if (!ok) failed++; }
const ART = path.join(__dirname, '..', 'assets', 'arcane');
const man = (d) => JSON.parse(fs.readFileSync(path.join(ART, d, 'manifest.json'), 'utf8'));

(async () => {
  // 1 the inline table mirrors the manifests: every manifest strip is listed with the same frames / fps / loop / cell / anchor / seat
  // b31b: vinecoil + canopy_glider are wired (moth_lantern has no MMCreatures def yet, so its strips are not in the table)
  const b31b = man('b31b-jungle-creatures-rest').assets.filter((a) => a.enemy === 'vinecoil' || a.enemy === 'canopy_glider');
  // AW2: b31af (glimmerfrog sleep + eat), b32s (stegolith body + saddle overlays), b36 (the seven meadow tameables) are wired in full
  const assets = man('b31a-jungle-creatures-core').assets.concat(b31b, man('b32-jungle-big-and-boss').assets, man('b31af-glimmerfrog-rest').assets,
    man('b32s-stegolith').assets, man('b36-meadow-creatures').assets, man('b38a-reef-puffer').assets);
  // AW4: b38b-f the rest of the reef, wired in full (shellcrab 14, the two swim mounts 20 + 20 with saddles, glowjelly 12, fin raider 14, turtle 14)
  const b38 = ['b38b-shellcrab', 'b38c-reef-mounts', 'b38d-glowjelly', 'b38e-fin-raider', 'b38f-isleback-turtle'].map((d) => man(d).assets);
  b38.forEach((a) => { assets.push.apply(assets, a); });
  // AW5: b38g the Tide Hydra boss (12 core + 3 six-frame roars) and b40a the pengling (14), both provisional, wired in full
  const b38g = man('b38g-tide-hydra').assets, b40a = man('b40a-pengling').assets;
  assets.push.apply(assets, b38g); assets.push.apply(assets, b40a);
  const files = M.files();
  const byId = {}; files.forEach((f) => { byId[f.id] = f; });
  check('364 strips: 40 b31a + 24 b31b + 43 b32 + 2 b31af + 20 b32s + 98 b36 + 14 b38a + 94 b38b-f (14 + 40 + 12 + 14 + 14) + 15 b38g + 14 b40a, one per manifest asset',
    files.length === 364 && b31b.length === 24 && assets.length === 364 && b38.map((a) => a.length).join() === '14,40,12,14,14' && b38g.length === 15 && b40a.length === 14
    && assets.every((a) => byId[a.id]) && new Set(files.map((f) => f.id)).size === 364, files.length + ' / ' + assets.length);
  const bad = [];
  assets.forEach((a) => {
    const k = a.enemy || a.creature, sp = M.SPECS[k], act = M.ACT[a.action];
    if (!sp || !act) { bad.push(a.id + ' unknown'); return; }
    if (M.framesOf(a.action, k) !== a.frames || M.fpsOf(a.action, k) !== a.fps || !!act[2] !== !!a.loop) bad.push(a.id + ' timing');
    if (sp.cell !== a.frame_w || sp.cell !== a.frame_h || sp.ax !== a.anchor.x || sp.ay !== a.anchor.y) bad.push(a.id + ' cell/anchor');
    if (a.seat && /^(saddle_)?(idle|move)$/.test(a.action)) {
      const d = M.DIRS.indexOf(a.dir), mv = /move/.test(a.action) ? 'move' : 'idle';
      if (JSON.stringify(sp.seat[mv][d]) !== JSON.stringify(a.seat.map((s) => s.y)) || sp.seat.x[d] !== a.seat[0].x) bad.push(a.id + ' seat');
    }
    const fp = path.join(__dirname, '..', 'games', 'isles', byId[a.id].url);
    if (!fs.existsSync(fp)) bad.push(a.id + ' file');
    else { const b = fs.readFileSync(fp); if (b.readUInt32BE(16) !== a.frame_w * a.frames || b.readUInt32BE(20) !== a.frame_h) bad.push(a.id + ' png size'); } // PNG IHDR w / h
  });
  check('table frames / fps / loop / cell / anchor / seat match the manifests and every url resolves from the isles page', bad.length === 0, bad.join(', '));

  // 2 facing: dominant axis, left = code 3, slow keeps the previous view, near-diagonals keep the previous axis (no flicker)
  check('dirCode: right / left / down / up', M.dirCode(50, 5, 0) === M.RIGHT && M.dirCode(-50, 5, 0) === M.LEFT && M.dirCode(3, 60, 1) === M.DOWN && M.dirCode(3, -60, 0) === M.UP);
  check('dirCode: below the still speed the previous facing stays', M.dirCode(1, 1, M.LEFT) === M.LEFT && M.dirCode(0, 0, M.UP) === M.UP && M.dirCode(0, 0, 9) === M.DOWN);
  check('dirCode: a 45 degree move keeps the axis it already had (hysteresis)', M.dirCode(40, 40, M.RIGHT) === M.RIGHT && M.dirCode(40, 40, M.DOWN) === M.DOWN && M.dirCode(-40, -40, M.UP) === M.UP);
  check('dirCode: hostile input is a number in 0..3', [M.dirCode(NaN, 'x', null), M.dirCode(Infinity, 0, 0), M.dirCode()].every((d) => d >= 0 && d <= 3));

  // 3 frame math: loops wrap, one-shots hold the last frame
  check('frameIndex idle 6 fps wraps over 4 frames', M.frameIndex('idle', 0) === 0 && M.frameIndex('idle', 0.5) === 3 && M.frameIndex('idle', 0.7) === 0 && M.frameIndex('idle', 1.0) === 2);
  check('frameIndex move 10 fps wraps over 6 frames', M.frameIndex('move', 0.55) === 5 && M.frameIndex('move', 0.65) === 0);
  check('frameIndex death / roar hold their last frame', M.frameIndex('death', 0.45) === 4 && M.frameIndex('death', 9) === 4 && M.frameIndex('roar', 0.1) === 1 && M.frameIndex('roar', 3) === 4);
  check('frameIndex clamps negative / NaN time to frame 0', M.frameIndex('idle', -3) === 0 && M.frameIndex('attack', NaN) === 0);
  check('duration of one-shots (attack 5 @ 12, death 5 @ 10)', Math.abs(M.duration('attack') - 5 / 12) < 1e-9 && Math.abs(M.duration('death') - 0.5) < 1e-9);

  // 4 action picker and its per-creature fallbacks
  const st = (o) => Object.assign({ dying: false, ko: false, eating: false, ph: '', moving: false }, o);
  check('actionFor: idle / move / strike -> attack / dying -> death', M.actionFor('fernraptor', st({})) === 'idle' && M.actionFor('fernraptor', st({ moving: true })) === 'move'
    && M.actionFor('fernraptor', st({ ph: 'strike' })) === 'attack' && M.actionFor('tusktop', st({ dying: true, moving: true })) === 'death');
  check('actionFor: the boss wind-up is its roar, other wind-ups are attack', M.actionFor('fernjaw_tyrant', st({ ph: 'wind' })) === 'roar' && M.actionFor('tusktop', st({ ph: 'wind' })) === 'attack');
  check('actionFor: ko -> sleep, fed -> eat (eat wins over sleep)', M.actionFor('chompbill', st({ ko: true })) === 'sleep' && M.actionFor('chompbill', st({ eating: true })) === 'eat'
    && M.actionFor('chompbill', st({ ko: true, eating: true })) === 'eat');
  check('actionFor: glimmerfrog sleeps / eats from the b31af strips', M.actionFor('glimmerfrog', st({ ko: true })) === 'sleep' && M.actionFor('glimmerfrog', st({ eating: true })) === 'eat'
    && /b31af-glimmerfrog-rest\/enemies\/glimmerfrog\/glimmerfrog_sleep_down\.png$/.test(byId.glimmerfrog_sleep_down.url) && /b31a-/.test(byId.glimmerfrog_idle_down.url));
  check('actionFor: unknown species / bad state -> idle', M.actionFor('moth_lantern', st({ moving: true })) === 'idle' && M.actionFor('fernraptor', null) === 'idle');
  check('b36: the seven MMCreatures meadow ids, each with the 14 strips; small-four death at 10 fps, boar / strider / oakback at 9', M.kindsFor('meadow').join() === 'clover_hopper,puffwool,bumble_mote,pebble_tortle,thistle_boar,meadow_strider,oakback'
    && M.kindsFor('meadow').every((k) => files.filter((f) => f.kind === k).length === 14) && M.fpsOf('death', 'puffwool') === 10 && M.fpsOf('death', 'thistle_boar') === 9 && M.fpsOf('death', 'tusktop') === 10
    && M.frameIndex('death', 0.42) === 4 && M.frameIndex('death', 0.42, 'oakback') === 3 && Math.abs(M.duration('death', 'oakback') - 5 / 9) < 1e-9);
  const SZ = { S: 48, M: 64, L: 96, XL: 128 }, CR = require('../shared/mm-creatures.js');
  // (b36 meadow + b38a reef; the b31a / b31b jungle S species were delivered in 256 px cells before the size classes and still are)
  const szBad = M.KINDS.filter((k) => M.SPECS[k].biome !== 'jungle').filter((k) => { const d = CR.get(k); return !d || SZ[d.size] !== M.SPECS[k].cell / M.SCALE; });
  check('every meadow / reef strip species is an MMCreatures id whose native cell matches its size class (S 48, M 64, L 96, XL 128)', szBad.length === 0, szBad.join());
  const BP = require('../shared/mm-biome-packs.js');
  const REEF = ['reef_puffer', 'shellcrab', 'glowjelly', 'fin_raider', 'tidesteed', 'skimray', 'isleback_turtle', 'tide_hydra'];
  check('b38a: reef_puffer is the canon reef species, in the reef spawn table, preloaded by the reef isle (14 strips, death 9 fps)', M.kindsFor('reef')[0] === 'reef_puffer'
    && BP.canon('reef_puffer') === 'reef_puffer' && CR.get('reef_puffer').biome === 'reef' && BP.creatureIds('reef').indexOf('reef_puffer') >= 0
    && files.filter((f) => f.kind === 'reef_puffer').length === 14 && M.fpsOf('death', 'reef_puffer') === 9);
  check('b38b-g: the eight reef strip species are canon MMCreatures reef ids in the reef pack (spawn table, rare or boss), 12 / 14 / 15 / 20 strips each, no fps overrides but the hydra roar',
    M.kindsFor('reef').join() === REEF.join() && REEF.every((k) => BP.canon(k) === k && CR.get(k) && CR.get(k).biome === 'reef' && BP.allIds('reef').indexOf(k) >= 0)
    && REEF.map((k) => files.filter((f) => f.kind === k).length).join() === '14,14,12,14,20,20,14,15' && ['shellcrab', 'glowjelly', 'fin_raider', 'tidesteed', 'skimray', 'isleback_turtle'].every((k) => !M.SPECS[k].fps));
  check('b38g: the Tide Hydra is the reef boss with a 6-frame roar at 10 fps in all three views (wind-up telegraph); other actions keep the shared timing',
    CR.get('tide_hydra').tier === 'boss' && M.actionFor('tide_hydra', st({ ph: 'wind' })) === 'roar' && M.framesOf('roar', 'tide_hydra') === 6 && M.framesOf('roar', 'fernjaw_tyrant') === 5
    && M.fpsOf('roar', 'tide_hydra') === 10 && Math.abs(M.duration('roar', 'tide_hydra') - 0.6) < 1e-9 && M.frameIndex('roar', 0.55, 'tide_hydra') === 5 && M.frameIndex('roar', 9, 'tide_hydra') === 5
    && M.frameIndex('roar', 0.55) === 4 && M.stripId('tide_hydra', 'roar', M.LEFT) === 'tide_hydra_roar_right' && M.stripId('tide_hydra', 'sleep', 0) === null && M.saddleFor('tide_hydra', true) === null
    && M.seatOffset('tide_hydra', false, 0, 0, { x: 0, y: 0 }) === false && M.SPECS.tide_hydra.cell === 512);
  check('b40a: the pengling is the first tundra strip species (S 192 px, feet 96,171, the 14 strips, death at 10 fps), the canon tundra tame',
    M.kindsFor('tundra').join() === 'pengling' && BP.canon('pengling') === 'pengling' && BP.creatureIds('tundra').indexOf('pengling') >= 0 && CR.get('pengling').biome === 'tundra'
    && files.filter((f) => f.kind === 'pengling').length === 14 && M.fpsOf('death', 'pengling') === 10 && M.actionFor('pengling', st({ eating: true })) === 'eat' && /b40a-pengling\/creatures\/pengling\/pengling_eat_down\.png$/.test(byId.pengling_eat_down.url));
  check('b38c/f: the swim mounts are MMCreatures rideables (swim) with seats; tidesteed / skimray have saddle overlays, the turtle (saddle: null) rides bare',
    ['tidesteed', 'skimray', 'isleback_turtle'].every((k) => CR.get(k).ride && CR.get(k).ride.swim && M.seatOffset(k, false, M.DOWN, 0, { x: 0, y: 0 }))
    && M.saddleFor('tidesteed', true) === 'saddle_move' && M.saddleFor('skimray', false) === 'saddle_idle' && M.saddleFor('isleback_turtle', true) === null && CR.get('isleback_turtle').ride.saddle === null
    && M.saddleFor('shellcrab', false) === null);
  check('kindsFor: an island preloads its biome plus the stable roster (jungle 8, reef 8, tundra 1, mars 0, meadow + a tusktop 8)', M.kindsFor('jungle').length === 8 && M.kindsFor('jungle').indexOf('stegolith') >= 0
    && M.kindsFor('reef').length === 8 && M.kindsFor('tundra').length === 1 && M.kindsFor('mars').length === 0 && M.kindsFor('meadow', ['tusktop', 'nope']).length === 8);
  check('saddleFor: the stegolith has overlays; the meadow strider (no saddle) has none', M.saddleFor('stegolith', true) === 'saddle_move' && M.saddleFor('meadow_strider', false) === null);
  check('saddleFor: tusktop / tyrant have overlays, others none', M.saddleFor('tusktop', true) === 'saddle_move' && M.saddleFor('fernjaw_tyrant', false) === 'saddle_idle' && M.saddleFor('fernraptor', true) === null);
  check('stripId: precomputed, left reuses right, down-only actions stay down', M.stripId('tusktop', 'move', M.LEFT) === 'tusktop_move_right' && M.stripId('fernraptor', 'sleep', M.UP) === 'fernraptor_sleep_down'
    && M.stripId('tusktop', 'move', M.LEFT) === M.stripId('tusktop', 'move', M.LEFT) && M.stripId('nope', 'idle', 0) === null);
  check('flipFor: only left mirrors, never a down-only strip', M.flipFor('move', M.LEFT) && !M.flipFor('move', M.RIGHT) && !M.flipFor('sleep', M.LEFT) && !M.flipFor('eat', M.LEFT));
  const seat = { x: 0, y: 0 };
  check('seatOffset: tusktop idle down frame 0 = 47.5 px above the feet, centred', M.seatOffset('tusktop', false, M.DOWN, 0, seat) && seat.x === 0 && seat.y === (350 - 160) / 4);
  check('seatOffset: right / left mirror x, frame wraps', M.seatOffset('tusktop', true, M.RIGHT, 7, seat) && seat.x === -5 && seat.y === (350 - 204) / 4
    && M.seatOffset('tusktop', true, M.LEFT, 1, seat) && seat.x === 5);
  check('seatOffset (b38 revisions): tidesteed right move frame 1 (manifest 180,120), skimray left idle mirrors x (184,188), turtle down idle (256,176) = 71.75 px up with no drawn-seat nudge left', M.seatOffset('tidesteed', true, M.RIGHT, 1, seat) && seat.x === -3 && seat.y === (347 - 120) / 4
    && M.seatOffset('skimray', false, M.LEFT, 0, seat) && seat.x === 2 && seat.y === (347 - 188) / 4 && M.seatOffset('isleback_turtle', false, M.DOWN, 0, seat) && seat.x === 0 && seat.y === (463 - 176) / 4 && !M.SPECS.isleback_turtle.sdy
    && M.seatOffset('isleback_turtle', true, M.LEFT, 3, seat) && seat.x === 5 && seat.y === (463 - 176) / 4);
  check('seatOffset: no seat data -> false', M.seatOffset('fernraptor', false, 0, 0, seat) === false);
  check('seatOffset: stegolith (b32s) and meadow strider (b36) seats from their manifests', M.seatOffset('stegolith', false, M.DOWN, 2, seat) && seat.x === -1 && seat.y === (463 - 216) / 4
    && M.seatOffset('meadow_strider', true, M.LEFT, 3, seat) && seat.x === 0.75 && seat.y === (347 - 153) / 4);
  check('oakback is a native 512 cell (no 2x display override left); its seat-less spec stays false', M.SPECS.oakback.cell === 512 && !('k' in M.SPECS.oakback) && M.seatOffset('oakback', false, 0, 0, seat) === false);

  // 5 loader: stub images + stub canvas; native 1/4 bake; per-creature fallback when a needed strip is missing
  const canvases = [];
  const mk = (w, h) => { const calls = []; const cv = { width: w, height: h, calls, getContext: () => ({ drawImage: (...a) => calls.push(a), set imageSmoothingEnabled(v) { cv.smooth = v; } }) }; canvases.push(cv); return cv; };
  const img = (u) => { const f = files.find((x) => u.endsWith(x.id + '.png')); const cell = M.SPECS[f.kind].cell; return { naturalWidth: cell * M.framesOf(f.act, f.kind), naturalHeight: cell, u }; };
  const asked = [];
  const set = M.create({ create: mk, loadImage: (u) => { asked.push(u); return Promise.resolve(/glimmerfrog_move_up/.test(u) ? null : img(u)); } });
  check('before ready: nothing is drawn from PNG', !set.has('fernraptor') && set.get('fernraptor', 'idle', 0) === null);
  await set.ready;
  check('loads each of the 364 PNGs exactly once', asked.length === 364 && new Set(asked).size === 364);
  check('complete creatures are on, glimmerfrog (a missing move_up) falls back to the code bake', set.has('fernraptor') && set.has('tusktop') && set.has('fernjaw_tyrant') && set.has('chompbill') && !set.has('glimmerfrog'));
  const fr = set.get('fernraptor', 'move', M.LEFT), tk = set.get('tusktop', 'saddle_move', M.DOWN), ty = set.get('fernjaw_tyrant', 'roar', M.UP);
  check('baked strips are native size (256 -> 64, 384 -> 96, 512 -> 128) with the anchor scaled', fr.w === 64 && fr.frames === 6 && fr.ax === 32 && fr.ay === 231 / 4 && tk.w === 96 && tk.id === 'tusktop_saddle_move_down' && ty.w === 128 && ty.id === 'fernjaw_tyrant_roar_up');
  const hr = set.get('tide_hydra', 'roar', M.LEFT);
  check('the hydra roar bakes all 6 frames (512 -> 128) and the pengling is on', hr.frames === 6 && hr.w === 128 && hr.src.width === 128 * 6 && set.has('tide_hydra') && set.has('pengling'));
  check('each loaded strip (363: one failed) is baked once onto a frames x native canvas with smoothing off', canvases.length === 363 && fr.src.width === 64 * 6 && fr.src.height === 64 && fr.src.smooth === false);
  const oak = set.get('oakback', 'idle', M.DOWN), steg = set.get('stegolith', 'saddle_idle', M.RIGHT);
  const pw = set.get('puffwool', 'idle', M.DOWN), sd = set.get('meadow_strider', 'move', M.RIGHT), rp = set.get('reef_puffer', 'eat', M.LEFT);
  check('b36 / b38a redo cells bake to their size class: oakback 512 -> 128 (feet 463/4), strider 384 -> 96, puffwool / reef puffer 192 -> 48; stegolith 512 -> 128',
    oak.sw === 128 && oak.w === 128 && oak.ay === 463 / 4 && oak.ax === 64 && sd.w === 96 && sd.ay === 347 / 4 && pw.w === 48 && pw.ay === 169 / 4 && pw.ax === 24
    && rp.w === 48 && rp.id === 'reef_puffer_eat_down' && rp.ay === 171 / 4 && steg.w === 128 && steg.id === 'stegolith_saddle_idle_right' && set.has('stegolith') && set.has('puffwool') && set.has('reef_puffer'));
  const odd = M.create({ create: mk, kinds: ['puffwool'], loadImage: (u) => Promise.resolve(/idle_down/.test(u) ? { naturalWidth: 256 * 4, naturalHeight: 256 } : /sleep_down/.test(u) ? { naturalWidth: 300, naturalHeight: 30 } : img(u)) });
  await odd.ready;
  const o1 = odd.get('puffwool', 'idle', M.DOWN);
  check('the loader trusts the PNG cell (frame_h): a 256 px puffwool strip bakes to 64 with the anchor scaled; a tiny one is rejected', o1.w === 64 && Math.abs(o1.ay - 169 / 3) < 1e-9 && o1.ax === 32
    && odd.has('puffwool') && odd.count() === 13 && odd.get('puffwool', 'sleep', M.DOWN).id === 'puffwool_idle_down');
  check('get() falls back to idle of the same view for an action a creature lacks', set.get('chompbill', 'roar', M.RIGHT).id === 'chompbill_idle_right');
  const calls = []; const ctx = { drawImage: (...a) => calls.push(a), save: () => calls.push('save'), translate: () => {}, scale: () => {}, restore: () => calls.push('restore') };
  set.draw(ctx, fr, 7, 100, 200, 1, false);
  const d = calls[0];
  check('draw blits one cell at the anchor (frame wraps 7 -> 1)', d[1] === 64 && d[2] === 0 && d[3] === 64 && d[5] === 100 - 32 && d[6] === 200 - 231 / 4 && d[7] === 64);
  calls.length = 0; set.draw(ctx, fr, 0, 100, 200, 1, true);
  check('a flipped draw is wrapped in save / restore', calls[0] === 'save' && calls[calls.length - 1] === 'restore');
  // the bake measures the opaque top row and the widest opaque run (the shadow is sized to the body): a 20 px wide body from row 10
  const pxc = (w, h) => ({ width: w, height: h, getContext: () => ({ drawImage: () => {}, getImageData: (x0, y0, gw, gh) => { const dd = new Uint8ClampedArray(gw * gh * 4);
    for (let y = 10; y < gh; y++) for (let fi = 0; fi < gw / 48; fi++) for (let x = 14 + fi; x < 34 + fi - (fi ? 2 : 0); x++) dd[(y * gw + fi * 48 + x) * 4 + 3] = 255; return { data: dd }; } }) });
  const meas = M.create({ create: pxc, kinds: ['reef_puffer'], loadImage: (u) => Promise.resolve(img(u)) });
  await meas.ready;
  const ms = meas.get('reef_puffer', 'idle', M.DOWN);
  check('bake measures top (10) and span (widest frame, 20 of a 48 cell) once per strip', ms.top === 10 && ms.span === 20 && ms.w === 48, JSON.stringify({ top: ms.top, span: ms.span }));
  check('without getImageData the span is the whole cell', fr.span === fr.w);
  const off = M.create({ art: false, loadImage: () => { throw new Error('must not load'); } });
  await off.ready;
  check('art:false loads nothing and has no creature', off.count() === 0 && !off.has('fernraptor'));
  const fail = M.create({ create: mk, loadImage: () => { throw new Error('x'); } });
  await fail.ready;
  check('a throwing loader never rejects, every creature falls back', M.KINDS.every((k) => !fail.has(k)));
  const only = M.create({ create: mk, kinds: ['tusktop'], loadImage: (u) => Promise.resolve(img(u)) });
  await only.ready;
  check('kinds narrows the load (tusktop only: 20 strips)', only.count() === 20 && only.has('tusktop') && !only.has('fernraptor'));

  // 6 b33 props: ids match the manifest, jungle_tree mixes a / b by the tile hash, unknown ids stay code props
  const pm = man('b33-jungle-props').assets;
  check('MMIsleArt.PROPS matches the b33 manifest (size + anchor)', pm.length === 8 && pm.every((a) => { const p = A.PROPS[a.id]; return p && p[0] === a.frame_w && p[1] === a.frame_h && p[2] === a.anchor[0] && p[3] === a.anchor[1]; }));
  const purl = []; const props = await A.loadProps({ loadImage: (u) => { purl.push(u); return Promise.resolve(/temple_idol/.test(u) ? null : { u }); } });
  check('loadProps asks the 8 b33 PNGs; a failed one is absent', purl.length === 8 && purl.every((u) => /b33-jungle-props\/props\/[a-z_]+\.png$/.test(u)) && Object.keys(props).length === 7 && !props.temple_idol);
  const trees = new Set(); for (let x = 0; x < 40; x++) trees.add(A.propFor(props, 'jungle_tree', x, 3).img.u);
  check('jungle_tree picks both b33 trees across tiles, the same tile always the same tree', trees.size === 2 && A.propFor(props, 'jungle_tree', 5, 9) === A.propFor(props, 'jungle_tree', 5, 9));
  check('propFor maps by id; reeds / log / failed ids stay code props', A.propFor(props, 'giant_fern', 1, 1) === props.giant_fern && A.propFor(props, 'reeds', 1, 1) === null && A.propFor(props, 'temple_idol', 1, 1) === null && A.propFor(null, 'giant_fern', 0, 0) === null);
  const pc = []; const pctx = { drawImage: (...a) => pc.push(a) };
  A.drawPropArt(pctx, props.jungle_tree_a, 'jungle_tree', 64, 32, 32); A.drawPropArt(pctx, props.hanging_vine, 'hanging_vine', 0, 0, 32);
  check('ground props stand on the tile bottom centre, the vine hangs from the tile top', pc[0][1] === 64 + 16 - 32 && pc[0][2] === 32 + 30 - 62 && pc[1][1] === 0 && pc[1][2] === -2);
  check('loadProps with every PNG failing gives null, never rejects', (await A.loadProps({ loadImage: () => Promise.resolve(null) })) === null);

  // 7 b35 meadow props and b34b icons: the tables match the manifests and every file exists
  const mm = man('b35-meadow-home').assets.filter((a) => a.category === 'prop');
  check('MMIsleArt.MEADOW_PROPS matches the b35 prop manifest (size, anchor, frames)', mm.length === 10 && mm.length === Object.keys(A.MEADOW_PROPS).length
    && mm.every((a) => { const p = A.MEADOW_PROPS[a.id]; return p && p[0] * (a.frames || 1) === a.frame_w * (a.frames || 1) && p[0] === a.frame_w && p[1] === a.frame_h && p[2] === a.anchor[0] && p[3] === a.anchor[1] && p[4] === a.frames; }));
  const mpu = []; const mprops = await A.loadProps({ pack: 'meadow', loadImage: (u) => { mpu.push(u); return Promise.resolve({ u }); } });
  check('loadProps(meadow) asks the 10 b35 props; garden_plot mixes the 4 stages, the pen shows the stable', mpu.length === 10 && mpu.every((u) => /b35-meadow-home\/props\/[a-z_0-9]+\.png$/.test(u))
    && new Set(Array.from({ length: 40 }, (v, x) => A.propFor(mprops, 'garden_plot', x, 1).img.u)).size === 4 && A.propFor(mprops, 'pen', 0, 0) === mprops.stable && A.propFor(mprops, 'fence', 0, 0) === null);
  const bc = []; A.drawPropArt({ drawImage: (...a) => bc.push(a) }, mprops.boat, 'boat', 0, 0, 32);
  check('the 2-frame boat strip bakes its first 64x32 frame', bc[0].length === 9 && bc[0][1] === 0 && bc[0][3] === 64 && bc[0][7] === 64);
  const im = man('b34b-crafting-icons').assets.filter((a) => a.category === 'item').map((a) => a.id.replace(/^icon_/, ''));
  check('b34b: ITEM_ICONS are the 15 manifest items, each file exists from the isles page; unknown ids have no icon', im.length === 15 && im.slice().sort().join() === A.ITEM_ICONS.slice().sort().join()
    && A.ITEM_ICONS.every((id) => fs.existsSync(path.join(__dirname, '..', 'games', 'isles', A.iconUrl(id)))) && A.iconUrl('feast') === null && A.iconUrl({}) === null);

  if (failed) { console.log(failed + ' FAILED'); process.exit(1); }
  console.log('ALL PASSED');
})().catch((e) => { console.error(e); process.exit(1); });
