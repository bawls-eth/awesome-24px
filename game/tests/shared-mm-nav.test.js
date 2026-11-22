// Node test for MMNav (shared/mm-nav.js). Run: node game/tests/shared-mm-nav.test.js
const fs = require('fs');
const path = require('path');
const N = require(path.join(__dirname, '../shared/mm-nav.js'));
const repo = path.resolve(__dirname, '..', '..');
let passed = 0, failed = 0;
function check(name, cond, extra) { if (cond) passed++; else { failed++; console.log('FAIL: ' + name + (extra ? ' ' + extra : '')); } }

// ---- registry ----
const IDS = ['town', 'map', 'realm', 'lantern', 'isles', 'jam', 'bugs', 'angler', 'deepdelve', 'stalk', 'pop', 'dash'];
check('registry lists the 12 places in order', JSON.stringify(N.PLACES.map((p) => p.id)) === JSON.stringify(IDS));
check('every place has id, name, icon, path, one-line desc', N.PLACES.every((p) => p.id && p.name && p.icon && p.path && p.desc && p.desc.length <= 60 && !/\n/.test(p.desc)));
check('names are the catalogue names', N.place('map').name === 'World map' && N.place('realm').name === 'The Realm' && N.place('lantern').name === 'Lantern Camp' && N.place('town').name === 'Town');
check('every registry file exists on disk', N.PLACES.every((p) => fs.existsSync(path.join(repo, p.path.split('?')[0]))), N.PLACES.filter((p) => !fs.existsSync(path.join(repo, p.path.split('?')[0]))).map((p) => p.path).join(','));
check('registry is frozen', Object.isFrozen(N.PLACES) && N.PLACES.every(Object.isFrozen));
check('names are unique, ids are unique', new Set(N.PLACES.map((p) => p.name)).size === 12 && new Set(N.PLACES.map((p) => p.id)).size === 12);
check('place() ignores prototype keys', N.place('__proto__') === null && N.place('constructor') === null && N.place('toString') === null);

// ---- detect ----
const D = (p) => N.detect(p);
check('detect: /game/ and /game/index.html are the Town', D('/game/').id === 'town' && D('/game/index.html').id === 'town' && D('/game/index.html').file === 'game/index.html');
check('detect: hub directory and file', D('/game/hub/').id === 'map' && D('/game/hub/index.html').id === 'map');
check('detect: games under a hosting prefix', D('/awesome-24px/game/games/jam/index.html').id === 'jam' && D('/x/y/game/games/festival/bugs.html').id === 'bugs');
check('detect: mad-maze index is the Realm, lantern.html is the Lantern', D('/game/games/mad-maze/index.html').id === 'realm' && D('/game/games/mad-maze/lantern.html').id === 'lantern' && D('/game/games/mad-maze/').id === 'realm');
check('detect: every place file maps back to its id', N.PLACES.every((p) => D('/' + p.path.split('?')[0]).id === p.id));
check('detect: unknown page under game/ -> id null, repo-relative file', D('/game/tests/fixtures/nav-fixture.html').id === null && D('/game/tests/fixtures/nav-fixture.html').file === 'game/tests/fixtures/nav-fixture.html');
check('detect: hostile input does not throw', D(null).id === null && D('%E0%A4%A').id === null && D('').id === null);

// ---- relative URLs from each page depth ----
const expect = {
  'game/index.html': { town: 'index.html', map: 'hub/index.html', realm: 'games/mad-maze/index.html?mode=world', jam: 'games/jam/index.html', bugs: 'games/festival/bugs.html' },
  'game/hub/index.html': { town: '../index.html', map: 'index.html', isles: '../games/isles/index.html', lantern: '../games/mad-maze/lantern.html' },
  'game/games/jam/index.html': { town: '../../index.html', map: '../../hub/index.html', stalk: '../stalk/index.html', jam: 'index.html', realm: '../mad-maze/index.html?mode=world' },
  'game/games/mad-maze/lantern.html': { realm: 'index.html?mode=world', lantern: 'lantern.html', town: '../../index.html' },
  'game/tests/fixtures/nav-fixture.html': { town: '../../index.html', deepdelve: '../../games/deepdelve/index.html' },
  'index.html': { town: 'game/index.html', angler: 'game/games/angler/index.html' },
};
Object.keys(expect).forEach((from) => Object.keys(expect[from]).forEach((to) => {
  const got = N.urlFor(to, from);
  check(`urlFor(${to}) from ${from}`, got === expect[from][to], 'got ' + got);
}));
check('urlFor accepts a place id as the origin', N.urlFor('town', 'jam') === '../../index.html' && N.urlFor('stalk', 'bugs') === '../stalk/index.html');
// every pair resolves to the right file
let pairOk = true;
N.PLACES.forEach((a) => N.PLACES.forEach((b) => {
  const href = N.urlFor(b.id, a.id);
  const abs = path.normalize(path.join(path.dirname(path.join(repo, a.path.split('?')[0])), href.split('?')[0]));
  if (abs !== path.join(repo, b.path.split('?')[0])) pairOk = false;
}));
check('urlFor: all 100 page pairs resolve to the target file on disk', pairOk);
check('urlFor of a stored URL keeps its clean query', N.urlFor('game/games/isles/index.html?isle=reef', 'game/index.html') === 'games/isles/index.html?isle=reef');
check('urlFor rejects unknown targets', N.urlFor('nope', 'town') === null && N.urlFor('javascript:alert(1)', 'town') === null && N.urlFor('__proto__', 'town') === null);

// ---- cleanUrl allow-list ----
check('cleanUrl keeps registry files', N.cleanUrl('game/hub/index.html') === 'game/hub/index.html');
check('cleanUrl carries allowed query keys only', N.cleanUrl('game/games/isles/index.html?isle=reef&evil=1&test=1') === 'game/games/isles/index.html?isle=reef&test=1');
check('cleanUrl: Realm keeps mode=world and adds safe keys', N.cleanUrl('game/games/mad-maze/index.html?mode=dungeon&seed=abc') === 'game/games/mad-maze/index.html?mode=world&seed=abc');
check('cleanUrl rejects unsafe values', N.cleanUrl('game/games/isles/index.html?isle=<b>') === 'game/games/isles/index.html' && N.cleanUrl('game/games/isles/index.html?isle=' + 'a'.repeat(30)) === 'game/games/isles/index.html');
['javascript:alert(1)', 'https://evil.example/game/index.html', '//evil.example/game/index.html', '../game/index.html', '/game/index.html', 'game/net.js', 'game/firebase-config.js', 'game/games/arcane-frontier/index.html', '', null, 42, {}, 'game/index.html' + 'x'.repeat(300)].forEach((u) => {
  check('cleanUrl rejects ' + String(u).slice(0, 40), N.cleanUrl(u) === null);
});
check('safeHref rejects schemes and protocol-relative', N.safeHref('javascript:x') === null && N.safeHref('//x.y/') === null && N.safeHref('data:text/html,x') === null && N.safeHref('../hub/index.html') === '../hub/index.html');

// ---- clean(): hostile and corrupt input ----
const dflt = JSON.stringify({ v: 1, last: null, prev: null });
[undefined, null, 0, 'x', '{', '[]', [], 'null', '{"last":5}', JSON.stringify({ last: { id: 'nope' } }), 'a'.repeat(N.LIMITS.MAX_RAW + 1)].forEach((v) => {
  check('clean(' + String(v).slice(0, 20) + ') -> defaults', JSON.stringify(N.clean(v)) === dflt);
});
const hostile = '{"__proto__":{"polluted":1},"last":{"id":"jam","__proto__":{"x":1},"sub":"a\\u0000b<script>","url":"javascript:alert(1)","t":1e99,"extra":"y"},"prev":{"id":"constructor"},"constructor":{"prototype":{"bad":1}}}';
const h = N.clean(hostile);
check('clean: __proto__ in JSON does not pollute Object.prototype', ({}).polluted === undefined && ({}).bad === undefined && ({}).x === undefined);
check('clean: output has only v/last/prev and plain prototypes', JSON.stringify(Object.keys(h)) === '["v","last","prev"]' && Object.getPrototypeOf(h) === Object.prototype && Object.getPrototypeOf(h.last) === Object.prototype);
check('clean: entry keys are exactly id/sub/url/t', JSON.stringify(Object.keys(h.last)) === '["id","sub","url","t"]');
check('clean: bad url falls back to the place path, t clamped, sub stripped', h.last.url === 'game/games/jam/index.html' && h.last.t === N.LIMITS.MAX_T && h.last.sub === 'abscript');
check('clean: prev with a prototype id is dropped', h.prev === null);
check('clean: url for the wrong place falls back', N.clean({ last: { id: 'jam', url: 'game/hub/index.html' } }).last.url === 'game/games/jam/index.html');
check('clean: sub is capped', N.clean({ last: { id: 'isles', sub: 'x'.repeat(500) } }).last.sub.length === N.LIMITS.MAX_SUB);
check('clean: negative / NaN t -> 0', N.clean({ last: { id: 'isles', t: -5 } }).last.t === 0 && N.clean({ last: { id: 'isles', t: 'abc' } }).last.t === 0);
check('clean: prev equal to last is dropped', N.clean({ last: { id: 'jam' }, prev: { id: 'jam' } }).prev === null);
check('clean is idempotent', JSON.stringify(N.clean(N.clean(hostile))) === JSON.stringify(h));

// ---- record / continue ----
let s = N.record(null, { id: 'isles', sub: 'Coral Reef', url: 'game/games/isles/index.html?isle=reef' }, 1000);
check('record: first visit sets last', s.last.id === 'isles' && s.last.sub === 'Coral Reef' && s.last.url === 'game/games/isles/index.html?isle=reef' && s.last.t === 1000 && s.prev === null);
check('continueTarget: shown on another page with the sub label', (() => { const c = N.continueTarget(s, 'town'); return c && c.label === 'Continue: Isles - Coral Reef' && c.url === 'game/games/isles/index.html?isle=reef'; })());
check('continueTarget: hidden on the same page', N.continueTarget(s, 'isles') === null);
check('continueTarget: none with empty state', N.continueTarget(null, 'town') === null && N.continueTarget('garbage', null) === null);
s = N.record(s, { id: 'isles', url: 'game/games/isles/index.html?isle=reef' }, 2000);
check('record: same place again keeps sub, prev untouched', s.last.sub === 'Coral Reef' && s.last.t === 2000 && s.prev === null);
s = N.record(s, { id: 'town' }, 3000);
check('record: new place moves last to prev', s.last.id === 'town' && s.prev.id === 'isles' && s.prev.sub === 'Coral Reef');
check('continueTarget on the Town page is null (last is the Town)', N.continueTarget(s, 'town') === null);
check('continueTarget elsewhere points to the Town', N.continueTarget(s, 'jam').id === 'town' && N.continueTarget(s, 'jam').label === 'Continue: Town');
s = N.record(s, { id: 'jam' }, 4000);
check('record keeps only two entries', s.last.id === 'jam' && s.prev.id === 'town' && JSON.stringify(Object.keys(s)) === '["v","last","prev"]');
check('record ignores unknown ids', JSON.stringify(N.record(s, { id: 'evil' }, 5)) === JSON.stringify(s) && JSON.stringify(N.record(s, null, 5)) === JSON.stringify(s));
check('record: hostile entry url is cleaned', N.record(null, { id: 'map', url: 'javascript:alert(1)' }, 1).last.url === 'game/hub/index.html');

// ---- caps: serialized state stays small whatever goes in ----
let big = null;
for (let i = 0; i < 500; i++) big = N.record(big, { id: IDS[i % 10], sub: 'z'.repeat(1000), url: 'game/games/isles/index.html?isle=' + 'q'.repeat(1000) }, i);
check('caps: stored JSON stays under 600 bytes after 500 hostile visits', JSON.stringify(big).length < 600, String(JSON.stringify(big).length));
check('caps: MAX_RAW bounds what clean() parses', N.LIMITS.MAX_RAW <= 4096);

// ---- backTarget ----
const o = 'http://localhost:8961';
const b1 = N.backTarget({ referrer: o + '/game/games/stalk/index.html', origin: o, file: 'game/games/jam/index.html', current: 'jam' });
check('backTarget: same-origin registry referrer', b1.id === 'stalk' && b1.label === 'Back to Stalk Market' && b1.href === '../stalk/index.html');
const b2 = N.backTarget({ referrer: o + '/game/games/isles/index.html?isle=reef&x=<y>', origin: o, file: 'game/index.html', current: 'town' });
check('backTarget: referrer query is allow-listed', b2.href === 'games/isles/index.html?isle=reef');
const b3 = N.backTarget({ referrer: 'https://evil.example/game/hub/index.html', origin: o, file: 'game/games/jam/index.html', current: 'jam' });
check('backTarget: other origin -> Town', b3.id === 'town' && b3.href === '../../index.html' && b3.label === 'Back to Town');
check('backTarget: same page referrer is ignored', N.backTarget({ referrer: o + '/game/games/jam/index.html', origin: o, file: 'game/games/jam/index.html', current: 'jam' }).id === 'town');
check('backTarget: page fallback backHref/backLabel', (() => { const b = N.backTarget({ origin: o, file: 'game/games/isles/index.html', current: 'isles', backHref: '../../hub/index.html', backLabel: 'World map' }); return b.href === '../../hub/index.html' && b.label === 'Back to World map'; })());
check('backTarget: unsafe backHref is refused', N.backTarget({ origin: o, file: 'game/games/jam/index.html', current: 'jam', backHref: 'javascript:alert(1)' }).id === 'town');
check('backTarget: on the Town the default is the World map', N.backTarget({ origin: o, file: 'game/index.html', current: 'town' }).id === 'map');

// ---- node: mount is a no-op without a DOM ----
check('mount() without a DOM returns false and touches nothing', N.mount({ page: 'jam' }) === false && N.mounted() === false && N.open() === false && N.close() === false);
check('markPlace without storage does not throw', N.markPlace('jam', 'x') === false && N.markPlace('nope') === false);

// ---- source safety ----
// Code only: full-line comments (which document what the module must never do) are stripped first.
const src = fs.readFileSync(path.join(__dirname, '../shared/mm-nav.js'), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
const css = fs.readFileSync(path.join(__dirname, '../shared/mm-nav.css'), 'utf8');
check('no network: no firebase, fetch, XHR, WebSocket, sendBeacon, net.js, import', !/firebase|fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|net\.js|realm\.js|\bimport\s*\(|require\s*\(/i.test(src));
check('DOM text only: no innerHTML / outerHTML / insertAdjacentHTML / document.write / eval', !/innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\s*\(|new Function/.test(src));
check('only storage key is pixeltown-nav-v1 (never the save)', !/pixeltown-save-v1/.test(src) && (src.match(/pixeltown-[a-z0-9-]+/g) || []).every((k) => k === 'pixeltown-nav-v1'));
check('embed and ?nav=0 guards are present', /window\.parent !== window/.test(src) && /nav=0/.test(src));
check('dialog is labelled and modal', /role: 'dialog'/.test(src) && /'aria-modal': 'true'/.test(src) && /'aria-labelledby': 'mm-nav-title'/.test(src));
check('css: 48 px button, z 9000, safe areas, reduced motion, legacy class', /--mm-nav-size: 48px/.test(css) && /--mm-nav-z: 9000/.test(css) && /safe-area-inset-top/.test(css) && /prefers-reduced-motion/.test(css) && /\.mm-nav-legacy/.test(css));
check('css: no external URLs', !/url\(|@import|https?:/.test(css));

console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
