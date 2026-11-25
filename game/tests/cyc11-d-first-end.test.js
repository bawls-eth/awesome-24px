// Cycle 11 D (ID-55 tuning, measured with the first-ten bot: design/beta/cycle11-design.md). Two changes, both failed on the cycle-10 tip:
//  1 "first session" = Lv <= 5 at the first world load in the tab (was Lv <= 3: the bot is Lv 4 after 50-75 s and Lv 5 after 64-99 s, so Lv 3 shut out
//    anyone who had played more than about a minute before the first 8-minute session). Lv 5 gets the card, Lv 6 does not.
//  2 a card that the world closes again within 6 s (an enemy came within 300 px: the always-fighting bot saw it for 1-5 s and the save flag was already
//    written, so it was gone for good) shows again at the next quiet moment (at most twice, 10 game seconds apart). A card that was readable for 6 s or
//    more, and one closed by the player, is not repeated. The save flag is still written at the first show.
// OFFLINE: blockDb + every WebSocket closed + the town page stubbed; literal 0 database attempts.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc11-d-first-end.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const LS = require('./lib/load-scale');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL0 = ORIGIN + '/game/games/mad-maze/index.html?mode=world&from=hub&test=1&seed=12345&heropick=0&tutorial=0&qdate=2030-05-01';
const ST = (page) => page.evaluate(() => { const w = window.__mm.world; const s = w.firstEnd.state(); let realm = null; try { realm = JSON.parse(localStorage.getItem('pixeltown-save-v1') || '{}').realm || null; } catch (e) { realm = null; } const el = document.getElementById('rw-firstend'); return Object.assign({}, s, { lvl: window.__mm.arena.save.level, seen: realm ? realm.firstEndSeen : undefined, shown: !!el && !el.hidden }); });
async function open(browser, url, level) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await blockDb(ctx); await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  if (level) await ctx.addInitScript((lv) => { if (!sessionStorage.cyc11Seed) { sessionStorage.cyc11Seed = '1'; localStorage.setItem('pixeltown-save-v1', JSON.stringify({ realm: { level: lv } })); } }, level);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: LS.budget(40000) });
  await page.evaluate(() => { const a = window.__mm.arena; a.player.iframes = 1e9; a.enemies.forEach((e) => { e.active = false; }); });
  return { ctx, page, db, errors };
}
// hold one frozen enemy `d` px from the hero (as cyc10-s-first-end does); release with release()
const hold = (page, d) => page.evaluate((d) => { const a = window.__mm.arena; const e = a.enemies.find((x) => !x.active) || a.enemies[0]; window.__feHold = e; e.active = true; e.hp = e.maxHp = 1e9; e.speed = 0; e.spd = 0; clearInterval(window.__feT); window.__feT = setInterval(() => { if (window.__feHold) { window.__feHold.active = true; window.__feHold.x = a.player.x + d; window.__feHold.y = a.player.y; window.__feHold.fireT = 99; } }, 16); }, d);
const release = (page) => page.evaluate(() => { clearInterval(window.__feT); if (window.__feHold) { window.__feHold.active = false; window.__feHold = null; } window.__mm.arena.enemies.forEach((e) => { e.active = false; }); });
const waitFor = (page, fn, ms) => page.waitForFunction(fn, null, { timeout: LS.budget(ms) }).then(() => true).catch(() => false);

(async () => {
  const browser = await chromium.launch();
  // ---- 1) the level gate ----
  for (const [lv, want] of [[5, 1], [6, 0], [1, 1]]) {
    const s = await open(browser, URL0 + '&fesec=9999', lv); const st = await ST(s.page);
    check(`Lv ${lv} at the first world load: first-session flag ok = ${want} (limit ${st.lv})`, st.lvl === lv && st.ok === want, JSON.stringify(st));
    check(`Lv ${lv}: no page errors, db.attempts() === 0`, s.errors.length === 0 && s.db.attempts() === 0, s.errors.join('|') + ' db=' + s.db.attempts());
    await s.ctx.close();
  }
  // ---- 2) closed by the world within 6 s: it comes back; readable for 6 s: it does not ----
  {
    const s = await open(browser, URL0 + '&fesec=3'); const { page } = s;
    const o1 = await waitFor(page, () => window.__mm.world.firstEnd.state().open, 15000);
    const a1 = await ST(page);
    check('quiet start: the card opens once the clock is due (first show), flag written', o1 && a1.shown && a1.seen === 1 && a1.reN === 0, JSON.stringify(a1));
    await hold(page, 200); // an enemy within 300 px right away
    const c1 = await waitFor(page, () => !window.__mm.world.firstEnd.state().open, 6000);
    const b1 = await ST(page);
    check('an enemy within 300 px closes it after under 6 s (why = danger) but it stays armed for a retry; the save flag is kept', c1 && !b1.shown && b1.why === 'danger' && b1.re === true && b1.reN === 1 && b1.vis < 6 && b1.seen === 1, JSON.stringify(b1));
    await page.waitForTimeout(2500);
    const b2 = await ST(page);
    check('while the enemy stays near it does not reopen (quiet gate)', !b2.shown && b2.re === true, JSON.stringify(b2));
    await release(page);
    const o2 = await waitFor(page, () => window.__mm.world.firstEnd.state().open, 25000);
    const a2 = await ST(page);
    check('quiet again (after 10 game seconds): the card shows a second time', o2 && a2.shown && a2.re === false && a2.reN === 1, JSON.stringify(a2));
    await page.waitForTimeout(LS.budget(7200)); // read for more than 6 s
    const a3 = await ST(page);
    check('it stays up while nothing comes near, and was visible 6 s or more', a3.shown && a3.vis >= 6, JSON.stringify(a3));
    await hold(page, 200);
    const c3 = await waitFor(page, () => !window.__mm.world.firstEnd.state().open, 6000);
    const b3 = await ST(page);
    check('closed by danger after it was readable for 6 s: no further retry (re = false, reN stays 1)', c3 && b3.why === 'danger' && b3.re === false && b3.reN === 1, JSON.stringify(b3));
    await release(page); await page.waitForTimeout(LS.budget(3000));
    const b4 = await ST(page);
    check('and it does not come back later in this visit', !b4.shown && b4.done, JSON.stringify(b4));
    check('no page errors, db.attempts() === 0', s.errors.length === 0 && s.db.attempts() === 0, s.errors.join('|') + ' db=' + s.db.attempts());
    await s.ctx.close();
  }
  // ---- 3) a card the player closes is never repeated ----
  {
    const s = await open(browser, URL0 + '&fesec=3'); const { page } = s;
    await waitFor(page, () => window.__mm.world.firstEnd.state().open, 15000); await page.waitForTimeout(700);
    await page.click('#rw-fe-later'); await page.waitForTimeout(300);
    await hold(page, 200); await page.waitForTimeout(500); await release(page);
    await page.waitForTimeout(LS.budget(14000));
    const c = await ST(page);
    check('"Not now" closes it for the visit: no retry, nothing reopens', !c.shown && c.why === 'later' && c.re === false && c.reN === 0, JSON.stringify(c));
    check('no page errors, db.attempts() === 0', s.errors.length === 0 && s.db.attempts() === 0, s.errors.join('|') + ' db=' + s.db.attempts());
    await s.ctx.close();
  }
  await browser.close();
  done();
})();
