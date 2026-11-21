// Run: node game/tests/shared-mm-portals.test.js
const fs = require('fs'), path = require('path');
const P = require('../shared/mm-portals.js');
let n = 0, bad = 0;
function check(name, ok) { n++; if (!ok) { bad++; console.log('FAIL ' + name); } }
const man = (b) => JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/arcane', b, 'manifest.json'), 'utf8')).assets.map((a) => a.id);
const portalArt = new Set(man('b14-portals-and-world-objects')), itemArt = new Set(man('b22-items-relics-keys'));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

check('art ids exist in b14', Object.values(P.ART).every((a) => portalArt.has(a)));
check('boss key id exists in b22', itemArt.has(P.BOSS_KEY) && P.BOSS_KEY === 'key_boss');
check('window is 120 s', P.BOSS_PORTAL_MS === 120000);
const s0 = P.fresh();
const r = P.openBoss(s0, 'key_boss', { x: 100, y: 200 }, 5000, 'realm');
check('boss key opens portal and consumes key', r.ok && r.consume && r.portal.art === 'portal_boss' && r.portal.x === 100 && r.portal.y === 200);
check('open for 120 s then closed', P.bossPortal(r.state, 5000 + 119999) !== null && P.bossPortal(r.state, 5000 + 120000) === null);
check('leftMs counts down', P.bossPortal(r.state, 65000).leftMs === 60000);
check('not open before openedAt', P.bossPortal(r.state, 4999) === null);
check('unknown key id is a no-op', ['key_bronze', 'key_gold', 'dungeon_key', 'nope', '', null, undefined, 5, {}, '__proto__'].every((k) => { const x = P.openBoss(s0, k, { x: 1, y: 1 }, 10, 'realm'); return !x.ok && !x.consume && eq(x.state, s0) && x.portal === null; }));
check('no boss portal in the Nexus or dungeon', !P.openBoss(s0, 'key_boss', { x: 1, y: 1 }, 10, 'nexus').ok && !P.openBoss(s0, 'key_boss', { x: 1, y: 1 }, 10, 'dungeon').ok);
check('hostile position/time no-op', [[null, 10], [{}, 10], [{ x: NaN, y: 1 }, 10], [{ x: 1, y: Infinity }, 10], [{ x: 1, y: 1 }, NaN], [{ x: 1, y: 1 }, -5], [{ x: 1, y: 1 }, '10']].every(([p, t]) => !P.openBoss(s0, 'key_boss', p, t, 'realm').ok));
check('unknown place treated as realm only for valid place names', P.openBoss(s0, 'key_boss', { x: 1, y: 1 }, 10, 'zzz').ok && !P.openBoss(s0, 'key_boss', { x: 1, y: 1 }, 10, 'nexus').ok);
const frozen = Object.freeze({ boss: Object.freeze({ x: 1, y: 2, openedAt: 0, expiresAt: 1000 }) });
const r2 = P.openBoss(frozen, 'key_boss', { x: 5, y: 5 }, 50, 'realm');
check('input never mutated; reopening replaces window', frozen.boss.x === 1 && r2.state.boss.x === 5 && r2.state.boss.expiresAt === 50 + 120000);
check('tick drops expired portal', P.tick(r.state, 5000 + 120001).boss === null && P.tick(r.state, 6000).boss !== null);
check('clean(garbage) -> fresh', [null, 'x', 5, [], {}, { boss: 5 }, { boss: { x: 1 } }, { boss: { x: 'a', y: 1, openedAt: 0, expiresAt: 9 } }].every((g) => eq(P.clean(g), s0)));
check('clean clamps oversize window to 120 s', P.clean({ boss: { x: 1, y: 1, openedAt: 1000, expiresAt: 1e12 } }).boss.expiresAt === 1000 + 120000);
check('clean rejects inverted window', eq(P.clean({ boss: { x: 1, y: 1, openedAt: 1000, expiresAt: 500 } }), s0));
check('clean clamps coords, drops unknown keys', (() => { const c = P.clean({ boss: { x: 1e12, y: -1e12, openedAt: 0, expiresAt: 10, evil: 1 }, extra: 1 }); return c.boss.x === 1e6 && c.boss.y === -1e6 && Object.keys(c).join() === 'boss' && !('evil' in c.boss); })());
check('vault portal only in the Nexus', P.vaultPortal('nexus').art === 'portal_vault' && P.vaultPortal('realm') === null && P.vaultPortal('dungeon') === null && P.vaultPortal(undefined) === null);
check('vault leads to the Lantern stash', P.vaultPortal('nexus').dest === 'lantern-stash' && P.canEnter('vault', s0, 'nexus', 0).dest === 'lantern-stash');
check('vault refused outside Nexus', !P.canEnter('vault', s0, 'realm', 0).ok && !P.canEnter('vault', s0, undefined, 0).ok);
check('boss enter needs open window in realm', P.canEnter('boss', r.state, 'realm', 6000).ok && !P.canEnter('boss', r.state, 'realm', 999999).ok && !P.canEnter('boss', s0, 'realm', 6000).ok && !P.canEnter('boss', r.state, 'nexus', 6000).ok);
check('canEnter unknown ids not ok', ['nope', null, {}, '__proto__', 'realm'].every((id) => !P.canEnter(id, r.state, 'realm', 6000).ok));
check('deterministic', eq(P.openBoss(s0, 'key_boss', { x: 1, y: 2 }, 77, 'realm'), P.openBoss(s0, 'key_boss', { x: 1, y: 2 }, 77, 'realm')));
console.log((bad ? 'FAILED ' + bad + ' of ' : 'ok ') + n + ' assertions'); process.exit(bad ? 1 : 0);
