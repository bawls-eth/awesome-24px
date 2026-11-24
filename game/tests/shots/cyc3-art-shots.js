// Cycle 3 art (G) before/after + consistency screenshots (not a test; writes JPGs). Usage:
//   node game/tests/shots/cyc3-art-shots.js <base-origin> <tag> <scene...>
// Firebase is blocked in every context (offlineStub for Town, blockDb elsewhere). 'before*' tags use the opt-out flag of the change
// on the same server (the exact old pixels). Output: game/design/beta/img/cyc3-art-<scene>-<tag>-<d|p>.jpg (d 1280x720, p 390x844)
const path = require('path');
const { chromium } = require('playwright');
const { blockDb, offlineStub, exposeGame, joinOffline } = require('../helpers');
const [origin, tag, ...scenes] = process.argv.slice(2);
const OUT = path.join(__dirname, '..', '..', 'design', 'beta', 'img');
const VPS = { d: { width: 1280, height: 720 }, p: { width: 390, height: 844, isMobile: true, hasTouch: true } };
const BEFORE = /^before/.test(tag);
const isles = (q) => origin + '/game/games/isles/index.html?test=1&tutorial=0&howto=0' + q;
async function islesReady(p) {
  await p.waitForFunction(() => window.__isles && window.__isles.world, null, { timeout: 30000 });
  await p.evaluate(() => window.__isles.isleArt && Promise.resolve(window.__isles.isleArt()));
  await p.waitForTimeout(2500);
  await p.evaluate(() => document.querySelectorAll('.howto, #howto').forEach((e) => { e.hidden = true; }));
}
const town = (x, y, q) => async (p) => {
  await exposeGame(p); await p.goto(origin + '/game/index.html' + (q || '')); await joinOffline(p, 'ADMINcyc3art');
  await p.evaluate(([X, Y]) => { const s = window.__g.scene.getScene('Town'); s.localBody.setPosition(X, Y); }, [x, y]); await p.waitForTimeout(1500);
};
const realm = (q) => async (p) => {
  await p.goto(origin + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&heropick=0&tutorial=0&seed=12345' + (q || ''));
  await p.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active, null, { timeout: 30000 });
  await p.waitForTimeout(3500);
};
const SCENES = {
  'town-arcade': town(1900, 790, BEFORE ? '?worldicons=0' : ''),
  'town-west': town(200, 470, BEFORE ? '?worldicons=0' : ''),
  town: town(1450, 650, ''),
  hub: async (p) => { await p.goto(origin + '/game/hub/index.html'); await p.waitForTimeout(2500); },
  realm: realm(''),
  'isles-meadow': async (p) => { await p.goto(isles('&isle=meadow')); await islesReady(p); },
  'isles-jungle': async (p) => { await p.goto(isles('&isle=jungle')); await islesReady(p); },
  'isles-tundra': async (p) => { await p.goto(isles('&isle=tundra')); await islesReady(p); },
};
(async () => {
  const browser = await chromium.launch();
  for (const sc of scenes) for (const vk of Object.keys(VPS)) {
    const ctx = await browser.newContext({ viewport: { width: VPS[vk].width, height: VPS[vk].height }, isMobile: !!VPS[vk].isMobile, hasTouch: !!VPS[vk].hasTouch });
    if (/^town/.test(sc)) await offlineStub(ctx); else await blockDb(ctx);
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    try { await SCENES[sc](page); } catch (e) { errs.push('scene: ' + e.message); }
    const f = path.join(OUT, `cyc3-art-${sc}-${tag}-${vk}.jpg`);
    await page.screenshot({ path: f, type: 'jpeg', quality: 62 });
    console.log(f, errs.length ? 'ERR ' + errs.join(' | ').slice(0, 300) : 'ok');
    await ctx.close();
  }
  await browser.close();
})();
