// Cycle 9 D (item 2): playtest numbers for the two ID-18 deviations S reported in cycle 8 (pick-flower instead of water-flower; "Say hi to 2 neighbors"
// for `wave`) and for ID-09 days-in-town, in the REAL Town (OFFLINE stub, literal db.attempts() === 0, no chat, no Firebase write).
// Pins what a player sees: (1) a real interact() next to a flower counts 1 per flower and a picked flower does not count twice before it regrows;
// (2) a real interact() next to a neighbor counts the FIRST hello of the day only, per neighbor, two different neighbors fill "Say hi to 2";
// (3) at night (the villagers sleep, local 23:00-05:59) a hello does NOT count (measured: the row waits, nothing is lost); (4) ID-09: a save whose
// lastVisitDate is 5 days old gets +1 (not +5), the badge says "Days in town N+1" and a same-day reload pays nothing more.
// It also prints INFO numbers: flower spots, mean nearest-flower distance, villagers, time to finish both rows with a walker at the avatar speed.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc9-design-town-bounty-deviations.test.js
const path = require('path');
const { chromium } = require('playwright');
const { check, done, offlineStub, exposeGame, joinOffline } = require('./helpers');
const B = require(path.join(__dirname, '..', 'shared', 'mm-bounties.js'));
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const info = (m) => console.log('INFO ' + m);

// a UTC day whose three Town bounties include BOTH pick-flower and wave (so one run measures both rows)
let DAY = null;
for (let i = 0; i < 200 && !DAY; i++) { const d = new Date(Date.UTC(2026, 11, 1) + i * 86400000).toISOString().slice(0, 10); const ids = B.forDate(d, 'town', B.TOWN_POOL).map((x) => x.id); if (ids.includes('pick-flower') && ids.includes('wave')) DAY = d; }
check('node: a day with both pick-flower and wave among the three bounties exists', !!DAY, String(DAY));
const wantRows = B.forDate(DAY, 'town', B.TOWN_POOL);
const wave = wantRows.find((x) => x.id === 'wave'), flower = wantRows.find((x) => x.id === 'pick-flower');
check('node: wave goal is 2 and pick-flower goal is 3', wave.goal === 2 && flower.goal === 3, JSON.stringify([wave.goal, flower.goal]));
check('node: the row texts name what is counted ("Say hi to 2 neighbors", "Pick 3 flowers")', /^Say hi to 2 neighbors$/.test(wave.text) && /^Pick 3 flowers$/.test(flower.text), wave.text + ' / ' + flower.text);

const FAKE = `(() => { let G; Object.defineProperty(window, 'MMGameDay', { configurable: true, get: () => G, set: (v) => { G = v; if (!v || v.__wrapped) return; const o = v.utcKey; v.utcKey = (n) => { let f = null; try { f = sessionStorage.getItem('fakeday'); } catch (e) { f = null; } return f && n === undefined ? f : o(n); }; v.__wrapped = true; } }); })();`;

async function town(browser, opts) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await offlineStub(ctx); await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.addInitScript(FAKE);
  if (opts.save) await ctx.addInitScript((v) => { if (!sessionStorage.seeded) { sessionStorage.seeded = '1'; localStorage.setItem('pixeltown-save-v1', v); } }, JSON.stringify(opts.save));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await exposeGame(page);
  await page.goto(BASE);
  if (opts.day) await page.evaluate((d) => sessionStorage.setItem('fakeday', d), opts.day);
  if (opts.clock) await page.clock.setFixedTime(new Date(opts.clock)); // Date.now / new Date() only; timers keep running
  await joinOffline(page, 'ADMINbounty9');
  return { ctx, page, db, errors };
}
const S = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__g.scene.getScene('Town'), ${JSON.stringify(arg === undefined ? null : arg)})`);
const rec = (page) => page.evaluate(() => { const b = loadSave().bounty; return b && b.s ? JSON.parse(JSON.stringify(b.s)) : null; });

(async () => {
  const browser = await chromium.launch();
  // ---------------- daytime: flowers + hellos ----------------
  { const T = await town(browser, { day: DAY, clock: '2026-12-02T10:00:00' }); const { page } = T;
    const geo = await S(page, (s) => {
      const f = s.flowerSprites.map((x) => ({ x: x.x, y: x.y })); let sum = 0;
      f.forEach((a, i) => { let m = 1e9; f.forEach((b, j) => { if (i !== j) m = Math.min(m, Math.hypot(a.x - b.x, a.y - b.y)); }); sum += m; });
      return { flowers: f.length, meanNearest: Math.round(sum / f.length), villagers: Object.keys(s.villagerState).length, speed: (window.PLAYER_SPEED || 0), awake: !s.villagerIsAsleep() };
    });
    info(`Town: ${geo.flowers} flower spots, mean nearest-neighbour distance ${geo.meanNearest} px, ${geo.villagers} villagers, villagers awake at the fixed clock: ${geo.awake}`);
    check('daytime: the villagers are awake at the fixed 10:00 clock and there are at least 3 flowers and 2 villagers', geo.awake && geo.flowers >= 3 && geo.villagers >= 2, JSON.stringify(geo));
    const c0 = await rec(page);
    check('both rows start at 0 (the day record is written lazily: none yet, or 0/0)', !c0 || (c0['pick-flower'][0] === 0 && c0.wave[0] === 0), JSON.stringify(c0));
    const picks = [];
    for (let i = 0; i < 4; i++) {
      const r = await S(page, (s, i) => { const f = s.flowerSprites[i]; s.flowerCooldowns = s.flowerCooldowns || {}; s.localBody.setPosition(f.x, f.y); s.interact(); const b = loadSave().bounty; return b.s['pick-flower'][0]; }, i);
      picks.push(r);
    }
    info(`pick-flower counter after 4 real picks of 4 different flowers: ${picks.join(',')} (goal 3)`);
    check('each real flower pick (interact() on the flower) adds exactly 1, and the counter stops at the goal 3', picks.join() === '1,2,3,3', picks.join());
    const again = await S(page, (s) => { const f = s.flowerSprites[0]; s.localBody.setPosition(f.x, f.y); s.interact(); return loadSave().bounty.s['pick-flower'][0]; });
    check('pressing again on a flower that was just picked does not count', again === 3, String(again));
    // hellos: neighbor 1, neighbor 1 again, neighbor 2
    const ids = await S(page, (s) => Object.keys(s.villagerState));
    const hello = async (id) => S(page, (s, id) => { const st = s.villagerState[id]; s.localBody.setPosition(st.x, st.y + 6); s.interact(); return loadSave().bounty.s.wave[0]; }, id);
    const h1 = await hello(ids[0]); const h1b = await hello(ids[0]); const h2 = await hello(ids[1]);
    info(`wave counter: first neighbor ${h1}, same neighbor again ${h1b}, second neighbor ${h2} (goal 2); villagers: ${ids.join(', ')}`);
    check('the first hello of the day to a neighbor counts 1', h1 === 1, String(h1));
    check('talking to the same neighbor again the same day does not count', h1b === 1, String(h1b));
    check('a second, different neighbor fills "Say hi to 2 neighbors" (2/2)', h2 === 2, String(h2));
    check('daytime run: no page errors, db.attempts() === 0', T.errors.length === 0 && T.db.attempts() === 0, T.errors.join('|') + ' attempts=' + T.db.attempts());
    await T.ctx.close(); }
  // ---------------- night: neighbors asleep ----------------
  { const T = await town(browser, { day: DAY, clock: '2026-12-02T02:00:00' }); const { page } = T;
    const asleep = await S(page, (s) => s.villagerIsAsleep());
    const ids = await S(page, (s) => Object.keys(s.villagerState));
    const w = await S(page, (s, id) => { const st = s.villagerState[id]; s.localBody.setPosition(st.x, st.y + 6); s.interact(); const b = loadSave().bounty; return { wave: b && b.s && b.s.wave ? b.s.wave[0] : 0, talk: loadSave().villagerTalkDay || null }; }, ids[0]);
    info(`night (02:00 local): villagers asleep ${asleep}; a hello leaves the wave counter at ${w.wave}`);
    check('at 02:00 the villagers are asleep and a hello does not count (the row waits, nothing is lost)', asleep === true && w.wave === 0, JSON.stringify(w));
    check('night run: no page errors, db.attempts() === 0', T.errors.length === 0 && T.db.attempts() === 0, T.errors.join('|'));
    await T.ctx.close(); }
  // ---------------- ID-09: days in town ----------------
  { const five = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
    const T = await town(browser, { save: { visitDays: 7, lastVisitDate: five, loginStreak: 7, lastLoginDate: five } }); const { page } = T;
    await page.waitForTimeout(600);
    const st = await page.evaluate(() => ({ days: loadSave().visitDays, last: loadSave().lastVisitDate, badge: (document.getElementById('streak-badge') || {}).textContent || '', title: (document.getElementById('streak-badge') || {}).title || '' }));
    info(`ID-09: stored visitDays 7 / lastVisitDate ${five} -> now ${st.days}, last ${st.last}, badge "${st.badge.trim()}", title "${st.title}"`);
    check('ID-09: a visit after a 5-day gap gives +1 (8), not +5 and not a reset', st.days === 8, JSON.stringify(st));
    check('ID-09: the badge says "Days in town 8" with no streak wording', /Days in town\s*8/.test(st.badge) && !/streak|lost|missed|keep it up|don't break/i.test(st.badge + ' ' + st.title), JSON.stringify(st));
    await page.reload(); await page.waitForTimeout(800);
    const again = await page.evaluate(() => ({ days: loadSave().visitDays, last: loadSave().lastVisitDate }));
    check('ID-09: a same-day reload pays and counts nothing more', again.days === 8, JSON.stringify(again));
    check('ID-09 run: no page errors, db.attempts() === 0', T.errors.length === 0 && T.db.attempts() === 0, T.errors.join('|'));
    await T.ctx.close(); }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
