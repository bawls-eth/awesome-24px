// Round 4 (D1), b11-12: the Deepdelve creative world (?mode=creative) listed the survival goals ("Depth -8" ...) in its Goals panel as if they
// could be earned there (award() is off in creative). The panel now leads with a note that medals are off in the creative world and are
// earned in the survival world; the survival world shows no such note. Phone 390x844, DB blocked.
// Run: NODE_PATH=$(npm root -g) BASE=http://localhost:8440/game/index.html node game/tests/beta-r4-b11-12-creative-goals.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');

(async () => {
  const browser = await chromium.launch();
  try {
    for (const [q, creative] of [['?test=1&mode=creative', true], ['?test=1', false]]) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
      await blockDb(ctx);
      const page = await ctx.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(ORIGIN + '/game/games/deepdelve/index.html' + q);
      await page.waitForFunction(() => window.__dd && window.__dd.ready, null, { timeout: 60000 });
      await page.click('#open-goals');
      await page.waitForSelector('#goals-panel:not([hidden])', { timeout: 5000 }).catch(() => {});
      const r = await page.evaluate(() => { const n = document.getElementById('goal-creative-note'); const first = document.querySelector('#goal-list li'); return { note: n ? n.textContent : '', first: first ? first.id : '', vis: !!n && n.getClientRects().length > 0 }; });
      if (creative) check('b11-12: creative world Goals panel first says medals are off here and are earned in the survival world', r.vis && r.first === 'goal-creative-note' && /off here/.test(r.note) && /survival world/.test(r.note), JSON.stringify(r));
      else check('b11-12: the survival world Goals panel has no creative note', !r.note, JSON.stringify(r));
      check(`no pageerror (${creative ? 'creative' : 'survival'})`, errors.length === 0, errors.join(' | '));
      await ctx.close();
    }
  } finally { await browser.close(); }
  done();
})();
