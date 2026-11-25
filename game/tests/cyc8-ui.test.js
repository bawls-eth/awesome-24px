// cyc8-ui (cycle-7 proposals + retest-3 P3), checked in a real browser. Never chats; the Town runs OFFLINE only (helpers.offlineStub,
// db.attempts() === 0), every other page under blockDb (0 attempts).
//   1. Town phone Menu at 390x844, 360x640, 667x375, 195x422 and 160x284 (touch): the shared corner Menu (#mm-nav-btn) is top-left,
//      >= 44 px, on top; "Where to?" is no longer in the phone panel; the folded bag bar, the In-town chip and the Menu never overlap,
//      also with 4-digit counts, with the people panel expanded, and with the bag opened while the panel is expanded. The Menu opens
//      the sheet. Desktop 1280x720 keeps both "Where to?" and the corner Menu.
//   2. Pop at 195x422: a 9-character best (1,234,567) at the 12 px floor fits inside its HUD box (padding included).
//   3. Realm world at 195x422 (touch portrait): Daily is >= 40 px above the move stick and overlaps no control or HUD text.
//   4. Pop result card (b09-r3-01): no line of the page peeks out under the card (#keys / #goal hidden while it is up).
//   5. Hub "Next step" (b15-r3): keyboard focus draws a real outline (>= 2 px), not only a border colour change.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc8-ui.test.js
const { chromium } = require('playwright');
const path = require('path');
const { check, done, offlineStub, blockDb, exposeGame, joinOffline } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const ORIGIN = new URL(BASE).origin;
const IMG = path.join(__dirname, '..', 'design', 'beta', 'img');
const SHOTS = process.env.CYC8_SHOTS === '1';
const PROFILE = { v: 1, heroes: [{ id: 'h1', name: 'Fern', cls: 'druid', level: 7, xp: 10, items: [] }], stash: [], fame: 0, mode: 'classic', hall: [] };

const rectsOf = (page, sels) => page.evaluate((sels) => {
  const out = {};
  sels.forEach((s) => {
    const e = document.querySelector(s); if (!e) { out[s] = null; return; }
    const cs = getComputedStyle(e); const r = e.getBoundingClientRect();
    if (cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0) { out[s] = null; return; }
    out[s] = { x: r.left, y: r.top, r: r.right, b: r.bottom, w: Math.round(r.width), h: Math.round(r.height) };
  });
  return out;
}, sels);
const hit = (a, b) => !!(a && b && a.x < b.r - 0.5 && b.x < a.r - 0.5 && a.y < b.b - 0.5 && b.y < a.b - 0.5);
const clashes = (R) => { const k = Object.keys(R).filter((s) => R[s]); const out = []; for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) if (hit(R[k[i]], R[k[j]])) out.push(k[i] + '/' + k[j]); return out; };

async function town(browser, w, h) {
  const touch = w < 900;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
  const db = await offlineStub(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await exposeGame(page);
  await page.goto(BASE);
  await joinOffline(page, 'ADMINcyc8u');
  await page.waitForFunction(() => window.MMNav && window.MMNav.mounted() && document.getElementById('mm-nav-btn'), null, { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(800);
  const tag = `[town ${w}x${h}] `;
  const tap = (s) => (touch ? page.tap(s) : page.click(s));
  const m = await page.evaluate(() => {
    const b = document.getElementById('mm-nav-btn'); if (!b) return null;
    const r = b.getBoundingClientRect(); const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { x: r.left, y: r.top, w: r.width, h: r.height, onTop: !!(at && at.closest('#mm-nav-btn')) };
  });
  check(tag + 'the shared corner Menu is top-left (<= 16 px), >= 44 px and on top', m && m.x <= 16 && m.y <= 16 && m.w >= 44 && m.h >= 44 && m.onTop, JSON.stringify(m));
  const where = (await rectsOf(page, ['#where-to-btn']))['#where-to-btn'];
  if (touch) check(tag + 'phone: "Where to?" has left the phone panel (the corner Menu replaces it)', where === null, JSON.stringify(where));
  else check(tag + 'desktop: "Where to?" stays in the panel beside the corner Menu', where && where.h >= 44, JSON.stringify(where));
  const TOP = ['#mm-nav-btn', '#inventory-panel', '#player-list-panel', '#gate-pointer', '#walkie-panel', '#joystick', '#action-buttons'];
  if (SHOTS) await page.screenshot({ path: path.join(IMG, `cyc8-ui-town-menu-${w}x${h}.jpg`), type: 'jpeg', quality: 70 }).catch(() => {});
  check(tag + 'no two top HUD pieces overlap (Menu, bag bar, In-town chip, pointer chip, walkie, stick, buttons)', clashes(await rectsOf(page, TOP)).length === 0, JSON.stringify(clashes(await rectsOf(page, TOP))));
  // big counts: every count 4 digits and recently changed (the folded bar keeps the 3 newest, and drops one when the row is too wide)
  await page.evaluate(() => { [...document.querySelectorAll('#inventory-panel > span b')].slice(0, 4).forEach((b, i) => { b.textContent = String(9999 - i); }); });
  await page.waitForTimeout(250);
  const big = await rectsOf(page, TOP);
  check(tag + 'with 4-digit counts the bag bar still clears the Menu and the In-town chip', clashes(big).length === 0 && (!big['#inventory-panel'] || big['#inventory-panel'].r <= w), JSON.stringify(clashes(big)));
  if (touch) {
    await tap('#panel-toggle'); await page.waitForTimeout(300);
    const ex = await rectsOf(page, ['#mm-nav-btn', '#inventory-panel', '#player-list-panel']);
    const p = ex['#player-list-panel'];
    check(tag + 'phone: the expanded people panel fits the screen and overlaps neither the Menu nor the bag bar', p && p.x >= 0 && p.r <= w + 0.5 && clashes(ex).length === 0, JSON.stringify(ex));
    if (w > 300) {
      await tap('#bag-icon'); await page.waitForTimeout(300);
      const bo = await rectsOf(page, ['#mm-nav-btn', '#inventory-panel', '#player-list-panel']);
      const bagOpen = await page.evaluate(() => document.getElementById('inventory-panel').classList.contains('bag-open'));
      check(tag + 'phone: the opened bag overlaps neither the Menu nor the expanded people panel', bagOpen && clashes(bo).length === 0, JSON.stringify({ bagOpen, bo }));
      await tap('#bag-icon'); await page.waitForTimeout(150);
    } else {
      check(tag + '200% zoom phone: the bag bar steps aside while the panel is expanded', ex['#inventory-panel'] === null, JSON.stringify(ex['#inventory-panel']));
    }
    await tap('#panel-toggle'); await page.waitForTimeout(250);
    const back = (await rectsOf(page, ['#inventory-panel']))['#inventory-panel'];
    check(tag + 'phone: folding the panel shows the bag bar again', !!back, JSON.stringify(back));
  }
  if (m) {
    await tap('#mm-nav-btn'); await page.waitForTimeout(300);
    const o = await page.evaluate(() => ({ open: !document.getElementById('mm-nav-sheet').hidden, n: document.querySelectorAll('#mm-nav-sheet .mm-nav-dest').length, exp: document.getElementById('mm-nav-btn').getAttribute('aria-expanded') }));
    check(tag + 'one tap on the corner Menu opens the "Where to?" sheet with every place', o.open && o.n >= 14 && o.exp === 'true', JSON.stringify(o));
    await page.keyboard.press('Escape'); await page.waitForTimeout(250);
  }
  check(tag + 'no database request (offline stub)', db.attempts() === 0, String(db.attempts()));
  check(tag + 'no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
  return db.attempts();
}

async function pop(browser) {
  const ctx = await browser.newContext({ viewport: { width: 195, height: 422 }, hasTouch: true, isMobile: true });
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  await page.goto(ORIGIN + '/game/games/pop/index.html?test=1');
  await page.waitForSelector('#h-best');
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => ['h-score', 'h-best'].map((id) => {
    const st = document.getElementById(id); st.textContent = '1,234,567';
    const box = st.closest('.stat'); const b = box.getBoundingClientRect(); const cs = getComputedStyle(box);
    const rg = document.createRange(); rg.selectNodeContents(st); const t = rg.getBoundingClientRect();
    return { id, fs: parseFloat(getComputedStyle(st).fontSize), inner: [b.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth), b.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth)].map(Math.round), text: [t.left, t.right].map(Math.round) };
  }));
  check('[pop 195x422] a 9-character value (1,234,567) at >= 12 px fits inside its HUD box padding (Score and Best)', r.every((q) => q.fs >= 12 && q.text[0] >= q.inner[0] - 0.5 && q.text[1] <= q.inner[1] + 0.5), JSON.stringify(r));
  check('[pop 195x422] no horizontal page scroll', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await ctx.close();
  return db.attempts();
}

async function popResult(browser, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  await page.goto(ORIGIN + '/game/games/pop/index.html?test=1');
  await page.waitForFunction(() => window.__pop);
  await page.evaluate(() => { window.__pop.start(); window.__pop.run.score = 123456; window.__pop.end(); });
  await page.waitForFunction(() => !document.getElementById('result').hidden);
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => {
    const card = document.getElementById('result').getBoundingClientRect();
    const peek = ['keys', 'goal', 'msg'].map((id) => { const e = document.getElementById(id); const cs = getComputedStyle(e); const b = e.getBoundingClientRect(); return { id, shown: cs.visibility !== 'hidden' && cs.display !== 'none' && b.height > 0 && e.textContent.trim() !== '', t: Math.round(b.top), b: Math.round(b.bottom) }; })
      .filter((q) => q.shown && q.t < card.bottom + 2 && q.b > card.bottom - 2); // a line straddling the card's bottom edge = peeking out
    return { cardB: Math.round(card.bottom), peek };
  });
  if (SHOTS) await page.screenshot({ path: path.join(IMG, `cyc8-ui-pop-result-${w}x${h}.jpg`), type: 'jpeg', quality: 70 }).catch(() => {});
  check(`[pop result ${w}x${h}] no page line peeks out under the result card's bottom edge`, r.peek.length === 0, JSON.stringify(r));
  await page.click('#again', { force: true }).catch(() => {}); await page.waitForTimeout(1300);
  await page.click('#again').catch(() => {}); await page.waitForTimeout(300);
  const back = await page.evaluate(() => ({ result: document.getElementById('result').hidden, keys: getComputedStyle(document.getElementById('keys')).visibility }));
  check(`[pop result ${w}x${h}] the keys line comes back with the next round`, back.result === true && back.keys === 'visible', JSON.stringify(back));
  await ctx.close();
  return db.attempts();
}

async function realm(browser) {
  const ctx = await browser.newContext({ viewport: { width: 195, height: 422 }, hasTouch: true, isMobile: true });
  const db = await blockDb(ctx);
  await ctx.addInitScript((p) => { localStorage.setItem('pixeltown-mm-v1', JSON.stringify(p)); localStorage.setItem('pixeltown-mm-active-v1', JSON.stringify({ v: 1, heroId: 'h1' })); }, PROFILE);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=12345');
  await page.waitForSelector('#mm-daily-btn', { timeout: 15000 });
  await page.waitForTimeout(2500);
  const S = ['#mm-gear-btn', 'a#mm-daily-btn', '#realm-stick-move', '#realm-stick-aim', '#realm-abilities', '#rw-minimap', '#rw-goal', '#rw-zone', '#realm-aim-btn',
    '#realm-leave-btn', '#realm-menu-btn', '#realm-bp-btn', '#realm-board-btn', '#mm-nav-btn', '#realm-info', '#realm-xp', '#realm-hp'];
  const R = await rectsOf(page, S);
  const d = R['a#mm-daily-btn'], mv = R['#realm-stick-move'];
  if (SHOTS) await page.screenshot({ path: path.join(IMG, 'cyc8-ui-realm-daily-195x422.jpg'), type: 'jpeg', quality: 70 }).catch(() => {});
  check('[realm 195x422] Daily is on screen, >= 44 px and >= 40 px clear of the move stick (was 12 px)', d && mv && d.w >= 44 && d.h >= 44 && d.x >= 0 && d.r <= 195 && (mv.y - d.b >= 40 || d.x >= mv.r + 40), JSON.stringify({ d, mv }));
  const clash = S.filter((s) => s !== 'a#mm-daily-btn' && hit(d, R[s]));
  check('[realm 195x422] Daily overlaps no stick, ability pad, mini-map, goal / zone text or other control', clash.length === 0, JSON.stringify({ clash, R }));
  const gz = ['#rw-goal', '#rw-zone'].filter((s) => R[s] && (hit(R[s], mv) || hit(R[s], R['#realm-abilities']) || hit(R[s], R['#mm-gear-btn'])));
  check('[realm 195x422] the zone and goal text overlap no stick, ability pad or gear', gz.length === 0, JSON.stringify({ gz, R }));
  check('[realm 195x422] no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
  return db.attempts();
}

async function hub(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  await page.goto(ORIGIN + '/game/hub/index.html');
  await page.waitForTimeout(800);
  const shown = await page.evaluate(() => { const a = document.getElementById('home-next'); return !!a && !a.hidden && a.getBoundingClientRect().height > 0; });
  let ring = null;
  for (let i = 0; i < 25 && shown; i++) {
    await page.keyboard.press('Tab');
    ring = await page.evaluate(() => { const a = document.activeElement; if (!a || a.id !== 'home-next') return null; const cs = getComputedStyle(a); return { style: cs.outlineStyle, w: parseFloat(cs.outlineWidth), fv: a.matches(':focus-visible') }; });
    if (ring) break;
  }
  check('[hub 1280x720] the "Next step" card is shown and reachable by Tab', shown && !!ring, JSON.stringify({ shown, ring }));
  check('[hub 1280x720] keyboard focus on "Next step" draws a real outline (>= 2 px, not "none")', !!ring && ring.fv && ring.style !== 'none' && ring.w >= 2, JSON.stringify(ring));
  await ctx.close();
  return db.attempts();
}

(async () => {
  const browser = await chromium.launch();
  let attempts = 0;
  try {
    for (const [w, h] of [[390, 844], [360, 640], [667, 375], [195, 422], [160, 284], [1280, 720]]) attempts += await town(browser, w, h);
    attempts += await pop(browser);
    for (const [w, h] of [[390, 844], [195, 422]]) attempts += await popResult(browser, w, h);
    attempts += await realm(browser);
    attempts += await hub(browser);
  } catch (e) { check('the run finished', false, e.message.split('\n')[0]); }
  check('no database requests on any page (offline stub / blockDb)', attempts === 0, String(attempts));
  await browser.close();
  done();
})();
