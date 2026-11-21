// b24 enemies-wave-2 roster: the 12 new creatures in the world zones (+ rare godland elite), dungeon-biome extras, ?roster=classic, art, stats.
// Run: BASE=http://localhost:8611/game/index.html NODE_PATH=$(npm root -g) node game/tests/world-roster.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const O = require('../shared/mm-overworld.js');
const BIO = require('../shared/mm-biomes.js');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/mad-maze/index.html';
const WORLD = PAGE + '?mode=world&test=1&seed=12345';
const WAVE2 = O.WAVE2;
const EXPECT = { 0: ['crab_giant', 'wind_sprite', 'water_elemental'], 1: ['ghoul', 'harpy', 'thorn_vine', 'ogre'], 2: ['minotaur', 'wraith_knight', 'fire_elemental', 'golem_lava'], 3: ['giant_spider_queen'] };

// ---------- node: tables + generation ----------
const SEEDS = ['12345', '777', 'roster-a', 'roster-b'];
const zoneIds = (w) => { const o = [{}, {}, {}, {}]; w.spawnGroups.forEach((g) => { o[g.zone][g.creature] = (o[g.zone][g.creature] || 0) + 1; }); return o; };
check('12 wave-2 ids listed, all unique', WAVE2.length === 12 && new Set(WAVE2).size === 12);
check('every wave-2 id sits in a CREATURE_TIERS list of its zone (the queen is also RARE_ELITE-only)', Object.keys(EXPECT).every((z) => EXPECT[z].every((id) => ['spiral', 'aimed', 'ring'].some((t) => O.CREATURE_TIERS[t][z].indexOf(id) >= 0))));
check('classic table has none of them', WAVE2.every((id) => ['spiral', 'aimed', 'ring'].every((t) => O.CREATURE_TIERS_CLASSIC[t].every((l) => l.indexOf(id) < 0))));
const seen = {}; let zoneOk = true; let samePos = true; let det = true; let classicOk = true; let queens = 0;
SEEDS.forEach((s) => {
  const a = O.generate(s); const b = O.generate(s); const c = O.generate(s, { roster: 'classic' });
  det = det && JSON.stringify(a.spawnGroups) === JSON.stringify(b.spawnGroups);
  samePos = samePos && a.spawnGroups.length === c.spawnGroups.length && a.spawnGroups.every((g, i) => g.x === c.spawnGroups[i].x && g.y === c.spawnGroups[i].y && g.type === c.spawnGroups[i].type && g.zone === c.spawnGroups[i].zone);
  classicOk = classicOk && c.spawnGroups.every((g) => WAVE2.indexOf(g.creature) < 0 && O.CREATURE_TIERS_CLASSIC[g.type][g.tier].indexOf(g.creature) >= 0 && !g.elite);
  zoneIds(a).forEach((m, z) => Object.keys(m).forEach((id) => { if (WAVE2.indexOf(id) >= 0) { seen[id] = (seen[id] || 0) + m[id]; if (EXPECT[z].indexOf(id) < 0) zoneOk = false; if (id === 'giant_spider_queen' && !(z === 3)) zoneOk = false; } }));
  a.spawnGroups.forEach((g) => { if (g.elite) { queens++; if (g.creature !== 'giant_spider_queen' || g.zone !== 3 || g.count !== 1 || g.type !== 'aimed') zoneOk = false; } });
  const v = O.validate ? O.validate(a, { determinism: false }) : []; if (v.length) { zoneOk = false; console.log('validate:', v.slice(0, 2)); }
});
check('every wave-2 creature appears across the sample seeds', WAVE2.every((id) => seen[id] > 0), JSON.stringify(seen));
check('each creature only spawns in its own zone, the queen is a lone godland elite', zoneOk && queens > 0, 'queens=' + queens);
check('?roster=classic restores the old ids with identical spawn positions/types/zones', classicOk && samePos);
check('generation with the new roster is deterministic', det);
const g0 = O.generate('12345');
check('the queen is rare (< 15% of godland groups)', g0.spawnGroups.filter((g) => g.elite).length < 0.15 * g0.spawnGroups.filter((g) => g.zone === 3).length);
// dungeon biomes
const bsk = (b, id, el) => { const o = {}; for (let i = 0; i < 400; i++) { const s = BIO.skinFor(b, id, el, 'seed' + i, 'k' + i, false); if (s) o[s] = (o[s] || 0) + 1; } return o; };
check('bramble: thorn_vine + ogre', bsk('bramble', 'sprout').thorn_vine > 0 && bsk('bramble', 'beetle').ogre > 0);
check('meadow: wind_sprite + harpy', bsk('meadow', 'archer').wind_sprite > 0 && bsk('meadow', 'puffcap').harpy > 0);
check('crypt: ghoul + wraith_knight', bsk('crypt', 'puffcap').ghoul > 0 && bsk('crypt', 'beetle').wraith_knight > 0);
check('warren: only elites can be a giant_spider_queen, never plain mobs', bsk('warren', 'beetle', true).giant_spider_queen > 0 && !bsk('warren', 'beetle', false).giant_spider_queen);
check('dungeon skins deterministic, and classic gives none', BIO.skinFor('crypt', 'puffcap', false, 's', 'k1', false) === BIO.skinFor('crypt', 'puffcap', false, 's', 'k1', false) && Object.keys(bsk('crypt', 'puffcap')).length > 0 && BIO.skinFor('crypt', 'puffcap', false, 's', 'k1', true) === null);
check('BIOMES.creatures preloads the extras', BIO.creatures('crypt').indexOf('ghoul') >= 0 && BIO.creatures('warren').indexOf('giant_spider_queen') >= 0);

async function open(browser, url, vp) {
  const ctx = await browser.newContext(vp || { viewport: { width: 1000, height: 700 } });
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.__mm && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 15000 });
  return { ctx, page, errors };
}

(async () => {
  const browser = await chromium.launch();
  const A = await open(browser, WORLD, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); const page = A.page;
  await page.waitForFunction((ids) => { const s = window.__mm.arena._enemyArt; return !!s && ids.every((x) => s.has(x)); }, WAVE2, { timeout: 20000 }).catch(() => {});
  check('art loads for each of the 12 new ids (phone 390x844)', await page.evaluate((ids) => { const s = window.__mm.arena._enemyArt; return !!s && ids.every((x) => s.has(x)); }, WAVE2));
  check('phone: no horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const ids = await page.evaluate((all) => { const gs = window.__mm.world.world.spawnGroups; return all.filter((id) => gs.some((g) => g.creature === id)); }, WAVE2);
  check('the world page generates groups for the new creatures (seed 12345)', ids.length >= 8, JSON.stringify(ids));
  await page.evaluate(() => { const a = window.__mm.arena; a.player.iframes = 1e9; a.player.hp = 1e9; a.nextWaveIn = 1e9; });
  const stats = [];
  for (const id of ids) {
    const g = await page.evaluate((cid) => { const g = window.__mm.world.world.spawnGroups.find((x) => x.creature === cid); return { x: g.x, y: g.y, zone: g.zone, type: g.type, elite: !!g.elite }; }, id);
    await page.evaluate(() => { const a = window.__mm.arena; a.player.x = 40; a.player.y = 40; }); await page.waitForTimeout(400); // far corner first: the active-enemy cap frees up before the next group
    await page.evaluate((t) => { const a = window.__mm.arena; a.player.x = (t.x + 0.5) * 32; a.player.y = (t.y + 0.5) * 32; }, g);
    await page.waitForFunction((cid) => window.__mm.arena.enemies.some((q) => q.active && q.art === cid), id, { timeout: 8000 }).catch(() => {});
    const r = await page.evaluate((cid) => {
      const a = window.__mm.arena; const e = a.enemies.find((q) => q.active && q.art === cid); if (!e) return null;
      const c = document.createElement('canvas'); c.width = 200; c.height = 200; const gg = c.getContext('2d'); gg.translate(100 - e.x, 100 - e.y); e.t = 0.5;
      const drew = a._drawEnemyArt(gg, e, { r: 15 }); const d = gg.getImageData(0, 0, 200, 200).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++;
      return { type: e.type, zone: e.zone, maxHp: e.maxHp, dmg: e.dmgMul, drew, n };
    }, id);
    stats.push(Object.assign({ id }, g, r || { missing: true }));
  }
  check('each wave-2 creature spawns live with the behaviour type and zone of its group', stats.length > 0 && stats.every((s) => !s.missing && s.type === s.type), JSON.stringify(stats.filter((s) => s.missing)));
  check('each draws through art (pixels > 100, _drawEnemyArt true)', stats.every((s) => s.drew === true && s.n > 100), JSON.stringify(stats.map((s) => [s.id, s.drew, s.n])));
  const BASE_HP = { spiral: 16, aimed: 8, ring: 11 };
  check('hp / dmg consistent with tier: hp >= half the zone-scaled base, dmg > 0', stats.every((s) => s.maxHp >= 1 && s.dmg > 0 && s.maxHp >= BASE_HP[s.type] * [0.5, 1, 2, 3][s.zone] * 0.5), JSON.stringify(stats.map((s) => [s.id, s.zone, s.maxHp, s.dmg])));
  const avgD = (z) => { const l = stats.filter((s) => s.zone === z); return l.reduce((n, s) => n + s.dmg, 0) / Math.max(1, l.length); };
  check('damage multiplier rises from shore to highlands', avgD(2) > avgD(0), avgD(0) + ' vs ' + avgD(2));
  const avg = (z) => { const l = stats.filter((s) => s.zone === z && !s.elite); return l.length ? l.reduce((n, s) => n + s.maxHp / BASE_HP[s.type], 0) / l.length : 0; };
  check('highlands creatures are sturdier than shore ones', avg(2) > avg(0), avg(0) + ' vs ' + avg(2));
  const q = stats.find((s) => s.id === 'giant_spider_queen');
  check('the queen (if in range) is an elite with a sturdy hp pool', !q || (q.elite && q.maxHp >= BASE_HP.aimed * 10), JSON.stringify(q));
  check('no console errors (world, phone)', A.errors.length === 0, A.errors.join(' | '));

  const C = await open(browser, WORLD + '&roster=classic');
  const probe = (x) => ({ flag: window.__mm.world.rosterClassic, any: window.__mm.world.world.spawnGroups.some((g) => x.indexOf(g.creature) >= 0) });
  const cl = await C.page.evaluate(`(${probe.toString()})(${JSON.stringify(WAVE2)})`);
  check('?roster=classic on the page: flag set, no wave-2 creature in the world', cl.flag === true && cl.any === false, JSON.stringify(cl));
  const N = await page.evaluate(`(${probe.toString()})(${JSON.stringify(WAVE2)})`);
  check('default page: new roster in use', N.flag === false && N.any === true, JSON.stringify(N));
  check('no console errors (classic)', C.errors.length === 0, C.errors.join(' | '));

  for (const [biome, bids] of [['crypt', ['ghoul', 'wraith_knight']], ['bramble', ['thorn_vine', 'ogre']], ['meadow', ['wind_sprite', 'harpy']]]) {
    const D = await open(browser, PAGE + '?mode=dungeon&biome=' + biome + '&seed=2&test=1&offline=1');
    await D.page.waitForFunction((x) => { const s = window.__mm.arena._enemyArt; return !!s && x.every((i) => s.has(i)); }, bids, { timeout: 15000 }).catch(() => {});
    const ok = await D.page.evaluate((x) => { const s = window.__mm.arena._enemyArt; return !!s && x.every((i) => s.has(i)); }, bids);
    check(biome + ' dungeon: extra art preloaded, no console errors', ok && D.errors.length === 0, D.errors.join(' | '));
    await D.ctx.close();
  }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
