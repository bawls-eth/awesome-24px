// Cycle 3 D: Town day-loop bot (offline stub, 0 DB requests). The page is the real Town (Play offline as ADMINd3), the Phaser loop is stepped with game.headlessStep at 1/60 s,
// the cooldown clock (scene.cooldownNow) is the simulated clock, and every action goes through the scene's own interact() (the A button handler) after the hero is
// placed on the target (walk time = straight-line distance / the speed MEASURED with the real touch stick, x1.3 for detours). Greedy: nearest ready source among trees, rocks,
// flowers, beach spots, fossils, bugs; sells at the shop when the bag holds 12+; sim minutes = argv[2] (default 10).
// Run: BASE=http://localhost:9734/game/index.html NODE_PATH=$(npm root -g) node game/design/beta/tools/town-day-bot.js [minutes]
const { chromium } = require('playwright');
const path = require('path');
const { offlineStub, joinOffline, exposeGame } = require(path.join(__dirname, '..', '..', '..', 'tests', 'helpers'));
const BASE = process.env.BASE || 'http://localhost:9734/game/index.html';
const MINUTES = +process.argv[2] || 10;
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await offlineStub(ctx);
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript(() => { let s = 12345; Math.random = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; });
  await exposeGame(page);
  await page.goto(BASE);
  await joinOffline(page, 'ADMINd3');
  const res = await page.evaluate(([MIN]) => {
    const g = window.__g, s = g.scene.getScene('Town');
    let T = 0; s.cooldownNow = () => T * 1000; // simulated clock
    const tick = (n) => { for (let k = 0; k < n; k++) { T += 1 / 60; g.headlessStep(1e6 + T * 1000, 1000 / 60); } };
    // measured walking speed with the real touch stick
    s.touchMove = { x: 1, y: 0 }; const x0 = s.localBody.x; tick(60); s.touchMove = { x: 0, y: 0 }; tick(20); const speed = Math.abs(s.localBody.x - x0) / 1.0;
    const place = (x, y) => { s.localBody.setPosition(x, y); s.localBody.body.reset(x, y); tick(2); };
    const items = () => { const r = s.resources || {}; return Object.keys(r).reduce((a, k) => a + (+r[k] || 0), 0); };
    const bySrc = {}; const log = []; let stars0 = s.localScore, t0 = T;
    const list = [];
    TREES.forEach(([x, y], i) => list.push({ k: 'tree' + i, type: 'tree', x: x, y: y - 10, cd: 20 }));
    ROCKS.forEach(([x, y], i) => list.push({ k: 'rock' + i, type: 'rock', x: x, y: y, cd: 20 }));
    FLOWER_SPOTS.forEach((p, i) => list.push({ k: 'flower' + i, type: 'flower', x: p.x, y: p.y, cd: 30 }));
    BEACH_SPOTS.forEach((p, i) => list.push({ k: 'beach' + i, type: 'beach', x: p.x, y: p.y, cd: 20 }));
    FOSSIL_SPOTS.forEach((p, i) => list.push({ k: 'fossil' + i, type: 'fossil', x: p.x, y: p.y, cd: 25 }));
    const ready = {}; let sells = 0, sold = 0, idle = 0, walk = 0, fails = 0;
    const shop = { x: HOUSE_POS.x + HOUSE_POS.w / 2, y: HOUSE_POS.y + HOUSE_POS.h / 2 };
    while (T - t0 < MIN * 60) {
      const hx = s.localBody.x, hy = s.localBody.y; let best = null, bd = 1e9;
      (s.bugs || []).forEach((b, i) => { if (b.alive && b.sprite) { const d = Math.hypot(b.sprite.x - hx, b.sprite.y - hy); if (d < bd) { bd = d; best = { k: 'bug' + i, type: 'bug', x: b.sprite.x, y: b.sprite.y }; } } });
      list.forEach((c) => { if ((ready[c.k] || 0) > T) return; const d = Math.hypot(c.x - hx, c.y - hy); if (d < bd) { bd = d; best = c; } });
      if (!best) { tick(60); idle++; continue; }
      const w = bd * 1.3 / speed; tick(Math.max(1, Math.round(w * 60))); walk += w;
      place(best.x, best.y);
      const before = items(); s.interact(); tick(10);
      const gain = items() - before;
      if (gain > 0) { bySrc[best.type] = (bySrc[best.type] || 0) + gain; log.push([+(T - t0).toFixed(1), best.type, gain]); } else fails++;
      ready[best.k] = T + (best.cd || 15);
      if (items() >= 12 && shop) { /* sell: stand next to the shop and press A */ place(shop.x, shop.y + 10); const s0 = s.localScore, i0 = items(); s.interact(); tick(10); if (s.localScore > s0) { sells++; sold += s.localScore - s0; } }
    }
    const mins = (T - t0) / 60;
    return { speed: Math.round(speed), minutes: +mins.toFixed(1), counts: { trees: TREES.length, rocks: ROCKS.length, flowers: FLOWER_SPOTS.length, beach: BEACH_SPOTS.length, fossils: FOSSIL_SPOTS.length, bugs: BUG_COUNT, villagers: VILLAGERS.length }, items: bySrc, itemsPerMin: Object.keys(bySrc).reduce((a, k) => a + bySrc[k], 0) / mins, starsPerMin: (s.localScore - stars0) / mins, sells, sold, walkShare: +(walk / (T - t0)).toFixed(2), failedInteracts: fails, firstTen: log.slice(0, 12), bagLeft: items(), shopKnown: !!shop };
  }, [MINUTES]);
  console.log(JSON.stringify(res));
  console.log('db', db.attempts ? db.attempts() : 'n/a', 'errs', errs.slice(0, 3));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
