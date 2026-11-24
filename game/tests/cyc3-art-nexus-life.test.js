// Cycle 3 art (G): Nexus plaza life in the walk view. Torches play their 4 frames with a flickering warm glow, the banners' cloth
// sways in 2 px row bands, the NPC portraits bob 1 px on their own phase; reduced motion = still; ?nxlife=0 = the old static bake.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc3-art-nexus-life.test.js
// No Firebase (blockDb), the Town page is stubbed, nothing written anywhere but this context's localStorage.
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const LS = require('./lib/load-scale');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=12345&qdate=2030-05-01';
const SAVE = { realm: { level: 4, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 } } };
const E = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world, ${JSON.stringify(arg)})`);
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

async function run(browser, q, reduce) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await blockDb(ctx);
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([v, r]) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', v); localStorage.setItem('mm-reduce-motion', r ? '1' : '0'); }, [JSON.stringify(SAVE), reduce]);
  await page.goto(WORLD + (q || ''));
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
  await page.waitForFunction(() => !window.__mm.world.artState().loading, null, { timeout: 20000 }).catch(() => {});
  await E(page, (a, w) => { a.player.iframes = 1e9; a._hitPlayer = () => {}; const s = w.nexus.site; a.player.x = s.x - 20; a.player.y = s.y; });
  await frames(page, 15); await page.click('#rw-nexus-go'); await frames(page, 4);
  // NPC portraits load async: wait for all 12 animated items (2 torches, 3 banners, 7 NPCs) when life is on
  await page.waitForFunction(() => { const l = window.__mm.world.nexus.walk.life(); return !l.on || l.items >= 12; }, null, { timeout: 15000 }).catch(() => {});
  await E(page, (a, w) => { const L = window.MMNexus.layout(); const t = L.props.find((p) => p.id === 'torch_w'); w.nexus.walk.place((t.tx + 2.5) * 32, (t.ty + 0.5) * 32); });
  const seen = { f: new Set(), sway: new Set(), bob: new Set() }; let diff = 0; let prev = null;
  for (let i = 0; i < 14; i++) {
    await page.waitForTimeout(110);
    const r = await E(page, (a, w) => {
      const l = w.nexus.walk.life(); const cv = document.querySelector('#rw-nexus canvas'); const cam = w.nexus.walk.cam();
      const L = window.MMNexus.layout(); const t = L.props.find((p) => p.id === 'torch_w'); const x = Math.round((t.tx + 0.5) * 32 - cam.x), y = Math.round((t.ty + 0.5) * 32 + 16 - cam.y);
      const sx = cv.width / w.nexus.walk.view.w; const d = cv.getContext('2d').getImageData(Math.max(0, (x - 40) * sx), Math.max(0, (y - 90) * sx), 80 * sx, 90 * sx).data;
      let h = 0; for (let k = 0; k < d.length; k += 16) h = (h * 31 + d[k] + d[k + 1] * 3 + d[k + 2] * 7) >>> 0;
      return { l, h };
    });
    seen.f.add(r.l.lastTorchF); seen.sway.add(r.l.lastSway); seen.bob.add(r.l.lastBob);
    if (prev !== null && r.h !== prev) diff++; prev = r.h;
    seen.last = r.l;
  }
  await ctx.close();
  return { seen, diff, l: seen.last, errors };
}

(async () => {
  const browser = await chromium.launch();
  const on = await run(browser, '', false);
  const l = on.l;
  check('life on: 2 torches, 3 banners, 7 NPC portraits animated per frame', l.on && l.torches === 2 && l.banners === 3 && l.npcs === 7, JSON.stringify(l));
  check('torches cycle their frames (>= 3 of 4 seen)', on.seen.f.size >= 3, JSON.stringify([...on.seen.f]));
  check('banner cloth sways (>= 2 distinct offsets, |offset| <= 2 px)', on.seen.sway.size >= 2 && [...on.seen.sway].every((v) => Math.abs(v) <= 2), JSON.stringify([...on.seen.sway]));
  check('NPC portraits bob 0 / 1 px', on.seen.bob.has(0) && on.seen.bob.has(1), JSON.stringify([...on.seen.bob]));
  check('the torch area of the walk canvas really changes between frames', on.diff >= 4, String(on.diff));
  const per = l.ms / Math.max(1, l.frames);
  check('life cost per frame < ' + LS.budget(1.5).toFixed(2) + ' ms (measured ' + per.toFixed(3) + ' ms over ' + l.frames + ' frames)', l.frames > 20 && per < LS.budget(1.5), per.toFixed(3));
  const red = await run(browser, '', true);
  check('reduced motion: still (torch frame 0, no sway, no bob)', red.l.on && [...red.seen.f].every((v) => v === 0) && [...red.seen.sway].every((v) => v === 0) && [...red.seen.bob].every((v) => v === 0), JSON.stringify([[...red.seen.f], [...red.seen.sway], [...red.seen.bob]]));
  const off = await run(browser, '?nxlife=0', false);
  check('?nxlife=0: no animated items (the old static bake)', !off.l.on && off.l.items === 0 && off.l.frames === 0, JSON.stringify(off.l));
  check('no page errors', [on, red, off].every((r) => r.errors.length === 0), [on, red, off].map((r) => r.errors.join(' | ')).join(' '));
  console.log('INFO nexus life per-frame cost', per.toFixed(3), 'ms;', l.frames, 'frames');
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
