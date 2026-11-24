// Cycle 4 U (contrast): the Shop's turnip sell price ("sells N ⭐ / 10") is pale green #6fbf73 drawn with no outline over the Shop
// roof and grass (cycle 3 open item; WCAG 1.4.3 / 1.4.11: green on green-ish ground had < 3:1). G owns the art colours, so the
// colour stays: the label gets the same dark 3 px outline as the turnip stall's buy price (#1c2430), which gives every glyph a dark
// edge whatever is behind it. Check: the label exists, has a dark stroke >= 3 px, and fill vs stroke contrast >= 4.5:1; every
// other world price / quest line in the same family (stall buy price, NPC quest sign) keeps its outline too.
// Firebase blocked (offlineStub), offline join as an ADMIN bot; db.attempts() === 0.
// Run: python3 -m http.server 8440 &   BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc4-ui-turnip-contrast.test.js
const { chromium } = require('playwright');
const { check, done, offlineStub, exposeGame, joinOffline } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');

const lum = (hex) => { const n = parseInt(hex.replace('#', ''), 16); return [n >> 16, (n >> 8) & 255, n & 255].map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0); };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await offlineStub(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await exposeGame(page);
  await page.goto(ORIGIN + '/game/index.html');
  await joinOffline(page, 'ADMINcyc4turnip');
  const r = await page.evaluate(() => {
    const s = window.__g.scene.getScene('Town');
    const st = (t) => (t ? { text: t.text, color: t.style.color, stroke: t.style.stroke, th: t.style.strokeThickness } : null);
    return { sell: st(s.turnipSellLabel), buy: st(s.turnipBuyLabel), quest: st(s.npcQuestSign) };
  });
  check('the Shop turnip sell price label exists and shows a price', r.sell && /sells \d+/.test(r.sell.text), JSON.stringify(r.sell));
  const ok = (t) => t && /^#[0-9a-f]{6}$/i.test(t.stroke || '') && t.th >= 3 && ratio(t.color, t.stroke) >= 4.5;
  check('sell price: dark outline >= 3 px, fill vs outline >= 4.5:1 (was no outline)', ok(r.sell), JSON.stringify(r.sell) + (r.sell && r.sell.stroke ? ' ratio ' + ratio(r.sell.color, r.sell.stroke).toFixed(2) : ''));
  check('sell price colour is G\'s lighter green (cycle 4 art pass #8fe08a; U\'s branch kept #6fbf73), still a green', r.sell && ['#8fe08a', '#6fbf73'].indexOf(r.sell.color.toLowerCase()) >= 0, r.sell && r.sell.color);
  check('turnip stall buy price keeps its outline', ok(r.buy), JSON.stringify(r.buy));
  check('Professor Byte quest sign keeps its outline', ok(r.quest), JSON.stringify(r.quest));
  // screenshot of the Shop roof (camera centred on it)
  await page.evaluate(() => { const s = window.__g.scene.getScene('Town'); const t = s.turnipSellLabel; s.cameras.main.stopFollow(); s.cameras.main.centerOn(t.x, t.y + 40); });
  await page.waitForTimeout(400);
  const box = await page.evaluate(() => { const s = window.__g.scene.getScene('Town'); const c = s.cameras.main; const t = s.turnipSellLabel; const cv = document.querySelector('canvas').getBoundingClientRect(); const z = c.zoom; const x = (t.x - c.worldView.x) * z * cv.width / c.width + cv.left; const y = (t.y - c.worldView.y) * z * cv.height / c.height + cv.top; return { x, y }; });
  await page.screenshot({ path: __dirname + '/../design/beta/img/' + (process.env.SHOT || 'cyc4-ui-turnip-after.jpg'), type: 'jpeg', quality: 85, clip: { x: Math.max(0, box.x - 160), y: Math.max(0, box.y - 90), width: 320, height: 180 } });
  check('no page errors; no database traffic', errors.length === 0 && db.attempts() === 0, errors.join(' | '));
  await ctx.close();
  await browser.close();
  done();
})();
