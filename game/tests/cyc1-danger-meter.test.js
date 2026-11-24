// ID-02 (cycle 1 S): the zone danger meter. MMDanger (pure) turns MMOverworld.difficultyAt into an area level (= the zone recLv on every
// zone border, smooth inside) and rates it against the hero level: Comfortable / Tough / Too hot, each with its own icon (colour is never
// the only cue). Realm World shows it inside #rw-zone (U's spec, design/beta/cycle1-ui.md). Offline: blockDb + every WebSocket closed.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc1-danger-meter.test.js
const path = require('path');
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const O = require('../shared/mm-overworld.js');
const D = require('../shared/mm-danger.js');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const IMG = path.join(__dirname, '../design/beta/img');
const REC = [1, 5, 10, 15];

(async () => {
  // ---- node: levels vs zones ----
  ['wide', 'classic'].forEach((bands) => {
    const w = O.generate('12345', bands === 'classic' ? { bands: 'classic' } : undefined);
    const lo = [99, 99, 99, 99], hi = [0, 0, 0, 0];
    for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) {
      const z = O.zoneAt(w, x, y); if (z > 3) continue;
      const a = D.areaLevel(O.difficultyAt(w, x + 0.5, y + 0.5), w.bands); lo[z] = Math.min(lo[z], a); hi[z] = Math.max(hi[z], a);
    }
    const ok = [0, 1, 2, 3].every((z) => lo[z] >= REC[z] - 0.5 && hi[z] <= (REC[z + 1] || 20) + 0.5 && hi[z] > lo[z]);
    check(`1. (${bands} bands) every tile's area level lies in its zone's recLv band (Shore 1-5, Midlands 5-10, Highlands 10-15, Godlands 15-20)`, w.bands === bands && ok, JSON.stringify({ lo, hi }));
    check(`1b. (${bands}) the knots sit on the zone borders: area level = recLv exactly where a zone starts`, D.knots(bands).slice(0, 4).map((k) => D.areaLevel(k[0], bands)).join() === '1,5,10,15');
  });
  let mono = true; for (let d = 0, prev = 0; d <= 1.0001; d += 0.01) { const a = D.areaLevel(d, 'wide'); if (a < prev) mono = false; prev = a; }
  check('1c. the area level never drops as difficulty rises, and bad input reads as the coast', mono && D.areaLevel(NaN) === 1 && D.areaLevel('x') === 1 && D.areaLevel(5) === 20);
  // ---- node: label text + icons ----
  const kAt = (z) => D.knots('wide')[z][0];
  const r1 = D.rate(1, 0, 'wide'), r2 = D.rate(8, kAt(2), 'wide'), r3 = D.rate(1, kAt(3), 'wide'), r4 = D.rate(10, kAt(2), 'wide'), r5 = D.rate(6, kAt(2), 'wide');
  check('2. Lv 1 on the coast = Comfortable; Lv 8 at the Highlands border (area 10) = Tough; Lv 1 at the Godlands border = Too hot; Lv 10 at area 10 = Comfortable; Lv 6 at area 10 = Too hot',
    r1.id === 'comfortable' && r2.id === 'tough' && r3.id === 'hot' && r4.id === 'comfortable' && r5.id === 'hot', [r1, r2, r3, r4, r5].map((r) => r.id).join());
  check('2b. label words and text are exact ("Comfortable", "Tough", "Too hot"; "Danger here: Tough (area Lv 10, you Lv 8)")',
    r1.label === 'Comfortable' && r2.label === 'Tough' && r3.label === 'Too hot' && r2.text === 'Danger here: Tough (area Lv 10, you Lv 8)', r2.text);
  check('2c. every bucket has its own icon (a second cue besides colour) and the bar fill grows with the gap', new Set([r1.icon, r2.icon, r3.icon]).size === 3 && r1.fill < r2.fill && r2.fill < r3.fill && r3.fill === 1, [r1.fill, r2.fill, r3.fill].join());

  // ---- browser: Realm World page ----
  const browser = await chromium.launch();
  const errors = []; const dbs = [];
  const open = async (o) => {
    const ctx = await browser.newContext({ viewport: o.vp, reducedMotion: o.reduced ? 'reduce' : 'no-preference', isMobile: !!o.phone, hasTouch: !!o.phone });
    const db = await blockDb(ctx); dbs.push(db); await ctx.routeWebSocket(/.*/, (ws) => ws.close());
    await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
    await page.evaluate(([lv, hs]) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', JSON.stringify({ realm: { level: lv, xp: 0, shards: 5, bestWave: 1, items: [], nextUid: 1, eq: {} } })); localStorage.setItem('mm-aim-assist', '0'); localStorage.setItem('pixeltown-realm-tutorial-v1', '{"v":1,"done":true}'); if (hs) localStorage.setItem('pixeltown-access-v1', JSON.stringify({ v: 1, hudScale: hs })); }, [o.lv || 1, o.hs || 0]);
    await page.goto(ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&seed=12345&tutorial=0' + (o.q || ''));
    await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
    await page.evaluate(() => { const a = window.__mm.arena; a.player.iframes = 1e9; a._hitPlayer = () => {}; });
    return { ctx, page };
  };
  const read = (page) => page.evaluate(() => {
    const e = document.getElementById('rw-danger'); if (!e) return null;
    const r = e.getBoundingClientRect(); const t = e.querySelector('.rw-danger-txt'); const ic = e.querySelector('.rw-danger-ico'); const f = e.querySelector('.rw-danger-fill');
    return { level: e.dataset.level, area: e.dataset.area, txt: t.textContent, icon: ic.textContent, aria: e.getAttribute('aria-label'), hidden: e.classList.contains('hidden'), inZone: !!e.closest('#rw-zone[aria-live="polite"]'),
      icoHidden: ic.getAttribute('aria-hidden') === 'true', barHidden: e.querySelector('.rw-danger-bar').getAttribute('aria-hidden') === 'true', fill: f.style.getPropertyValue('--rw-danger'),
      fs: parseFloat(getComputedStyle(t).fontSize), tr: getComputedStyle(f).transitionDuration, color: getComputedStyle(e).color, rect: { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }, vw: innerWidth, vh: innerHeight, zoneH: document.getElementById('rw-zone').getBoundingClientRect().height };
  });
  const moveTo = (page, zone) => page.evaluate((zone) => {
    const api = window.__mm.world; const w = api.world; const O = window.MMOverworld; const T = api.TILE; let best = null;
    for (let y = 2; y < w.h - 2 && !best; y += 3) for (let x = 2; x < w.w - 2; x += 3) if (O.zoneAt(w, x, y) === zone && !O.isSolid(w, x, y) && !O.isSolid(w, x + 1, y) && !O.isSolid(w, x, y + 1)) { best = { x, y }; break; }
    const p = window.__mm.arena.player; p.x = (best.x + 0.5) * T; p.y = (best.y + 0.5) * T; return best;
  }, zone);
  const settle = (page) => page.waitForTimeout(1600); // goalTick runs once a second

  // desktop, Lv 1
  let { ctx, page } = await open({ vp: { width: 1280, height: 720 } });
  await settle(page);
  const a = await read(page);
  check('3. desktop Lv 1 at the shore spawn: the meter shows inside #rw-zone (aria-live polite) as Comfortable with the check icon', a && !a.hidden && a.inZone && a.level === 'comfortable' && a.txt === 'Comfortable' && a.icon === '✓' && a.rect.w > 20 && a.rect.r <= a.vw && a.rect.b <= a.vh, JSON.stringify(a));
  check('3b. a11y: aria-label names the bucket and both levels; icon and bar are aria-hidden', /^Danger here: Comfortable \(area Lv \d+, you Lv 1\)$/.test(a.aria) && a.icoHidden && a.barHidden, a.aria);
  await page.screenshot({ path: path.join(IMG, 'cyc1-danger-desktop-comfortable.jpg'), quality: 70 });
  const g = await moveTo(page, 3); await settle(page);
  const b = await read(page);
  const api = await page.evaluate(() => window.__mm.world.danger());
  check('4. desktop Lv 1 moved into the Godlands: Too hot, skull icon, area Lv >= 15, a different colour AND a different word', b.level === 'hot' && b.txt === 'Too hot' && b.icon === '☠' && Number(b.area) >= 15 && b.color !== a.color && b.txt !== a.txt && Number(b.fill) === 1 && api.now.id === 'hot', JSON.stringify({ g, b }));
  check('4b. motion allowed: the bar fill eases (0.4s)', a.tr === '0.4s', a.tr);
  await page.screenshot({ path: path.join(IMG, 'cyc1-danger-desktop-hot.jpg'), quality: 70 });
  // Tough: a Lv 13 hero in the Highlands near its border (area 10..15)
  await page.evaluate(() => { window.__mm.arena.save.level = 13; }); await moveTo(page, 2); await settle(page);
  const c = await read(page); const cn = await page.evaluate(() => window.__mm.world.danger().now);
  const expect = cn.gap <= 0 ? 'Comfortable' : cn.gap <= 3 ? 'Tough' : 'Too hot';
  check('5. Lv 13 in the Highlands: the label follows the area level (Comfortable when area <= 13, Tough within 3 levels, Too hot above)', c.txt === expect && Number(c.area) >= 10 && Number(c.area) <= 15 && c.aria === `Danger here: ${expect} (area Lv ${c.area}, you Lv 13)`, JSON.stringify({ c, cn }));
  await ctx.close();

  // phone, reduced motion, big text
  ({ ctx, page } = await open({ vp: { width: 390, height: 844 }, phone: true, reduced: true, lv: 1 }));
  await settle(page);
  const p1 = await read(page);
  check('6. phone: the meter is on screen, inline in the one zone line (no extra row), Comfortable', p1 && !p1.hidden && p1.txt === 'Comfortable' && p1.rect.l >= 0 && p1.rect.r <= p1.vw && p1.rect.t >= 0 && p1.zoneH < 24, JSON.stringify(p1));
  check('6b. reduced motion: no fill transition', p1.tr === '0s', p1.tr);
  await moveTo(page, 3); await settle(page);
  await page.screenshot({ path: path.join(IMG, 'cyc1-danger-phone-hot.jpg'), quality: 70 });
  const p2 = await read(page);
  check('6c. phone Lv 1 in the Godlands: Too hot', p2.txt === 'Too hot' && p2.level === 'hot', JSON.stringify(p2));
  await ctx.close();
  ({ ctx, page } = await open({ vp: { width: 1280, height: 720 }, hs: 1.5 }));
  await settle(page);
  const big = await read(page);
  check('7. Text size 1.5: the meter text scales with the HUD (larger than the 11 px default)', big && big.fs > a.fs + 2, `${a.fs} -> ${big && big.fs}`);
  await ctx.close();
  ({ ctx, page } = await open({ vp: { width: 1280, height: 720 }, q: '&danger=0' }));
  await settle(page);
  check('8. ?danger=0: no meter', (await read(page)) === null);
  await ctx.close();
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  check('no DB requests', dbs.every((d) => d.attempts() === 0), dbs.map((d) => d.attempts()).join());
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
