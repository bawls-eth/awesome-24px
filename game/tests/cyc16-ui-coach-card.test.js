// Cycle 16 U (b06/b15 retest 3 + cycle 15 queue): the Realm coach card at 195x422 was 91 px wide, so a long step text made it up to 69% of the screen
// tall and it sat on the hero and the HUD. At <= 260 px it is now the full width in a smaller type (no step counter), starts under the corner compass
// and keeps off the hero (the camera centre). For every coach step (move .. portal), at 195x422, 390x844 and 1280x720:
//   - the card is shown and, at 195x422, at most 35% of the screen tall;
//   - it does not overlap the compass (#mm-nav-btn) and does not overlap the hero box (camera centre +-20 px);
//   - it stays inside the screen, the Skip button is still >= 44 px tall.
// Firebase blocked (blockDb); nothing is written to any DB. Run: BASE=http://localhost:9102/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc16-ui-coach-card.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/mad-maze/index.html?mode=world&seed=77&test=1&tutorial=1';
const STEPS = ['move', 'shoot', 'bag', 'ability', 'portal'];
const SHOTS = process.env.SHOTS || '';

(async () => {
  const browser = await chromium.launch();
  for (const vp of [{ width: 195, height: 422, touch: true }, { width: 390, height: 844, touch: true }, { width: 1280, height: 720 }]) {
    for (let i = 0; i < STEPS.length; i++) {
      const L = `[${vp.width}x${vp.height} step ${STEPS[i]}]`;
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: !!vp.touch, isMobile: !!vp.touch });
      await blockDb(ctx);
      await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
      await ctx.addInitScript((d) => { if (sessionStorage.c16) return; sessionStorage.c16 = '1'; localStorage.clear(); localStorage.setItem('pixeltown-realm-tutorial-v1', JSON.stringify({ v: 1, s: { done: d, finished: false, rewarded: false }, p0: 0 })); }, STEPS.slice(0, i));
      const page = await ctx.newPage(); const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(PAGE);
      await page.waitForFunction(() => { const m = window.__mm; return !!(m && m.world && m.arena.active && m.arena.state === 'play'); }, null, { timeout: 25000 }).catch(() => {});
      await page.waitForSelector('#realm-hero-close', { timeout: 8000 }).then(() => page.click('#realm-hero-close')).catch(() => {});
      await page.waitForTimeout(700);
      const m = await page.evaluate(() => {
        const c = document.getElementById('mm-coach'); if (!c) return { there: false };
        const r = c.getBoundingClientRect(); const n = document.getElementById('mm-nav-btn'); const nr = n ? n.getBoundingClientRect() : null;
        const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        const hero = { left: innerWidth / 2 - 20, right: innerWidth / 2 + 20, top: innerHeight / 2 - 20, bottom: innerHeight / 2 + 20 };
        const sk = document.getElementById('mm-coach-skip').getBoundingClientRect();
        return { there: true, shown: getComputedStyle(c).display !== 'none' && r.height > 0, step: c.dataset.step, h: Math.round(r.height), frac: r.height / innerHeight,
          navHit: !!(nr && nr.width > 0 && hit(r, nr)), heroHit: hit(r, hero), inside: r.left >= 0 && r.right <= innerWidth + 0.5 && r.top >= 0 && r.bottom <= innerHeight, skipH: Math.round(sk.height) };
      });
      check(`${L} the coach card is shown on its step`, m.there && m.shown && m.step === STEPS[i], JSON.stringify(m));
      if (vp.width === 195) check(`${L} the card is at most 35% of the screen tall`, m.frac <= 0.35, JSON.stringify(m));
      check(`${L} the card does not overlap the compass`, m.there && !m.navHit, JSON.stringify(m));
      check(`${L} the card does not cover the hero`, m.there && !m.heroHit, JSON.stringify(m));
      check(`${L} the card is inside the screen and Skip is a 44 px target`, m.there && m.inside && m.skipH >= 44, JSON.stringify(m));
      check(`${L} no page errors`, errors.length === 0, errors.join(' | '));
      if (SHOTS && STEPS[i] === 'bag') await page.screenshot({ path: `${SHOTS}-${vp.width}.jpg`, type: 'jpeg', quality: 70 });
      await ctx.close();
    }
  }
  await browser.close();
  done();
})();
