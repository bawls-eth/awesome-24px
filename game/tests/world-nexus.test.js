// N1/N2/N3 live: the Nexus plaza (overlay screen reached through a portal_nexus beside the world spawn), its NPCs, the vault -> Lantern stash route,
// and the daily quest board (progress from kills / boss kills / portals, claim, additive save under `quests`).
// Run: BASE=http://localhost:8592/game/index.html NODE_PATH=$(npm root -g) node game/tests/world-nexus.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=12345&qdate=2030-05-01';
const SAVE = { realm: { level: 4, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 } } };
const RKEY = 'pixeltown-realm-v1';

async function open(browser, url, viewport, pre) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1000, height: 700 } });
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([v, p]) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', v); localStorage.setItem('mm-aim-assist', '0'); if (p) localStorage.setItem('pixeltown-realm-v1', p); }, [JSON.stringify(SAVE), pre || null]);
  errors.length = 0;
  await page.goto(url);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 15000 });
  return { ctx, page, errors };
}
const E = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world, ${JSON.stringify(arg)})`);
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const tile = (page) => E(page, (a) => [Math.floor(a.player.x / 32), Math.floor(a.player.y / 32)]);
const godMode = (page) => E(page, (a) => { a.player.iframes = 1e9; a._hitPlayer = () => {}; });
const goNear = (page) => E(page, (a, w) => { const s = w.nexus.site; a.player.x = s.x - 20; a.player.y = s.y; });

(async () => {
  const browser = await chromium.launch();
  const A = await open(browser, WORLD); const page = A.page; await godMode(page);

  // ---- reachable from the world spawn ----
  const site = await E(page, (a, w) => ({ on: w.nexus.on, site: w.nexus.site, sp: w.world.spawnPoint }));
  check('a Nexus portal stands within 8 tiles of the world spawn', site.on && site.site && Math.hypot(site.site.tx - site.sp.x, site.site.ty - site.sp.y) <= 8, JSON.stringify(site));
  await goNear(page); await frames(page, 20);
  const vis = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e || e.classList.contains('hidden')) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== 'none'; }, sel);
  check('standing beside it shows a "Visit the Nexus" prompt (button >= 44 px)', await vis('#rw-nexus-go') && (await page.evaluate(() => { const r = document.getElementById('rw-nexus-go').getBoundingClientRect(); return r.height >= 44 && r.width >= 44; })));
  const before = await tile(page);
  await page.click('#rw-nexus-go');
  await frames(page, 5);
  check('clicking it opens the Nexus screen and freezes the arena', await vis('#rw-nexus') && await E(page, (a, w) => a.paused && w.nexus.isOpen()));
  const npcs = await page.evaluate(() => Array.from(document.querySelectorAll('#rw-nexus [data-npc]')).map((b) => b.dataset.npc));
  const portals = await page.evaluate(() => Array.from(document.querySelectorAll('#rw-nexus [data-portal]')).map((b) => b.dataset.portal));
  check('the plaza lists the 7 NPCs and the 6 portals from MMNexus', npcs.length === 7 && portals.length === 6 && portals.includes('vault') && portals.includes('realm'), JSON.stringify({ npcs, portals }));
  const px = await page.evaluate(() => { const c = document.querySelector('#rw-nexus canvas'); const d = c.getContext('2d').getImageData(c.width / 2, c.height / 2 + 120, 1, 1).data; return c.width === 1280 && c.height === 960 && (d[0] + d[1] + d[2]) > 0; });
  check('the plaza canvas is drawn (1280x960, not blank)', px);
  // NPC talk lines
  const lines = await E(page, (a, w) => ['guide', 'wanderer', 'oracle', 'vendor'].map((id) => w.nexus.talk(id)));
  check('NPCs talk (guide, wanderer, oracle, vendor each say something, textContent only)', lines.every((l) => l && l.text && l.text.length > 10), JSON.stringify(lines));
  const oracle = await page.evaluate(() => MMQuests.oracle(window.__mm.world.nexus.today()).text);
  check('the oracle (ghost guide) speaks the deterministic MMQuests hint for the day', (await E(page, (a, w) => w.nexus.talk('oracle').text)) === oracle);
  const heal = await E(page, (a, w) => { a.player.hp = 5; w.nexus.talk('healer'); return a.player.hp === a.stats.maxHp; });
  check('the healer mends the player to full HP', heal);
  // Back returns to the same tile in the Realm
  await page.click('#rw-nx-back'); await frames(page, 5);
  const after = await tile(page);
  check('Back returns to the Realm on the same tile and unfreezes the arena', !(await vis('#rw-nexus')) && JSON.stringify(after) === JSON.stringify(before) && await E(page, (a) => !a.paused), JSON.stringify({ before, after }));
  // Escape also leaves
  await goNear(page); await frames(page, 15); await page.keyboard.press('Enter'); await frames(page, 3);
  const openedByKey = await E(page, (a, w) => w.nexus.isOpen());
  await page.keyboard.press('Escape'); await frames(page, 3);
  check('Enter opens it and Escape leaves it (keyboard reachable)', openedByKey && await E(page, (a, w) => !w.nexus.isOpen() && !a.paused));
  // phone layout of the open Nexus
  await page.setViewportSize({ width: 390, height: 844 }); await goNear(page); await frames(page, 15); await page.click('#rw-nexus-go'); await frames(page, 5);
  const ph = await page.evaluate(() => {
    const root = document.getElementById('rw-nexus'); const btns = Array.from(root.querySelectorAll('button:not(.nx-spot)'));
    const small = btns.filter((b) => { const r = b.getBoundingClientRect(); return r.height < 43.5 || r.width < 43.5; }).map((b) => b.textContent);
    return { sw: document.documentElement.scrollWidth, iw: innerWidth, rootSw: root.scrollWidth, rootCw: root.clientWidth, n: btns.length, small };
  });
  check('phone 390x844: the Nexus has no horizontal scroll', ph.sw <= ph.iw && ph.rootSw <= ph.rootCw, JSON.stringify(ph));
  check('phone: every Nexus button is at least 44 px', ph.n >= 14 && ph.small.length === 0, JSON.stringify(ph));
  await page.click('#rw-nx-back'); await page.setViewportSize({ width: 1000, height: 700 });

  // ---- vault -> Lantern stash ----
  await goNear(page); await frames(page, 15); await page.click('#rw-nexus-go');
  await page.click('#rw-nexus [data-portal="vault"]');
  await page.waitForURL(/lantern\.html/, { timeout: 8000 });
  check('the vault portal routes to the Lantern stash page (lantern.html)', /games\/mad-maze\/lantern\.html/.test(page.url()), page.url());
  check('no console errors in the Nexus flow', A.errors.length === 0, A.errors.join(' | '));
  await A.ctx.close();

  // ---- a biome portal in the Nexus enters a dungeon that returns to the tile the player left ----
  const B = await open(browser, WORLD + '&x=1'); await godMode(B.page);
  await goNear(B.page); await frames(B.page, 15); await B.page.click('#rw-nexus-go');
  const t0 = await tile(B.page);
  await B.page.evaluate(() => { window.__mm.world.nexus.portal('crypt'); });
  await B.page.waitForURL(/mode=dungeon/, { timeout: 8000 }).catch(() => {});
  const u = decodeURIComponent(B.page.url());
  check('a biome portal enters that dungeon and returns to the same Realm tile', /biome=crypt/.test(u) && u.indexOf('at=' + t0[0] + ',' + t0[1]) > 0, u);
  check('no console errors (biome portal)', B.errors.length === 0, B.errors.join(' | '));
  await B.ctx.close();

  // ---- daily quests ----
  const C = await open(browser, WORLD); const cp = C.page; await godMode(cp);
  const day = await E(cp, (a, w) => ({ date: w.quests.date(), list: w.quests.list().map((q) => ({ id: q.id, need: q.need, zone: q.zone, shards: q.reward.shards })), sum: w.quests.summary() }));
  check('3 quests for the UTC day, all at 0 progress', day.date === '2030-05-01' && day.list.length === 3 && day.sum.every((q) => q.p === 0 && !q.done), JSON.stringify(day));
  // real kills of zone 0 creatures count toward the kill quest
  const kk = await E(cp, async (a, w) => {
    while (w.liveCount() < 3) await new Promise((r) => setTimeout(r, 100));
    let n = 0;
    for (const le of w.liveEnemies()) { if (le.zone !== 0) continue; const e = w.enemyById(le.id); if (!e || !e.active) continue; e.x = a.player.x + 500; e.y = a.player.y; a._hitEnemy(e, 99999); n++; if (n >= 2) break; }
    return { n, p: w.quests.summary()[0].p };
  });
  check('killing zone-0 creatures advances the kill quest by the number of kills', kk.n > 0 && kk.p === kk.n, JSON.stringify(kk));
  // finish everything through the world hooks (kill batch, boss, portal)
  await E(cp, (a, w) => { w.quests.event({ type: 'kill', zone: 0, n: 100 }); w.quests.event({ type: 'boss' }); w.quests.event({ type: 'portal' }); });
  check('boss kills and portals complete their quests', await E(cp, (a, w) => w.quests.summary().every((q) => q.done && !q.claimed)));
  await goNear(cp); await frames(cp, 15); await cp.click('#rw-nexus-go');
  await cp.click('#rw-nexus [data-npc="quest"]');
  const board = await cp.evaluate(() => { const rows = Array.from(document.querySelectorAll('#rw-nx-board .nx-q')); return { n: rows.length, claim: Array.from(document.querySelectorAll('#rw-nx-board [data-claim]')).map((b) => { const r = b.getBoundingClientRect(); return { id: b.dataset.claim, off: b.disabled, h: r.height, w: r.width }; }) }; });
  check('the Quest Giver opens the board with 3 quests and 44 px Claim buttons', board.n === 3 && board.claim.length === 3 && board.claim.every((c) => !c.off && c.h >= 44 && c.w >= 44), JSON.stringify(board));
  const sh0 = await E(cp, (a) => a.save.shards);
  await cp.click('#rw-nx-board [data-claim="kill_boss"]');
  const sh1 = await E(cp, (a) => a.save.shards); const boss = day.list.find((q) => q.id === 'kill_boss');
  check('claiming pays the quest reward in shards through the arena save', sh1 - sh0 === boss.shards, JSON.stringify({ sh0, sh1, boss }));
  await E(cp, (a, w) => w.quests.claim('kill_boss'));
  check('a claim pays only once', (await E(cp, (a) => a.save.shards)) === sh1 && (await cp.locator('#rw-nx-board [data-claim="kill_boss"]').count()) === 0);
  await E(cp, (a, w) => w.quests.flush());
  const saved = await cp.evaluate((k) => JSON.parse(localStorage.getItem(k)), RKEY);
  check('quest state is saved additively under `quests` in pixeltown-realm-v1 (other keys kept)', saved && saved.quests && saved.quests.date === '2030-05-01' && saved.quests.q.kill_boss.claimed === true && saved.v === 1 && saved.seed === '12345', JSON.stringify(saved && saved.quests));
  await cp.goto(WORLD); await cp.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.state === 'play');
  const re = await E(cp, (a, w) => w.quests.summary().map((q) => [q.id, q.done, q.claimed]));
  check('progress and the claimed flag persist across a reload', JSON.stringify(re) === JSON.stringify([['kill_zone', true, false], ['kill_boss', true, true], ['open_portal', true, false]]), JSON.stringify(re));
  check('no console errors in the quest flow', C.errors.length === 0, C.errors.join(' | '));
  await C.ctx.close();
  // a corrupt / foreign-day quest save is cleaned to fresh, never trusted
  const bad = JSON.stringify({ v: 1, seed: '12345', quests: { date: '2030-05-01', q: { kill_zone: { p: 'lots', done: true, claimed: true }, kill_boss: { p: -4, done: true, claimed: true }, evil: { p: 9 } }, junk: 1 } });
  const D = await open(browser, WORLD, null, bad);
  const cleaned = await E(D.page, (a, w) => w.quests.state());
  check('a bad quest save is cleaned (counters clamped, flags re-derived, unknown keys dropped)', cleaned.date === '2030-05-01' && Object.keys(cleaned.q).length === 3 && cleaned.q.kill_zone.p === 0 && !cleaned.q.kill_zone.claimed && !cleaned.q.kill_boss.claimed && !('junk' in cleaned) && !cleaned.q.evil, JSON.stringify(cleaned));
  await D.ctx.close();
  const stale = JSON.stringify({ v: 1, seed: '12345', quests: { date: '2029-01-01', q: { kill_boss: { p: 1, done: true, claimed: true } } } });
  const F = await open(browser, WORLD, null, stale);
  check('a quest save from another day starts fresh', await E(F.page, (a, w) => w.quests.summary().every((q) => q.p === 0 && !q.claimed)));
  check('no console errors (cleaned saves)', D.errors.length === 0 && F.errors.length === 0, D.errors.concat(F.errors).join(' | '));
  await F.ctx.close();
  await browser.close();
  done();
})();
