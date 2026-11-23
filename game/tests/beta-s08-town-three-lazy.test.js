// Beta S-08 (b13-02): the Town loads three.js only on the first cave visit (ES module build, so no deprecation warning).
// OFFLINE ONLY: blockDb + the Firebase SDK answered empty, entry through "Play offline"; never chats, never writes to Firebase.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-s08-town-three-lazy.test.js
//  1. Town cold load + join: no request for three.js
//  2. opening the cave requests it exactly once and the cave is built; leaving and re-entering requests nothing more
//  3. three.js unreachable: the cave says it could not load, no pageerror, and the next try (network back) works
//  4. no "three.min.js ... deprecated" console warning
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const THREE_RE = /cdn\.jsdelivr\.net\/npm\/three@/;

async function open(browser, blockThree) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const db = await blockDb(ctx);
  await ctx.route(/gstatic\.com\/firebasejs\//, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* firebase SDK blocked by beta-s08 */' }));
  await ctx.route('**/main.js*', async (route) => {
    const resp = await route.fetch();
    const body = (await resp.text()).replace('const game = new Phaser.Game(config);', 'const game = window.__g = new Phaser.Game(config);');
    route.fulfill({ response: resp, body });
  });
  const st = { block: blockThree };
  await ctx.route(THREE_RE, (r) => (st.block ? r.abort() : r.continue()));
  const page = await ctx.newPage();
  const errors = [], warns = [], three = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (/deprecated/i.test(m.text()) && /three/i.test(m.text())) warns.push(m.text()); });
  page.on('request', (r) => { if (THREE_RE.test(r.url())) three.push(r.url()); });
  await page.goto(BASE);
  await page.fill('#name-input', 'ADMINs08');
  await page.click('button:has-text("Join Town")'); // offline: the SDK is stubbed, so this only offers 'Play offline'
  await page.waitForSelector('#join-offline-btn:not(.hidden)', { timeout: 20000 });
  await page.click('#join-offline-btn');
  await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  return { ctx, page, db, errors, warns, three, st };
}
const T = (page, src) => page.evaluate(`(function (t) { ${src} })(window.__g.scene.getScene('Town'))`);

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  {
    const { ctx, page, db, errors, warns, three } = await open(browser, false);
    check('[1] Town cold load + join: no three.js request', three.length === 0 && await page.evaluate(() => typeof THREE === 'undefined'), JSON.stringify(three));
    await T(page, 't.enterUnderground();');
    await page.waitForFunction(() => window.__g.scene.getScene('Town').inUnderground && window.__g.scene.getScene('Town').underground, null, { timeout: 30000 });
    check('[2] opening the cave loads three.js once and builds the cave', three.length === 1 && /three\.module/.test(three[0]) && await page.evaluate(() => typeof THREE !== 'undefined' && !!document.querySelector('#underground-canvas-wrap canvas')), JSON.stringify(three));
    await T(page, 't.exitUnderground(); t.enterUnderground();');
    await page.waitForTimeout(500);
    check('[2] leaving and re-entering requests nothing more', three.length === 1 && await T(page, 'return t.inUnderground;'));
    check('[4] no three.js deprecation warning', warns.length === 0, warns.join(' | '));
    check('no page errors', errors.length === 0, errors.join(' | '));
    check('no database traffic', db.attempts() === 0);
    await ctx.close();
  }
  {
    const { ctx, page, errors, st } = await open(browser, true);
    await T(page, 't.enterUnderground();');
    await page.waitForFunction(() => [...document.querySelectorAll('#chat-log .chat-line')].some((l) => /Could not load the cave/.test(l.textContent)), null, { timeout: 20000 }).catch(() => {});
    check('[3] unreachable three.js: the cave says it could not load', await page.evaluate(() => [...document.querySelectorAll('#chat-log .chat-line')].some((l) => /Could not load the cave/.test(l.textContent))));
    check('[3] still in the town, no pageerror', !(await T(page, 'return t.inUnderground;')) && errors.length === 0, errors.join(' | '));
    st.block = false;
    await T(page, 't.enterUnderground();');
    const ok = await page.waitForFunction(() => window.__g.scene.getScene('Town').inUnderground, null, { timeout: 30000 }).then(() => true).catch(() => false);
    check('[3] the next try with the network back opens the cave', ok);
    await ctx.close();
  }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
