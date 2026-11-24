// cyc5-G (b12-r3-02, P2): ~25% dead black band above the phone dungeon room (390x844). The 17x13 room is bounded by the screen width (the
// dungeon view pans sideways), the room must stay clear of the map row above and the ability pad below (realm-polish3 / beta-r4-dungeon-pad),
// so the band above it now shows the room's own north wall stacked upward and fading into the dark (#mm-dv-ceiling), panning with the room.
// Checks (real screenshots, pixel stats): the band between the HUD nodes is no longer black and shows wall structure, stays darker than the
// room (HUD contrast), pans with the camera, leaves the canvas / room / pad layout exactly as before, is off on desktop and with ?dceil=0.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc5-art-dungeon-ceiling.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const DUNGEON = ORIGIN + '/game/games/mad-maze/index.html?mode=dungeon&test=1&offline=1&lv=2&seed=11&biome=crypt';

// mean luminance and luminance spread of a screenshot clip (PNG decoded in the page, no native deps)
async function lum(page, clip) {
  const b64 = (await page.screenshot({ clip })).toString('base64');
  return page.evaluate(async (src) => {
    const im = new Image(); im.src = 'data:image/png;base64,' + src; await im.decode();
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data; let s = 0, s2 = 0, n = 0, h = 2166136261;
    for (let i = 0; i < d.length; i += 4) { const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; s += l; s2 += l * l; n++; h = Math.imul(h ^ d[i] ^ (d[i + 1] << 8), 16777619); }
    const m = s / n; return { mean: Math.round(m * 10) / 10, sd: Math.round(Math.sqrt(Math.max(0, s2 / n - m * m)) * 10) / 10, hash: h >>> 0 };
  }, b64);
}

async function open(browser, vp, extra) {
  const ctx = await browser.newContext(Object.assign({ viewport: vp }, vp.width < 600 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : {}));
  const db = await blockDb(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(DUNGEON + (extra || ''));
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active, null, { timeout: 30000 });
  await page.waitForTimeout(3500); // the "Crypt #11 · Brittle" intro card sits over the band for the first ~2 s
  return { ctx, page, errors, db };
}
const geo = (page) => page.evaluate(() => {
  const R = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) }; };
  const a = window.__mm.arena; const d = window.__mm.dungeon;
  return { canvas: R(document.getElementById('realm-canvas')), ceil: R(document.getElementById('mm-dv-ceiling')), ceilShown: !!document.getElementById('mm-dv-ceiling') && getComputedStyle(document.getElementById('mm-dv-ceiling')).display !== 'none', W: a.W, H: a.H, dv: a._dv ? Object.assign({}, a._dv) : null, stat: d.ceiling ? d.ceiling() : null };
});

(async () => {
  const browser = await chromium.launch();
  const PH = { width: 390, height: 844 };
  // the band left free by the HUD: right of the map button / chips, left of the mini-map (x 140..270), under the chip row and above the
  // room banner (#realm-banner sits at top 182 on this phone, so it never enters the clip): y 150..178
  const BAND = { x: 140, y: 150, width: 130, height: 28 };
  { const A = await open(browser, PH); const g = await geo(A.page);
    const band = await lum(A.page, BAND);
    const room = await lum(A.page, { x: 60, y: g.canvas.y + 60, width: 270, height: 200 });
    check('390x844: the room is unchanged (17 x 13 = 680 x 520, dungeon view on, canvas top 215 under the map row)', g.W === 680 && g.H === 520 && !!g.dv && g.canvas.y >= 214, JSON.stringify(g));
    check('390x844: the band above the room is no longer dead black (mean luminance > 12, was a flat ~10)', band.mean > 12, JSON.stringify(band));
    check('390x844: the band shows wall structure, not a flat fill (luminance spread > 4)', band.sd > 4, JSON.stringify(band));
    check('390x844: the band stays darker than the room floor (HUD text keeps its contrast)', band.mean < room.mean, JSON.stringify({ band, room }));
    check('390x844: the ceiling spans the screen width and ends exactly at the room top', !!g.ceil && g.ceilShown && g.ceil.y <= 0 && Math.abs(g.ceil.b - g.canvas.y) <= 1 && g.ceil.x === g.canvas.x && g.ceil.r === g.canvas.r, JSON.stringify(g));
    // pans with the room: move the hero to the right edge, the camera follows, the ceiling repaints with the new slice
    const before = await lum(A.page, BAND);
    await A.page.evaluate(() => { const a = window.__mm.arena; a.player.x = a.W - 60; });
    await A.page.waitForTimeout(900);
    const g2 = await geo(A.page); const after = await lum(A.page, BAND);
    check('390x844: the ceiling pans with the room (camera moved, ceiling repainted, pixels changed)', g2.stat.paints > g.stat.paints && after.hash !== before.hash, JSON.stringify({ p0: g.stat.paints, p1: g2.stat.paints }));
    const pads = await A.page.evaluate(() => Array.from(document.querySelectorAll('#realm-abilities .realm-ab')).filter((e) => e.getClientRects().length).map((e) => Math.round(e.getBoundingClientRect().top)));
    check('390x844: the ability pad is still below the room (no overlap)', pads.length > 0 && pads.every((t) => t >= g.canvas.b), JSON.stringify({ pads, room: g.canvas }));
    await A.page.screenshot({ path: require('path').join(__dirname, '..', 'design', 'beta', 'img', 'cyc5-art-dungeon-ceiling-390.jpg'), type: 'jpeg', quality: 80 }).catch(() => {});
    check('390x844: no page errors, 0 DB attempts', A.errors.length === 0 && A.db.attempts() === 0, A.errors.join(' | '));
    await A.ctx.close();
  }
  { const A = await open(browser, PH, '&dceil=0'); const g = await geo(A.page); const band = await lum(A.page, BAND);
    check('?dceil=0: no ceiling, the old flat dark band (spread < 1)', !g.ceilShown && band.sd < 1, JSON.stringify({ g: g.stat, band }));
    await A.ctx.close();
  }
  { const A = await open(browser, { width: 1280, height: 720 }); const g = await geo(A.page);
    check('1280x720: no dungeon view, no ceiling', !g.dv && !g.ceilShown, JSON.stringify(g));
    check('1280x720: no page errors, 0 DB attempts', A.errors.length === 0 && A.db.attempts() === 0, A.errors.join(' | '));
    await A.ctx.close();
  }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
