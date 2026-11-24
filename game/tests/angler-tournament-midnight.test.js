// Lakeside Angler: a tournament that is open when the calendar day turns (cycle 2, L clock scan).
// Before the fix every tournament call used "today": after midnight the open run could take no cast ("No casts left"),
// could not finish, and kept the other spots and all normal fishing locked until a reload.
// The page reads the REAL device date here (no ?day=): the date is faked with page.clock in three time zones.
// Run: BASE=http://localhost:9721/game/index.html NODE_PATH=$(npm root -g) node game/tests/angler-tournament-midnight.test.js
// Standalone page, no Firebase, no external network.
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = ORIGIN + '/game/games/angler/index.html?test=1&seed=mid&day=real'; // day=real is not a number, so the page uses the device date
const KEY = 'pixeltown-angler-v1';

const castOnce = (page) => page.evaluate(() => {
  const a = window.__angler;
  a.tap(); if (!a.bite) return 'nocast:' + a.state;
  a.advance(a.bite.wait + 0.2); a.tap();
  for (let i = 0; i < 4000 && a.state === 'reeling'; i++) { a.setHold(a.reel.tension < a.reel.pos); a.advance(1 / 30); }
  a.setHold(false);
  const out = a.result ? a.result.outcome + ':' + a.result.fish : a.state;
  a.dismiss();
  return out;
});

(async () => {
  const browser = await chromium.launch();
  for (const tz of ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 }, timezoneId: tz });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    // 23:59:30 local on 24 Nov 2026 in this zone
    await page.goto(ORIGIN + '/game/games/angler/index.html?test=1');
    const late = await page.evaluate(() => new Date(2026, 10, 24, 23, 59, 30).getTime());
    await page.clock.setFixedTime(late);
    await page.goto(URL);
    await page.waitForFunction(() => window.__angler);
    const day0 = await page.evaluate(() => __angler.day);
    const want0 = Math.floor(Date.UTC(2026, 10, 24) / 86400000);
    check(tz + ': the tournament day is the local calendar day (24 Nov)', day0 === want0, day0 + ' vs ' + want0);
    const info0 = await page.evaluate(() => { __angler.tourney.start(); return __angler.tourney.info(); });
    const before = [await castOnce(page), await castOnce(page)];
    check(tz + ': two casts used before midnight', await page.evaluate(() => __angler.tourney.run.used === 2), before.join());

    await page.clock.setFixedTime(late + 60000); // 00:00:30 on 25 Nov
    check(tz + ': the device day moved on by one', await page.evaluate(() => __angler.day) === day0 + 1);
    check(tz + ': the open run is still the tournament in play', await page.evaluate(() => __angler.tourney.active && __angler.tourney.run && __angler.tourney.run.used === 2));
    const other = ['west', 'east', 'river', 'pier'].find((s) => s !== info0.spot);
    check(tz + ': the run keeps its own spot after midnight', await page.evaluate(([spot, o]) => {
      const a = __angler; return a.spot === spot && a.pickSpot(o) === false && a.pickSpot(spot) === true && a.spot === spot;
    }, [info0.spot, other]));
    const wait3 = await page.evaluate((d) => window.MMAnglerDepth.tournament.castFor(d, 2).wait, day0);
    const third = await page.evaluate(() => { const a = __angler; a.tap(); return { used: a.tourney.run ? a.tourney.run.used : -1, wait: a.bite ? a.bite.wait : -1, state: a.state }; });
    check(tz + ': the third cast is taken after midnight, with the start day\'s seeded bite', third.used === 3 && Math.abs(third.wait - wait3) < 1e-9, JSON.stringify(third));
    await page.evaluate(() => {
      const a = __angler; a.advance(a.bite.wait + 0.2); a.tap();
      for (let i = 0; i < 4000 && a.state === 'reeling'; i++) { a.setHold(a.reel.tension < a.reel.pos); a.advance(1 / 30); }
      a.setHold(false); a.dismiss();
    });
    const rest = [await castOnce(page), await castOnce(page)];
    const res = await page.evaluate(() => ({ r: __angler.tourney.result, active: __angler.tourney.active, st: __angler.tourney.state }));
    check(tz + ': the run finishes after midnight (result, lake unlocked)', !!res.r && res.active === false && res.st.run === null, JSON.stringify(res) + ' ' + rest.join());
    check(tz + ': it counts for the day it was started', !!res.r && res.r.day === day0 && res.st.last === day0 && res.st.played === 1 && res.st.streak === 1);
    const saved = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), KEY));
    check(tz + ': saved as the start day, nothing else changed in shape', saved.tour.last === day0 && saved.tour.run === null && !!saved.caught && !!saved.gear);
    check(tz + ': normal fishing works again (other spots open)', await page.evaluate((o) => { __angler.dismiss(); return __angler.pickSpot(o) === true && __angler.spot === o; }, other));
    const next = await page.evaluate(() => { const ok = __angler.tourney.start(); return { ok, day: __angler.tourney.run && __angler.tourney.run.day, info: __angler.tourney.info().day }; });
    check(tz + ': the new day\'s tournament can be started straight after', next.ok === true && next.day === day0 + 1 && next.info === day0 + 1, JSON.stringify(next));
    for (let i = 0; i < 5; i++) await castOnce(page);
    check(tz + ': playing it makes the streak 2 (yesterday then today)', await page.evaluate(() => __angler.tourney.result && __angler.tourney.result.streak === 2 && __angler.tourney.state.played === 2));
    check(tz + ': no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // the last cast is thrown before midnight and lands after it
  {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 }, timezoneId: 'Asia/Tokyo' });
    const page = await ctx.newPage();
    await page.goto(ORIGIN + '/game/games/angler/index.html?test=1');
    const late = await page.evaluate(() => new Date(2026, 11, 31, 23, 59, 50).getTime());
    await page.clock.setFixedTime(late);
    await page.goto(URL);
    await page.waitForFunction(() => window.__angler);
    const day0 = await page.evaluate(() => { __angler.tourney.start(); return __angler.day; });
    for (let i = 0; i < 4; i++) await castOnce(page);
    await page.evaluate(() => { __angler.tap(); });
    await page.clock.setFixedTime(late + 20000); // New Year, the fish is still on the line
    await page.evaluate(() => {
      const a = __angler; a.advance(a.bite.wait + 0.2); a.tap();
      for (let i = 0; i < 4000 && a.state === 'reeling'; i++) { a.setHold(a.reel.tension < a.reel.pos); a.advance(1 / 30); }
      a.setHold(false);
    });
    const res = await page.evaluate(() => ({ r: __angler.tourney.result, active: __angler.tourney.active, day: __angler.day }));
    check('New Year in Tokyo: a cast in flight at midnight still ends the run', res.day === day0 + 1 && !!res.r && res.r.day === day0 && res.active === false, JSON.stringify(res));
    await ctx.close();
  }
  await browser.close();
  done();
})();
