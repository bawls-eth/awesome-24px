// TN1 (design/NEXT-SLICES-3.md): the Town's pond-dock signpost to the Hearthvale Isles and the arrival spots.
// OFFLINE ONLY, like nav-town.test.js: every database host is blocked (blockDb: http route + routeWebSocket), the Firebase
// SDK scripts are answered with an empty stub so the page never opens a database socket, and the player enters through
// "Play offline". The isles page itself is answered with a stub (its real URL is checked for HTTP 200 separately).
// The test asserts 0 database requests and 0 sockets, never chats and never writes to Firebase.
// Run: python3 -m http.server 8440 &   BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/town-isles-sign.test.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { check, done, offlineStub } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const SAVE_KEY = 'pixeltown-save-v1';
const SIGN = { x: 505, y: 560 };
const DOCK = { x: 445, y: 604 }; // centre of the dock planks (drawDock: x 410-480, y 585-623)
const ISLES_NAV = JSON.stringify({ v: 1, last: { id: 'isles', sub: 'Coral Reef', url: 'game/games/isles/index.html?isle=reef', t: 1 }, prev: null });

async function open(browser, viewport, touch, seedNav) {
  const ctx = await browser.newContext(touch ? { viewport, hasTouch: true, isMobile: true } : { viewport });
  const db = await offlineStub(ctx);
  await ctx.route(/\/games\/isles\/index\.html/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>isles stub</title><p>isles stub</p>' }));
  if (seedNav) await ctx.addInitScript((v) => { if (!sessionStorage.navSeeded) { sessionStorage.navSeeded = '1'; localStorage.setItem('pixeltown-nav-v1', v); } }, seedNav);
  const page = await ctx.newPage();
  const sockets = [];
  page.on('websocket', (ws) => sockets.push(ws.url()));
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.route('**/main.js*', async (route) => {
    const resp = await route.fetch();
    const body = (await resp.text()).replace('const game = new Phaser.Game(config);', 'const game = window.__g = new Phaser.Game(config);');
    route.fulfill({ response: resp, body });
  });
  const tap = (sel) => (touch ? page.tap(sel) : page.click(sel));
  return { ctx, page, db, sockets, errors, tap };
}

async function joinOffline(page, tap) {
  await page.fill('#name-input', 'ADMINisles');
  await page.click('.species-tab');
  await page.click('.avatar-choice');
  await page.click('button:has-text("Join Town")');
  await page.waitForSelector('#join-offline-btn:not(.hidden)', { timeout: 9000 });
  await tap('#join-offline-btn');
  await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 20000 });
  await page.waitForTimeout(900);
}

const pos = (page) => page.evaluate(() => { const b = window.__g.scene.getScene('Town').localBody; return { x: b.x, y: b.y }; });
const rect = (page, sel) => page.evaluate((s) => {
  const e = document.querySelector(s); if (!e) return null;
  const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { x: r.left, y: r.top, w: r.width, h: r.height, vis: r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden', onTop: !!top && (top === e || e.contains(top)) };
}, sel);
const overlap = (a, b) => a && b && a.vis && b.vis && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

(async () => {
  // Source guard: the TN1 block makes no net.* call and writes no storage (UI only).
  const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const a = src.indexOf('// ---------- TN1: dock signpost'); const b = src.indexOf('  updateDigHoleHint() {', a);
  const block = a > 0 && b > a ? src.slice(a, b) : '';
  check('source: the TN1 block exists and has no net.* call, no writeSave, no storage write', block.length > 200 && !/\bnet\.|writeSave|setItem|removeItem|innerHTML/.test(block), String(block.length));
  check('source: the sign URL is games/isles/index.html?from=town', /ISLES_SIGN_URL = 'games\/isles\/index\.html\?from=town'/.test(src));

  const browser = await chromium.launch();
  const target = new URL('games/isles/index.html?from=town', BASE).href;
  {
    const ctx = await browser.newContext(); const r = await ctx.request.get(target.replace(/\?.*$/, '')); await ctx.close();
    check('the real isles page resolves with HTTP 200', r.status() === 200, String(r.status()));
  }

  for (const [label, viewport, touch] of [['390x844', { width: 390, height: 844 }, true], ['1280x720', { width: 1280, height: 720 }, false]]) {
    const L = (s) => `[${label}] ${s}`;
    const t = await open(browser, viewport, touch);
    const { page, tap } = t;
    await page.goto(BASE);
    await joinOffline(page, tap);
    check(L('joined the town offline'), await page.evaluate(() => window.__g.scene.getScene('Town').net.offline === true));
    const plain = await pos(page);
    check(L('a plain join keeps the default spawn (not the dock)'), dist(plain, DOCK) > 120, JSON.stringify(plain));

    // ---- the sign ----
    const sign = await page.evaluate(() => window.__g.scene.getScene('Town').children.list.filter((c) => c.type === 'Text' && /Isles/.test(c.text)).map((c) => ({ t: c.text, x: c.x, y: c.y, fs: parseFloat(c.style.fontSize) })));
    const lab = sign.find((s) => s.t === '⛵ Isles');
    check(L('the sign shows "⛵ Isles" (>= 12 px) within 200 px of the dock'), lab && lab.fs >= 12 && dist(lab, DOCK) < 200, JSON.stringify(sign));
    check(L('the sign reads "Hearthvale Isles →"'), sign.some((s) => s.t === 'Hearthvale Isles →' && s.fs >= 12), JSON.stringify(sign));
    check(L('prompt is hidden away from the sign'), await page.evaluate(() => document.getElementById('isles-sign-hint').classList.contains('hidden')));

    // ---- walk up to it (existing test hook: place the body) ----
    const saveBefore = await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY);
    await page.evaluate((p) => { window.__g.scene.getScene('Town').localBody.setPosition(p.x, p.y + 20); }, SIGN);
    await page.waitForTimeout(300);
    const pr = await rect(page, '#isles-sign-hint');
    const txt = await page.evaluate(() => document.getElementById('isles-sign-hint').textContent);
    check(L('near the sign the prompt "⛵ Sail to Hearthvale Isles" shows'), pr && pr.vis && /Sail to Hearthvale Isles/.test(txt), JSON.stringify([pr, txt]));
    check(L('the prompt button is at least 44 px tall and wide, nothing covers it, and it fits the screen'), pr.h >= 44 && pr.w >= 44 && pr.onTop && pr.x >= 0 && pr.x + pr.w <= viewport.width, JSON.stringify(pr));
    const hits = [];
    for (const sel of ['#inventory-panel', '#player-list-panel', '#walkie-panel', '#chat-panel', '#joystick', '#action-buttons', '#gate-pointer', '#fish-hint-btn', '#gift-hint-btn', '#flora-fauna-hint', '#where-to-btn']) { if (overlap(pr, await rect(page, sel))) hits.push(sel); }
    check(L('the prompt overlaps no other HUD piece'), hits.length === 0, JSON.stringify(hits));
    if (touch) { const ib = await rect(page, '#interact-btn'); check(L('phone: the A button is at least 44 px'), ib && ib.w >= 44 && ib.h >= 44, JSON.stringify(ib)); }
    check(L('showing the prompt wrote nothing to pixeltown-save-v1'), await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY) === saveBefore);

    // ---- interact (A on the phone, E on desktop) navigates like the World map link ----
    const nav1 = page.waitForURL(/\/games\/isles\/index\.html\?from=town$/, { timeout: 8000 }).then(() => true, () => false);
    if (touch) await page.tap('#interact-btn'); else await page.keyboard.press('e');
    check(L(touch ? 'tapping A by the sign opens games/isles/index.html?from=town' : 'pressing E by the sign opens games/isles/index.html?from=town'), await nav1, page.url());
    check(L('the stored town save is untouched by the sign'), await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY) === saveBefore);

    // ---- coming back with ?from=isles: on the dock; then the prompt button itself sails too ----
    await page.goto(BASE + '?from=isles');
    await joinOffline(page, tap);
    const back = await pos(page);
    check(L('?from=isles spawns the player within 120 px of the dock'), dist(back, DOCK) < 120, JSON.stringify(back));
    await page.evaluate((p) => { window.__g.scene.getScene('Town').localBody.setPosition(p.x, p.y + 20); }, SIGN);
    await page.waitForTimeout(300);
    const nav2 = page.waitForURL(/\/games\/isles\/index\.html\?from=town$/, { timeout: 8000 }).then(() => true, () => false);
    await tap('#isles-sign-hint');
    check(L('tapping the prompt button opens the isles page too'), await nav2, page.url());

    check(L('0 database requests and 0 sockets'), t.db.attempts() === 0 && t.sockets.length === 0, JSON.stringify([t.db.http, t.db.ws, t.sockets]));
    check(L('no console errors'), t.errors.length === 0, t.errors.join(' | '));
    await t.ctx.close();
  }

  // ---- arrival spots ----
  const arrive = async (query, seedNav, referer) => {
    const t = await open(browser, { width: 1000, height: 700 }, false, seedNav);
    await t.page.goto(BASE + query, referer ? { referer } : undefined);
    await joinOffline(t.page, t.tap);
    const p = await pos(t.page);
    const clean = t.db.attempts() === 0 && t.sockets.length === 0 && t.errors.length === 0;
    await t.ctx.close();
    return { p, clean };
  };
  const realm = await arrive('?from=realm');
  check('?from=realm spawns at the Realm Gate exit spot (REALM_GATE_POS + 116)', dist(realm.p, { x: 750, y: 376 }) < 2 && realm.clean, JSON.stringify(realm));
  const odd = await arrive('?from=nowhere');
  check('an unknown ?from= value keeps the default spawn', dist(odd.p, DOCK) > 120 && dist(odd.p, { x: 750, y: 376 }) > 2 && odd.clean, JSON.stringify(odd));
  const viaNav = await arrive('', ISLES_NAV, new URL('games/isles/index.html?isle=reef', BASE).href);
  check('pixeltown-nav-v1 last place "isles" + arriving from the isles page spawns on the dock', dist(viaNav.p, DOCK) < 120 && viaNav.clean, JSON.stringify(viaNav));
  const staleNav = await arrive('', ISLES_NAV);
  check('a stale "isles" last place without coming from the isles page keeps the default spawn', dist(staleNav.p, DOCK) > 120 && staleNav.clean, JSON.stringify(staleNav));

  await browser.close();
  done();
})();
