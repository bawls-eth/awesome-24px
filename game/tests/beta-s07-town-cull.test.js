// Beta S-07 (b13-03, round 3): Town camera culling. Off-camera world objects are excluded from the main camera through
// `cameraFilter` (never through `visible`), so Phaser stops batching ~700 of ~950 objects every frame.
// OFFLINE ONLY: blockDb + the Firebase SDK answered empty, entry through "Play offline"; never chats, never writes to Firebase.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-s07-town-cull.test.js
//  1. at spawn most objects are culled; nothing that overlaps the camera view is culled
//  2. game-owned `visible` flags are identical with culling on and off
//  3. after a long walk (camera moves) the new view is drawn (no culled object in view) within a few frames
//  4. turning culling off restores every object to the camera; JS render work per frame is printed (on vs off)
const { chromium } = require('playwright');
const { check, done, offlineStub } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';

const inViewCulled = (page) => page.evaluate(() => {
  const t = window.__g.scene.getScene('Town'); const cam = t.cameras.main; const v = cam.worldView; const bad = [];
  t.sys.displayList.list.forEach((o) => {
    if (!(o.cameraFilter & cam.id) || !o.getBounds) return;
    const b = o.getBounds();
    if (b.right >= v.x && b.left <= v.right && b.bottom >= v.y && b.top <= v.bottom) bad.push(o.type + ':' + (o.texture ? o.texture.key : '') + '@' + Math.round(o.x) + ',' + Math.round(o.y));
  });
  return bad;
});

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const db = await offlineStub(ctx);
  await ctx.route('**/main.js*', async (route) => {
    const resp = await route.fetch();
    const body = (await resp.text()).replace('const game = new Phaser.Game(config);', 'const game = window.__g = new Phaser.Game(config);');
    route.fulfill({ response: resp, body });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE);
  await page.fill('#name-input', 'ADMINs07');
  await page.click('button:has-text("Join Town")'); // offline: the SDK is stubbed, so this only offers 'Play offline'
  await page.waitForSelector('#join-offline-btn:not(.hidden)', { timeout: 20000 });
  await page.tap('#join-offline-btn');
  await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 30000 });
  await page.waitForTimeout(1500);

  const st = await page.evaluate(() => { const t = window.__g.scene.getScene('Town'); return { culled: t._culled, total: t.sys.displayList.list.length }; });
  check('[1] most world objects are culled at spawn', st.culled > st.total * 0.4, JSON.stringify(st));
  check('[1] nothing overlapping the camera view is culled', (await inViewCulled(page)).length === 0, (await inViewCulled(page)).slice(0, 5).join(' '));
  // [2] cycle 4 (L): this check compared two strings of `visible` flags BY LIST INDEX, read 300 ms apart with the game running. It was
  // red about one run in three, with or without the cull switch, because the GAME changes the list in those 300 ms: the firefly
  // sparkle pool (ffSparkles, Star, depth 99994) shows and hides stars, a pond ripple (Arc, depth -1) is added on a timer (every
  // later index shifts), and the depth sort moves 7 to 28 objects. None of that is the cull. Now the same claim is proven exactly:
  //  a. in ONE synchronous step (no game timer can run): flags per OBJECT before, after a cull-off pass, after a forced cull-on pass
  //  b. over the same 300 ms of live frames (culling off, then on): every write to `visible` is recorded with its call stack, and
  //     none may come from cullOffscreen / uncull. The game's own writes are counted and printed, not hidden.
  const vis = await page.evaluate(() => {
    const t = window.__g.scene.getScene('Town'); const L = t.sys.displayList.list.slice();
    const read = () => L.map((o) => (o.visible ? 1 : 0));
    const diff = (a, b) => a.map((v, k) => (v === b[k] ? null : k + ' ' + L[k].type + ':' + (L[k].texture ? L[k].texture.key : '') + '@' + Math.round(L[k].x) + ',' + Math.round(L[k].y) + ' ' + v + '->' + b[k])).filter(Boolean);
    const v0 = read(); const culled0 = L.filter((o) => o.cameraFilter & t.cameras.main.id).length;
    t.cullOff = true; t.cullOffscreen(); const v1 = read(); const culled1 = L.filter((o) => o.cameraFilter & t.cameras.main.id).length;
    t.cullOff = false; t._cullAt = null; t._cullN = 3; t.cullOffscreen(); const v2 = read(); const culled2 = L.filter((o) => o.cameraFilter & t.cameras.main.id).length;
    return { n: L.length, hidden: v0.filter((v) => !v).length, culled0, culled1, culled2, offDiff: diff(v0, v1).slice(0, 6), onDiff: diff(v1, v2).slice(0, 6) };
  });
  check('[2] game-owned visible flags are untouched by culling: the same objects, before / after a cull-off pass / after a forced cull-on pass (' + vis.n + ' objects, ' + vis.hidden + ' hidden)', vis.offDiff.length === 0 && vis.onDiff.length === 0 && vis.hidden > 0, JSON.stringify(vis));
  check('[2] those passes really switched the culling (culled ' + vis.culled0 + ' -> ' + vis.culled1 + ' -> ' + vis.culled2 + ')', vis.culled0 > vis.n * 0.4 && vis.culled1 === 0 && vis.culled2 > vis.n * 0.4, JSON.stringify(vis));
  // b. live frames: trap the `visible` setter of every class on the display list
  await page.evaluate(() => {
    const t = window.__g.scene.getScene('Town'); const seen = new Set(); const log = window.__visLog = { writes: 0, changes: 0, fromCull: [], who: {}, undo: [] };
    t.sys.displayList.list.forEach((o) => {
      let p = Object.getPrototypeOf(o), d = null;
      while (p && !(d = Object.getOwnPropertyDescriptor(p, 'visible'))) p = Object.getPrototypeOf(p);
      if (!p || !d || !d.set || seen.has(p)) return; seen.add(p);
      Object.defineProperty(p, 'visible', { configurable: true, enumerable: d.enumerable, get: d.get, set(v) {
        log.writes++;
        if (!!v !== !!d.get.call(this)) { log.changes++; const st = String(new Error().stack); if (/cullOffscreen|uncull/.test(st)) log.fromCull.push(this.type + '@' + Math.round(this.x) + ',' + Math.round(this.y)); const k = this.type + ' d' + Math.round(this.depth); log.who[k] = (log.who[k] || 0) + 1; }
        d.set.call(this, v);
      } });
      log.undo.push(() => Object.defineProperty(p, 'visible', d));
    });
    log.classes = seen.size; t.cullOff = true;
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__g.scene.getScene('Town').cullOff = false; });
  await page.waitForTimeout(300);
  const live = await page.evaluate(() => { const l = window.__visLog; const t = window.__g.scene.getScene('Town'); return { classes: l.classes, writes: l.writes, changes: l.changes, fromCull: l.fromCull.slice(0, 6), who: l.who, culled: t._culled }; });
  console.log('  visible writes in 600 ms of live frames (300 culling off, 300 on): ' + JSON.stringify(live));
  check('[2] over live frames with culling off and on, no write to `visible` comes from the cull (' + live.changes + ' changes by the game itself, ' + live.classes + ' classes trapped)', live.classes >= 3 && live.fromCull.length === 0, JSON.stringify(live));
  await page.evaluate(() => { window.__g.scene.getScene('Town').cullOff = true; });
  await page.waitForTimeout(300);
  check('[4] culling off restores every object to the camera', await page.evaluate(() => { const t = window.__g.scene.getScene('Town'); const id = t.cameras.main.id; return t.sys.displayList.list.every((o) => !(o.cameraFilter & id)); }));
  await page.evaluate(() => { window.__g.scene.getScene('Town').cullOff = false; });

  // walk far: teleport the player across the island, the camera follows; within a few frames the new view is complete
  for (const [x, y] of [[300, 300], [1800, 1000], [900, 1500]]) {
    await page.evaluate(([px, py]) => { const t = window.__g.scene.getScene('Town'); t.localBody.setPosition(px, py); }, [x, y]);
    await page.waitForTimeout(400);
    const bad = await inViewCulled(page);
    check(`[3] after moving to ${x},${y} nothing in view is culled`, bad.length === 0, bad.slice(0, 5).join(' '));
  }
  // [2] again, over the three walks: hundreds of objects were newly culled and un-culled there; still no `visible` write from the cull
  const walked = await page.evaluate(() => { const l = window.__visLog; l.undo.forEach((f) => f()); return { changes: l.changes, fromCull: l.fromCull.slice(0, 6), n: l.fromCull.length, who: l.who }; });
  check('[2] over the three walks too, no write to `visible` comes from the cull (' + walked.changes + ' changes by the game itself)', walked.n === 0, JSON.stringify(walked));

  // [5] R4: pooled objects (the sparkle star, firefly sparkles) jump to a new spot between two cull passes. They must not keep the
  // cull bit of their old spot (they would be undrawn for up to 3 frames in view, and [3] could catch them), and hidden objects
  // are never left culled.
  const pooled = await page.evaluate(() => {
    const t = window.__g.scene.getScene('Town'); const bit = t.cameras.main.id;
    t.sparkleStar.cameraFilter |= bit; t.sparkleGlow.cameraFilter |= bit; // as if culled at its old spot
    t.sparkleIndex = -1; t.updateSparkle(t.time.now); // the rotation moves it (index changes)
    const moved = !(t.sparkleStar.cameraFilter & bit) && !(t.sparkleGlow.cameraFilter & bit);
    t._cullAt = null; t._cullN = 3; t.cullOffscreen(); // force a pass
    const hiddenCulled = t.sys.displayList.list.filter((o) => !o.visible && (o.cameraFilter & bit)).length;
    return { moved, hiddenCulled };
  });
  check('[5] a pooled sparkle moved to a new spot is not left culled', pooled.moved, JSON.stringify(pooled));
  check('[5] no hidden object is left culled after a pass', pooled.hiddenCulled === 0, JSON.stringify(pooled));

  // JS render work, culling on vs off (printed; frame rate is fill-bound in headless SwiftShader, see design/beta/perf-town.md)
  const work = async (off) => {
    await page.evaluate((o) => { window.__g.scene.getScene('Town').cullOff = o; }, off);
    await page.waitForTimeout(300);
    return page.evaluate(() => new Promise((res) => {
      const g = window.__g; let t0 = 0, sum = 0, n = 0;
      const pre = () => { t0 = performance.now(); }; const post = () => { sum += performance.now() - t0; n++; };
      g.events.on('prerender', pre); g.events.on('postrender', post);
      setTimeout(() => { g.events.off('prerender', pre); g.events.off('postrender', post); res({ ms: +(sum / Math.max(1, n)).toFixed(2), frames: n }); }, 3000);
    }));
  };
  const on = await work(false), off = await work(true);
  console.log(`  render() JS per frame: culling on ${on.ms} ms (${on.frames} frames), off ${off.ms} ms (${off.frames} frames)`);
  check('[4] render work with culling is not higher than without', on.ms <= off.ms * 1.15, JSON.stringify({ on, off }));
  check('zero page errors', errors.length === 0, errors.join(' | '));
  check('no database traffic', db.attempts() === 0);
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
