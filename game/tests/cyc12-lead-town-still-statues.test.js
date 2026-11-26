// cycle 12 L (1): the hero statues on the pond bank ('mooncats'), the Founder's Statue and the 'punkrocks' decor are Sprites that
// never move, but the Town camera cull (main.js cullOffscreen) measured each of them on every pass like a walker. They now declare
// o._cstill like the flower beds and rocks (cycle 10) and settle like an image: their box is remembered and read again only every
// 8th pass. Pin test in the manner of cyc9-lead-town-cull-pin.test.js.
// Proven here (counts and cull bits, deterministic):
//   [1] every pond statue, the Founder's Statue and every punk rock is declared still, has a size, is settled (_cs 3) after a few
//       passes and never goes through the walkers' helper (_cullSpriteBox); before the change: none is declared, all go through it;
//   [2] with the camera on the Founder's Statue, on a pond statue, on a punk rock and far away, the cull bit of every still sprite
//       equals a fresh evaluation of the exact rule, the one the camera is on is drawn, and far away the Founder is culled;
//   [3] nothing else was declared still: every sprite that is not decor is still measured on every pass.
// OFFLINE: helpers.offlineStub, db.attempts() === 0. Never chats, never writes to Firebase.
// Run: BASE=http://localhost:9121/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc12-lead-town-still-statues.test.js
const { chromium } = require('playwright');
const { check, done, offlineStub, exposeGame, joinOffline } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await offlineStub(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await exposeGame(page);
  await page.goto(BASE);
  await joinOffline(page, 'ADMINcyc12still');
  await page.waitForTimeout(800);
  await frames(page, 120);

  // [1] + [3]
  const one = await page.evaluate(() => new Promise((res) => {
    const s = window.__g.scene.getScene('Town');
    const orig = s._cullSpriteBox; const seen = new Set();
    s._cullSpriteBox = function (o, pass) { seen.add(o); return orig.call(this, o, pass); };
    let passes = 0, last = s._cullPass, i = 0;
    const f = () => {
      if (s._cullPass !== last) { last = s._cullPass; passes++; }
      if (passes < 12 && ++i < 600) return requestAnimationFrame(f);
      s._cullSpriteBox = orig;
      const all = s.sys.displayList.list.filter((o) => o.type === 'Sprite' && o.visible && o.scrollFactorX === 1 && o.scrollFactorY === 1);
      const decor = all.filter((o) => o.pondStatue || o.founderStatue || o.texture.key === 'punkrocks');
      const others = all.filter((o) => !o._cstill);
      res({ passes, pond: all.filter((o) => o.pondStatue).length, founder: all.filter((o) => o.founderStatue).length, punk: all.filter((o) => o.texture.key === 'punkrocks').length,
        decor: decor.length, declared: decor.filter((o) => o._cstill).length, sized: decor.filter((o) => o.displayWidth > 0 && o.displayHeight > 0).length,
        settled: decor.filter((o) => o._cs === 3).length, inHelper: decor.filter((o) => seen.has(o)).length,
        stillKinds: [...new Set(all.filter((o) => o._cstill).map((o) => o.texture.key))].sort().join(','),
        others: others.length, othersMissed: others.filter((o) => !seen.has(o)).length, measured: s._cullMeasured });
    };
    requestAnimationFrame(f);
  }));
  console.log('INFO ' + JSON.stringify(one));
  check('[1] the scene has pond statues, the Founder\'s Statue and punk rocks, all with a size', one.pond >= 2 && one.founder === 1 && one.punk >= 2 && one.sized === one.decor, JSON.stringify(one));
  check('[1] every one of them is declared still (_cstill)', one.declared === one.decor && one.decor >= 5, JSON.stringify(one));
  check('[1] all of them are settled (_cs 3) and none goes through the walkers\' helper', one.passes >= 12 && one.settled === one.decor && one.inHelper === 0, JSON.stringify(one));
  check('[3] only decor is declared still (mooncats, punkrocks, rocks, tulips) and every other sprite is still measured on every pass', one.stillKinds === 'mooncats,punkrocks,rocks,tulips' && one.others >= 40 && one.othersMissed === 0, JSON.stringify(one));

  // [2] cull bits at the statue, at the pond, at a rock and far away
  const bits = await page.evaluate(() => new Promise((res) => {
    const s = window.__g.scene.getScene('Town'); const cam = s.cameras.main, bit = cam.id;
    const still = () => s.sys.displayList.list.filter((o) => o.type === 'Sprite' && o.visible && (o.pondStatue || o.founderStatue || o.texture.key === 'punkrocks'));
    const F = s.founderStatue, P = still().find((o) => o.pondStatue), R = still().find((o) => o.texture.key === 'punkrocks');
    const b = s.physics.world.bounds;
    const far = [[b.x, b.y], [b.right, b.y], [b.x, b.bottom], [b.right, b.bottom]].sort((p, q) => Math.hypot(q[0] - F.x, q[1] - F.y) - Math.hypot(p[0] - F.x, p[1] - F.y))[0];
    const spots = [[F.x, F.y, F], [P.x, P.y, P], [R.x, R.y, R], [far[0], far[1], null], [F.x, F.y, F]]; const out = [];
    cam.stopFollow();
    const go = (k) => {
      if (k >= spots.length) { cam.startFollow(s.localBody, true, 0.12, 0.12); return res(out); }
      cam.centerOn(spots[k][0], spots[k][1]); let n = 0;
      const f = () => {
        if (++n < 14) return requestAnimationFrame(f);
        const v = cam.worldView; const M = 320, x0 = v.x - M, y0 = v.y - M, x1 = v.right + M, y1 = v.bottom + M; let wrong = 0, culled = 0, total = 0;
        still().forEach((o) => {
          const w = o.displayWidth, h = o.displayHeight; total++;
          const left = o.x - w * o.originX, top = o.y - h * o.originY;
          const outside = Math.ceil(left + w) < x0 || Math.floor(left) > x1 || Math.ceil(top + h) < y0 || Math.floor(top) > y1;
          const isCulled = !!(o.cameraFilter & bit); if (isCulled) culled++; if (isCulled !== outside) wrong++;
        });
        const t = spots[k][2];
        out.push({ total, culled, wrong, targetDrawn: t ? !(t.cameraFilter & bit) : null, founderCulled: !!(F.cameraFilter & bit) }); go(k + 1);
      };
      requestAnimationFrame(f);
    };
    go(0);
  }));
  check('[2] at 5 camera spots the cull bit of every still statue / rock equals the exact rule', bits.length === 5 && bits.every((x) => x.wrong === 0 && x.total >= 5), JSON.stringify(bits));
  check('[2] the statue or rock the camera is on is drawn (Founder, pond statue, punk rock, Founder again after the far trip)', [0, 1, 2, 4].every((k) => bits[k].targetDrawn === true), JSON.stringify(bits));
  check('[2] far away the Founder\'s Statue is culled (the check is real)', bits[3].founderCulled === true && bits[3].culled >= 1, JSON.stringify(bits));

  check('zero page errors', errors.length === 0, errors.join(' | '));
  check('no database traffic (literal 0)', db.attempts() === 0, String(db.attempts()));
  await ctx.close(); await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
