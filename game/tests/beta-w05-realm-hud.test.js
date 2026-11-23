// W-05 (b15-11, b15-04, b01-06, b02-07, b02-09, b03-03): Realm phone HUD: Leave never on the XP bar, the goal line wraps instead of an
// ellipsis, the "New best tier" toast has its own slot (never over the boss bar / zone / goal lines), HUD labels hide under the open backpack.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-w05-realm-hud.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&heropick=0&seed=12345';
const SHOTS = process.env.SHOTS || null;
const hit = (a, b) => !!(a && b && a.x < b.r - 0.5 && b.x < a.r - 0.5 && a.y < b.b - 0.5 && b.y < a.b - 0.5);

async function open(browser, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
  await blockDb(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(WORLD);
  await page.waitForFunction(() => window.__mm && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 20000 });
  await page.waitForTimeout(600);
  return { ctx, page, errors };
}
const box = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || e.hidden || !e.getClientRects().length) return null; const r = e.getBoundingClientRect(); if (!r.width || !r.height) return null; return { x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }, sel);

(async () => {
  const browser = await chromium.launch();
  // (1) Leave vs XP bar at the two narrow phones from b15-11
  for (const [w, h] of [[320, 568], [360, 640]]) {
    const P = await open(browser, w, h);
    const lv = await box(P.page, '#realm-leave-btn'), xp = await box(P.page, '#realm-xp');
    check(w + 'x' + h + ': #realm-leave-btn and #realm-xp do not intersect', lv && xp && !hit(lv, xp), JSON.stringify({ lv, xp }));
    check(w + 'x' + h + ': Leave stays a >= 44 px target inside the viewport', lv && lv.h >= 44 && lv.w >= 44 && lv.r <= w && lv.x >= 0, JSON.stringify(lv));
    if (SHOTS) await P.page.screenshot({ path: SHOTS + '/w05-' + w + '.png' });
    check(w + 'x' + h + ': no page errors', P.errors.length === 0, P.errors.join('|'));
    await P.ctx.close();
  }
  // (2) 390x844: the goal line shows its whole text (wraps to 2 lines, no ellipsis) for a long quest title
  const G = await open(browser, 390, 844); const gp = G.page;
  await gp.evaluate(() => { const g = document.getElementById('rw-goal'); g.textContent = 'Next goal: Defeat 22 creatures in the Highlands to finish today\'s quest'; g.classList.remove('hidden'); });
  await gp.waitForTimeout(100);
  const goal = await gp.evaluate(() => { const g = document.getElementById('rw-goal'); const cs = getComputedStyle(g); return { sw: g.scrollWidth, cw: g.clientWidth, sh: g.scrollHeight, ch: g.clientHeight, to: cs.textOverflow, ws: cs.whiteSpace, h: g.getBoundingClientRect().height }; });
  check('390x844: goal line is not truncated (scrollWidth <= clientWidth, scrollHeight <= clientHeight)', goal.sw <= goal.cw && goal.sh <= goal.ch + 1, JSON.stringify(goal));
  check('390x844: the long goal wraps to at most 2 lines', goal.h <= 2 * 18 + 12, JSON.stringify(goal));
  // (4) toast slot: never over the boss bar, the zone line or the goal line (boss fight running)
  await gp.evaluate(() => { const a = window.__mm.arena, w = window.__mm.world, s = w.bossSites()[0]; a.player.x = (s.x + 0.5) * 32; a.player.y = (s.y + 3.5) * 32; a.player.iframes = 1e9; });
  await gp.waitForFunction(() => !document.getElementById('realm-boss').classList.contains('hidden'), null, { timeout: 10000 }).catch(() => {});
  await gp.evaluate(() => window.__mm.arena.chaseToast('New best tier: T12 Ember Crown of the Long Night'));
  await gp.waitForTimeout(150);
  const t1 = await box(gp, '#realm-chase-toast'), boss = await box(gp, '#realm-boss'), zone = await box(gp, '#rw-zone'), gl = await box(gp, '#rw-goal'), mini = await box(gp, '#rw-minimap');
  check('390x844 boss fight: toast is shown and does not intersect the boss bar', t1 && boss && !hit(t1, boss), JSON.stringify({ t1, boss }));
  check('390x844 boss fight: toast does not intersect the zone line, goal line or minimap', t1 && !hit(t1, zone) && !hit(t1, gl) && !hit(t1, mini), JSON.stringify({ t1, zone, gl, mini }));
  if (SHOTS) await gp.screenshot({ path: SHOTS + '/w05-390-toast.png' });
  check('390x844: no page errors', G.errors.length === 0, G.errors.join('|'));
  await G.ctx.close();
  // (3) 844x390 with the backpack open: no HUD label over the backpack card; the toast neither
  const B = await open(browser, 844, 390); const bp = B.page;
  await bp.evaluate(() => { const g = document.getElementById('rw-goal'); if (g && g.textContent) g.classList.remove('hidden'); });
  await bp.keyboard.press('b'); await bp.waitForTimeout(300);
  let card = await box(bp, '#realm-backpack .realm-bp-card') || await box(bp, '#realm-backpack');
  if (!card) { await bp.evaluate(() => { const a = window.__mm.arena; if (a.openBackpack) a.openBackpack(); else if (a.togglePanel) a.togglePanel('bp'); }); await bp.waitForTimeout(300); card = await box(bp, '#realm-backpack .realm-bp-card') || await box(bp, '#realm-backpack'); }
  await bp.evaluate(() => window.__mm.arena.chaseToast('New best tier: T12 Ember Crown'));
  await bp.waitForTimeout(150);
  const labels = {}; for (const s of ['#rw-goal', '#rw-zone', '#rw-minimap', '#realm-chase-toast']) labels[s] = await box(bp, s);
  const over = Object.keys(labels).filter((s) => hit(labels[s], card));
  check('844x390 backpack open: the card is shown', !!card, JSON.stringify(card));
  check('844x390 backpack open: no HUD label (goal, zone, minimap, toast) intersects the backpack card', card && over.length === 0, JSON.stringify({ card, over: over.map((s) => [s, labels[s]]) }));
  if (SHOTS) await bp.screenshot({ path: SHOTS + '/w05-844-bp.png' });
  check('844x390: no page errors', B.errors.length === 0, B.errors.join('|'));
  await B.ctx.close();
  // desktop 1280x720 (b02-07, b03-03): the toast neither covers the boss bar nor the open backpack card, and stays readable
  { const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } }); await blockDb(ctx); const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(WORLD); await page.waitForFunction(() => window.__mm && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 20000 });
    await page.evaluate(() => { const a = window.__mm.arena, s = window.__mm.world.bossSites()[0]; a.player.x = (s.x + 0.5) * 32; a.player.y = (s.y + 3.5) * 32; a.player.iframes = 1e9; });
    await page.waitForFunction(() => !document.getElementById('realm-boss').classList.contains('hidden'), null, { timeout: 10000 }).catch(() => {});
    await page.evaluate(() => window.__mm.arena.chaseToast('New best tier: T6 Bloom Staff'));
    const dt = await box(page, '#realm-chase-toast'), db = await box(page, '#realm-boss'), ab = await box(page, '#realm-abilities');
    check('1280x720 boss fight: toast does not intersect the boss bar or the ability bar', dt && db && !hit(dt, db) && !hit(dt, ab), JSON.stringify({ dt, db, ab }));
    await page.keyboard.press('b'); await page.waitForTimeout(300);
    const dc = await box(page, '#realm-backpack .realm-bp-card'); const dt2 = await box(page, '#realm-chase-toast');
    check('1280x720 backpack open: the toast is visible beside the card, not over it (dismiss >= 44 px)', dc && dt2 && !hit(dt2, dc) && dt2.h >= 44, JSON.stringify({ dc, dt2 }));
    check('1280x720: no page errors', errs.length === 0, errs.join('|'));
    await ctx.close(); }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
