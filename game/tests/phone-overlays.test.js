// Every full-screen overlay must fit (or scroll inside) small phone screens,
// have a >= 40px close button, and the What's-new banner must not take over the screen.
const { chromium } = require('playwright');
const { launch, check, done } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';

(async () => {
  // Join screen (before joining) at 360x640: the card must not be clipped at the top.
  const browser = await chromium.launch();
  for (const [w, h] of [[390, 844], [360, 640], [844, 390], [640, 360]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    await page.goto(BASE);
    await page.waitForSelector('#join-overlay .join-card');
    const j = await page.evaluate(() => { const c = document.querySelector('#join-overlay .join-card'); const r = c.getBoundingClientRect(); return { t: r.top, b: r.bottom, h: innerHeight, scrolls: c.scrollHeight > c.clientHeight, oy: getComputedStyle(c).overflowY }; });
    check(`${w}x${h}: join screen card is not clipped (top >= 0, bottom <= viewport)`, j.t >= -0.5 && j.b <= j.h + 0.5, JSON.stringify(j));
    await page.close();
  }
  await browser.close();

  for (const [w, h] of [[390, 844], [360, 640], [844, 390], [640, 360]]) {
    const tag = `${w}x${h}`;
    const { browser: b, page, errors } = await launch({ width: w, height: h }, { fishlog: { caught: { koi: { n: 1, best: 20 } }, claimed: [], lastDay: 0 }, crafted: { plank: 2 } }, true);
    const res = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('[id$="-overlay"]')) {
        if (['join-overlay', 'underground-overlay', 'realm-overlay'].includes(el.id)) continue;
        const wasHidden = el.classList.contains('hidden'); el.classList.remove('hidden');
        const card = el.querySelector(':scope > [class$="-card"]') || el.firstElementChild;
        const r = card.getBoundingClientRect(); const close = el.querySelector('button[id$="close-btn"]'); const cr = close && close.getBoundingClientRect();
        out.push({ id: el.id, fits: r.left >= -0.5 && r.right <= innerWidth + 0.5 && r.top >= -0.5 && r.bottom <= innerHeight + 0.5, close: cr ? [Math.round(cr.width), Math.round(cr.height)] : null, closeIn: !!cr && cr.top >= 0 && cr.right <= innerWidth && cr.bottom <= innerHeight });
        if (wasHidden) el.classList.add('hidden');
      }
      const banner = document.getElementById('whats-new-banner'); banner.classList.remove('hidden');
      const br = banner.getBoundingClientRect();
      return { overlays: out, banner: { h: br.height, vh: innerHeight } };
    });
    const bad = res.overlays.filter((o) => !o.fits);
    check(`${tag}: all ${res.overlays.length} overlays fit the screen`, bad.length === 0, JSON.stringify(bad));
    const small = res.overlays.filter((o) => !o.close || o.close[0] < 40 || o.close[1] < 40 || !o.closeIn);
    check(`${tag}: every overlay close button is >= 40x40 and on screen`, small.length === 0, JSON.stringify(small));
    check(`${tag}: What's-new banner is <= 34% of the screen height`, res.banner.h <= res.banner.vh * 0.34 + 2, JSON.stringify(res.banner));
    check(`${tag}: no console errors`, errors.length === 0, errors.join('|'));
    if (process.env.SHOTS) { await page.evaluate(() => { document.getElementById('whats-new-banner').classList.remove('hidden'); }); await page.screenshot({ path: `${process.env.SHOTS}/audit-${tag}-banner.png` }); }
    await b.close();
  }
  done();
})();
