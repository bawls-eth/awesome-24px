// ID-40 dust-first reforge hint (cycle 4 S). Node: MMGearForge.shortHint over the FIXED Godlands income table (4.74 dust, 9.75 shards
// per kill; no tracking). Browser (Mad Maze page, blockDb, every WebSocket closed, db.attempts() === 0): a T9 item with 10 dust / 200 shards
// shows "11 more kills of dust, shards are enough" in the open Forge; with enough of both no hint line is drawn.
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
global.MMGear = require('../shared/mm-gear.js'); global.MMGearAffix = require('../shared/mm-gear-affix.js');
const F = require('../shared/mm-gear-forge.js');

check('income table is fixed data: 4.74 dust and 9.75 shards per Godlands kill', F.INCOME.dust === 4.74 && F.INCOME.shards === 9.75 && Object.isFrozen(F.INCOME));
const t9 = { dust: 60, shards: 75 }; // T9 Common: 20 x (9 - 6) + 10 x 0 dust, 25 x (9 - 6) shards
let h = F.shortHint(t9, { dust: 10, shards: 200 });
check('dust short by 50: ceil(50 / 4.74) = 11 more kills of dust, shards are enough', h && h.dustKills === 11 && h.shardKills === 0 && h.text === '11 more kills of dust, shards are enough', JSON.stringify(h));
h = F.shortHint(t9, { dust: 60, shards: 0 });
check('shards short by 75: 8 more kills of shards, dust is enough', h && h.shardKills === 8 && h.dustKills === 0 && h.text === '8 more kills of shards, dust is enough', JSON.stringify(h));
h = F.shortHint(t9, { dust: 0, shards: 0 });
check('both short: "13 more kills of dust and 8 of shards"', h && h.text === '13 more kills of dust and 8 of shards', JSON.stringify(h));
check('short by 1 is still 1 kill; enough of both = null; junk = null, no throw', F.shortHint(t9, { dust: 59, shards: 75 }).dustKills === 1 && F.shortHint(t9, { dust: 60, shards: 75 }) === null && F.shortHint(null, {}) === null && F.shortHint(t9, null) === null);

const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const MAZE = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1&forge=1';
const hero = { id: 'h-1', name: 'bruiser', cls: 'bruiser', level: 20, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] };
const prof = { v: 1, heroes: [hero], stash: new Array(16).fill(null), fame: 0, mode: 'classic', hall: [], migratedFrom: null };
const realm = (dust, shards) => ({ shards, dust, bestWave: 0, kills: 0, deaths: 0, kb: { spiral: 0, aimed: 0, ring: 0, drifter: 0, boss: 0 }, bossBestT: 0, level: 20, xp: 0,
  items: [{ n: 1, id: 'sparkwand', r: 0, t: 9, a: 12345 }], nextUid: 100, eq: { weapon: 1 } });

async function forgeText(browser, dust, shards) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const db = await blockDb(ctx);
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>hub' }));
  await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((a) => { localStorage.clear(); localStorage.setItem('pixeltown-mm-v1', a[0]); localStorage.setItem('pixeltown-mm-active-v1', JSON.stringify({ v: 1, heroId: 'h-1' })); localStorage.setItem('pixeltown-save-v1', a[1]); },
    [JSON.stringify(prof), JSON.stringify({ realm: realm(dust, shards) })]);
  await page.goto(MAZE);
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active, null, { timeout: 20000 });
  await page.evaluate(() => { const a = window.__mm.arena; a.state = 'play'; a.eBullets.forEach((b) => { b.active = false; }); a.enemies.forEach((e) => { e.active = false; }); a._calcStats(); a.setPaused(true); });
  await page.waitForFunction(() => !document.querySelector('#realm-bp-list button[data-arm]'), null, { timeout: 3000 }).catch(() => {});
  await page.click('button.fg[data-forge-open="1"]');
  const r = await page.evaluate(() => { const b = document.getElementById('realm-bp-forge'); const s = b && b.querySelector('.rm-forge-short'); return { box: b ? b.textContent : '', hint: s ? s.textContent : null }; });
  const out = { r, attempts: db.attempts(), errors };
  await ctx.close();
  return out;
}

(async () => {
  const browser = await chromium.launch();
  const a = await forgeText(browser, 10, 200);
  check('Forge on a T9 item with 10 dust, 200 shards: "11 more kills of dust, shards are enough"', a.r.hint === '11 more kills of dust, shards are enough', JSON.stringify(a.r).slice(0, 400));
  check('0 DB requests, no page errors (short)', a.attempts === 0 && a.errors.length === 0, a.errors.join(' | '));
  const b = await forgeText(browser, 500, 500);
  check('enough of both: no hint line, the options are still listed', b.r.hint === null && /Reforge: add one forged affix/.test(b.r.box), JSON.stringify(b.r).slice(0, 300));
  check('0 DB requests, no page errors (enough)', b.attempts === 0 && b.errors.length === 0, b.errors.join(' | '));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
