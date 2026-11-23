// NAV slice D (design/NAV-AUDIT.md 4.1, 4.6): the shared Menu on the World map (hub) and on the Isles page.
// Hub: a Town (Back) button and the Menu are on screen; Campfire Jam and Stalk Market have Play links that resolve; every game
//   node has a map label and a games-strip entry, and every game is reachable from a FRESH save in <= 2 taps (strip, Play) while
//   its map path stays a locked bonus; the phone hint chip shows on phones, is dismissible and stays dismissed.
// Isles: the Menu replaces the unlabeled top-left "<-" (kept in the DOM as mm-nav-legacy, shown again with ?nav=0, labelled);
//   "Home dock" (not "Home"); a locked sea-chart row has a "Craft it" button that opens the craft panel at that recipe;
//   ?isle=reef from a fresh save reaches the craft panel in <= 3 taps; the Menu and the HUD / minimap never overlap at 390x844
//   and 1280x720; one dialog at a time; the feedback widget (static tag since XW1) mounts in the island log.
// Both pages: 0 DB attempts (blockDb), no console errors, pixeltown-save-v1 byte-identical.
// Run: python3 -m http.server 8991 &  BASE=http://localhost:8991/game/index.html NODE_PATH=$(npm root -g) node game/tests/nav-hub-isles.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const ORIGIN = new URL(BASE).origin;
const GAME = BASE.replace(/index\.html.*$/, '');
const HUB = GAME + 'hub/index.html';
const ISLES = GAME + 'games/isles/index.html';
const SAVE = JSON.stringify({ name: 'ADMINnavd', species: 'coolcats', frame: 1, realm: { level: 2 } });
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const DESK = { viewport: { width: 1280, height: 720 } };
const all = [];
// IF1: a locked island opened by URL lands at the home dock now, so the reef pages here start from a save that crafted a raft (reef in
// `unlock`, nothing else: an empty pack, no tames, no visits)
const REEF_OPEN = { 'pixeltown-archipelago-v1': JSON.stringify({ v: 1, at: 'home', unlock: ['jungle', 'reef'], isles: {}, visited: [] }) };

async function open(browser, ctxOpts, url, opt) {
  opt = opt || {};
  const ctx = await browser.newContext(ctxOpts);
  const db = await blockDb(ctx);
  if (opt.route) await opt.route(ctx);
  await ctx.addInitScript((s) => {
    if (sessionStorage.seeded) return;
    sessionStorage.seeded = '1';
    localStorage.clear();
    Object.keys(s).forEach((k) => localStorage.setItem(k, s[k]));
  }, Object.assign({ 'pixeltown-save-v1': SAVE }, opt.seed || {}));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(url);
  const o = { ctx, page, errors, db };
  all.push(o);
  return o;
}
const tapper = (mobile) => (page, sel) => (mobile ? page.tap(sel) : page.click(sel));
const rect = (page, sel) => page.evaluate((s) => { const n = document.querySelector(s); if (!n) return null; const r = n.getBoundingClientRect(); const cs = getComputedStyle(n); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, vis: r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' }; }, sel);
const overlap = (a, b) => !!a && !!b && a.vis && b.vis && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
const onTop = (page, sel) => page.evaluate((s) => { const n = document.querySelector(s); const r = n.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!e && (e === n || n.contains(e)); }, sel);
async function status(page, href) {
  const abs = new URL(href, page.url()).href;
  const r = await page.request.get(abs);
  return r.status();
}

async function hub(browser, label, ctxOpts) {
  const mobile = !!ctxOpts.isMobile;
  const tap = tapper(mobile);
  const L = (s) => '[hub ' + label + '] ' + s;
  const o = await open(browser, ctxOpts, HUB + '?map=1'); // HS1: the map view (the home screen is the default)
  const pg = o.page;
  await pg.waitForFunction(() => window.__hub && document.getElementById('mm-nav-btn'));
  await pg.waitForTimeout(200);

  // Menu + Town button: the hub never dead-ends
  const btn = await rect(pg, '#mm-nav-btn'), town = await rect(pg, '#hub-town');
  check(L('Menu button is visible, >= 48 px, top-left, not covered'), btn.vis && btn.w >= 48 && btn.h >= 48 && btn.l <= 16 && btn.t <= 16 && await onTop(pg, '#mm-nav-btn'), JSON.stringify(btn));
  const townInfo = await pg.evaluate(() => { const a = document.getElementById('hub-town'); return { text: a.textContent, href: a.getAttribute('href') }; });
  check(L('Back/Town button is visible (>= 44 px), says Town, links to the Town'), town.vis && town.w >= 44 && town.h >= 44 && /Town/.test(townInfo.text) && townInfo.href === '../index.html?from=hub' && await onTop(pg, '#hub-town'), JSON.stringify([town, townInfo]));
  check(L('Town button href resolves (HTTP 200)'), (await status(pg, townInfo.href)) === 200);
  const hudMain = await rect(pg, '#hud .hud-main'), stats = await rect(pg, '#hud .hud-stats');
  check(L('Menu does not overlap the HUD name or stats'), !overlap(btn, hudMain) && !overlap(btn, stats), JSON.stringify({ btn, hudMain, stats }));

  // every game node: a strip entry, a label on its map, and <= 2 taps (strip, Play) from this FRESH save
  const games = await pg.evaluate(() => window.__hub.gameNodes());
  const links = await pg.evaluate(() => window.__hub.links());
  check(L('12 game nodes (Hearthvale, Lantern, Deepdelve, Angler, Bug Safari, Jam, Stalk, Pixel Pop, Lantern Dash, Stack Tower, Echo Garden, Isles) all have links'), games.length === 12 && ['w2-lantern', 'w3-deepdelve', 'w4-angler', 'w5-safari', 'w5-jam', 'w5-stalk', 'w5-pop', 'w5-dash', 'w5-stack', 'w5-echo', 'w7-isles', 'w1-hearthvale'].every((id) => games.includes(id) && links[id]), games.join(','));
  const fresh = await pg.evaluate(() => localStorage.getItem('pixeltown-hub-v1'));
  for (const id of games) {
    const before = await pg.evaluate(() => window.__hub.at);
    await tap(pg, '#hub-games button[data-node="' + id + '"]');           // tap 1
    const c = await pg.evaluate(() => ({ title: document.getElementById('card-title').textContent, href: document.getElementById('card-play').getAttribute('href'), play: !document.getElementById('card-play').hidden && !document.getElementById('card').hidden, soon: !document.getElementById('card-soon').hidden }));
    const pr = await rect(pg, '#card-play');
    const code = c.href ? await status(pg, c.href) : 0;                    // tap 2 would be Play
    check(L(id + ': reachable in 2 taps from a fresh save (card with Play, link resolves 200)'), c.play && !c.soon && c.href === links[id] && pr.vis && pr.h >= 44 && code === 200 && (await pg.evaluate(() => window.__hub.at)) === before, JSON.stringify({ c, code }));
    await pg.keyboard.press('Escape');
  }
  check(L('opening game cards did not change the hub save (unlock progress untouched)'), (await pg.evaluate(() => localStorage.getItem('pixeltown-hub-v1'))) === fresh);
  const bonus = await pg.evaluate(() => ['w3-deepdelve', 'w4-angler', 'w5-jam', 'w5-stalk', 'w5-safari'].map((id) => window.__hub.isReachable(id)));
  check(L('their map paths are still a locked bonus on a fresh save (medal gates unchanged)'), bonus.every((r) => r === false), JSON.stringify(bonus));

  // Jam and Stalk: Play links (they said "Coming soon" before)
  for (const [id, want] of [['w5-jam', '../games/jam/index.html'], ['w5-stalk', '../games/stalk/index.html']]) {
    await tap(pg, '#hub-games button[data-node="' + id + '"]');
    const href = await pg.getAttribute('#card-play', 'href');
    check(L(id + ' card has a Play link to ' + want + ' that resolves'), href === want && (await status(pg, href)) === 200, String(href));
    await pg.keyboard.press('Escape');
  }

  // labels: every game node is labelled on its own world's map (seed the position, reload)
  const fails = [];
  for (const id of games.concat(['w0-hearthvale'])) {
    await pg.evaluate((at) => localStorage.setItem('pixeltown-hub-v1', JSON.stringify({ v: 1, at })), id);
    await pg.reload();
    await pg.waitForFunction(() => window.__hub);
    await pg.waitForTimeout(120);
    const lb = await pg.evaluate((i) => { const c = document.getElementById('map'); return { l: window.__hub.labels().find((x) => x.id === i), cw: c.width, ch: c.height }; }, id);
    if (!lb.l || !lb.l.text || lb.l.x < 0 || lb.l.y < 0 || lb.l.x + lb.l.w > lb.cw || lb.l.y + lb.l.h > lb.ch) fails.push(id + ':' + JSON.stringify(lb));
  }
  check(L('every game / gate node has a label inside the map canvas'), fails.length === 0, fails.join(' '));
  const stubs = await pg.evaluate(() => window.__hub.labels().filter((x) => /^stub:/.test(x.id)).length);
  check(L('edge signposts are labelled with the world they lead to'), stubs >= 1, String(stubs));

  // phone hint chip
  const chip = await rect(pg, '#hint-chip');
  if (mobile) {
    const x = await rect(pg, '#hint-chip-x');
    check(L('phone: the hint chip is shown, its dismiss button >= 44 px'), chip.vis && x.w >= 44 && x.h >= 44 && /Tap a place/.test(await pg.textContent('#hint-chip')), JSON.stringify([chip, x]));
    await tap(pg, '#hint-chip-x');
    const gone = await rect(pg, '#hint-chip');
    await pg.reload(); await pg.waitForFunction(() => window.__hub); await pg.waitForTimeout(100);
    check(L('phone: dismissing hides the chip and it stays dismissed after a reload'), !gone.vis && !(await rect(pg, '#hint-chip')).vis);
    const sc = await pg.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    check(L('phone: no horizontal page scroll'), sc.sw <= sc.cw, JSON.stringify(sc));
  } else {
    check(L('desktop: the hint stays the footer text (no chip)'), !chip.vis && (await rect(pg, '#hint')).vis);
  }

  // Menu opens the sheet with the 14 places; exactly one dialog
  await tap(pg, '#mm-nav-btn');
  const sh = await pg.evaluate(() => ({ dests: document.querySelectorAll('#mm-nav-sheet .mm-nav-dest').length, dialogs: [...document.querySelectorAll('[role=dialog][aria-modal=true]')].filter((n) => !n.hidden && n.getBoundingClientRect().height > 0).length, back: document.querySelector('#mm-nav-back .mm-nav-row-label').textContent }));
  check(L('Menu opens "Where to?" with 14 places, one dialog, Back to Town'), sh.dests === 14 && sh.dialogs === 1 && sh.back === 'Back to Town', JSON.stringify(sh));
  await pg.keyboard.press('Escape');
  check(L('Esc closes the sheet'), !(await pg.evaluate(() => window.MMNav.isOpen())));
  return o;
}

async function isles(browser, label, ctxOpts) {
  const mobile = !!ctxOpts.isMobile;
  const tap = tapper(mobile);
  const L = (s) => '[isles ' + label + '] ' + s;
  let fbReq = 0;
  const o = await open(browser, ctxOpts, ISLES + '?isle=reef&at=dock', { seed: REEF_OPEN, route: (ctx) => ctx.route(/mm-feedback\.js/, (r) => { fbReq++; return r.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.__fbMounts=[];window.MMFeedback={mount:function(el,o){window.__fbMounts.push({id:el.id,page:o&&o.page});var p=document.createElement("p");p.className="fb-stub";p.textContent="Feedback";el.appendChild(p);}};' }); }) });
  const pg = o.page;
  await pg.waitForSelector('#mm-nav-btn');
  await pg.waitForTimeout(400);
  const btn = await rect(pg, '#mm-nav-btn'), hud = await rect(pg, '#hud'), mini = await rect(pg, '#mini-wrap'), back = await rect(pg, '#back');
  check(L('Menu button is visible, >= 48 px, top-left, not covered'), btn.vis && btn.w >= 48 && btn.h >= 48 && btn.l <= 16 && btn.t <= 16 && await onTop(pg, '#mm-nav-btn'), JSON.stringify(btn));
  check(L('no overlap: Menu vs HUD vs minimap'), !overlap(btn, hud) && !overlap(btn, mini) && !overlap(hud, mini), JSON.stringify({ btn, hud, mini }));
  const backInfo = await pg.evaluate(() => { const a = document.getElementById('back'); return { inDom: !!a, legacy: a.classList.contains('mm-nav-legacy'), label: a.getAttribute('aria-label'), text: a.textContent }; });
  check(L('the old "<-" link is now labelled and kept in the DOM as mm-nav-legacy (hidden)'), backInfo.inDom && backInfo.legacy && back.w <= 1 && /World map/.test(backInfo.text) && /World map/.test(backInfo.label), JSON.stringify([backInfo, back]));
  // 8B: the first-visit how-to (5 short lines) never takes a tap; the thin top bar stays clear of the stick / Attack / action column
  const how = await pg.evaluate(() => { const b = document.getElementById('howto'); return { vis: !b.hidden, n: b.querySelectorAll('li').length, pe: getComputedStyle(b).pointerEvents, min: Math.min(...[...b.querySelectorAll('li')].map((li) => parseFloat(getComputedStyle(li).fontSize))) }; });
  check(L('8B: a fresh visit shows the 5-line how-to (text >= 12 px) that never blocks a tap'), how.vis && how.n === 5 && how.pe === 'none' && how.min >= 12, JSON.stringify(how));
  const stk = await rect(pg, '#stick'), fire = await rect(pg, '#btn-fire'), acts = await rect(pg, '#acts');
  check(L('8B: the top bar is thin (<= 130 px) and clear of the stick, Attack and the action buttons'), hud.h <= 130 && !overlap(hud, stk) && !overlap(hud, fire) && !overlap(hud, acts) && (label !== '390x844' || (fire.vis && (await pg.textContent('#btn-fire')) === 'Attack' && fire.l > stk.r)), JSON.stringify({ hud, stk, fire, acts }));
  // 8B: one Pack button in the top bar holds Party (Home dock) / Craft / Log / Help
  const pk = await rect(pg, '#btn-pack');
  check(L('the Pack button is visible (>= 44 px), not under the Menu or the minimap, on top'), pk.vis && pk.w >= 44 && pk.h >= 44 && !overlap(btn, pk) && !overlap(mini, pk) && await onTop(pg, '#btn-pack'), JSON.stringify(pk));
  await tap(pg, '#btn-pack');
  const tabs = await pg.evaluate(() => ({ open: !document.getElementById('panel').hidden, title: document.getElementById('panel-title').textContent, tabs: [...document.querySelectorAll('#pack-tabs [role=tab]')].map((b) => b.textContent), sel: (document.querySelector('#pack-tabs [aria-selected=true]') || {}).id }));
  check(L('Pack opens one panel with at most 4 tabs (Party / Craft / Log / Help), Party selected'), tabs.open && tabs.title === 'Pack' && tabs.tabs.join() === 'Party,Craft,Log,Help' && tabs.sel === 'tab-party', JSON.stringify(tabs));
  check(L('8B: opening the Pack hides the how-to'), (await pg.evaluate(() => document.getElementById('howto').hidden)) === true);
  await tap(pg, '#tab-help');
  const hp = await pg.evaluate(() => ({ title: document.getElementById('panel-title').textContent, n: document.querySelectorAll('#help-list li').length, sel: (document.querySelector('#pack-tabs [aria-selected=true]') || {}).id,
    tabs: [...document.querySelectorAll('#pack-tabs button')].map((b) => { const r = b.getBoundingClientRect(); return Math.min(r.width, r.height); }), sw: document.documentElement.scrollWidth <= document.documentElement.clientWidth }));
  check(L('8B: the Help tab shows the same 5 lines; every tab is >= 44 px; no sideways scroll'), hp.title === 'Help' && hp.n === 5 && hp.sel === 'tab-help' && hp.tabs.length === 4 && hp.tabs.every((v) => v >= 44) && hp.sw, JSON.stringify(hp));
  await tap(pg, '#tab-party');
  const home = await pg.evaluate(() => { const b = document.getElementById('btn-home'); return { text: b.textContent, vis: !b.hidden }; });
  check(L('"Home dock" button (not "Home") away from home'), home.vis && home.text === 'Home dock', JSON.stringify(home));
  const hb = await rect(pg, '#btn-home');
  check(L('Home dock button is not under the Menu'), !overlap(btn, hb) && await onTop(pg, '#btn-home'), JSON.stringify(hb));

  // fresh save, ?isle=reef: Pack, Craft reaches the craft panel (8B: 2 taps, <= 3)
  await tap(pg, '#btn-craft');                                                     // tap 2 (Pack was tap 1)
  const cp = await pg.evaluate(() => ({ open: !document.getElementById('panel').hidden, title: document.getElementById('panel-title').textContent, rows: document.querySelectorAll('#panel-body .recipe').length }));
  check(L('?isle=reef, fresh save: the craft panel is 2 taps away: Pack, Craft (<= 3)'), cp.open && cp.title === 'Craft' && cp.rows > 0, JSON.stringify(cp));
  await tap(pg, '#panel-close');

  // the sea chart: Home dock row and a locked Mars row with "Craft it" (2 taps from the reef dock: Sail, Craft it)
  await pg.waitForFunction(() => !document.getElementById('btn-sail').hidden, null, { timeout: 5000 }).catch(() => {});
  const sail = await rect(pg, '#btn-sail');
  check(L('the Sail button is shown at the reef dock and not covered'), sail.vis && sail.h >= 44 && await onTop(pg, '#btn-sail'), JSON.stringify(sail));
  await tap(pg, '#btn-sail');                                                      // tap 1
  const chart = await pg.evaluate(() => ({ dests: [...document.querySelectorAll('#panel-body button.dest')].map((b) => ({ isle: b.dataset.isle, dis: b.disabled, t: b.textContent })), craftIt: [...document.querySelectorAll('#panel-body button.craft-it')].map((b) => { const r = b.getBoundingClientRect(); return { isle: b.dataset.isle, need: b.dataset.need, t: b.textContent, w: r.width, h: r.height }; }) }));
  const homeRow = chart.dests.find((d) => d.isle === 'home');
  check(L('sea chart says "Home dock: ..." for the home island'), homeRow && /^Home dock: /.test(homeRow.t), JSON.stringify(chart.dests));
  const mars = chart.craftIt.find((c) => c.isle === 'mars');
  check(L('the locked Mars row has a "Craft it" button (>= 44 px) for the rocket core'), mars && mars.t === 'Craft it' && mars.need === 'rocket_core' && mars.w >= 44 && mars.h >= 44 && chart.dests.find((d) => d.isle === 'mars').dis, JSON.stringify(chart));
  // XW1: "Craft it" opens the rocket core build a fresh save can reach (rocket_core_drift); the iron build needs mars iron
  await tap(pg, '#panel-body button.craft-it[data-isle="mars"]');               // tap 2
  const after = await pg.evaluate(() => ({ title: document.getElementById('panel-title').textContent, open: !document.getElementById('panel').hidden, want: (document.querySelector('#panel-body .recipe.want') || {}).dataset }));
  check(L('?isle=reef&at=dock, fresh save: Sail, Craft it -> the craft panel at the reachable rocket core recipe (2 taps, <= 3)'), after.open && after.title === 'Craft' && after.want && after.want.recipe === 'rocket_core_drift' && after.want.item === 'rocket_core', JSON.stringify(after));
  const dlg = await pg.evaluate(() => [...document.querySelectorAll('[role=dialog][aria-modal=true]')].filter((n) => !n.hidden && n.getBoundingClientRect().height > 0).length);
  check(L('one dialog at a time'), dlg === 1, String(dlg));

  // the Menu closes the page panel (no stacking) and shows the 14 places
  await tap(pg, '#mm-nav-btn');
  const nav = await pg.evaluate(() => ({ open: window.MMNav.isOpen(), panel: document.getElementById('panel').hidden, dests: document.querySelectorAll('#mm-nav-sheet .mm-nav-dest').length, settings: !document.getElementById('mm-nav-settings').hidden }));
  check(L('Menu opens the sheet, closes the craft panel, offers Settings (the island log)'), nav.open && nav.panel && nav.dests === 14 && nav.settings, JSON.stringify(nav));
  await tap(pg, '#mm-nav-settings');
  const lg = await pg.evaluate(() => ({ nav: window.MMNav.isOpen(), title: document.getElementById('panel-title').textContent }));
  check(L('Settings opens the island log'), !lg.nav && lg.title === 'Island log', JSON.stringify(lg));
  await pg.waitForTimeout(150);
  const fb = await pg.evaluate(() => ({ mounts: window.__fbMounts || null, host: !!document.getElementById('log-feedback') }));
  check(L('island log: the feedback widget script loads once and MMFeedback.mount(el, {page:"isles"}) runs'), fb.host && fbReq === 1 && Array.isArray(fb.mounts) && fb.mounts.length === 1 && fb.mounts[0].id === 'log-feedback' && fb.mounts[0].page === 'isles', JSON.stringify({ fb, fbReq }));
  await tap(pg, '#panel-close');

  // last place recorded for Continue (additive key only)
  const nv = await pg.evaluate(() => JSON.parse(localStorage.getItem('pixeltown-nav-v1')));
  check(L('pixeltown-nav-v1 records Isles - Coral Reef with ?isle=reef'), nv && nv.last.id === 'isles' && nv.last.sub === 'Coral Reef' && /isle=reef/.test(nv.last.url), JSON.stringify(nv));
  check(L('pixeltown-save-v1 is byte-identical'), (await pg.evaluate(() => localStorage.getItem('pixeltown-save-v1'))) === SAVE);
  const sc = await pg.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  check(L('no horizontal scroll'), sc.sw <= sc.cw, JSON.stringify(sc));
  // 8B: the how-to is a first-visit card only: after a reload (the island is now in the archipelago save) it stays hidden; Help keeps it
  await pg.reload(); await pg.waitForSelector('#mm-nav-btn'); await pg.waitForTimeout(300);
  check(L('8B: a return visit does not show the how-to card again'), (await pg.evaluate(() => document.getElementById('howto').hidden)) === true);
  return o;
}

(async () => {
  const browser = await chromium.launch();
  await hub(browser, '1280x720', DESK);
  await hub(browser, '390x844', PHONE);
  await isles(browser, '1280x720', DESK);
  await isles(browser, '390x844', PHONE);

  // Isles with the test hook on: the feedback widget mounts in the island log (XW1: a static script tag; ?feedback=1 is no longer needed)
  {
    let req = 0;
    const o = await open(browser, DESK, ISLES + '?isle=reef&test=1&feedback=1', { route: (ctx) => ctx.route(/mm-feedback\.js/, (r) => { req++; return r.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.__fbMounts=[];window.MMFeedback={mount:function(el,o){window.__fbMounts.push({id:el.id,page:o&&o.page});}};' }); }) });
    await o.page.waitForFunction(() => window.__isles && window.__isles.world);
    await o.page.click('#btn-pack'); await o.page.click('#btn-log'); // 8B: Log is a Pack tab
    await o.page.waitForFunction(() => window.__fbMounts && window.__fbMounts.length > 0, null, { timeout: 5000 }).catch(() => {});
    const m = await o.page.evaluate(() => window.__fbMounts);
    check('[isles feedback] MMFeedback.mount(el, {page:"isles"}) is called once on the island log', req === 1 && Array.isArray(m) && m.length === 1 && m[0].id === 'log-feedback' && m[0].page === 'isles', JSON.stringify({ req, m }));
    await o.page.click('#panel-close'); await o.page.click('#btn-pack'); await o.page.click('#btn-log');
    check('[isles feedback] reopening the log mounts again into the new log, the script loads once', req === 1 && (await o.page.evaluate(() => window.__fbMounts.length)) === 2);
  }
  // XW1: mm-feedback.js is merged, so the isles page loads it with a static tag; the old "?test=1 skips unless ?feedback=1" stopgap is
  // gone. A ?test=1 page with the REAL module: one request, the real box mounts in the island log, console clean.
  {
    let req = 0;
    const o = await open(browser, PHONE, ISLES + '?isle=reef&test=1', { route: (ctx) => ctx.route(/mm-feedback\.js/, (r) => { req++; return r.continue(); }) });
    await o.page.waitForFunction(() => window.__isles && window.__isles.world);
    await o.page.tap('#btn-pack'); await o.page.tap('#btn-log');
    await o.page.waitForTimeout(200);
    const fb = await o.page.evaluate(() => { const h = document.getElementById('log-feedback'); return { mod: !!window.MMFeedback, host: !!h, kids: h ? h.children.length : 0, mounted: h ? h.dataset.fb === '1' : false }; });
    check('[isles ?test=1] the real feedback widget loads once (static tag) and mounts in the island log', req === 1 && fb.mod && fb.host && fb.mounted && fb.kids > 0 && (await o.page.textContent('#panel-title')) === 'Island log', JSON.stringify({ req, fb }));
    check('[isles ?test=1] no console errors with the real widget', o.errors.length === 0, o.errors.join(' | '));
  }
  // ?nav=0 keeps the old link visible, now labelled
  {
    const o = await open(browser, PHONE, ISLES + '?isle=reef&nav=0');
    await o.page.waitForTimeout(300);
    const b = await rect(o.page, '#back');
    check('[isles ?nav=0] no Menu; the labelled "World map" link is shown (>= 44 px)', !(await o.page.$('#mm-nav-btn')) && b.vis && b.h >= 44 && /World map/.test(await o.page.textContent('#back')), JSON.stringify(b));
  }
  // Continue: after the reef, the hub Menu offers "Continue: Isles - Coral Reef"
  {
    const o = await open(browser, DESK, ISLES + '?isle=reef', { seed: REEF_OPEN });
    await o.page.waitForSelector('#mm-nav-btn');
    await o.page.goto(HUB);
    await o.page.waitForSelector('#mm-nav-btn');
    await o.page.click('#mm-nav-btn');
    const c = await o.page.evaluate(() => { const r = document.getElementById('mm-nav-continue'); return r && { t: r.textContent, href: r.getAttribute('href') }; });
    check('[hub] Continue: Isles - Coral Reef links to isles?isle=reef', c && /Continue: Isles - Coral Reef/.test(c.t) && c.href === '../games/isles/index.html?isle=reef', JSON.stringify(c));
  }

  check('0 DB attempts on every page', all.every((o) => o.db.count() === 0), all.map((o) => o.db.count()).join(','));
  check('no console errors on any page', all.every((o) => o.errors.length === 0), all.map((o) => o.errors.join(' | ')).filter(Boolean).join(' || '));
  for (const o of all) await o.ctx.close().catch(() => {});
  await browser.close();
  done();
})();
