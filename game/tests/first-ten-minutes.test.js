// FT1 (NEXT-SLICES-2 Wave 2): the first-ten-minutes phone fun-gate. 390x844, hasTouch, coarse pointer, fresh profiles from
// tests/fixtures/ftue-profiles.json. Simulated time: the page's own requestAnimationFrame loop is stopped and the REAL update
// (arena._update / the isles step hook from ?test=1) is stepped with a fixed dt, so no sleeps and the wall clock stays <= 90 s a profile.
//  1 world (games/mad-maze/index.html?mode=world): a scripted kite-bot (left stick moves, right stick aims and fires with the default
//    aim assist, abilities from the grid, walks to bags, kites and side-steps bullets, explores the zone its level is ready for).
//    first kill <= 20 s sim, first bag (picked up) <= 60 s, first level-up <= 180 s, first ability <= 240 s, no 45 s window without a
//    reward event (kill, bag, XP, level, quest, pickup), <= 1 death in 10 min. A second fresh page walks the BFS path from the spawn to
//    the nearest portal (god mode) and must see the portal prompt within 10 min sim.
//  2 isles (games/isles/index.html): a fresh profile tames its first creature <= 180 s sim; the hint text names the next action.
//  3 layout (both pages): every visible button >= 44 px and off both sticks, no visible text under 12 px, first frame <= 3 s, 0 console errors.
// Counts go to design/ftue-metrics.json. A miss fails, except a target listed in the fixture's knownIssues: that one must not be worse
// than the recorded base-branch baseline, and the gap to the target is printed (FT2 closed them all: the fixture lists none today).
// Offline: blockDb, no chat, no DB writes.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/first-ten-minutes.test.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'ftue-profiles.json'), 'utf8'));
const METRICS = path.join(__dirname, '..', 'design', 'ftue-metrics.json');
const TG = FX.targets; const KNOWN = FX.knownIssues || {};
const DT = FX.dt || 1 / 60;
const ONLY = process.env.FT_ONLY || ''; // run one profile while debugging (FT_ONLY=world-shore-c); FT_TRACE=1 prints the bot's 5 s trace
const r1 = (v) => (v === null || v === undefined ? null : Math.round(v * 10) / 10);

// a target check: pass at the target; a known issue passes only when not worse than its baseline (lower is better unless `higher`)
function gate(profile, key, value, target, higher) {
  const ok = value !== null && value !== undefined && (higher ? value >= target : value <= target);
  const name = `${profile}: ${key} ${higher ? '>=' : '<='} ${target} (measured ${value === null ? 'never' : r1(value)})`;
  const kb = KNOWN[profile] && KNOWN[profile][key];
  if (ok || kb === undefined) { check(name, ok); return ok; }
  const v = value === null || value === undefined ? null : r1(value); // baselines are recorded at 0.1 resolution
  const notWorse = v !== null && (higher ? v >= kb : v <= kb);
  console.log(`KNOWN-ISSUE ${profile}: ${key} target ${target}, baseline ${kb}, measured ${value === null ? 'never' : r1(value)}, gap ${value === null ? 'n/a' : r1(higher ? target - value : value - target)}`);
  check(`${profile}: ${key} not worse than the recorded baseline ${kb} (known issue, target ${target})`, notWorse, String(value));
  return false;
}

async function newPage(browser, freeze) {
  const v = FX.viewport;
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, hasTouch: v.hasTouch, isMobile: v.isMobile });
  const db = await blockDb(ctx);
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' })); // the town exit: no network
  await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  // fresh profile: an empty localStorage on first load
  await page.addInitScript(() => { if (!sessionStorage.ftFresh) { sessionStorage.ftFresh = '1'; localStorage.clear(); } });
  // replayable: Math.random becomes a fixed-seed generator (mulberry32) in the test page only, so a profile plays the same each run
  await page.addInitScript(() => { let s = 0x2f6b1c3d; window.__ftReseed = (n) => { s = n | 0; }; Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; });
  // freeze: page time stands still (performance.now and the rAF timestamp), so the real frames before the bot takes over all have
  // dt 0 and the simulated run starts from the same state every time (the bot then steps the update itself with a fixed dt)
  if (freeze !== undefined && freeze !== false) await page.addInitScript((off) => { const T0 = 1000; performance.now = () => T0; const D0 = Date.now(); const DZ = D0 - (D0 % 86400000) + 43200000 + off; Date.now = () => DZ; /* noon UTC today + the profile's offset: the arena seeds its rng from Date.now() */ const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => raf(() => { if (!window.__ftHold) cb(T0); }); }, Number(freeze) || 0);
  return { ctx, page, errors, db };
}

// ---------- layout: every visible button, the sticks, every visible text node ----------
const LAYOUT = `(sticksSel) => {
  const vis = (e) => { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && e.closest('[hidden]') === null; };
  const box = (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, r: r.right, b: r.bottom, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }; };
  const name = (e) => e.id || (e.className && String(e.className).split(' ')[0]) || e.tagName;
  const onScreen = (b) => b.r > 0 && b.b > 0 && b.x < innerWidth && b.y < innerHeight;
  const sticks = [...document.querySelectorAll(sticksSel)].filter(vis).map((e) => Object.assign(box(e), { n: name(e) }));
  const hit = (a, b) => a.x < b.r - 0.5 && b.x < a.r - 0.5 && a.y < b.b - 0.5 && b.y < a.b - 0.5;
  // on top at its centre (a control buried under the game canvas is not something a player can see or tap: listed as covered)
  const onTop = (e, b) => { const x = Math.min(innerWidth - 1, Math.max(0, (b.x + b.r) / 2)), y = Math.min(innerHeight - 1, Math.max(0, (b.y + b.b) / 2)); const t = document.elementFromPoint(x, y); return !!t && (e.contains(t) || t.contains(e)); };
  const all = [...document.querySelectorAll('button, [role="button"], a[href]')].filter(vis).map((e) => Object.assign(box(e), { n: name(e), e })).filter(onScreen);
  const covered = all.filter((b) => !onTop(b.e, b)).map((b) => b.n);
  const buttons = all.filter((b) => onTop(b.e, b)).map((b) => { delete b.e; return b; });
  const small = buttons.filter((b) => b.w < 44 || b.h < 44).map((b) => b.n + ' ' + b.w + 'x' + b.h);
  const over = []; buttons.forEach((b) => sticks.forEach((s) => { if (hit(b, s)) over.push(b.n + '/' + s.n); }));
  const tiny = []; const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    if (!t.textContent.trim()) continue; const e = t.parentElement; if (!e || !vis(e)) continue;
    const rg = document.createRange(); rg.selectNodeContents(t); const rr = rg.getBoundingClientRect(); if (!(rr.width > 0 && rr.height > 0) || !onScreen({ x: rr.x, y: rr.y, r: rr.right, b: rr.bottom })) continue;
    const fs = parseFloat(getComputedStyle(e).fontSize); if (fs < 12) tiny.push(name(e) + ' ' + fs + 'px "' + t.textContent.trim().slice(0, 24) + '"');
  }
  return { buttons: buttons.length, sticks: sticks.length, small, over, tiny, covered, coarse: matchMedia('(pointer: coarse)').matches };
}`;

// ---------- the world kite-bot (installed in the page) ----------
const WORLD_BOT = `(rseed) => {
  const a = window.__mm.arena, w = window.__mm.world, p = a.player, T = w.TILE;
  if (rseed && typeof rmRng === 'function') { a.rng = rmRng(rseed >>> 0); a._wpnRng = rmRng(((rseed >>> 0) ^ 0x5bd1e995) >>> 0); } // the arena seeds its rng from Date.now(): pin it so a profile replays the same
  window.__ftHold = true; if (window.__ftReseed) window.__ftReseed(rseed); // no other page frame runs during the sim, and the page's Math.random restarts from the profile seed
  cancelAnimationFrame(a._raf); a._loop = () => {}; // simulated time from here on: the page loop is gone and the test steps the real update (arena stays active)
  const bw = a._bw(), bh = a._bh(), cols = Math.ceil(bw / T), rows = Math.ceil(bh / T);
  const S = window.__ft = { t0: a.clock, first: {}, counts: {}, deaths: 0, lastReward: 0, maxGap: 0, gapAt: 0, minHp: p.hp, path: null, pi: 0, goal: null, seen: new Map(), lastPos: { x: p.x, y: p.y }, chkT: 0, unstick: 0, ux: 0, uy: 0, side: 1, sideT: 0, kills0: w.kills(), picks0: w.pickups.total(), quest0: 0, qT: 0, casts: [0, 0, 0, 0], log: [], rs: 20261121 };
  const now = () => a.clock - S.t0;
  const reward = (k) => { const t = now(); if (S.first[k] === undefined) S.first[k] = t; S.counts[k] = (S.counts[k] || 0) + 1; if (k === 'ability') return; const g = t - S.lastReward; if (g > S.maxGap) { S.maxGap = g; S.gapAt = S.lastReward; } S.lastReward = t; };
  const wrap = (obj, m, fn) => { const o = obj[m].bind(obj); obj[m] = function () { const r = o.apply(obj, arguments); fn(r, arguments); return r; }; };
  wrap(a, 'dropBag', (r) => { if (r) reward('bagDrop'); });
  wrap(a, 'collectItem', () => reward('bag'));
  wrap(a, '_gainXp', (r, args) => { if (args[0] > 0) reward('xp'); });
  wrap(a, '_levelUp', () => reward('level'));
  wrap(a, 'cast', (r, args) => { if (r === true) { reward('ability'); S.casts[args[0]]++; } });
  a._die = function () { S.deaths++; S.log.push('death at ' + now().toFixed(1)); p.hp = a.stats.maxHp; p.iframes = 3; a._syncHud(); }; // counted; the run goes on (the real death exits to town)
  const questP = () => { try { return w.quests.summary().reduce((s, q) => s + (Number(q.p) || 0) + (q.done ? 1 : 0), 0); } catch (e) { return 0; } };
  S.quest0 = questP();
  const free = (tx, ty) => tx >= 0 && ty >= 0 && tx < cols && ty < rows && !w.solidAt((tx + 0.5) * T, (ty + 0.5) * T);
  // BFS over walkable tiles (4-neighbour); returns the tile path from the hero to the first goal tile, or null
  function bfs(goals, maxN) {
    const sx = Math.floor(p.x / T), sy = Math.floor(p.y / T); const prev = new Int32Array(cols * rows).fill(-1); const q = new Int32Array(cols * rows);
    const gs = new Set(goals.map((g) => g.y * cols + g.x)); let h = 0, n = 0; const s = sy * cols + sx; prev[s] = s; q[n++] = s; let hitI = -1;
    while (h < n && n < (maxN || 1e9)) { const c = q[h++]; if (gs.has(c)) { hitI = c; break; } const cx = c % cols, cy = (c / cols) | 0;
      for (let k = 0; k < 4; k++) { const nx = cx + (k === 0) - (k === 1), ny = cy + (k === 2) - (k === 3); if (!free(nx, ny)) continue; const ni = ny * cols + nx; if (prev[ni] >= 0) continue; prev[ni] = c; q[n++] = ni; } }
    if (hitI < 0) return null; const out = []; for (let c = hitI; c !== s; c = prev[c]) out.push({ x: (c % cols + 0.5) * T, y: (((c / cols) | 0) + 0.5) * T }); return out.reverse();
  }
  S.bfs = bfs;
  function pickGoal() { // the nearest spawn group of a zone the hero's level is ready for, not visited in the last 50 s
    const lv = a.save.level; const t = now(); let top = 0; while (top < 3 && w.zoneGrad.recLv(top + 1) <= lv) top++; // a player moves up once the next zone's recommended level is reached
    const gs = w.world.spawnGroups.filter((g) => g.zone <= top && !(S.seen.get(g.x + ',' + g.y) > t - 50)).map((g) => ({ g, d: Math.hypot((g.x + 0.5) * T - p.x, (g.y + 0.5) * T - p.y) + 1200 * (top - g.zone) })).sort((x, y) => x.d - y.d).slice(0, 6);
    for (const c of gs) { const goals = []; for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) if (free(c.g.x + ox, c.g.y + oy)) goals.push({ x: c.g.x + ox, y: c.g.y + oy }); const pth = bfs(goals, 40000); if (pth) { S.goal = c.g; S.path = pth; S.pi = 0; return; } S.seen.set(c.g.x + ',' + c.g.y, t); }
    S.goal = null; S.path = null;
  }
  const norm = (x, y) => { const l = Math.hypot(x, y); return l > 1e-6 ? { x: x / l, y: y / l } : { x: 0, y: 0 }; };
  S.think = (dt) => {
    const t = now(); S.minHp = Math.min(S.minHp, p.hp);
    const k = w.kills(); while (S.kills0 < k) { S.kills0++; reward('kill'); }
    const pk = w.pickups.total(); while (S.picks0 < pk) { S.picks0++; reward('pickup'); }
    if ((S.qT -= dt) <= 0) { S.qT = 1; const qp = questP(); if (qp > S.quest0) { S.quest0 = qp; reward('quest'); } }
    let en = null, ed = 1e9, near = 0;
    for (let i = 0; i < a.enemies.length; i++) { const e = a.enemies[i]; if (!e.active) continue; const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < 230) near++; if (d < ed) { ed = d; en = e; } }
    let dx = 0, dy = 0, danger = 0, closest = 1e9;
    for (let i = 0; i < a.eBullets.length; i++) { const b = a.eBullets[i]; if (!b.active) continue; const rx = p.x - b.x, ry = p.y - b.y, d = Math.hypot(rx, ry); if (d > 130) continue; const sp = Math.hypot(b.vx, b.vy) || 1;
      if (b.vx * rx + b.vy * ry <= 0 && d > 24) continue; closest = Math.min(closest, d); const px = -b.vy / sp, py = b.vx / sp; const sgn = px * rx + py * ry >= 0 ? 1 : -1; const wgt = 1 - d / 130; dx += px * sgn * wgt + (rx / d) * wgt * 0.4; dy += py * sgn * wgt + (ry / d) * wgt * 0.4; danger += wgt; }
    if (window.__ftTrace && (S.trT = (S.trT || 0) - dt) <= 0) { S.trT = 5; (S.tr = S.tr || []).push(Math.round(t) + ' z' + (w.zone() || {}).zone + ' hp' + Math.round(p.hp) + ' ' + (en ? en.type + '/' + Math.round(en.hp) + '/' + Math.round(ed) + (en.bossName ? '/' + en.bossName : '') + (en.evid ? '/ev' : '') : '-') + ' ' + (S.path ? 'path' : '') + ' @' + Math.round(p.x / T) + ',' + Math.round(p.y / T)); }
    let mx = 0, my = 0; const low = p.hp < 0.4 * a.stats.maxHp;
    if ((S.sideT -= dt) <= 0) { S.sideT = 2.5; S.side = -S.side; }
    let bag = null, bd = 1e9; for (let i = 0; i < a.bags.length; i++) { const b = a.bags[i]; if (!b.active) continue; const d = Math.hypot(b.x - p.x, b.y - p.y); if (d < bd) { bd = d; bag = b; } }
    if (en && ed < 520) {
      const u = norm(en.x - p.x, en.y - p.y);
      if (low || ed < 170) { mx = -u.x; my = -u.y; } else if (ed > 290) { mx = u.x; my = u.y; } else { mx = -u.y * S.side * 0.9 - u.x * 0.1; my = u.x * S.side * 0.9 - u.y * 0.1; }
      if (bag && bd < 260 && !low && danger < 0.6) { const v = norm(bag.x - p.x, bag.y - p.y); mx = mx * 0.4 + v.x; my = my * 0.4 + v.y; }
      // lead the target like a player does: its velocity from the last frame x the bolt flight time
      const pv = S.prevE === en ? { vx: (en.x - S.pex) / dt, vy: (en.y - S.pey) / dt } : { vx: 0, vy: 0 }; S.prevE = en; S.pex = en.x; S.pey = en.y;
      const fl = ed / 580; const la = norm(en.x + pv.vx * fl - p.x, en.y + pv.vy * fl - p.y);
      a.setAimStick(la.x, la.y, true); S.path = null;
    } else {
      a.setAimStick(0, 0, false);
      if (bag && bd < 500) { const v = norm(bag.x - p.x, bag.y - p.y); mx = v.x; my = v.y; }
      else {
        if (!S.path || S.pi >= S.path.length) { if (S.goal) S.seen.set(S.goal.x + ',' + S.goal.y, t); pickGoal(); }
        if (S.path) { let wp = S.path[S.pi]; while (wp && Math.hypot(wp.x - p.x, wp.y - p.y) < 14) { S.pi++; wp = S.path[S.pi]; } if (wp) { const v = norm(wp.x - p.x, wp.y - p.y); mx = v.x; my = v.y; } }
      }
    }
    mx += dx * 1.8; my += dy * 1.8;
    if (S.unstick > 0) { S.unstick -= dt; mx = S.ux; my = S.uy; }
    let v = norm(mx, my);
    if (v.x || v.y) { // slide off walls: try the heading, then +-45 / +-90 degrees
      const tryA = [0, 0.785, -0.785, 1.571, -1.571];
      for (const ang of tryA) { const c = Math.cos(ang), s = Math.sin(ang); const nx = v.x * c - v.y * s, ny = v.x * s + v.y * c; if (!a._blocked(p.x + nx * 16, p.y + ny * 16, 11)) { v = { x: nx, y: ny }; break; } }
    }
    a.moveVec.x = v.x; a.moveVec.y = v.y;
    if ((S.chkT -= dt) <= 0) { S.chkT = 1; const m = Math.hypot(p.x - S.lastPos.x, p.y - S.lastPos.y); if (m < 24 && (v.x || v.y) && S.unstick <= 0) { S.rs = (S.rs * 1103515245 + 12345) % 2147483648; const ang = (S.rs / 2147483648) * 6.283; S.ux = Math.cos(ang); S.uy = Math.sin(ang); S.unstick = 0.8; S.path = null; } S.lastPos = { x: p.x, y: p.y }; }
    // abilities: dash out of a close bullet, nova into a crowd, shield when hurt, overdrive in a fight
    if (closest < 40 && a.cast(0)) { /* dashed */ }
    if (near >= 2 && ed < 200) a.cast(1);
    if (p.hp < 0.6 * a.stats.maxHp && ed < 300) a.cast(2);
    if (ed < 300) a.cast(3);
  };
  S.step = (n, dt) => { for (let i = 0; i < n; i++) { S.think(dt); a._update(dt); a._camStep(dt); if (a.state !== 'play') break; } if ((S.drawN = (S.drawN || 0) + 1) % 4 === 0) a._draw(); return now(); };
  S.report = () => { const t = now(); const gap = Math.max(S.maxGap, t - S.lastReward); return { t, first: S.first, counts: S.counts, deaths: S.deaths, maxGap: gap, gapAt: gap === S.maxGap ? S.gapAt : S.lastReward, minHp: S.minHp, level: a.save.level, xp: a.save.xp, kills: w.kills(), items: a.save.items.length, casts: S.casts, state: a.state, log: S.log.slice(0, 5), zone: w.zone() }; };
  return { x: p.x, y: p.y, level: a.save.level, cols, rows };
}`;

// god-mode walk along the BFS path to the nearest portal; sim seconds until the portal prompt shows
const PORTAL_WALK = `(lim) => {
  const a = window.__mm.arena, w = window.__mm.world, p = a.player, S = window.__ft, T = w.TILE;
  p.iframes = 1e9; a._hitPlayer = () => {};
  const goals = []; w.portals().forEach((q) => { for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) goals.push({ x: q.tx + ox, y: q.ty + oy }); });
  const pth = S.bfs(goals.filter((g) => !w.solidAt((g.x + 0.5) * T, (g.y + 0.5) * T)));
  if (!pth) return { reached: false, path: 0, t: null };
  const t0 = a.clock; let i = 0;
  while (a.clock - t0 < lim) {
    let wp = pth[i]; while (wp && Math.hypot(wp.x - p.x, wp.y - p.y) < 12) { i++; wp = pth[i]; }
    if (!wp) { const q = w.portals().map((q) => ({ q, d: Math.hypot(q.x - p.x, q.y - p.y) })).sort((x, y) => x.d - y.d)[0].q; wp = { x: q.x, y: q.y }; }
    const d = Math.hypot(wp.x - p.x, wp.y - p.y) || 1; a.moveVec.x = (wp.x - p.x) / d; a.moveVec.y = (wp.y - p.y) / d;
    a._update(1 / 60); a._camStep(1 / 60); p.iframes = 1e9;
    if (w.portalPrompt() >= 0) return { reached: true, path: pth.length, t: a.clock - t0, prompt: document.getElementById('rw-portal') ? document.getElementById('rw-portal').textContent : '' };
  }
  return { reached: false, path: pth.length, t: null };
}`;

// ---------- the isles taming bot (through window.__isles with ?test=1) ----------
const ISLES_BOT = `(lim) => {
  const I = window.__isles, CR = window.MMCreatures, TILE = 32;
  I.pause(true); window.__ftHold = true; if (window.__ftReseed) window.__ftReseed(7); // simulated time only from here (the page clock is frozen)
  const VERB = /\\b(press|tap|feed|walk|knock|soothe|stay|ride|keep|explore|find|look|open|follow|shoot|fire|gather|sail|place|head|go|move)\\b/i;
  const S = { t: 0, fireT: 0, feedT: 0, target: null, tame: null, samples: 0, empty: 0, noVerb: [], nearSamples: 0, nearEmpty: 0, deaths: 0, wasDead: false, kills0: I.stats().kills, unstick: 0, ux: 0, uy: 0, lastPos: null, chkT: 0, tried: {}, log: [] };
  const step = (mx, my, dt) => { const h = I.step(mx, my, dt); S.t += dt; return h; };
  const foodOk = (c) => { const d = CR && CR.get(c.kind); if (!d || !d.diet) return true; const pz = I.pouch(); return !d.diet.length || d.diet.some((f) => (pz[f] | 0) > 0); };
  while (S.t < lim) {
    const h = I.hero(); if (h.dead && !S.wasDead) S.deaths++; S.wasDead = h.dead;
    if (I.stats().tamed > 0) { S.tame = S.t; break; }
    const cs = I.creatures().filter((c) => c.st && c.st !== 'tamed' && c.st !== 'escaped' && c.st !== 'dead' && !(S.tried[c.uid] > 40) && foodOk(c));
    // a player picks the quickest tame in reach (walk time + the species' target tame time) and sticks with it while it is still tameable
    const cost = (q) => Math.hypot(q.x - h.x, q.y - h.y) / 150 + ((CR && CR.get(q.kind) && CR.get(q.kind).tame && CR.get(q.kind).tame.time) || 60) + (q.ko || q.st === 'calm' || q.st === 'taming' ? -1000 : 0);
    let c = cs.find((q) => q.uid === S.target) || null; if (!c) { let best = 1e9; cs.forEach((q) => { const k = cost(q); if (k < best) { best = k; c = q; } }); }
    const cd = c ? Math.hypot(c.x - h.x, c.y - h.y) : 1e9;
    // hint sampling, once a sim second
    if ((S.sT = (S.sT || 0) - 1 / 30) <= 0) { S.sT = 1; const ht = I.hint() || ''; S.samples++; if (!ht) S.empty++; else if (!VERB.test(ht) && S.noVerb.length < 5) S.noVerb.push(ht); if (c && cd < 5 * TILE) { S.nearSamples++; if (!ht) S.nearEmpty++; } }
    let mx = 0, my = 0;
    if (!c) { // nothing tameable near: walk the island (a slow spiral away from the start) so the spawner brings groups in
      const ang = S.t * 0.15; mx = Math.cos(ang); my = Math.sin(ang);
    } else {
      if (c.st === 'wild' && !c.ko) S.tried[c.uid] = (S.tried[c.uid] || 0) + 1 / 30; // a wild one that will not calm / drop in 40 s: try another
      if (S.target !== c.uid) { S.target = c.uid; if (S.log.length < 30) S.log.push(Math.round(S.t) + 's ' + c.kind + ' ' + c.st + (c.ko ? ' ko' : '') + ' d' + Math.round(cd)); }
      const def = CR ? CR.get(c.kind) : null; const ko = def && def.tame && def.tame.method === 'knockout';
      const ux = (c.x - h.x) / (cd || 1), uy = (c.y - h.y) / (cd || 1);
      if (ko && !c.ko) { // soothe shots from 3-4 tiles
        I.soothe(true);
        if (cd > 4 * TILE) { mx = ux; my = uy; } else if (cd < 2.5 * TILE) { mx = -ux; my = -uy; }
        if ((S.fireT -= 1 / 30) <= 0 && cd < 7 * TILE) { S.fireT = 0.25; I.fire(c.x - h.x, c.y - 8 - h.y); }
      } else { // calm / feed / asleep: walk up (slowly near the end) and offer food once a second
        if (cd > 26) { const k = cd < 6 * TILE ? 0.45 : 1; mx = ux * k; my = uy * k; } // right next to it, so Feed goes to this one and not a neighbour
        if ((S.feedT -= 1 / 30) <= 0) { S.feedT = 1; const r = I.feed(); if (r && r.tamed) { S.tame = S.t; break; } if (r && r.why !== 'none' && !(r.events && r.events.indexOf('toofast') >= 0) && S.log.length < 30) S.log.push(Math.round(S.t) + 's feed ' + (r.why || (r.events || []).join('+')) + ' ' + (r.prog | 0) + '/' + (r.need | 0)); }
      }
    }
    // self-defence: an awake hostile close by (not the one being tamed) gets soothe shots, and the hero backs off from it
    let foe = null, fd = 4.5 * TILE; I.creatures().forEach((q) => { if (q.uid === (c && c.uid) || q.ko || !(q.hostile || q.mood === 'hostile')) return; const d = Math.hypot(q.x - h.x, q.y - h.y); if (d < fd) { fd = d; foe = q; } });
    // never shoot through the creature being fed (a hit costs taming efficiency): hold fire when it is in the line of the shot
    const inLine = (q) => { if (!c || !(c.ko || c.calm || c.st === 'taming')) return false; const ax = q.x - h.x, ay = q.y - h.y, bx = c.x - h.x, by = c.y - h.y, la = Math.hypot(ax, ay) || 1, lb = Math.hypot(bx, by) || 1; return lb < la + 20 && (ax * bx + ay * by) / (la * lb) > 0.9; };
    if (foe && !inLine(foe)) { I.soothe(true); if ((S.fireT -= 1 / 30) <= 0) { S.fireT = 0.25; I.fire(foe.x - h.x, foe.y - 8 - h.y); } if (fd < 2.5 * TILE) { mx = mx * 0.3 - (foe.x - h.x) / fd; my = my * 0.3 - (foe.y - h.y) / fd; } }
    if (S.unstick > 0) { S.unstick -= 1 / 30; mx = S.ux; my = S.uy; }
    step(mx, my, 1 / 30);
    if ((S.chkT -= 1 / 30) <= 0) { S.chkT = 1; const hh = I.hero(); if (S.lastPos && Math.hypot(hh.x - S.lastPos.x, hh.y - S.lastPos.y) < 16 && (mx || my) && S.unstick <= 0) { const ang = (S.t * 7.3) % 6.283; S.ux = Math.cos(ang); S.uy = Math.sin(ang); S.unstick = 1; } S.lastPos = { x: hh.x, y: hh.y }; }
  }
  if (S.tame !== null && S.tame !== undefined) { const ht = I.hint() || ''; S.after = ht; }
  I.render();
  return { tame: S.tame === undefined ? null : S.tame, t: S.t, samples: S.samples, empty: S.empty, noVerb: S.noVerb, nearSamples: S.nearSamples, nearEmpty: S.nearEmpty, deaths: S.deaths, stats: I.stats(), tames: I.tamesLive().roster.map((r) => r.sp), pouch: I.pouch(), log: S.log };
}`;

(async () => {
  const browser = await chromium.launch();
  const metrics = { generated: 'tests/first-ten-minutes.test.js', viewport: FX.viewport, dtSim: DT, world: {}, isles: {} };
  let dbAll = 0;

  // ===== 1. world profiles =====
  for (const prof of FX.world.filter((q) => !ONLY || q.id.indexOf(ONLY) >= 0)) {
    const w0 = Date.now();
    const P = await newPage(browser, prof.clock || 0);
    const url = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=' + prof.seed;
    await P.page.goto(url);
    await P.page.waitForFunction(() => { const m = window.__mm; return !!(m && m.world && m.arena.active && m.arena.state === 'play'); }, null, { timeout: 20000, polling: 50 });
    await P.page.waitForLoadState('networkidle'); // art and tiles are in (page time is frozen, so this wait changes nothing in the run)
    const fresh = await P.page.evaluate(() => ({ level: window.__mm.arena.save.level, items: window.__mm.arena.save.items.length, shards: window.__mm.arena.save.shards, aimAssist: window.__mm.arena._aimAssist }));
    check(`${prof.id}: a fresh profile (level 1, no items, no shards, aim assist on by default)`, fresh.level === 1 && fresh.items === 0 && fresh.shards === 0 && fresh.aimAssist === true, JSON.stringify(fresh));
    await P.page.evaluate(`(${WORLD_BOT})(${Number(prof.seed) || 1})`);
    if (process.env.FT_TRACE) await P.page.evaluate(() => { window.__ftTrace = true; });
    let rep = null; const sim = TG.world.simSeconds;
    for (let t = 0; t < sim;) { t = await P.page.evaluate(([n, dt]) => window.__ft.step(n, dt), [Math.round(20 / DT), DT]); }
    rep = await P.page.evaluate(() => window.__ft.report());
    if (process.env.FT_TRACE) console.log('TRACE ' + JSON.stringify(await P.page.evaluate(() => window.__ft.tr || [])));
    // the portal leg on a second fresh page (same seed)
    const Q = await newPage(browser);
    const nav0 = Date.now();
    await Q.page.goto(url);
    const ff = await Q.page.waitForFunction(() => { const m = window.__mm; if (m && m.world && m.arena.active && m.arena.state === 'play') return window.__ftFF || (window.__ftFF = performance.now()); return false; }, null, { timeout: 20000, polling: 'raf' }).then((h) => h.jsonValue());
    const navMs = Date.now() - nav0;
    await Q.page.waitForTimeout(300); // a few real frames so the HUD is laid out, then the layout pass on this fresh page
    const lay = await Q.page.evaluate(`(${LAYOUT})('.realm-stick')`);
    await Q.page.evaluate(`(${WORLD_BOT})(${Number(prof.seed) || 1})`);
    const portal = await Q.page.evaluate(`(${PORTAL_WALK})(${TG.world.portalWalk + 1})`);
    const wall = Date.now() - w0;
    console.log(`INFO ${prof.id}: ${JSON.stringify(rep)}`);
    console.log(`INFO ${prof.id} portal walk: ${JSON.stringify(portal)} | wall ${wall} ms | first frame ${r1(ff)} ms (nav ${navMs} ms)`);
    console.log(`INFO ${prof.id} layout: ${JSON.stringify(lay)}`);
    if (lay.covered.length) console.log(`INFO ${prof.id}: controls covered by the canvas (not tappable): ${lay.covered.join(', ')}`);
    check(`${prof.id}: no visible control is buried under the game canvas (FT2: the Daily link)`, lay.covered.length === 0, lay.covered.join(', '));
    const f = rep.first;
    gate(prof.id, 'firstKill', f.kill === undefined ? null : f.kill, TG.world.firstKill);
    gate(prof.id, 'firstBag', f.bag === undefined ? null : f.bag, TG.world.firstBag);
    gate(prof.id, 'firstLevel', f.level === undefined ? null : f.level, TG.world.firstLevel);
    gate(prof.id, 'firstAbility', f.ability === undefined ? null : f.ability, TG.world.firstAbility);
    gate(prof.id, 'maxRewardGap', rep.maxGap, TG.world.maxRewardGap);
    gate(prof.id, 'deaths', rep.deaths, TG.world.maxDeaths);
    gate(prof.id, 'portalWalk', portal.reached ? portal.t : null, TG.world.portalWalk);
    check(`${prof.id}: the bot really played (simulated >= ${sim} s, still in play)`, rep.t >= sim - 1 && rep.state === 'play', JSON.stringify({ t: rep.t, state: rep.state }));
    gate(prof.id, 'layout.smallButtons', lay.small.length, 0); if (lay.small.length) console.log('  small: ' + lay.small.join(', '));
    gate(prof.id, 'layout.stickOverlaps', lay.over.length, 0); if (lay.over.length) console.log('  over: ' + lay.over.join(', '));
    gate(prof.id, 'layout.tinyText', lay.tiny.length, 0); if (lay.tiny.length) console.log('  tiny: ' + lay.tiny.join(' | '));
    check(`${prof.id}: coarse pointer emulated, both sticks visible`, lay.coarse && lay.sticks === 2, JSON.stringify(lay));
    gate(prof.id, 'layout.firstFrameMs', ff, TG.layout.firstFrameMs);
    const errs = P.errors.concat(Q.errors);
    check(`${prof.id}: 0 console errors`, errs.length === 0, errs.slice(0, 3).join(' | '));
    check(`${prof.id}: wall clock <= ${FX.wallBudgetMs} ms`, wall <= FX.wallBudgetMs, String(wall));
    dbAll += P.db.count() + Q.db.count();
    metrics.world[prof.id] = { seed: prof.seed, simSeconds: Math.round(rep.t), firstKill: r1(f.kill), firstBagDrop: r1(f.bagDrop), firstBag: r1(f.bag), firstXp: r1(f.xp), firstLevel: r1(f.level), firstAbility: r1(f.ability), firstPickup: r1(f.pickup), firstQuest: r1(f.quest),
      maxRewardGap: r1(rep.maxGap), deaths: rep.deaths, level: rep.level, kills: rep.kills, items: rep.items, counts: rep.counts, casts: rep.casts, minHp: rep.minHp,
      portalWalk: portal.reached ? r1(portal.t) : null, portalPathTiles: portal.path, firstFrameMs: Math.round(ff), smallButtons: lay.small.length, stickOverlaps: lay.over.length, tinyText: lay.tiny.length, consoleErrors: errs.length, wallMs: wall };
    await P.ctx.close(); await Q.ctx.close();
  }

  // ===== 2. isles profiles =====
  for (const prof of FX.isles.filter((q) => !ONLY || q.id.indexOf(ONLY) >= 0)) {
    const w0 = Date.now();
    const P = await newPage(browser, prof.clock || 0);
    const nav0 = Date.now();
    await P.page.goto(ORIGIN + '/game/games/isles/index.html?test=1&seed=' + prof.seed);
    await P.page.waitForFunction(() => !!(window.__isles && window.__isles.world), null, { timeout: 20000, polling: 'raf' });
    const navMs = Date.now() - nav0;
    await P.page.waitForTimeout(300);
    const lay = await P.page.evaluate(`(${LAYOUT})('#stick')`);
    const fresh = await P.page.evaluate(() => ({ tames: window.__isles.tamesLive().roster.length, hero: window.__isles.heroInfo().fromProfile }));
    check(`${prof.id}: a fresh profile (no tames, no hero profile)`, fresh.tames === 0 && fresh.hero === false, JSON.stringify(fresh));
    const rep = await P.page.evaluate(`(${ISLES_BOT})(${TG.isles.simSeconds})`);
    const ffi = navMs; // the page clock is frozen on this page: first frame = goto -> the first live frame with the test handle, measured here
    const lay2 = await P.page.evaluate(`(${LAYOUT})('#stick')`); // after a tame: Feed / Ride / Follow can show
    const wall = Date.now() - w0;
    console.log(`INFO ${prof.id}: ${JSON.stringify(rep)} | wall ${wall} ms | first frame ${ffi} ms`);
    console.log(`INFO ${prof.id} layout: ${JSON.stringify(lay)} after: ${JSON.stringify(lay2)}`);
    gate(prof.id, 'firstTame', rep.tame, TG.isles.firstTame);
    const actFrac = rep.samples ? (rep.samples - rep.empty - rep.noVerb.length) / rep.samples : 0;
    check(`${prof.id}: every hint that shows names an action (press / tap / feed / walk / ...)`, rep.noVerb.length === 0, JSON.stringify(rep.noVerb));
    check(`${prof.id}: the hint is never empty while a tameable creature is within 5 tiles`, rep.nearSamples > 0 && rep.nearEmpty === 0, JSON.stringify({ near: rep.nearSamples, empty: rep.nearEmpty }));
    gate(prof.id, 'hintActionPct', Math.round(actFrac * 100), TG.isles.hintActionPct, true); // % of sim seconds whose hint names an action
    const uniq = (x, y) => Array.from(new Set(x.concat(y)));
    const small = uniq(lay.small, lay2.small), over = uniq(lay.over, lay2.over), tiny = uniq(lay.tiny, lay2.tiny);
    gate(prof.id, 'layout.smallButtons', small.length, 0); if (small.length) console.log('  small: ' + small.join(', '));
    gate(prof.id, 'layout.stickOverlaps', over.length, 0); if (over.length) console.log('  over: ' + over.join(', '));
    gate(prof.id, 'layout.tinyText', tiny.length, 0); if (tiny.length) console.log('  tiny: ' + tiny.join(' | '));
    gate(prof.id, 'layout.firstFrameMs', ffi, TG.layout.firstFrameMs);
    check(`${prof.id}: 0 console errors`, P.errors.length === 0, P.errors.slice(0, 3).join(' | '));
    check(`${prof.id}: wall clock <= ${FX.wallBudgetMs} ms`, wall <= FX.wallBudgetMs, String(wall));
    dbAll += P.db.count();
    metrics.isles[prof.id] = { seed: prof.seed, firstTame: r1(rep.tame), simSeconds: Math.round(rep.t), tamedSpecies: rep.tames, hintSamples: rep.samples, hintEmpty: rep.empty, hintNoAction: rep.noVerb.length, hintActionPct: Math.round(actFrac * 100), nearSamples: rep.nearSamples, nearEmpty: rep.nearEmpty, deaths: rep.deaths, kills: rep.stats.kills,
      firstFrameMs: Math.round(ffi), smallButtons: small.length, stickOverlaps: over.length, tinyText: tiny.length, consoleErrors: P.errors.length, wallMs: wall };
    await P.ctx.close();
  }

  check('0 database requests or sockets in every profile', dbAll === 0, String(dbAll));
  metrics.dbAttempts = dbAll;
  try { fs.writeFileSync(METRICS, JSON.stringify(metrics, null, 2) + '\n'); console.log('INFO wrote ' + path.relative(path.join(__dirname, '..', '..'), METRICS)); } catch (e) { check('ftue-metrics.json written', false, e.message); }
  await browser.close();
  done();
})();
