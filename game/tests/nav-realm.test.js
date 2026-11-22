// NAV-AUDIT slice C: the shared Menu (mm-nav) on the unified Realm page, ?mode=world and ?mode=dungeon, plus the exit scheme.
//   python3 -m http.server 8440 &   BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/nav-realm.test.js
// Standalone pages only: never joins the town. Firebase hosts are blocked (blockDb) and must see 0 attempts; the Town and Hub
// pages the exits lead to are answered with tiny local stubs. Checks, at 390x844 (touch) and 1280x720:
//   Menu button position / size / nothing on top, no overlap with the HP bar, level / zone lines, minimap, sticks and HUD buttons,
//   one tap opens the sheet (exactly one modal, the run pauses, Esc closes and resumes), one exit label scheme ("Leave" /
//   "Back to the world"), the Nexus "Lantern vault" label, distinct menu and settings icons, Leave from the standalone page goes to the
//   previous place or the World map (never the Town join form), the Realm inside an iframe has no Menu button and still posts
//   close-realm, ?nav=0 turns it off, the feedback box mounts at the end of the settings sheet, no console errors.
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const ORIGIN = new URL(BASE).origin;
const PAGE = ORIGIN + '/game/games/mad-maze/index.html';
const WORLD = PAGE + '?mode=world&test=1&seed=12345';
const DUNGEON = PAGE + '?mode=dungeon&test=1&seed=5';
const RET = 'index.html?mode=world&seed=12345&at=20,20&test=1';
const SAVE = JSON.stringify({ name: 'ADMINnavc', realm: { level: 4, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 } } });
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const DESK = { viewport: { width: 1280, height: 720 } };
const stub = (t, body) => `<!doctype html><meta charset="utf-8"><title>${t}</title><body><h1>${t}</h1>${body || ''}</body>`;
// a tiny stand-in for shared/mm-feedback.js, used only while that module is not on disk yet (it is built in another slice)
const FB_STUB = 'window.MMFeedback={mount:function(c,o){var d=document.createElement("details");d.className="mm-feedback-stub";d.dataset.page=o&&o.page||"";var s=document.createElement("summary");s.textContent="Suggest / report a bug";d.appendChild(s);c.appendChild(d);return d;}};';

let fbReal = null;
async function open(browser, ctxOpts, url, opt) {
  opt = opt || {};
  const ctx = await browser.newContext(ctxOpts);
  const db = await blockDb(ctx);
  await ctx.route(/\/game\/index\.html(\?.*)?$/, (r) => r.fulfill({ contentType: 'text/html', body: stub('town stub') }));
  await ctx.route(/\/game\/hub\/index\.html(\?.*)?$/, (r) => r.fulfill({ contentType: 'text/html', body: stub('hub stub') }));
  await ctx.route(/\/game\/games\/isles\/index\.html(\?.*)?$/, (r) => r.fulfill({ contentType: 'text/html', body: stub('isles stub', `<a id="to-realm" href="../mad-maze/index.html?mode=world&test=1&seed=12345">Realm</a>`) }));
  await ctx.route(/\/game\/tests\/fixtures\/navc-embed\.html$/, (r) => r.fulfill({ contentType: 'text/html', body: stub('embed', `<iframe id="rf" src="../../games/mad-maze/index.html?mode=world&test=1&seed=12345" style="width:390px;height:700px;border:0"></iframe><script>window.__msgs=[];addEventListener('message',function(e){window.__msgs.push(e.data);});</script>`) }));
  await ctx.route(/\/game\/shared\/mm-feedback\.js$/, async (r) => {
    const res = await r.fetch().catch(() => null);
    if (res && res.status() === 200) { fbReal = true; return r.fulfill({ response: res }); }
    fbReal = false; return r.fulfill({ contentType: 'text/javascript', body: FB_STUB });
  });
  await ctx.route(/\/game\/shared\/mm-feedback\.css$/, async (r) => {
    const res = await r.fetch().catch(() => null);
    return res && res.status() === 200 ? r.fulfill({ response: res }) : r.fulfill({ contentType: 'text/css', body: '' });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((v) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', v); localStorage.setItem('mm-aim-assist', '0'); }, SAVE);
  if (url) {
    await page.goto(url);
    if (!opt.noWait) await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 20000 });
  }
  return { ctx, page, errors, db };
}
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const tap = (page, sel, touch) => (touch ? page.tap(sel) : page.click(sel));

async function layout(page) {
  return page.evaluate(() => {
    const R = (id) => { const e = document.getElementById(id); if (!e) return null; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || e.classList.contains('hidden')) return null; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? { id, x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height } : null; };
    const b = R('mm-nav-btn');
    const top = b ? document.elementFromPoint(b.x + b.w / 2, b.y + b.h / 2) : null;
    const others = ['realm-hp', 'realm-info', 'realm-xp', 'realm-focus', 'rw-zone', 'rw-minimap', 'mm-map', 'mm-map-btn', 'realm-stick-move', 'realm-stick-aim', 'realm-bp-btn', 'realm-board-btn', 'realm-menu-btn', 'realm-leave-btn', 'mm-gear-btn', 'mm-daily-btn', 'realm-abilities', 'realm-banner'].map(R).filter(Boolean);
    const hit = b ? others.filter((o) => !(o.r <= b.x || o.x >= b.r || o.b <= b.y || o.y >= b.b)).map((o) => o.id) : [];
    return { btn: b, onTop: !!top && !!top.closest('#mm-nav-btn'), hit, sw: document.documentElement.scrollWidth, iw: innerWidth, label: b ? document.getElementById('mm-nav-btn').getAttribute('aria-label') : null };
  });
}

async function pageChecks(browser, label, ctxOpts, url, kind) {
  const touch = !!ctxOpts.hasTouch;
  const L = (s) => `[${label}] ${s}`;
  const T = await open(browser, ctxOpts, url); const page = T.page;
  await page.waitForSelector('#mm-nav-btn');
  await frames(page, 10);
  const save0 = await page.evaluate(() => localStorage.getItem('pixeltown-save-v1'));
  const lay = await layout(page);
  check(L('Menu button is visible, at least 48x48 and nothing covers it'), lay.btn && lay.btn.w >= 48 && lay.btn.h >= 48 && lay.onTop, JSON.stringify(lay));
  check(L('Menu button sits within 16 px of the top-left corner'), lay.btn && lay.btn.x >= 0 && lay.btn.y >= 0 && lay.btn.x <= 16 && lay.btn.y <= 16, JSON.stringify(lay.btn));
  check(L('Menu button overlaps no Realm HUD element (HP, level/zone, XP, minimap, sticks, buttons)'), lay.hit.length === 0, JSON.stringify(lay.hit));
  check(L('no horizontal scroll'), lay.sw <= lay.iw, JSON.stringify([lay.sw, lay.iw]));
  const hp = await page.evaluate(() => { const h = document.getElementById('realm-hp').getBoundingClientRect(); const l = document.getElementById('realm-leave-btn').getBoundingClientRect(); return { w: h.width, sameRow: Math.abs(h.top - l.top) < 30 }; });
  check(L('the HP bar keeps a readable width on the first HUD row'), hp.w >= 60 && hp.sameRow, JSON.stringify(hp));

  // one tap opens the sheet, the run pauses, Esc closes it and the run resumes
  await tap(page, '#mm-nav-btn', touch); await page.waitForTimeout(200);
  const sh = await page.evaluate(() => {
    const vis = (n) => { const r = n.getBoundingClientRect(); const cs = getComputedStyle(n); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; };
    const a = window.__mm.arena; const c0 = a.clock;
    return { open: MMNav.isOpen(), modals: [...document.querySelectorAll('[role=dialog][aria-modal=true]')].filter(vis).length, dests: document.querySelectorAll('#mm-nav-sheet .mm-nav-dest').length, paused: a.paused, panel: a.panel, c0, back: document.querySelector('#mm-nav-back .mm-nav-row-label').textContent, backHref: document.getElementById('mm-nav-back').getAttribute('href'), cur: (document.querySelector('.mm-nav-dest[aria-current=page]') || {}).dataset, set: !document.getElementById('mm-nav-settings').hidden };
  });
  await page.waitForTimeout(300);
  const c1 = await page.evaluate(() => window.__mm.arena.clock);
  check(L('one tap opens the "Where to?" sheet with 10 places, exactly one modal dialog'), sh.open && sh.dests === 10 && sh.modals === 1, JSON.stringify(sh));
  check(L('the sheet marks the Realm as the current place and offers Settings'), sh.cur && sh.cur.place === 'realm' && sh.set, JSON.stringify(sh));
  check(L('opening the sheet pauses the run (clock frozen, no panel opened)'), sh.paused && !sh.panel && c1 === sh.c0, JSON.stringify({ sh, c1 }));
  if (kind === 'dungeon-return') check(L('Back row goes to the world'), sh.back === 'Back to the world' && decodeURIComponent(sh.backHref) === RET, JSON.stringify(sh));
  else check(L('Back row falls back to the World map (no previous place)'), /World map|the map/.test(sh.back) && sh.backHref === '../../hub/index.html', JSON.stringify(sh));
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  const after = await page.evaluate(() => ({ open: MMNav.isOpen(), paused: window.__mm.arena.paused, menu: window.__mm.arena.panel, focus: document.activeElement && document.activeElement.id }));
  check(L('Esc closes the sheet, the run resumes, focus is back on the Menu button, no Realm menu opened'), !after.open && !after.paused && !after.menu && after.focus === 'mm-nav-btn', JSON.stringify(after));

  // one exit label scheme + distinct menu / settings icons
  const lab = await page.evaluate(() => {
    const lb = document.getElementById('realm-leave-btn'); const mb = document.getElementById('realm-menu-btn'); const gb = document.getElementById('mm-gear-btn');
    return { t: lb.textContent.trim(), a: lb.getAttribute('aria-label'), ti: lb.title, menuA: mb && mb.getAttribute('aria-label'), menuT: mb && mb.textContent.trim(), menuImg: mb && mb.querySelector('img') ? mb.querySelector('img').getAttribute('src') : '', gearA: gb && gb.getAttribute('aria-label'), gearImg: gb && gb.querySelector('img') ? gb.querySelector('img').getAttribute('src') : '' };
  });
  check(L('the HUD exit reads "Leave" (no "Exit", "Leave Mad Maze", "Leave to start", "Map")'), /^✖\s*Leave$/.test(lab.t) && !/Mad Maze|Exit|to start/.test(lab.a + lab.ti), JSON.stringify(lab));
  if (kind === 'dungeon-return') check(L('in a portal dungeon the Leave button says it goes back to the world'), /back to the world/.test(lab.a) && lab.ti === 'Back to the world', JSON.stringify(lab));
  else check(L('the Leave button names its destination (the World map)'), /back to the map/.test(lab.a) && lab.ti === 'Back to the map', JSON.stringify(lab));
  check(L('menu (☰) and settings (gear) have distinct icons and aria-labels'), lab.menuT === '☰' && !/settings/.test(lab.menuImg) && /^Open menu/.test(lab.menuA) && lab.gearA === 'Open settings' && lab.menuA !== lab.gearA, JSON.stringify(lab));
  await tap(page, '#realm-menu-btn', touch); await page.waitForTimeout(200);
  const menu = await page.evaluate(() => { const b = document.querySelector('#realm-pause button[data-m="leave"]'); return { t: b.textContent.trim(), a: b.getAttribute('aria-label'), covered: document.body.classList.contains('mm-nav-covered'), btnShown: getComputedStyle(document.getElementById('mm-nav-btn')).display !== 'none' }; });
  check(L('the Realm menu exit reads "🚪 Leave" and names the destination'), menu.t === '🚪 Leave' && /^Leave: back to /.test(menu.a || ''), JSON.stringify(menu));
  check(L('the Menu button hides while a Realm dialog is open (no stacked overlays)'), menu.covered && !menu.btnShown, JSON.stringify(menu));
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  check(L('the Menu button is back once the Realm menu closes'), await page.evaluate(() => !document.body.classList.contains('mm-nav-covered') && getComputedStyle(document.getElementById('mm-nav-btn')).display !== 'none'));
  // the backpack hides the bottom gear and the Menu button
  await tap(page, '#realm-bp-btn', touch); await page.waitForTimeout(200);
  const bp = await page.evaluate(() => ({ gear: getComputedStyle(document.getElementById('mm-gear-btn')).display, nav: getComputedStyle(document.getElementById('mm-nav-btn')).display }));
  check(L('the backpack hides the settings gear and the Menu button'), bp.gear === 'none' && bp.nav === 'none', JSON.stringify(bp));
  await page.evaluate(() => window.__mm.arena.setPaused(false)); await page.waitForTimeout(150);

  // the sheet's Settings opens the Realm settings sheet
  await tap(page, '#mm-nav-btn', touch); await page.waitForTimeout(150);
  await tap(page, '#mm-nav-settings', touch); await page.waitForTimeout(250);
  check(L('the sheet\'s Settings button opens the Realm settings (sheet closed)'), await page.evaluate(() => window.__mmAccess.isOpen() && !MMNav.isOpen()));
  await page.evaluate(() => window.__mmAccess.close()); await page.waitForTimeout(150);

  const save1 = await page.evaluate(() => localStorage.getItem('pixeltown-save-v1'));
  const navKey = await page.evaluate(() => JSON.parse(localStorage.getItem('pixeltown-nav-v1') || 'null'));
  check(L('the mm-nav record is the Realm world (a dungeon never becomes Continue)'), navKey && navKey.last && navKey.last.id === 'realm' && /mode=world/.test(navKey.last.url) && !/dungeon/.test(navKey.last.url), JSON.stringify(navKey));
  check(L('pixeltown-save-v1 is not rewritten by the nav (only the realm field may change)'), (() => { try { const a = JSON.parse(save0), b = JSON.parse(save1); delete a.realm; delete b.realm; return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; } })());
  check(L('no console errors'), T.errors.length === 0, T.errors.join(' | '));
  check(L('DB attempts: 0'), T.db.count() === 0, JSON.stringify({ http: T.db.http, ws: T.db.ws }));
  await T.ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  for (const [vl, vo] of [['phone', PHONE], ['desktop', DESK]]) {
    await pageChecks(browser, vl + ' world', vo, WORLD, 'world');
    await pageChecks(browser, vl + ' dungeon', vo, DUNGEON, 'dungeon');
    await pageChecks(browser, vl + ' portal dungeon', vo, DUNGEON + '&lv=2&return=' + encodeURIComponent(RET), 'dungeon-return');
  }

  // ---- the dungeon summary: Back to the world (portal run) / Back to the map ----
  let T = await open(browser, DESK, DUNGEON + '&lv=2&return=' + encodeURIComponent(RET));
  await T.page.evaluate(() => window.__mm.dungeon.finish()); await T.page.waitForSelector('#mm-sum-home');
  let sum = await T.page.evaluate(() => ({ t: document.getElementById('mm-sum-home').textContent, h: document.getElementById('mm-sum-home').getAttribute('href'), nav: getComputedStyle(document.getElementById('mm-nav-btn')).display }));
  check('portal dungeon summary: "Back to the world" to the portal tile', sum.t === 'Back to the world' && sum.h === RET, JSON.stringify(sum));
  check('the Menu button hides under the dungeon summary', sum.nav === 'none', JSON.stringify(sum));
  check('summary page: no console errors, DB 0', T.errors.length === 0 && T.db.count() === 0, T.errors.join(' | '));
  await T.ctx.close();
  T = await open(browser, DESK, DUNGEON);
  await T.page.evaluate(() => window.__mm.dungeon.finish()); await T.page.waitForSelector('#mm-sum-home');
  sum = await T.page.evaluate(() => ({ t: document.getElementById('mm-sum-home').textContent, h: document.getElementById('mm-sum-home').getAttribute('href') }));
  check('plain dungeon summary: "Back to the map" (World map), not the Town', sum.t === 'Back to the map' && sum.h === '../../hub/index.html', JSON.stringify(sum));
  await T.ctx.close();

  // ---- Leave from the standalone Realm: the World map when there is no previous place ----
  T = await open(browser, PHONE, WORLD);
  await Promise.all([T.page.waitForURL(/\/game\/hub\/index\.html/, { timeout: 10000 }), T.page.tap('#realm-leave-btn')]);
  check('standalone world: Leave goes to the World map (not the Town join form)', /\/game\/hub\/index\.html$/.test(T.page.url()), T.page.url());
  check('leave flow: no console errors, DB 0', T.errors.length === 0 && T.db.count() === 0, T.errors.join(' | '));
  await T.ctx.close();
  // ... and back to the previous place when there is one (opened from the Isles page)
  T = await open(browser, DESK, ORIGIN + '/game/games/isles/index.html', { noWait: true });
  await Promise.all([T.page.waitForURL(/mad-maze\/index\.html/), T.page.click('#to-realm')]);
  await T.page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 20000 });
  const lb = await T.page.evaluate(() => document.getElementById('realm-leave-btn').title);
  await T.page.click('#mm-nav-btn'); await T.page.waitForTimeout(150);
  const back = await T.page.evaluate(() => document.querySelector('#mm-nav-back .mm-nav-row-label').textContent);
  await T.page.keyboard.press('Escape');
  await Promise.all([T.page.waitForURL(/\/games\/isles\/index\.html/, { timeout: 10000 }), T.page.click('#realm-leave-btn')]);
  check('opened from the Isles: Leave (and the sheet Back) go back to the Isles', /\/games\/isles\/index\.html$/.test(T.page.url()) && lb === 'Back to Isles' && back === 'Back to Isles', JSON.stringify({ url: T.page.url(), lb, back }));
  check('isles flow: no console errors, DB 0', T.errors.length === 0 && T.db.count() === 0, T.errors.join(' | '));
  await T.ctx.close();

  // ---- ?nav=0 turns the Menu off; the page still works ----
  T = await open(browser, PHONE, WORLD + '&nav=0');
  const off = await T.page.evaluate(() => ({ btn: !!document.getElementById('mm-nav-btn'), on: document.body.classList.contains('mm-nav-on'), hp: document.getElementById('realm-hp').getBoundingClientRect().left }));
  check('?nav=0: no Menu button, the HUD stays in its old place', !off.btn && !off.on && off.hp < 20, JSON.stringify(off));
  check('?nav=0: no console errors, DB 0', T.errors.length === 0 && T.db.count() === 0, T.errors.join(' | '));
  await T.ctx.close();

  // ---- embedded in an iframe (the Town overlay): no Menu button, Leave still posts close-realm ----
  T = await open(browser, PHONE, ORIGIN + '/game/tests/fixtures/navc-embed.html', { noWait: true });
  const fr = T.page.frameLocator('#rf');
  const frame = T.page.frame({ url: /mad-maze\/index\.html/ }) || (await (async () => { await T.page.waitForTimeout(500); return T.page.frame({ url: /mad-maze\/index\.html/ }); })());
  await frame.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 20000 });
  const emb = await frame.evaluate(() => ({ btn: !!document.getElementById('mm-nav-btn'), on: document.body.classList.contains('mm-nav-on'), mounted: MMNav.mounted() }));
  check('embedded (iframe): no Menu button, mm-nav stays off', !emb.btn && !emb.on && !emb.mounted, JSON.stringify(emb));
  await fr.locator('#realm-leave-btn').tap();
  await T.page.waitForTimeout(400);
  const msgs = await T.page.evaluate(() => window.__msgs);
  check('embedded: Leave still posts close-realm to the town (no navigation)', msgs.some((m) => m && m.pixeltown === 'close-realm') && /mad-maze\/index\.html/.test(frame.url()), JSON.stringify(msgs));
  check('embedded: no console errors, DB 0', T.errors.length === 0 && T.db.count() === 0, T.errors.join(' | '));
  await T.ctx.close();

  // ---- the Nexus says "Lantern vault" ----
  T = await open(browser, DESK, WORLD + '&qdate=2030-05-01&nexuswalk=0');
  await T.page.evaluate(() => { const a = window.__mm.arena; a.player.iframes = 1e9; a._hitPlayer = () => {}; const s = window.__mm.world.nexus.site; a.player.x = s.x - 20; a.player.y = s.y; });
  await frames(T.page, 20); await T.page.click('#rw-nexus-go'); await frames(T.page, 5);
  const nx = await T.page.evaluate(() => ({ btn: document.querySelector('#rw-nexus [data-portal="vault"]').textContent, aria: document.querySelector('#rw-nexus [data-portal="vault"]').getAttribute('aria-label'), name: window.__mm.world.nexus.portalName('vault'), prompt: window.__mm.world.nexus.promptFor('vault'), other: window.__mm.world.nexus.portalName('warren'), nav: getComputedStyle(document.getElementById('mm-nav-btn')).display }));
  check('the Nexus vault portal is labelled "Lantern vault" (button, aria, plaza label, walk prompt)', /^Lantern vault/.test(nx.btn) && /^Lantern vault/.test(nx.aria) && nx.name === 'Lantern vault' && /^Lantern vault/.test(nx.prompt) && !/^Vault/.test(nx.btn + nx.prompt), JSON.stringify(nx));
  check('other Nexus portals keep their names', nx.other && nx.other !== 'Lantern vault', JSON.stringify(nx));
  check('the Menu button hides while the Nexus screen is open', nx.nav === 'none', JSON.stringify(nx));
  check('nexus flow: no console errors, DB 0', T.errors.length === 0 && T.db.count() === 0, T.errors.join(' | '));
  await T.ctx.close();

  // ---- the feedback box at the end of the settings sheet ----
  T = await open(browser, PHONE, WORLD + '&feedback=1');
  await T.page.tap('#mm-gear-btn'); await T.page.waitForTimeout(150);
  await T.page.waitForFunction(() => { const h = document.getElementById('mm-settings-feedback'); return !!h && h.children.length > 0; }, null, { timeout: 8000 }).catch(() => {});
  const fb = await T.page.evaluate(() => { const h = document.getElementById('mm-settings-feedback'); const card = document.querySelector('#mm-settings .rm-card'); return { has: !!h && h.children.length > 0, last: !!h && card.lastElementChild === h, inSheet: !!h && document.getElementById('mm-settings').contains(h), mod: !!window.MMFeedback }; });
  check('settings: the feedback box (MMFeedback.mount, page realm) is the last part of the sheet' + (fbReal === false ? ' (stub: mm-feedback.js not on disk yet)' : ''), fb.has && fb.last && fb.inSheet && fb.mod, JSON.stringify(fb));
  // typing in the box never drives the hero
  const typed = await T.page.evaluate(() => { const h = document.getElementById('mm-settings-feedback'); const t = h.querySelector('textarea, input, summary, button') || h; const ev = new KeyboardEvent('keydown', { key: 'b', bubbles: true }); t.dispatchEvent(ev); return window.__mm.arena.panel; });
  check('settings: a key typed in the feedback box does not reach the game (no backpack opens)', typed !== 'bp', String(typed));
  check('feedback flow: no console errors, DB 0', T.errors.length === 0 && T.db.count() === 0, T.errors.join(' | '));
  await T.ctx.close();
  // without ?feedback=1 a test page never requests the module (no 404 noise in other tests)
  T = await open(browser, DESK, WORLD);
  const reqs = []; T.page.on('request', (r) => reqs.push(r.url()));
  await T.page.click('#mm-gear-btn'); await T.page.waitForTimeout(300);
  check('?test=1 without ?feedback=1: mm-feedback.js is not requested', !reqs.some((u) => /mm-feedback/.test(u)), reqs.filter((u) => /mm-feedback/.test(u)).join(','));
  await T.ctx.close();

  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
