// cyc7 art (G): the accepted Codex b03 Icicle Bat strips (provisional since cycle 6) are wired into the Frostfang Tundra. On the tundra
// isle MMCreatureStrips preloads the bat's 12 core strips, a spawned icicle_bat draws from PNG ('png', icicle_bat_* strip ids) and still
// falls back to the code-drawn MMCreatureDraw bake when art is off (?art=0 -> 'code'). Also screenshot-free: no console errors.
// Run: BASE=http://localhost:9703/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc7-art-icicle-bat.test.js
// No Firebase (blockDb), no network.
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');

async function bat(browser, q) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/isles/index.html?test=1&isle=tundra&howto=0&tutorial=0' + (q || ''));
  await page.waitForFunction(() => window.__isles && window.__isles.world, null, { timeout: 30000 });
  const ready = await page.evaluate(() => Promise.resolve(window.__isles.stripsReady()));
  const r = await page.evaluate(async () => {
    const I = window.__isles; I.god(true);
    const h = I.hero(); const tx = Math.floor(h.x / I.tile), ty = Math.floor(h.y / I.tile);
    const uid = I.spawn('icicle_bat', tx + 2, ty + 1);
    const seen = new Set(), src = new Set();
    for (let i = 0; i < 40; i++) {
      I.render(); await new Promise((res) => setTimeout(res, 30));
      const c = I.creatures().find((x) => x.uid === uid); if (!c) break;
      if (c.drawn) seen.add(c.drawn); if (c.src) src.add(c.src);
    }
    return { uid, seen: [...seen], src: [...src] };
  });
  await ctx.close();
  return { ready, r, errors, db: db.attempts() };
}

(async () => {
  const browser = await chromium.launch();
  const on = await bat(browser, '');
  check('tundra preloads the icicle bat strips with the other tundra species', on.ready.on && on.ready.kinds.indexOf('icicle_bat') >= 0 && on.ready.kinds.indexOf('rimewolf') >= 0, JSON.stringify(on.ready));
  check('a spawned icicle_bat draws from its PNG strips (src png, icicle_bat_* strip ids)', on.r.uid != null && on.r.src.indexOf('png') >= 0 && on.r.src.indexOf('code') < 0
    && on.r.seen.length > 0 && on.r.seen.every((id) => /^icicle_bat_(idle|move|attack|death)_(down|up|right)$/.test(id)), JSON.stringify(on.r));
  const off = await bat(browser, '&art=0');
  check('?art=0: the same bat falls back to the code-drawn bake (src code)', off.r.uid != null && off.r.src.indexOf('code') >= 0 && off.r.src.indexOf('png') < 0, JSON.stringify(off.r));
  check('no page / console errors on either run', on.errors.length === 0 && off.errors.length === 0, JSON.stringify(on.errors.concat(off.errors).slice(0, 4)));
  check('Firebase never contacted (blockDb attempts 0)', on.db === 0 && off.db === 0, on.db + ' / ' + off.db);
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
