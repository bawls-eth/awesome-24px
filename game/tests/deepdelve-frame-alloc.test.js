// cycle 2 (L, hot path): what the Deepdelve frame allocates. Three things used to be built on every frame:
//   1. raycast(): per ray step (126 steps) an array AND, inside MMChunks.getBlock, a 'cx,cy,cz' string key: 11.9 KB per ray
//      (measured: 4.2 KB of arrays, 7.7 KB of keys), once or twice a frame while turning or mining
//   2. syncBenches(): benches.map(...).join(';') (an array and a string, every frame)
//   3. renderIfChanged(): a string key of 13 numbers (about 150 characters, every frame)
// Now: the ray works on plain numbers, MMChunks keeps the last chunk (shared-mm-chunks-last-chunk.test.js), the bench list and the render key are compared number by number in kept arrays.
// Allocation is measured with the browser's own sampling heap profiler (bytes by function, objects already collected included),
// so the numbers are real bytes, not guesses. Behaviour is pinned by an oracle (the old raycast, 3000 poses) and by draw counts.
// Run: BASE=http://localhost:9721/game/index.html THREE_JS=/tmp/three.min.js NODE_PATH=$(npm root -g) node game/tests/deepdelve-frame-alloc.test.js
// Standalone page, no Firebase. Every WebSocket is closed.
const { chromium } = require('playwright');
const fs = require('fs');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = ORIGIN + '/game/games/deepdelve/index.html?test=1&seed=7';
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';

// bytes allocated per function name while `run` executes in the page
async function sample(ctx, page, run, arg) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.startSampling', { samplingInterval: 128, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  const out = await page.evaluate(run, arg);
  const { profile } = await cdp.send('HeapProfiler.stopSampling');
  await cdp.detach();
  const by = {};
  (function walk(n) { const k = n.callFrame.functionName || '(anon)'; if (/deepdelve\.js/.test(n.callFrame.url)) by[k] = (by[k] || 0) + n.selfSize; n.children.forEach(walk); })(profile.head);
  return { by, out };
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.addInitScript(() => {
    window.__gl = { clear: 0 };
    for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
      if (!C) continue; const f = C.prototype.clear; C.prototype.clear = function () { window.__gl.clear++; return f.apply(this, arguments); };
    }
  });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  if (process.env.THREE_JS) await page.route(THREE_URL, (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(process.env.THREE_JS) }));
  await page.goto(URL);
  await page.waitForFunction(() => window.__dd && window.__dd.ready, null, { timeout: 60000 });
  await page.evaluate(() => { window.__dd.settle(); });
  await page.waitForTimeout(1500);

  // 1. oracle: the old raycast (copied here as it was) against the new one, 3000 poses around the spawn
  const orc = await page.evaluate(() => {
    const d = window.__dd, p = d.player, EYE = 1.62, AIR = 0, keep = [p.x, p.y, p.z, p.yaw, p.pitch];
    const B = window.MMChunks.B, WATER = B.WATER, BAIR = B.AIR;
    const old = (reach) => {
      const e = [p.x, p.y + EYE, p.z], cp = Math.cos(p.pitch), dd = [-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp];
      let prev = null;
      for (let t = 0; t <= reach; t += 0.04) {
        const c = [Math.floor(e[0] + dd[0] * t), Math.floor(-(e[1] + dd[1] * t)), Math.floor(e[2] + dd[2] * t)];
        if (c[1] < 0) { prev = c; continue; }
        const id = d.getBlock(c[0], c[1], c[2]);
        if (id !== BAIR && id !== WATER) return { cell: c, id, prev };
        if (!prev || prev[0] !== c[0] || prev[1] !== c[1] || prev[2] !== c[2]) prev = c;
      }
      return null;
    };
    let s = 12345; const rnd = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; };
    let n = 0, bad = 0, hits = 0, nulls = 0, first = '', inside = 0, above = 0;
    for (let i = 0; i < 3000; i++) {
      p.x = keep[0] + (rnd() - 0.5) * 20; p.z = keep[2] + (rnd() - 0.5) * 20; p.y = keep[1] + 3 - rnd() * 14;
      p.yaw = rnd() * 7 - 3.5; p.pitch = rnd() * 3.1 - 1.55;
      const reach = i % 5 === 0 ? 2 + rnd() * 6 : 5;
      const a = JSON.stringify(old(reach)), b = JSON.stringify(d.raycast(reach));
      n++; if (a !== b) { bad++; if (!first) first = a + ' vs ' + b; }
      if (a === 'null') nulls++; else { hits++; const o = JSON.parse(a); if (o.prev === null) inside++; else if (o.prev[1] < 0) above++; }
    }
    p.x = keep[0]; p.y = keep[1]; p.z = keep[2]; p.yaw = keep[3]; p.pitch = keep[4];
    return { n, bad, hits, nulls, first, inside, above, hasB: typeof BAIR === 'number' && typeof WATER === 'number' && AIR === 0 };
  });
  console.log('oracle: ' + JSON.stringify(orc));
  check('the oracle has the block ids and saw hits, misses and eye-inside-a-block cases', orc.hasB && orc.hits > 300 && orc.nulls > 100 && orc.inside > 5, JSON.stringify(orc));
  check('raycast gives the same { cell, id, prev } as the old code in 3000 poses', orc.n === 3000 && orc.bad === 0, orc.first);

  // 2. bytes per raycast call (2000 calls, the pose changes each call so nothing is cached)
  const r1 = await sample(ctx, page, () => {
    const d = window.__dd, p = d.player, yaw = p.yaw, pitch = p.pitch; let hits = 0;
    for (let i = 0; i < 2000; i++) { p.yaw = yaw + i * 0.003; p.pitch = -0.6 + (i % 50) * 0.02; if (d.raycast(5)) hits++; }
    p.yaw = yaw; p.pitch = pitch; return hits;
  });
  const rayBytes = Math.round(((r1.by.raycast || 0) + (r1.by.cellOf || 0) + (r1.by.eyePos || 0) + (r1.by.lookDir || 0)) / 2000);
  console.log('raycast: ' + rayBytes + ' bytes per call (' + r1.out + ' hits of 2000); by function ' + JSON.stringify(r1.by));
  check('a raycast allocates under 400 bytes (was 11.9 KB: an array and a chunk key string per step): ' + rayBytes, rayBytes < 400, JSON.stringify(r1.by));

  // 3. 240 idle frames with two benches placed: no per-frame map/join, no per-frame key string, and no redraw
  await page.evaluate(() => { const d = window.__dd, p = d.player; d.benches.push([Math.floor(p.x) + 2, 3, Math.floor(p.z)], [Math.floor(p.x) - 2, 3, Math.floor(p.z)]); });
  await page.waitForTimeout(700);
  const idle = await sample(ctx, page, () => new Promise((res) => {
    const n = { map: 0, join: 0, frames: 0, clear0: window.__gl.clear };
    const m = Array.prototype.map, j = Array.prototype.join;
    Array.prototype.map = function () { n.map++; return m.apply(this, arguments); };
    Array.prototype.join = function () { n.join++; return j.apply(this, arguments); };
    const step = () => { if (++n.frames < 240) return requestAnimationFrame(step); Array.prototype.map = m; Array.prototype.join = j; n.clears = window.__gl.clear - n.clear0; res(n); };
    requestAnimationFrame(step);
  }));
  const keyBytes = Math.round((idle.by.renderIfChanged || 0) / 240), benchBytes = Math.round((idle.by.syncBenches || 0) / 240);
  let total = 0; Object.keys(idle.by).forEach((k) => { total += idle.by[k]; });
  console.log('idle 240 frames: ' + JSON.stringify(idle.out) + '; renderIfChanged ' + keyBytes + ' B/frame, syncBenches ' + benchBytes + ' B/frame, all of deepdelve.js ' + Math.round(total / 240) + ' B/frame; ' + JSON.stringify(idle.by));
  check('the probe saw 240 frames', idle.out.frames === 240);
  check('no Array map / join per idle frame (was 1 map and 3 joins a frame with two benches): ' + idle.out.map + ' / ' + idle.out.join, idle.out.map <= 4 && idle.out.join <= 4, JSON.stringify(idle.out));
  check('the render key costs under 100 bytes a frame (was about 675: a 150-character string): ' + keyBytes, keyBytes < 100, JSON.stringify(idle.by));
  check('the bench check costs under 40 bytes a frame: ' + benchBytes, benchBytes < 40, JSON.stringify(idle.by));
  check('idle frames are still not redrawn (at most one picture per 500 ms): ' + idle.out.clears + ' clears in 240 frames', idle.out.clears <= 24, JSON.stringify(idle.out));

  // 4. behaviour kept: a change of any key part redraws, a bench change is seen by the scene
  const drawn = async (fn) => page.evaluate((src) => new Promise((res) => {
    const c0 = window.__gl.clear; (new Function('return (' + src + ')')())();
    requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => res(window.__gl.clear - c0))));
  }), fn.toString());
  check('turning the camera redraws', (await drawn(() => { window.__dd.player.yaw += 0.2; })) >= 1);
  check('looking up or down redraws', (await drawn(() => { window.__dd.player.pitch -= 0.1; })) >= 1);
  check('moving redraws', (await drawn(() => { window.__dd.player.x += 0.25; })) >= 1);
  check('a new bench redraws', (await drawn(() => { const d = window.__dd, p = d.player; d.benches.push([Math.floor(p.x), 3, Math.floor(p.z) + 2]); })) >= 1);
  check('a moved bench (same count) redraws', (await drawn(() => { window.__dd.benches[0][0] += 1; })) >= 1);
  check('a removed bench redraws', (await drawn(() => { window.__dd.benches.splice(0, 1); })) >= 1);
  check('and with nothing changed the next frames are not drawn', (await drawn(() => {})) === 0);
  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  done();
})();
