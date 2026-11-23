// G-06 (b01-01, b04-04): daily quest text uses the canon zone names (Shore / Midlands / Highlands / Godlands, MMZones) and the Realm goal
// line prefers a daily quest only when its zone is in reach (recLv <= hero level + 2). Quest ids, seeds and stored progress unchanged.
// Node part (pure) + a Realm World page part. Offline: blockDb + every WebSocket closed, no chat, no Firebase writes.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-g06-quest-zones.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const Q = require('../shared/mm-quests.js');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const CANON = ['Shore', 'Midlands', 'Highlands', 'Godlands'];

(async () => {
  // 1: 30 seeded dates: no 'Deeps' / 'Meadows'; every zone word is canon
  const bad = []; let zoned = 0;
  for (let d = 1; d <= 30; d++) {
    const ds = '2030-06-' + String(d).padStart(2, '0');
    Q.quests(ds).forEach((q) => { if (/Deeps|Meadows/.test(q.text)) bad.push(ds + ' ' + q.text); if (q.zone !== null && q.zone !== undefined) { zoned++; if (!q.text.endsWith('the ' + CANON[q.zone])) bad.push(ds + ' ' + q.text); } });
    const o = Q.oracle ? Q.oracle(ds) : null; const ot = o && (o.text || o.line || '') ; if (/Deeps|Meadows/.test(String(ot))) bad.push(ds + ' oracle ' + ot);
  }
  check('1. 30 seeded dates: no quest title says Deeps / Meadows and every zone word is one of the four canon names', bad.length === 0 && zoned === 30, bad.slice(0, 4).join(' | '));
  check('1b. MMQuests.ZONES is the canon list', JSON.stringify(Q.ZONES) === JSON.stringify(CANON), JSON.stringify(Q.ZONES));
  // 4: a stored quests state from before keeps its progress / claimed flags (ids unchanged)
  const st = { date: '2030-05-02', q: { kill_zone: { p: 7, done: false, claimed: false }, kill_boss: { p: 1, done: true, claimed: true }, open_portal: { p: 0, done: false, claimed: false } } };
  const sm = Q.summary(st, '2030-05-02');
  check('4. a stored state keeps progress and claimed flags (same ids), summary rows carry their zone', sm[0].id === 'kill_zone' && sm[0].p === 7 && sm[1].claimed === true && sm[0].zone === 2 && /Highlands/.test(sm[0].text), JSON.stringify(sm));

  // 2 + 3: page goal line (2030-05-02: "Defeat 18 creatures in the Highlands")
  const browser = await chromium.launch();
  const goal = async (level) => {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
    await blockDb(ctx); await ctx.routeWebSocket(/.*/, (ws) => ws.close());
    await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
    await page.evaluate(([v, w]) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', v); localStorage.setItem('pixeltown-realm-v1', w); localStorage.setItem('mm-aim-assist', '0'); localStorage.setItem('pixeltown-realm-tutorial-v1', '{"v":1,"done":true}'); },
      [JSON.stringify({ realm: { level, xp: 0, shards: 5, bestWave: 1, items: [], nextUid: 1, eq: {} } }), JSON.stringify({ quests: Q.fresh('2030-05-02') })]); // a hero after the first kills: today's quests are in the save
    await page.goto(ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&seed=12345&qdate=2030-05-02&tutorial=0');
    await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
    await page.evaluate(() => { const a = window.__mm.arena; a.player.iframes = 1e9; a._hitPlayer = () => {}; });
    await page.waitForFunction(() => /Next goal: /.test((document.getElementById('rw-goal') || {}).textContent || ''), null, { timeout: 8000 }).catch(() => {});
    const t = await page.evaluate(() => (document.getElementById('rw-goal') || {}).textContent || '');
    await ctx.close();
    return { t, errors };
  };
  const g1 = await goal(1);
  check('2. a Lv 1 hero: the goal line is the level goal, not the Highlands quest', /Next goal: /.test(g1.t) && !/Highlands/.test(g1.t) && /Lv|inland/.test(g1.t), g1.t);
  const g10 = await goal(10);
  check('3. a Lv 10 hero: the goal line shows the Highlands quest', /Defeat 18 creatures in the Highlands/.test(g10.t), g10.t);
  check('no page errors', g1.errors.length === 0 && g10.errors.length === 0, g1.errors.concat(g10.errors).join(' | '));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
