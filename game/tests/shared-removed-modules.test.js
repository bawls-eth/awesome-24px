// Node test (L-13, cycle 2): the four modules D decided to remove stay removed and nothing ships a reference to them.
// Scans every .js / .html / .json under game/ (not node_modules, not design notes, not this file).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const GONE = ['mm-board', 'mm-events', 'mm-pets', 'mm-wilds'], GLOBALS = ['MMBoard', 'MMEvents', 'MMPets', 'MMWilds'];
let failed = 0;
function check(name, ok, extra) { console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' :: ' + (extra || ''))); if (!ok) failed++; }
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'design' || e.name.startsWith('.')) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else if (/\.(js|html|json|mjs)$/.test(e.name) && p !== __filename) files.push(p);
  }
})(ROOT);
check('scan saw the game (more than 300 files, index.html, main.js)', files.length > 300 && files.includes(path.join(ROOT, 'index.html')) && files.includes(path.join(ROOT, 'main.js')), files.length);
for (const m of GONE) check(m + '.js is not in game/shared', !fs.existsSync(path.join(ROOT, 'shared', m + '.js')));
const hits = [];
// 'mm-board' is also a CSS lane word in a11y-viewport-sweep (a regex of class prefixes), so match the file name or the global, not the bare word.
const re = new RegExp('(' + GONE.join('|') + ')\\.js|\\b(' + GLOBALS.join('|') + ')\\b');
for (const f of files) { const s = fs.readFileSync(f, 'utf8'); const m = re.exec(s); if (m) hits.push(path.relative(ROOT, f) + ': ' + m[0]); }
check('no .js / .html / .json under game/ names a removed module or its global', hits.length === 0, hits.join('; '));
for (const keep of ['mm-bounties', 'mm-labyrinth', 'mm-mini-art', 'rules-check', 'mm-island'])
  check(keep + '.js is still there (kept by decision)', fs.existsSync(path.join(ROOT, 'shared', keep + '.js')));
console.log(failed ? failed + ' FAILED' : 'ALL PASSED');
process.exit(failed ? 1 : 0);
