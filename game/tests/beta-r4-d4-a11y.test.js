// R4 D4 keyboard access (standalone pages, no Town join, database blocked).
//  b15-r2-17 Dash / Echo / Pop / Stack: Tab runs Menu, Sound, ..., Play in screen order and never drops onto <body> before
//            reaching Play; Enter with nothing focused still starts the run from the start card.
//  b15-10    Isles: the island view (canvas) is a Tab stop with a name, role=application and a visible focus ring.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-r4-d4-a11y.test.js
const { chromium } = require('playwright');
const { check, done, offlineStub } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const ROOT = BASE.replace(/game\/index\.html.*$/, '');
const AE = () => { const e = document.activeElement; return !e || e === document.body || e === document.documentElement ? 'BODY' : (e.id || e.tagName); };

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const mk = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await offlineStub(ctx);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(page.url() + ' pageerror: ' + e.message));
    return { ctx, page };
  };
  for (const g of ['dash', 'echo', 'pop', 'stack']) {
    const { ctx, page } = await mk();
    await page.goto(ROOT + `game/games/${g}/index.html`);
    await page.waitForSelector('#play', { state: 'visible', timeout: 10000 });
    await page.waitForTimeout(500);
    const stops = [];
    for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); const a = await page.evaluate(AE); stops.push(a); if (a === 'play') break; }
    const pi = stops.indexOf('play');
    check(`${g}: Tab order starts Menu, Sound and reaches Play with no <body> stop on the way`, stops[0] === 'mm-nav-btn' && stops[1] === 'btn-mute' && pi > 1 && !stops.slice(0, pi).includes('BODY'), JSON.stringify(stops));
    // Enter with nothing focused starts the run (the old auto-focused Play behaviour, kept for keyboard players)
    const { ctx: c2, page: p2 } = await mk();
    await p2.goto(ROOT + `game/games/${g}/index.html`);
    await p2.waitForSelector('#play', { state: 'visible', timeout: 10000 });
    await p2.waitForTimeout(400);
    const focus0 = await p2.evaluate(AE);
    await p2.keyboard.press('Enter');
    await p2.waitForTimeout(500);
    const started = await p2.evaluate(() => { const b = document.getElementById('play'); return !b || b.offsetParent === null; });
    check(`${g}: nothing is focused on load and Enter starts the run from the start card`, focus0 === 'BODY' && started, JSON.stringify({ focus0, started }));
    await c2.close();
    // a focused game board + Enter also starts from the start card (the a11y sweep's "primary action" lands on the board)
    if (g !== 'dash') {
      const { ctx: c3, page: p3 } = await mk();
      await p3.goto(ROOT + `game/games/${g}/index.html`);
      await p3.waitForSelector('#play', { state: 'visible', timeout: 10000 });
      await p3.waitForTimeout(300);
      await p3.focus('#board');
      await p3.keyboard.press('Enter');
      await p3.waitForTimeout(500);
      const st3 = await p3.evaluate(() => { const b = document.getElementById('play'); return { started: !b || b.offsetParent === null, focus: document.activeElement && document.activeElement.id }; });
      check(`${g}: Enter on the focused board starts the run from the start card`, st3.started, JSON.stringify(st3));
      await c3.close();
    }
    await ctx.close();
  }
  {
    const { ctx, page } = await mk();
    await page.goto(ROOT + 'game/games/isles/index.html');
    await page.waitForSelector('#view', { timeout: 15000 });
    await page.waitForTimeout(1500);
    const stops = [];
    for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); const a = await page.evaluate(AE); stops.push(a); if (a === 'view') break; }
    const v = await page.evaluate(() => { const c = document.getElementById('view'); const cs = getComputedStyle(c); return { role: c.getAttribute('role'), name: c.getAttribute('aria-label') || '', focused: document.activeElement === c, ring: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2 }; });
    check('Isles: the island view is reachable with Tab', stops.includes('view'), JSON.stringify(stops));
    check('Isles: the focused island view has role=application, a name with the keys, and a visible focus ring', v.focused && v.role === 'application' && /WASD/.test(v.name) && v.ring, JSON.stringify(v));
    await ctx.close();
  }
  check('no page errors', errors.length === 0, errors.join('|'));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
