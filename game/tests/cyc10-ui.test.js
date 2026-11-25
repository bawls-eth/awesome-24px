// cyc10-ui, checked in a real browser (measured geometry, offline: blockDb on every context, 0 database attempts, no chat).
//   1. Realm shop at 1280x720, 390x844 and 195x422: after scrolling the offers to the end, the ✖ close button is still fully on screen,
//      inside the card, the element under its centre is the ✖ itself, and a real tap / click on it closes the shop (before: the whole card
//      scrolled and the ✖ sat at y -374 at 195x422, -13 at 1280x720). The wallet / message line is still on screen under it. The card,
//      its title, every row text and every Buy button use the Realm pixel font (--px-font from shared/mm-8bit.css; before: system-ui).
//      The cycle-9 checks (opaque sticky header, no row band above it, same Buy width) live on in cyc9-ui.
//   2. Realm zone strip at 195x422 and 240x480 (<= 260 px, the 75-85 px one-line strip): nothing in the strip is cut by its clipped
//      right edge (before: "➤ Shore · Sa", 241 px of content in a 75 px box); the zone NAME shows (with an ellipsis when it must shrink);
//      the danger meter shows as its icon (✓ / ! / ☠) inside the strip; the danger word and bar are not drawn there but are still in the
//      accessibility tree (aria-label on #rw-danger). At 390x844 and 1280x720 nothing changes: the name, the " · Safe-ish" word and the
//      danger word are all drawn. hudText().zone still reads "<name> · <danger>".
// Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc10-ui.test.js   (CYC10_SHOTS=1 saves game/design/beta/img/cyc10-ui-*.jpg)
const { chromium } = require('playwright');
const path = require('path');
const { check, done, blockDb } = require('./helpers');
const LS = require('./lib/load-scale');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const ORIGIN = new URL(BASE).origin;
const IMG = path.join(__dirname, '..', 'design', 'beta', 'img');
const SHOTS = process.env.CYC10_SHOTS === '1';
const shot = (page, name) => (SHOTS ? page.screenshot({ path: path.join(IMG, `cyc10-ui-${name}.jpg`), type: 'jpeg', quality: 70 }).catch(() => {}) : null);
const ctxFor = (browser, w, h) => { const touch = w < 900 || h < 500; return browser.newContext(touch ? { viewport: { width: w, height: h }, hasTouch: true, isMobile: true } : { viewport: { width: w, height: h } }); };
const URL_WORLD = '/game/games/mad-maze/index.html?mode=world&from=hub&test=1&seed=12345&heropick=0&tutorial=0&qdate=2030-05-01';

async function world(browser, w, h, save) {
  const ctx = await ctxFor(browser, w, h);
  const db = await blockDb(ctx);
  await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (save) { // seed the local save on the same origin first (as cyc9-ui does), then open the Realm
    await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
    await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', JSON.stringify(s)); localStorage.setItem('mm-aim-assist', '0'); }, save);
  }
  await page.goto(ORIGIN + URL_WORLD);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: LS.budget(40000) });
  await page.evaluate(() => { window.__mm.arena.player.iframes = 1e9; });
  return { ctx, db, page, errors };
}

async function shop(browser, w, h) {
  // level 9, best wave 6: Common, Uncommon and Rare offers (>= 14 rows, longer than the card at every size); 500 💎 so a Buy succeeds
  const { ctx, db, page, errors } = await world(browser, w, h, { realm: { level: 9, xp: 0, shards: 500, bestWave: 6, items: [], nextUid: 20, eq: {} } });
  const touch = w < 900 || h < 500;
  const tap = (sel) => (touch ? page.tap(sel) : page.click(sel));
  await tap('#realm-bp-btn'); await tap('#realm-backpack-body button[data-open-shop]');
  await page.waitForFunction(() => document.querySelectorAll('#realm-shop-body li').length > 0 && [...document.querySelectorAll('#realm-shop-body .realm-ico')].every((i) => i.complete), null, { timeout: LS.budget(10000) }).catch(() => {});
  await tap('#realm-shop-body button[data-buy]'); // a real buy, so the message line has text to keep on screen
  // scroll whatever scrolls inside the shop to its end (the card before cyc10, the body after)
  await page.evaluate(() => { document.querySelectorAll('#realm-shop, #realm-shop *').forEach((e) => { if (e.scrollHeight > e.clientHeight + 1) e.scrollTop = e.scrollHeight; }); });
  await page.waitForTimeout(250);
  const tag = `[realm shop ${w}x${h}] `;
  const r = await page.evaluate(() => {
    const x = document.getElementById('realm-shop-close'); const q = x.getBoundingClientRect();
    const card = document.querySelector('#realm-shop .realm-bp-card').getBoundingClientRect();
    const at = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
    const top = document.querySelector('#realm-shop .rm-shop-top').getBoundingClientRect();
    const rows = document.querySelectorAll('#realm-shop-body li').length; const scrolled = [...document.querySelectorAll('#realm-shop, #realm-shop *')].some((e) => e.scrollTop > 40);
    const norm = (f) => f.replace(/["'\s]/g, '').toLowerCase();
    const px = norm(getComputedStyle(document.body).getPropertyValue('--px-font') || '');
    const els = [document.querySelector('#realm-shop .realm-bp-card'), document.querySelector('#realm-shop .realm-bp-head strong'), x,
      ...document.querySelectorAll('#realm-shop-body .rm-shop-top, #realm-shop-body li .nm, #realm-shop-body li .rar, #realm-shop-body li .st, #realm-shop-body button')];
    const off = els.filter((e) => e && norm(getComputedStyle(e).fontFamily) !== px).map((e) => (e.id || e.className || e.tagName) + ': ' + getComputedStyle(e).fontFamily);
    return { rows, px, n: els.length, off, scrolled, close: [q.left, q.top, q.right, q.bottom].map(Math.round), card: [card.left, card.top, card.right, card.bottom].map(Math.round),
      inView: q.top >= 0 && q.left >= 0 && q.bottom <= innerHeight && q.right <= innerWidth, inCard: q.top >= card.top - 0.5 && q.bottom <= card.bottom + 0.5,
      hit: !!at && (at === x || x.contains(at)), wallet: top.top >= q.bottom - 0.5 && top.bottom <= innerHeight && top.top >= 0, msg: (document.getElementById('realm-shop-msg') || {}).textContent || '' };
  });
  check(tag + 'the offers really scrolled (>= 14 offers, longer than the card)', r.scrolled && r.rows >= 14, JSON.stringify(r));
  check(tag + 'after scrolling to the last offer the ✖ is fully on screen, inside the card, and nothing covers it', r.inView && r.inCard && r.hit, JSON.stringify({ close: r.close, card: r.card, hit: r.hit }));
  check(tag + 'the wallet / message line is still on screen under the ✖ (with the last Buy message)', r.wallet && /Bought/.test(r.msg), JSON.stringify(r));
  check(tag + 'card, title, ✖, wallet, row texts and Buy buttons all use the Realm pixel font (--px-font)', !!r.px && r.n >= 20 && r.off.length === 0, JSON.stringify({ px: r.px, n: r.n, off: r.off.slice(0, 5) }));
  await shot(page, `shop-${w}x${h}`);
  await tap('#realm-shop-close');
  await page.waitForTimeout(200);
  const closed = await page.evaluate(() => { const s = document.getElementById('realm-shop'); return !s || s.classList.contains('hidden') || getComputedStyle(s).display === 'none'; });
  check(tag + 'a real tap / click on the ✖ (still scrolled) closes the shop', closed, String(closed));
  check(tag + 'no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
  return db.attempts();
}

async function strip(browser, w, h) {
  const { ctx, db, page, errors } = await world(browser, w, h);
  await page.waitForFunction(() => { const d = document.getElementById('rw-danger'); return d && !d.classList.contains('hidden') && document.querySelector('#rw-zone .rw-zname').textContent.includes(' · '); }, null, { timeout: LS.budget(10000) }).catch(() => {});
  // an idle hero rests after 8 s and the Resting chip then stands in for the whole <= 260 px strip (cyc9-ui covers that state): wake it
  // with a stick input (play input, ID-51) so this measures the normal strip
  await page.evaluate(() => { const a = window.__mm.arena; a.setMoveStick(0, 0); });
  await page.waitForFunction(() => !window.__mm.arena.resting && document.getElementById('rw-rest').classList.contains('hidden'), null, { timeout: LS.budget(5000) }).catch(() => {});
  await page.waitForTimeout(200);
  const narrow = w <= 260;
  const tag = `[realm zone strip ${w}x${h}] `;
  const r = await page.evaluate(() => {
    const zone = document.getElementById('rw-zone'); const zr = zone.getBoundingClientRect();
    const shown = (e) => { for (let k = e; k && k !== zone.parentElement; k = k.parentElement) { const cs = getComputedStyle(k); if (cs.display === 'none' || cs.visibility === 'hidden' || cs.clipPath !== 'none') return false; } const q = e.getBoundingClientRect(); return q.width > 1 && q.height > 1; };
    const clips = getComputedStyle(zone).overflowX !== 'visible';
    const leaves = [...zone.querySelectorAll('*')].filter((k) => !k.children.length && k.textContent.trim() && shown(k));
    // a drawn piece of text that runs past the strip's clipped right edge, unless it ends in its own ellipsis
    const cut = leaves.filter((k) => clips && k.getBoundingClientRect().right > zr.right + 0.5 && getComputedStyle(k).textOverflow !== 'ellipsis')
      .map((k) => k.textContent.trim().slice(0, 18) + ' ' + Math.round(k.getBoundingClientRect().right) + '>' + Math.round(zr.right));
    const nm = zone.querySelector('.rw-zn'); const dw = zone.querySelector('.rw-zd'); const ico = zone.querySelector('.rw-danger-ico'); const dTxt = zone.querySelector('.rw-danger-txt'); const danger = document.getElementById('rw-danger');
    const inStrip = (e) => { const q = e.getBoundingClientRect(); return q.left >= zr.left - 0.5 && q.right <= zr.right + 0.5; };
    return { cut, sw: zone.scrollWidth, cw: zone.clientWidth, w: Math.round(zr.width),
      name: !!nm && shown(nm) && inStrip(nm) && nm.textContent.length > 0, nameFits: !!nm && (nm.scrollWidth <= nm.clientWidth + 1 || getComputedStyle(nm).textOverflow === 'ellipsis'),
      word: !!dw && shown(dw), dangerWord: !!dTxt && shown(dTxt), ico: !!ico && shown(ico) && inStrip(ico) && /\S/.test(ico.textContent),
      aria: danger ? danger.getAttribute('aria-label') || '' : '', hud: window.__mm.world.hudText ? window.__mm.world.hudText().zone : (window.__mm.world.debug && window.__mm.world.debug.hudText ? window.__mm.world.debug.hudText().zone : null),
      label: document.querySelector('#rw-zone .rw-zname').textContent, resting: !!window.__mm.arena.resting };
  });
  check(tag + 'the hero is awake (not resting), so the normal strip is measured', !r.resting, JSON.stringify(r));
  check(tag + 'the zone label still reads "<name> · <danger>" (textContent of .rw-zname)', / · \S/.test(r.label), JSON.stringify(r));
  check(tag + 'the zone name is drawn inside the strip (shrinking with an ellipsis if needed)', r.name && r.nameFits, JSON.stringify(r));
  check(tag + "no drawn text in the strip is cut by the strip's clipped right edge", r.cut.length === 0, JSON.stringify(r.cut));
  check(tag + 'the danger icon (✓ / ! / ☠) is drawn inside the strip, and the reading stays in the a11y tree (aria-label)', r.ico && r.aria.length > 3, JSON.stringify(r));
  if (narrow) {
    check(tag + 'the strip content fits its box (no hidden overflow)', r.sw <= r.cw + 1, JSON.stringify({ sw: r.sw, cw: r.cw }));
    check(tag + 'the danger word and the " · danger" suffix are not drawn on the narrow strip (icon only)', !r.word && !r.dangerWord, JSON.stringify(r));
  } else {
    check(tag + 'wide screens are unchanged: the " · danger" suffix and the danger word are drawn', r.word && r.dangerWord, JSON.stringify(r));
  }
  check(tag + 'no page errors', errors.length === 0, errors.join(' | '));
  await shot(page, `zone-${w}x${h}`);
  await ctx.close();
  return db.attempts();
}

(async () => {
  const browser = await chromium.launch();
  let attempts = 0;
  try {
    for (const [w, h] of [[1280, 720], [390, 844], [195, 422]]) attempts += await shop(browser, w, h);
    for (const [w, h] of [[195, 422], [240, 480], [390, 844], [1280, 720]]) attempts += await strip(browser, w, h);
  } catch (e) { check('the run finished', false, e.message.split('\n')[0]); }
  check('no database requests on any page (blockDb)', attempts === 0, String(attempts));
  await browser.close();
  done();
})();
