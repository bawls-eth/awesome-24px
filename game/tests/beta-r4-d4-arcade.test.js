// R4 D4 arcade UI P3s (standalone pages, database blocked, phone 390x844).
//  b09-08 Lantern Dash: the result card (stats, best, medals, share code) is in view after a crash, not below the fold
//  b09-13 Lantern Dash: back-to-back Perfect floats never overprint each other
//  b09-05 Stack Tower: back-to-back near-miss floats never overprint each other
//  b10-r2-10 Bug Safari: the summary leads with a large score line; the run facts are one labelled panel
//  b10-r2-07 Campfire Jam: the song progress bar is not left over the song list
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-r4-d4-arcade.test.js
const { chromium } = require('playwright');
const { check, done, offlineStub } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const ROOT = BASE.replace(/game\/index\.html.*$/, '');
const SHOTS = process.env.SHOTS || null;

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const mk = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await offlineStub(ctx);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(page.url() + ' pageerror: ' + e.message));
    return { ctx, page };
  };
  {
    const { ctx, page } = await mk();
    await page.goto(ROOT + 'game/games/dash/index.html?seed=night1');
    await page.waitForSelector('#play', { state: 'visible' });
    await page.tap('#play');
    // a long auto-jumped run: sample the float labels every 2 frames and look for overprinted pairs
    const r = await page.evaluate(() => {
      let worst = [], perfects = 0, samples = 0;
      for (let i = 0; i < 900 && __dash.run.state === 'play'; i++) {
        __dash.step(2, { lead: 26 });
        const bs = __dash.counts().floatBoxes; samples++;
        perfects = Math.max(perfects, __dash.run.perfects || 0);
        for (let a = 0; a < bs.length; a++) for (let b = a + 1; b < bs.length; b++) if (Math.abs(bs[a].y - bs[b].y) < 14 && Math.abs(bs[a].x - bs[b].x) < 40) worst.push([bs[a].text, bs[b].text, Math.round(bs[a].y), Math.round(bs[b].y)]);
      }
      return { worst: worst.slice(0, 5), n: worst.length, perfects, samples };
    });
    check('Dash: Perfect floats happened in the sampled run', r.perfects >= 3, JSON.stringify(r));
    check('Dash: no two float labels overprint at any sample', r.n === 0, JSON.stringify(r));
    // crash -> result card fully in view (top >= 0, bottom <= innerHeight) incl. the share code and Play again
    await page.evaluate(() => { if (__dash.run.state !== 'play') __dash.start('night1'); __dash.step(4000); });
    await page.waitForTimeout(400);
    const card = await page.evaluate(() => { const r = document.getElementById('result').getBoundingClientRect(); const a = document.getElementById('again').getBoundingClientRect(); const sh = document.querySelector('#result .mk-share'); const s = sh ? sh.getBoundingClientRect() : null; return { top: r.top, bottom: r.bottom, ih: innerHeight, again: a.top, share: s && s.bottom, state: __dash.run.state }; });
    check('Dash 390x844: after a crash the whole result card (stats ... share code, Play again) is on screen', card.state === 'over' && card.top >= 0 && card.bottom <= card.ih + 0.5 && card.again >= 0 && (card.share === null || card.share <= card.ih + 0.5), JSON.stringify(card));
    if (SHOTS) await page.screenshot({ path: SHOTS + '/r4-d4-dash-result.jpg', type: 'jpeg', quality: 60 });
    await page.tap('#again');
    await page.waitForTimeout(300);
    const view = await page.evaluate(() => { const r = document.getElementById('view').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, ih: innerHeight, st: __dash.run.state }; });
    check('Dash: Play again brings the board back into view', view.st === 'play' && view.top >= 0 && view.bottom <= view.ih + 0.5, JSON.stringify(view));
    await ctx.close();
  }
  {
    const { ctx, page } = await mk();
    await page.goto(ROOT + 'game/games/stack/index.html');
    await page.waitForSelector('#play', { state: 'visible' });
    await page.tap('#play');
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => {
      const seen = []; let n = 0; let maxF = 0;
      const offs = [8, 9, 10, 11, 12, 10, 9];
      for (const off of offs) {
        if (__stack.run.state !== 'play') break;
        __stack.align(off); __stack.drop();
        for (let k = 0; k < 18; k++) {
          __stack.step(1 / 30);
          const bs = __stack.counts().floatBoxes; maxF = Math.max(maxF, bs.length);
          for (let a = 0; a < bs.length; a++) for (let b = a + 1; b < bs.length; b++) if (Math.abs(bs[a].y - bs[b].y) < 14 && Math.abs(bs[a].x - bs[b].x) < 120) { n++; if (seen.length < 4) seen.push([bs[a].text, bs[b].text, Math.round(bs[a].y), Math.round(bs[b].y)]); }
        }
      }
      return { n, seen, maxF, floors: __stack.run.floors, state: __stack.run.state };
    });
    check('Stack: near-miss floats were shown during the sampled drops', r.maxF >= 1 && r.floors >= 3, JSON.stringify(r));
    check('Stack: back-to-back near-miss floats never overprint', r.n === 0, JSON.stringify(r));
    await ctx.close();
  }
  {
    // b10-r2-10 Bug Safari summary: the score is the largest line in the result card; the run facts are one labelled panel
    const { ctx, page } = await mk();
    await page.goto(ROOT + 'game/games/festival/bugs.html?test=1');
    await page.waitForFunction(() => !!window.__bugs, null, { timeout: 10000 });
    const r = await page.evaluate(() => {
      const B = window.__bugs; B.start('meadow', { seed: 'r4d4', empty: true }); B.step(100); B.render();
      const px = (e) => (e ? parseFloat(getComputedStyle(e).fontSize) : 0);
      const sc = document.getElementById('sum-score');
      const card = sc && sc.closest('section, .mk-card');
      const others = card ? [...card.querySelectorAll('p, li, dd, dt, .mk-line')].filter((e) => e !== sc && !sc.contains(e) && e.textContent.trim() && e.getBoundingClientRect().height > 0) : [];
      const facts = document.getElementById('sum-facts');
      return { mode: B.mode, score: px(sc), maxOther: Math.max(0, ...others.map(px)), facts: !!facts && facts.getAttribute('role') === 'group' && !!facts.querySelector('#sum-gained') && !!facts.querySelector('#sum-combo') };
    });
    check('Bug Safari: the summary score line is the biggest text in the result card (ties the star row)', r.mode === 'summary' && r.score >= r.maxOther && r.score >= 24, JSON.stringify(r));
    check('Bug Safari: caught / stars gained / best combo sit together in one labelled panel', r.facts, JSON.stringify(r));
    if (SHOTS) await page.screenshot({ path: SHOTS + '/r4-d4-bugs-summary.jpg', type: 'jpeg', quality: 60 });
    await ctx.close();
  }
  {
    // b10-r2-07 nit: the Jam song progress bar is hidden (and emptied) on the song list, shown during a song
    const { ctx, page } = await mk();
    await page.goto(ROOT + 'game/games/jam/index.html?test=1');
    await page.waitForFunction(() => !!window.__jam, null, { timeout: 10000 });
    const r = await page.evaluate(() => {
      const J = window.__jam; const vis = () => getComputedStyle(document.getElementById('progress')).visibility;
      const w = () => document.getElementById('progress-bar').style.width;
      const menu0 = vis(); J.start(window.MMJamSongs.SONGS[0].id, 'easy'); J.at(20000); J.step(0); const play = vis(); const wPlay = w();
      J.menu(); const menu1 = vis(); const wMenu = w();
      return { menu0, play, wPlay, menu1, wMenu };
    });
    check('Jam: the progress bar shows during a song and is hidden + emptied back on the song list', r.menu0 === 'hidden' && r.play === 'visible' && r.menu1 === 'hidden' && (r.wMenu === '0%' || r.wMenu === ''), JSON.stringify(r));
    await ctx.close();
  }
  check('no page errors', errors.length === 0, errors.join('|'));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
