// Realm arena on phones: viewport fill, HUD / ability / joystick / menu layout, panels, rotation and the perf guard.
// Sizing rule under test (see realm.js _resize): the arena fills the visible viewport; the world short side is 540 logical units and the
// long side follows the screen (aspect 0.386..2.59), so the canvas covers the whole viewport; beyond that it is letterboxed and centred.
// Run: BASE=http://localhost:8481/game/index.html NODE_PATH=$(npm root -g) node game/tests/realm-phone-layout.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const MAZE = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1';
const IDS = ['sparkwand', 'quickwand', 'heartcharm', 'swiftcharm'];
const items = []; for (let i = 0; i < 40; i++) items.push({ n: i + 1, id: IDS[i % 4], r: i % 3 });
const SAVE = { realm: { level: 9, shards: 5000, bestWave: 30, items, nextUid: 100, eq: {} } };
const VIEWPORTS = [[390, 844], [360, 640], [844, 390], [768, 1024]];

async function open(browser, w, h, extra) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, ...(extra || {}) });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((v) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', v); }, JSON.stringify(SAVE));
  errors.length = 0;
  await page.goto(MAZE);
  await page.waitForFunction(() => window.__mm && window.__mm.arena);
  await page.waitForTimeout(300);
  return { ctx, page, errors };
}

// Rects (CSS px) of every HUD-level control; boss / partner bars are forced visible and the values stressed so the worst case is measured.
const measure = (page) => page.evaluate(() => {
  const a = window.__mm.arena;
  document.getElementById('realm-boss').classList.remove('hidden');
  document.getElementById('realm-partner').classList.remove('hidden');
  a.run.wave = 999; a.displayShards = 9999999; a.save.level = 40; a._syncHud();
  document.getElementById('realm-banner').classList.add('hidden');
  const sel = [['hp', '#realm-hp'], ['info', '#realm-info'], ['xp', '#realm-xp'], ['bp', '#realm-bp-btn'], ['board', '#realm-board-btn'], ['menu', '#realm-menu-btn'], ['leave', '#realm-leave-btn'], ['aim', '#realm-aim-btn'],
    ['ab0', '#realm-ab-0'], ['ab1', '#realm-ab-1'], ['ab2', '#realm-ab-2'], ['ab3', '#realm-ab-3'], ['boss', '#realm-boss'], ['partner', '#realm-partner'], ['stickM', '#realm-stick-move'], ['stickA', '#realm-stick-aim']];
  const out = {};
  sel.forEach(([n, s]) => { const e = document.querySelector(s); if (!e || getComputedStyle(e).display === 'none') return; const r = e.getBoundingClientRect(); if (r.width > 0) out[n] = { x: r.left, y: r.top, w: r.width, h: r.height, fs: parseFloat(getComputedStyle(e).fontSize) }; });
  const txt = {};
  ['#realm-hp-text', '#realm-level', '#realm-wave', '#realm-shards', '#realm-xp-text', '#realm-boss-name', '#realm-partner-name'].forEach((s) => { const e = document.querySelector(s); if (e) txt[s] = parseFloat(getComputedStyle(e).fontSize); });
  document.getElementById('realm-boss').classList.add('hidden'); document.getElementById('realm-partner').classList.add('hidden');
  return { rects: out, txt, vw: window.innerWidth, vh: window.innerHeight, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight };
});
const overlaps = (rects, skip) => {
  const names = Object.keys(rects); const bad = [];
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const a = rects[names[i]]; const b = rects[names[j]];
    if (skip && skip.some((p) => (p[0] === names[i] && p[1] === names[j]) || (p[0] === names[j] && p[1] === names[i]))) continue;
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x); const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (ox > 0.5 && oy > 0.5) bad.push(`${names[i]}x${names[j]}`);
  }
  return bad;
};
const canvasRect = (page) => page.evaluate(() => { const r = document.getElementById('realm-canvas').getBoundingClientRect(); const a = window.__mm.arena; return { x: r.left, y: r.top, w: r.width, h: r.height, vw: window.innerWidth, vh: window.innerHeight, W: a.W, H: a.H, cw: a.canvas.width, ch: a.canvas.height, px: a.player.x, py: a.player.y }; });
const fills = (c) => Math.abs(c.w - c.vw) <= 2 && Math.abs(c.h - c.vh) <= 2 && Math.abs(c.x) <= 1 && Math.abs(c.y) <= 1;

(async () => {
  const browser = await chromium.launch();
  const errs = [];

  for (const [w, h] of VIEWPORTS) {
    const tag = `${w}x${h}`;
    const P = await open(browser, w, h); const page = P.page;
    await page.waitForFunction(() => window.__mm.arena.state === 'play', null, { timeout: 8000 });
    const m = await measure(page); const R = m.rects;
    check(`${tag}: no horizontal scroll (and no vertical page scroll)`, m.sw <= m.vw && m.sh <= m.vh, `${m.sw}x${m.sh} vs ${m.vw}x${m.vh}`);
    const c = await canvasRect(page);
    check(`${tag}: canvas fills the viewport (world ${c.W}x${c.H})`, fills(c), JSON.stringify(c));
    check(`${tag}: world aspect matches the screen (no stretch)`, Math.abs(c.W / c.H - c.vw / c.vh) < 0.01, JSON.stringify(c));
    check(`${tag}: backing store capped (<= 2 px per CSS px)`, c.cw <= c.vw * 2 + 2 && c.cw <= c.W * 1.5 + 1, JSON.stringify(c));
    const tiny = Object.entries(R).filter(([n, r]) => /^(bp|board|menu|leave|aim|ab\d|stickM|stickA)$/.test(n) && (r.w < 43.5 || r.h < 43.5));
    check(`${tag}: every button / stick is >= 44 px`, tiny.length === 0 && ['bp', 'board', 'menu', 'leave', 'aim', 'ab0', 'ab3', 'stickM', 'stickA'].every((n) => R[n]), JSON.stringify(tiny));
    const out = Object.entries(R).filter(([, r]) => r.x < -0.5 || r.y < -0.5 || r.x + r.w > m.vw + 0.5 || r.y + r.h > m.vh + 0.5);
    check(`${tag}: all HUD / controls inside the viewport`, out.length === 0, JSON.stringify(out));
    check(`${tag}: no overlaps among HUD, abilities, sticks, menu and aim buttons`, overlaps(R).length === 0, overlaps(R).join(','));
    const small = Object.entries(m.txt).filter(([, fs]) => fs < 10);
    check(`${tag}: HUD text is >= 10 px`, small.length === 0, JSON.stringify(m.txt));
    check(`${tag}: HP / XP bars readable (HP >= 100 px wide)`, R.hp.w >= 100 && R.xp.w >= 100, JSON.stringify([R.hp, R.xp]));

    // panels: scroll inside the viewport, buttons >= 44 px
    const panelInfo = async (open, sel, cardSel) => {
      await page.evaluate(open);
      await page.waitForTimeout(150);
      return page.evaluate(([s, cs]) => {
        const card = document.querySelector(`${s} ${cs}`); const r = card.getBoundingClientRect(); const cs2 = getComputedStyle(card);
        const btns = [...card.querySelectorAll('button')].map((b) => { const q = b.getBoundingClientRect(); return [q.width, q.height, b.id || b.className || b.textContent]; }).filter((q) => q[0] > 0);
        const before = card.scrollTop; card.scrollTop = 60; const moved = card.scrollTop > before; card.scrollTop = 0;
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, vw: window.innerWidth, vh: window.innerHeight, ov: cs2.overflowY, sh: card.scrollHeight, ch: card.clientHeight, sw: card.scrollWidth, cw: card.clientWidth, moved, small: JSON.stringify(btns.filter(([bw, bh]) => bw < 43.5 || bh < 43.5)), n: btns.length };
      }, [sel, cardSel]);
    };
    const bp = await panelInfo(() => window.__mm.arena.setPaused(true), '#realm-backpack', '.realm-bp-card');
    check(`${tag}: backpack card stays inside the viewport and scrolls`, bp.top >= -0.5 && bp.bottom <= bp.vh + 0.5 && bp.left >= -0.5 && bp.right <= bp.vw + 0.5 && bp.ov === 'auto' && bp.sh > bp.ch && bp.moved, JSON.stringify(bp));
    check(`${tag}: backpack buttons >= 44 px and no sideways overflow`, bp.small === '[]' && bp.n > 5 && bp.sw <= bp.cw + 1, JSON.stringify(bp));
    const shop = await panelInfo(() => window.__mm.arena.setShop(true), '#realm-shop', '.realm-bp-card');
    check(`${tag}: shop card inside the viewport, scrolls, buttons >= 44 px`, shop.top >= -0.5 && shop.bottom <= shop.vh + 0.5 && shop.ov === 'auto' && shop.sh > shop.ch && shop.moved && shop.small === '[]' && shop.sw <= shop.cw + 1, JSON.stringify(shop));
    const bd = await panelInfo(() => window.__mm.arena.setBoard(true), '#realm-board', '.realm-bp-card');
    check(`${tag}: kill board inside the viewport, close >= 44 px`, bd.top >= -0.5 && bd.bottom <= bd.vh + 0.5 && bd.small === '[]', JSON.stringify(bd));
    const mn = await panelInfo(() => { window.__mm.arena.setPaused(false); window.__mm.arena.setMenu(true); }, '#realm-pause', '.realm-bp-card');
    check(`${tag}: menu card inside the viewport, buttons >= 44 px`, mn.top >= -0.5 && mn.bottom <= mn.vh + 0.5 && mn.small === '[]' && mn.n >= 7, JSON.stringify(mn));
    await page.evaluate(() => { window.__mm.arena.setMenu(false); window.__mm.arena.setPaused(false); });

    errs.push(...P.errors); await P.ctx.close();
  }

  // ---------- rotation, URL-bar resize, extreme aspect ----------
  const P = await open(browser, 390, 844); const page = P.page;
  await page.waitForFunction(() => window.__mm.arena.state === 'play', null, { timeout: 8000 });
  await page.evaluate(() => { const a = window.__mm.arena; a.enemies[0].active = true; a.enemies[0].type = 'aimed'; a.enemies[0].x = 400; a.enemies[0].y = 1000; a.enemies[0].hp = 99; a.player.y = 1000; });
  await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(300);
  let c = await canvasRect(page);
  check('rotation to landscape: canvas refills the viewport, world is wide', fills(c) && c.W > c.H, JSON.stringify(c));
  check('rotation: the player is pulled back inside the new world', c.px <= c.W && c.py <= c.H);
  check('rotation: enemies are pulled inside the new world', await page.evaluate(() => { const a = window.__mm.arena; return a.enemies.every((e) => !e.active || (e.x <= a.W && e.y <= a.H)); }));
  let m = await measure(page);
  check('after rotation: no overlaps and nothing outside the viewport', overlaps(m.rects).length === 0 && Object.values(m.rects).every((r) => r.x >= -0.5 && r.y >= -0.5 && r.x + r.w <= m.vw + 0.5 && r.y + r.h <= m.vh + 0.5), overlaps(m.rects).join(','));
  await page.setViewportSize({ width: 390, height: 760 }); await page.waitForTimeout(300); // the mobile URL bar showing
  c = await canvasRect(page);
  check('URL-bar style height change: canvas follows the visible viewport', fills(c), JSON.stringify(c));
  check('overlay is pinned to the visible viewport', await page.evaluate(() => { const r = document.getElementById('realm-overlay').getBoundingClientRect(); return Math.abs(r.width - innerWidth) < 1 && Math.abs(r.height - innerHeight) < 1; }));
  await page.setViewportSize({ width: 300, height: 900 }); await page.waitForTimeout(300);
  c = await canvasRect(page);
  check('extreme aspect (300x900): letterboxed + centred, never stretched, nothing overflows', c.w <= 301 && c.h <= 901 && c.h < c.vh - 2 && Math.abs((c.y + c.h / 2) - c.vh / 2) <= 2 && Math.abs(c.w / c.h - c.W / c.H) < 0.01, JSON.stringify(c));
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
  check('back to portrait: fills again', fills(await canvasRect(page)));
  const act = await page.evaluate(() => window.__mm.arena.active);
  check('the run kept going through every resize', act === true);

  // ---------- perf guard ----------
  const q0 = await page.evaluate(() => { const a = window.__mm.arena; a.setPerfPhone(true); return a.perfState(); });
  check('perf guard starts at full resolution on a phone', q0.quality === 1 && q0.phone === true);
  await page.evaluate(() => { const a = window.__mm.arena; for (let i = 0; i < 40; i++) a.perfFeed(40); }); // 1.6 s of slow frames
  check('not yet lowered after < 2 s of slow frames (hysteresis)', (await page.evaluate(() => window.__mm.arena.perfState())).quality === 1);
  await page.evaluate(() => { const a = window.__mm.arena; for (let i = 0; i < 40; i++) a.perfFeed(40); });
  const q1 = await page.evaluate(() => window.__mm.arena.perfState());
  check('> 33 ms for 2 s lowers the render resolution to 0.75', q1.quality === 0.75 && Math.abs(q1.w / q0.w - 0.75) < 0.02 && q1.scale < q0.scale, JSON.stringify([q0, q1]));
  check('the CSS size is unchanged by the quality drop', fills(await canvasRect(page)));
  await page.evaluate(() => { const a = window.__mm.arena; for (let i = 0; i < 400; i++) a.perfFeed(28); }); // between the two thresholds
  check('28 ms frames do not flip it back (hysteresis)', (await page.evaluate(() => window.__mm.arena.perfState())).quality === 0.75);
  await page.evaluate(() => { const a = window.__mm.arena; for (let i = 0; i < 900; i++) a.perfFeed(8); });
  const q2 = await page.evaluate(() => window.__mm.arena.perfState());
  check('fast frames restore the full resolution (reversible)', q2.quality === 1 && q2.w === q0.w && q2.h === q0.h, JSON.stringify(q2));
  await page.evaluate(() => { const a = window.__mm.arena; a.perfFeed(5000); a.perfFeed(900); for (let i = 0; i < 5; i++) a.perfFeed(40); });
  check('huge gaps (tab switch) are ignored', (await page.evaluate(() => window.__mm.arena.perfState())).quality === 1);
  await page.evaluate(() => { const a = window.__mm.arena; a.setPerfPhone(false); for (let i = 0; i < 400; i++) a.perfFeed(60); });
  check('not a phone: the guard never lowers the resolution', (await page.evaluate(() => window.__mm.arena.perfState())).quality === 1);
  const jank = await page.evaluate(() => { const a = window.__mm.arena; a.setPerfPhone(true); let t = 0; a._pf.ema = 16; return typeof a.perfFeed === 'function' && t === 0; });
  check('debug hook available (perfState / perfFeed / setPerfPhone)', jank);
  errs.push(...P.errors); await P.ctx.close();

  // ---------- dpr cap ----------
  const D = await open(browser, 390, 844, { deviceScaleFactor: 3 });
  const dc = await canvasRect(D.page);
  check('devicePixelRatio 3: backing store capped at 2x CSS size', dc.cw <= 390 * 2 + 1, JSON.stringify(dc));
  errs.push(...D.errors); await D.ctx.close();

  // ---------- desktop (non-touch) still clean ----------
  const K = await browser.newContext({ viewport: { width: 1000, height: 700 } }); const kp = await K.newPage();
  const kerr = []; kp.on('pageerror', (e) => kerr.push(e.message));
  await kp.goto(ORIGIN + '/game/games/mad-maze/lantern.css'); await kp.evaluate((v) => localStorage.setItem('pixeltown-save-v1', v), JSON.stringify(SAVE));
  await kp.goto(MAZE); await kp.waitForFunction(() => window.__mm && window.__mm.arena); await kp.waitForTimeout(300);
  m = await measure(kp);
  check('desktop 1000x700: canvas fills, no overlaps, buttons >= 44 px', fills(await canvasRect(kp)) && overlaps(m.rects).length === 0 && ['bp', 'board', 'menu', 'leave', 'aim', 'ab0'].every((n) => m.rects[n] && m.rects[n].w >= 43.5 && m.rects[n].h >= 43.5), overlaps(m.rects).join(','));
  errs.push(...kerr); await K.close();

  // ---------- hub variant: longer Leave label on a small phone ----------
  const H = await browser.newContext({ viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true }); const hp = await H.newPage();
  const herr = []; hp.on('pageerror', (e) => herr.push(e.message));
  await hp.goto(MAZE + '&from=hub'); await hp.waitForFunction(() => window.__mm && window.__mm.arena); await hp.waitForTimeout(500);
  m = await measure(hp);
  check('360x640 with the long hub Leave label: no overlap, HP bar >= 84 px', overlaps(m.rects).length === 0 && m.rects.hp.w >= 84 && m.rects.leave.x + m.rects.leave.w <= m.vw, JSON.stringify(m.rects.leave) + overlaps(m.rects).join(','));
  errs.push(...herr); await H.close();

  check('no console errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})();
