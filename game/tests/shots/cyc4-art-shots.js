// Cycle 4 art (G) before/after + consistency screenshots (not a test; writes JPGs). Usage:
//   node game/tests/shots/cyc4-art-shots.js <base-origin> <tag> <scene...>
// Firebase is blocked in every context (offlineStub for Town, blockDb elsewhere). 'before*' tags use the opt-out flag of the change
// on the same server (the exact old pixels). Output: game/design/beta/img/cyc4-art-<scene>-<tag>-<d|p>.jpg (d 1280x720, p 390x844)
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
  await exposeGame(p); await p.goto(origin + '/game/index.html' + (q || '')); await joinOffline(p, 'ADMINcyc4art');
  await p.evaluate(([X, Y]) => { const s = window.__g.scene.getScene('Town'); s.localBody.setPosition(X, Y); }, [x, y]); await p.waitForTimeout(1500);
};
const realm = (q) => async (p) => {
  await p.goto(origin + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&heropick=0&tutorial=0&seed=12345' + (q || ''));
  await p.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active, null, { timeout: 30000 });
  await p.waitForTimeout(3500);
};
const SCENES = {
  town: town(1450, 650, ''),
  'town-shops': town(1450, 650, BEFORE ? '?townfinish=0' : ''),
  hub: async (p) => { await p.goto(origin + '/game/hub/index.html'); await p.waitForTimeout(2500); },
  realm: realm(''),
  dungeon: async (p) => {
    await p.goto(origin + '/game/games/mad-maze/index.html?mode=dungeon&seed=4242&lv=2&biome=crypt&test=1&offline=1&heropick=0&tutorial=0');
    await p.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active, null, { timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(3500);
  },
  'isles-meadow': async (p) => { await p.goto(isles('&isle=meadow')); await islesReady(p); },
  // cycle 4: 'before' = ?tundradetail=0 / ?jungledetail=0 (the exact old chunk pixels)
  'isles-tundra': async (p) => { await p.goto(isles('&isle=tundra' + (BEFORE ? '&tundradetail=0' : ''))); await islesReady(p); },
  'isles-jungle': async (p) => { await p.goto(isles('&isle=jungle' + (BEFORE ? '&jungledetail=0' : ''))); await islesReady(p); },
  // a 3x zoom of the canvas centre (the hero's surroundings) so the 2 px art pixels are visible
  'tundra-zoom': async (p) => { await p.goto(isles('&isle=tundra' + (BEFORE ? '&tundradetail=0' : ''))); await islesReady(p); await zoom(p); },
  'jungle-zoom': async (p) => { await p.goto(isles('&isle=jungle' + (BEFORE ? '&jungledetail=0' : ''))); await islesReady(p); await zoom(p); },
};
async function zoom(p) {
  await p.evaluate(() => {
    const src = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0]; if (!src) return;
    const vw = innerWidth, vh = innerHeight, sw = Math.round(src.width / 3), sh = Math.round(src.height / 3);
    const out = document.createElement('canvas'); out.width = src.width; out.height = src.height; const o = out.getContext('2d'); o.imageSmoothingEnabled = false;
    o.drawImage(src, Math.round((src.width - sw) / 2), Math.round((src.height - sh) / 2), sw, sh, 0, 0, out.width, out.height);
    Object.assign(out.style, { position: 'fixed', left: '0', top: '0', width: vw + 'px', height: vh + 'px', zIndex: 99999, imageRendering: 'pixelated' }); document.body.appendChild(out);
  });
  await p.waitForTimeout(200);
}

(async () => {
  const browser = await chromium.launch();
  for (const sc of scenes) for (const vk of Object.keys(VPS)) {
    const ctx = await browser.newContext({ viewport: { width: VPS[vk].width, height: VPS[vk].height }, isMobile: !!VPS[vk].isMobile, hasTouch: !!VPS[vk].hasTouch });
    if (/^town/.test(sc)) await offlineStub(ctx); else await blockDb(ctx);
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    try { await SCENES[sc](page); } catch (e) { errs.push('scene: ' + e.message); }
    const f = path.join(OUT, `cyc4-art-${sc}-${tag}-${vk}.jpg`);
    await page.screenshot({ path: f, type: 'jpeg', quality: 62 });
    console.log(f, errs.length ? 'ERR ' + errs.join(' | ').slice(0, 300) : 'ok');
    await ctx.close();
  }
  await browser.close();
})();
