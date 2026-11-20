// Node-only test for the layout-version-2 room pool + selection (shared/mm-rooms.js). Run: node game/tests/shared-mm-rooms-variety.test.js
const crypto = require('crypto');
const MMRooms = require('../shared/mm-rooms.js');
const MMWarren = require('../shared/mm-warren.js');
const MMRng = require('../shared/rng.js');

let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const done = () => { console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exitCode = failed ? 1 : 0; };

// ---- old templates are frozen (hash captured before the change) ----
const TEMPLATE_HASH = '8532251a4495b67750dccbbd306c1228262f3b6d';
check('layout-1 TEMPLATES unchanged (sha1 of the original 15 templates)', crypto.createHash('sha1').update(JSON.stringify(MMRooms.TEMPLATES)).digest('hex') === TEMPLATE_HASH);
check('byKind(normal) is still the original 13', MMRooms.byKind('normal').length === 13 && MMRooms.TEMPLATES.length === 15);

// ---- golden layout-1 selections (room template ids per seed, captured from the unchanged code) ----
const GOLDEN = {
  "40": "open,ring,hallway,center-block,cross-pillars,treasure,open,center-block,treasure",
  "77": "open,cross-pillars,open,open,center-block,treasure,pillars4,open,treasure",
  "114": "open,cross-pillars,vbars,cross-pillars,treasure,corner-nooks,open,treasure",
  "151": "open,ring,twin-walls,scatter,open,vbars,treasure,open,treasure",
  "188": "open,hbars,hallway,scatter,treasure,cross-pillars,open,hbars,treasure",
  "225": "open,corner-nooks,plus-room,treasure,hallway,open,ring,hallway,treasure",
  "262": "open,pillars4,scatter,hallway,treasure,open,scatter,treasure",
  "299": "open,twin-walls,ring,cross-pillars,open,treasure,cross-pillars,open,treasure",
  "336": "open,plus-room,open,pillars4,diagonal,pillars4,open,treasure,treasure",
  "373": "open,plus-room,vbars,pillars4,pillars4,center-block,treasure,open,treasure",
  "410": "open,corner-nooks,ring,hbars,center-block,open,treasure,vbars,treasure",
  "447": "open,corner-nooks,vbars,pillars4,open,center-block,treasure,open,treasure",
  "484": "open,twin-walls,ring,open,open,treasure,scatter,treasure",
  "521": "open,vbars,vbars,ring,open,plus-room,cross-pillars,treasure,treasure",
  "558": "open,corner-nooks,pillars4,diagonal,pillars4,center-block,open,treasure,treasure",
  "595": "open,cross-pillars,vbars,center-block,corner-nooks,open,treasure,treasure",
  "632": "open,corner-nooks,cross-pillars,plus-room,hallway,open,vbars,treasure,treasure",
  "669": "open,plus-room,diagonal,vbars,treasure,cross-pillars,open,treasure",
  "706": "open,center-block,center-block,cross-pillars,open,pillars4,treasure,scatter,treasure",
  "743": "open,pillars4,ring,diagonal,open,treasure,center-block,ring,treasure"
};
let goldBad = [];
Object.keys(GOLDEN).forEach((seed) => {
  const g = MMWarren.generate(seed);
  const got = MMRooms.select(g, seed, 1).ids; const ids = g.rooms.map((r) => got[r.id]).join(',');
  const dflt = MMRooms.select(g, seed).ids; // no version given = layout 1
  if (ids !== GOLDEN[seed] || g.rooms.some((r) => dflt[r.id] !== got[r.id]) || g.layout !== 1) goldBad.push(seed);
});
check('layout 1 (and the default) reproduces the golden room ids for 20 seeds', goldBad.length === 0, goldBad.join(','));

// ---- every new template + every mirrored variant validates and is fully connected ----
check('at least 16 new templates', MMRooms.NEW_TEMPLATES.length >= 16, String(MMRooms.NEW_TEMPLATES.length));
const newIds = MMRooms.NEW_TEMPLATES.map((t) => t.id);
check('new template ids are unique and do not collide with old ones', new Set(newIds).size === newIds.length && newIds.every((id) => !MMRooms.get(id)));
const kinds = new Set(MMRooms.NEW_TEMPLATES.map((t) => t.kind));
check('new templates cover normal/key/treasure/boss/start', ['normal', 'key', 'treasure', 'boss', 'start'].every((k) => kinds.has(k)), [...kinds].join());
const errs = [];
MMRooms.POOL_V2.forEach((t) => { const e = MMRooms.validateTemplate(t); if (e.length) errs.push(t.id + ': ' + e[0]); });
check('all pool templates (new, old, mirrored) pass the validator', errs.length === 0, errs.join('; '));
check('mirrored variants multiply the pool', MMRooms.POOL_V2.length >= 2 * (MMRooms.NEW_TEMPLATES.length), String(MMRooms.POOL_V2.length));
function reach(t) { // independent BFS from the door cells
  const p = MMRooms.parse(t); const seen = new Set(); const q = [];
  const open = (x, y) => x >= 0 && y >= 0 && x < 17 && y < 13 && p.rows[y][x] !== '#';
  const push = (x, y) => { const k = x + ',' + y; if (open(x, y) && !seen.has(k)) { seen.add(k); q.push([x, y]); } };
  Object.values(p.doors).forEach((d) => push(d.x, d.y));
  for (let i = 0; i < q.length; i++) { const [x, y] = q[i]; push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1); }
  let total = 0; for (let y = 0; y < 13; y++) for (let x = 0; x < 17; x++) if (open(x, y)) total++;
  return { all: seen.size === total, doors: Object.values(p.doors).length === 4 && Object.values(p.doors).every((d) => seen.has(d.x + ',' + d.y)), spawnsOk: p.spawns.every((s) => seen.has(s.x + ',' + s.y)) };
}
check('BFS from door cells reaches every open tile, all 4 doors and all spawns', MMRooms.POOL_V2.every((t) => { const r = reach(t); return r.all && r.doors && r.spawnsOk; }));
check('mirroring keeps doors on the standard cells', MMRooms.POOL_V2.every((t) => { const p = MMRooms.parse(t); return ['N', 'E', 'S', 'W'].every((k) => p.doors[k] && p.doors[k].x === MMRooms.DOORS[k].x && p.doors[k].y === MMRooms.DOORS[k].y); }));
check('parse rejects a broken new-style template', (() => { const r = MMRooms.NEW_TEMPLATES[0].rows.slice(); r[0] = '#D' + r[0].slice(2); try { MMRooms.parse(r); return false; } catch (e) { return true; } })());
check('validateTemplate flags an unreachable pocket', (() => { const r = MMRooms.get('open').rows.slice(); r[2] = '#.######.......#'.padEnd(17, '.').slice(0, 16) + '#'; r[1] = '#.#############.#'; r[3] = '#.#...........#.#'; return MMRooms.validateTemplate({ id: 'x', kind: 'normal', rows: r }).length > 0; })());

// ---- layout-2 selection ----
const SEEDS = []; for (let i = 0; i < 200; i++) SEEDS.push(String(1000 + i * 7));
const nbrs = (g) => { const m = {}; g.rooms.forEach((r) => { m[r.id] = []; }); g.doors.forEach((d) => { m[d.a].push(d.b); m[d.b].push(d.a); }); return m; };
const baseOf = (id) => id.split('~')[0];
const rolesOk = (g, ids) => g.rooms.every((r) => { const t = MMRooms.POOL_V2.find((x) => x.id === ids[r.id]); const want = r.type === 'treasure' || r.type === 'secret' ? ['treasure'] : r.type === 'boss' ? ['boss'] : r.type === 'start' ? ['start'] : r.type === 'key' ? ['key', 'normal'] : ['normal']; return t && want.indexOf(t.kind) >= 0; });
let nondet = 0, repeats = 0, over = 0, badRole = 0, noVer = 0, parseBad = 0; const distinct = new Set(); const perSeedDistinct = [];
['warren', 'bramble', 'meadow'].forEach((biome) => {
  SEEDS.forEach((seed) => {
    const g = MMWarren.generate(seed, { layout: 2 }); const a = MMRooms.select(g, seed, 2, biome); const b = MMRooms.select(MMWarren.generate(seed, { layout: 2 }), seed, 2, biome);
    if (JSON.stringify(a.ids) !== JSON.stringify(b.ids)) nondet++;
    if (g.layout !== 2 || a.layout !== 2) noVer++;
    const nb = nbrs(g);
    g.doors.forEach((d) => { if (baseOf(a.ids[d.a]) === baseOf(a.ids[d.b])) repeats++; });
    const cnt = {}; g.rooms.forEach((r) => { const k = baseOf(a.ids[r.id]); cnt[k] = (cnt[k] || 0) + 1; });
    if (Object.values(cnt).some((n) => n > 2)) over++;
    if (!rolesOk(g, a.ids)) badRole++;
    try { g.rooms.forEach((r) => MMRooms.parse(a.defs[r.id])); } catch (e) { parseBad++; }
    if (biome === 'warren') { g.rooms.forEach((r) => distinct.add(a.ids[r.id])); perSeedDistinct.push(new Set(g.rooms.map((r) => a.ids[r.id])).size); }
  });
});
check('layout 2 is deterministic (600 runs: 200 seeds x 3 biomes)', nondet === 0, String(nondet));
check('generator output carries layout 2 (and layout 1 by default)', noVer === 0 && MMWarren.generate('5').layout === 1);
check('no two connected rooms share a base template', repeats === 0, String(repeats));
check('at most 2 rooms per base template per floor', over === 0, String(over));
check('every room gets a template of the right role and it parses', badRole === 0 && parseBad === 0, badRole + '/' + parseBad);
check('200 seeds cover at least 60 distinct templates', distinct.size >= 60, String(distinct.size));
check('a floor averages at least 6 distinct templates', perSeedDistinct.reduce((a, b) => a + b, 0) / perSeedDistinct.length >= 6, String(perSeedDistinct.reduce((a, b) => a + b, 0) / perSeedDistinct.length));
check('seeds mostly differ from each other', new Set(SEEDS.map((s) => { const g = MMWarren.generate(s, { layout: 2 }); const r = MMRooms.select(g, s, 2); return g.rooms.map((x) => r.ids[x.id]).join(','); })).size >= 195);
// ramp: deep rooms are harder (higher mean tag difficulty) than shallow ones
const diff = (id) => { const t = MMRooms.POOL_V2.find((x) => x.id === id); return Math.max.apply(null, t.tags.map((g) => MMRooms.DIFF[g] || 2)); };
let shallow = [], deep = [];
SEEDS.forEach((seed) => {
  const g = MMWarren.generate(seed, { layout: 2 }); const sel = MMRooms.select(g, seed, 2);
  const start = g.rooms.find((r) => r.type === 'start'); const depth = { [start.id]: 0 }; const q = [start.id];
  for (let i = 0; i < q.length; i++) g.doors.forEach((d) => { if (d.cracked) return; const u = q[i]; const v = d.a === u ? d.b : d.b === u ? d.a : null; if (v !== null && depth[v] === undefined) { depth[v] = depth[u] + 1; q.push(v); } });
  const mx = Math.max.apply(null, Object.values(depth));
  g.rooms.forEach((r) => { if (r.type !== 'combat' && r.type !== 'key') return; (depth[r.id] <= 1 ? shallow : depth[r.id] >= Math.max(3, mx - 1) ? deep : []).push(diff(sel.ids[r.id])); });
});
const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
check('difficulty ramps with depth (deep mean > shallow mean + 0.5)', mean(deep) > mean(shallow) + 0.5, mean(shallow).toFixed(2) + ' vs ' + mean(deep).toFixed(2));
check('selection uses no Math.random', (() => { const orig = Math.random; let hit = false; Math.random = () => { hit = true; return 0.5; }; try { SEEDS.slice(0, 20).forEach((s) => MMRooms.select(MMWarren.generate(s, { layout: 2 }), s, 2, 'warren')); } finally { Math.random = orig; } return !hit; })());
check('the old Warren graph is unaffected by the layout version (same rooms and doors)', SEEDS.slice(0, 30).every((s) => { const a = MMWarren.generate(s), b = MMWarren.generate(s, { layout: 2 }); return JSON.stringify(a.rooms) === JSON.stringify(b.rooms) && JSON.stringify(a.doors) === JSON.stringify(b.doors) && MMWarren.validate(b).length === 0; }));

done();
