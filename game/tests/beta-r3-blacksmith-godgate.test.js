// b04-09: talking to the Blacksmith opens the stall titled as his forge (the Vendor keeps "Vendor stall").
// b04-13: a hero far below the Godlands level gets a visible warning at a Godlands altar and the boss waits; stepping onto the altar wakes it
// anyway (soft gate, not a hard block). blockDb: no database traffic.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-r3-blacksmith-godgate.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&heropick=0&tutorial=0&seed=12345';
const E = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, window.__mm.world, ${JSON.stringify(arg === undefined ? null : arg)})`);
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

(async () => {
  const browser = await chromium.launch(); const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } }); await blockDb(ctx);
  const page = await ctx.newPage(); page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(WORLD);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
  await E(page, (a) => { a.player.iframes = 1e9; a._hitPlayer = () => {}; });
  // Godlands soft gate (the hero is level 1)
  const site = await E(page, (a, w) => { const s = w.bossSites(); const i = s.findIndex((q) => q.zone === 3); return i < 0 ? null : Object.assign({ i }, s[i]); });
  check('a Godlands boss site exists on this seed', !!site, JSON.stringify(site));
  const far = await E(page, (a, w, s) => { const Z = window.MMZones; let spot = null;
    for (let r = 5; r <= 8 && !spot; r++) for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const z = Z.zoneInfoAt(w.world, s.x + dx + 0.5, s.y + dy + 0.5).zone; if (z === 3) spot = { x: s.x + dx, y: s.y + dy }; }
    a.player.x = (spot.x + 0.5) * 32; a.player.y = (spot.y + 0.5) * 32; for (let k = 0; k < 6; k++) w.bossTick(); return { spot, live: w.bossSites()[s.i].live, warns: w.bossGateWarns(), lv: a.save.level }; }, site);
  check('Lv 1 hero inside the Godlands wake radius: the boss stays asleep and a warning is shown', far.spot && !far.live && far.warns >= 1, JSON.stringify(far));
  const on = await E(page, (a, w, s) => { a.player.x = (s.x + 0.5) * 32; a.player.y = (s.y + 1.5) * 32; w.bossTick(); return { live: w.bossSites()[s.i].live }; }, site);
  check('stepping onto the altar still wakes it (soft gate, not a hard block)', on.live, JSON.stringify(on));
  await E(page, (a, w, s) => { const e = w.bossEntity(s.i); if (e) e.active = false; a._syncBoss && a._syncBoss(); a.player.x = (s.x + 60.5) * 32; }, site);
  // Blacksmith vs Vendor stall title
  await E(page, (a, w) => { const s = w.nexus.site; a.player.x = s.x - 20; a.player.y = s.y; });
  await frames(page, 15); await page.click('#rw-nexus-go'); await frames(page, 6);
  const tt = async (id) => { await E(page, (a, w, n) => w.nexus.talk(n), id); await frames(page, 3); return page.evaluate(() => { const s = document.getElementById('rw-nx-stall'); return { open: !s.classList.contains('hidden'), title: (s.querySelector('.nx-st-head b') || {}).textContent, buy: s.querySelectorAll('button').length }; }); };
  const bs = await tt('blacksmith'); const vd = await tt('vendor');
  check('the Blacksmith panel is titled as his forge (and keeps the shelf)', bs.open && /Blacksmith/.test(bs.title) && bs.buy > 3, JSON.stringify(bs));
  check('the Vendor panel is still the Vendor stall', vd.open && vd.title === 'Vendor stall', JSON.stringify(vd));
  check('no page errors', errs.length === 0, errs.join(' | '));
  await ctx.close(); await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
