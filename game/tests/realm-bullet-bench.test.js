// Realm bullet benchmark: fill the bolt pools and check the simulated update stays cheap and the pools never grow.
const { launch, scene, check, done } = require('./helpers');
const seed = { caveSeed: 0, resources: { stone: 1 }, realm: { shards: 100, bestWave: 2, kills: 5, deaths: 1 } };

(async () => {
  const { browser, page, errors } = await launch({ width: 1000, height: 700 }, seed);
  const res = await scene(page, (s) => {
    s.enterRealm(); const r = s.realm; r.stop(); r.active = true;
    const sizes = { p: r.pBullets.length, e: r.eBullets.length };
    const fill = () => {
      const cx = r.player.x, cy = r.player.y;
      let ne = 0;
      for (let i = 0; i < r.eBullets.length && ne < 400; i++) {
        const b = r.eBullets[i]; if (b.active) { ne++; continue; }
        const a = (i / 400) * Math.PI * 2 * 7, d = 120 + (i % 40) * 8;
        b.active = true; b.x = cx + Math.cos(a) * d; b.y = cy + Math.sin(a) * d; b.vx = -Math.cos(a) * 30; b.vy = -Math.sin(a) * 30; b.life = 6; ne++;
      }
      r.pBullets.forEach((b, i) => { if (!b.active) { const a = i * 0.7; b.active = true; b.x = cx + Math.cos(a) * 60; b.y = cy + Math.sin(a) * 60; b.vx = Math.cos(a) * 200; b.vy = Math.sin(a) * 200; b.life = 1; } });
    };
    fill();
    const startE = r.countActive('eBullets'), startP = r.countActive('pBullets');
    let maxE = startE, maxP = startP, total = 0;
    for (let i = 0; i < 300; i++) {
      r.player.hp = 1e6; r.player.iframes = 1;
      if (i % 20 === 0) fill();
      const t0 = performance.now(); r._update(1 / 60); total += performance.now() - t0;
      maxE = Math.max(maxE, r.countActive('eBullets')); maxP = Math.max(maxP, r.countActive('pBullets'));
    }
    return { sizes, after: { p: r.pBullets.length, e: r.eBullets.length }, startE, startP, maxE, maxP, avg: total / 300 };
  });
  console.log(JSON.stringify(res));
  check('avg simulated update under 5 ms over 300 steps (' + res.avg.toFixed(3) + ' ms)', res.avg < 5, String(res.avg));
  check('pools filled (enemy bolts >= 300, player bolts > 0)', res.startE >= 300 && res.startP > 0, JSON.stringify(res));
  check('pool arrays never grow and active counts stay within pool size', res.after.p === res.sizes.p && res.after.e === res.sizes.e && res.maxE <= res.sizes.e && res.maxP <= res.sizes.p, JSON.stringify(res));
  check('no page errors', errors.length === 0, errors.join('|'));
  await browser.close();
  done();
})();
