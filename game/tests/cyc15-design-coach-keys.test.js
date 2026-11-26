// Cycle 15 D (new-player audit, Realm first run): the desktop coach card's ability step said "Press 1, 2, 3 or 4 to use an ability",
// but the Realm binds the abilities to Q E R F (RM_ABILITIES) and no handler reads the digit keys, so a keyboard first-timer followed
// the card and nothing happened. The card must name keys that really cast.
//  1 desktop 1280x720, fresh profile with the first three steps done: the coach card (step 4) names Q, E, R and F and not 1-4.
//  2 pressing the digit keys 1 to 4 casts nothing (the card must not point there) and the card stays on the ability step.
//  3 pressing a key the card names (Q, the Dash, unlocked at Lv 1) casts and advances the card to the portal step.
//  4 phone 390x844: the touch text still names no key and still says which button.
//  5 0 DB requests, 0 page errors. Firebase blocked (blockDb); nothing is written to any DB.
//  6 the last step (Nexus) said "Press Esc, then choose Nexus" / "Tap the Menu button, then Nexus", but the pause menu has no Nexus entry
//    (the Nexus opens from the Visit the Nexus button beside the swirl at the spawn). The card must say that, and doing it must finish the step.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc15-design-coach-keys.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/mad-maze/index.html?mode=world&seed=77&test=1&tutorial=1';

async function open(browser, ctxOpts, done3) {
  const ctx = await browser.newContext(ctxOpts);
  const db = await blockDb(ctx);
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  await ctx.addInitScript((d) => {
    if (sessionStorage.c15) return; sessionStorage.c15 = '1'; localStorage.clear();
    if (d) localStorage.setItem('pixeltown-realm-tutorial-v1', JSON.stringify({ v: 1, s: { done: d === 'nexus' ? ['move', 'shoot', 'bag', 'ability', 'portal'] : ['move', 'shoot', 'bag'], finished: false, rewarded: false }, p0: 0 }));
  }, done3);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(PAGE);
  await page.waitForFunction(() => { const m = window.__mm; return !!(m && m.world && m.arena.active && m.arena.state === 'play'); }, null, { timeout: 25000 }).catch(() => {});
  await page.waitForSelector('#realm-hero-close', { timeout: 15000 }).then(() => page.click('#realm-hero-close')).catch(() => {});
  await page.waitForTimeout(600);
  return { ctx, page, errors, db };
}
const coach = (page) => page.evaluate(() => { const t = document.querySelector('.mm-coach-text'); const r = document.querySelector('#mm-coach'); return { text: t ? t.textContent.trim() : '', step: r ? r.dataset.step || '' : '', hidden: !r || r.classList.contains('hidden') }; });

(async () => {
  const browser = await chromium.launch();
  const d = await open(browser, { viewport: { width: 1280, height: 720 } }, true);
  let c = await coach(d.page);
  check('desktop: the coach card is on the ability step', c.step === 'ability' && !c.hidden, JSON.stringify(c));
  check('desktop: the card names Q, E, R and F', /Q, E, R/.test(c.text) && /\bF\b/.test(c.text), c.text);
  check('desktop: the card does not name the digit keys', !/\b1, 2, 3\b|\b1-4\b/.test(c.text), c.text);
  await d.page.mouse.move(640, 300);
  for (const k of ['1', '2', '3', '4']) { await d.page.keyboard.press(k); await d.page.waitForTimeout(80); }
  const after = await d.page.evaluate(() => ({ cd: window.__mm.arena.abilityCd.slice(), overdrive: window.__mm.arena.overdriveT, shield: window.__mm.arena.shield.t }));
  c = await coach(d.page);
  check('desktop: digit keys 1-4 cast nothing (every cooldown still 0) and the card stays on the ability step', after.cd.every((v) => v === 0) && c.step === 'ability', JSON.stringify({ after, step: c.step }));
  await d.page.keyboard.press('q');
  await d.page.waitForTimeout(500);
  const afterQ = await d.page.evaluate(() => window.__mm.arena.abilityCd[0]);
  c = await coach(d.page);
  check('desktop: pressing Q (named on the card) casts the Dash and the card moves on to the portal step', afterQ > 0 && c.step === 'portal', JSON.stringify({ afterQ, step: c.step }));
  await d.page.screenshot({ path: __dirname + '/../design/beta/img/cyc15-design-coach-keys-1280x720.jpg' });
  check('desktop: no page errors and 0 DB attempts', d.errors.length === 0 && d.db.attempts() === 0, d.errors.join(' | ') + ' db=' + d.db.attempts());
  await d.ctx.close();

  // item 6: the Nexus step
  const n = await open(browser, { viewport: { width: 1280, height: 720 } }, 'nexus');
  c = await coach(n.page);
  check('nexus step: the card is on the nexus step', c.step === 'nexus', JSON.stringify(c));
  check('nexus step: the card no longer sends the player to a Menu / Esc entry that does not exist', !/\bMenu\b|\bEsc\b/i.test(c.text) && /Nexus swirl/.test(c.text) && /Enter/.test(c.text), c.text);
  await n.page.keyboard.press('Escape'); await n.page.waitForTimeout(400);
  const menuHasNexus = await n.page.evaluate(() => [...document.querySelectorAll('#realm-overlay button')].filter((e) => e.offsetParent && /nexus/i.test(e.textContent)).length);
  check('nexus step: the pause menu really has no Nexus button (so the old wording was a dead end)', menuHasNexus === 0, String(menuHasNexus));
  await n.page.keyboard.press('Escape'); await n.page.waitForTimeout(300);
  await n.page.evaluate(() => { const m = window.__mm; const s = m.world.nexus.site; m.arena.player.x = s.x; m.arena.player.y = s.y; });
  await n.page.waitForSelector('#rw-nexus-go:not(.hidden)', { timeout: 8000 }).catch(() => {});
  const btnTxt = await n.page.evaluate(() => { const b = document.getElementById('rw-nexus-go'); return b && !b.classList.contains('hidden') ? b.textContent : ''; });
  check('nexus step: beside the swirl the "Visit the Nexus" button the card names appears', /Visit the Nexus/.test(btnTxt), btnTxt);
  await n.page.click('#rw-nexus-go').catch(() => {});
  await n.page.waitForTimeout(600);
  c = await coach(n.page);
  check('nexus step: doing what the card says finishes the tutorial (card gone)', c.hidden, JSON.stringify(c));
  check('nexus step: no page errors and 0 DB attempts', n.errors.length === 0 && n.db.attempts() === 0, n.errors.join(' | ') + ' db=' + n.db.attempts());
  await n.ctx.close();

  const m = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, true);
  c = await coach(m.page);
  check('phone: touch text still says which button and names no key', /first ability button/i.test(c.text) && !/\b[QERF]\b|\b1, 2\b/.test(c.text), c.text);
  await m.page.screenshot({ path: __dirname + '/../design/beta/img/cyc15-design-coach-keys-390x844.jpg' });
  check('phone: no page errors and 0 DB attempts', m.errors.length === 0 && m.db.attempts() === 0, m.errors.join(' | ') + ' db=' + m.db.attempts());
  await m.ctx.close();
  await browser.close();
  done();
})();
