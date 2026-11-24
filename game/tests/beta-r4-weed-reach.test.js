// R4 (integration 'weed 15 cannot be pulled'): no weed may sit where another E-interaction wins in interact(). The mailbox answers
// E within 70 px but weedSpotsForDay kept only 60 px clear, so a weed 63 px from it could never be pulled. Sweep: every day of a
// year (366 days from today) x every weed spot: stand on the weed and check that no earlier branch of interact() is in range
// (Able Sisters, campfire, shop, Polyroll, turnip stall, museum, every scavenger spot, workbench, mailbox, home, guestbook,
// Isles sign, postcards) and that findNearestWeed() picks that weed. OFFLINE ONLY: blockDb + stubbed Firebase SDK.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-r4-weed-reach.test.js
const { chromium } = require('playwright');
const { check, done, offlineStub } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const db = await offlineStub(ctx); // helpers: blockDb + the Firebase SDK answered empty (the same two routes this file used to set by hand)
  await ctx.route('**/main.js*', async (route) => {
    const resp = await route.fetch();
    route.fulfill({ response: resp, body: (await resp.text()).replace('const game = new Phaser.Game(config);', 'const game = window.__g = new Phaser.Game(config);') });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE);
  await page.fill('#name-input', 'ADMINweeds');
  await page.click('button:has-text("Join Town")');
  await page.waitForSelector('#join-offline-btn:not(.hidden)', { timeout: 20000 });
  await page.click('#join-offline-btn');
  await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 30000 });
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => {
    const s = window.__g.scene.getScene('Town');
    s.scavengerClaim = null;
    const keep = { spots: s.weedSpots, pulled: s.weedsPulledToday, x: s.localBody.x, y: s.localBody.y };
    const today = s.questDayBucket();
    const bad = []; let n = 0, days = 0, minSpots = 99;
    const earlier = [
      ['able sisters', () => s.isNearAbleSisters()], ['campfire', () => s.isNearCampfire()], ['shop', () => s.isNearShop()],
      ['polyroll', () => s.isNearPolyroll()], ['turnip stall', () => s.isNearTurnipStall()], ['museum', () => s.isNearMuseum()],
      ['scavenger (any day)', () => SCAVENGER_SPOTS.some((k) => Math.hypot(s.localBody.x - k.x, s.localBody.y - k.y) < SCAVENGER_RADIUS)],
      ['workbench', () => s.isNearWorkbench()], ['mailbox', () => s.isNearMailbox()], ['home', () => s.isNearHome()],
      ['guestbook', () => s.isNearGuestbook()], ['isles sign', () => s.isNearIslesSign()], ['postcards', () => s.isNearPostcards()],
    ];
    for (let d = today; d < today + 366; d++) {
      const spots = s.weedSpotsForDay(d); days++; minSpots = Math.min(minSpots, spots.length);
      s.weedSpots = spots; s.weedsPulledToday = new Set();
      spots.forEach((w, i) => {
        n++;
        s.localBody.x = w.x; s.localBody.y = w.y;
        const hit = earlier.filter((e) => e[1]()).map((e) => e[0]);
        const nearest = s.findNearestWeed();
        const picked = !!nearest && nearest.index === i;
        if (hit.length || !picked) bad.push({ day: d, i, x: w.x, y: w.y, hit, picked: !!picked });
      });
    }
    s.weedSpots = keep.spots; s.weedsPulledToday = keep.pulled; s.localBody.x = keep.x; s.localBody.y = keep.y;
    return { days, n, minSpots, bad: bad.slice(0, 8), badN: bad.length };
  });
  console.log(`  swept ${r.days} days, ${r.n} weeds (min ${r.minSpots} a day)`);
  check('a year of days, each with >= 20 weeds', r.days === 366 && r.minSpots >= 20, JSON.stringify({ days: r.days, min: r.minSpots }));
  check('no weed on any day sits inside an interaction that answers E before it, and each is the one E pulls', r.badN === 0, JSON.stringify(r.bad));
  // Cycle 1 S (cycle0-systems note): the reverse case. Weeds answer E BEFORE the arcade doors (and the dig hole, Realm Gate and the
  // visiting merchant), so a weed inside such a ring would steal E from it. No weed may sit where its pull range (WEED_PULL_RADIUS)
  // overlaps the real interact ring of any of them: dist(weed, target) >= target radius + WEED_PULL_RADIUS, every day of a year.
  const rv = await page.evaluate(() => {
    const s = window.__g.scene.getScene('Town');
    const today = s.questDayBucket();
    const later = PORTALS.map((p) => ({ name: p.label, x: p.x, y: p.y, r: DOOR_RADIUS }))
      .concat([{ name: 'dig hole', x: DIG_HOLE_POS.x, y: DIG_HOLE_POS.y, r: DIG_HOLE_RADIUS }, { name: 'realm gate', x: REALM_GATE_POS.x, y: REALM_GATE_POS.y + 30, r: REALM_GATE_RADIUS },
        { name: 'merchant (any day)', x: MERCHANT_POS.x, y: MERCHANT_POS.y, r: MERCHANT_RADIUS }]);
    const bad = []; let n = 0; const doorStand = [];
    for (let d = today; d < today + 366; d++) {
      const spots = s.weedSpotsForDay(d);
      spots.forEach((w) => { n++; later.forEach((t) => { const dd = Math.hypot(w.x - t.x, w.y - t.y); if (dd < t.r + WEED_PULL_RADIUS) bad.push({ day: d, t: t.name, d: Math.round(dd), x: w.x, y: w.y }); }); });
    }
    // and a live check: standing on each door's centre with today's weeds, E goes to the door (no weed in reach)
    PORTALS.forEach((p) => { s.localBody.x = p.x; s.localBody.y = p.y; doorStand.push(!s.findNearestWeed() && s.isNearDoor()); });
    return { n, badN: bad.length, bad: bad.slice(0, 6), doorStand, names: later.map((t) => t.name) };
  });
  check('no weed on any day sits where it would steal E from an arcade door, the dig hole, the Realm Gate or the merchant (real radii)', rv.badN === 0 && rv.n > 0 && rv.names.length === 7, JSON.stringify({ badN: rv.badN, bad: rv.bad }));
  check('standing on each of the 4 arcade doors today, E reaches the door (no weed in pull range)', rv.doorStand.length === 4 && rv.doorStand.every(Boolean), JSON.stringify(rv.doorStand));
  check('no page errors', errors.length === 0, errors.join(' | '));
  check('no database traffic', db.attempts() === 0);
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
