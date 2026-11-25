// Cycle 8 S, ID-09 forgiving Town day count, the Town wiring (spec: IDEAS.md "ID-09 / ID-18 implementation specs (D, cycle 7)"; the pure rule
// MMGameDay.visitStep is cyc7-s-visit-days.test.js, the old-key clock cases are town-streak-clock.test.js). Real Town page, OFFLINE stub:
//  - the Town page loads mm-gameday.js (it did not before), the badge reads "Days in town N" (title "Days you visited the village");
//  - a save whose lastVisitDate is 5 days ago (visitDays 6): the join shows "Welcome back! Day 7 in the village. +5 ⭐", the badge reads 7;
//  - a reload on the same day pays nothing and leaves 7;
//  - Backup round trip (bundle -> remove the save -> restore) keeps visitDays / lastVisitDate / sellDays / lastSellDay;
//  - SAVE-KEYS.md names the four keys; no shown string says streak / missed / lost / don't;
//  - the badge fits at 195x422 (no horizontal scroll, the text on one line).
// Literal db.attempts() === 0. Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc8-s-town-days.test.js
const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
const { check, done, offlineStub, exposeGame, joinOffline } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const keysMd = fs.readFileSync(path.join(__dirname, '..', 'design', 'SAVE-KEYS.md'), 'utf8');
check('index.html loads shared/mm-gameday.js before main.js', /shared\/mm-gameday\.js[^]*main\.js\?/.test(html));
check('the badge markup reads "Days in town" with the title "Days you visited the village"', /<div id="streak-badge" title="Days you visited the village">Days in town <b id="streak-count">/.test(html));
const shown = (main.match(/Welcome back![^`]*`|sell day \$\{[^`]*`|Sell at the shop on 3 different days|Days in town/g) || []);
check('the new player-facing strings exist and none says streak / missed / lost / don\'t / keep it up / expires', shown.length >= 4 && !shown.some((t) => /streak|missed|lost|don't|keep it up|expire/i.test(t)), JSON.stringify(shown));
const line = keysMd.split('\n').find((l) => l.indexOf('`pixeltown-save-v1`') === 2) || '';
check('SAVE-KEYS.md pixeltown-save-v1 line names visitDays, lastVisitDate, sellDays, lastSellDay and bounty', ['visitDays', 'lastVisitDate', 'sellDays', 'lastSellDay', 'bounty'].every((k) => line.indexOf('`' + k + '`') >= 0));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await offlineStub(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await exposeGame(page);
  await page.goto(BASE);
  const ago = await page.evaluate(() => new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10));
  await page.evaluate((d) => localStorage.setItem('pixeltown-save-v1', JSON.stringify({ name: 'ADMINdays', visitDays: 6, lastVisitDate: d, loginStreak: 2, lastLoginDate: d, sellDays: 3, lastSellDay: d })), ago);
  await page.reload();
  // record every floating text from the very first frame of the scene (the welcome is shown during create)
  await joinOffline(page, 'ADMINdays');
  const a = await page.evaluate(() => { const s = window.__g.scene.getScene('Town'); const sv = loadSave(); return { gd: typeof MMGameDay === 'object' && typeof MMGameDay.visitStep === 'function', toast: s.welcomeToast || '', days: sv.visitDays, date: sv.lastVisitDate, today: MMGameDay.utcKey(), badge: document.getElementById('streak-badge').textContent.trim(), title: document.getElementById('streak-badge').title, score: s.localScore }; });
  check('the Town page has MMGameDay.visitStep', a.gd, JSON.stringify(a));
  check('5 days away (visitDays 6): "Welcome back! Day 7 in the village. +5 ⭐", visitDays 7, date today', a.toast === '👋 Welcome back! Day 7 in the village. +5 ⭐' && a.days === 7 && a.date === a.today, JSON.stringify(a));
  check('the badge reads "Days in town 7" (the old streak would have shown 1)', a.badge === 'Days in town 7' && a.title === 'Days you visited the village', JSON.stringify(a));
  await page.reload();
  await joinOffline(page, 'ADMINdays');
  const b = await page.evaluate(() => { const s = window.__g.scene.getScene('Town'); return { toast: s.welcomeToast || '', days: loadSave().visitDays, badge: document.getElementById('streak-badge').textContent.trim() }; });
  check('a reload the same day: no second payout (no welcome), still 7', b.toast === '' && b.days === 7 && b.badge === 'Days in town 7', JSON.stringify(b));
  const bk = await page.evaluate(async () => {
    const M = await loadBackupModules(); if (!M) return { ok: false };
    const K = ['visitDays', 'lastVisitDate', 'sellDays', 'lastSellDay']; const pick = (o) => JSON.stringify(K.map((k) => o[k]));
    const before = pick(loadSave()); const bun = M.bundle(localStorage); const inB = pick(JSON.parse(bun.keys['pixeltown-save-v1']));
    localStorage.removeItem('pixeltown-save-v1'); const r = M.restore(localStorage, bun);
    return { ok: r.ok, before, inB, after: pick(loadSave()), fields: K.every((k) => TOWN_SAVE_FIELDS.indexOf(k) >= 0) };
  });
  check('Backup round trip keeps the four day-count fields (and they are in TOWN_SAVE_FIELDS)', bk.ok && bk.before === bk.inB && bk.before === bk.after && bk.fields && bk.before.indexOf('null') < 0, JSON.stringify(bk));
  // 195x422: the badge (Stats tab) fits on one line, no horizontal scroll
  await page.setViewportSize({ width: 195, height: 422 });
  await page.waitForTimeout(300);
  await page.evaluate(() => { const x = document.querySelector('#whats-new-close, .whats-new-close'); if (x) x.click(); });
  const tog = await page.$('#panel-toggle');
  if (tog && await tog.isVisible() && !(await page.isVisible('#town-tab-stats'))) await tog.click().catch(() => null);
  await page.waitForTimeout(250);
  await page.click('#town-tab-stats').catch(() => null);
  await page.waitForTimeout(200);
  const m = await page.evaluate(() => { const el = document.getElementById('streak-badge'); const r = el.getBoundingClientRect(); const lh = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.4; const cs = getComputedStyle(el); return { vis: r.width > 0, w: r.width, h: el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom), lh, right: r.right, sw: el.scrollWidth, cw: el.clientWidth, hs: document.documentElement.scrollWidth > innerWidth + 1, vw: innerWidth }; });
  check('195x422: no horizontal page scroll', !m.hs, JSON.stringify(m));
  check('195x422: the badge (Menu > Stats) is shown on one line, not clipped, inside the screen', m.vis && (m.h < 2 * m.lh && m.sw <= m.cw + 1 && m.right <= m.vw + 0.5), JSON.stringify(m));
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + '/cyc8-systems-days-195x422.jpg', type: 'jpeg', quality: 60 }).catch(() => null);
  check('no page errors', errors.length === 0, errors.join(' | '));
  check('offline: no database request was attempted (literal 0)', db.attempts() === 0, JSON.stringify(db.http.concat(db.ws).slice(0, 3)));
  await browser.close();
  done();
})();
