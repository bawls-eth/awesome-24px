// Unit tests for shared/rng.js + shared/store.js (Node, no server needed) plus one
// Playwright check that both load as browser globals from script tags in a blank page.
//   NODE_PATH=$(npm root -g) node game/tests/shared-rng-store.test.js
const fs = require('fs');
const path = require('path');
const { check, done } = require('./helpers');
const MMRng = require('../shared/rng.js');

// ---- rng ----
const seq = (s, n) => { const r = MMRng.create(s); return Array.from({ length: n }, () => r.next()); };
check('same seed -> same 1k values', JSON.stringify(seq('abc', 1000)) === JSON.stringify(seq('abc', 1000)));
check('numeric seed reproducible', JSON.stringify(seq(42, 200)) === JSON.stringify(seq(42, 200)));
check('different seeds differ', JSON.stringify(seq('abc', 50)) !== JSON.stringify(seq('abd', 50)));
check('values in [0,1)', seq('range', 5000).every((v) => v >= 0 && v < 1));
{
  const r = MMRng.create('int');
  const vals = Array.from({ length: 2000 }, () => r.int(3, 7));
  check('int(a,b) inclusive bounds', vals.every((v) => Number.isInteger(v) && v >= 3 && v <= 7) && vals.includes(3) && vals.includes(7));
  const arr = Array.from({ length: 50 }, (_, i) => i);
  const sh = MMRng.create('sh').shuffle(arr);
  check('shuffle is a permutation', sh.length === 50 && [...sh].sort((a, b) => a - b).join() === arr.join());
  check('shuffle does not mutate input + deterministic', arr[0] === 0 && arr[49] === 49 && MMRng.create('sh').shuffle(arr).join() === sh.join());
  check('pick returns member', arr.includes(MMRng.create('p').pick(arr)));
}

// ---- store (fake localStorage in Node) ----
function fakeStorage() {
  const d = {};
  return { d, getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, removeItem: (k) => { delete d[k]; } };
}
function loadStore(storage) {
  delete require.cache[require.resolve('../shared/store.js')];
  global.localStorage = storage;
  return require('../shared/store.js');
}
{
  const ls = fakeStorage();
  ls.d['other-a'] = '{"x":1,  "y":[1,2]}';
  ls.d['other-b'] = 'not json at all';
  ls.d['mm'] = '{"keep":"me","n":1}';
  const before = JSON.stringify({ a: ls.d['other-a'], b: ls.d['other-b'] });
  const S = loadStore(ls);
  S.patch('mm', (o) => { o.n = 2; o.added = true; return o; });
  check('patch keeps unknown keys', JSON.stringify(S.get('mm')) === '{"keep":"me","n":2,"added":true}', ls.d.mm);
  check('other localStorage keys byte-identical after patch', JSON.stringify({ a: ls.d['other-a'], b: ls.d['other-b'] }) === before);
  ls.d['bad'] = '{corrupt';
  check('corrupt JSON -> default (get)', S.get('bad', 'dflt') === 'dflt');
  let threw = false, res;
  try { res = S.patch('bad', (o) => { o.ok = 1; return o; }); } catch (e) { threw = true; }
  check('corrupt JSON safe in patch', !threw && res.ok === 1 && S.get('bad').ok === 1);
  check('missing key -> default', S.get('nope', 7) === 7);
}
{
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const S = loadStore(blocked);
  let threw = false;
  try { S.set('k', { a: 1 }); S.patch('k', (o) => { o.b = 2; return o; }); } catch (e) { threw = true; }
  check('blocked storage never throws, uses memory fallback', !threw && JSON.stringify(S.get('k')) === '{"a":1,"b":2}');
}
delete global.localStorage;

// ---- one Playwright check ----
(async () => {
  try {
    const { chromium } = require('playwright');
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('about:blank');
    await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, '../shared/rng.js'), 'utf8') });
    await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, '../shared/store.js'), 'utf8') });
    const r = await page.evaluate(() => {
      const a = MMRng.create('abc'), b = MMRng.create('abc');
      const same = [0, 1, 2, 3, 4].every(() => a.next() === b.next());
      // about:blank may block localStorage; MMStore must work either way
      MMStore.set('t', { v: 1 }); MMStore.patch('t', (o) => { o.w = 2; return o; });
      return { same, t: JSON.stringify(MMStore.get('t')) };
    });
    check('browser globals MMRng/MMStore work via script tag', r.same && r.t === '{"v":1,"w":2}' && !errors.length, JSON.stringify([r, errors]));
    await browser.close();
  } catch (e) { check('playwright browser check', false, e.message); }
  done();
})();
