// Offline playthrough of the unified game: Town Gate -> Realm overworld -> Warren portal -> back on the same portal tile, plus the
// Classic arena, restart, and a phone viewport. Firebase is BLOCKED for every request here (nothing touches the live database).
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/realm-playthrough.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const ORIGIN = BASE.replace(/\/game\/index\.html.*$/, '');
const BLOCK = /firebaseio\.com|firebasedatabase\.app|identitytoolkit|securetoken/i; // the SDK scripts may load; the DATABASE host never answers
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const A = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world, ${JSON.stringify(arg)})`);
const vis = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e || e.classList.contains('hidden')) return false; const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden' && e.getBoundingClientRect().width > 0; }, sel);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const errors = []; const firebaseHits = [];
  await ctx.route('**/*', (route) => { const u = route.request().url(); if (BLOCK.test(u)) { firebaseHits.push(u); return route.abort(); } return route.continue(); });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED|net::/.test(m.text())) errors.push('console: ' + m.text()); });
  // expose the town scene (same trick as helpers.js)
  await page.route('**/main.js*', async (route) => { const resp = await route.fetch(); const body = (await resp.text()).replace('const game = new Phaser.Game(config);', 'const game = window.__g = new Phaser.Game(config);'); route.fulfill({ response: resp, body }); });
  const scene = (fn, arg) => page.evaluate(`(${fn.toString()})(window.__g.scene.getScene('Town'), ${JSON.stringify(arg)})`);

  // ---- Town: join offline ----
  await page.goto(BASE);
  await page.fill('#name-input', 'Offline');
  await page.click('.species-tab'); await page.waitForTimeout(150);
  await page.click('.avatar-choice');
  await page.click('#join-btn');
  await page.waitForSelector('#player-list-panel', { timeout: 20000 });
  await page.waitForTimeout(1200);
  await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 30000 }); // slower on a remote origin
  const gate = await scene((s) => { s.localBody.setPosition(REALM_GATE_POS.x, REALM_GATE_POS.y + 30); s.interact(); return { open: s.realmMenuOpen, shown: !document.getElementById('realm-menu').classList.contains('hidden'), world: document.getElementById('realm-menu-madmaze').textContent, classic: document.getElementById('realm-menu-solo').textContent, href: document.getElementById('realm-menu-madmaze').dataset.href }; });
  check('Town Gate menu opens offline with "Enter the Realm" as the main action and "Classic arena" kept', gate.open && gate.shown && /Enter the Realm/.test(gate.world) && /Classic arena/.test(gate.classic), JSON.stringify(gate));
  check('Enter the Realm points at the overworld page', /games\/mad-maze\/index\.html\?mode=world$/.test(gate.href), gate.href);

  // ---- Classic arena still works and can be left ----
  await page.click('#realm-menu-solo');
  await page.waitForTimeout(600);
  const classic = await scene((s) => ({ inRealm: s.inRealm, overlay: !document.getElementById('realm-overlay').classList.contains('hidden'), mode: s.realm && s.realm.mode, world: s.realm && s.realm.world }));
  check('Classic arena opens in town (wave mode, no world)', classic.inRealm && classic.overlay && classic.mode === 'waves' && !classic.world, JSON.stringify(classic));
  await scene((s) => { s.realm.leave(); });
  await page.waitForTimeout(500);
  check('leaving the Classic arena returns to town', await scene((s) => !s.inRealm));

  // ---- Enter the Realm from the gate (confirm accepted) ----
  await scene((s) => { s.localBody.setPosition(REALM_GATE_POS.x, REALM_GATE_POS.y + 30); s.interact(); });
  const townUrl = page.url();
  await page.click('#realm-menu-madmaze');
  await page.waitForSelector('#realm-embed iframe', { timeout: 10000 });
  check('Enter the Realm opens the overworld inside the game page (no navigation)', page.url() === townUrl && /mode=world/.test(await page.getAttribute('#realm-embed iframe', 'src')), page.url());
  const fr = page.frameLocator('#realm-embed iframe');
  await fr.locator('#rw-minimap').waitFor({ state: 'visible', timeout: 15000 });
  check('the embedded overworld shows the world HUD (minimap) and a canvas', await fr.locator('canvas').count() > 0);
  await page.evaluate(() => window.postMessage({ pixeltown: 'close-realm' }, location.origin));
  await page.waitForSelector('#realm-embed', { state: 'detached', timeout: 5000 });
  check('closing the Realm returns to the town on the same page', page.url() === townUrl && await scene((s) => !s.inRealm && !s.realmEmbed));

  // ---- World with hooks (same storage, add test=1) ----
  await page.goto(ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=4242');
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 15000 });
  const spawn = await A(page, (a, w) => ({ x: Math.floor(a.player.x / 32), y: Math.floor(a.player.y / 32), zone: w.zoneName ? w.zoneName() : null, mode: a.mode }));
  check('the world starts in world mode on the island', spawn.mode === 'world', JSON.stringify(spawn));
  const portal = await A(page, (a, w) => w.portals()[0]);
  await A(page, (a, w, q) => { a.player.iframes = 1e9; a.player.x = q.x + 10; a.player.y = q.y; }, portal);
  await frames(page, 4);
  check('standing on a portal shows the enter prompt', await vis(page, '#rw-portal'));
  await page.click('#rw-portal');
  await page.waitForURL(/mode=dungeon/, { timeout: 10000 });
  await page.waitForFunction(() => window.__mm && window.__mm.dungeon && window.__mm.arena.active, null, { timeout: 15000 });
  check('the portal starts a dungeon run', await page.evaluate(() => /mode=dungeon/.test(location.href) && !!window.__mm.dungeon));
  await page.evaluate(() => window.__mm.dungeon.finish());
  await page.waitForSelector('#mm-sum-home');
  check('the dungeon result offers "Back to the world" as the primary exit', (await page.textContent('#mm-sum-home')) === 'Back to the world');
  await page.click('#mm-sum-home');
  await page.waitForURL(/mode=world/, { timeout: 10000 });
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 15000 });
  await frames(page, 4);
  const back = await A(page, (a, w) => ({ x: Math.floor(a.player.x / 32), y: Math.floor(a.player.y / 32), seed: w.seed }));
  check('back in the same world on the same portal tile', back.x === portal.tx && back.y === portal.ty && back.seed === '4242', JSON.stringify([back, portal]));
  // PLAYTEST-REVIEW-2 #4 (added check): the return carries the 3 s spawn shield and, with no event in view, no hop off the portal tile
  const shield = await A(page, (a, w) => ({ iframes: a.player.iframes, last: w.safeReturn && w.safeReturn.last() }));
  check('the return from the dungeon carries the 3 s spawn shield and stays on the portal tile (no event in view)', shield.last && shield.last.iframes >= 3 && shield.last.moved === false && shield.last.shield === 3 && shield.last.to.x === portal.tx && shield.last.to.y === portal.ty, JSON.stringify(shield));

  // ---- Restart from the menu respawns at the island spawn, keeping items and shards ----
  const before = await A(page, (a) => ({ shards: a.save.shards, items: a.save.items.length }));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check('Esc opens the Realm menu in the overworld', await vis(page, '#realm-menu-panel, #realm-menu, .realm-menu-card') || await page.evaluate(() => !!document.querySelector('[id*=menu]:not(.hidden)')));
  await A(page, (a) => a.restart && a.restart());
  await frames(page, 6);
  const after = await A(page, (a, w) => ({ shards: a.save.shards, items: a.save.items.length, at: [Math.floor(a.player.x / 32), Math.floor(a.player.y / 32)], spawn: [w.world.spawnPoint.x, w.world.spawnPoint.y] }));
  check('restart respawns at the island spawn and keeps shards and items', after.shards === before.shards && after.items === before.items && Math.abs(after.at[0] - after.spawn[0]) <= 2 && Math.abs(after.at[1] - after.spawn[1]) <= 2, JSON.stringify([before, after]));

  // ---- Phone viewport ----
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await phone.route('**/*', (route) => (BLOCK.test(route.request().url()) ? route.abort() : route.continue()));
  const pp = await phone.newPage();
  pp.on('pageerror', (e) => errors.push('phone pageerror: ' + e.message));
  await pp.goto(ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=4242');
  await pp.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active, null, { timeout: 15000 });
  await pp.waitForTimeout(800);
  const ph = await pp.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, small: [...document.querySelectorAll('#realm-hud button, #realm-abilities button, #rw-portal')].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.height < 43.5 || r.width < 43.5); }).map((b) => b.id || b.className) }));
  check('phone 390x844: no horizontal scroll and every HUD/ability button is >= 44 px', ph.sw <= ph.iw && ph.small.length === 0, JSON.stringify(ph));
  check('no Firebase HTTP request left the page (the ADMIN test bot joins presence-only over the SDK socket), and no console errors', errors.length === 0 && firebaseHits.every((u) => BLOCK.test(u)), errors.slice(0, 3).join(' | ') + ' hits=' + firebaseHits.length);
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
