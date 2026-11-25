// Cycle 6 L (review pass, perf): the shared Menu (mm-nav.js) watched every child-list change under <body> and ran a whole-document
// query (".mm-nav-legacy:not(...)") for each batch. In the Realm the HUD and the float texts rewrite text many times a second, so
// that query ran all the time during play. Now only a batch that adds an element counts, at most one scan per frame.
// Measured from the page: calls of document.querySelectorAll with the legacy selector over 6 s of Realm play (a counting wrapper
// installed before the page scripts; it calls the real function). Also: a legacy link added later is still taken out of the tab order.
// OFFLINE (blockDb + WebSockets closed), literal 0 database attempts.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc6-lead-nav-scan.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');

(async () => {
  const browser = await chromium.launch();
  for (const V of [{ tag: 'phone', ctx: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } }, { tag: 'desktop', ctx: { viewport: { width: 1280, height: 720 } } }]) {
    const ctx = await browser.newContext(V.ctx);
    const db = await blockDb(ctx); await ctx.routeWebSocket(/.*/, (ws) => ws.close());
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      window.__scan = { n: 0, frames: 0 };
      const q = Document.prototype.querySelectorAll;
      Document.prototype.querySelectorAll = function (sel) { if (typeof sel === 'string' && sel.indexOf('.mm-nav-legacy:not(') === 0) window.__scan.n++; return q.call(this, sel); };
    });
    await page.goto(ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=777');
    await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active && window.__mm.arena.state === 'play' && window.MMNav && window.MMNav.mounted(), null, { timeout: 30000 });
    await page.waitForTimeout(1500);
    // 6 s of play: the hero walks and fires (real keys), HP kept up so the run does not end; float texts and the HUD keep changing
    const before = await page.evaluate(() => { const f = () => { window.__scan.frames++; requestAnimationFrame(f); }; requestAnimationFrame(f); window.__mm.arena.autoFire = true; return window.__scan.n; });
    const t0 = Date.now(); const keys = ['d', 's', 'a', 'w']; let i = 0;
    while (Date.now() - t0 < 6000) {
      const k = keys[i++ % 4]; await page.keyboard.down(k); await page.waitForTimeout(700); await page.keyboard.up(k);
      await page.evaluate(() => { const a = window.__mm.arena; a.player.hp = a.stats.maxHp; a._floatText(a.player.x, a.player.y - 30, '+1', '#fff'); a._syncHud(); });
    }
    const r = await page.evaluate((b) => ({ scans: window.__scan.n - b, frames: window.__scan.frames, state: window.__mm.arena.state }), before);
    console.log(`INFO ${V.tag}: ${r.scans} legacy scans in ${r.frames} frames of Realm play`);
    check(`${V.tag}: the Realm is still in play after the 6 s`, r.state === 'play' && r.frames > 20, JSON.stringify(r));
    check(`${V.tag}: the Menu's legacy scan does not run all through play (at most 12 scans in 6 s; it was one per DOM change)`, r.scans <= 12, JSON.stringify(r));
    // still works: a legacy link that appears later leaves the tab order and the a11y tree
    await page.evaluate(() => { const a = document.createElement('a'); a.id = 'cyc6-legacy'; a.className = 'mm-nav-legacy'; a.href = '#'; a.textContent = 'old link'; document.body.appendChild(a); });
    const hid = await page.waitForFunction(() => { const a = document.getElementById('cyc6-legacy'); return a.getAttribute('aria-hidden') === 'true' && a.getAttribute('tabindex') === '-1'; }, null, { timeout: 3000 }).then(() => true).catch(() => false);
    check(`${V.tag}: a legacy link added later is still hidden from Tab and the a11y tree`, hid);
    check(`${V.tag}: no page errors, no database traffic (literal 0)`, errors.length === 0 && db.attempts() === 0, errors.join(' | ') + ' db=' + db.attempts());
    await ctx.close();
  }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
