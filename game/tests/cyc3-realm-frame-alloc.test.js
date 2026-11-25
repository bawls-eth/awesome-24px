// Cycle 3 (L hot path): what the Realm world allocates per frame while the hero stands among sleeping and waking enemies, measured with
// the browser's sampling heap profiler over CDP (128 byte interval, collected objects included), as cycle 2 did for Deepdelve.
// Three per-frame costs are pinned at (near) zero:
//  1. realm.js _nearest: solo it measured a distance with Math.hypot for every enemy every frame (a boxed number each) to pick "the
//     nearest player" out of one player. Now solo it returns the player at once. An oracle (the old function, kept below) is compared
//     with the new one over 4000 random points in 6 team states.
//  2. realm-world.js quietTick: a 'level|xp|kills|shards|items|uid' string every frame; now six numbers.
//  3. realm-world.js drawSites: 3 closures, an {x, y} object per shrine and NPC and two key strings per shrine every frame; now loops.
// Bytes only; no millisecond claims (shared machine). Realm world, blockDb, db.attempts() === 0.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc3-realm-frame-alloc.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const ORIGIN = new URL(BASE).origin;
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&heropick=0&tutorial=0&seed=12345&qdate=2030-05-01';
const SAVE = { realm: { level: 4, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 } } };
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await blockDb(ctx);
  await ctx.route('**/game/index.html*', (rt) => rt.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', s); }, JSON.stringify(SAVE));
  await page.goto(WORLD);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
  await page.evaluate(() => { const a = window.__mm.arena; a.player.iframes = 1e9; a._hitPlayer = () => {}; });
  await page.waitForFunction(() => window.__mm.arena.enemies.filter((e) => e.active).length >= 20, null, { timeout: 30000 });
  await frames(page, 600); // warm: the hot functions are compiled, the chunk and sprite caches are full

  // ---- heap sampling over N frames ----
  const N = 300;
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.startSampling', { samplingInterval: 128, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  const live = await page.evaluate((n) => new Promise((res) => { const a = window.__mm.arena; let i = 0, en = 0; const f = () => { for (let k = 0; k < a.enemies.length; k++) if (a.enemies[k].active) en++; if (++i >= n) res(en / n); else requestAnimationFrame(f); }; requestAnimationFrame(f); }), N);
  const { profile } = await cdp.send('HeapProfiler.stopSampling');
  await cdp.detach();
  const self = {}; const tree = {}; let total = 0;
  (function walk(n, inside) {
    const file = n.callFrame.url.replace(/.*\//, '').replace(/\?.*/, ''); const name = n.callFrame.functionName || '(anon)';
    const here = inside.slice(); if (/^(realm\.js|realm-world\.js)$/.test(file) && name !== '(anon)') here.push(name);
    if (/realm|mad-maze|mm-/.test(file)) { self[name] = (self[name] || 0) + n.selfSize; total += n.selfSize; }
    here.forEach((k) => { tree[k] = (tree[k] || 0) + n.selfSize; }); // everything allocated under a named Realm function, callees included
    n.children.forEach((c) => walk(c, here));
  })(profile.head, []);
  const per = (v) => Math.round((v || 0) / N);
  const top = Object.entries(self).sort((a, b) => b[1] - a[1]).slice(0, 8).map((e) => e[0] + ' ' + per(e[1]));
  console.log('Realm world, ' + live.toFixed(1) + ' live enemies: ' + per(total) + ' bytes per frame in the game\'s own code (' + N + ' frames). Top: ' + top.join(', '));
  console.log('per frame: _nearest ' + per(self._nearest) + ' B, quietTick ' + per(self.quietTick) + ' B, drawSites with its callees ' + per(tree.drawSites) + ' B (self ' + per(self.drawSites) + ', sPx ' + per(self.sPx) + ')');
  check('the scene is busy: >= 20 live enemies on average', live >= 20, String(live));
  check('_nearest allocates nothing per frame solo (was about 10 bytes per enemy: 716 B/frame at 72 enemies)', per(self._nearest) <= 24, per(self._nearest) + ' B/frame');
  check('quietTick builds no signature string per frame (was 246 B/frame)', per(self.quietTick) <= 120, per(self.quietTick) + ' B/frame');
  check('drawSites and its callees: no closures, objects or key strings per frame (was about 650 B/frame)', per(tree.drawSites) <= 160, per(tree.drawSites) + ' B/frame'); // sPx is still used by the 4 Hz site and camp ticks

  // ---- Math.hypot calls per frame (counted, exact) ----
  const hyp = await page.evaluate((n) => new Promise((res) => {
    const a = window.__mm.arena; const h0 = Math.hypot; let calls = 0, en = 0, i = 0;
    Math.hypot = function () { calls++; return h0.apply(Math, arguments); };
    const f = () => { for (let k = 0; k < a.enemies.length; k++) if (a.enemies[k].active) en++; if (++i >= n) { Math.hypot = h0; res({ calls: calls / n, en: en / n }); } else requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }), 120);
  console.log('Math.hypot: ' + hyp.calls.toFixed(1) + ' calls per frame with ' + hyp.en.toFixed(1) + ' live enemies');
  check('fewer Math.hypot calls per frame than live enemies (was one per enemy in _nearest, plus the awake ones)', hyp.calls < hyp.en * 0.75, JSON.stringify(hyp));

  // ---- same answers as the old _nearest (oracle) ----
  const same = await page.evaluate(() => {
    const a = window.__mm.arena;
    const old = function (x, y) { // realm.js before cycle 3, word for word
      let best = this.down ? null : this.player; let bd = best ? Math.hypot(best.x - x, best.y - y) : 1e9;
      const t = this.team;
      if (t && t.role === 'host' && t.partner && t.partner.ready && !t.partner.down) {
        const d = Math.hypot(t.partner.x - x, t.partner.y - y);
        if (d < bd) { best = t.partner; bd = d; }
      }
      return best || this.player;
    };
    const team0 = a.team, down0 = a.down; let s = 7; const rnd = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; };
    const partner = { x: a.player.x + 300, y: a.player.y - 120, ready: true, down: false };
    const states = [
      ['solo', null, false], ['solo, hero down', null, true],
      ['host + ready partner', { role: 'host', partner: partner }, false], ['host + ready partner, hero down', { role: 'host', partner: partner }, true],
      ['host + partner down', { role: 'host', partner: Object.assign({}, partner, { down: true }) }, false], ['guest', { role: 'guest', partner: partner }, false],
      ['host + partner not ready', { role: 'host', partner: Object.assign({}, partner, { ready: false }) }, true]
    ];
    const out = { bad: 0, n: 0, partnerWins: 0, first: '' };
    try {
      states.forEach((st) => {
        a.team = st[1]; a.down = st[2];
        for (let i = 0; i < 4000 / 5; i++) {
          const x = a.player.x + (rnd() - 0.5) * 1200, y = a.player.y + (rnd() - 0.5) * 1200;
          const got = a._nearest(x, y), want = old.call(a, x, y); out.n++;
          if (got !== want) { out.bad++; if (!out.first) out.first = st[0]; }
          if (got && got !== a.player) out.partnerWins++;
        }
      });
    } finally { a.team = team0; a.down = down0; }
    return out;
  });
  check('_nearest gives the old answer in 7 team states (' + same.n + ' points, the partner is nearest in ' + same.partnerWins + ')', same.bad === 0 && same.n >= 4000 && same.partnerWins > 300, JSON.stringify(same));

  // ---- the quiet-world rule still works on the six numbers: progress restarts its 15 s timer, no progress nudges ----
  // Every live enemy is kept outside the quiet radius (14 tiles) for the whole run, so only the timer decides.
  // Cycle 7 (ID-51 idle-hero rest, owner-approved): the nudge is for a hero who PLAYS but earns nothing; a hero with no input for 8 s rests and
  // is never nudged. So phases A and B stand in for a playing hero (a._wake() each frame = play input), and a new phase C stops the input:
  // once the hero rests, 10 s of no progress give no nudge.
  const quiet = await page.evaluate(() => new Promise((res) => {
    const a = window.__mm.arena, w = window.__mm.world, R = 14 * 32 * 3;
    const out = { on: w.quiet().on, a0: w.quiet().nudges, a1: -1, b1: -1, secA: 0, secB: 0, c0: -1, c1: -1, rested: false, secC: 0 };
    const t0 = a.clock; let bumpAt = t0; let phase = 'A'; let tB = 0; // the first bump at once: the hero has been idle since the page opened
    const f = () => {
      const p = a.player; if (phase !== 'C') a._wake(); // a playing hero (input every frame) until phase C
      for (let k = 0; k < a.enemies.length; k++) { const e = a.enemies[k]; if (e.active && Math.abs(e.x - p.x) < R && Math.abs(e.y - p.y) < R) { e.x = p.x + R; e.ax = e.x; } }
      if (phase === 'A') {
        if (a.clock >= bumpAt) { a.save.xp = (a.save.xp | 0) + 1; bumpAt += 4; } // progress every 4 s: the timer never reaches 15 s
        if (a.clock - t0 >= 20) { out.a1 = w.quiet().nudges; out.secA = a.clock - t0; phase = 'B'; tB = a.clock; }
      } else if (phase === 'B') { if (a.clock - tB >= 17.5) { out.b1 = w.quiet().nudges; out.secB = a.clock - tB; phase = 'C'; tB = a.clock; } }
      else if (!out.rested) { if (a.resting) { out.rested = true; out.c0 = w.quiet().nudges; tB = a.clock; } else if (a.clock - tB > 15) { res(out); return; } }
      else if (a.clock - tB >= 10) { out.c1 = w.quiet().nudges; out.secC = a.clock - tB; out.stillResting = a.resting; res(out); return; }
      requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }));
  check('quiet rule: 20 s with progress every 4 s gives no nudge', quiet.on === true && quiet.a1 === quiet.a0, JSON.stringify(quiet));
  check('quiet rule: then 17.5 s with no progress nudges (the timer runs on the same six numbers)', quiet.b1 > quiet.a1, JSON.stringify(quiet));
  check('ID-51: with the input stopped the hero rests within 15 s, and 10 s of resting with no progress give NO nudge', quiet.rested && quiet.stillResting === true && quiet.c1 === quiet.c0 && quiet.secC >= 10, JSON.stringify(quiet));
  check('no page errors, 0 DB requests', !errors.length && db.attempts() === 0, JSON.stringify(errors.slice(0, 3)));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
