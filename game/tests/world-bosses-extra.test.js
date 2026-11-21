// b23 bosses-extra wired into the Realm overworld (per-zone boss pools in shared/mm-overworld.js, ?bosses=classic, art ids in MMArt.BOSS_MAP)
// and the Crypt alternate boss (MMBiomes.bossFor). Run: BASE=http://localhost:8602/game/index.html NODE_PATH=$(npm root -g) node game/tests/world-bosses-extra.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const O = require('../shared/mm-overworld.js');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/mad-maze/index.html';
const EXTRA = ['lich_king', 'hydra', 'treant_elder', 'sand_titan', 'frost_dragon', 'shadow_hydra', 'clockwork_golem', 'void_maw'];
const CLASSIC = O.BOSSES.map((b) => b.boss);
const ids = (w) => w.bossSites.map((b) => b.boss);

// ---- node-side: generator ----
const SEEDS = ['12345', 'a', 'b-7', '999', 'island', '31337', '42', '2024', 'x1', 'seed9'];
const worlds = SEEDS.map((s) => O.generate(s)); const classic = SEEDS.map((s) => O.generate(s, { bosses: 'classic' }));
check('boss sites deterministic per seed (same ids twice)', SEEDS.every((s, i) => JSON.stringify(ids(O.generate(s))) === JSON.stringify(ids(worlds[i]))));
check('site LOCATIONS are identical to classic, only the boss id may differ', worlds.every((w, i) => JSON.stringify(w.bossSites.map((b) => [b.x, b.y, b.zone])) === JSON.stringify(classic[i].bossSites.map((b) => [b.x, b.y, b.zone]))));
check('?bosses=classic restores the original ids per site', classic.every((w) => JSON.stringify(ids(w)) === JSON.stringify(CLASSIC)));
check('boss ids come from the zone pool and are distinct within a zone', worlds.every((w) => [1, 2, 3].every((z) => { const l = w.bossSites.filter((b) => b.zone === z).map((b) => b.boss); return l.length === new Set(l).size && l.every((id) => O.BOSS_POOLS[z].indexOf(id) >= 0); })));
check('zone-appropriate: godlands never get treant_elder/sand_titan; midlands never get void_maw/lich_king', worlds.every((w) => w.bossSites.every((b) => !(b.zone === 3 && (b.boss === 'treant_elder' || b.boss === 'sand_titan')) && !(b.zone === 1 && (b.boss === 'void_maw' || b.boss === 'lich_king')))));
check('across seeds the new bosses appear and cover every extra id', EXTRA.every((id) => worlds.some((w) => ids(w).indexOf(id) >= 0)), [...new Set([].concat(...worlds.map(ids)))].join());
check('different seeds vary the mapping', new Set(worlds.map((w) => ids(w).join())).size > 3);
check('verify() still ok with the new ids', worlds.slice(0, 3).every((w) => O.verify(w).ok));

(async () => {
  const browser = await chromium.launch();
  const open = async (qs, vp) => {
    const ctx = await browser.newContext(vp || { viewport: { width: 1000, height: 700 } });
    await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
    await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.goto(PAGE + qs);
    await page.waitForFunction(() => window.__mm && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 15000 });
    return { ctx, page, errors };
  };
  const A = await open('?mode=world&test=1&seed=12345', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const siteIds = await A.page.evaluate(() => window.__mm.world.bossArtIds());
  check('page world uses the new default mapping (matches the generator)', JSON.stringify(siteIds) === JSON.stringify(ids(O.generate('12345'))) && siteIds.some((id) => EXTRA.indexOf(id) >= 0), siteIds.join());
  const art = await A.page.evaluate(async (list) => {
    const out = {}; for (const id of list) { const s = await MMArt.loadBosses('../../assets/arcane/', [id]); out[id] = s.has(id) && !!s.anim(id, 'idle', 'down') && !!s.anim(id, 'death', 'down'); }
    return { out, map: list.every((id) => MMArt.BOSS_MAP.indexOf(id) >= 0), tiers: [0, 1, 7, 8, 9].map((t) => MMArt.bossArtFor(t)).join() };
  }, EXTRA);
  check('boss art loads (idle + death) for all 8 new bosses', EXTRA.every((id) => art.out[id]), JSON.stringify(art.out));
  check('bossArtFor tier mapping unchanged (wraps at the original 8)', art.map && art.tiers === 'void_oracle,bone_colossus,mire_queen,void_oracle,bone_colossus', art.tiers);
  await A.page.evaluate(() => { const a = window.__mm.arena, w = window.__mm.world, b = w.bossSites()[0]; a.player.x = (b.x + 0.5) * 32; a.player.y = (b.y + 0.5) * 32; a.player.iframes = 1e9; });
  await A.page.waitForFunction(() => window.__mm.world.bossSites()[0].live, null, { timeout: 8000 }).catch(() => {});
  const live = await A.page.evaluate(() => { const e = window.__mm.world.bossEntity(0), s = window.__mm.world.bossSites()[0]; return { ba: e && e.bossArt, boss: s.boss, live: s.live, name: s.name }; });
  check('the spawned boss wears its site boss art id', live.live && live.ba === live.boss, JSON.stringify(live));
  check('phone 390x844: no horizontal scroll', await A.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  check('no console errors (phone world)', A.errors.length === 0, A.errors.join('|'));
  await A.ctx.close();

  const C = await open('?mode=world&test=1&seed=12345&bosses=classic');
  const cids = await C.page.evaluate(() => ({ ids: window.__mm.world.bossArtIds(), c: window.__mm.world.bossesClassic }));
  check('?bosses=classic restores the old ids on the page', cids.c === true && JSON.stringify(cids.ids) === JSON.stringify(CLASSIC), JSON.stringify(cids));
  check('no console errors (classic)', C.errors.length === 0, C.errors.join('|'));
  await C.ctx.close();

  // ---- dungeon alternate boss (data + helper; deterministic by seed parity) ----
  const ctx = await browser.newContext(); const B = await ctx.newPage();
  await B.goto(PAGE + '?mode=world&test=1&seed=1'); await B.waitForFunction(() => window.MMBiomes && window.MMArt);
  const alt = await B.evaluate(() => ({ even: MMBiomes.bossFor('crypt', 2), odd: MMBiomes.bossFor('crypt', 3), odd2: MMBiomes.bossFor('crypt', '3'), cl: MMBiomes.bossFor('crypt', 3, true), str: [MMBiomes.bossFor('crypt', 'abc').boss_art, MMBiomes.bossFor('crypt', 'abc').boss_art], other: MMBiomes.bossFor('bramble', 3).boss_art, art: MMArt.BOSS_MAP.indexOf(MMBiomes.get('crypt').alt.boss_art) >= 0 }));
  check('crypt: even seed keeps Bone Colossus, odd seed gets the Lich King, deterministic', alt.even.boss_art === 'bone_colossus' && alt.odd.boss_art === 'lich_king' && alt.odd2.boss_art === 'lich_king' && alt.str[0] === alt.str[1], JSON.stringify(alt));
  check('classic flag and biomes without alt keep the primary boss; alt art id is a known boss', alt.cl.boss_art === 'bone_colossus' && alt.other === 'forest_warden' && alt.art);
  await browser.close();
  done();
})();
