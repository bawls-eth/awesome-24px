// QI (NEXT-SLICES-3): the isles first-ten-minutes gate 2, on EVERY island (?isle=home|jungle|tundra|reef|mars), from a fresh profile at
// 390x844, hasTouch, coarse pointer. Profiles: tests/fixtures/isles-ftue-profiles.json. Simulated time (the FT1 pattern): the page clock
// is frozen (performance.now, the rAF timestamp and Date.now are pinned; Math.random is a fixed-seed generator), the page's own update is
// paused and a scripted bot steps the REAL update through window.__isles.step (?test=1) with a fixed dt, advancing the page's own clock
// (__isles.clock) by the same dt, so node regrowth and the spawner see sim time. No sleeps; the wall clock stays <= 90 s a profile.
// The bot: gathers (walks a BFS path over the page's own walkable tiles to the nearest glint or gather spot), tames what the starter
// pouch can feed (knock out with soothe shots, then feed), hunts the rest for drops, defends itself and explores when nothing is near.
//  1 first interactive action (a gather, a hit on a creature, an accepted feed) <= 20 s sim; first gather <= TG; first tame, else first
//    drop, <= 180 s on islands with tameables; the hint names an action in every sampled sim second; no 45 s window without a reward
//    event (gather, drop, tame, medal; IF1: a first-sighting journal entry, __isles.events() kind 'spot'); <= 1 death. IF1: the bot also
//    walks over a forage sparkle (__isles.sparkle()) within 10 tiles, as a player would.
//  2 layout (start, after the run, craft panel open): every visible button >= 44 px, not under the canvas, off the stick; text >= 12 px;
//    first frame < 3 s; 0 console errors; tundra / mars show their meter on the first frame.
//  3 reachability from a fresh profile through crafting: home -> jungle (sea chart) -> gather -> the real Craft panel (raft) -> reef ->
//    gather -> tundra -> gather -> rocket core -> mars. Gathering is done by standing the hero on each node tile (the real walk-over
//    pickup), travel by the real dock Sail button and the sea chart. A step the current page does not allow is a known issue.
// A miss fails, except a target listed in the fixture's knownIssues: that one must not be worse than the recorded base-branch baseline
// (null = never happened on the base branch) and the gap is printed. Counts go to design/ftue-metrics.json (`isles2`, merged).
// 0 DB requests, 0 sockets (blockDb), no chat, nothing is written anywhere but the page's own localStorage.
// Run: python3 -m http.server 8440 &   BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/isles-first-ten.test.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'isles-ftue-profiles.json'), 'utf8'));
const METRICS = path.join(__dirname, '..', 'design', 'ftue-metrics.json');
const TG = FX.targets; const KNOWN = FX.knownIssues || {};
const ONLY = process.env.QI_ONLY || '';
const r1 = (v) => (v === null || v === undefined ? null : Math.round(v * 10) / 10);

// a target check (lower is better unless `higher`); a known issue passes only when not worse than its baseline (null = never)
function gate(profile, key, value, target, higher) {
  const has = value !== null && value !== undefined;
  const ok = has && (higher ? value >= target : value <= target);
  const name = `${profile}: ${key} ${higher ? '>=' : '<='} ${target} (measured ${has ? r1(value) : 'never'})`;
  const kb = KNOWN[profile] && KNOWN[profile][key];
  if (ok || kb === undefined) { check(name, ok); return ok; }
  const v = has ? r1(value) : null;
  const notWorse = kb === null ? true : v !== null && (higher ? v >= kb : v <= kb);
  console.log(`KNOWN-ISSUE ${profile}: ${key} target ${target}, baseline ${kb === null ? 'never' : kb}, measured ${v === null ? 'never' : v}, gap ${v === null ? 'n/a' : r1(higher ? target - v : v - target)}`);
  check(`${profile}: ${key} not worse than the recorded baseline ${kb === null ? 'never' : kb} (known issue, target ${target})`, notWorse, String(value));
  return false;
}

async function newPage(browser, clockOff, live) {
  const v = FX.viewport;
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, hasTouch: v.hasTouch, isMobile: v.isMobile });
  const db = await blockDb(ctx);
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' })); // exits: no network
  await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
  const page = await ctx.newPage(); const errors = []; const sockets = [];
  page.on('websocket', (ws) => sockets.push(ws.url()));
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript(() => { if (!sessionStorage.qiFresh) { sessionStorage.qiFresh = '1'; localStorage.clear(); } }); // fresh on the first load only
  await page.addInitScript(() => { let s = 0x2f6b1c3d; window.__ftReseed = (n) => { s = n | 0; }; Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; });
  // pinned clocks: performance.now and the rAF timestamp stand still; Date.now is noon UTC on a fixed day + the profile offset (the page
  // clock then moves only when the bot advances __isles.clock). Real frames still render while the bot is not holding them.
  if (live) await page.addInitScript(() => { const p0 = performance.now(), B = Date.UTC(2026, 10, 22, 12, 0, 0); Date.now = () => B + Math.floor(performance.now() - p0); }); // the reach leg: page time runs (the HUD updates), on a pinned day
  else await page.addInitScript((off) => { const T0 = 1000; const RN = performance.now.bind(performance); window.__qiFF = null; performance.now = () => T0; const DZ = Date.UTC(2026, 10, 22, 12, 0, 0) + off; Date.now = () => DZ; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => raf(() => { if (window.__qiFF === null && window.__isles) window.__qiFF = RN(); if (!window.__ftHold) cb(T0); }); }, Number(clockOff) || 0);
  return { ctx, page, errors, db, sockets };
}

// ---------- layout (the FT1 pass, plus a canvas check: a control whose centre shows the canvas is buried) ----------
const LAYOUT = `(sticksSel) => {
  const vis = (e) => { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && e.closest('[hidden]') === null; };
  const box = (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, r: r.right, b: r.bottom, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }; };
  const name = (e) => e.id || (e.dataset && (e.dataset.recipe || e.dataset.isle) ? e.className.split(' ')[0] + ':' + (e.dataset.recipe || e.dataset.isle) : '') || (e.className && String(e.className).split(' ')[0]) || e.tagName;
  const onScreen = (b) => b.r > 0 && b.b > 0 && b.x < innerWidth && b.y < innerHeight;
  const sticks = [...document.querySelectorAll(sticksSel)].filter(vis).map((e) => Object.assign(box(e), { n: name(e) }));
  const hit = (a, b) => a.x < b.r - 0.5 && b.x < a.r - 0.5 && a.y < b.b - 0.5 && b.y < a.b - 0.5;
  const at = (b) => document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, (b.x + b.r) / 2)), Math.min(innerHeight - 1, Math.max(0, (b.y + b.b) / 2)));
  // inside the scrolling panel (#panel, overflow auto), a control whose centre is outside its visible area is not measured: the player scrolls to it; only the part of the control in the panel's visible area counts (the player scrolls to the rest)
  const all = [...document.querySelectorAll('button, [role="button"], a[href]')].filter(vis).map((e) => Object.assign(box(e), { n: name(e), e })).filter(onScreen);
  const clipped = (b) => { const sp = b.e.closest('.panel'); if (!sp) return false; const r = sp.getBoundingClientRect(), cy = (b.y + b.b) / 2; return cy <= r.top || cy >= r.bottom; };
  const live = all.filter((b) => !clipped(b));
  const underCanvas = live.filter((b) => { const t = at(b); return !!t && t.tagName === 'CANVAS' && !b.e.contains(t); }).map((b) => b.n);
  const covered = live.filter((b) => { const t = at(b); return !t || !(b.e.contains(t) || t.contains(b.e)); }).map((b) => b.n);
  const buttons = live.filter((b) => { const t = at(b); return !!t && (b.e.contains(t) || t.contains(b.e)); }).map((b) => { delete b.e; return b; });
  const small = buttons.filter((b) => b.w < 44 || b.h < 44).map((b) => b.n + ' ' + b.w + 'x' + b.h);
  const over = []; buttons.forEach((b) => sticks.forEach((s) => { if (hit(b, s)) over.push(b.n + '/' + s.n); }));
  const tiny = []; const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    if (!t.textContent.trim()) continue; const e = t.parentElement; if (!e || !vis(e)) continue;
    const rg = document.createRange(); rg.selectNodeContents(t); const rr = rg.getBoundingClientRect(); if (!(rr.width > 0 && rr.height > 0) || !onScreen({ x: rr.x, y: rr.y, r: rr.right, b: rr.bottom })) continue;
    const fs = parseFloat(getComputedStyle(e).fontSize); if (fs < 12) tiny.push(name(e) + ' ' + fs + 'px "' + t.textContent.trim().slice(0, 24) + '"');
  }
  return { buttons: buttons.length, sticks: sticks.length, small: [...new Set(small)], over, tiny: [...new Set(tiny)], underCanvas, covered, coarse: matchMedia('(pointer: coarse)').matches };
}`;

// ---------- the bot (installed in the page; state on window.__qi, stepped in chunks so page timers such as the respawn can run) ----------
const BOT = `(rseed) => {
  const I = window.__isles, CR = window.MMCreatures, TL = I.tile, W = I.world.w, H = I.world.h, DT = 1 / 30;
  I.pause(true); window.__ftHold = true; if (window.__ftReseed) window.__ftReseed(rseed);
  const VERB = /\\b(press|tap|feed|walk|knock|soothe|stay|ride|keep|explore|find|look|open|follow|shoot|fire|gather|sail|place|head|go|move|step|craft|warm|return)\\b/i;
  const S = window.__qi = { t: 0, first: {}, counts: {}, events: [], lastReward: 0, maxGap: 0, gapAt: 0, samples: 0, empty: 0, noVerb: [], deaths: 0, wasDead: false,
    tamed0: I.stats().tamed, picked0: I.picked(), glog0: 0, medals0: I.medals().length, drops0: JSON.stringify(I.drops()), path: null, pi: 0, goal: null, goalT: 0, bad: {}, tried: {},
    target: null, fireT: 0, feedT: 0, gatherT: 0, sT: 0, lastPos: null, chkT: 1, unstick: 0, ux: 0, uy: 0, rs: rseed >>> 0 || 7, hp: {}, log: [], minHp: I.hero().hp, evT: -1, hunt: {} };
  { const es = I.events ? I.events() : []; if (es.length) S.evT = es[es.length - 1].t; }
  const glogN = () => { const g = I.gatherLog(); return Object.keys(g).reduce((a, k) => a + (Number(g[k]) || 0), 0); };
  S.glog0 = glogN();
  const ev = (k) => { const t = S.t; if (S.first[k] === undefined) S.first[k] = t; S.counts[k] = (S.counts[k] || 0) + 1; if (S.events.length < 400) S.events.push({ t: Math.round(t * 10) / 10, kind: k });
    if (k === 'hit' || k === 'feed') return; const g = t - S.lastReward; if (g > S.maxGap) { S.maxGap = g; S.gapAt = S.lastReward; } S.lastReward = t; };
  const pass = (tx, ty) => tx >= 0 && ty >= 0 && tx < W && ty < H && !I.heroSolid(tx, ty);
  const tileOf = (v) => Math.floor(v / TL);
  // BFS over the page's own hero-walkable tiles (4-neighbour) from the hero to the nearest tile in goals (a Set of y*W+x)
  function bfs(goals, maxN) {
    const h = I.hero(), sx = h.tx, sy = h.ty, prev = new Int32Array(W * H).fill(-1), q = new Int32Array(W * H); let hd = 0, n = 0, hitI = -1;
    const st = sy * W + sx; prev[st] = st; q[n++] = st;
    while (hd < n && n < (maxN || 1e9)) { const c = q[hd++]; if (goals.has(c)) { hitI = c; break; } const cx = c % W, cy = (c / W) | 0;
      for (let k = 0; k < 4; k++) { const nx = cx + (k === 0) - (k === 1), ny = cy + (k === 2) - (k === 3); if (!pass(nx, ny)) continue; const ni = ny * W + nx; if (prev[ni] >= 0) continue; prev[ni] = c; q[n++] = ni; } }
    if (hitI < 0) return null; const out = []; for (let c = hitI; c !== st; c = prev[c]) out.push({ x: (c % W + 0.5) * TL, y: (((c / W) | 0) + 0.5) * TL, i: c }); return out.reverse();
  }
  const foodOk = (c) => { const d = CR && CR.get(c.kind); if (!d || !d.diet || !d.diet.length) return false; const pz = I.pouch(); return d.diet.some((f) => (pz[f] | 0) > 0); };
  const tameable = (c) => { const d = CR && CR.get(c.kind); return !!(d && d.tame) && c.st && c.st !== 'tamed' && c.st !== 'escaped' && c.st !== 'dead'; };
  // the next walk goal: the nearest ready glint or untaken gather spot (by straight distance, then BFS), else a far exploration tile
  function pickGoal(h) {
    const cand = [];
    I.nodes().forEach((n) => { if (n.ready && !S.bad[n.y * W + n.x]) cand.push({ x: n.x, y: n.y, d: Math.hypot((n.x + 0.5) * TL - h.x, (n.y + 0.5) * TL - h.y), k: 'node' }); });
    I.spots().forEach((p) => { if (!p.taken && !S.bad[p.y * W + p.x]) cand.push({ x: p.x, y: p.y, d: Math.hypot((p.x + 0.5) * TL - h.x, (p.y + 0.5) * TL - h.y), k: 'spot' }); });
    cand.sort((a, b) => a.d - b.d);
    for (const c of cand.slice(0, 4)) { const gs = new Set([c.y * W + c.x]); if (c.k === 'spot') for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (pass(c.x + dx, c.y + dy)) gs.add((c.y + dy) * W + c.x + dx);
      const p = bfs(gs, 60000); if (p) { S.path = p; S.pi = 0; S.goal = c; S.goalT = S.t; return; } S.bad[c.y * W + c.x] = 1; }
    // explore: a random walkable tile 15-40 tiles away
    for (let k = 0; k < 12; k++) { S.rs = (S.rs * 1103515245 + 12345) % 2147483648; const a = (S.rs / 2147483648) * 6.283, r = 15 + (k % 4) * 8; const gx = Math.round(h.tx + Math.cos(a) * r), gy = Math.round(h.ty + Math.sin(a) * r);
      if (!pass(gx, gy)) continue; const p = bfs(new Set([gy * W + gx]), 60000); if (p) { S.path = p; S.pi = 0; S.goal = { x: gx, y: gy, k: 'explore' }; S.goalT = S.t; return; } }
    S.path = null; S.goal = null;
  }
  S.think = () => {
    const h = I.hero(); S.minHp = Math.min(S.minHp, h.hp);
    if (h.dead && !S.wasDead) { S.deaths++; S.log.push('death at ' + Math.round(S.t)); } S.wasDead = h.dead;
    // reward polling
    const tm = I.stats().tamed; while (S.tamed0 < tm) { S.tamed0++; ev('tame'); }
    const pk = I.picked(); while (S.picked0 < pk) { S.picked0++; ev('gather'); }
    const gl = glogN(); while (S.glog0 < gl) { S.glog0++; ev('gather'); }
    const md = I.medals().length; while (S.medals0 < md) { S.medals0++; ev('medal'); }
    const dr = JSON.stringify(I.drops()); if (dr !== S.drops0) { S.drops0 = dr; ev('drop'); }
    // IF1: a first sighting ("New in your journal: ...", event kind 'spot') is a reward beat too
    if (I.events) { const es = I.events(); for (let i = 0; i < es.length; i++) if (es[i].t > S.evT) { S.evT = es[i].t; if (es[i].kind === 'spot') ev('spot'); } }
    // hint, once a sim second
    if ((S.sT -= DT) <= 0) { S.sT = 1; const ht = I.hint() || ''; S.samples++; if (!ht) S.empty++; else if (!VERB.test(ht)) { S.nv = (S.nv || 0) + 1; if (S.noVerb.length < 5) S.noVerb.push(ht); } }
    if (h.dead) return { mx: 0, my: 0 };
    const cs = I.creatures();
    cs.forEach((c) => { const o = S.hp[c.uid]; if (o !== undefined && c.hp < o && S.aimed === c.uid) ev('hit'); S.hp[c.uid] = c.hp; });
    // a gather spot in reach: G
    if ((S.gatherT -= DT) <= 0) { S.gatherT = 0.5; const r = I.gather(); if (r && r.ok) { /* counted through the gather log */ } }
    let mx = 0, my = 0, busy = false; const low = h.hp < 0.4 * h.maxHp;
    // air on mars: the hint / toast says "head back to a dome or the landing pad" when it runs low; the bot walks back to the landing
    // (the spawn point is always sheltered) and waits there until the meter is full again
    if ((S.envT = (S.envT || 0) - DT) <= 0) { S.envT = 1; const e = I.env(); const m = e.o2; if (m) { if ((m.warn || m.empty) && !e.sheltered && !S.home) { S.home = true; S.homes = (S.homes || 0) + 1; S.homePath = null; } if (S.home && e.sheltered && m.t <= 3) S.home = false; } }
    // IF1: low on HP away from a fight you can win: walk to the nearest rest spot (dock, campfire, hot spring, dome, home) and rest
    // there until full (MMIsleRest heals to full in <= 3 s); and step out of a boss ring the bot did not mean to enter
    if ((S.bossT = (S.bossT || 0) - DT) <= 0) { S.bossT = 0.5; const b = I.boss(); S.boss = b && b.engaged && b.st ? { x: b.x, y: b.y, r: b.arenaR || 200 } : null; }
    if (!S.home && !S.rest && I.restPoints && S.t >= (S.restCd || 0) && (h.hp < 0.25 * h.maxHp || (h.hp < 0.45 * h.maxHp && !(S.target && cs.some((q) => q.uid === S.target && (q.ko || q.st === 'taming')))))) {
      if (!S.restPts) S.restPts = I.restPoints();
      let best = null, bd = 1e18; S.restPts.forEach((p) => { const d = (p.x - h.tx) * (p.x - h.tx) + (p.y - h.ty) * (p.y - h.ty); if (d < bd) { bd = d; best = p; } });
      if (best) { S.rest = { x: best.x, y: best.y, path: bfs(new Set([best.y * W + best.x]), 80000) || [], pi: 0 }; S.rests = (S.rests || 0) + 1; }
    }
    if (S.rest && !S.home) {
      busy = true;
      if (h.hp >= h.maxHp) S.rest = null;
      else if (!I.rest().spot) { let wp = S.rest.path[S.rest.pi]; while (wp && Math.hypot(wp.x - h.x, wp.y - h.y) < 8) { S.rest.pi++; wp = S.rest.path[S.rest.pi]; } if (wp) { const l = Math.hypot(wp.x - h.x, wp.y - h.y) || 1; mx = (wp.x - h.x) / l; my = (wp.y - h.y) / l; } else { S.rest = null; S.restCd = S.t + 10; } }
    }
    if (S.boss && !S.home) { const dx = h.x - S.boss.x, dy = h.y - S.boss.y, l = Math.hypot(dx, dy) || 1; busy = true; S.path = null; mx = dx / l; my = dy / l; }
    if (S.home) {
      busy = true; const sp = I.world.spawnPoint;
      if (!S.homePath || S.homePi >= S.homePath.length) { S.homePath = bfs(new Set([sp.y * W + sp.x]), 80000) || []; S.homePi = 0; }
      let wp = S.homePath[S.homePi]; while (wp && Math.hypot(wp.x - h.x, wp.y - h.y) < 8) { S.homePi++; wp = S.homePath[S.homePi]; }
      if (wp) { const l = Math.hypot(wp.x - h.x, wp.y - h.y) || 1; mx = (wp.x - h.x) / l; my = (wp.y - h.y) / l; }
    }
    // a ready glint within 4 tiles: a player picks it up on the way (walk-over)
    let near = null, nd = 4 * TL; I.nodes().forEach((n) => { if (!n.ready || S.bad[n.y * W + n.x]) return; const d = Math.hypot((n.x + 0.5) * TL - h.x, (n.y + 0.5) * TL - h.y); if (d < nd) { nd = d; near = n; } });
    const goNear = () => { if (S.home) return; const ux = (near.x + 0.5) * TL - h.x, uy = (near.y + 0.5) * TL - h.y, l = Math.hypot(ux, uy) || 1; mx = ux / l; my = uy / l; busy = true; };
    // 1 tame what the pouch can feed (the quickest one in reach); stick with it while it stays tameable. Low on HP: no new knockouts.
    const tc = cs.filter((c) => tameable(c) && foodOk(c) && !(S.tried[c.uid] > 40) && (!low || c.ko || c.st === 'calm' || c.st === 'taming' || (CR.get(c.kind).tame.method !== 'knockout')));
    let c = tc.find((q) => q.uid === S.target) || null;
    if (!c) { let best = 1e9; tc.forEach((q) => { const d = Math.hypot(q.x - h.x, q.y - h.y); if (d > 22 * TL) return; const k = d / 150 + (((CR.get(q.kind) || {}).tame || {}).time || 60) + (q.ko || q.st === 'calm' || q.st === 'taming' ? -1000 : 0); if (k < best) { best = k; c = q; } }); }
    // IF1: a forage sparkle (it shows after 40 s without a reward) within 10 tiles: walk over to it (a BFS path), unless out of air
    const spk = I.sparkle ? I.sparkle() : null;
    const spkD = spk ? Math.hypot((spk.x + 0.5) * TL - h.x, (spk.y + 0.5) * TL - h.y) : 1e9;
    if (spk && spk.ready && !S.boss && ((!S.home && !S.rest && spkD < 10 * TL) || spkD < 5 * TL)) {
      busy = true;
      if (!S.spkPath || S.spkKey !== spk.x + ',' + spk.y) { S.spkKey = spk.x + ',' + spk.y; S.spkPath = bfs(new Set([spk.y * W + spk.x]), 60000) || []; S.spkPi = 0; }
      let wp = S.spkPath[S.spkPi]; while (wp && Math.hypot(wp.x - h.x, wp.y - h.y) < 8) { S.spkPi++; wp = S.spkPath[S.spkPi]; }
      if (wp) { const l = Math.hypot(wp.x - h.x, wp.y - h.y) || 1; mx = (wp.x - h.x) / l; my = (wp.y - h.y) / l; }
      else { const gx = (spk.x + 0.5) * TL, gy = (spk.y + 0.5) * TL, l = Math.hypot(gx - h.x, gy - h.y); if (l > 3) { mx = (gx - h.x) / l; my = (gy - h.y) / l; } }
    } else if (c && !S.home && !S.rest && !S.boss) {
      const cd = Math.hypot(c.x - h.x, c.y - h.y); const def = CR.get(c.kind); const ko = def.tame.method === 'knockout';
      if (S.target !== c.uid) { S.target = c.uid; if (S.log.length < 30) S.log.push(Math.round(S.t) + 's tame ' + c.kind + ' ' + c.st + ' d' + Math.round(cd)); }
      // IF1: between two feeds (the creature is still chewing), pick up a glint a few steps away and come back, as a player would
      const chewing = (c.ko || c.st === 'taming') && S.fedAt !== undefined && S.fedUid === c.uid && S.t - S.fedAt < (def.tame.feedEvery || 6) - 3 &&
        near && Math.hypot((near.x + 0.5) * TL - c.x, (near.y + 0.5) * TL - c.y) < 4 * TL;
      if (near && (cd > 6 * TL || chewing)) goNear();
      else {
        busy = true; if (c.st === 'wild' && !c.ko) S.tried[c.uid] = (S.tried[c.uid] || 0) + DT;
        const ux = (c.x - h.x) / (cd || 1), uy = (c.y - h.y) / (cd || 1);
        if (ko && !c.ko) { I.soothe(true); if (cd > 4 * TL) { mx = ux; my = uy; } else if (cd < 2.5 * TL) { mx = -ux; my = -uy; } if ((S.fireT -= DT) <= 0 && cd < 7 * TL) { S.fireT = 0.25; S.aimed = c.uid; I.fire(c.x - h.x, c.y - 8 - h.y); } }
        else { if (cd > 26) { const k = cd < 6 * TL ? 0.45 : 1; mx = ux * k; my = uy * k; } if ((S.feedT -= DT) <= 0) { S.feedT = 1; const r = I.feed(); if (r && r.ok) { ev('feed'); S.fedAt = S.t; S.fedUid = c.uid; } } }
      }
    } else S.target = null;
    if (!busy && near && !S.home) goNear();
    // 2 hunt what cannot be tamed from the pouch (drops) while HP is above half: passive / neutral ones first, normal bolts, 3-5 tiles away
    if (!busy && h.hp >= 0.5 * h.maxHp) {
      let foe = null, fd = 8 * TL; cs.forEach((q) => { if (q.st === 'tamed' || q.ko || (tameable(q) && foodOk(q)) || (S.hunt[q.uid] || 0) > 15) return; const d = Math.hypot(q.x - h.x, q.y - h.y) + ((q.hostile || q.mood === 'hostile') ? 3 * TL : 0); if (d < fd) { fd = d; foe = q; } });
      if (foe) { busy = true; I.soothe(false); S.hunt[foe.uid] = (S.hunt[foe.uid] || 0) + DT; /* IF1: a hunt that takes > 15 s is given up */ fd = Math.hypot(foe.x - h.x, foe.y - h.y); const ux = (foe.x - h.x) / (fd || 1), uy = (foe.y - h.y) / (fd || 1); if (fd > 5 * TL) { mx = ux; my = uy; } else if (fd < 3 * TL) { mx = -ux; my = -uy; } else { mx = -uy * 0.6; my = ux * 0.6; }
        if ((S.fireT -= DT) <= 0) { S.fireT = 0.25; S.aimed = foe.uid; I.fire(foe.x - h.x, foe.y - 8 - h.y); } }
    }
    // 3 walk to the next glint / gather spot, else explore; at the end of the path step onto the goal tile's centre (up to 2 s), then
    // give that goal up if it is still there (a spot that will not gather, a glint that did not pick up)
    if (!busy) {
      const gone = S.goal && ((S.goal.k === 'node' && !I.nodes().some((n) => n.x === S.goal.x && n.y === S.goal.y && n.ready)) || (S.goal.k === 'spot' && I.spots().some((p) => p.x === S.goal.x && p.y === S.goal.y && p.taken)));
      if (S.path && S.pi >= S.path.length && S.goal && S.goal.k !== 'explore' && !gone) {
        if (S.endT === undefined) S.endT = S.t;
        const gx = (S.goal.x + 0.5) * TL, gy = (S.goal.y + 0.5) * TL, l = Math.hypot(gx - h.x, gy - h.y);
        if (S.t - S.endT < 2) { if (l > 4) { mx = (gx - h.x) / l; my = (gy - h.y) / l; } } else { S.bad[S.goal.y * W + S.goal.x] = 1; S.path = null; S.endT = undefined; }
      } else {
        S.endT = undefined;
        if (!S.path || S.pi >= S.path.length || S.t - S.goalT > 40 || gone) pickGoal(h);
        if (S.path) { let wp = S.path[S.pi]; while (wp && Math.hypot(wp.x - h.x, wp.y - h.y) < 8) { S.pi++; wp = S.path[S.pi]; } if (wp) { const l = Math.hypot(wp.x - h.x, wp.y - h.y) || 1; mx = (wp.x - h.x) / l; my = (wp.y - h.y) / l; } }
      }
    }
    // self-defence: an awake hostile close by (not the one being tamed) gets shots (never through the creature being fed); back off from it
    let foe = null, fd = 4.5 * TL; cs.forEach((q) => { if (q.uid === (c && c.uid) || q.st === 'tamed' || q.ko || !(q.hostile || q.mood === 'hostile')) return; const d = Math.hypot(q.x - h.x, q.y - h.y); if (d < fd) { fd = d; foe = q; } });
    const inLine = (q) => { if (!c || !(c.ko || c.calm || c.st === 'taming')) return false; const ax = q.x - h.x, ay = q.y - h.y, bx = c.x - h.x, by = c.y - h.y, la = Math.hypot(ax, ay) || 1, lb = Math.hypot(bx, by) || 1; return lb < la + 20 && (ax * bx + ay * by) / (la * lb) > 0.9; };
    // IF1: a fight that goes nowhere (a hostile on you for 20 s with no reward meanwhile): walk away from it, 20-35 tiles, without
    // shooting, as a player would (a badly hurt hero is then left alone: the page's mercy rule)
    if (foe && !S.flee) S.fightT = (S.fightT || 0) + DT; else if (!foe) S.fightT = 0;
    if (!S.flee && !S.home && S.fightT > 20 && S.t - S.lastReward > 20) {
      S.fightT = 0; const ax = h.x - foe.x, ay = h.y - foe.y, la = Math.hypot(ax, ay) || 1;
      for (let k = 0; k < 10 && !S.flee; k++) { const r = 20 + (k % 4) * 5, sp = (k - 5) * 0.25, ca = Math.cos(sp), sa = Math.sin(sp); const ux = (ax * ca - ay * sa) / la, uy = (ax * sa + ay * ca) / la;
        const gx = Math.round(h.tx + ux * r), gy = Math.round(h.ty + uy * r); if (!pass(gx, gy)) continue; const p = bfs(new Set([gy * W + gx]), 60000); if (p) S.flee = { path: p, pi: 0, until: S.t + 14 }; }
      if (S.flee) { S.flees = (S.flees || 0) + 1; S.path = null; }
    }
    if (S.flee) {
      let wp = S.flee.path[S.flee.pi]; while (wp && Math.hypot(wp.x - h.x, wp.y - h.y) < 8) { S.flee.pi++; wp = S.flee.path[S.flee.pi]; }
      if (!wp || S.t > S.flee.until) S.flee = null; else { const l = Math.hypot(wp.x - h.x, wp.y - h.y) || 1; mx = (wp.x - h.x) / l; my = (wp.y - h.y) / l; }
    }
    if (foe) { if (!inLine(foe) && !S.rest && !S.flee && (S.fireT -= DT) <= 0) { S.fireT = 0.25; S.aimed = foe.uid; I.fire(foe.x - h.x, foe.y - 8 - h.y); } if (!S.flee && !S.rest && (low || fd < 2.5 * TL)) { mx = mx * 0.3 - (foe.x - h.x) / fd; my = my * 0.3 - (foe.y - h.y) / fd; } }
    if (S.unstick > 0) { S.unstick -= DT; mx = S.ux; my = S.uy; }
    return { mx, my };
  };
  S.step = (secs) => { const n = Math.round(secs / DT); for (let i = 0; i < n; i++) { if (I.hero().dead && S.wasDead) break; /* the page respawns the hero on its next task: hand back */ const m = S.think(); I.step(m.mx, m.my, DT); I.clock.set(I.clock.now() + DT * 1000); S.t += DT;
      if ((S.chkT -= DT) <= 0) { S.chkT = 1; const hh = I.hero(); if (S.lastPos && Math.hypot(hh.x - S.lastPos.x, hh.y - S.lastPos.y) < 12 && (m.mx || m.my) && S.unstick <= 0) { S.rs = (S.rs * 1103515245 + 12345) % 2147483648; const a = (S.rs / 2147483648) * 6.283; S.ux = Math.cos(a); S.uy = Math.sin(a); S.unstick = 0.7; S.path = null; } S.lastPos = { x: hh.x, y: hh.y }; } }
    I.render(); return S.t; };
  S.report = () => { const t = S.t, gap = Math.max(S.maxGap, t - S.lastReward); return { t, first: S.first, counts: S.counts, deaths: S.deaths, maxGap: gap, gapAt: gap === S.maxGap ? S.gapAt : S.lastReward, samples: S.samples, empty: S.empty, noVerbN: S.nv || 0, noVerb: S.noVerb,
    minHp: S.minHp, homes: S.homes || 0, rests: S.rests || 0, flees: S.flees || 0, at: [I.hero().tx, I.hero().ty], goal: S.goal, path: S.path ? S.path.length : 0, bad: Object.keys(S.bad).length, stats: I.stats(), inv: I.inv(), medals: I.medals(), tames: I.tamesLive().roster.map((r) => r.sp), log: S.log.slice(0, 12), events: S.events.slice(0, 40) }; };
  const cs0 = I.creatures();
  return { w: W, h: H, species: I.packSpecies, tameSpecies: I.packSpecies.filter((s) => { const d = I.kindDef(s); return d && d.tameable; }),
    feedable: I.packSpecies.filter((s) => { const d = CR.get(s); const pz = I.pouch(); return d && d.tame && d.diet && d.diet.some((f) => (pz[f] | 0) > 0); }), creatures: cs0.length, nodes: I.nodes().length };
}`;

const fresh = async (page) => page.waitForFunction(() => !!(window.__isles && window.__isles.world), null, { timeout: 20000, polling: 'raf' });

(async () => {
  const browser = await chromium.launch();
  const out = { profiles: {}, reach: null };
  let dbAll = 0, sockAll = 0;
  // one unmeasured warm-up load, so the first profile's first frame measures the page and not the cold single-threaded test server
  // (first-ten-minutes.test.js gets the same from its world profiles running first)
  { const Wm = await newPage(browser, 0); await Wm.page.goto(ORIGIN + '/game/games/isles/index.html?test=1&isle=jungle'); await fresh(Wm.page); dbAll += Wm.db.count(); sockAll += Wm.sockets.length; await Wm.ctx.close(); }

  // ===== 1 + 2: every island =====
  for (const prof of FX.profiles.filter((q) => !ONLY || q.id.indexOf(ONLY) >= 0)) {
    const P = prof.id; const w0 = Date.now();
    const Q = await newPage(browser, prof.clock || 0);
    const nav0 = Date.now();
    await Q.page.goto(ORIGIN + '/game/games/isles/index.html?test=1&isle=' + prof.isle + '&seed=' + prof.seed);
    await fresh(Q.page);
    // first frame: the real (unfrozen) page time from navigation start to the first frame that has the test handle (in-page, like FT1 world)
    const ff = Math.round(await Q.page.waitForFunction(() => window.__qiFF, null, { timeout: 10000 }).then((h) => h.jsonValue())); const navMs = Date.now() - nav0;
    await Q.page.waitForTimeout(300);
    const lay0 = await Q.page.evaluate(`(${LAYOUT})('#stick')`);
    const st0 = await Q.page.evaluate(() => ({ tames: window.__isles.tamesLive().roster.length, hero: window.__isles.heroInfo().fromProfile, inv: Object.keys(window.__isles.inv()).length, pack: window.__isles.pack, isle: window.__isles.isle, env: window.__isles.env().hud }));
    check(`${P}: a fresh profile on ${prof.isle} (pack ${st0.pack}): no tames, no hero profile, an empty pack`, st0.tames === 0 && st0.hero === false && st0.inv === 0, JSON.stringify(st0));
    if (prof.meter) check(`${P}: the ${prof.meter} meter shows on the first frame`, st0.env.box && (prof.meter === 'warmth' ? st0.env.warm !== null : st0.env.o2 !== null), JSON.stringify(st0.env));
    // the craft panel through the real Craft button (layout pass with it open), then closed again
    await Q.page.tap('#btn-pack'); await Q.page.tap('#btn-craft'); // 8B: Craft is a Pack tab
    await Q.page.waitForFunction(() => !document.getElementById('panel').hidden, null, { timeout: 3000 }).catch(() => {});
    const layC = await Q.page.evaluate(`(${LAYOUT})('#stick')`);
    await Q.page.tap('#panel-close');
    await Q.page.waitForTimeout(100);
    const info = await Q.page.evaluate(`(${BOT})(${Number(prof.seed) || 1})`);
    const sim = TG.simSeconds;
    for (let t = 0, k = 0; t < sim && k < 5000; k++) { const t2 = await Q.page.evaluate((n) => window.__qi.step(n), 20); if (t2 === t) await Q.page.waitForTimeout(1); t = t2; } // a dead hero hands back so the page can respawn it
    const rep = await Q.page.evaluate(() => window.__qi.report());
    await Q.page.evaluate(() => { window.__ftHold = false; }); // a few real frames so the HUD shows the end state (Feed / Ride / Gather ...)
    await Q.page.waitForTimeout(400);
    const lay1 = await Q.page.evaluate(`(${LAYOUT})('#stick')`);
    const wall = Date.now() - w0;
    const f = rep.first;
    const hasTame = info.tameSpecies.length > 0;
    const firstAction = Math.min(...['gather', 'hit', 'feed', 'drop', 'tame'].map((k) => (f[k] === undefined ? Infinity : f[k])));
    const tameOrDrop = Math.min(f.tame === undefined ? Infinity : f.tame, f.drop === undefined ? Infinity : f.drop);
    const fin = (v) => (v === Infinity || v === undefined ? null : v);
    console.log(`INFO ${P}: ${JSON.stringify(info)}`);
    console.log(`INFO ${P}: ${JSON.stringify(Object.assign({}, rep, { events: undefined }))} | wall ${wall} ms | first frame ${ff} ms (goto -> handle ${navMs} ms)`);
    console.log(`INFO ${P} events: ${JSON.stringify(rep.events)}`);
    gate(P, 'firstAction', fin(firstAction), TG.firstAction);
    gate(P, 'firstGather', fin(f.gather), TG.firstGather);
    if (hasTame) gate(P, 'firstTameOrDrop', fin(tameOrDrop), TG.firstTameOrDrop);
    if (info.feedable.length) gate(P, 'firstTame', fin(f.tame), TG.firstTameOrDrop);
    else console.log(`INFO ${P}: no species here can be fed from the starter pouch (${info.tameSpecies.join(', ') || 'no tameables'}): a first tame is not possible on this island from a fresh profile`);
    gate(P, 'maxRewardGap', rep.maxGap, TG.maxRewardGap);
    gate(P, 'deaths', rep.deaths, TG.maxDeaths);
    const hintPct = rep.samples ? Math.round(100 * (rep.samples - rep.empty - rep.noVerbN) / rep.samples) : 0;
    gate(P, 'hintActionPct', hintPct, TG.hintActionPct, true); if (rep.noVerb.length || rep.empty) console.log(`  hint gaps: empty ${rep.empty}, no action ${rep.noVerbN}: ${JSON.stringify(rep.noVerb)}`);
    const u = (k) => Array.from(new Set(lay0[k].concat(lay1[k], layC[k])));
    const small = u('small'), over = u('over'), tiny = u('tiny'), under = u('underCanvas'), covered = u('covered');
    gate(P, 'layout.smallButtons', small.length, 0); if (small.length) console.log('  small: ' + small.join(', '));
    gate(P, 'layout.underCanvas', under.length, 0); if (under.length) console.log('  under the canvas: ' + under.join(', '));
    gate(P, 'layout.stickOverlaps', over.length, 0); if (over.length) console.log('  over the stick: ' + over.join(', '));
    gate(P, 'layout.tinyText', tiny.length, 0); if (tiny.length) console.log('  tiny: ' + tiny.join(' | '));
    if (covered.length) console.log(`INFO ${P}: controls covered by another element at their centre: ${covered.join(', ')}`);
    check(`${P}: coarse pointer emulated, the stick is visible`, lay0.coarse && lay0.sticks === 1, JSON.stringify({ coarse: lay0.coarse, sticks: lay0.sticks }));
    gate(P, 'layout.firstFrameMs', ff, TG.firstFrameMs);
    check(`${P}: the bot really played (${sim} s sim)`, rep.t >= sim - 0.5, String(rep.t));
    check(`${P}: 0 console errors`, Q.errors.length === 0, Q.errors.slice(0, 3).join(' | '));
    check(`${P}: wall clock <= ${FX.wallBudgetMs} ms`, wall <= FX.wallBudgetMs, String(wall));
    dbAll += Q.db.count(); sockAll += Q.sockets.length;
    out.profiles[P] = { isle: prof.isle, pack: st0.pack, seed: prof.seed, simSeconds: Math.round(rep.t), tameSpecies: info.tameSpecies.length, feedableSpecies: info.feedable.length,
      firstAction: r1(fin(firstAction)), firstGather: r1(f.gather), firstHit: r1(f.hit), firstDrop: r1(f.drop), firstTame: r1(f.tame), firstMedal: r1(f.medal), firstTameOrDrop: r1(fin(tameOrDrop)),
      maxRewardGap: r1(rep.maxGap), gapAt: r1(rep.gapAt), deaths: rep.deaths, minHp: rep.minHp, counts: rep.counts, tamed: rep.tames, kills: rep.stats.kills, hintSamples: rep.samples, hintEmpty: rep.empty, hintNoAction: rep.noVerbN, hintActionPct: hintPct,
      firstFrameMs: ff, smallButtons: small.length, underCanvas: under.length, stickOverlaps: over.length, tinyText: tiny.length, consoleErrors: Q.errors.length, wallMs: wall };
    await Q.ctx.close();
  }

  // ===== 3: mars / reef reachable from a fresh profile through crafting =====
  if (!ONLY || 'reach'.indexOf(ONLY) >= 0) {
    const w0 = Date.now(); const R = FX.reach; const steps = [];
    const Q = await newPage(browser, 0, true); const page = Q.page;
    const isleNow = () => page.evaluate(() => window.__isles.isle);
    // stand on `n` ready nodes of each kind (the real walk-over pickup: place on the tile, then one sim step)
    const collect = (need) => page.evaluate((nd) => { const I = window.__isles, TL = I.tile; I.pause(true); I.god(true); const got = {};
      Object.keys(nd).forEach((k) => { got[k] = 0; const ns = I.nodes().filter((n) => n.kind === k && n.ready); for (const n of ns) { if ((I.inv()[k] | 0) >= nd[k]) break; I.place((n.x + 0.5) * TL + 0.5, (n.y + 0.5) * TL + 0.5); I.step(0, 0, 1 / 60); I.place((n.x + 2.5) * TL, (n.y + 0.5) * TL); I.step(0, 0, 1 / 60); } got[k] = I.inv()[k] | 0; });
      return got; }, need);
    // the dock, the real Sail button, then the sea chart row for `id`
    const sail = async (id) => {
      await page.evaluate(() => { const I = window.__isles, d = I.dock(); I.pause(true); I.god(true); I.teleport(d.x, d.y); I.step(0, 0, 1 / 60); });
      const sb = await page.waitForSelector('#btn-sail:not([hidden])', { timeout: 3000 }).then(() => true).catch(() => false);
      if (!sb) return { ok: false, why: 'no Sail button at the dock' };
      await page.tap('#btn-sail');
      const row = await page.evaluate((i) => { const b = document.querySelector('#panel-body button.dest[data-isle="' + i + '"]'); return b ? { open: !b.disabled, text: b.textContent } : null; }, id);
      if (!row || !row.open) { await page.tap('#panel-close').catch(() => {}); return { ok: false, why: row ? 'locked: ' + row.text : 'not on the sea chart' }; }
      await Promise.all([page.waitForNavigation({ timeout: 10000 }), page.tap('#panel-body button.dest[data-isle="' + id + '"]')]);
      await fresh(page);
      return { ok: (await isleNow()) === id, text: row.text };
    };
    // the real Craft panel: open it with the Craft button, tap the recipe's Craft button
    const craftPanel = async (recipe) => {
      await page.tap('#btn-pack'); await page.tap('#btn-craft'); // 8B: Craft is a Pack tab
      await page.waitForFunction(() => !document.getElementById('panel').hidden, null, { timeout: 3000 }).catch(() => {});
      const r = await page.evaluate((id) => { const b = document.querySelector('#panel-body .rc-btn[data-recipe="' + id + '"]'); return b ? { listed: true, enabled: !b.disabled } : { listed: false, enabled: false }; }, recipe);
      if (r.listed && r.enabled) { await page.locator('#panel-body .rc-btn[data-recipe="' + recipe + '"]').scrollIntoViewIfNeeded(); await page.tap('#panel-body .rc-btn[data-recipe="' + recipe + '"]'); await page.waitForTimeout(100); }
      const have = await page.evaluate(() => window.__isles.inv());
      await page.tap('#panel-close').catch(() => {});
      return Object.assign(r, { have });
    };
    await page.goto(ORIGIN + '/game/games/isles/index.html?test=1&isle=home');
    await fresh(page);
    const s0 = await page.evaluate(() => ({ isle: window.__isles.isle, inv: window.__isles.inv(), unlock: window.__isles.unlock(), reef: window.__isles.isleOpen('reef'), mars: window.__isles.isleOpen('mars') }));
    check('reach: a fresh profile starts on Hearth Isle with an empty pack and reef / mars locked', s0.isle === 'home' && Object.keys(s0.inv).length === 0 && !s0.reef && !s0.mars, JSON.stringify(s0));
    const leg = async (label, fn) => { const r = await fn(); steps.push(Object.assign({ step: label }, r)); console.log(`INFO reach ${label}: ${JSON.stringify(r)}`); return r; };
    const toJ = await leg('sail home -> jungle', () => sail('jungle'));
    check('reach: home -> jungle through the dock Sail button and the sea chart', toJ.ok, JSON.stringify(toJ));
    const gJ = await leg('gather on the jungle', () => collect(R.jungle));
    check(`reach: the jungle gives the raft and amber inputs by walking over glints (${JSON.stringify(R.jungle)})`, Object.keys(R.jungle).every((k) => gJ[k] >= R.jungle[k]), JSON.stringify(gJ));
    const raft = await leg('craft a raft (Craft panel)', () => craftPanel('raft'));
    const reefOpen = await page.evaluate(() => window.__isles.isleOpen('reef'));
    check('reach: the Craft panel lists the raft, it is craftable, and crafting it opens the reef', raft.listed && raft.enabled && (raft.have.raft | 0) >= 1 && reefOpen, JSON.stringify(raft));
    const toR = await leg('sail jungle -> reef', () => sail('reef'));
    const reefReach = toR.ok;
    const gR = toR.ok ? await leg('gather on the reef', () => collect(R.reef)) : {};
    const toI = toR.ok ? await leg('sail reef -> tundra', () => sail('ice')) : { ok: false };
    const gI = toI.ok ? await leg('gather on the tundra', () => collect(R.tundra)) : {};
    // mars: the panel path first (whatever rocket-core recipe the panel lists), then the module recipe through __isles.craft
    const listed = await page.evaluate(() => Array.from(document.querySelectorAll('#panel-body .rc-btn')).length); // (panel closed: 0)
    const rcPanel = await leg('craft a rocket core (Craft panel)', async () => { const a = await craftPanel('rocket_core'); const b = await craftPanel('rocket_core_drift'); return { iron: a, drift: b, inv: b.have }; });
    let marsOpen = await page.evaluate(() => window.__isles.isleOpen('mars'));
    let marsVia = marsOpen ? 'panel' : '';
    if (!marsOpen) {
      const api = await leg('craft rocket_core_drift through __isles.craft', () => page.evaluate(() => { const I = window.__isles; const r = I.craft('rocket_core_drift'); return { r, open: I.isleOpen('mars'), inv: I.inv(), unlock: I.unlock() }; }));
      marsOpen = api.open; if (marsOpen) marsVia = '__isles.craft';
    }
    const toM = marsOpen ? await leg('sail tundra -> mars', () => sail('mars')) : { ok: false, why: 'mars is still locked' };
    const marsReach = !!toM.ok;
    const reachWall = Date.now() - w0;
    check('reach: the reef is reachable from a fresh profile through crafting (raft on the Craft panel, then the sea chart)', reefReach, JSON.stringify(toR));
    gate('reach', 'reefReachable', reefReach ? 1 : 0, 1, true);
    gate('reach', 'marsReachable', marsReach ? 1 : 0, 1, true);
    if (!marsReach) console.log(`KNOWN-ISSUE reach: mars is not reachable from a fresh profile through the page's craft path. Panel rocket core (iron build) listed ${rcPanel.iron.listed} craftable ${rcPanel.iron.enabled} (iron exists only on mars); the XD1 recipe rocket_core_drift listed on the panel ${rcPanel.drift.listed}; through __isles.craft mars opens: ${marsOpen}. Waits on XW1 (the panel switches to ALL_IDS and the unlock table learns rocket_core_drift).`);
    check('reach: 0 console errors', Q.errors.length === 0, Q.errors.slice(0, 3).join(' | '));
    check(`reach: wall clock <= ${FX.wallBudgetMs} ms`, reachWall <= FX.wallBudgetMs, String(reachWall));
    dbAll += Q.db.count(); sockAll += Q.sockets.length;
    out.reach = { reef: reefReach, mars: marsReach, marsVia: marsVia || null, rocketCorePanel: { ironListed: rcPanel.iron.listed, ironCraftable: rcPanel.iron.enabled, driftListed: rcPanel.drift.listed }, gathered: { jungle: gJ, reef: gR, tundra: gI }, steps: steps.map((s) => s.step + ': ' + (s.ok === undefined ? 'done' : s.ok ? 'ok' : 'no')), panelButtonsClosed: listed, wallMs: reachWall };
    await Q.ctx.close();
  }

  check('0 database requests and 0 sockets in every profile', dbAll === 0 && sockAll === 0, JSON.stringify({ dbAll, sockAll }));
  out.dbAttempts = dbAll; out.sockets = sockAll;
  // merge: keep every other section (world, isles, town, ...)
  let cur = {}; try { cur = JSON.parse(fs.readFileSync(METRICS, 'utf8')); } catch (e) { cur = {}; }
  cur.isles2 = Object.assign({ generated: 'tests/isles-first-ten.test.js', viewport: FX.viewport, dtSim: 1 / 30 }, ONLY ? Object.assign({}, cur.isles2 || {}, { partial: ONLY }) : {}, { profiles: Object.assign({}, ONLY && cur.isles2 ? cur.isles2.profiles : {}, out.profiles) }, out.reach ? { reach: out.reach } : (cur.isles2 && cur.isles2.reach ? { reach: cur.isles2.reach } : {}), { dbAttempts: dbAll, sockets: sockAll });
  try { fs.writeFileSync(METRICS, JSON.stringify(cur, null, 2) + '\n'); console.log('INFO wrote the isles2 section of ' + path.relative(path.join(__dirname, '..', '..'), METRICS)); } catch (e) { check('ftue-metrics.json written', false, e.message); }
  await browser.close();
  done();
})();
