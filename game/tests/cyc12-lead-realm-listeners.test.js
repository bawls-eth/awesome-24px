// cycle 12 L (3): two leftovers from the cycle 11 review of the Realm's just-in-time hint and first-session card (realm-world.js).
//   [A] feTick asked feDeep() once a second for up to 480 s, and each call parsed the whole Deepdelve save (JSON.parse + Object.keys +
//       filter). The parsed count is kept now and the save is parsed again only when its text changed. Honest limit: the string read
//       (localStorage.getItem) still happens once a second, because a clear is written by another page and the text is the only signal.
//   [B] the hint's Esc listener (window keydown, capture) and the card's Esc listener sat on the window for the whole visit, and the
//       card's pagehide listener stayed after the card had been shown. Now: the hint's listener exists only while the hint shows, the
//       card's only while the card is open, and pagehide only while this session can still get the card.
// Measured by wrapping JSON.parse and add/removeEventListener before the page's scripts run (counts, no timing).
// OFFLINE: blockDb + every WebSocket closed + the town page stubbed; literal 0 database attempts.
// Run: BASE=http://localhost:9121/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc12-lead-realm-listeners.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const LS = require('./lib/load-scale');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL0 = ORIGIN + '/game/games/mad-maze/index.html?mode=world&from=hub&test=1&seed=12345&heropick=0&tutorial=0&qdate=2030-05-01';

const INIT = () => {
  // a Deepdelve save with a marker, so its parses can be told from every other JSON.parse on the page
  try { if (!sessionStorage.getItem('cyc12seed')) { sessionStorage.setItem('cyc12seed', '1'); localStorage.setItem('pixeltown-deep-v1', JSON.stringify({ v: 1, f: {}, cyc12mark: 1 })); } } catch (e) { /* storage blocked */ }
  const parse0 = JSON.parse; window.__deepParses = 0;
  JSON.parse = function (t) { if (typeof t === 'string' && t.indexOf('cyc12mark') >= 0) window.__deepParses++; return parse0.apply(this, arguments); };
  const live = window.__live = []; const add0 = window.addEventListener, rem0 = window.removeEventListener;
  const cap = (o) => (typeof o === 'boolean' ? o : !!(o && o.capture));
  window.addEventListener = function (type, fn, o) { if ((type === 'keydown' || type === 'pagehide') && typeof fn === 'function' && !live.some((l) => l.type === type && l.fn === fn && l.cap === cap(o))) live.push({ type, fn, cap: cap(o) }); return add0.apply(this, arguments); };
  window.removeEventListener = function (type, fn, o) { const i = live.findIndex((l) => l.type === type && l.fn === fn && l.cap === cap(o)); if (i >= 0) live.splice(i, 1); return rem0.apply(this, arguments); };
  // which live listeners belong to the hint / the card / the session clock: told by what their source does
  window.__mine = () => ({ hintKey: live.filter((l) => l.type === 'keydown' && /jhHide\(/.test(String(l.fn))).length, cardKey: live.filter((l) => l.type === 'keydown' && /feClose\(/.test(String(l.fn))).length,
    pagehide: live.filter((l) => l.type === 'pagehide' && /feStore\(/.test(String(l.fn))).length });
};

async function open(browser, url) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await blockDb(ctx); await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: LS.budget(40000) });
  await page.evaluate(() => { window.__mm.arena.player.iframes = 1e9; });
  return { ctx, page, db, errors };
}
const st = (page) => page.evaluate(() => ({ fe: window.__mm.world.firstEnd.state(), jh: window.__mm.world.jitHint.state(), mine: window.__mine(), parses: window.__deepParses }));

(async () => {
  const browser = await chromium.launch();
  let attempts = 0; const errors = [];

  // ---- [A] + the hint's listener: a first-ever session whose card is far away (fesec=400) ----
  {
    const s = await open(browser, URL0 + '&fesec=400'); const { page } = s;
    const a = await st(page);
    check('[A] a first-ever session: the card can still come (ok = 1) and the session clock runs', a.fe.ok === 1 && !a.fe.done && !a.fe.open, JSON.stringify(a.fe));
    check('[B] at the start: no Esc listener of the hint or the card is on the window; the pagehide listener of the session clock is (1)', a.mine.hintKey === 0 && a.mine.cardKey === 0 && a.mine.pagehide === 1, JSON.stringify(a.mine));
    const t0 = a.fe.t;
    await page.waitForFunction((t) => window.__mm.world.firstEnd.state().t >= t + 8, t0, { timeout: LS.budget(60000) });
    const b = await st(page);
    check('[A] over 8 game seconds of feTick the Deepdelve save was not parsed again (was: once a second)', b.fe.t - t0 >= 8 && b.parses - a.parses === 0 && b.parses <= 2, JSON.stringify({ sec: b.fe.t - t0, before: a.parses, after: b.parses }));
    // the text changes (another page cleared a biome): parsed once more, and the count is the new one (the card is due at once)
    await page.evaluate(() => localStorage.setItem('pixeltown-deep-v1', JSON.stringify({ v: 1, f: { warren: 1 }, cyc12mark: 1 })));
    const due = await page.waitForFunction(() => { const f = window.__mm.world.firstEnd.state(); return f.done || f.why !== ''; }, null, { timeout: LS.budget(15000) }).then(() => true).catch(() => false);
    const c = await st(page);
    check('[A] when the save text changes it is parsed once more and the clear is seen (the card becomes due before its 400 s)', due && c.parses - b.parses >= 1 && c.parses - b.parses <= 2 && c.fe.t < 400, JSON.stringify({ due, parses: c.parses - b.parses, fe: c.fe }));
    attempts += s.db.attempts(); errors.push(...s.errors); await s.ctx.close();
  }

  // ---- [B] the hint: listener only while it shows; Esc still closes it and does not open the Menu ----
  {
    const s = await open(browser, URL0 + '&firstend=0'); const { page } = s;
    const a = await st(page);
    check('[B] hint hidden: no Esc listener of the hint on the window (was 1 for the whole visit); with the card off there is no pagehide listener either', a.jh.on === false && a.mine.hintKey === 0 && a.mine.pagehide === 0 && a.mine.cardKey === 0, JSON.stringify(a.mine));
    // the verb 'bag' / 'ab' (not 'menu': for that one Esc goes through to the Menu by design)
    const shown = await page.evaluate(() => window.__mm.world.jitHint.showNow());
    const b = await st(page);
    check('[B] hint shown: exactly one Esc listener of the hint is on the window', shown === true && b.jh.on === true && b.mine.hintKey === 1, JSON.stringify({ shown, jh: b.jh, mine: b.mine }));
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    const c = await st(page); const panel = await page.evaluate(() => window.__mm.arena.panel || null);
    check('[B] a real Esc closes the hint (why = esc), the Menu does not open, and the listener is gone again', c.jh.on === false && c.jh.why === 'esc' && !panel && c.mine.hintKey === 0, JSON.stringify({ jh: c.jh, panel, mine: c.mine, verb: b.jh.verb }));
    // shown again and closed with its own button: no listener left
    const again = await page.evaluate(() => window.__mm.world.jitHint.showNow());
    const d1 = await st(page);
    if (again) await page.click('#rw-jhint .rw-jhint-x');
    await page.waitForTimeout(150);
    const d2 = await st(page);
    check('[B] shown a second time (1 listener, not 2) and closed with its ✕: 0 listeners', again === true && d1.mine.hintKey === 1 && d2.jh.on === false && d2.mine.hintKey === 0, JSON.stringify({ again, d1: d1.mine, d2: d2.mine, why: d2.jh.why }));
    attempts += s.db.attempts(); errors.push(...s.errors); await s.ctx.close();
  }

  // ---- [B] the card: Esc listener only while open; pagehide listener gone once it has shown ----
  {
    const s = await open(browser, URL0 + '&fesec=3&jithint=0'); const { page } = s;
    const a = await st(page);
    const opened = await page.waitForFunction(() => window.__mm.world.firstEnd.state().open, null, { timeout: LS.budget(60000) }).then(() => true).catch(() => false);
    const b = await st(page);
    check('[B] card open: exactly one Esc listener of the card; the pagehide listener is removed (the card has shown, ok = 0)', a.mine.cardKey === 0 && opened && b.mine.cardKey === 1 && b.mine.pagehide === 0 && b.fe.ok === 0, JSON.stringify({ a: a.mine, b: b.mine, fe: b.fe }));
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    const c = await st(page); const panel = await page.evaluate(() => window.__mm.arena.panel || null);
    check('[B] a real Esc closes the card (why = esc), the Menu does not open, and its listener is gone', c.fe.open === false && c.fe.why === 'esc' && !panel && c.mine.cardKey === 0, JSON.stringify({ fe: c.fe, panel, mine: c.mine }));
    // a later Esc is the game's again: the Menu opens
    await page.keyboard.press('Escape'); await page.waitForTimeout(250);
    const panel2 = await page.evaluate(() => window.__mm.arena.panel || (window.__mm.arena.paused ? 'paused' : null));
    check('[B] with the card closed the next Esc reaches the game (the Menu opens)', !!panel2, String(panel2));
    attempts += s.db.attempts(); errors.push(...s.errors); await s.ctx.close();
  }

  check('zero page errors', errors.length === 0, errors.join(' | '));
  check('no database traffic (literal 0)', attempts === 0, String(attempts));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
