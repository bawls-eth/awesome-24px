// Pure-node tests for shared/mm-sites.js. Run: node game/tests/shared-mm-sites.test.js
const fs = require('fs');
const path = require('path');
const O = require('../shared/mm-overworld.js');
const S = require('../shared/mm-sites.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/arcane/b21-npcs-and-vendors/manifest.json'), 'utf8'));
const manIds = new Set(manifest.assets.map(a => a.enemy));
const world = O.generate('town-1');
const s1 = S.generate(world, 'town-1');
check('npc ids all exist in the b21 manifest', S.NPC_IDS.length === 7 && S.NPC_IDS.every(i => manIds.has(i)));
check('same seed => identical sites', S.hash(s1) === S.hash(S.generate(world, 'town-1')));
check('different seed => different sites', S.hash(s1) !== S.hash(S.generate(world, 'other-seed')));
check('verify clean on town-1', S.verify(s1, world).length === 0, JSON.stringify(S.verify(s1, world)));
check('has shrines, camps and npcs', s1.shrines.length >= 6 && s1.camps.length >= 6 && s1.npcs.length >= 4, `${s1.shrines.length}/${s1.camps.length}/${s1.npcs.length}`);

const bad = [], cnt = [0, 0, 0, 0];
for (let i = 0; i < 25; i++) {
  const wd = O.generate('s' + i), st = S.generate(wd, 's' + i), p = S.verify(st, wd);
  if (p.length) bad.push('s' + i + ': ' + p[0]);
  S.all(st).forEach(x => cnt[x.zone]++);
  if (S.hash(st) !== S.hash(S.generate(wd, 's' + i))) bad.push('s' + i + ' nondeterministic');
}
check('25 seeds verify clean + deterministic', bad.length === 0, bad.slice(0, 3).join('; '));
check('midlands/highlands get more sites than shore/godlands', cnt[1] > cnt[0] && cnt[2] > cnt[0] && cnt[1] > cnt[3] && cnt[2] > cnt[3], JSON.stringify(cnt));

const all = S.all(s1);
check('ids unique', new Set(all.map(x => x.id)).size === all.length);
check('all within bounds', all.every(x => x.x >= 0 && x.y >= 0 && x.x < world.w && x.y < world.h));
check('none on water or solid tiles', all.every(x => S.walkable(world, x.x, x.y)));
let minD = 1e9;
for (let a = 0; a < all.length; a++) for (let b = a + 1; b < all.length; b++) minD = Math.min(minD, Math.hypot(all[a].x - all[b].x, all[a].y - all[b].y));
check('min spacing respected (' + minD.toFixed(1) + ')', minD >= S.MIN_SPACING * 0.55);
check('not on portals/boss sites/spawn', all.every(x => [].concat(world.portalSites, world.bossSites).every(p => Math.hypot(x.x - p.x, x.y - p.y) >= 10) && Math.hypot(x.x - world.spawnPoint.x, x.y - world.spawnPoint.y) >= 20));
check('npc sites use distinct manifest ids first', s1.npcs.every(n => manIds.has(n.npc)) && new Set(s1.npcs.slice(0, 7).map(n => n.npc)).size === Math.min(7, s1.npcs.length));
check('camps have chest + patrol with valid art ids', s1.camps.every(c => c.chest && c.patrol.length >= 1 && c.patrol.every(m => O.CREATURE_TIERS[m.type].some(l => l.indexOf(m.art) >= 0))));
check('shrine kinds limited to heal/rage/ward', s1.shrines.every(s => ['heal', 'rage', 'ward'].indexOf(s.kind) >= 0) && new Set(s1.shrines.map(s => s.kind)).size === 3);

// cooldown math
const T0 = 1000000;
check('cooldown is 3 minutes', S.COOLDOWN_MS === 180000);
check('cooldown never used => 0', S.cooldownLeft(null, T0) === 0 && S.cooldownLeft(undefined, T0) === 0 && S.shrineReady(0, T0));
check('cooldown just used => full, mid => half', S.cooldownLeft(T0, T0) === 180000 && S.cooldownLeft(T0, T0 + 90000) === 90000);
check('cooldown ends exactly at 180 s', S.cooldownLeft(T0, T0 + 180000) === 0 && S.cooldownLeft(T0, T0 + 179999) === 1);
check('clock rewind capped at full cooldown', S.cooldownLeft(T0, T0 - 10 * 3600000) === 180000);
const sh = s1.shrines[0];
const u1 = S.useShrine({}, sh, T0), u2 = S.useShrine(u1.state, sh, T0 + 1000), u3 = S.useShrine(u1.state, sh, T0 + 180000);
check('useShrine grants buff then blocks then re-allows', u1.ok && u1.buff && !u2.ok && u2.left === 179000 && u3.ok);
const inState = { a: 5 }; S.useShrine(inState, sh, T0);
check('useShrine does not mutate input', JSON.stringify(inState) === '{"a":5}');

// buff clamp
check('buffFor clamps zone and stays in table range', ['heal', 'rage', 'ward'].every(k => [-5, 0, 3, 99, NaN, 'x'].every(z => { const b = S.buffFor(k, z), t = S.BUFFS[k]; return b.value >= t.min && b.value <= t.max; })));
check('clampBuff pulls tampered values back', S.clampBuff({ kind: 'rage', value: 99 }).value === 1.5 && S.clampBuff({ kind: 'ward', value: -3 }).value === 0.5 && S.clampBuff({ kind: 'heal', value: 'x' }).value === S.BUFFS.heal.base);

// hostile input
check('hostile cooldown inputs', S.cooldownLeft('x', T0) === 0 && S.cooldownLeft(T0, NaN) === 180000 && S.cooldownLeft(Infinity, T0) === 0);
check('hostile useShrine inputs', !S.useShrine(null, null, T0).ok && !S.useShrine({}, { id: 'a', kind: 'bogus' }, T0).ok && !S.useShrine({}, sh, 'now').ok && !S.useShrine('junk', sh, NaN).ok);
check('unknown buff kind => null', S.buffFor('nope', 1) === null && S.clampBuff(null) === null && S.clampBuff({ kind: '__proto__' }) === null && S.buffFor('constructor', 1) === null);
const e1 = S.generate(null, 'x'), e2 = S.generate({}, 5), e3 = S.generate(world);
check('hostile generate inputs return empty or valid', e1.shrines.length === 0 && e2.camps.length === 0 && S.verify(e3, world).length === 0);
check('hostile verify inputs', S.verify(null, world).length > 0 && S.verify(s1, null).length > 0 && S.all(null).length === 0);
const broken = JSON.parse(JSON.stringify(s1)); broken.shrines[0].x = -3; broken.camps[0].id = broken.shrines[0].id; broken.shrines[1].buff.value = 99;
check('verify catches oob, duplicate id, bad buff', S.verify(broken, world).length >= 3);
const small = O.generate('tiny', { size: 64 }), ss = S.generate(small, 'tiny');
check('small world verifies', S.verify(ss, small).length === 0 && S.all(ss).length >= 1, JSON.stringify(S.verify(ss, small)));

console.log(failed ? failed + ' FAILED' : 'ALL PASSED');
process.exit(failed ? 1 : 0);
