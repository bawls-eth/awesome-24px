// Browser test for the shared MMNav sheet on a fixture page (design/NAV-AUDIT.md 4.5 checks 1-3 and 9).
//   python3 -m http.server 8440 &   NODE_PATH=$(npm root -g) node game/tests/nav-sheet.test.js
// Standalone pages only: never joins the town. Firebase hosts are blocked (blockDb) and every request is
// recorded; registry pages the test navigates to are answered with tiny local stubs, so nothing heavy loads.
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const ORIGIN = new URL(BASE).origin;
const GAME = BASE.replace(/index\.html.*$/, '');
const FIXTURE = GAME + 'tests/fixtures/nav-fixture.html';
const FB = /firebase|googleapis|gstatic|firebaseio|identitytoolkit|securetoken/i;
const SAVE = JSON.stringify({ v: 1, name: 'ADMINnav', bells: 123, note: 'byte-identical' });

const stub = (title) => `<!doctype html><meta charset="utf-8"><title>${title}</title><body><h1>${title}</h1><a id="to-fixture" href="${FIXTURE}">fixture</a></body>`;

async function run(label, ctxOpts, tapper) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(ctxOpts);
  const db = await blockDb(ctx);
  const reqs = [];
  ctx.on('request', (r) => reqs.push(r.url()));
  // registry pages (not the fixture or shared files) become stubs
  await ctx.route(/\/game\/(index\.html|hub\/index\.html|games\/[a-z-]+\/[a-z-]+\.html)(\?.*)?$/, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: stub(new URL(route.request().url()).pathname) }));
  await ctx.addInitScript((v) => { try { if (!localStorage.getItem('pixeltown-save-v1')) localStorage.setItem('pixeltown-save-v1', v); } catch (e) { /* opaque origin */ } }, SAVE);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const vw = ctxOpts.viewport;
  const L = (s) => `[${label}] ${s}`;

  await page.goto(FIXTURE);
  await page.waitForSelector('#mm-nav-btn');
  const btn = await page.evaluate(() => {
    const b = document.getElementById('mm-nav-btn').getBoundingClientRect();
    const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    const hud = document.getElementById('fake-hud').getBoundingClientRect();
    const leg = document.getElementById('old-hub').getBoundingClientRect();
    return { x: b.left, y: b.top, w: b.width, h: b.height, onTop: !!top && !!top.closest('#mm-nav-btn'), hudLeft: hud.left, legW: leg.width, legInDom: !!document.getElementById('old-hub'), bodyOn: document.body.classList.contains('mm-nav-on'), label: document.getElementById('mm-nav-btn').getAttribute('aria-label') };
  });
  check(L('1: Menu button is at least 48x48 and nothing covers it'), btn.w >= 48 && btn.h >= 48 && btn.onTop, JSON.stringify(btn));
  check(L('2: Menu button sits within 16 px of the top-left corner'), btn.x <= 16 && btn.y <= 16 && btn.x >= 0 && btn.y >= 0, JSON.stringify(btn));
  check(L('button is labelled "Menu: where to go"'), btn.label === 'Menu: where to go');
  check(L('avoid: the page HUD moved right of the button'), btn.hudLeft >= btn.x + btn.w, JSON.stringify(btn));
  check(L('legacy links are hidden visually but stay in the DOM'), btn.legInDom && btn.legW <= 1 && btn.bodyOn, JSON.stringify(btn));
  const lbl = await page.evaluate(() => getComputedStyle(document.querySelector('.mm-nav-btn-label')).display);
  check(L('button shows the word Menu on desktop, icon only under 480 px'), vw.width < 480 ? lbl === 'none' : lbl !== 'none', lbl);

  // 3: one tap opens the sheet
  await tapper(page, '#mm-nav-btn');
  await page.waitForTimeout(250);
  const sh = await page.evaluate(() => {
    const vis = (n) => { const r = n.getBoundingClientRect(); const cs = getComputedStyle(n); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; };
    const dialogs = [...document.querySelectorAll('[role=dialog][aria-modal=true]')].filter(vis);
    const sheet = document.getElementById('mm-nav-sheet');
    const t = document.getElementById(sheet.getAttribute('aria-labelledby'));
    const dests = [...sheet.querySelectorAll('.mm-nav-dest')].map((a) => { const r = a.getBoundingClientRect(); return { id: a.dataset.place, w: r.width, h: r.height, name: a.querySelector('.mm-nav-dest-name').textContent, desc: a.querySelector('.mm-nav-dest-desc').textContent, icon: a.querySelector('.mm-nav-ico').textContent, href: a.getAttribute('href') }; });
    const ctrls = [...sheet.querySelectorAll('a,button')].filter(vis).map((n) => { const r = n.getBoundingClientRect(); return { id: n.id || n.className, w: r.width, h: r.height }; });
    const back = document.getElementById('mm-nav-back');
    return { dialogs: dialogs.length, open: vis(sheet), title: t && t.textContent, dests, small: ctrls.filter((c) => c.w < 44 || c.h < 44), focusIn: sheet.contains(document.activeElement), back: back && back.querySelector('.mm-nav-row-label').textContent, backHref: back && back.getAttribute('href'), cont: !!document.getElementById('mm-nav-continue'), sw: document.documentElement.scrollWidth, iw: window.innerWidth, ssw: sheet.scrollWidth, scw: sheet.clientWidth, expanded: document.getElementById('mm-nav-btn').getAttribute('aria-expanded') };
  });
  check(L('3: one tap opens the sheet, exactly one visible modal dialog, labelled "Where to?"'), sh.open && sh.dialogs === 1 && sh.title === 'Where to?' && sh.expanded === 'true', JSON.stringify({ open: sh.open, d: sh.dialogs, t: sh.title }));
  check(L('14 places listed with icon, name and one-line description'), sh.dests.length === 14 && sh.dests.every((d) => d.icon && d.name && d.desc && d.href), JSON.stringify(sh.dests.map((d) => d.id)));
  check(L('every destination and control is at least 44x44'), sh.dests.every((d) => d.w >= 44 && d.h >= 44) && sh.small.length === 0, JSON.stringify(sh.small));
  check(L('destination hrefs are relative to the page depth'), sh.dests.find((d) => d.id === 'town').href === '../../index.html' && sh.dests.find((d) => d.id === 'realm').href === '../../games/mad-maze/index.html?mode=world', JSON.stringify(sh.dests.map((d) => d.href)));
  check(L('focus moved into the sheet'), sh.focusIn);
  check(L('Back falls back to the page backHref when there is no referrer'), sh.back === 'Back to World map' && sh.backHref === '../../hub/index.html', sh.back + ' ' + sh.backHref);
  check(L('no Continue with empty storage'), !sh.cont);
  check(L('no horizontal scroll (page and sheet)'), sh.sw <= sh.iw && sh.ssw <= sh.scw, JSON.stringify({ sw: sh.sw, iw: sh.iw, ssw: sh.ssw, scw: sh.scw }));

  // every destination resolves to an existing file (HTTP 200, checked against the real server via the request API)
  const codes = [];
  for (const d of sh.dests) { const u = new URL(d.href, FIXTURE).toString().split('?')[0]; const r = await ctx.request.get(u); codes.push(r.status()); }
  check(L('all 10 destination files answer HTTP 200'), codes.every((c) => c === 200), codes.join(','));

  // focus trap
  let trapped = true;
  for (let i = 0; i < 24; i++) { await page.keyboard.press(i % 5 === 4 ? 'Shift+Tab' : 'Tab'); if (!(await page.evaluate(() => document.getElementById('mm-nav-sheet').contains(document.activeElement)))) trapped = false; }
  check(L('Tab and Shift+Tab stay inside the sheet'), trapped);
  // the game behind does not see keys while open
  const leaked = await page.evaluate(() => { let n = 0; const f = () => n++; window.addEventListener('keydown', f); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' })); window.removeEventListener('keydown', f); return n; });
  check(L('keys do not reach the page while the sheet is open'), leaked === 0);
  // review N1: real key events. keydown is held back, keyup still reaches the page so a game never keeps a key "down".
  await page.evaluate(() => { window.__kd = 0; window.__ku = 0; window.addEventListener('keydown', (e) => { if (e.key === 'd') window.__kd++; }); window.addEventListener('keyup', (e) => { if (e.key === 'd') window.__ku++; }); });
  await page.keyboard.down('d');
  await page.keyboard.up('d');
  const ku = await page.evaluate(() => ({ kd: window.__kd, ku: window.__ku, open: !document.getElementById('mm-nav-sheet').hidden }));
  check(L('a real keyup passes through the open sheet (no stuck key), the keydown does not'), ku.kd === 0 && ku.ku === 1 && ku.open, JSON.stringify(ku));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  const closed = await page.evaluate(() => ({ hidden: document.getElementById('mm-nav-sheet').hidden, focus: document.activeElement && document.activeElement.id, exp: document.getElementById('mm-nav-btn').getAttribute('aria-expanded') }));
  check(L('Esc closes and focus returns to the Menu button'), closed.hidden && closed.focus === 'mm-nav-btn' && closed.exp === 'false', JSON.stringify(closed));

  // close button and backdrop, no stacking on double open
  await tapper(page, '#mm-nav-btn');
  await tapper(page, '#mm-nav-close');
  const c2 = await page.evaluate(() => document.getElementById('mm-nav-sheet').hidden);
  await page.evaluate(() => { MMNav.open(); MMNav.open(); });
  const c3 = await page.evaluate(() => document.querySelectorAll('.mm-nav-sheet:not([hidden])').length);
  await page.mouse.click(vw.width - 4, 4);
  const c4 = await page.evaluate(() => document.getElementById('mm-nav-sheet').hidden);
  check(L('the X closes, double open never stacks, a backdrop tap closes'), c2 && c3 === 1 && c4, JSON.stringify({ c2, c3, c4 }));

  // hooks
  const hk = await page.evaluate(() => { const log = []; MMNav.onOpen(() => log.push('open')); MMNav.onClose(() => log.push('close')); MMNav.onSettings(() => log.push('settings')); MMNav.open(); const shown = !document.getElementById('mm-nav-settings').hidden; document.getElementById('mm-nav-settings').click(); return { log, shown }; });
  check(L('onOpen/onClose/onSettings hooks fire; Settings shows only when registered'), hk.shown && hk.log.join() === 'open,close,settings', JSON.stringify(hk));

  // Back (fallback) navigates
  await tapper(page, '#mm-nav-btn');
  await Promise.all([page.waitForNavigation(), tapper(page, '#mm-nav-back')]);
  check(L('Back (fallback) lands on the World map'), /\/game\/hub\/index\.html$/.test(page.url()), page.url());

  // Back from a same-origin referrer: Stalk -> fixture -> Back -> Stalk
  await page.goto(GAME + 'games/stalk/index.html');
  await Promise.all([page.waitForNavigation(), page.click('#to-fixture')]);
  await page.waitForSelector('#mm-nav-btn');
  await tapper(page, '#mm-nav-btn');
  const rb = await page.evaluate(() => ({ t: document.querySelector('#mm-nav-back .mm-nav-row-label').textContent, h: document.getElementById('mm-nav-back').getAttribute('href') }));
  check(L('Back uses the same-origin referrer: "Back to Stalk Market"'), rb.t === 'Back to Stalk Market' && rb.h === '../../games/stalk/index.html', JSON.stringify(rb));
  await Promise.all([page.waitForNavigation(), tapper(page, '#mm-nav-back')]);
  check(L('Back lands on the Stalk Market'), /\/game\/games\/stalk\/index\.html$/.test(page.url()), page.url());

  // Continue
  await page.goto(FIXTURE);
  await page.evaluate(() => localStorage.setItem('pixeltown-nav-v1', JSON.stringify({ v: 1, last: { id: 'isles', sub: 'Coral Reef', url: 'game/games/isles/index.html?isle=reef', t: 1 }, prev: null })));
  await page.reload();
  await tapper(page, '#mm-nav-btn');
  const ct = await page.evaluate(() => { const c = document.getElementById('mm-nav-continue'); return c && { t: c.textContent, h: c.getAttribute('href'), first: document.querySelector('.mm-nav-top').firstElementChild === c }; });
  check(L('Continue says where it goes and comes first'), ct && /Continue: Isles - Coral Reef$/.test(ct.t) && ct.h === '../../games/isles/index.html?isle=reef' && ct.first, JSON.stringify(ct));
  await Promise.all([page.waitForNavigation(), tapper(page, '#mm-nav-continue')]);
  check(L('Continue lands on isles?isle=reef'), /\/game\/games\/isles\/index\.html\?isle=reef$/.test(page.url()), page.url());

  // corrupt storage -> defaults, no errors
  await page.goto(FIXTURE);
  await page.evaluate(() => localStorage.setItem('pixeltown-nav-v1', '{"__proto__":{"x":1},"last":{"id":"<img src=x>"'));
  await page.reload();
  await tapper(page, '#mm-nav-btn');
  const cr = await page.evaluate(() => ({ cont: !!document.getElementById('mm-nav-continue'), polluted: ({}).x, imgs: document.querySelectorAll('#mm-nav-root img').length, dests: document.querySelectorAll('.mm-nav-dest').length }));
  check(L('corrupt pixeltown-nav-v1 -> defaults (no Continue, no pollution, no injected markup)'), !cr.cont && cr.polluted === undefined && cr.imgs === 0 && cr.dests === 14, JSON.stringify(cr));

  // ?nav=0 and embedded: no button, legacy links stay visible
  await page.goto(FIXTURE + '?nav=0');
  const off = await page.evaluate(() => ({ btn: !!document.getElementById('mm-nav-btn'), on: document.body.classList.contains('mm-nav-on'), legW: document.getElementById('old-hub').getBoundingClientRect().width }));
  check(L('?nav=0: no Menu, legacy links shown'), !off.btn && !off.on && off.legW >= 44, JSON.stringify(off));
  await page.evaluate((src) => new Promise((res) => { const f = document.createElement('iframe'); f.id = 'emb'; f.src = src; f.style.width = '360px'; f.style.height = '400px'; f.onload = res; document.body.appendChild(f); }), FIXTURE);
  const emb = await page.frame({ url: FIXTURE }).evaluate(() => ({ btn: !!document.getElementById('mm-nav-btn'), api: typeof MMNav === 'object', mounted: MMNav.mounted() }));
  check(L('embedded (iframe): the module loads but never mounts'), !emb.btn && emb.api && !emb.mounted, JSON.stringify(emb));

  // 9: storage + network
  const ls = await page.evaluate(() => ({ save: localStorage.getItem('pixeltown-save-v1'), keys: Object.keys(localStorage).sort() }));
  check(L('9: pixeltown-save-v1 byte-identical, only pixeltown-nav-v1 added'), ls.save === SAVE && JSON.stringify(ls.keys) === JSON.stringify(['pixeltown-nav-v1', 'pixeltown-save-v1']), JSON.stringify(ls.keys));
  const foreign = reqs.filter((u) => !u.startsWith(ORIGIN + '/'));
  check(L('no requests besides same-origin static files'), foreign.length === 0, foreign.slice(0, 5).join(' '));
  check(L('0 requests to firebase hosts (HTTP or WebSocket)'), reqs.filter((u) => FB.test(u)).length === 0 && db.attempts() === 0, JSON.stringify({ http: db.http, ws: db.ws }));
  check(L('no console errors'), errors.length === 0, errors.join(' | '));
  await browser.close();
}

(async () => {
  await run('phone 390x844', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, (p, sel) => p.tap(sel));
  await run('desktop 1280x720', { viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' }, (p, sel) => p.click(sel));
  // 360 px and reduced motion
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  await blockDb(ctx);
  const page = await ctx.newPage();
  await page.goto(FIXTURE);
  await page.tap('#mm-nav-btn');
  const r = await page.evaluate(() => { const s = document.getElementById('mm-nav-sheet'); return { anim: getComputedStyle(s).animationName, sw: document.documentElement.scrollWidth, iw: innerWidth, ssw: s.scrollWidth, scw: s.clientWidth, minH: Math.min(...[...s.querySelectorAll('.mm-nav-dest')].map((a) => a.getBoundingClientRect().height)) }; });
  check('[360x640] fits with no horizontal scroll, targets >= 64 px tall, reduced motion turns the animation off', r.sw <= r.iw && r.ssw <= r.scw && r.minH >= 64 && r.anim === 'none', JSON.stringify(r));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
