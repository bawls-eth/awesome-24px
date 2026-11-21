// Phone HUD right column (PLAYTEST-REVIEW-2 #7/#9/#10): small minimap thumbnail that expands on tap, one-line zone text, and a portal / site prompt that
// never overlaps an ability button or a stick. Desktop keeps the 96 px minimap. Screenshots go to $SHOTS (default: os tmp dir).
// Run: BASE=http://localhost:8632/game/index.html NODE_PATH=$(npm root -g) node game/tests/world-phone-hud.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const os = require('os');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=12345';
const SHOTS = process.env.SHOTS || os.tmpdir();
const waitPlay = (page) => page.waitForFunction(() => window.__mm && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 15000 });
const W = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world, ${JSON.stringify(arg)})`);
async function open(browser, vp) {
  const ctx = await browser.newContext(vp);
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(WORLD); await waitPlay(page);
  await page.waitForTimeout(400);
  return { ctx, page, errors };
}
const box = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; }, sel);
const hit = (a, b) => a && b && a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;
const tpTo = (page, x, y) => W(page, (a, w, t) => { a.player.x = (t.x + 0.5) * 32; a.player.y = (t.y + 0.5) * 32; a.player.iframes = 1e9; }, { x, y });
// every control the prompt must clear: the ability buttons and both sticks
const controls = (page) => page.evaluate(() => {
  const out = [];
  document.querySelectorAll('.realm-ab, .realm-stick, #realm-abilities button').forEach((e) => { const cs = getComputedStyle(e); if (cs.display === 'none') return; const r = e.getBoundingClientRect(); if (r.width) out.push({ n: e.id || e.className, x: r.x, y: r.y, r: r.right, b: r.bottom, w: r.width, h: r.height }); });
  return out;
});

(async () => {
  const browser = await chromium.launch();
  for (const vp of [{ w: 390, h: 844 }, { w: 360, h: 640 }]) {
    const tag = vp.w + 'x' + vp.h;
    const P = await open(browser, { viewport: { width: vp.w, height: vp.h }, hasTouch: true, isMobile: true }); const page = P.page;
    const mini = await box(page, '#rw-minimap');
    check(tag + ': minimap thumbnail <= 80 px and >= 44 px tap area', mini && mini.w <= 80 && mini.h <= 80 && mini.w >= 44 && mini.h >= 44, JSON.stringify(mini));
    const zone = await box(page, '#rw-zone');
    const lines = await page.evaluate(() => { const z = document.querySelector('#rw-zone'); const lh = parseFloat(getComputedStyle(z).lineHeight) || parseFloat(getComputedStyle(z).fontSize) * 1.2; return { h: z.getBoundingClientRect().height, lh, fs: parseFloat(getComputedStyle(z).fontSize), kids: [...z.children].filter((c) => getComputedStyle(c).display !== 'none').map((c) => c.getBoundingClientRect().top) }; });
    check(tag + ': zone text is one 11-12 px line', zone && lines.fs >= 11 && lines.fs <= 12 && lines.h <= lines.lh * 1.5 + 1, JSON.stringify(lines));
    check(tag + ': right column is narrower than 40% of the width', mini && mini.w + 20 < vp.w * 0.4, '');
    await page.screenshot({ path: SHOTS + '/phone-hud-' + tag + '-base.png' });
    // expand on tap, collapse on tap
    await page.tap('#rw-minimap'); await page.waitForTimeout(150);
    const big = await box(page, '#rw-minimap');
    check(tag + ': tapping the thumbnail expands the map overlay (fits the viewport)', big && big.w > mini.w * 1.5 && big.r <= vp.w && big.b <= vp.h, JSON.stringify(big));
    await page.screenshot({ path: SHOTS + '/phone-hud-' + tag + '-big.png' });
    await page.tap('#rw-minimap'); await page.waitForTimeout(150);
    const back = await box(page, '#rw-minimap');
    check(tag + ': tapping again collapses back', back && back.w === mini.w, JSON.stringify(back));
    // portal prompt, site prompt, both: never over an ability button or stick
    const portals = await W(page, (a, w) => w.portals());
    await tpTo(page, portals[0].tx, portals[0].ty); await page.waitForTimeout(700);
    const pb = await box(page, '#rw-portal'); const ctl = await controls(page);
    check(tag + ': portal prompt is visible', !!pb, JSON.stringify(pb));
    check(tag + ': portal prompt overlaps no ability button or stick', pb && !ctl.some((c) => hit(pb, c)), JSON.stringify({ pb, hits: ctl.filter((c) => hit(pb, c)).map((c) => c.n) }));
    check(tag + ': portal prompt is >= 44 px tall and inside the viewport', pb && pb.h >= 44 && pb.x >= 0 && pb.r <= vp.w, JSON.stringify(pb));
    await page.screenshot({ path: SHOTS + '/phone-hud-' + tag + '-portal.png' });
    const sites = await W(page, (a, w) => w.sites());
    await tpTo(page, sites.shrines[0].x, sites.shrines[0].y); await page.waitForTimeout(700);
    const sb = await box(page, '#rw-site'); const ctl2 = await controls(page);
    check(tag + ': site prompt overlaps no ability button or stick', sb && !ctl2.some((c) => hit(sb, c)), JSON.stringify({ sb, hits: ctl2.filter((c) => hit(sb, c)).map((c) => c.n) }));
    check(tag + ': site prompt is >= 44 px tall and inside the viewport', sb && sb.h >= 44 && sb.x >= 0 && sb.r <= vp.w, JSON.stringify(sb));
    await page.screenshot({ path: SHOTS + '/phone-hud-' + tag + '-site.png' });
    // both prompts at once (portal + site): they stack above the grid, do not overlap each other or any control
    await page.evaluate(() => { document.getElementById('rw-portal').classList.remove('hidden'); });
    await page.waitForTimeout(150);
    const b1 = await box(page, '#rw-portal'); const b2 = await box(page, '#rw-site'); const ctl3 = await controls(page);
    check(tag + ': stacked portal + site prompts clear each other and every control', b1 && b2 && !hit(b1, b2) && !ctl3.some((c) => hit(b1, c) || hit(b2, c)), JSON.stringify({ b1, b2 }));
    await page.screenshot({ path: SHOTS + '/phone-hud-' + tag + '-both.png' });
    const ab = ctl2.filter((c) => /realm-ab/.test(c.n));
    check(tag + ': every ability button is >= 44 px', ab.length >= 4 && ab.every((c) => c.w >= 44 && c.h >= 44), JSON.stringify(ab.map((c) => [c.w, c.h])));
    const sc = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bw: document.body.scrollWidth }));
    check(tag + ': no horizontal scroll', sc.sw <= sc.cw && sc.bw <= sc.cw, JSON.stringify(sc));
    check(tag + ': no console errors', P.errors.length === 0, P.errors.join('; '));
    await P.ctx.close();
  }
  // desktop is unchanged: 96 px minimap
  const D = await open(browser, { viewport: { width: 1280, height: 720 } });
  const dm = await box(D.page, '#rw-minimap');
  check('desktop: minimap stays its 96 px canvas + border (100 px box)', dm && Math.round(dm.w) === 100 && Math.round(dm.h) === 100, JSON.stringify(dm));
  await D.page.screenshot({ path: SHOTS + '/phone-hud-desktop.png' });
  check('desktop: no console errors', D.errors.length === 0, D.errors.join('; '));
  await D.ctx.close();
  await browser.close(); done();
})();
