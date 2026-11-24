// cyc5 D: screenshot of the Stalk price note on a Tuesday with 0 stalks (b11-r3-08). Offline. Not a test.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const [w, h, t] of [[390, 844, 'phone'], [1280, 720, 'desk']]) {
    const c = await b.newContext({ viewport: { width: w, height: h } }); await c.route(/firebase|googleapis/, (r) => r.abort());
    const p = await c.newPage();
    await p.goto('http://localhost:9504/game/games/stalk/index.html?test=1&week=100&slot=3'); await p.waitForFunction(() => window.__stalk); await p.waitForTimeout(800);
    console.log(t, await p.evaluate(() => document.getElementById('price-note').textContent));
    await p.screenshot({ path: 'game/design/beta/img/cyc5-design-stalk-' + t + '.jpg', type: 'jpeg', quality: 70 });
    await c.close();
  }
  await b.close();
})();
