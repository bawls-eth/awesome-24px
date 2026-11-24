// cyc5-ui (retest 3 P2 b07-r3-01): the Town Map drew the whole 5800 x 4600 world, so every village pin sat in a small central cluster
// and the labels printed over each other. Now the map frames the village (landmarks + you) and places labels so none overlaps another
// label or the canvas edge. Checks, at 1280x720 and 390x844, after a real tap on Map (offline stub, nothing sent anywhere):
//   - every landmark has a label box (scene.mapLabelRects), all inside the canvas, no two overlapping;
//   - the pins spread over >= 55% of the canvas width (they were in ~25%), and the local player's dot is on the canvas.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc5-ui-town-map.test.js
const { chromium } = require('playwright');
const { check, done, offlineStub, exposeGame, joinOffline } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';

(async () => {
  const browser = await chromium.launch(); const errs = [];
  for (const [w, h] of [[1280, 720], [390, 844]]) {
    const tag = w + 'x' + h + ': ';
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 600, isMobile: w < 600 });
    const db = await offlineStub(ctx);
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await exposeGame(page);
    await page.goto(BASE);
    await joinOffline(page);
    await page.evaluate(() => document.getElementById('map-btn').click());
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const s = window.__g.scene.getScene('Town'); const cv = document.getElementById('map-canvas');
      const L = s.mapLabelRects || [];
      let overlaps = [];
      for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
        const a = L[i], b = L[j];
        if (a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5) overlaps.push(a.label + ' / ' + b.label);
      }
      const inside = L.every((a) => a.x >= 0 && a.y >= 0 && a.x + a.w <= cv.width && a.y + a.h <= cv.height);
      const xs = L.map((a) => a.px);
      const V = s.mapView(cv.width, cv.height);
      const lx = ((s.localBody.x - V.x0) / V.vw) * cv.width, ly = ((s.localBody.y - V.y0) / V.vh) * cv.height;
      return { n: L.length, overlaps, inside, spread: xs.length ? (Math.max(...xs) - Math.min(...xs)) / cv.width : 0, me: [Math.round(lx), Math.round(ly)], cw: cv.width, ch: cv.height,
        open: !document.getElementById('map-overlay').classList.contains('hidden') };
    });
    check(tag + 'the map is open with one label per landmark (>= 15)', r.open && r.n >= 15, JSON.stringify(r));
    check(tag + 'no two map labels overlap', r.overlaps.length === 0, JSON.stringify(r.overlaps));
    check(tag + 'every label is inside the map canvas', r.inside, JSON.stringify(r));
    check(tag + 'the village pins spread over >= 55% of the map width (not a central cluster)', r.spread >= 0.55, JSON.stringify(r.spread));
    check(tag + 'your own dot is on the map', r.me[0] >= 0 && r.me[0] <= r.cw && r.me[1] >= 0 && r.me[1] <= r.ch, JSON.stringify(r.me));
    await page.screenshot({ path: require('path').join(__dirname, '..', 'design', 'beta', 'img', 'cyc5-ui-town-map-' + w + 'x' + h + '.jpg'), type: 'jpeg', quality: 65 }).catch(() => {});
    check(tag + 'no database traffic (offline stub)', db.attempts() === 0, String(db.attempts()));
    errs.push(...errors); await ctx.close();
  }
  check('no page errors', errs.length === 0, errs.join('|'));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
