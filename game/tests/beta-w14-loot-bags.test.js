// W-14 loot bags (b02-06): world loot bags use the b15 bag art (outlined pixel bags, one colour per bag tier) instead of 10-14 px code
// squares, and a T12 drop shows the red bag with the soulbound sparkle. ?bagart=0 keeps the code bags. No per-frame work (baked canvases).
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-w14-loot-bags.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&heropick=0&tutorial=0&seed=12345';
const SHOTS = process.env.SHOTS || null;

async function open(browser, q) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await blockDb(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(WORLD + (q || ''));
  await page.waitForFunction(() => window.__mm && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 20000 });
  return { ctx, page, errors };
}
// sprite stats in page: opaque pixel share, dark outline pixels, red bag-body pixels, alpha at the corner (the code bag has a soft glow there)
const SPRITE_STATS = (i) => { const c = window.__mm.arena.sprites.worldBag[i]; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let op = 0, dark = 0, red = 0;
  for (let k = 0; k < d.length; k += 4) { if (d[k + 3] === 255) { op++; if (d[k] < 60 && d[k + 1] < 50 && d[k + 2] < 70) dark++; if (d[k] > 130 && d[k + 1] < 80 && d[k + 2] < 100) red++; } }
  return { w: c.width, h: c.height, op, dark, red, corner: d[(1 * c.width + 13) * 4 + 3] + d[(13 * c.width + 0) * 4 + 3] }; };

(async () => {
  const browser = await chromium.launch();
  const A = await open(browser); const pg = A.page;
  const ok = await pg.waitForFunction(() => window.__bagArt && window.__bagArt.stat.loaded === 7, null, { timeout: 15000 }).then(() => true).catch(() => false);
  const st = await pg.evaluate((fn) => { const f = eval('(' + fn + ')'); return [0, 1, 2, 3, 4, 5, 6].map(f); }, SPRITE_STATS.toString());
  check('the 6 tier bags + the T12 bag are art (outlined: >= 20 dark outline px, no code glow in the corner, same 26 px sprite box)', ok && st.every((s) => s.w === 26 && s.h === 26 && s.dark >= 20 && s.corner === 0 && s.op >= 150), JSON.stringify(st));
  check('the T12 bag is red (>= 60 red body px) and differs from the white / gold tier bags', st[6].red >= 60 && st[4].red < 10 && st[5].red < 10, JSON.stringify([st[4], st[5], st[6]]));
  // drops: a T12 gear bag picks sprite 6, a T5 gear bag keeps its bag tier
  const drops = await pg.evaluate(() => { const a = window.__mm.arena; a._update = () => {}; const p = a.player;
    const b12 = a.dropBag(p.x + 70, p.y, 2, 'sparkwand', { tierIndex: 4, lifetime: 60 }, { t: 12 }); b12.vx = b12.vy = 0;
    const b5 = a.dropBag(p.x - 70, p.y, 1, 'sparkwand', { tierIndex: 2, lifetime: 60 }, { t: 5 }); b5.vx = b5.vy = 0;
    const b0 = a.dropBag(p.x, p.y + 80, 0, 'sparkwand', { tierIndex: 0, lifetime: 60 }, null); b0.vx = b0.vy = 0;
    return { t12: b12.tier, t5: b5.tier, plain: b0.tier, count: window.__bagArt.stat.t12 }; });
  check('a T12 drop draws the red sparkle bag (sprite 6); a T5 drop and a plain bag keep their bag tier', drops.t12 === 6 && drops.t5 === 2 && drops.plain === 0 && drops.count === 1, JSON.stringify(drops));
  // on screen: red bag pixels appear around the T12 bag (the camera follows the player at the canvas centre)
  await pg.waitForTimeout(200);
  const red = await pg.evaluate(async () => { const a = window.__mm.arena, cv = a.canvas; const r = cv.getBoundingClientRect(); const k = r.width / a.W;
    const g = cv.getContext('2d'); const sx = cv.width / r.width; const cx = Math.round((r.width / 2 + 70 * k * (a._zoom || 1)) * sx), cy = Math.round((r.height / 2) * sx); let n = 0;
    const d = g.getImageData(Math.max(0, cx - 60), Math.max(0, cy - 60), 120, 120).data; for (let i = 0; i < d.length; i += 4) if (d[i] > 130 && d[i + 1] < 80 && d[i + 2] < 100) n++; return n; });
  check('on screen the T12 bag reads as a red bag (>= 20 red px near it)', red >= 20, String(red));
  if (SHOTS) await pg.screenshot({ path: SHOTS + '/w14-bags.png', clip: { x: 440, y: 260, width: 400, height: 200 } });
  check('no page errors', A.errors.length === 0, A.errors.join('|'));
  await A.ctx.close();
  // ?bagart=0: today's code bags stay (soft glow in the corner, no T12 swap)
  const B = await open(browser, '&bagart=0'); await B.page.waitForTimeout(1500);
  const off = await B.page.evaluate((fn) => { const f = eval('(' + fn + ')'); const a = window.__mm.arena; const p = a.player; const b = a.dropBag(p.x + 70, p.y, 2, 'sparkwand', { tierIndex: 4, lifetime: 60 }, { t: 12 }); return { s: f(0), tier: b.tier, n: a.sprites.worldBag.length }; }, SPRITE_STATS.toString());
  check('?bagart=0 keeps the code bags (glow in the corner, 6 sprites, T12 stays tier 4)', off.s.corner > 0 && off.n === 6 && off.tier === 4, JSON.stringify(off));
  await B.ctx.close();
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
