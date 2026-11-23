// Lantern camp first screen: <= 40 words before the primary button, details live behind a Help disclosure,
// the stash's empty slots are not Tab stops. DB blocked; no network writes.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/lantern-intro-help.test.js
const { chromium } = require('playwright');
const { blockDb, check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL_ = ORIGIN + '/game/games/mad-maze/lantern.html?test=1';
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await blockDb(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL_); await page.waitForSelector('#heroes', { state: 'attached' });
  const r = await page.evaluate(() => {
    const words = (t) => t.trim().split(/\s+/).filter(Boolean).length;
    const first = [...document.querySelectorAll('.btn.primary')].find((e) => e.offsetParent);
    const w = document.createTreeWalker(document.getElementById('app'), NodeFilter.SHOW_TEXT); let n, c = 0;
    while ((n = w.nextNode())) { if (first.compareDocumentPosition(n) & 4) break; if (n.parentElement.offsetParent !== null) c += words(n.textContent); }
    return { before: c, total: words(document.getElementById('app').innerText), help: !!document.querySelector('#help summary'), open: document.getElementById('help').open, note: document.getElementById('new-class-note').textContent, unlocks: document.querySelectorAll('#help-unlocks li').length,
      slots: [...document.querySelectorAll('#stash .slot')].every((b) => b.getAttribute('tabindex') === '-1') };
  });
  check('<= 40 words before the first primary button', r.before <= 40, String(r.before));
  check('visible intro text stays under 300 words', r.total < 300, String(r.total));
  check('Help disclosure exists and starts closed', r.help && !r.open);
  check('class note is short; unlock rules are listed in Help', r.note.length < 90 && r.unlocks >= 5, r.note + ' / ' + r.unlocks);
  check('empty stash slots are not Tab stops', r.slots);
  check('no page errors', errors.length === 0, errors.join(';'));
  await browser.close(); done();
})();
