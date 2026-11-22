// New-player journey bot (playtest 3): one persistent browser profile per viewport, so the save carries from page to page the
// way it does for a real player. Each STAGE is a separate run (and a separate webm) that continues from the profile left by the
// previous one. Research tool, not a test: it never fails a build and is not part of run-all.js.
//
//   python3 -m http.server 9251 &   # repo root
//   NODE_PATH=$(npm root -g) VP=phone STAGE=town OUT=/tmp/pt3 node game/tools/playtest-bot/journey3.js
// Env: VP=phone|desk, STAGE=town|realm|nexus|dungeon|hub|game|isles|whereto|feedback (comma list ok), OUT (default /tmp/pt3),
//      PORT (9251), FRESH=1 wipes the profile first, THREE_JS (local three.min.js for Deepdelve).
// Hooks: the Realm hooks (window.__mm, ?test=1) are turned on ONLY to READ enemy positions for aiming (a human sees them) and to
//      read the player position for logging. The Isles hooks are used to read where creatures are. Every use is logged as HOOK.
// SAFETY: every request AND WebSocket to a Firebase / Google auth host is blocked in the context before any page loads
//      (context.route + context.routeWebSocket, the same rule as blockDb in game/tests/helpers.js). The Town is joined offline.
//      The bot never chats and never writes anywhere but this profile's localStorage.
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const PORT = Number(process.env.PORT || 9251);
const G = (p) => 'http://localhost:' + PORT + '/game/' + p;
const OUT = process.env.OUT || '/tmp/pt3';
const VPN = process.env.VP || 'phone';
const STAGES = (process.env.STAGE || 'town').split(',');
const THREE_LOCAL = process.env.THREE_JS || '/tmp/claude-0/three.min.js';
const BLOCK = /firebaseio\.com|firebasedatabase\.app|identitytoolkit|securetoken/i; // = DB_HOSTS in game/tests/helpers.js
const VPS = {
  phone: { key: 'phone', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, phone: true },
  desk: { key: 'desk', viewport: { width: 1280, height: 720 }, hasTouch: false, isMobile: false, phone: false },
};
const vp = VPS[VPN];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTS = path.join(OUT, 'shots'); const VIDS = path.join(OUT, 'video'); const PROF = path.join(OUT, 'profile-' + vp.key + (process.env.PROFILE ? '-' + process.env.PROFILE : ''));
[SHOTS, VIDS].forEach((d) => fs.mkdirSync(d, { recursive: true }));
const LOGF = path.join(OUT, 'log-' + vp.key + '.txt');
const log = (...a) => { const s = new Date().toISOString().slice(11, 19) + ' [' + vp.key + '/' + CUR + '] ' + a.join(' '); fs.appendFileSync(LOGF, s + '\n'); console.log(s); };
const STATS = { http: 0, ws: 0, pageErrors: [], consoleErrors: [], missing: [], sockets: [] };
let CUR = '-'; let N = 0; let PAGE = null;

async function shot(label, target) {
  N++;
  const f = path.join(SHOTS, `${vp.key}-${CUR}-${String(N).padStart(2, '0')}-${label.replace(/[^a-z0-9]+/gi, '-')}.png`);
  try { await (target || PAGE).screenshot({ path: f, timeout: 20000 }); log('SHOT', path.basename(f)); } catch (e) { log('shot failed', label, e.message.split('\n')[0]); }
  return f;
}
const INIT = () => {
  const targets = {};
  const fire = (type, id, x, y, el) => el && el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: x, clientY: y, buttons: type === 'pointerup' ? 0 : 1 }));
  window.__bt = {
    down(id, x, y) { const el = document.elementFromPoint(x, y); targets[id] = el; fire('pointerdown', id, x, y, el); },
    move(id, x, y) { fire('pointermove', id, x, y, targets[id]); },
    up(id, x, y) { fire('pointerup', id, x, y, targets[id]); delete targets[id]; },
  };
};
// Realm hooks for aim only: add test=1 to any mad-maze URL before its scripts run. test=1 also hides the first-run hero picker,
// the tutorial and the feedback box, so heropick=1, tutorial=1 and feedback=1 put them back (a new player sees all three).
const REALM_TEST = () => { try { if (/mad-maze\/index\.html/.test(location.pathname) && !/[?&]test=1/.test(location.search)) { const u = new URL(location.href); u.searchParams.set('test', '1'); ['heropick', 'tutorial', 'feedback'].forEach((k) => { if (!u.searchParams.has(k)) u.searchParams.set(k, '1'); }); history.replaceState(null, '', u.toString()); } } catch (e) { /* ignore */ } };

async function ctxOpen() {
  if (process.env.FRESH === '1') fs.rmSync(PROF, { recursive: true, force: true });
  const ctx = await chromium.launchPersistentContext(PROF, { viewport: vp.viewport, hasTouch: vp.hasTouch, isMobile: vp.isMobile, deviceScaleFactor: 1, recordVideo: { dir: VIDS, size: vp.viewport } });
  await ctx.route(BLOCK, (r) => { STATS.http++; return r.abort(); });
  await ctx.routeWebSocket(BLOCK, (ws) => { STATS.ws++; ws.close(); });
  if (fs.existsSync(THREE_LOCAL)) await ctx.route(/cdn\.jsdelivr\.net\/npm\/three@/, (r) => r.fulfill({ path: THREE_LOCAL, contentType: 'application/javascript' }));
  // read-only handle to the Phaser game (to log where the player stands in the Town)
  await ctx.route('**/game/main.js*', async (route) => { const resp = await route.fetch(); const body = (await resp.text()).replace('const game = new Phaser.Game(config);', 'const game = window.__g = new Phaser.Game(config);'); route.fulfill({ response: resp, body }); });
  await ctx.addInitScript(INIT);
  if (process.env.AIM !== '0') await ctx.addInitScript(REALM_TEST);
  return ctx;
}
function watch(page) {
  page.on('pageerror', (e) => { STATS.pageErrors.push(CUR + ' ' + e.message.slice(0, 200)); log('PAGEERROR', e.message.slice(0, 200)); });
  page.on('console', (m) => { if (m.type() === 'error') { const t = m.text(); if (/ERR_FAILED|Failed to load resource/.test(t)) return; STATS.consoleErrors.push(CUR + ' ' + t.slice(0, 200)); log('CONSOLE', t.slice(0, 200)); } });
  page.on('response', (r) => { if (r.status() >= 400) { STATS.missing.push(CUR + ' ' + r.status() + ' ' + r.url()); log('HTTP', r.status(), r.url()); } });
  page.on('websocket', (w) => { STATS.sockets.push(w.url()); log('WEBSOCKET OPENED', w.url()); });
}

// ---------- input ----------
async function center(host, sel) { return host.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); if (!r.width) return null; return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: Math.min(r.width, r.height) / 2 }; }, sel).catch(() => null); }
async function frameOffset(host) { if (host === PAGE || !host.frameElement) return { x: 0, y: 0 }; const fe = await host.frameElement(); const b = await fe.boundingBox(); return { x: b.x, y: b.y }; }
async function press(loc, label) {
  if (typeof loc === 'string') loc = PAGE.locator(loc).first();
  try { await loc.waitFor({ state: 'visible', timeout: 6000 }); } catch (e) { log('NOT VISIBLE', label || ''); return false; }
  // a coordinate tap/click (what a finger does): no actionability wait, so a busy main thread cannot turn one tap into two
  await loc.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  const bb = await loc.boundingBox().catch(() => null);
  if (!bb) { log('no box for', label || ''); return false; }
  const x = bb.x + bb.width / 2; const y = bb.y + bb.height / 2;
  const top = await loc.evaluate((el, q) => { const t = document.elementFromPoint(q[0] - (window.frameElement ? 0 : 0), q[1]); return !t || el === t || el.contains(t) ? '' : (t.id || t.className || t.tagName).toString().slice(0, 40); }, [x, y]).catch(() => '');
  if (top) log('NOTE', label || '', 'is covered by', top);
  const off = loc.page && loc.page() === PAGE ? { x: 0, y: 0 } : { x: 0, y: 0 };
  if (vp.phone) await PAGE.touchscreen.tap(x + off.x, y + off.y); else await PAGE.mouse.click(x + off.x, y + off.y);
  log('TAP', label || ''); await wait(600); return true;
}
async function stick(host, sel, id, dir) { const c = await center(host, sel); if (!c) return null; await host.evaluate(([i, x, y]) => window.__bt.down(i, x, y), [id, c.x, c.y]); await host.evaluate(([i, x, y]) => window.__bt.move(i, x, y), [id, c.x + dir[0] * c.r * 0.85, c.y + dir[1] * c.r * 0.85]); return c; }
async function unstick(host, id, c) { if (c) await host.evaluate(([i, x, y]) => window.__bt.up(i, x, y), [id, c.x, c.y]); }

// ---------- the Realm: play like a cautious new player ----------
async function realmState(host) {
  return host.evaluate(() => {
    const mm = window.__mm; const a = mm && mm.arena; const c = document.querySelector('#realm-canvas-wrap canvas');
    const r = c ? c.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
    const de = document.querySelector('#realm-death'); const dead = !!de && !de.classList.contains('hidden') && getComputedStyle(de).display !== 'none';
    if (!a || !a.player) return { r: { x: r.left, y: r.top, w: r.width, h: r.height }, dead };
    const p = a.player; let best = null; let bd = 1e9;
    (a.enemies || []).forEach((e) => { if (!e || !e.active) return; const sx = (e.x - a.camera.x) / a.W; const sy = (e.y - a.camera.y) / a.H; if (sx < -0.05 || sx > 1.05 || sy < -0.05 || sy > 1.05) return; const d = Math.hypot(e.x - p.x, e.y - p.y); if (d < bd) { bd = d; best = e; } });
    const sx = (wx) => r.left + ((wx - a.camera.x) / a.W) * r.width; const sy = (wy) => r.top + ((wy - a.camera.y) / a.H) * r.height;
    const w = mm.world; let zone = ''; try { zone = w && w.hudText ? w.hudText().zone : ''; } catch (e) { /* */ }
    return { r: { x: r.left, y: r.top, w: r.width, h: r.height }, dead, state: a.state, hp: Math.round(p.hp), max: a.stats && a.stats.maxHp, lvl: a.save && a.save.level, xp: a.save && a.save.xp, px: sx(p.x), py: sy(p.y), wx: Math.round(p.x), wy: Math.round(p.y), ex: best ? sx(best.x) : null, ey: best ? sy(best.y) : null, ed: best ? Math.round(bd) : null, n: (a.enemies || []).filter((e) => e && e.active).length, zone, kills: w && w.kills ? w.kills() : null, shards: a.save && a.save.shards, bullets: (a.enemyBullets || a.ebullets || []).length };
  }).catch(() => null);
}
async function playRealm(host, ms, opt = {}) {
  const t0 = Date.now(); let i = 0; let deaths = 0; let lastShot = 0; let last = null; let lastAim = null; const off = await frameOffset(host);
  while (Date.now() - t0 < ms) {
    i++;
    const st = await realmState(host); if (!st) { await wait(300); continue; }
    last = st;
    const pz = host.locator('#realm-pause:visible button[data-m="resume"]');
    if (await pz.count()) { STATS.menuPops = (STATS.menuPops || 0) + 1; log('MENU opened by itself during play; last mouse/aim point', JSON.stringify(lastAim), '-> Resume'); if (STATS.menuPops < 3) await shot('menu-popped', PAGE); await pz.first().click().catch(() => {}); await wait(300); continue; }
    if (st.dead) { deaths++; await shot('death', PAGE); log('DIED after', Math.round((Date.now() - t0) / 1000) + 's', JSON.stringify({ lvl: st.lvl, zone: st.zone })); const b = host.locator('#realm-death button[data-d="again"]').first(); if (await b.count()) { await (vp.phone ? b.tap() : b.click()).catch(() => b.click({ force: true }).catch(() => {})); } await wait(1500); if (opt.stopOnDeath) break; continue; }
    if (opt.shotEvery && Date.now() - lastShot > opt.shotEvery) { lastShot = Date.now(); await shot((opt.tag || 'play') + '-' + Math.round((Date.now() - t0) / 1000) + 's', PAGE); }
    let dir;
    if (opt.goal && st.wx != null) { const dx = opt.goal.x - st.wx; const dy = opt.goal.y - st.wy; const l = Math.hypot(dx, dy) || 1; dir = [dx / l, dy / l]; if (l < 60) dir = [Math.cos(i), Math.sin(i)]; }
    else if (st.ex != null && st.ed > 320) dir = [st.ex - st.px, st.ey - st.py];
    else dir = [Math.cos(i * 0.7), Math.sin(i * 0.7)];
    if (st.ed != null && st.ed < 200) dir = [-(st.ex - st.px), -(st.ey - st.py)];
    const l = Math.hypot(dir[0], dir[1]) || 1; dir = [dir[0] / l, dir[1] / l];
    const ax = st.ex != null ? st.ex : st.r.x + st.r.w * (0.5 + 0.35 * Math.cos(i)); const ay = st.ey != null ? st.ey : st.r.y + st.r.h * (0.5 + 0.35 * Math.sin(i));
    if (vp.phone) {
      const av = st.px != null ? [ax - st.px, ay - st.py] : [Math.cos(i), Math.sin(i)]; const al = Math.hypot(av[0], av[1]) || 1;
      const m = await stick(host, '#realm-stick-move', 1, dir); const a = await stick(host, '#realm-stick-aim', 2, [av[0] / al, av[1] / al]);
      await wait(800); await unstick(host, 1, m); await unstick(host, 2, a);
      if (i % 6 === 0) { const ab = await center(host, '#realm-ab-0'); if (ab) await PAGE.touchscreen.tap(ab.x + off.x, ab.y + off.y).catch(() => {}); }
    } else {
      const down = []; if (dir[1] < -0.35) down.push('w'); if (dir[1] > 0.35) down.push('s'); if (dir[0] < -0.35) down.push('a'); if (dir[0] > 0.35) down.push('d');
      for (const k of down) await PAGE.keyboard.down(k);
      lastAim = [Math.round(ax + off.x), Math.round(ay + off.y)]; await PAGE.mouse.move(ax + off.x, ay + off.y, { steps: 2 }); await PAGE.mouse.down(); await wait(750);
      if (i % 6 === 0) await PAGE.keyboard.press('q');
      await PAGE.mouse.up(); for (const k of down) await PAGE.keyboard.up(k);
    }
  }
  log('PLAY done', Math.round((Date.now() - t0) / 1000) + 's deaths=' + deaths, JSON.stringify(last && { lvl: last.lvl, xp: last.xp, hp: last.hp, max: last.max, kills: last.kills, zone: last.zone, n: last.n, shards: last.shards }));
  return { deaths, last };
}

// ---------- stages ----------
const S = {};
S.town = async (page) => {
  await page.goto(G('index.html')); await wait(2000); await shot('join-form');
  await page.fill('#name-input', 'ADMINpt3');
  await press('.species-tab', 'species tab'); await press('.avatar-choice', 'avatar');
  await shot('join-filled');
  await press('#join-btn', 'Join Town');
  const t1 = Date.now();
  await page.waitForSelector('#join-offline-btn:not(.hidden)', { timeout: 20000 }).catch(() => {});
  log('Play offline offered after', Math.round((Date.now() - t1) / 100) / 10, 's; status:', JSON.stringify((await page.textContent('#join-status').catch(() => '')) || ''));
  await shot('offline-offer');
  await press('#join-offline-btn', 'Play offline');
  await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 15000 }).catch(() => log('town did not load'));
  await wait(2500); await shot('town-arrived');
  // dismiss whatever first-visit cards appear, like a player would (click their buttons)
  for (let k = 0; k < 6; k++) {
    const b = page.locator('#tutorial-overlay:not(.hidden) button:visible, #whats-new-close-btn:visible, .welcome-card button:visible').first();
    if (!(await b.count())) break; const t = (await b.textContent().catch(() => '')).trim().slice(0, 30); await shot('popup-' + k); await press(b, 'dismiss ' + t);
  }
  await shot('town-clear');
  // walk to the Realm Gate with real input; the bot reads its own position (read-only) to steer, a human would use their eyes
  const pos = () => page.evaluate(() => { const b = window.__g.scene.getScene('Town').localBody; return { x: Math.round(b.x), y: Math.round(b.y) }; });
  const start = await pos(); log('town spawn', JSON.stringify(start), 'gate', '{750,260}');
  const t0 = Date.now(); let near = false;
  for (let k = 0; k < 40 && !near; k++) {
    const p = await pos(); const dx = 750 - p.x; const dy = 300 - p.y; if (Math.hypot(dx, dy) < 40) { near = true; break; }
    const l = Math.hypot(dx, dy); const d = [dx / l, dy / l];
    if (vp.phone) { const c = await stick(page, '#joystick', 1, d); await wait(500); await unstick(page, 1, c); }
    else { const ks = []; if (d[1] < -0.3) ks.push('w'); if (d[1] > 0.3) ks.push('s'); if (d[0] < -0.3) ks.push('a'); if (d[0] > 0.3) ks.push('d'); for (const q of ks) await page.keyboard.down(q); await wait(450); for (const q of ks) await page.keyboard.up(q); }
    if (k === 3) await shot('walking-to-gate');
  }
  log('walk to gate', near ? 'arrived' : 'NOT arrived (blocked?)', Math.round((Date.now() - t0) / 1000) + 's', JSON.stringify(await pos()));
  await shot('at-gate');
  if (vp.phone) await press('#interact-btn', 'A at gate'); else { await page.keyboard.press('e'); await wait(700); }
  if (!(await page.isVisible('#realm-menu').catch(() => false))) { log('HOOK gate menu did not open from walking+interact; interact() fallback'); await page.evaluate(() => { const s = window.__g.scene.getScene('Town'); s.localBody.setPosition(750, 290); s.interact(); }); await wait(600); }
  await shot('gate-menu');
  await press('#realm-menu-madmaze', 'Enter the Realm');
  await page.waitForSelector('#realm-embed iframe', { timeout: 10000 }).catch(() => log('no embed'));
  await wait(3500);
  const fr = page.frames().find((f) => /mad-maze/.test(f.url()));
  log('embedded realm url', fr && fr.url());
  await shot('realm-first-screen');
  // hero create: take the first open class card (a new player taps the top one)
  const cards = fr.locator('#realm-hero button[data-newcls]:not([disabled])');
  log('class cards open:', await cards.count());
  if (await cards.count()) { await press(cards.first(), 'class card'); await wait(1500); await shot('after-class'); }
  for (let k = 0; k < 8; k++) { // tutorial cards / name prompt / anything modal
    const b = fr.locator('#realm-hero:visible button:visible, .mm-tut:visible button:visible, #realm-tut:visible button:visible, .rt-card:visible button:visible, #realm-ftue:visible button:visible').first();
    if (!(await b.count())) break; const t = (await b.textContent().catch(() => '')).trim().slice(0, 30); if (k < 3) await shot('ftue-' + k); await press(b, 'ftue: ' + t);
  }
  await shot('realm-ready');
  if (!vp.phone) { const c = await center(page, '#realm-embed iframe'); await page.mouse.click(c.x, c.y); }
  const r = await playRealm(fr, 60000, { shotEvery: 12000, tag: 'first-fight' });
  await shot('after-first-fight');
  // backpack: loot?
  const bp = fr.locator('#realm-bp-btn'); if (await bp.count()) { await press(bp, 'backpack'); await wait(700); await shot('backpack-after-first-fight'); log('backpack text:', ((await fr.textContent('#realm-backpack-body').catch(() => '')) || '').replace(/\s+/g, ' ').slice(0, 400)); await press(fr.locator('#realm-bp-close'), 'close backpack'); }
  log('first fight result', JSON.stringify(r.last));
};

async function townOffline(page) { // back into the Town the way a returning player does
  await page.goto(G('index.html')); await wait(2000);
  await shot('town-return');
  if (await page.isVisible('#join-btn').catch(() => false)) {
    const nm = await page.inputValue('#name-input').catch(() => ''); log('join card again; name remembered =', JSON.stringify(nm));
    if (!nm) await page.fill('#name-input', 'ADMINpt3');
    if (await page.isDisabled('#join-btn').catch(() => false)) { await press('.species-tab', 'species'); await press('.avatar-choice', 'avatar'); }
    await press('#join-btn', 'Join Town');
    await page.waitForSelector('#join-offline-btn:not(.hidden)', { timeout: 20000 }).catch(() => {});
    await press('#join-offline-btn', 'Play offline');
  }
  await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 15000 }).catch(() => log('town did not load'));
  await wait(2000);
}
async function whereTo(page, id, label) { // the shared Where-to menu
  const btn = page.locator('#where-to-btn:visible, #mm-nav-btn:visible').first();
  if (!(await btn.count())) { log('NO Where-to button visible on', page.url()); return false; }
  await press(btn, 'Where to?'); await wait(500); await shot('whereto-' + (label || id));
  const d = page.locator('#mm-nav-sheet a.mm-nav-dest[data-place="' + id + '"]');
  if (!(await d.count())) { log('no destination', id); return false; }
  await Promise.all([page.waitForLoadState('load').catch(() => {}), press(d, 'go ' + id)]);
  await wait(2500); log('now at', page.url().replace(/^http:\/\/[^/]+/, '')); return true;
}
async function realmWalk(host, goal, ms, tag) { const r = await playRealm(host, ms, { goal, tag, shotEvery: 0 }); return r; }

S.realm = async (page) => { // Town -> Where to? -> The Realm (standalone) -> keep playing -> the Nexus -> vendor + shop -> backpack stats/forge
  await townOffline(page); await shot('town');
  await whereTo(page, 'realm', 'town');
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.state, null, { timeout: 20000 }).catch(() => log('realm not ready'));
  await wait(1500); await shot('realm-standalone-first');
  for (let k = 0; k < 6; k++) { const b = page.locator('#realm-hero:visible button[data-newcls]:not([disabled]), .mm-tut:visible button:visible, #realm-tut:visible button:visible').first(); if (!(await b.count())) break; await shot('modal-' + k); await press(b, 'modal: ' + (await b.textContent()).trim().slice(0, 30)); }
  if (!vp.phone) await page.mouse.click(640, 360);
  log('state', JSON.stringify(await realmState(page)));
  await playRealm(page, 45000, { shotEvery: 15000, tag: 'grind' });
  // the Nexus portal next to the spawn
  const site = await page.evaluate(() => { const n = window.__mm.world.nexus; const s = typeof n.site === 'function' ? n.site() : n.site; return s && { x: s.x, y: s.y }; });
  log('HOOK read Nexus portal position', JSON.stringify(site));
  for (let k = 0; k < 12; k++) { await playRealm(page, 2500, { goal: site }); if (await page.isVisible('#rw-nexus-go')) break; }
  await shot('nexus-prompt');
  if (!(await press('#rw-nexus-go', 'Visit the Nexus'))) { log('HOOK nexus.open()'); await page.evaluate(() => window.__mm.world.nexus.open()); }
  await wait(1200); await shot('nexus-arrive');
  // walk to the vendor with real input
  const L = await page.evaluate(() => { const lay = (window.MMNexus && MMNexus.layout && MMNexus.layout()) || null; return lay && { npcs: lay.npcs.map((n) => ({ id: n.id, npc: n.npc, x: n.x, y: n.y, role: n.role })), portals: lay.portals.map((p) => ({ id: p.id, label: p.label, x: p.x, y: p.y })) }; });
  log('HOOK nexus layout', JSON.stringify(L));
  const nxWalkTo = async (tx, ty) => {
    for (let k = 0; k < 40; k++) {
      const h = await page.evaluate(() => window.__mm.world.nexus.walk.hero()); const dx = tx - h.x; const dy = ty - h.y; const l = Math.hypot(dx, dy);
      if (l < 40 || await page.locator('#rw-nx-act:not(.hidden)').count() && l < 70) return true;
      const d = [dx / l, dy / l];
      if (vp.phone) { const c = await stick(page, '#realm-stick-move', 1, d); await wait(350); await unstick(page, 1, c); }
      else { const ks = []; if (d[1] < -0.3) ks.push('w'); if (d[1] > 0.3) ks.push('s'); if (d[0] < -0.3) ks.push('a'); if (d[0] > 0.3) ks.push('d'); for (const q of ks) await page.keyboard.down(q); await wait(300); for (const q of ks) await page.keyboard.up(q); }
    }
    return false;
  };
  const ven = L && L.npcs.find((n) => n.role === 'shop');
  if (ven) { const ok = await nxWalkTo(ven.x, ven.y + 30); log('walk to vendor', ok); }
  await shot('nexus-near-vendor');
  if (await page.locator('#rw-nx-act:not(.hidden)').count()) await press('#rw-nx-act', 'act: ' + (await page.textContent('#rw-nx-act')));
  else { log('HOOK nexus.stall.open()'); await page.evaluate(() => window.__mm.world.nexus.stall.open()); }
  await wait(700); await shot('vendor-stall');
  log('stall text:', ((await page.textContent('#rw-nx-stall').catch(() => '')) || '').replace(/\s+/g, ' ').slice(0, 500));
  if (await press('#rw-nx-shop', 'Shop (shards)')) {
    await wait(700); await shot('shop');
    log('shop text:', ((await page.textContent('#realm-shop-body').catch(() => '')) || '').replace(/\s+/g, ' ').slice(0, 600));
    const buy = page.locator('#realm-shop-body button[data-buy]:not([disabled])').first();
    if (await buy.count()) { const t = await buy.getAttribute('aria-label'); await press(buy, t); await wait(800); await shot('shop-bought'); } else log('nothing affordable in the shop');
    await press('#realm-shop-close', 'close shop');
  }
  // backpack: stats dropdown + forge
  await press('#realm-bp-btn', 'backpack'); await wait(500); await shot('backpack');
  await press('#realm-bp-stats-toggle', 'Stats dropdown'); await wait(500); await shot('backpack-stats-open');
  log('stats box:', ((await page.textContent('#realm-bp-stats-box').catch(() => '')) || '').replace(/\s+/g, ' ').slice(0, 600));
  await press('#realm-bp-stats-toggle', 'Stats close');
  const eq = page.locator('#realm-backpack-body button', { hasText: /^Equip/ }).first(); if (await eq.count()) { await press(eq, 'Equip item'); await shot('backpack-equipped'); }
  const fg = page.locator('#realm-backpack-body button', { hasText: /Forge/ }).first();
  if (await fg.count()) { await press(fg, 'Forge'); await wait(600); await shot('forge'); log('forge text:', ((await page.textContent('#realm-backpack-body').catch(() => '')) || '').replace(/\s+/g, ' ').slice(0, 700)); }
  await press('#realm-bp-close', 'close backpack');
  await shot('after-bp-where-am-i');
  log('Nexus still open after shop/backpack:', await page.evaluate(() => window.__mm.world.nexus.isOpen()));
  if (!(await page.evaluate(() => window.__mm.world.nexus.isOpen()))) {
    for (let k = 0; k < 8 && !(await page.isVisible('#rw-nexus-go')); k++) await playRealm(page, 2000, { goal: site });
    if (!(await press('#rw-nexus-go', 'Visit the Nexus again'))) { log('HOOK nexus.open()'); await page.evaluate(() => window.__mm.world.nexus.open()); }
    await wait(1000);
  }
  fs.writeFileSync(path.join(OUT, 'nexus-' + vp.key + '.json'), JSON.stringify(L));
  // into a dungeon from the Nexus
  const dp = L && (L.portals.find((p) => p.id === 'meadow') || L.portals.find((p) => !/realm|vault/.test(p.id)));
  if (dp) { const ok = await nxWalkTo(dp.x, dp.y + 20); log('walk to portal', dp.id, ok); }
  await shot('nexus-near-portal');
  const act = page.locator('#rw-nx-act:not(.hidden)');
  const t0 = Date.now();
  if (await act.count()) { log('portal prompt:', await act.textContent()); await Promise.all([page.waitForURL(/mode=dungeon/, { timeout: 15000 }).catch(() => {}), press(act, 'enter dungeon')]); }
  else { log('HOOK nexus.portal()'); await page.evaluate((id) => window.__mm.world.nexus.portal(id), dp.id); await page.waitForURL(/mode=dungeon/, { timeout: 15000 }).catch(() => {}); }
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.state === 'play', null, { timeout: 20000 }).catch(() => {});
  log('dungeon loaded in', Math.round((Date.now() - t0) / 100) / 10, 's', page.url().replace(/^http:\/\/[^/]+/, ''));
  await wait(1200); await shot('dungeon-first');
  if (!vp.phone) await page.mouse.click(640, 360);
  // play the dungeon: head for the exit arrow / doors by fighting; follow the gold arrow by reading the door the game points at
  const dres = await playRealm(page, 50000, { shotEvery: 12000, tag: 'dungeon' });
  await shot('dungeon-after');
  // leave the dungeon the way a player does
  await press('#realm-leave-btn', 'Leave/Exit'); await wait(1200); await shot('dungeon-leave-1');
  const conf = page.locator('button:visible', { hasText: /^(Leave|Yes|Exit)/ }).first(); if (await conf.count()) { await press(conf, 'confirm leave'); await wait(1200); await shot('dungeon-leave-2'); }
  const home = page.locator('#mm-sum-home'); if (await home.count()) { await Promise.all([page.waitForURL((u) => !/mode=dungeon/.test(String(u)), { timeout: 15000 }).catch(() => {}), press(home, 'Back to the world')]); }
  await wait(3000); await shot('back-from-dungeon');
  log('after dungeon url', page.url().replace(/^http:\/\/[^/]+/, ''), JSON.stringify(await realmState(page)));
  await playRealm(page, 8000, {}); await shot('world-after-return');
};

const txt = async (page, sel) => ((await page.textContent(sel).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
async function hubChip(page, re) {
  const b = page.locator('#hub-games button', { hasText: re }).first();
  if (!(await b.count())) { log('no hub chip', String(re)); return false; }
  await press(b, 'hub chip ' + String(re)); await page.waitForFunction(() => !window.__hub.walking, null, { timeout: 15000 }).catch(() => {}); await wait(800);
  await shot('hub-card-' + String(re).replace(/\W/g, ''));
  log('card:', await txt(page, '#card'));
  if (await page.isVisible('#card-play')) { await Promise.all([page.waitForLoadState('load').catch(() => {}), press('#card-play', 'Play')]); await wait(2500); return true; }
  log('card has no Play (soon/locked)'); return false;
}
S.hub = async (page) => { // Town -> Where to? -> World map (Hub) -> Campfire Jam -> back to the Hub
  await townOffline(page);
  await whereTo(page, 'map', 'town');
  await page.waitForFunction(() => window.__hub, null, { timeout: 15000 }).catch(() => {}); await wait(1500);
  await shot('hub-first');
  log('hub continue:', (await page.isVisible('#hub-continue')) ? await txt(page, '#hub-continue') : '(hidden)');
  log('hub calm card:', (await page.isVisible('#calm-card')) ? await txt(page, '#calm-card') : '(hidden)');
  log('hub chips:', await txt(page, '#hub-games'), '| hint:', await txt(page, '#hint'), '| chip:', (await page.isVisible('#hint-chip')) ? await txt(page, '#hint-chip') : '-');
  const reach = await page.evaluate(() => MMMap.MAP.nodes.filter((n) => window.__hub.isReachable(n.id)).map((n) => n.id)).catch(() => []);
  log('HOOK(read) hub reachable nodes:', reach.length, reach.join(','));
  // the daily gift is the most eye-catching button
  if (await page.isVisible('#gift-btn')) { await press('#gift-btn', 'Daily gift'); await shot('hub-gift'); log('gift:', await txt(page, '#gift-card')); if (await page.isEnabled('#gift-claim').catch(() => false)) { await press('#gift-claim', 'Claim'); await shot('hub-gift-claimed'); } await press('#gift-close', 'close gift'); }
  // a minigame: Campfire Jam
  if (await hubChip(page, /Jam/)) {
    await shot('jam-first');
    for (let k = 0; k < 4; k++) { const b = page.locator('#overlay button:visible', { hasText: /Got it|OK|Skip|Start|Play/i }).first(); if (!(await b.count())) break; await press(b, 'jam: ' + (await b.textContent()).trim().slice(0, 20)); }
    await shot('jam-songs');
    log('jam overlay:', (await txt(page, '#overlay')).slice(0, 400));
    const song = page.locator('#overlay button:visible', { hasText: /Easy|Warm|Embers/i }).first();
    if (await song.count()) await press(song, 'song: ' + (await song.textContent()).trim().slice(0, 30)); else { const any = page.locator('#overlay button:visible').first(); if (await any.count()) await press(any, 'first overlay button'); }
    await wait(1500); await shot('jam-playing-0');
    const lanes = ['#pad-0', '#pad-1', '#pad-2', '#pad-3'];
    const lanesOk = await page.locator('#pads button, #pads [id^=pad-]').count(); log('pads found', lanesOk);
    const padIds = await page.$$eval('#pads [id^=pad-]', (bs) => bs.map((b) => '#' + b.id)).catch(() => lanes);
    const t0 = Date.now(); let n = 0;
    while (Date.now() - t0 < 25000) { if (vp.phone) { const p = padIds[n % padIds.length]; const c = await center(page, p); if (c) await page.touchscreen.tap(c.x, c.y); } else await page.keyboard.press(['d', 'f', 'j', 'k'][n % 4]); n++; await wait(180); if (n === 60) await shot('jam-playing-mid'); }
    await wait(8000); await shot('jam-end');
    log('jam hud:', await txt(page, '#hud'), '| overlay:', (await txt(page, '#overlay')).slice(0, 300));
    // back to the Hub the way the page offers: the shared Menu (Back row) or the page's own Hub link
    const mb = page.locator('#mm-nav-btn:visible').first();
    if (await mb.count()) { await press(mb, 'Menu'); await shot('jam-menu'); if (!(await page.isVisible('#mm-nav-sheet'))) { log('Menu tap mid-song only PAUSED; the Where-to sheet did not open -> tap Menu again'); await press(mb, 'Menu (2nd tap)'); await shot('jam-menu-2nd'); } const back = page.locator('#mm-nav-back'); log('menu back row:', await txt(page, '#mm-nav-sheet .mm-nav-top')); if (await back.count()) await Promise.all([page.waitForLoadState('load').catch(() => {}), press(back, 'Back row')]); }
    else if (await page.isVisible('#back-hub')) await press('#back-hub', 'Hub link');
    await wait(2500); log('after jam back ->', page.url().replace(/^http:\/\/[^/]+/, ''));
    await shot('back-at-hub');
    log('hub continue now:', (await page.isVisible('#hub-continue').catch(() => false)) ? await txt(page, '#hub-continue') : '(hidden)');
  }
};

async function islesState(page) { return page.evaluate(() => { const I = window.__isles; if (!I) return null; const h = I.hero(); return { isle: I.isle, hero: { x: Math.round(h.x), y: Math.round(h.y), tx: h.tx, ty: h.ty }, hint: I.hint && I.hint(), stats: I.stats && I.stats(), nearDock: I.nearDock && I.nearDock(), inv: I.save && I.save().inv }; }).catch(() => null); }
async function islesWalk(page, tx, ty, maxSteps = 40) { // real input (keyboard / on-screen stick); the hero position is read to steer
  let prev = null; let side = 0; let sideLeft = 0;
  for (let k = 0; k < maxSteps; k++) {
    const h = await page.evaluate(() => window.__isles.hero()); const dx = tx - h.x; const dy = ty - h.y; const l = Math.hypot(dx, dy); if (l < 28) return true;
    if (prev && Math.hypot(h.x - prev.x, h.y - prev.y) < 10 && !sideLeft) { side = side === 1 ? -1 : 1; sideLeft = 3; } // stuck on water / a rock: sidestep
    prev = h;
    let d = [dx / l, dy / l];
    if (sideLeft) { d = [-d[1] * side + d[0] * 0.2, d[0] * side + d[1] * 0.2]; sideLeft--; }
    if (vp.phone) { const c = await stick(page, '#stick', 1, d); await wait(Math.min(700, 150 + l)); await unstick(page, 1, c); }
    else { const ks = []; if (d[1] < -0.3) ks.push('w'); if (d[1] > 0.3) ks.push('s'); if (d[0] < -0.3) ks.push('a'); if (d[0] > 0.3) ks.push('d'); for (const q of ks) await page.keyboard.down(q); await wait(Math.min(700, 150 + l)); for (const q of ks) await page.keyboard.up(q); }
  }
  return false;
}
// glints: the game draws a 3x3 #fff4a8 "glint" pixel over every gatherable node; find them on screen like a player's eye would
async function glints(page) {
  return page.evaluate(() => {
    const cv = document.getElementById('view'); if (!cv) return [];
    const g = cv.getContext('2d'); const W = cv.width; const H = cv.height; let d; try { d = g.getImageData(0, 0, W, H).data; } catch (e) { return []; }
    const r = cv.getBoundingClientRect(); const sx = r.width / W; const sy = r.height / H; const out = [];
    for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 2) { const i = (y * W + x) * 4; if (Math.abs(d[i] - 255) < 3 && Math.abs(d[i + 1] - 244) < 3 && Math.abs(d[i + 2] - 168) < 3) { if (!out.some((p) => Math.abs(p.x - x) < 12 && Math.abs(p.y - y) < 12)) out.push({ x, y }); } }
    return out.map((p) => ({ dx: (p.x - 10 - W / 2) * sx, dy: (p.y + 12 - H / 2) * sy })); // node centre relative to the screen centre (the camera follows the hero)
  }).catch(() => []);
}
async function islesMove(page, d, ms) {
  if (vp.phone) { const c = await stick(page, '#stick', 1, d); await wait(ms); await unstick(page, 1, c); }
  else { const ks = []; if (d[1] < -0.3) ks.push('w'); if (d[1] > 0.3) ks.push('s'); if (d[0] < -0.3) ks.push('a'); if (d[0] > 0.3) ks.push('d'); for (const q of ks) await page.keyboard.down(q); await wait(ms); for (const q of ks) await page.keyboard.up(q); }
}
async function islesFire(page, ms) {
  if (vp.phone) { const f = await center(page, '#btn-fire'); if (f) { await page.evaluate(([x, y]) => window.__bt.down(3, x, y), [f.x, f.y]); await wait(ms); await page.evaluate(([x, y]) => window.__bt.up(3, x, y), [f.x, f.y]); } }
  else { await page.keyboard.down('Space'); await wait(ms); await page.keyboard.up('Space'); }
}
const inv = (page) => page.evaluate(() => (window.__isles.save().inv) || {}).catch(() => ({}));
async function gatherWalk(page, ms, want) { // walk from glint to glint; wander when none is on screen
  const t0 = Date.now(); let k = 0; let got = 0; const start = JSON.stringify(await inv(page));
  while (Date.now() - t0 < ms) {
    k++;
    const gs = await glints(page);
    if (gs.length) { gs.sort((a, b) => Math.hypot(a.dx, a.dy) - Math.hypot(b.dx, b.dy)); const n = gs[0]; const l = Math.hypot(n.dx, n.dy) || 1; await islesMove(page, [n.dx / l, n.dy / l], Math.min(500, 60 + l * 2.2)); got++; }
    else { const a = Math.floor(k / 6) * 1.9; await islesMove(page, [Math.cos(a), Math.sin(a)], 600); }
    if (k % 8 === 0) await islesFire(page, 300); // clear the path of anything hostile
    if (want) { const iv = await inv(page); if (Object.keys(want).every((w) => (iv[w] || 0) >= want[w])) break; }
  }
  log('gather walk', Math.round((Date.now() - t0) / 1000) + 's', 'glint moves', got, 'inv', start, '->', JSON.stringify(await inv(page)));
}
async function sailTo(page, re, label) {
  if (!(await page.evaluate(() => window.__isles.nearDock()))) {
    const d = await page.evaluate(() => window.__isles.dock()); log('HOOK read dock tile', JSON.stringify(d));
    if (d) { const ok = await islesWalk(page, d.x * 32 + 16, d.y * 32 + 16, 140); log('walk to dock', ok, JSON.stringify(await page.evaluate(() => window.__isles.hero()))); }
  }
  await shot('dock-' + label);
  if (!(await page.isVisible('#btn-sail'))) { log('no Sail button at the dock (near =', await page.evaluate(() => window.__isles.nearDock()), ')'); return false; }
  await press('#btn-sail', 'Sail'); await wait(500); await shot('sea-chart-' + label);
  log('sea chart:', (await txt(page, '#panel-body')).slice(0, 500));
  const b = page.locator('#panel-body button.dest:not(.locked)', { hasText: re }).first();
  if (!(await b.count())) { log('destination not open:', String(re)); await press('#panel-close', 'close chart'); return false; }
  const t0 = Date.now(); await press(b, 'sail to ' + label);
  await page.waitForFunction(() => window.__isles, null, { timeout: 20000 }).catch(() => {}); await wait(2500);
  log('sailed in', Math.round((Date.now() - t0) / 100) / 10, 's; now on', await page.evaluate(() => window.__isles.isle).catch(() => '?'), page.url().replace(/^http:\/\/[^/]+/, ''));
  await shot('arrived-' + label); return true;
}
S.isles = async (page) => { // Hub -> Isles: first tame, gather + craft a raft, sail to the reef
  await page.goto(G('hub/index.html')); await page.waitForFunction(() => window.__hub, null, { timeout: 15000 }).catch(() => {}); await wait(1200);
  await page.addInitScript(() => { try { if (/games\/isles\//.test(location.pathname) && !/[?&]test=1/.test(location.search)) { const u = new URL(location.href); u.searchParams.set('test', '1'); history.replaceState(null, '', u.toString()); } } catch (e) { /* */ } });
  log('HOOK ?test=1 added to the Isles URL to READ creature / hero / dock positions for steering (glints are found by scanning screen pixels)');
  if (!(await hubChip(page, /Isles/))) { log('Isles chip did not open; going via Where to'); await whereTo(page, 'isles', 'hub'); }
  await page.waitForFunction(() => window.__isles, null, { timeout: 20000 }).catch(() => log('no __isles'));
  await wait(2000); await shot('isles-first');
  log('first hint:', await txt(page, '#hint'), '| hud:', await txt(page, '#hud'));
  // explore until a creature is near
  const t0 = Date.now(); let cr = null; let k = 0;
  while (Date.now() - t0 < 60000) {
    cr = await page.evaluate(() => { const I = window.__isles; const h = I.hero(); const c = I.creatures().filter((x) => x.kind !== 'boss' && !x.ko && !x.tamed).sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0]; return c ? { uid: c.uid, sp: c.sp, x: c.x, y: c.y, hostile: c.hostile, d: Math.round(Math.hypot(c.x - h.x, c.y - h.y)) } : null; });
    if (cr && cr.d < 420) break;
    k++; const a = Math.floor(k / 5) * 2.1; await islesMove(page, [Math.cos(a), Math.sin(a)], 700);
    if (k === 6) await shot('exploring');
  }
  log('creature found after', Math.round((Date.now() - t0) / 1000) + 's', JSON.stringify(cr));
  if (cr) {
    await islesWalk(page, cr.x, cr.y + 70, 20);
    await shot('near-creature'); log('hint:', await txt(page, '#hint'), '| acts:', await txt(page, '#acts'));
    if (await page.isVisible('#btn-soothe')) { await press('#btn-soothe', 'Soothe'); } else if (!vp.phone) { await page.keyboard.press('q'); log('Soothe via Q'); }
    await shot('soothe-on'); log('toast:', await txt(page, '#toast'));
    const t1 = Date.now();
    for (let i = 0; i < 45; i++) {
      const c = await page.evaluate((id) => window.__isles.creatures().find((x) => x.uid === id) || null, cr.uid);
      if (!c || c.ko || c.calm || c.tamed) { log('creature state', JSON.stringify(c && { ko: c.ko, calm: c.calm, tamed: c.tamed })); break; }
      const h = await page.evaluate(() => window.__isles.hero());
      if (Math.hypot(c.x - h.x, c.y - h.y) > 200) await islesWalk(page, c.x, c.y + 60, 3);
      await islesFire(page, 450); if (i === 5) await shot('soothing');
    }
    log('soothe took', Math.round((Date.now() - t1) / 1000) + 's');
    await shot('after-soothe'); log('hint:', await txt(page, '#hint'), '| toast:', await txt(page, '#toast'));
    const c2 = await page.evaluate((id) => window.__isles.creatures().find((x) => x.uid === id) || null, cr.uid);
    if (c2) await islesWalk(page, c2.x, c2.y + 30, 10);
    for (let i = 0; i < 16; i++) {
      if (!(await page.isVisible('#btn-feed'))) { if (i === 0) log('no Feed button; hint:', await txt(page, '#hint')); if (!vp.phone && i === 0) { await page.keyboard.press('f'); log('Feed via F'); } else break; }
      else await press('#btn-feed', 'Feed');
      await wait(i < 3 ? 300 : 1400); if (i === 2) await shot('feeding');
      if ((await page.evaluate(() => window.__isles.stats().tamed)) > 0) break;
    }
    await shot('after-feed'); const st = await islesState(page); log('tamed =', st && st.stats.tamed, '| hint:', await txt(page, '#hint'), '| toast:', await txt(page, '#toast'));
  }
  // what does the raft need?
  await press('#btn-craft', 'Craft'); await wait(400); await shot('craft-panel'); log('craft:', (await txt(page, '#panel-body')).slice(0, 400)); await press('#panel-close', 'close craft');
  // gather on the home isle, then try the reef, then the jungle for wood + vine rope
  await gatherWalk(page, 40000, { wood: 4, vine_rope: 2 });
  await shot('after-home-gather');
  // second try at the first tame, now with whatever food the walk picked up
  if (cr && !(await page.evaluate(() => window.__isles.stats().tamed))) {
    const c3 = await page.evaluate((id) => window.__isles.creatures().find((x) => x.uid === id) || null, cr.uid)
      || await page.evaluate(() => { const I = window.__isles; const h = I.hero(); return I.creatures().filter((x) => x.kind !== 'boss' && !x.ko && !x.tamed).sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0] || null; });
    log('tame retry with inv', JSON.stringify(await inv(page)), 'target', JSON.stringify(c3 && { sp: c3.sp, uid: c3.uid }));
    if (c3) {
      await islesWalk(page, c3.x, c3.y + 30, 40);
      for (let i = 0; i < 14; i++) { if (await page.isVisible('#btn-feed')) await press('#btn-feed', 'Feed (retry)'); else if (!vp.phone) await page.keyboard.press('f'); else break; await wait(1500); const c4 = await page.evaluate((id) => window.__isles.creatures().find((x) => x.uid === id) || null, c3.uid); if (c4) await islesWalk(page, c4.x, c4.y + 30, 3); if ((await page.evaluate(() => window.__isles.stats().tamed)) > 0) break; }
      await shot('tame-retry'); log('tamed after retry =', await page.evaluate(() => window.__isles.stats().tamed), '| hint:', await txt(page, '#hint'), '| toast:', await txt(page, '#toast'));
    }
  }
  await press('#btn-home', 'Home (to the dock)'); await wait(2500);
  const reefOk = await sailTo(page, /Reef/i, 'reef-try');
  if (!reefOk) {
    await sailTo(page, /Jungle/i, 'jungle');
    await gatherWalk(page, 120000, { wood: 4, vine_rope: 2 });
    await shot('jungle-after-gather');
    await press('#btn-craft', 'Craft'); await wait(400);
    const raft = page.locator('#panel-body button', { hasText: /^Craft$/ }).first();
    log('craft panel now:', (await txt(page, '#panel-body')).slice(0, 300));
    if (await raft.count() && await raft.isEnabled()) { await press(raft, 'Craft raft'); await wait(600); await shot('raft-crafted'); log('toast:', await txt(page, '#toast')); }
    else { await shot('raft-not-yet'); log('raft not craftable yet after', 'gathering'); }
    await press('#panel-close', 'close craft');
    await sailTo(page, /Reef/i, 'reef');
  }
  const isle = await page.evaluate(() => window.__isles && window.__isles.isle).catch(() => '?'); log('final isle', isle);
  if (isle === 'reef') { await gatherWalk(page, 15000); await shot('reef-explore'); }
  fs.writeFileSync(path.join(OUT, 'isles-' + vp.key + '.json'), JSON.stringify(await islesState(page)));
};

async function tameNearest(page, tag) {
  const cr = await page.evaluate(() => { const I = window.__isles; const h = I.hero(); const c = I.creatures().filter((x) => x.kind !== 'boss' && !x.ko && !x.tamed).sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0]; return c ? { uid: c.uid, sp: c.sp, x: c.x, y: c.y, d: Math.round(Math.hypot(c.x - h.x, c.y - h.y)) } : null; });
  log(tag, 'HOOK nearest creature', JSON.stringify(cr)); if (!cr) return 0;
  await islesWalk(page, cr.x, cr.y + 60, 30); await shot(tag + '-near'); log('hint:', await txt(page, '#hint'));
  for (let i = 0; i < 30; i++) {
    const c = await page.evaluate((id) => window.__isles.creatures().find((x) => x.uid === id) || null, cr.uid); if (!c || c.ko || c.calm || c.tamed) break;
    const h = await page.evaluate(() => window.__isles.hero()); if (Math.hypot(c.x - h.x, c.y - h.y) > 200) await islesWalk(page, c.x, c.y + 60, 3);
    if (/Soothe/.test(await txt(page, '#hint')) || i > 2) await islesFire(page, 450); else await wait(400);
  }
  for (let i = 0; i < 18; i++) {
    const c = await page.evaluate((id) => window.__isles.creatures().find((x) => x.uid === id) || null, cr.uid); if (!c) break;
    await islesWalk(page, c.x, c.y + 30, 3);
    if (await page.isVisible('#btn-feed')) await press('#btn-feed', 'Feed'); else if (!vp.phone) await page.keyboard.press('f');
    await wait(1600); if (i === 2) await shot(tag + '-feeding');
    if ((await page.evaluate(() => window.__isles.stats().tamed)) > 0) break;
  }
  const t = await page.evaluate(() => window.__isles.stats().tamed); await shot(tag + '-result');
  log(tag, 'tamed =', t, '| hint:', await txt(page, '#hint'), '| toast:', await txt(page, '#toast'), '| pouch', JSON.stringify(await page.evaluate(() => window.__isles.pouch())));
  return t;
}
S.isles2 = async (page) => { // a returning player: Where to -> Isles -> dock -> jungle: tame there, gather vine rope, craft the raft, sail to the reef
  await page.addInitScript(() => { try { if (/games\/isles\//.test(location.pathname) && !/[?&]test=1/.test(location.search)) { const u = new URL(location.href); u.searchParams.set('test', '1'); history.replaceState(null, '', u.toString()); } } catch (e) { /* */ } });
  await page.goto(G('hub/index.html')); await wait(1500);
  await whereTo(page, 'isles', 'hub');
  await page.waitForFunction(() => window.__isles, null, { timeout: 20000 }).catch(() => {}); await wait(2000);
  await shot('isles-continue'); log('on', await page.evaluate(() => window.__isles.isle), 'inv', JSON.stringify(await inv(page)));
  if ((await page.evaluate(() => window.__isles.isle)) !== 'jungle') await sailTo(page, /Jungle/i, 'jungle');
  await tameNearest(page, 'jungle-tame');
  await gatherWalk(page, Number(process.env.GATHER || 150000), { wood: 4, vine_rope: 2 });
  await shot('after-gather');
  await press('#btn-craft', 'Craft'); await wait(400);
  const row = page.locator('#panel-body .rc, #panel-body li, #panel-body div', { hasText: /^Raft/ }).first();
  const raftBtn = page.locator('#panel-body button:not([disabled])', { hasText: /^Craft$/ }).first();
  log('craft panel:', (await txt(page, '#panel-body')).slice(0, 260));
  if ((await inv(page)).vine_rope >= 2 && await raftBtn.count()) { await press(raftBtn, 'Craft (first enabled = raft)'); await wait(800); await shot('raft-crafted'); log('toast:', await txt(page, '#toast'), 'inv', JSON.stringify(await inv(page))); }
  else { await shot('raft-missing'); log('no raft: inv', JSON.stringify(await inv(page))); }
  await press('#panel-close', 'close craft');
  await sailTo(page, /Reef/i, 'reef');
  if ((await page.evaluate(() => window.__isles.isle)) !== 'reef') {
    log('SHORTCUT the reef was not reached by play; opening isles/index.html?isle=reef directly to look at it');
    await page.goto(G('games/isles/index.html?isle=reef')); await page.waitForFunction(() => window.__isles, null, { timeout: 20000 }).catch(() => {}); await wait(2500);
    log('reef via URL: now on', await page.evaluate(() => window.__isles.isle), '| hint:', await txt(page, '#hint'), '| toast:', await txt(page, '#toast'));
  }
  if ((await page.evaluate(() => window.__isles.isle)) === 'reef') { await shot('reef'); await tameNearest(page, 'reef-tame'); await gatherWalk(page, 15000); await shot('reef-later'); }
};

S.whereto = async (page) => { // hop with the shared Where-to menu: Town -> Realm -> Isles -> Bug Safari -> Angler -> Deepdelve -> Stalk -> map
  await townOffline(page); await shot('town');
  const hops = [['realm', 'Realm'], ['isles', 'Isles'], ['bugs', 'Bug Safari'], ['angler', 'Angler'], ['deepdelve', 'Deepdelve'], ['stalk', 'Stalk'], ['lantern', 'Lantern'], ['town', 'Town']];
  for (const [id, nm] of hops) {
    const from = page.url().replace(/^http:\/\/[^/]+/, '');
    // the Realm keeps its Where-to inside its own menu (the corner button is hidden there); find what a player would find
    let btn = page.locator('#where-to-btn:visible, #mm-nav-btn:visible').first();
    if (!(await btn.count())) {
      log('no visible Where-to/Menu corner button on', from);
      const rm = page.locator('#realm-menu-btn:visible').first();
      if (await rm.count()) { await press(rm, 'Realm menu'); await shot('realm-menu-looking-for-whereto'); log('realm menu text:', (await txt(page, '#realm-pause')).slice(0, 300)); const w = page.locator('#realm-pause button:visible', { hasText: /Where|Go to|World/i }).first(); if (await w.count()) { await press(w, 'Where to (in Realm menu)'); } }
    } else await press(btn, 'Where to / Menu');
    await wait(500);
    if (!(await page.isVisible('#mm-nav-sheet'))) { log('Where-to sheet did not open on', from); await shot('no-sheet'); continue; }
    await shot('sheet-on-' + from.split('/').slice(-2).join('-').replace(/\?.*/, ''));
    const t0 = Date.now();
    const d = page.locator('#mm-nav-sheet a.mm-nav-dest[data-place="' + id + '"]');
    await Promise.all([page.waitForLoadState('load').catch(() => {}), press(d, 'go ' + nm)]);
    await wait(2500);
    log('HOP', from, '->', page.url().replace(/^http:\/\/[^/]+/, ''), Math.round((Date.now() - t0) / 100) / 10 + 's');
    if (id === 'town') { if (await page.isVisible('#join-btn').catch(() => false)) { log('Town asks to join again after a hop'); await shot('town-join-again'); await press('#join-btn', 'Join'); await page.waitForSelector('#join-offline-btn:not(.hidden)', { timeout: 20000 }).catch(() => {}); await press('#join-offline-btn', 'Play offline'); await wait(2500); } }
    await shot('arrived-' + id);
  }
};
S.feedback = async (page) => { // the feedback box: Town settings -> "Suggest or report a bug" -> save a note; then check the Isles log has it too
  await townOffline(page);
  if (vp.phone) { const col = await page.evaluate(() => document.getElementById('player-list-panel').classList.contains('collapsed')).catch(() => false); if (col) await press('#panel-toggle', 'open the In town chip'); }
  await shot('town-panel');
  await press('#settings-toggle-btn', 'Settings'); await wait(400); await shot('settings-open');
  const head = page.locator('.mmfb-head').first();
  if (!(await head.count())) { log('no feedback box in Town settings'); return; }
  await head.scrollIntoViewIfNeeded().catch(() => {}); await press(head, 'Suggest or report a bug'); await wait(400); await shot('feedback-open');
  await press(page.locator('.mmfb-chip', { hasText: 'Suggestion' }).first(), 'chip Suggestion');
  const ta = page.locator('textarea.mmfb-text').first();
  await press(ta, 'textarea');
  const before = await page.evaluate(() => { const b = window.__g && window.__g.scene.getScene('Town').localBody; return b ? { x: Math.round(b.x), y: Math.round(b.y) } : null; });
  await page.keyboard.type('Playtest bot note: the Where-to menu is great. Please make the Nexus stall stay open after I buy. wasd e b 1 2', { delay: 25 });
  await wait(500); await shot('feedback-typed');
  const after = await page.evaluate(() => { const b = window.__g && window.__g.scene.getScene('Town').localBody; return b ? { x: Math.round(b.x), y: Math.round(b.y) } : null; });
  log('hero moved while typing?', JSON.stringify(before), JSON.stringify(after), '| emote/chat visible:', await page.isVisible('#chat-input:focus').catch(() => false));
  await press(page.locator('.mmfb-save').first(), 'Save note'); await wait(500); await shot('feedback-saved');
  log('feedback status:', await txt(page, '.mmfb-status'), '| list:', (await txt(page, '.mmfb-list')).slice(0, 200));
  log('stored entries:', await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('pixeltown-feedback-v1')).entries.length; } catch (e) { return 'n/a'; } }));
};

// the gold start-room arrow (#ffd45a) is found on the canvas pixels, like a player's eye; returns its centre relative to the hero
async function goldArrow(page) {
  return page.evaluate(() => {
    const cv = document.querySelector('#realm-canvas-wrap canvas'); const a = window.__mm && window.__mm.arena; if (!cv || !a) return null;
    let d; try { d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; } catch (e) { return null; }
    let sx = 0; let sy = 0; let n = 0;
    for (let y = 0; y < cv.height; y += 2) for (let x = 0; x < cv.width; x += 2) { const i = (y * cv.width + x) * 4; if (Math.abs(d[i] - 255) < 4 && Math.abs(d[i + 1] - 212) < 5 && Math.abs(d[i + 2] - 90) < 6) { sx += x; sy += y; n++; } }
    if (n < 6) return null;
    const px = (a.player.x - a.camera.x) / a.W * cv.width; const py = (a.player.y - a.camera.y) / a.H * cv.height;
    return { dx: sx / n - px, dy: sy / n - py, n };
  }).catch(() => null);
}
S.dungeon = async (page) => { // Realm -> Nexus -> Meadow portal -> follow the start-room arrow -> fight -> Leave -> back in the world
  await page.goto(G('games/mad-maze/index.html?mode=world')); await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.state === 'play', null, { timeout: 20000 }).catch(() => {});
  await wait(1500); if (!vp.phone) await page.mouse.click(640, 360);
  await shot('realm');
  const site = await page.evaluate(() => { const n = window.__mm.world.nexus; const s = typeof n.site === 'function' ? n.site() : n.site; return s && { x: s.x, y: s.y }; });
  for (let k = 0; k < 14 && !(await page.isVisible('#rw-nexus-go')); k++) await playRealm(page, 2500, { goal: site });
  if (!(await press('#rw-nexus-go', 'Visit the Nexus'))) { log('HOOK nexus.open()'); await page.evaluate(() => window.__mm.world.nexus.open()); }
  await wait(1000);
  const L = await page.evaluate(() => { const l = MMNexus.layout(); return l.portals.find((p) => p.id === 'meadow'); });
  for (let k = 0; k < 40; k++) {
    const h = await page.evaluate(() => window.__mm.world.nexus.walk.hero()); const dx = L.x - h.x; const dy = L.y + 20 - h.y; const l = Math.hypot(dx, dy);
    if (l < 40 || (await page.locator('#rw-nx-act:not(.hidden)', { hasText: /Meadow/ }).count())) break;
    const d = [dx / l, dy / l];
    if (vp.phone) { const c = await stick(page, '#realm-stick-move', 1, d); await wait(350); await unstick(page, 1, c); } else { const ks = []; if (d[1] < -0.3) ks.push('w'); if (d[1] > 0.3) ks.push('s'); if (d[0] < -0.3) ks.push('a'); if (d[0] > 0.3) ks.push('d'); for (const q of ks) await page.keyboard.down(q); await wait(300); for (const q of ks) await page.keyboard.up(q); }
  }
  await shot('nexus-portal');
  await Promise.all([page.waitForURL(/mode=dungeon/, { timeout: 15000 }).catch(() => {}), press('#rw-nx-act', 'enter Meadow')]);
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.state === 'play', null, { timeout: 20000 }).catch(() => {});
  await wait(1500); if (!vp.phone) await page.mouse.click(640, 200);
  await shot('dungeon-start');
  const room0 = await page.evaluate(() => window.__mm.dungeon && window.__mm.dungeon.state && (window.__mm.dungeon.room !== undefined ? window.__mm.dungeon.room : null)).catch(() => null);
  log('dungeon start room', room0, '| HUD', await txt(page, '#realm-info'));
  const t0 = Date.now(); let seen = 0; let lastDir = null;
  while (Date.now() - t0 < 25000) {
    if (!/Room 1\//.test(await txt(page, '#realm-info'))) break; // through the door
    let ar = await goldArrow(page);
    if (!ar && lastDir) ar = { dx: lastDir[0] * 100, dy: lastDir[1] * 100 }; // the hero stands on the arrow: keep going the same way
    if (!ar) { await wait(300); continue; }
    seen++; if (seen === 1) { log('gold arrow seen', JSON.stringify(ar)); await shot('arrow'); }
    const l = Math.hypot(ar.dx, ar.dy) || 1; const d = [ar.dx / l, ar.dy / l]; lastDir = d;
    if (vp.phone) { const c = await stick(page, '#realm-stick-move', 1, d); await wait(450); await unstick(page, 1, c); } else { const ks = []; if (d[1] < -0.3) ks.push('w'); if (d[1] > 0.3) ks.push('s'); if (d[0] < -0.3) ks.push('a'); if (d[0] > 0.3) ks.push('d'); for (const q of ks) await page.keyboard.down(q); await wait(400); for (const q of ks) await page.keyboard.up(q); }
  }
  log('followed the arrow for', Math.round((Date.now() - t0) / 1000) + 's; HUD', await txt(page, '#realm-info'));
  await shot('room-2');
  await playRealm(page, 40000, { shotEvery: 13000, tag: 'dungeon-fight' });
  log('after fight HUD', await txt(page, '#realm-info'));
  if (!vp.phone) { await page.keyboard.press('Tab'); await wait(500); await shot('dungeon-map-tab'); await page.keyboard.press('Tab'); }
  await press('#realm-leave-btn', 'Leave'); await wait(1500); await shot('leave-1');
  const home = page.locator('#mm-sum-home:visible'); if (await home.count()) { await shot('summary'); log('summary:', await txt(page, '#mm-sum')); await Promise.all([page.waitForURL((u) => !/mode=dungeon/.test(String(u)), { timeout: 15000 }).catch(() => {}), press(home, 'Back to the world')]); }
  await wait(3000); await shot('back-in-world');
  log('back at', page.url().replace(/^http:\/\/[^/]+/, ''), JSON.stringify(await realmState(page)));
};

async function main() {
  const ctx = await ctxOpen();
  for (const st of STAGES) {
    CUR = st; N = 0;
    const page = await ctx.newPage(); PAGE = page; watch(page);
    const t0 = Date.now();
    try { await S[st](page); } catch (e) { log('STAGE ERROR', e.message.split('\n')[0]); await shot('error'); }
    log('stage', st, 'took', Math.round((Date.now() - t0) / 1000) + 's');
    const v = page.video(); await page.close();
    if (v) { const src = await v.path().catch(() => null); if (src) { try { fs.renameSync(src, path.join(VIDS, vp.key + '-' + st + '.webm')); } catch (e) { /* */ } } }
  }
  await ctx.close();
  log('DB blocked http=' + STATS.http + ' ws=' + STATS.ws + ' socketsOpened=' + STATS.sockets.length + ' pageErrors=' + STATS.pageErrors.length + ' consoleErrors=' + STATS.consoleErrors.length + ' 4xx=' + STATS.missing.length);
  fs.appendFileSync(path.join(OUT, 'stats.jsonl'), JSON.stringify(Object.assign({ vp: vp.key, stages: STAGES, at: new Date().toISOString() }, STATS)) + '\n');
}
module.exports = { S, press, shot, playRealm, realmState, center, stick, unstick, wait, log, G };
if (require.main === module) main();
