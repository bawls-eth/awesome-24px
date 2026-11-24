// Round 4 / O-08 (b13-r2-12, b15-07): Arcane Frontier is a "Coming soon" card until the game exists.
// Three functional replays: (1) desktop load: zero failed requests, zero console errors, none of the 15 old 404s are requested;
// (2) phone 390x844: no horizontal scroll, readable text, 44 px targets, and the Home link really lands on the Hub;
// (3) keyboard + a11y: Tab reaches Home then Town with a visible focus ring, Enter follows the link, landmarks / names / contrast.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-r4-arcane-soon.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/arcane-frontier/index.html';
const OLD = ['style.css', 'assets.js', 'audio.js', 'save.js', 'input.js', 'map.js', 'fx.js', 'combat.js', 'items.js', 'player.js', 'enemies.js', 'bosses.js', 'ui.js', 'world.js', 'main.js'];

async function open(browser, opts) {
  const ctx = await browser.newContext(opts);
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  const log = { errors: [], bad: [], reqs: [], db };
  page.on('pageerror', (e) => log.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') log.errors.push('console: ' + m.text()); });
  page.on('requestfailed', (r) => log.bad.push('failed ' + r.url()));
  page.on('response', (r) => { log.reqs.push(r.url()); if (r.status() >= 400) log.bad.push(r.status() + ' ' + r.url()); });
  await page.goto(PAGE, { waitUntil: 'load' });
  await page.waitForTimeout(600);
  return { ctx, page, log };
}
// WCAG contrast of an element's text against the first opaque background up the tree.
const CONTRAST = (sel) => {
  const el = document.querySelector(sel); if (!el) return 0;
  const rgb = (s) => (s.match(/[\d.]+/g) || []).map(Number);
  const lum = (c) => { const f = c.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
  let bg = null;
  for (let n = el; n && !bg; n = n.parentElement) { const c = rgb(getComputedStyle(n).backgroundColor); if (c.length >= 3 && (c.length < 4 || c[3] > 0.99)) bg = c; }
  const a = lum(rgb(getComputedStyle(el).color)), b = lum(bg || [255, 255, 255]);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};
const FOCUS = () => { const e = document.activeElement, cs = getComputedStyle(e); return { id: e.id, ring: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2 }; };

(async () => {
  const browser = await chromium.launch();

  // ---- 1. desktop: clean load
  {
    const { ctx, page, log } = await open(browser, { viewport: { width: 1280, height: 720 } });
    check('desktop: zero failed / 4xx requests', log.bad.length === 0, log.bad.join(' | '));
    check('desktop: zero console errors / page errors', log.errors.length === 0, log.errors.join(' | '));
    const old = log.reqs.filter((u) => OLD.some((f) => u.endsWith('/arcane-frontier/' + f) || u.endsWith('/arcane-frontier/js/' + f)));
    check('desktop: none of the 15 files that used to 404 is requested', old.length === 0, old.join(' | '));
    check('desktop: no third-party request (the CDN Phaser tag is gone)', log.reqs.every((u) => u.startsWith(ORIGIN)), log.reqs.filter((u) => !u.startsWith(ORIGIN)).join(' | '));
    check('desktop: no database traffic', log.db.attempts() === 0);
    const s = await page.evaluate(() => {
      const card = document.getElementById('soon'), r = card.getBoundingClientRect(), cs = getComputedStyle(card);
      const imgs = Array.from(document.querySelectorAll('#party img'));
      return { title: document.title, h1: document.querySelector('h1').textContent, badge: document.getElementById('soon-badge').textContent,
        inView: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, radius: cs.borderTopLeftRadius, font: cs.fontFamily,
        px8: document.body.classList.contains('px8'), imgs: imgs.length, loaded: imgs.every((i) => i.complete && i.naturalWidth === 32),
        crisp: imgs.every((i) => /pixelated|crisp/.test(getComputedStyle(i).imageRendering)), scripts: Array.from(document.scripts).map((x) => x.getAttribute('src')) };
    });
    check('desktop: the card says "Coming soon" + "Arcane Frontier" and the title matches', /coming soon/i.test(s.badge) && s.h1 === 'Arcane Frontier' && /Arcane Frontier/.test(s.title) && /coming soon/i.test(s.title), JSON.stringify(s));
    check('desktop: the whole card is inside the viewport', s.inView);
    check('desktop: 8-bit theme (square corners, monospace, body.px8)', s.radius === '0px' && /courier|mono/i.test(s.font) && s.px8, s.radius + ' ' + s.font);
    check('desktop: 4 hero sprites loaded from the asset pack, drawn crisp', s.imgs === 4 && s.loaded && s.crisp);
    check('desktop: no scaffold script is loaded (only the shared 8-bit helper)', s.scripts.length === 1 && /shared\/mm-8bit\.js$/.test(s.scripts[0]), s.scripts.join(','));
    await ctx.close();
  }

  // ---- 2. phone 390x844: layout + the Home link works by tap
  {
    const { ctx, page, log } = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    check('phone: zero failed requests and zero console errors', log.bad.length === 0 && log.errors.length === 0, log.bad.concat(log.errors).join(' | '));
    const s = await page.evaluate(() => {
      const box = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom }; };
      const small = Array.from(document.querySelectorAll('#soon *')).filter((e) => e.children.length === 0 && e.textContent.trim()).map((e) => parseFloat(getComputedStyle(e).fontSize));
      return { sw: document.documentElement.scrollWidth, iw: innerWidth, sh: document.documentElement.scrollHeight, ih: innerHeight, card: box('soon'), hub: box('back-hub'), town: box('back-town'), minFont: Math.min.apply(null, small) };
    });
    check('phone: no horizontal scroll (was 648 px wide on a 390 px phone)', s.sw <= s.iw, s.sw + ' vs ' + s.iw);
    check('phone: the card fits the screen without vertical scroll', s.sh <= s.ih && s.card.b <= s.ih && s.card.r <= s.iw && s.card.x >= 0, JSON.stringify(s.card) + ' sh ' + s.sh);
    check('phone: Home and Town targets are at least 44x44', s.hub.w >= 44 && s.hub.h >= 44 && s.town.w >= 44 && s.town.h >= 44, JSON.stringify([s.hub, s.town]));
    check('phone: the two targets do not overlap', s.hub.b <= s.town.y || s.hub.r <= s.town.x || s.town.b <= s.hub.y || s.town.r <= s.hub.x);
    check('phone: all text is 12 px or larger', s.minFont >= 12, 'min ' + s.minFont);
    await page.tap('#back-hub');
    await page.waitForURL(/\/game\/hub\/index\.html/, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(800);
    const at = await page.evaluate(() => ({ path: location.pathname, body: document.body.getBoundingClientRect().height }));
    check('phone: tapping Home lands on the Hub page, which renders', /\/game\/hub\/index\.html$/.test(at.path) && at.body > 100, JSON.stringify(at));
    check('phone: no database traffic on the way', log.db.attempts() === 0, String(log.db.attempts()));
    await ctx.close();
  }

  // ---- 3. keyboard + a11y
  {
    const { ctx, page, log } = await open(browser, { viewport: { width: 1280, height: 720 } });
    const a = await page.evaluate(() => ({ lang: document.documentElement.lang, mains: document.querySelectorAll('main').length, h1s: document.querySelectorAll('h1').length,
      labelled: document.getElementById('soon').getAttribute('aria-labelledby') === 'soon-title', nav: !!document.querySelector('nav[aria-label]'),
      alts: Array.from(document.images).every((i) => (i.getAttribute('alt') || '').length > 3), status: document.getElementById('soon-status').getAttribute('role'),
      zoom: !/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/.test(document.querySelector('meta[name=viewport]').content) }));
    check('a11y: lang, one <main>, one <h1>, labelled card, named <nav>, alt text on every image', a.lang === 'en' && a.mains === 1 && a.h1s === 1 && a.labelled && a.nav && a.alts, JSON.stringify(a));
    check('a11y: pinch zoom is not disabled (the old page set user-scalable=no)', a.zoom);
    const c = {};
    for (const sel of ['#soon-title', '#soon .tag', '#soon p.body', '#soon-badge', '#back-hub', '#back-town']) c[sel] = Math.round((await page.evaluate(CONTRAST, sel)) * 10) / 10;
    check('a11y: every text block has contrast >= 4.5:1', Object.values(c).every((v) => v >= 4.5), JSON.stringify(c));
    await page.keyboard.press('Tab');
    const f1 = await page.evaluate(FOCUS);
    check('keyboard: the first Tab stop is Home, with a visible focus ring', f1.id === 'back-hub' && f1.ring, JSON.stringify(f1));
    await page.keyboard.press('Tab');
    const f2 = await page.evaluate(FOCUS);
    check('keyboard: the second Tab stop is Town, with a visible focus ring', f2.id === 'back-town' && f2.ring, JSON.stringify(f2));
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/game\/hub\/index\.html/, { timeout: 15000 }).catch(() => {});
    check('keyboard: Enter on Home opens the Hub', /\/game\/hub\/index\.html$/.test(new URL(page.url()).pathname), page.url());
    // reduced motion: nothing on the card animates
    const rm = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await blockDb(rm);
    const p2 = await rm.newPage();
    await p2.goto(PAGE);
    await p2.waitForTimeout(300);
    const anim = await p2.evaluate(() => Array.from(document.querySelectorAll('*')).filter((e) => getComputedStyle(e).animationName !== 'none').length);
    check('reduced motion: no running animation', anim === 0, String(anim));
    await rm.close();
    await ctx.close();
    check('a11y pass: zero console errors', log.errors.length === 0, log.errors.join(' | '));
  }

  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
