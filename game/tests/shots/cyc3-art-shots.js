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
  dungeon: async (p) => {
    await p.goto(origin + '/game/games/mad-maze/index.html?mode=dungeon&seed=4242&lv=2&biome=crypt&test=1&offline=1&heropick=0&tutorial=0');
    await p.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.active, null, { timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(3500);
  },
  'isles-meadow': async (p) => { await p.goto(isles('&isle=meadow')); await islesReady(p); },
  'isles-jungle': async (p) => { await p.goto(isles('&isle=jungle')); await islesReady(p); },
  // a Realm enemy's death ghost at 0, 25, 50, 75 % of its last 0.3 s, 4x, on grass; 'before' = ?dissolve=0 (the old alpha fade)
  dissolve: async (p) => {
    await p.goto(origin + '/game/games/mad-maze/index.html?test=1&offline=1' + (BEFORE ? '&dissolve=0' : ''));
    await p.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena._enemyArt, null, { timeout: 20000 });
    await p.evaluate(() => {
      const a = window.__mm.arena; a.setPaused && a.setPaused(true);
      const types = ['ring', 'aimed', 'spiral']; const out = document.createElement('canvas'); out.width = 4 * 4 * 80 + 20; out.height = 3 * 4 * 80 + 20;
      const o = out.getContext('2d'); o.imageSmoothingEnabled = false; o.fillStyle = '#4f9a45'; o.fillRect(0, 0, out.width, out.height);
      types.forEach((ty, row) => {
        a._edGhosts.forEach((q) => { q.active = false; });
        const e = a.spawnEnemy(ty, 300, 200); e.cd = 99; e.t = 0.5;
        const tmp = document.createElement('canvas'); tmp.width = tmp.height = 400; a._drawEnemyArt(tmp.getContext('2d'), e, { r: 15 }); e.hp = 1; a._hitEnemy(e, 999);
        const q = a._edGhosts.find((x) => x.active); if (!q) return; const an = a._enemyArt.anim(q.name, 'death', q.dir), len = an.frames / an.fps;
        [0.0, 0.25, 0.5, 0.75].forEach((f, col) => {
          q.active = true; q.t0 = a.clock - (len + (f ? f * 0.3 : -0.001));
          const c = document.createElement('canvas'); c.width = a.W; c.height = a.H; const g = c.getContext('2d'); a._drawEnemyGhosts(g);
          o.drawImage(c, q.x - 40, q.y - 64, 80, 80, 10 + col * 320, 10 + row * 320, 320, 320);
        });
      });
      Object.assign(out.style, { position: 'fixed', left: '0', top: '0', zIndex: 99999, maxWidth: '100vw', imageRendering: 'pixelated' }); document.body.appendChild(out);
    });
    await p.waitForTimeout(300);
  },
  // the Nexus walk view near the west torch and the banners; 'before' = ?nxlife=0
  nexus: async (p) => {
    await p.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html>town' }));
    await p.goto(origin + '/game/games/mad-maze/index.html?mode=world&test=1&seed=12345&qdate=2030-05-01' + (BEFORE ? '&nxlife=0' : ''));
    await p.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 30000 });
    await p.waitForTimeout(2500);
    await p.evaluate(() => { const a = window.__mm.arena, w = window.__mm.world; a.player.iframes = 1e9; a._hitPlayer = () => {}; w.nexus.open(); });
    await p.waitForTimeout(2500);
    await p.evaluate(() => { const w = window.__mm.world; w.nexus.walk.place(14.5 * 32, 9.5 * 32); });
    await p.waitForTimeout(600);
  },
  // R01b: 3x3-tile crops (4x) around Highlands / Godlands inner-corner seams; 'before' = ?icorner=0
  icorner: async (p) => {
    await realm(BEFORE ? '&icorner=0' : '')(p);
    await p.waitForFunction(() => !window.__mm.world.artState().loading, null, { timeout: 25000 }).catch(() => {});
    await p.evaluate(() => {
      const W = window.__mm.world, w = W.world.w, h = W.world.h, T = W.TILE, CH = W.CPX / T, name = (x, y) => W.drawName(x, y), NAMES = ['snow', 'lava_rock', 'dry_grass', 'gravel'];
      const out = document.createElement('canvas'); out.width = 4 * 3 * T * 3 + 40; out.height = 2 * 3 * T * 4 + 30; const o = out.getContext('2d'); o.imageSmoothingEnabled = false; o.fillStyle = '#111'; o.fillRect(0, 0, out.width, out.height);
      const picks = []; const seenT = {};
      for (let y = 2; y < h - 2 && picks.length < 6; y++) for (let x = 2; x < w - 2 && picks.length < 6; x++) {
        const n = name(x, y); if (NAMES.indexOf(n) < 0 || W.hasTransition(x, y) || (seenT[n] || 0) >= 3) continue;
        if (name(x, y - 1) !== n || name(x + 1, y) !== n || name(x, y + 1) !== n || name(x - 1, y) !== n) continue;
        if (![[1, -1], [1, 1], [-1, 1], [-1, -1]].some(([dx, dy]) => name(x + dx, y + dy) !== n && W.hasTransition(x + dx, y) && W.hasTransition(x, y + dy))) continue;
        if (picks.some((q) => Math.abs(q.x - x) < 4 && Math.abs(q.y - y) < 4)) continue;
        picks.push({ x, y }); seenT[n] = (seenT[n] || 0) + 1;
      }
      picks.forEach((q, i) => {
        const tile = document.createElement('canvas'); tile.width = tile.height = 3 * T; const tg = tile.getContext('2d');
        for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) { const X = q.x + k, Y = q.y + j, cx = Math.floor(X / CH), cy = Math.floor(Y / CH); tg.drawImage(W.bakeChunk(cx, cy), (X - cx * CH) * T, (Y - cy * CH) * T, T, T, (k + 1) * T, (j + 1) * T, T, T); }
        o.drawImage(tile, 10 + (i % 3) * (3 * T * 4 + 10), 10 + Math.floor(i / 3) * (3 * T * 4 + 10), 3 * T * 4, 3 * T * 4);
      });
      Object.assign(out.style, { position: 'fixed', left: '0', top: '0', zIndex: 99999, maxWidth: '100vw', imageRendering: 'pixelated' }); document.body.appendChild(out);
    });
    await p.waitForTimeout(300);
  },
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
