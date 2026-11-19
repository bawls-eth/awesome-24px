// Site-wide QA sweep: crawls every page, checks links/console/off-origin/title/viewport/phone scroll, plays each main loop,
// and walks the hub -> Hearthvale -> Back pill -> hub round trip.
// Run: NODE_PATH=$(npm root -g) node game/tests/site-links.test.js   (starts its own `python3 -m http.server 8458` from the repo
// root unless BASE is set). SHOTS=<dir> writes desktop+phone screenshots. The town joins as an ADMIN* bot: presence only, never chats.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const REPO = path.resolve(__dirname, '..', '..');
const THREE = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
const THREE_LOCAL = process.env.THREE_JS || '/tmp/claude-0/three.min.js';
const SHOTS = process.env.SHOTS;
let server = null, BASE = process.env.BASE;

async function startServer() {
  if (BASE) return;
  server = spawn('python3', ['-m', 'http.server', '8458'], { cwd: REPO, stdio: 'ignore' });
  BASE = 'http://localhost:8458/game/index.html';
  for (let i = 0; i < 40; i++) { try { const r = await fetch(BASE); if (r.ok) return; } catch (e) { /* not up yet */ } await new Promise((r) => setTimeout(r, 100)); }
}
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const desk = { viewport: { width: 1100, height: 760 } };
const GAME = (p) => new URL(BASE).origin + '/game/' + p;

async function open(browser, url, opts, join) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const rec = { errors: [], reqs: [], bad: [], ctx, page };
  page.on('pageerror', (e) => rec.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') rec.errors.push('console: ' + m.text()); });
  page.on('request', (r) => rec.reqs.push(r.url()));
  page.on('response', (r) => { if (r.status() >= 400) rec.bad.push(r.status() + ' ' + r.url()); });
  if (fs.existsSync(THREE_LOCAL)) await page.route(THREE, (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(THREE_LOCAL) }));
  await page.goto(url);
  if (join) {
    await page.fill('#name-input', 'ADMINsweep');
    await page.click('.species-tab'); await page.waitForTimeout(150);
    await page.click('.avatar-choice');
    await page.click('#join-btn');
    await page.waitForSelector('#player-list-panel', { timeout: 20000 });
  }
  return rec;
}

const TOWN_EXT = [/^https:\/\/cdn\.jsdelivr\.net\/npm\/(phaser|three)@/, /^https:\/\/www\.gstatic\.com\/firebasejs\//, /^https:\/\/animalcrossing-15728-default-rtdb\.firebaseio\.com/, /^wss?:\/\/.*firebaseio\.com/];
const pages = () => [
  { name: 'town', url: GAME('index.html'), join: true, ext: TOWN_EXT },
  { name: 'hub', url: GAME('hub/index.html') },
  { name: 'mad-maze solo', url: GAME('games/mad-maze/index.html') },
  { name: 'mad-maze dungeon', url: GAME('games/mad-maze/index.html?mode=dungeon&seed=1') },
  { name: 'lantern', url: GAME('games/mad-maze/lantern.html') },
  { name: 'angler', url: GAME('games/angler/index.html') },
  { name: 'bugs', url: GAME('games/festival/bugs.html') },
  { name: 'deepdelve', url: GAME('games/deepdelve/index.html'), ext: [/^https:\/\/cdn\.jsdelivr\.net\/npm\/three@0\.160\.0\//] },
];

const links = (page) => page.evaluate(() => {
  const out = new Set();
  document.querySelectorAll('a[href]').forEach((a) => out.add(a.href));
  document.querySelectorAll('[data-href]').forEach((e) => out.add(new URL(e.dataset.href, location.href).href));
  document.querySelectorAll('link[href],script[src],img[src]').forEach((e) => out.add(e.href || e.src));
  return [...out];
});

(async () => {
  await startServer();
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const origin = new URL(BASE).origin;
  const seen = new Map();
  const status = async (ctx, u) => { const k = u.split('#')[0]; if (!seen.has(k)) seen.set(k, (await ctx.request.get(k)).status()); return seen.get(k); };

  // ===== (1) crawl =====
  for (const pg of pages()) {
    const slug = pg.name.replace(/\W+/g, '-');
    const d = await open(browser, pg.url, desk, pg.join);
    await d.page.waitForTimeout(pg.join ? 1200 : 700);
    const title = await d.page.title();
    check(`${pg.name}: has a <title>`, !!title.trim(), title);
    check(`${pg.name}: has a viewport meta`, await d.page.evaluate(() => !!document.querySelector('meta[name=viewport]')));
    check(`${pg.name}: zero console/page errors`, d.errors.length === 0, d.errors.join(' | '));
    check(`${pg.name}: no 4xx/5xx responses`, d.bad.length === 0, d.bad.join(' | '));
    const ext = pg.ext || [];
    const off = d.reqs.filter((u) => !u.startsWith(origin + '/') && !u.startsWith('data:') && !u.startsWith('blob:') && !ext.some((re) => re.test(u)));
    check(`${pg.name}: no unexpected off-origin requests`, off.length === 0, off.join(' '));
    const ls = (await links(d.page)).filter((u) => u.startsWith(origin + '/'));
    const bad = [];
    for (const u of ls) { const s = await status(d.ctx, u); if (s !== 200) bad.push(s + ' ' + u); }
    check(`${pg.name}: all ${ls.length} internal links/resources return 200`, bad.length === 0, bad.join(' | '));
    if (SHOTS) await d.page.screenshot({ path: `${SHOTS}/${slug}-desktop.png` });
    await d.ctx.close();

    const p = await open(browser, pg.url, phone, pg.join);
    await p.page.waitForTimeout(pg.join ? 1200 : 700);
    const m = await p.page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bw: document.body.scrollWidth }));
    check(`${pg.name}: 390x844 no horizontal scroll`, m.sw <= m.cw && m.bw <= m.cw, JSON.stringify(m));
    check(`${pg.name}: phone zero console/page errors`, p.errors.length === 0, p.errors.join(' | '));
    if (SHOTS) await p.page.screenshot({ path: `${SHOTS}/${slug}-phone.png` });
    await p.ctx.close();
  }

  // hub node hrefs, read from the LINKS block of hub.js
  {
    const ctx = await browser.newContext();
    const src = await (await ctx.request.get(GAME('hub/hub.js'))).text();
    const block = (src.match(/const FROM_HUB = [\s\S]*?\}\);/) || [''])[0];
    const targets = [...new Set([...block.matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((h) => /^\.\.?\//.test(h)))];
    const bad = [];
    for (const h of targets) { const u = new URL(h, GAME('hub/index.html')).href; const s = await status(ctx, u); if (s !== 200) bad.push(s + ' ' + u); }
    check(`hub: ${targets.length} node hrefs from LINKS return 200`, targets.length >= 5 && bad.length === 0, bad.join(' | '));
    check('hub: the Deepdelve node links to the real Deepdelve page (was "Coming soon")', targets.includes('../games/deepdelve/index.html'), targets.join(' '));
    await ctx.close();
  }
  // every game page offers a way back to the hub (the Lantern had none)
  for (const [n, u] of [['lantern', 'games/mad-maze/lantern.html'], ['angler', 'games/angler/index.html'], ['bugs', 'games/festival/bugs.html'], ['deepdelve', 'games/deepdelve/index.html']]) {
    const d = await open(browser, GAME(u), desk);
    const hrefs = await d.page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => new URL(a.href).pathname));
    check(`${n}: has a link back to the hub`, hrefs.includes('/game/hub/index.html'), hrefs.join(' '));
    await d.ctx.close();
  }

  // ===== (2) play loops =====
  {
    const d = await open(browser, GAME('games/angler/index.html?test=1&seed=qa'), desk);
    await d.page.waitForFunction(() => window.__angler);
    const r = await d.page.evaluate(() => { const a = window.__angler; const s0 = a.state; a.tap(); const s1 = a.state; a.advance(a.bite.wait + 0.2); const s2 = a.state; a.tap(); return [s0, s1, s2, a.state]; });
    check('angler: cast -> waiting -> biting -> reeling', r.join('>') === 'idle>waiting>biting>reeling', r.join('>'));
    await d.page.evaluate(() => { const a = window.__angler; for (let i = 0; i < 4000 && a.state === 'reeling'; i++) { a.setHold(a.reel.tension < a.reel.pos); a.advance(1 / 30); } a.setHold(false); });
    check('angler: result panel appears after the fight', await d.page.isVisible('#result'));
    check('angler: no errors while playing', d.errors.length === 0, d.errors.join('|'));
    await d.ctx.close();
  }
  {
    const d = await open(browser, GAME('games/festival/bugs.html?test=1'), desk);
    await d.page.waitForFunction(() => window.__bugs);
    const r = await d.page.evaluate(() => { const b = window.__bugs; b.start('meadow', { seed: 'qa', empty: true }); b.spawn('ladybug', 10, 7); b.setPlayer(10, 7.5, true); const n = b.swing().caught.length; b.step(90); return [n, b.run.score, b.mode]; });
    check('bugs: net swing catches a bug, run ends at summary', r[0] === 1 && r[1] >= 10 && r[2] === 'summary', JSON.stringify(r));
    check('bugs: summary UI visible', await d.page.evaluate(() => { const e = document.getElementById('sum-stars'); return !!e && e.offsetParent !== null; }));
    check('bugs: no errors while playing', d.errors.length === 0, d.errors.join('|'));
    await d.ctx.close();
  }
  {
    const d = await open(browser, GAME('games/deepdelve/index.html?test=1&seed=5'), desk);
    await d.page.waitForFunction(() => window.__dd && window.__dd.ready, null, { timeout: 30000 });
    const r = await d.page.evaluate(() => { const dd = window.__dd, s = dd.surfaceY(40, 40); const b0 = dd.getBlock(40, s + 5, 40); dd.mineAt(40, s + 5, 40); return [b0 !== 0, dd.getBlock(40, s + 5, 40), dd.hotbar().length]; });
    check('deepdelve: mining a block removes it and fills the hotbar', r[0] && r[1] === 0 && r[2] > 0, JSON.stringify(r));
    check('deepdelve: no errors while playing', d.errors.length === 0, d.errors.join('|'));
    await d.ctx.close();
  }
  {
    const d = await open(browser, GAME('games/mad-maze/index.html?test=1&offline=1'), desk);
    await d.page.waitForFunction(() => window.__mm && window.__mm.arena);
    const r = await d.page.evaluate(() => { const a = window.__mm.arena; a.firePlayerBullet(0); return [a.state, a.pBullets.some((b) => b.active)]; });
    check('mad-maze solo: arena runs and a bolt fires', r[0] !== 'idle' && r[1], JSON.stringify(r));
    await d.page.keyboard.down('d'); await d.page.waitForTimeout(300); await d.page.keyboard.up('d');
    check('mad-maze solo: no errors while playing', d.errors.length === 0, d.errors.join('|'));
    await d.ctx.close();
  }
  {
    const d = await open(browser, GAME('games/mad-maze/index.html?mode=dungeon&seed=1&test=1'), desk);
    await d.page.waitForFunction(() => window.__mm && window.__mm.dungeon && window.__mm.dungeon.room !== null);
    const r = await d.page.evaluate(() => {
      const dg = window.__mm.dungeon, g = dg.graph, from = dg.room;
      const door = g.doors.find((x) => !x.locked && !x.cracked && (x.a === from || x.b === from));
      const to = door.a === from ? door.b : door.a;
      if (dg.state.room(from).enemiesAlive > 0) dg.clearRoom();
      const res = dg.enter(to); return [from, to, res.ok, dg.room];
    });
    check('dungeon: entering a neighbouring room changes the current room', r[2] && r[3] === r[1] && r[0] !== r[3], JSON.stringify(r));
    check('dungeon: no errors while playing', d.errors.length === 0, d.errors.join('|'));
    await d.ctx.close();
  }
  {
    const d = await open(browser, GAME('games/mad-maze/lantern.html?test=1'), desk);
    await d.page.waitForSelector('#heroes', { state: 'attached' });
    const before = await d.page.locator('#heroes > li').count();
    await d.page.fill('#new-name', 'QAHero'); await d.page.click('#new-create');
    await d.page.waitForFunction((n) => document.querySelectorAll('#heroes > li').length > n, before, { timeout: 4000 }).catch(() => {});
    const after = await d.page.locator('#heroes > li').count();
    check('lantern: creating a hero adds it to the list', after === before + 1, before + '->' + after);
    check('lantern: Start run link points at the Mad Maze page', /^\.\/index\.html\?hero=/.test(await d.page.getAttribute('#start', 'href')));
    check('lantern: no errors while playing', d.errors.length === 0, d.errors.join('|'));
    await d.ctx.close();
  }
  {
    const d = await open(browser, GAME('hub/index.html'), desk);
    await d.page.waitForFunction(() => window.__hub);
    const id = await d.page.evaluate(() => window.__hub.at);
    const p = await d.page.evaluate(() => window.__hub.nodeClient('w4-angler'));
    await d.page.mouse.click(p.x, p.y);
    await d.page.waitForTimeout(2500);
    const st = await d.page.evaluate(() => ({ at: window.__hub.at, card: !document.getElementById('card').hidden, toast: document.getElementById('toast').textContent }));
    check('hub: tapping a node walks / opens a card / explains why not', st.card || st.at !== id || st.toast.length > 0, JSON.stringify(st));
    check('hub: no errors while playing', d.errors.length === 0, d.errors.join('|'));
    await d.ctx.close();
  }

  // ===== (3) round trip hub -> Hearthvale -> Back pill -> hub =====
  {
    const d = await open(browser, GAME('hub/index.html'), desk);
    await d.page.waitForFunction(() => window.__hub);
    const node = await d.page.evaluate(() => (window.__hub.isReachable('w0-hearthvale') ? 'w0-hearthvale' : 'w1-hearthvale'));
    const p = await d.page.evaluate((n) => window.__hub.nodeClient(n), node);
    await d.page.mouse.click(p.x, p.y);
    await d.page.waitForFunction(() => !window.__hub.walking, null, { timeout: 8000 });
    if (!(await d.page.isVisible('#card'))) { await d.page.mouse.click(p.x, p.y); await d.page.waitForTimeout(400); }
    const href = await d.page.getAttribute('#card-play', 'href');
    check('round trip: Hearthvale card Play href is ../index.html?from=hub', href === '../index.html?from=hub', href);
    await Promise.all([d.page.waitForURL(/\/game\/index\.html\?from=hub/, { timeout: 8000 }), d.page.click('#card-play')]);
    await d.page.waitForSelector('#join-btn');
    const pill = await d.page.evaluate(() => { const e = document.getElementById('back-to-map-pill'); return !!e && !e.classList.contains('hidden') && e.getBoundingClientRect().width > 0; });
    check('round trip: town shows the Back pill with ?from=hub', pill);
    await Promise.all([d.page.waitForURL(/\/game\/hub\/index\.html/, { timeout: 8000 }), d.page.click('#back-to-map-pill')]);
    await d.page.waitForFunction(() => window.__hub);
    check('round trip: Back pill returns to the hub', true);
    check('round trip: no errors', d.errors.length === 0, d.errors.join('|'));
    await d.ctx.close();
  }

  await browser.close();
  if (server) server.kill();
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); if (server) server.kill(); process.exit(1); });
