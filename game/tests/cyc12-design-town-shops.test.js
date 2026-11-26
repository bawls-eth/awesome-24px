// Cycle 12 D (1)+(2): Pixeltown (Town) workbench, pickaxe bench, home plots and merchant under a refused save, plus the cross-tab turnip cap.
// cycle 10 covered the stall, the shop and the Able Sisters; this file covers the rest of the Town shops the same way (real clicks / E presses,
// storage told to refuse writes to pixeltown-save-v1 as a full quota does):
//   [W] workbench craft: says "not saved yet", keeps the goods, the next save writes them.
//   [P] pickaxe craft: used to say "Crafted the Stone Pickaxe!" with no warning at all (lost on reload if storage stayed full).
//   [H] home plots: placing a good used to be silent; now the home note says it is not saved yet, and the next save writes the placement.
//   [M] merchant look + gift boxes: warn, and are written later.
//   [T] two tabs: tab A's refused turnip bundle used to be kept as a whole-key turnipBuys value that overrode tab B's newer count (live read)
//       and overwrote it on flush, so the day allowed more than the daily cap. Now A keeps "my unsaved bundles" and adds them to storage.
// OFFLINE: helpers.offlineStub, literal db.attempts() === 0. Never chats, never writes to Firebase.
// Run: BASE=http://localhost:9124/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc12-design-town-shops.test.js   (SHOTS=<dir>)
const { chromium } = require('playwright');
const { check, done, offlineStub, exposeGame, joinOffline } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const SHOTS = process.env.SHOTS || '';
const WARN = /not saved yet/i;

async function openIn(ctx, name) {
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await exposeGame(page);
  await page.addInitScript(() => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { if (window.__quota && k === 'pixeltown-save-v1') { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } return orig.call(this, k, v); };
  });
  await page.goto(BASE);
  await joinOffline(page, name);
  await page.waitForTimeout(600);
  return { page, errors };
}
const quota = (page, on) => page.evaluate((v) => { window.__quota = v; }, on);
const raw = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('pixeltown-save-v1') || '{}'); } catch (e) { return {}; } });
const standAt = (page, x, y) => page.evaluate(([px, py]) => { const s = window.__g.scene.getScene('Town'); s.localBody.setPosition(px, py); if (s.localBody.body) s.localBody.body.reset(px, py); }, [x, y]);
const T = (page, fn, arg) => page.evaluate(([f, a]) => { const s = window.__g.scene.getScene('Town'); return (0, eval)('(' + f + ')')(s, a); }, [fn.toString(), arg]);
const toastTxt = (page) => page.evaluate(() => (document.getElementById('achievement-toast') || {}).textContent || '');

(async () => {
  const browser = await chromium.launch();

  // ---------- 1280x720: workbench, pickaxe, home, merchant ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const db = await offlineStub(ctx);
    const { page, errors } = await openIn(ctx, 'ADMINcyc12shops');
    const wb = await T(page, () => ({ x: WORKBENCH_POS.x, y: WORKBENCH_POS.y + 20 }));
    await standAt(page, wb.x, wb.y);
    await T(page, (s) => { s.resources.wood = 30; s.resources.stone = 30; s.saveResources(); });
    await page.keyboard.press('e'); await page.waitForTimeout(250);
    check('[W] E at the workbench opens it', await page.evaluate(() => !document.getElementById('workbench-overlay').classList.contains('hidden')));

    // [W] craft while storage refuses
    await quota(page, true);
    await page.click('button[data-recipe="plank"]'); await page.waitForTimeout(200);
    let note = await page.evaluate(() => document.getElementById('workbench-note').textContent);
    let r = await raw(page); let g = await T(page, (s) => ({ plank: s.craftedGoods.plank || 0, wood: s.resources.wood }));
    check('[W] refused save: a plank stack is crafted for this visit, storage still has none, and the bench says not saved yet', g.plank === 1 && g.wood === 27 && !((r.crafted || {}).plank) && WARN.test(note), JSON.stringify({ g, note, c: r.crafted }));

    // [P] pickaxe while storage refuses
    await page.click('button[data-pick="1"]'); await page.waitForTimeout(200);
    note = await page.evaluate(() => document.getElementById('workbench-note').textContent);
    const pk = await T(page, (s) => s.cavePick.tier);
    check('[P] refused save: the stone pickaxe is crafted for this visit and the bench says it is not saved yet', pk === 1 && /Stone Pickaxe/.test(note) && WARN.test(note), JSON.stringify({ pk, note }));
    if (SHOTS) await page.screenshot({ path: SHOTS + '/cyc12-design-bench-unsaved-1280x720.jpg', type: 'jpeg', quality: 65 }).catch(() => null);

    // storage back: the next save carries both
    await quota(page, false);
    await T(page, (s) => { s.resources.wood += 1; s.saveResources(); });
    r = await raw(page);
    check('[W][P] storage working again: the next save writes the plank, the pick and the spent wood/stone', (r.crafted || {}).plank === 1 && (r.resources || {}).stone === 24 && (r.resources || {}).wood === 26 && r.cavePick && r.cavePick.tier === 1, JSON.stringify({ c: r.crafted, res: r.resources, p: r.cavePick }));
    await page.click('#workbench-close-btn'); await page.waitForTimeout(150);

    // [H] home plots
    const hp = await T(page, () => ({ x: HOME_POS.x, y: HOME_POS.y + 30 }));
    await standAt(page, hp.x, hp.y);
    await page.keyboard.press('e'); await page.waitForTimeout(250);
    check('[H] E at the home opens the plots', await page.evaluate(() => !document.getElementById('home-overlay').classList.contains('hidden')));
    await quota(page, true);
    await page.selectOption('#home-slot-0', 'plank'); await page.waitForTimeout(200);
    const hn = await page.evaluate(() => document.getElementById('home-note').textContent);
    const placed = await T(page, (s) => ({ slot: s.home.slots[0], left: s.craftedGoods.plank || 0 }));
    r = await raw(page);
    check('[H] refused save: the plank is placed for this visit, storage has no placement, and the home says not saved yet', placed.slot === 'plank' && placed.left === 0 && !((r.home || {}).slots || [])[0] && WARN.test(hn), JSON.stringify({ placed, hn, home: r.home }));
    if (SHOTS) await page.screenshot({ path: SHOTS + '/cyc12-design-home-unsaved-1280x720.jpg', type: 'jpeg', quality: 65 }).catch(() => null);
    await quota(page, false);
    await T(page, (s) => { s.incrementStat('sparkles'); s.saveResources(); });
    r = await raw(page);
    check('[H] storage working again: the next save writes the placement and the plank count', ((r.home || {}).slots || [])[0] === 'plank' && !((r.crafted || {}).plank), JSON.stringify({ home: r.home, c: r.crafted }));
    await T(page, (s) => s.closeHome());

    // [M] merchant: look, then gift boxes
    await T(page, (s) => { s.isMerchantVisiting = () => true; s.localScore = 100000; });
    const mp = await T(page, () => ({ x: MERCHANT_POS.x, y: MERCHANT_POS.y + 20 }));
    await standAt(page, mp.x, mp.y);
    const look0 = await T(page, (s) => ({ sp: s.selfData.species, fr: s.selfData.frame, want: s.merchantSpecies().key, wf: Math.floor(s.merchantHash(3) * 9) }));
    if (look0.sp === look0.want && look0.fr === look0.wf) await T(page, (s) => { s.selfData.frame = (s.selfData.frame + 1) % 9; });
    await quota(page, true);
    await page.keyboard.press('e'); await page.waitForTimeout(300);
    const m = await T(page, (s) => ({ sp: s.selfData.species, fr: s.selfData.frame }));
    const sm = await toastTxt(page);
    r = await raw(page);
    check('[M] refused save: the merchant look is worn for this visit and the player is told it is not saved yet', m.sp === look0.want && m.fr === look0.wf && WARN.test(sm) && r.species !== look0.want, JSON.stringify({ m, sm, stored: r.species }));
    await T(page, (s) => { s.lastStallNote = ''; });
    await page.keyboard.press('e'); await page.waitForTimeout(300); // now wearing today's look: gift boxes
    const gb = await T(page, (s) => ({ live: Number(loadSaveLive().merchantGiftBoxDay) === s.questDayBucket() }));
    check('[M] refused save: the gift boxes go out and say not saved yet', gb.live && WARN.test(await toastTxt(page)), JSON.stringify({ gb, t: await toastTxt(page) }));
    const stars = await T(page, (s) => s.localScore);
    await page.keyboard.press('e'); await page.waitForTimeout(250);
    check('[M] the gift boxes cannot be bought twice the same day while storage refuses', (await T(page, (s) => s.localScore)) === stars, String(stars));
    await quota(page, false);
    await T(page, (s) => { s.incrementStat('sparkles'); });
    r = await raw(page);
    check('[M] storage working again: the look and the gift-box day are written', r.species === look0.want && Number(r.merchantGiftBoxDay) > 0, JSON.stringify({ sp: r.species, d: r.merchantGiftBoxDay }));
    check('1280x720: no page errors, no database traffic (literal 0)', errors.length === 0 && db.attempts() === 0, errors.join(' | ') + ' db=' + db.attempts());
    await ctx.close();
  }

  // ---------- 390x844 phone: bench note in view, real taps ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const db = await offlineStub(ctx);
    const { page, errors } = await openIn(ctx, 'ADMINcyc12shopsP');
    const wb = await T(page, () => ({ x: WORKBENCH_POS.x, y: WORKBENCH_POS.y + 20 }));
    await standAt(page, wb.x, wb.y);
    await T(page, (s) => { s.resources.wood = 30; s.resources.stone = 30; s.saveResources(); });
    await page.waitForTimeout(400);
    await page.locator('#interact-btn').tap(); await page.waitForTimeout(250);
    await quota(page, true);
    await page.locator('button[data-pick="1"]').scrollIntoViewIfNeeded();
    await page.locator('button[data-pick="1"]').tap(); await page.waitForTimeout(200);
    const seen = await page.evaluate(() => { const n = document.getElementById('workbench-note'); n.scrollIntoView({ block: 'nearest' }); const r = n.getBoundingClientRect(); return { t: n.textContent, inView: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth + 1 }; });
    check('390x844: a real tap on Craft says the pickaxe is not saved yet, and the note is in view', /Stone Pickaxe/.test(seen.t) && WARN.test(seen.t) && seen.inView, JSON.stringify(seen));
    if (SHOTS) await page.screenshot({ path: SHOTS + '/cyc12-design-bench-unsaved-390x844.jpg', type: 'jpeg', quality: 65 }).catch(() => null);
    check('390x844: no page errors, no database traffic (literal 0)', errors.length === 0 && db.attempts() === 0, errors.join(' | ') + ' db=' + db.attempts());
    await ctx.close();
  }

  // ---------- two tabs: turnip daily cap ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const db = await offlineStub(ctx);
    const A = await openIn(ctx, 'ADMINcyc12tabs');
    const B = await openIn(ctx, 'ADMINcyc12tabs');
    // another tab joining makes the first one reload to its join card (valid, see beta-retest-b14): join it again
    await A.page.waitForTimeout(1200);
    const aUp = await A.page.evaluate(() => !!(window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody)).catch(() => false);
    if (!aUp) { await A.page.reload(); await joinOffline(A.page, 'ADMINcyc12tabs'); await A.page.waitForTimeout(600); }
    const cap = await A.page.evaluate(() => ({ cap: TURNIP_DAILY_BUNDLE_CAP, bundle: TURNIP_BUNDLE }));
    for (const p of [A.page, B.page]) {
      await T(p, (s) => { s.localScore = 100000; });
      const sp = await T(p, () => ({ x: TURNIP_STALL_POS.x, y: TURNIP_STALL_POS.y + 20 }));
      await standAt(p, sp.x, sp.y);
    }
    const buy = async (p) => { await p.keyboard.press('e'); await p.waitForTimeout(250); };
    // A's storage refuses: its first bundle is only pending
    await quota(A.page, true);
    await buy(A.page);
    // B (storage fine) buys the whole day
    await buy(B.page); await buy(B.page);
    let r = await raw(B.page);
    check(`[T] tab B's two buys landed in storage (${cap.cap} bundles = the daily cap)`, r.turnipBuys && r.turnipBuys.bundles === cap.cap, JSON.stringify(r.turnipBuys));
    // A's storage works again; its refused bundle is still pending. Storage already holds the full day: sold out.
    await quota(A.page, false);
    const before = await T(A.page, (s) => s.resources.turnips || 0);
    await buy(A.page);
    const afterA = await T(A.page, (s) => ({ t: s.resources.turnips || 0, note: s.lastStallNote || '' }));
    check('[T] tab A (stale pending bundle) cannot buy past the cap another tab already used: sold out', afterA.t === before && /Sold out/.test(afterA.note), JSON.stringify({ before, afterA }));
    // A's next ordinary save flushes its refused bundle: it ADDS to storage, never lowers what B stored
    await T(A.page, (s) => { s.resources.wood = (s.resources.wood || 0) + 1; s.saveResources(); });
    r = await raw(A.page);
    check('[T] A flushing its refused bundle adds to storage: bundles >= cap + 1 (B 2 + A 1), never below what B stored', r.turnipBuys && r.turnipBuys.bundles === cap.cap + 1, JSON.stringify(r.turnipBuys));
    check('[T] no page errors, no database traffic (literal 0)', A.errors.length + B.errors.length === 0 && db.attempts() === 0, A.errors.concat(B.errors).join(' | ') + ' db=' + db.attempts());
    await ctx.close();
  }

  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
