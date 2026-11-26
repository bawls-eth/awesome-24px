// cycle 14 L (3): two small-screen leftovers from the cycle 13 Open list.
//  A. Isles at 160x284 with the first-visit how-to card up: the toast was placed at y 222 in an 88 px column, so the real first toast
//     ("Medal: Verdant Jungle") ended 3 px above the bottom edge and a journal line ("New in your journal: ...") ended at y 328 of
//     284, off the screen. Now, up to 300 px tall, it is anchored to the bottom edge at the full width and grows upward.
//     Checked with the game's own toast and with the longest journal line: inside the screen, under the card, the HUD and the
//     action row. 195x422 and 390x844 keep their place (same checks as cyc5-ui-isles-compact: off the card, HUD, action buttons).
//  B. Museum at 195x422: the right scroll cue (24 px) lay on the first tab's count ("0/5"). Up to 260 px wide the bar starts 2 px
//     from its edge, a tab is tighter, and the cue is 18 px: the cue's drawn box no longer touches the first tab's count; it is
//     still >= 18 px with its arrow, the tabs stay >= 44 px tall, and a real tap on the first tab still opens it. 390x844 unchanged.
// OFFLINE: Isles = blockDb (no Firebase at all); Town = helpers.offlineStub, literal db.attempts() === 0. Nothing is written anywhere.
// Run: BASE=http://localhost:9101/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc14-lead-small-screens.test.js  (SHOTS=<dir>)
const { chromium } = require('playwright');
const { check, done, blockDb, offlineStub, exposeGame, joinOffline } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const ORIGIN = BASE.replace(/\/game\/index\.html.*$/, '');
const SHOTS = process.env.SHOTS || '';
const J = JSON.stringify;
const hit = (a, b) => !!(a && b && a.x < b.r - 0.5 && b.x < a.r - 0.5 && a.y < b.b - 0.5 && b.y < a.b - 0.5);
const box = (page, sel) => page.evaluate((s) => {
  const e = document.querySelector(s); if (!e || e.hidden) return null; const cs = getComputedStyle(e);
  if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return null;
  const r = e.getBoundingClientRect(); if (!r.width) return null; return { x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
}, sel);
const LONG = 'New in your journal: Scarlet Macaw (rare)!'; // the shape of isles.js line 829, the longest journal toast

(async () => {
  const browser = await chromium.launch();
  // ---------- A. Isles toast ----------
  for (const [w, h] of [[160, 284], [195, 422], [390, 844]]) {
    const tag = `Isles ${w}x${h}: `;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    const db = await blockDb(ctx);
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => { if (sessionStorage.s) return; sessionStorage.s = 1; localStorage.clear(); });
    await page.goto(ORIGIN + '/game/games/isles/index.html?test=1&seed=5&isle=jungle');
    await page.waitForFunction(() => window.__isles && window.__isles.world);
    await page.waitForTimeout(400);
    const card = await box(page, '#howto'), hud = await box(page, '#hud');
    check(tag + 'the first-visit how-to card is up (compact)', !!card && await page.evaluate(() => document.getElementById('howto').classList.contains('compact')), J(card));
    for (const mode of ['game', 'journal']) {
      // 'game': the toast the game itself raises on this first screen; 'journal': the longest journal line through the same element
      if (mode === 'game') await page.evaluate(() => { try { window.__isles.feed(); } catch (e) { /* toast only */ } });
      else await page.evaluate((txt) => { const t = document.getElementById('toast'); t.textContent = txt; t.classList.add('on'); }, LONG);
      await page.waitForTimeout(300);
      const t = await box(page, '#toast'); const txt = await page.evaluate(() => document.getElementById('toast').textContent);
      const acts = await page.evaluate(() => [...document.querySelectorAll('#acts button')].filter((b) => !b.hidden && b.offsetParent).map((b) => { const r = b.getBoundingClientRect(); return { id: b.id, x: r.left, y: r.top, r: r.right, b: r.bottom }; }).filter((r) => r.r > r.x && r.x < innerWidth));
      const what = mode === 'game' ? `the game's own toast ("${txt}")` : 'a journal line';
      check(tag + what + ' is fully inside the screen (was: bottom at y 328 of 284 for the journal line at 160x284)', !!t && t.h > 0 && t.x >= 0 && t.y >= 0 && t.r <= w + 0.5 && t.b <= h + 0.5, J({ t, w, h }));
      // Known and NOT fixed here (reported in cycle14-lead.md): at 195x422 a 4-line journal toast (y 222-296) reaches the Soothe
      // button (y 272). That layout (cyc5-ui, column card) is not this item; the line below prints it instead of hiding it.
      const known = w === 195 && mode === 'journal';
      if (known) { console.log('INFO ' + tag + 'journal line vs action button overlap (pre-existing, unresolved): ' + J(acts.filter((b) => hit(t, b)).map((b) => b.id))); check(tag + what + ' is not on the how-to card or the HUD', !!t && !hit(t, card) && !hit(t, hud), J({ t, card, hud })); }
      else check(tag + what + ' is not on the how-to card, the HUD or an action-row button', !!t && !hit(t, card) && !hit(t, hud) && acts.every((b) => !hit(t, b)), J({ t, card, hud, acts }));
      if (h <= 300) check(tag + what + ': sits at the bottom edge at the full width (8 px gutters), text not clipped', !!t && Math.abs(t.x - 8) <= 1 && Math.abs(t.r - (w - 8)) <= 1 && h - t.b <= 8 && await page.evaluate(() => { const e = document.getElementById('toast'); return e.scrollHeight <= e.clientHeight + 1 && e.scrollWidth <= e.clientWidth + 1; }), J(t));
      if (SHOTS && (h <= 300 || mode === 'journal')) await page.screenshot({ path: `${SHOTS}/cyc14-lead-isles-toast-${w}x${h}-${mode}.jpg`, type: 'jpeg', quality: 78 });
    }
    check(tag + 'the toast is see-through to taps (pointer-events none) and the page does not scroll', await page.evaluate(() => getComputedStyle(document.getElementById('toast')).pointerEvents === 'none' && document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight), '');
    check(tag + 'no page errors, 0 database attempts', errors.length === 0 && db.count() === 0, J([errors, db.count()]));
    await ctx.close();
  }

  // ---------- B. Museum right cue vs the first tab's count ----------
  for (const [w, h] of [[195, 422], [390, 844]]) {
    const tag = `Museum ${w}x${h}: `;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    const db = await offlineStub(ctx);
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await exposeGame(page);
    await page.goto(BASE);
    await joinOffline(page, 'ADMINcyc14m');
    await page.waitForTimeout(600);
    await page.evaluate(() => window.__g.scene.getScene('Town').openMuseum());
    await page.waitForTimeout(400);
    const m = await page.evaluate(() => {
      const bar = document.querySelector('#museum-overlay .museum-tabs'); const br = bar.getBoundingClientRect(); const cs = getComputedStyle(bar), ps = getComputedStyle(bar, '::after');
      const R = (e) => { const r = e.getBoundingClientRect(); return { x: r.left, r: r.right, y: r.top, b: r.bottom, h: r.height }; };
      const tabs = [...bar.querySelectorAll('.museum-tab')];
      // the right cue's drawn box: sticky at the right edge of the bar's scroll box (the padding box; the 54 px border is the ✕ reserve)
      const cw = parseFloat(ps.width) || 0; const edge = br.left + parseFloat(cs.borderLeftWidth) + bar.clientWidth;
      const x = document.getElementById('museum-close-btn').getBoundingClientRect();
      return { cueR: bar.classList.contains('cue-r'), content: ps.content, cueW: cw, cue: { x: edge - cw, r: edge }, sl: bar.scrollLeft, tab0: R(tabs[0]), count0: R(tabs[0].querySelector('.museum-tab-count')), countTxt: tabs[0].querySelector('.museum-tab-count').textContent,
        minTabH: Math.min(...tabs.map((t) => t.getBoundingClientRect().height)), xL: x.left, active: (bar.querySelector('.museum-tab.active') || {}).dataset ? bar.querySelector('.museum-tab.active').dataset.wing : null, more: bar.scrollWidth - bar.clientWidth };
    });
    check(tag + 'on open the bar is at its start with more tabs to the right, and the right cue is drawn (>= 18 px, with the › arrow), ending left of the ✕', m.sl === 0 && m.more > 2 && m.cueR && m.cueW >= 18 && /›/.test(m.content) && m.cue.r <= m.xL + 0.5, J(m));
    check(tag + `the first tab shows its count ("${m.countTxt}") and the cue does not touch it` + (w < 260 ? ' (was: cue x 102-126 over the count at x 100-121)' : ''), /^\d+\/\d+$/.test(m.countTxt) && m.count0.r <= m.cue.x + 0.5 && m.count0.x >= m.tab0.x, J({ count: m.count0, cue: m.cue }));
    check(tag + 'every tab is still >= 44 px tall', m.minTabH >= 44, String(m.minTabH));
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/cyc14-lead-museum-cue-${w}x${h}.jpg`, type: 'jpeg', quality: 78 });
    // a real tap on the second tab's visible part / the first tab opens that wing (the cue takes no taps)
    await page.evaluate(() => { const s = window.__g.scene.getScene('Town'); s.showMuseumWing('fauna'); });
    await page.waitForTimeout(150);
    await page.evaluate(() => { document.querySelector('#museum-overlay .museum-tabs').scrollLeft = 0; });
    await page.waitForTimeout(150);
    await page.touchscreen.tap(Math.round((m.count0.x + m.count0.r) / 2), Math.round((m.tab0.y + m.tab0.b) / 2));
    await page.waitForTimeout(200);
    const wing = await page.evaluate(() => document.querySelector('#museum-overlay .museum-tab.active').dataset.wing);
    check(tag + 'a real tap on the first tab\'s count opens Fossils', wing === 'fossils', wing);
    check(tag + 'no page errors, 0 database attempts (literal)', errors.length === 0 && db.attempts() === 0, J([errors, db.attempts()]));
    await ctx.close();
  }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
