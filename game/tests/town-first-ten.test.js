// QT (NEXT-SLICES-3): the Town first-ten-minutes gate, OFFLINE only. Every database host is blocked (blockDb: http route + routeWebSocket),
// the Firebase SDK scripts are answered with an empty stub (the nav-town.test.js pattern) so the page never opens a database socket, and
// the player enters through the existing "Play offline" path as ADMINftue. The test never chats and never writes to Firebase.
// Profiles (tests/fixtures/town-ftue-profiles.json): 390x844 touch + coarse pointer, and 1280x720 desktop. Deterministic: Math.random is a
// fixed-seed generator and Date.now is pinned (a fixed day; during the sim it advances only with the simulated clock). Simulated time: once
// in the Town the Phaser loop is put to sleep and the test steps the real game (game.headlessStep) with a fixed 1/60 s, steering the
// existing touch-stick input (scene.touchMove) along a BFS path over the scene's own obstacle bodies, so no sleeps in the walk.
//  1 join screen -> first movement: <= 5 taps and <= 10 s wall ("Play offline" offered within 6 s).
//  2 first interaction (shop / door / NPC, via the real A button) <= 60 s sim.
//  3 the Realm Gate pointer chip is visible on the first spawn; the gate is reached <= 90 s sim (and A opens the gate menu).
//  4 "Where to?" opens the sheet in 1 tap and lists the 14 places.
//  5 layout: no overlap between HUD pieces, every visible control >= 44 px (offenders listed in the fixture's frozen legacySmall list,
//    which may only shrink), no text under 12 px (same rule, legacyTiny), nothing buried under the canvas.
//  6 0 database requests, 0 sockets, 0 console errors.
// Counts go to design/ftue-metrics.json (`town` section, merged: the other sections are kept).
// Run: python3 -m http.server 8440 &   BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/town-first-ten.test.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'town-ftue-profiles.json'), 'utf8'));
const METRICS = path.join(__dirname, '..', 'design', 'ftue-metrics.json');
const TG = FX.targets; const KNOWN = FX.knownIssues || {};
const IDS = 'town,realm,isles,lantern,map,pop,dash,stack,echo,jam,angler,bugs,stalk,deepdelve'; // HS1: grouped order (Adventure, Arcade, Quick games)
const r1 = (v) => (v === null || v === undefined ? null : Math.round(v * 10) / 10);

// a target check: pass at the target; a known issue (fixture baseline) passes only when not worse than its baseline, and prints the gap
function gate(profile, key, value, target) {
  const ok = value !== null && value !== undefined && value <= target;
  const name = `${profile}: ${key} <= ${target} (measured ${value === null || value === undefined ? 'never' : r1(value)})`;
  const kb = KNOWN[profile] && KNOWN[profile][key];
  if (ok || kb === undefined) { check(name, ok); return ok; }
  const v = value === null || value === undefined ? null : r1(value);
  const notWorse = kb === null ? true : v !== null && v <= kb;
  console.log(`KNOWN-ISSUE ${profile}: ${key} target ${target}, baseline ${kb === null ? 'never' : kb}, measured ${v === null ? 'never' : v}, gap ${v === null ? 'n/a' : r1(v - target)}`);
  check(`${profile}: ${key} not worse than the recorded baseline ${kb === null ? 'never' : kb} (known issue, target ${target})`, notWorse, String(value));
  return false;
}
// a frozen allow-list: every offender must be on it (the list may only shrink); entries that are fixed are printed so the list can shrink
function allow(profile, key, found, list) {
  const norm = (s) => s.replace(/ [\d.]+x[\d.]+$/, '').replace(/ [\d.]+px ".*$/, '');
  const al = (list || []).filter((x) => typeof x === 'string').map(norm);
  const extra = found.filter((f) => al.indexOf(norm(f)) < 0);
  const fixed = al.filter((a) => !found.some((f) => norm(f) === a));
  if (found.length) console.log(`KNOWN-ISSUE ${profile}: ${key} ${found.length} offender(s), target 0: ${found.join(' | ')}`);
  if (fixed.length) console.log(`INFO ${profile}: ${key} allow-list entries no longer seen (shrink the list): ${fixed.join(', ')}`);
  check(`${profile}: ${key} - every offender is on the frozen allow-list (${al.length} entries; it may only shrink)`, extra.length === 0, extra.join(' | '));
}

async function open(browser, prof) {
  const v = prof.viewport;
  const ctx = await browser.newContext(prof.touch ? { viewport: v, hasTouch: true, isMobile: true } : { viewport: v });
  const db = await blockDb(ctx);
  // The SDK never loads: no firebase global, so the join try fails at once and offers "Play offline".
  await ctx.route(/gstatic\.com\/firebasejs\//, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* firebase SDK blocked by town-first-ten.test.js */' }));
  const page = await ctx.newPage();
  const sockets = []; page.on('websocket', (ws) => sockets.push(ws.url()));
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  // a fresh profile, a fixed-seed Math.random and a pinned Date.now (fixed day + real elapsed until the sim; then only the sim clock)
  await page.addInitScript((cfg) => {
    try { localStorage.clear(); } catch (e) { /* fresh */ }
    let s = cfg.seed | 0; Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const p0 = performance.now(), B = cfg.day;
    const now = () => (typeof window.__ftSimMs === 'number' ? B + 3600000 + Math.floor(window.__ftSimMs) : B + Math.floor(performance.now() - p0));
    const RD = Date; class FD extends RD { constructor(...a) { if (a.length) super(...a); else super(now()); } } FD.now = now; window.Date = FD; // new Date() follows the pinned clock too

  }, { seed: prof.seed, day: Date.UTC(2026, 10, 22, 12, 0, 0) + (prof.clock || 0) });
  await page.route('**/main.js*', async (route) => {
    const resp = await route.fetch();
    const body = (await resp.text()).replace('const game = new Phaser.Game(config);', 'const game = window.__g = new Phaser.Game(config);');
    route.fulfill({ response: resp, body });
  });
  return { ctx, page, db, sockets, errors };
}

// ---------- layout: every visible control, the stick, every visible text node (the FT1 pass) ----------
const LAYOUT = `(sticksSel) => {
  const vis = (e) => { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && e.closest('[hidden]') === null && e.closest('.hidden') === null; };
  const box = (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, r: r.right, b: r.bottom, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }; };
  const name = (e) => e.id || (e.className && String(e.className).split(' ')[0]) || ((e.parentElement && e.parentElement.closest('[id]') ? e.parentElement.closest('[id]').id + '>' : '') + e.tagName.toLowerCase() + (e.textContent.trim() ? ':' + e.textContent.trim().replace(/\\s+/g, ' ').slice(0, 14) : ''));
  const onScreen = (b) => b.r > 0 && b.b > 0 && b.x < innerWidth && b.y < innerHeight;
  const sticks = [...document.querySelectorAll(sticksSel)].filter(vis).map((e) => Object.assign(box(e), { n: name(e) }));
  const hit = (a, b) => a.x < b.r - 0.5 && b.x < a.r - 0.5 && a.y < b.b - 0.5 && b.y < a.b - 0.5;
  const onTop = (e, b) => { const x = Math.min(innerWidth - 1, Math.max(0, (b.x + b.r) / 2)), y = Math.min(innerHeight - 1, Math.max(0, (b.y + b.b) / 2)); const t = document.elementFromPoint(x, y); return !!t && (e.contains(t) || t.contains(e)); };
  const canvasTop = (b) => { const x = Math.min(innerWidth - 1, Math.max(0, (b.x + b.r) / 2)), y = Math.min(innerHeight - 1, Math.max(0, (b.y + b.b) / 2)); const t = document.elementFromPoint(x, y); return !!t && t.tagName === 'CANVAS'; };
  const all = [...document.querySelectorAll('button, [role="button"], a[href], summary, input, select')].filter(vis).map((e) => Object.assign(box(e), { n: name(e), e })).filter(onScreen);
  const underCanvas = all.filter((b) => canvasTop(b)).map((b) => b.n);
  const buttons = all.filter((b) => onTop(b.e, b)).map((b) => { delete b.e; return b; });
  const small = buttons.filter((b) => b.w < 44 || b.h < 44).map((b) => b.n + ' ' + b.w + 'x' + b.h);
  const over = []; buttons.forEach((b) => sticks.forEach((s) => { if (hit(b, s)) over.push(b.n + '/' + s.n); }));
  const tiny = []; const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    if (!t.textContent.trim()) continue; const e = t.parentElement; if (!e || !vis(e)) continue;
    const rg = document.createRange(); rg.selectNodeContents(t); const rr = rg.getBoundingClientRect(); if (!(rr.width > 0 && rr.height > 0) || !onScreen({ x: rr.x, y: rr.y, r: rr.right, b: rr.bottom })) continue;
    const fs = parseFloat(getComputedStyle(e).fontSize); if (fs < 12) tiny.push(name(e) + ' ' + fs + 'px "' + t.textContent.trim().slice(0, 24) + '"');
  }
  return { buttons: buttons.length, sticks: sticks.length, small: [...new Set(small)], over, tiny: [...new Set(tiny)], underCanvas, coarse: matchMedia('(pointer: coarse)').matches };
}`;

// HUD pieces that must never overlap each other on the play screen
// cyc8-ui: the corner Menu (#mm-nav-btn, every screen size now) joins the overlap check
const HUD = ['#mm-nav-btn', '#player-list-panel', '#inventory-panel', '#walkie-panel', '#chat-panel', '#gate-pointer', '#joystick', '#action-buttons', '#realm-gate-hint', '#dig-hole-hint', '#fish-hint-btn', '#gift-hint-btn', '#whats-new-banner'];
const HUD_OVERLAP = `(sels) => {
  const vis = (e) => { if (!e) return false; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0 || e.classList.contains('hidden')) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const bs = sels.map((s) => ({ s, e: document.querySelector(s) })).filter((o) => vis(o.e)).map((o) => { const r = o.e.getBoundingClientRect(); return { s: o.s, x: r.left, y: r.top, r: r.right, b: r.bottom }; });
  const out = []; for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) { const a = bs[i], b = bs[j]; const w = Math.min(a.r, b.r) - Math.max(a.x, b.x), h = Math.min(a.b, b.b) - Math.max(a.y, b.y); if (w > 0.5 && h > 0.5) out.push(a.s + '/' + b.s + ' ' + Math.round(w) + 'x' + Math.round(h)); }
  const offscreen = bs.filter((b) => b.x < -0.5 || b.y < -0.5 || b.r > innerWidth + 0.5 || b.b > innerHeight + 0.5).map((b) => b.s);
  return { pieces: bs.map((b) => b.s), overlaps: out, offscreen };
}`;

// ---------- the walker (installed in the page): the Phaser loop sleeps, the test steps the real game with a fixed dt ----------
const WALKER = `(spawn) => {
  const g = window.__g, s = g.scene.getScene('Town'), b = s.localBody, DT = 1000 / 60;
  g.loop.sleep(); window.__ftSimMs = 0; // simulated time from here on (Date.now follows the sim clock)
  b.setPosition(spawn[0], spawn[1]); b.body.reset(spawn[0], spawn[1]); s.touchMove = { x: 0, y: 0 }; // every run starts the walk from the spawn point, at rest
  const W = s.physics.world.bounds.width, H = s.physics.world.bounds.height, C = 8, cols = Math.ceil(W / C), rows = Math.ceil(H / C);
  // the player's feet hitbox relative to its position (body offset from the sprite origin), padded 2 px
  const bo = { x: b.body.x - b.x - 2, y: b.body.y - b.y - 2, w: b.body.width + 4, h: b.body.height + 4 };
  const block = new Uint8Array(cols * rows);
  s.obstacles.getChildren().forEach((o) => { const ob = o.body; if (!ob) return;
    const x0 = Math.floor((ob.x - bo.x - bo.w) / C), x1 = Math.ceil((ob.x + ob.width - bo.x) / C), y0 = Math.floor((ob.y - bo.y - bo.h) / C), y1 = Math.ceil((ob.y + ob.height - bo.y) / C);
    for (let y = Math.max(0, y0); y <= Math.min(rows - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(cols - 1, x1); x++) {
      const px = (x + 0.5) * C, py = (y + 0.5) * C; const fx = px + bo.x, fy = py + bo.y;
      if (fx < ob.x + ob.width && fx + bo.w > ob.x && fy < ob.y + ob.height && fy + bo.h > ob.y) block[y * cols + x] = 1; } });
  for (let x = 0; x < cols; x++) { block[x] = 1; block[(rows - 1) * cols + x] = 1; } for (let y = 0; y < rows; y++) { block[y * cols] = 1; block[y * cols + cols - 1] = 1; }
  const S = window.__qt = { t: 0, steps: 0, log: [], first: {} };
  // BFS (8-neighbour, no corner cutting) from the player to the first cell where goal(x, y) holds; the goal is evaluated with the body
  // moved there for a moment, so it is exactly the game's own isNear* check
  S.bfs = (goal, maxN) => {
    const sx = Math.floor(b.x / C), sy = Math.floor(b.y / C), ox = b.x, oy = b.y; const prev = new Int32Array(cols * rows).fill(-1), q = new Int32Array(cols * rows);
    let h = 0, n = 0, hitI = -1; const st = sy * cols + sx; prev[st] = st; q[n++] = st;
    while (h < n && n < (maxN || 4e5)) { const c = q[h++]; const cx = c % cols, cy = (c / cols) | 0;
      b.x = (cx + 0.5) * C; b.y = (cy + 0.5) * C; const ok = goal(); if (ok) { hitI = c; S.goalKind = ok; break; }
      for (let k = 0; k < 8; k++) { const dx = [1, -1, 0, 0, 1, 1, -1, -1][k], dy = [0, 0, 1, -1, 1, -1, 1, -1][k]; const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const ni = ny * cols + nx; if (block[ni] || prev[ni] >= 0) continue; if (dx && dy && (block[cy * cols + nx] || block[ny * cols + cx])) continue; prev[ni] = c; q[n++] = ni; } }
    b.x = ox; b.y = oy;
    if (hitI < 0) return null; const out = []; for (let c = hitI; c !== st; c = prev[c]) out.push({ x: (c % cols + 0.5) * C, y: (((c / cols) | 0) + 0.5) * C }); return out.reverse();
  };
  // walk the path with the touch-stick input; stops when goal() holds or lim sim seconds pass
  S.walk = (goal, lim) => {
    const pth = S.bfs(goal); if (!pth) return { reached: false, why: 'no path', t: S.t };
    const t0 = S.t; let i = 0, chk = 0.5, lx = b.x, ly = b.y, un = 0, ux = 0, uy = 0, rs = 12345;
    while (S.t - t0 < lim) {
      if (goal()) { s.touchMove = { x: 0, y: 0 }; for (let k = 0; k < 20; k++) S.tick(); return { reached: true, t: S.t, dt: S.t - t0, path: pth.length, kind: goal() }; }
      // progress: the nearest path point at or after the current one (never back), then look ahead from there
      { let bd = 1e9, bk = i; for (let k = i; k < Math.min(pth.length, i + 20); k++) { const d = Math.hypot(pth[k].x - b.x, pth[k].y - b.y); if (d < bd) { bd = d; bk = k; } } i = bk; }
      const wp = pth[Math.min(pth.length - 1, i + 1)];
      // look ahead: aim at the furthest of the next few waypoints that is still in a straight free line
      let aim = wp; for (let k = Math.min(pth.length - 1, i + 8); k > i + 1; k--) { const p = pth[k]; let free = true; const L = Math.hypot(p.x - b.x, p.y - b.y), n2 = Math.ceil(L / 4); for (let j = 1; j <= n2 && free; j++) { const x = b.x + (p.x - b.x) * j / n2, y = b.y + (p.y - b.y) * j / n2; if (block[Math.floor(y / C) * cols + Math.floor(x / C)]) free = false; } if (free) { aim = p; break; } }
      if (!aim) aim = pth[pth.length - 1];
      let mx = aim.x - b.x, my = aim.y - b.y; const l = Math.hypot(mx, my) || 1; mx /= l; my /= l;
      if (un > 0) { un -= DT / 1000; mx = ux; my = uy; }
      s.touchMove = { x: mx, y: my };
      S.tick();
      if ((chk -= DT / 1000) <= 0) { chk = 0.5; if (Math.hypot(b.x - lx, b.y - ly) < 6 && un <= 0) { rs = (rs * 1103515245 + 12345) % 2147483648; const a = rs / 2147483648 * 6.283; ux = Math.cos(a); uy = Math.sin(a); un = 0.3; S.log.push('unstick @' + Math.round(b.x) + ',' + Math.round(b.y)); }
        lx = b.x; ly = b.y; }
    }
    s.touchMove = { x: 0, y: 0 };
    return { reached: false, why: 'time', t: S.t, path: pth.length, at: [Math.round(b.x), Math.round(b.y)] };
  };
  S.tick = () => { S.t += DT / 1000; window.__ftSimMs = S.t * 1000; g.headlessStep(1e6 + S.t * 1000, DT); S.steps++; };
  S.idle = (sec) => { s.touchMove = { x: 0, y: 0 }; const n = Math.round(sec * 60); for (let k = 0; k < n; k++) S.tick(); return S.t; };
  S.render = () => { g.renderer.preRender(); g.scene.render(g.renderer); g.renderer.postRender(); return true; };
  S.firstGoal = () => (s.isNearShop() ? 'shop' : s.isNearDoor() ? 'door' : s.isNearNPC() ? 'npc' : s.isNearNPC2() ? 'npc2' : '');
  S.gateGoal = () => (s.isNearRealmGate() ? 'gate' : '');
  S.calls = [];
  ['sellAtShop', 'useDoor', 'talkToNPC', 'talkToNPC2', 'openRealmGateMenu'].forEach((m) => { const o = s[m].bind(s); s[m] = function () { S.calls.push({ m, t: Math.round(S.t * 10) / 10 }); return o.apply(s, arguments); }; });
  return { pos: [b.x, b.y], cols, rows, blocked: block.reduce((a, v) => a + v, 0) };
}`;

(async () => {
  const browser = await chromium.launch();
  let prev = {}; try { prev = JSON.parse(fs.readFileSync(METRICS, 'utf8')); } catch (e) { prev = {}; }
  const out = {};
  for (const prof of FX.profiles) {
    const P = prof.id; const w0 = Date.now();
    const { ctx, page, db, sockets, errors } = await open(browser, prof);
    let taps = 0;
    const tap = async (sel) => { taps++; if (prof.touch) await page.tap(sel); else await page.click(sel); };
    // the interact action: the real A button on a phone, the E key on desktop (the A button is phone-only); then a few sim frames
    const act = async () => { taps++; if (prof.touch) { await page.tap('#interact-btn'); await page.evaluate(() => window.__qt.idle(0.3)); } else { await page.keyboard.down('e'); await page.evaluate(() => window.__qt.idle(0.1)); await page.keyboard.up('e'); await page.evaluate(() => window.__qt.idle(0.2)); } };
    const t0 = Date.now();
    await page.goto(BASE + '?hud=online'); // U-01: online HUD pieces (walkie) stay in the overlap checks
    await page.waitForSelector('#name-input', { state: 'visible', timeout: 10000 });
    const joinShown = Date.now() - t0;
    await page.fill('#name-input', 'ADMINftue'); // typing the name is not a tap
    const pre = await page.evaluate(() => ({ species: document.querySelectorAll('.species-tab.active').length, avatar: document.querySelectorAll('.avatar-choice.selected').length, ready: !document.getElementById('join-btn').disabled }));
    if (!pre.species) await tap('.species-tab');
    if (!pre.avatar) await tap('.avatar-choice');
    await tap('button:has-text("Join Town")');
    await page.waitForSelector('#join-offline-btn:not(.hidden)', { timeout: 12000 });
    const offlineMs = Date.now() - t0;
    await tap('#join-offline-btn');
    await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 20000, polling: 50 });
    const joinTaps = taps; const inTownMs = Date.now() - t0;
    const spawn = await page.evaluate(() => { const b = window.__g.scene.getScene("Town").localBody; return [b.x, b.y]; }); const x0 = spawn[0];
    // first movement: one touch on the stick (drag to its right rim) or one arrow key on desktop
    if (prof.touch) {
      const jr = await page.evaluate(() => { const r = document.getElementById('joystick').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; });
      taps++; await page.mouse.move(jr.x, jr.y); await page.mouse.down(); await page.mouse.move(jr.x + jr.w * 0.45, jr.y, { steps: 3 });
    } else { taps++; await page.keyboard.down('ArrowRight'); }
    const moved = await page.waitForFunction((x) => Math.abs(window.__g.scene.getScene('Town').localBody.x - x) > 4, x0, { timeout: 8000, polling: 'raf' }).then(() => true).catch(() => false);
    const firstMoveMs = Date.now() - t0 - joinShown; // from the join screen showing (the page load before it is not the player's time)
    if (prof.touch) await page.mouse.up(); else await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(500); // the HUD settles (real frames) before the layout pass
    const offline = await page.evaluate(() => window.__g.scene.getScene('Town').net.offline === true);
    check(`${P}: joined the Town through "Play offline"`, offline);
    check(`${P}: "Play offline" is offered within ${TG.offlineOfferMs} ms`, offlineMs <= TG.offlineOfferMs, String(offlineMs));
    check(`${P}: the first movement happened`, moved);
    gate(P, 'tapsToFirstMove', taps, TG.tapsToFirstMove);
    gate(P, 'firstMoveMs', moved ? firstMoveMs : null, TG.firstMoveMs);

    // the gate pointer chip on the first spawn
    const gp = await page.evaluate(() => { const e = document.getElementById('gate-pointer'); const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { vis: !e.classList.contains('hidden') && r.height > 0 && r.width > 0, text: e.textContent.replace(/\s+/g, ' ').trim(), onTop: !!t && e.contains(t), fits: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight }; });
    check(`${P}: the Realm Gate pointer chip is visible on the first spawn, on top and on screen`, gp.vis && /Realm Gate/.test(gp.text) && gp.onTop && gp.fits, JSON.stringify(gp));

    // layout on the play screen
    const lay = await page.evaluate(`(${LAYOUT})('#joystick')`);
    const hud = await page.evaluate(`(${HUD_OVERLAP})(${JSON.stringify(HUD)})`);
    console.log(`INFO ${P} layout: ${JSON.stringify({ buttons: lay.buttons, small: lay.small, tiny: lay.tiny, over: lay.over, underCanvas: lay.underCanvas, coarse: lay.coarse })}`);
    console.log(`INFO ${P} HUD pieces: ${hud.pieces.join(' ')}`);
    check(`${P}: no two HUD pieces overlap`, hud.overlaps.length === 0, hud.overlaps.join(', '));
    check(`${P}: every HUD piece is inside the viewport`, hud.offscreen.length === 0, hud.offscreen.join(', '));
    allow(P, 'underCanvas', lay.underCanvas, (FX.legacyUnderCanvas || {})[P]); // a control whose centre shows the canvas: clipped out of its panel, not tappable
    check(`${P}: no control overlaps the stick`, lay.over.length === 0, lay.over.join(', '));
    if (prof.touch) check(`${P}: coarse pointer emulated, the stick is visible`, lay.coarse && lay.sticks === 1, JSON.stringify({ coarse: lay.coarse, sticks: lay.sticks }));

    // "Where to?": one tap opens the sheet, 14 places. cyc8-ui: on phones (<= 600 px wide, or a landscape phone <= 500 px tall) the
    // corner Menu replaced "Where to?" in the phone panel, so the one tap goes to the Menu there (same sheet).
    const phoneNav = prof.viewport.width <= 600 || (prof.viewport.width > prof.viewport.height && prof.viewport.height <= 500);
    const taps0 = taps;
    await tap(phoneNav ? '#mm-nav-btn' : '#where-to-btn');
    await page.waitForFunction(() => { const sh = document.getElementById('mm-nav-sheet'); return sh && !sh.hidden && sh.getBoundingClientRect().height > 0; }, null, { timeout: 3000 }).catch(() => {});
    const sh = await page.evaluate(() => { const sh = document.getElementById('mm-nav-sheet'); const ds = sh ? [...sh.querySelectorAll('.mm-nav-dest')].map((a) => a.dataset.place) : []; return { open: !!sh && !sh.hidden, ids: ds.join(',') }; });
    const shLay = await page.evaluate(`(${LAYOUT})('#joystick')`);
    check(`${P}: "Where to?" opens the sheet in ${taps - taps0} tap (target ${TG.whereToTaps})`, sh.open && taps - taps0 <= TG.whereToTaps, JSON.stringify(sh));
    check(`${P}: the sheet lists the ${TG.places} places in catalogue order`, sh.ids.split(',').length === TG.places && sh.ids === IDS, sh.ids);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    check(`${P}: Esc closes the sheet`, await page.evaluate(() => document.getElementById('mm-nav-sheet').hidden));
    const small = [...new Set(lay.small.concat(shLay.small))], tiny = [...new Set(lay.tiny.concat(shLay.tiny))];
    allow(P, 'smallButtons', small, (FX.legacySmall || {})[P]);
    allow(P, 'tinyText', tiny, (FX.legacyTiny || {})[P]);

    // ---- simulated walk: first interaction, then the Realm Gate ----
    const wInfo = await page.evaluate(`(${WALKER})(${JSON.stringify(spawn)})`);
    const first = await page.evaluate((lim) => window.__qt.walk(window.__qt.firstGoal, lim), TG.firstInteraction + 30);
    let firstT = null, firstKind = '';
    if (first.reached) {
      await act();
      const calls = await page.evaluate(() => window.__qt.calls.slice());
      const c = calls.find((q) => q.m !== 'openRealmGateMenu');
      if (c) { firstT = c.t; firstKind = c.m; }
    }
    console.log(`INFO ${P} walker: ${JSON.stringify(wInfo)} first: ${JSON.stringify(first)} -> ${firstKind}`);
    gate(P, 'firstInteraction', firstT, TG.firstInteraction);
    check(`${P}: the A button (E on desktop) ran a shop / door / NPC interaction (${firstKind || 'none'})`, !!firstKind);
    // whatever the interaction opened closes with Esc (a door may have moved us inside: the walk starts from where we are)
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__qt.idle(0.3));
    const gw = await page.evaluate((lim) => window.__qt.walk(window.__qt.gateGoal, lim), TG.gateReach + 60);
    let gateMenu = false;
    if (gw.reached) {
      await act();
      gateMenu = await page.evaluate(() => !document.getElementById('realm-menu').classList.contains('hidden'));
    }
    console.log(`INFO ${P} gate walk: ${JSON.stringify(gw)} menu ${gateMenu} log ${JSON.stringify(await page.evaluate(() => window.__qt.log.slice(0, 5)))}`);
    gate(P, 'gateReach', gw.reached ? gw.t : null, TG.gateReach);
    check(`${P}: at the gate the A button (E on desktop) opens the Realm Gate menu`, gateMenu);
    if (gateMenu) await page.evaluate(() => document.getElementById('realm-menu-close-btn').click());

    const wall = Date.now() - w0;
    check(`${P}: 0 database requests and 0 sockets`, db.attempts() === 0 && sockets.length === 0, JSON.stringify([db.http, db.ws, sockets]));
    check(`${P}: 0 console errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
    check(`${P}: wall clock <= ${FX.wallBudgetMs} ms`, wall <= FX.wallBudgetMs, String(wall));
    out[P] = { viewport: prof.viewport, touch: !!prof.touch, joinShownMs: joinShown, offlineOfferMs: offlineMs, inTownMs, joinTaps, tapsToFirstMove: taps0, firstMoveMs, firstInteraction: r1(firstT), firstInteractionKind: firstKind,
      gateReach: gw.reached ? r1(gw.t) : null, gatePathCells: gw.path || 0, gatePointer: gp.vis, whereToTaps: 1, places: sh.ids ? sh.ids.split(',').length : 0, hudPieces: hud.pieces.length, hudOverlaps: hud.overlaps.length,
      smallButtons: small.length, tinyText: tiny.length, underCanvas: lay.underCanvas.length, dbRequests: db.attempts(), sockets: sockets.length, consoleErrors: errors.length, wallMs: wall };
    await ctx.close();
  }
  // merge: keep every other section (world, isles, isles2, ...)
  let cur = {}; try { cur = JSON.parse(fs.readFileSync(METRICS, 'utf8')); } catch (e) { cur = prev; }
  cur.town = { generated: 'tests/town-first-ten.test.js', profiles: out };
  try { fs.writeFileSync(METRICS, JSON.stringify(cur, null, 2) + '\n'); console.log('INFO wrote the town section of ' + path.relative(path.join(__dirname, '..', '..'), METRICS)); } catch (e) { check('ftue-metrics.json written', false, e.message); }
  await browser.close();
  done();
})();
