// cyc6-ui (retest 3 open item, b05-r3-05 at 195 px): on a 195x422 phone the jungle greeter (the ONE calm arrival creature) stood 8.5+
// tiles out, which is 272+ px: above the screen or behind the HUD, so the first screen showed no creature. Now, when the placed
// greeter is not in the free part of the first screen, it moves to a free walkable spot on screen (clear of the HUD, the how-to card,
// the minimap, the Menu button and the thumb controls), and a greeter closer than the 8-tile sighting radius:
//   - stands still and fires no journal sighting toast at arrival (no toast pile-up on the first screen),
//   - is sighted once the hero has walked 2 tiles.
// 390x844 and 1280x720 keep a greeter on screen and free too (the ring spot when it is free). DB-safe: blockDb, nothing written anywhere.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc6-ui-isles-arrival.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = (seed) => ORIGIN + '/game/games/isles/index.html?test=1&isle=jungle&seed=' + seed;

// every live creature's drawn box (about one tile, head above the feet) on screen, and what covers it there
const FIRST_SCREEN = () => {
  const I = window.__isles, h = I.hero(), T = I.tile, W = innerWidth, H = innerHeight;
  return I.creatures().map((c) => {
    const sx = c.x - h.x + W / 2, sy = c.y - h.y + H / 2, l = sx - 18, r = sx + 18, t = sy - 30, b = sy + 12;
    const on = l >= 0 && t >= 0 && r <= W && b <= H;
    let cover = '';
    if (on) for (const [x, y] of [[sx, sy - 10], [l + 3, t + 3], [r - 3, t + 3], [l + 3, b - 3], [r - 3, b - 3]]) {
      const e = document.elementFromPoint(x, y); if (e && e !== document.body && e !== document.documentElement && !/^(view|isle-main|touch|toast|hint)$/.test(e.id || '')) { cover = (e.id || e.className || e.tagName) + ''; break; }
    }
    return { sp: c.sp, sx: Math.round(sx), sy: Math.round(sy), d: +(Math.hypot(c.x - h.x, c.y - h.y) / T).toFixed(1), on, cover };
  });
};

async function open(browser, vp, seed) {
  const touch = vp.width < 600;
  const ctx = await browser.newContext(Object.assign({ viewport: vp }, touch ? { hasTouch: true, isMobile: true } : {}));
  await blockDb(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => { if (sessionStorage.s) return; sessionStorage.s = 1; localStorage.clear(); });
  await page.goto(PAGE(seed));
  await page.waitForFunction(() => window.__isles && window.__isles.world);
  await page.waitForTimeout(1800); // the first spawn ticks and the 3 s settle window (HUD, Menu button) mostly done
  return { ctx, page, errors };
}

(async () => {
  const browser = await chromium.launch(); const errs = [];
  for (const [w, h] of [[195, 422], [390, 844], [1280, 720]]) {
    for (const seed of [5, 1, 3]) {
      const tag = w + 'x' + h + ' jungle seed ' + seed + ': ';
      const P = await open(browser, { width: w, height: h }, seed), p = P.page;
      const arr = await p.evaluate(() => window.__isles.arrival());
      const cs = await p.evaluate(FIRST_SCREEN);
      const seen = cs.filter((c) => c.on && !c.cover);
      check(tag + 'a creature stands on the first screen, clear of the HUD, card, minimap, Menu and thumbs', seen.length >= 1, JSON.stringify({ arr: { n: arr.n, view: arr.view, d: arr.d }, cs }));
      check(tag + 'no hostile creature placed next to the hero', !(await p.evaluate(() => window.__isles.creatures().some((c) => c.mood === 'hostile' && Math.hypot(c.x - window.__isles.hero().x, c.y - window.__isles.hero().y) < 7 * window.__isles.tile))));
      if (w === 195) {
        if (seed === 5) await p.screenshot({ path: require('path').join(__dirname, '..', 'design', 'beta', 'img', 'cyc6-ui-isles-195x422.jpg'), type: 'jpeg', quality: 70 }).catch(() => {});
        const ev = await p.evaluate(() => window.__isles.events().filter((e) => e.kind === 'spot').length);
        const toast = await p.evaluate(() => { const t = document.getElementById('toast'); return t && !t.hidden && /journal/i.test(t.textContent) ? t.textContent : ''; });
        check(tag + 'the close greeter fires no journal sighting at arrival (no toast pile-up)', ev === 0 && !toast, JSON.stringify({ ev, toast }));
        // walk 3 tiles toward the greeter (the sim step, the real movement code): the sighting comes once the hero has walked 2 tiles
        const g = cs.find((c) => c.on && !c.cover);
        if (g && g.d < 8) {
          const after = await p.evaluate(({ sx, sy }) => { const I = window.__isles, W = innerWidth, H = innerHeight; const dx = sx - W / 2, dy = sy - H / 2, n = Math.hypot(dx, dy) || 1; I.step(dx / n, dy / n, 0.75); return I.events().filter((e) => e.kind === 'spot').length; }, g);
          check(tag + 'after walking ~3 tiles the greeter is sighted (journal entry)', after >= 1, String(after));
        }
      }
      errs.push(...P.errors); await P.ctx.close();
    }
  }
  check('no page errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
