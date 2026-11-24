// cyc5-ui (retest 3 P2: b05-r3-05, b06-r3-04): the Isles first screen on a phone. The first-visit how-to card was ~180-290 px tall and
// sat over the map (hiding the hero at 195 px), with the medal toast and the hint line stacked on top. Now on a phone (<= 600 px wide):
//   - the card starts as ONE compact row (<= 64 px tall) under the HUD, never over the hero, with a 44 px Tips button that opens the list;
//   - opened with Tips it stays (a tap elsewhere does not close it); the X still closes it;
//   - the hint line waits while the card or a toast is up (staggered), then shows, and never sits on a visible action button;
//   - a toast never prints on the card, the HUD or the action column (195x422 too).
// Desktop keeps the full card (no Tips button). DB-safe: blockDb, no Firebase, nothing written anywhere.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc5-ui-isles-compact.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = (isle) => ORIGIN + '/game/games/isles/index.html?test=1&seed=5&isle=' + isle;
const hit = (a, b) => !!(a && b && a.x < b.r - 0.5 && b.x < a.r - 0.5 && a.y < b.b - 0.5 && b.y < a.b - 0.5);
const box = (page, sel) => page.evaluate((s) => {
  const e = document.querySelector(s); if (!e || e.hidden) return null; const cs = getComputedStyle(e);
  if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return null;
  const r = e.getBoundingClientRect(); if (!r.width) return null; return { x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
}, sel);
const acts = (page) => page.evaluate(() => [...document.querySelectorAll('#acts button, #touch-btns button')].filter((b) => !b.hidden && b.offsetParent)
  .map((b) => { const r = b.getBoundingClientRect(); return { id: b.id, x: r.left, y: r.top, r: r.right, b: r.bottom }; }).filter((r) => r.r > r.x));

async function open(browser, vp, touch, isle) {
  const ctx = await browser.newContext(Object.assign({ viewport: vp }, touch ? { hasTouch: true, isMobile: true } : {}));
  await blockDb(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => { if (sessionStorage.s) return; sessionStorage.s = 1; localStorage.clear(); });
  await page.goto(PAGE(isle));
  await page.waitForFunction(() => window.__isles && window.__isles.world);
  await page.waitForTimeout(400);
  return { ctx, page, errors };
}

(async () => {
  const browser = await chromium.launch(); const errs = [];
  for (const [w, h, isle] of [[390, 844, 'jungle'], [195, 844, 'meadow'], [195, 422, 'jungle']]) {
    const tag = w + 'x' + h + ' ' + isle + ': ';
    const P = await open(browser, { width: w, height: h }, true, isle); const p = P.page;
    const card = await box(p, '#howto'), hud = await box(p, '#hud');
    const hero = { x: w / 2 - 12, r: w / 2 + 12, y: h / 2 - 30, b: h / 2 + 4 };
    // 195x422: the screen centre is right under the HUD, so the card is a narrow column (Tips over X) at the left edge instead of a row
    const small = w <= 300 && h <= 500;
    check(tag + (small ? 'the first-visit card is a narrow column (<= 60 px wide, <= 100 px tall)' : 'the first-visit card is one compact row (<= 64 px tall)'),
      card && (small ? card.w <= 60 && card.h <= 100 : card.h <= 64), JSON.stringify(card));
    check(tag + 'the card does not cover the hero at the screen centre', card && !hit(card, hero), JSON.stringify({ card, hero }));
    check(tag + 'the card does not sit on the HUD', card && hud && !hit(card, hud), JSON.stringify({ card, hud }));
    const more = await box(p, '#howto-more');
    check(tag + 'a Tips button >= 44 px tall opens the list (aria-expanded false)', more && more.h >= 44 && await p.getAttribute('#howto-more', 'aria-expanded') === 'false', JSON.stringify(more));
    check(tag + 'the hint line waits while the card is up (staggered)', (await box(p, '#hint')) === null);
    // a real toast from the game (no food to feed): it must not print on the card, the HUD or an action button
    await p.evaluate(() => { try { window.__isles.feed(); } catch (e) { /* toast only */ } });
    await p.waitForTimeout(250);
    const t = await box(p, '#toast'), card2 = await box(p, '#howto'), a = await acts(p);
    check(tag + 'a toast shows below the card, off the HUD and the action column', t && card2 && !hit(t, card2) && !hit(t, hud) && a.every((b) => !hit(t, b)), JSON.stringify({ t, card2, a }));
    // Tips opens the list and the card stays after a tap elsewhere
    await p.tap('#howto-more');
    await p.waitForTimeout(150);
    const big = await box(p, '#howto-list');
    check(tag + 'Tips opens the five lines (aria-expanded true)', big && big.h > 40 && await p.getAttribute('#howto-more', 'aria-expanded') === 'true', JSON.stringify(big));
    await p.touchscreen.tap(Math.round(w / 2), Math.round(h * 0.45));
    await p.waitForTimeout(2900);
    check(tag + 'opened with Tips, the card stays after a tap on the map', (await box(p, '#howto')) !== null);
    await p.tap('#howto-close');
    await p.waitForTimeout(2600); // the toast fades (2.2 s)
    check(tag + 'X closes the card', (await box(p, '#howto')) === null);
    const hint = await box(p, '#hint');
    await p.waitForTimeout(700); // one 0.5 s tick for the hint fit
    const hint2 = await box(p, '#hint'), a2 = await acts(p);
    check(tag + 'after the card, the hint line shows and sits on no action button', (hint || hint2) && (!hint2 || a2.every((b) => !hit(hint2, b))), JSON.stringify({ hint2, a2 }));
    await p.screenshot({ path: require('path').join(__dirname, '..', 'design', 'beta', 'img', 'cyc5-ui-isles-' + w + 'x' + h + '.jpg'), type: 'jpeg', quality: 60 }).catch(() => {});
    errs.push(...P.errors); await P.ctx.close();
  }
  const D = await open(browser, { width: 1280, height: 720 }, false, 'jungle');
  const dl = await box(D.page, '#howto-list');
  check('desktop: the full card keeps its list and has no Tips button', dl && dl.h > 40 && (await box(D.page, '#howto-more')) === null, JSON.stringify(dl));
  errs.push(...D.errors); await D.ctx.close();
  check('no page errors', errs.length === 0, errs.join('|'));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
