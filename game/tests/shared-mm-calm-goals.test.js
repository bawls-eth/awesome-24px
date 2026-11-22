// RT1: MMCalmGoals.suggest (pure). Node: node game/tests/shared-mm-calm-goals.test.js
const fs = require('fs'), path = require('path');
const C = require('../shared/mm-calm-goals.js');
const H = require('../hub/medals.js');
const N = require('../shared/mm-nav.js');
let pass = 0, fail = 0;
function check(name, cond, info) { if (cond) pass++; else { fail++; console.log('FAIL: ' + name + (info ? ' ' + info : '')); } }
const keys = (a) => a.map((s) => s.key);
const GUILT = /streak|missed|miss out|expire|hurry|last chance|don'?t lose|countdown|timer|before it'?s gone|running out|only today|ends (soon|today)|come back|left today|\d+\s*(s|sec|second|minute|min|hour|day)s?\b/i;

// 1. zero medals: the three first steps
const z = C.suggest({}, {}, 'seed-a');
check('0 medals -> 3 first-step goals: first tame, first catch, first star', JSON.stringify(keys(z)) === JSON.stringify(['isles:tame1', 'angler:catch1', 'jam:star1']), JSON.stringify(keys(z)));
check('0 medals: the same for every seed', [1, 'x', null, 99999].every((s) => JSON.stringify(keys(C.suggest({}, {}, s))) === JSON.stringify(keys(z))));
const empty = H.read({ getItem() { return null; } });
check('0 medals read through MMHubMedals.read gives the same three', JSON.stringify(keys(C.suggest(empty, {}, 'q'))) === JSON.stringify(keys(z)));

// 2. deterministic and stable, exactly 3, only unearned, three different games when possible
const some = { angler: ['catch1'], jam: ['star1', 'stars12'], isles: ['tame1', 'log6', 'visit_home'], deepdelve: ['bronze'] };
const a1 = C.suggest(some, {}, 'hub-calm-v1'), a2 = C.suggest(JSON.parse(JSON.stringify(some)), { dismissed: [] }, 'hub-calm-v1');
check('deterministic for the same medals and seed', JSON.stringify(a1) === JSON.stringify(a2));
check('exactly 3 suggestions', a1.length === 3, a1.length);
check('suggestions are frozen', Object.isFrozen(a1) && a1.every(Object.isFrozen));
const unearned = (list, m) => list.every((s) => !(m[s.game] || []).includes(s.medal));
check('only unearned medals are suggested', unearned(a1, some), JSON.stringify(keys(a1)));
check('three different games', new Set(a1.map((s) => s.game)).size === 3, JSON.stringify(keys(a1)));
let varied = new Set();
for (let i = 0; i < 40; i++) varied.add(JSON.stringify(keys(C.suggest(some, {}, 'seed' + i))));
check('the seed changes which games come up (not always the same three)', varied.size > 1, varied.size);
let allOk = true, allThree = true;
for (let i = 0; i < 300; i++) {
  const m = {};
  Object.keys(H.GAMES).forEach((g) => { m[g] = H.GAMES[g].medals.map((x) => x[0]).filter((_, j) => ((i * 7 + j * 13 + g.length) % 3) === 0); });
  const s = C.suggest(m, {}, i);
  if (!unearned(s, m)) allOk = false;
  if (s.length !== 3) allThree = false;
}
check('300 random medal sets: always 3, never an earned medal', allOk && allThree);

// 3. dismissed ideas never come back; the next one fills in
const d1 = C.suggest(some, { dismissed: [a1[0].key] }, 'hub-calm-v1');
check('a dismissed idea is never suggested again', !keys(d1).includes(a1[0].key) && d1.length === 3, JSON.stringify(keys(d1)));
const dz = C.suggest({}, { dismissed: ['isles:tame1'] }, 's');
check('0 medals with first tame put away: still 3, no first tame', dz.length === 3 && !keys(dz).includes('isles:tame1') && keys(dz).includes('angler:catch1'), JSON.stringify(keys(dz)));
const allKeys = C.keys();
const almost = C.suggest({}, { dismissed: allKeys.slice(0, allKeys.length - 2) }, 's');
check('fewer than 3 open ideas left: returns just those', almost.length === 2, almost.length);
const allEarned = {}; Object.keys(H.GAMES).forEach((g) => { allEarned[g] = H.GAMES[g].medals.map((x) => x[0]); });
check('every medal earned: nothing to suggest, no error', C.suggest(allEarned, {}, 's').length === 0);
check('cleanDismissed keeps known keys only, de-duplicated, capped', JSON.stringify(C.cleanDismissed(['jam:star1', 'jam:star1', 'nope:x', 5, '__proto__'])) === '["jam:star1"]' && C.cleanDismissed(allKeys.concat(allKeys)).length === Math.min(allKeys.length, C.MAX_DISMISSED));

// 4. every hub medal has a friendly line; links are MMNav registry pages (the URL allow-list) for the right game
const hubKeys = []; Object.keys(H.GAMES).forEach((g) => H.GAMES[g].medals.forEach((m) => hubKeys.push(g + ':' + m[0])));
check('covers exactly the medals the Hub shows', JSON.stringify(hubKeys.slice().sort()) === JSON.stringify(allKeys.slice().sort()), hubKeys.filter((k) => !allKeys.includes(k)).concat(allKeys.filter((k) => !hubKeys.includes(k))).join(','));
const NODE_PLACE = { 'w4-angler': 'angler', 'w5-jam': 'jam', 'w5-stalk': 'stalk', 'w3-deepdelve': 'deepdelve', 'w7-isles': 'isles', 'w5-safari': 'bugs' };
let linksOk = true;
Object.keys(C.GAMES).forEach((g) => {
  const p = N.place(C.GAMES[g].place);
  if (!p || N.cleanUrl(C.GAMES[g].url) !== p.path || NODE_PLACE[H.GAMES[g].node] !== p.id) linksOk = false;
  if (!N.urlFor(C.GAMES[g].url, 'game/hub/index.html')) linksOk = false;
});
check('every game links to its own MMNav registry page (passes cleanUrl)', linksOk);
check('hub href for Angler is ../games/angler/index.html', N.urlFor(C.GAMES.angler.url, 'game/hub/index.html') === '../games/angler/index.html');
const ROOT = path.join(__dirname, '..', '..');
check('every linked page exists on disk', Object.keys(C.GAMES).every((g) => fs.existsSync(path.join(ROOT, C.GAMES[g].url))));

// 5. no guilt: no timers, streaks, "missed", hurry words, in any string the module can show
const texts = C.allText();
const guilty = texts.filter((t) => GUILT.test(t));
check('no string mentions timers / streak / missed / hurry / last chance', guilty.length === 0, JSON.stringify(guilty));
check('every line is plain, short and friendly (<= 80 chars, ends with a full stop)', C.allText().filter((t, i) => i % 1 === 0).every((t) => t.length <= 80) && C.keys().every((k) => { const s = C.suggest({}, { dismissed: allKeys.filter((x) => x !== k) }, 1)[0]; return s && /\.$/.test(s.text) && s.title.length <= 30; }));
const src = fs.readFileSync(path.join(__dirname, '..', 'shared', 'mm-calm-goals.js'), 'utf8');
check('pure: no Math.random, Date, storage, DOM or network in the module', !/Math\.random|Date\.now|new Date|localStorage|document\.|fetch\(|XMLHttpRequest|firebase|\bnet\.[a-z]/i.test(src.replace(/^\s*\/\/.*$/gm, '')));

// 6. hostile input
const hostile = [null, undefined, 5, 'x', [], [1, 2], { angler: 'catch1' }, { angler: [null, 5, {}, 'catch1', 'catch1'] }, JSON.parse('{"__proto__":{"x":1},"jam":["star1"]}'), { constructor: ['x'], isles: new Array(10000).fill('tame1') }];
let hostOk = true;
hostile.forEach((m) => [null, 7, 'str', [], { dismissed: 'jam:star1' }, { dismissed: [null, {}, 'zzz'] }].forEach((nav) => [undefined, null, {}, NaN, Infinity, 'x'.repeat(5000), Symbol('s')].forEach((seed) => {
  let s; try { s = C.suggest(m, nav, seed); } catch (e) { hostOk = false; return; }
  if (!Array.isArray(s) || s.length > 3 || !s.every((x) => typeof x.key === 'string' && typeof x.text === 'string' && /^game\//.test(x.url))) hostOk = false;
})));
check('hostile medals / nav / seed never throw and give at most 3 clean ideas', hostOk);
check('a string medal list is ignored (counts as no medals: the first steps)', JSON.stringify(keys(C.suggest({ angler: 'catch1' }, {}, 's'))) === JSON.stringify(keys(z)));
check('dedup and junk ids inside a list are ignored', !keys(C.suggest({ angler: [null, 'catch1', 'catch1', 5] , jam: ['star1'] }, {}, 's')).includes('angler:catch1'));
check('no prototype pollution', ({}).x === undefined);
const frozenIn = Object.freeze({ angler: Object.freeze(['catch1']) });
check('input is never mutated', (() => { C.suggest(frozenIn, Object.freeze({ dismissed: Object.freeze(['jam:star1']) }), 's'); return frozenIn.angler.length === 1; })());

console.log(`shared-mm-calm-goals: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
