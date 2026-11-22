// AR (NEXT-SLICES-3 Wave 4): Realm access, part 2 (realm.js enableAccess2, opted into by the Mad Maze page only).
//  1. One-thumb mode: auto-fire aims at the nearest enemy in range and fires with NO aim input (the move stick alone kills an enemy); off = no shots.
//  2. "Hold to aim" -> toggle: a dragged aim stick stays latched after release, a tap lets go; off = hold-to-fire as before. Mouse click latches too.
//  3. Bullet shapes: enemy bullets differ by SHAPE (alpha mask), not only by colour, in every MMAccess.PALETTES entry, in the palette colours,
//     outline on the shape; every palette passes MMAccess.passesContrast. Baked once per pref change (cached canvases, never per frame).
//  4. Shared text scale (pixeltown-access-v1 hudScale): reaches the Realm HUD text (zone line, ability labels, banner, canvas combat text,
//     --ui-scale on <html>) while the 44 px buttons stay on screen at 390x844.
//  5. Unchanged where it must be: ?access2=0 (the code path of the Town classic arena, which never calls enableAccess2) and duels (team.isPvp):
//     runtime spies see no auto-fire search, no latch, no shape bake, the 14 px font.
//  6. No per-frame churn: CDP sampling heap profiler over the auto-fire search and the aim-stick path (as in arena-p2-hotpath.test.js) sees 0 B;
//     a control proves the probe sees allocations. 0 console errors, 0 DB traffic (blockDb + WebSockets closed).
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/realm-access2.test.js
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&seed=12345';
const SAVE = 'pixeltown-save-v1', ACC = 'pixeltown-access-v1';
const RM = { level: 4, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 } };

async function open(browser, query, store, desktop) {
  const ctx = await browser.newContext(desktop ? { viewport: { width: 1000, height: 700 } } : { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const db = await blockDb(ctx);
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
  await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('mm-aim-assist', '0'); Object.keys(s).forEach((k) => localStorage.setItem(k, s[k])); }, Object.assign({ [SAVE]: JSON.stringify({ realm: RM }) }, store || {}));
  errors.length = 0;
  await page.goto(WORLD + (query || ''));
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
  await E(page, (a) => { a.player.iframes = 1e9; a._hitPlayer = () => {}; a.eBullets.forEach((b) => { b.active = false; }); a.enemies.forEach((e) => { e.active = false; }); a.paused = true; });
  return { ctx, page, errors, db };
}
const E = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, ${JSON.stringify(arg)})`);
// one enemy at (dx, 0) from the player, no input at all, then `sec` of simulated frames; returns what happened
const sim = (page, dx, sec, hp) => E(page, (a, arg) => {
  const p = a.player; a.enemies.forEach((e) => { e.active = false; }); a.pBullets.forEach((b) => { b.active = false; });
  a.keys = {}; a.moveVec.x = 0; a.moveVec.y = 0; a.mouse.down = false; a.mouse.seen = false; a.aimVec.on = false;
  let ux = 1, uy = 0; // a clear line of fire (world tiles such as trees absorb bolts): the first of 16 headings with no solid tile on it
  for (let k = 0; k < 16; k++) { const an = k * Math.PI / 8; const cx = Math.cos(an), cy = Math.sin(an); let ok = true;
    for (let d = 8; d <= arg.dx + 20 && ok; d += 6) if (a._shotSolidAt && a._shotSolidAt(p.x + cx * d, p.y + cy * d)) ok = false;
    if (ok) { ux = cx; uy = cy; break; } }
  const e = a.spawnEnemy('aimed', p.x + ux * arg.dx, p.y + uy * arg.dx); if (!e) return null;
  e.hp = e.maxHp = arg.hp || 4; e.spdMul = 0; e.cd = 1e9; e.cd2 = 1e9;
  a.paused = false; let shots = 0, t = 0, f0 = a.autoFireN; let killedAt = -1;
  for (let i = 0; i < arg.sec * 60; i++) { a._update(1 / 60); t += 1 / 60; shots += a._firing ? 1 : 0; if (!e.active && killedAt < 0) { killedAt = t; break; } }
  a.paused = true;
  return { killedAt, shots, picks: a.autoFireN - f0, alive: e.active };
}, { dx, sec, hp });

(async () => {
  const browser = await chromium.launch();
  const errs = []; let dbHits = 0;

  // ---------- 1 + 2: one-thumb auto-fire, aim toggle, settings sheet ----------
  { const A = await open(browser); const page = A.page;
    const c0 = await E(page, (a) => a.access2());
    check('the Mad Maze Realm opts into access2; every new pref starts off', c0.on && !c0.autoFire && !c0.aimToggle && !c0.shapes && !c0.oneThumb, JSON.stringify(c0));
    const off = await sim(page, 150, 3);
    check('auto-fire off: an enemy in range and no aim input -> no shots (as before)', off && off.shots === 0 && off.alive && off.picks === 0, JSON.stringify(off));
    const c1 = await E(page, (a) => a.setOneThumb(true));
    check('one-thumb mode turns on auto-fire and the aim toggle (saved per device, not in the save)', c1.oneThumb && c1.autoFire && c1.aimToggle
      && await page.evaluate(() => localStorage.getItem('mm-auto-fire') === '1' && localStorage.getItem('mm-aim-toggle') === '1' && !/autoFire|aimToggle/.test(localStorage.getItem('pixeltown-save-v1'))), JSON.stringify(c1));
    const on = await sim(page, 150, 20);
    check('one-thumb: with only the move stick (no aim input) the nearest enemy in range is shot down', on && on.killedAt > 0 && on.killedAt < 10 && on.picks > 0, JSON.stringify(on));
    const far = await sim(page, 700, 2);
    check('auto-fire holds fire when no enemy is in range (calm: no wasted volleys)', far && far.shots === 0 && far.picks === 0, JSON.stringify(far));
    const tg = await E(page, (a) => {
      a.paused = false; a.enemies.forEach((e) => { e.active = false; }); a.setAutoFire(false);
      const step = () => { a._update(1 / 60); return a._firing; };
      a.setAimStick(0.3, 0.6, true); a.setAimStick(0.8, 0, true); const held = step(); a.setAimStick(0, 0, false); // drag then release
      const latched = [step(), step(), step()].every(Boolean) && a.aimVec.on && Math.abs(Math.atan2(a.aimVec.y, a.aimVec.x)) < 0.01;
      a.setAimStick(0.05, 0.05, true); a.setAimStick(0, 0, false); const afterTap = step(); // a tap lets go
      a.setAimToggle(false);
      a.setAimStick(0.8, 0, true); const hold = step(); a.setAimStick(0, 0, false); const released = step(); // hold-to-fire again
      a.paused = true;
      return { held, latched, afterTap, hold, released };
    });
    check('aim toggle: a dragged aim stick keeps aiming and firing that way after release', tg.held && tg.latched, JSON.stringify(tg));
    check('aim toggle: a short tap on the aim stick lets go (firing stops)', tg.afterTap === false, JSON.stringify(tg));
    check('aim toggle off: the aim stick is hold-to-fire again (release stops)', tg.hold && tg.released === false, JSON.stringify(tg));
    const ms = await E(page, (a) => { a.setAimToggle(true); const c = a.canvas; const ev = (t) => new PointerEvent(t, { pointerType: 'mouse', clientX: 10, clientY: 10, bubbles: true });
      c.dispatchEvent(ev('pointerdown')); window.dispatchEvent(ev('pointerup')); const d1 = a.mouse.down; c.dispatchEvent(ev('pointerdown')); window.dispatchEvent(ev('pointerup')); const d2 = a.mouse.down;
      a.setAimToggle(false); c.dispatchEvent(ev('pointerdown')); const d3 = a.mouse.down; window.dispatchEvent(ev('pointerup')); return { d1, d2, d3, d4: a.mouse.down }; });
    check('aim toggle with a mouse: one click latches fire, the next lets go; off = hold as before', ms.d1 === true && ms.d2 === false && ms.d3 === true && ms.d4 === false, JSON.stringify(ms));
    // the settings sheet
    await E(page, (a) => { a.setOneThumb(false); a.setBulletShapes(false); });
    await page.evaluate(() => window.__mmAccess.open());
    const sheet = await page.evaluate(() => Array.from(document.querySelectorAll('#mm-settings button[data-ax]')).filter((b) => /^(oneThumb|autoFire|aimToggle|shapes)$/.test(b.dataset.ax)).map((b) => { const r = b.getBoundingClientRect(); return { k: b.dataset.ax, t: b.textContent, h: r.height, w: r.width, p: b.getAttribute('aria-pressed') }; }));
    check('the settings sheet has 44 px toggles for one-thumb, auto-fire, aim toggle and bullet shapes (aria-pressed)', sheet.length === 4 && sheet.every((b) => b.h >= 44 && b.w >= 44 && b.p === 'false'), JSON.stringify(sheet));
    await page.click('#mm-settings button[data-ax="oneThumb"]');
    const after = await E(page, (a) => Object.assign(a.access2(), { p: document.querySelector('#mm-settings button[data-ax="oneThumb"]').getAttribute('aria-pressed') }));
    check('tapping One-thumb mode in the sheet turns it on', after.oneThumb && after.p === 'true', JSON.stringify(after));
    await page.reload(); await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active, null, { timeout: 30000 });
    check('one-thumb mode survives a reload', (await E(page, (a) => a.access2().oneThumb)) === true);
    errs.push(...A.errors); dbHits += A.db.attempts(); await A.ctx.close(); }

  // ---------- 3: bullet shapes in every palette ----------
  { const A = await open(browser); const page = A.page;
    const r = await E(page, (a) => {
      const mask = (c) => { const d = c.getContext('2d').getImageData(0, 0, 16, 16).data; let s = ''; for (let i = 3; i < d.length; i += 4) s += d[i] > 127 ? '1' : '0'; return s; };
      const px = (c, x, y) => { const d = c.getContext('2d').getImageData(x, y, 1, 1).data; return '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('') + ':' + d[3]; };
      const out = {}; const base = a._ebCB;
      const run = (name, shapes) => {
        localStorage.setItem('pixeltown-access-v1', JSON.stringify({ v: 1, palette: name, bulletOutline: true })); a.setBulletShapes(shapes); a.refreshAccess();
        const cb = a._ebCB; if (!cb) return null; const m = cb.map(mask); const pal = MMAccess.palette(name);
        return { key: a._ebCBKey, distinct: m[0] !== m[1] && m[1] !== m[2] && m[0] !== m[2], aim: px(cb[0], 8, 8), spi: px(cb[1], 8, 8), ring: px(cb[2], 8, 8), ringBody: px(cb[2], 8, 3), want: [pal.bullet, pal.enemy], contrast: MMAccess.passesContrast(name), rim: px(cb[1], 8, 1) };
      };
      MMAccess.names().forEach((n) => { out[n] = run(n, true); });
      out.cbNoToggle = MMAccess.names().filter((n) => n !== 'normal').map((n) => run(n, false));
      localStorage.setItem('pixeltown-access-v1', JSON.stringify({ v: 1 })); a.setBulletShapes(false); a.refreshAccess();
      out.defaultNull = a._ebCB === null && base === null;
      return out;
    });
    const names = Object.keys(r).filter((k) => k !== 'cbNoToggle' && k !== 'defaultNull');
    check('bullet shapes: all 4 MMAccess palettes covered', names.length === 4 && names.every((n) => r[n]), JSON.stringify(names));
    check('bullet shapes: aimed / spiral / ring have three different alpha masks (dot, diamond, hollow ring) in every palette', names.every((n) => r[n].distinct), JSON.stringify(names.map((n) => r[n].distinct)));
    check('bullet shapes: filled in the palette colours (aimed = bullet, spiral = enemy) and the ring is hollow', names.every((n) => r[n].aim === r[n].want[0] + ':255' && r[n].spi === r[n].want[1] + ':255' && /:0$/.test(r[n].ring) && /:255$/.test(r[n].ringBody)), JSON.stringify(names.map((n) => [r[n].aim, r[n].spi, r[n].ring, r[n].want])));
    check('bullet shapes: the outline follows the shape (dark rim on the diamond tip)', names.every((n) => { const h = r[n].rim; return [1, 3, 5].every((i) => parseInt(h.substr(i, 2), 16) < 48) && Number(h.split(':')[1]) > 100; }), JSON.stringify(names.map((n) => r[n].rim)));
    check('every palette passes MMAccess.passesContrast', names.every((n) => r[n].contrast), JSON.stringify(names.map((n) => r[n].contrast)));
    check('a colour-blind palette gets the shapes even with the toggle off', r.cbNoToggle.length === 3 && r.cbNoToggle.every((x) => x && x.distinct && /^shape\|/.test(x.key)), JSON.stringify(r.cbNoToggle.map((x) => x && x.key)));
    check('default prefs (normal palette, shapes off): no baked override, today\'s bullet art', r.defaultNull, String(r.defaultNull));
    // cached: 120 frames re-bake nothing and rebuild no font string
    const cache = await E(page, (a) => { a.setBulletShapes(true); a.refreshAccess(); const cb = a._ebCB, f = a._txtFont; a.paused = false; let same = true;
      for (let i = 0; i < 180; i++) { a._update(1 / 60); if (a._ebCB !== cb || a._txtFont !== f) same = false; } a.paused = true; return { same, n: cb && cb.length }; });
    check('the shape sprites and the text font are baked once per pref change (180 frames incl. 3 once-a-second re-reads: same objects)', cache.same && cache.n === 3, JSON.stringify(cache));
    errs.push(...A.errors); dbHits += A.db.attempts(); await A.ctx.close(); }

  // ---------- 4: shared text scale reaches the Realm HUD ----------
  const hudRead = (page) => page.evaluate(() => {
    const fs = (sel) => { const e = document.querySelector(sel); return e ? parseFloat(getComputedStyle(e).fontSize) : null; };
    const abs = Array.from(document.querySelectorAll('.realm-ab, #realm-bp-btn, #realm-board-btn, #mm-gear-btn')).filter((b) => b.getClientRects().length).map((b) => { const r = b.getBoundingClientRect(); return { id: b.id || b.className, h: r.height, w: r.width, l: r.left, r: r.right, t: r.top, b: r.bottom }; });
    return { zone: fs('#rw-zone'), key: fs('.realm-ab .key'), cd: fs('.realm-ab .cd'), banner: fs('#realm-banner'), ui: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim(), font: window.__mm.arena._txtFont, abs, vw: innerWidth, vh: innerHeight, sw: document.documentElement.scrollWidth };
  });
  { const A = await open(browser, '', { [ACC]: JSON.stringify({ v: 1, hudScale: 1 }) }); const h1 = await hudRead(A.page);
    const B = await open(browser, '', { [ACC]: JSON.stringify({ v: 1, hudScale: 1.5 }) }); const h2 = await hudRead(B.page);
    check('text scale 1.5: the zone line, ability key and cooldown labels and the banner grow 1.5x (base sizes unchanged at 1)', h1.zone > 0 && Math.abs(h2.zone - 18) < 0.6 && Math.abs(h2.key - h1.key * 1.5) < 0.6 && Math.abs(h2.cd - h1.cd * 1.5) < 0.6 && Math.abs(h2.banner - h1.banner * 1.5) < 0.8, JSON.stringify({ h1: [h1.zone, h1.key, h1.cd, h1.banner], h2: [h2.zone, h2.key, h2.cd, h2.banner] }));
    check('text scale: the shared --ui-scale variable is set on <html> and the canvas combat text follows it (14 px -> 21 px)', h1.ui === '1' && h2.ui === '1.5' && h1.font === 'bold 14px system-ui, sans-serif' && h2.font === 'bold 21px system-ui, sans-serif', JSON.stringify({ u1: h1.ui, u2: h2.ui, f1: h1.font, f2: h2.font }));
    check('text scale 1.5 at 390x844: every HUD button stays >= 44 px and on screen, no horizontal scroll', h2.abs.length >= 6 && h2.abs.every((b) => b.h >= 44 && b.w >= 44 && b.l >= 0 && b.r <= h2.vw + 0.5 && b.t >= 0 && b.b <= h2.vh + 0.5) && h2.sw <= h2.vw, JSON.stringify(h2.abs.filter((b) => b.h < 44 || b.l < 0 || b.r > h2.vw || b.b > h2.vh)));
    const live = await B.page.evaluate(() => { window.__mmAccess.set('hudScale', 1); return { f: window.__mm.arena._txtFont, ui: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim() }; });
    check('changing the HUD size in settings applies at once (no reload)', live.f === 'bold 14px system-ui, sans-serif' && live.ui === '1', JSON.stringify(live));
    errs.push(...A.errors, ...B.errors); dbHits += A.db.attempts() + B.db.attempts(); await A.ctx.close(); await B.ctx.close(); }

  // ---------- 5: unchanged without the opt-in (Town classic arena path) and in duels ----------
  { const allOn = { 'mm-auto-fire': '1', 'mm-aim-toggle': '1', 'mm-bullet-shapes': '1', [ACC]: JSON.stringify({ v: 1, hudScale: 1.5 }) };
    const A = await open(browser, '&access2=0', allOn); const page = A.page;
    await E(page, (a) => { window.__afSpy = 0; const f = a._autoFireTarget; a._autoFireTarget = function () { window.__afSpy++; return f.call(this); }; });
    const s0 = await sim(page, 150, 3);
    const st = await E(page, (a) => { a.paused = false; a.setAimStick(0.8, 0, true); a._update(1 / 60); a.setAimStick(0, 0, false); a._update(1 / 60); const rel = a._firing; a.paused = true; a.refreshAccess();
      return { on: a.access2().on, spy: window.__afSpy, rel, cb: a._ebCB, key: a._ebCBKey, font: a._txtFont }; });
    check('without the opt-in (?access2=0, the Town classic arena path) the prefs do nothing: no auto-fire search, no shots, hold-to-fire, today\'s bullets, 14 px text', !st.on && st.spy === 0 && s0.shots === 0 && st.rel === false && st.cb === null && st.key === '' && st.font === 'bold 14px system-ui, sans-serif', JSON.stringify({ st, s0 }));
    const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
    check('the Town page never opts in (main.js does not call enableAccess2)', !/enableAccess2/.test(src));
    errs.push(...A.errors); dbHits += A.db.attempts(); await A.ctx.close();
    const B = await open(browser, '', allOn); const pb = B.page;
    const duel = await E(pb, (a) => { window.__afSpy = 0; const f = a._autoFireTarget; a._autoFireTarget = function () { window.__afSpy++; return f.call(this); };
      const on0 = a.access2().on; const key0 = a._ebCBKey; a.team = { isPvp: true }; a.refreshAccess(); a.setAimStick(0.8, 0, true); a.setAimStick(0, 0, false);
      const r = { on0, key0, on: a.access2().on, latch: a.aimVec.on, key: a._ebCBKey, cb: a._ebCB, font: a._txtFont, spy: window.__afSpy };
      a.team = null; a.refreshAccess(); r.back = a._ebCBKey; return r; });
    check('duels (team.isPvp): one-thumb, the aim latch, bullet shapes and the text scale are all off', duel.on0 && /^shape\|/.test(duel.key0) && !duel.on && duel.latch === false && duel.key === '' && duel.cb === null && duel.font === 'bold 14px system-ui, sans-serif' && duel.spy === 0 && /^shape\|/.test(duel.back), JSON.stringify(duel));
    errs.push(...B.errors); dbHits += B.db.attempts(); await B.ctx.close(); }

  // ---------- 6: no per-frame allocation in the auto-fire search and the aim-stick path ----------
  { const A = await open(browser, '', { 'mm-auto-fire': '1', 'mm-aim-toggle': '1' }); const page = A.page;
    await E(page, (a) => { const p = a.player; for (let i = 0; i < 24; i++) { const e = a.spawnEnemy(['spiral', 'aimed', 'ring'][i % 3], p.x + 60 + (i % 6) * 40, p.y - 80 + Math.floor(i / 6) * 40); if (e) { e.spdMul = 0; e.cd = 1e9; e.cd2 = 1e9; } }
      window.__AF = (N) => { let k = 0; for (let i = 0; i < N; i++) { if (a._autoFireTarget()) k++; a.setAimStick(0.8, 0.1, true); a.setAimStick(0, 0, false); } return k; };
      window.__AFc = (N) => { for (let i = 0; i < N; i++) a._calcStats({ noGear: true }); };
      window.__AF(20000); });
    const cdp = await A.ctx.newCDPSession(page);
    await cdp.send('HeapProfiler.enable');
    const sample = async (fn, N) => {
      await cdp.send('HeapProfiler.collectGarbage');
      await cdp.send('HeapProfiler.startSampling', { samplingInterval: 16, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
      await page.evaluate(([f, k]) => window[f](k), [fn, N]);
      const { profile } = await cdp.send('HeapProfiler.stopSampling');
      const hits = {}; let n = 0;
      const walk = (nd, inPath) => { const nm = nd.callFrame.functionName; const ip = inPath || /^(_autoFireTarget|setAimStick|_calcStats)$/.test(nm); if (ip && nd.selfSize > 0) { n += nd.selfSize; hits[nm] = (hits[nm] || 0) + nd.selfSize; } nd.children.forEach((c) => walk(c, ip)); };
      walk(profile.head, false);
      return { bytes: n, hits };
    };
    const ctl = await sample('__AFc', 400);
    await sample('__AF', 50000);
    const N = 100000; let sp = null; for (let k = 0; k < 3; k++) { const x = await sample('__AF', N); if (!sp || x.bytes < sp.bytes) sp = x; } // best of 3: a JIT tier-up on a busy machine can box a few doubles once
    console.log(`access2 heap sampling: ${sp.bytes} B over ${N} auto-fire searches + aim latch cycles ${JSON.stringify(sp.hits)} | control ${ctl.bytes} B`);
    check('alloc probe: the probe sees allocations (control: _calcStats)', ctl.bytes > 0, JSON.stringify(ctl));
    // Any object, array, closure or string per call would cost >= 16 B per call; what V8 may still sample is the odd 12-byte box of a double (the
    // smoothed numbers), far below that, as in arena-p2-hotpath.test.js.
    check('no per-frame object churn: the auto-fire search (24 enemies) and the aim latch make no objects (< 2 B per call, an object would be >= 16 B)', sp.bytes / N < 2, JSON.stringify(sp));
    errs.push(...A.errors); dbHits += A.db.attempts(); await A.ctx.close(); }

  check('0 console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  check('0 database requests or sockets', dbHits === 0, String(dbHits));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
