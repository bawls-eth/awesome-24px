// Bug bash (hub lane): the Menu's Settings entry works on every page (SETTINGS-WIRING.md), the Menu and the Hub home screen
// answer a gamepad (CONTROLS.md: d-pad / stick move, A confirm, B / Start back, Start opens the Menu), "World map" in the
// Menu opens the map view (?map=1) while a plain Hub visit stays the Home screen, and keys typed in the Settings feedback
// box never reach the page hotkeys (P0). Hub page (no page settings hook) on phone 390x844 touch and desktop 1280x720.
//   python3 -m http.server 8440 &   BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/nav-settings.test.js
// No Firebase (blockDb); storage: only the page's own local keys; pixeltown-save-v1 must stay byte-identical.
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const GAME = BASE.replace(/index\.html.*$/, '');
const HUB = GAME + 'hub/index.html';
const SAVE = JSON.stringify({ v: 1, name: 'ADMINset', bells: 7 });

// A fake standard gamepad the test can press: window.__pad = { b: {index: true}, ax: [x, y] }.
const PAD = () => {
  window.__pad = { b: {}, ax: [0, 0] };
  const fake = () => ({ id: 'fake', index: 0, connected: true, mapping: 'standard', axes: window.__pad.ax.slice(),
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: !!window.__pad.b[i], value: window.__pad.b[i] ? 1 : 0 })) });
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [fake()] });
};
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; (function f() { if (++i >= k) res(); else requestAnimationFrame(f); }()); }), n || 4);
async function press(page, btn) {
  await page.evaluate((b) => { window.__pad.b[b] = true; }, btn); await frames(page, 4);
  await page.evaluate((b) => { window.__pad.b[b] = false; }, btn); await frames(page, 4);
}

async function run(browser, label, opts, tap) {
  const L = (s) => '[' + label + '] ' + s;
  const ctx = await browser.newContext(opts);
  const db = await blockDb(ctx);
  await ctx.addInitScript((v) => { try { if (!localStorage.getItem('pixeltown-save-v1')) localStorage.setItem('pixeltown-save-v1', v); } catch (e) { /* opaque */ } }, SAVE);
  await ctx.addInitScript(PAD);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const scripts = [];
  page.on('request', (r) => { if (/mm-(settings|feedback)\.js/.test(r.url())) scripts.push(r.url()); });

  // ---- Settings from the Menu on a page with no settings hook ----
  await page.goto(HUB + '?map=1');
  await page.waitForFunction(() => window.__hub && window.MMNav && MMNav.mounted());
  await tap(page, '#mm-nav-btn');
  const s0 = await page.evaluate(() => { const b = document.getElementById('mm-nav-settings'); return { shown: !b.hidden && b.getClientRects().length > 0, panel: !!document.getElementById('mmset'), api: typeof window.MMSettings }; });
  check(L('the Menu offers Settings on a page with no settings hook (the Hub); the panel is not loaded yet'), s0.shown && !s0.panel && s0.api === 'undefined', JSON.stringify(s0));
  await tap(page, '#mm-nav-settings');
  await page.waitForSelector('#mmset:not([hidden])', { timeout: 5000 });
  const s1 = await page.evaluate(() => ({ nav: MMNav.isOpen(), page: document.getElementById('mmset').dataset.page, groups: [...document.querySelectorAll('#mmset .mmset-group')].map((g) => g.dataset.group).join(), fb: !!document.querySelector('#mmset-fb textarea'), focus: document.activeElement && document.activeElement.id, dialogs: [...document.querySelectorAll('[role=dialog]')].filter((n) => !n.hidden && n.getClientRects().length).length }));
  check(L('Settings loads the shared panel on demand: Menu closed, panel open for page "map", 4 groups, focus on Close, one dialog'), !s1.nav && s1.page === 'map' && s1.groups === 'play,see,hear,help' && s1.focus === 'mmset-close' && s1.dialogs === 1, JSON.stringify(s1));
  check(L('the Help group has the feedback box (mm-feedback.js loaded on demand too)'), s1.fb, JSON.stringify(s1));

  // P0: keys typed in the feedback box never reach the map's hotkeys (WASD walk the villager, Enter opens a node)
  const at0 = await page.evaluate(() => window.__hub.at);
  // keys pressed with focus on a panel button stay in the panel too
  await page.keyboard.press('d'); await page.keyboard.press('ArrowLeft');
  const kb = await page.evaluate(() => ({ at: window.__hub.at, walking: window.__hub.walking, open: !document.getElementById('mmset').hidden }));
  check(L('P0: WASD / arrows with focus in the Settings panel never walk the map'), kb.at === at0 && !kb.walking && kb.open, JSON.stringify(kb));
  await tap(page, '#mmset-fb .mmfb-head');
  await page.waitForSelector('#mmset-fb textarea.mmfb-text', { state: 'visible', timeout: 3000 });
  await page.focus('#mmset-fb textarea.mmfb-text');
  await page.keyboard.type('wasd dash');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  const k = await page.evaluate(() => ({ at: window.__hub.at, walking: window.__hub.walking, card: !document.getElementById('card').hidden, val: document.querySelector('#mmset-fb textarea.mmfb-text').value, open: !document.getElementById('mmset').hidden }));
  check(L('P0: typing "wasd", Enter and arrows in the feedback box leaves the map alone (no walk, no node card) and lands in the box'), k.at === at0 && !k.walking && !k.card && /wasd dash/.test(k.val) && k.open, JSON.stringify(k));

  // Esc closes the panel and gives focus back to the Menu button; a second open reuses the one panel and loads nothing again
  await page.keyboard.press('Escape');
  const s2 = await page.evaluate(() => ({ open: !document.getElementById('mmset').hidden, focus: document.activeElement && document.activeElement.id }));
  check(L('Esc closes the panel, focus goes back to the Menu button'), !s2.open && s2.focus === 'mm-nav-btn', JSON.stringify(s2));
  await page.evaluate(() => { MMNav.open(); document.getElementById('mm-nav-settings').click(); });
  await page.waitForSelector('#mmset:not([hidden])');
  const s3 = await page.evaluate(() => ({ panels: document.querySelectorAll('#mmset').length, roots: document.querySelectorAll('.mmfb, #mmset-fb > *').length > 0 }));
  check(L('reopening uses the same panel; each script was fetched once'), s3.panels === 1 && scripts.filter((u) => /mm-settings\.js/.test(u)).length === 1 && scripts.filter((u) => /mm-feedback\.js/.test(u)).length === 1, JSON.stringify({ s3, scripts }));

  // 150% text from the panel: the Hub has no horizontal scroll and the Menu still fits
  await page.click('#mmset-text-size button[data-value="1.5"]');
  const sc = await page.evaluate(() => ({ ui: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim(), sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, acc: (() => { try { return JSON.parse(localStorage.getItem('pixeltown-access-v1')).hudScale; } catch (e) { return null; } })() }));
  check(L('Text size Huge sets --ui-scale 1.5 and pixeltown-access-v1.hudScale, no horizontal scroll'), sc.ui === '1.5' && sc.acc === 1.5 && sc.sw <= sc.cw, JSON.stringify(sc));
  await page.click('#mmset-close');

  // ---- "World map" in the Menu opens the map view; Back from a game names Home vs World map ----
  await page.goto(HUB);
  await page.waitForFunction(() => window.__home && window.MMNav && MMNav.mounted());
  const wm = await page.evaluate(() => { MMNav.open(); const r = { foot: document.getElementById('mm-nav-map').getAttribute('href'), dest: document.querySelector('.mm-nav-dest[data-place=map]').getAttribute('href'), home: window.__home.isHome() }; MMNav.close(); return r; });
  check(L('a plain Hub visit is the Home screen; the Menu\'s World map links go to ?map=1'), wm.home && wm.foot === 'index.html?map=1' && wm.dest === 'index.html?map=1', JSON.stringify(wm));
  await Promise.all([page.waitForNavigation(), page.evaluate(() => { MMNav.open(); document.getElementById('mm-nav-map').click(); })]);
  await page.waitForFunction(() => window.__home);
  check(L('the Menu\'s World map lands on the map view'), await page.evaluate(() => !window.__home.isHome() && /map=1/.test(location.search)));

  // ---- gamepad: Start opens the Menu on the Hub, the d-pad moves focus, B closes; on Home the d-pad walks the cards and A opens ----
  await page.goto(HUB);
  await page.waitForFunction(() => window.__home && window.MMNav && MMNav.mounted());
  await press(page, 9);
  const g1 = await page.evaluate(() => ({ open: MMNav.isOpen(), focus: document.activeElement && document.activeElement.id }));
  check(L('gamepad Start opens the Menu (focus on its first row), the held Start does not close it again'), g1.open && /^mm-nav-(back|continue)$/.test(g1.focus), JSON.stringify(g1));
  await press(page, 13);
  const g2 = await page.evaluate(() => ({ open: MMNav.isOpen(), focus: document.activeElement && (document.activeElement.id || document.activeElement.dataset.place || document.activeElement.className) }));
  check(L('gamepad d-pad down moves the focus to the next Menu entry'), g2.open && g2.focus && g2.focus !== g1.focus, JSON.stringify(g2));
  await press(page, 1);
  check(L('gamepad B closes the Menu'), await page.evaluate(() => !MMNav.isOpen()));
  await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
  await press(page, 13);
  const g3 = await page.evaluate(() => { const a = document.activeElement; return { id: a && a.id, home: window.__home.isHome() }; });
  check(L('Home screen: gamepad d-pad focuses the first home control (Play)'), g3.home && g3.id === 'home-play', JSON.stringify(g3));
  await press(page, 13);
  const g4 = await page.evaluate(() => { const a = document.activeElement; return { id: a && a.id, place: a && a.dataset.place, cls: a && a.className }; });
  check(L('Home screen: d-pad down again moves on (next step line or the first card)'), g4.id !== 'home-play' && (g4.id === 'home-next' || /home-card/.test(g4.cls)), JSON.stringify(g4));
  await page.focus('#home-coll');
  await press(page, 0);
  const g5 = await page.evaluate(() => !document.getElementById('coll-sheet').hidden);
  await press(page, 1);
  const g6 = await page.evaluate(() => !document.getElementById('coll-sheet').hidden);
  check(L('Home screen: A presses the focused Collections card (book opens), B closes the book'), g5 && !g6, JSON.stringify({ g5, g6 }));

  const save = await page.evaluate(() => localStorage.getItem('pixeltown-save-v1'));
  check(L('pixeltown-save-v1 byte-identical'), save === SAVE);
  check(L('no console errors'), errors.length === 0, errors.join(' | '));
  check(L('0 Firebase attempts'), db.attempts() === 0, JSON.stringify({ http: db.http, ws: db.ws }));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  await run(browser, 'phone 390x844', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, (p, s) => p.tap(s));
  await run(browser, 'desktop 1280x720', { viewport: { width: 1280, height: 720 } }, (p, s) => p.click(s));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
