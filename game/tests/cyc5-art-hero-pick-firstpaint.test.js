// cyc5-G (b12-r3-01, P2): hero pick pop-in. A fresh player on the world page (?heropick=1) gets the "Create your hero" grid. Before: the card
// showed 14 letter swatches, then the portraits popped in one by one; after the first pick the world showed the code orb / an empty pad for
// up to 3.5 s before the class sprite. Now the portraits are fetched + decoded as the page boots, the card stays invisible until they are
// ready (capped), and the first pick waits (capped) for the warmed idle strip before the world is revealed.
// Checked per animation frame (rAF sampler), with a simulated slow asset link (every /assets/arcane/ request delayed), both viewports:
//   1. the first frame the card is visible already has all 14 portraits drawn (no swatch frame),
//   2. the card is visible within a load-scaled budget (cap 1200 ms + link delay + boot),
//   3. from the first frame the picker is gone, every frame draws the hero with class art (never the code orb, never empty),
//   4. a blocked portrait folder still reveals the card at the cap with the swatches (no hang), 0 DB attempts.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc5-art-hero-pick-firstpaint.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const LS = require('./lib/load-scale');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&seed=12345&heropick=1';
const DELAY = 350; // ms added to every art request (a slow phone link)

async function run(browser, viewport, opts) {
  const ctx = await browser.newContext(Object.assign({ viewport }, viewport.width < 500 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : {}));
  const db = await blockDb(ctx);
  await ctx.route(/\/assets\/arcane\/[^?]*\.(png|json)/, async (r) => {
    if (opts.blockPortraits && /portraits\/portrait_/.test(r.request().url())) return r.abort();
    await new Promise((s) => setTimeout(s, DELAY)); return r.continue();
  });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const L = window.__fp = { frames: [], fallback: 0, hooked: false };
    const tick = () => {
      const w = document.getElementById('realm-hero');
      const card = w && w.querySelector('.hp-card-wrap');
      const open = !!(w && w.style.display !== 'none' && !w.classList.contains('hidden'));
      const vis = !!(open && card && getComputedStyle(card).visibility !== 'hidden');
      const cards = w ? Array.from(w.querySelectorAll('button[data-newcls]')) : [];
      const pts = cards.filter((c) => { const im = c.querySelector('img.hp-portrait'); return im && !im.hidden && im.complete && im.naturalWidth > 0; }).length;
      const sws = cards.filter((c) => { const s = c.querySelector('.hp-swatch'); return s && !s.hidden; }).length;
      const a = window.__mm && window.__mm.arena;
      if (a && !L.hooked) { // count draws of the code orb / avatar (the fallback hero)
        L.hooked = true; const g = a.ctx; const di = g.drawImage;
        g.drawImage = function (img) { if (img && (img === a.sprites.playerFallback || (a._avatar && img === a._avatar))) L.fallback++; return di.apply(g, arguments); };
      }
      L.frames.push({ t: Math.round(performance.now()), open, vis, n: cards.length, pts, sws, cls: a ? a._heroClass : undefined, fb: L.fallback });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.goto(WORLD);
  await page.waitForSelector('button[data-newcls="ranger"]', { state: 'visible', timeout: LS.budget(15000) });
  await page.waitForTimeout(300);
  const tapAt = await page.evaluate(() => performance.now());
  if (viewport.width < 500) await page.tap('button[data-newcls="ranger"]'); else await page.click('button[data-newcls="ranger"]');
  await page.waitForFunction(() => { const w = document.getElementById('realm-hero'); return w && w.style.display === 'none'; }, null, { timeout: LS.budget(8000) }).catch(() => {});
  await page.waitForTimeout(1200);
  const out = await page.evaluate(() => ({ frames: window.__fp.frames, warm: window.__heroWarm || null, nav: performance.timing.navigationStart, t0: performance.timeOrigin }));
  await ctx.close();
  return Object.assign(out, { tapAt, errors, db: db.attempts() });
}

(async () => {
  const f = LS.factor();
  const browser = await chromium.launch();
  for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 720 }]) {
    const tag = vp.width + 'x' + vp.height;
    const R = await run(browser, vp, {});
    const fr = R.frames;
    const firstVis = fr.find((x) => x.vis && x.n > 0);
    check(tag + ': the create grid becomes visible', !!firstVis, JSON.stringify(fr.slice(0, 12)));
    check(tag + ': its FIRST visible frame already has every class portrait drawn (no swatch -> portrait pop-in)', !!firstVis && firstVis.pts === firstVis.n && firstVis.sws === 0, JSON.stringify(firstVis));
    check(tag + ': no visible frame of the grid ever shows a swatch in place of a portrait', fr.filter((x) => x.vis && x.n > 0).every((x) => x.pts === x.n), JSON.stringify(fr.filter((x) => x.vis && x.n > 0 && x.pts !== x.n).slice(0, 3)));
    const firstOpen = fr.find((x) => x.open);
    const revealMs = firstVis && firstOpen ? firstVis.t - firstOpen.t : Infinity;
    check(tag + ': the card is shown within ' + LS.budget(1200 + DELAY + 400) + ' ms of the picker opening (load factor ' + f + ')', revealMs <= LS.budget(1200 + DELAY + 400), revealMs + ' ms');
    const after = fr.filter((x) => x.t > R.tapAt && !x.open);
    check(tag + ': the world is revealed after the pick', after.length > 10, String(after.length));
    check(tag + ': every frame after the picker closes draws the hero with the ranger class art (never null / the orb)', after.length > 0 && after.every((x) => x.cls === 'ranger'), JSON.stringify(after.slice(0, 5)));
    const fbAtClose = after.length ? after[0].fb : 0; const fbEnd = after.length ? after[after.length - 1].fb : 0;
    check(tag + ': no code-orb hero draw after the picker closes', fbEnd === fbAtClose, fbAtClose + ' -> ' + fbEnd);
    const waitMs = R.warm && typeof R.warm.firstWait === 'number' ? R.warm.firstWait : Infinity;
    check(tag + ': the first pick reveals the world within ' + LS.budget(1500 + 200) + ' ms (strip was warmed while the grid was open)', waitMs <= LS.budget(1500 + 200), String(waitMs));
    check(tag + ': no page errors', R.errors.length === 0, R.errors.join(' | '));
    check(tag + ': 0 DB attempts', R.db === 0, String(R.db));
  }
  const B = await run(browser, { width: 390, height: 844 }, { blockPortraits: true });
  const bv = B.frames.find((x) => x.vis && x.n > 0);
  check('portraits blocked: the grid still shows, with the letter swatches (no hang, no broken image)', !!bv && bv.n > 0 && bv.sws === bv.n && bv.pts === 0, JSON.stringify([bv, B.warm]));
  check('portraits blocked: the pick still works (ranger art)', B.frames.filter((x) => x.t > B.tapAt && !x.open).every((x) => x.cls === 'ranger'), '');
  check('portraits blocked: no page errors, 0 DB attempts', B.errors.length === 0 && B.db === 0, B.errors.join(' | ') + ' db=' + B.db);
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
