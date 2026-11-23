// CO3: same-device co-op hooked into the real Realm page behind ?party=local (index.html script tags + mad-maze.js MMWorldTeam.create).
// Two pages in ONE browser context, same seed, seats 0 and 1, no live DB (blockDb on the context, so on both pages):
//  1. each page sees the other's ghost within 40 tiles at <= 8 Hz, the minimap shows the partner dot (its own overlay) and the HUD chip;
//  2. a shared kill gives each seat its own bag id and its own tiered roll (gear player 'p' + seat, different seedFor), and soulbound
//     pieces never cross the channel (a runtime spy on BroadcastChannel.prototype.postMessage);
//  3. without ?party=local no BroadcastChannel is opened, 0 DB requests, 0 sockets, and the new code has no `firebase`.
// Phone 390x844: the HUD partner chip and the minimap dot never overlap the sticks or the ability grid.
// Run: BASE=http://localhost:8921/game/index.html NODE_PATH=$(npm root -g) node game/tests/world-party.test.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const LS = require('./lib/load-scale'); // load-scaled waits (1x idle, hard cap 6x)
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const SEED = 'co3' + (Date.now() % 100000); // a fresh channel per run
const PAGE = (q) => ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&' + q;
const PARTY = (seat, seed) => PAGE('party=local&seed=' + (seed || SEED) + '&seat=' + seat);

// ---- static: the new code has no network / database code; the hookup is behind the flag ----
const strip = (s) => s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const MMJS = fs.readFileSync(path.join(__dirname, '../games/mad-maze/mad-maze.js'), 'utf8');
const HTML = fs.readFileSync(path.join(__dirname, '../games/mad-maze/index.html'), 'utf8');
const CO3_BLOCK = (MMJS.match(/\/\/ CO3:[\s\S]*?\n {4}\}\n/) || [''])[0];
const NEW = {
  'world-team.js': fs.readFileSync(path.join(__dirname, '../games/mad-maze/world-team.js'), 'utf8'),
  'mm-world-party.js': fs.readFileSync(path.join(__dirname, '../shared/mm-world-party.js'), 'utf8'),
  'mm-party-bc.js': fs.readFileSync(path.join(__dirname, '../shared/mm-party-bc.js'), 'utf8'),
  'mm-party.js': fs.readFileSync(path.join(__dirname, '../shared/mm-party.js'), 'utf8'),
  'mad-maze.js CO3 block': CO3_BLOCK
};
check('static: the CO3 block in mad-maze.js was found and calls MMWorldTeam.create with party:\'local\' behind ?party=local',
  /params\.get\('party'\) === 'local'/.test(CO3_BLOCK) && /MMWorldTeam\.create\(arena, realmWorld\.api, \{ party: 'local'/.test(CO3_BLOCK) && /setTeam\(realmWorld\.team\)/.test(CO3_BLOCK), CO3_BLOCK.slice(0, 200));
check('static: grep finds no `firebase` in the new code (world-team, mm-world-party, mm-party-bc, mm-party, the CO3 block)', Object.keys(NEW).every((k) => !/firebase/i.test(NEW[k])),
  Object.keys(NEW).filter((k) => /firebase/i.test(NEW[k])).join());
check('static: no socket / fetch / XHR / remote URL in the new code', Object.keys(NEW).every((k) => !/websocket|\bfetch\s*\(|XMLHttpRequest|EventSource|sendBeacon|RTCPeerConnection|https?:\/\//i.test(strip(NEW[k]))));
const tagOrder = ['mm-party.js', 'mm-world-party.js', 'mm-party-bc.js', 'world-team.js', 'mad-maze.js'].map((f) => HTML.indexOf(f + '"></script>'));
check('static: index.html loads mm-party, mm-world-party, mm-party-bc, then world-team before mad-maze.js', tagOrder.every((i, k) => i > 0 && (k === 0 || i > tagOrder[k - 1])), JSON.stringify(tagOrder));

// runtime spy (init script, every page): counts BroadcastChannel opens, records every postMessage payload, counts WebSockets
const SPY = () => {
  const spy = window.__spy = { opened: [], posted: [], ws: 0 };
  const BCo = window.BroadcastChannel;
  if (BCo) {
    const post = BCo.prototype.postMessage;
    BCo.prototype.postMessage = function (m) { try { if (spy.posted.length < 5000) spy.posted.push({ at: performance.now(), m: JSON.parse(JSON.stringify(m)) }); } catch (e) { spy.posted.push({ at: performance.now(), m: '<uncloneable>' }); } return post.apply(this, arguments); };
    window.BroadcastChannel = class extends BCo { constructor(n) { super(n); spy.opened.push(String(n)); } };
  }
  const WSo = window.WebSocket;
  if (WSo) window.WebSocket = class extends WSo { constructor(...a) { spy.ws++; super(...a); } };
};

(async () => {
  const browser = await chromium.launch();
  const errors = []; const sockets = []; const foreign = [];
  const watch = (p) => {
    p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    p.on('websocket', (ws) => sockets.push(ws.url()));
    p.on('request', (r) => { if (!r.url().startsWith(ORIGIN) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) foreign.push(r.url()); });
  };
  const mkCtx = async (opt) => {
    const ctx = await browser.newContext(opt || { viewport: { width: 1000, height: 700 } });
    const db = await blockDb(ctx);
    await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' })); // the town exit
    await ctx.addInitScript(SPY);
    const prep = await ctx.newPage(); await prep.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
    await prep.evaluate(() => { localStorage.clear(); localStorage.setItem('mm-aim-assist', '0'); }); await prep.close();
    return { ctx, db };
  };
  const open = async (ctx, url, team) => {
    const p = await ctx.newPage(); watch(p);
    await p.goto(url);
    await p.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.state === 'play', null, { timeout: 30000 });
    if (team) await p.waitForFunction(() => window.__mm.team && window.__mm.team.ok && window.__mm.team.seat >= 0, null, { timeout: 10000 });
    await p.evaluate(() => { const a = window.__mm.arena; a.player.iframes = 1e9; a._hitPlayer = () => {}; });
    return p;
  };
  const T = (p, fn, arg) => p.evaluate(`(${fn.toString()})(window.__mm.team, window.__mm.arena, window.__mm.world, ${JSON.stringify(arg)})`);
  const frames = (p, n) => p.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

  const { ctx, db } = await mkCtx();
  const A = await open(ctx, PARTY(0), true);
  const B = await open(ctx, PARTY(1), true);

  // ================= 1. ghosts within 40 tiles at <= 8 Hz, minimap partner dot =================
  const info = await T(A, (t) => ({ ok: t.ok, seat: t.seat, ch: t.channel, opened: window.__spy.opened.slice() }));
  check('1a. the Realm page itself opens the team on ?party=local: seat 0, channel mm-party-<seed>, exactly one BroadcastChannel', info.ok && info.seat === 0 && info.ch === 'mm-party-' + SEED && info.opened.length === 1 && info.opened[0] === info.ch, JSON.stringify(info));
  check('1b. page B is seat 1', (await T(B, (t) => t.seat)) === 1);
  const spawn = await T(A, (t, a) => ({ x: a.player.x, y: a.player.y }));
  await T(B, (t, a, w, s) => { a.player.x = s.x + 96; a.player.y = s.y; }, spawn);
  const seenA = await A.waitForFunction(() => window.__mm.team.ghosts().some((g) => g.seat === 1), null, { timeout: LS.budget(2000), polling: 50 }).then(() => true, () => false);
  const seenB = await B.waitForFunction(() => window.__mm.team.ghosts().some((g) => g.seat === 0), null, { timeout: LS.budget(2000), polling: 50 }).then(() => true, () => false);
  check('1c. each page sees the other\'s ghost within 2 s (load-scaled wait)', seenA && seenB, JSON.stringify({ seenA, seenB }));
  await A.waitForTimeout(300);
  const g1 = await T(A, (t) => t.ghosts().find((g) => g.seat === 1));
  check('1d. A\'s ghost of B sits at B\'s tile (3 tiles away) with the name tag "Hero 2"', !!g1 && Math.abs(g1.x - (spawn.x + 96) / 32) < 0.6 && Math.abs(g1.y - spawn.y / 32) < 0.6 && g1.name === 'Hero 2', JSON.stringify(g1));
  const drawn0 = await T(A, (t) => t.stats().draws); await frames(A, 10); const drawn1 = await T(A, (t) => t.stats().draws);
  const tagShown = await A.evaluate(() => { const g = document.querySelector('.mm-team-tag[data-seat="1"]'); return !!g && g.style.display !== 'none'; });
  check('1e. within 40 tiles the ghost is drawn every frame and its tag is shown', drawn1 > drawn0 && tagShown, JSON.stringify({ drawn0, drawn1, tagShown }));

  // rate: <= 8 Hz from both the receiver counter and the sender's postMessage spy
  const r0 = await T(A, (t) => t.stats().recv); const s0 = await B.evaluate(() => window.__spy.posted.length);
  // a fixed wall window counts fewer messages when a loaded box stalls the page: sample >= 2 s AND until A has >= 8 messages (a condition),
  // then normalise both counters to a 2 s window by the real elapsed time, so the 8 Hz ceiling is checked exactly and the floor is not load-bound
  const w0 = Date.now(); await A.waitForTimeout(2000);
  await A.waitForFunction((n0) => window.__mm.team.stats().recv - n0 >= 8, r0, { timeout: LS.budget(4000), polling: 100 }).catch(() => {});
  const r1 = await T(A, (t) => t.stats().recv); const wms = Date.now() - w0; const norm = (n) => Math.round(n * 2000 / Math.max(2000, wms));
  const rate = await B.evaluate((n0) => { const P = window.__spy.posted.slice(n0).filter((q) => q.m && q.m.t === 'pos'); let minGap = 1e9; for (let i = 1; i < P.length; i++) minGap = Math.min(minGap, P[i].at - P[i - 1].at); return { n: P.length, minGap: Math.round(minGap) }; }, s0);
  rate.raw = rate.n; rate.n = norm(rate.n); // floor on the raw count (the wait above guarantees >= 8 when the page keeps up), ceiling on the 2 s-normalised count
  check('1f. positions arrive at <= 8 Hz (8..18 in 2 s on A)', r1 - r0 >= 8 && norm(r1 - r0) <= 18, (r1 - r0) + ' msgs in ' + wms + ' ms');
  check('1g. B posts pos messages at <= 8 Hz (spy: <= 17 in 2 s, consecutive gap >= 110 ms)', rate.raw >= 8 && rate.n <= 17 && rate.minGap >= 110, JSON.stringify(rate));

  // minimap partner dot (own overlay canvas over #rw-minimap; the minimap canvas itself untouched)
  await frames(A, 6);
  const dot = await A.evaluate(() => {
    const mini = document.getElementById('rw-minimap'); const cv = document.querySelector('.mm-team-mini');
    if (!mini || !cv) return { mini: !!mini, cv: !!cv };
    const mr = mini.getBoundingClientRect(); const cr = cv.getBoundingClientRect();
    const g = cv.getContext('2d'); const d = g.getImageData(0, 0, cv.width, cv.height).data; let px = 0, tinted = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0) { px++; if (d[i] === 0x79 && d[i + 1] === 0xc0 && d[i + 2] === 0xff) tinted++; }
    const w = window.__mm.world.world; const gh = window.__mm.team.ghosts()[0];
    const ex = Math.round(gh.x * cv.width / w.w), ey = Math.round(gh.y * cv.height / w.h); const at = g.getImageData(ex - 1, ey - 1, 1, 1).data;
    return { inside: cr.left >= mr.left - 0.5 && cr.top >= mr.top - 0.5 && cr.right <= mr.right + 0.5 && cr.bottom <= mr.bottom + 0.5 && cr.width > 40, px, tinted, at: Array.from(at), shown: getComputedStyle(cv).display !== 'none', pe: getComputedStyle(cv).pointerEvents, sib: mini.nextElementSibling && mini.nextElementSibling.id };
  });
  check('1h. the minimap shows the partner dot: an overlay inside #rw-minimap, seat-1 tint at the partner\'s tile', dot.inside && dot.shown && dot.tinted >= 4 && dot.at[2] === 0xff && dot.at[0] === 0x79, JSON.stringify(dot));
  check('1i. the overlay never takes taps (pointer-events none) and leaves the minimap + zone line adjacent (CSS sibling rule kept)', dot.pe === 'none' && dot.sib === 'rw-zone', JSON.stringify(dot));
  const chipTxt = await A.evaluate(() => { const c = document.querySelector('.mm-team-hud'); return c && c.style.display !== 'none' ? c.textContent : null; });
  check('1j. the HUD partner chip names the partner and its distance in tiles', !!chipTxt && /Hero 2 · 3t/.test(chipTxt), String(chipTxt));

  // beyond 40 tiles: still tracked, but not drawn and its tag hidden; the minimap dot follows the move
  const d0 = await A.evaluate(() => window.__mm.team.stats().miniDraws);
  const farAt = await T(B, (t, a, w, s) => { // a free tile ~50 tiles away (walkable, so the arena never pushes the hero back)
    const sx = Math.floor(s.x / 32), sy = Math.floor(s.y / 32);
    for (const [dx, dy] of [[50, 0], [-50, 0], [0, 50], [0, -50], [36, 36], [-36, 36], [36, -36], [-36, -36]]) {
      const f = w.nearestFree(sx + dx, sy + dy, 6); if (!f || Math.hypot(f.x - sx, f.y - sy) < 44) continue;
      const c = w.tileCenter(f.x, f.y); a.player.x = c.x; a.player.y = c.y; return { x: c.x / 32, y: c.y / 32 };
    }
    return null;
  }, spawn);
  await A.waitForFunction(() => { const g = window.__mm.team.ghosts().find((q) => q.seat === 1); const p = window.__mm.arena.player; return g && Math.hypot(g.x - p.x / 32, g.y - p.y / 32) > 42; }, null, { timeout: 2000 }).catch(() => {});
  await A.waitForTimeout(300);
  const far0 = await T(A, (t) => t.stats().draws); await frames(A, 10); const far1 = await T(A, (t) => t.stats().draws);
  const far = await A.evaluate(() => ({ tag: (document.querySelector('.mm-team-tag[data-seat="1"]') || {}).style.display, mini: window.__mm.team.stats().miniDraws }));
  check('1k. beyond 40 tiles the ghost is not drawn and its tag hides', !!farAt && far1 === far0 && far.tag === 'none', JSON.stringify({ farAt, far0, far1, far }));
  check('1l. the minimap dot redraws when the partner moves (and only then)', far.mini > d0, JSON.stringify({ d0, far }));
  await T(B, (t, a, w, s) => { a.player.x = s.x + 64; a.player.y = s.y; }, spawn);
  // wait until A's ghost of B is back at B's tile (2 tiles from A). A one-sided `g.x < spawn + 4` was already true when the far tile
  // lay WEST (x - 50, picked when x + 50 is not free on this run's seed), so the kill below ran while A still saw B ~50 tiles away,
  // out of the 40-tile share range: no bag was posted and 2e / 2f / 2g failed on those seeds.
  const back = await A.waitForFunction((s) => { const g = window.__mm.team.ghosts().find((q) => q.seat === 1); return !!g && Math.hypot(g.x - s.x, g.y - s.y) < 0.6; },
    { x: (spawn.x + 64) / 32, y: spawn.y / 32 }, { timeout: 5000, polling: 50 }).then(() => true, () => false);
  check('1m. after B walks back, A\'s ghost of B is at B\'s tile again (before the shared kill)', back, JSON.stringify(await T(A, (t) => t.ghosts())));

  // ================= 2. a shared kill: own bag id, own tiered roll per seat; soulbound never crosses =================
  const gp = [await T(A, (t, a, w) => w.gearPlayerId()), await T(B, (t, a, w) => w.gearPlayerId())];
  check('2a. realm-world rolls seat 0 as gear player p0 and seat 1 as p1 (setTeam from the page)', gp[0] === 'p0' && gp[1] === 'p1', JSON.stringify(gp));
  const sf = await A.evaluate(() => { const GD = window.MMGearDrops; const s = window.__mm.world.seed; return [GD.seedFor(s, 'g1', 3, 'p0'), GD.seedFor(s, 'g1', 3, 'p1')]; });
  check('2b. the same kill seeds differently per seat (seedFor p0 != p1)', sf[0] !== sf[1], JSON.stringify(sf));
  check('2c. gear tiers are on (the default), so each seat\'s roll is tiered', await T(A, (t, a, w) => w.gearOn === true) && await T(B, (t, a, w) => w.gearOn === true));
  await A.waitForFunction(() => window.__mm.world.liveEnemies().length > 0, null, { timeout: 20000 }).catch(() => {});
  const nPost0 = await A.evaluate(() => window.__spy.posted.length);
  const bRolls0 = await T(B, (t) => t.rolls().length); const bDrops0 = await T(B, (t, a, w) => w.lastDrops().length);
  const kill = await T(A, (t, a, w) => {
    // kill zone enemies one at a time until a bag with at least one item drops (a bag can be shards / potions only)
    w.setDropAll(true); let n = 0, got = null, dead = true, grew = true;
    for (const le of w.liveEnemies()) {
      const e = w.enemyById(le.id); if (!e || !e.active) continue;
      a.bags.forEach((b) => { b.active = false; });
      e.x = a.player.x + 120; e.y = a.player.y; e.invuln = 0;
      const ref = w.lastDrops().slice(-1)[0]; a._hitEnemy(e, 1e7); n++;
      dead = dead && !e.active; got = w.lastDrops().slice(-1)[0]; grew = grew && got !== ref;
      if (got && got.items.length) break;
      if (n >= 10) break;
    }
    w.setDropAll(false);
    return { n, dead, grew, items: got ? got.items.map((i) => ({ id: i.id, t: i.t || 0, rolled: i.rolled })) : [], own: t.bags().slice(-1)[0], shared: t.stats().shared };
  });
  check('2d. A\'s real world kill drops A\'s own tiered bag and is shared (one share per kill)', !!kill && kill.dead && kill.grew && kill.items.length > 0 && kill.items.every((i) => i.t >= 1) && kill.shared === kill.n, JSON.stringify(kill));
  const gotB = await B.waitForFunction((n) => window.__mm.team.rolls().length >= n, bRolls0 + (kill ? kill.n : 1), { timeout: 20000 }).then(() => true, () => false);
  const rollB = await T(B, (t, a, w) => ({ bags: t.bags(), roll: t.rolls().slice(-1)[0], drops: w.lastDrops().length }));
  const postedKill = await A.evaluate((n) => window.__spy.posted.slice(n).map((q) => q.m), nPost0); // before the extra shares below
  // a bag can be shards / potions only: share more of A's (safe) drops until B's own roll has items, to check B's tiers
  let rollItems = rollB.roll && rollB.roll.items.length ? rollB.roll : null;
  for (let i = 0; i < 12 && !rollItems; i++) {
    const n0 = await T(B, (t) => t.rolls().length);
    await T(A, (t, a) => { t.shareDrop('zx', { items: [{ id: 'sparkwand', rolled: 'sparkwand', t: 3 }] }, a.player.x / 32, a.player.y / 32); });
    await B.waitForFunction((n) => window.__mm.team.rolls().length > n, n0, { timeout: 2000 }).catch(() => {});
    await T(B, (t, a) => { a.bags.forEach((b) => { b.active = false; }); });
    const r = await T(B, (t) => t.rolls().slice(-1)[0]); if (r && r.items.length) rollItems = r;
  }
  const numA = kill && kill.own ? kill.own.id.split('-')[1] : 'x';
  const bagB = rollB.bags.find((b) => b.id.split('-')[1] === numA);
  check('2e. each seat gets its own bag id for the shared kill (A b0-N, B b1-N, never equal)', !!kill && /^b0-/.test(kill.own.id) && kill.own.owner === 0 && !!bagB && /^b1-/.test(bagB.id) && bagB.owner === 1 && bagB.id !== kill.own.id, JSON.stringify({ own: kill && kill.own, bagB }));
  check('2f. B rolled its OWN tiered bag locally as gear player p1 (a new realm-world drop on B)', gotB && rollB.roll && rollB.roll.gp === 'p1' && !!bagB && rollB.roll.id === bagB.id && (rollB.drops > bDrops0 || bDrops0 >= 12), JSON.stringify({ rollB, bDrops0 }));
  check('2f2. B\'s own roll is tiered (every item carries B\'s own tier, rolled as p1)', !!rollItems && rollItems.gp === 'p1' && rollItems.items.every((i) => i.t >= 1), JSON.stringify(rollItems));
  const bags = postedKill.filter((m) => m && m.t === 'bag');
  const keysOk = bags.every((m) => Object.keys(m).every((k) => ['t', 's', 'id', 'item', 'x', 'y'].indexOf(k) >= 0));
  const soulIds = kill ? kill.items.filter((i) => i.t >= 11).map((i) => i.id) : [];
  check('2g. spy: each kill posted exactly one bag (for seat 1) with no tier / affix / soulbound field', !!kill && bags.length === kill.n && bags.every((m) => m.s === 1) && keysOk, JSON.stringify(bags));
  check('2h. spy: no tiered gear id of A\'s drop crossed (only a base item id or "bag")', bags.every((m) => soulIds.indexOf(m.item) < 0 && !kill.items.some((i) => i.t >= 1 && i.id === m.item && i.id !== i.rolled)), JSON.stringify({ bags, items: kill && kill.items }));

  // forced soulbound drop through the real share path: T11 / T12 / relic pieces stay home, only a safe base id (or 'bag') is posted
  const nPost1 = await A.evaluate(() => window.__spy.posted.length);
  const sb = await T(A, (t, a) => {
    const x = a.player.x / 32, y = a.player.y / 32;
    const r1 = t.shareDrop('zsb', { items: [{ id: 'gear_t12_relic', rolled: 'ember_staff', t: 12, soulbound: true, sig: 'x' }, { id: 'gear_t11_blade', rolled: 'iron_blade', t: 11, soulbound: true }] }, x, y);
    const r2 = t.shareDrop('zmix', { items: [{ id: 'gear_t11_bow', rolled: 'long_bow', t: 11 }, { id: 'gear_t5_wand', rolled: 'sparkwand', t: 5 }] }, x, y);
    return { r1: !!r1, r2: !!r2, kept: t.stats().keptHome, safe: [MMWorldTeam.safeItem({ items: [{ id: 'a', t: 12 }] }), MMWorldTeam.isSoulbound({ id: 'q', t: 11 }), MMWorldTeam.isSoulbound({ id: 'q', t: 10 })] };
  });
  await A.waitForTimeout(300);
  const posted2 = await A.evaluate((n) => window.__spy.posted.slice(n).map((q) => q.m).filter((m) => m && m.t === 'bag'), nPost1);
  const leak = JSON.stringify(posted2).match(/gear_t1[12]|ember_staff|iron_blade|long_bow|relic|soulbound|"sig"/);
  check('2i. spy: forced T11/T12 drops never cross the channel (items posted: bag, sparkwand)', sb.r1 && sb.r2 && !leak && posted2.map((m) => m.item).join() === 'bag,sparkwand', JSON.stringify({ posted2, leak }));
  check('2j. the soulbound pieces are counted as kept home (3) and the rule is t >= 11', sb.kept === 3 && sb.safe[0] === 'bag' && sb.safe[1] === true && sb.safe[2] === false, JSON.stringify(sb));
  const bLast = await B.waitForFunction(() => window.__mm.team.bags().some((b) => /^b1-/.test(b.id) && b.item === 'sparkwand'), null, { timeout: 2000 }).then(() => true, () => false);
  const bItems = await T(B, (t) => t.bags().map((b) => b.item));
  check('2k. B received its own bags for both shares and never saw a soulbound id', bLast && !bItems.some((i) => /gear_t1|ember_staff|iron_blade|long_bow/.test(i)), JSON.stringify(bItems));

  // ================= phone 390x844: the partner chip never overlaps the sticks or the ability grid =================
  const P = await mkCtx({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const PA = await open(P.ctx, PARTY(0, SEED + 'p'), true);
  const PB = await open(P.ctx, PARTY(1, SEED + 'p'), true);
  const psp = await T(PA, (t, a) => ({ x: a.player.x, y: a.player.y }));
  await T(PB, (t, a, w, s) => { a.player.x = s.x + 64; a.player.y = s.y; }, psp);
  await PA.waitForFunction(() => window.__mm.team.ghosts().length === 1, null, { timeout: 3000 }).catch(() => {});
  await frames(PA, 10);
  const lay = await PA.evaluate(() => {
    const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return r.width > 0 && getComputedStyle(el).display !== 'none' ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null; };
    const hit = (a, b) => !!a && !!b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
    const chip = R(document.querySelector('.mm-team-hud')); const mini = R(document.querySelector('.mm-team-mini'));
    const sticks = ['realm-stick-move', 'realm-stick-aim'].map((id) => R(document.getElementById(id)));
    const abs = Array.from(document.querySelectorAll('.realm-ab')).map(R).filter(Boolean);
    const hud = ['realm-hp', 'realm-info', 'realm-xp', 'rw-minimap', 'rw-zone', 'rw-event', 'rw-event-hint'].map((id) => R(document.getElementById(id))).concat(Array.from(document.querySelectorAll('#realm-hud button')).map(R));
    return { chip, mini, sticks, touch: document.body.classList.contains('touch-device'), stickHit: sticks.some((s) => hit(chip, s) || hit(mini, s)), abHit: abs.some((s) => hit(chip, s)), hudHit: hud.some((s) => hit(chip, s)),
      inView: !!chip && chip.l >= 0 && chip.r <= innerWidth && chip.t >= 0, sw: document.documentElement.scrollWidth, vw: innerWidth };
  });
  check('phone: the HUD partner chip is shown inside the viewport and the sticks are on screen', !!lay.chip && lay.inView && lay.sticks.every(Boolean), JSON.stringify(lay));
  check('phone: the partner chip and minimap dot overlay overlap neither stick, nor the ability grid, nor the top HUD (HP, info, XP, buttons, minimap, zone / event lines)', !lay.stickHit && !lay.abHit && !lay.hudHit, JSON.stringify(lay));
  check('phone: no horizontal scroll at 390x844', lay.sw <= lay.vw, JSON.stringify({ sw: lay.sw, vw: lay.vw }));
  await PA.evaluate(() => document.getElementById('realm-bp-btn').click()); await frames(PA, 6);
  const panel = await PA.evaluate(() => ({ open: !document.getElementById('realm-backpack').classList.contains('hidden'), chip: document.querySelector('.mm-team-hud').style.display, mini: document.querySelector('.mm-team-mini').style.display }));
  check('phone: with the backpack open the chip and the minimap dot step aside with the minimap', panel.open && panel.chip === 'none' && panel.mini === 'none', JSON.stringify(panel));
  await PA.evaluate(() => document.getElementById('realm-bp-close').click()); await frames(PA, 6);
  await PA.screenshot({ path: path.join(require('os').tmpdir(), 'world-party-phone.png') }).catch(() => {});

  // ================= 3. without ?party=local: no BroadcastChannel, 0 DB requests, 0 sockets =================
  const S = await open(ctx, PAGE('seed=' + SEED), false);
  await S.waitForTimeout(800);
  const solo = await S.evaluate(() => ({ opened: window.__spy.opened.length, posted: window.__spy.posted.length, ws: window.__spy.ws, team: window.__mm.team, gp: window.__mm.world.gearPlayerId(), layer: !!document.querySelector('.mm-team-tags, .mm-team-mini, .mm-team-hud') }));
  check('3a. without ?party=local no BroadcastChannel is opened and nothing is posted', solo.opened === 0 && solo.posted === 0, JSON.stringify(solo));
  check('3b. ... no team, no ghost layer / minimap overlay / chip, solo gear stream p0', solo.team === null && !solo.layer && solo.gp === 'p0', JSON.stringify(solo));
  const other = await open(ctx, PAGE('party=remote&seed=' + SEED), false);
  const oth = await other.evaluate(() => ({ opened: window.__spy.opened.length, team: window.__mm.team }));
  check('3c. any other party value (party=remote) also opens nothing', oth.opened === 0 && oth.team === null, JSON.stringify(oth));
  const spyWs = await Promise.all([A, B, S, other, PA, PB].map((p) => p.evaluate(() => window.__spy.ws)));
  check('3d. 0 database requests (blockDb on both contexts) and 0 sockets (spy + page events)', db.count() === 0 && P.db.count() === 0 && sockets.length === 0 && spyWs.every((n) => n === 0), JSON.stringify({ http: db.http, ws: db.ws, sockets, spyWs }));
  check('3e. no request left the test origin', foreign.length === 0, foreign.slice(0, 5).join(' | '));
  check('no console errors on any page', errors.length === 0, errors.slice(0, 5).join(' | '));
  await P.ctx.close();
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
