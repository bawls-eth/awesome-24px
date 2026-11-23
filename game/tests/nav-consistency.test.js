// Shared Menu (MMNav) on the six minigame pages (design/NAV-AUDIT.md 4.5, slice B): Jam, Bug Safari, Stalk Market,
// Angler, Deepdelve, Lantern Camp. Phone (390x844 touch) and desktop (1280x720).
//   python3 -m http.server 8440 &   NODE_PATH=$(npm root -g) node game/tests/nav-consistency.test.js
// Standalone pages only: never joins the town. Firebase hosts are blocked (blockDb); 0 firebase requests are expected.
// Set THREE_JS=<file> to serve three.js locally instead of the pinned CDN script (Deepdelve).
const { chromium } = require('playwright');
const fs = require('fs');
const { check, done, blockDb } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const GAME = BASE.replace(/index\.html.*$/, '');
const FB = /firebase|googleapis|gstatic|firebaseio|identitytoolkit|securetoken/i;
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
const PAGES = [
  { id: 'jam', path: 'games/jam/index.html', ready: '#top h1' },
  { id: 'bugs', path: 'games/festival/bugs.html', ready: '#top h1' },
  { id: 'stalk', path: 'games/stalk/index.html', ready: '#top h1' },
  { id: 'angler', path: 'games/angler/index.html', ready: '.bar' },
  { id: 'deepdelve', path: 'games/deepdelve/index.html?test=1&seed=5', ready: '#hud' },
  { id: 'lantern', path: 'games/mad-maze/lantern.html', ready: '.top h1' },
];
const VIEWS = [
  { label: 'phone 390x844', opts: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, touch: true },
  { label: 'desktop 1280x720', opts: { viewport: { width: 1280, height: 720 } }, touch: false },
];
const SAVE = JSON.stringify({ v: 1, name: 'ADMINnav', bells: 5 });

async function run(browser, view) {
  const ctx = await browser.newContext(view.opts);
  const db = await blockDb(ctx);
  const reqs = [];
  ctx.on('request', (r) => reqs.push(r.url()));
  if (process.env.THREE_JS) await ctx.route(THREE_URL, (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(process.env.THREE_JS) }));
  await ctx.addInitScript((v) => { try { if (!localStorage.getItem('pixeltown-save-v1')) localStorage.setItem('pixeltown-save-v1', v); } catch (e) { /* opaque */ } }, SAVE);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const tap = (sel) => (view.touch ? page.tap(sel) : page.click(sel));
  const boxes = [];
  const links = new Map();

  for (const pg of PAGES) {
    const L = (s) => `[${view.label} ${pg.id}] ${s}`;
    await page.goto(GAME + pg.path);
    await page.waitForSelector('#mm-nav-btn');
    await page.waitForSelector(pg.ready, { state: 'attached' });
    await page.waitForTimeout(300);
    const info = await page.evaluate(() => {
      const b = document.getElementById('mm-nav-btn').getBoundingClientRect();
      const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      const vis = (n) => { const r = n.getBoundingClientRect(); const cs = getComputedStyle(n); return r.width > 1 && r.height > 1 && cs.display !== 'none' && cs.visibility !== 'hidden' && !n.closest('#mm-nav-root') && !n.closest('.mm-nav-legacy') && !n.classList.contains('mm-nav-legacy'); };
      const hud = [...document.querySelectorAll('h1,h2,button,a,input,select,output,#hud,#status,.sub,.stat')].filter(vis).map((n) => { const r = n.getBoundingClientRect(); return { n: n.id || n.tagName.toLowerCase() + '.' + n.className, l: r.left, t: r.top, r: r.right, b: r.bottom }; });
      const hit = hud.filter((h) => h.l < b.right && h.r > b.left && h.t < b.bottom && h.b > b.top);
      const leg = [...document.querySelectorAll('.mm-nav-legacy')];
      const small = [...document.querySelectorAll('a,button,input,select')].filter(vis).map((n) => { const r = (n.closest('label') || n).getBoundingClientRect(); return { n: n.id || n.className || n.tagName, w: Math.round(r.width), h: Math.round(r.height) }; }).filter((c) => c.w < 44 || c.h < 44);
      return { x: b.left, y: b.top, w: b.width, h: b.height, onTop: !!top && !!top.closest('#mm-nav-btn'), hit, legN: leg.length, legHidden: leg.every((n) => n.getBoundingClientRect().width <= 1), sw: document.documentElement.scrollWidth, iw: window.innerWidth, bodyOn: document.body.classList.contains('mm-nav-on'), small };
    });
    boxes.push({ id: pg.id, x: info.x, y: info.y, w: info.w, h: info.h });
    check(L('Menu button is at least 48x48, on top, near the top-left corner'), info.w >= 48 && info.h >= 48 && info.onTop && info.x <= 16 && info.y <= 16, JSON.stringify(info));
    check(L('old Hub/Town links stay in the DOM but are visually hidden'), info.legN >= 1 && info.legHidden && info.bodyOn, JSON.stringify({ n: info.legN, h: info.legHidden }));
    check(L('no page HUD or control overlaps the Menu button'), info.hit.length === 0, JSON.stringify(info.hit));
    check(L('no horizontal scroll'), info.sw <= info.iw, `${info.sw} > ${info.iw}`);
    if (view.touch) check(L('visible page controls are at least 44x44'), info.small.length === 0, JSON.stringify(info.small));

    await tap('#mm-nav-btn');
    await page.waitForSelector('#mm-nav-sheet:not([hidden])', { timeout: 2000 });
    const sh = await page.evaluate(() => {
      const vis = (n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(n).display !== 'none'; };
      return {
        dialogs: [...document.querySelectorAll('[role=dialog][aria-modal=true]')].filter(vis).length,
        dests: [...document.querySelectorAll('#mm-nav-sheet .mm-nav-dest')].map((a) => ({ id: a.dataset.place, href: a.href })),
        back: document.querySelector('#mm-nav-back .mm-nav-row-label') && document.querySelector('#mm-nav-back .mm-nav-row-label').textContent,
        backHref: document.getElementById('mm-nav-back') && document.getElementById('mm-nav-back').href,
      };
    });
    check(L('one tap opens the sheet; exactly one modal dialog is visible'), sh.dialogs === 1, JSON.stringify(sh));
    const ids = sh.dests.map((d) => d.id).join();
    check(L('all 14 places are listed'), sh.dests.length === 14 && ids === 'town,realm,isles,lantern,map,pop,dash,stack,echo,jam,angler,bugs,stalk,deepdelve' /* HS1 grouped order */, ids);
    sh.dests.forEach((d) => links.set(d.href.split('?')[0], 1));
    check(L('Back falls back to a sensible page (World map or Town)'), /^Back to (World map|Town)$/.test(sh.back) && /\/game\/(hub\/)?index\.html$/.test(sh.backHref), `${sh.back} ${sh.backHref}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    check(L('Esc closes the sheet'), await page.evaluate(() => document.getElementById('mm-nav-sheet').hidden));
  }

  // identical position and size across all six pages
  const ref = boxes[0];
  check(`[${view.label}] Menu button has the same position and size on all six pages (within 2 px)`, boxes.every((b) => Math.abs(b.x - ref.x) <= 2 && Math.abs(b.y - ref.y) <= 2 && Math.abs(b.w - ref.w) <= 2 && Math.abs(b.h - ref.h) <= 2), JSON.stringify(boxes));

  // every destination resolves
  const codes = [];
  for (const u of links.keys()) { const r = await ctx.request.get(u); codes.push(r.status()); }
  check(`[${view.label}] every destination file answers HTTP 200 (${codes.length} files)`, codes.length >= 10 && codes.every((c) => c === 200), codes.join(','));

  // Back: A -> B through the sheet -> Back lands on A (jam -> stalk -> jam)
  await page.goto(GAME + 'games/jam/index.html');
  await page.waitForSelector('#mm-nav-btn');
  await tap('#mm-nav-btn');
  await page.waitForSelector('#mm-nav-sheet:not([hidden])');
  await Promise.all([page.waitForURL(/games\/stalk\/index\.html/), tap('#mm-nav-sheet [data-place=stalk]')]);
  await page.waitForSelector('#mm-nav-btn');
  await tap('#mm-nav-btn');
  await page.waitForSelector('#mm-nav-sheet:not([hidden])');
  const bk = await page.evaluate(() => document.querySelector('#mm-nav-back .mm-nav-row-label').textContent);
  await Promise.all([page.waitForURL(/games\/jam\/index\.html/), tap('#mm-nav-back')]);
  check(`[${view.label}] Back from Stalk (opened from Jam) says "Back to Campfire Jam" and lands on Jam`, bk === 'Back to Campfire Jam' && /games\/jam\/index\.html/.test(page.url()), bk + ' ' + page.url());
  await page.waitForSelector('#mm-nav-btn');

  // a page modal (Angler journal) hides the Menu and closes the sheet
  await page.goto(GAME + 'games/angler/index.html');
  await page.waitForSelector('#journal-btn');
  await tap('#mm-nav-btn');
  await page.waitForSelector('#mm-nav-sheet:not([hidden])');
  await page.evaluate(() => { document.getElementById('journal').hidden = false; });
  await page.waitForTimeout(100);
  const md = await page.evaluate(() => ({ sheetHidden: document.getElementById('mm-nav-sheet').hidden, btnShown: getComputedStyle(document.getElementById('mm-nav-btn')).display !== 'none' }));
  check(`[${view.label}] a page modal closes the sheet and covers the Menu button`, md.sheetHidden && !md.btnShown, JSON.stringify(md));
  await page.evaluate(() => { document.getElementById('journal').hidden = true; });
  await page.waitForTimeout(100);
  check(`[${view.label}] the Menu button returns when the modal closes`, await page.evaluate(() => getComputedStyle(document.getElementById('mm-nav-btn')).display !== 'none'));

  // saves untouched, no firebase
  const save = await page.evaluate(() => localStorage.getItem('pixeltown-save-v1'));
  check(`[${view.label}] pixeltown-save-v1 is byte-identical`, save === SAVE, save);
  check(`[${view.label}] 0 firebase requests (blocked http ${db.http.length}, websockets ${db.ws.length}, any host ${reqs.filter((u) => FB.test(u)).length})`, db.count() === 0 && !reqs.some((u) => FB.test(u)));
  check(`[${view.label}] no console or page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const v of VIEWS) await run(browser, v);
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
