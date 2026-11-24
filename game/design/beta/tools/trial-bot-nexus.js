// Cycle 5 S: Trial of Six bot that ENTERS through the Nexus with real key input (b03-r3: rush.start() was the only way in).
// 1. Lv 20 hero placed beside the Nexus portal in the Realm (setup only), real Enter opens the Nexus.
// 2. In the plaza, real WASD walks the hero to the Trial gate (steering reads the hero position), the prompt must read
//    "Enter the Trial of Six", real E starts it. No rush.start() anywhere.
// 3. Each fight: real mouse aim + held Space to fire + WASD dodging (same dodge/orbit bot as trial-bot.js); between fights a real
//    mouse click on "Next fight". Reports fights reached, per-fight time, damage, ID-36 layer bolts fired, cap, closest bolt.
// Offline: firebase/googleapis/gstatic aborted, every WebSocket closed, town stubbed; prints the DB request count (must be 0).
// Run: BASE_ORIGIN=http://localhost:9505 NODE_PATH=$(npm root -g) node trial-bot-nexus.js [level] [slowMs] [maxFightS]
const { chromium } = require('playwright');
const ORIGIN = process.env.BASE_ORIGIN || 'http://localhost:9505';
const Q = process.env.Q || '';
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=12345&qdate=2030-05-01&heropick=0&tutorial=0' + Q;
const LEVEL = +process.argv[2] || 20, SLOW = +process.argv[3] || 0, MAXF = (+process.argv[4] || 100) * 1000;
const sv = { realm: { level: LEVEL, xp: 0, shards: 50, bestWave: 2, items: [{ n: 1, id: 'sparkwand', r: 0 }], nextUid: 2, eq: { weapon: 1 }, gv: 1, gp: { b: 0, d: 0 } } };
const E = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world, ${JSON.stringify(arg)})`);
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  let db = 0;
  await ctx.route(/firebase|googleapis|gstatic\.com\/firebasejs/, (r) => { db++; r.abort(); });
  await ctx.routeWebSocket(/.*/, (ws) => ws.close());
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([v, w]) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', v); localStorage.setItem('pixeltown-realm-v1', w); localStorage.setItem('mm-aim-assist', '0'); }, [JSON.stringify(sv), JSON.stringify({ gp: sv.realm.gp })]);
  await page.goto(WORLD);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
  await page.evaluate(() => { const a = window.__mm.arena; window.__hp = { calls: 0, dmgs: [] }; const o = a._hitPlayer.bind(a); a._hitPlayer = function (d) { window.__hp.calls++; window.__hp.dmgs.push(d); return o(d); }; }); // read-only counter
  const held = new Set();
  async function key(k, on) { if (on && !held.has(k)) { held.add(k); await page.keyboard.down(k); } else if (!on && held.has(k)) { held.delete(k); await page.keyboard.up(k); } }
  async function release() { for (const k of Array.from(held)) await key(k, false); }
  const entry = { steps: [] };
  // 1: beside the Nexus portal, real Enter
  await E(page, (a, w) => { const s = w.nexus.site; a.player.x = s.x - 20; a.player.y = s.y; return true; });
  await page.waitForTimeout(400);
  entry.prompt = await page.evaluate(() => { const b = document.getElementById('rw-nexus-go'); return b ? b.textContent : null; });
  await page.keyboard.press('Enter'); await page.waitForTimeout(500);
  entry.nexusOpen = await E(page, (a, w) => w.nexus.isOpen());
  // 2: walk to the Trial gate with WASD
  const gate = await page.evaluate(() => window.MMNexus.layout().trial);
  let stuck = 0, last = null, side = 0; const t0 = Date.now(); let label = '';
  while (Date.now() - t0 < 30000) {
    const h = await E(page, (a, w) => w.nexus.walk.hero());
    label = await page.evaluate(() => { const b = document.querySelector('#rw-nexus .rw-nx-act, #rw-nx-act, [id^="rw-nx"][id$="act"]'); return b && !b.classList.contains('hidden') ? b.textContent : ''; });
    if (/Trial of Six/.test(label) && Math.hypot(gate.x - h.x, gate.y - h.y) < 40) break;
    const dx = gate.x - h.x, dy = gate.y - h.y;
    if (last && Math.hypot(h.x - last.x, h.y - last.y) < 1) stuck++; else stuck = Math.max(0, stuck - 1);
    last = h;
    let mx = Math.abs(dx) > 6 ? Math.sign(dx) : 0, my = Math.abs(dy) > 6 ? Math.sign(dy) : 0;
    if (stuck > 6) { side = side || (Math.random() < 0.5 ? 1 : -1); if (Math.abs(dx) > Math.abs(dy)) { my = side; mx = 0; } else { mx = side; my = 0; } if (stuck > 20) { stuck = 0; side = -side; } }
    await key('d', mx > 0); await key('a', mx < 0); await key('s', my > 0); await key('w', my < 0);
    await page.waitForTimeout(60);
  }
  await release();
  entry.gateLabel = label; entry.walkMs = Date.now() - t0;
  await page.keyboard.press('e'); await page.waitForTimeout(500);
  entry.started = await E(page, (a, w) => w.rush.state());
  console.log('ENTRY', JSON.stringify(entry));
  const out = [];
  if (entry.started.on) {
    await page.mouse.move(500, 300);
    for (let step = 0; step < 6; step++) {
      if (step > 0) {
        const st = await E(page, (a, w) => w.rush.state());
        if (st.phase !== 'rest') break;
        await release();
        await page.click('#rw-rush-next'); // a real mouse click on "Next fight: <boss>"
        await page.waitForTimeout(200);
      }
      const info = await E(page, (a, w) => { const e = w.rush.entity(); return e ? { boss: e.art, step: e.rushStep, hp: e.maxHp, hp0: a.player.hp, maxHp: a.stats.maxHp } : null; });
      if (!info) { out.push({ step: step + 1, error: 'no boss' }); break; }
      const tS = Date.now(); let dmg = 0, last2 = info.hp0, outcome = 'timeout', n = 0, minD = 1e9, liveMax = 0, capMax = 0; await page.evaluate(() => { window.__hp.calls = 0; window.__hp.dmgs = []; });
      while (Date.now() - tS < MAXF) {
        const s = await E(page, (a, w) => {
          const e = w.rush.entity(); const st = w.rush.state(); const p = a.player; const cr = a.canvas.getBoundingClientRect();
          const bl = []; let live = 0, md = 1e9; for (const b of a.eBullets) if (b.active) { live++; const d = Math.hypot(b.x - p.x, b.y - p.y); if (d < md) md = d; if (d < 300) bl.push([b.x, b.y, b.vx, b.vy]); }
          return { live, md, cap: a.fireBudget ? a.fireBudget.cap : 0, alive: !!e && e.active, hp: p.hp, st, ex: e ? e.x : 0, ey: e ? e.y : 0, px: p.x, py: p.y, cx: a.camera.x, cy: a.camera.y, cw: cr.width, ch: cr.height, cl: cr.left, ct: cr.top, W: a._dv ? a._dv.vw : a.W, H: a.H, bl, dead: a.state === 'dead' || !st.on };
        });
        if (s.dead) { outcome = 'died'; break; }
        if (s.st.phase !== 'fight' || !s.alive) { outcome = 'won'; break; }
        minD = Math.min(minD, s.md); liveMax = Math.max(liveMax, s.live); capMax = Math.max(capMax, s.cap);
        if (s.hp < last2) dmg += last2 - s.hp; last2 = s.hp;
        const sx = (s.ex - s.cx) / s.W * s.cw + s.cl, sy = (s.ey - s.cy) / s.H * s.ch + s.ct;
        await page.mouse.move(Math.max(0, Math.min(999, sx)), Math.max(0, Math.min(699, sy)));
        await key(' ', true);
        const dirs = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [.7, .7], [.7, -.7], [-.7, .7], [-.7, -.7]];
        const SP = 235; let best = null; const bd = Math.hypot(s.ex - s.px, s.ey - s.py) || 1;
        for (const [dx, dy] of dirs) {
          let cost = 0;
          for (let tt = 0.05; tt <= 0.45; tt += 0.05) {
            const qx = s.px + dx * SP * tt, qy = s.py + dy * SP * tt;
            for (const b of s.bl) { const d = Math.hypot(b[0] + b[2] * tt - qx, b[1] + b[3] * tt - qy); if (d < 34) cost += (34 - d) * (1.2 - tt); }
          }
          const nd = Math.hypot(s.ex - (s.px + dx * SP * 0.3), s.ey - (s.py + dy * SP * 0.3));
          cost += Math.abs(nd - 240) * 0.04 + (dx || dy ? 0.3 : 0);
          const tx = -(s.ey - s.py) / bd, ty = (s.ex - s.px) / bd; cost -= (dx * tx + dy * ty) * 0.8;
          if (!best || cost < best.c) best = { c: cost, dx, dy };
        }
        await key('d', best.dx > 0.3); await key('a', best.dx < -0.3); await key('s', best.dy > 0.3); await key('w', best.dy < -0.3);
        if (SLOW) await page.waitForTimeout(SLOW);
        n++;
      }
      await key(' ', false);
      const secs = +((Date.now() - tS) / 1000).toFixed(1);
      const hpc = await page.evaluate(() => window.__hp);
      const lay = await E(page, (a, w) => (w.rush.ramp ? w.rush.ramp.layers() : null));
      const rec = { step: step + 1, boss: info.boss, outcome, secs, hp0: Math.round(info.hp0), maxHp: info.maxHp, dmgTaken: Math.round(dmg), hitPlayerCalls: hpc.calls, closestPx: +minD.toFixed(1), boltsAliveMax: liveMax, capMax, loopHz: +(n / secs).toFixed(1), layers: lay ? { ids: lay.ids, fired: lay.fired, dropped: lay.dropped, sweeps: lay.sweeps.length } : null };
      out.push(rec); console.log('FIGHT', JSON.stringify(rec));
      if (outcome !== 'won') break;
    }
  }
  await release();
  const fin = await E(page, (a, w) => ({ st: w.rush.state(), hp: Math.round(a.player.hp) }));
  const reached = out.filter((f) => !f.error).length, won = out.filter((f) => f.outcome === 'won').length;
  console.log('RESULT', JSON.stringify({ level: LEVEL, slowMs: SLOW, db, errs, entered: !!(entry.started && entry.started.on), fightsReached: reached, fightsWon: won, final: fin }));
  await browser.close();
})();
