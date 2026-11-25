// cyc6-ui (retest 3 P3: b09-r3-02/04/05, b08-r3-10): the fixed Menu (compass) button and result cards on narrow phones.
//   - Dash / Pop / Echo at 195x422: when the result card shows, the page scrolls so the card (and its 8-bit ring) starts below the
//     fixed Menu button; the headline is not under the button (MMMiniKit.keepClear).
//   - Stack at 195x422: the fixed result card starts below the header and its Sound button (it used to cover both).
//   - Dash: after a crash the page goal line hides (the card has its own) and the big button steps back to a quiet <= 48 px
//     "Run again" (still one tap = same course, the old feature).
//   - Echo: the "+N in bloom!" line sits in its own lane, clear of the time bar (and its frame) and the board ring (390 and 195).
//   - Hub Home at 195x422: scrolled Home content never passes under the Menu button (the logo row is a sticky band).
// 390x844 and 1280x720 cards are already clear: keepClear moves nothing there. DB-safe: blockDb, no Firebase.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc6-ui-195-results.test.js
const { chromium } = require('playwright');
const path = require('path');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const G = (g, q) => ORIGIN + '/game/games/' + g + '/index.html' + (q || '');
const IMG = (n) => path.join(__dirname, '..', 'design', 'beta', 'img', 'cyc6-ui-' + n + '.jpg');
const hit = (a, b) => !!(a && b && a.x < b.r - 0.5 && b.x < a.r - 0.5 && a.y < b.b - 0.5 && b.y < a.b - 0.5);
const R = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e || e.hidden || !e.getClientRects().length || getComputedStyle(e).display === 'none') return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom, h: r.height }; }, sel);

async function open(browser, vp, url) {
  const touch = vp.width < 600;
  const ctx = await browser.newContext(Object.assign({ viewport: vp }, touch ? { hasTouch: true, isMobile: true } : {}));
  await blockDb(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForTimeout(500);
  return { ctx, page, errors };
}
const ENDS = {
  dash: (p) => p.evaluate(() => { window.__dash.step(2000); }),
  pop: (p) => p.evaluate(() => { window.scrollTo(0, 239); window.__pop.end(); }), // the tester's case: the page scrolled down to the board
  stack: (p) => p.evaluate(() => window.__stack.end()),
  echo: (p) => p.evaluate(() => { window.scrollTo(0, 287); window.__echo.end(); }),
};

(async () => {
  const browser = await chromium.launch(); const errs = [];
  for (const [w, h] of [[195, 422], [390, 844], [1280, 720]]) {
    for (const g of ['dash', 'pop', 'stack', 'echo']) {
      const tag = g + ' ' + w + 'x' + h + ': ';
      const P = await open(browser, { width: w, height: h }, G(g, '?test=1&seed=night1')), p = P.page;
      await p.click('#play'); await p.waitForTimeout(150);
      await ENDS[g](p); await p.waitForTimeout(500);
      const card = await R(p, '#result'), nav = await R(p, '#mm-nav-btn'), head = await R(p, '#result h2');
      if (g === 'stack') {
        const top = await R(p, '#top'), snd = await R(p, '#btn-mute');
        check(tag + 'the fixed result card (with its 12 px ring) starts below the header and the Sound button', card && top && card.y - 12 >= top.b && !hit({ x: card.x - 12, y: card.y - 12, r: card.r + 12, b: card.b }, snd), JSON.stringify({ card, top, snd }));
      } else {
        const col = card && nav && card.x - 12 < nav.r && card.r + 12 > nav.x; // the card is in the Menu button's column (phones)
        check(tag + (col ? 'the result card (with its 12 px ring) starts below the fixed Menu button' : 'the result card (with its ring) starts on screen (not above the top edge)'), card && nav && card.y - 12 >= (col ? nav.b : 0), JSON.stringify({ card, nav }));
      }
      const under = await p.evaluate(() => { const h = document.querySelector('#result h2'); if (!h) return 'no h2'; const r = h.getBoundingClientRect(); const e = document.elementFromPoint(r.left + 6, r.top + r.height / 2); return e && h.contains(e) ? '' : (e ? e.id || e.tagName : 'none'); });
      check(tag + 'the result headline is on top (nothing covers its start)', head && under === '', JSON.stringify({ head, under }));
      if (g === 'dash') {
        const goal = await R(p, '#goal'), jump = await R(p, '#jump');
        check(tag + 'the page goal line hides while the card shows (the card has its own goal line)', goal === null && /Goal:/.test(await p.textContent('#result')), JSON.stringify(goal));
        check(tag + 'the big button steps back to a quiet "Run again" (44-48 px tall)', jump && jump.h >= 44 && jump.h <= 48 && (await p.textContent('#jump')) === 'Run again', JSON.stringify(jump));
        await p.waitForTimeout(800);
        await p.evaluate(() => document.getElementById('jump').scrollIntoView({ block: 'center' }));
        const jb = await p.locator('#jump').boundingBox();
        if (w < 600) await p.touchscreen.tap(jb.x + jb.width / 2, jb.y + jb.height / 2); else await p.mouse.click(jb.x + jb.width / 2, jb.y + jb.height / 2);
        await p.waitForTimeout(200);
        const re = await p.evaluate(() => ({ st: window.__dash.run.state, seed: window.__dash.run.seed, hidden: document.getElementById('result').hidden, over: document.body.classList.contains('dash-over') }));
        check(tag + 'one tap on Run again still runs the same course; the goal line and the big Jump come back', re.st === 'play' && re.seed === 'night1' && re.hidden && !re.over && (await R(p, '#goal')) !== null && (await R(p, '#jump')).h >= 56, JSON.stringify(re));
      }
      if (w === 195) await p.screenshot({ path: IMG('result-' + g + '-195'), type: 'jpeg', quality: 70 }).catch(() => {});
      errs.push(...P.errors); await P.ctx.close();
    }
  }
  // Echo: the bloom line lane
  for (const [w, h] of [[390, 844], [195, 422], [1280, 720]]) {
    const P = await open(browser, { width: w, height: h }, G('echo', '?test=1&seed=bloom1')), p = P.page;
    await p.click('#play'); await p.waitForTimeout(150);
    await p.evaluate(() => { const E = window.__echo; E.listen(); E.seq().forEach((i) => E.tap(i)); });
    await p.waitForTimeout(60);
    const r = await p.evaluate(() => { const b = document.getElementById('echo-bloom'), rg = document.createRange(); rg.selectNodeContents(b); const t = rg.getBoundingClientRect(); const q = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom }; };
      return { on: b.classList.contains('on'), text: b.textContent, line: { x: t.left, y: t.top, r: t.right, b: t.bottom }, bar: q('timebar'), board: q('board') }; });
    const bar4 = { x: r.bar.x - 4, y: r.bar.y - 4, r: r.bar.r + 4, b: r.bar.b + 4 }, ring = { x: r.board.x - 12, y: r.board.y - 12, r: r.board.r + 12, b: r.board.y };
    check('echo ' + w + 'x' + h + ': the "+N in bloom!" line shows clear of the time bar (and its frame) and the board ring', r.on && /bloom/i.test(r.text) && !hit(r.line, bar4) && !hit(r.line, ring), JSON.stringify(r));
    if (w === 390) await p.screenshot({ path: IMG('echo-bloom-390'), type: 'jpeg', quality: 70 }).catch(() => {});
    errs.push(...P.errors); await P.ctx.close();
  }
  // Hub Home at 195x422 scrolled: nothing of the Home content passes under the Menu button
  {
    const P = await open(browser, { width: 195, height: 422 }, ORIGIN + '/game/hub/index.html'), p = P.page;
    await p.waitForTimeout(800);
    const r = await p.evaluate(async () => {
      const box = document.querySelector('#home .home-in'), btn = document.getElementById('mm-nav-btn'); if (!box || !btn) return { err: 'no home / button' };
      const b = btn.getBoundingClientRect(), out = [], max = box.scrollHeight - box.clientHeight;
      for (let y = 0; y <= max; y += 20) {
        box.scrollTop = y; box.dispatchEvent(new Event('scroll')); await new Promise((res) => requestAnimationFrame(() => res()));
        for (const [x, yy] of [[b.left + 4, b.top + 4], [b.right - 4, b.top + 4], [b.left + 4, b.bottom - 4], [b.right - 4, b.bottom - 4], [b.left + b.width / 2, b.bottom - 2]]) {
          const els = document.elementsFromPoint(x, yy), i = els.indexOf(btn), below = els.slice(i + 1).find((e) => !btn.contains(e));
          // the first thing under the button must be the logo band, the scroll box itself or the sky, never Home content
          if (below && below.closest('#home') && !below.closest('.home-title') && below !== box && !below.classList.contains('home-sky')) out.push(y + ':' + (below.id || below.className || below.tagName));
        }
      }
      return { max, out: out.slice(0, 8), scrolled: box.classList.contains('scrolled') };
    });
    check('hub Home 195x422: while Home scrolls, no Home text or button passes under the Menu button (the logo row is a sticky band)', r && !r.err && r.max > 40 && r.out.length === 0, JSON.stringify(r));
    await p.evaluate(() => { const box = document.querySelector('#home .home-in'); box.scrollTop = 160; box.dispatchEvent(new Event('scroll')); });
    await p.waitForTimeout(150);
    await p.screenshot({ path: IMG('hub-home-195-scrolled'), type: 'jpeg', quality: 70 }).catch(() => {});
    errs.push(...P.errors); await P.ctx.close();
  }
  check('no page errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
