// Cycle 1 art (G), T-BLD "Town buildings are flat fills with no outline": the baked building textures (shop, museum, Able Sisters,
// turnip stand, windmill, Polyroll booth, guestbook) and the TOP SCORES board get a pixel finish ONCE at create: alpha snapped to 0/255, a 1 px colour-matched
// dark outline outside the silhouette, bottom / right shade and a top-left rim light, plus an eave shadow under the three roofs.
// ?bldfinish=0 = the old flat look.
// Serve the repo root first:  python3 -m http.server 8440 &
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc1-art-town-buildings.test.js
// Firebase blocked (offlineStub), offline join as an ADMIN bot, nothing written to any DB.
const { chromium } = require('playwright');
const { check, done, offlineStub, exposeGame, joinOffline } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');

async function sample(browser, q) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await offlineStub(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await exposeGame(page);
  await page.goto(ORIGIN + '/game/index.html' + (q || ''));
  await joinOffline(page, 'ADMINcyc1bld');
  await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 20000 });
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => {
    const s = window.__g.scene.getScene('Town'); const st = s.bldFinish || null;
    // the shop texture: find it by the recorded key (finish on) or the first baked texture whose pixels hold the shop wall colour
    const stat = (key) => {
      const cv = s.textures.get(key).getSourceImage(); const W = cv.width, H = cv.height;
      const d = cv.getContext('2d').getImageData(0, 0, W, H).data; let semi = 0, op = 0, dark = 0, wall = 0;
      for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3]; if (a > 0 && a < 255) semi++; if (a === 255) op++;
        if (a === 255 && d[i] + d[i + 1] + d[i + 2] < 140) dark++;
        if (a === 255 && d[i] === 0x8a && d[i + 1] === 0x5a && d[i + 2] === 0x3b) wall++;
      }
      return { W, H, semi, op, dark, wall };
    };
    let shopKey = st && st.keys && st.keys.shop;
    if (!shopKey) { const ks = s.textures.getTextureKeys().filter((k) => /^baked_/.test(k)); for (const k of ks) { const t = stat(k); if (t.wall > 2000) { shopKey = k; break; } } }
    return { st: st ? { on: st.on, count: st.count, ms: st.ms, outline: st.outline, names: Object.keys(st.keys) } : null, shop: shopKey ? stat(shopKey) : null };
  });
  await ctx.close();
  return Object.assign(r, { errors, db: db.attempts(), clean: db.attempts() === 0 });
}

(async () => {
  const browser = await chromium.launch();
  const on = await sample(browser, '');
  const off = await sample(browser, '?bldfinish=0');
  check('default: 8 building / board textures finished at create', on.st && on.st.on && on.st.count === 8, JSON.stringify(on.st));
  check('default: every named building recorded', on.st && ['shop', 'museum', 'able', 'turnip', 'windmill', 'polyroll', 'guestbook', 'board'].every((n) => on.st.names.indexOf(n) >= 0), JSON.stringify(on.st && on.st.names));
  check('default: outline pixels were added (>= 1500 over the 8 textures)', on.st && on.st.outline >= 1500, String(on.st && on.st.outline));
  check('default: the finish is a one-off create cost (< 250 ms in total)', on.st && on.st.ms < 250, String(on.st && on.st.ms));
  check('default: shop texture has no soft alpha fringe (0 semi-alpha px)', on.shop && on.shop.semi === 0, JSON.stringify(on.shop));
  check('default: shop texture has a dark outline / shade band (>= 400 dark px)', on.shop && on.shop.dark >= 400, JSON.stringify(on.shop));
  check('?bldfinish=0: nothing finished', off.st === null || off.st.count === 0, JSON.stringify(off.st));
  check('?bldfinish=0: shop texture is the flat look (far fewer dark px than the finished one)', off.shop && on.shop && off.shop.dark * 3 < on.shop.dark, JSON.stringify(off.shop));
  check('no page errors', !on.errors.length && !off.errors.length, on.errors.concat(off.errors).join(' | '));
  check('Firebase never reached (db.attempts() === 0 in both pages)', on.clean && off.clean, `${on.db} ${off.db}`);
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
