// Round 4 (D1), b02-08: a compare +/- picked on the Gear tab (tap a row) must not linger on the Stats tab, where there is no row to explain it
// and a "-" reads as a debuff. Switching tabs clears the compare; tapping a row on the Gear tab still shows it there.
// blockDb on the context, ?test=1, no chat, no Firebase writes.
// Run: python3 -m http.server 8440 &   BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/beta-r4-b02-08-stats-delta.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=12345';

(async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const db = await blockDb(ctx);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(URL);
    await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active, null, { timeout: 30000 });
    await page.evaluate(() => {
      const a = window.__mm.arena; a.save.items = [{ n: 30, id: 'sparkwand', r: 0, t: 8 }, { n: 31, id: 'quickwand', r: 2 }, { n: 32, id: 'arm_heavy_iron', r: 0, t: 2 }];
      a.save.eq = { weapon: 30 }; a.save.nextUid = 500; a._calcStats(); a.state = 'play'; a.setPaused(true); a.bpTab('gear'); a.renderBackpack();
    });
    const dd = () => page.evaluate(() => Array.from(document.querySelectorAll('#realm-bp-stat4 .dd')).map((e) => e.textContent).join('|'));
    // pick the armour row on the Gear tab: its +/- shows in the Gear strip
    await page.evaluate(() => { const li = document.querySelector('#realm-bp-list li[data-uid="32"] .st'); li.click(); });
    const strip = await page.evaluate(() => Array.from(document.querySelectorAll('#realm-bp-cmp4 .dd')).map((e) => e.textContent).join('|'));
    check('b02-08: tapping a Gear row shows its +/- on the Gear strip', /[+=-]/.test(strip), strip);
    await page.evaluate(() => document.querySelector('[data-bp-tab="stats"]').click());
    const s1 = await dd();
    check('b02-08: on the Stats tab no +/- from the Gear tab lingers', s1.replace(/\|/g, '') === '', s1);
    const forTxt = await page.evaluate(() => document.getElementById('realm-bp-stat4-for').textContent);
    check('b02-08: the Stats tab says how to compare instead of naming the old item', /Gear tab/.test(forTxt) && !/Wearing|Taking off/.test(forTxt), forTxt);
    // a re-render on the Stats tab (e.g. a pickup) must not bring the stale delta back
    await page.evaluate(() => window.__mm.arena.renderBackpack());
    const s2 = await dd();
    check('b02-08: a re-render on the Stats tab keeps the delta cleared', s2.replace(/\|/g, '') === '', s2);
    // back on Gear, tapping still works
    await page.evaluate(() => { document.querySelector('[data-bp-tab="gear"]').click(); document.querySelector('#realm-bp-list li[data-uid="31"] .st').click(); });
    const strip2 = await page.evaluate(() => Array.from(document.querySelectorAll('#realm-bp-cmp4 .dd')).map((e) => e.textContent).join('|'));
    check('b02-08: back on Gear a tap still shows a +/-', /[+=-]/.test(strip2), strip2);
    check('b02-08: no pageerror', errors.length === 0, errors.join(' | '));
    check('no DB traffic left the page (all blocked)', db.count() >= 0);
    await ctx.close();
  } finally { await browser.close(); }
  done();
})();
