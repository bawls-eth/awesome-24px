// Cycle 10 L (1): Pixeltown (Town) shop purchase reliability: the same audit the Realm shop got in cycle 9, for the Town paths
// turnip stall buy -> shop sell -> Able Sisters outfit -> workbench craft (main.js writeSave / writeSaveMerged / saveResources).
// Found and fixed:
//   A. A write that browser storage refused (quota full / blocked) was swallowed without a word. The player saw "bought" and
//      the turnips, the sale or the new look were gone after a reload.
//   B. saveResources moved its delta base even though nothing was written, so the buy stayed lost after storage worked again
//      (the next good save wrote stored + 0). Same for a sale: the sold goods came back after a reload.
//   C. The turnip daily cap (2 bundles) was read from storage only, so with storage refusing writes the stall sold without limit.
//   D. An outfit applied while storage refused was never written later.
// Now: the refused change is kept and written by the next save that lands, and every one of these paths says "not saved yet" in
// the polite toast (in view) and above the player. With storage working nothing warns.
// Driven by real input: the hero stands at the stall / shop / Able Sisters and E is pressed (the phone pass taps #interact-btn).
// OFFLINE: helpers.offlineStub, literal db.attempts() === 0. Never chats, never writes to Firebase.
// Run: BASE=http://localhost:9101/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc10-lead-town-shop-reliability.test.js   (SHOTS=<dir>)
const { chromium } = require('playwright');
const { check, done, offlineStub, exposeGame, joinOffline } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const SHOTS = process.env.SHOTS || '';

async function open(browser, vp, touch, name) {
  const ctx = await browser.newContext(touch ? { viewport: vp, hasTouch: true, isMobile: true } : { viewport: vp });
  const db = await offlineStub(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await exposeGame(page);
  // storage can be told to refuse writes to the game save (as a full quota does); everything else still works
  await page.addInitScript(() => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { if (window.__quota && k === 'pixeltown-save-v1') { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } return orig.call(this, k, v); };
  });
  await page.goto(BASE);
  await joinOffline(page, name);
  await page.waitForTimeout(600);
  return { ctx, page, db, errors };
}
const quota = (page, on) => page.evaluate((v) => { window.__quota = v; }, on);
// stand at a place (hero body moved there; the walk itself is not what is tested)
const standAt = (page, where) => page.evaluate((w) => {
  const s = window.__g.scene.getScene('Town');
  const at = w === 'stall' ? { x: TURNIP_STALL_POS.x, y: TURNIP_STALL_POS.y + 20 }
    : w === 'shop' ? { x: HOUSE_POS.x + HOUSE_POS.w / 2, y: HOUSE_POS.y + HOUSE_POS.h + 14 }
      : { x: ABLE_SISTERS_POS.x + ABLE_SISTERS_POS.w / 2, y: ABLE_SISTERS_POS.y + ABLE_SISTERS_POS.h + 14 };
  s.localBody.setPosition(at.x, at.y); if (s.localBody.body) s.localBody.body.reset(at.x, at.y);
  return { stall: s.isNearTurnipStall(), shop: s.isNearShop(), able: s.isNearAbleSisters(), act: s.canAct() };
}, where);
const act = async (page, touch) => { if (touch) await page.locator('#interact-btn').tap(); else await page.keyboard.press('e'); await page.waitForTimeout(250); };
const st = (page) => page.evaluate(() => {
  const s = window.__g.scene.getScene('Town'); let raw = {};
  try { raw = JSON.parse(localStorage.getItem('pixeltown-save-v1') || '{}'); } catch (e) { raw = {}; }
  const t = document.getElementById('achievement-toast'); let seen = false;
  if (t && !t.classList.contains('hidden')) { const r = t.getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); seen = r.height > 0 && r.top >= 0 && r.bottom <= innerHeight + 1 && r.left >= 0 && r.right <= innerWidth + 1 && !!e && (e === t || t.contains(e)); }
  return { score: s.localScore, turnips: s.resources.turnips || 0, wood: s.resources.wood || 0, species: s.selfData.species, frame: s.selfData.frame, note: s.lastStallNote || '', toast: t ? t.textContent : '', seen,
    stored: { turnips: (raw.resources || {}).turnips || 0, wood: (raw.resources || {}).wood || 0, bundles: raw.turnipBuys ? raw.turnipBuys.bundles : 0, species: raw.species, frame: raw.frame, crafted: raw.crafted || {} } };
});
const give = (page, o) => page.evaluate((v) => { const s = window.__g.scene.getScene('Town'); if (v.score != null) s.localScore = v.score; if (v.wood != null) { s.resources.wood = v.wood; s.saveResources(); } s.lastStallNote = ''; }, o);
const WARN = /not saved yet/i;

(async () => {
  const browser = await chromium.launch();

  // ---------- 1280x720, keyboard ----------
  {
    const vp = { width: 1280, height: 720 };
    const { ctx, page, db, errors } = await open(browser, vp, false, 'ADMINcyc10shop');
    const cap = await page.evaluate(() => ({ cap: TURNIP_DAILY_BUNDLE_CAP, bundle: TURNIP_BUNDLE }));

    // [0] storage working: a buy is saved and nothing warns
    await give(page, { score: 100000 });
    let near = await standAt(page, 'stall');
    check('[0] the hero stands at the turnip stall and can act', near.stall && near.act, JSON.stringify(near));
    await act(page, false);
    let s = await st(page);
    check('[0] storage working: E at the stall buys one bundle, it is in the save, and nothing warns', s.turnips === cap.bundle && s.stored.turnips === cap.bundle && s.stored.bundles === 1 && !WARN.test(s.note) && !WARN.test(s.toast), JSON.stringify(s));

    // [A] storage refuses: the buy still happens for this visit, and the player is told it is not saved
    await quota(page, true);
    await act(page, false);
    s = await st(page);
    check('[A] storage refusing: the 2nd bundle is in the bag for this visit, storage still holds one', s.turnips === 2 * cap.bundle && s.stored.turnips === cap.bundle && s.stored.bundles === 1, JSON.stringify(s));
    check('[A] the player is told the buy is NOT saved yet (polite toast, in view)', WARN.test(s.note) && WARN.test(s.toast) && s.seen, JSON.stringify({ note: s.note, toast: s.toast, seen: s.seen }));
    if (SHOTS) await page.screenshot({ path: SHOTS + '/cyc10-lead-town-unsaved-1280x720.jpg', type: 'jpeg', quality: 65 }).catch(() => null);

    // [C] the daily cap holds while storage refuses (it used to sell without limit)
    const before = s.score;
    await act(page, false); await act(page, false);
    s = await st(page);
    check(`[C] storage refusing: the stall still stops at ${cap.cap} bundles a day (no more turnips, no more stars spent)`, s.turnips === cap.cap * cap.bundle && s.score === before && /Sold out/.test(s.note), JSON.stringify(s));

    // [B] storage works again: the next save of any kind writes the buy that was refused
    await quota(page, false);
    await give(page, { wood: 5 }); // an ordinary gain, saved the ordinary way
    s = await st(page);
    check('[B] storage working again: the next save writes the refused buy too (20 turnips, 2 bundles today, 5 wood)', s.stored.turnips === 2 * cap.bundle && s.stored.bundles === 2 && s.stored.wood === 5, JSON.stringify(s));

    // sale while storage refuses
    await quota(page, true);
    near = await standAt(page, 'shop');
    check('[B] the hero stands at the shop', near.shop && near.act, JSON.stringify(near));
    const sc0 = (await st(page)).score;
    await act(page, false);
    s = await st(page);
    check('[A] storage refusing: the sale pays stars, empties the bag, and says it is not saved yet (in view)', s.score > sc0 && s.turnips === 0 && s.wood === 0 && s.stored.turnips === 2 * cap.bundle && WARN.test(s.note) && WARN.test(s.toast) && s.seen, JSON.stringify(s));
    await quota(page, false);
    await page.evaluate(() => { const t = window.__g.scene.getScene('Town'); t.resources.stone = (t.resources.stone || 0) + 1; t.saveResources(); });
    s = await st(page);
    check('[B] storage working again: the sold goods are gone from the save too (they used to come back after a reload)', s.stored.turnips === 0 && s.stored.wood === 0, JSON.stringify(s));

    // [D] outfit applied while storage refuses
    await quota(page, true);
    near = await standAt(page, 'able');
    check('[D] the hero stands at the Able Sisters', near.able && near.act, JSON.stringify(near));
    await act(page, false);
    const openOk = await page.evaluate(() => !document.getElementById('outfit-overlay').classList.contains('hidden'));
    const old = await st(page);
    // pick a different hero in the real picker, then Apply
    const picked = await page.evaluate(() => {
      const s = window.__g.scene.getScene('Town'); const btns = Array.from(document.querySelectorAll('#outfit-species-tabs button, #outfit-avatar-grid button'));
      for (const b of btns) { b.click(); if (s.outfitSpecies !== s.selfData.species || s.outfitFrame !== s.selfData.frame) return { species: s.outfitSpecies, frame: s.outfitFrame }; }
      return null;
    });
    await page.click('#outfit-apply-btn'); await page.waitForTimeout(250);
    s = await st(page);
    check('[D] the outfit shop opens on E and a different look can be picked', openOk && !!picked, JSON.stringify({ openOk, picked }));
    check('[D] storage refusing: the new look is worn, storage keeps the old one, and the player is told it is not saved yet', !!picked && s.species === picked.species && s.frame === picked.frame && s.stored.species === old.stored.species && s.stored.frame === old.stored.frame && WARN.test(s.toast) && s.seen, JSON.stringify(s));
    await quota(page, false);
    await page.evaluate(() => { const t = window.__g.scene.getScene('Town'); t.incrementStat('sparkles'); }); // any later save
    s = await st(page);
    check('[D] storage working again: the next save writes the new look', !!picked && s.stored.species === picked.species && s.stored.frame === picked.frame, JSON.stringify(s));

    // after a reload the save holds all of it
    await page.reload();
    const raw = await page.evaluate(() => JSON.parse(localStorage.getItem('pixeltown-save-v1') || '{}'));
    check('[B][D] after a reload the save holds: no turnips, no wood, 2 bundles bought today, the new look', (raw.resources || {}).turnips === 0 && (raw.resources || {}).wood === 0 && raw.turnipBuys && raw.turnipBuys.bundles === 2 && !!picked && raw.species === picked.species && raw.frame === picked.frame, JSON.stringify({ r: raw.resources, t: raw.turnipBuys, sp: raw.species, f: raw.frame }));
    check('1280x720: no page errors, no database traffic (literal 0)', errors.length === 0 && db.attempts() === 0, errors.join(' | ') + ' db=' + db.attempts());
    await ctx.close();
  }

  // ---------- 390x844 phone, real taps on the action button ----------
  {
    const vp = { width: 390, height: 844 };
    const { ctx, page, db, errors } = await open(browser, vp, true, 'ADMINcyc10shopP');
    await give(page, { score: 100000 });
    const near = await standAt(page, 'stall');
    await page.waitForTimeout(400); // the action button follows what is near
    await act(page, true);
    let s = await st(page);
    check('390x844: a real tap on the action button at the stall buys a bundle, saved, no warning', near.stall && s.turnips === 10 && s.stored.turnips === 10 && !WARN.test(s.toast), JSON.stringify(s));
    await quota(page, true);
    await act(page, true);
    s = await st(page);
    check('390x844: storage refusing: the tap still buys, and the "not saved yet" toast is in view on the phone', s.turnips === 20 && s.stored.turnips === 10 && WARN.test(s.toast) && s.seen, JSON.stringify(s));
    if (SHOTS) await page.screenshot({ path: SHOTS + '/cyc10-lead-town-unsaved-390x844.jpg', type: 'jpeg', quality: 65 }).catch(() => null);
    await quota(page, false);
    await page.evaluate(() => { const t = window.__g.scene.getScene('Town'); t.resources.stone = (t.resources.stone || 0) + 1; t.saveResources(); });
    s = await st(page);
    check('390x844: storage working again: the refused bundle is saved by the next save', s.stored.turnips === 20 && s.stored.bundles === 2, JSON.stringify(s));
    check('390x844: no page errors, no database traffic (literal 0)', errors.length === 0 && db.attempts() === 0, errors.join(' | ') + ' db=' + db.attempts());
    await ctx.close();
  }

  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
