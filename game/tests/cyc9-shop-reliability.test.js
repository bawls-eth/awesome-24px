// Cycle 9 S: Realm shop purchase reliability (audit of _shopTap -> buy -> onSave/_persist for any purchase that silently fails).
// Found and fixed in realm.js _shopTap:
//   1. A buy whose save write FAILED (browser storage full / blocked) still said "Bought ... it is in your backpack": the only warning was a
//      canvas notice drawn behind the 85% shop overlay, so the item silently vanished on reload. The panel now says it is not saved yet, and
//      the next good save writes it (asserted after a reload).
//   2. An id / rarity that does not resolve returned with no answer at all. It now answers "That is not for sale right now."
// Guarded (passed before the fix too, kept as a regression net): on a landscape phone (844x390, touch) with an active ranger hero at level 20,
// EVERY offer type (all 12 hero-family styled bows and 12 of the base items, all three rarities) is bought by a real touch tap (Playwright
// refuses a tap that something else covers, so a stick / ability button over a Buy button fails here), each tap adds exactly one item, the
// panel says Bought, and every bought item is still there after a reload.
// OFFLINE: blockDb + every WebSocket closed + the town page stubbed; literal 0 database attempts; no page / console errors.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc9-shop-reliability.test.js   (SHOTS=<dir> saves screenshots)
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const LS = require('./lib/load-scale');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&seed=12345&qdate=2030-05-01&tutorial=0';
const SHOTS = process.env.SHOTS || '';

async function open(browser, vp, touch, realm) {
  const ctx = await browser.newContext(touch ? { viewport: vp, hasTouch: true, isMobile: true } : { viewport: vp });
  const db = await blockDb(ctx); await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((v) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', v); localStorage.setItem('mm-aim-assist', '0'); }, JSON.stringify({ realm }));
  await page.goto(WORLD);
  await ready(page);
  const tap = async (sel) => { const L = page.locator(sel).first(); await L.scrollIntoViewIfNeeded(); if (touch) await L.tap({ timeout: LS.budget(5000) }); else await L.click({ timeout: LS.budget(5000) }); await page.waitForTimeout(200); };
  return { ctx, page, db, errors, tap };
}
const ready = async (page) => {
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: LS.budget(40000) });
  await page.evaluate(() => { const a = window.__mm.arena; a.player.iframes = 1e9; a._hitPlayer = () => {}; }); // nothing kills the hero while it shops
};
const openShop = async (tap) => { await tap('#realm-bp-btn'); await tap('#realm-backpack-body button[data-open-shop]'); };
const st = (page) => page.evaluate(() => {
  const a = window.__mm.arena; const m = document.getElementById('realm-shop-msg'); let raw = null;
  try { raw = JSON.parse(localStorage.getItem('pixeltown-save-v1') || '{}').realm || null; } catch (e) { raw = null; }
  let seen = false;
  if (m && m.textContent) { const r = m.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width / 2, r.y + Math.min(r.height / 2, 8)); seen = r.height > 0 && r.top >= 0 && r.bottom <= innerHeight + 1 && !!t && (t === m || m.contains(t)); }
  return { panel: a.panel, shards: a.save.shards, n: a.save.items.length, ids: a.save.items.map((x) => x.id + ':' + x.r), msg: m ? m.textContent : null, seen, saveOk: a.saveOk,
    stored: raw ? { shards: raw.shards, n: (raw.items || []).length, ids: (raw.items || []).map((x) => x.id + ':' + x.r) } : null };
});

(async () => {
  const browser = await chromium.launch();

  // 1. a failed save write is said in the panel; the next good save writes the buy (1280x720, mouse)
  {
    const { ctx, page, db, errors, tap } = await open(browser, { width: 1280, height: 720 }, false, { level: 1, xp: 0, shards: 100, bestWave: 0, items: [], nextUid: 20, eq: {} });
    await openShop(tap);
    // storage starts refusing writes to the game save (as a full quota does); everything else still works
    await page.evaluate(() => {
      const orig = Storage.prototype.setItem; window.__setItemOrig = orig;
      Storage.prototype.setItem = function (k, v) { if (window.__quota && k === 'pixeltown-save-v1') { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } return orig.call(this, k, v); };
      window.__quota = true;
    });
    await tap('#realm-shop-body button[data-buy="sparkwand"][data-r="0"]');
    let s = await st(page);
    check('1: with storage refusing the write, the buy still happens for this visit (100 -> 76, 1 item) but storage holds none of it', s.shards === 76 && s.n === 1 && s.saveOk === false && s.stored && s.stored.n === 0 && s.stored.shards === 100, JSON.stringify(s));
    check('1: the shop panel says the buy is NOT saved yet (in view, not only a canvas notice behind the overlay)', /Bought/.test(s.msg || '') && /not saved/i.test(s.msg || '') && s.seen, JSON.stringify({ msg: s.msg, seen: s.seen }));
    if (SHOTS) await page.screenshot({ path: SHOTS + '/cyc9-systems-shop-unsaved-1280.jpg', type: 'jpeg', quality: 65 }).catch(() => null);
    // storage works again: the next buy saves both, and the message no longer warns
    await page.evaluate(() => { window.__quota = false; });
    await tap('#realm-shop-body button[data-buy="heartcharm"][data-r="0"]');
    s = await st(page);
    check('1: once storage works, the next buy saves BOTH buys (52 shards, 2 items in pixeltown-save-v1) and the message no longer warns', s.saveOk === true && s.stored && s.stored.n === 2 && s.stored.shards === 52 && /Bought/.test(s.msg || '') && !/not saved/i.test(s.msg || ''), JSON.stringify(s));
    await page.reload(); await ready(page);
    s = await st(page);
    check('1: after a reload both bought items and the 52 shards are there', s.shards === 52 && s.n === 2 && s.ids.indexOf('sparkwand:0') >= 0 && s.ids.indexOf('heartcharm:0') >= 0, JSON.stringify(s));
    // 2. a Buy whose id / rarity does not resolve answers instead of doing nothing
    await openShop(tap);
    const junk = await page.evaluate(() => { const a = window.__mm.arena; const n = a.save.items.length; const sh = a.save.shards; const r1 = a._shopTap('no_such_item', 0); const m1 = document.getElementById('realm-shop-msg').textContent; const r2 = a._shopTap('sparkwand', NaN); const m2 = document.getElementById('realm-shop-msg').textContent; return { r1, m1, r2, m2, same: a.save.items.length === n && a.save.shards === sh }; });
    check('2: a tap on an unknown item or a broken rarity spends nothing and the panel answers "not for sale"', junk.r1 === false && junk.r2 === false && junk.same && /not for sale/.test(junk.m1) && /not for sale/.test(junk.m2), JSON.stringify(junk));
    check('1-2: no page errors, no database traffic (literal 0)', errors.length === 0 && db.attempts() === 0, errors.join(' | ') + ' db=' + db.attempts());
    await ctx.close();
  }

  // 3. every offer type bought by a real touch tap on a landscape phone, and all still there after a reload
  {
    const vp = { width: 844, height: 390 };
    const { ctx, page, db, errors, tap } = await open(browser, vp, true, { level: 20, xp: 0, shards: 100000, bestWave: 0, items: [], nextUid: 20, eq: {} });
    await page.evaluate(() => { window.__mm.arena.setHeroLevelSource(() => ({ cls: 'ranger', level: 20 })); });
    await openShop(tap);
    const offers = await page.evaluate(() => Array.from(document.querySelectorAll('#realm-shop-body button[data-buy]')).map((b) => [b.dataset.buy, Number(b.dataset.r)]));
    const wpn = offers.filter((o) => /^wpn_/.test(o[0])); const base = offers.filter((o) => !/^wpn_/.test(o[0]));
    check('3: a level-20 ranger sees all three rarities of the base items and of its bow family (21 base + 12 bows)', base.length === 21 && wpn.length === 12 && wpn.every((o) => /^wpn_bow_/.test(o[0])), JSON.stringify({ base: base.length, wpn: wpn.map((o) => o[0] + ':' + o[1]) }));
    const pick = wpn.concat(base.filter((o, i) => i % 2 === 0 || i === 1).slice(0, 12)); // 24 = the backpack size; base: every other row, all rarities
    const bad = [];
    for (const [id, r] of pick) {
      const n0 = (await st(page)).n;
      try { await tap(`#realm-shop-body button[data-buy="${id}"][data-r="${r}"]`); } catch (e) { bad.push({ id, r, err: e.message.split('\n')[0] }); continue; }
      const s = await st(page);
      if (s.n !== n0 + 1 || !/^Bought/.test(s.msg || '') || !s.seen) bad.push({ id, r, n0, n: s.n, msg: s.msg, seen: s.seen });
    }
    check('3: 844x390 touch: each of the 24 real taps (12 bows + 12 base items, all rarities) buys exactly one item and says Bought in view', bad.length === 0 && pick.length === 24, JSON.stringify(bad).slice(0, 900));
    if (SHOTS) await page.screenshot({ path: SHOTS + '/cyc9-systems-shop-landscape.jpg', type: 'jpeg', quality: 65 }).catch(() => null);
    const mem = (await st(page)).ids;
    await page.reload(); await ready(page);
    const after = await st(page);
    const lost = mem.filter((x) => after.ids.indexOf(x) < 0);
    check('3: after a reload all 24 bought items are still in the backpack', after.n === 24 && lost.length === 0, JSON.stringify({ n: after.n, lost }));
    check('3: no page errors, no database traffic (literal 0)', errors.length === 0 && db.attempts() === 0, errors.join(' | ') + ' db=' + db.attempts());
    await ctx.close();
  }

  // 4. phone portrait (390x844) and the smallest phone (195x422): a real tap on the LAST row of a level-20 shop buys it
  for (const vp of [{ width: 390, height: 844 }, { width: 195, height: 422 }]) {
    const { ctx, page, db, errors, tap } = await open(browser, vp, true, { level: 20, xp: 0, shards: 5000, bestWave: 0, items: [], nextUid: 20, eq: {} });
    await openShop(tap);
    const last = await page.evaluate(() => { const b = Array.from(document.querySelectorAll('#realm-shop-body button[data-buy]')).pop(); return [b.dataset.buy, b.dataset.r]; });
    await tap(`#realm-shop-body button[data-buy="${last[0]}"][data-r="${last[1]}"]`);
    const s = await st(page);
    check(`4: ${vp.width}x${vp.height}: a real tap on the last offer (${last.join(':')}) buys it, says so in view, and it is saved`, s.n === 1 && /^Bought/.test(s.msg || '') && s.seen && s.stored && s.stored.n === 1, JSON.stringify(s));
    if (SHOTS) await page.screenshot({ path: SHOTS + `/cyc9-systems-shop-${vp.width}.jpg`, type: 'jpeg', quality: 65 }).catch(() => null);
    check(`4: ${vp.width}x${vp.height}: no page errors, no database traffic (literal 0)`, errors.length === 0 && db.attempts() === 0, errors.join(' | ') + ' db=' + db.attempts());
    await ctx.close();
  }

  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
