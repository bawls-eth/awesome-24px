// Pure-node tests for shared/mm-zones.js. Run: node game/tests/shared-mm-zones.test.js
const fs = require('fs');
const path = require('path');
const O = require('../shared/mm-overworld.js');
const Z = require('../shared/mm-zones.js');
const T = Z.TABLES;
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const clone = (o) => JSON.parse(JSON.stringify(o));
const world = O.generate('zones-test');
const TILE = T.TILE, R = T.ACTIVATE_RADIUS;
const gpx = (g) => [(g.x + 0.5) * TILE, (g.y + 0.5) * TILE];
const dist = (a, b, c, d) => Math.hypot(a - c, b - d);

check('VERSION and TABLES exported', typeof Z.VERSION === 'number' && T.MAX_ACTIVE === 60 && T.ACTIVATE_RADIUS === 1500 && T.DEACTIVATE_MUL === 2.5);

// ---- determinism of the spawner ----
function run(w, seq, opts) {
  const sp = Z.createSpawner(w, opts), log = [];
  seq.forEach(([x, y, t]) => { log.push(clone(sp.update(x, y, 0.016, t))); });
  return { sp, log };
}
const sg0 = world.spawnGroups[Math.floor(world.spawnGroups.length / 2)];
const [sx, sy] = gpx(sg0);
const seq = [[sx, sy, 0], [sx + 40, sy, 1], [sx + 4000, sy + 4000, 2], [sx, sy, 3], [sx + 100, sy, 4]];
const A = run(world, seq), B = run(world, seq);
check('same world + same visit order => identical spawn/despawn output', JSON.stringify(A.log) === JSON.stringify(B.log));
check('spawner spawns something near a group', A.log[0].spawn.length > 0);
const world2 = O.generate('zones-test-2');
check('different seed => different spawns', JSON.stringify(run(world2, [[...gpx(world2.spawnGroups[5]), 0]]).log) !== JSON.stringify(run(world, [[...gpx(world.spawnGroups[5]), 0]]).log));

// ---- culling radii, hysteresis, cap ----
{
  const sp = Z.createSpawner(world);
  const res = clone(sp.update(sx, sy, 0.016, 0));
  const ids = res.spawn.map((e) => e.id);
  check('ids unique', new Set(ids).size === ids.length);
  check('every spawned enemy belongs to a group within the activation radius', res.spawn.every((e) => dist(sx, sy, ...gpx(world.spawnGroups[e.group])) <= R + 1e-6));
  check('every group within radius is active (cap permitting)', sp.activeEnemyCount() >= T.MAX_ACTIVE || world.spawnGroups.every((g, i) => dist(sx, sy, ...gpx(g)) > R || sp.isGroupActive(i)) || sp.activeEnemyCount() > T.MAX_ACTIVE - 8);
  check('no group beyond radius is active', world.spawnGroups.every((g, i) => !sp.isGroupActive(i) || dist(sx, sy, ...gpx(g)) <= R + 1e-6));
  check('cap respected after first update', sp.activeEnemyCount() <= T.MAX_ACTIVE);
  // hysteresis: move so the first group sits between 1x and 2.5x radius -> must stay
  const gi = res.spawn[0].group, [gxp, gyp] = gpx(world.spawnGroups[gi]);
  const mid = sp.update(gxp + R * 1.8, gyp, 0.016, 1);
  check('hysteresis: group at 1.8x radius is NOT despawned', !mid.despawn.some((id) => ids.indexOf(id) >= 0 && res.spawn.find((e) => e.id === id).group === gi) && sp.isGroupActive(gi));
  // combat keeps it alive beyond 2.5x
  const eid = res.spawn.find((e) => e.group === gi).id;
  sp.update(gxp, gyp, 0.016, 2); sp.markCombat(eid);
  const far1 = sp.update(gxp + R * 3, gyp, 0.016, 3);
  check('in-combat group survives beyond 2.5x radius', sp.isGroupActive(gi) && !far1.despawn.includes(eid));
  const far2 = sp.update(gxp + R * 3, gyp, 0.016, 3 + T.COMBAT_GRACE + 1);
  check('despawns beyond 2.5x radius after combat grace', !sp.isGroupActive(gi) && far2.despawn.includes(eid));
  check('despawned group lists all its enemies', far2.despawn.length >= res.spawn.filter((e) => e.group === gi).length);
  // far-away player: nothing active at all
  const sp2 = Z.createSpawner(world); sp2.update(sx, sy, 0.016, 0); sp2.update(-99999, -99999, 0.016, 1);
  check('everything despawns when the player is far away', sp2.activeEnemyCount() === 0 && sp2.activeGroupCount() === 0);
  // reactivation gives the same enemies (same respawn count)
  const again = clone(sp2.update(sx, sy, 0.016, 2));
  check('re-entering an untouched area re-creates identical enemies', JSON.stringify(again.spawn) === JSON.stringify(A.log[0].spawn));
}
{
  // dense cap test: tiny cap and huge radius
  const sp = Z.createSpawner(world, { radius: 100000, cap: 20 });
  const r = sp.update(world.spawnPoint.x * TILE, world.spawnPoint.y * TILE, 0.016, 0);
  check('cap respected with huge radius', sp.activeEnemyCount() <= 20 && r.spawn.length === sp.activeEnemyCount());
  const act = r.spawn.map((e) => e.group), uniq = [...new Set(act)];
  const maxActD = Math.max(...uniq.map((g) => dist(world.spawnPoint.x * TILE, world.spawnPoint.y * TILE, ...gpx(world.spawnGroups[g]))));
  const inactNearer = world.spawnGroups.some((g, i) => !uniq.includes(i) && dist(world.spawnPoint.x * TILE, world.spawnPoint.y * TILE, ...gpx(g)) < maxActD - 1e-6 && world.spawnGroups[i].count <= 20 - sp.activeEnemyCount());
  check('cap prefers nearest groups', !inactNearer);
  const sp60 = Z.createSpawner(world, { radius: 100000 });
  sp60.update(world.spawnPoint.x * TILE, world.spawnPoint.y * TILE, 0.016, 0);
  check('default cap 60 respected', sp60.activeEnemyCount() <= 60 && sp60.activeEnemyCount() > 40);
}

// ---- respawn cooldown by zone ----
{
  const cds = [];
  for (let z = 0; z < 4; z++) {
    const gi = world.spawnGroups.findIndex((g) => g.zone === z);
    check('world has a group in zone ' + z, gi >= 0);
    const sp = Z.createSpawner(world, { cap: 1000 }), [px, py] = gpx(world.spawnGroups[gi]);
    const r = sp.update(px, py, 0.016, 100);
    const mine = r.spawn.filter((e) => e.group === gi);
    let cl = null;
    mine.forEach((e) => { cl = sp.markDead(e.id, 100); });
    check('zone ' + z + ' group cleared on last kill', cl && cl.cleared === true && sp.respawnCount(gi) === 1);
    const cd = T.ZONES[z].respawn; cds.push(cd);
    const before = sp.update(px, py, 0.016, 100 + cd - 1);
    check('zone ' + z + ' no respawn before cooldown (' + cd + 's)', !before.spawn.some((e) => e.group === gi));
    const after = sp.update(px, py, 0.016, 100 + cd);
    const re = after.spawn.filter((e) => e.group === gi);
    check('zone ' + z + ' respawns after cooldown with fresh ids', re.length === mine.length && re.every((e) => mine.every((m) => m.id !== e.id)));
  }
  check('respawn cooldown rises with zone', cds.every((c, i) => i === 0 || c > cds[i - 1]));
}
{
  // respawn determinism: same kills in same order => same respawn
  const play = () => { const sp = Z.createSpawner(world), g = world.spawnGroups[3], [px, py] = gpx(g); const r = sp.update(px, py, 0.016, 0); r.spawn.filter((e) => e.group === 3).forEach((e) => sp.markDead(e.id, 1)); return clone(sp.update(px, py, 0.016, 1000).spawn.filter((e) => e.group === 3)); };
  check('respawn is deterministic', JSON.stringify(play()) === JSON.stringify(play()) && play().length > 0);
  const sp = Z.createSpawner(world), g = world.spawnGroups[3], [px, py] = gpx(g); const r = sp.update(px, py, 0.016, 0);
  const e0 = r.spawn.find((e) => e.group === 3);
  check('markDead twice is a no-op / invalid id is null', sp.markDead(e0.id, 1) && sp.markDead(e0.id, 1) === null && sp.markDead(-5, 1) === null && sp.markDead(NaN, 1) === null);
}

// ---- multipliers monotonic ----
{
  const keys = ['hpMul', 'speedMul', 'dmgMul', 'xpMul', 'shardMul'];
  const ms = [0, 1, 2, 3].map((z) => Z.statMultipliers(z, z));
  check('all multipliers strictly rise with zone', keys.every((k) => ms.every((m, i) => i === 0 || m[k] > ms[i - 1][k])));
  check('shore baseline is 1x', keys.every((k) => Math.abs(ms[0][k] - 1) < 1e-9));
  check('multipliers non-decreasing with tier', keys.every((k) => [0, 1, 2].every((z) => [1, 2, 3].every((t) => Z.statMultipliers(z, t)[k] >= Z.statMultipliers(z, t - 1)[k]))));
  const sp = Z.createSpawner(world, { radius: 100000, cap: 100000 });
  const r = sp.update(128 * TILE, 128 * TILE, 0.016, 0);
  const byZone = [[], [], [], []]; r.spawn.forEach((e) => byZone[e.zone].push(e.hpMul));
  const avg = byZone.map((a) => a.reduce((s, v) => s + v, 0) / (a.length || 1));
  check('spawned enemy hpMul averages rise by zone', avg.every((v, i) => i === 0 || v > avg[i - 1]), JSON.stringify(avg));
  const b = world.bossSites[0], be = Z.bossEnemy(b);
  check('boss enemy has boss multipliers above zone mult', be.hpMul > Z.statMultipliers(b.zone, b.zone).hpMul && be.boss === true);
  const sp3 = Z.createSpawner(world), site = world.bossSites[0];
  check('bossReady: ready, then on cooldown, then ready', sp3.bossReady(site, 0) && (sp3.bossDefeated(site, 10), !sp3.bossReady(site, 11)) && sp3.bossReady(site, 10 + T.BOSS.cooldown[site.zone]));
}

// ---- drops ----
const N = 5000;
function stats(zone, boss) {
  const tiers = [0, 0, 0, 0, 0, 0], rar = [0, 0, 0, 0]; let tot = 0, sh = 0;
  for (let i = 0; i < N; i++) {
    const d = Z.rollDrop({ zone, tier: zone, boss }, 'k' + i + ':' + zone).bag;
    tiers[d.tierIndex]++; tot += d.tierIndex; sh += d.shards; d.items.forEach((it) => { rar[T.RARITIES.indexOf(it.rarity)]++; });
  }
  return { tiers, rar, mean: tot / N, shards: sh / N };
}
for (const boss of [false, true]) {
  const s = [0, 1, 2, 3].map((z) => stats(z, boss));
  check((boss ? 'boss' : 'normal') + ' mean bag tier rises with zone: ' + s.map((x) => x.mean.toFixed(2)).join(' < '), s.every((x, i) => i === 0 || x.mean > s[i - 1].mean));
  const hi = (x) => x.tiers.slice(3).reduce((a, b) => a + b, 0);
  check((boss ? 'boss' : 'normal') + ' cyan+ bag share rises with zone', s.every((x, i) => i === 0 || hi(x) >= hi(s[i - 1])) && hi(s[3]) > hi(s[0]));
  const stoch = [0, 1, 2].every((z) => { let a = 0, b = 0; for (let k = 5; k >= 0; k--) { a += s[z].tiers[k]; b += s[z + 1].tiers[k]; if (b < a - 0.03 * N) return false; } return true; });
  check((boss ? 'boss' : 'normal') + ' higher zone stochastically dominates (within 3%)', stoch);
  check((boss ? 'boss' : 'normal') + ' shards rise with zone', s.every((x, i) => i === 0 || x.shards > s[i - 1].shards));
  const epic = s.map((x) => x.rar[3]);
  if (boss) check('epic only from godlands bosses', epic[0] === 0 && epic[1] === 0 && epic[2] === 0 && epic[3] > 0, JSON.stringify(epic));
  else check('no epic from normal enemies in any zone', epic.every((e) => e === 0));
  const rareShare = s.map((x) => (x.rar[2] + x.rar[3]) / (x.rar.reduce((a, b) => a + b, 0) || 1));
  check((boss ? 'boss' : 'normal') + ' rare+ share rises with zone', rareShare.every((v, i) => i === 0 || v > rareShare[i - 1]), JSON.stringify(rareShare));
}
{
  const d = Z.rollDrop({ zone: 3, boss: true }, 'x'), d2 = Z.rollDrop({ zone: 3, boss: true }, 'x');
  check('rollDrop deterministic', JSON.stringify(d) === JSON.stringify(d2));
  check('bag shape: tier name, rarityBias, items, shards, potions, lifetime', T.BAG_TIERS.includes(d.bag.tier) && typeof d.bag.rarityBias === 'number' && Array.isArray(d.bag.items) && d.bag.shards >= 0 && d.bag.potions >= 0 && d.bag.lifetime === T.BAG_LIFETIME[d.bag.tierIndex]);
  check('lifetime table has one entry per bag tier and never shrinks upward', T.BAG_LIFETIME.length === 6 && T.BAG_LIFETIME.every((v, i) => i === 0 || v >= T.BAG_LIFETIME[i - 1]));
  const ps = Z.rollDropForPlayers({ zone: 2, boss: true }, 'kill-77', ['alice', 'bob', 'cy']);
  const ps2 = Z.rollDropForPlayers({ zone: 2, boss: true }, 'kill-77', ['alice', 'bob', 'cy']);
  check('per-player rolls deterministic', JSON.stringify(ps) === JSON.stringify(ps2) && ps.length === 3);
  check('per-player rolls are soulbound to their owner', ps.every((p) => p.bag.soulbound === true && p.bag.owner === p.playerId));
  const solo = Z.rollDropForPlayers({ zone: 2, boss: true }, 'kill-77', ['bob']);
  check('a player roll does not depend on who else is present', JSON.stringify(solo[0].bag) === JSON.stringify(ps[1].bag));
  let diff = 0; for (let i = 0; i < 200; i++) { const r = Z.rollDropForPlayers({ zone: 3, boss: true }, 'k' + i, ['a', 'b']); if (JSON.stringify(r[0].bag) !== JSON.stringify(r[1].bag)) diff++; }
  check('per-player rolls are independent (differ most of the time)', diff > 150, 'diff=' + diff);
  check('dropChance: bosses always, rises with zone', Z.dropChance({ boss: true, zone: 0 }) === 1 && [0, 1, 2, 3].every((z, i) => i === 0 || Z.dropChance({ zone: z }) > Z.dropChance({ zone: z - 1 })));
}

// ---- referenced ids exist ----
{
  const realm = fs.existsSync(path.join(__dirname, '../realm.js')) ? fs.readFileSync(path.join(__dirname, '../realm.js'), 'utf8') : '';
  const block = realm.slice(realm.indexOf('const RM_ITEMS = ['), realm.indexOf('const RM_ITEM_BY_ID'));
  const realmIds = [...block.matchAll(/id: '([a-z]+)'/g)].map((m) => m[1]);
  check('realm.js has 7 item ids and ITEM_IDS matches them exactly', realmIds.length === 7 && JSON.stringify(realmIds.slice().sort()) === JSON.stringify(T.ITEM_IDS.slice().sort()), JSON.stringify(realmIds));
  const rbl = realm.slice(realm.indexOf('const RM_RARITIES = ['), realm.indexOf('const RM_ITEMS = ['));
  const realmRar = [...rbl.matchAll(/id: '([a-z]+)'/g)].map((m) => m[1]);
  check('RARITIES match realm.js RM_RARITIES', JSON.stringify(realmRar) === JSON.stringify(T.RARITIES), JSON.stringify(realmRar));
  const seenItems = new Set();
  for (let z = 0; z < 4; z++) for (let i = 0; i < 300; i++) Z.rollDrop({ zone: z, boss: i % 2 === 0 }, 'ids' + i + z).bag.items.forEach((it) => seenItems.add(it.id));
  check('every rolled item id is a realm item id', [...seenItems].every((id) => T.ITEM_IDS.includes(id)) && seenItems.size === 7);
  const tiers = O.CREATURE_TIERS;
  const sp = Z.createSpawner(world, { radius: 100000, cap: 100000 }); const r = sp.update(128 * TILE, 128 * TILE, 0.016, 0);
  check('every spawned creature id is in CREATURE_TIERS for its type/tier', r.spawn.length > 100 && r.spawn.every((e) => tiers[e.type] && tiers[e.type][e.tier].includes(e.creature)));
  check('every boss site boss id is a known boss', world.bossSites.every((b) => [].concat(O.BOSSES.map((x) => x.boss), O.BOSS_POOLS[1], O.BOSS_POOLS[2], O.BOSS_POOLS[3]).includes(Z.bossEnemy(b).creature))); // b23: default pools add the bosses-extra ids
}

// ---- zoneInfoAt / eventsFor ----
{
  const c = world.center, zi = Z.zoneInfoAt(world, c.x, c.y);
  check('zoneInfoAt centre = godlands with colour/danger/difficulty', zi.zone === 3 && zi.name === 'Godlands' && /^#[0-9a-f]{6}$/i.test(zi.color) && typeof zi.danger === 'string' && zi.difficulty > 0.5 && zi.difficulty <= 1);
  check('zoneInfoAt out of bounds = void', Z.zoneInfoAt(world, -5, 10).zone === 255 && Z.zoneInfoAt(world, 5, 9999).difficulty === 0);
  const names = new Set(); for (let x = 0; x < 256; x += 8) names.add(Z.zoneInfoAt(world, x, 128).name);
  check('zoneInfoAt crosses all zone names east-west', ['Shore', 'Midlands', 'Highlands', 'Godlands'].every((n) => names.has(n)));
  const colors = new Set([0, 1, 2, 3].map((z) => T.ZONES[z].color)); check('zone colours distinct', colors.size === 4);
  let seen = 0, okAll = true, noOverlap = true, cdOk = true;
  for (let slot = 0; slot < 200; slot++) {
    const t0 = slot * Z.EVENT_PERIOD;
    const a = Z.eventsFor(world, t0 + 7), b = Z.eventsFor(world, t0 + 7);
    if (JSON.stringify(a) !== JSON.stringify(b)) okAll = false;
    const regions = a.map((e) => e.region); if (new Set(regions).size !== regions.length) noOverlap = false;
    a.forEach((e) => { seen++; if (!(e.countdown >= 0 && e.endsAt - e.startsAt === T.EVENT_DURATION && e.startsAt >= t0 && e.endsAt <= t0 + Z.EVENT_PERIOD && world.bossSites.some((s) => s.x === e.x && s.y === e.y && s.zone === e.region))) cdOk = false; });
    const act = Z.eventsFor(world, t0 + Z.EVENT_PERIOD - 1);
    act.forEach((e) => { if (!e.active) cdOk = false; });
  }
  check('events deterministic, <=1 per region per slot, inside slot, at boss sites', okAll && noOverlap && cdOk && seen > 50, 'seen=' + seen);
  const ev = (() => { for (let s = 0; s < 100; s++) { const e = Z.eventsFor(world, s * Z.EVENT_PERIOD)[0]; if (e) return e; } })();
  check('upcoming event has a positive countdown that reaches active', ev && !ev.active ? Z.eventsFor(world, ev.startsAt).some((e) => e.id === ev.id && e.active) : true);
  check('different seed => different event schedule', JSON.stringify(Z.eventsFor(world, 1000)) !== JSON.stringify(Z.eventsFor(world2, 1000)) || JSON.stringify(Z.eventsFor(world, 5000)) !== JSON.stringify(Z.eventsFor(world2, 5000)));
}

// ---- eventPlan / eventTier / eventReward (live world events) ----
{
  const evs = []; for (let s = 0; s < 120; s++) Z.eventsFor(world, s * Z.EVENT_PERIOD).forEach((e) => evs.push(e));
  const plans = evs.map((e) => Z.eventPlan(world, e));
  check('eventPlan deterministic', JSON.stringify(plans) === JSON.stringify(evs.map((e) => Z.eventPlan(world, e))));
  const kinds = new Set(plans.map((p) => p.kind));
  check('eventPlan yields both kinds (boss raid and swarm)', kinds.has('boss') && kinds.has('swarm'), [...kinds].join(','));
  const sites = world.structures.filter((s) => s.kind === 'event_site');
  check('event plans happen at an event_site of their region (or the boss site when the region has none)', plans.every((p, i) => {
    const own = sites.filter((s) => s.zone === p.region);
    return own.length ? own.some((s) => s.x === p.site.x && s.y === p.site.y) : (p.site.x === evs[i].x && p.site.y === evs[i].y);
  }));
  check('boss plans use a boss of the region boss list', plans.every((p, i) => world.bossSites.some((b) => b.boss === p.boss && b.zone === p.region) && p.boss === evs[i].boss));
  const sw = plans.filter((p) => p.kind === 'swarm');
  const ct = O.CREATURE_TIERS;
  check('swarm plans: region-sized wave of that region\'s creatures near the site, finite stats', sw.length > 0 && sw.every((p) => p.swarm.length === T.EVENT_SWARM_COUNT[p.region] &&
    p.swarm.every((e) => ct[e.type] && ct[e.type][p.region].includes(e.creature) && e.zone === p.region && Math.hypot(e.x - (p.site.x + 0.5) * TILE, e.y - (p.site.y + 0.5) * TILE) <= T.EVENT_SWARM_SPREAD + 1 && Number.isFinite(e.hpMul) && e.hpMul > 1)));
  check('boss plans carry no swarm', plans.filter((p) => p.kind === 'boss').every((p) => p.swarm.length === 0));
  check('eventTier thresholds: none / participate / contribute / hero', Z.eventTier(0, 100) === 0 && Z.eventTier(0.5, 100) === 0 && Z.eventTier(1, 100) === 1 && Z.eventTier(24.9, 100) === 1 &&
    Z.eventTier(25, 100) === 2 && Z.eventTier(59, 100) === 2 && Z.eventTier(60, 100) === 3 && Z.eventTier(500, 100) === 3 && Z.eventTier(5, 0) === 0 && Z.eventTier(NaN, 10) === 0);
  const ev = evs[0];
  check('eventReward: none for tier 0, deterministic otherwise', Z.eventReward(ev, 0, 's') === null && JSON.stringify(Z.eventReward(ev, 2, 's')) === JSON.stringify(Z.eventReward(ev, 2, 's')));
  let okR = true;
  evs.slice(0, 40).forEach((e, i) => {
    let prev = null;
    for (let t = 1; t <= 3; t++) {
      const r = Z.eventReward(e, t, 'seed' + i);
      const floor = Math.min(5, T.EVENT_MIN_BAG[t - 1] + e.region - 1);
      if (!(r.bag.items.length >= 1 && r.bag.tierIndex >= floor && r.bag.tier === T.BAG_TIERS[r.bag.tierIndex] && r.tierName === T.EVENT_TIERS[t] && r.shards === T.EVENT_SHARDS[t - 1] * e.region && r.fame === T.EVENT_FAME[t - 1] * e.region)) okR = false;
      if (r.bag.items.some((it) => !T.ITEM_IDS.includes(it.id) || (it.r === 3 && e.region !== 3))) okR = false;
      if (prev && !(r.fame > prev.fame && r.shards > prev.shards)) okR = false;
      prev = r;
    }
  });
  check('eventReward: guaranteed bag (>=1 item) at or above the tier floor; fame/shards grow with the tier and region; epic only in the Godlands', okR);
}

// ---- source hygiene ----
{
  const src = fs.readFileSync(path.join(__dirname, '../shared/mm-zones.js'), 'utf8');
  check('no Math.random in source', !/Math\.random/.test(src));
  check('no Date in source', !/\bDate\b/.test(src) && !/performance\.now/.test(src));
  check('no DOM access in source', !/\b(document|window|navigator|localStorage|requestAnimationFrame)\b/.test(src));
}

// ---- performance ----
{
  const sp = Z.createSpawner(world); const t0 = process.hrtime.bigint();
  let x = 128 * TILE, y = 128 * TILE, acc = 0;
  for (let i = 0; i < 10000; i++) {
    x += Math.cos(i / 300) * 9; y += Math.sin(i / 230) * 9;
    const r = sp.update(x, y, 0.016, i * 0.016); acc += r.spawn.length + r.despawn.length;
    if (i % 40 === 0 && r.spawn.length) sp.markDead(r.spawn[0].id, i * 0.016);
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  check('10,000 updates on 256x256 < 1000 ms (took ' + ms.toFixed(0) + ')', ms < 1000 && acc > 0);
}

// ---- 40 seeds lifecycle ----
{
  let bad = 0, spawned = 0;
  for (let s = 0; s < 40; s++) {
    const w = O.generate('life-' + s), sp = Z.createSpawner(w), live = new Map();
    let x = w.spawnPoint.x * TILE, y = w.spawnPoint.y * TILE, t = 0;
    for (let i = 0; i < 400; i++) {
      const g = w.spawnGroups[(i * 7) % w.spawnGroups.length], [tx, ty] = gpx(g);
      x += Math.max(-60, Math.min(60, tx - x)); y += Math.max(-60, Math.min(60, ty - y)); t += 0.5;
      const r = sp.update(x, y, 0.5, t);
      for (const e of r.spawn) {
        for (const k of ['x', 'y', 'hpMul', 'speedMul', 'dmgMul', 'xpMul', 'shardMul']) if (!Number.isFinite(e[k])) bad++;
        if (live.has(e.id)) bad++; live.set(e.id, e); spawned++;
      }
      for (const id of r.despawn) { if (!live.delete(id)) bad++; }
      if (sp.activeEnemyCount() !== live.size || live.size > T.MAX_ACTIVE) bad++;
      if (i % 3 === 0 && live.size) { const id = live.keys().next().value; const info = sp.markDead(id, t); live.delete(id); if (!info) bad++; else { const d = Z.rollDrop(info, 's' + s + ':' + i); if (!(d.bag.shards >= 0)) bad++; } }
      if (i % 5 === 0 && live.size) sp.markCombat(live.keys().next().value);
    }
    const ev = Z.eventsFor(w, 1234 + s * 77); if (ev.some((e) => !Number.isFinite(e.countdown))) bad++;
    const zi = Z.zoneInfoAt(w, x / TILE, y / TILE); if (!Number.isFinite(zi.difficulty)) bad++;
  }
  check('40 seeds: valid spawner lifecycles, no NaN, live set consistent (' + spawned + ' spawns)', bad === 0 && spawned > 1000, 'bad=' + bad);
}

// PLAYTEST-REVIEW-2 #1 (added): each zone names the recommended hero level the border toast shows, rising inward
check('fire budget: live enemy-bullet caps 40/80/140/200 rise inward, bolt travel 0.6 of the view', T.EB_CAP.join() === '40,80,140,200' && T.EB_TRAVEL === 0.6);
check('zones carry recLv 1/5/10/15 (border toast), rising toward the centre', [0, 1, 2, 3].map((z) => T.ZONES[z].recLv).join() === '1,5,10,15');

console.log(failed ? '\n' + failed + ' FAILED' : '\nALL PASSED');
process.exit(failed ? 1 : 0);
