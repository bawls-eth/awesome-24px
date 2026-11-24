// Cycle 2 art (G) before/after screenshots (not a test; writes JPGs). Usage:
//   node game/tests/shots/cyc2-art-shots.js <base-origin> <tag> <scene...>
// Scenes: hub, isles-jungle, isles-sand (jungle, teleported onto black sand).
// Firebase is blocked in every context (blockDb). Output: game/design/beta/img/cyc2-art-<scene>-<tag>-<d|p>.jpg (d 1280x720, p 390x844)
const path = require('path');
const { chromium } = require('playwright');
const { blockDb, offlineStub, exposeGame, joinOffline } = require('../helpers');
const [origin, tag, ...scenes] = process.argv.slice(2);
const OUT = path.join(__dirname, '..', '..', 'design', 'beta', 'img');
const VPS = { d: { width: 1280, height: 720 }, p: { width: 390, height: 844, isMobile: true, hasTouch: true } };
const isles = (q) => origin + '/game/games/isles/index.html?test=1&tutorial=0' + q;
async function islesReady(p) {
  await p.waitForFunction(() => window.__isles && window.__isles.world, null, { timeout: 30000 });
  await p.evaluate(() => window.__isles.isleArt && Promise.resolve(window.__isles.isleArt()));
  await p.waitForTimeout(2500);
}
const BEFORE = /^before/.test(tag);
const SCENES = {
  // Hearth Isle field overlay; 'before' = ?islefield=0
  'isles-meadow': async (p) => {
    await p.goto(isles('&isle=meadow&howto=0' + (BEFORE ? '&islefield=0' : ''))); await islesReady(p);
    await p.evaluate(() => { const I = window.__isles; I.god(true); const t = I.findTile('grass', 6); if (t) I.teleport(t.x, t.y); document.querySelectorAll('.howto, #howto').forEach((e) => { e.hidden = true; }); });
    await p.waitForTimeout(2000);
  },
  town: async (p) => {
    await exposeGame(p); await p.goto(origin + '/game/index.html' + (BEFORE ? '?worldicons=0' : '')); await joinOffline(p, 'ADMINcyc2art');
    await p.evaluate(() => { const s = window.__g.scene.getScene('Town'); s.localBody.setPosition(1450, 650); }); await p.waitForTimeout(1500);
  },
};
(async () => {
  const browser = await chromium.launch();
  for (const sc of scenes) for (const vk of Object.keys(VPS)) {
    const ctx = await browser.newContext({ viewport: { width: VPS[vk].width, height: VPS[vk].height }, isMobile: !!VPS[vk].isMobile, hasTouch: !!VPS[vk].hasTouch });
    if (sc === 'town') await offlineStub(ctx); else await blockDb(ctx);
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    try { await SCENES[sc](page); } catch (e) { errs.push('scene: ' + e.message); }
    const f = path.join(OUT, `cyc2-art-${sc}-${tag}-${vk}.jpg`);
    await page.screenshot({ path: f, type: 'jpeg', quality: 62 });
    console.log(f, errs.length ? 'ERR ' + errs.join(' | ').slice(0, 300) : 'ok');
    await ctx.close();
  }
  await browser.close();
})();
