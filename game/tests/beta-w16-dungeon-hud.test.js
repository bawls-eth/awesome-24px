// W-16 (b03-04, b03-05, b03-06, b03-08): dungeon HUD never covers the room's doors or the boss bar's neighbours.
// Desktop: the S and N door tiles are not under the ability bar / boss bar (elementFromPoint is the canvas); the hero in the boss room is not
// under the boss bar. Phone: the boss bar does not cross the mini-map or the mutator chip; sticks + ability pad cover <= 25% of the room.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-w16-dungeon-hud.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = (q) => ORIGIN + '/game/games/mad-maze/index.html?mode=dungeon&test=1&lv=2&' + q;
const SHOTS = process.env.SHOTS || null;
const hit = (a, b) => !!(a && b && a.x < b.r - 0.5 && b.x < a.r - 0.5 && a.y < b.b - 0.5 && b.y < a.b - 0.5);

async function open(browser, q, vp) {
  const phone = vp.width < 500;
  const ctx = await browser.newContext({ viewport: vp, hasTouch: phone, isMobile: phone });
  await blockDb(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL(q));
  await page.waitForFunction(() => window.__mm && window.__mm.dungeon && window.__mm.dungeon.room !== null, null, { timeout: 15000 });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    window.__mm.arena._hitPlayer = () => {};
    window.__walk = (target) => {
      const d = window.__mm.dungeon; const g = d.graph;
      const nbrs = (id) => g.doors.filter((x) => !x.cracked && (x.a === id || x.b === id)).map((x) => (x.a === id ? x.b : x.a));
      const prev = { [d.room]: null }; const qq = [d.room];
      while (qq.length) { const u = qq.shift(); if (u === target) break; nbrs(u).forEach((v) => { if (!(v in prev)) { prev[v] = u; qq.push(v); } }); }
      const path = []; for (let u = target; u !== null && u !== undefined; u = prev[u]) path.unshift(u);
      for (let i = 1; i < path.length; i++) { if (d.state.room(d.room).enemiesAlive > 0 && g.rooms[d.room].type !== 'boss') d.clearRoom(); const r = d.enter(path[i]); if (!r.ok) return 'blocked'; }
      return d.room;
    };
  });
  return { ctx, page, errors };
}
const box = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || !e.getClientRects().length) return null; const r = e.getBoundingClientRect(); if (!r.width || !r.height) return null; return { x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }, sel);
// screen point of a room tile centre (17x13 room; the canvas shows the whole room on desktop)
const tileAt = (page, tx, ty) => page.evaluate(([tx, ty]) => { const a = window.__mm.arena, r = a.canvas.getBoundingClientRect(); const x = r.left + r.width * (tx + 0.5) / 17, y = r.top + r.height * (ty + 0.5) / 13; const el = document.elementFromPoint(x, y); return { x, y, isCanvas: el === a.canvas, el: el ? (el.id || el.className || el.tagName) : null }; }, [tx, ty]);

(async () => {
  const browser = await chromium.launch();
  // Desktop 1280x720
  const D = await open(browser, 'biome=bramble&seed=77', { width: 1280, height: 720 }); const dp = D.page;
  const sDoor = await tileAt(dp, 8, 12), nDoor = await tileAt(dp, 8, 0);
  check('1280x720: the S door tile centre is not under the ability bar / hint line (elementFromPoint is the canvas)', sDoor.isCanvas, JSON.stringify(sDoor));
  const ab = await box(dp, '#realm-abilities'); const cv = await box(dp, '#realm-canvas');
  check('1280x720: the ability bar is docked outside the room rect', ab && cv && !hit(ab, cv), JSON.stringify({ ab, cv }));
  check('1280x720: the room keeps a large view (>= 540 px tall, aspect 17:13 kept)', cv && cv.h >= 540 && Math.abs(cv.w / cv.h - 17 / 13) < 0.03, JSON.stringify(cv));
  if (SHOTS) await dp.screenshot({ path: SHOTS + '/w16-desk.png' });
  // boss room: the boss bar is up; the N door tile and the hero are not under it
  await dp.evaluate(() => window.__walk(window.__mm.dungeon.graph.bossRoomId));
  await dp.waitForFunction(() => !document.getElementById('realm-boss').classList.contains('hidden'), null, { timeout: 8000 }).catch(() => {});
  const bb = await box(dp, '#realm-boss'); const nDoor2 = await tileAt(dp, 8, 0);
  const hero = await dp.evaluate(() => { const a = window.__mm.arena, r = a.canvas.getBoundingClientRect(); const x = r.left + a.player.x / a.W * r.width, y = r.top + a.player.y / a.H * r.height; return { x: x - 12, r: x + 12, y: y - 20, b: y + 16 }; });
  check('1280x720 boss room: the boss bar is shown and the N door tile is not under it', bb && nDoor2.isCanvas && !hit(bb, { x: nDoor2.x - 2, r: nDoor2.x + 2, y: nDoor2.y - 2, b: nDoor2.y + 2 }), JSON.stringify({ bb, nDoor2, nDoor }));
  check('1280x720 boss room: the hero is not under the boss bar', bb && !hit(hero, bb), JSON.stringify({ hero, bb }));
  if (SHOTS) await dp.screenshot({ path: SHOTS + '/w16-desk-boss.png' });
  check('desktop: no page errors', D.errors.length === 0, D.errors.join('|'));
  await D.ctx.close();
  // Phone 390x844, crypt boss with a mutator chip (b03-04)
  const P = await open(browser, 'biome=crypt&seed=31', { width: 390, height: 844 }); const pp = P.page;
  await pp.evaluate(() => window.__walk(window.__mm.dungeon.graph.bossRoomId));
  await pp.waitForFunction(() => !document.getElementById('realm-boss').classList.contains('hidden'), null, { timeout: 8000 }).catch(() => {});
  await pp.waitForTimeout(200);
  const pb = await box(pp, '#realm-boss'), map = await box(pp, '#mm-map'), mut = await box(pp, '#mm-mut'), pc = await box(pp, '#realm-canvas');
  check('390x844 boss fight: the boss bar does not intersect the mini-map', pb && !hit(pb, map), JSON.stringify({ pb, map }));
  check('390x844 boss fight: the boss bar does not intersect the mutator chip', pb && !hit(pb, mut), JSON.stringify({ pb, mut }));
  check('390x844 boss fight: the boss bar sits above the room', pb && pc && pb.b <= pc.y + 1, JSON.stringify({ pb, pc }));
  const cover = await pp.evaluate(() => { const c = document.getElementById('realm-canvas').getBoundingClientRect(); let area = 0;
    document.querySelectorAll('#realm-abilities .realm-ab, .realm-stick').forEach((e) => { if (getComputedStyle(e).display === 'none') return; const r = e.getBoundingClientRect(); const w = Math.max(0, Math.min(r.right, c.right) - Math.max(r.left, c.left)), h = Math.max(0, Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top)); area += w * h; });
    return area / (c.width * c.height); });
  check('390x844: ability buttons + sticks cover <= 25% of the room rect', cover <= 0.25, String(cover));
  if (SHOTS) await pp.screenshot({ path: SHOTS + '/w16-phone-boss.png' });
  check('phone: no page errors', P.errors.length === 0, P.errors.join('|'));
  await P.ctx.close();
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
