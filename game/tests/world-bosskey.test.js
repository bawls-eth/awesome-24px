// BK2: boss-key portals in the Realm World. World bosses and won world events drop a `key_boss` on the ground (walk over it), saved additively
// as `bossKeys` in pixeltown-realm-v1; beside the Nexus portal or a boss altar a key opens a `portal_boss` for 120 s (MMPortals N3 rules, saved
// as `bossPortal`, cleaned by MMPortals.clean); entering it opens a dungeon with `&lair=1` through the usual portal URL flow and returns to the
// portal tile. ?keys=0 turns it all off. Also PLAYTEST-REVIEW-2 #14: no "(Enter)" hints on a touch phone, the phone banner sits clear of the zone box.
// Offline: the DB is blocked (blockDb), nothing is ever written to it.
// Run: BASE=http://localhost:8662/game/index.html NODE_PATH=$(npm root -g) node game/tests/world-bosskey.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=12345';
const SAVE = { realm: { level: 6, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 } } };
const KEY = 'pixeltown-realm-v1';

async function open(browser, url, o) {
  o = o || {};
  const ctx = await browser.newContext(o.phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: 1000, height: 700 } });
  const db = await blockDb(ctx);
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((a) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', a.v); localStorage.setItem('mm-aim-assist', '0'); if (a.realm) localStorage.setItem(a.key, a.realm); }, { v: JSON.stringify(SAVE), realm: o.realm || null, key: KEY });
  await page.goto(url);
  await waitWorld(page);
  await A(page, (a) => { a.player.iframes = 1e9; a._hitPlayer = () => {}; });
  return { ctx, page, errors, db };
}
const waitWorld = (page) => page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 15000 });
const A = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world, ${JSON.stringify(arg)})`);
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const raw = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
// stand next to the Nexus portal (inside 6 tiles, outside its own 48 px prompt)
const nearNexus = (page) => A(page, (a, w) => { const s = w.nexus.site; const f = w.nearestFree(s.tx - 3, s.ty + 1, 4); a.player.x = (f.x + 0.5) * 32; a.player.y = (f.y + 0.5) * 32; a.enemies.forEach((e) => { e.active = false; }); return f; });

(async () => {
  const browser = await chromium.launch();
  const D = await open(browser, WORLD); const page = D.page;
  check('boss keys are on by default and a fresh save holds none', await A(page, (a, w) => w.bossKeys.on && w.bossKeys.count() === 0 && w.save().bossKeys === undefined));

  // ---- a world boss drops a key; walking over it collects it (saved additively) ----
  const bs = await A(page, (a, w) => w.bossSites()[0]);
  await A(page, (a, w, b) => { const f = w.nearestFree(b.x + 5, b.y, 6); a.player.x = (f.x + 0.5) * 32; a.player.y = (f.y + 0.5) * 32; a.enemies.forEach((e) => { e.active = false; }); }, bs);
  await page.waitForFunction(() => window.__mm.world.bossSites()[0].live, null, { timeout: 6000 }).catch(() => {});
  const kill = await A(page, (a, w) => { const e = w.bossEntity(0); if (!e) return null; e.invuln = 0; e.x = a.player.x + 400; e.y = a.player.y; a._hitEnemy(e, 1e7); return { dead: !e.active, ground: w.bossKeys.ground() }; });
  check('killing a world boss drops a boss key on the ground', kill && kill.dead && kill.ground.length === 1 && kill.ground[0].src === 'boss0', JSON.stringify(kill));
  await A(page, (a, w) => { const k = w.bossKeys.ground()[0]; a.player.x = k.x; a.player.y = k.y; });
  await frames(page, 4);
  const got = await A(page, (a, w) => ({ n: w.bossKeys.count(), ground: w.bossKeys.ground().length, got: w.bossKeys.got(), note: w.siteNote().text }));
  const s1 = await raw(page);
  check('walking over the key collects it (count 1, ground empty, a note explains it)', got.n === 1 && got.ground === 0 && got.got === 1 && /Boss key/.test(got.note), JSON.stringify(got));
  check('the key is saved additively as bossKeys in pixeltown-realm-v1 (other keys kept)', s1.bossKeys === 1 && s1.v === 1 && s1.seed === '12345' && s1.stats && s1.stats.bossKills >= 1, JSON.stringify(s1));

  // ---- a won world event drops a key too ----
  const ev = await A(page, (a, w) => {
    for (let s = 0; s < 600; s++) for (const e of MMZones.eventsFor(w.world, s * MMZones.EVENT_PERIOD)) { const p = MMZones.eventPlan(w.world, e); if (p.kind === 'swarm') return { id: e.id, startsAt: e.startsAt, site: p.site }; }
    return null;
  });
  await A(page, (a, w, e) => { w.setEventClock(e.startsAt + 1); const f = w.nearestFree(e.site.x, e.site.y, 8); a.player.x = (f.x + 0.5) * 32; a.player.y = (f.y + 0.5) * 32; }, ev);
  await page.waitForFunction((id) => window.__mm.world.eventEntities(id).length > 0, ev.id, { timeout: 6000 }).catch(() => {});
  const won = await A(page, (a, w, id) => { for (const e of w.eventEntities(id)) { let g = 0; while (e.active && g++ < 400) { e.invuln = 0; a._hitEnemy(e, Math.max(1, e.maxHp / 5)); } } const r = w.lastEventReward(); return { tier: r && r.tier, ground: w.bossKeys.ground() }; }, ev.id);
  check('a won world event drops a boss key', won.tier > 0 && won.ground.some((k) => k.src === ev.id), JSON.stringify(won));
  await A(page, (a, w) => { const k = w.bossKeys.ground()[0]; if (k) { a.player.x = k.x; a.player.y = k.y; } });
  await frames(page, 4);
  check('the event key is collected too (2 keys)', (await A(page, (a, w) => w.bossKeys.count())) === 2);

  // ---- using a key: nothing far from a Nexus portal / boss altar; beside the Nexus it opens a 120 s boss portal ----
  const far = await A(page, (a, w) => { const s = w.nexus.site; const f = w.nearestFree(s.tx + 30, s.ty + 30, 8); a.player.x = (f.x + 0.5) * 32; a.player.y = (f.y + 0.5) * 32; w.bossKeys.tick(); return { anchor: w.bossKeys.anchor(), use: w.bossKeys.use(), n: w.bossKeys.count(), prompt: w.bossKeys.prompt() }; });
  check('away from the Nexus portal and the altars a key does nothing (kept, no prompt)', !far.anchor && far.use === null && far.n === 2 && far.prompt.hidden, JSON.stringify(far));
  await nearNexus(page);
  await A(page, (a, w) => w.bossKeys.tick());
  const pr = await A(page, (a, w) => w.bossKeys.prompt());
  check('beside the Nexus portal a "Use boss key" prompt shows (desktop keeps its (Enter) hint)', !pr.hidden && /^Use boss key \(2\) \(Enter\)$/.test(pr.text), JSON.stringify(pr));
  const md0 = await A(page, (a, w) => w.miniDraws());
  await page.click('#rw-lair');
  const op = await A(page, (a, w) => { w.syncHud(false); const q = w.bossKeys.portal(); return { q, n: w.bossKeys.count(), now: w.bossKeys.now(), md: w.miniDraws(), banner: document.getElementById('realm-banner').textContent }; });
  const s2 = await raw(page);
  check('the key opens a portal_boss for 120 s and is consumed (2 -> 1)', op.q && op.q.art === 'portal_boss' && op.q.leftMs > 118000 && op.q.leftMs <= 120000 && op.n === 1 && /boss portal/i.test(op.banner), JSON.stringify(op));
  check('the open portal is saved as bossPortal (MMPortals shape, 120 s window)', s2.bossKeys === 1 && s2.bossPortal && s2.bossPortal.boss.expiresAt - s2.bossPortal.boss.openedAt === 120000, JSON.stringify(s2.bossPortal));
  check('the minimap redraws with the portal ping', op.md > md0, JSON.stringify({ md0, md: op.md }));
  const ping = await A(page, (a, w) => { const q = w.bossKeys.portal(); const c = document.getElementById('rw-minimap'); const g = c.getContext('2d'); const sx = c.width / w.world.w; const d = g.getImageData(Math.round(q.x / 32 * sx) - 6, Math.round(q.y / 32 * sx) - 6, 13, 13).data; let pink = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 140 && d[i + 2] > 120) pink++; return pink; });
  check('a pink ring marks the boss portal on the minimap', ping >= 4, String(ping));
  check('only one boss portal at a time (a second key use is refused, key kept)', await A(page, (a, w) => w.bossKeys.use() === null && w.bossKeys.count() === 1));
  check('the Nexus overlay never opens a boss portal (realm only)', await page.evaluate(() => MMPortals.openBoss(null, 'key_boss', { x: 1, y: 1 }, 5, 'nexus').ok === false && MMPortals.openBoss(null, 'key_boss', { x: 1, y: 1 }, 5, 'dungeon').ok === false));

  // ---- expiry: after 120 s on the event clock the portal closes and leaves the save ----
  await A(page, (a, w) => { w.jumpEventClock(121); w.bossKeys.tick(); });
  const ex = await A(page, (a, w) => ({ q: w.bossKeys.portal(), save: w.save().bossPortal }));
  check('after 120 s the boss portal closes and is dropped from the save', ex.q === null && ex.save === undefined, JSON.stringify(ex));

  // ---- reload keeps the keys and an open portal (time left from the saved event clock) ----
  await A(page, (a, w) => { w.bossKeys.use(); w.savePos(true); });
  const left0 = await A(page, (a, w) => w.bossKeys.portal().leftMs);
  await page.reload(); await waitWorld(page);
  const re = await A(page, (a, w) => ({ n: w.bossKeys.count(), q: w.bossKeys.portal() }));
  check('after a reload the open portal is still there with its time left, keys spent stay spent', re.n === 0 && re.q && re.q.leftMs <= 120000 && re.q.leftMs > 90000, JSON.stringify({ re, left0 }));

  // ---- entering: dungeon URL with lair=1 + zone biome, returns to the portal tile ----
  const ent = await A(page, (a, w) => {
    a.player.iframes = 1e9; a._hitPlayer = () => {};
    const q = w.bossKeys.portal(); a.player.x = q.x; a.player.y = q.y + 10; w.bossKeys.tick();
    const pr = w.bossKeys.prompt(); const u = w.bossKeys.url(q);
    return { pr, u, tx: Math.floor(q.x / 32), ty: Math.floor(q.y / 32), portals0: w.save().stats.portals };
  });
  check('at the portal the prompt reads "Enter the boss lair (time left)"', !ent.pr.hidden && /^Enter the boss lair \(\d:\d\d left\)/.test(ent.pr.text), JSON.stringify(ent.pr));
  const u = new URLSearchParams(ent.u.url.split('?')[1]);
  check('the lair URL is a dungeon trip with lair=1, a zone biome and a return to the portal tile', u.get('mode') === 'dungeon' && u.get('lair') === '1' && ['warren', 'bramble', 'meadow', 'crypt'].includes(u.get('biome')) && u.get('return') === 'index.html?mode=world&seed=12345&at=' + ent.tx + ',' + ent.ty + '&test=1' && ent.u.ret, JSON.stringify(ent.u));
  await page.keyboard.press('Enter');
  await page.waitForURL(/mode=dungeon/, { timeout: 10000 });
  const s3 = await raw(page);
  check('entering consumes the portal and saves the return tile (returnTo = portal tile)', !s3.bossPortal && s3.returnTo && s3.returnTo.x === ent.tx && s3.returnTo.y === ent.ty && s3.stats.portals === ent.portals0 + 1, JSON.stringify({ rt: s3.returnTo, bp: s3.bossPortal }));
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active, null, { timeout: 15000 });
  check('the dungeon page loads with lair=1 (harmless when not read) and links back to the world', /lair=1/.test(page.url()) && await page.evaluate(() => /mode=world/.test(decodeURIComponent(location.search))), page.url());
  check('no console errors (keys on)', D.errors.length === 0, D.errors.join(' | '));
  check('no DB traffic was attempted', D.db.attempts() === 0, JSON.stringify(D.db.http.concat(D.db.ws)));
  await D.ctx.close();

  // ---- corrupt save recovery and hostile portal windows ----
  const bad = JSON.stringify({ v: 1, seed: '12345', bossKeys: 'lots', bossPortal: { boss: { x: 'a', y: 2, openedAt: 0, expiresAt: 9 } }, keepMe: 7 });
  const C = await open(browser, WORLD, { realm: bad });
  const c1 = await A(C.page, (a, w) => ({ n: w.bossKeys.count(), q: w.bossKeys.portal(), s: w.save() }));
  check('a corrupt bossKeys / bossPortal recovers to no keys and no portal (unknown keys kept)', c1.n === 0 && c1.q === null && c1.s.bossKeys === 0 && c1.s.bossPortal === undefined && c1.s.keepMe === 7, JSON.stringify(c1.s));
  const cl = await C.page.evaluate(() => { const c = RealmWorld.cleanSave({ seed: '12345', bossKeys: 999, bossPortal: { boss: { x: 10, y: 20, openedAt: 1000, expiresAt: 1e12 } } }); return c; });
  check('cleanSave clamps keys to 9 and a portal window to 120 s', cl.bossKeys === 9 && cl.bossPortal.boss.expiresAt === 121000, JSON.stringify(cl));
  check('no console errors (corrupt save)', C.errors.length === 0, C.errors.join(' | '));
  await C.ctx.close();

  // ---- ?keys=0 ----
  const Z = await open(browser, WORLD + '&keys=0', { realm: JSON.stringify({ v: 1, seed: '12345', bossKeys: 3 }) });
  const z = await A(Z.page, (a, w) => { const d = w.bossKeys.drop(a.player.x, a.player.y, 'x'); const s = w.nexus.site; a.player.x = s.x - 96; a.player.y = s.y + 32; w.bossKeys.tick(); return { on: w.bossKeys.on, d, n: w.bossKeys.count(), use: w.bossKeys.use(), hidden: w.bossKeys.prompt().hidden }; });
  check('?keys=0: no key drops, no prompt, no portal (saved keys left untouched)', !z.on && z.d === null && z.n === 0 && z.use === null && z.hidden && (await raw(Z.page)).bossKeys === 3, JSON.stringify(z));
  check('no console errors (keys off)', Z.errors.length === 0, Z.errors.join(' | '));
  await Z.ctx.close();

  // ---- phone 390x844 (touch): 44 px prompt, no key hints, banner clear of the zone box, no horizontal scroll ----
  const M = await open(browser, WORLD, { phone: true, realm: JSON.stringify({ v: 1, seed: '12345', bossKeys: 1 }) });
  await nearNexus(M.page);
  await A(M.page, (a, w) => { w.bossKeys.tick(); a._showBanner('The Realm · island #4242', 30); });
  await M.page.waitForTimeout(300);
  const ph = await M.page.evaluate(() => {
    const r = (id) => { const e = document.getElementById(id); const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
    const abl = document.getElementById('realm-abilities'); const ab = abl ? abl.getBoundingClientRect() : null;
    return { btn: r('rw-lair'), text: document.getElementById('rw-lair').textContent, banner: r('realm-banner'), zone: r('rw-zone'), mini: r('rw-minimap'), abTop: ab ? ab.top : 9999, sw: document.documentElement.scrollWidth, iw: innerWidth };
  });
  check('phone: the key prompt is >= 44 px, on screen, above the ability grid, with no "(Enter)" hint', ph.btn.h >= 44 && ph.btn.w >= 44 && ph.btn.l >= 0 && ph.btn.r <= 390 && ph.btn.b <= ph.abTop && !/Enter|\(E\)/.test(ph.text), JSON.stringify(ph));
  check('phone (PT2 #14): the banner sits below the zone line and the minimap', ph.banner.t >= ph.zone.b && ph.banner.t >= ph.mini.b && ph.banner.r <= 390 && ph.banner.l >= 0, JSON.stringify({ b: ph.banner, z: ph.zone, m: ph.mini }));
  const nx = await A(M.page, (a, w) => { const s = w.nexus.site; a.player.x = s.x; a.player.y = s.y + 20; return new Promise((r) => setTimeout(() => { const b = document.getElementById('rw-nexus-go'); r({ t: b.textContent, hidden: b.classList.contains('hidden'), aria: b.getAttribute('aria-label') }); }, 300)); });
  check('phone (PT2 #14): "Visit the Nexus" has no (Enter) hint on touch', !nx.hidden && nx.t === 'Visit the Nexus' && !/Enter\)/.test(nx.aria), JSON.stringify(nx));
  check('phone: no horizontal scroll', ph.sw <= ph.iw, JSON.stringify(ph));
  await M.page.screenshot({ path: require('path').join(require('os').tmpdir(), 'world-bosskey-phone.png') }).catch(() => {});
  check('phone: no console errors', M.errors.length === 0, M.errors.join(' | '));
  await M.ctx.close();
  await browser.close();
  done();
})();
