// Cycle 3 (L): the Isles read the day ONCE per page load. A tab left open over 00:00 UTC (a phone tab can live for days) kept
// yesterday's gather spots (all taken = nothing to gather), and the spent sparkle and glint budgets, until a reload. Now the page moves
// to the new day by itself (dayRoll, checked at 5 Hz) and ends in the same state a reload on the new day gives.
// The device date is faked (page.clock) from 23:59:30 to 00:00:30 UTC in three device time zones: the Isles day is the UTC date in
// every zone, as before (the rule is not changed here; L-08). ?today= still pins the day. The standalone Isles page makes no database
// request (counted).
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc3-isles-day-roll.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/isles/index.html?test=1&isle=jungle&seed=7';
const ev = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__isles, ${JSON.stringify(arg === undefined ? null : arg)})`);
const ready = (page) => page.waitForFunction(() => window.__isles && window.__isles.world, null, { timeout: 20000 });
const state = (page) => ev(page, (I) => ({ day: I.day, rolls: I.dayRolls(), spots: I.spots().map((s) => s.idx + ':' + s.kind + ':' + s.x + ',' + s.y).sort(), taken: I.spots().filter((s) => s.taken).length, nodes: I.nodeTiles().sort((a, b) => a - b), sparkles: I.sparkles() }));
const LATE = Date.UTC(2026, 11, 10, 23, 59, 30);

(async () => {
  const browser = await chromium.launch();
  for (const tz of ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 }, timezoneId: tz });
    await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: 'town' }));
    const page = await ctx.newPage(); const errors = []; let dbReq = 0;
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('request', (r) => { if (/firebaseio|firebasedatabase|identitytoolkit/.test(r.url())) dbReq++; });
    await page.clock.setFixedTime(LATE);
    await page.goto(PAGE); await ready(page);
    await ev(page, (I) => { I.god(true); I.clearCreatures(); });
    const a = await state(page);
    check(tz + ': 23:59:30 UTC on 10 Dec: the Isles day is 2026-12-10 (the UTC date, whatever the device zone)', a.day === '2026-12-10' && a.rolls === 0, a.day);
    check(tz + ': there are gather spots, and no resource tile is both a spot and a walk-over node', a.spots.length >= 3 && a.spots.every((s) => a.nodes.indexOf(Number(s.split(':')[0])) < 0), a.spots.length + ' spots');
    // take every spot of 10 Dec
    const got = await ev(page, (I) => { let n = 0; I.spots().forEach((s) => { I.teleport(s.x, s.y); const r = I.gather(); if (r && r.ok) n++; }); return { n, left: I.spots().filter((s) => !s.taken).length, log: I.gatherLog() }; });
    check(tz + ': all of today\'s spots gathered (' + got.n + '), none left', got.n >= 3 && got.left === 0, JSON.stringify(got));
    // midnight UTC passes while the page stays open
    await page.clock.setFixedTime(LATE + 60000);
    await page.waitForFunction(() => window.__isles.dayRolls() >= 1, null, { timeout: 15000 }).catch(() => {});
    const b = await state(page);
    check(tz + ': 00:00:30 UTC: the open page moved to 2026-12-11 by itself (was: still 10 Dec until a reload)', b.day === '2026-12-11' && b.rolls === 1, JSON.stringify({ day: b.day, rolls: b.rolls }));
    check(tz + ': the new day has its own spots, none taken (was: yesterday\'s, all taken)', b.spots.length >= 3 && b.taken === 0 && b.spots.join() !== a.spots.join(), b.taken + ' taken; same spots: ' + (b.spots.join() === a.spots.join()));
    check(tz + ': still no tile that is both a spot and a node, and no resource tile was lost', b.spots.every((s) => b.nodes.indexOf(Number(s.split(':')[0])) < 0) && b.spots.length + b.nodes.length === a.spots.length + a.nodes.length, (b.spots.length + b.nodes.length) + ' vs ' + (a.spots.length + a.nodes.length));
    const g2 = await ev(page, (I) => { const s = I.spots()[0]; I.teleport(s.x, s.y); const r1 = I.gather(); const r2 = I.gather(); return { ok1: !!(r1 && r1.ok), ok2: !!(r2 && r2.ok), log: I.gatherLog() }; });
    const total = (o) => Object.keys(o).reduce((n, k) => n + o[k], 0);
    check(tz + ': a new spot can be gathered once (not twice); the collection log kept yesterday\'s finds', g2.ok1 && !g2.ok2 && total(g2.log) === total(got.log) + 1, JSON.stringify(g2));
    check(tz + ': the same minute again does not roll twice', (await ev(page, (I) => I.dayRoll())) === false && (await state(page)).rolls === 1);
    // a reload on the new day gives exactly the state the open page rolled into
    await page.waitForTimeout(1200); // the save is written on its own timer
    await ev(page, (I) => { if (I.save) I.save(); });
    await page.goto(PAGE); await ready(page);
    const c = await state(page);
    check(tz + ': a reload on 11 Dec shows the same spots and the same walk-over nodes as the page that stayed open', c.day === '2026-12-11' && c.rolls === 0 && c.spots.join() === b.spots.join() && c.nodes.join() === b.nodes.join(), JSON.stringify({ day: c.day, spots: c.spots.join() === b.spots.join(), nodes: c.nodes.join() === b.nodes.join() }));
    // ?today= pins the day as before
    await page.goto(PAGE + '&today=2026-12-01'); await ready(page);
    await page.clock.setFixedTime(LATE + 3 * 86400000);
    await page.waitForTimeout(700);
    const p = await state(page);
    check(tz + ': ?today=2026-12-01 pins the day: no roll three days later', p.day === '2026-12-01' && p.rolls === 0 && (await ev(page, (I) => I.dayRoll())) === false, JSON.stringify({ day: p.day, rolls: p.rolls }));
    check(tz + ': no page errors, no database request', errors.length === 0 && dbReq === 0, errors.join(' | ') + ' ' + dbReq);
    await ctx.close();
  }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
