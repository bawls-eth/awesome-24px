// Cycle 2 U (UI/UX) copy + density leftovers from cycle 1.
// U-10: on a phone the Realm info line repeated the zone name ("Shore") that the zone line right below already shows; the phone
//       info line drops it (desktop keeps it). Checked at 390x844 (touch) and 1280x720.
// Jam: on a touch device the How to play card said "Keys D F J K, arrows, or touch"; touch players now get touch wording (like
//       Angler / the Realm), keyboard players keep the keys. The #help line follows the same rule.
// blockDb: 0 database traffic. Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc2-ui-copy.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&heropick=0&seed=12345';
const JAM = ORIGIN + '/game/games/jam/index.html?test=1';
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const DESK = { viewport: { width: 1280, height: 720 } };

(async () => {
  const browser = await chromium.launch();
  // ---- U-10 ----
  for (const [tag, opts] of [['390x844', PHONE], ['1280x720', DESK]]) {
    const ctx = await browser.newContext(opts); const db = await blockDb(ctx);
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(WORLD);
    await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active, null, { timeout: 20000 });
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => {
      const vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none' && e.textContent.trim() !== '';
      const z = window.__mm.world.hudText().zone; const zone = (window.__mm.world.zone() || {}).name || '';
      const info = document.getElementById('realm-info'); const wave = document.getElementById('realm-wave');
      return { zoneLine: z, zone, info: info.innerText, waveShown: vis(wave), zoneShown: vis(document.getElementById('rw-zone')) };
    });
    check(`U-10 ${tag}: the zone line names the zone`, r.zoneShown && !!r.zone && r.zoneLine.indexOf(r.zone) >= 0, JSON.stringify(r));
    if (tag === '390x844') check('U-10 390x844: the phone info line does not repeat the zone name', !r.waveShown && r.info.indexOf(r.zone) < 0, JSON.stringify(r));
    else check('U-10 1280x720: desktop info line keeps the zone name', r.waveShown && r.info.indexOf(r.zone) >= 0, JSON.stringify(r));
    check(`U-10 ${tag}: 0 database requests, no page errors`, db.attempts() === 0 && errors.length === 0, errors.join('|'));
    await ctx.close();
  }
  // ---- Jam How to play wording ----
  for (const [tag, opts, touch] of [['390x844 touch', PHONE, true], ['1280x720 keys', DESK, false]]) {
    const ctx = await browser.newContext(opts); const db = await blockDb(ctx);
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(JAM); await page.waitForFunction(() => window.__jam);
    const r = await page.evaluate(() => ({ hint: (document.querySelector('#hint p') || {}).textContent || '', help: (document.getElementById('help') || {}).textContent || '' }));
    if (touch) {
      check('Jam touch: How to play has no keyboard keys', !!r.hint && !/\bkeys?\b|D F J K|arrow/i.test(r.hint), r.hint);
      check('Jam touch: How to play says to tap the lane pads', /tap/i.test(r.hint) && /pad|lane/i.test(r.hint), r.hint);
      check('Jam touch: the #help line has no keyboard keys', !/D F J K|arrow keys|Esc or P|Space or Enter/i.test(r.help), r.help);
      check('Jam touch: the #help line mentions pausing', /pause/i.test(r.help), r.help);
    } else {
      check('Jam keyboard: How to play keeps the keys D F J K', /D F J K/.test(r.hint), r.hint);
      check('Jam keyboard: the #help line keeps the keys', /D F J K/.test(r.help) && /Esc or P/.test(r.help), r.help);
    }
    check(`Jam ${tag}: 0 database requests, no page errors`, db.attempts() === 0 && errors.length === 0, errors.join('|'));
    await ctx.close();
  }
  await browser.close();
  done();
})();
