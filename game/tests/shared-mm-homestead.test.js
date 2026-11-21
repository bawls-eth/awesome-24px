// Pure-node tests for shared/mm-homestead.js (BIOME-ARCH-PLAN B10): the local-only home decor + tame pen and the daily gather spots.
// Decor round-trips through the archipelago save (MMIsles.clean / write / load), corrupt -> defaults, the seeded starter layout is
// deterministic, caps hold, undo works within 10 s, gather spots are daily-free, and the module never touches the network or Town keys.
// Run: node game/tests/shared-mm-homestead.test.js
const fs = require('fs');
const path = require('path');
const HS = require('../shared/mm-homestead.js');
const ISL = require('../shared/mm-isles.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fake = (init) => { const m = Object.assign({}, init); const st = { _m: m, writes: [], getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { st.writes.push(k); m[k] = String(v); } }; return st; };

// ---- source hygiene ----
const src = fs.readFileSync(path.join(__dirname, '..', 'shared', 'mm-homestead.js'), 'utf8').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n'); // code only, comments stripped
check('no Math.random, Date, DOM, storage, Firebase, blocks ref or network', src.indexOf('Math.random') < 0 &&
  !/\bDate\b|document\.|window\.|localStorage|fetch\(|XMLHttpRequest|firebase|net\.js|ref\(\s*['"]blocks|BLOCK_TYPES/i.test(src));

// ---- defaults / clean ----
const D = HS.defaults();
check('defaults: empty grid, starter inventory, not seeded', D.grid.length === 0 && D.seeded === 0 && same(D.inv, HS.STARTER_INV));
check('corrupt input recovers to defaults', [null, undefined, 7, 'x', [], true, NaN].every((v) => same(HS.clean(v), D)));
const hostile = HS.clean({ grid: [[1, 1, 'lantern'], [1, 1, 'bench'], [-1, 2, 'bench'], [20, 0, 'bench'], [2, 2, '__proto__'], [3, 3, 'castle'], [1.5, 2, 'fence'], 'x', [4, 4, 'pen']],
  inv: { lantern: 1e9, bench: -4, fence: 'x', __proto__: 5, pen: 2 }, seeded: 'yes' });
check('clean drops junk cells, duplicates, unknown kinds and clamps counts', same(hostile.grid, [[1, 1, 'lantern'], [4, 4, 'pen']]) && hostile.inv.lantern === 99 && hostile.inv.bench === 0 && hostile.inv.fence === 0 && hostile.inv.pen === 2 && hostile.seeded === 0, JSON.stringify(hostile));
check('clean caps the grid at MAX_ITEMS', (() => { const g = []; for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) g.push([x, y, 'fence']); return HS.clean({ grid: g, seeded: 1 }).grid.length === HS.MAX_ITEMS; })());

// ---- place / pick up / undo ----
(() => {
  const home = { grid: [], stable: { slots: 12 } };
  const free = (x, y) => !(x === 0 && y === 0);
  const a = HS.place(home, 5, 5, 'lantern', free, 1000);
  const b = HS.place(home, 5, 5, 'bench', free, 1000);
  const c = HS.place(home, 0, 0, 'bench', free, 1000);
  const d = HS.place(home, 25, 1, 'bench', free, 1000);
  const e = HS.place(home, 6, 6, 'castle', free, 1000);
  check('place: puts an item and uses one from the inventory; refuses taken, blocked, outside and unknown', a.ok && HS.itemAt(home, 5, 5) === 'lantern' && home.inv.lantern === HS.STARTER_INV.lantern - 1 &&
    b.why === 'taken' && c.why === 'ground' && d.why === 'outside' && e.why === 'kind' && home.stable.slots === 12, JSON.stringify([b, c, d, e]));
  const p = HS.pickUp(home, 5, 5, 2000);
  check('pickUp returns the item to the inventory', p.ok && p.kind === 'lantern' && HS.itemAt(home, 5, 5) === null && home.inv.lantern === HS.STARTER_INV.lantern && !HS.pickUp(home, 9, 9).ok);
  check('undo of a pick-up within 10 s puts it back; a stale undo is refused', HS.undo(home, p.act, 5000) && HS.itemAt(home, 5, 5) === 'lantern' && !HS.undo(home, a.act, 1000 + HS.UNDO_MS + 1));
  const f = HS.place(home, 7, 7, 'birdbath', null, 6000);
  check('undo of a place within 10 s removes it again', f.ok && HS.undo(home, f.act, 7000) && HS.itemAt(home, 7, 7) === null && home.inv.birdbath === 1);
  const one = { grid: [], inv: { pen: 0 } , seeded: 1 };
  check('an empty inventory refuses to place', HS.place(one, 3, 3, 'pen').why === 'none');
})();

// ---- seeded starter layout ----
(() => {
  const free = (x, y) => (x + y) % 5 !== 0;
  const a = { grid: [] }, b = { grid: [] }, c = { grid: [] };
  const la = HS.seedLayout(a, 'S1', free), lb = HS.seedLayout(b, 'S1', free), lc = HS.seedLayout(c, 'S2', free);
  check('seedLayout is deterministic per seed and differs between seeds', same(la, lb) && !same(la, lc) && la.length === HS.STARTER_LAYOUT.length, JSON.stringify([la, lc]));
  check('the starter layout has a tame pen and only free cells; it runs once', HS.pens(a).length === 1 && la.every((c2) => free(c2[0], c2[1])) && a.seeded === 1 && HS.seedLayout(a, 'S1', free).length === 0);
  // pick everything up: the island stays empty (no respawning starter set)
  la.forEach((c2) => HS.pickUp(a, c2[0], c2[1]));
  check('after picking everything up nothing reappears', HS.seedLayout(a, 'S1', free).length === 0 && a.grid.length === 0 && a.inv.pen === 1);
})();

// ---- round trip through the archipelago save ----
(() => {
  const st = fake({ 'pixeltown-save-v1': '{"name":"Bo"}' });
  const s = ISL.defaults();
  HS.ensure(s.home);
  HS.seedLayout(s.home, '1', null);
  HS.place(s.home, 0, 0, 'fence', null, 0);
  const before = JSON.stringify({ g: s.home.grid, i: s.home.inv });
  ISL.write(st, s);
  const back = ISL.load(st);
  HS.ensure(back.home);
  check('decor + inventory round-trip through pixeltown-archipelago-v1', JSON.stringify({ g: back.home.grid, i: back.home.inv }) === before && back.home.seeded === 1, JSON.stringify(back.home));
  check('only the archipelago key is written (Town save untouched)', st.writes.every((k) => k === ISL.KEY) && st._m['pixeltown-save-v1'] === '{"name":"Bo"}');
  const bad = fake({ [ISL.KEY]: '{not json' });
  const d = ISL.load(bad); HS.ensure(d.home);
  check('a corrupt archipelago key gives a fresh, unseeded home with the starter inventory', d.home.grid.length === 0 && d.home.seeded === 0 && same(d.home.inv, HS.STARTER_INV));
  check('old saves without the B10 keys still clean (additive keys only)', (() => { const o = ISL.clean({ at: 'jungle', home: { grid: [[1, 1, 'lantern']] } }); return o.at === 'jungle' && same(o.visited, []) && same(o.bosses, []) && o.home.inv === undefined && same(HS.clean(o.home).inv, HS.STARTER_INV); })());
})();

// ---- pens ----
(() => {
  const home = { grid: [[3, 3, 'pen']], inv: {}, seeded: 1 };
  const t = { roster: [{ id: 'a', sp: 'tusktop' }, { id: 'b', sp: 'chompbill' }, { id: 'c', sp: 'fernraptor' }, { id: 'd', sp: 'stegolith' }, { id: 'e', sp: 'chompbill' }], party: ['b'], mount: 'a' };
  const g = HS.penGuests(home, t);
  check('benched tames rest in a pen (not the party, not the mount, 3 per pen)', same(g.map((x) => x.id), ['c', 'd', 'e']) && HS.penGuests({ grid: [] }, t).length === 0 && HS.penGuests(home, null).length === 0);
})();

// ---- gather spots ----
(() => {
  const nodes = [];
  for (let i = 0; i < 40; i++) nodes.push({ x: i, y: i * 2, kind: ['shell', 'berry', 'ore'][i % 3] });
  const a = HS.dailySpots(nodes, 'jungle|1', '2026-12-01'), b = HS.dailySpots(nodes, 'jungle|1', '2026-12-01'), c = HS.dailySpots(nodes, 'jungle|1', '2026-12-02');
  check('daily spots: seeded per day, at most 8, every resource kind present', same(a, b) && !same(a, c) && a.length === 8 && ['shell', 'berry', 'ore'].every((k) => a.some((s) => s.kind === k)));
  const g = HS.cleanGather(null);
  const r1 = HS.gather(g, 'jungle', a[0], '2026-12-01'), r2 = HS.gather(g, 'jungle', a[0], '2026-12-01'), r3 = HS.gather(g, 'jungle', a[0], '2026-12-02');
  check('one pick per spot per day; a new day frees it; the log counts', r1.ok && !r2.ok && r2.why === 'today' && r3.ok && g.log[a[0].kind] === 2 && g.day === '2026-12-02');
  check('gather refuses junk', !HS.gather(g, '__bad id', a[0], '2026-12-02').ok && !HS.gather(null, 'jungle', a[0]).ok && !HS.gather(g, 'jungle', { idx: -1, kind: 'x' }).ok);
  const cg = ISL.clean({ gather: { day: 'tomorrow', got: { jungle: [1, 1, 2, -3, 'x'], moon: [1] }, log: { shell: 3, __proto__: 4, Bad: 2 } } }).gather;
  check('the save cleans the gather record', cg.day === '' && same(cg.got, { jungle: [1, 2] }) && same(cg.log, { shell: 3 }), JSON.stringify(cg));
  check('no spots without resource nodes', HS.dailySpots(null, 'x', '2026-12-01').length === 0 && HS.dailySpots([], 'x', '2026-12-01').length === 0);
})();

// ---- medals (MMIsles side) ----
(() => {
  const s = ISL.defaults();
  const sizeOf = (sp) => ({ chompbill: 'S', tusktop: 'L', stegolith: 'XL' })[sp] || null;
  const t = { roster: [{ id: 'a', sp: 'chompbill' }, { id: 'b', sp: 'tusktop' }] };
  ISL.noteVisit(s, 'home');
  const firstBoss = ISL.noteBoss(s, 'tide_hydra'), again = ISL.noteBoss(s, 'tide_hydra'), visitAgain = ISL.noteVisit(s, 'home');
  const m = ISL.medalsFor(s, t, sizeOf);
  check('medalsFor: size classes, visits and bosses; notes are true only once', firstBoss && !again && !visitAgain &&
    ['tame1', 'tame_s', 'tame_l', 'visit_home', 'boss_tide_hydra'].every((id) => m.indexOf(id) >= 0) && m.indexOf('tame_m') < 0 && m.indexOf('tame_xl') < 0, m.join(','));
  const st = fake({});
  const w1 = ISL.writeMedals(st, m), w2 = ISL.writeMedals(st, ['visit_home', 'nope']);
  check('the medal summary is additive, whitelisted and de-duplicated', same(w1, w2) && JSON.parse(st._m[ISL.MEDALS_KEY]).m.length === new Set(m).size);
})();

console.log(failed ? failed + ' FAILED' : 'ALL PASSED');
process.exitCode = failed ? 1 : 0;
