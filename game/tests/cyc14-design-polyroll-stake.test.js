// Cycle 14 D: Polyroll re-roll by reloading while browser storage refuses pixeltown-save-v1.
// Before: a roll resolved in memory, the star delta was refused, and a reload brought the old (larger) star count back, so a lost bet
// could be re-rolled for free as often as the player liked. Now the stake is written BEFORE the roll; a refused stake means no roll.
//   [A] storage refusing + reload + click Roll x6: nothing is rolled (polyrollPlays unchanged), stars unchanged live and stored, a
//       plain "paused" line is shown (no "rolled").
//   [B] storage back: the roll happens, and the stored stars already equal the live stars (stake and payout landed); a reload shows the same stars.
//   [C] a payout refused after the stake landed still says "Not saved yet" (a reload can only cost the player, never help).
// OFFLINE: helpers.offlineStub, literal db.attempts() === 0. Save format unchanged (no new key).
// Run: BASE=http://localhost:9104/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc14-design-polyroll-stake.test.js   (SHOTS=<dir>)
const { chromium } = require('playwright');
const { check, done, offlineStub, exposeGame, joinOffline } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const SHOTS = process.env.SHOTS || '';

async function openIn(ctx, name) {
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await exposeGame(page);
  await page.addInitScript(() => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      let q = false; try { q = window.__quota || sessionStorage.getItem('__q') === '1'; } catch (e) { /* none */ }
      if (q && k === 'pixeltown-save-v1') { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
      return orig.call(this, k, v);
    };
  });
  await page.goto(BASE);
  await joinOffline(page, name);
  await page.waitForTimeout(600);
  return { page, errors };
}
const quota = (page, on) => page.evaluate((v) => { window.__quota = v; try { sessionStorage.setItem('__q', v ? '1' : '0'); } catch (e) { /* none */ } }, on);
const raw = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('pixeltown-save-v1') || '{}'); } catch (e) { return {}; } });
const T = (page, fn, arg) => page.evaluate(([f, a]) => { const s = window.__g.scene.getScene('Town'); return (0, eval)('(' + f + ')')(s, a); }, [fn.toString(), arg]);
const resultTxt = (page) => page.evaluate(() => document.getElementById('polyroll-result').textContent);
const plays = async (page) => ((await raw(page)).lifetimeStats || {}).polyrollPlays || 0;

(async () => {
  const browser = await chromium.launch();
  for (const vp of [{ w: 1280, h: 720, tag: '1280x720', touch: false }, { w: 390, h: 844, tag: '390x844', touch: true }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: vp.touch, isMobile: vp.touch });
    const db = await offlineStub(ctx);
    const name = 'ADMINcyc14poly' + (vp.touch ? 'P' : '');
    const { page, errors } = await openIn(ctx, name);
    const tag = `[${vp.tag}]`;
    await T(page, (s) => { s.localScore = 50; s.saveStars(); });
    await page.waitForTimeout(300);
    check(`${tag} start: 50 stars stored`, (await raw(page)).stars === 50, String((await raw(page)).stars));

    // ---- [A] storage refuses from the start of this visit; reload, then hammer Roll ----
    await quota(page, true);
    await page.reload(); await joinOffline(page, name); await page.waitForTimeout(600);
    await T(page, (s) => s.openPolyroll());
    const p0 = await plays(page);
    const outs = [];
    for (let i = 0; i < 6; i++) { await page.click('#polyroll-play-btn'); await page.waitForTimeout(120); outs.push(await resultTxt(page)); }
    const live = await T(page, (s) => s.localScore);
    check(`${tag} [A] refusing storage: six Roll clicks roll nothing (no "rolled"/"landed")`, outs.every((t) => !/🎲 rolled|🪙 landed/.test(t)), JSON.stringify(outs));
    check(`${tag} [A] the line says paused and nothing was spent`, /paused/i.test(outs[5]) && /nothing was (rolled|spent)/i.test(outs[5]), outs[5]);
    check(`${tag} [A] stars unchanged: live 50, stored 50, plays unchanged`, live === 50 && (await raw(page)).stars === 50 && (await plays(page)) === p0, JSON.stringify({ live, st: (await raw(page)).stars }));
    check(`${tag} [A] the score label still shows 50`, (await page.evaluate(() => document.getElementById('polyroll-score').textContent)) === '50');
    if (SHOTS) await page.screenshot({ path: SHOTS + `/cyc14-design-polyroll-paused-${vp.tag}.jpg`, type: 'jpeg', quality: 65 }).catch(() => null);

    // ---- [B] storage back ----
    await quota(page, false);
    await page.click('#polyroll-play-btn'); await page.waitForTimeout(250);
    const rb = await resultTxt(page);
    const liveB = await T(page, (s) => s.localScore);
    const stB = (await raw(page)).stars;
    check(`${tag} [B] storage back: the roll happens and the stored stars equal the live stars`, /🎲 rolled|🪙 landed/.test(rb) && stB === liveB, JSON.stringify({ rb, liveB, stB }));
    check(`${tag} [B] no "not saved yet" on a landed roll`, !/not saved yet/i.test(rb), rb);
    check(`${tag} [B] a bet of 1: a loss left 49 stars, a win left 55`, liveB === 49 || liveB === 55, String(liveB));
    await page.reload(); await joinOffline(page, name); await page.waitForTimeout(600);
    const afterReload = await T(page, (s) => s.localScore);
    check(`${tag} [B] reload keeps the result (no free re-roll with working storage either)`, afterReload === liveB, JSON.stringify({ afterReload, liveB }));

    // ---- [C] payout refused after the stake landed ----
    await T(page, (s) => s.openPolyroll());
    await T(page, (s) => { s._tk = s.polyrollTakeStake(1); });
    await quota(page, true);
    await T(page, (s) => s.resolvePolyroll('🎲 rolled 3', true, 5)); await page.waitForTimeout(200);
    const rc = await resultTxt(page);
    check(`${tag} [C] a payout refused after the stake landed says not saved yet`, /not saved yet/i.test(rc), rc);
    await quota(page, false);

    check(`${tag} no page errors, no database traffic (literal 0)`, errors.length === 0 && db.attempts() === 0, errors.join(' | ') + ' db=' + db.attempts());
    await ctx.close();
  }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
