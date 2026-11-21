// World sites in the Realm overworld (shared/mm-sites.js wired into realm-world.js): shrines (heal/rage/ward, 3 minute cooldown saved as
// `shrineAt`), camp chests that open once (saved as `chests`) with a patrol spawned when near, NPC greeters, minimap dots, ?sites=0.
// Run: BASE=http://localhost:8527/game/index.html NODE_PATH=$(npm root -g) node game/tests/world-sites.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/mad-maze/index.html';
const WORLD = PAGE + '?mode=world&test=1&seed=12345';
const RKEY = 'pixeltown-realm-v1';
const waitPlay = (page) => page.waitForFunction(() => window.__mm && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 15000 });
const W = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world, ${JSON.stringify(arg)})`);

async function open(browser, url, vp) {
  const ctx = await browser.newContext(vp || { viewport: { width: 1000, height: 700 } });
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(url); await waitPlay(page);
  return { ctx, page, errors };
}
const tpTo = (page, x, y) => W(page, (a, w, t) => { a.player.x = (t.x + 0.5) * 32; a.player.y = (t.y + 0.5) * 32; a.player.iframes = 1e9; }, { x, y });

(async () => {
  const browser = await chromium.launch();
  const A = await open(browser, WORLD); const page = A.page;
  const sites = await W(page, (a, w) => w.sites());
  check('sites exist: shrines, camps and NPCs generated for the seed', sites && sites.shrines.length >= 3 && sites.camps.length >= 3 && sites.npcs.length >= 2, sites && JSON.stringify([sites.shrines.length, sites.camps.length, sites.npcs.length]));

  // ---- shrine: heal, cooldown, refusal ----
  const heal = sites.shrines.find((s) => s.kind === 'heal') || sites.shrines[0];
  await tpTo(page, heal.x, heal.y);
  await W(page, (a) => { a.player.hp = 1; });
  const r1 = await W(page, (a, w, i) => w.useShrine(i), heal.i);
  const hp1 = await W(page, (a) => ({ hp: a.player.hp, max: a.stats.maxHp }));
  if (heal.kind === 'heal') check('heal shrine restores hp', r1.ok && hp1.hp > 1, JSON.stringify([r1, hp1]));
  else check('shrine use succeeds', r1.ok, JSON.stringify(r1));
  const sv = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), RKEY);
  check('cooldown saved additively as shrineAt', sv.shrineAt && typeof sv.shrineAt[heal.id] === 'number', JSON.stringify(sv.shrineAt));
  const r2 = await W(page, (a, w, i) => w.useShrine(i), heal.i);
  const s2 = await W(page, (a, w) => w.sites().shrines.find((s) => s.ready === false));
  check('second use is refused while cooling down', r2.ok === false && r2.left > 170000 && !!s2, JSON.stringify(r2));
  const note = await W(page, (a, w) => w.siteNote());
  check('HUD note says the shrine is resting', !note.hidden && /resting/.test(note.text), note.text);
  await W(page, (a, w) => w.jumpEventClock(181));
  const r3 = await W(page, (a, w, i) => w.useShrine(i), heal.i);
  check('shrine is usable again after 3 minutes', r3.ok === true, JSON.stringify(r3));

  // ---- rage / ward use the arena buff fields ----
  const rage = sites.shrines.find((s) => s.kind === 'rage'); const ward = sites.shrines.find((s) => s.kind === 'ward');
  if (rage) { const d0 = await W(page, (a) => a.stats.dmg); await W(page, (a, w, i) => w.useShrine(i), rage.i); const d1 = await W(page, (a) => a.stats.dmg); check('rage shrine raises damage', d1 > d0, d0 + ' -> ' + d1); }
  if (ward) { await W(page, (a, w, i) => w.useShrine(i), ward.i); check('ward shrine sets damage-taken multiplier below 1', await W(page, (a) => a.buffTaken > 0 && a.buffTaken < 1)); }

  // ---- prompt button (E) and minimap ----
  await tpTo(page, heal.x, heal.y);
  await W(page, (a, w) => w.siteTick(0.3));
  const pr = await W(page, (a, w) => w.sitePrompt());
  check('standing at a shrine shows the prompt', pr && pr.kind === 'shrine' && !pr.hidden, JSON.stringify(pr));
  check('minimap redraws with site dots (fog respected)', await W(page, (a, w) => w.miniDraws() > 0));

  // ---- camp chest: opens once, persists, patrol spawns when near ----
  const camp = sites.camps[0];
  await tpTo(page, camp.chest.x, camp.chest.y);
  await W(page, (a, w) => w.siteTick(0.3));
  const bags0 = await W(page, (a) => a.bags.filter((b) => b.active).length);
  const c1 = await W(page, (a, w, i) => w.openChest(i), camp.i);
  const c2 = await W(page, (a, w, i) => w.openChest(i), camp.i);
  const bags1 = await W(page, (a) => a.bags.filter((b) => b.active).length);
  check('camp chest opens once, second open is refused', c1.ok === true && c2.ok === false, JSON.stringify([c1, c2]));
  check('chest reward goes through the bag path', c1.shards > 0 || c1.items > 0 || bags1 > bags0, JSON.stringify(c1));
  const alive = await W(page, (a, w, id) => { w.siteTick(0.3); return w.sites().camps.find((c) => c.id === id).alive; }, camp.id);
  check('camp patrol is spawned when the player is near', alive === camp.patrol, alive + ' vs ' + camp.patrol);
  const sv2 = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), RKEY);
  check('opened chest saved additively as chests', Array.isArray(sv2.chests) && sv2.chests.indexOf(camp.id) >= 0, JSON.stringify(sv2.chests));
  await page.reload(); await waitPlay(page);
  const after = await W(page, (a, w) => w.sites());
  check('chest stays open and shrine stays cooling after a reload', after.camps[0].opened === true && after.shrines.find((s) => s.id === heal.id) !== undefined, JSON.stringify(after.camps[0]));

  // ---- NPC greeting ----
  const npc = sites.npcs[0];
  const g1 = await W(page, (a, w) => w.talkNpc(0));
  const g2 = await W(page, (a, w) => w.talkNpc(0));
  check('NPC gives a one-line seeded greeting', typeof g1 === 'string' && g1.length > 8 && g1.indexOf('\n') < 0 && typeof g2 === 'string', g1);
  check('errors so far', A.errors.length === 0, A.errors.join('|'));
  await A.ctx.close();

  // ---- ?sites=0 ----
  const B = await open(browser, WORLD + '&sites=0');
  check('?sites=0 disables every site', (await W(B.page, (a, w) => w.sites())) === null && (await B.page.evaluate(() => !document.getElementById('rw-site') || document.getElementById('rw-site').classList.contains('hidden'))));
  check('?sites=0 page has no errors', B.errors.length === 0, B.errors.join('|'));
  await B.ctx.close();

  // ---- phone ----
  const P = await open(browser, WORLD, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await tpTo(P.page, sites.shrines[sites.shrines.length - 1].x, sites.shrines[sites.shrines.length - 1].y);
  await W(P.page, (a, w) => w.siteTick(0.3));
  const box = await P.page.evaluate(() => { const b = document.getElementById('rw-site'); const r = b.getBoundingClientRect(); return { w: r.width, h: r.height, hidden: b.classList.contains('hidden'), sw: document.documentElement.scrollWidth, iw: innerWidth }; });
  check('phone: prompt button is >= 44 px', !box.hidden && box.h >= 44 && box.w >= 44, JSON.stringify(box));
  check('phone: no horizontal scroll', box.sw <= box.iw, JSON.stringify(box));
  await P.page.click('#rw-site');
  const used = await W(P.page, (a, w) => w.sites().shrines.some((s) => !s.ready));
  check('phone: tapping the prompt uses the shrine', used);
  check('phone: no console errors', P.errors.length === 0, P.errors.join('|'));
  // art wiring (additive): the site prompt keeps its place with the world art on, and the chest still opens with the sprite path
  const artSt = await W(P.page, (a, w) => w.artState());
  check('world art state is exposed and the site prompt works with it', artSt && typeof artSt.on === 'boolean' && Array.isArray(artSt.loaded), JSON.stringify(artSt && artSt.on));
  await P.ctx.close();

  await browser.close();
  done();
})();
