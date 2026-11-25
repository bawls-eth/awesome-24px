// cyc6: the Realm shop through real clicks / taps on the real world page (owner report: "the Realm shop still doesn't allow purchase and the UI is off").
// Root causes this guards: (1) an unaffordable / full-pack Buy button looked exactly like a live one and a tap on it did nothing and said nothing;
// (2) a successful buy had no visible confirmation inside the panel (the float text is drawn on the canvas behind the 85% overlay);
// (3) the row grid put the rarity under the Buy button (wide) and let a long name run under it (195 px).
// Opens the shop the way a player does: the 🎒 HUD button, then the backpack's 🛒 Shop button (and V on desktop). Offline: blockDb + every WebSocket
// closed, db.attempts() === 0, no console errors.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc6-shop.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&seed=12345&qdate=2030-05-01';
const SHOTS = process.env.SHOTS || ''; // a directory: before/after screenshots
const realm = (extra) => Object.assign({ level: 1, xp: 0, shards: 30, bestWave: 0, items: [], nextUid: 20, eq: {} }, extra || {});

async function open(browser, vp, touch, rm) {
  const ctx = await browser.newContext(touch ? { viewport: vp, hasTouch: true, isMobile: true } : { viewport: vp });
  const db = await blockDb(ctx);
  await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((v) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', v); localStorage.setItem('mm-aim-assist', '0'); }, JSON.stringify({ realm: rm }));
  await page.goto(WORLD);
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
  await page.evaluate(() => { const a = window.__mm.arena; a.player.iframes = 1e9; a._hitPlayer = () => {}; }); // nothing kills the hero while the test shops
  // force: a tap on a Buy that may be disabled lands where the finger is (Playwright would otherwise wait for it to enable)
  const tap = async (loc, force) => { const L = typeof loc === 'string' ? page.locator(loc).first() : loc; await L.scrollIntoViewIfNeeded(); if (touch) await L.tap({ force: !!force }); else await L.click({ force: !!force }); await page.waitForTimeout(250); };
  return { ctx, page, errors, db, tap };
}
const state = (page) => page.evaluate(() => {
  const a = window.__mm.arena; const msg = document.getElementById('realm-shop-msg');
  let msgSeen = false;
  if (msg && msg.textContent) { const r = msg.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); msgSeen = r.height > 0 && r.top >= 0 && r.bottom <= innerHeight && !!top && (top === msg || msg.contains(top)); }
  const rows = Array.from(document.querySelectorAll('#realm-shop-body li')).map((li) => {
    const b = li.querySelector('button[data-buy]').getBoundingClientRect(); const ink = (el) => { const g = document.createRange(); g.selectNodeContents(el); const a = g.getBoundingClientRect(); const e = el.getBoundingClientRect(); return { right: Math.max(a.right, e.right), bottom: Math.max(a.bottom, e.bottom) }; }; // the text itself, even when it overflows its box
    const n = ink(li.querySelector('.nm')); const r = ink(li.querySelector('.rar'));
    const bt = li.querySelector('button[data-buy]'); const cs = getComputedStyle(bt);
    return { nmClear: n.right <= b.left + 0.5 || n.bottom <= b.top + 0.5, rarLeft: r.right <= b.left + 0.5 || r.bottom <= b.top + 0.5, // cyc9-ui: at <= 300 px Buy has its own row under the text, so clear = left of it or wholly above it (never under it)
    off: bt.getAttribute('aria-disabled') === 'true', dis: bt.disabled, op: Number(cs.opacity), bg: cs.backgroundColor, label: bt.getAttribute('aria-label') };
  });
  return { panel: a.panel, shards: a.save.shards, n: a.save.items.length, msg: msg ? msg.textContent : null, msgSeen, rows, docW: document.documentElement.scrollWidth, vw: innerWidth };
});
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/cyc6-shop-${name}.jpg`, type: 'jpeg', quality: 70 }); };

(async () => {
  const browser = await chromium.launch();
  const errs = []; const dbs = [];
  for (const [tag, vp, touch] of [['desktop 1280x720', { width: 1280, height: 720 }, false], ['phone 390x844', { width: 390, height: 844 }, true]]) {
    const short = touch ? 'phone' : 'desktop';
    // ---- enough shards, then too few ----
    { const P = await open(browser, vp, touch, realm()); const { page, tap } = P;
      await tap('#realm-bp-btn');
      check(`${tag}: the 🎒 HUD button opens the backpack`, await page.evaluate(() => window.__mm.arena.panel) === 'bp');
      await tap('#realm-backpack-body button[data-open-shop]');
      let s = await state(page);
      check(`${tag}: the backpack 🛒 Shop button opens the shop (level 1, best wave 0: 7 Common offers)`, s.panel === 'shop' && s.rows.length === 7, JSON.stringify(s).slice(0, 300));
      check(`${tag}: every row keeps the name and the rarity in the left column, clear of the Buy button`, s.rows.every((r) => r.nmClear && r.rarLeft), JSON.stringify(s.rows));
      check(`${tag}: at 30 💎 every 24 💎 offer reads as buyable`, s.rows.every((r) => !r.off && !r.dis && r.op === 1), JSON.stringify(s.rows[0]));
      await shot(page, `${short}-open`);
      await tap(page.locator('#realm-shop-body button[data-buy]').first());
      s = await state(page);
      check(`${tag}: tapping Buy 24💎 buys it (30 -> 6 💎, 1 item) and the panel says so where you can see it`, s.shards === 6 && s.n === 1 && /Bought/.test(s.msg || '') && s.msgSeen, JSON.stringify({ sh: s.shards, n: s.n, msg: s.msg, seen: s.msgSeen }));
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pixeltown-save-v1')).realm);
      check(`${tag}: the buy is saved (pixeltown-save-v1 realm: 6 💎, 1 item)`, saved.shards === 6 && saved.items.length === 1, JSON.stringify({ sh: saved.shards, n: saved.items.length }));
      await shot(page, `${short}-bought`);
      check(`${tag}: at 6 💎 the 24 💎 offers look unaffordable (aria-disabled, dimmed, a different fill) and say why to a screen reader`, s.rows.every((r) => r.off && r.op <= 0.75 && /need 18 more/.test(r.label)), JSON.stringify(s.rows[1]));
      await tap(page.locator('#realm-shop-body button[data-buy]').nth(3), true);
      s = await state(page);
      check(`${tag}: tapping an unaffordable Buy spends nothing and tells you how many 💎 you are short, in view`, s.shards === 6 && s.n === 1 && /18 more/.test(s.msg || '') && s.msgSeen, JSON.stringify({ sh: s.shards, n: s.n, msg: s.msg, seen: s.msgSeen }));
      await shot(page, `${short}-too-poor`);
      check(`${tag}: no sideways scroll`, s.docW <= s.vw, `${s.docW} > ${s.vw}`);
      if (!touch) {
        await page.keyboard.press('v'); await page.waitForTimeout(200);
        const p1 = await page.evaluate(() => window.__mm.arena.panel);
        await page.keyboard.press('v'); await page.waitForTimeout(200);
        const p2 = await page.evaluate(() => window.__mm.arena.panel);
        check(`${tag}: V closes and reopens the shop`, p1 === null && p2 === 'shop', JSON.stringify([p1, p2]));
        s = await state(page);
        check(`${tag}: a reopened shop starts without an old message`, !s.msg, s.msg);
      }
      errs.push(...P.errors); dbs.push(P.db); await P.ctx.close();
    }
    // ---- full backpack, lots of shards ----
    { const items = []; for (let i = 0; i < 24; i++) items.push({ n: 100 + i, id: 'heartcharm', r: 0 });
      const P = await open(browser, vp, touch, realm({ shards: 500, items, nextUid: 200 })); const { page, tap } = P;
      await tap('#realm-bp-btn'); await tap('#realm-backpack-body button[data-open-shop]');
      let s = await state(page);
      check(`${tag}: with a full pack the offers look unaffordable and say "backpack full"`, s.panel === 'shop' && s.rows.length === 7 && s.rows.every((r) => r.off && r.op <= 0.75 && /backpack full/i.test(r.label)), JSON.stringify(s.rows[0]));
      await tap(page.locator('#realm-shop-body button[data-buy]').first(), true);
      s = await state(page);
      check(`${tag}: tapping Buy with a full pack spends nothing and says the backpack is full`, s.shards === 500 && s.n === 24 && /backpack is full/i.test(s.msg || '') && s.msgSeen, JSON.stringify({ sh: s.shards, n: s.n, msg: s.msg }));
      await shot(page, `${short}-full`);
      errs.push(...P.errors); dbs.push(P.db); await P.ctx.close();
    }
  }
  // ---- 195x422: long names never run under the Buy button; a buy still works by tap ----
  { const P = await open(browser, { width: 195, height: 422 }, true, realm({ level: 9, shards: 60 })); const { page, tap } = P;
    await tap('#realm-bp-btn'); await tap('#realm-backpack-body button[data-open-shop]');
    let s = await state(page);
    check('195x422: 21 offers at level 9; no name or rarity runs under its Buy button; no sideways scroll', s.rows.length === 21 && s.rows.every((r) => r.nmClear && r.rarLeft) && s.docW <= s.vw, JSON.stringify(s.rows.map((r, i) => [i, r.nmClear, r.rarLeft]).filter((r) => !r[1] || !r[2])));
    await tap(page.locator('#realm-shop-body button[data-buy]').nth(1));
    s = await state(page);
    check('195x422: a tap buys (60 -> 36 💎) and the message is in view', s.shards === 36 && s.n === 1 && s.msgSeen, JSON.stringify({ sh: s.shards, msg: s.msg, seen: s.msgSeen }));
    await shot(page, 'xs-bought');
    errs.push(...P.errors); dbs.push(P.db); await P.ctx.close();
  }
  check('no console errors', errs.length === 0, errs.join(' | '));
  check('no database request attempted (db.attempts() === 0 on every page)', dbs.every((d) => d.attempts() === 0), JSON.stringify(dbs.map((d) => d.attempts())));
  await browser.close();
  done();
})();
