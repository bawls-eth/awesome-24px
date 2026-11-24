// R4-D2 before/after screenshots (not a test; writes JPGs). Usage:
//   node game/tests/shots/r4-d2-shots.js <base-origin> <tag> <scene...>
// e.g. node game/tests/shots/r4-d2-shots.js http://localhost:9603 before realm-hl realm-camp
// Scenes: realm-hl (Highlands snow/lava 107,125), realm-camp (grass 50,106), realm-god (Godlands 115,128), nexus, town, isles-meadow, isles-jungle.
// Firebase is blocked in every context (blockDb / offlineStub). Output: game/design/beta/img/r4-d2-<scene>-<tag>-<vp>.jpg
const path = require('path');
const { chromium } = require('playwright');
const { blockDb, offlineStub } = require('../helpers');
const [origin, tag, ...scenes] = process.argv.slice(2);
const OUT = path.join(__dirname, '..', '..', 'design', 'beta', 'img');
const VPS = { d: { width: 1280, height: 720 }, p: { width: 390, height: 844, isMobile: true, hasTouch: true } };
const WORLD = (q) => origin + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&heropick=0&tutorial=0&seed=12345' + (q || '');

async function realmAt(page, tx, ty, nexus) {
  await page.goto(WORLD());
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active, null, { timeout: 30000 });
  await page.waitForFunction(() => { const s = window.__mm.world.artState(); return s && !s.loading; }, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.evaluate(([x, y]) => { const a = window.__mm.arena; a.player.x = x * 32 + 16; a.player.y = y * 32 + 16; a.enemies && (a.enemies.length = 0); }, [tx, ty]);
  if (nexus) await page.evaluate(() => { const w = window.__mm.world; (w.nexus && w.nexus.open) ? w.nexus.open() : w.openNexus && w.openNexus(); });
  await page.waitForTimeout(1500);
}
const SCENES = {
  'realm-hl': (p) => realmAt(p, 107, 125),
  'realm-camp': (p) => realmAt(p, 50, 106),
  'realm-god': (p) => realmAt(p, 115, 128),
  'realm-shore': async (p) => { await p.goto(WORLD()); await p.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active, null, { timeout: 30000 }); await p.waitForTimeout(3500); },
  nexus: (p) => realmAt(p, 64, 64, true),
  town: async (p) => {
    await p.goto(origin + '/game/index.html?from=hub');
    await p.waitForTimeout(1500);
    try { await p.fill('#name, input[type=text]', 'ADMINr4d2'); } catch (e) {}
    await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /offline/i.test(x.textContent)); if (b) b.click(); });
    await p.waitForTimeout(6000);
  },
  'isles-meadow': async (p) => { await p.goto(origin + '/game/games/isles/index.html?test=1&isle=meadow'); await p.waitForTimeout(4000); },
  'isles-jungle': async (p) => { await p.goto(origin + '/game/games/isles/index.html?test=1&isle=jungle'); await p.waitForTimeout(4000); },
};

(async () => {
  const browser = await chromium.launch();
  for (const sc of scenes) for (const vk of Object.keys(VPS)) {
    const ctx = await browser.newContext({ viewport: { width: VPS[vk].width, height: VPS[vk].height }, isMobile: !!VPS[vk].isMobile, hasTouch: !!VPS[vk].hasTouch });
    if (sc === 'town') await offlineStub(ctx); else await blockDb(ctx);
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    try { await SCENES[sc](page); } catch (e) { errs.push('scene: ' + e.message); }
    const f = path.join(OUT, `r4-d2-${sc}-${tag}-${vk}.jpg`);
    await page.screenshot({ path: f, type: 'jpeg', quality: 62 });
    console.log(f, errs.length ? 'ERR ' + errs.join(' | ').slice(0, 300) : 'ok');
    await ctx.close();
  }
  await browser.close();
})();
