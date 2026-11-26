// cycle 13 L (stamp fix): the Town camera cull (main.js cullOffscreen) measured every moving image / shape / label on every pass,
// also while it was culled far outside the view (critter shadows, NPC name labels: about 12 of ~100 non-sprite measures per pass).
// With G's 17 new strip animals the pass went to 223 of 978 objects, over the 22% pin of cyc9-lead-town-cull-pin (not changed).
// Now a non-sprite mover that was measured and found beyond the cull line (view + 320 px) is marked (_cf) and read again on the 8th
// pass, the wait a settled object already has; uncull(), hiding it or a forced pass wake it at once; in view it is measured on every
// pass as before; Sprites never take this path. Proven here (counts and cull bits, deterministic):
//   [1] a mover far outside the view (1 px per frame) is measured on at most 1 pass in 4 over 40 passes (before: every pass) and
//       stays culled;
//   [2] the same mover inside the view is measured on every pass and never culled;
//   [3] a mover that walks from far outside into the view at 300 px/s is never culled while any part of it is inside the view;
//   [4] a far mover that JUMPS into view without uncull() is drawn again within 8 passes; with uncull() on the next frame;
//   [5] hiding and showing a far mover drops the mark (it is measured on the next pass);
//   [6] a walking Sprite far outside the view is still measured on every pass (the sprite rule is unchanged);
//   [7] standing still, the Town marks >= 5 far movers of its own and the pass measures fewer objects than a pass with the
//       marks cleared (printed; the 22% pin itself stays in cyc9-lead-town-cull-pin).
// OFFLINE: helpers.offlineStub, db.attempts() === 0. Never chats, never writes to Firebase.
// Run: BASE=http://localhost:9131/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc13-lead-town-cull-far.test.js
const { chromium } = require('playwright');
const { check, done, offlineStub, exposeGame, joinOffline } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await offlineStub(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await exposeGame(page);
  await page.goto(BASE);
  await joinOffline(page, 'ADMINcyc13cull');
  await page.waitForTimeout(800);

  // run(setup, step, passes): per cull pass, was the object measured (its _cv is this pass) and is it culled; per frame, step()
  const r = await page.evaluate(() => new Promise((res) => {
    const s = window.__g.scene.getScene('Town'); const cam = s.cameras.main, bit = cam.id; const out = {};
    const watch = (o, step, passes, each) => new Promise((ok) => {
      let last = s._cullPass, n = 0, measured = 0, culledPasses = 0;
      const f = () => {
        if (step) step();
        if (s._cullPass !== last) { last = s._cullPass; n++; if (o._cv === last) measured++; if (o.cameraFilter & bit) culledPasses++; }
        if (each) each();
        if (n >= passes) ok({ passes: n, measured, culledPasses }); else requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    });
    const v = () => cam.worldView;
    (async () => {
      // [1] far mover: an ellipse 2500 px right of the view, 1 px per frame back and forth
      const far = s.add.ellipse(v().right + 2500, v().centerY, 30, 12, 0x000000, 0.4); let d = 1, k = 0;
      await watch(far, null, 6); // first measures
      out.far = await watch(far, () => { far.x += d; if (++k % 30 === 0) d = -d; }, 40);
      out.farFlag = far._cf === 1;
      // [5] hide + show drops the mark
      far.setVisible(false); await watch(far, null, 1); const flagHidden = far._cf; far.setVisible(true);
      const sh = await watch(far, null, 1); out.hideShow = { flagHidden: flagHidden | 0, measuredNext: sh.measured };
      // [4] jump into view without uncull: drawn within 8 passes
      await watch(far, () => { far.x += 1; }, 10);
      far.setPosition(v().centerX + 100, v().centerY + 60);
      let seenAfter = -1; { let last = s._cullPass, n = 0; await new Promise((ok) => { const f = () => { if (s._cullPass !== last) { last = s._cullPass; n++; if (!(far.cameraFilter & bit) && seenAfter < 0) seenAfter = n; } if (n >= 12 || seenAfter >= 0) ok(); else requestAnimationFrame(f); }; requestAnimationFrame(f); }); }
      out.jumpSeenAfter = seenAfter;
      // back out, marked again, then jump with uncull(): not culled at once
      far.setPosition(v().right + 2500, v().centerY); await watch(far, () => { far.x += 1; }, 12);
      const marked = far._cf === 1 && !!(far.cameraFilter & bit);
      far.setPosition(v().centerX + 100, v().centerY + 60); s.uncull(far);
      out.uncull = { marked, bitClear: !(far.cameraFilter & bit), flag: far._cf | 0 };
      const un = await watch(far, null, 3); out.uncull.culledPasses = un.culledPasses;
      // [2] a mover inside the view: measured every pass, never culled
      let d2 = 1, k2 = 0;
      out.near = await watch(far, () => { far.x += d2; if (++k2 % 20 === 0) d2 = -d2; }, 30);
      far.destroy();
      // [3] walks in from far outside at 300 px/s: never culled while inside the view
      const walker = s.add.ellipse(v().right + 1500, v().centerY - 80, 30, 12, 0x000000, 0.4); let wrong = 0, frames = 0, entered = false;
      await watch(walker, null, 4);
      await watch(walker, () => { walker.x -= 5; }, 90, () => { frames++; const w = v(); const inside = walker.x + 15 > w.x && walker.x - 15 < w.right; if (inside) { entered = true; if (walker.cameraFilter & bit) wrong++; } });
      out.walk = { wrong, frames, entered }; walker.destroy();
      // [6] a walking sprite far away: measured on every pass
      const L = s.sys.displayList.list;
      const sp = L.find((o) => o.type === 'Sprite' && !o._cstill && o.visible && (o.cameraFilter & bit) && o.scrollFactorX === 1);
      out.sprite = sp ? await watch(sp, null, 24) : null;
      // [7] the Town's own far movers, and what a pass costs with and without the marks
      const avg = (clear, passes) => new Promise((ok) => { let last = s._cullPass, n = 0, tot = 0; const f = () => { if (clear) L.forEach((o) => { if (o._cf) o._cf = 0; }); if (s._cullPass !== last) { last = s._cullPass; n++; tot += s._cullMeasured; } if (n >= passes) ok(tot / n); else requestAnimationFrame(f); }; requestAnimationFrame(f); });
      await avg(false, 12);
      out.marks = L.filter((o) => o._cf === 1).length; out.markSprites = L.filter((o) => o._cf === 1 && o.type === 'Sprite' && !o._cstill).length;
      out.withMarks = await avg(false, 40); out.noMarks = await avg(true, 40); out.objects = L.length;
      res(out);
    })();
  }));

  check('[1] a mover far outside the view is marked and measured on at most 1 pass in 4 (before: every pass)', r.farFlag && r.far.passes === 40 && r.far.measured <= 10 && r.far.measured >= 4, JSON.stringify(r.far));
  check('[1] and it stays culled on every pass', r.far.culledPasses === 40, JSON.stringify(r.far));
  check('[2] the same mover inside the view is measured on every pass and never culled', r.near.measured === r.near.passes && r.near.culledPasses === 0, JSON.stringify(r.near));
  check('[3] a mover walking into the view at 300 px/s is never culled while inside the view', r.walk.entered && r.walk.wrong === 0, JSON.stringify(r.walk));
  check('[4] a far mover that jumps into view without uncull() is drawn within 8 passes', r.jumpSeenAfter >= 1 && r.jumpSeenAfter <= 8, String(r.jumpSeenAfter));
  check('[4] with uncull() it is drawn at once and the mark is gone', r.uncull.marked && r.uncull.bitClear && r.uncull.flag === 0 && r.uncull.culledPasses === 0, JSON.stringify(r.uncull));
  check('[5] hiding a far mover drops the mark; shown again it is measured on the next pass', r.hideShow.flagHidden === 0 && r.hideShow.measuredNext === 1, JSON.stringify(r.hideShow));
  check('[6] a walking Sprite far outside the view is still measured on every pass', !!r.sprite && r.sprite.measured === r.sprite.passes, JSON.stringify(r.sprite));
  check('[7] the Town marks >= 5 far movers of its own, none of them a walking Sprite', r.marks >= 5 && r.markSprites === 0, JSON.stringify({ marks: r.marks, sprites: r.markSprites }));
  console.log(`INFO measured per pass: ${r.withMarks.toFixed(1)} with the marks, ${r.noMarks.toFixed(1)} with the marks cleared every frame, ${r.objects} objects`);
  check('[7] a pass with the marks measures at least 5 objects fewer than one without', r.noMarks - r.withMarks >= 5, `${r.withMarks.toFixed(1)} vs ${r.noMarks.toFixed(1)}`);
  check('no page errors', errors.length === 0, errors.join(' | ').slice(0, 200));
  check('no database request attempted', db.attempts() === 0, String(db.attempts()));
  await browser.close();
  done();
})();
