// G-17 (b09-02, b08-07): the shared result card (MMMiniKit.panel) guards its own buttons: a click 100 ms after the card opens does nothing,
// at holdMs + 50 ms it works (Pop, Echo, Stack, Dash; Echo needs no echo.js change). R / Enter keep the same hold; reduced motion does not
// change it. The Stack result has a "Menu" button that opens the shared nav sheet. Local pages only (blockDb), no chat, no writes.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-g17-result-guard.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const GAMES = [
  ['pop', '__pop', (g) => { g.start(); g.end(); }],
  ['echo', '__echo', (g) => { g.start(); g.end(); }],
  ['stack', '__stack', (g) => { g.start(); g.end(); }],
  ['dash', '__dash', (g) => { g.start(); g.step(3000); }],
];

(async () => {
  const browser = await chromium.launch();
  for (const reduced of [false, true]) {
    for (const [id, handle, endFn] of GAMES) {
      const ctx = await browser.newContext({ viewport: { width: 1000, height: 760 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
      await blockDb(ctx);
      const page = await ctx.newPage(); const errors = [];
      page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
      await page.goto(ORIGIN + '/game/games/' + id + '/index.html?test=1');
      await page.waitForFunction((h) => !!window[h], handle, { timeout: 15000 });
      const L = `${id}${reduced ? ' (reduced motion)' : ''}`;
      // end a round, then a real mouse click on Play again at ~100 ms: nothing; at holdMs + 50 ms: a new round
      await page.evaluate(([h, f]) => { (new Function('g', 'return (' + f + ')(g)'))(window[h]); }, [handle, endFn.toString()]);
      const t0 = Date.now();
      const box = await page.evaluate(() => { const b = document.getElementById('again'); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      const wait = Math.max(0, 100 - (Date.now() - t0)); if (wait) await page.waitForTimeout(wait);
      await page.mouse.click(box.x, box.y);
      const early = await page.evaluate((h) => window[h].run.state, handle);
      await page.keyboard.press('r');
      const earlyKey = await page.evaluate((h) => window[h].run.state, handle);
      await page.waitForTimeout(Math.max(0, 450 - (Date.now() - t0)));
      await page.mouse.click(box.x, box.y);
      const late = await page.evaluate((h) => window[h].run.state, handle);
      check(`${L}: a click on Play again ~100 ms after the card opens does nothing (and R neither)`, !!box && early !== 'play' && earlyKey !== 'play', JSON.stringify({ early, earlyKey }));
      check(`${L}: at holdMs + 50 ms the click starts a new round`, late === 'play', late);
      if (id === 'stack' && !reduced) {
        await page.evaluate((h) => { window[h].end(); }, handle);
        await page.waitForTimeout(500);
        const m = await page.evaluate(() => { const b = document.getElementById('r-menu'); return b ? { text: b.textContent, vis: b.getClientRects().length > 0 } : null; });
        await page.click('#r-menu');
        const opened = await page.evaluate(() => !!(window.MMNav && window.MMNav.isOpen && window.MMNav.isOpen()));
        check('stack: the result card has a "Menu" button that opens the shared nav sheet', m && m.text === 'Menu' && m.vis && opened, JSON.stringify({ m, opened }));
      }
      check(`${L}: no page errors`, errors.length === 0, errors.join(' | '));
      await ctx.close();
    }
  }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
