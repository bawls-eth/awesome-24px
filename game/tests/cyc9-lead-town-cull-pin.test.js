// cycle 9 L (1): the Town camera cull (main.js cullOffscreen) still allocated about 4.6 KB per frame. 120 of the 266 objects it
// measured on every pass were shore foam and wave crests: they sway 10 px on shared yoyo tweens, so their box never "settled",
// in view or far out at sea. They now declare their reach (o._cpad) and their box grown by it is pinned (_cs 4): while the pinned
// box is outside the cull line they are culled unmeasured; when it crosses the line they are measured exactly as before.
// Proven here (counts and cull bits, deterministic; bytes are printed as INFO only, they swing with machine load):
//   [1] a pass measures under 22% of the objects (was 27%: 266 of 978) and >= 100 swaying images are pinned;
//   [2] at the shore, where foam is in view, every cull bit equals a fresh evaluation of the exact rule, and no pinned image in
//       view is culled;
//   [3] a pinned image moved far out of its reach into view is drawn again within 8 passes; at once after uncull().
// OFFLINE: helpers.offlineStub, db.attempts() === 0. Never chats, never writes to Firebase.
// Run: BASE=http://localhost:9901/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc9-lead-town-cull-pin.test.js
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
  await joinOffline(page, 'ADMINcyc9cull');
  await page.waitForTimeout(800);
  await frames(page, 300);

  const N = 200;
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.startSampling', { samplingInterval: 128, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  const info = await page.evaluate((n) => new Promise((res) => {
    const s = window.__g.scene.getScene('Town'); let i = 0, passes = 0, measured = 0, last = s._cullPass;
    const f = () => {
      if (s._cullPass !== last) { last = s._cullPass; passes++; measured += s._cullMeasured; }
      if (++i >= n) { const L = s.sys.displayList.list; res({ passes, measured: measured / Math.max(1, passes), objects: L.length, sway: L.filter((o) => o._cpad > 0).length, pinned: L.filter((o) => o._cpad > 0 && o._cs === 4).length, sprites: L.filter((o) => o.type === 'Sprite').length }); } else requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }), N);
  const { profile } = await cdp.send('HeapProfiler.stopSampling');
  await cdp.detach();
  let self = 0; (function walk(n) { if (n.callFrame.functionName === 'cullOffscreen') self += n.selfSize; n.children.forEach(walk); })(profile.head);
  console.log(`INFO Town standing still: ${info.objects} objects, ${info.measured.toFixed(0)} measured per pass, cullOffscreen ${Math.round(self / N)} B/frame (not asserted: swings with machine load; 4,717 before, same machine)`);
  check('[1] the cull ran and >= 100 swaying shore images declare a reach and are pinned', info.passes >= N / 4 - 2 && info.sway >= 100 && info.pinned >= info.sway * 0.9, JSON.stringify(info));
  check('[1] a pass measures under 22% of the objects (was 27%) and still every sprite', info.measured < info.objects * 0.22 && info.measured >= info.sprites, JSON.stringify(info));

  // [2] at the shore: camera on a foam dash, exact rule evaluated fresh for every object
  const shore = await page.evaluate(() => new Promise((res) => {
    const s = window.__g.scene.getScene('Town'); const cam = s.cameras.main, bit = cam.id;
    const foam = s.sys.displayList.list.filter((o) => o._cpad > 0 && o.texture && o.texture.key === 'foam_dash');
    const f0 = foam[Math.floor(foam.length / 3)];
    if (!f0) return res({ wrong: [], nWrong: -1, inViewPinned: 0, inViewCulled: -1, checked: 0 }); // no swaying image declares a reach
    cam.stopFollow(); cam.centerOn(f0.x, f0.y);
    let n = 0; const wrongAll = []; let inViewPinned = 0, inViewCulled = 0, checked = 0;
    const tick = () => {
      n++;
      if (n > 12 && n % 9 === 0) { // after ordinary passes at this spot, at several phases of the sway
        const v = cam.worldView; const M = 320, x0 = v.x - M, y0 = v.y - M, x1 = v.right + M, y1 = v.bottom + M;
        s.sys.displayList.list.forEach((o) => {
          if (o.scrollFactorX !== 1 || o.scrollFactorY !== 1 || o.type === 'Container' || o.type === 'Graphics' || o.type === 'Particles' || o.type === 'ParticleEmitter' || !o.visible) return;
          const w = o.displayWidth, h = o.displayHeight; if (!(w > 0) || !(h > 0)) return;
          const r = (o.rotation ? Math.max(w, h) : 0);
          const left = o.x - w * (o.originX === undefined ? 0.5 : o.originX) - r, top = o.y - h * (o.originY === undefined ? 0.5 : o.originY) - r;
          const now = !!(o.cameraFilter & bit);
          if (!(o._cpad > 0)) return;
          checked++;
          // a pinned image may only be culled when its true box is beyond the line; sway since the last pass (<= 3 frames) is under 2 px
          const beyond = left + w + 2 * r < x0 + 2 || left > x1 - 2 || top + h + 2 * r < y0 + 2 || top > y1 - 2;
          const inside = !(left + w + 2 * r < x0 - 14 || left > x1 + 14 || top + h + 2 * r < y0 - 14 || top > y1 + 14);
          const onScreen = !(left + w < v.x || left > v.right || top + h < v.y || top > v.bottom);
          if (onScreen) { inViewPinned++; if (now) inViewCulled++; }
          if (now && !beyond) wrongAll.push('culled but not beyond the line @' + Math.round(o.x) + ',' + Math.round(o.y));
          if (!now && !inside) wrongAll.push('kept though far beyond the line @' + Math.round(o.x) + ',' + Math.round(o.y));
        });
      }
      if (n >= 60) res({ wrong: wrongAll.slice(0, 5), nWrong: wrongAll.length, inViewPinned, inViewCulled, checked, measured: s._cullMeasured }); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
  check('[2] at the shore: swaying images are on screen (the check is real)', shore.inViewPinned >= 10 && shore.checked >= 500, JSON.stringify(shore));
  check('[2] at the shore: no swaying image on screen is culled; none is culled inside the line or kept far beyond it', shore.inViewCulled === 0 && shore.nWrong === 0, JSON.stringify(shore));

  // [3] a pinned image far away is moved out of its reach into view
  const mv = await page.evaluate(() => new Promise((res) => {
    const s = window.__g.scene.getScene('Town'); const cam = s.cameras.main, bit = cam.id; const v = cam.worldView, cx = v.centerX, cy = v.centerY;
    const far = s.sys.displayList.list.filter((o) => o._cpad > 0 && o._cs === 4 && (o.cameraFilter & bit) && Math.hypot(o.x - cx, o.y - cy) > 1500);
    if (far.length < 2) return res({ far: far.length });
    const a = far[0], b = far[1]; const out = { far: far.length };
    s.tweens.killTweensOf([a, b]);
    b.setPosition(cx + 30, cy); s.uncull(b); out.unculledAtOnce = !(b.cameraFilter & bit);
    a.setPosition(cx - 30, cy);
    let passes = 0, last = s._cullPass, at = -1;
    const tick = () => {
      if (s._cullPass !== last) { last = s._cullPass; passes++; if (at < 0 && !(a.cameraFilter & bit)) at = passes; }
      if (at >= 0 || passes >= 12) res(Object.assign(out, { seenAfterPasses: at, bStillDrawn: !(b.cameraFilter & bit) })); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
  check('[3] a pinned image moved out of its reach into view is drawn again within 8 cull passes', mv.far >= 2 && mv.seenAfterPasses >= 1 && mv.seenAfterPasses <= 8, JSON.stringify(mv));
  check('[3] uncull() draws a moved pinned image at once and it stays drawn', mv.unculledAtOnce === true && mv.bStillDrawn === true, JSON.stringify(mv));

  check('zero page errors', errors.length === 0, errors.join(' | '));
  check('no database traffic (literal 0)', db.attempts() === 0, String(db.attempts()));
  await ctx.close(); await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
