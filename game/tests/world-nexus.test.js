// N1/N2/N3 live: the Nexus plaza (overlay screen reached through a portal_nexus beside the world spawn), its NPCs, the vault -> Lantern stash route,
// and the daily quest board (progress from kills / boss kills / portals, claim, additive save under `quests`).
// Run: BASE=http://localhost:8592/game/index.html NODE_PATH=$(npm root -g) node game/tests/world-nexus.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=12345&qdate=2030-05-17';
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
  await browser.close();
  done();
})();
