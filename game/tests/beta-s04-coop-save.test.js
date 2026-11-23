// Beta S-04 (b14-06, P1): same-device co-op seats merge `pixeltown-realm-v1` instead of overwriting it.
// Two Realm pages in ONE browser context (shared localStorage), ?party=local&seat=0/1, same seed. blockDb on the context.
//  1. A discovers cells, then B (started with fewer) walks and saves: stored discovered >= A's count + B's new ones.
//  2. Stored `pos` is seat 0's tile after both saved; `seatPos['1']` is B's tile.
//  3. Solo (no party flag): no `seatPos` key, `pos` is the player's tile (today's shape).
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-s04-coop-save.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const SEED = 's04' + (Date.now() % 100000);
const PAGE = (q) => ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=' + SEED + (q ? '&' + q : '');
const KEY = 'pixeltown-realm-v1';

const stored = (p) => p.evaluate((k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, KEY);
const fogCount = (p, s) => p.evaluate((d) => { const b = d && window.MMFog.decode(d); return b ? window.MMFog.count(b) : 0; }, s);
const fogSuperset = (p, big, small) => p.evaluate(([a, b]) => { const x = window.MMFog.decode(a), y = window.MMFog.decode(b); if (!x || !y) return false; for (let i = 0; i < x.length; i++) if ((x[i] & y[i]) !== y[i]) return false; return true; }, [big, small]);
const tile = (p) => p.evaluate(() => { const a = window.__mm.arena; return { x: Math.floor(a.player.x / 32), y: Math.floor(a.player.y / 32) }; });
async function visit(p, pts) {
  for (const [x, y] of pts) {
    await p.evaluate(([tx, ty]) => { const a = window.__mm.arena; a.player.x = (tx + 0.5) * 32; a.player.y = (ty + 0.5) * 32; a.player.iframes = 1e9; }, [x, y]);
    await p.waitForTimeout(350);
  }
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const db = await blockDb(ctx);
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  await ctx.route('**/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
  const open = async (url, team) => {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await p.goto(url);
    await p.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.state === 'play', null, { timeout: 30000 });
    if (team) await p.waitForFunction(() => window.__mm.team && window.__mm.team.ok && window.__mm.team.seat >= 0, null, { timeout: 15000 });
    await p.evaluate(() => { const a = window.__mm.arena; a.player.iframes = 1e9; a._hitPlayer = () => {}; });
    return p;
  };

  const A = await open(PAGE('party=local&seat=0'), true);
  const B = await open(PAGE('party=local&seat=1'), true);
  check('seats are 0 and 1', (await A.evaluate(() => window.__mm.team.seat)) === 0 && (await B.evaluate(() => window.__mm.team.seat)) === 1);
  // A explores a lot, then saves; B still holds the fog it loaded with
  await visit(A, [[40, 40], [80, 40], [120, 40], [160, 60], [200, 80], [240, 100]]);
  await A.evaluate(() => window.__mm.world.savePos(true));
  const sA = await stored(A);
  const cA = await fogCount(A, sA.discovered);
  const aTile = await tile(A);
  const cB0 = await B.evaluate(() => { const d = window.__mm.world.save().discovered; return d ? window.MMFog.count(window.MMFog.decode(d)) : 0; });
  // B walks somewhere new and saves
  await B.waitForTimeout(300);
  await visit(B, [[300, 300], [340, 320]]);
  await B.evaluate(() => window.__mm.world.savePos(true));
  const bTile = await tile(B);
  const s1 = await stored(B);
  const c1 = await fogCount(B, s1.discovered);
  check('[1] A discovered cells', cA > 10, String(cA));
  check('[1] stored discovered after B saved >= A\'s count + B\'s new cells', c1 > cA && await fogSuperset(B, s1.discovered, sA.discovered), `A ${cA}, B started ${cB0}, stored ${c1}`);
  check('[2] stored pos is still seat 0\'s tile', s1.pos && s1.pos.x === aTile.x && s1.pos.y === aTile.y, JSON.stringify({ pos: s1.pos, aTile }));
  check('[2] seatPos[1] is B\'s tile', s1.seatPos && s1.seatPos['1'] && s1.seatPos['1'].x === bTile.x && s1.seatPos['1'].y === bTile.y, JSON.stringify({ sp: s1.seatPos, bTile }));
  // A saves again: its pos and its seatPos[0] move, B's seatPos survives
  await visit(A, [[60, 200]]);
  await A.evaluate(() => window.__mm.world.savePos(true));
  const a2 = await tile(A);
  const s2 = await stored(A);
  check('[2] seat 0 moves the canonical pos, seat 1 entry kept', s2.pos.x === a2.x && s2.pos.y === a2.y && s2.seatPos['1'].x === bTile.x && s2.seatPos['0'].x === a2.x, JSON.stringify({ pos: s2.pos, sp: s2.seatPos }));
  check('[1] A\'s later save keeps B\'s discovered cells', await fogSuperset(A, s2.discovered, s1.discovered));
  await A.close(); await B.close();

  await ctx.close();
  // ---- 3: solo keeps today's shape (a fresh profile that never played co-op) ----
  const ctx2 = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const db2 = await blockDb(ctx2);
  await ctx2.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  const S = await ctx2.newPage();
  S.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await S.goto(PAGE(''));
  await S.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.state === 'play', null, { timeout: 30000 });
  await visit(S, [[50, 50]]);
  await S.evaluate(() => window.__mm.world.savePos(true));
  const so = await stored(S);
  const sTile = await tile(S);
  check('[3] solo save has no seatPos key', so && !('seatPos' in so), JSON.stringify(Object.keys(so || {})));
  check('[3] solo pos is the player tile', so.pos && so.pos.x === sTile.x && so.pos.y === sTile.y, JSON.stringify(so.pos));
  check('no page errors', errors.length === 0, errors.join(' | '));
  check('no database traffic', db.attempts() === 0 && db2.attempts() === 0);
  await ctx2.close();
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
