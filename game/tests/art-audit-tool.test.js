// art-audit-3: the art health audit tool (game/tools/art-audit/run.js) decodes the PNGs it walks and finds no blockers in INDEX.json.
// Node only, no server, no network. Reads files; writes nothing.
'use strict';
const path = require('path'), fs = require('fs');
const A = require('../tools/art-audit/run.js');
let fail = 0;
const check = (n, c, x) => { console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' ' + (x || ''))); if (!c) fail++; };
const png = fs.readFileSync(path.join(__dirname, '..', 'assets', 'arcane', 'b40b-frostfox', 'creatures', 'frostfox', 'frostfox_idle_down.png'));
const img = A.decodePng(png);
check('decodePng reads a 4-frame 192 px strip as RGBA with a transparent corner', img.w === 768 && img.h === 192 && img.rgba.length === 768 * 192 * 4 && img.rgba[3] === 0, img.w + 'x' + img.h);
const { rows, batches } = A.run();
const blockers = rows.filter((r) => r.sev === 'blocker');
check('every INDEX.json batch is walked (b40b + b40c included)', batches.length >= 64 && batches.some((b) => b.id === 'b40b') && batches.some((b) => b.id === 'b40c'), batches.length);
check('no blocker: every registered PNG exists and fits its manifest frames', blockers.length === 0, JSON.stringify(blockers.slice(0, 5)));
check('the wired tundra strips have no anchor / frame / background problems', !rows.some((r) => /^(b40a|b40b|b40c)$/.test(r.batch) && r.sev !== 'nit'));
check('cycle 7: the wired b03 icicle bat is walked and has no anchor / frame / background problems', batches.some((b) => b.id === 'b03-icicle-bat' && b.assets === 12) && !rows.some((r) => r.batch === 'b03-icicle-bat' && r.sev !== 'nit'));
// art-audit-4 heuristics: dark rim, flat fill, smiley mascot face
const mk = (w, h, paint) => { const b = Buffer.alloc(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = paint(x, y); if (c) { const q = (y * w + x) * 4; b[q] = c[0]; b[q + 1] = c[1]; b[q + 2] = c[2]; b[q + 3] = 255; } } return b; };
const NAVY = [0x1b, 0x21, 0x40], BODY = [0x6c, 0xbf, 0x55], LITE = [0xb8, 0xf0, 0x90];
const inBody = (x, y) => (x - 15.5) * (x - 15.5) + (y - 15.5) * (y - 15.5) <= 13 * 13, inRim = (x, y) => (x - 15.5) * (x - 15.5) + (y - 15.5) * (y - 15.5) <= 14.5 * 14.5;
const face = (x, y) => (y === 11 && (x === 11 || x === 20)) || (y === 12 && (x === 11 || x === 20)) || (y === 18 && x >= 12 && x <= 19) || (y === 17 && (x === 12 || x === 19));
const smileSprite = mk(32, 32, (x, y) => inBody(x, y) ? (face(x, y) ? NAVY : (x + y < 22 ? LITE : BODY)) : inRim(x, y) ? NAVY : null);
const plainSprite = mk(32, 32, (x, y) => inBody(x, y) ? (x + y < 22 ? LITE : BODY) : inRim(x, y) ? NAVY : null);
const flatSprite = mk(32, 32, (x, y) => inRim(x, y) ? BODY : null);
const ls = A.lookCell(smileSprite, 32, 0, 0, 32, 32), lp = A.lookCell(plainSprite, 32, 0, 0, 32, 32), lf = A.lookCell(flatSprite, 32, 0, 0, 32, 32);
check('lookCell: a navy-rimmed sprite has a dark outline, a flat blob has none', ls.rimDark > 0.9 && lf.rimDark === 0, ls.rimDark + ' / ' + lf.rimDark);
check('lookCell: a flat 1-tone fill has a tiny value range; the shaded one does not', lf.range < 0.22 && lp.range >= 0.22, lf.range + ' / ' + lp.range);
check('lookCell: two eye dots + an upturned mouth read as a smiley; the same body without them does not', !!ls.smiley && !lp.smiley, ls.smiley + ' / ' + lp.smiley);
check('lookCell(step 4) on a 4x strip matches the art pixels (empty cell -> null)', A.lookCell(Buffer.alloc(16 * 16 * 4), 16, 0, 0, 16, 16, 4) === null);
const face4 = rows.filter((r) => r.kind === 'face');
check('the smiley heuristic flags the known offenders (b31a glimmerfrog, b36 clover_hopper) and not the b04 puffcap reference',
  face4.some((r) => r.id === 'glimmerfrog_idle_down') && face4.some((r) => r.id === 'clover_hopper_idle_down') && !rows.some((r) => /^puffcap_/.test(r.id) && r.kind === 'face'), face4.length);
check('the b04 puffcap reference passes the outline and contrast checks', !rows.some((r) => /^puffcap_/.test(r.id) && /outline|contrast/.test(r.kind)));
check('heuristic findings are nits, never blockers', rows.filter((r) => /outline|contrast|face/.test(r.kind)).every((r) => r.sev === 'nit'));
console.log(fail ? fail + ' FAILED' : 'ALL PASSED'); process.exit(fail ? 1 : 0);
