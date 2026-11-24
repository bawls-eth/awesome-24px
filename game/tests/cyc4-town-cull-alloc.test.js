// Cycle 4 (L hot path): the Town camera cull (main.js cullOffscreen, every 4th frame over ~970 objects) allocated 14.6 KB per frame
// by itself, three quarters of everything main.js allocates per frame (heap sampler: 19.0 KB main.js, 164 KB with Phaser): every
// read of x / y off objects of many shapes returns a fresh boxed number (2 x 971 reads = 20.4 KB when run on every frame). Now each
// object remembers its box as four whole numbers and a box that did not change on 3 passes is measured again only every 8th pass;
// Sprites (things that walk) are measured on every pass as before.
// Proven here: [1] bytes per frame with the browser's sampling heap profiler over CDP (128 byte interval, collected objects
// included); [2] the cull bits equal a fresh evaluation of the OLD rule (word for word below) for every object, standing and after
// three walks; [3] a settled object that moves into view is drawn again within 8 passes, at once after uncull() and at once on a
// forced pass, and a Sprite on the very next pass; [4] a hidden object forgets its box.
// Bytes only, no millisecond claims. OFFLINE: helpers.offlineStub (database blocked). Never chats, never writes to Firebase.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc4-town-cull-alloc.test.js
const { chromium } = require('playwright');
const { check, done, offlineStub, exposeGame, joinOffline } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

// the old rule, word for word (main.js before cycle 4), evaluated fresh for every object: { wrong: [...], n, culled }
const oracle = (page) => page.evaluate(() => {
  const s = window.__g.scene.getScene('Town'); const cam = s.cameras.main, v = cam.worldView, bit = cam.id;
  s._cullAt = null; s._cullN = 3; s.cullOffscreen(); // a forced pass at this exact camera position
  const forcedMeasured = s._cullMeasured;
  const M = 320, x0 = v.x - M, y0 = v.y - M, x1 = v.right + M, y1 = v.bottom + M;
  const out = { wrong: [], n: 0, culled: 0, hiddenCulled: 0, forcedMeasured };
  s.sys.displayList.list.forEach((o) => {
    if (o.scrollFactorX !== 1 || o.scrollFactorY !== 1 || o.type === 'Container' || o.type === 'Graphics' || o.type === 'Particles' || o.type === 'ParticleEmitter') return;
    if (!o.visible) { if (o.cameraFilter & bit) out.hiddenCulled++; return; }
    const w = o.displayWidth, h = o.displayHeight;
    if (!(w > 0) || !(h > 0)) return;
    const r = (o.rotation ? Math.max(w, h) : 0);
    const left = o.x - w * (o.originX === undefined ? 0.5 : o.originX) - r, top = o.y - h * (o.originY === undefined ? 0.5 : o.originY) - r;
    const old = left + w + 2 * r < x0 || left > x1 || top + h + 2 * r < y0 || top > y1;
    const now = !!(o.cameraFilter & bit);
    out.n++; if (now) out.culled++;
    // whole-number boxes: within 1 px of the margin line the new rule may keep an object the old rule culled (never the other way)
    const edge = Math.min(Math.abs(left + w + 2 * r - x0), Math.abs(left - x1), Math.abs(top + h + 2 * r - y0), Math.abs(top - y1)) <= 1;
    if (now !== old && !(edge && !now)) out.wrong.push(o.type + '@' + Math.round(o.x) + ',' + Math.round(o.y) + (now ? ' culled' : ' kept'));
  });
  return out;
});

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await offlineStub(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await exposeGame(page);
  await page.goto(BASE);
  await joinOffline(page, 'ADMINcyc4cull');
  await page.waitForTimeout(800);
  await frames(page, 400); // warm: compiled, boxes settled

  // ---- [1] heap sampling over N frames, standing still ----
  const N = 300;
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.startSampling', { samplingInterval: 128, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  const passInfo = await page.evaluate((n) => new Promise((res) => {
    const s = window.__g.scene.getScene('Town'); let i = 0, passes = 0, measured = 0, last = s._cullPass;
    const f = () => { if (s._cullPass !== last) { last = s._cullPass; passes++; measured += s._cullMeasured; } if (++i >= n) res({ passes, measured: measured / Math.max(1, passes), objects: s.sys.displayList.list.length, sprites: s.sys.displayList.list.filter((o) => o.type === 'Sprite').length }); else requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }), N);
  const { profile } = await cdp.send('HeapProfiler.stopSampling');
  await cdp.detach();
  let self = 0, under = 0, main = 0;
  (function walk(n, inside) {
    const me = n.callFrame.functionName === 'cullOffscreen';
    if (/\/main\.js/.test(n.callFrame.url)) main += n.selfSize;
    if (me) self += n.selfSize; if (me || inside) under += n.selfSize;
    n.children.forEach((c) => walk(c, inside || me));
  })(profile.head, false);
  const per = (v) => Math.round(v / N);
  console.log(`Town standing still, ${passInfo.objects} objects (${passInfo.sprites} sprites), ${passInfo.passes} cull passes in ${N} frames, ${passInfo.measured.toFixed(0)} objects measured per pass: cullOffscreen ${per(self)} B/frame (with callees ${per(under)}), main.js in all ${per(main)} B/frame`);
  check('the cull ran: a pass about every 4th frame', passInfo.passes >= N / 4 - 2 && passInfo.passes <= N / 4 + 2, JSON.stringify(passInfo));
  check('a pass measures under a third of the objects (was every one: about 800 of 970)', passInfo.measured < passInfo.objects / 3 && passInfo.measured >= passInfo.sprites, JSON.stringify(passInfo));
  check('cullOffscreen itself allocates under 7000 B per frame (was 14612)', per(self) < 7000, per(self) + ' B/frame');
  check('cullOffscreen with its callees (the size getters) allocates under 8500 B per frame (was 17308)', per(under) < 8500, per(under) + ' B/frame');

  // ---- [2] same cull bits as the old rule, standing and after walks ----
  const o0 = await oracle(page);
  check('[2] standing: every cull bit equals the old rule (' + o0.n + ' objects, ' + o0.culled + ' culled)', o0.wrong.length === 0 && o0.culled > 300 && o0.hiddenCulled === 0, JSON.stringify(o0.wrong.slice(0, 6)));
  check('[2] a forced pass (_cullAt = null) measures every visible object', o0.forcedMeasured >= o0.n, JSON.stringify({ measured: o0.forcedMeasured, n: o0.n }));
  for (const [x, y] of [[300, 300], [1800, 1000], [900, 1500]]) {
    await page.evaluate(([px, py]) => { window.__g.scene.getScene('Town').localBody.setPosition(px, py); }, [x, y]);
    await frames(page, 30);
    // NOT forced first: what the running game holds must already be right for everything that is in view
    const live = await page.evaluate(() => {
      const s = window.__g.scene.getScene('Town'); const cam = s.cameras.main, v = cam.worldView, bit = cam.id; const bad = [];
      s.sys.displayList.list.forEach((o) => {
        if (!o.visible || !(o.cameraFilter & bit) || o.scrollFactorX !== 1) return;
        const w = o.displayWidth, h = o.displayHeight; if (!(w > 0) || !(h > 0)) return;
        const left = o.x - w * (o.originX === undefined ? 0.5 : o.originX), top = o.y - h * (o.originY === undefined ? 0.5 : o.originY);
        if (left + w > v.x && left < v.right && top + h > v.y && top < v.bottom) bad.push(o.type + '@' + Math.round(o.x) + ',' + Math.round(o.y));
      });
      return bad;
    });
    check(`[2] at ${x},${y}: nothing in view is culled in the running game`, live.length === 0, live.slice(0, 5).join(' '));
    const o1 = await oracle(page);
    check(`[2] at ${x},${y}: every cull bit equals the old rule (${o1.n} objects, ${o1.culled} culled)`, o1.wrong.length === 0 && o1.culled > 300, JSON.stringify(o1.wrong.slice(0, 6)));
  }

  // ---- [3] a settled object that moves ----
  await frames(page, 60);
  const mv = await page.evaluate(() => new Promise((res) => {
    const s = window.__g.scene.getScene('Town'); const cam = s.cameras.main, bit = cam.id, v = cam.worldView;
    const cx = v.x + v.width / 2, cy = v.y + v.height / 2;
    const far = s.sys.displayList.list.filter((o) => o.type === 'Image' && o.visible && (o.cameraFilter & bit) && o._cs >= 3 && o.scrollFactorX === 1);
    const spr = s.sys.displayList.list.filter((o) => o.type === 'Sprite' && o.visible && (o.cameraFilter & bit) && !o.body);
    const out = { settledCulledImages: far.length, culledSprites: spr.length };
    if (far.length < 3) return res(out);
    const [a, b, c] = far; const home = [a, b, c].map((o) => [o, o.x, o.y]);
    const p0 = s._cullPass;
    a.setPosition(cx, cy);                 // plain move: seen within 8 passes
    b.setPosition(cx + 40, cy); s.uncull(b); // pooled-object path: drawn at once
    out.unculledAtOnce = !(b.cameraFilter & bit) && b._cs === 0;
    // a Sprite is measured on EVERY pass: an ordinary (not forced) pass right after the move must see it (done in one go: the game
    // moves its own sprites back on the next update)
    let sp = null; if (spr.length) { sp = spr[0]; const hx = sp.x, hy = sp.y; sp.setPosition(cx, cy + 40); s._cullN = 3; s.cullOffscreen(); out.spriteSeenNextPass = !(sp.cameraFilter & bit) && s._cullPass === p0 + 1; sp.setPosition(hx, hy); }
    const p1 = s._cullPass;
    let passes = 0, last = p1, aAt = -1, frames = 0;
    const f = () => {
      frames++;
      if (s._cullPass !== last) { last = s._cullPass; passes++; if (aAt < 0 && !(a.cameraFilter & bit)) aAt = passes; }
      if (passes < 10 && frames < 400) return requestAnimationFrame(f);
      out.movedSeenAfterPasses = aAt; out.bStillDrawn = !(b.cameraFilter & bit);
      c.setPosition(cx - 40, cy); s._cullAt = null; s._cullN = 3; s.cullOffscreen(); out.forcedSeen = !(c.cameraFilter & bit);
      // [4] hidden: the box is forgotten, the cull bit cleared
      a.setVisible(false); s._cullAt = null; s._cullN = 3; s.cullOffscreen(); out.hiddenForgets = !a._cs && !(a.cameraFilter & bit); a.setVisible(true);
      home.forEach(([o, x, y]) => { o.setPosition(x, y); s.uncull(o); });
      res(out);
    };
    requestAnimationFrame(f);
  }));
  console.log('moves: ' + JSON.stringify(mv));
  check('[3] there are settled, culled images to move (the test is real)', mv.settledCulledImages >= 3, JSON.stringify(mv));
  check('[3] a settled image moved into view is drawn again within 8 cull passes', mv.movedSeenAfterPasses >= 1 && mv.movedSeenAfterPasses <= 8, JSON.stringify(mv));
  check('[3] uncull() (the pooled-object path) draws it at once and it stays drawn', mv.unculledAtOnce === true && mv.bStillDrawn === true, JSON.stringify(mv));
  check('[3] a forced pass sees a moved settled image at once', mv.forcedSeen === true, JSON.stringify(mv));
  check('[3] a Sprite moved into view is drawn on the next ordinary pass, as before', mv.culledSprites > 0 && mv.spriteSeenNextPass === true, JSON.stringify(mv));
  check('[4] a hidden object forgets its box and is never left culled', mv.hiddenForgets === true, JSON.stringify(mv));
  check('zero page errors', errors.length === 0, errors.join(' | '));
  check('no database traffic', db.attempts() === 0, String(db.attempts()));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
