// Cycle 13 D (1)+(2): Polyroll, Museum donation, Scavenger and the mailbox when browser storage refuses pixeltown-save-v1 (full quota),
// plus the home placement duplicate window.
//   [PR] Polyroll: result line says "Not saved yet" (it was silent: the stars come back after a reload).
//   [MU] Museum donation: toast says "not saved yet"; the next landing write stores the donation.
//   [SC] Scavenger win (net stubbed, never Firebase): says "not saved yet".
//   [MB] Mailbox: a refused claim was invisible to claimedLetters (it read storage only), so the same letter could be collected again
//        and again for free while storage refused; now it is claimed for this visit, warns, and is written when storage returns.
//   [HD] Home duplicate window: refused placement + refused crafted decrement; storage returns and a NON-resource write lands the
//        pending home slots; the plank used to stay in stock in storage until the next saveResources (reload = placed AND in stock).
// OFFLINE: helpers.offlineStub, literal db.attempts() === 0. Never chats, never writes to Firebase.
// Run: BASE=http://localhost:9134/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc13-design-refused-saves.test.js   (SHOTS=<dir>)
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
  for (const vp of [{ w: 1280, h: 720, tag: '1280x720', touch: false }, { w: 390, h: 844, tag: '390x844', touch: true }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: vp.touch, isMobile: vp.touch });
    const db = await offlineStub(ctx);
    const name = 'ADMINcyc13saves' + (vp.touch ? 'P' : '');
    const { page, errors } = await openIn(ctx, name);
    const tag = `[${vp.tag}]`;

    // ---- Polyroll ----
    const pp = await T(page, () => ({ x: POLYROLL_POS.x, y: POLYROLL_POS.y + 20 }));
    await standAt(page, pp.x, pp.y);
    await T(page, (s) => { s.localScore = 50; s.saveStars(); });
    await page.waitForTimeout(300);
    await T(page, (s) => s.openPolyroll());
    check(`${tag} Polyroll opens`, await page.evaluate(() => !document.getElementById('polyroll-overlay').classList.contains('hidden')));
    // cyc14: a refused stake pauses the roll (see cyc14-design-polyroll-stake.test.js); the "not saved yet" line is for a payout that
    // is refused after the stake landed: take the stake with storage working, then refuse the write for the payout.
    await T(page, (s) => { s._tk = s.polyrollTakeStake(1); });
    await quota(page, true);
    await T(page, (s) => s.resolvePolyroll('🎲 rolled 3', true, 5)); await page.waitForTimeout(250);
    const pr = await page.evaluate(() => document.getElementById('polyroll-result').textContent);
    check(`${tag} [PR] refused payout save: the Polyroll result says not saved yet`, WARN.test(pr) && /rolled|landed/.test(pr), pr);
    if (SHOTS) await page.screenshot({ path: SHOTS + `/cyc13-design-polyroll-unsaved-${vp.tag}.jpg`, type: 'jpeg', quality: 65 }).catch(() => null);
    await quota(page, false);
    await T(page, (s) => { s.incrementStat('sparkles'); });
    const sv = await raw(page); const live = await T(page, (s) => s.localScore);
    check(`${tag} [PR] storage back: the next write stores the stars this visit holds`, sv.stars === live, JSON.stringify({ stored: sv.stars, live }));
    await T(page, (s) => s.closePolyroll());

    // ---- Museum donation ----
    const mu = await T(page, () => ({ x: MUSEUM_POS.x + MUSEUM_POS.w / 2, y: MUSEUM_POS.y + MUSEUM_POS.h / 2 }));
    await standAt(page, mu.x, mu.y);
    await T(page, (s) => { s.fossilsHeld = [0]; s.museumCollection.delete(0); s.saveFossils(); });
    await quota(page, true);
    await T(page, (s) => s.donateFossils()); await page.waitForTimeout(300);
    const t1 = await toastTxt(page);
    const held = await T(page, (s) => ({ held: s.fossilsHeld.length, has: s.museumCollection.has(0) }));
    const r1 = await raw(page);
    check(`${tag} [MU] refused save: the fossil is donated for this visit, storage has not got it, and the player is told`, held.held === 0 && held.has && WARN.test(t1) && !((r1.museumCollection || []).includes(0)), JSON.stringify({ held, t1, st: r1.museumCollection }));
    if (SHOTS) await page.screenshot({ path: SHOTS + `/cyc13-design-museum-unsaved-${vp.tag}.jpg`, type: 'jpeg', quality: 65 }).catch(() => null);
    await quota(page, false);
    await T(page, (s) => { s.incrementStat('sparkles'); });
    const r2 = await raw(page);
    check(`${tag} [MU] storage back: the donation and the empty bag are written`, (r2.museumCollection || []).includes(0) && (r2.fossilsHeld || []).length === 0, JSON.stringify({ c: r2.museumCollection, f: r2.fossilsHeld }));

    // ---- Scavenger (net stubbed: the offline net never wins; no Firebase) ----
    await T(page, (s) => { s.net.claimScavengerSpot = () => Promise.resolve({ success: true, claim: null }); });
    await quota(page, true);
    await T(page, (s) => s.claimScavenger()); await page.waitForTimeout(250);
    const t2 = await toastTxt(page);
    check(`${tag} [SC] refused save: a won scavenger hunt says not saved yet`, WARN.test(t2) && /Found it/.test(t2), t2);
    await quota(page, false);
    await T(page, (s) => { s.incrementStat('sparkles'); });
    check(`${tag} [SC] storage back: the win is written to lifetimeStats`, ((await raw(page)).lifetimeStats || {}).scavengerHuntsWon >= 1);

    // ---- Mailbox ----
    const mb = await T(page, () => ({ x: MAILBOX_POS.x, y: MAILBOX_POS.y + 20 }));
    await standAt(page, mb.x, mb.y);
    await T(page, (s) => s.openMailbox());
    const letters = await page.evaluate(() => [...document.querySelectorAll('.mail-collect-btn')].map((b) => b.dataset.letter));
    const first = letters[0];
    check(`${tag} the mailbox lists letters`, !!first, JSON.stringify(letters));
    const before = await T(page, (s) => ({ sc: s.localScore, res: JSON.stringify(s.resources) }));
    await quota(page, true);
    await page.click(`.mail-collect-btn[data-letter="${first}"]`); await page.waitForTimeout(250);
    const mn = await page.evaluate(() => document.getElementById('mailbox-note').textContent);
    const dis = await page.evaluate((id) => document.querySelector(`.mail-collect-btn[data-letter="${id}"]`).disabled, first);
    check(`${tag} [MB] refused save: the letter reads Collected and the note says not saved yet`, dis && WARN.test(mn), JSON.stringify({ dis, mn }));
    const again = await T(page, (s, id) => s.claimLetter(id), first);
    const after = await T(page, (s) => ({ sc: s.localScore, res: JSON.stringify(s.resources) }));
    check(`${tag} [MB] refused save: the same letter cannot be collected a second time (no free repeat gift)`, again === false, JSON.stringify({ again, before, after }));
    if (SHOTS) await page.screenshot({ path: SHOTS + `/cyc13-design-mailbox-unsaved-${vp.tag}.jpg`, type: 'jpeg', quality: 65 }).catch(() => null);
    await quota(page, false);
    await T(page, (s) => { s.incrementStat('sparkles'); });
    const r3 = await raw(page);
    check(`${tag} [MB] storage back: the claim is written once (claimed has the letter, lifetime 1)`, !!r3.mail && r3.mail.claimed.includes(first) && r3.mail.lifetime === 1, JSON.stringify(r3.mail));
    await T(page, (s) => s.closeMailbox());

    // ---- Home duplicate window ----
    await T(page, (s) => { s.craftedGoods.plank = 1; s.saveResources(); });
    const hp = await T(page, () => ({ x: HOME_POS.x, y: HOME_POS.y + 30 }));
    await standAt(page, hp.x, hp.y);
    await T(page, (s) => s.openHome());
    await quota(page, true);
    await page.selectOption('#home-slot-0', 'plank'); await page.waitForTimeout(200);
    const hn = await page.evaluate(() => document.getElementById('home-note').textContent);
    check(`${tag} [HD] refused placement says not saved yet`, WARN.test(hn), hn);
    await quota(page, false);
    // a write that has nothing to do with resources lands first: the pending home slots go out with it
    await T(page, (s) => { s.incrementStat('sparkles'); });
    const r4 = await raw(page);
    check(`${tag} [HD] no duplicate window: storage never shows the plank placed AND still in stock (before any saveResources)`, ((r4.home || {}).slots || [])[0] === 'plank' && !((r4.crafted || {}).plank), JSON.stringify({ home: r4.home, c: r4.crafted }));
    await page.reload(); await joinOffline(page, name); await page.waitForTimeout(600);
    const rl = await T(page, (s) => ({ slot: s.home.slots[0], plank: s.craftedGoods.plank || 0 }));
    check(`${tag} [HD] after a reload: placed once, none left in stock`, rl.slot === 'plank' && rl.plank === 0, JSON.stringify(rl));

    check(`${tag} no page errors, no database traffic (literal 0)`, errors.length === 0 && db.attempts() === 0, errors.join(' | ') + ' db=' + db.attempts());
    await ctx.close();
  }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
