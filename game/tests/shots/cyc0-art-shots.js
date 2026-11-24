// Cycle 0 art (G) before/after screenshots (not a test; writes JPGs). Usage:
//   node game/tests/shots/cyc0-art-shots.js <base-origin> <tag> <scene...>
// Scenes: hub, isles-jungle, isles-sand (jungle, teleported onto black sand).
// Firebase is blocked in every context (blockDb). Output: game/design/beta/img/cyc0-art-<scene>-<tag>-<d|p>.jpg (d 1280x720, p 390x844)
const path = require('path');
const { chromium } = require('playwright');
const { blockDb } = require('../helpers');
const [origin, tag, ...scenes] = process.argv.slice(2);
const OUT = path.join(__dirname, '..', '..', 'design', 'beta', 'img');
const VPS = { d: { width: 1280, height: 720 }, p: { width: 390, height: 844, isMobile: true, hasTouch: true } };
const isles = (q) => origin + '/game/games/isles/index.html?test=1&tutorial=0' + q;
async function islesReady(p) {
  await p.waitForFunction(() => window.__isles && window.__isles.world, null, { timeout: 30000 });
  await p.evaluate(() => window.__isles.isleArt && Promise.resolve(window.__isles.isleArt()));
  await p.waitForTimeout(2500);
}
const SCENES = {
  hub: async (p) => { await p.goto(origin + '/game/hub/index.html'); await p.waitForTimeout(2500); },
  'isles-jungle': async (p) => { await p.goto(isles('&isle=jungle')); await islesReady(p); },
  'isles-meadow': async (p) => { await p.goto(isles('&isle=meadow&howto=0')); await islesReady(p); },
  'isles-sand': async (p) => {
    await p.goto(isles('&isle=jungle')); await islesReady(p);
    await p.evaluate(() => { const I = window.__isles; I.god(true); const t = I.findTile('black_sand', 3) || I.findTile('black_sand', 1); if (t) I.teleport(t.x, t.y); });
    await p.waitForTimeout(2500);
  },
  'boss-tundra': (p) => bossScene(p, 'tundra', ['glacier_shellback', 'shagtusk', 'sabrefang', 'icicle_bat']),
  'boss-mars': (p) => bossScene(p, 'mars', ['regolith_roly', 'rustbeetle', 'crater_strider', 'dust_devil']),
};
// the isle's boss spawned at its lair with the hero 4 tiles south, plus a few code-drawn species around the hero; how-to card closed
async function bossScene(p, isle, species) {
  await p.goto(isles('&isle=' + isle + '&howto=0')); await islesReady(p);
  await p.evaluate((sp) => {
    const I = window.__isles; I.god(true); I.pause(true);
    const b = I.boss(); if (b && b.site) { I.teleport(b.site.x, b.site.y + 4); I.bossSpawn(); }
    const h = I.hero(), tx = Math.floor(h.x / I.tile), ty = Math.floor(h.y / I.tile);
    sp.forEach((s, i) => I.spawn(s, tx - 6 + i * 4, ty + 3));
    I.render();
  }, species);
  await p.waitForTimeout(1500);
  await p.evaluate(() => { document.querySelectorAll('.howto, #howto').forEach((e) => { e.hidden = true; }); window.__isles.render(); });
}
(async () => {
  const browser = await chromium.launch();
  for (const sc of scenes) for (const vk of Object.keys(VPS)) {
    const ctx = await browser.newContext({ viewport: { width: VPS[vk].width, height: VPS[vk].height }, isMobile: !!VPS[vk].isMobile, hasTouch: !!VPS[vk].hasTouch });
    await blockDb(ctx);
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    try { await SCENES[sc](page); } catch (e) { errs.push('scene: ' + e.message); }
    const f = path.join(OUT, `cyc0-art-${sc}-${tag}-${vk}.jpg`);
    await page.screenshot({ path: f, type: 'jpeg', quality: 62 });
    console.log(f, errs.length ? 'ERR ' + errs.join(' | ').slice(0, 300) : 'ok');
    await ctx.close();
  }
  await browser.close();
})();
