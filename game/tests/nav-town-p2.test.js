// Town P2 fixes from design/REVIEW-TOWN-NAV.md: N1 (held key stuck after the "Where to?" sheet), N2 (sheet under a Realm
// invite / embed / arena), N3 (gamepad behind the sheet), P1x (postcards dialog focus) and H1 (hub gift vs a Town tab that
// holds a built Realm: two tabs, no lost shards). OFFLINE ONLY, same pattern as nav-town.test.js: blockDb (route +
// routeWebSocket), the Firebase SDK answered with an empty stub, the player joins through "Play offline". Asserts 0 database
// requests and 0 sockets; never chats, never accepts or declines an invite (that would call net.*), never writes to Firebase.
// Run: python3 -m http.server 8440 &   BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/nav-town-p2.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const HUB = BASE.replace(/index\.html.*$/, '') + 'hub/index.html?test=1&gdate=2026-11-21';
const SAVE_KEY = 'pixeltown-save-v1';

async function open(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await blockDb(ctx);
  await ctx.route(/gstatic\.com\/firebasejs\//, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* firebase SDK blocked by nav-town-p2.test.js */' }));
  // A fake gamepad the test drives through window.__pad (null = none connected).
  await ctx.addInitScript(() => {
    window.__pad = null;
    try { Object.defineProperty(Navigator.prototype, 'getGamepads', { configurable: true, value: function () { return window.__pad ? [window.__pad] : []; } }); } catch (e) { /* ignore */ }
  });
  const sockets = [];
  const errors = [];
  const page = await ctx.newPage();
  page.on('websocket', (ws) => sockets.push(ws.url()));
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.route('**/main.js*', async (route) => {
    const resp = await route.fetch();
    const body = (await resp.text()).replace('const game = new Phaser.Game(config);', 'const game = window.__g = new Phaser.Game(config);');
    route.fulfill({ response: resp, body });
  });
  ctx.on('page', (p) => p.on('websocket', (ws) => sockets.push(ws.url())));
  return { ctx, page, db, sockets, errors };
}

async function joinOffline(page) {
  await page.goto(BASE);
  await page.fill('#name-input', 'ADMINnavp2');
  await page.click('.species-tab');
  await page.click('.avatar-choice');
  await page.click('button:has-text("Join Town")');
  await page.waitForSelector('#join-offline-btn:not(.hidden)', { timeout: 9000 });
  await page.click('#join-offline-btn');
  await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 20000 });
  await page.waitForTimeout(1200);
}

const S = 'window.__g.scene.getScene("Town")';
const pos = (page) => page.evaluate((s) => { const t = eval(s); return { x: Math.round(t.localBody.x), y: Math.round(t.localBody.y) }; }, S);
const sheetOpen = (page) => page.evaluate(() => !document.getElementById('mm-nav-sheet').hidden && document.body.classList.contains('mm-nav-open'));
const place = (page, x, y) => page.evaluate(([s, px, py]) => { const t = eval(s); t.localBody.setPosition(px, py); if (t.localBody.body) t.localBody.body.reset(px, py); }, [S, x, y]);
// The machine is shared and headless frames can be slow: wait in game frames, not milliseconds.
const frames = async (page, n) => { const f0 = await page.evaluate(() => window.__g.loop.frame); await page.waitForFunction(([a, k]) => window.__g.loop.frame >= a + k, [f0, n], { timeout: 30000 }); };
const walksTo = (page, minX) => page.waitForFunction(([s, m]) => eval(s).localBody.x > m, [S, minX], { timeout: 20000 }).then(() => true, () => false);
const blurAll = (page) => page.evaluate(() => { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); });

setTimeout(() => { console.log('FAIL nav-town-p2 timed out (a step waited forever)'); process.exit(1); }, 360000).unref();

(async () => {
  const browser = await chromium.launch();
  const { ctx, page, db, sockets, errors } = await open(browser);
  await joinOffline(page);
  check('joined the town offline', await page.evaluate((s) => eval(s).net.offline === true, S));
  await page.evaluate((s) => { const t = eval(s); t.__interacts = 0; const orig = t.interact.bind(t); t.interact = (...a) => { t.__interacts++; return orig(...a); }; }, S);

  // ---------- N1: a key held when the sheet opens is released, not stuck ----------
  await place(page, 1200, 600);
  await blurAll(page);
  await page.keyboard.press('d'); await page.waitForTimeout(100); // the page has keyboard focus
  await place(page, 1200, 600);
  await page.keyboard.down('d');
  const walked = await walksTo(page, 1215);
  const p0 = await pos(page);
  const dbg = await page.evaluate((s) => { const t = eval(s); return { d: t.wasd.D.isDown, can: t.canAct(), ae: document.activeElement && (document.activeElement.id || document.activeElement.tagName), chat: t.chatFocused, ug: t.inUnderground, build: t.buildMode }; }, S);
  check('N1 setup: holding D walks the player right', walked, JSON.stringify([p0, dbg]));
  await page.click('#where-to-btn');
  await page.waitForTimeout(150);
  check('N1: the sheet is open', await sheetOpen(page));
  const p1 = await pos(page);
  await frames(page, 20);
  const p2 = await pos(page);
  check('N1: the player stops while the sheet is open (D still held)', Math.abs(p2.x - p1.x) <= 2, JSON.stringify([p1, p2]));
  await page.keyboard.up('d');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  check('N1: Esc closed the sheet', !(await sheetOpen(page)));
  await blurAll(page);
  const p3 = await pos(page);
  await frames(page, 20);
  const p4 = await pos(page);
  const dDown = await page.evaluate((s) => eval(s).wasd.D.isDown, S);
  check('N1: after the sheet closes, D (released while it was open) is not stuck down and the player stands still', !dDown && Math.abs(p4.x - p3.x) <= 2, JSON.stringify({ dDown, p3, p4 }));
  await page.keyboard.down('d'); const w5 = await walksTo(page, p4.x + 10); await page.keyboard.up('d');
  check('N1: the keyboard still walks the player after the sheet', w5, JSON.stringify([p4, await pos(page)]));

  // ---------- N3: the gamepad is paused behind the sheet ----------
  const pad = (axes, pressed) => page.evaluate(([a, b]) => { window.__pad = { id: 'ADMIN fake pad', connected: true, axes: a, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: b.includes(i), value: b.includes(i) ? 1 : 0 })) }; }, [axes, pressed]);
  await place(page, 1200, 600);
  await pad([0, 0], []); await frames(page, 3);
  await pad([1, 0], []);
  const gw = await walksTo(page, 1215);
  const g0 = await pos(page);
  check('N3 setup: the fake pad stick walks the player', gw, JSON.stringify(g0));
  await pad([0, 0], []);
  await page.click('#where-to-btn'); await page.waitForTimeout(150);
  await pad([1, 0], []); await frames(page, 3);
  const g1 = await pos(page);
  await frames(page, 20);
  const g2 = await pos(page);
  check('N3: the stick does not move the player behind the open sheet', Math.abs(g2.x - g1.x) <= 2, JSON.stringify([g1, g2]));
  // MMNav's own pad support: A confirms the FOCUSED Menu entry (nav-settings.test.js). Here nothing in the sheet has focus,
  // so A / X / Start must do nothing at all, in the sheet or in the Town behind it.
  await page.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
  const before = await page.evaluate((s) => eval(s).__interacts, S);
  await pad([1, 0], [0]); await frames(page, 3); await pad([1, 0], []); await frames(page, 3);
  await pad([1, 0], [2]); await frames(page, 3); await pad([1, 0], []); await frames(page, 3);
  await pad([1, 0], [9]); await frames(page, 3); await pad([1, 0], []); await frames(page, 3);
  const st = await page.evaluate(([s, b]) => { const t = eval(s); return { interacts: t.__interacts - b, map: !!t.mapOpen, canAct: t.canAct() }; }, [S, before]);
  check('N3: A / X / Start do nothing behind the sheet (no interact, no map) and canAct() is false', st.interacts === 0 && !st.map && !st.canAct && (await sheetOpen(page)), JSON.stringify(st));
  await pad([0, 0], [1]); await frames(page, 3); await pad([0, 0], []); await frames(page, 3);
  check('N3: pad B closes the sheet', !(await sheetOpen(page)));
  await pad([1, 0], []);
  check('N3: the pad walks again once the sheet is closed', await walksTo(page, g2.x + 10));
  await page.evaluate(() => { window.__pad = null; });
  await page.waitForTimeout(150);

  // ---------- N2: invite / embed / arena close the sheet ----------
  await page.click('#where-to-btn'); await page.waitForTimeout(150);
  await page.evaluate((s) => eval(s).showRealmInvite({ fromName: 'ADMINbot', mode: 'coop', party: 'ADMINparty' }), S);
  await page.waitForTimeout(100);
  const inv = await page.evaluate(() => ({ invite: !document.getElementById('realm-invite').classList.contains('hidden'), sheet: !document.getElementById('mm-nav-sheet').hidden }));
  check('N2: a Realm invite closes the sheet (no focus trap hidden under the invite)', inv.invite && !inv.sheet, JSON.stringify(inv));
  let reached = false;
  for (let i = 0; i < 80 && !reached; i++) { await page.keyboard.press('Tab'); reached = await page.evaluate(() => !!document.activeElement && document.activeElement.id === 'realm-invite-accept'); }
  check('N2: keyboard Tab reaches the invite\'s Join button', reached);
  await page.evaluate((s) => eval(s).hideRealmInvite(), S);
  await blurAll(page);

  await page.click('#where-to-btn'); await page.waitForTimeout(150);
  await page.evaluate((s) => eval(s).openRealmEmbed('games/mad-maze/index.html?embed=1'), S);
  await page.waitForSelector('#realm-embed iframe', { timeout: 8000 });
  check('N2: opening the Realm embed closes the sheet', !(await sheetOpen(page)));
  await page.evaluate(() => window.postMessage({ pixeltown: 'close-realm' }, location.origin));
  await page.waitForSelector('#realm-embed', { state: 'detached', timeout: 5000 });
  check('N2: back from the embed, the sheet is not still open', !(await sheetOpen(page)));

  // ---------- H1: hub gift while a Town tab holds a built Realm (two tabs) ----------
  await page.click('#where-to-btn'); await page.waitForTimeout(150);
  await page.evaluate((s) => eval(s).enterRealm(), S);
  await page.waitForTimeout(400);
  check('N2: entering the Realm arena closes the sheet', !(await sheetOpen(page)) && await page.evaluate((s) => eval(s).inRealm === true, S));
  await page.evaluate((s) => eval(s).exitRealm(), S);
  await page.waitForTimeout(200);
  const shards = () => page.evaluate((k) => { const o = JSON.parse(localStorage.getItem(k) || '{}'); return o.realm ? o.realm.shards : null; }, SAVE_KEY);
  await page.evaluate((s) => { const r = eval(s).realm; r.save.shards += 7; r.onSave(r.save); }, S);
  const s0 = await shards();
  check('H1 setup: the Town realm saved its own +7', Number.isFinite(s0) && s0 >= 7, String(s0));
  const hub = await ctx.newPage();
  hub.on('pageerror', (e) => errors.push('hub pageerror: ' + e.message));
  await hub.goto(HUB);
  await hub.waitForFunction(() => window.__hub);
  await hub.click('#gift-btn');
  await hub.waitForSelector('#gift-card:not([hidden])');
  await hub.click('#gift-claim');
  const s1 = await hub.evaluate((k) => JSON.parse(localStorage.getItem(k)).realm.shards, SAVE_KEY);
  const gift = s1 - s0;
  // localStorage reaches the other tab's renderer a moment later; the Town tab then saves on top of it
  await page.waitForFunction(([k, v]) => { const o = JSON.parse(localStorage.getItem(k) || '{}'); return o.realm && o.realm.shards === v; }, [SAVE_KEY, s1], { timeout: 5000 }).catch(() => {});
  check('H1: the hub tab paid the gift into realm.shards', gift > 0 && /claimed/i.test(await hub.textContent('#gift-note')), JSON.stringify([s0, s1, await hub.textContent('#gift-note')]));
  await page.evaluate((s) => { const r = eval(s).realm; r.save.shards += 5; r.onSave(r.save); }, S); // the Town tab still holds the pre-gift realm in memory
  const s2 = await shards();
  check('H1: the Town tab\'s next Realm save keeps the hub gift (three-way delta, no last-writer loss)', s2 === s0 + gift + 5, JSON.stringify({ s0, gift, s2 }));
  await page.evaluate((s) => eval(s).enterRealm(), S);
  await page.waitForTimeout(300);
  const inMem = await page.evaluate((s) => eval(s).realm.save.shards, S);
  check('H1: re-entering the Realm shows the merged total', inMem === s2, JSON.stringify([inMem, s2]));
  await page.evaluate((s) => eval(s).exitRealm(), S);
  await hub.reload(); await hub.waitForFunction(() => window.__hub); await hub.click('#gift-btn');
  check('H1: the same day cannot be claimed twice from a second load', await hub.locator('#gift-claim').isDisabled());
  check('H1: no shards lost or doubled after all that', (await shards()) === s2);
  await hub.close();
  await page.waitForTimeout(300);

  // ---------- P1x: postcards dialog focus ----------
  await place(page, 1262, 554);
  await page.waitForSelector('#postcards-hint:not(.hidden)', { timeout: 4000 });
  const pcState = () => page.evaluate(() => ({ open: !document.getElementById('postcards-overlay').classList.contains('hidden'), focus: document.activeElement && document.activeElement.id, chat: !!document.activeElement && document.activeElement.id === 'chat-input' }));
  await page.click('#postcards-hint');
  await page.waitForTimeout(150);
  const o1 = await pcState();
  check('P1x: tapping "Read the postcards" opens the dialog and focus moves to its close button', o1.open && o1.focus === 'postcards-close-btn', JSON.stringify(o1));
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  const trap = await page.evaluate(() => document.getElementById('postcards-overlay').contains(document.activeElement));
  check('P1x: Tab / Shift+Tab stay inside the dialog', trap);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const o2 = await pcState();
  check('P1x: Esc closes it and focus returns to "Read the postcards"', !o2.open && o2.focus === 'postcards-hint', JSON.stringify(o2));
  await page.click('#postcards-hint');
  await page.waitForTimeout(150);
  check('P1x: reopened', (await pcState()).focus === 'postcards-close-btn');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  const o3 = await pcState();
  check('P1x: Enter on the close button closes the dialog (not stolen by "Enter focuses chat")', !o3.open && !o3.chat && o3.focus === 'postcards-hint', JSON.stringify(o3));
  await blurAll(page);
  await page.keyboard.press('e'); // the hint's own key, from the game (focus on the page body)
  await frames(page, 5);
  const o4 = await pcState();
  check('P1x: E next to the board opens the dialog with focus on its close button', o4.open && o4.focus === 'postcards-close-btn', JSON.stringify(o4));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const o5 = await pcState();
  check('P1x: Esc closes it again (focus to the visible "Read the postcards" button)', !o5.open && o5.focus === 'postcards-hint', JSON.stringify(o5));
  await blurAll(page);
  await page.click('#where-to-btn'); await page.waitForTimeout(150);
  await page.evaluate((s) => eval(s).openPostcards(), S);
  check('P1x: opening the postcards closes the sheet (one dialog at a time)', !(await sheetOpen(page)) && await page.evaluate(() => document.activeElement.id === 'postcards-close-btn'));
  await page.keyboard.press('Escape');

  check('chat log got no line from the player (nothing was sent)', await page.evaluate(() => ![...document.querySelectorAll('#chat-log *')].some((n) => /ADMINnavp2:/.test(n.textContent))));
  check('0 database requests and 0 sockets (blockDb saw nothing; no websocket opened)', db.attempts() === 0 && sockets.length === 0, JSON.stringify([db.http, db.ws, sockets]));
  check('no console errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
  await browser.close();
  done();
})().catch((e) => { console.log('FAIL crashed: ' + (e && e.stack || e)); process.exitCode = 1; });
