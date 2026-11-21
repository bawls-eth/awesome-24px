// CO2: same-device co-op on the big map (games/mad-maze/world-team.js) through tests/fixtures/world-party.html, two tabs of one origin:
// B's hero shows up as a ghost in A within 2 s and moves; a shared kill gives each seat its own bag id; a bag owned by seat B is never
// delivered to A; hostile messages are rejected; a closed tab's ghost disappears; 0 DB requests and 0 WebSockets; phone 390x844 has no
// horizontal scroll; no BroadcastChannel / no flag / a bad seed is an inert no-op; the new files contain no network code.
// Run: BASE=http://localhost:8667/game/index.html NODE_PATH=$(npm root -g) node game/tests/world-team.test.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const SEED = 'co2' + (Date.now() % 100000); // a fresh channel per run
const FIX = (seat, seed) => ORIGIN + '/game/tests/fixtures/world-party.html?seed=' + (seed || SEED) + (seat === undefined ? '' : '&seat=' + seat);

// ---- static: no network code in the new files, the seed is regex-checked ----
const strip = (s) => s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const SRC = {
  'world-team.js': fs.readFileSync(path.join(__dirname, '../games/mad-maze/world-team.js'), 'utf8'),
  'world-party.html': fs.readFileSync(path.join(__dirname, 'fixtures/world-party.html'), 'utf8')
};
const NET_RE = /firebase|websocket|\bfetch\s*\(|XMLHttpRequest|EventSource|sendBeacon|RTCPeerConnection|\.ref\s*\(|localStorage|https?:\/\//i;
check('no Firebase / socket / fetch / storage / remote URL in world-team.js or the fixture', Object.keys(SRC).every((k) => !NET_RE.test(strip(SRC[k]))),
  Object.keys(SRC).filter((k) => NET_RE.test(strip(SRC[k]))).join());
check('no Math.random in world-team.js', !/Math\.random/.test(strip(SRC['world-team.js'])));
check('the controller is behind the party=local flag and checks the seed with MMPartyBC.seedOk', /opts\.party !== 'local'/.test(SRC['world-team.js']) && /BC\.seedOk\(seed\)/.test(SRC['world-team.js']));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const db = await blockDb(ctx);
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' })); // the town exit: no network
  const errors = []; const sockets = []; const foreign = [];
  const watch = (p) => {
    p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    p.on('websocket', (ws) => sockets.push(ws.url()));
    p.on('request', (r) => { if (!r.url().startsWith(ORIGIN) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) foreign.push(r.url()); });
  };
  // clean start: no realm save, aim assist off (storage writes happen only in the test page's own origin)
  const prep = await ctx.newPage(); await prep.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await prep.evaluate(() => { localStorage.clear(); localStorage.setItem('mm-aim-assist', '0'); }); await prep.close();

  const open = async (seat, seed) => {
    const p = await ctx.newPage(); watch(p);
    await p.goto(FIX(seat, seed));
    await p.waitForFunction(() => window.__fixture && window.__fixture.team && window.__mm_ready !== false, null, { timeout: 30000 });
    await p.waitForFunction(() => { const w = document.getElementById('world').contentWindow; return w.__mm && w.__mm.arena.state === 'play'; }, null, { timeout: 20000 });
    await p.evaluate(() => { const a = document.getElementById('world').contentWindow.__mm.arena; a.player.iframes = 1e9; a._hitPlayer = () => {}; });
    return p;
  };
  const T = (p, fn, arg) => p.evaluate(`(${fn.toString()})(window.__fixture.team, document.getElementById('world').contentWindow.__mm.arena, ${JSON.stringify(arg)})`);

  const A = await open(0);
  const B = await open(1);
  const info = await T(A, (t) => ({ ok: t.ok, seat: t.seat, ch: t.channel }));
  check('the controller opens the same-device channel for the seed on seat 0', info.ok === true && info.seat === 0 && info.ch === 'mm-party-' + SEED, JSON.stringify(info));
  check('page B is seat 1', (await T(B, (t) => t.seat)) === 1);

  // put both heroes a few tiles apart on walkable ground near the shared spawn
  const spawn = await T(A, (t, a) => ({ x: a.player.x, y: a.player.y }));
  await T(B, (t, a, s) => { a.player.x = s.x; a.player.y = s.y; }, spawn);
  const t0 = Date.now();
  let seen = false;
  try { await A.waitForFunction(() => window.__fixture.team.ghosts().some((g) => g.seat === 1), null, { timeout: 2000, polling: 50 }); seen = true; } catch (e) { /* reported below */ }
  check('B\'s hero appears as a ghost in A within 2 s', seen, (Date.now() - t0) + ' ms');
  const g1 = await T(A, (t) => t.ghosts().find((g) => g.seat === 1));
  check('the ghost sits at B\'s tile position with a name tag', !!g1 && Math.abs(g1.x - spawn.x / 32) < 0.6 && Math.abs(g1.y - spawn.y / 32) < 0.6 && g1.name === 'Hero 2', JSON.stringify(g1));
  check('A is also a ghost in B', await B.waitForFunction(() => window.__fixture.team.ghosts().some((g) => g.seat === 0), null, { timeout: 2000 }).then(() => true, () => false));

  // B moves 3 tiles right: A's ghost follows
  await T(B, (t, a) => { a.player.x += 96; });
  const moved = await A.waitForFunction((x0) => { const g = window.__fixture.team.ghosts().find((q) => q.seat === 1); return g && g.x > x0 + 2.5; }, g1.x, { timeout: 2000 }).then(() => true, () => false);
  check('the ghost moves when B moves', moved);
  await A.waitForTimeout(400);
  const drawn = await A.evaluate(() => {
    const d = document.getElementById('world').contentDocument; const tag = d.querySelector('.mm-team-tag[data-seat="1"]');
    const r = tag && tag.getBoundingClientRect();
    const cv = d.querySelector('.mm-team-canvas'); let px = 0;
    if (cv && cv.width) { const data = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; for (let i = 3; i < data.length; i += 4) if (data[i] > 0) px++; }
    const cr = cv && cv.getBoundingClientRect(); const ar = d.querySelector('#realm-canvas-wrap canvas:not(.mm-team-canvas)').getBoundingClientRect();
    return { draws: window.__fixture.team.stats().draws, px, aligned: !!cr && Math.abs(cr.left - ar.left) < 1 && Math.abs(cr.width - ar.width) < 1, tag: tag ? tag.textContent : null, shown: !!tag && tag.style.display !== 'none' && r.width > 0, html: tag ? tag.children.length : -1 };
  });
  check('the ghost is drawn (cached sprite on an overlay canvas aligned with the arena) with a plain-text name tag', drawn.draws > 0 && drawn.px > 50 && drawn.aligned && drawn.tag === 'Hero 2' && drawn.shown && drawn.html === 0, JSON.stringify(drawn));

  // 8 Hz: count B's position messages over 2 s from A's receive counter
  const r0 = await T(A, (t) => t.stats().recv); await A.waitForTimeout(2000); const r1 = await T(A, (t) => t.stats().recv);
  check('positions arrive at <= 8 Hz (and do arrive)', r1 - r0 >= 8 && r1 - r0 <= 18, (r1 - r0) + ' msgs in 2 s');

  // shared kill made by B: B keeps its own bag, A (seat 0) gets a bag with ITS own owner id, ids never collide
  const bagB = await T(B, (t, a) => t.shareKill('z7', 'potion_red', a.player.x / 32, a.player.y / 32));
  await A.waitForFunction(() => window.__fixture.bagsSeen.length >= 1, null, { timeout: 2000 }).catch(() => {});
  const bagsA = await T(A, (t) => t.bags());
  check('a shared kill gives each tab its own bag id (no collision)', bagB && /^b1-/.test(bagB.id) && bagsA.length === 1 && /^b0-/.test(bagsA[0].id) && bagsA[0].id !== bagB.id && bagsA[0].owner === 0,
    JSON.stringify({ bagB, bagsA }));

  // a bag owned by seat B (1) is never delivered to A, even when posted raw on the channel
  const rejB0 = await T(A, (t) => t.stats().bagsRejected);
  await A.evaluate((s) => { const a = document.getElementById('world').contentWindow.__mm.arena; const raw = new BroadcastChannel('mm-party-' + s); raw.postMessage({ t: 'bag', s: 1, id: 'b1-555', item: 'coin', x: a.player.x / 32, y: a.player.y / 32 }); setTimeout(() => raw.close(), 300); }, SEED);
  await B.waitForFunction(() => window.__fixture.team.bags().some((b) => b.id === 'b1-555'), null, { timeout: 2000 }).catch(() => {});
  const bagsA2 = await T(A, (t) => t.bags()); const rejB1 = await T(A, (t) => t.stats().bagsRejected);
  check('a bag owned by seat B is not delivered to A', !bagsA2.some((b) => b.id === 'b1-555') && rejB1 > rejB0 && bagsA2.length === 1, JSON.stringify(bagsA2));
  check('... and it is delivered to B, its owner', await T(B, (t) => t.bags().some((b) => b.id === 'b1-555' && b.owner === 1)));

  // hostile messages: wrong seats, garbage, a forged bag id, a bag repeat, a replayed old pos, our own seat, oversize junk
  const rej0 = await T(A, (t) => t.stats().rejected);
  await A.evaluate((s) => {
    const raw = new BroadcastChannel('mm-party-' + s);
    [{ t: 'pos', s: 9, x: 1, y: 1 }, { t: 'pos', s: -1, x: 1, y: 1 }, 'junk', 42, null, [1, 2], { t: 'pos', s: 1, x: 'NaN', y: 1 },
      { t: 'bag', s: 0, id: 'b1-9', item: 'coin', x: 1, y: 1 }, { t: 'bag', s: 0, id: 'b0-1', item: '<img src=x>', x: 1, y: 1 },
      { t: 'hit', s: 1, e: '<script>', d: 5 }, { t: 'hit', s: 3, e: 'z1', d: 5 }, { t: 'zap', s: 1 }, { t: 'pos', s: 1, x: 1, y: 1, n: 1 },
      { t: 'pos', s: 0, x: 3, y: 3, n: 99 }, { t: 'pos', s: 1, x: 2, y: 2, pad: 'y'.repeat(5000), __proto__: { evil: 1 } }].forEach((d) => { try { raw.postMessage(d); } catch (e) { /* not cloneable */ } });
    setTimeout(() => raw.close(), 300);
  }, SEED);
  await A.waitForTimeout(500);
  const after = await T(A, (t) => ({ g: t.ghosts().map((q) => q.seat), bags: t.bags().length, rej: t.stats().rejected, seat: t.seat }));
  check('hostile messages are rejected: only ghost seat 1, no new bag, A keeps seat 0', after.g.join() === '1' && after.bags === 1 && after.seat === 0 && after.rej > rej0, JSON.stringify(after));
  check('no injected markup reached the page', await A.evaluate(() => !document.getElementById('world').contentDocument.querySelector('.mm-team-tags img, .mm-team-tags script')));

  // a closed tab's ghost goes away within the stale timeout
  await B.close();
  const tc = Date.now();
  const gone = await A.waitForFunction(() => !window.__fixture.team.ghosts().some((g) => g.seat === 1) && !document.getElementById('world').contentDocument.querySelector('.mm-team-tag[data-seat="1"]'), null, { timeout: 5000 }).then(() => true, () => false);
  check('closing page B removes its ghost and tag from A within 5 s', gone, (Date.now() - tc) + ' ms');

  // inert cases inside the real page: no flag, bad seed
  const inert = await T(A, (t, a) => {
    const w = document.getElementById('world').contentWindow.__mm.world;
    const n0 = MMWorldTeam.create(a, w, {}); const n1 = MMWorldTeam.create(a, w, { party: 'local', seed: 'bad seed!' }); const n2 = MMWorldTeam.create(a, w, { party: 'local', seed: '../x' });
    return [n0.ok, n1.ok, n2.ok, n0.reason, n1.reason, (n0.destroy(), n1.shareKill('z', 'coin', 1, 1))];
  });
  check('without the flag, or with a bad seed, create() is an inert no-op', inert[0] === false && inert[1] === false && inert[2] === false && inert[3] === 'flag off' && inert[4] === 'bad seed' && inert[5] === null, JSON.stringify(inert));
  check('destroy() restores onEnemyHit and removes the ghost layer', await T(A, (t, a) => { const before = a.onEnemyHit; t.destroy(); return before !== a.onEnemyHit && !document.getElementById('world').contentDocument.querySelector('.mm-team-canvas') && !document.getElementById('world').contentDocument.querySelector('.mm-team-tags'); }));

  // no BroadcastChannel at all: graceful no-op, the world still runs
  const D = await ctx.newPage(); watch(D);
  await D.addInitScript(() => { delete window.BroadcastChannel; });
  await D.goto(FIX(2, SEED + 'x'));
  await D.waitForFunction(() => window.__fixture && window.__fixture.team, null, { timeout: 30000 });
  const dn = await D.evaluate(() => { const t = window.__fixture.team; return { ok: t.ok, reason: t.reason, g: t.ghosts().length, k: t.shareKill('z', 'coin', 1, 1) }; });
  check('without BroadcastChannel the controller is inert', dn.ok === false && dn.reason === 'no BroadcastChannel' && dn.g === 0 && dn.k === null, JSON.stringify(dn));
  await D.close();
  await A.close();

  // phone 390x844: no horizontal scroll in the fixture or the world page inside it
  const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const pdb = await blockDb(pctx);
  await pctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  const P = await pctx.newPage(); watch(P);
  await P.goto(FIX(3, SEED + 'p'));
  await P.waitForFunction(() => window.__fixture && window.__fixture.team && window.__fixture.team.ok, null, { timeout: 30000 });
  await P.waitForTimeout(500);
  const sw = await P.evaluate(() => { const d = document.getElementById('world').contentDocument; return { outer: document.documentElement.scrollWidth, inner: d.documentElement.scrollWidth, vw: innerWidth }; });
  check('phone 390x844: no horizontal scroll (fixture and world page)', sw.outer <= sw.vw && sw.inner <= sw.vw, JSON.stringify(sw));
  await pctx.close();

  check('0 database requests and 0 WebSockets (blockDb)', db.count() === 0 && pdb.count() === 0 && sockets.length === 0, JSON.stringify({ http: db.http, ws: db.ws, sockets }));
  check('no request left the test origin', foreign.length === 0, foreign.slice(0, 5).join(' | '));
  check('no console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
