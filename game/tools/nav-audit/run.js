// Navigation audit bot: walks every entry point of the game as a brand-new player on a phone (390x844, touch) and on desktop
// (1280x720), counts taps + seconds for the core journeys, surveys every page's controls (tap targets < 44 px, covered controls,
// where the Back / Home control sits and what it says) and saves screenshots. Research tool, not a test: it never fails.
//
//   python3 -m http.server 8951 &      # from the repo root
//   NODE_PATH=$(npm root -g) node game/tools/nav-audit/run.js
// Env: PORT=8951, OUT=<dir for the JSON log + raw screenshots> (default /tmp/nav-audit), ONLY=phone|desk, STEP=all|pages|town|hub|isles|realm|games;
//      the chosen screenshots were copied by hand to game/design/nav-audit/. THREE_JS=<local three.min.js> (Deepdelve's CDN copy served from it).
// SAFETY: every request AND every WebSocket to firebase / googleapis / gstatic / firebasedatabase hosts is blocked in every
// context (context.route + context.routeWebSocket, before any page loads). The Town is joined with "Play offline". Never chats.
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const PORT = Number(process.env.PORT || 8951);
const G = (p) => 'http://localhost:' + PORT + '/game/' + p;
const OUT = process.env.OUT || '/tmp/nav-audit';
const REPO = path.resolve(__dirname, '..', '..', '..');
const KEEP = path.join(REPO, 'game', 'design', 'nav-audit');
const THREE_LOCAL = process.env.THREE_JS || '/tmp/claude-0/three.min.js';
const BLOCK = /firebase|googleapis|gstatic|firebasedatabase|firebaseio|identitytoolkit|securetoken/i;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });
const R = { journeys: [], pages: [], notes: [], errors: [], blocked: { http: 0, ws: 0 }, missing: [] };
const note = (...a) => { const s = a.join(' '); R.notes.push(s); console.log('  NOTE', s); };

const VPS = {
  phone: { key: 'phone', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 },
  desk: { key: 'desk', viewport: { width: 1280, height: 720 }, hasTouch: false, isMobile: false, deviceScaleFactor: 1 },
};

async function newCtx(browser, vp) {
  const ctx = await browser.newContext({ viewport: vp.viewport, hasTouch: vp.hasTouch, isMobile: vp.isMobile, deviceScaleFactor: 1 });
  await ctx.route(BLOCK, (route) => { R.blocked.http++; return route.abort(); });
  await ctx.routeWebSocket(BLOCK, (ws) => { R.blocked.ws++; ws.close(); });
  if (fs.existsSync(THREE_LOCAL)) await ctx.route(/cdn\.jsdelivr\.net\/npm\/three@/, (r) => r.fulfill({ path: THREE_LOCAL, contentType: 'application/javascript' }));
  // expose the Phaser game read-only so the bot can stand at the Realm Gate without a long scripted walk
  await ctx.route('**/game/main.js*', async (route) => { const resp = await route.fetch(); const body = (await resp.text()).replace('const game = new Phaser.Game(config);', 'const game = window.__g = new Phaser.Game(config);'); route.fulfill({ response: resp, body }); });
  return ctx;
}
function watch(page, tag) {
  page.on('pageerror', (e) => R.errors.push(tag + ' pageerror ' + e.message.slice(0, 200)));
  page.on('response', (r) => { if (r.status() >= 400) R.missing.push(tag + ' ' + r.status() + ' ' + r.url()); });
  page.on('requestfailed', (r) => { if (!BLOCK.test(r.url())) R.missing.push(tag + ' FAILED ' + r.url()); });
}

// ---------- a journey = taps + seconds ----------
class Journey {
  constructor(vp, name, page) { this.vp = vp; this.name = name; this.page = page; this.taps = 0; this.t0 = Date.now(); this.log = []; this.phone = vp.key === 'phone'; }
  async tap(sel, label, opt = {}) {
    const loc = typeof sel === 'string' ? (opt.frame || this.page).locator(sel).first() : sel;
    await loc.waitFor({ state: 'visible', timeout: opt.timeout || 8000 });
    if (this.phone) await loc.tap({ timeout: 5000 }).catch(() => loc.click({ force: true }));
    else await loc.click({ timeout: 5000 }).catch(() => loc.click({ force: true }));
    this.taps++; this.log.push((label || sel) + ' @' + this.secs() + 's');
    await wait(opt.after == null ? 500 : opt.after);
  }
  key(k, label) { this.taps++; this.log.push('key ' + (label || k) + ' @' + this.secs() + 's'); return this.page.keyboard.press(k); }
  type(n, label) { this.taps += n; this.log.push(label + ' (+' + n + ')'); }
  secs() { return Math.round((Date.now() - this.t0) / 100) / 10; }
  end(verdict, extra) { const j = { vp: this.vp.key, name: this.name, taps: this.taps, secs: this.secs(), verdict, steps: this.log, extra: extra || '' }; R.journeys.push(j); console.log('JOURNEY', j.vp, j.name, j.taps, 'taps', j.secs, 's', verdict); return j; }
}

async function shot(page, name) {
  const f = path.join(OUT, name + '.png');
  await page.screenshot({ path: f }).catch((e) => note('shot failed', name, e.message));
  return f;
}

// ---------- page survey: every visible control, its size, whether something covers it, and the Back / Home control ----------
async function survey(page, tag, frame) {
  const target = frame || page;
  const s = await target.evaluate(() => {
    const out = { small: [], covered: [], back: [], title: document.title, url: location.pathname + location.search, n: 0, modals: [] };
    const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth; };
    const label = (el) => (el.getAttribute('aria-label') || el.textContent || el.title || el.id || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 40);
    document.querySelectorAll('a[href],button,[role=button],input,select,summary,[tabindex="0"]').forEach((el) => {
      if (!vis(el) || el.disabled) return;
      out.n++;
      const r = el.getBoundingClientRect();
      const lab = label(el);
      const item = { id: el.id || '', cls: (el.className && el.className.baseVal === undefined ? el.className : '').toString().slice(0, 30), lab, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
      if (r.width < 44 || r.height < 44) out.small.push(item);
      const cx = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)); const cy = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
      const top = document.elementFromPoint(cx, cy);
      if (top && top !== el && !el.contains(top) && !top.contains(el)) out.covered.push(Object.assign({ by: (top.id || top.className || top.tagName).toString().slice(0, 30) }, item));
      const t = (lab + ' ' + (el.getAttribute('href') || '')).toLowerCase();
      if (/back|hub|town|home|leave|exit|map|←|&larr;|✖|quit/.test(t)) out.back.push(item);
    });
    document.querySelectorAll('[role=dialog],dialog,.modal,.overlay,.sheet,.card').forEach((el) => { if (vis(el)) { const r = el.getBoundingClientRect(); if (r.width * r.height > innerWidth * innerHeight * 0.15) out.modals.push((el.id || el.className).toString().slice(0, 30)); } });
    out.scrollW = document.documentElement.scrollWidth; out.vw = innerWidth; out.scrollH = document.documentElement.scrollHeight; out.vh = innerHeight;
    return out;
  }).catch((e) => ({ error: e.message }));
  s.tag = tag; R.pages.push(s);
  console.log('SURVEY', tag, 'controls', s.n, 'small<44', (s.small || []).length, 'covered', (s.covered || []).length, 'back:', (s.back || []).map((b) => b.lab + '@' + b.x + ',' + b.y).join(' | '));
  return s;
}

// ---------- Town ----------
async function joinTown(page, j, opts = {}) {
  await page.goto(G('index.html'));
  await page.waitForSelector('#name-input', { timeout: 20000 });
  if (opts.shot) await shot(page, opts.shot + '-join');
  if (opts.survey) await survey(page, opts.survey + ' town-join');
  await page.fill('#name-input', 'ADMINnav'); j.type(1, 'type a name');
  await j.tap('.species-tab', 'species tab', { after: 200 });
  await j.tap('.avatar-choice', 'avatar', { after: 200 });
  await j.tap('#join-btn', 'Join Town', { after: 300 });
  const t1 = Date.now();
  let ok = await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 4000 }).then(() => true, () => false);
  if (!ok) {
    await page.waitForSelector('#join-offline-btn:not(.hidden)', { timeout: 15000 }).catch(() => {});
    j.log.push('waited ' + Math.round((Date.now() - t1) / 1000) + 's for "Play offline"');
    if (opts.shot) await shot(page, opts.shot + '-offline-offer');
    await j.tap('#join-offline-btn', 'Play offline', { after: 300 });
    ok = await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 15000 }).then(() => true, () => false);
  }
  await wait(1800);
  return ok;
}
async function closeTownPopups(page, j) {
  // first-visit tutorial / what's-new / welcome cards a new player has to dismiss before playing
  for (let i = 0; i < 6; i++) {
    const b = await page.$('#tutorial-overlay:not(.hidden) button, #whats-new-close-btn:visible, .welcome-card button:visible, #tutorial-skip-btn:visible, #tutorial-next-btn:visible');
    if (!b || !(await b.isVisible().catch(() => false))) break;
    const id = await b.evaluate((e) => e.id || e.textContent.trim().slice(0, 20));
    await (j.phone ? b.tap() : b.click()).catch(() => {}); j.taps++; j.log.push('dismiss ' + id); await wait(400);
  }
}
async function standAtGate(page) {
  await page.evaluate(() => { const s = window.__g.scene.getScene('Town'); s.localBody.setPosition(REALM_GATE_POS.x, REALM_GATE_POS.y + 30); });
  await wait(300);
}

async function townFlows(browser, vp) {
  const ctx = await newCtx(browser, vp); const page = await ctx.newPage(); watch(page, vp.key + '/town');
  const k = vp.key;
  // J1: first load -> in the Town (offline) -> Realm gate -> first fight in the Realm
  const j = new Journey(vp, 'J1 Town first load -> Realm first fight', page);
  const ok = await joinTown(page, j, { shot: k + '-01-town', survey: k });
  if (!ok) { j.end('BLOCKED: town did not load offline'); await ctx.close(); return; }
  await shot(page, k + '-02-town-arrived');
  await survey(page, k + ' town-hud');
  await closeTownPopups(page, j);
  await shot(page, k + '-03-town-after-popups');
  // walking to the gate: a new player has no pointer to it; we count the walk as a scripted teleport plus 1 interact
  const walk = await page.evaluate(() => { const b = window.__g.scene.getScene('Town').localBody; const d = Math.hypot(b.x - REALM_GATE_POS.x, b.y - REALM_GATE_POS.y); return { from: [Math.round(b.x), Math.round(b.y)], px: Math.round(d), secsAtWalk: Math.round(d / 140 * 10) / 10 }; });
  j.log.push('walk to Realm Gate (teleported; a new player must find it: no marker on screen) ' + JSON.stringify(walk));
  await standAtGate(page);
  if (j.phone) await j.tap('#interact-btn', 'A / interact at gate'); else { await j.key('e', 'E at gate'); await wait(600); }
  if (!(await page.isVisible('#realm-menu').catch(() => false))) { await page.evaluate(() => window.__g.scene.getScene('Town').interact()); await wait(500); note(k, 'gate needed interact() fallback'); }
  await shot(page, k + '-04-gate-menu'); await survey(page, k + ' town-gate-menu');
  await j.tap('#realm-menu-madmaze', 'Enter the Realm', { after: 500 });
  const embed = await page.waitForSelector('#realm-embed iframe', { timeout: 10000 }).then(() => true, () => false);
  let frame = page;
  if (embed) { await wait(2500); frame = page.frames().find((f) => /mode=world/.test(f.url())) || page; }
  else { await page.waitForLoadState('load'); await wait(2500); note(k, 'Enter the Realm navigated away instead of embedding:', page.url()); }
  await shot(page, k + '-05-realm-first-screen'); await survey(page, k + ' realm-embed-first', frame === page ? null : frame);
  const fightReady = await heroPickAndPlay(frame, j, page, k + '-06');
  j.end(fightReady ? 'OK but long' : 'unclear', 'embedded=' + embed);
  // J8: Realm (embedded) -> back to Town
  const j8 = new Journey(vp, 'J8 Realm (from Town) -> back to Town', page);
  if (j.phone) { await j8.tap('#realm-menu-btn', 'menu button', { frame, after: 600 }).catch(() => note(k, 'no #realm-menu-btn')); } else { await j8.key('Escape', 'Esc'); await wait(600); }
  await shot(page, k + '-07-realm-pause'); await survey(page, k + ' realm-pause', frame === page ? null : frame);
  const leave = frame.locator('#realm-pause button[data-m="leave"]');
  if (await leave.count()) await j8.tap(leave, 'Leave', { after: 1500 });
  const back = !(await page.$('#realm-embed iframe'));
  await shot(page, k + '-08-back-in-town');
  j8.end(back ? 'OK' : 'FAILED: still in the Realm');
  // J2a: Town -> World map (hub) -> Campfire Jam
  const j2 = new Journey(vp, 'J2 Town -> World map -> Campfire Jam first song', page);
  if (j2.phone) { const col = await page.evaluate(() => document.getElementById('player-list-panel').classList.contains('collapsed')); if (col) await j2.tap('#panel-toggle', 'open the "In town" chip (World map link hides in it)'); }
  await shot(page, k + '-09-town-panel-open');
  await j2.tap('#world-map-link', '🧭 World map', { after: 1500 });
  const hr = await hubToNode(page, j2, 'w5-jam', k);
  const jamLinked = await page.evaluate(() => { const n = MMMap.MAP.nodes.find((x) => x.id === 'w5-jam'); return !!n; });
  j2.end(hr.reachable ? 'reachable' : 'BLOCKED: Campfire Jam is locked on the world map for a new player (and its card has no Play link)', 'jamNode=' + jamLinked);
  await ctx.close();
}

async function heroPickAndPlay(frame, j, page, shotName) {
  // Realm: create-your-hero -> first enemy in reach
  const cls = frame.locator('#realm-hero button[data-newcls]:not([disabled])');
  if (await cls.count().catch(() => 0)) { await shot(page, shotName + '-hero-picker'); await survey(page, shotName + ' hero-picker', frame === page ? null : frame); await j.tap(cls.first(), 'pick a class', { frame, after: 1500 }); }
  // anything else between us and play: tutorial cards / ability sheet / name prompts
  for (let i = 0; i < 6; i++) {
    const b = frame.locator('#realm-hero:visible button:visible, .mm-tut:visible button:visible, #realm-tut:visible button:visible, .rt-card:visible button:visible').first();
    if (!(await b.count().catch(() => 0))) break;
    const lab = await b.textContent().catch(() => '?');
    await j.tap(b, 'dismiss: ' + (lab || '').trim().slice(0, 24), { frame, after: 700 });
  }
  const st = await frame.evaluate(() => { const a = window.__mm && window.__mm.arena; return a ? { state: a.state, en: (a.enemies || []).length } : null; }).catch(() => null);
  j.log.push('arena state ' + JSON.stringify(st));
  await shot(page, shotName + '-realm-playing');
  return !!(st && st.state === 'play');
}

// ---------- Hub ----------
async function hubToNode(page, j, nodeId, k, opts = {}) {
  await page.waitForSelector('#map', { timeout: 10000 });
  await wait(800);
  if (!opts.noShot) { await shot(page, k + '-10-hub-first'); await survey(page, k + ' hub'); }
  // find the path the walker would take: tap the node on the canvas (each tap = 1); the hub only lets you tap nodes you can reach
  const route = await page.evaluate((id) => {
    const H = window.__hub || null;
    const map = MMMap.MAP; const st = JSON.parse(localStorage.getItem('pixeltown-hub-v1') || 'null');
    const s = MMMap.sanitizeState(st); const open = MMMap.openPathIds(map, s);
    const at = (st && st.at) || map.start;
    return { at, path: MMMap.bfs(map, at, id, open), node: map.nodes.find((n) => n.id === id) };
  }, nodeId).catch((e) => ({ err: e.message }));
  j.log.push('hub route ' + JSON.stringify(route.path || route.err || null));
  if (!route.path) { await shot(page, k + '-hub-locked-' + nodeId); return { reachable: false, route }; }
  // tap the target node on the canvas
  const pos = await page.evaluate((n) => {
    const c = document.getElementById('map'); const r = c.getBoundingClientRect();
    return { r: { x: r.left, y: r.top, w: r.width, h: r.height }, cw: c.width, ch: c.height };
  }, route.node);
  return { reachable: true, route, pos };
}

// ---------- generic page visit ----------
async function visit(browser, vp, rel, name, fn) {
  const ctx = await newCtx(browser, vp); const page = await ctx.newPage(); watch(page, vp.key + '/' + name);
  const t0 = Date.now();
  await page.goto(G(rel)).catch((e) => note(name, 'goto failed', e.message));
  await wait(2200);
  await shot(page, vp.key + '-p-' + name);
  const s = await survey(page, vp.key + ' ' + name);
  if (fn) await fn(page, s).catch((e) => note(vp.key, name, 'flow error', e.message.split('\n')[0]));
  await ctx.close();
  return Date.now() - t0;
}

const PAGES = [
  ['hub/index.html', 'hub'],
  ['games/mad-maze/index.html?mode=world', 'realm'],
  ['games/mad-maze/index.html', 'madmaze-plain'],
  ['games/mad-maze/lantern.html', 'lantern'],
  ['games/deepdelve/index.html', 'deepdelve'],
  ['games/angler/index.html', 'angler'],
  ['games/festival/bugs.html', 'bugs'],
  ['games/jam/index.html', 'jam'],
  ['games/stalk/index.html', 'stalk'],
  ['games/isles/index.html', 'isles'],
  ['games/isles/index.html?isle=reef', 'isles-reef'],
  ['games/isles/index.html?isle=tundra', 'isles-tundra'],
  ['games/isles/index.html?isle=mars', 'isles-mars'],
  ['games/isles/index.html?isle=meadow', 'isles-meadow'],
  ['games/arcane-frontier/index.html', 'arcane'],
];

// ---------- the Hub as a brand-new player ----------
async function hubTapNode(page, j, id, label) {
  const c = await page.evaluate((n) => window.__hub.nodeClient(n), id);
  if (j.phone) await page.touchscreen.tap(c.x, c.y); else await page.mouse.click(c.x, c.y);
  j.taps++; j.log.push('tap node ' + (label || id) + ' @' + j.secs() + 's');
  await page.waitForFunction(() => !window.__hub.walking, null, { timeout: 15000 }).catch(() => {});
  await wait(500);
}
async function hubFlows(browser, vp) {
  const k = vp.key;
  const ctx = await newCtx(browser, vp); const page = await ctx.newPage(); watch(page, k + '/hub');
  const j = new Journey(vp, 'J3 Hub -> Isles (first screen) -> first tame', page);
  await page.goto(G('hub/index.html')); await page.waitForFunction(() => window.__hub, null, { timeout: 10000 }); await wait(800);
  const reach = await page.evaluate(() => MMMap.MAP.nodes.filter((n) => window.__hub.isReachable(n.id)).map((n) => n.id));
  note(k, 'hub reachable for a new player:', reach.join(','));
  // the obvious first move: the big "Open" button (opens the card of the node you stand on)
  await j.tap('#open-btn', 'Open (where you stand)');
  await shot(page, k + '-11-hub-open-square'); await survey(page, k + ' hub-card-square');
  await j.tap('#card-close', 'close card');
  // "First Steps" is the only path that leads on in World 0: it is a "Coming soon" card
  await hubTapNode(page, j, 'w0-first', 'First Steps');
  await shot(page, k + '-12-hub-first-steps-soon');
  const soon = await page.isVisible('#card-soon');
  note(k, 'w0-first card shows Coming soon =', soon);
  await j.tap('#card-close', 'close card');
  // a locked node: toast
  const lockTap = await page.evaluate(() => window.__hub.nodeClient('w0-sparkle'));
  if (j.phone) await page.touchscreen.tap(lockTap.x, lockTap.y); else await page.mouse.click(lockTap.x, lockTap.y);
  await wait(250); await shot(page, k + '-13-hub-locked-toast');
  const toastTxt = await page.textContent('#toast');
  note(k, 'locked node toast:', toastTxt);
  // Isles lives in World 7, reached through Hearthvale (world 1): walk the gate then the boat
  await hubTapNode(page, j, 'w0-hearthvale', 'Hearthvale Gate');
  await j.tap('#card-close', 'close gate card');
  // on screen there is no Isles node: World 7 is reached by tapping unlabeled paths that run off the right edge (W0 -> W1 -> W7)
  for (let hop = 0; hop < 3; hop++) {
    const w = await page.evaluate(() => window.__hub.world);
    if (w === 'w7') break;
    const ref = w === 'w0' ? ['w0-first', 'w0-hearthvale', 'w0-hearthvale'] : ['w1-weed', 'w1-turnip', 'w1-hearthvale'];
    const stub = await page.evaluate((q) => { const a = window.__hub.nodeClient(q[0]), b = window.__hub.nodeClient(q[1]), h = window.__hub.nodeClient(q[2]); const t = Math.abs(b.x - a.x) / (q[0] === 'w0-first' ? 12 : 8); const r = document.getElementById('map').getBoundingClientRect(); return { x: r.right - 1.5 * t, y: h.y, t }; }, ref);
    if (j.phone) await page.touchscreen.tap(stub.x, stub.y); else await page.mouse.click(stub.x, stub.y);
    j.taps++; j.log.push('tap the unlabeled right-edge path of ' + w + ' @' + j.secs() + 's');
    await page.waitForFunction(() => !window.__hub.walking, null, { timeout: 20000 }).catch(() => {}); await wait(600);
    if (hop === 0) await shot(page, k + '-14-hub-world-hop');
    if ((await page.evaluate(() => window.__hub.world)) !== 'w7' && (await page.isVisible('#card'))) await j.tap('#card-close', 'close the card that pops on arrival');
  }
  await shot(page, k + '-15-hub-isles-card');
  const t0 = Date.now();
  await j.tap('#card-play', 'Play', { after: 0 });
  await page.waitForURL(/isles/, { timeout: 10000, waitUntil: 'commit' }).catch(() => {});
  await wait(2500);
  j.log.push('isles loaded in ' + Math.round((Date.now() - t0) / 100) / 10 + 's');
  await shot(page, k + '-16-isles-first');
  const hint = await page.textContent('#hint').catch(() => '');
  j.log.push('isles first hint: ' + (hint || '(none)'));
  j.end('first screen reached; taming needs: find a creature, Soothe, shoot, Feed (see isle flow)', 'reachable=' + reach.length + '/' + (await page.evaluate(() => 40)));
  // J9 isles back -> hub (the left arrow)
  const j9 = new Journey(vp, 'J9 Isles -> back (arrow) -> where am I?', page);
  await j9.tap('#back', 'top-left arrow', { after: 1500 });
  j9.end(/hub/.test(page.url()) ? 'lands on the Hub, not the Town' : 'lands on ' + page.url());
  await ctx.close();
}

// ---------- Isles: first tame, home -> reef, craft panel ----------
async function islesFlows(browser, vp) {
  const k = vp.key;
  const ctx = await newCtx(browser, vp); const page = await ctx.newPage(); watch(page, k + '/isles');
  await page.goto(G('games/isles/index.html?test=1')); await page.waitForFunction(() => window.__isles, null, { timeout: 15000 }); await wait(1500);
  if (!(await page.evaluate(() => window.__isles.creatures().length))) { const sp = await page.evaluate(() => { const I = window.__isles, h = I.hero(); for (const s of I.packSpecies) { const id = I.spawn(s, h.tx + 4, h.ty); if (id != null) return s; } return null; }); note(vp.key, 'isles: no creature in view at start; spawned one for the tame walk:', sp); await wait(400); }
  const j = new Journey(vp, 'J4 Isles first load -> first tame', page);
  // a player has to find a creature: we put the hero next to the nearest small one (counts as walking, not taps)
  const cr = await page.evaluate(() => { const h = window.__isles.hero(); const all = window.__isles.creatures(); const c = all.filter((x) => x.kind !== 'boss' && !x.ko).sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0]; return c ? { uid: c.uid, sp: c.sp, n: all.length, hostile: c.hostile, d: Math.round(Math.hypot(c.x - h.x, c.y - h.y) / 32) } : { n: all.length }; });
  j.log.push('nearest creature ' + JSON.stringify(cr));
  if (cr && cr.uid != null) {
    await page.evaluate((id) => window.__isles.nextTo(id, 70), cr.uid); await wait(600);
    await shot(page, k + '-17-isles-near-creature');
    j.log.push('hint near creature: ' + (await page.evaluate(() => window.__isles.hint())));
    if (await page.isVisible('#btn-soothe')) await j.tap('#btn-soothe', 'Soothe on');
    // fire soothe shots until knocked out (each Fire is one tap on phone, a click on desktop)
    for (let i = 0; i < 30; i++) {
      const c = await page.evaluate((id) => window.__isles.creatures().find((x) => x.uid === id) || null, cr.uid);
      if (!c || c.ko || c.calm) break;
      await page.evaluate((q) => { const h = window.__isles.hero(); window.__isles.face(q.x - h.x, q.y - h.y); window.__isles.fire(q.x - h.x, q.y - h.y); }, c);
      j.taps++; await wait(350);
    }
    j.log.push('after soothe: ' + (await page.evaluate(() => window.__isles.hint())));
    await page.evaluate((id) => window.__isles.nextTo(id, 30), cr.uid); await wait(300);
    await shot(page, k + '-18-isles-feed-prompt');
    for (let i = 0; i < 14; i++) {
      if (!(await page.isVisible('#btn-feed'))) break;
      await j.tap('#btn-feed', 'Feed', { after: i < 4 ? 400 : 1600 }); // a player mashes first; later we wait like the hint implies
      if (i === 3) j.log.push('hint after mashing: ' + (await page.evaluate(() => window.__isles.hint())) + ' | toast: ' + (await page.textContent('#toast')));
      const t = await page.evaluate(() => window.__isles.stats().tamed);
      if (t > 0) break;
    }
    const tamed = await page.evaluate(() => window.__isles.stats().tamed);
    await shot(page, k + '-19-isles-after-feed');
    j.end(tamed ? 'OK (tamed)' : 'not tamed (feed needs food / more steps)', 'hint=' + (await page.evaluate(() => window.__isles.hint())));
  } else j.end('no creature near');
  // J5: home -> reef. The Home button sends you to the home dock; the sea chart opens at a dock only.
  const j5 = new Journey(vp, 'J5 Isles home dock -> Reef', page);
  if (await page.isVisible('#btn-home')) await j5.tap('#btn-home', 'Home (fast travel home dock)', { after: 2500 });
  await page.waitForFunction(() => window.__isles, null, { timeout: 15000 }).catch(() => {});
  j5.log.push('now on ' + (await page.evaluate(() => window.__isles.isle)) + ' nearDock=' + (await page.evaluate(() => window.__isles.nearDock())));
  if (!(await page.evaluate(() => window.__isles.nearDock()))) { const d = await page.evaluate(() => window.__isles.dock()); if (d) await page.evaluate((q) => window.__isles.teleport(q.x, q.y + 1), d); j5.log.push('walked to the dock (teleport)'); await wait(500); }
  await shot(page, k + '-20-isles-at-dock');
  if (await page.isVisible('#btn-sail')) await j5.tap('#btn-sail', 'Sail'); else { j5.log.push('no Sail button visible at the dock'); await page.evaluate(() => window.__isles.openPanel('sail')); }
  await shot(page, k + '-21-isles-sea-chart'); await survey(page, k + ' isles-sea-chart');
  const reefBtn = page.locator('#panel-body button', { hasText: /reef/i }).first();
  if (await reefBtn.count()) await j5.tap(reefBtn, 'Reef', { after: 1500 });
  await shot(page, k + '-22-isles-reef-try');
  const toast = await page.textContent('#toast').catch(() => '');
  const isle = await page.evaluate(() => window.__isles && window.__isles.isle).catch(() => '?');
  j5.end(/reef/i.test(isle) ? 'OK' : 'BLOCKED: ' + toast.trim(), 'isle=' + isle);
  // craft panel
  await page.evaluate(() => window.__isles.closePanel && window.__isles.closePanel()).catch(() => {});
  if (await page.isVisible('#btn-craft')) { await page.click('#btn-craft').catch(() => {}); await wait(500); await shot(page, k + '-23-isles-craft'); await survey(page, k + ' isles-craft'); }
  await ctx.close();
}

// ---------- the Realm directly (?mode=world&test=1): hero picker, panels, Nexus, portal -> dungeon -> back ----------
async function realmFlows(browser, vp) {
  const k = vp.key;
  const ctx = await newCtx(browser, vp); const page = await ctx.newPage(); watch(page, k + '/realm');
  await page.goto(G('games/mad-maze/index.html?mode=world&test=1&seed=4242'));
  await page.waitForFunction(() => window.__mm && window.__mm.arena, null, { timeout: 20000 }); await wait(2000);
  const j = new Journey(vp, 'J6 Realm first load -> first fight', page);
  await heroPickAndPlay(page, j, page, k + '-30');
  const st = await page.evaluate(() => ({ state: window.__mm.arena.state, en: window.__mm.world.liveCount && window.__mm.world.liveCount() }));
  j.end(st.state === 'play' ? 'OK' : 'state ' + st.state, JSON.stringify(st));
  // panels: backpack, board, settings gear(s), menu
  for (const [sel, name] of [['#realm-bp-btn', 'backpack'], ['#realm-board-btn', 'board'], ['#realm-menu-btn', 'menu']]) {
    if (!(await page.isVisible(sel))) { note(k, 'realm control not visible', sel); continue; }
    await page.locator(sel).click().catch(() => {}); await wait(700);
    await shot(page, k + '-31-realm-' + name); const s = await survey(page, k + ' realm-' + name);
    note(k, 'realm', name, 'large overlays open:', (s.modals || []).join(','));
    await page.keyboard.press('Escape'); await wait(400);
    const still = await page.evaluate(() => [...document.querySelectorAll('[role=dialog]')].filter((d) => d.offsetParent && !d.classList.contains('hidden')).map((d) => d.id));
    if (still.length) { note(k, 'after Esc still open:', still.join(',')); const x = page.locator('[role=dialog]:visible button[aria-label="Close"]').first(); if (await x.count()) await x.click().catch(() => {}); await wait(300); }
  }
  // Nexus
  const jn = new Journey(vp, 'J7 Realm spawn -> Nexus -> dungeon portal -> back to the world', page);
  const nx = await page.evaluate(() => { const w = window.__mm.world, a = window.__mm.arena; const s = w.nexus && w.nexus.site; if (!s) return null; a.player.x = s.x - 20; a.player.y = s.y; return { x: s.x, y: s.y }; });
  jn.log.push('walk to the Nexus portal (teleport) ' + JSON.stringify(nx)); await wait(900);
  await shot(page, k + '-32-realm-nexus-prompt');
  if (await page.isVisible('#rw-nexus-go')) await jn.tap('#rw-nexus-go', 'Visit the Nexus'); else await page.evaluate(() => window.__mm.world.nexus.open());
  await wait(800); await shot(page, k + '-33-nexus'); await survey(page, k + ' nexus');
  const portalBtns = await page.$$eval('#rw-nexus button', (bs) => bs.map((b) => b.textContent.trim()).filter(Boolean));
  note(k, 'nexus buttons:', portalBtns.join(' | '));
  const back = page.locator('#rw-nexus button', { hasText: /back|leave|realm|close/i }).first();
  if (await back.count()) await jn.tap(back, 'leave the Nexus'); else await page.keyboard.press('Escape');
  // portal
  const portal = await page.evaluate(() => { const w = window.__mm.world, p = window.__mm.arena.player; const ps = w.portals ? w.portals() : []; const q = ps.slice().sort((x, y) => Math.hypot(x.x - p.x, x.y - p.y) - Math.hypot(y.x - p.x, y.y - p.y))[0]; if (q) { p.x = q.x + 10; p.y = q.y; } return q || null; });
  jn.log.push('walk to the nearest dungeon portal (teleport) ' + JSON.stringify(portal && { x: portal.x, y: portal.y }));
  await wait(900); await shot(page, k + '-34-realm-portal-prompt');
  if (await page.isVisible('#rw-portal')) {
    await Promise.all([page.waitForURL(/mode=dungeon/, { timeout: 12000 }).catch(() => {}), jn.tap('#rw-portal', 'Enter dungeon', { after: 0 })]);
    await page.waitForFunction(() => window.__mm && window.__mm.dungeon, null, { timeout: 20000 }).catch(() => {}); await wait(1500);
    await shot(page, k + '-35-dungeon'); await survey(page, k + ' dungeon');
    // the obvious way out mid-run: the top-right Leave
    const leaveLab = await page.evaluate(() => { const b = document.getElementById('realm-leave-btn'); return b ? (b.getAttribute('aria-label') || b.textContent) : null; });
    note(k, 'dungeon leave button label:', leaveLab);
    await page.evaluate(() => window.__mm.dungeon.finish());
    await page.waitForSelector('#mm-sum-home', { timeout: 8000 }).catch(() => {}); await wait(500);
    await shot(page, k + '-36-dungeon-summary');
    await Promise.all([page.waitForURL((u) => !/mode=dungeon/.test(String(u)), { timeout: 12000 }).catch(() => {}), jn.tap('#mm-sum-home', 'Back to the world', { after: 0 })]);
    await wait(2500);
    jn.end(/mode=world/.test(page.url()) ? 'OK (returns to the same spot)' : 'lands on ' + page.url());
  } else jn.end('no portal prompt');
  // the Leave button in the standalone Realm: where does it go?
  const jl = new Journey(vp, 'J10 Realm (opened from the Hub/URL) -> Leave', page);
  await page.waitForSelector('#realm-leave-btn', { timeout: 15000 }).catch(() => {});
  await jl.tap('#realm-leave-btn', 'Leave', { after: 1500 }).catch(() => {});
  await shot(page, k + '-37-realm-leave');
  jl.end('lands on ' + page.url().replace(/^http:\/\/[^/]+/, ''));
  await ctx.close();
}

// ---------- every minigame: taps from first load to the first fun action, then the way back ----------
const GAMES = [
  { name: 'jam', url: 'games/jam/index.html?from=hub', steps: [['button:has-text("Got it")', 'Got it'], ['button:has-text("Easy")', 'Easy (Warm Embers)']], fun: async (p) => p.evaluate(() => window.__jam && JSON.stringify(Object.keys(window.__jam))) },
  { name: 'bugs', url: 'games/festival/bugs.html?from=hub', steps: [['text=Meadow', 'Meadow arena']] },
  { name: 'stalk', url: 'games/stalk/index.html?from=hub', steps: [['button:has-text("Buy 1")', 'Buy 1']] },
  { name: 'angler', url: 'games/angler/index.html?from=hub', steps: [['canvas', 'tap the water to cast']] },
  { name: 'deepdelve', url: 'games/deepdelve/index.html?from=hub', steps: [['canvas', 'tap the view']] },
  { name: 'lantern', url: 'games/mad-maze/lantern.html?from=hub', steps: [['button:has-text("Create")', 'Create hero (refused: name is required)'], ['@fill input[placeholder="Hero name"]', 'type a hero name'], ['button:has-text("Create hero")', 'Create hero'], ['#start', 'Start run']] },
];
async function gameFlows(browser, vp) {
  const k = vp.key;
  for (const g of GAMES) {
    const ctx = await newCtx(browser, vp); const page = await ctx.newPage(); watch(page, k + '/' + g.name);
    const j = new Journey(vp, 'G ' + g.name + ' first load -> first fun action', page);
    await page.goto(G(g.url)); await wait(1800);
    for (const [sel, lab] of g.steps) {
      if (sel.startsWith('@fill ')) { const f = page.locator(sel.slice(6)).first(); if (await f.count()) { await f.fill('Nav'); j.type(1, lab); } continue; }
      const loc = page.locator(sel).first();
      if (!(await loc.count())) { j.log.push('MISSING ' + lab); continue; }
      if (!(await loc.isVisible())) { await loc.scrollIntoViewIfNeeded().catch(() => {}); j.log.push('had to scroll for ' + lab); j.taps++; }
      await j.tap(loc, lab, { after: 1200 }).catch((e) => j.log.push('tap failed ' + lab + ': ' + e.message.split('\n')[0]));
    }
    await shot(page, k + '-40-' + g.name + '-playing'); await survey(page, k + ' ' + g.name + '-playing');
    j.end('see steps', page.url().replace(/^http:\/\/[^/]+/, ''));
    // the way back mid-play: what is visible right now?
    const backs = await page.evaluate(() => [...document.querySelectorAll('a[href]')].filter((a) => { const r = a.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return r.width > 0 && top && (top === a || a.contains(top)); }).map((a) => a.textContent.trim() + ' -> ' + a.getAttribute('href')));
    note(k, g.name, 'visible+tappable back links mid-play:', backs.join(' | ') || 'NONE');
    await ctx.close();
  }
}

module.exports = { newCtx, watch, Journey, shot, survey, joinTown, closeTownPopups, standAtGate, heroPickAndPlay, visit, PAGES, VPS, R, G, OUT, KEEP, wait, note, townFlows };

async function main() {
  const browser = await chromium.launch();
  const only = process.env.ONLY;
  const step = process.env.STEP || 'all';
  for (const vp of Object.values(VPS)) {
    if (only && only !== vp.key) continue;
    if (step === 'all' || step === 'pages') for (const [rel, name] of PAGES) await visit(browser, vp, rel, name);
    if (step === 'all' || step === 'town') await townFlows(browser, vp).catch((e) => note(vp.key, 'town flow error', e.message.split('\n')[0]));
    if (step === 'all' || step === 'hub') await hubFlows(browser, vp).catch((e) => note(vp.key, 'hub flow error', e.message.split('\n')[0]));
    if (step === 'all' || step === 'isles') await islesFlows(browser, vp).catch((e) => note(vp.key, 'isles flow error', e.message.split('\n')[0]));
    if (step === 'all' || step === 'realm') await realmFlows(browser, vp).catch((e) => note(vp.key, 'realm flow error', e.message.split('\n')[0]));
    if (step === 'all' || step === 'games') await gameFlows(browser, vp).catch((e) => note(vp.key, 'game flow error', e.message.split('\n')[0]));
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'nav-audit-' + step + (only ? '-' + only : '') + '.json'), JSON.stringify(R, null, 1));
  console.log('blocked DB http', R.blocked.http, 'ws', R.blocked.ws, '| 4xx/failed', R.missing.length, '| page errors', R.errors.length);
}
if (require.main === module) main();
