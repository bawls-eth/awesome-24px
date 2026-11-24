// Netsafety (bug bash): the Town must survive HOSTILE data from other clients. The database rules are open, so any
// client can write any shape to /players, /chat, /guestbook, /blocks, /realmInvites/{id} and /walkie/{id}. This test
// feeds such records through the REAL net.js + main.js code paths and checks that nothing crashes, freezes or injects
// markup (every remote string must reach the DOM as text).
//
// OFFLINE ONLY: every database host is blocked (blockDb: http route + routeWebSocket) and the Firebase SDK script is
// answered with a tiny in-page FAKE SDK (below) that keeps all data in memory. Nothing ever reaches the live
// database; the test asserts 0 blocked attempts and 0 sockets. The bot never chats.
// Run: python3 -m http.server 8440 &   BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/net-hostile-presence.test.js
const { chromium } = require('playwright');
const { check, done, offlineStub } = require('./helpers');
const LS = require('./lib/load-scale'); // cycle 4: the flood's frame window is load-scaled (factor 1 on an idle box: the strict 1.5 s). The time-sweep run counted 6 and 8 frames in 1.5 s at load factor 4 to 6.
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';

// In-memory stand-in for the firebase compat SDK (app + database). Every write is recorded in window.__fb.writes.
const FAKE_SDK = `(() => {
  const store = new Map(); const subs = []; const writes = []; let n = 0;
  const now = () => Date.now();
  const snap = (path, v) => ({ key: path.split('/').pop(), val: () => (v === undefined ? null : v), exists: () => v !== undefined && v !== null,
    numChildren: () => (v && typeof v === 'object' ? Object.keys(v).length : 0), ref: mkRef(path) });
  const fire = (path, ev, key, v) => subs.filter((s) => s.path === path && s.ev === ev).forEach((s) => { try { s.cb(snap(path + '/' + key, v)); } catch (e) { setTimeout(() => { throw e; }); } });
  const firePath = (path) => { const v = store.get(path); subs.filter((s) => s.path === path && s.ev === 'value').forEach((s) => s.cb(snap(path, v))); };
  function mkRef(path) {
    const ref = {
      key: path.split('/').pop(), path,
      child: (k) => mkRef(path + '/' + k),
      push(v) {
        const key = '-NfakeKey' + String(++n).padStart(6, '0'); const r = mkRef(path + '/' + key);
        if (v === undefined) return r;
        const p = r.set(v); r.then = p.then.bind(p); r.catch = p.catch.bind(p); return r;
      },
      set(v) { writes.push({ op: 'set', path, v }); store.set(path, v); setTimeout(() => firePath(path)); return Promise.resolve(); },
      update(v) { writes.push({ op: 'update', path, v }); store.set(path, Object.assign({}, store.get(path) || {}, v)); return Promise.resolve(); },
      remove() { writes.push({ op: 'remove', path }); store.delete(path); setTimeout(() => firePath(path)); return Promise.resolve(); },
      transaction(fn) {
        const cur = store.has(path) ? store.get(path) : null; const next = fn(cur === undefined ? null : cur);
        if (next === undefined) return Promise.resolve({ committed: false, snapshot: snap(path, cur) });
        writes.push({ op: 'transaction', path, v: next }); store.set(path, next);
        return Promise.resolve({ committed: true, snapshot: snap(path, next) });
      },
      once() { return Promise.resolve(snap(path, store.get(path))); },
      on(ev, cb) {
        subs.push({ path, ev, cb });
        if (ev === 'value') setTimeout(() => cb(snap(path, path === '.info/connected' ? true : path === '.info/serverTimeOffset' ? 0 : store.get(path))));
        return cb;
      },
      off(ev, cb) { for (let i = subs.length - 1; i >= 0; i--) if (subs[i].path === path && (!ev || subs[i].ev === ev) && (!cb || subs[i].cb === cb)) subs.splice(i, 1); },
      limitToLast() { return ref; },
      onDisconnect: () => ({ remove: () => Promise.resolve(), set: () => Promise.resolve(), cancel: () => Promise.resolve() }),
    };
    return ref;
  }
  const db = { ref: (p) => mkRef(p || ''), goOffline() {}, goOnline() {} };
  const database = () => db;
  database.ServerValue = { TIMESTAMP: { '.sv': 'timestamp' }, increment: (d) => ({ '.sv': { increment: d } }) };
  window.firebase = { apps: [], initializeApp() { window.firebase.apps.push({}); return {}; }, database };
  window.__fb = { writes, subs, store, now,
    emit: (path, ev, key, v) => fire(path, ev, key, v),
    listening: (path, ev) => subs.some((s) => s.path === path && s.ev === ev) };
})();`;

const ID = (i) => '-NhostileId' + String(i).padStart(4, '0'); // a valid-looking push key (8-40 of [-_A-Za-z0-9])
const BIG = 'W'.repeat(20000);
const HOSTILE_PLAYERS = [
  { name: BIG + '<img src=x onerror="window.__xss=1">', species: 'hero_<script>window.__xss=2</script>', frame: 'abc', x: 1200, y: 600 },
  { name: 12345, species: { evil: true }, frame: { a: 1 }, x: 'left', y: null },
  { name: '<b>bold</b>‮RTL⁦', species: '__proto__', frame: 1e308, x: 1e308, y: -1e308, facing: 'up', score: '9e99', title: '<img src=x onerror="window.__xss=3">', emote: 'E'.repeat(5000), emoteAt: -5 },
  { name: 'unknownHero', species: 'hero_dragonlord', frame: -1, x: 1300, y: 650, title: 'constructor', emote: '💬', emoteAt: 1 },
  { name: 'ArrSpecies', species: ['hero_ranger'], frame: [1], x: [1], y: { y: 1 }, score: { a: 1 } },
  { name: '   ', species: 'hero_ranger' }, // blank name: skipped
  { name: 'hero_' + 'x'.repeat(200), species: 'hero_' + 'x'.repeat(5000), frame: 3, x: 1250, y: 620, title: 'x'.repeat(10000) },
  { name: 'textureKey', species: '__MISSING', frame: 0, x: 1210, y: 610 },
  { name: 'heroOK', species: 'hero_necromancer', frame: 0, x: 1220, y: 615 },
];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const db = await offlineStub(ctx); // the fake in-page SDK route below is registered later, so it still answers the SDK request
  let sdkServed = 0;
  await ctx.route(/gstatic\.com\/firebasejs\//, (r) => {
    sdkServed++;
    const fake = /firebase-app-compat/.test(r.request().url());
    return r.fulfill({ status: 200, contentType: 'application/javascript', body: fake ? FAKE_SDK : '/* database-compat: provided by the fake above */' });
  });
  const page = await ctx.newPage();
  const sockets = []; page.on('websocket', (ws) => sockets.push(ws.url()));
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('dialog', (d) => { errors.push('dialog: ' + d.message()); d.dismiss().catch(() => {}); });
  await page.route('**/main.js*', async (route) => {
    const resp = await route.fetch();
    const body = (await resp.text()).replace('const game = new Phaser.Game(config);', 'const game = window.__g = new Phaser.Game(config);');
    route.fulfill({ response: resp, body });
  });

  await page.goto(BASE);
  await page.fill('#name-input', 'ADMINhostile');
  await page.click('.species-tab');
  await page.click('.avatar-choice');
  await page.click('button:has-text("Join Town")'); // joins the FAKE in-page town only (blockDb is on), same selector as nav-town.test.js
  await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 30000 });
  await page.waitForFunction(() => window.__fb.listening('players', 'child_added'), null, { timeout: 10000 });
  check('joined the town through the fake SDK (not the offline fallback)', await page.evaluate(() => { const s = window.__g.scene.getScene('Town'); return !!(s.net && s.net.db && s.net.id && !s.net.offline); }));

  // ---- 1. hostile presence records ----
  await page.evaluate((list) => {
    const id = (i) => '-NhostileId' + String(i).padStart(4, '0');
    list.forEach((p, i) => window.__fb.emit('players', 'child_added', id(i), p));
    window.__fb.emit('players', 'child_added', '__proto__', { name: 'protoKey', species: 'hero_ranger', frame: 0, x: 1200, y: 600 });
    window.__fb.emit('players', 'child_added', 'constructor', { name: 'ctorKey', species: 'hero_druid', frame: 0, x: 1200, y: 600 });
    window.__fb.emit('players', 'child_added', id(900), 'just a string');
    window.__fb.emit('players', 'child_added', id(901), null);
    window.__fb.emit('players', 'child_added', id(902), [1, 2, 3]);
  }, HOSTILE_PLAYERS);
  await page.waitForTimeout(600);
  // hostile updates to players that exist
  await page.evaluate(() => {
    const id = (i) => '-NhostileId' + String(i).padStart(4, '0');
    window.__fb.emit('players', 'child_changed', id(8), { name: 'heroOK', species: { x: 1 }, frame: 'z', x: 'a', y: 'b', emote: '👋', emoteAt: 99, title: '<svg onload="window.__xss=4">' });
    window.__fb.emit('players', 'child_changed', id(3), { name: 'unknownHero', species: 'hero_' + 'q'.repeat(100), frame: 9e9, x: 1300, y: 650, score: 5, title: 'toString' });
    window.__fb.emit('players', 'child_changed', id(999), { name: 'lateArrival', species: 'hero_paladin', frame: 0, x: 1200, y: 600 }); // never seen on child_added
    window.__fb.emit('players', 'child_removed', id(1), null);
    window.__fb.emit('players', 'child_removed', 'never-existed', null);
  });
  await page.waitForTimeout(600);
  const st1 = await page.evaluate(() => {
    const s = window.__g.scene.getScene('Town');
    const list = document.getElementById('player-list');
    const names = Array.from(s.remotePlayers.values()).map((rp) => rp.nameText.text);
    return {
      remote: s.remotePlayers.size, names,
      maxName: Math.max(0, ...names.map((n) => Array.from(n).length)),
      listTags: Array.from(list.querySelectorAll('*')).map((e) => e.tagName.toLowerCase()).filter((t) => !['li', 'span', 'button'].includes(t)),
      longestLi: Math.max(0, ...Array.from(list.querySelectorAll('li')).map((li) => li.textContent.length)),
      textures: Array.from(s.remotePlayers.values()).map((rp) => rp.visual.texture.key),
      frame0: window.__g.loop.frame,
    };
  });
  check('hostile presence: the well-formed and repairable records are drawn (blank/garbage records skipped)', st1.remote >= 8 && st1.remote <= 12, JSON.stringify({ remote: st1.remote, names: st1.names.map((n) => n.slice(0, 20)) }));
  check('hostile presence: every name tag is capped at 16 characters', st1.maxName <= 16, String(st1.maxName));
  check('hostile presence: the player list holds only li/span/button (no markup from names or titles)', st1.listTags.length === 0, st1.listTags.join(','));
  check('hostile presence: no player list line is longer than a name + score', st1.longestLi < 60, String(st1.longestLi));
  check('hostile presence: every remote avatar uses a real hero texture (no __MISSING box, no junk key)', st1.textures.every((k) => /^hero_[a-z]+$/.test(k)), st1.textures.join(','));

  // ---- 2. hostile chat, guestbook, blocks, realm invite, walkie ----
  await page.evaluate((big) => {
    const t = window.__fb.now();
    window.__fb.emit('chat', 'child_added', '-NchatA000001', { id: '-NhostileId0000', name: '<img src=x onerror="window.__xss=5">', text: big + '<script>window.__xss=6</script>', t });
    window.__fb.emit('chat', 'child_added', '-NchatA000002', { id: { x: 1 }, name: { a: 1 }, text: ['x'], t: 'now' });
    window.__fb.emit('chat', 'child_added', '-NchatA000003', 'string chat');
    window.__fb.emit('chat', 'child_added', '-NchatA000004', { id: '-NhostileId0008', name: 'heroOK', text: '‮reversed\u0000\u0007 <u>u</u>', t });
    window.__fb.emit('guestbook', 'child_added', '-NgbA00000001', { id: 1, name: '<i>x</i>', text: big, t: 'x' });
    window.__fb.emit('guestbook', 'child_added', '-NgbA00000002', { name: 'ok', text: '<img src=x onerror="window.__xss=7">', t });
    window.__fb.emit('blocks', 'child_added', '1_1', { x: 'a', y: 1, type: 'wood' });
    window.__fb.emit('blocks', 'child_added', '2_2', { x: 1e308, y: -1e308, type: '<b>' + big, ownerId: { a: 1 } });
    window.__fb.emit('blocks', 'child_added', '3_3', { x: 1210, y: 610, type: 'unknown-type', ownerId: '-NhostileId0000' });
    window.__fb.emit('blocks', 'child_removed', 'nope', null);
    const s = window.__g.scene.getScene('Town');
    window.__fb.emit('realmInvites/' + s.net.id, 'child_added', '-NinvA0000001', { party: '-NpartyA00001', from: '-NhostileId0000', fromName: big + '<img src=x onerror="window.__xss=8">', mode: '<script>', t });
    window.__fb.emit('realmInvites/' + s.net.id, 'child_added', '-NinvA0000002', { party: '../../players', from: '-NhostileId0000', fromName: 'x', mode: 'coop', t });
    window.__fb.emit('walkie/' + s.net.id, 'child_added', '-NwkA00000001', { from: { a: 1 }, fromName: '<b>x</b>', data: { not: 'a string' }, mime: 'text/html' });
  }, BIG);
  await page.waitForTimeout(700);
  const st2 = await page.evaluate(() => {
    const s = window.__g.scene.getScene('Town');
    const log = document.getElementById('chat-log');
    const inv = document.getElementById('realm-invite-text');
    const gb = s.guestbookEntries || [];
    return {
      chatTags: Array.from(log.querySelectorAll('*')).map((e) => e.tagName.toLowerCase()).filter((t) => !['div', 'span'].includes(t)),
      chatMax: Math.max(0, ...Array.from(log.children).map((c) => c.textContent.length)),
      chatLines: log.children.length,
      bidi: /[‪-‮⁦-⁩\u0000-\u001f]/.test(log.textContent),
      gbMax: Math.max(0, ...gb.map((e) => e.text.length)), gbN: gb.length,
      invKids: inv ? inv.children.length : -1, invLen: inv ? inv.textContent.length : -1, invParty: s.realmInviteIn ? s.realmInviteIn.party : null,
      title: document.title.length,
      xss: window.__xss || 0,
      injected: document.querySelectorAll('[onerror],[onload]').length,
    };
  });
  check('hostile chat: lines are text only (no injected elements) and capped near 140 characters', st2.chatTags.length === 0 && st2.chatMax <= 170 && st2.chatLines >= 2, JSON.stringify(st2));
  check('hostile chat: control and bidi characters are stripped', !st2.bidi);
  check('hostile guestbook: notes are capped at 80 characters', st2.gbMax <= 80, JSON.stringify({ gbMax: st2.gbMax, gbN: st2.gbN }));
  check('hostile invite: the toast is plain text, names capped, a path-like party id is rejected', st2.invKids === 0 && st2.invLen < 120 && st2.invParty === '-NpartyA00001', JSON.stringify(st2));
  check('no injected script ever ran (no window.__xss, no onerror/onload attributes in the page)', st2.xss === 0 && st2.injected === 0, JSON.stringify(st2));

  // ---- 3. a presence flood (a client writing hundreds of fake players) must not freeze the town ----
  const flood = await page.evaluate(async (waitMs) => {
    const t0 = performance.now();
    for (let i = 0; i < 300; i++) window.__fb.emit('players', 'child_added', '-NfloodId' + String(i).padStart(5, '0'), { name: 'flood' + i, species: 'hero_ranger', frame: 0, x: 1000 + (i % 30) * 10, y: 500 + Math.floor(i / 30) * 10 });
    const emitMs = performance.now() - t0;
    const f0 = window.__g.loop.frame;
    await new Promise((r) => setTimeout(r, waitMs));
    return { emitMs: Math.round(emitMs), frames: window.__g.loop.frame - f0, remote: window.__g.scene.getScene('Town').remotePlayers.size, waitMs };
  }, LS.budget(1500));
  console.log('INFO presence flood of 300 fake players: ' + JSON.stringify(flood) + ' (no client-side cap on remote players yet: see design/bugbash/netsafety.md)');
  check(`presence flood: the game loop keeps running afterwards (not frozen): 10 or more frames in ${LS.budget(1500)} ms (1500 ms on an idle box)`, flood.frames >= 10, JSON.stringify(flood));
  check('presence flood: delivering 300 records takes under 8 s on the main thread', flood.emitMs < 8000, JSON.stringify(flood));

  // ---- 4. the only things this client wrote are its own presence record and the player counter ----
  const w = await page.evaluate(() => {
    const s = window.__g.scene.getScene('Town');
    return { id: s.net.id, writes: window.__fb.writes.map((x) => ({ op: x.op, path: x.path })) };
  });
  const allowed = (x) => x.path === 'playerCount' || x.path === 'players/' + w.id
    || (x.op === 'remove' && (x.path.startsWith('realmInvites/' + w.id + '/') || x.path.startsWith('walkie/' + w.id + '/'))); // reading an invite / playing a memo deletes it from OUR inbox (read-once)
  const bad = w.writes.filter((x) => !allowed(x));
  check('writes: only own presence, the player counter and read-once deletes in our own inboxes (no chat/guestbook/blocks/walkie sends)', bad.length === 0, JSON.stringify(bad.slice(0, 6)));
  check('writes: the hostile invite was deleted only under our own realmInvites node', w.writes.filter((x) => /^realmInvites\//.test(x.path)).every((x) => x.path.startsWith('realmInvites/' + w.id + '/')), JSON.stringify(w.writes.filter((x) => /^realmInvites\//.test(x.path))));

  check('no page errors or dialogs through all of the above', errors.length === 0, errors.slice(0, 5).join(' | ').slice(0, 600));
  check('the fake SDK was served (both firebase scripts intercepted)', sdkServed >= 2, String(sdkServed));
  check('no database request or socket escaped the block', db.attempts() === 0 && sockets.length === 0, JSON.stringify({ http: db.http, ws: db.ws, sockets }));
  await browser.close();
  done();
})().catch((e) => { console.log('FAIL crashed: ' + (e && e.stack || e)); process.exitCode = 1; });
