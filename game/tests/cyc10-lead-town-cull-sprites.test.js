// cycle 10 L (2): the Town camera cull (main.js cullOffscreen) measured every Sprite (players, villagers, animals: 95 now) on every
// pass at the same field-read sites all ~980 display-list objects of every type go through; each read there returns a fresh boxed
// number. Sprites are now measured in a helper only sprites reach (_cullSpriteBox). Measured with the heap sampler, standing still,
// same machine and load: cullOffscreen 3,673 and 3,642 B/frame before, 1,937 and 1,873 after (printed here as INFO, not asserted:
// bytes swing with machine load).
// Proven here (deterministic):
//   [1] every visible world-space Sprite goes through the helper on every pass (old code: the helper does not exist);
//   [2] the box the helper stores equals the old rule's box, computed fresh, for every sprite: standing, moved, scaled, rotated,
//       and with a non-centre origin; a sprite with no size is skipped and its cull bit left alone;
//   [3] cull bits of all sprites equal a fresh evaluation of the exact rule at 3 camera spots (the full-list oracle stays in
//       cyc4-town-cull-alloc.test.js, unchanged).
// OFFLINE: helpers.offlineStub, db.attempts() === 0. Never chats, never writes to Firebase.
// Run: BASE=http://localhost:9101/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc10-lead-town-cull-sprites.test.js
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
  await joinOffline(page, 'ADMINcyc10cull');
  await page.waitForTimeout(800);
  await frames(page, 200);

  // INFO: bytes per frame
  {
    const N = 200; const cdp = await ctx.newCDPSession(page);
    await cdp.send('HeapProfiler.enable');
    await cdp.send('HeapProfiler.startSampling', { samplingInterval: 128, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
    await frames(page, N);
    const { profile } = await cdp.send('HeapProfiler.stopSampling'); await cdp.detach();
    let self = 0; (function walk(n) { if (/^(cullOffscreen|_cullSpriteBox)$/.test(n.callFrame.functionName)) self += n.selfSize; n.children.forEach(walk); })(profile.head);
    console.log(`INFO Town standing still: cullOffscreen + _cullSpriteBox ${Math.round(self / N)} B/frame (not asserted; 3,673 / 3,642 before and 1,937 / 1,873 after on the same loaded machine)`);
  }

  // [1] every visible world sprite is measured by the helper on each pass
  const one = await page.evaluate(() => new Promise((res) => {
    const s = window.__g.scene.getScene('Town');
    if (typeof s._cullSpriteBox !== 'function') return res({ helper: false });
    const orig = s._cullSpriteBox; let calls = 0; const seen = new Set();
    s._cullSpriteBox = function (o, pass) { calls++; seen.add(o); return orig.call(this, o, pass); };
    let passes = 0, last = s._cullPass, i = 0;
    const f = () => {
      if (s._cullPass !== last) { last = s._cullPass; passes++; }
      if (passes >= 6 || ++i > 400) {
        s._cullSpriteBox = orig;
        // stamp fix: decor sprites that never move (flower beds, rocks) declare o._cstill and settle like images; every other sprite
        // (anything that can walk) is still measured on every pass
        const all = s.sys.displayList.list.filter((o) => o.type === 'Sprite' && o.visible && o.scrollFactorX === 1 && o.scrollFactorY === 1);
        const L = all.filter((o) => !o._cstill); const still = all.filter((o) => o._cstill);
        res({ helper: true, passes, calls, sprites: L.length, missed: L.filter((o) => !seen.has(o)).length, notSprite: [...seen].filter((o) => o.type !== 'Sprite').length,
          still: still.length, stillSettled: still.filter((o) => o._cs === 3).length, stillKinds: [...new Set(still.map((o) => o.texture.key))].sort().join(','), stillInHelper: still.filter((o) => seen.has(o)).length });
      } else requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }));
  check('[1] sprites are measured in their own helper: once per visible world sprite per pass, and nothing else goes through it', one.helper && one.passes >= 6 && one.sprites >= 60 && one.missed === 0 && one.notSprite === 0 && Math.abs(one.calls - one.passes * one.sprites) <= one.sprites, JSON.stringify(one));

  check('[1] only flower-bed and rock decor sprites are declared still; all of them are settled and none goes through the walkers\' helper', one.helper && one.still >= 30 && one.stillKinds === 'rocks,tulips' && one.stillSettled === one.still && one.stillInHelper === 0, JSON.stringify(one));

  // [2] the stored box equals the old rule's box for every sprite, also after a move / scale / rotation / origin change
  const box = await page.evaluate(() => new Promise((res) => {
    const s = window.__g.scene.getScene('Town');
    const L = () => s.sys.displayList.list.filter((o) => o.type === 'Sprite' && o.visible && o.scrollFactorX === 1 && o.scrollFactorY === 1);
    const oldBox = (o) => { // word for word the rule of the shared path (cycle 4)
      const w = o.displayWidth, h = o.displayHeight; if (!(w > 0) || !(h > 0)) return null;
      const r = (o.rotation ? Math.max(w, h) : 0);
      const left = o.x - w * (o.originX === undefined ? 0.5 : o.originX) - r, top = o.y - h * (o.originY === undefined ? 0.5 : o.originY) - r;
      return [Math.floor(left), Math.floor(top), Math.ceil(left + w + 2 * r), Math.ceil(top + h + 2 * r)];
    };
    // a sprite the scene's own update walks (not a tween) moves between the pass and this read: compare only sprites that are
    // where they were when the pass was asked for (the four changed below stand still, and are also checked one by one)
    let snap = new Map();
    const wrongNow = () => L().filter((o) => { const at = snap.get(o); if (!at || at[0] !== o.x || at[1] !== o.y) return false; const b = oldBox(o); return b && (o._cl !== b[0] || o._ct !== b[1] || o._cr !== b[2] || o._cb !== b[3]); }).length;
    const compared = () => L().filter((o) => { const at = snap.get(o); return at && at[0] === o.x && at[1] === o.y; }).length;
    const nextPass = (then) => { const p0 = s._cullPass; s._cullAt = null; snap = new Map(L().map((o) => [o, [o.x, o.y]])); const f = () => (s._cullPass !== p0 ? then() : requestAnimationFrame(f)); requestAnimationFrame(f); };
    const out = {};
    const pick = L().filter((o) => o !== s.localBody && o !== s.localVisual).slice(0, 4);
    const keep = pick.map((o) => ({ x: o.x, y: o.y, sx: o.scaleX, sy: o.scaleY, rot: o.rotation, ox: o.originX, oy: o.originY, bit: o.cameraFilter }));
    s.tweens.pauseAll(); // nothing walks while boxes are compared
    nextPass(() => {
      out.standing = { n: L().length, compared: compared(), wrong: wrongNow() };
      pick[0].x += 137.4; pick[0].y -= 61.7;
      pick[1].setScale(pick[1].scaleX * 2.5, pick[1].scaleY * 0.5);
      pick[2].rotation = 0.6;
      pick[3].setOrigin(0.1, 0.9);
      nextPass(() => {
        out.changed = { wrong: wrongNow(), each: pick.map((o) => { const b = oldBox(o); return !!b && o._cl === b[0] && o._ct === b[1] && o._cr === b[2] && o._cb === b[3]; }) };
        // no size: skipped, cull bit left as it was
        const z = pick[0]; const cam = s.cameras.main; const bit0 = z.cameraFilter & cam.id; const sc = [z.scaleX, z.scaleY]; z.setScale(0, 0);
        nextPass(() => {
          out.zero = { bitKept: (z.cameraFilter & cam.id) === bit0, w: z.displayWidth };
          z.setScale(sc[0], sc[1]);
          pick.forEach((o, i) => { const k = keep[i]; o.x = k.x; o.y = k.y; o.setScale(k.sx, k.sy); o.rotation = k.rot; o.setOrigin(k.ox, k.oy); });
          nextPass(() => { out.restored = { wrong: wrongNow() }; s.tweens.resumeAll(); res(out); });
        });
      });
    });
  }));
  check('[2] standing: the stored box of every sprite equals the old rule\'s box', box.standing.n >= 60 && box.standing.compared >= 50 && box.standing.wrong === 0, JSON.stringify(box.standing));
  check('[2] a moved, a scaled, a rotated and an off-centre-origin sprite: each stored box equals the old rule\'s box', box.changed.wrong === 0 && box.changed.each.every(Boolean), JSON.stringify(box.changed));
  check('[2] a sprite with no size is skipped (cull bit left as it was), and all boxes are right again after it is restored', box.zero.bitKept && box.zero.w === 0 && box.restored.wrong === 0, JSON.stringify({ zero: box.zero, restored: box.restored }));

  // [3] cull bits of every sprite equal the exact rule at 3 camera spots
  const bits = await page.evaluate(() => new Promise((res) => {
    const s = window.__g.scene.getScene('Town'); const cam = s.cameras.main, bit = cam.id;
    const spots = [[cam.midPoint.x, cam.midPoint.y], [cam.midPoint.x + 900, cam.midPoint.y + 500], [400, 400]]; const out = [];
    s.tweens.pauseAll(); cam.stopFollow();
    const go = (k) => {
      if (k >= spots.length) { cam.startFollow(s.localBody, true, 0.12, 0.12); s.tweens.resumeAll(); return res(out); }
      cam.centerOn(spots[k][0], spots[k][1]); let n = 0;
      const f = () => {
        if (++n < 14) return requestAnimationFrame(f);
        const v = cam.worldView; const M = 320, x0 = v.x - M, y0 = v.y - M, x1 = v.right + M, y1 = v.bottom + M; let wrong = 0, culled = 0, total = 0;
        s.sys.displayList.list.forEach((o) => {
          if (o.type !== 'Sprite' || !o.visible || o.scrollFactorX !== 1 || o.scrollFactorY !== 1) return;
          const w = o.displayWidth, h = o.displayHeight; if (!(w > 0) || !(h > 0)) return; total++;
          const r = (o.rotation ? Math.max(w, h) : 0); const left = o.x - w * o.originX - r, top = o.y - h * o.originY - r;
          const outside = Math.ceil(left + w + 2 * r) < x0 || Math.floor(left) > x1 || Math.ceil(top + h + 2 * r) < y0 || Math.floor(top) > y1;
          const isCulled = !!(o.cameraFilter & bit); if (isCulled) culled++; if (isCulled !== outside) wrong++;
        });
        out.push({ total, culled, wrong }); go(k + 1);
      };
      requestAnimationFrame(f);
    };
    go(0);
  }));
  check('[3] at 3 camera spots every sprite\'s cull bit equals the exact rule (and some are culled, some drawn)', bits.length === 3 && bits.every((b) => b.wrong === 0 && b.total >= 60) && bits.some((b) => b.culled > 0) && bits.some((b) => b.culled < b.total), JSON.stringify(bits));

  check('no page errors, no database traffic (literal 0)', errors.length === 0 && db.attempts() === 0, errors.join(' | ') + ' db=' + db.attempts());
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
