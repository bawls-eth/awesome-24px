// NAV slice E (design/NAV-AUDIT.md 4.4): the Town's "Where to?" button + MMNav sheet, the Realm Gate pointer chip,
// the join-screen Continue link, the gate menu fixes and the settings feedback box. OFFLINE ONLY:
// every database host is blocked (blockDb: http route + routeWebSocket), the Firebase SDK scripts are answered with an
// empty stub so the page never even opens a database socket, and the player enters through the existing "Play offline"
// path. The test asserts 0 database requests and 0 sockets, never chats and never writes to Firebase.
// Run: python3 -m http.server 8440 &   BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/nav-town.test.js
const { chromium } = require('playwright');
const { check, done, offlineStub } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const NAV_KEY = 'pixeltown-nav-v1';
const PTR_KEY = 'pixeltown-gate-pointer-v1';
const FB_KEY = 'pixeltown-feedback-v1';
const SAVE_KEY = 'pixeltown-save-v1';
const ISLES = JSON.stringify({ v: 1, last: { id: 'isles', sub: 'Coral Reef', url: 'game/games/isles/index.html?isle=reef', t: 1 }, prev: null });
// HS1: the sheet lists the places in its three groups (Adventure, Arcade, Quick games); the World map closes Adventure
const IDS = 'town,realm,isles,lantern,map,pop,dash,stack,echo,jam,angler,bugs,stalk,deepdelve';

async function open(browser, viewport, touch, seedNav) {
  const ctx = await browser.newContext(touch ? { viewport, hasTouch: true, isMobile: true } : { viewport });
  const db = await offlineStub(ctx);
  // The SDK never loads: no firebase global, so the join try fails at once and offers "Play offline".
  const sockets = [];
  if (seedNav) await ctx.addInitScript((v) => { if (!sessionStorage.navSeeded) { sessionStorage.navSeeded = '1'; localStorage.setItem('pixeltown-nav-v1', v); } }, seedNav);
  const page = await ctx.newPage();
  page.on('websocket', (ws) => sockets.push(ws.url()));
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.route('**/main.js*', async (route) => {
    const resp = await route.fetch();
    const body = (await resp.text()).replace('const game = new Phaser.Game(config);', 'const game = window.__g = new Phaser.Game(config);');
    route.fulfill({ response: resp, body });
  });
  return { ctx, page, db, sockets, errors };
}

async function joinOffline(page, tap) {
  await page.fill('#name-input', 'ADMINnav');
  await page.click('.species-tab');
  await page.click('.avatar-choice');
  await page.click('button:has-text("Join Town")');
  await page.waitForSelector('#join-offline-btn:not(.hidden)', { timeout: 9000 });
  await tap('#join-offline-btn');
  await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 20000 });
  await page.waitForTimeout(1200);
}

const rect = (page, sel) => page.evaluate((s) => {
  const e = document.querySelector(s); if (!e) return null;
  const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { x: r.left, y: r.top, w: r.width, h: r.height, vis: r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden', onTop: !!top && (top === e || e.contains(top)) };
}, sel);
const overlap = (a, b) => a && b && a.vis && b.vis && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

(async () => {
  const browser = await chromium.launch();

  // Join screen without any stored place: no Continue link.
  {
    const t = await open(browser, { width: 1280, height: 720 }, false);
    await t.page.goto(BASE);
    await t.page.waitForTimeout(400);
    check('[fresh] join screen shows no Continue link when no place is stored', await t.page.locator('#join-continue').isHidden());
    check('[fresh] no database requests or sockets', t.db.attempts() === 0 && t.sockets.length === 0, JSON.stringify([t.db.http, t.db.ws, t.sockets]));
    check('[fresh] no console errors', t.errors.length === 0, t.errors.join(' | '));
    await t.ctx.close();
  }

  for (const [label, viewport, touch] of [['390x844', { width: 390, height: 844 }, true], ['1280x720', { width: 1280, height: 720 }, false]]) {
    const L = (s) => `[${label}] ${s}`;
    const { ctx, page, db, sockets, errors } = await open(browser, viewport, touch, ISLES);
    const tap = (sel) => (touch ? page.tap(sel) : page.click(sel));
    await page.goto(BASE + '?hud=online'); // U-01: online HUD pieces (walkie) stay in the overlap checks
    await page.waitForTimeout(400);

    // ---- join screen: Continue (offline-safe) + species tabs ----
    const jc = await page.evaluate(() => { const a = document.getElementById('join-continue'); const r = a.getBoundingClientRect(); const j = document.getElementById('join-btn'); return { vis: !a.classList.contains('hidden') && r.height > 0, text: a.textContent, href: a.getAttribute('href'), abs: a.href, h: r.height, before: !!(a.compareDocumentPosition(j) & Node.DOCUMENT_POSITION_FOLLOWING) }; });
    check(L('join screen: "Continue: Isles - Coral Reef" shows above Join Town after a stored place'), jc.vis && /Continue: Isles - Coral Reef/.test(jc.text) && jc.before, JSON.stringify(jc));
    check(L('join screen: Continue points at the stored isle and is at least 44 px tall'), jc.href === 'games/isles/index.html?isle=reef' && jc.h >= 44, JSON.stringify(jc));
    const cr = await page.request.get(jc.abs);
    check(L('join screen: the Continue target resolves with HTTP 200'), cr.status() === 200, String(cr.status()));
    const tabs = await page.evaluate(() => [...document.querySelectorAll('#species-tabs .species-tab')].map((b) => b.getBoundingClientRect().height));
    check(L(`species tabs are at least 40 px tall (${tabs.length} tabs, min ${Math.min(...tabs)})`), tabs.length > 0 && Math.min(...tabs) >= 40, JSON.stringify(tabs));
    check(L('the join screen mounts no nav sheet or corner Menu button'), await page.evaluate(() => !document.getElementById('mm-nav-root') && !document.getElementById('mm-nav-btn')));

    await joinOffline(page, tap);
    check(L('joined the town offline'), await page.evaluate(() => window.__g.scene.getScene('Town').net.offline === true));
    const saveAfterJoin = await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY);

    // ---- the Town Menu: desktop "Where to?" in the HUD panel + the corner Menu; phones the corner Menu only ----
    // cyc8-ui (cycle-7 proposal, standing owner decision in ROUND4.md): on phones the shared corner Menu replaces "Where to?" in the phone
    // panel (one HUD piece, same sheet). Every sheet check below runs against the phone's Menu (#mm-nav-btn) instead of "Where to?".
    const NAV = touch ? '#mm-nav-btn' : '#where-to-btn';
    const navId = NAV.slice(1);
    if (!touch) {
      const wt = await rect(page, '#where-to-btn');
      check(L('"Where to?" button is visible, at least 44 px tall and wide, and nothing covers it'), wt && wt.vis && wt.h >= 44 && wt.w >= 44 && wt.onTop, JSON.stringify(wt));
      const place = await page.evaluate(() => { const b = document.getElementById('where-to-btn'); const p = document.getElementById('player-list-panel'); const kids = [...p.children]; return { inPanel: b.parentElement === p, afterToggle: kids.indexOf(b) === kids.indexOf(document.getElementById('panel-toggle')) + 1, collapsed: p.classList.contains('collapsed'), text: b.textContent }; });
      check(L('"Where to?" sits in #player-list-panel right under the panel toggle'), place.inPanel && place.afterToggle && /Where to\?/.test(place.text), JSON.stringify(place));
    } else {
      const ph = await page.evaluate(() => { const p = document.getElementById('player-list-panel'); const b = document.getElementById('where-to-btn'); return { collapsed: p.classList.contains('collapsed'), whereShown: b.getBoundingClientRect().width > 0 && getComputedStyle(b).display !== 'none' }; });
      check(L('phone: the panel is collapsed and "Where to?" has left it (the corner Menu replaces it)'), ph.collapsed && !ph.whereShown, JSON.stringify(ph));
    }
    // cyc7-ui (U-01) + cyc8-ui: every screen size has the shared corner Menu top-left, >= 44 px, uncovered, on the same sheet
    const cm = await rect(page, '#mm-nav-btn');
    check(L('the Town has the shared corner Menu button top-left, >= 44 px, and nothing covers it'), cm && cm.vis && cm.onTop && cm.w >= 44 && cm.h >= 44 && cm.x <= 16 && cm.y <= 16, JSON.stringify(cm));
    check(L('the corner Menu and "Where to?" control the same sheet'), await page.evaluate(() => { const m = document.getElementById('mm-nav-btn'); return !!m && window.MMNav.mounted() && m.getAttribute('aria-controls') === 'mm-nav-sheet' && document.getElementById('where-to-btn').getAttribute('aria-controls') === 'mm-nav-sheet'; }));
    if (touch) {
      const mHits = [];
      for (const sel of ['#inventory-panel', '#player-list-panel', '#gate-pointer', '#walkie-panel']) { if (overlap(cm, await rect(page, sel))) mHits.push(sel); }
      check(L('phone: the corner Menu overlaps no bag bar, In-town chip, pointer chip or walkie'), mHits.length === 0, JSON.stringify(mHits));
    }

    await tap(NAV);
    await page.waitForTimeout(250);
    const sh = await page.evaluate((navId) => {
      const vis = (n) => { const r = n.getBoundingClientRect(); const cs = getComputedStyle(n); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; };
      const sheet = document.getElementById('mm-nav-sheet');
      const dests = [...sheet.querySelectorAll('.mm-nav-dest')].map((a) => ({ id: a.dataset.place, href: a.getAttribute('href'), abs: a.href, target: a.getAttribute('target'), cur: a.getAttribute('aria-current') }));
      return { open: vis(sheet), dialogs: [...document.querySelectorAll('[role=dialog][aria-modal=true]')].filter(vis).length, dests, expanded: document.getElementById(navId).getAttribute('aria-expanded'), focusIn: sheet.contains(document.activeElement), worldMap: document.getElementById('world-map-link').href, sheetMap: document.getElementById('mm-nav-map').href };
    }, navId);
    check(L(`one tap on the Menu (${navId}) opens the sheet; exactly one modal dialog is visible`), sh.open && sh.dialogs === 1 && sh.expanded === 'true' && sh.focusIn, JSON.stringify({ open: sh.open, dialogs: sh.dialogs, expanded: sh.expanded }));
    check(L('all 14 places are listed in catalogue order'), sh.dests.map((d) => d.id).join(',') === IDS, sh.dests.map((d) => d.id).join(','));
    check(L('the Town entry is marked as the current page'), sh.dests[0].cur === 'page');
    check(L('destinations are plain same-tab links (they leave like the "World map" link does)'), sh.dests.every((d) => !d.target && d.abs.startsWith(new URL(BASE).origin + '/game/')) && sh.sheetMap.split('?')[0] === sh.worldMap.split('?')[0] && /[?&]map=1/.test(sh.sheetMap), JSON.stringify([sh.sheetMap, sh.worldMap])); // the sheet's World map opens the Hub map view (?map=1)
    for (const d of sh.dests.filter((x) => x.id !== 'town')) {
      const r = await page.request.get(d.abs);
      check(L(`destination ${d.id} (${d.href}) resolves with HTTP 200`), r.status() === 200, String(r.status()));
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    const closed = await page.evaluate((navId) => ({ hidden: document.getElementById('mm-nav-sheet').hidden, focus: document.activeElement && document.activeElement.id, expanded: document.getElementById(navId).getAttribute('aria-expanded') }), navId);
    check(L(`Esc closes the sheet and focus returns to the Menu that opened it (${navId})`), closed.hidden && closed.focus === navId && closed.expanded === 'false', JSON.stringify(closed));
    await tap(NAV); await page.waitForTimeout(150);
    await tap('#mm-nav-close'); await page.waitForTimeout(150);
    check(L('the sheet ✕ closes it too'), await page.evaluate(() => document.getElementById('mm-nav-sheet').hidden));
    const nav = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), NAV_KEY);
    check(L('pixeltown-nav-v1 now records the Town, keeping the isle as the previous place'), nav && nav.last.id === 'town' && nav.prev && nav.prev.id === 'isles', JSON.stringify(nav));

    // ---- Realm Gate pointer chip ----
    const gp = await page.evaluate(() => { const e = document.getElementById('gate-pointer'); const r = e.getBoundingClientRect(); return { vis: !e.classList.contains('hidden') && r.height > 0, text: e.textContent.replace(/\s+/g, ' ').trim(), arrow: document.getElementById('gate-pointer-arrow').textContent }; });
    check(L('first spawn: the Realm Gate pointer chip is visible and points up-left (↖) at the gate'), gp.vis && /Realm Gate/.test(gp.text) && gp.arrow === '↖', JSON.stringify(gp));
    const ptr = await rect(page, '#gate-pointer');
    const hits = [];
    for (const sel of ['#inventory-panel', '#player-list-panel', '#walkie-panel', '#chat-panel', '#joystick', '#action-buttons']) { if (overlap(ptr, await rect(page, sel))) hits.push(sel); }
    check(L('the pointer chip overlaps no other HUD piece and fits the screen'), hits.length === 0 && ptr.x >= 0 && ptr.x + ptr.w <= viewport.width, JSON.stringify([hits, ptr]));
    const pc = await rect(page, '#gate-pointer-close');
    check(L('the pointer chip ✕ is at least 44x44 px'), pc && pc.w >= 44 && pc.h >= 44 && pc.onTop, JSON.stringify(pc));
    const arrowAt = await page.evaluate(() => { const s = window.__g.scene.getScene('Town'); s.localBody.setPosition(750 + 400, 290); s._gatePointerAt = -1e9; s.updateGatePointer(1e9); return document.getElementById('gate-pointer-arrow').textContent; });
    check(L('the arrow follows the player (gate due west -> ←)'), arrowAt === '←', arrowAt);
    const nearHidden = await page.evaluate(() => { const s = window.__g.scene.getScene('Town'); s.localBody.setPosition(750, 400); s._gatePointerAt = -1e9; s.updateGatePointer(2e9); return document.getElementById('gate-pointer').classList.contains('hidden'); });
    check(L('the chip hides near the gate (< 300 px)'), nearHidden);
    await page.evaluate(() => { const s = window.__g.scene.getScene('Town'); s.localBody.setPosition(1200, 600); s._gatePointerAt = -1e9; s.updateGatePointer(3e9); });
    await tap('#gate-pointer-close');
    await page.waitForTimeout(300);
    const dis = await page.evaluate((k) => ({ hidden: document.getElementById('gate-pointer').classList.contains('hidden'), stored: JSON.parse(localStorage.getItem(k) || 'null') }), PTR_KEY);
    check(L('✕ hides the chip and stores the choice in its own key (pixeltown-gate-pointer-v1)'), dis.hidden && dis.stored && dis.stored.dismissed === true, JSON.stringify(dis));

    // ---- feedback box in the Town settings ----
    if (touch) { const c = await page.evaluate(() => document.getElementById('player-list-panel').classList.contains('collapsed')); if (c) { await tap('#panel-toggle'); await page.waitForTimeout(200); } }
    const settingsWasOpen = await page.evaluate(() => !document.getElementById('settings-section').classList.contains('hidden'));
    if (!settingsWasOpen) { await tap('#settings-toggle-btn'); await page.waitForTimeout(200); }
    const saveBeforeFb = await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY);
    const fb = await page.evaluate(() => { const s = document.querySelectorAll('#settings-section .mmfb'); return { n: s.length, page: s[0] && s[0].getAttribute('data-mmfb'), title: s[0] && s[0].querySelector('.mmfb-title').textContent }; });
    check(L('the feedback box mounts once inside the Town settings (page "town")'), fb.n === 1 && fb.page === 'town' && fb.title === 'Suggest or report a bug', JSON.stringify(fb));
    await page.locator('#settings-section .mmfb-head').scrollIntoViewIfNeeded();
    await tap('#settings-section .mmfb-head');
    await page.locator('#settings-section .mmfb-text').scrollIntoViewIfNeeded();
    await page.fill('#settings-section .mmfb-text', 'ADMINnav: the gate pointer test note');
    await page.locator('#settings-section .mmfb-save').scrollIntoViewIfNeeded();
    await tap('#settings-section .mmfb-save');
    await page.waitForTimeout(150);
    const fs = await page.evaluate((k) => ({ st: JSON.parse(localStorage.getItem(k) || 'null'), status: document.querySelector('#settings-section .mmfb-status').textContent }), FB_KEY);
    check(L('Save stores the note on this device (pixeltown-feedback-v1)'), fs.st && fs.st.entries && fs.st.entries.length === 1 && fs.st.entries[0].page === 'town' && /Saved on this device/.test(fs.status), JSON.stringify(fs));
    check(L('the feedback box never touches pixeltown-save-v1'), await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY) === saveBeforeFb);
    if (!settingsWasOpen) { await tap('#settings-toggle-btn'); await page.waitForTimeout(150); }
    if (touch) { await tap('#panel-toggle'); await page.waitForTimeout(150); }

    // ---- gate menu ----
    await page.evaluate(() => { const s = window.__g.scene.getScene('Town'); s.realmMenuOpen = false; s.openRealmGateMenu(); });
    await page.waitForTimeout(200);
    const gm = await page.evaluate(() => { const c = document.getElementById('realm-menu-close-btn').getBoundingClientRect(); const d = document.getElementById('realm-menu-friends'); const sum = d.querySelector('summary').getBoundingClientRect(); const top = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2); return { open: !document.getElementById('realm-menu').classList.contains('hidden'), w: c.width, h: c.height, onTop: !!top && top.id === 'realm-menu-close-btn', enter: document.getElementById('realm-menu-madmaze').textContent, solo: document.getElementById('realm-menu-solo').textContent, friendsOpen: d.open, sumH: sum.height, sumText: d.querySelector('summary').textContent }; });
    check(L('gate menu: ✕ close is at least 44x44 px (was 29x25)'), gm.open && gm.w >= 44 && gm.h >= 44 && gm.onTop, JSON.stringify(gm));
    check(L('gate menu: the main action reads "Enter the Realm"; the one-room arena reads "Quick arena (one room)"'), /Enter the Realm/.test(gm.enter) && /Quick arena \(one room\)/.test(gm.solo), JSON.stringify([gm.enter, gm.solo]));
    check(L('gate menu: nobody online, so "Play with friends" is collapsed (summary >= 44 px)'), !gm.friendsOpen && /Play with friends/.test(gm.sumText) && gm.sumH >= 44, JSON.stringify(gm));
    check(L('opening the gate menu marks the gate as found (pointer stays off)'), await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).reached === true, PTR_KEY));

    // The Realm inside the Town iframe keeps its own Leave: no MMNav there.
    await tap('#realm-menu-madmaze');
    await page.waitForSelector('#realm-embed iframe', { timeout: 8000 });
    let frame = null;
    for (let i = 0; i < 40 && !frame; i++) { frame = page.frames().find((f) => /mad-maze\/index\.html/.test(f.url())); if (!frame) await page.waitForTimeout(250); } // the frame attaches a moment after the iframe element appears (flaky under load otherwise)
    let inFrame = null;
    if (frame) { await frame.waitForLoadState('load'); await page.waitForTimeout(1200); inFrame = await frame.evaluate(() => ({ btn: !!document.getElementById('mm-nav-btn'), sheet: !!document.getElementById('mm-nav-sheet'), mounted: !!(window.MMNav && window.MMNav.mounted()) })); }
    check(L('the in-page Realm iframe mounts no MMNav (button, sheet)'), inFrame && !inFrame.btn && !inFrame.sheet && !inFrame.mounted, JSON.stringify(inFrame));
    check(L('the pointer chip is hidden while the Realm is open'), await page.evaluate(() => document.getElementById('gate-pointer').classList.contains('hidden')));
    await page.evaluate(() => window.postMessage({ pixeltown: 'close-realm' }, location.origin));
    await page.waitForSelector('#realm-embed', { state: 'detached', timeout: 5000 });

    // Nothing of the above wrote pixeltown-save-v1 keys of its own.
    const saveEnd = await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY);
    const keys = (s) => Object.keys(JSON.parse(s || '{}')).sort();
    const added = keys(saveEnd).filter((k) => !keys(saveAfterJoin).includes(k));
    check(L('pixeltown-save-v1 gains no key from the new code (nav, pointer, feedback live in their own keys)'), !added.some((k) => /nav|pointer|gate|feedback|seen/i.test(k)) && !/gate-pointer|pixeltown-nav|mmfb/.test(saveEnd), JSON.stringify(added));

    // ---- reload: the pointer stays dismissed, Continue still offers the previous place ----
    await page.reload();
    await page.waitForTimeout(400);
    const jc2 = await page.evaluate(() => ({ vis: !document.getElementById('join-continue').classList.contains('hidden'), text: document.getElementById('join-continue').textContent }));
    check(L('after visiting the Town, the join screen still offers "Continue: Isles - Coral Reef" (the previous place)'), jc2.vis && /Continue: Isles - Coral Reef/.test(jc2.text), JSON.stringify(jc2));
    await joinOffline(page, tap);
    await page.waitForTimeout(600);
    check(L('reload: the dismissed pointer chip stays hidden'), await page.evaluate(() => document.getElementById('gate-pointer').classList.contains('hidden')));

    const sw = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    check(L('no horizontal scroll'), sw.sw <= sw.iw, JSON.stringify(sw));
    check(L('0 database requests and 0 sockets (blockDb saw nothing; no websocket opened)'), db.attempts() === 0 && sockets.length === 0, JSON.stringify([db.http, db.ws, sockets]));
    check(L('no console errors'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  await browser.close();
  done();
})();
