// Run: node game/tests/shared-mm-isles.test.js  (pure module, no DOM)
const I = require('../shared/mm-isles.js');
let n = 0, bad = 0;
function check(name, ok) { n++; if (!ok) { bad++; console.log('FAIL ' + name); } }
function fake(init) {
  const m = Object.assign({}, init || {}); const writes = [];
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { writes.push(k); m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, _m: m, writes };
}
const D = I.defaults();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

check('keys', I.KEY === 'pixeltown-archipelago-v1' && I.MEDALS_KEY === 'pixeltown-medals-isles-v1');
check('graph has home, jungle, ice, reef, mars, realm and 5 routes from home', ['home', 'jungle', 'ice', 'reef', 'mars', 'realm'].every((k) => I.ISLES[k]) && I.ROUTES.length === 5 && I.ROUTES.every((r) => r[0] === 'home'));
check('defaults: at home, jungle unlocked, nothing else', D.at === 'home' && same(D.unlock, ['jungle']) && D.home.grid.length === 0 && D.home.stable.slots === 12 && D.returnTo === null && same(D.wild, {}));
check('clean of defaults is a fixed point', same(I.clean(D), D) && same(I.clean(I.clean(D)), D));
check('corrupt values recover to defaults', [null, undefined, 7, 'x', [], true, NaN, () => 1].every((v) => same(I.clean(v), D)));
check('junk field types recover', same(I.clean({ at: 5, unlock: 'x', isles: [], home: 'q', log: 3, wild: [], returnTo: 'a', rides: {} }), D));

// unlocks
check('unlock list: only known islands, no home/realm, jungle always present, unique', same(I.clean({ unlock: ['ice', 'ice', 'nope', 'home', 'realm', '__proto__', 5] }).unlock, ['jungle', 'ice']));
check('at must be a known non-external island', I.clean({ at: 'ice' }).at === 'ice' && I.clean({ at: 'realm' }).at === 'home' && I.clean({ at: 'moon' }).at === 'home');
check('home and jungle are always open; others need unlock', I.isUnlocked(D, 'home') && I.isUnlocked(D, 'jungle') && !I.isUnlocked(D, 'ice') && !I.isUnlocked(D, 'nope') && !I.isUnlocked(null, 'ice'));
check('ice needs 3 tames', !I.meetsUnlock('ice', { tamed: 2 }) && I.meetsUnlock('ice', { tamed: 3 }) && !I.meetsUnlock('ice', null));
check('reef needs a swim mount, mars the rocket core', I.meetsUnlock('reef', { mounts: ['swim'] }) && I.meetsUnlock('reef', { mounts: { swim: true } }) && !I.meetsUnlock('reef', { mounts: ['x'] }) && I.meetsUnlock('mars', { items: ['rocket_core'] }) && !I.meetsUnlock('mars', { items: [] }) && !I.meetsUnlock('nope', {}));
check('unlockIsle mutates only when the requirement is met', (() => { const s = I.defaults(); return !I.unlockIsle(s, 'ice', { tamed: 1 }) && I.unlockIsle(s, 'ice', { tamed: 3 }) && I.isUnlocked(s, 'ice') && I.unlockIsle(s, 'ice', {}) && !I.unlockIsle(s, 'home', {}) && !I.unlockIsle(null, 'ice', {}) && s.unlock.length === 2; })());
check('routes: boat/rocket/portal, symmetric, none between non-home islands', I.routeBetween('home', 'jungle') === 'boat' && I.routeBetween('jungle', 'home') === 'boat' && I.routeBetween('home', 'mars') === 'rocket' && I.routeBetween('home', 'realm') === 'portal' && I.routeBetween('jungle', 'ice') === null);
check('destinations from home list only unlocked islands', (() => { const s = I.defaults(); const a = I.destinations(s, 'home').map((d) => d.id).sort(); I.unlockIsle(s, 'ice', { tamed: 9 }); const b = I.destinations(s, 'home').map((d) => d.id).sort(); return same(a, ['jungle', 'realm']) && same(b, ['ice', 'jungle', 'realm']) && same(I.destinations(s, 'jungle').map((d) => d.id), ['home']); })());

// positions
check('last position per island is kept and rounded', (() => { const c = I.clean({ isles: { jungle: { pos: { x: 12.345, y: 99 } }, ice: { pos: { x: 5, y: 6 } } } }); return c.isles.jungle.pos.x === 12.3 && c.isles.jungle.pos.y === 99 && c.isles.ice.pos.x === 5; })());
check('bad positions become null; unknown islands dropped', (() => { const c = I.clean({ isles: { jungle: { pos: { x: 'a', y: NaN } }, ice: { pos: [1, 2] }, moon: { pos: { x: 1, y: 1 } }, realm: { pos: { x: 1, y: 1 } } } }); return c.isles.jungle.pos === null && c.isles.ice.pos === null && !('moon' in c.isles) && !('realm' in c.isles); })());
check('positions clamp into 0..1e5', (() => { const c = I.clean({ isles: { jungle: { pos: { x: -50, y: 1e12 } } } }); return c.isles.jungle.pos.x === 0 && c.isles.jungle.pos.y === 1e5; })());
check('setPos / lastPos round trip and refuse junk', (() => { const s = I.defaults(); return I.setPos(s, 'jungle', 100, 200) && I.lastPos(s, 'jungle').x === 100 && I.lastPos(s, 'ice') === null && !I.setPos(s, 'moon', 1, 1) && !I.setPos(s, 'jungle', 'x', 1) && !I.setPos(null, 'jungle', 1, 1); })());
check('returnTo needs a known island and numbers', same(I.clean({ returnTo: { isle: 'jungle', x: 3, y: 4 } }).returnTo, { isle: 'jungle', x: 3, y: 4 }) && I.clean({ returnTo: { isle: 'moon', x: 3, y: 4 } }).returnTo === null && I.clean({ returnTo: { isle: 'jungle', x: 'a', y: 4 } }).returnTo === null);
check('seed, fog and chests are validated', (() => { const c = I.clean({ isles: { jungle: { seed: '123', fog: 'AAEC+/==', chests: ['c1', '<b>', 5, 'ok_2'] }, ice: { seed: '12; drop', fog: '<script>', chests: 'x' }, reef: { seed: 77, fog: 'A'.repeat(900) } } }); return c.isles.jungle.seed === '123' && c.isles.jungle.fog === 'AAEC+/==' && same(c.isles.jungle.chests, ['c1', 'ok_2']) && c.isles.ice.seed === '' && c.isles.ice.fog === '' && c.isles.ice.chests.length === 0 && c.isles.reef.seed === '77' && c.isles.reef.fog === ''; })());

// home grid
const grid = []; for (let i = 0; i < 900; i++) grid.push([i % 20, Math.floor(i / 20) % 20, 'fence']);
check('home grid caps at 400 cells', I.clean({ home: { grid } }).home.grid.length === 400 && I.MAX_GRID === 400);
check('grid cells validated: in range, integers, known-shape kind, unique', (() => { const g = I.clean({ home: { grid: [[1, 2, 'fence'], [1, 2, 'lamp'], [20, 0, 'fence'], [-1, 0, 'fence'], [1.5, 0, 'fence'], [0, 0, '<b>'], [0, 0, '__proto__'], 'x', null, [3], [4, 4, 'path']] } }).home.grid; return same(g, [[1, 2, 'fence'], [4, 4, 'path']]); })());
check('stable slots clamp 12..24', I.clean({ home: { stable: { slots: 99 } } }).home.stable.slots === 24 && I.clean({ home: { stable: { slots: 1 } } }).home.stable.slots === 12 && I.clean({ home: { stable: { slots: 'x' } } }).home.stable.slots === 12);

// log
check('creature log keeps counts, drops bad keys and values', (() => { const c = I.clean({ log: { seen: { raptor: 3, 'Bad Key': 9, constructor_x: 0, parrotlet: -4, boarhog: 1e12, x: 'y' }, ko: { raptor: 1 }, tamed: { raptor: 1 }, bugs: [1], fish: 5 } }); return c.log.seen.raptor === 3 && !('Bad Key' in c.log.seen) && !('parrotlet' in c.log.seen) && c.log.seen.boarhog === 99999 && !('x' in c.log.seen) && c.log.ko.raptor === 1 && same(c.log.bugs, {}) && same(c.log.fish, {}); })());
check('log caps at 60 species per kind', (() => { const o = {}; for (let i = 0; i < 300; i++) o['sp' + i] = 1; return Object.keys(I.clean({ log: { seen: o } }).log.seen).length === 60; })());
check('noteLog / logCount', (() => { const s = I.defaults(); I.noteLog(s, 'seen', 'raptor'); I.noteLog(s, 'seen', 'raptor', 2); I.noteLog(s, 'seen', 'boarhog'); return s.log.seen.raptor === 3 && I.logCount(s, 'seen') === 2 && I.noteLog(s, 'nope', 'raptor') === 0 && I.noteLog(s, 'seen', '__proto__') === 0 && I.noteLog(s, 'seen', 'Bad Id') === 0 && I.noteLog(null, 'seen', 'a') === 0 && I.logCount(null, 'seen') === 0; })());
check('noteLog refuses a 61st species', (() => { const s = I.defaults(); for (let i = 0; i < 70; i++) I.noteLog(s, 'seen', 'sp' + i); return I.logCount(s, 'seen') === 60; })());

// wild
const w = (k, extra) => Object.assign({ torpor: 40, prog: 2, eff: 0.5, until: 2000000 }, extra || {});
check('wild keeps at most 4 in-progress tames', (() => { const o = {}; for (let i = 0; i < 12; i++) o['jungle:g' + i + ':3'] = w(0, { until: 1000 + i }); const c = I.clean({ wild: o }).wild; return Object.keys(c).length === 4 && I.MAX_WILD === 4 && 'jungle:g11:3' in c && !('jungle:g0:3' in c); })());
check('wild keys and values are validated', (() => { const c = I.clean({ wild: { 'jungle:g12:3': w(0, { torpor: 1e9, prog: 99, eff: 7 }), 'bad key': w(), 'a:b:c': w(), 'ice:g1:2': 'x' } }).wild; const e = c['jungle:g12:3']; return Object.keys(c).length === 1 && e.torpor === 1000 && e.prog === 50 && e.eff === 1; })());
check('wild entries expire after 10 minutes when now is known', (() => { const now = 1e9; const c = I.clean({ wild: { 'jungle:g1:1': w(0, { until: now - 1 }), 'jungle:g2:1': w(0, { until: now + 5000 }), 'jungle:g3:1': w(0, { until: now + 9e9 }) } }, now).wild; return !('jungle:g1:1' in c) && c['jungle:g2:1'].until === now + 5000 && c['jungle:g3:1'].until === now + I.WILD_KEEP_MS; })());

// size and pollution
check('worst-case save stays under 20 KB', (() => {
  const big = { at: 'jungle', unlock: ['jungle', 'ice', 'reef', 'mars'], isles: {}, home: { grid, stable: { slots: 24 } }, log: {}, wild: {} };
  ['home', 'jungle', 'ice', 'reef', 'mars'].forEach((id) => { big.isles[id] = { seed: '999999999999', pos: { x: 99999.9, y: 99999.9 }, fog: 'A'.repeat(512), chests: Array.from({ length: 64 }, (_, i) => 'chest_' + i + '_xxxx') }; });
  I.LOG_KINDS.forEach((k) => { big.log[k] = {}; for (let i = 0; i < 60; i++) big.log[k]['species_name_' + i + '_xx'] = 99999; });
  for (let i = 0; i < 8; i++) big.wild['jungle:g' + i + ':3'] = w();
  const c = I.clean(big);
  return JSON.stringify(c).length <= I.MAX_BYTES && c.at === 'jungle';
})());
check('prototype pollution does nothing', (() => { const c = I.clean(JSON.parse('{"__proto__":{"evil":1},"constructor":{"x":1},"log":{"seen":{"__proto__":{"z":1},"constructor":5}},"isles":{"__proto__":{"jungle":{}}}}')); return ({}).evil === undefined && ({}).z === undefined && !Object.prototype.hasOwnProperty.call(c, 'evil') && !('constructor' in c.log.seen && Object.prototype.hasOwnProperty.call(c.log.seen, 'constructor') && c.log.seen.constructor === 5 && false); })());
check('prototype keys are dropped from log maps', (() => { const c = I.clean(JSON.parse('{"log":{"seen":{"constructor":5,"prototype":2,"raptor":1}}}')); return !Object.prototype.hasOwnProperty.call(c.log.seen, 'constructor') && !Object.prototype.hasOwnProperty.call(c.log.seen, 'prototype') && c.log.seen.raptor === 1; })());

// medals
check('cleanMedals whitelists, dedupes, orders, survives junk', same(I.cleanMedals({ m: ['ride1', 'tame1', 'tame1', 'evil', 5, '__proto__'] }), { v: 1, m: ['tame1', 'ride1'] }) && [null, 5, 'x{', [], { m: 'x' }, undefined].every((v) => same(I.cleanMedals(v), { v: 1, m: [] })) && same(I.cleanMedals('{"v":1,"m":["log6"]}'), { v: 1, m: ['log6'] }));
check('medalsFor: tame1, log6, ride1, stable5', (() => { const s = I.defaults(); const none = I.medalsFor(s, { roster: [] }); for (let i = 0; i < 6; i++) I.noteLog(s, 'seen', 'sp' + i); s.rides = 1; const m = I.medalsFor(s, { roster: [1, 2, 3, 4, 5] }); return none.length === 0 && same(m.sort(), ['log6', 'ride1', 'stable5', 'tame1']); })());
check('medalsFor survives junk', same(I.medalsFor(null, null), []) && same(I.medalsFor('x', 5), []));
check('writeMedals is additive and only writes the medals key', (() => { const st = fake({ [I.MEDALS_KEY]: '{"v":1,"m":["tame1"]}', 'pixeltown-save-v1': '{"a":1}' }); const r = I.writeMedals(st, ['ride1', 'evil']); return same(r, ['tame1', 'ride1']) && st.writes.every((k) => k === I.MEDALS_KEY) && st._m['pixeltown-save-v1'] === '{"a":1}' && same(JSON.parse(st._m[I.MEDALS_KEY]), { v: 1, m: ['tame1', 'ride1'] }); })());
check('writeMedals never throws', I.writeMedals({ getItem() { throw new Error('x'); }, setItem() { throw new Error('y'); } }, ['tame1']) === null && I.writeMedals(null, []) === null);

// storage
check('load of corrupt storage gives defaults', [null, 'garbage{', '[]', '5'].every((v) => same(I.load(fake(v === null ? {} : { [I.KEY]: v })), D)) && same(I.load(null), D) && same(I.load({ getItem() { throw new Error('x'); } }), D));
check('write round trips and only writes its own key (town save never touched)', (() => { const st = fake({ 'pixeltown-save-v1': '{"name":"Bo"}' }); const s = I.defaults(); s.at = 'jungle'; I.setPos(s, 'jungle', 10, 20); I.noteLog(s, 'tamed', 'parrotlet'); const ok = I.write(st, s); const b = I.load(st); return ok && b.at === 'jungle' && b.isles.jungle.pos.x === 10 && b.log.tamed.parrotlet === 1 && st.writes.every((k) => k === I.KEY) && st._m['pixeltown-save-v1'] === '{"name":"Bo"}'; })());
check('write failure returns false', I.write({ setItem() { throw new Error('q'); } }, D) === false);
check('deterministic: same input gives identical output', (() => { const o = { at: 'ice', unlock: ['ice'], wild: { 'jungle:g1:1': w(), 'jungle:g2:1': w() }, log: { seen: { b: 1, a: 2 } } }; return same(I.clean(o), I.clean(JSON.parse(JSON.stringify(o)))); })());
check('module has no Math.random and never names the town save key', (() => { const src = require('fs').readFileSync(require.resolve('../shared/mm-isles.js'), 'utf8').replace(/\/\/.*$/gm, ''); return !/Math\.random/.test(src) && !/pixeltown-save-v1/.test(src); })());
// TD1: the additive once-a-day glint key keeps valid isle lists only (ints 0..63, unique, <= 16), drops junk, and is absent by default
check('TD1 glint: cleaned to { day, n: { isle: [ints] } }', (() => {
  const c = I.clean({ glint: { day: '2026-11-22', n: { ice: [0, 3, 3, -1, 64, 'x', 2.5, 5], mars: [], nope: [1], __proto__: [1] } } });
  const big = I.clean({ glint: { day: '2026-11-22', n: { ice: Array.from({ length: 40 }, (v, i) => i) } } });
  return JSON.stringify(c.glint) === '{"day":"2026-11-22","n":{"ice":[0,3,5]}}' && big.glint.n.ice.length === 16 && !('glint' in I.clean({})) && !('glint' in I.clean({ glint: { day: 'x', n: {} } }));
})());

console.log((bad ? 'FAILED ' + bad : 'ok') + ' (' + n + ' checks)');
process.exit(bad ? 1 : 0);
