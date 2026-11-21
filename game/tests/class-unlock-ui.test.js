// S13: unlock toast (once per node, pixeltown-arms-v1 `seen`), ability sheet (long-press / right-click, Esc), UI icons with fallback, phone layout.
// Run: BASE=http://localhost:8593/game/index.html NODE_PATH=$(npm root -g) node game/tests/class-unlock-ui.test.js   (SHOTS=<dir> also writes screenshots)
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const MAZE = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1';
const SHOTS = process.env.SHOTS || '';
const MM = 'pixeltown-mm-v1', ACTIVE = 'pixeltown-mm-active-v1', SAVE = 'pixeltown-save-v1', ARMS = 'pixeltown-arms-v1';
const hero = (id, cls) => ({ id, name: cls, cls, level: 3, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] });
const prof = (heroes) => ({ v: 1, heroes, stash: new Array(16).fill(null), fame: 0, mode: 'classic', hall: [], migratedFrom: null });

async function ctxFor(browser, vp, level, arms, routeFn) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: vp.width < 500, isMobile: vp.width < 500 });
  if (routeFn) await routeFn(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !(routeFn && /ERR_FAILED|Failed to load resource/.test(m.text()))) errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([k1, p, k2, a, k3, s, k4, ar]) => {
    localStorage.clear(); localStorage.setItem(k1, JSON.stringify(p)); localStorage.setItem(k2, a); localStorage.setItem(k3, JSON.stringify(s));
    if (ar !== undefined) localStorage.setItem(k4, ar);
  }, [MM, prof([hero('h-ranger', 'ranger')]), ACTIVE, JSON.stringify({ v: 1, heroId: 'h-ranger' }), SAVE, { realm: { v: 1, level, xp: 0, items: [], nextUid: 2, eq: {} } }, ARMS, arms]);
  errors.length = 0;
  return { ctx, page, errors };
}
const load = async (page) => { await page.goto(MAZE); await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active); await page.waitForTimeout(700); };
const arms = (page) => page.evaluate((k) => localStorage.getItem(k), ARMS);
const toast = (page) => page.evaluate(() => { const t = document.getElementById('mm-unlock-toast'); return t && !t.classList.contains('hidden') ? t.textContent : null; });
const levelTo = (page, lv) => page.evaluate((l) => { const a = window.__mm.arena; a.save.level = l; if (a._levelUp) a._levelUp(); }, lv);
const sheetHidden = (page) => page.evaluate(() => { const s = document.getElementById('mm-ab-sheet'); return !s || s.classList.contains('hidden'); });

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const D = { width: 1000, height: 700 };

  // ---- first load at level 5: nodes at or below it (ranger Keen Eye, Lv 4) are marked seen, no toast ----
  const A = await ctxFor(browser, D, 5, undefined);
  await load(A.page);
  check('first load: no toast for nodes already reached', (await toast(A.page)) === null);
  let seen = JSON.parse((await arms(A.page)) || '{}').seen || [];
  check('first load marks reached nodes seen (ranger_4) but not later ones', seen.indexOf('ranger_4') >= 0 && seen.indexOf('ranger_9') < 0, JSON.stringify(seen));

  // ---- crossing Lv 9 shows the toast once ----
  await levelTo(A.page, 9); await A.page.waitForTimeout(600);
  const t1 = await toast(A.page);
  check('crossing Lv 9 shows "Unlocked: Hunter\'s Mark - ..."', !!t1 && /^Unlocked: Hunter's Mark - /.test(t1), String(t1));
  check('toast dismiss button is at least 44 px', await A.page.evaluate(() => { const r = document.getElementById('mm-unlock-toast-x').getBoundingClientRect(); return r.width >= 44 && r.height >= 44; }));
  seen = JSON.parse(await arms(A.page)).seen;
  check('the node is recorded in seen', seen.indexOf('ranger_9') >= 0);
  await A.page.click('#mm-unlock-toast-x');
  check('dismiss hides the toast', (await toast(A.page)) === null);
  await A.page.waitForTimeout(800);
  check('the same node does not toast again', (await toast(A.page)) === null);
  await levelTo(A.page, 11); await A.page.waitForTimeout(600);
  check('Nova II (Lv 11) toasts', /Nova II/.test(String(await toast(A.page))));
  await A.page.waitForTimeout(5300);
  check('toast auto-dismisses after about 5 s', (await toast(A.page)) === null);
  check('toast is a polite status region', await A.page.evaluate(() => { const t = document.getElementById('mm-unlock-toast'); return t.getAttribute('role') === 'status' && t.getAttribute('aria-live') === 'polite'; }));

  // ---- second load: nothing new, no toast ----
  await load(A.page);
  check('second load shows no toast', (await toast(A.page)) === null);

  // ---- ability sheet ----
  const box = await (await A.page.$('#realm-ab-1')).boundingBox();
  await A.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await A.page.mouse.down();
  await A.page.waitForTimeout(250);
  check('sheet is not open before 500 ms', await sheetHidden(A.page));
  await A.page.waitForTimeout(450); await A.page.mouse.up();
  const sheet = await A.page.evaluate(() => { const s = document.getElementById('mm-ab-sheet'); return s && !s.classList.contains('hidden') ? s.textContent : null; });
  check('long-press opens the sheet with name, cooldown, level gate and passives', !!sheet && /Nova/.test(sheet) && /Cooldown/.test(sheet) && /Unlocks at/.test(sheet) && /Class passives/.test(sheet) && /Keen Eye/.test(sheet), String(sheet));
  if (SHOTS) await A.page.screenshot({ path: SHOTS + '/s13-desktop-sheet.png' });
  await A.page.keyboard.press('Escape');
  check('Esc closes the sheet', await sheetHidden(A.page));
  await A.page.click('#realm-ab-0', { button: 'right' });
  check('right-click opens the sheet', !(await sheetHidden(A.page)));
  await A.page.mouse.click(30, 400);
  check('tap outside closes the sheet', await sheetHidden(A.page));

  // ---- icons ----
  await A.page.waitForTimeout(300);
  const ic = await A.page.evaluate(() => { const b = document.getElementById('realm-bp-btn'); const i = b.querySelector('img.mm-ico'); return { has: !!i, ok: !!i && i.complete && i.naturalWidth > 0, cls: b.classList.contains('has-ico'), text: b.textContent, aria: b.getAttribute('aria-label') }; });
  check('HUD backpack button shows the b19 icon and keeps its emoji text + aria-label', ic.has && ic.ok && ic.cls && ic.text.indexOf('🎒') >= 0 && /backpack/i.test(ic.aria), JSON.stringify(ic));
  await A.page.keyboard.press('Escape'); await A.page.waitForTimeout(300);
  check('menu buttons keep their text and gain icons', await A.page.evaluate(() => { const r = document.querySelector('.rm-btn[data-m="resume"]'); return !!r && /Resume/.test(r.textContent) && !!r.querySelector('img.mm-ico'); }));
  if (SHOTS) await A.page.screenshot({ path: SHOTS + '/s13-desktop-menu.png' });
  errs.push(...A.errors); await A.ctx.close();

  // ---- icon fallback: image requests fail -> emoji stays visible, no broken image left ----
  const F = await ctxFor(browser, D, 5, undefined, (c) => c.route('**/b19-ui-icons/**', (r) => r.abort()));
  await load(F.page); await F.page.waitForTimeout(500);
  check('icon fallback: failed images are removed and the emoji stays visible', await F.page.evaluate(() => { const b = document.getElementById('realm-bp-btn'); const e = b.querySelector('.emo'); return !b.querySelector('img.mm-ico') && !b.classList.contains('has-ico') && (!e || getComputedStyle(e).position !== 'absolute') && b.textContent.indexOf('🎒') >= 0; }));
  errs.push(...F.errors.filter((e) => !/b19-ui-icons/.test(e))); await F.ctx.close();

  // ---- corrupt arms recovers ----
  for (const bad of ['{{{not json', '{"v":1,"seen":[1,{},"ranger_4","evil<script>"],"hud":7}', '[]']) {
    const C = await ctxFor(browser, D, 5, bad);
    await load(C.page);
    const s2 = JSON.parse(await arms(C.page));
    check('corrupt arms (' + bad.slice(0, 14) + ') recovers to a clean list', Array.isArray(s2.seen) && s2.seen.every((x) => /^[a-z][A-Za-z0-9]{1,15}_(4|9|11|14|16|19)$/.test(x)) && s2.seen.indexOf('ranger_4') >= 0 && s2.v === 1, JSON.stringify(s2));
    check('corrupt arms: game still runs with no toast', (await toast(C.page)) === null && (await C.page.evaluate(() => window.__mm.arena.active)) === true);
    errs.push(...C.errors); await C.ctx.close();
  }

  // ---- phone 390x844 ----
  const P = await ctxFor(browser, { width: 390, height: 844 }, 9, undefined);
  await load(P.page);
  check('phone: no horizontal scroll', await P.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  const geo = await P.page.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; };
    return { abs: [0, 1, 2, 3].map((i) => r('#realm-ab-' + i)), move: r('#realm-stick-move'), aim: r('#realm-stick-aim') };
  });
  const hit = (a, c) => a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h;
  check('phone: ability buttons are at least 44 px', geo.abs.every((a) => a.w >= 44 && a.h >= 44), JSON.stringify(geo.abs.map((a) => [a.w, a.h])));
  check('phone: ability buttons do not overlap the sticks', geo.abs.every((a) => !hit(a, geo.move) && !hit(a, geo.aim)), JSON.stringify(geo));
  const pbox = await (await P.page.$('#realm-ab-1')).boundingBox();
  await P.page.touchscreen.tap(pbox.x + 10, pbox.y + 10);
  await P.page.waitForTimeout(700);
  check('phone: a quick tap does not open the sheet', await sheetHidden(P.page));
  await P.page.evaluate(() => document.getElementById('realm-ab-2').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
  const sg = await P.page.evaluate(() => {
    const s = document.getElementById('mm-ab-sheet'); const b = s.getBoundingClientRect(); const x = document.getElementById('mm-ab-sheet-x').getBoundingClientRect();
    const ov = (id) => { const q = document.getElementById(id).getBoundingClientRect(); return b.left < q.right && q.left < b.right && b.top < q.bottom && q.top < b.bottom; };
    return { open: !s.classList.contains('hidden'), x: [x.width, x.height], fits: b.left >= 0 && b.right <= innerWidth, overlap: ov('realm-stick-move') || ov('realm-stick-aim') || ov('realm-abilities') };
  });
  check('phone: sheet opens, fits the screen, close >= 44 px, does not cover sticks or ability bar', sg.open && sg.fits && sg.x[0] >= 44 && sg.x[1] >= 44 && !sg.overlap, JSON.stringify(sg));
  if (SHOTS) await P.page.screenshot({ path: SHOTS + '/s13-phone-sheet.png' });
  await P.page.click('#mm-ab-sheet-x');
  await levelTo(P.page, 14); await P.page.waitForTimeout(600);
  check('phone: toast fits the screen', await P.page.evaluate(() => { const t = document.getElementById('mm-unlock-toast'); const b = t.getBoundingClientRect(); return !t.classList.contains('hidden') && b.left >= 0 && b.right <= innerWidth; }));
  if (SHOTS) await P.page.screenshot({ path: SHOTS + '/s13-phone-toast.png' });
  errs.push(...P.errors); await P.ctx.close();

  check('no console or page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
