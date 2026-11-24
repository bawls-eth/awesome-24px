// Cycle 0 art (G), b12-r2-11: the Hub home cards, the Next line and the map's games strip show code-drawn 16x16 pixel icons
// (shared/mm-pixel-icons.js) instead of emoji glyphs; the emoji stays as hidden fallback text; ?pxicons=0 keeps the old emoji.
// Serve the repo root first:  python3 -m http.server 8440 &
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc0-art-hub-icons.test.js
// No Firebase (blockDb), no network, nothing written.
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const PX = require('../shared/mm-pixel-icons.js');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const HUB = ORIGIN + '/game/hub/index.html';
const PLACES = ['town', 'realm', 'isles', 'lantern', 'pop', 'dash', 'stack', 'echo', 'jam', 'angler', 'bugs', 'stalk', 'deepdelve'];

// pure checks on the icon pixels (Node): every icon is 16x16, 1-bit alpha, has a colour-matched dark outline, 3+ colours, and
// covers a readable share of the cell; no two icons are the same picture
const sigs = new Set();
PLACES.forEach((id) => {
  const p = PX.pixels(id);
  let op = 0, dark = 0, cols = new Set(), halfAlpha = 0;
  for (let i = 0; i < p.data.length; i += 4) {
    const a = p.data[i + 3];
    if (a !== 0 && a !== 255) halfAlpha++;
    if (a === 255) { op++; cols.add(p.data[i] + ',' + p.data[i + 1] + ',' + p.data[i + 2]); if (p.data[i] + p.data[i + 1] + p.data[i + 2] < 220) dark++; }
  }
  sigs.add(Buffer.from(p.data).toString('base64'));
  check(id + ': 16x16, alpha 0/255 only, 3+ colours, 35..200 opaque px, dark outline >= 25% of them', p.w === 16 && p.h === 16 && halfAlpha === 0 && cols.size >= 3 && op >= 35 && op <= 200 && dark >= op * 0.25,
    JSON.stringify({ op, dark, cols: cols.size }));
});
check('13 distinct icons', sigs.size === PLACES.length);

async function open(browser, opts, q) {
  const ctx = await browser.newContext(opts);
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(HUB + (q || ''));
  await page.waitForFunction(() => window.__hub && window.__home);
  return { ctx, page, errors, db };
}
const scan = (page) => page.evaluate(() => {
  const cards = [...document.querySelectorAll('#home .home-card')].map((a) => {
    const ic = a.querySelector('.hc-ico'), cv = ic.querySelector('canvas.px-ico');
    let opaque = 0;
    if (cv) { const d = cv.getContext('2d').getImageData(0, 0, 16, 16).data; for (let i = 3; i < d.length; i += 4) if (d[i] === 255) opaque++; }
    const r = cv ? cv.getBoundingClientRect() : null;
    return { id: a.dataset.place, pixel: ic.dataset.pixel || '', w: r ? r.width : 0, h: r ? r.height : 0, opaque, fb: (ic.querySelector('.px-fb') || {}).textContent || '', fbHidden: !!(ic.querySelector('.px-fb') || {}).hidden, text: ic.textContent };
  });
  const strip = [...document.querySelectorAll('#hub-games button')].map((b) => ({ id: b.dataset.node, cv: !!b.querySelector('.g-ico canvas.px-ico') }));
  const next = document.querySelector('#home-next-ico');
  return { cards, strip, next: next ? { cv: !!next.querySelector('canvas.px-ico'), hidden: document.querySelector('#home-next').hidden } : null };
});

(async () => {
  const browser = await chromium.launch();
  for (const [name, opts] of [['desktop', { viewport: { width: 1280, height: 720 } }], ['phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
    const f = await open(browser, opts);
    const s = await scan(f.page);
    check(name + ': 13 home cards, each with a pixel canvas icon of its own place id at 32x32 css px', s.cards.length === 13 && s.cards.every((c) => c.pixel === c.id && c.w === 32 && c.h === 32 && c.opaque >= 35), JSON.stringify(s.cards.filter((c) => !(c.pixel === c.id && c.w === 32 && c.opaque >= 35))));
    check(name + ': the emoji stays as hidden fallback text (icon text is never empty)', s.cards.every((c) => c.fb && c.fbHidden && c.text.length > 0));
    check(name + ': map games strip buttons carry pixel icons', s.strip.length >= 10 && s.strip.every((b) => b.cv), JSON.stringify(s.strip.filter((b) => !b.cv)));
    check(name + ': the Next line (fresh profile) shows the pixel sword', !s.next || s.next.hidden || s.next.cv, JSON.stringify(s.next));
    check(name + ': no page errors, no DB traffic', f.errors.length === 0 && f.db.count() === 0, f.errors.join(' | '));
    await f.ctx.close();
  }
  const off = await open(browser, { viewport: { width: 1280, height: 720 } }, '?pxicons=0');
  const so = await scan(off.page);
  check('?pxicons=0: no pixel canvases, the emoji glyphs as before', so.cards.length === 13 && so.cards.every((c) => !c.pixel && c.text.length > 0) && so.strip.every((b) => !b.cv));
  await off.ctx.close();
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
