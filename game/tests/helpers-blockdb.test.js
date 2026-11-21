// Proves helpers.blockDb(ctx): a page that opens a WebSocket to a DB host or fetches a DB host fails, and both attempts are counted.
// The page is about:blank, so nothing is served and nothing real is contacted (the DB hosts below are fake sub-domains anyway).
// Run: NODE_PATH=$(npm root -g) node game/tests/helpers-blockdb.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  await page.goto('about:blank');

  const ws = await page.evaluate(() => new Promise((res) => {
    const events = [];
    let w;
    try { w = new WebSocket('wss://x.firebaseio.com/.ws?v=5'); } catch (e) { return res({ threw: String(e), events }); }
    w.onopen = () => events.push('open');
    w.onmessage = () => events.push('message');
    w.onerror = () => events.push('error');
    w.onclose = () => { events.push('close'); res({ events }); };
    setTimeout(() => res({ events, timeout: true }), 5000);
  }));
  check('WebSocket to a firebaseio host is closed, not answered', !ws.timeout && ws.events.indexOf('close') >= 0 && ws.events.indexOf('message') < 0, JSON.stringify(ws));
  check('the websocket attempt was recorded (1)', db.ws.length === 1 && /firebaseio\.com/.test(db.ws[0]), JSON.stringify(db.ws));

  const f = await page.evaluate(() => fetch('https://x-default-rtdb.firebasedatabase.app/players.json').then(() => 'ok', () => 'failed'));
  check('fetch to a firebasedatabase.app host fails', f === 'failed', f);
  const f2 = await page.evaluate(() => fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp').then(() => 'ok', () => 'failed'));
  check('fetch to the auth host fails', f2 === 'failed', f2);
  check('http attempts recorded (2)', db.http.length === 2, JSON.stringify(db.http));
  check('count() totals sockets + requests (3)', db.count() === 3 && db.attempts() === 3);

  const other = await page.evaluate(() => fetch('data:text/plain,hi').then((r) => r.text(), () => 'failed'));
  check('non-DB traffic is not counted or blocked', other === 'hi' && db.count() === 3, other);
  await browser.close();
  done();
})();
