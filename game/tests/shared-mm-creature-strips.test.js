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
  const assets = man('b31a-jungle-creatures-core').assets.concat(b31b, man('b32-jungle-big-and-boss').assets);
  const files = M.files();
  const byId = {}; files.forEach((f) => { byId[f.id] = f; });
  check('107 strips: 40 from b31a + 24 from b31b + 43 from b32, one per manifest asset', files.length === 107 && b31b.length === 24 && assets.length === 107 && assets.every((a) => byId[a.id]));
  const bad = [];
  assets.forEach((a) => {
    const k = a.enemy || a.creature, sp = M.SPECS[k], act = M.ACT[a.action];
    if (!sp || !act) { bad.push(a.id + ' unknown'); return; }
    if (act[0] !== a.frames || act[1] !== a.fps || !!act[2] !== !!a.loop) bad.push(a.id + ' timing');
    if (sp.cell !== a.frame_w || sp.cell !== a.frame_h || sp.ax !== a.anchor.x || sp.ay !== a.anchor.y) bad.push(a.id + ' cell/anchor');
    if (a.seat && /^(saddle_)?(idle|move)$/.test(a.action)) {
      const d = M.DIRS.indexOf(a.dir), mv = /move/.test(a.action) ? 'move' : 'idle';
      if (JSON.stringify(sp.seat[mv][d]) !== JSON.stringify(a.seat.map((s) => s.y)) || sp.seat.x[d] !== a.seat[0].x) bad.push(a.id + ' seat');
    }
    if (!fs.existsSync(path.join(__dirname, '..', 'games', 'isles', byId[a.id].url))) bad.push(a.id + ' file');
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
  check('actionFor: glimmerfrog has no sleep / eat strips -> idle', M.actionFor('glimmerfrog', st({ ko: true })) === 'idle' && M.actionFor('glimmerfrog', st({ eating: true })) === 'idle');
  check('actionFor: unknown species / bad state -> idle', M.actionFor('stegolith', st({ moving: true })) === 'idle' && M.actionFor('fernraptor', null) === 'idle');
  check('saddleFor: tusktop / tyrant have overlays, others none', M.saddleFor('tusktop', true) === 'saddle_move' && M.saddleFor('fernjaw_tyrant', false) === 'saddle_idle' && M.saddleFor('fernraptor', true) === null);
  check('stripId: precomputed, left reuses right, down-only actions stay down', M.stripId('tusktop', 'move', M.LEFT) === 'tusktop_move_right' && M.stripId('fernraptor', 'sleep', M.UP) === 'fernraptor_sleep_down'
    && M.stripId('tusktop', 'move', M.LEFT) === M.stripId('tusktop', 'move', M.LEFT) && M.stripId('nope', 'idle', 0) === null);
  check('flipFor: only left mirrors, never a down-only strip', M.flipFor('move', M.LEFT) && !M.flipFor('move', M.RIGHT) && !M.flipFor('sleep', M.LEFT) && !M.flipFor('eat', M.LEFT));
  const seat = { x: 0, y: 0 };
  check('seatOffset: tusktop idle down frame 0 = 47.5 px above the feet, centred', M.seatOffset('tusktop', false, M.DOWN, 0, seat) && seat.x === 0 && seat.y === (350 - 160) / 4);
  check('seatOffset: right / left mirror x, frame wraps', M.seatOffset('tusktop', true, M.RIGHT, 7, seat) && seat.x === -5 && seat.y === (350 - 204) / 4
    && M.seatOffset('tusktop', true, M.LEFT, 1, seat) && seat.x === 5);
  check('seatOffset: no seat data -> false', M.seatOffset('fernraptor', false, 0, 0, seat) === false);

  // 5 loader: stub images + stub canvas; native 1/4 bake; per-creature fallback when a needed strip is missing
  const canvases = [];
  const mk = (w, h) => { const calls = []; const cv = { width: w, height: h, calls, getContext: () => ({ drawImage: (...a) => calls.push(a), set imageSmoothingEnabled(v) { cv.smooth = v; } }) }; canvases.push(cv); return cv; };
  const img = (u) => { const f = files.find((x) => u.endsWith(x.id + '.png')); const cell = M.SPECS[f.kind].cell; return { naturalWidth: cell * M.ACT[f.act][0], naturalHeight: cell, u }; };
  const asked = [];
  const set = M.create({ create: mk, loadImage: (u) => { asked.push(u); return Promise.resolve(/glimmerfrog_move_up/.test(u) ? null : img(u)); } });
  check('before ready: nothing is drawn from PNG', !set.has('fernraptor') && set.get('fernraptor', 'idle', 0) === null);
  await set.ready;
  check('loads each of the 107 PNGs exactly once', asked.length === 107 && new Set(asked).size === 107);
  check('complete creatures are on, glimmerfrog (a missing move_up) falls back to the code bake', set.has('fernraptor') && set.has('tusktop') && set.has('fernjaw_tyrant') && set.has('chompbill') && !set.has('glimmerfrog'));
  const fr = set.get('fernraptor', 'move', M.LEFT), tk = set.get('tusktop', 'saddle_move', M.DOWN), ty = set.get('fernjaw_tyrant', 'roar', M.UP);
  check('baked strips are native size (256 -> 64, 384 -> 96, 512 -> 128) with the anchor scaled', fr.w === 64 && fr.frames === 6 && fr.ax === 32 && fr.ay === 231 / 4 && tk.w === 96 && tk.id === 'tusktop_saddle_move_down' && ty.w === 128 && ty.id === 'fernjaw_tyrant_roar_up');
  check('each loaded strip (106: one failed) is baked once onto a frames x native canvas with smoothing off', canvases.length === 106 && fr.src.width === 64 * 6 && fr.src.height === 64 && fr.src.smooth === false);
  check('get() falls back to idle of the same view for an action a creature lacks', set.get('chompbill', 'roar', M.RIGHT).id === 'chompbill_idle_right');
  const calls = []; const ctx = { drawImage: (...a) => calls.push(a), save: () => calls.push('save'), translate: () => {}, scale: () => {}, restore: () => calls.push('restore') };
  set.draw(ctx, fr, 7, 100, 200, 1, false);
  const d = calls[0];
  check('draw blits one cell at the anchor (frame wraps 7 -> 1)', d[1] === 64 && d[2] === 0 && d[3] === 64 && d[5] === 100 - 32 && d[6] === 200 - 231 / 4 && d[7] === 64);
  calls.length = 0; set.draw(ctx, fr, 0, 100, 200, 1, true);
  check('a flipped draw is wrapped in save / restore', calls[0] === 'save' && calls[calls.length - 1] === 'restore');
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

  if (failed) { console.log(failed + ' FAILED'); process.exit(1); }
  console.log('ALL PASSED');
})().catch((e) => { console.error(e); process.exit(1); });
