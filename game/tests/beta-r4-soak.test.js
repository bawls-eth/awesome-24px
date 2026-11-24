// R4 extended stress (b13-04 Realm soak, b13-08 listener creep, b13-05 Deepdelve taps). Several minutes; full tier.
//  A. Realm world, 4x CPU, 390x844 touch, SOAK_MIN minutes (default 3): each 20 s cycle spawns a 12-enemy crowd, walks 4 directions
//     with screen taps, opens / closes the backpack and the board 3x and rotates once. Listeners and DOM nodes (after a forced GC)
//     must plateau after the first cycle (the first panel open builds its DOM once), no page errors, fps over a load-scaled floor.
//  B. Deepdelve 1x, 390x844 touch: DD_TAPS (default 40) random taps 500 ms apart: no long task over a load-scaled budget, at most
//     a load-scaled count over 100 ms, no page errors. Every Playwright step races a timeout, so a GPU stall (see r4-d3.md) fails
//     with a message instead of hanging.
// Budgets use lib/load-scale.js (factor 1 on an idle box). No network: Firebase hosts aborted, the town exit stubbed.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-r4-soak.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const LS = require('./lib/load-scale');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/.*$/, '');
const SOAK_MIN = Number(process.env.SOAK_MIN || 3);
const DD_TAPS = Number(process.env.DD_TAPS || 40);
const race = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('stalled: ' + what + ' > ' + ms + ' ms')), ms))]);

async function newCtx(b) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.route(/firebaseio|firebasedatabase|gstatic\.com\/firebasejs/, (r) => r.abort());
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: 'town' }));
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  return { ctx, p, errors };
}

async function realm(b) {
  const { ctx, p, errors } = await newCtx(b);
  await p.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', JSON.stringify({ realm: { level: 6, xp: 0, items: [], nextUid: 1 } })); });
  await p.goto(ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=12345');
  await p.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 60000 });
  await p.evaluate(() => {
    const a = window.__mm.arena; a.player.iframes = 1e9; a._hitPlayer = () => {};
    window.__ft = []; let last = performance.now();
    const f = (t) => { window.__ft.push(t - last); last = t; if (window.__ft.length > 4000) window.__ft.splice(0, 2000); requestAnimationFrame(f); }; requestAnimationFrame(f);
  });
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const sample = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    const m = (await cdp.send('Performance.getMetrics')).metrics.reduce((o, x) => { o[x.name] = x.value; return o; }, {});
    const fr = await p.evaluate(() => { const a = window.__ft.splice(0).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : 0; });
    return { L: m.JSEventListeners, N: m.Nodes, median: Math.round(fr) };
  };
  const out = [];
  const T0 = Date.now(); let cyc = 0;
  const keys = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'];
  try {
    while (Date.now() - T0 < SOAK_MIN * 60000) {
      cyc++;
      await race(p.evaluate(() => { const a = window.__mm.arena, pl = a.player, t = ['spiral', 'aimed', 'ring']; for (let i = 0; i < 12; i++) a.spawnEnemy(t[i % 3], pl.x + Math.cos(i) * 180, pl.y + Math.sin(i) * 180); }), 30000, 'spawn');
      for (const k of keys) { await p.keyboard.down(k); await race(p.touchscreen.tap(200, 420), 30000, 'tap'); await p.waitForTimeout(1500); await p.keyboard.up(k); }
      for (let i = 0; i < 3; i++) { await p.keyboard.press('b'); await p.waitForTimeout(400); await p.keyboard.press('b'); await p.waitForTimeout(300); await p.keyboard.press('k'); await p.waitForTimeout(400); await p.keyboard.press('Escape'); await p.waitForTimeout(300); }
      await p.setViewportSize({ width: 844, height: 390 }); await p.waitForTimeout(700); await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(700);
      if (cyc === 1 || cyc % 3 === 0) out.push({ t: Math.round((Date.now() - T0) / 1000), ...(await race(sample(), 60000, 'metrics')) });
    }
  } catch (e) { check('[realm] soak ran to the end without a stalled step', false, e.message); }
  console.log('  realm samples ' + JSON.stringify(out));
  const base = out[0] || { L: 0, N: 0 }, last = out[out.length - 1] || base;
  check(`[realm] ${SOAK_MIN} min soak: listeners plateau after the first cycle (delta <= 10)`, out.length >= 2 && last.L - base.L <= 10, `${base.L} -> ${last.L}`);
  check('[realm] DOM nodes plateau (delta <= 150)', out.length >= 2 && last.N - base.N <= 150, `${base.N} -> ${last.N}`);
  const worst = Math.max(...out.slice(1).map((s) => s.median), 0);
  check(`[realm] median frame of every window under ${LS.budget(50)} ms at 4x (load-scaled 50)`, worst > 0 && worst < LS.budget(50), String(worst));
  check('[realm] no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

async function deepdelve(b) {
  const { ctx, p, errors } = await newCtx(b);
  await p.addInitScript(() => { window.__lt = []; new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(Math.round(e.duration)))).observe({ entryTypes: ['longtask'] }); });
  await p.goto(ORIGIN + '/game/games/deepdelve/index.html?test=1');
  await p.waitForFunction(() => window.__dd && window.__dd.ready || document.querySelector('#gl'), null, { timeout: 60000 });
  await p.waitForTimeout(3000);
  // baseline: the same length of time with no input (the page still re-renders twice a second; on software GL that alone makes
  // long tasks on a busy box), so the checks below measure what the TAPS add, which is the b13-05 claim
  await p.evaluate(() => { window.__lt = []; });
  await p.waitForTimeout(DD_TAPS * 520);
  const idle = await p.evaluate(() => window.__lt.splice(0));
  let s = 4242; const rnd = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; };
  let stalled = '';
  for (let i = 0; i < DD_TAPS && !stalled; i++) {
    const x = Math.floor(rnd() * 390), y = Math.floor(200 + rnd() * 500);
    // only the play view: a tap on World / Mode would leave or rebuild the world (a different, intended cost)
    const onView = await race(p.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return !!e && e.id === 'gl'; }, [x, y]), LS.budget(10000), 'hit test').catch((e) => { stalled = e.message; return false; });
    if (!onView) continue;
    try { await race(p.touchscreen.tap(x, y), LS.budget(10000), 'tap ' + i); } catch (e) { stalled = e.message; }
    await p.waitForTimeout(500);
  }
  const lt = stalled ? [] : await race(p.evaluate(() => window.__lt.slice()), 30000, 'read').catch(() => []);
  const over = lt.filter((x) => x > 100).length, overIdle = idle.filter((x) => x > 100).length;
  const maxT = Math.max(0, ...lt), maxIdle = Math.max(0, ...idle);
  console.log(`  deepdelve idle ${idle.length} long tasks (${overIdle} > 100 ms, max ${maxIdle}); ${DD_TAPS} taps: ${lt.length} long tasks (${over} > 100 ms, max ${maxT}) (load factor ${LS.factor()})`);
  check('[deepdelve] every tap is acknowledged (no GPU stall)', !stalled, stalled);
  const capMax = Math.max(Math.round(maxIdle * 1.5), LS.budget(300));
  check(`[deepdelve] taps add no long task over ${capMax} ms (max(idle x1.5, load-scaled 300))`, !stalled && maxT < capMax, `${maxT} vs idle ${maxIdle}`);
  const extra = Math.round(4 * LS.factor());
  check(`[deepdelve] taps add at most ${extra} long tasks over 100 ms to the idle baseline (load-scaled 4)`, !stalled && over <= overIdle + extra, `${over} vs idle ${overIdle}`);
  check('[deepdelve] no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

(async () => {
  const b = await chromium.launch();
  await realm(b);
  await deepdelve(b);
  await b.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
