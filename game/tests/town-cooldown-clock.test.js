// cycle0 L-06: the Town's in-session respawn cooldowns (trees, rocks, fossils, flowers, beach) compared Date.now() stamps. A device
// clock moved FORWARD skipped the cooldown at once; a clock moved BACK froze the spot ("now - stamp" negative) until the clock
// caught up. They now use a monotonic clock. Real time is used on purpose: the tree cooldown is 20 s, so this test waits 21 s.
// OFFLINE: helpers.offlineStub (database blocked, Firebase SDK answered empty).
// Run: BASE=http://localhost:9701/game/index.html NODE_PATH=$(npm root -g) node game/tests/town-cooldown-clock.test.js
const { chromium } = require('playwright');
const { check, done, offlineStub, exposeGame, joinOffline } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const db = await offlineStub(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await exposeGame(page);
  await page.goto(BASE);
  await joinOffline(page, 'ADMINcool');

  // shake one tree through interact() (the real key path) and pick up one beach item; remember which
  const got = await page.evaluate(() => {
    const s = window.__g.scene.getScene('Town'); const out = { tree: -1, beach: -1, wood: 0 };
    const at = (x, y) => { s.localBody.x = x; s.localBody.y = y; if (s.localBody.body && s.localBody.body.reset) s.localBody.body.reset(x, y); };
    for (let i = 0; i < TREES.length && out.tree < 0; i++) {
      at(TREES[i][0], TREES[i][1] - 10);
      const t = s.findNearestTree(); if (!t || t.index !== i) continue;
      const before = s.resources.wood || 0; s.interact();
      if ((s.resources.wood || 0) === before + 1 && s.treeCooldowns[i]) { out.tree = i; out.wood = 1; }
    }
    for (let i = 0; i < BEACH_SPOTS.length && out.beach < 0; i++) {
      at(BEACH_SPOTS[i].x, BEACH_SPOTS[i].y);
      const b = s.findNearestBeachItem(); if (!b || b.index !== i) continue;
      s.collectBeachItem(b); out.beach = i;
    }
    return out;
  });
  check('setup: one tree shaken through interact() (+1 wood) and one beach item picked up', got.tree >= 0 && got.beach >= 0 && got.wood === 1, JSON.stringify(got));
  const t0 = Date.now();
  // is that tree / that beach spot offered again when the player stands on it?
  const ready = () => page.evaluate((g) => {
    const s = window.__g.scene.getScene('Town');
    const at = (x, y) => { s.localBody.x = x; s.localBody.y = y; if (s.localBody.body && s.localBody.body.reset) s.localBody.body.reset(x, y); };
    at(TREES[g.tree][0], TREES[g.tree][1] - 10); const t = s.findNearestTree();
    at(BEACH_SPOTS[g.beach].x, BEACH_SPOTS[g.beach].y); const b = s.findNearestBeachItem();
    return { tree: !!t && t.index === g.tree, beach: !!b && b.index === g.beach, clock: Date.now() };
  }, got);

  // The device clock as the page reads it (Date.now / new Date), moved by `ms`. page.clock is not used: its fixed time also
  // freezes performance.now, which is exactly the clock a real device does NOT change when its wall clock is set.
  const shift = (ms) => page.evaluate((off) => {
    const D = window.__realDate || (window.__realDate = Date); const now = () => D.now() + off;
    window.Date = class extends D { constructor(...a) { if (a.length) super(...a); else super(now()); } static now() { return now(); } };
  }, ms);
  const a = await ready();
  check('right after: both are cooling down', !a.tree && !a.beach, JSON.stringify(a));
  await shift(3600000); // the device clock jumps one hour ahead
  const fwd = await ready();
  check('device clock +1 h: still cooling (a clock change is not a free respawn)', fwd.clock >= t0 + 3590000 && !fwd.tree && !fwd.beach, JSON.stringify(fwd));
  await shift(-3600000); // and one hour back
  const back0 = await ready();
  check('device clock -1 h: still cooling inside the 20 s', back0.clock <= t0 - 3590000 && !back0.tree && !back0.beach, JSON.stringify(back0));
  await page.waitForTimeout(Math.max(0, 21500 - (Date.now() - t0))); // the real 20 s pass (the page clock still reads one hour ago)
  const back = await ready();
  check('device clock -1 h, 21 s later: the tree and the beach item are back (they stayed frozen before the fix)', back.clock <= t0 - 3500000 && back.tree && back.beach, JSON.stringify(back));
  check('no page errors', errors.length === 0, errors.join(' | '));
  check('offline: no request reached the database hosts', db.attempts() === 0, String(db.attempts()));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
