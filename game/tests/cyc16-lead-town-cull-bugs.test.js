// cycle 16 L (clock-dependent stamp red): cyc14-lead-town-cull-rooted [1] failed only during the daily 2-hour Bug-Off (its UTC start
// hour is hashed from the day): its 8 extra bugs plus the 8 normal ones are Text movers fluttering in the village, in view or inside
// the 320 px margin, and each was measured on EVERY cull pass (5 to 11 measures: 205-207 of 978 objects, the line is 200.5).
// The bugs now declare themselves slow ambient movers (o._cdraw): one found inside the cull line (drawn) keeps that bit and is read
// again on the 8th pass. Proven here with the Bug-Off forced live (independent of the wall clock):
//   [1] standing still, a pass measures under 20.5% of the objects and still at least every sprite (the cyc14 rule, unchanged);
//   [2] every live bug inside the cull line is measured on at most 1 pass in 4 (before: every pass);
//   [3] never culled while any part of it is on screen (checked every frame while they flutter);
//   [4] a bug moved far outside the view without uncull() is culled within 9 passes, and hidden + shown it is measured on the next pass;
//   [5] the pin test's walking-Sprite rule is untouched: a far walking Sprite is still measured on every pass.
// OFFLINE: helpers.offlineStub, db.attempts() === 0. Never chats, never writes to Firebase.
// Run: BASE=http://localhost:9101/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc16-lead-town-cull-bugs.test.js
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
  await joinOffline(page, 'ADMINcyc16bugs');
  await page.waitForTimeout(800);
  // the Bug-Off live, whatever the hour: all 16 bugs out
  const live = await page.evaluate(() => { const s = window.__g.scene.getScene('Town'); s.isBugOffTime = () => true; s.refreshBugOff(); return s.bugs.filter((b) => b.alive && b.sprite.visible).length; });
  await frames(page, 300);

  const r = await page.evaluate(() => new Promise((res) => {
    const s = window.__g.scene.getScene('Town'); const cam = s.cameras.main, bit = cam.id; const L = s.sys.displayList.list;
    const bugs = s.bugs.filter((b) => b.alive && b.sprite.visible).map((b) => b.sprite);
    const per = bugs.map(() => ({ inLine: 0, measured: 0 }));
    let last = s._cullPass, passes = 0, measured = 0, onScreenCulled = 0, framesN = 0;
    const f = () => {
      framesN++;
      const v = cam.worldView;
      bugs.forEach((o) => { const w = o.displayWidth, h = o.displayHeight; const l = o.x - w / 2, t = o.y - h / 2; const on = !(l + w < v.x || l > v.right || t + h < v.y || t > v.bottom); if (on && (o.cameraFilter & bit)) onScreenCulled++; });
      if (s._cullPass !== last) {
        last = s._cullPass; passes++; measured += s._cullMeasured;
        const M = 320, x0 = v.x - M, y0 = v.y - M, x1 = v.right + M, y1 = v.bottom + M;
        bugs.forEach((o, k) => { const w = o.displayWidth, h = o.displayHeight; const l = o.x - w / 2, t = o.y - h / 2; const inside = !(l + w < x0 || l > x1 || t + h < y0 || t > y1); if (inside && !(o.cameraFilter & bit)) { per[k].inLine++; if (o._cv === last || o._cdv === last) per[k].measured++; } });
      }
      if (passes >= 80) res({ passes, measured: measured / passes, objects: L.length, sprites: L.filter((o) => o.type === 'Sprite').length, bugs: bugs.length, per, onScreenCulled, framesN });
      else requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }));
  console.log(`INFO Town with the Bug-Off live, standing still: ${r.objects} objects, ${r.measured.toFixed(1)} measured per pass, ${r.sprites} sprites, ${r.bugs} bugs out`);
  check('the Bug-Off is live with 16 bugs out', live === 16 && r.bugs === 16, `${live} / ${r.bugs}`);
  check('[1] a pass measures under 20.5% of the objects and still at least every sprite', r.passes >= 80 && r.measured < r.objects * 0.205 && r.measured >= r.sprites, JSON.stringify({ measured: r.measured, objects: r.objects, sprites: r.sprites }));
  const watched = r.per.filter((p) => p.inLine >= 20);
  check('[2] every live bug inside the cull line is measured on at most 1 pass in 4 (before: every pass)', watched.length >= 4 && watched.every((p) => p.measured <= Math.ceil(p.inLine / 4)), JSON.stringify(r.per));
  check('[3] no bug is ever culled while it is on screen', r.onScreenCulled === 0 && r.framesN >= 300, JSON.stringify({ onScreenCulled: r.onScreenCulled, frames: r.framesN }));

  const far = await page.evaluate(() => new Promise((res) => {
    const s = window.__g.scene.getScene('Town'); const cam = s.cameras.main, bit = cam.id; const v = cam.worldView;
    const bug = s.bugs.find((b) => b.alive && b.sprite.visible && !(b.sprite.cameraFilter & bit));
    if (!bug) return res({ err: 'no drawn bug' });
    bug.alive = false; if (bug.tween) bug.tween.stop(); const o = bug.sprite;
    // let it be read as drawn first, then move it far away (no uncull)
    let last = s._cullPass, n = 0, phase = 0, culledAfter = -1, hideNext = -1;
    const f = () => {
      if (s._cullPass !== last) {
        last = s._cullPass; n++;
        if (phase === 0 && n >= 2) { o.setPosition(v.right + 2000, v.centerY); phase = 1; n = 0; }
        else if (phase === 1 && (o.cameraFilter & bit) && culledAfter < 0) { culledAfter = n; }
        else if (phase === 1 && n >= 12) { o.setVisible(false); phase = 2; n = 0; }
        else if (phase === 2 && n >= 1) { o.setPosition(v.centerX + 60, v.centerY - 60); o.setVisible(true); phase = 3; n = 0; }
        else if (phase === 3) { hideNext = (o._cv === last || o._cdv === last) ? 1 : 0; return res({ culledAfter, hideNext }); }
      }
      requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }));
  check('[4] a bug moved far without uncull() is culled within 9 passes', far.culledAfter >= 1 && far.culledAfter <= 9, JSON.stringify(far));
  check('[4] hidden and shown again it is measured on the next pass', far.hideNext === 1, JSON.stringify(far));

  const sp = await page.evaluate(() => new Promise((res) => {
    const s = window.__g.scene.getScene('Town'); const bit = s.cameras.main.id;
    const o = s.sys.displayList.list.find((x) => x.type === 'Sprite' && !x._cstill && x.visible && (x.cameraFilter & bit) && x.scrollFactorX === 1);
    if (!o) return res(null);
    let last = s._cullPass, n = 0, m = 0;
    const f = () => { if (s._cullPass !== last) { last = s._cullPass; n++; if (o._cv === last) m++; } if (n >= 24) res({ n, m }); else requestAnimationFrame(f); };
    requestAnimationFrame(f);
  }));
  check('[5] a far walking Sprite is still measured on every pass', !!sp && sp.m === sp.n, JSON.stringify(sp));
  check('zero page errors', errors.length === 0, errors.join(' | '));
  check('no database traffic (literal 0)', db.attempts() === 0, String(db.attempts()));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
