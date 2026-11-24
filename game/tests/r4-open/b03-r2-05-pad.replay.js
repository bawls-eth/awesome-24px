// OPEN item replay (not in the test tiers: this folder is outside the *.test.js glob). b03-r2-05 (P2, owner D4).
// Round 3 (ce67ff7) moved the floor-choice card off the ability pad, but the tester's first symptom is unchanged on the round-3 tip:
// on a 390x844 phone the 2x2 ability pad (250..370 x 562..682) lies on the bottom-right corner of the dungeon room (0..389 x 215..721)
// and hides 120x120 px of the floor, where enemies and doors can be.
// This replay is RED on d08838a (measured by D5). When the fix lands: move this file to game/tests/beta-r4-dungeon-pad.test.js,
// register it in test-tiers.json (class browser, tier full) and tell D5 in fixes/r4-d4.md.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/r4-open/b03-r2-05-pad.replay.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('../helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const DUNGEON = ORIGIN + '/game/games/mad-maze/index.html?mode=dungeon&test=1&lv=2&biome=crypt&seed=31';

(async () => {
  const browser = await chromium.launch();
  for (const [w, h] of [[390, 844], [360, 640]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    await blockDb(ctx);
    const page = await ctx.newPage();
    await page.goto(DUNGEON);
    await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active, null, { timeout: 30000 });
    await page.waitForTimeout(900);
    const g = await page.evaluate(() => {
      const R = (e) => { const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, r: b.right, b: b.bottom }; };
      const room = R(document.getElementById('realm-canvas'));
      const pads = Array.from(document.querySelectorAll('#realm-abilities .realm-ab')).filter((e) => getComputedStyle(e).visibility !== 'hidden' && e.getClientRects().length).map(R);
      const sticks = Array.from(document.querySelectorAll('#realm-stick-move, #realm-stick-aim')).filter((e) => e.getClientRects().length).map(R);
      const area = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.y, b.y));
      const cover = pads.reduce((s, p) => s + area(p, room), 0);
      return { room, pads: pads.length, cover: Math.round(cover), share: Math.round((1000 * cover) / ((room.r - room.x) * (room.b - room.y))) / 10, onStick: pads.some((p) => sticks.some((s) => area(p, s) > 0)), minSize: Math.min.apply(null, pads.map((p) => Math.min(p.r - p.x, p.b - p.y))), inside: pads.every((p) => p.x >= 0 && p.r <= innerWidth && p.b <= innerHeight) };
    });
    const tag = w + 'x' + h + ': ';
    check(tag + 'the ability pad is shown (4 buttons, each at least 44 px, inside the screen)', g.pads === 4 && g.minSize >= 44 && g.inside, JSON.stringify(g));
    check(tag + 'b03-r2-05: the ability pad covers none of the dungeon room (it hides ' + g.cover + ' px2 = ' + g.share + '% today)', g.cover === 0, JSON.stringify(g.room));
    check(tag + 'the pad does not sit on a joystick either', !g.onStick);
    await ctx.close();
  }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
