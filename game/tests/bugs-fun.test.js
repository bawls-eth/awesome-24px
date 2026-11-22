// Bug Safari fun pass (FUN1): near-miss feedback, combo milestone banner, last-10-seconds timer, personal bests
// (own additive key pixeltown-bugs-pb-v1), and a summary that leads with one-tap Play again (also Enter / R).
// Phone 390x844 + desktop, DB blocked, standalone. Serve the repo root first:  python3 -m http.server 9354 &
// Run: NODE_PATH=$(npm root -g) BASE=http://localhost:9354/game/index.html node game/tests/bugs-fun.test.js
const { chromium } = require('playwright');
const { blockDb } = require('./helpers');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const ORIGIN = (process.env.BASE || 'http://localhost:9354/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL_ = ORIGIN + '/game/games/festival/bugs.html?test=1';

const errors = [], dbs = [];
async function open(browser, opts) {
  const ctx = await browser.newContext(opts);
  dbs.push(await blockDb(ctx));
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript(() => { try { localStorage.setItem('pixeltown-bugs-hint-v1', '1'); } catch (e) { /* ignore */ } });
  await page.goto(URL_);
  await page.waitForFunction(() => window.__bugs);
  return { ctx, page };
}

(async () => {
  const browser = await chromium.launch();

  // ---- phone ----
  const ph = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p = ph.page;

  // near miss: a bug just outside net reach gets an honest "So close!", a far bug or a catch does not
  const nm = await p.evaluate(() => {
    const B = window.__bugs; B.start('meadow', { seed: 'fun-nm', empty: true });
    B.setPlayer(5, 7, true);
    B.spawn('beetle', 6.8, 7); // 1.8 tiles: outside catch reach (1.2), inside near-miss reach
    const r1 = B.swing(); const afterNear = B.nearMisses; const pops = B.popups.slice();
    B.step(0.5);
    B.spawn('beetle', 15, 2); B.setPlayer(5, 12, true); // nothing near now except a far bug
    const r2 = B.swing(); const afterFar = B.nearMisses;
    return { caught1: r1.caught.length, afterNear, pops, swung2: r2.swung, afterFar };
  });
  check('a swing that just misses a visible bug counts a near miss', nm.caught1 === 0 && nm.afterNear === 1, JSON.stringify(nm));
  check('the near miss shows a "So close!" popup', nm.pops.indexOf('So close!') >= 0, JSON.stringify(nm.pops));
  check('a swing with no bug nearby is not a near miss', nm.swung2 === true && nm.afterFar === 1, JSON.stringify(nm));

  // combo milestone banner at x3
  const cm = await p.evaluate(() => {
    const B = window.__bugs; B.start('meadow', { seed: 'fun-cm', empty: true });
    B.setPlayer(10, 7, true);
    const seen = [];
    for (let i = 0; i < 3; i++) { B.spawn('ladybug', 10.3, 7); B.swing(); seen.push(B.banner); B.step(0.4); }
    const combo = B.run.combo;
    B.step(2.5); // the combo window (2 s) runs out
    return { seen, combo, ended: B.banner, after: B.run.combo };
  });
  check('no banner before the third chained catch', cm.seen[0] === null && cm.seen[1] === null, JSON.stringify(cm));
  check('third chained catch announces a combo banner', typeof cm.seen[2] === 'string' && /^Combo x1\.44!$/.test(cm.seen[2]), JSON.stringify(cm));
  check('combo is 3 after three chained catches', cm.combo === 3, JSON.stringify(cm));
  check('a 3+ chain that runs out says so plainly', cm.after === 0 && cm.ended === 'Chain of 3 ended', JSON.stringify(cm));

  // last 10 seconds: timer gets the hurry class, not before
  const hu = await p.evaluate(() => {
    const B = window.__bugs; B.setPlayer(4, 4, true); B.spawn('beetle', 5.8, 4); B.swing(); // one near miss in this run
    B.step(70); B.render();
    const before = document.getElementById('hud-time').classList.contains('hurry'), warnedBefore = B.warned;
    B.step(11); B.render();
    const t = document.getElementById('hud-time');
    return { before, warnedBefore, warned: B.warned, after: t.classList.contains('hurry'), text: t.textContent, mode: B.mode };
  });
  check('timer is calm with more than 10 s left', hu.before === false, JSON.stringify(hu));
  check('one soft cue at 10 s left, not before', hu.warnedBefore === false && hu.warned === true, JSON.stringify(hu));
  check('timer warms up in the last 10 s', hu.after === true && /^\d+s$/.test(hu.text) && parseInt(hu.text, 10) <= 10, JSON.stringify(hu));

  // summary: Play again sits right under the result, is focused, big enough, and the chase line is honest
  await p.evaluate(() => window.__bugs.step(15));
  const sm = await p.evaluate(() => {
    const B = window.__bugs, a = document.getElementById('again'), r = a.getBoundingClientRect();
    const kids = [...document.getElementById('overlay').children].map((e) => e.id || e.tagName);
    return { mode: B.mode, focused: document.activeElement === a, w: r.width, h: r.height, inView: r.bottom <= innerHeight, idxActions: kids.indexOf('sum-actions'), idxCounts: kids.indexOf('sum-counts'),
      chase: document.getElementById('sum-chase').textContent, pb: B.pb, near: document.getElementById('sum-near').textContent, cbest: document.getElementById('sum-combo-best').textContent };
  });
  check('run ends in the summary', sm.mode === 'summary', sm.mode);
  check('Play again is focused for a quick restart', sm.focused, JSON.stringify(sm));
  check('Play again is a phone-sized target (44 px+) and on screen', sm.w >= 44 && sm.h >= 44 && sm.inView, JSON.stringify(sm));
  check('the actions come before the detailed counts', sm.idxActions >= 0 && sm.idxActions < sm.idxCounts, JSON.stringify(sm));
  check('first score says so', sm.chase === 'First score on the board!', sm.chase);
  check('personal best combo saved under its own key', sm.pb.combo.meadow === 3 && sm.pb.runs === 1 && sm.cbest === 'Arena best combo: 3', JSON.stringify(sm));
  const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('pixeltown-bugs-pb-v1')));
  check('pb key is a small additive object', stored && stored.v === 1 && stored.combo.meadow === 3 && stored.runs === 1, JSON.stringify(stored));
  const oldKeys = await p.evaluate(() => ({ save: JSON.parse(localStorage.getItem('pixeltown-bugs-v1')), medals: JSON.parse(localStorage.getItem('pixeltown-medals-bugs-v1')) }));
  check('existing save and medal keys keep their shape', oldKeys.save.v === 1 && oldKeys.save.best.meadow > 0 && oldKeys.medals.v === 1 && Array.isArray(oldKeys.medals.m), JSON.stringify(oldKeys));
  check('near misses listed in the summary', /^Near misses: 1/.test(sm.near), sm.near);

  // one tap on Play again restarts the same arena
  await p.tap('#again');
  const re = await p.evaluate(() => ({ mode: window.__bugs.mode, arena: document.getElementById('hud-arena').textContent, best: document.getElementById('hud-best').textContent, time: window.__bugs.run.time }));
  check('one tap on Play again restarts the same arena', re.mode === 'play' && re.arena === 'Meadow' && re.time === 0, JSON.stringify(re));
  check('the HUD shows the best to chase', /^Best \d+$/.test(re.best) && re.best !== 'Best 0', re.best);

  // passing the best mid-run lights the HUD up (the saved best only changes at the end)
  const ah = await p.evaluate(() => { const B = window.__bugs, before = document.getElementById('hud-best').textContent; B.setPlayer(10, 7, true); for (let i = 0; i < 6; i++) { B.spawn('beetle', 10.3, 7); B.swing(); B.step(0.4); } B.render(); const hb = document.getElementById('hud-best'); const r = { before, after: hb.textContent, cls: hb.classList.contains('ahead'), saved: B.save.best.meadow }; B.start('meadow', { seed: 'fun-again', empty: true }); return r; });
  check('passing the best mid-run shows New best! without saving early', /^Best \d+$/.test(ah.before) && ah.after === 'New best!' && ah.cls && ah.before === 'Best ' + ah.saved, JSON.stringify(ah));

  // a worse second run: the chase line says how far off the best it was
  const second = await p.evaluate(() => { const B = window.__bugs; B.step(91); return { chase: document.getElementById('sum-chase').textContent, best: B.summary.best }; });
  check('a lower score shows the points still needed', /^\d+ points to beat your best\.$/.test(second.chase) && second.chase.startsWith(String(second.best)), JSON.stringify(second));

  // corrupt pb key never breaks the page
  await p.evaluate(() => localStorage.setItem('pixeltown-bugs-pb-v1', '{"v":1,"combo":{"meadow":"lots","nope":5},"runs":-3}'));
  await p.reload(); await p.waitForFunction(() => window.__bugs);
  const cl = await p.evaluate(() => window.__bugs.pb);
  check('a bad pb key is cleaned (unknown arenas and bad numbers dropped)', cl.runs === 0 && Object.keys(cl.combo).length === 0, JSON.stringify(cl));
  // arena cards name the next star target instead of a bare threshold list
  await p.evaluate(() => window.__bugs.menu());
  const mc = await p.evaluate(() => { const c = document.querySelector('#overlay .card[data-arena="meadow"] small'); const o = document.querySelector('#overlay .card[data-arena="orchard"] small'); return { m: c.textContent, o: o.textContent, px: parseFloat(getComputedStyle(c).fontSize) }; });
  const meadowStars = await p.evaluate(() => window.__bugs.save.stars.meadow);
  check('open arena card shows the next star target', meadowStars < 3 ? /^Best \d+ {2}\| {2}next star at \d+$/.test(mc.m) : /all 3 stars$/.test(mc.m), JSON.stringify(mc));
  check('locked arena card still says what it needs', /^Needs \d+ stars$/.test(mc.o) || /next star at|all 3 stars/.test(mc.o), JSON.stringify(mc));
  check('card hint text is 12 px+', mc.px >= 12, JSON.stringify(mc));

  await ph.ctx.close();

  // ---- desktop: keyboard restart ----
  const dk = await open(browser, { viewport: { width: 1200, height: 800 } });
  const d = dk.page;
  await d.evaluate(() => { const B = window.__bugs; B.start('meadow', { seed: 'fun-k', empty: true }); B.step(91); });
  check('desktop run ends in the summary', await d.evaluate(() => window.__bugs.mode === 'summary'));
  await d.keyboard.press('KeyR');
  check('R plays again from the summary', await d.evaluate(() => window.__bugs.mode === 'play' && window.__bugs.run.time === 0));
  await d.evaluate(() => window.__bugs.step(91));
  await d.keyboard.press('Enter');
  check('Enter plays again from the summary (once, not twice)', await d.evaluate(() => window.__bugs.mode === 'play' && window.__bugs.run.time === 0 && window.__bugs.pb.runs === 2));
  await d.evaluate(() => window.__bugs.step(91));
  await d.focus('#to-menu'); await d.keyboard.press('Enter');
  check('Enter on Arenas still opens the arena list', await d.evaluate(() => window.__bugs.mode === 'menu' && !!document.querySelector('#overlay .grid')));
  await dk.ctx.close();

  // reduced motion: the banner still tells you, but nothing shakes
  const rm = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  const rr = await rm.page.evaluate(() => { const B = window.__bugs; B.start('meadow', { seed: 'fun-rm', empty: true }); B.setPlayer(10, 7, true); let sh = 0; for (let i = 0; i < 3; i++) { B.spawn('ladybug', 10.3, 7); B.swing(); sh = Math.max(sh, B.shake); B.step(0.4); } return { reduced: B.reduced, sh, banner: B.banner }; });
  check('reduced motion: milestone banner shows without any shake', rr.reduced === true && rr.sh === 0 && /^Combo x/.test(rr.banner || ''), JSON.stringify(rr));
  await rm.ctx.close();

  check('console clean', errors.length === 0, JSON.stringify(errors));
  check('zero DB requests', dbs.every((x) => x.attempts() === 0), JSON.stringify(dbs.map((x) => x.attempts())));
  await browser.close();
  console.log(failed ? failed + ' FAILED' : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
