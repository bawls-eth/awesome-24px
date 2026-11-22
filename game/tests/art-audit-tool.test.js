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
console.log(fail ? fail + ' FAILED' : 'ALL PASSED'); process.exit(fail ? 1 : 0);
