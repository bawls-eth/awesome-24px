// Bug bash (bb-bugs): field fits the window, MMChip cues, MMInput keys, pause, Settings, minikit card, key-mash guard.
// Run: NODE_PATH=$(npm root -g) BASE=http://localhost:8440/game/index.html node game/tests/bugs-bb.test.js
const { chromium } = require('playwright');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = ORIGIN + '/game/games/festival/bugs.html?test=1';
async function open(browser, opts, pre) {
  const ctx = await browser.newContext(opts); const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  if (pre) await page.addInitScript(pre);
  await page.goto(URL); await page.waitForFunction(() => window.__bugs);
  return { ctx, page, errors };
}
(async () => {
  const browser = await chromium.launch();
  const d = await open(browser, { viewport: { width: 1280, height: 720 } });
  const p = d.page;
  await p.evaluate(() => { localStorage.setItem('pixeltown-bugs-hint-v1', '1'); window.__bugs.start('meadow', { seed: 'bb', empty: true }); });
  check('desktop 1280x720: whole field is inside the viewport', await p.evaluate(() => { const r = document.getElementById('game').getBoundingClientRect(); return r.bottom <= innerHeight && r.width > 300; }));

  // cues
  await p.evaluate(() => { const B = window.__bugs; B.spawn('ladybug', 10, 7); B.setPlayer(10, 7, true); B.swing(); });
  check('catch plays the catch cue', await p.evaluate(() => window.__bugs.cues.includes('catch')));
  await p.evaluate(() => { const B = window.__bugs; B.step(0.4); B.spawn('ladybug', 10, 7); B.swing(); });
  check('second catch in a chain plays combo2', await p.evaluate(() => window.__bugs.cues.includes('combo2')));
  await p.evaluate(() => { window.__bugs.step(0.4); window.__bugs.swing(); });
  check('empty swing plays miss', await p.evaluate(() => window.__bugs.cues.includes('miss')));

  // pause: Esc / P, time frozen, swing blocked
  await p.keyboard.press('Escape');
  check('Esc pauses', await p.evaluate(() => window.__bugs.paused === true));
  check('paused run does not advance or swing', await p.evaluate(() => { const B = window.__bugs, t = B.run.time; B.step(5); return B.run.time === t && B.swing().swung === false; }));
  await p.keyboard.press('KeyP');
  check('P resumes', await p.evaluate(() => window.__bugs.paused === false));

  // Enter swings (MMInput alias)
  await p.evaluate(() => { const B = window.__bugs; B.step(1); B.spawn('cricket', B.run.player.x + 0.3, B.run.player.y); });
  await p.keyboard.press('Enter');
  check('Enter swings like Space', await p.evaluate(() => window.__bugs.run.caughtTypes.includes('cricket')));

  // result card is the shared minikit
  await p.evaluate(() => window.__bugs.step(95));
  check('summary uses the minikit card', await p.evaluate(() => !!document.querySelector('#overlay .mk-card #again') && !!document.querySelector('#overlay #sum-actions #replay') && window.__bugs.mode === 'summary'));
  check('a real score is not "Tied your best"', await p.evaluate(() => !/Tied/.test(document.getElementById('sum-chase').textContent)));

  // Enter on Replay seed replays the seed (not a fresh random run)
  await p.evaluate(() => { document.getElementById('replay').focus(); });
  await p.keyboard.press('Enter');
  check('Enter on Replay seed replays that seed', await p.evaluate(() => window.__bugs.mode === 'play' && window.__bugs.seed === 'bb'));

  // key-mash guard: a keyboard-style click right after the timer ends is ignored; a real tap works
  await p.evaluate(() => { window.__bugs.setGuard(450); window.__bugs.step(95); });
  await p.evaluate(() => document.getElementById('again').click());
  check('keyboard-style click right after the end is ignored', await p.evaluate(() => window.__bugs.mode === 'summary'));
  check('a pointer click on Play again still works at once', await p.evaluate(() => { document.getElementById('again').dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })); return window.__bugs.mode === 'play'; }));
  check('no console errors (desktop)', d.errors.length === 0, d.errors.join('|'));
  await d.ctx.close();

  // first-run hint is dismissed by the first key (keyboard-only)
  const k = await open(browser, { viewport: { width: 1000, height: 700 } });
  await k.page.evaluate(() => window.__bugs.start('meadow', { seed: 'h', empty: true }));
  check('hint visible on a first run', await k.page.evaluate(() => window.__bugs.hintVisible));
  await k.page.keyboard.press('ArrowRight');
  check('a movement key dismisses the hint', await k.page.evaluate(() => !window.__bugs.hintVisible && localStorage.getItem('pixeltown-bugs-hint-v1') === '1'));
  await k.ctx.close();

  // Settings entry, 150% text, low gfx
  const s = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  check('menu has a Settings button that opens the shared panel', await s.page.evaluate(() => { const b = document.getElementById('open-settings'); if (!b) return false; b.click(); return window.__bugs.settings.isOpen(); }));
  await s.page.evaluate(() => window.__bugs.settings.close());
  await s.page.evaluate(() => { localStorage.setItem('pixeltown-access-v1', JSON.stringify({ v: 1, hudScale: 1.5, lowGfx: true })); });
  await s.page.reload(); await s.page.waitForFunction(() => window.__bugs);
  check('150% text + low gfx: no horizontal scroll', await s.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  check('low gfx tier picked up', await s.page.evaluate(() => window.__bugs.gfx.low === true));
  await s.ctx.close();

  // landscape phone: field and controls are all on screen
  const l = await open(browser, { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  await l.page.evaluate(() => { localStorage.setItem('pixeltown-bugs-hint-v1', '1'); window.__bugs.start('meadow', { seed: 'l', empty: true }); });
  check('landscape: field and touch buttons inside the viewport', await l.page.evaluate(() => ['game', 'btn-swing', 'joy'].every((id) => { const r = document.getElementById(id).getBoundingClientRect(); return r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1 && r.top >= 0; })));
  check('landscape: controls do not cover the field', await l.page.evaluate(() => { const g = document.getElementById('game').getBoundingClientRect(); return ['btn-swing', 'btn-sneak', 'joy'].every((id) => { const r = document.getElementById(id).getBoundingClientRect(); return r.right <= g.left + 4 || r.left >= g.right - 4; }); }));
  await l.ctx.close();

  await browser.close();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exitCode = failed ? 1 : 0;
})();
