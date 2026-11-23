// W-05 / W-16 round 3 (b15-r2-15, b03-r2-05, b03-r2-13): Realm HUD at 150% zoom and in the phone dungeon.
// (1) 260x563 and 320x568: the XP bar crosses neither the Menu / bag / board buttons nor the info line; the zone line is clear of the info line;
// (2) phone portrait dungeon after a boss: the floor-choice card and the ability pad are apart, the "New best tier" toast is not under the card;
// (3) 844x390 dungeon: the info line shows in full (no clipping) and crosses no HUD button. blockDb: no database traffic.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-w05r3-hud-narrow.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&heropick=0&seed=12345';
const DUNGEON = ORIGIN + '/game/games/mad-maze/index.html?mode=dungeon&test=1&lv=2&biome=crypt&seed=31';
const hit = (a, b) => !!(a && b && a.x < b.r - 0.5 && b.x < a.r - 0.5 && a.y < b.b - 0.5 && b.y < a.b - 0.5);
const box = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || e.hidden || !e.getClientRects().length) return null; const r = e.getBoundingClientRect(); if (!r.width || !r.height) return null; return { x: r.left, y: r.top, r: r.right, b: r.bottom }; }, sel);

async function open(browser, url, vp) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true });
  await blockDb(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active, null, { timeout: 20000 });
  await page.waitForTimeout(700);
  return { ctx, page, errors };
}

(async () => {
  const browser = await chromium.launch(); const errs = [];
  for (const [w, h] of [[260, 563], [320, 568]]) {
    const P = await open(browser, WORLD, { width: w, height: h }); const p = P.page; const tag = w + 'x' + h;
    const xp = await box(p, '#realm-xp'); const info = await box(p, '#realm-info'); const zone = await box(p, '#rw-zone');
    const btns = {}; for (const s of ['#realm-menu-btn', '#realm-bp-btn', '#realm-board-btn', '#realm-leave-btn', '#mm-nav-btn']) btns[s] = await box(p, s);
    const over = Object.keys(btns).filter((s) => hit(xp, btns[s]));
    check(tag + ': the XP bar crosses no HUD button (Menu was under it by 44x16 px)', xp && over.length === 0, JSON.stringify({ xp, over: over.map((s) => [s, btns[s]]) }));
    check(tag + ': the XP bar does not cover the info line', xp && info && !hit(xp, info), JSON.stringify({ xp, info }));
    check(tag + ': the zone line does not cover the info line or the XP bar', zone && !hit(zone, info) && !hit(zone, xp), JSON.stringify({ zone, info, xp }));
    errs.push(...P.errors); await P.ctx.close();
  }
  // (2) phone dungeon boss down: floor-choice card vs pad vs toast
  { const D = await open(browser, DUNGEON, { width: 390, height: 844 }); const p = D.page;
    await p.evaluate(() => {
      window.__mm.arena._hitPlayer = () => {};
      const d = window.__mm.dungeon; const g = d.graph; const target = g.bossRoomId;
      const nbrs = (id) => g.doors.filter((x) => !x.cracked && (x.a === id || x.b === id)).map((x) => (x.a === id ? x.b : x.a));
      const prev = { [d.room]: null }; const q = [d.room];
      while (q.length) { const u = q.shift(); if (u === target) break; nbrs(u).forEach((v) => { if (!(v in prev)) { prev[v] = u; q.push(v); } }); }
      const path = []; for (let u = target; u !== null && u !== undefined; u = prev[u]) path.unshift(u);
      for (let i = 1; i < path.length; i++) { if (d.state.room(d.room).enemiesAlive > 0 && g.rooms[d.room].type !== 'boss') d.clearRoom(); d.enter(path[i]); }
    });
    await p.waitForTimeout(300);
    for (let i = 0; i < 40; i++) { const dead = await p.evaluate(() => { const d = window.__mm.dungeon; if (d.state.boss.dead) return true; const e = d.boss(); if (e) window.__mm.arena._hitEnemy(e, 200); return false; }); if (dead) break; await p.waitForTimeout(300); }
    const deep = await p.waitForSelector('#mm-deep', { timeout: 8000 }).then(() => true).catch(() => false);
    await p.evaluate(() => window.__mm.arena.chaseToast('New best tier: T6 Bloom Staff'));
    await p.waitForTimeout(200);
    const card = await box(p, '#mm-deep'), toast = await box(p, '#realm-chase-toast');
    const pads = await p.evaluate(() => Array.from(document.querySelectorAll('#realm-abilities .realm-ab')).filter((e) => getComputedStyle(e).visibility !== 'hidden' && e.getClientRects().length).map((e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom }; }));
    check('390x844 dungeon: the floor-choice card shows after the boss', deep && !!card, JSON.stringify(card));
    check('390x844 dungeon: no visible ability button under the floor-choice card', card && !pads.some((q) => hit(q, card)), JSON.stringify({ card, pads }));
    check('390x844 dungeon: the "New best tier" toast is not under the floor-choice card', card && toast && !hit(toast, card), JSON.stringify({ card, toast }));
    errs.push(...D.errors); await D.ctx.close(); }
  // (3) landscape dungeon: the info line in full, clear of the button row
  { const L = await open(browser, DUNGEON, { width: 844, height: 390 }); const p = L.page;
    const info = await p.evaluate(() => { const e = document.getElementById('realm-info'); const r = e.getBoundingClientRect(); return { sw: e.scrollWidth, cw: e.clientWidth, sh: e.scrollHeight, ch: e.clientHeight, x: r.left, y: r.top, r: r.right, b: r.bottom, t: e.textContent }; });
    const btns = []; for (const s of ['#realm-bp-btn', '#realm-board-btn', '#realm-menu-btn', '#realm-leave-btn']) { const b = await box(p, s); if (b && hit(info, b)) btns.push(s); }
    check('844x390 dungeon: the HUD info line is not clipped (scroll <= client)', info.sw <= info.cw + 1 && info.sh <= info.ch + 1, JSON.stringify(info));
    check('844x390 dungeon: the info line crosses no HUD button', btns.length === 0, JSON.stringify(btns));
    errs.push(...L.errors); await L.ctx.close(); }
  check('no page errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
