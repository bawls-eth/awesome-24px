// G-12 (b07-01, b04-08): Esc (and P, the universal Menu key) closes the top Town overlay. Journal, Map, Today, Achievements, Home plot and
// Polyroll close with Esc; Esc while typing in chat only blurs it; Museum / Postcards keep their own Esc and close once (the layer below
// stays); P that closes an overlay takes no photo. OFFLINE ONLY: blockDb, the Firebase SDK answered with an empty stub, "Play offline",
// ADMIN* name; no chat is sent, nothing is written to Firebase.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-g12-esc-close.test.js
const { chromium } = require('playwright');
const { check, done, blockDb, offlineStub } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await offlineStub(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.route('**/main.js*', async (route) => { const resp = await route.fetch(); const body = (await resp.text()).replace('const game = new Phaser.Game(config);', 'const game = window.__g = new Phaser.Game(config);'); route.fulfill({ response: resp, body }); });
  await page.goto(BASE);
  await page.fill('#name-input', 'ADMINesc');
  await page.click('.species-tab');
  await page.click('.avatar-choice');
  await page.click('button:has-text("Join Town")');
  await page.waitForSelector('#join-offline-btn:not(.hidden)', { timeout: 9000 });
  await page.click('#join-offline-btn');
  await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 20000 });
  await page.waitForTimeout(800);
  const T = (fn, arg) => page.evaluate(`(${fn.toString()})(window.__g.scene.getScene('Town'), ${JSON.stringify(arg === undefined ? null : arg)})`);
  await page.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); });

  const CASES = [
    ['Journal', 'journalOpen', 'journal-overlay', (s) => s.openJournal()],
    ['Map', 'mapOpen', 'map-overlay', () => document.getElementById('map-btn').click()],
    ['Today', 'dailiesOpen', 'dailies-overlay', (s) => s.openDailies()],
    ['Achievements', 'achievementsOpen', 'achievements-overlay', () => document.getElementById('achievements-badge').click()],
    ['Home plot', 'homeOpen', 'home-overlay', (s) => s.openHome()],
    ['Polyroll', 'polyrollOpen', 'polyroll-overlay', (s) => s.openPolyroll()],
  ];
  for (const [name, flag, id, openFn] of CASES) {
    const opened = await T(new Function('s', 'a', `(${openFn.toString()})(s); return { flag: !!s['${flag}'], shown: !document.getElementById('${id}').classList.contains('hidden') };`));
    await page.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); });
    await page.keyboard.press('Escape');
    const after = await T((s, a) => ({ flag: !!s[a[0]], hidden: document.getElementById(a[1]).classList.contains('hidden') }), [flag, id]);
    check(`1. ${name}: open, Esc -> flag false and overlay hidden`, opened.flag && opened.shown && !after.flag && after.hidden, JSON.stringify({ opened, after }));
  }

  // P (Menu) closes an overlay too and takes no photo on the same press
  const ph = await T((s) => { s.openJournal(); window.__photos = 0; const o = s.takePhoto; s.takePhoto = function () { window.__photos++; return o && o.apply(this, arguments); }; return !!s.journalOpen; });
  await page.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); });
  await page.keyboard.press('p');
  const pr = await T((s) => ({ open: !!s.journalOpen, photos: window.__photos }));
  check('1b. P closes the Journal and takes no photo on that press', ph && !pr.open && pr.photos === 0, JSON.stringify(pr));

  // 2: Esc while typing in chat only blurs the input (the overlay underneath, if any, stays)
  const c = await T((s) => { s.openDailies(); const i = document.getElementById('chat-input'); i.value = 'not sent'; i.focus(); return document.activeElement === i; });
  await page.keyboard.press('Escape');
  const ca = await T((s) => ({ focused: document.activeElement === document.getElementById('chat-input'), dailies: !!s.dailiesOpen }));
  check('2. Esc while typing in chat only blurs the input (Today stays open)', c && !ca.focused && ca.dailies, JSON.stringify(ca));
  await page.keyboard.press('Escape');
  check('2b. the next Esc closes Today', !(await T((s) => !!s.dailiesOpen)));

  // 3: Museum over the Journal: one Esc closes only the Museum
  const m = await T((s) => { s.openJournal(); s.openMuseum(); return { j: !!s.journalOpen, m: !!s.museumOpen }; });
  await page.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); });
  await page.keyboard.press('Escape');
  const ma = await T((s) => ({ j: !!s.journalOpen, m: !!s.museumOpen }));
  check('3. Museum over the Journal: one Esc closes only the Museum (no double close)', m.m && !ma.m && ma.j, JSON.stringify({ m, ma }));
  await page.keyboard.press('Escape');
  check('3b. a second Esc then closes the Journal', !(await T((s) => !!s.journalOpen)));
  const pc = await T((s) => { s.openJournal(); s.openPostcards(); return { j: !!s.journalOpen, p: !!s.postcardsOpen }; });
  await page.keyboard.press('Escape');
  const pca = await T((s) => ({ j: !!s.journalOpen, p: !!s.postcardsOpen }));
  check('3c. Postcards over the Journal: one Esc closes only Postcards', pc.p && !pca.p && pca.j, JSON.stringify({ pc, pca }));
  await page.keyboard.press('Escape');
  check('no page errors', errors.length === 0, errors.join(' | '));
  check('no database traffic (Town)', db.attempts() === 0, String(db.attempts()));
  await ctx.close();

  // 4: the Realm Nexus: Esc with the quest board open closes the board only; the second Esc leaves the Nexus
  { const ORIGIN = BASE.replace(/\/game\/index\.html.*$/, '');
    const c2 = await browser.newContext({ viewport: { width: 1000, height: 700 } });
    await blockDb(c2); await c2.routeWebSocket(/.*/, (ws) => ws.close());
    await c2.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
    const p = await c2.newPage(); const errs = [];
    p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    await p.goto(ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&seed=12345&qdate=2030-05-01');
    await p.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
    const o = await p.evaluate(() => { const a = window.__mm.arena, w = window.__mm.world; a.player.iframes = 1e9; a._hitPlayer = () => {}; const s = w.nexus.site; a.player.x = s.x - 20; a.player.y = s.y; const opened = w.nexus.open(); const q = window.MMNexus.layout().npcs.find((n) => n.role === 'quests'); if (q) w.nexus.talk(q.id); const b = document.querySelector('#rw-nexus .nx-board') || document.getElementById('rw-nx-board-close').parentNode; return { opened, q: !!q, board: !!b && !b.classList.contains('hidden'), close: !!document.getElementById('rw-nx-board-close') }; });
    await p.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); });
    await p.keyboard.press('Escape');
    const o2 = await p.evaluate(() => { const b = document.getElementById('rw-nx-board-close').parentNode; return { board: !b.classList.contains('hidden'), open: window.__mm.world.nexus.isOpen() }; });
    check('4. Nexus: the quest board has a Close button; Esc with the board open closes the board and the Nexus stays open', o.opened && o.board && o.close && !o2.board && o2.open, JSON.stringify({ o, o2 }));
    await p.keyboard.press('Escape');
    check('4b. the second Esc leaves the Nexus', !(await p.evaluate(() => window.__mm.world.nexus.isOpen())));
    check('no page errors (Nexus)', errs.length === 0, errs.join(' | '));
    await c2.close();
  }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
