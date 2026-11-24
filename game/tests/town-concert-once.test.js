// cycle0 L-02: the campfire concert pays its bonus once per show. The show runs 19:00-21:00 (local) and the "already enjoyed"
// key used to end in the hour, so it paid again at 20:00. Fixed clock (page.clock), real interact() path at the campfire.
// OFFLINE: helpers.offlineStub (database blocked, Firebase SDK answered empty).
// Run: BASE=http://localhost:9701/game/index.html NODE_PATH=$(npm root -g) node game/tests/town-concert-once.test.js
const { chromium } = require('playwright');
const { check, done, offlineStub, exposeGame, joinOffline } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 }, timezoneId: 'Europe/Berlin' });
  const db = await offlineStub(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await exposeGame(page);
  await page.goto(BASE);
  await joinOffline(page, 'ADMINshow');
  const at = (iso) => page.clock.setFixedTime(new Date(iso)); // Berlin is UTC+1 in November
  // stand at the campfire and enjoy the show (what interact() calls there), return what happened to the score and the save
  const enjoy = () => page.evaluate(() => {
    const s = window.__g.scene.getScene('Town');
    const before = s.localScore;
    let x = s.localBody.x, y = s.localBody.y;
    for (let i = 0; i < 400 && !s.isNearCampfire(); i++) { // find the campfire by walking the body over a coarse grid
      x = 40 + (i % 20) * 60; y = 40 + Math.floor(i / 20) * 60; s.localBody.setPosition(x, y);
    }
    const near = s.isNearCampfire(), live = s.isConcertTime();
    if (near && live) s.enjoyConcert();
    return { near, live, gained: s.localScore - before, key: s.concertWindowKey(), saved: JSON.parse(localStorage.getItem('pixeltown-save-v1') || '{}').kkEnjoyedWindow };
  });

  await at('2026-11-10T17:30:00Z'); // 18:30 local: no show yet
  const early = await enjoy();
  check('18:30: at the campfire, no show, nothing paid', early.near && !early.live && early.gained === 0, JSON.stringify(early));
  await at('2026-11-10T18:30:00Z'); // 19:30 local
  const first = await enjoy();
  check('19:30: the show pays +2 once and the save remembers the evening', first.live && first.gained === 2 && first.saved === first.key, JSON.stringify(first));
  const again = await enjoy();
  check('19:30 again: nothing more', again.gained === 0, JSON.stringify(again));
  await at('2026-11-10T19:30:00Z'); // 20:30 local: the SAME show, second hour
  const second = await enjoy();
  check('20:30, same show: nothing more (it paid a second time before the fix)', second.live && second.gained === 0 && second.saved === first.saved, JSON.stringify(second));
  await at('2026-11-11T18:30:00Z'); // the next evening
  const next = await enjoy();
  check('the next evening pays again', next.live && next.gained === 2 && next.saved !== first.saved, JSON.stringify(next));

  // a save written by the older per-hour key the same evening still counts as "enjoyed" (no extra payout after the update)
  const old = await page.evaluate(() => {
    const s = window.__g.scene.getScene('Town'); const before = s.localScore;
    s.kkEnjoyedWindow = s.concertWindowKey() + '-19'; s.enjoyConcert();
    const same = s.localScore - before;
    s.kkEnjoyedWindow = '2026-10-1-19'; s.enjoyConcert(); // another day whose key shares a prefix with nothing of today
    return { same, other: s.localScore - before };
  });
  check('an old per-hour key of this evening still blocks; one of another day does not', old.same === 0 && old.other === 2, JSON.stringify(old));
  check('no page errors', errors.length === 0, errors.join(' | '));
  check('offline: no request reached the database hosts', db.attempts() === 0, String(db.attempts()));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
