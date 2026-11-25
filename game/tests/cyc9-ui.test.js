// cyc9-ui, checked in a real browser in the style of the a11y viewport sweep (per page x viewport, measured geometry, offline).
// Never chats; the Town runs OFFLINE only (helpers.offlineStub, db.attempts() === 0), every other page under blockDb (0 attempts).
//   1. Pop at 160x284 (a 320 px phone at 200% zoom) and 195x422, Text size 100% and 150%: no element leaves the viewport, nothing is cut
//      sideways inside a scrolling card (the intro card scrolled 18 px because Play kept min-width 120 px), and a 9-character value
//      (1,234,567) at >= 12 px fits inside its HUD box padding (Score and Best; 8 px over at 160 before).
//   2. Realm shop ("the Realm UI is off") at 1280x720, 390x844 and 195x422: every Buy has the same width and right edge (72 vs 77 px
//      before); the name is centred on its icon and the rarity / stat lines start where the name text starts (two left edges before);
//      no word breaks mid-word ("Commo|n" at 195 before); nothing leaves the list; no sideways scroll; the sticky wallet / message header
//      is fully opaque and covers the scrolled rows (it was 60% opacity, so rows showed through: S report at 195x422).
//   3. Realm "Resting" chip (#rw-rest) at 360x640, 390x844, 414x896 (one-line phone zone strip), 195x422 and 1280x720: while it shows,
//      no visible text of the zone label is cut by the label's clipped right edge ("Comfortable" ran 38 px past it before), the
//      danger icon stays, and the chip is on screen and overlaps no button.
//   4. Town corner Menu sheet at 195x422, 390x844 and 1280x720: no place name breaks mid-word ("To|wn", "The Rea|l|m" at 195 before),
//      every place is >= 44 px and inside the screen width.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc9-ui.test.js   (CYC9_SHOTS=1 saves game/design/beta/img/cyc9-ui-*.jpg)
const { chromium } = require('playwright');
const path = require('path');
const { check, done, offlineStub, blockDb, exposeGame, joinOffline } = require('./helpers');
const LS = require('./lib/load-scale');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const ORIGIN = new URL(BASE).origin;
const IMG = path.join(__dirname, '..', 'design', 'beta', 'img');
const SHOTS = process.env.CYC9_SHOTS === '1';
const shot = (page, name) => (SHOTS ? page.screenshot({ path: path.join(IMG, `cyc9-ui-${name}.jpg`), type: 'jpeg', quality: 70 }).catch(() => {}) : null);
const ctxFor = (browser, w, h) => { const touch = w < 900 || h < 500; return browser.newContext(touch ? { viewport: { width: w, height: h }, hasTouch: true, isMobile: true } : { viewport: { width: w, height: h } }); };

// in-page helper: the words of every text node under `root` that the browser laid out over more than one line (a mid-word break)
const BROKEN_WORDS = `(root) => {
  const out = []; const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    const el = n.parentElement; if (!el || !el.getClientRects().length) continue;
    const re = /\\S+/g; let m;
    while ((m = re.exec(n.data))) {
      if (m[0].length < 2) continue;
      const rg = document.createRange(); rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length);
      const tops = new Set([...rg.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
      if (tops.size > 1) out.push(m[0]);
    }
  }
  return out;
}`;

async function pop(browser, w, h, scale) {
  const ctx = await ctxFor(browser, w, h);
  const db = await blockDb(ctx);
  await ctx.addInitScript((s) => { try { localStorage.setItem('pixeltown-access-v1', JSON.stringify({ v: 1, hudScale: s })); } catch (e) {} }, scale);
  const page = await ctx.newPage();
  await page.goto(ORIGIN + '/game/games/pop/index.html?test=1');
  await page.waitForSelector('#h-best');
  await page.waitForTimeout(500);
  const tag = `[pop ${w}x${h} text ${scale * 100}%] `;
  const r = await page.evaluate(() => {
    ['h-score', 'h-best'].forEach((id) => { const e = document.getElementById(id); if (e) e.textContent = '1,234,567'; });
    const vis = (e) => { const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0; };
    const out = []; const cut = [];
    document.querySelectorAll('body *').forEach((e) => {
      if (!vis(e)) return; const r = e.getBoundingClientRect();
      if (r.left < -0.5 || r.right > innerWidth + 0.5) out.push((e.id || e.className || e.tagName) + ' ' + Math.round(r.left) + '..' + Math.round(r.right));
      const ox = getComputedStyle(e).overflowX;
      if (ox !== 'visible' && e.clientWidth && e.scrollWidth > e.clientWidth + 1) cut.push((e.id || e.className || e.tagName) + ' ' + e.scrollWidth + '>' + e.clientWidth);
    });
    const stats = ['h-score', 'h-best'].map((id) => {
      const st = document.getElementById(id); const box = st.closest('.stat'); const b = box.getBoundingClientRect(); const cs = getComputedStyle(box);
      const rg = document.createRange(); rg.selectNodeContents(st); const t = rg.getBoundingClientRect();
      return { id, fs: parseFloat(getComputedStyle(st).fontSize), inner: [b.left + parseFloat(cs.paddingLeft), b.right - parseFloat(cs.paddingRight)].map(Math.round), text: [t.left, t.right].map(Math.round) };
    });
    const play = document.getElementById('play'); const pr = play.getBoundingClientRect(); const card = document.getElementById('intro').getBoundingClientRect();
    return { out, cut, stats, play: { l: pr.left, r: pr.right, h: pr.height }, card: { l: card.left, r: card.right }, sw: document.documentElement.scrollWidth };
  });
  check(tag + 'no element leaves the viewport sideways', r.out.length === 0, JSON.stringify(r.out.slice(0, 6)));
  check(tag + 'nothing is cut sideways inside a scrolling box (the intro card)', r.cut.length === 0, JSON.stringify(r.cut.slice(0, 6)));
  check(tag + 'Play sits inside the intro card and stays >= 44 px tall', r.play.l >= r.card.l - 0.5 && r.play.r <= r.card.r + 0.5 && r.play.h >= 44, JSON.stringify({ play: r.play, card: r.card }));
  check(tag + 'a 9-character value (1,234,567) at >= 12 px fits inside its HUD box padding (Score and Best)', r.stats.every((q) => q.fs >= 12 && q.text[0] >= q.inner[0] - 0.5 && q.text[1] <= q.inner[1] + 0.5), JSON.stringify(r.stats));
  check(tag + 'no horizontal page scroll', r.sw <= w, String(r.sw));
  if (scale === 1 && w === 160) await shot(page, `pop-${w}x${h}`);
  await ctx.close();
  return db.attempts();
}

async function shop(browser, w, h) {
  const ctx = await ctxFor(browser, w, h); const touch = w < 900;
  const db = await blockDb(ctx);
  await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  // level 9, best wave 6: Common, Uncommon and Rare offers (24 / 56 / 120 💎), 60 💎 so some are affordable and some are not
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', JSON.stringify({ realm: { level: 9, xp: 0, shards: 60, bestWave: 6, items: [], nextUid: 20, eq: {} } })); localStorage.setItem('mm-aim-assist', '0'); });
  await page.goto(ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&seed=12345&qdate=2030-05-01');
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: LS.budget(30000) });
  await page.evaluate(() => { const a = window.__mm.arena; a.player.iframes = 1e9; a._hitPlayer = () => {}; });
  const tap = async (s) => { const L = page.locator(s).first(); if (touch) await L.tap(); else await L.click(); await page.waitForTimeout(300); };
  await tap('#realm-bp-btn'); await tap('#realm-backpack-body button[data-open-shop]');
  await page.waitForFunction(() => document.querySelectorAll('#realm-shop-body li').length > 0 && [...document.querySelectorAll('#realm-shop-body .realm-ico')].every((i) => i.complete), null, { timeout: LS.budget(10000) }).catch(() => {});
  const tag = `[realm shop ${w}x${h}] `;
  const r = await page.evaluate(`(() => { const broken = (${BROKEN_WORDS});
    const list = document.querySelector('#realm-shop-body #realm-bp-list'); const L = list.getBoundingClientRect();
    const textLeft = (el) => { const rg = document.createRange(); const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let x = Infinity;
      for (let n = tw.nextNode(); n; n = tw.nextNode()) { if (!n.data.trim()) continue; const i = n.data.search(/\\S/); rg.setStart(n, i); rg.setEnd(n, i + 1); const q = rg.getBoundingClientRect(); if (q.width) x = Math.min(x, q.left); } return x; };
    const rows = [...list.querySelectorAll('li')].map((li) => {
      const bt = li.querySelector('button[data-buy]').getBoundingClientRect(); const nm = li.querySelector('.nm'); const ic = nm.querySelector('.realm-ico');
      const nmText = textLeft(nm); const rg = document.createRange(); const tn = [...nm.childNodes].find((c) => c.nodeType === 3 && c.data.trim()); let nmMid = null;
      if (tn) { rg.selectNodeContents(tn); const q = rg.getBoundingClientRect(); nmMid = q.height ? (q.top + q.bottom) / 2 : null; } // the whole name (a 2-line name centres as a block)
      const icMid = ic ? (ic.getBoundingClientRect().top + ic.getBoundingClientRect().bottom) / 2 : null;
      const out = [...li.querySelectorAll('*')].filter((e) => { const q = e.getBoundingClientRect(); return q.width && (q.left < L.left - 0.5 || q.right > L.right + 0.5); }).length;
      return { name: nm.textContent.trim(), btW: Math.round(bt.width), btR: Math.round(bt.right), btH: Math.round(bt.height), nmText: Math.round(nmText), rar: Math.round(textLeft(li.querySelector('.rar'))), st: Math.round(textLeft(li.querySelector('.st'))),
        iconOff: ic && nmMid != null ? Math.round(Math.abs(icMid - nmMid)) : null, out, broken: broken(li) };
    });
    return { n: rows.length, rows, sw: document.documentElement.scrollWidth };
  })()`);
  const W = new Set(r.rows.map((q) => q.btW)), R = new Set(r.rows.map((q) => q.btR));
  check(tag + 'the shop is open with Common, Uncommon and Rare offers (>= 14 rows)', r.n >= 14, String(r.n));
  check(tag + 'every Buy button has the same width and right edge (a straight Buy column), >= 44 px tall', W.size === 1 && R.size === 1 && r.rows.every((q) => q.btH >= 44), JSON.stringify({ widths: [...W], rights: [...R] }));
  const icons = r.rows.filter((q) => q.iconOff != null);
  check(tag + 'each item name is centred on its icon (<= 2 px)', icons.length >= r.n - 2 && icons.every((q) => q.iconOff <= 2), JSON.stringify(r.rows.filter((q) => q.iconOff == null || q.iconOff > 2).slice(0, 3)));
  if (w > 300) check(tag + 'the rarity and stat lines start where the name text starts (one left edge, <= 1 px)', r.rows.every((q) => Math.abs(q.rar - q.nmText) <= 1 && Math.abs(q.st - q.nmText) <= 1), JSON.stringify(r.rows.slice(0, 2)));
  check(tag + 'no word in a row breaks mid-word', r.rows.every((q) => q.broken.length === 0), JSON.stringify(r.rows.filter((q) => q.broken.length).map((q) => q.broken).slice(0, 4)));
  check(tag + 'nothing in a row leaves the list; no sideways scroll', r.rows.every((q) => q.out === 0) && r.sw <= w, JSON.stringify({ sw: r.sw, out: r.rows.filter((q) => q.out).length }));
  // the sticky wallet / message header (S report, 195x422): fully opaque, solid fill, and after scrolling the list it really covers the rows
  // under it (the element at its centre is the header itself, not a row showing through)
  await tap('#realm-shop-body button[data-buy]');
  await page.evaluate(() => { const top = document.querySelector('#realm-shop .rm-shop-top'); let sc = top.parentElement; while (sc && !(sc.scrollHeight > sc.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement; if (sc) sc.scrollTop = 260; });
  await page.waitForTimeout(200);
  const hd = await page.evaluate(() => {
    const top = document.querySelector('#realm-shop .rm-shop-top'); const q = top.getBoundingClientRect();
    let op = 1; for (let e = top; e; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
    const bg = getComputedStyle(top).backgroundColor; const m = bg.match(/rgba?\(([^)]+)\)/); const alpha = m ? (m[1].split(',').length === 4 ? Number(m[1].split(',')[3]) : 1) : 0;
    const under = [...document.querySelectorAll('#realm-shop-body li')].some((li) => { const r = li.getBoundingClientRect(); return r.top < q.bottom - 1 && r.bottom > q.top + 1; });
    const at = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
    let sc = top.parentElement; while (sc && !(sc.scrollHeight > sc.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
    const inner = sc ? sc.getBoundingClientRect().top + parseFloat(getComputedStyle(sc).borderTopWidth) : null;
    const above = sc ? [...document.querySelectorAll('#realm-shop-body li')].filter((li) => { const r = li.getBoundingClientRect(); return Math.min(r.bottom, q.top) - Math.max(r.top, inner) > 0.5; }).length : -1; // a visible slice of a row between the card's inner edge and the header
    return { op, bg, alpha, under, above, gap: sc ? Math.round(q.top - inner) : null, onTop: !!at && !!at.closest('.rm-shop-top'), msg: (document.getElementById('realm-shop-msg') || {}).textContent };
  });
  check(tag + 'the sticky wallet / message header is fully opaque on a solid fill (opacity 1, background alpha 1)', hd.op === 1 && hd.alpha === 1, JSON.stringify(hd));
  check(tag + 'after scrolling, rows pass under the header and the header stays on top of them', hd.under && hd.onTop && /Bought/.test(hd.msg || ''), JSON.stringify(hd));
  check(tag + 'after scrolling, no row shows in a band above the sticky header (it sticks at the card edge)', hd.above === 0 && hd.gap <= 1, JSON.stringify(hd));
  check(tag + 'no page errors', errors.length === 0, errors.join(' | '));
  await shot(page, `shop-${w}x${h}`);
  await ctx.close();
  return db.attempts();
}

async function rest(browser, w, h) {
  const ctx = await ctxFor(browser, w, h);
  const db = await blockDb(ctx);
  await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/index.html?mode=world&from=hub&test=1&seed=12345&heropick=0&tutorial=0&qdate=2030-05-01');
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: LS.budget(40000) });
  await page.evaluate(() => { window.__mm.arena.player.iframes = 1e9; });
  await page.waitForFunction(() => window.__mm.arena.resting, null, { timeout: LS.budget(40000) }).catch(() => null);
  await page.waitForTimeout(250);
  const tag = `[realm resting ${w}x${h}] `;
  const r = await page.evaluate(() => {
    const chip = document.getElementById('rw-rest'); const zone = document.getElementById('rw-zone'); const cr = chip.getBoundingClientRect(); const zr = zone.getBoundingClientRect();
    const vis = (e) => { const cs = getComputedStyle(e); const q = e.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && q.width > 1 && q.height > 1; };
    // visible text pieces of the zone label (leaf elements with text, not visually hidden), and whether the label's clipped edge cuts them
    const clips = getComputedStyle(zone).overflowX !== 'visible';
    const cut = [...zone.querySelectorAll('*')].filter((k) => !k.children.length && k.textContent.trim() && vis(k) && [...(function* (e) { for (; e && e !== zone; e = e.parentElement) yield e; })(k)].every((e) => vis(e) && getComputedStyle(e).clipPath === 'none'))
      .filter((k) => clips && k.getBoundingClientRect().right > zr.right + 0.5 && getComputedStyle(k).textOverflow !== 'ellipsis')
      .map((k) => k.textContent.trim().slice(0, 16) + ' ' + Math.round(k.getBoundingClientRect().right) + '>' + Math.round(zr.right));
    const ico = zone.querySelector('.rw-danger-ico'); const danger = zone.querySelector('.rw-danger');
    const icoOk = !danger || !vis(danger) || (vis(ico) && ico.getBoundingClientRect().right <= zr.right + 0.5);
    const hitB = [...document.querySelectorAll('button, a[href], [role=button]')].filter((e) => vis(e) && !zone.contains(e)).filter((e) => { const q = e.getBoundingClientRect(); return cr.left < q.right && q.left < cr.right && cr.top < q.bottom && q.top < cr.bottom; }).map((e) => e.id || e.className);
    return { resting: window.__mm.arena.resting, shown: vis(chip), chip: [cr.left, cr.top, cr.right, cr.bottom].map(Math.round), inView: cr.left >= 0 && cr.top >= 0 && cr.right <= innerWidth && cr.bottom <= innerHeight && cr.right <= zr.right + 0.5, cut, icoOk, hitB, fs: parseFloat(getComputedStyle(chip).fontSize) };
  });
  check(tag + 'the hero rests and the chip shows, on screen, inside the zone label, >= 12 px text', r.resting && r.shown && r.inView && r.fs >= 12, JSON.stringify(r));
  check(tag + "while it shows, no visible zone-label text is cut by the label's clipped edge", r.cut.length === 0, JSON.stringify(r.cut));
  check(tag + 'the danger icon stays visible (the level is not colour alone)', r.icoOk, JSON.stringify(r));
  check(tag + 'the chip overlaps no button', r.hitB.length === 0, JSON.stringify(r.hitB));
  check(tag + 'no page errors', errors.length === 0, errors.join(' | '));
  await shot(page, `rest-${w}x${h}`);
  await ctx.close();
  return db.attempts();
}

async function townMenu(browser, w, h) {
  const ctx = await ctxFor(browser, w, h); const touch = w < 900;
  const db = await offlineStub(ctx);
  const page = await ctx.newPage();
  await exposeGame(page);
  await page.goto(BASE);
  await joinOffline(page, 'ADMINcyc9u');
  await page.waitForFunction(() => window.MMNav && window.MMNav.mounted() && document.getElementById('mm-nav-btn'), null, { timeout: LS.budget(25000) }).catch(() => {});
  await page.waitForTimeout(600);
  if (touch) await page.tap('#mm-nav-btn'); else await page.click('#mm-nav-btn');
  await page.waitForTimeout(500);
  const tag = `[town menu ${w}x${h}] `;
  const r = await page.evaluate(`(() => { const broken = (${BROKEN_WORDS});
    const sh = document.getElementById('mm-nav-sheet'); const open = !!sh && sh.getBoundingClientRect().height > 0;
    const dests = [...sh.querySelectorAll('.mm-nav-dest')].filter((e) => e.getBoundingClientRect().width > 0);
    return { open, n: dests.length, broken: dests.flatMap((d) => broken(d.querySelector('.mm-nav-dest-name'))),
      small: dests.filter((d) => { const q = d.getBoundingClientRect(); return q.width < 44 || q.height < 44; }).length,
      out: dests.filter((d) => { const q = d.getBoundingClientRect(); return q.left < 0 || q.right > innerWidth + 0.5; }).length, sw: document.documentElement.scrollWidth };
  })()`);
  check(tag + 'the corner Menu opens the sheet with >= 10 places', r.open && r.n >= 10, JSON.stringify(r));
  check(tag + 'no place name breaks mid-word', r.broken.length === 0, JSON.stringify(r.broken));
  check(tag + 'every place is >= 44 px and inside the screen width; no sideways scroll', r.small === 0 && r.out === 0 && r.sw <= w, JSON.stringify(r));
  await shot(page, `town-menu-${w}x${h}`);
  await ctx.close();
  return db.attempts();
}

(async () => {
  const browser = await chromium.launch();
  let attempts = 0;
  try {
    for (const [w, h] of [[160, 284], [195, 422]]) for (const s of [1, 1.5]) attempts += await pop(browser, w, h, s);
    for (const [w, h] of [[1280, 720], [390, 844], [195, 422]]) attempts += await shop(browser, w, h);
    for (const [w, h] of [[360, 640], [390, 844], [414, 896], [195, 422], [1280, 720]]) attempts += await rest(browser, w, h);
    for (const [w, h] of [[195, 422], [390, 844], [1280, 720]]) attempts += await townMenu(browser, w, h);
  } catch (e) { check('the run finished', false, e.message.split('\n')[0]); }
  check('no database requests on any page (offline stub / blockDb)', attempts === 0, String(attempts));
  await browser.close();
  done();
})();
