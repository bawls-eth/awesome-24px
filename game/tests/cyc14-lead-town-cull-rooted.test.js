// cycle 14 L (2): headroom for the Town camera cull (main.js cullOffscreen). The pin test cyc9-lead-town-cull-pin allows 22% of the
// objects per pass (215 of 978) and a pass was at 212. About 30 of those measures were trees, tree fruit and rooted specimens
// (plants and other things that never walk): settled images re-read every 8th pass in case something moved them, though no code
// path does. They now declare it (o._cfix) and their settled box is kept for 64 passes. No threshold was changed anywhere.
// Proven here (counts and cull bits, deterministic):
//   [1] standing still a pass measures under 200 objects (was 212) and still at least every sprite; >= 180 images are declared
//       rooted, none of them a Sprite, none of them a specimen that walks / flies / swims;
//   [2] a rooted image far outside the view is measured on at most 2 of 40 passes (before: 5) and stays culled;
//   [3] every rooted image: its cull bit equals a fresh evaluation of the exact rule, at spawn and after three camera jumps (after
//       ordinary passes), and none that is on screen is culled;
//   [5] an Image animal (walks / flies / swims, not a strip Sprite) is declared only while it rests far from the camera; when the
//       camera comes it is drawn at once and un-declared at the next specimen sweep;
//   [4] the escape hatches still work for a rooted image: uncull() after a move draws it on the same frame; hiding and showing it
//       reads it again on the next pass; a forced pass sees a moved one at once; moved without any of these it is drawn again
//       within 64 passes (the declared wait).
// OFFLINE: helpers.offlineStub, db.attempts() === 0. Never chats, never writes to Firebase.
// Run: BASE=http://localhost:9101/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc14-lead-town-cull-rooted.test.js
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
  await joinOffline(page, 'ADMINcyc14cull');
  await page.waitForTimeout(800);
  await frames(page, 300);

  // ---- [1] the count ----
  const info = await page.evaluate(() => new Promise((res) => {
    const s = window.__g.scene.getScene('Town'); let i = 0, passes = 0, measured = 0, last = s._cullPass;
    const f = () => {
      if (s._cullPass !== last) { last = s._cullPass; passes++; measured += s._cullMeasured; }
      if (++i >= 320) {
        const L = s.sys.displayList.list; const fix = L.filter((o) => o._cfix);
        // a walker (Image animal) may be declared only while it rests far from the camera: not active, its last step ended
        const walkers = new Set(s.ffSpecimens.filter((x) => x.move && x.move !== 'still' && (x.active || x.moving || s.ffNear.indexOf(x) >= 0)).map((x) => x.sprite));
        const always = new Set(s.treeGraphics.concat(Object.values(s.treeFruit).filter(Boolean), s.ffSpecimens.filter((x) => !x.move || x.move === 'still').map((x) => x.sprite)));
        res({ passes, measured: measured / Math.max(1, passes), objects: L.length, sprites: L.filter((o) => o.type === 'Sprite').length, fix: fix.length,
          fixSprites: fix.filter((o) => o.type === 'Sprite').length, fixWalkers: fix.filter((o) => walkers.has(o)).length, rooted: fix.filter((o) => always.has(o)).length, resting: fix.filter((o) => !always.has(o)).length,
          trees: s.treeGraphics.filter((g) => g._cfix).length, treeCount: s.treeGraphics.length, fixSettled: fix.filter((o) => o.visible && o._cs === 3).length });
      } else requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }));
  console.log(`INFO Town standing still: ${info.objects} objects, ${info.measured.toFixed(1)} measured per pass (212 before), ${info.sprites} sprites, ${info.fix} rooted`);
  check('[1] the cull ran; a pass measures under 20.5% of the objects (was 21.7%: 212 of 978; 23.2% with the cycle 14 insects and no fix) and still at least every sprite', info.passes >= 70 && info.measured < info.objects * 0.205 && info.measured >= info.sprites, JSON.stringify(info));
  check('[1] >= 180 images are declared rooted (every tree) and >= 40 Image animals resting far from the camera; no Sprite, no animal that is near the camera or mid-step', info.rooted >= 180 && info.resting >= 40 && info.trees === info.treeCount && info.treeCount >= 50 && info.fixSprites === 0 && info.fixWalkers === 0, JSON.stringify(info));

  // ---- [2] a far rooted image: how often is it measured ----
  const far = await page.evaluate(() => new Promise((res) => {
    const s = window.__g.scene.getScene('Town'); const cam = s.cameras.main, bit = cam.id, v = cam.worldView;
    const c = s.sys.displayList.list.filter((o) => o._cfix && o.visible && (o.cameraFilter & bit) && Math.hypot(o.x - v.centerX, o.y - v.centerY) > 1500).slice(0, 12);
    if (c.length < 12) return res({ n: c.length });
    let passes = 0, last = s._cullPass; const m = c.map(() => 0), cul = c.map(() => 0);
    // "measured on this pass" = the pass rewrote its stamp (a kept box leaves _cv as it was)
    const prev = c.map((o) => o._cv);
    const f = () => {
      if (s._cullPass !== last) { last = s._cullPass; passes++; c.forEach((o, k) => { if (o._cv !== prev[k]) { m[k]++; prev[k] = o._cv; } if (o.cameraFilter & bit) cul[k]++; }); }
      if (passes >= 40) res({ n: c.length, passes, maxMeasured: Math.max(...m), total: m.reduce((a, b) => a + b, 0), alwaysCulled: cul.every((x) => x === passes) }); else requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }));
  check('[2] 12 rooted images far outside the view: each is measured on at most 2 of 40 passes (before: 5 each, 60 in all) and stays culled', far.n === 12 && far.passes === 40 && far.maxMeasured <= 2 && far.total <= 12 && far.alwaysCulled, JSON.stringify(far));

  // ---- [3] exact rule for every rooted image, at four camera spots ----
  const rule = await page.evaluate(() => new Promise((res) => {
    const s = window.__g.scene.getScene('Town'); const cam = s.cameras.main, bit = cam.id;
    const home = { x: cam.worldView.centerX, y: cam.worldView.centerY };
    const trees = s.treeGraphics; const spots = [null, trees[3], trees[Math.floor(trees.length / 2)], trees[trees.length - 2]];
    const out = { wrong: [], checked: 0, onScreen: 0, onScreenCulled: 0, spots: 0 };
    let k = 0, n = 0;
    const evalNow = () => {
      const v = cam.worldView; const M = 320, x0 = v.x - M, y0 = v.y - M, x1 = v.right + M, y1 = v.bottom + M;
      s.sys.displayList.list.forEach((o) => {
        if (!o._cfix || !o.visible) return;
        const w = o.displayWidth, h = o.displayHeight; if (!(w > 0) || !(h > 0)) return;
        const r = (o.rotation ? Math.max(w, h) : 0);
        const left = o.x - w * o.originX - r, top = o.y - h * o.originY - r, right = left + w + 2 * r, bottom = top + h + 2 * r;
        const now = !!(o.cameraFilter & bit); out.checked++;
        // a kept box may be up to 6 px stale (a 4 px bob, floor / ceil): allowed only within 8 px of the line, 320 px off screen
        const beyond = right < x0 + 8 || left > x1 - 8 || bottom < y0 + 8 || top > y1 - 8;
        const inside = !(right < x0 - 8 || left > x1 + 8 || bottom < y0 - 8 || top > y1 + 8);
        const onScreen = !(right < v.x || left > v.right || bottom < v.y || top > v.bottom);
        if (onScreen) { out.onScreen++; if (now) out.onScreenCulled++; }
        if (now && !beyond) out.wrong.push('culled inside the line: ' + o.texture.key + '@' + Math.round(o.x) + ',' + Math.round(o.y));
        if (!now && !inside) out.wrong.push('kept far beyond the line: ' + o.texture.key + '@' + Math.round(o.x) + ',' + Math.round(o.y));
      });
    };
    const tick = () => {
      n++;
      if (n === 1) { const t = spots[k]; if (t) { cam.stopFollow(); cam.centerOn(t.x, t.y); } }
      if (n === 14) { evalNow(); out.spots++; k++; n = 0; if (k >= spots.length) { cam.centerOn(home.x, home.y); cam.startFollow(s.localBody, true, 0.15, 0.15); out.wrong = out.wrong.slice(0, 5).concat(out.wrong.length > 5 ? ['... ' + out.wrong.length + ' in all'] : []); return res(out); } }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
  check('[3] rooted images at 4 camera spots (after ordinary passes): the checks are real (>= 700 evaluations, >= 20 on screen)', rule.spots === 4 && rule.checked >= 700 && rule.onScreen >= 20, JSON.stringify(rule));
  check('[3] no rooted image on screen is culled; none is culled inside the cull line or kept far beyond it', rule.onScreenCulled === 0 && rule.wrong.length === 0, JSON.stringify(rule));
  await frames(page, 90);

  // ---- [4] escape hatches ----
  const mv = await page.evaluate(() => new Promise((res) => {
    const s = window.__g.scene.getScene('Town'); const cam = s.cameras.main, bit = cam.id, v = cam.worldView, cx = v.centerX, cy = v.centerY;
    const c = s.sys.displayList.list.filter((o) => o._cfix && o.visible && o._cs === 3 && (o.cameraFilter & bit) && Math.hypot(o.x - cx, o.y - cy) > 1500 && s.treeGraphics.indexOf(o) >= 0);
    if (c.length < 3) return res({ n: c.length });
    const [a, b, e] = c; const out = { n: c.length };
    s.tweens.killTweensOf([a, b, e]);
    b.setPosition(cx + 60, cy); s.uncull(b); out.unculledAtOnce = !(b.cameraFilter & bit);
    a.setPosition(cx, cy + 80); // no hatch: the declared wait
    let passes = 0, last = s._cullPass, aAt = -1;
    const tick = () => {
      if (s._cullPass !== last) {
        last = s._cullPass; passes++;
        if (aAt < 0 && !(a.cameraFilter & bit)) aAt = passes;
      }
      if (aAt >= 0 || passes >= 70) {
        // a forced pass sees a moved rooted image at once
        e.setPosition(cx + 120, cy + 80); s._cullAt = null; s.cullOffscreen();
        res(Object.assign(out, { plainSeenAfter: aAt, bStillDrawn: !(b.cameraFilter & bit), forcedSeen: !(e.cameraFilter & bit) }));
      } else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
  check('[4] uncull() after a move draws a rooted image on the same frame and it stays drawn', mv.n >= 3 && mv.unculledAtOnce === true && mv.bStillDrawn === true, JSON.stringify(mv));
  check('[4] a forced pass sees a moved rooted image at once', mv.forcedSeen === true, JSON.stringify(mv));
  check('[4] moved with no hatch it is drawn again within 64 passes (the declared wait; it is not lost for good)', mv.plainSeenAfter >= 1 && mv.plainSeenAfter <= 64, JSON.stringify(mv));
  // hide -> one pass while hidden -> show: read on the next pass
  const hs = await page.evaluate(() => new Promise((res) => {
    const s = window.__g.scene.getScene('Town'); const cam = s.cameras.main, bit = cam.id, v = cam.worldView, cx = v.centerX, cy = v.centerY;
    const o = s.sys.displayList.list.find((x) => x._cfix && x.visible && x._cs === 3 && (x.cameraFilter & bit) && Math.hypot(x.x - cx, x.y - cy) > 1500 && s.treeGraphics.indexOf(x) >= 0);
    if (!o) return res({ found: false });
    o.setVisible(false); let last = s._cullPass, phase = 0, passes = 0;
    const tick = () => {
      if (s._cullPass !== last) {
        last = s._cullPass;
        if (phase === 0) { phase = 1; o.setPosition(cx - 120, cy - 80); o.setVisible(true); }
        else { passes++; if (!(o.cameraFilter & bit) || passes >= 12) return res({ found: true, seenAfter: (o.cameraFilter & bit) ? -1 : passes }); }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
  check('[4] hidden, moved and shown again, a rooted image is read on the next pass', hs.found && hs.seenAfter === 1, JSON.stringify(hs));

  // ---- [5] an Image animal resting far away: the camera comes to it -> it takes its declaration back and is drawn ----
  const wake = await page.evaluate(() => new Promise((res) => {
    const s = window.__g.scene.getScene('Town'); const cam = s.cameras.main, bit = cam.id, v = cam.worldView;
    const spec = s.ffSpecimens.find((x) => x.move && x.move !== 'still' && !x.strip && x.sprite._cfix === 1 && x.sprite.visible && (x.sprite.cameraFilter & bit) && Math.hypot(x.sprite.x - v.centerX, x.sprite.y - v.centerY) > 1500);
    if (!spec) return res({ found: false });
    const o = spec.sprite; cam.stopFollow(); cam.centerOn(o.x, o.y);
    const t0 = performance.now(); let drawnAt = -1, freeAt = -1, n = 0;
    const tick = () => {
      n++; const t = performance.now() - t0;
      if (drawnAt < 0 && !(o.cameraFilter & bit)) drawnAt = n;
      if (freeAt < 0 && o._cfix === 0) freeAt = Math.round(t);
      if ((drawnAt >= 0 && freeAt >= 0) || t > 3000) { const out = { found: true, id: spec.id, drawnAfterFrames: drawnAt, undeclaredAfterMs: freeAt, active: spec.active, near: s.ffNear.indexOf(spec) >= 0 }; cam.startFollow(s.localBody, true, 0.15, 0.15); res(out); }
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
  check('[5] the camera jumps onto a resting Image animal: it is drawn within 2 frames (the jump forces a pass; its kept box is right) and takes its declaration back at the next 400 ms specimen sweep', wake.found && wake.drawnAfterFrames >= 1 && wake.drawnAfterFrames <= 2 && wake.undeclaredAfterMs >= 0 && wake.undeclaredAfterMs <= 1500 && wake.near, JSON.stringify(wake));
  await frames(page, 30);

  check('zero page errors', errors.length === 0, errors.join(' | '));
  check('no database traffic (literal 0)', db.attempts() === 0, String(db.attempts()));
  await ctx.close(); await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
