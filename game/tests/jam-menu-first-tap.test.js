// Campfire Jam: one tap on the shared Menu mid-song opens "Where to?" and pauses the song (review 3 #6); closing the sheet leaves
// the song paused with a clear Resume. Real page (no ?test=1: the Menu pauses only a real-clock song), phone 390x844, DB blocked.
// Serve the repo root first:  python3 -m http.server 8440 &
// Run: NODE_PATH=$(npm root -g) BASE=http://localhost:8440/game/index.html node game/tests/jam-menu-first-tap.test.js
const { chromium } = require('playwright');
const { blockDb } = require('./helpers');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = ORIGIN + '/game/games/jam/index.html';
const KEY = 'pixeltown-jam-v1';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const db = await blockDb(ctx);
  const page = await ctx.newPage(); const errors = [], reqs = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', (r) => reqs.push(r.url()));
  await page.addInitScript((k) => { if (!sessionStorage.seeded) { sessionStorage.seeded = '1'; localStorage.setItem(k, JSON.stringify({ hint: true })); } }, KEY);
  await page.goto(URL);
  await page.waitForSelector('button[data-song="warm-embers"][data-tier="easy"]');
  await page.waitForFunction(() => window.MMNav && MMNav.mounted());

  const state = () => page.evaluate(() => {
    const ov = document.getElementById('overlay'), sh = document.getElementById('mm-nav-sheet');
    return { sheet: !!sh && !sh.hidden && MMNav.isOpen(), overlay: !ov.hidden, paused: /Paused/.test(ov.textContent) && !!document.getElementById('resume'),
      bar: parseFloat(document.getElementById('progress-bar').style.width) || 0, songs: !!document.querySelector('button[data-song]') && !ov.hidden };
  });
  const tapMenu = () => page.tap('#mm-nav-btn');

  // start a song for real (no test clock)
  await page.tap('button[data-song="warm-embers"][data-tier="easy"]');
  await page.waitForFunction(() => document.getElementById('overlay').hidden && parseFloat(document.getElementById('progress-bar').style.width) > 0, null, { timeout: 8000 });
  await page.waitForTimeout(400);
  const playing = await state();
  check('song is playing (overlay hidden, progress moving)', !playing.overlay && playing.bar > 0, JSON.stringify(playing));

  // ONE tap opens the sheet and pauses the song
  await tapMenu();
  await page.waitForTimeout(350); // past the page's MutationObserver tick that used to close the sheet
  const s1 = await state();
  check('one Menu tap opens "Where to?" mid-song (sheet visible, no second tap)', s1.sheet && !s1.overlay, JSON.stringify(s1));
  check('the sheet shows the place list and its title', await page.evaluate(() => /Where to/i.test(document.getElementById('mm-nav-sheet').textContent) && document.querySelectorAll('#mm-nav-sheet a[href]').length >= 5));
  await page.waitForTimeout(600);
  const s1b = await state();
  check('the song is paused while the sheet is open (progress frozen)', Math.abs(s1b.bar - s1.bar) < 0.05 && s1b.sheet, JSON.stringify([s1.bar, s1b.bar]));

  // Esc closes the sheet; the song stays paused with a clear, focused Resume
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  const s2 = await state();
  check('Esc closes the sheet and shows the Paused card with Resume', !s2.sheet && s2.overlay && s2.paused, JSON.stringify(s2));
  check('Resume has focus after closing the sheet', await page.evaluate(() => document.activeElement && document.activeElement.id === 'resume'));
  await page.waitForTimeout(500);
  check('still paused after the sheet closed (progress frozen)', Math.abs((await state()).bar - s2.bar) < 0.05);

  // Resume plays on
  await page.tap('#resume');
  await page.waitForTimeout(700);
  const s3 = await state();
  check('Resume hides the card and the song moves on', !s3.overlay && s3.bar > s2.bar, JSON.stringify([s2.bar, s3.bar]));

  // again: first tap opens; a second Menu tap (toggle) closes it -> Paused card; Quit to songs works
  await tapMenu();
  await page.waitForTimeout(350);
  const s4 = await state();
  check('second song pause: Menu opens on the first tap again', s4.sheet && !s4.overlay, JSON.stringify(s4));
  await page.evaluate(() => document.getElementById('mm-nav-backdrop').click());
  await page.waitForTimeout(250);
  const s5 = await state();
  check('closing by the backdrop also leaves a clear Resume', !s5.sheet && s5.overlay && s5.paused, JSON.stringify(s5));
  await page.tap('#quit');
  await page.waitForTimeout(250);
  check('Quit to songs returns to the song list', (await state()).songs);

  // Esc during play (no sheet) still pauses directly, as before
  await page.tap('button[data-song="warm-embers"][data-tier="easy"]');
  await page.waitForFunction(() => document.getElementById('overlay').hidden, null, { timeout: 8000 });
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const s6 = await state();
  check('Esc mid-song (no sheet) still shows the Paused card', s6.paused && !s6.sheet, JSON.stringify(s6));

  check('no horizontal scroll at 390', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  check('no Firebase / net.js requests (DB 0)', db.attempts() === 0 && !reqs.some((u) => /firebase|\/net\.js/i.test(u)), JSON.stringify(reqs.filter((u) => /firebase|net\.js/i.test(u))));
  check('no console errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(failed ? failed + ' FAILED' : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})();
