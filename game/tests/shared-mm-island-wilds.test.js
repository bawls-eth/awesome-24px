// Node require-based test (no browser): MMIsland.
const MMIsland = require('../shared/mm-island.js');
let fails = 0, n = 0;
function check(name, ok, detail) { n++; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' :: ' + (detail || ''))); }
function done() { console.log(n + ' checks, ' + fails + ' failed'); process.exit(fails ? 1 : 0); }

const a = MMIsland.generate(42), b = MMIsland.generate(42), c = MMIsland.generate(43);
check('island: size 192', a.size === 192 && a.biome.length === 192 * 192);
check('island: deterministic per seed', Buffer.compare(Buffer.from(a.biome), Buffer.from(b.biome)) === 0 && a.spawn.tx === b.spawn.tx && a.spawn.ty === b.spawn.ty);
check('island: different seed differs', a.spawn.tx !== c.spawn.tx || a.spawn.ty !== c.spawn.ty || Buffer.compare(Buffer.from(a.biome), Buffer.from(c.biome)) !== 0);
check('island: validate passes', MMIsland.validate(a).length === 0, MMIsland.validate(a).join());
let allShore = true;
for (let s = 1; s <= 30; s++) { const i = MMIsland.generate('s' + s); if (MMIsland.bandAtIsland(i, i.spawn.tx, i.spawn.ty) !== 0 || !MMIsland.isLand(i, i.spawn.tx, i.spawn.ty)) allShore = false; }
check('island: spawn on the shore band for 30 seeds', allShore);
let bandOk = true;
for (let k = 0; k < 2000; k++) { const x = (k * 37) % 192, y = (k * 91) % 192; const f = MMIsland.radialFrac(x, y); const e = f >= 1 ? -1 : f >= 0.85 ? 0 : f >= 0.65 ? 1 : f >= 0.45 ? 2 : f >= 0.25 ? 3 : 4; if (MMIsland.bandAtIsland(a, x, y) !== e) bandOk = false; }
check('island: band matches distance fraction', bandOk);
check('island: centre is the Maze Heart, spawn is shore', MMIsland.bandAtIsland(a, 96, 96) === 4 && MMIsland.bandAtIsland(a, a.spawn.tx, a.spawn.ty) === 0);
check('island: validate rejects a broken island', MMIsland.validate({ size: 10 }).length > 0 && MMIsland.validate(Object.assign({}, a, { spawn: { tx: 96, ty: 96 } })).length > 0);

// the mm-wilds module (spawner + quest arrow) was removed in cycle 2 (L-13, D's decision); its 12 checks went with it. MMIsland stays tested.
done();
