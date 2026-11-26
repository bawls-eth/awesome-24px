// cyc13-lead: MMMoveFloat's top HUD band (TOP_SEL) named '#rw-jit', an element that does not exist; the ID-53 hint is '#rw-jhint'
// (realm-world.js). So a hint in the upper left never pushed the floating-stick start line down. Node-only (no browser):
//   - topBound() with a fake document where ONLY the hint is in the upper-left band returns the hint's bottom edge (was 0);
//   - canStart() refuses a touch on the hint's row and accepts one below it;
//   - every selector in TOP_SEL is an id the Realm really creates (found in non-test game source), so a typo cannot come back.
// Run: node game/tests/cyc13-lead-move-float-topsel.test.js
const fs = require('fs');
const path = require('path');
const { check, done } = require('./helpers');
const root = path.join(__dirname, '..');
const win = { innerWidth: 390, innerHeight: 844, localStorage: { getItem: () => '1' } };
// eslint-disable-next-line no-new-func
new Function('window', fs.readFileSync(path.join(root, 'shared', 'mm-move-float.js'), 'utf8') + '\n')(win);
const MF = win.MMMoveFloat;

const el = (r) => ({ hidden: false, classList: { contains: () => false }, getBoundingClientRect: () => Object.assign({ width: r.right - r.left, height: r.bottom - r.top }, r) });
const canvas = { tagName: 'CANVAS' };
const docWith = (map) => ({ body: { classList: { contains: (c) => c === 'touch-device' } }, querySelector: (s) => map[s] || null, elementFromPoint: () => canvas });

const hint = el({ left: 20, top: 300, right: 180, bottom: 344 });
const doc = docWith({ '#rw-jhint': hint });
check('topBound: the ID-53 hint (#rw-jhint) in the upper-left band sets the start line to its bottom edge (344)', MF.topBound(win, doc) === 344, 'got ' + MF.topBound(win, doc));
check('canStart: a touch on the hint row (y 330) does not start the floating stick', MF.canStart(60, 330, win, doc, null) === false);
check('canStart: a touch below the hint (y 400) starts it', MF.canStart(60, 400, win, doc, null) === true);
check('topBound: the old wrong id (#rw-jit) is not what is looked up', MF.topBound(win, docWith({ '#rw-jit': hint })) === 0);
check('topBound: a hidden hint does not count', MF.topBound(win, docWith({ '#rw-jhint': Object.assign(el({ left: 20, top: 300, right: 180, bottom: 344 }), { hidden: true }) })) === 0);
check('topBound: the lowest of several items wins (HUD 120, hint 344)', MF.topBound(win, docWith({ '#realm-hud': el({ left: 64, top: 6, right: 300, bottom: 120 }), '#rw-jhint': hint })) === 344);

check('MMMoveFloat exposes TOP_SEL', Array.isArray(MF.TOP_SEL) && MF.TOP_SEL.length >= 8, String(MF.TOP_SEL));
const src = ['realm.js', 'games/mad-maze/realm-world.js', 'games/mad-maze/mad-maze.js', 'games/mad-maze/index.html', 'index.html', 'games/mad-maze/world-team.js']
  .map((f) => { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch (e) { return ''; } }).join('\n');
(MF.TOP_SEL || []).forEach((s) => {
  const id = s.replace(/^#/, '');
  const made = new RegExp(`id\\s*=\\s*["']${id}["']|getElementById\\(["']${id}["']\\)|["']${id}["']`).test(src);
  check(`TOP_SEL ${s} is an id the Realm really creates or uses`, made);
});
check('TOP_SEL has the hint under its real id', (MF.TOP_SEL || []).includes('#rw-jhint') && !(MF.TOP_SEL || []).includes('#rw-jit'));
done();
