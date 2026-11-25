// Cycle 11 S, ID-54 drag-anywhere move (approved by U, cycle 9 conditions + cycle 10 spec in design/IDEAS.md). Before this change the move
// stick only ever moved the hero from its fixed circle: there was no 'Move from anywhere' row, no mm-move-float pref and no floating start,
// so the settings, Backup and every "floats" check below failed (the "pref off" and "HUD controls" checks held before and must keep holding).
// Real touches (CDP Input.dispatchTouchEvent -> real pointer events) on the Realm world page, offline:
//  - Settings fixture: a touch device shows 'Move from anywhere' (role=switch, aria-checked, a one-line hint); a tap writes mm-move-float=1;
//    a desktop (no touch) does not show the row. MMBackup lists mm-move-float (the ONE Backup carries it).
//  - 390x844 and 844x390, pref ON: a touch on bare ground left of centre, under the top HUD band, moves the stick's centre to the thumb,
//    a drag right moves the hero right, release brings the stick home and zeroes moveVec. A touch-start on each visible HUD control (gear,
//    Daily, abilities, mini-map, bag, board, Menu, Leave) never floats the stick and leaves moveVec at 0 (the control gets the pointerdown);
//    the bag tap really opens the backpack and an ability tap really casts. A touch right of centre or in the top HUD band does not float.
//    The cap is an opaque cream disc in an ink outline; from screenshot pixels, cap fill and outline are measured and, against the Shore
//    sand and grass colours (realm-world PAL) and the ground pixels next to the ring, the better of the two reaches 3:1.
//  - 390x844, pref OFF: a bare-ground touch does nothing (moveVec 0, no float), the fixed stick still drives moveVec as before, and the
//    stick keeps its pixel-art background (no html[data-move-float]).
//  - 195x422, pref ON: ignored (<= 300 px), no float.
//  - The Town's own Realm (main.js binding, offline join, enterRealm) at 390x844 with the pref on: a bare-ground touch floats the stick and
//    a drag drives the Town Realm's moveVec; release brings it home.
// OFFLINE: blockDb + every WebSocket closed + the town page stubbed; literal 0 database attempts.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc11-s-move-float.test.js   (SHOTS=<dir> saves screenshots)
const { chromium } = require('playwright');
const { check, done, blockDb, offlineStub, exposeGame, joinOffline } = require('./helpers');
const LS = require('./lib/load-scale');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = ORIGIN + '/game/games/mad-maze/index.html?mode=world&from=hub&test=1&seed=12345&heropick=0&tutorial=0&qdate=2030-05-01&firstend=0';
const FIX = ORIGIN + '/game/tests/fixtures/settings-fixture.html';
const SHOTS = process.env.SHOTS || '';

const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const lumRgb = (r, g, b) => lum('#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join(''));
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

async function open(browser, w, h, pref) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
  const db = await blockDb(ctx); await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((p) => { try { if (p) localStorage.setItem('mm-move-float', '1'); else localStorage.removeItem('mm-move-float'); } catch (e) { /* ignore */ } }, pref);
  await page.goto(URL);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: LS.budget(40000) });
  await page.evaluate(() => { const a = window.__mm.arena; a.player.iframes = 1e9; a._autoFire = false; });
  await page.waitForTimeout(600); // the HUD settles (goal line, zone strip, Daily)
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y, id: 1 }] });
  return { ctx, page, db, errors, touch };
}
const st = (page) => page.evaluate(() => {
  const b = document.getElementById('realm-stick-move'); const r = b.getBoundingClientRect(); const a = window.__mm.arena;
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, floating: b.classList.contains('mm-floating'), tf: b.style.transform, mv: { x: a.moveVec.x, y: a.moveVec.y },
    px: a.player.x, py: a.player.y, attr: document.documentElement.getAttribute('data-move-float'), bgImg: getComputedStyle(b).backgroundImage.slice(0, 40) };
});
// Independent of the code under test: the free lower-left area = left half, below the lowest visible top-HUD item, elementFromPoint = canvas,
// 12 px clear of every visible control and stick (so a 1 px slip cannot land on one).
const bare = (page) => page.evaluate(() => {
  const W = innerWidth, H = innerHeight; let top = 0;
  ['#realm-hud', '#realm-xp', '#rw-zone', '#rw-goal', '#rw-minimap', '#rw-jhint'].forEach((s) => { const e = document.querySelector(s); if (!e || e.classList.contains('hidden')) return; const r = e.getBoundingClientRect(); if (r.width && r.left < W / 2 && r.top < H / 2) top = Math.max(top, r.bottom); });
  const boxes = [...document.querySelectorAll('button, [role="button"], a[href], .realm-stick, #realm-abilities')].filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden').map((e) => e.getBoundingClientRect());
  const near = (x, y) => boxes.some((q) => x > q.left - 12 && x < q.right + 12 && y > q.top - 12 && y < q.bottom + 12);
  const cands = [];
  for (let y = top + 16; y < H - 16; y += 6) for (let x = 16; x < W / 2 - 16; x += 6) {
    const el = document.elementFromPoint(x, y); if (!el || el.tagName !== 'CANVAS' || near(x, y)) continue;
    cands.push({ x, y, d: Math.abs(y - H * 0.55) + Math.abs(x - W * 0.25) });
  }
  cands.sort((p, q) => p.d - q.d);
  return { top, pt: cands[0] || null, n: cands.length };
});
async function capContrast(page, x, y, tag) {
  const buf = await page.screenshot({ clip: { x: Math.max(0, x - 50), y: Math.max(0, y - 50), width: 100, height: 100 } });
  if (SHOTS) require('fs').writeFileSync(require('path').join(SHOTS, 'cyc11-systems-cap-' + tag + '.png'), buf);
  return page.evaluate(async ({ b64, ox, oy }) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const k = document.querySelector('#realm-stick-move .knob').getBoundingClientRect(); const dpr = img.width / 100;
    const px = (sx, sy) => { const d = g.getImageData(Math.round((sx - ox) * dpr), Math.round((sy - oy) * dpr), 1, 1).data; return [d[0], d[1], d[2]]; };
    const cx = k.left + k.width / 2, cy = k.top + k.height / 2;
    return { fill: px(cx, cy), outline: px(k.right + 1, cy), ground: [px(k.right + 10, cy), px(k.left - 10, cy), px(cx, k.bottom + 10), px(cx, k.top - 10)], knob: k.width };
  }, { b64: buf.toString('base64'), ox: Math.max(0, x - 50), oy: Math.max(0, y - 50) });
}

(async () => {
  const browser = await chromium.launch();
  // ---- Settings row + Backup ----
  for (const touchDev of [true, false]) {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 } }, touchDev ? { hasTouch: true, isMobile: true } : {}));
    const db = await blockDb(ctx); const page = await ctx.newPage();
    await page.addInitScript(() => { if (!sessionStorage.s) { sessionStorage.s = 1; localStorage.clear(); } });
    await page.goto(FIX); await page.waitForFunction(() => window.__set && document.getElementById('mmset'));
    await page.evaluate(() => window.__set.open());
    const row = () => page.evaluate(() => { const b = document.getElementById('mmset-move-float'); if (!b) return null; const r = b.getBoundingClientRect();
      return { role: b.getAttribute('role'), checked: b.getAttribute('aria-checked'), text: b.textContent, h: r.height, group: b.closest('[data-group]') && b.closest('[data-group]').getAttribute('data-group'), key: localStorage.getItem('mm-move-float') }; });
    const r0 = await row();
    if (touchDev) {
      check('settings (touch): "Move from anywhere" row in Play, role=switch, aria-checked=false, one-line hint, >= 44 px', !!r0 && r0.role === 'switch' && r0.checked === 'false' && r0.group === 'play'
        && /Move from anywhere/.test(r0.text) && /starts where your thumb lands/.test(r0.text) && r0.h >= 44, JSON.stringify(r0));
      if (r0) await page.tap('#mmset-move-float');
      const r1 = await row();
      check('settings (touch): a tap turns it on: aria-checked=true and mm-move-float=1', !!r1 && r1.checked === 'true' && r1.key === '1', JSON.stringify(r1));
      const bk = await page.evaluate(async () => {
        if (!window.MMBackup) { await new Promise((res) => { const s = document.createElement('script'); s.src = '../../shared/mm-backup.js'; s.onload = res; s.onerror = res; document.head.appendChild(s); }); }
        try { const bun = JSON.stringify(MMBackup.bundle(localStorage)); return { flag: MMBackup.FLAG_KEYS.indexOf('mm-move-float') >= 0, ok: MMBackup.FLAG_KEYS.indexOf('mm-move-float') >= 0 && /mm-move-float/.test(bun), bun: bun.slice(0, 200) }; } catch (e) { return { err: e.message }; }
      });
      check('Backup: mm-move-float is a Backup flag key and a real bundle() carries it', bk.ok === true, JSON.stringify(bk).slice(0, 300));
    } else {
      check('settings (desktop, no touch): no "Move from anywhere" row', r0 === null, JSON.stringify(r0));
    }
    check('settings fixture (' + (touchDev ? 'touch' : 'desktop') + '): 0 database attempts', db.attempts() === 0, String(db.attempts()));
    await ctx.close();
  }

  // ---- pref ON at 390x844 and 844x390 ----
  for (const [w, h] of [[390, 844], [844, 390]]) {
    const name = w + 'x' + h; const s = await open(browser, w, h, true); const { page, touch } = s;
    const home = await st(page); const b = await bare(page);
    check(name + ': option active (html[data-move-float]) and the ring look replaces the pixel-art stick', home.attr === '1' && home.bgImg === 'none', JSON.stringify(home));
    check(name + ': found a bare-ground point (canvas, left half, under the top HUD band at y ' + Math.round(b.top) + ')', !!b.pt, JSON.stringify(b));
    if (b.pt) {
      const { x, y } = b.pt;
      await touch('touchStart', x, y); await page.waitForTimeout(80);
      const s1 = await st(page);
      check(name + ': a touch on bare ground moves the stick centre to the thumb (' + x + ',' + y + ') with moveVec 0', s1.floating && Math.abs(s1.cx - x) <= 2 && Math.abs(s1.cy - y) <= 2 && Math.abs(s1.mv.x) < 0.05 && Math.abs(s1.mv.y) < 0.05, JSON.stringify(s1));
      if (SHOTS) await page.screenshot({ path: require('path').join(SHOTS, 'cyc11-systems-float-' + name + '.jpg'), quality: 70 });
      const cc = await capContrast(page, x, y, name);
      const hex = (p) => '#' + p.map((v) => v.toString(16).padStart(2, '0')).join('');
      const Lf = lumRgb(...cc.fill), Lo = lumRgb(...cc.outline);
      const best = (Lg) => Math.max(ratio(Lf, Lg), ratio(Lo, Lg));
      const pal = { sand: ['#e8d7a1', '#dccb8f', '#f1e2b3', '#b9a676'], grass: ['#5fae4e', '#55a145', '#6bba5a', '#3f7f33'] };
      const palMin = Math.min(...[].concat(pal.sand, pal.grass).map((c) => best(lum(c))));
      const grMin = Math.min(...cc.ground.map((p) => best(lumRgb(...p))));
      check(name + ': cap is opaque cream (' + hex(cc.fill) + ') in a dark outline (' + hex(cc.outline) + ')', lumRgb(...cc.fill) > 0.75 && lumRgb(...cc.outline) < 0.05, JSON.stringify(cc));
      check(name + ': cap vs Shore sand + grass >= 3:1 (worst ' + palMin.toFixed(2) + ') and vs the ground next to it (worst ' + grMin.toFixed(2) + ', ' + cc.ground.map(hex).join(' ') + ')', palMin >= 3 && grMin >= 3);
      await touch('touchMove', x + 40, y); await page.waitForTimeout(500);
      const s2 = await st(page);
      check(name + ': dragging right from there drives the hero right (moveVec.x ' + s2.mv.x.toFixed(2) + ', moved ' + Math.round(s2.px - s1.px) + ' px)', s2.mv.x > 0.6 && s2.px - s1.px > 6, JSON.stringify(s2));
      await touch('touchEnd'); await page.waitForTimeout(80);
      const s3 = await st(page);
      check(name + ': release: the stick goes home and moveVec is 0', !s3.floating && s3.tf === '' && Math.abs(s3.cx - home.cx) <= 1 && Math.abs(s3.cy - home.cy) <= 1 && s3.mv.x === 0 && s3.mv.y === 0, JSON.stringify(s3));
    }
    // right of centre / in the top band: no float
    for (const [lab, px, py] of [['right of centre', Math.round(w * 0.62), Math.round(h * 0.55)], ['top HUD band', Math.round(w * 0.2), Math.max(4, Math.round(b.top - 6))]]) {
      const el = await page.evaluate(([a, c]) => { const e = document.elementFromPoint(a, c); return e ? (e.id || e.tagName) : null; }, [px, py]);
      await touch('touchStart', px, py); await page.waitForTimeout(60); const q = await st(page); await touch('touchEnd'); await page.waitForTimeout(40);
      check(name + ': a touch ' + lab + ' (' + px + ',' + py + ' on ' + el + ') does not float the stick', !q.floating && q.mv.x === 0 && q.mv.y === 0, JSON.stringify(q));
    }
    // each HUD control keeps its touch
    const ids = ['mm-gear-btn', 'mm-daily-btn', 'realm-ab-0', 'realm-ab-1', 'realm-ab-2', 'realm-ab-3', 'rw-minimap', 'realm-bp-btn', 'realm-board-btn', 'realm-menu-btn', 'realm-leave-btn'];
    const seen = [];
    for (const id of ids) {
      const c = await page.evaluate((id) => {
        const e = document.getElementById(id); if (!e || !e.getClientRects().length || getComputedStyle(e).visibility === 'hidden') return null;
        const r = e.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; const hit = document.elementFromPoint(x, y);
        window.__pd = null; window.addEventListener('pointerdown', (ev) => { window.__pd = ev.target && (ev.target.id || (ev.target.closest('[id]') || {}).id); }, { once: true, capture: true });
        return { x, y, top: !!hit && (hit === e || e.contains(hit)) };
      }, id);
      if (!c || !c.top) continue; // hidden here, or covered by another control (the a11y sweep owns overlaps)
      await touch('touchStart', c.x, c.y); await page.waitForTimeout(60);
      const q = await st(page); const pd = await page.evaluate(() => window.__pd);
      await touch('touchCancel'); await page.waitForTimeout(40);
      seen.push(id);
      check(name + ': touch-start on #' + id + ' reaches the control, never floats the stick, moveVec stays 0', pd === id && !q.floating && q.mv.x === 0 && q.mv.y === 0, JSON.stringify({ pd, q }));
    }
    check(name + ': the HUD control sweep covered the abilities, bag and Leave at least (' + seen.join(' ') + ')', ['realm-ab-0', 'realm-bp-btn', 'realm-leave-btn'].every((i) => seen.indexOf(i) >= 0), seen.join());
    // real activations: an ability casts, the bag opens
    const ab = await page.evaluate(() => { const r = document.getElementById('realm-ab-0').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    const cd0 = await page.evaluate(() => JSON.stringify(window.__mm.arena.abilityCd));
    await touch('touchStart', ab.x, ab.y); await touch('touchEnd'); await page.waitForTimeout(120);
    const cd1 = await page.evaluate(() => JSON.stringify(window.__mm.arena.abilityCd));
    const abState = await st(page);
    check(name + ': a real tap on ability 1 casts it (cooldown state changed) and the stick stays home', cd0 !== cd1 && !abState.floating && abState.mv.x === 0, cd0 + ' -> ' + cd1);
    const bp = await page.evaluate(() => { const r = document.getElementById('realm-bp-btn').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await touch('touchStart', bp.x, bp.y); await touch('touchEnd'); await page.waitForTimeout(250);
    const bpOpen = await page.evaluate(() => !document.getElementById('realm-backpack').classList.contains('hidden'));
    check(name + ': a real tap on the bag opens the backpack', bpOpen);
    check(name + ': no page errors', s.errors.length === 0, s.errors.join(' | '));
    check(name + ': 0 database attempts', s.db.attempts() === 0, String(s.db.attempts()));
    await s.ctx.close();
  }

  // ---- pref OFF at 390x844: exactly as before ----
  {
    const s = await open(browser, 390, 844, false); const { page, touch } = s;
    const home = await st(page); const b = await bare(page);
    check('390x844 pref off: no html[data-move-float], the stick keeps its pixel-art ring', home.attr === null && home.bgImg !== 'none', JSON.stringify(home));
    if (b.pt) {
      await touch('touchStart', b.pt.x, b.pt.y); await page.waitForTimeout(60); const q = await st(page); await touch('touchEnd'); await page.waitForTimeout(40);
      check('390x844 pref off: a bare-ground touch does not move the stick or the hero (moveVec 0)', !q.floating && q.mv.x === 0 && q.mv.y === 0 && Math.abs(q.cx - home.cx) <= 1, JSON.stringify(q));
    } else check('390x844 pref off: found a bare-ground point', false, JSON.stringify(b));
    await touch('touchStart', home.cx, home.cy); await touch('touchMove', home.cx + 60, home.cy); await page.waitForTimeout(80);
    const f = await st(page); await touch('touchEnd'); await page.waitForTimeout(60); const f2 = await st(page);
    check('390x844 pref off: the fixed stick still drives moveVec (x ' + f.mv.x.toFixed(2) + ') from its home spot, and resets on release', f.mv.x > 0.95 && !f.floating && Math.abs(f.cx - home.cx) <= 1 && f2.mv.x === 0, JSON.stringify([f, f2]));
    check('390x844 pref off: 0 database attempts, no page errors', s.db.attempts() === 0 && s.errors.length === 0, s.db.attempts() + ' ' + s.errors.join(' | '));
    await s.ctx.close();
  }

  // ---- 195x422 pref ON: ignored ----
  {
    const s = await open(browser, 195, 422, true); const { page, touch } = s;
    const home = await st(page); const b = await bare(page);
    check('195x422 pref on: ignored at <= 300 px (no html[data-move-float], pixel-art stick kept)', home.attr === null && home.bgImg !== 'none', JSON.stringify(home));
    const pt = b.pt || { x: 30, y: Math.round(b.top + 8) };
    await touch('touchStart', pt.x, pt.y); await page.waitForTimeout(60); const q = await st(page); await touch('touchEnd');
    check('195x422 pref on: a touch on the field does not float the stick', !q.floating && q.mv.x === 0 && q.mv.y === 0, JSON.stringify({ pt, q }));
    if (SHOTS) await page.screenshot({ path: require('path').join(SHOTS, 'cyc11-systems-195x422.jpg'), quality: 70 });
    check('195x422: 0 database attempts, no page errors', s.db.attempts() === 0 && s.errors.length === 0, s.db.attempts() + ' ' + s.errors.join(' | '));
    await s.ctx.close();
  }
  // ---- the Town's Realm (main.js) at 390x844, pref ON ----
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const db = await offlineStub(ctx); const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await exposeGame(page);
    await page.addInitScript(() => { try { localStorage.setItem('mm-move-float', '1'); } catch (e) { /* ignore */ } });
    await page.goto(ORIGIN + '/game/index.html');
    await joinOffline(page, 'ADMINfloat');
    await page.evaluate(() => { const s = window.__g.scene.getScene('Town'); s.localBody.setPosition(REALM_GATE_POS.x, REALM_GATE_POS.y + 30); s.enterRealm(); });
    await page.waitForFunction(() => { const r = window.__g.scene.getScene('Town').realm; return r && r.active && (r.state === 'play' || r.state === 'banner'); }, null, { timeout: LS.budget(20000) });
    await page.waitForTimeout(400);
    const rs = () => page.evaluate(() => { const b = document.getElementById('realm-stick-move'); const r = b.getBoundingClientRect(); const m = window.__g.scene.getScene('Town').realm.moveVec;
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, floating: b.classList.contains('mm-floating'), mv: { x: m.x, y: m.y }, attr: document.documentElement.getAttribute('data-move-float') }; });
    const home = await rs(); const b = await bare(page);
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    check('Town Realm 390x844: the option is active and a bare-ground point exists', home.attr === '1' && !!b.pt, JSON.stringify({ home, b }));
    if (b.pt) {
      await touch('touchStart', b.pt.x, b.pt.y); await page.waitForTimeout(60); const q1 = await rs();
      await touch('touchMove', b.pt.x, b.pt.y + 40); await page.waitForTimeout(60); const q2 = await rs();
      if (SHOTS) await page.screenshot({ path: require('path').join(SHOTS, 'cyc11-systems-town-realm-390x844.jpg'), quality: 70 });
      await touch('touchEnd'); await page.waitForTimeout(60); const q3 = await rs();
      check('Town Realm 390x844: a bare-ground touch floats the stick to the thumb, a drag down drives moveVec.y, release goes home',
        q1.floating && Math.abs(q1.cx - b.pt.x) <= 2 && Math.abs(q1.cy - b.pt.y) <= 2 && q2.mv.y > 0.6 && !q3.floating && Math.abs(q3.cx - home.cx) <= 1 && q3.mv.y === 0, JSON.stringify([q1, q2, q3]));
    }
    check('Town Realm 390x844: 0 database attempts, no page errors', db.attempts() === 0 && errors.length === 0, db.attempts() + ' ' + errors.join(' | '));
    await ctx.close();
  }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
