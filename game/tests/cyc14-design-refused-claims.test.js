// Cycle 14 D (3): two more refused-save paths of the same kind as the cycle 13 mailbox bug: a claim-once star payout whose "already paid"
// record was read from STORAGE only. While storage refused pixeltown-save-v1 the record sat in SAVE_PENDING, so it looked unpaid again:
//   [DB] all-chores bonus (DAILY_BONUS 40 stars): refreshDailies polls every 20 s and paid again on every poll.
//   [BC] Town bounty Claim button: the same bounty could be claimed again and again for free.
// Now both read loadSaveLive(): paid/claimed for this visit, one payout, a "not saved yet" note, and the record is written once storage returns.
// OFFLINE: helpers.offlineStub, literal db.attempts() === 0. Save format unchanged (no new key).
// Run: BASE=http://localhost:9104/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc14-design-refused-claims.test.js   (SHOTS=<dir>)
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
const T = (page, fn, arg) => page.evaluate(([f, a]) => { const s = window.__g.scene.getScene('Town'); return (0, eval)('(' + f + ')')(s, a); }, [fn.toString(), arg]);
const toastTxt = (page) => page.evaluate(() => (document.getElementById('achievement-toast') || {}).textContent || '');

(async () => {
  const browser = await chromium.launch();
  for (const vp of [{ w: 1280, h: 720, tag: '1280x720', touch: false }, { w: 390, h: 844, tag: '390x844', touch: true }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: vp.touch, isMobile: vp.touch });
    const db = await offlineStub(ctx);
    const { page, errors } = await openIn(ctx, 'ADMINcyc14claims' + (vp.touch ? 'P' : ''));
    const tag = `[${vp.tag}]`;
    await T(page, (s) => { s.localScore = 100; s.saveStars(); });
    await page.waitForTimeout(300);

    // ---- [DB] all-chores bonus while storage refuses ----
    await T(page, (s) => { s.dailyProgress = () => ({ done: 3, total: 3 }); });
    await quota(page, true);
    const d0 = await T(page, (s) => ({ sc: s.localScore, bonus: DAILY_BONUS }));
    await T(page, (s) => s.refreshDailies());
    const dFirst = await T(page, (s) => s.localScore);
    for (let i = 0; i < 3; i++) await T(page, (s) => s.refreshDailies());
    const d1 = await T(page, (s) => s.localScore);
    // the first poll pays the bonus (plus the one-time Daily Routine achievement star reward); the next polls pay nothing
    check(`${tag} [DB] refused save: the all-chores bonus is paid once, not on every poll`, dFirst - d0.sc >= d0.bonus && dFirst - d0.sc <= d0.bonus + 5 && d1 === dFirst, JSON.stringify({ before: d0.sc, first: dFirst, after: d1, bonus: d0.bonus }));
    check(`${tag} [DB] the player is told it is not saved yet`, WARN.test(await toastTxt(page)) || (await T(page, (s) => s.lastStallNote || '')).match(WARN) !== null, await toastTxt(page));
    await quota(page, false);
    await T(page, (s) => { s.incrementStat('sparkles'); });
    const sv = await raw(page);
    check(`${tag} [DB] storage back: the paid record is written once (days 1) and the stars are stored`, sv.dailies && sv.dailies.paid === true && sv.dailies.days === 1 && sv.stars === d1, JSON.stringify({ dailies: sv.dailies, stars: sv.stars, live: d1 }));
    await T(page, (s) => s.refreshDailies());
    check(`${tag} [DB] after storage is back it still does not pay again`, (await T(page, (s) => s.localScore)) === d1);

    // ---- [BC] bounty claim while storage refuses ----
    const bid = await T(page, (s) => {
      const b = s.townBounties()[0]; if (!b) return null;
      const rec = { d: townUtcKey(), s: {} }; s.townBounties().forEach((x) => { rec.s[x.id] = [0, 0]; }); rec.s[b.id] = [b.goal, 0];
      const cur = JSON.parse(localStorage.getItem('pixeltown-save-v1') || '{}'); cur.bounty = rec; localStorage.setItem('pixeltown-save-v1', JSON.stringify(cur));
      return { id: b.id, stars: b.reward.stars };
    });
    check(`${tag} the Town has bounties to claim`, !!bid, JSON.stringify(bid));
    await T(page, (s) => { s.openDailies(); });
    await page.waitForTimeout(200);
    const c0 = await T(page, (s) => s.localScore);
    await quota(page, true);
    await page.click(`#bounty-list li[data-bounty="${bid.id}"] .bounty-claim`); await page.waitForTimeout(250);
    const c1 = await T(page, (s) => s.localScore);
    const stillBtn = await page.evaluate((id) => !!document.querySelector(`#bounty-list li[data-bounty="${id}"] .bounty-claim`), bid.id);
    const again = await T(page, (s, id) => s.claimBounty(id), bid.id);
    const c2 = await T(page, (s) => s.localScore);
    check(`${tag} [BC] refused save: one claim pays ${bid.stars} stars`, c1 - c0 === bid.stars, JSON.stringify({ c0, c1 }));
    check(`${tag} [BC] the Claim button is gone (Claimed) and a second claim pays nothing`, !stillBtn && again === false && c2 === c1, JSON.stringify({ stillBtn, again, c1, c2 }));
    check(`${tag} [BC] the player is told it is not saved yet`, WARN.test(await toastTxt(page)) || WARN.test(await T(page, (s) => s.lastStallNote || '')), await toastTxt(page));
    if (SHOTS) await page.screenshot({ path: SHOTS + `/cyc14-design-bounty-unsaved-${vp.tag}.jpg`, type: 'jpeg', quality: 65 }).catch(() => null);
    await quota(page, false);
    await T(page, (s) => { s.incrementStat('sparkles'); });
    const r3 = await raw(page);
    check(`${tag} [BC] storage back: the claim is written (claimed 1) and the stars are stored`, r3.bounty && r3.bounty.s[bid.id][1] === 1 && r3.stars === c2, JSON.stringify({ b: r3.bounty && r3.bounty.s[bid.id], stars: r3.stars, live: c2 }));

    check(`${tag} no page errors, no database traffic (literal 0)`, errors.length === 0 && db.attempts() === 0, errors.join(' | ') + ' db=' + db.attempts());
    await ctx.close();
  }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
