// Round 4 (D1), b08-r2-09 / b08-r2-11 / join compass: on a touch phone (390x844, coarse pointer) the Isles how-to + help, the Pixel Pop
// keys line, the Town join tip and the Realm skip link / play-field label use touch words, never key names. The Town join card has a
// compass Menu that opens the shared "Where to?" sheet, and a disabled Join says "Type your name to join." (hidden once a name is typed).
// A desktop context still shows the key names (nothing removed for keyboard players).
// Offline: blockDb on every context, Town WebSockets closed, no chat, no Firebase writes.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-r4-b08-touch-words.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const KEYS = /WASD|arrows|Arrow keys|Enter or Space|Space or click|Space \/ Enter|Space fire|Enter pops|\bR to get off/;
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

async function ctxPage(browser, opts) {
  const ctx = await browser.newContext(opts); await blockDb(ctx); await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  return { ctx, page, errors };
}

(async () => {
  const browser = await chromium.launch();
  try {
    const s = await ctxPage(browser, PHONE);
    // Isles
    await s.page.goto(ORIGIN + '/game/games/isles/index.html?test=1&seed=3&isle=home');
    await s.page.waitForFunction(() => document.body.classList.contains('touch') && window.__isles, null, { timeout: 30000 }).catch(() => {});
    const isl = await s.page.evaluate(() => ({ howto: document.getElementById('howto-list').textContent, help: document.getElementById('help').textContent }));
    check('Isles (phone): how-to and help text name no keys', !KEYS.test(isl.howto) && !KEYS.test(isl.help) && /stick/.test(isl.howto), JSON.stringify(isl));
    // Pop
    await s.page.goto(ORIGIN + '/game/games/pop/index.html');
    const pop = await s.page.evaluate(() => ({ keys: document.getElementById('keys').textContent, aria: document.getElementById('board').getAttribute('aria-label') }));
    check('Pixel Pop (phone): keys line and board label name no keys', !KEYS.test(pop.keys) && !KEYS.test(pop.aria) && /[Tt]ap/.test(pop.keys), JSON.stringify(pop));
    // Realm
    await s.page.goto(ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&seed=12345');
    await s.page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active, null, { timeout: 30000 }).catch(() => {});
    const rl = await s.page.evaluate(() => ({ skip: document.getElementById('realm-play-focus').textContent, aria: document.getElementById('realm-canvas-wrap').getAttribute('aria-label'), help: (document.querySelector('#realm-help .key-hint') || {}).textContent || '' }));
    check('Realm (phone): skip link and play-field label name no keys (the key help line is hidden on touch)', !KEYS.test(rl.skip) && !KEYS.test(rl.aria) && /stick/.test(rl.aria), JSON.stringify(rl));
    // Town join card
    await s.page.goto(ORIGIN + '/game/index.html?from=hub');
    await s.page.waitForSelector('#join-btn');
    const tj = await s.page.evaluate(() => ({ tip: document.querySelector('#join-overlay .join-tip').textContent }));
    check('Town join (phone): the tip names no keys', !KEYS.test(tj.tip) && !/\bE\b to interact|\bB\b to build|1-9/.test(tj.tip) && /stick/.test(tj.tip), JSON.stringify(tj));
    const h0 = await s.page.evaluate(() => { const h = document.getElementById('join-hint'); const b = document.getElementById('join-btn'); return { dis: b.disabled, txt: h ? h.textContent : '', vis: !!h && h.getClientRects().length > 0 && !h.classList.contains('hidden') }; });
    check('Town join: with no name, Join is disabled and a visible hint says why', h0.dis && h0.vis && /name/i.test(h0.txt), JSON.stringify(h0));
    await s.page.fill('#name-input', 'ADMINtouch');
    const h1 = await s.page.evaluate(() => { const h = document.getElementById('join-hint'); return { dis: document.getElementById('join-btn').disabled, vis: !!h && h.getClientRects().length > 0 && !h.classList.contains('hidden') }; });
    check('Town join: once a name is typed Join is enabled and the hint goes', !h1.dis && !h1.vis, JSON.stringify(h1));
    const mb = await s.page.evaluate(() => { const b = document.getElementById('join-menu-btn'); if (!b) return null; const r = b.getBoundingClientRect(); const c = document.querySelector('#join-overlay .join-card').getBoundingClientRect(); return { w: r.width, h: r.height, left: r.left - c.left, top: r.top - c.top, txt: b.textContent }; });
    check('Town join: a compass Menu sits top-left in the card (>= 44 px)', !!mb && mb.w >= 44 && mb.h >= 44 && mb.left < 40 && mb.top < 40 && /🧭/.test(mb.txt), JSON.stringify(mb));
    await s.page.click('#join-menu-btn');
    const open = await s.page.waitForFunction(() => typeof MMNav !== 'undefined' && MMNav.isOpen(), null, { timeout: 3000 }).then(() => true).catch(() => false);
    check('Town join: the compass Menu opens the "Where to?" sheet', open);
    check('no pageerror (phone pages)', s.errors.length === 0, s.errors.join(' | '));
    await s.ctx.close();
    // desktop keeps the key names
    const d = await ctxPage(browser, { viewport: { width: 1280, height: 720 } });
    await d.page.goto(ORIGIN + '/game/games/pop/index.html');
    const dk = await d.page.evaluate(() => document.getElementById('keys').textContent);
    await d.page.goto(ORIGIN + '/game/index.html');
    await d.page.waitForSelector('#join-btn');
    const dt = await d.page.evaluate(() => document.querySelector('#join-overlay .join-tip').textContent);
    check('desktop: Pop and the Town join tip still list the keys', /arrows/.test(dk) && /WASD/.test(dt), JSON.stringify({ dk, dt }));
    await d.ctx.close();
  } finally { await browser.close(); }
  done();
})();
