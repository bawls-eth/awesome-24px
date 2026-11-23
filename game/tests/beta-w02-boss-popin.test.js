// W-02 (b12-02): a world boss is preloaded when the player comes within 16 tiles of its site (it wakes at 9), so the first frame after
// "awakens" already draws the sprite (no pink code-fallback face). No extra boss requests while no site is near; with the art blocked the
// procedural boss still draws and the fight runs.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-w02-boss-popin.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const hero = { id: 'h1', name: 'Aya', cls: 'ranger', level: 5, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] };
const prof = { v: 1, heroes: [hero], stash: new Array(16).fill(null), fame: 0, mode: 'classic', hall: [], migratedFrom: null };

// G-07: an altar wakes only for a hero standing in its zone (or deeper), so the wake spot is a free tile 2-4 tiles from the altar whose zone is
// >= the altar's zone (first match in a fixed ring order; falls back to 3 tiles south, the old spot).
const PLACE_IN_ZONE = (s) => { const a = window.__mm.arena, w = window.__mm.world, Z = window.MMZones; let best = null;
  for (let r = 2; r <= 4 && !best; r++) for (let dy = -r; dy <= r && !best; dy++) for (let dx = -r; dx <= r && !best; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const tx = s.x + dx, ty = s.y + dy;
    const z = Z.zoneInfoAt(w.world, tx + 0.5, ty + 0.5).zone; if (z >= s.zone && z <= 3 && !(w.solidAt && w.solidAt((tx + 0.5) * 32, (ty + 0.5) * 32))) best = { tx, ty };
  }
  if (!best) best = { tx: s.x, ty: s.y + 3 };
  a.player.x = (best.tx + 0.5) * 32; a.player.y = (best.ty + 0.5) * 32; a.player.iframes = 1e9; return best; };

async function open(browser, seed, block) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await blockDb(ctx);
  const reqs = [];
  await ctx.route(/\/bosses\/[a-z_]+\/[^/]+\.png/, (r) => { const m = /\/bosses\/([a-z_]+)\//.exec(r.request().url()); reqs.push(m[1]); if (block && m[1] !== 'void_oracle') return r.abort(); return r.continue(); });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((p) => { localStorage.setItem('pixeltown-mm-v1', JSON.stringify(p)); localStorage.setItem('pixeltown-mm-active-v1', JSON.stringify({ v: 1, heroId: 'h1' })); }, prof);
  await page.goto(ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&heropick=0&tutorial=0&seed=' + seed);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena && window.__mm.arena._bossArt && window.__bossArt, null, { timeout: 20000 });
  // first-frame recorder: the result of the first _drawBossArt call for each boss entity
  await page.evaluate(() => {
    const a = window.__mm.arena; const rec = window.__w02 = { first: [] }; const orig = a._drawBossArt.bind(a);
    a._drawBossArt = function (g, e) { const ok = orig(g, e); if (!e.__w02) { e.__w02 = 1; rec.first.push({ ok, name: e._bn }); } return ok; };
  });
  return { ctx, page, errors, reqs };
}

(async () => {
  const browser = await chromium.launch();
  const seeds = [11, 4242, 90210];
  for (const seed of seeds) {
    const O = await open(browser, seed, false); const pg = O.page;
    const info = await pg.evaluate(() => { const a = window.__mm.arena, s = window.__mm.world.bossSites(); const p = a.player; return { p: { x: p.x, y: p.y }, sites: s.map((q) => ({ boss: q.boss, x: q.x, y: q.y, zone: q.zone, d: Math.hypot(p.x - (q.x + 0.5) * 32, p.y - (q.y + 0.5) * 32) / 32 })) }; });
    await pg.waitForTimeout(seed === seeds[0] ? 30000 : 4000); // standing on the shore
    const near = info.sites.filter((s) => s.d <= 16).map((s) => s.boss);
    const extra = O.reqs.filter((id) => id !== 'void_oracle' && near.indexOf(id) < 0);
    check('seed ' + seed + ': no boss requests beyond the tier-0 strip while no site is within 16 tiles (shore idle)', extra.length === 0, JSON.stringify({ extra, near }));
    const site = info.sites[0];
    // 13 tiles east of the altar: inside the preload radius, outside the wake radius (9)
    await pg.evaluate((s) => { const a = window.__mm.arena; a.player.x = (s.x + 13.5) * 32; a.player.y = (s.y + 0.5) * 32; a.player.iframes = 1e9; window.__bossArt.scan(); }, site);
    const pre = await pg.waitForFunction((id) => window.__mm.arena._bossArt.has(id) && window.__mm.arena._bossArt.anim(id, 'idle', 'down'), site.boss, { timeout: 15000 }).then(() => true).catch(() => false);
    check('seed ' + seed + ': ' + site.boss + ' strips are loaded before it wakes (13 tiles away, not live yet)', pre && !(await pg.evaluate(() => window.__mm.world.bossSites()[0].live)));
    await pg.evaluate(`(${PLACE_IN_ZONE.toString()})(${JSON.stringify(site)})`);
    const live = await pg.waitForFunction(() => window.__mm.world.bossSites()[0].live && window.__w02.first.length > 0, null, { timeout: 10000 }).then(() => true).catch(() => false);
    const first = await pg.evaluate(() => window.__w02.first);
    check('seed ' + seed + ': on "awakens" the first boss frame is the sprite (fallback 0)', live && first.length >= 1 && first[0].ok === true && first[0].name === site.boss, JSON.stringify(first));
    check('seed ' + seed + ': no page errors', O.errors.length === 0, O.errors.join(' | '));
    await O.ctx.close();
  }
  // Blocked art: the procedural boss draws and the fight keeps running.
  const B = await open(browser, seeds[0], true); const bp = B.page;
  const s0 = await bp.evaluate(() => window.__mm.world.bossSites()[0]);
  await bp.evaluate(`(${PLACE_IN_ZONE.toString()})(${JSON.stringify(s0)})`);
  const bl = await bp.waitForFunction(() => window.__mm.world.bossSites()[0].live && window.__w02.first.length > 0, null, { timeout: 10000 }).then(() => true).catch(() => false);
  const c0 = await bp.evaluate(() => window.__mm.arena.clock); await bp.waitForTimeout(1500);
  const after = await bp.evaluate(() => { const a = window.__mm.arena, e = window.__mm.world.bossEntity(0); return { clock: a.clock, state: a.state, active: !!(e && e.active), hp: e && e.hp, first: window.__w02.first }; });
  check('art blocked: the boss wakes and draws through the fallback (first frame not art)', bl && after.first[0].ok === false, JSON.stringify(after.first));
  check('art blocked: the fight runs (clock advances, boss active, state play, no page error)', after.clock > c0 + 0.5 && after.active && after.state === 'play' && B.errors.length === 0, JSON.stringify([after, B.errors]));
  await B.ctx.close();
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
