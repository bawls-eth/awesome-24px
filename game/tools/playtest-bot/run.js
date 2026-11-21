// Visual playtest / research bot: plays the game like a player at desktop 1280x720 and phone 390x844, records a webm video per
// segment, takes labelled PNG screenshots every few seconds and at key moments, and logs console errors + failed requests.
// It is a research tool, not a test: it never fails, it writes a log for a human (or an AI) to read next to the screenshots.
//
//   NODE_PATH=$(npm root -g) node game/tools/playtest-bot/run.js
// Env: OUT=<artifact dir> (default /tmp/playtest), PORT=8561 (a static server on the repo root is started if none answers),
//      ONLY=desk|phone, THREE_JS=<local three.min.js> (Deepdelve's CDN copy is served from it when present), SHOT_EVERY=4000.
// SAFETY: every request to a Firebase database / auth host is aborted (firebaseio.com, firebasedatabase.app, identitytoolkit,
// securetoken), so the live database is never touched; the town is joined offline. Nothing is written anywhere but localStorage.
'use strict';
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const REPO = path.resolve(__dirname, '..', '..', '..');
const PORT = Number(process.env.PORT || 8561);
const ORIGIN = 'http://localhost:' + PORT;
const G = (p) => ORIGIN + '/game/' + p;
const OUT = process.env.OUT || '/tmp/playtest';
const SHOTS = path.join(OUT, 'shots');
const VIDS = path.join(OUT, 'video');
const SHOT_EVERY = Number(process.env.SHOT_EVERY || 4000);
const THREE_LOCAL = process.env.THREE_JS || '/tmp/claude-0/three.min.js';
const BLOCK = /firebaseio\.com|firebasedatabase\.app|identitytoolkit|securetoken/i;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const LOG = [];
const log = (...a) => { const s = a.join(' '); LOG.push(new Date().toISOString().slice(11, 19) + ' ' + s); console.log(s); };
const STATS = { consoleErrors: [], pageErrors: [], failed: [], blocked: 0, steps: [], videos: [], shots: 0, sockets: [], blockedWs: 0 };

// ---------- server ----------
const ping = () => new Promise((res) => { const r = http.get(ORIGIN + '/game/index.html', (x) => { x.resume(); res(x.statusCode === 200); }); r.on('error', () => res(false)); r.setTimeout(1500, () => { r.destroy(); res(false); }); });
async function server() {
  if (await ping()) return null;
  const p = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: REPO, stdio: 'ignore' });
  for (let i = 0; i < 40 && !(await ping()); i++) await wait(250);
  return p;
}

// ---------- in-page helpers (synthetic multi-touch, same trick as game/tests/beta/beta-run.js) ----------
const INIT = () => {
  const targets = {};
  const fire = (type, id, x, y, el) => el && el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: x, clientY: y, buttons: type === 'pointerup' ? 0 : 1 }));
  window.__bt = {
    down(id, x, y) { const el = document.elementFromPoint(x, y); targets[id] = el; fire('pointerdown', id, x, y, el); },
    move(id, x, y) { fire('pointermove', id, x, y, targets[id]); },
    up(id, x, y) { fire('pointerup', id, x, y, targets[id]); delete targets[id]; },
  };
};

// ---------- session plumbing ----------
class Seg {
  constructor(ctx, vp, name) { this.ctx = ctx; this.vp = vp; this.name = name; this.label = 'start'; this.n = 0; this.timer = null; this.page = null; }
  async open() {
    this.page = await this.ctx.newPage();
    const tag = this.vp.key + '/' + this.name;
    this.page.on('pageerror', (e) => { STATS.pageErrors.push(tag + ' [' + this.label + '] ' + e.message); log('  PAGEERROR', tag, e.message); });
    this.page.on('console', (m) => { if (m.type() === 'error') { const t = m.text(); if (/ERR_FAILED|net::ERR_|Failed to load resource/.test(t) && this._blockedRecently()) return; STATS.consoleErrors.push(tag + ' [' + this.label + '] ' + t.slice(0, 300)); log('  CONSOLE', tag, t.slice(0, 200)); } });
    this.page.on('requestfailed', (r) => { if (BLOCK.test(r.url())) return; STATS.failed.push(tag + ' ' + (r.failure() || {}).errorText + ' ' + r.url()); });
    this.page.on('websocket', (w) => { STATS.sockets.push(tag + ' ' + w.url()); log('  WEBSOCKET', tag, w.url()); });
    this.page.on('response', (r) => { if (r.status() >= 400) STATS.failed.push(tag + ' HTTP ' + r.status() + ' ' + r.url()); });
    this.timer = setInterval(() => { this.shot('auto-' + this.label).catch(() => {}); }, SHOT_EVERY);
    return this.page;
  }
  _blockedRecently() { return Date.now() - (STATS._lastBlock || 0) < 4000; }
  step(l) { this.label = l; log(' ', this.vp.key, this.name, '->', l); }
  async shot(l) {
    if (!this.page || this.page.isClosed()) return null;
    this.n++;
    const f = path.join(SHOTS, `${this.vp.key}-${this.name}-${String(this.n).padStart(3, '0')}-${String(l).replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}.png`);
    try { await this.page.screenshot({ path: f, timeout: 20000 }); } catch (e) { log('  shot failed', l, String(e.message).split('\n')[0]); return null; }
    STATS.shots++;
    return f;
  }
  async close() {
    clearInterval(this.timer);
    if (!this.page) return;
    const v = this.page.video();
    await this.page.close().catch(() => {});
    if (v) {
      const src = await v.path().catch(() => null);
      if (src) { const dst = path.join(VIDS, `${this.vp.key}-${this.name}.webm`); try { await wait(300); fs.renameSync(src, dst); STATS.videos.push(dst); } catch (e) { STATS.videos.push(src); } }
    }
  }
}
async function run(ctx, vp, name, fn) {
  const s = new Seg(ctx, vp, name);
  const t0 = Date.now();
  try { await s.open(); await fn(s, s.page); STATS.steps.push([vp.key, name, 'ok', Math.round((Date.now() - t0) / 1000) + 's']); } catch (e) {
    const msg = String(e.message).split('\n')[0];
    STATS.steps.push([vp.key, name, 'FAILED at "' + s.label + '": ' + msg, Math.round((Date.now() - t0) / 1000) + 's']);
    log('  STEP FAILED', vp.key, name, s.label, msg);
    await s.shot('failed-' + s.label).catch(() => {});
  }
  await s.close();
}

// ---------- input helpers ----------
async function center(page, sel) { return page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); if (!r.width) return null; return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: Math.min(r.width, r.height) / 2 }; }, sel); }
async function tap(page, sel, phone) { const c = await center(page, sel); if (!c) return false; if (phone) await page.touchscreen.tap(c.x, c.y); else await page.mouse.click(c.x, c.y); return true; }
async function visible(page, sel) { return page.evaluate((s) => { const e = document.querySelector(s); if (!e || e.classList.contains('hidden')) return false; const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; }, sel); }
// tap/click by selector through a locator (re-resolves after re-renders), falling back to a DOM click
async function tapSel(page, sel, phone) { const l = page.locator(sel).first(); if (!(await l.count())) return false; try { await l.scrollIntoViewIfNeeded({ timeout: 3000 }); if (phone) await l.tap({ timeout: 5000 }); else await l.click({ timeout: 5000 }); } catch (e) { await l.evaluate((el) => el.click()).catch(() => {}); } return true; }
const A = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world, ${JSON.stringify(arg === undefined ? null : arg)})`);
const waitWorld = (page) => page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active, null, { timeout: 20000 });

// stick helpers (phone): hold the move and aim sticks pushed in directions for ms
async function sticks(page, mv, aim, ms) {
  const m = await center(page, '#realm-stick-move'); const a = await center(page, '#realm-stick-aim');
  if (m && mv) { await page.evaluate(([x, y]) => window.__bt.down(1, x, y), [m.x, m.y]); await page.evaluate(([x, y]) => window.__bt.move(1, x, y), [m.x + mv[0] * m.r * 0.85, m.y + mv[1] * m.r * 0.85]); }
  if (a && aim) { await page.evaluate(([x, y]) => window.__bt.down(2, x, y), [a.x, a.y]); await page.evaluate(([x, y]) => window.__bt.move(2, x, y), [a.x + aim[0] * a.r * 0.85, a.y + aim[1] * a.r * 0.85]); }
  await wait(ms);
  if (m && mv) await page.evaluate(([x, y]) => window.__bt.up(1, x, y), [m.x, m.y]);
  if (a && aim) await page.evaluate(([x, y]) => window.__bt.up(2, x, y), [a.x, a.y]);
}

// One "player tick" in a Realm page: move toward a goal (or wander), aim at the nearest visible enemy, hold fire, cast now and then.
// `frame` is the page or frame that hosts the arena; hooks (window.__mm) are only read when present (never needed to play).
async function playRealm(seg, host, ms, opt = {}) {
  const page = seg.page; const phone = seg.vp.phone; const t0 = Date.now(); let i = 0; let deaths = 0;
  const keys = ['w', 'a', 's', 'd'];
  while (Date.now() - t0 < ms) {
    i++;
    const st = await host.evaluate((goal) => {
      const mm = window.__mm; const a = mm && mm.arena; const c = document.querySelector('#realm-canvas-wrap canvas');
      const r = c ? c.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
      const dead = !!document.querySelector('#realm-death:not(.hidden)') && getComputedStyle(document.querySelector('#realm-death')).display !== 'none';
      if (!a) return { r: { x: r.left, y: r.top, w: r.width, h: r.height }, dead };
      const p = a.player; let best = null; let bd = 1e9;
      (a.enemies || []).forEach((e) => { if (!e || !e.active) return; const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd && d < 900) { bd = d; best = e; } });
      const sx = (wx) => r.left + ((wx - a.camera.x) / a.W) * r.width; const sy = (wy) => r.top + ((wy - a.camera.y) / a.H) * r.height;
      let gdir = null; if (best && bd > 260) goal = { x: best.x, y: best.y }; // hunt: close in on the nearest enemy, else head for the goal
      if (goal) { const dx = goal.x - p.x; const dy = goal.y - p.y; const l = Math.hypot(dx, dy) || 1; gdir = [dx / l, dy / l]; }
      return { r: { x: r.left, y: r.top, w: r.width, h: r.height }, dead, state: a.state, hp: p.hp, px: sx(p.x), py: sy(p.y), ex: best ? sx(best.x) : null, ey: best ? sy(best.y) : null, ed: best ? bd : null, gdir, n: (a.enemies || []).filter((e) => e && e.active).length };
    }, opt.goal || null).catch(() => null);
    if (!st) { await wait(300); continue; }
    if (st.dead) {
      deaths++; seg.step(seg.label.replace(/-death\d*$/, '') + '-death' + deaths); await seg.shot('death-screen');
      const b = await host.$('#realm-death button[data-d="again"]'); if (b) { if (phone) await b.tap().catch(() => b.click()); else await b.click().catch(() => {}); }
      await wait(1200);
      (STATS.deaths = STATS.deaths || []).push(seg.vp.key + ' ' + seg.label + ' after ' + Math.round((Date.now() - t0) / 1000) + 's');
      if (opt.back) await host.evaluate((q) => { const a = window.__mm && window.__mm.arena; if (a) { a.player.x = q.x; a.player.y = q.y; } }, opt.back).catch(() => {});
      if (opt.godAfterDeath) await host.evaluate(() => { const a = window.__mm && window.__mm.arena; if (a) { a.player.iframes = 1e9; } }).catch(() => {});
      continue;
    }
    // movement direction: toward goal with a strafe wobble, else a slow circle
    let dir = st.gdir ? [st.gdir[0] + 0.6 * Math.cos(i * 1.3), st.gdir[1] + 0.6 * Math.sin(i * 1.3)] : [Math.cos(i * 0.8), Math.sin(i * 0.8)];
    if (st.ed && st.ed < 220) dir = [-(st.ex - st.px), -(st.ey - st.py)]; // back off when an enemy is close
    const l = Math.hypot(dir[0], dir[1]) || 1; dir = [dir[0] / l, dir[1] / l];
    const ax = st.ex !== null && st.ex !== undefined ? st.ex : st.r.x + st.r.w * (0.5 + 0.35 * Math.cos(i)); const ay = st.ey !== null && st.ey !== undefined ? st.ey : st.r.y + st.r.h * (0.5 + 0.35 * Math.sin(i));
    if (phone) {
      const av = st.px ? [ax - st.px, ay - st.py] : [Math.cos(i), Math.sin(i)]; const al = Math.hypot(av[0], av[1]) || 1;
      await sticks(page, dir, [av[0] / al, av[1] / al], 900);
      if (i % 4 === 0) await tap(page, '#realm-ab-' + ((i / 4) % 4 === 1 ? 0 : (i / 4) % 4), true).catch(() => {});
    } else {
      const down = [];
      if (dir[1] < -0.35) down.push('w'); if (dir[1] > 0.35) down.push('s'); if (dir[0] < -0.35) down.push('a'); if (dir[0] > 0.35) down.push('d');
      if (!down.length) down.push(keys[i % 4]);
      for (const k of down) await page.keyboard.down(k);
      await page.mouse.move(ax, ay, { steps: 3 }); await page.mouse.down();
      await wait(850);
      if (i % 5 === 0) await page.keyboard.press(['q', 'r', 'f', 'q'][(i / 5) % 4]);
      await page.mouse.up();
      for (const k of down) await page.keyboard.up(k);
    }
  }
  return deaths;
}

async function alive(page, phone) {
  const d = await page.$('#realm-death:not(.hidden) button[data-d="again"]');
  if (d && await d.isVisible()) { await (phone ? d.tap() : d.click()).catch(() => {}); await wait(1200); }
  await page.waitForFunction(() => window.__mm.arena.state === 'play', null, { timeout: 8000 }).catch(() => {});
}
// pick a walkable tile in zone z, reached from the spawn side (median distance from spawn among that zone's free tiles)
const zoneTile = (page, z) => A(page, (a, w, z) => {
  const W = w.world; const sp = W.spawnPoint; const c = []; for (let y = 2; y < W.h - 2; y += 3) for (let x = 2; x < W.w - 2; x += 3) { const i = y * W.w + x; if (W.zone[i] === z && !W.solid[i]) c.push([x, y, Math.hypot(x - sp.x, y - sp.y)]); }
  if (!c.length) return null; c.sort((p, q) => p[2] - q[2]); const t = c[Math.floor(c.length * 0.35)]; return { tx: t[0], ty: t[1], x: (t[0] + 0.5) * 32, y: (t[1] + 0.5) * 32, cx: (W.center.x + 0.5) * 32, cy: (W.center.y + 0.5) * 32 };
}, z);
const teleport = (page, x, y) => A(page, (a, w, q) => { const f = w.nearestFree ? w.nearestFree(Math.floor(q.x / 32), Math.floor(q.y / 32), 6) : null; a.player.x = f ? (f.x + 0.5) * 32 : q.x; a.player.y = f ? (f.y + 0.5) * 32 : q.y; return { x: a.player.x, y: a.player.y }; }, { x, y });
const info = (page) => A(page, (a, w) => ({ zone: w.hudText().zone, lvl: a.save.level, hp: Math.round(a.player.hp), max: a.stats.maxHp, kills: w.kills(), enemies: w.liveCount(), deaths: a.save.deaths }));

// ---------- flows ----------
async function townToRealm(seg, page) {
  const phone = seg.vp.phone;
  // expose the Phaser game (read-only handle) so the bot can stand at the Realm Gate without a long scripted walk
  await page.route('**/main.js*', async (route) => { const resp = await route.fetch(); const body = (await resp.text()).replace('const game = new Phaser.Game(config);', 'const game = window.__g = new Phaser.Game(config);'); route.fulfill({ response: resp, body }); });
  seg.step('join-form'); await page.goto(G('index.html')); await wait(1500); await seg.shot('join-form');
  await page.fill('#name-input', 'ADMINbot'); // ADMIN* name as the house rule asks, although every database socket is blocked
  await tap(page, '.species-tab', phone); await wait(200); await tap(page, '.avatar-choice', phone); await wait(200);
  await seg.shot('join-filled');
  await tap(page, '#join-btn', phone);
  seg.step('town');
  let joined = await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 12000 }).then(() => true, () => false);
  if (!joined && await visible(page, '#join-offline-btn')) {
    // the join timed out (DB blocked): the join screen offers "Play offline" (OfflineNet, no database at all)
    await seg.shot('join-offline-offer');
    log('  NOTE join timed out, status:', JSON.stringify(await page.textContent('#join-status').catch(() => '')));
    seg.step('town-offline'); await tap(page, '#join-offline-btn', phone);
    joined = await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 15000 }).then(() => true, () => false);
    log('  town offline joined =', joined);
  }
  if (!joined) {
    // With the database blocked the town cannot be joined (it waits for the database). Record what a player sees, then do what the
    // Town Gate's "Enter the Realm" does (the same page, normally inside an in-page frame) directly.
    await seg.shot('join-offline-stuck');
    log('  NOTE town join does not complete with the database blocked; error text:', JSON.stringify(await page.textContent('#join-error').catch(() => '')), 'button disabled:', await page.evaluate(() => document.getElementById('join-btn').disabled));
    seg.step('realm-direct');
    await page.goto(G('games/mad-maze/index.html?mode=world'));
    await page.waitForSelector('#realm-canvas-wrap canvas', { timeout: 20000 });
    await wait(2500); await seg.shot('realm-hero-create');
    const cls = await page.$('#realm-hero button[data-newcls]:not([disabled])');
    if (cls) { if (phone) await cls.tap().catch(() => cls.click()); else await cls.click(); await wait(1500); await seg.shot('realm-hero-created'); } else log('  NOTE no "Create your hero" panel');
    seg.step('realm-first-play');
    if (!phone) await page.mouse.click(seg.vp.w / 2, seg.vp.h / 2);
    await playRealm(seg, page, 22000);
    await seg.shot('realm-first-after-play');
    seg.step('realm-esc');
    if (phone) await tap(page, '#realm-menu-btn', true); else await page.keyboard.press('Escape');
    await wait(800); await seg.shot('realm-esc-menu');
    return;
  }
  await wait(2000); await seg.shot('town-arrived');
  // walk around the plaza like a player
  if (phone) { for (const d of [[1, 0], [0, -1], [-1, 0], [0, 1]]) { const c = await center(page, '#joystick'); if (!c) break; await page.evaluate(([x, y]) => window.__bt.down(1, x, y), [c.x, c.y]); await page.evaluate(([x, y]) => window.__bt.move(1, x, y), [c.x + d[0] * c.r * 0.8, c.y + d[1] * c.r * 0.8]); await wait(1400); await page.evaluate(([x, y]) => window.__bt.up(1, x, y), [c.x, c.y]); } } else { for (const k of ['d', 'w', 'a', 's']) { await page.keyboard.down(k); await wait(1300); await page.keyboard.up(k); } }
  await seg.shot('town-walked');
  seg.step('gate');
  await page.evaluate(() => { const s = window.__g.scene.getScene('Town'); s.localBody.setPosition(REALM_GATE_POS.x, REALM_GATE_POS.y + 140); });
  if (phone) { const c = await center(page, '#joystick'); await page.evaluate(([x, y]) => window.__bt.down(1, x, y), [c.x, c.y]); await page.evaluate(([x, y]) => window.__bt.move(1, x, y), [c.x, c.y - c.r * 0.8]); await wait(700); await page.evaluate(([x, y]) => window.__bt.up(1, x, y), [c.x, c.y]); } else { await page.keyboard.down('w'); await wait(650); await page.keyboard.up('w'); }
  await wait(400); await seg.shot('gate-approach');
  if (phone) await tap(page, '#interact-btn', true); else await page.keyboard.press('e');
  await wait(800);
  if (!(await visible(page, '#realm-menu'))) { log('  NOTE gate did not open by walking + E; opening via interact()'); await page.evaluate(() => { const s = window.__g.scene.getScene('Town'); s.localBody.setPosition(REALM_GATE_POS.x, REALM_GATE_POS.y + 30); s.interact(); }); await wait(600); }
  await seg.shot('gate-menu');
  seg.step('realm-embed');
  await tap(page, '#realm-menu-madmaze', phone);
  await page.waitForSelector('#realm-embed iframe', { timeout: 10000 });
  const fr = page.frameLocator('#realm-embed iframe');
  await fr.locator('canvas').first().waitFor({ timeout: 20000 });
  await wait(2500); await seg.shot('realm-hero-create');
  const frame = page.frames().find((f) => /mode=world/.test(f.url()));
  // Create your hero: first unlocked class card
  const cls = await frame.$('#realm-hero button[data-newcls]:not([disabled])');
  if (cls) { if (phone) await cls.tap().catch(() => cls.click()); else await cls.click(); await wait(1500); await seg.shot('realm-hero-created'); } else log('  NOTE no "Create your hero" panel in the embedded Realm');
  seg.step('realm-embed-play');
  if (!phone) { const c = await center(page, '#realm-embed iframe'); await page.mouse.click(c.x, c.y); }
  await playRealm(seg, frame, 22000);
  await seg.shot('realm-embed-after-play');
  seg.step('realm-embed-esc');
  if (phone) { const b = await frame.$('#realm-menu-btn'); if (b) await b.tap().catch(() => b.click()); } else await page.keyboard.press('Escape');
  await wait(800); await seg.shot('realm-embed-menu');
  const lv = await frame.$('#realm-pause button[data-m="leave"]');
  if (lv) { if (phone) await lv.tap().catch(() => lv.click()); else await lv.click(); }
  await wait(1500); await seg.shot('back-in-town');
  log('  town->realm: embed left =', !(await page.$('#realm-embed')));
}

async function world(seg, page) {
  const phone = seg.vp.phone;
  seg.step('world-load');
  await page.goto(G('games/mad-maze/index.html?mode=world&test=1&heropick=1&seed=4242'));
  await waitWorld(page); await wait(1500); await seg.shot('world-spawn-picker');
  const cls = await page.$('#realm-hero button[data-newcls]:not([disabled])');
  const pick = await page.$('#realm-hero button[data-hero]:not([disabled])');
  if (cls) await (phone ? cls.tap() : cls.click()); else if (pick) { await (phone ? pick.tap() : pick.click()); await wait(300); const c = await page.$('#realm-hero-close'); if (c) await (phone ? c.tap() : c.click()); }
  await wait(800);
  if (!phone) await page.mouse.click(640, 360);
  const z0 = await zoneTile(page, 0);
  seg.step('shore'); log('   ', JSON.stringify(await info(page)));
  await seg.shot('shore-start');
  const goal = z0 ? { x: z0.cx, y: z0.cy } : null;
  await playRealm(seg, page, phone ? 18000 : 26000, { goal });
  await seg.shot('shore-after'); log('    shore', JSON.stringify(await info(page)));
  const zn = ['shore', 'midlands', 'highlands', 'godlands'];
  for (let z = 1; z < 4; z++) {
    const t = await zoneTile(page, z); if (!t) { log('  NOTE no tile for zone', z); continue; }
    seg.step(zn[z]); await teleport(page, t.x, t.y); await wait(1200); await seg.shot(zn[z] + '-arrive');
    const at = await A(page, (a) => ({ x: a.player.x, y: a.player.y }));
    await playRealm(seg, page, phone ? 15000 : 18000, { goal: { x: t.cx, y: t.cy }, godAfterDeath: true, back: at });
    await seg.shot(zn[z] + '-after'); log('   ', zn[z], JSON.stringify(await info(page)));
    await A(page, (a) => { a.player.iframes = 0; });
  }
  // back to the shore for menus (safe), god mode so panels can be looked at
  await alive(page, phone);
  await teleport(page, z0.x, z0.y); await A(page, (a) => { a.player.iframes = 1e9; a.player.hp = a.stats.maxHp; }); await wait(800);
  seg.step('esc-menu');
  if (phone) await tap(page, '#realm-menu-btn', true); else await page.keyboard.press('Escape');
  await wait(700); await seg.shot('esc-menu');
  seg.step('hero-stats');
  const hs = await page.$('#realm-pause button[data-m="herostats"]'); if (hs) { await (phone ? hs.tap() : hs.click()); await wait(700); await seg.shot('hero-stats'); }
  const hc = await page.$('#realm-hero-close'); if (hc && await hc.isVisible()) await (phone ? hc.tap() : hc.click());
  await wait(300);
  if (phone) { await page.evaluate(() => window.__mm.arena.setPaused(false)); }
  else if (await visible(page, '#realm-pause')) await page.keyboard.press('Escape');
  seg.step('backpack');
  if (phone) await tap(page, '#realm-bp-btn', true); else await page.keyboard.press('b');
  await wait(700); await seg.shot('backpack');
  if (phone) await tap(page, '#realm-bp-close', true); else await page.keyboard.press('b');
  seg.step('shop');
  if (phone) { const sb = await page.$('#realm-shop-btn, [aria-label*="hop"]'); if (sb) await sb.tap().catch(() => {}); else await page.evaluate(() => window.__mm.arena._panel('shop')); } else await page.keyboard.press('v');
  await wait(700); await seg.shot('shop');
  if (phone) await page.evaluate(() => window.__mm.arena.setPaused(false)); else await page.keyboard.press('v');
  seg.step('board');
  if (phone) await tap(page, '#realm-board-btn', true); else await page.keyboard.press('k');
  await wait(700); await seg.shot('kill-board');
  await page.evaluate(() => window.__mm.arena.setPaused(false));
  seg.step('minimap');
  await tap(page, '#rw-minimap', phone); await wait(700); await seg.shot('minimap-big'); await tap(page, '#rw-minimap', phone); await wait(300);
  // nearest shrine + camp
  const sites = await A(page, (a, w) => { const s = w.sites(); const p = a.player; const near = (l) => l.slice().sort((x, y) => Math.hypot(x.x * 32 - p.x, x.y * 32 - p.y) - Math.hypot(y.x * 32 - p.x, y.y * 32 - p.y))[0]; return s ? { shrine: near(s.shrines), camp: near(s.camps), npc: near(s.npcs) } : null; });
  if (sites && sites.shrine) {
    seg.step('shrine'); await teleport(page, (sites.shrine.x + 0.5) * 32 + 20, (sites.shrine.y + 0.5) * 32); await wait(900); await seg.shot('shrine-near');
    if (phone) await tap(page, '#rw-site', true); else await page.keyboard.press('e');
    await wait(900); await seg.shot('shrine-used');
  }
  if (sites && sites.camp) { seg.step('camp'); await teleport(page, (sites.camp.x + 0.5) * 32 + 60, (sites.camp.y + 0.5) * 32); await wait(900); await seg.shot('camp-near'); await playRealm(seg, page, 8000, { goal: { x: (sites.camp.x + 0.5) * 32, y: (sites.camp.y + 0.5) * 32 }, godAfterDeath: true }); await seg.shot('camp-fight'); }
  if (sites && sites.npc) { seg.step('npc'); await teleport(page, (sites.npc.x + 0.5) * 32 + 20, (sites.npc.y + 0.5) * 32); await wait(900); if (phone) await tap(page, '#rw-site', true); else await page.keyboard.press('e'); await wait(800); await seg.shot('npc-talk'); }
  // a portal -> dungeon -> back
  seg.step('portal');
  await alive(page, phone);
  const portal = await A(page, (a, w) => { const p = a.player; return w.portals().slice().sort((x, y) => Math.hypot(x.x - p.x, x.y - p.y) - Math.hypot(y.x - p.x, y.y - p.y))[0]; });
  await A(page, (a, w, q) => { a.player.x = q.x + 10; a.player.y = q.y; }, portal); await wait(900); await seg.shot('portal-prompt');
  await Promise.all([page.waitForURL(/mode=dungeon/, { timeout: 12000 }), tap(page, '#rw-portal', phone)]);
  seg.step('portal-dungeon');
  await page.waitForFunction(() => window.__mm && window.__mm.dungeon && window.__mm.arena.active, null, { timeout: 20000 });
  await wait(1500); await seg.shot('portal-dungeon-start');
  if (!phone) await page.mouse.click(640, 360);
  await playRealm(seg, page, 20000);
  await seg.shot('portal-dungeon-after');
  seg.step('dungeon-return');
  await page.evaluate(() => window.__mm.dungeon.finish());
  await page.waitForSelector('#mm-sum-home', { timeout: 8000 }); await wait(600); await seg.shot('dungeon-summary');
  await Promise.all([page.waitForURL((u) => !/mode=dungeon/.test(String(u)), { timeout: 12000 }), tap(page, '#mm-sum-home', phone)]);
  log('    returned to', page.url());
  await waitWorld(page); await wait(1500); await seg.shot('back-on-portal');
}

async function dungeons(seg, page) {
  const phone = seg.vp.phone;
  for (const b of ['warren', 'bramble', 'meadow', 'crypt']) {
    seg.step('dungeon-' + b);
    await page.goto(G('games/mad-maze/index.html?mode=dungeon&lv=2&seed=7&test=1&biome=' + b));
    await page.waitForFunction(() => window.__mm && window.__mm.arena.active, null, { timeout: 20000 });
    await wait(1200); await seg.shot(b + '-start');
    if (!phone) await page.mouse.click(640, 360);
    await playRealm(seg, page, phone ? 12000 : 16000);
    await seg.shot(b + '-after');
    if (!phone) { await page.keyboard.press('Tab'); await wait(500); await seg.shot(b + '-map'); await page.keyboard.press('Tab'); }
    // the biome boss: walk the door graph to the boss room (clearing rooms on the way, as dungeon-biomes.test.js does), then fight
    seg.step('boss-' + b);
    await alive(page, phone);
    const r = await page.evaluate(() => {
      const d = window.__mm.dungeon; const g = d.graph; const target = g.bossRoomId; window.__mm.arena.player.iframes = 1e9;
      const walk = (allowLocked) => {
        const nbrs = (id) => g.doors.filter((x) => (!x.cracked || d.state.secretOpen) && (x.a === id || x.b === id) && (allowLocked || !x.locked)).map((x) => (x.a === id ? x.b : x.a));
        const prev = { [d.room]: null }; const q = [d.room];
        while (q.length) { const u = q.shift(); if (u === target) break; nbrs(u).forEach((v) => { if (!(v in prev)) { prev[v] = u; q.push(v); } }); }
        if (!(target in prev)) return 'no path';
        const path = []; for (let u = target; u !== null && u !== undefined; u = prev[u]) path.unshift(u);
        for (let i = 1; i < path.length; i++) { if (d.state.room(d.room).enemiesAlive > 0) d.clearRoom(); const res = d.enter(path[i]); if (!res.ok) return 'blocked at ' + path[i] + ': ' + res.reason; }
        return d.room;
      };
      let res = walk(false); if (res !== target) { const k = g.rooms.find((x) => x.type === 'key'); if (k) walk(false); res = walk(true); }
      const e = d.boss && d.boss(); const a = window.__mm.arena;
      return { res, target, boss: e ? (a._bossName ? a._bossName(e) : e.bossArt) : null, art: e ? e.bossArt : null, banner: (document.getElementById('realm-boss-name') || {}).textContent || '' };
    }).catch((e) => ({ err: e.message }));
    log('    boss', b, JSON.stringify(r));
    await wait(1500); await seg.shot(b + '-boss-arrive');
    await playRealm(seg, page, phone ? 9000 : 12000, { godAfterDeath: true });
    await seg.shot(b + '-boss-fight');
  }
}

// hero create flow on a brand-new browser profile: picker -> create -> picker again (portraits) -> hero stats
async function heroCreate(seg, page) {
  const phone = seg.vp.phone;
  seg.step('hero-fresh');
  await page.goto(G('games/mad-maze/lantern.css')); await page.evaluate(() => localStorage.clear());
  await page.goto(G('games/mad-maze/index.html?mode=world&test=1&heropick=1&seed=777'));
  await waitWorld(page); await wait(1800); await seg.shot('hero-create-panel');
  const cards = await page.evaluate(() => Array.from(document.querySelectorAll('#realm-hero button[data-newcls]')).map((b) => b.dataset.newcls + (b.disabled ? '(locked)' : '')));
  log('    create cards:', cards.join(' '));
  const cls = await page.$('#realm-hero button[data-newcls]:not([disabled])');
  if (cls) { if (!phone) await cls.hover().catch(() => {}); await wait(400); await seg.shot('hero-create-hover'); await (phone ? cls.tap() : cls.click()); }
  await wait(1500); await seg.shot('hero-created-first-frame');
  seg.step('hero-picker-again');
  await page.evaluate(() => window.__heroUi && window.__heroUi.open('pick')); await wait(900); await seg.shot('hero-picker-portraits');
  await page.evaluate(() => window.__heroUi && window.__heroUi.open('stats')); await wait(900); await seg.shot('hero-stats-tab');
  const hc = await page.$('#realm-hero-close'); if (hc && await hc.isVisible()) await (phone ? hc.tap() : hc.click()); await wait(500);
  log('    hero create errors so far', STATS.consoleErrors.length + STATS.pageErrors.length);
}

// Nexus + quest claim, real kills + pickups, a status icon, the unlock toast and the ability sheet
async function nexusQuests(seg, page) {
  const phone = seg.vp.phone;
  seg.step('nx-load');
  await page.goto(G('games/mad-maze/index.html?mode=world&test=1&heropick=0&seed=12345'));
  await waitWorld(page); await page.waitForFunction(() => window.__mm.arena.state === 'play', null, { timeout: 10000 }).catch(() => {});
  await wait(1200); if (!phone) await page.mouse.click(seg.vp.w / 2, seg.vp.h / 2);
  // the world keeps the last saved position (maybe a deadly zone from an earlier segment): start this one on the spawn shore, in god mode
  await alive(page, phone);
  await A(page, (a, w) => { const sp = w.world.spawnPoint; a.player.x = (sp.x + 0.5) * 32 + 64; a.player.y = (sp.y + 0.5) * 32; a.player.iframes = 1e9; a.player.hp = a.stats.maxHp; });
  // ---- kills and pickups: play for real near the spawn (god mode so the run is about loot, not death) ----
  seg.step('kills-pickups');
  const k0 = await A(page, (a, w) => ({ kills: w.kills(), got: w.pickups.got(), total: w.pickups.total(), shards: a.save.shards, xp: a.save.xp, lvl: a.save.level }));
  await playRealm(seg, page, phone ? 16000 : 20000, { godAfterDeath: true });
  await alive(page, phone); await A(page, (a) => { a.player.iframes = 1e9; });
  let k1 = await A(page, (a, w) => ({ kills: w.kills(), got: w.pickups.got(), total: w.pickups.total(), onGround: w.pickups.list().length }));
  log('    real play: kills', k0.kills, '->', k1.kills, 'pickups total', k0.total, '->', k1.total, JSON.stringify(k1.got), 'on ground', k1.onGround);
  // pull three live enemies next to the hero and finish them so their drops are on screen
  const near = await A(page, (a, w) => { const out = []; for (const le of w.liveEnemies()) { if (out.length >= 3) break; const e = w.enemyById(le.id); if (!e || !e.active) continue; e.x = a.player.x + 90 + out.length * 40; e.y = a.player.y + (out.length - 1) * 50; a._hitEnemy(e, 99999); out.push(le.type); } return { out, ground: w.pickups.list().map((q) => q.type + ':' + q.art) }; });
  log('    finished nearby:', JSON.stringify(near));
  await wait(250); await seg.shot('pickups-dropped');
  await wait(1800); await seg.shot('pickups-collected');
  k1 = await A(page, (a, w) => ({ kills: w.kills(), got: w.pickups.got(), total: w.pickups.total(), quests: w.quests.summary() }));
  log('    after collect:', JSON.stringify(k1));
  // ---- a status icon on the hero (a bolt debuff and a shrine-style buff) ----
  seg.step('status');
  await A(page, (a) => { a.applyStatus('player', 'slowed', { sec: 6 }); a.applyStatus('player', 'swift', { sec: 6 }); a.applyStatus('player', 'bleed', { sec: 6, stacks: 2 }); return a.statusOf('player'); }).then((s) => log('    status:', JSON.stringify(s))).catch((e) => log('    status hook failed', e.message));
  await wait(500); await seg.shot('status-icons');
  // ---- the Nexus ----
  seg.step('nexus');
  const nx = await A(page, (a, w) => { const s = w.nexus.site; if (!s) return null; a.player.x = s.x - 20; a.player.y = s.y; return { on: w.nexus.on, x: s.x, y: s.y }; });
  log('    nexus site', JSON.stringify(nx));
  await wait(900); await seg.shot('nexus-portal-prompt');
  if (await visible(page, '#rw-nexus-go')) await tap(page, '#rw-nexus-go', phone); else await A(page, (a, w) => w.nexus.open());
  await wait(1200); await seg.shot('nexus-plaza');
  const guide = await page.$('#rw-nexus [data-npc="guide"]'); if (guide) { await (phone ? guide.tap() : guide.click()); await wait(600); await seg.shot('nexus-guide-talk'); }
  if (phone) { await page.evaluate(() => window.scrollTo(0, 0)); }
  seg.step('quest-board');
  const qb = await page.$('#rw-nexus [data-npc="quest"]'); if (qb) { await (phone ? qb.tap() : qb.click()); await wait(700); await seg.shot('quest-board-progress'); }
  // finish the quests with the hook (the boss + portal quests take a long run), then claim one through the button
  await A(page, (a, w) => { w.quests.event({ type: 'kill', zone: 0, n: 100 }); w.quests.event({ type: 'boss' }); w.quests.event({ type: 'portal' }); });
  await tapSel(page, '#rw-nexus [data-npc="quest"]', phone); await wait(500);
  await seg.shot('quest-board-done');
  log('    board:', JSON.stringify(await page.evaluate(() => Array.from(document.querySelectorAll('#rw-nx-board .nx-q')).map((r) => r.textContent + (r.querySelector('[data-claim]') ? (r.querySelector('[data-claim]').disabled ? ' [claim disabled]' : ' [claim]') : '')))));
  const sh0 = await A(page, (a) => a.save.shards);
  const claim = await tapSel(page, '#rw-nx-board [data-claim="kill_boss"]', phone) || await tapSel(page, '#rw-nx-board [data-claim]:not([disabled])', phone);
  await wait(700); await seg.shot('quest-claimed');
  log('    quest claim shards', sh0, '->', await A(page, (a) => a.save.shards), 'claim button', !!claim);
  await tapSel(page, '#rw-nx-back', phone);
  await wait(900); await seg.shot('nexus-back');
  // ---- the unlock toast (hook raises the level) ----
  seg.step('unlock-toast');
  const tl = await A(page, (a) => { const lv = (a.save.level || 1); a.save.level = Math.max(lv, 4) + 5; if (a._levelUp) a._levelUp(); return a.save.level; });
  await wait(700);
  const toast = await page.evaluate(() => { const t = document.getElementById('mm-unlock-toast'); return t && !t.classList.contains('hidden') ? t.textContent : null; });
  log('    level ->', tl, 'toast:', JSON.stringify(toast));
  await seg.shot('unlock-toast');
  // ---- ability sheet: right-click (desktop) / long-press (phone) ----
  seg.step('ability-sheet');
  if (phone) { const c = await center(page, '#realm-ab-1'); if (c) { await page.evaluate(([x, y]) => window.__bt.down(5, x, y), [c.x, c.y]); await wait(750); await page.evaluate(([x, y]) => window.__bt.up(5, x, y), [c.x, c.y]); } }
  else await page.click('#realm-ab-1', { button: 'right' }).catch(() => {});
  await wait(600);
  log('    ability sheet open:', await visible(page, '#mm-ab-sheet'));
  await seg.shot('ability-sheet');
  if (!phone) await page.keyboard.press('Escape'); else await page.mouse.click(20, 300).catch(() => {});
  await wait(500); await seg.shot('ability-bar');
}

async function lantern(seg, page) {
  const phone = seg.vp.phone;
  seg.step('lantern'); await page.goto(G('games/mad-maze/lantern.html')); await wait(1500); await seg.shot('lantern-top');
  if (await page.$('#new-name')) { await page.fill('#new-name', 'Botly'); await tap(page, '#new-create', phone); await wait(700); await seg.shot('lantern-created'); }
  for (const y of [500, 1100, 1800, 99999]) { await page.evaluate((v) => window.scrollTo(0, v), y); await wait(700); await seg.shot('lantern-scroll-' + y); }
}

async function games(seg, page) {
  const phone = seg.vp.phone;
  const W = seg.vp.w; const H = seg.vp.h;
  // Deepdelve
  seg.step('deepdelve');
  if (fs.existsSync(THREE_LOCAL)) await page.route(/cdn\.jsdelivr\.net\/npm\/three@/, (r) => r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(THREE_LOCAL) }));
  await page.goto(G('games/deepdelve/index.html?seed=5'));
  await page.waitForSelector('#gl', { timeout: 40000 }).catch(() => {}); await wait(3000); await seg.shot('deepdelve-start');
  const t0 = Date.now();
  if (!phone) { await page.mouse.click(W / 2, H / 2); await wait(300); await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousemove', { movementX: 0, movementY: 640 }))); }
  while (Date.now() - t0 < 10000) {
    if (phone) { const c = await center(page, '#joy'); if (c) { await page.evaluate(([x, y]) => window.__bt.down(1, x, y), [c.x, c.y]); await page.evaluate(([x, y]) => window.__bt.move(1, x, y), [c.x, c.y - c.r * 0.8]); await wait(900); await page.evaluate(([x, y]) => window.__bt.up(1, x, y), [c.x, c.y]); } await tap(page, '#t-jump', true); }
    else { await page.keyboard.down('w'); await page.keyboard.press('Space'); await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousemove', { movementX: 60, movementY: 0 }))); await page.evaluate(() => document.getElementById('gl') && document.getElementById('gl').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }))); await wait(900); await page.evaluate(() => window.dispatchEvent(new MouseEvent('mouseup', { button: 0 }))); await page.keyboard.up('w'); }
  }
  await seg.shot('deepdelve-after');
  // Angler
  seg.step('angler'); await page.goto(G('games/angler/index.html')); await wait(1500); await seg.shot('angler-start');
  for (let i = 0; i < 3; i++) {
    const c = await center(page, '#scene'); if (!c) break;
    if (phone) { await page.touchscreen.tap(c.x, c.y); await wait(1300); await page.evaluate(([x, y]) => window.__bt.down(9, x, y), [c.x, c.y]); await wait(1400); await page.evaluate(([x, y]) => window.__bt.up(9, x, y), [c.x, c.y]); }
    else { await page.keyboard.press('Space'); await wait(1300); await page.keyboard.down('Space'); await wait(1400); await page.keyboard.up('Space'); }
    await wait(400); await seg.shot('angler-cast-' + i);
    if (await visible(page, '#result')) await tap(page, '#res-ok', phone);
  }
  // Campfire Jam
  seg.step('jam'); await page.goto(G('games/jam/index.html')); await wait(1500); await seg.shot('jam-start');
  const jb = await page.$('#overlay:not([hidden]) button'); if (jb) { await (phone ? jb.tap() : jb.click()); await wait(800); }
  const j0 = Date.now(); let k = 0;
  while (Date.now() - j0 < 10000) { const lane = 'DFJK'[k++ % 4]; if (phone) await tap(page, '#pad-' + lane, true); else await page.keyboard.press(lane.toLowerCase()); await wait(180); if (k % 25 === 0) await seg.shot('jam-play'); }
  await seg.shot('jam-after');
  // Stalk market
  seg.step('stalk'); await page.goto(G('games/stalk/index.html')); await wait(1500); await seg.shot('stalk-start');
  if (await visible(page, '#hint-ok')) await tap(page, '#hint-ok', phone);
  for (const b of ['#buy10', '#buy1', '#sell1', '#sellall']) { await tap(page, b, phone); await wait(900); }
  await seg.shot('stalk-after'); await wait(3000);
  // Hub map (the front door) for completeness
  seg.step('hub'); await page.goto(G('hub/index.html')); await wait(2000); await seg.shot('hub');
}

// ---------- main ----------
(async () => {
  fs.mkdirSync(SHOTS, { recursive: true }); fs.mkdirSync(VIDS, { recursive: true });
  const srv = await server();
  const browser = await chromium.launch();
  const VPS = [
    { key: 'desk', w: 1280, h: 720, phone: false },
    { key: 'phone', w: 390, h: 844, phone: true },
  ].filter((v) => !process.env.ONLY || process.env.ONLY === v.key);
  for (const vp of VPS) {
    log('== viewport', vp.key, vp.w + 'x' + vp.h);
    const ctx = await browser.newContext({
      viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1, hasTouch: vp.phone, isMobile: vp.phone,
      recordVideo: { dir: VIDS, size: { width: vp.w, height: vp.h } },
    });
    await ctx.routeWebSocket(BLOCK, (ws) => { STATS.blockedWs++; ws.close(); }); // the Firebase SDK talks over a WebSocket: route() alone does NOT stop it
    await ctx.route('**/*', (r) => { if (BLOCK.test(r.request().url())) { STATS.blocked++; STATS._lastBlock = Date.now(); return r.abort(); } return r.continue(); });
    await ctx.addInitScript(INIT);
    const SEGS = { 'hero-create': heroCreate, 'town-realm': townToRealm, world, 'nexus-quests': nexusQuests, dungeons, lantern, games };
    const pickSegs = process.env.SEGS ? process.env.SEGS.split(',') : Object.keys(SEGS);
    for (const n of pickSegs) if (SEGS[n]) await run(ctx, vp, n, SEGS[n]);
    await ctx.close();
  }
  await browser.close();
  if (srv) srv.kill();
  const summary = { when: new Date().toISOString(), origin: ORIGIN, steps: STATS.steps, videos: STATS.videos, shots: STATS.shots, consoleErrors: STATS.consoleErrors, pageErrors: STATS.pageErrors, failedRequests: [...new Set(STATS.failed)], blockedDbRequests: STATS.blocked, blockedDbSockets: STATS.blockedWs, socketsOpened: STATS.sockets, deaths: STATS.deaths || [] };
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(OUT, 'log.txt'), LOG.join('\n') + '\n');
  log('== done:', STATS.shots, 'shots,', STATS.videos.length, 'videos,', STATS.consoleErrors.length, 'console errors,', STATS.pageErrors.length, 'page errors,', summary.failedRequests.length, 'failed requests,', STATS.blocked, 'DB requests +', STATS.blockedWs, 'DB sockets blocked');
  log('   artifacts in', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
