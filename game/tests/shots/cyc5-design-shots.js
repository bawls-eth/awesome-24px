// cyc5 D: real-page check of the home isle golden-apple glints (count, respawn) + screenshots at 1280x720 and 390x844. Offline (no DB). Not a test.
const { chromium } = require('playwright');
const { blockDb } = require('../helpers');
const ORIGIN = process.env.BASE_ORIGIN || 'http://localhost:9504';
(async () => {
  const b = await chromium.launch();
  for (const [w, h, tag] of [[1280, 720, 'desk'], [390, 844, 'phone']]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } }); await blockDb(ctx);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.addInitScript(() => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', '{"realm":{"level":3},"name":"Bo"}'); });
    await p.goto(ORIGIN + '/game/games/isles/index.html?test=1&isle=home');
    await p.waitForFunction(() => window.__isles, null, { timeout: 30000 });
    await p.waitForTimeout(1500);
    const r = await p.evaluate(() => { const n = window.__isles.nodes ? window.__isles.nodes() : []; return { gold: n.filter((x) => x.kind === 'golden_apple').map((x) => [x.x, x.y]), total: n.length }; });
    console.log(tag, JSON.stringify(r), 'errors', errs.length);
    await p.screenshot({ path: 'game/design/beta/img/cyc5-design-isles-home-' + tag + '.jpg', type: 'jpeg', quality: 70 });
    await ctx.close();
  }
  await b.close();
})();
