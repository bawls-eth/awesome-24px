// Cycle 8 art (G): the Town dirt road + plaza were three flat beige fills (ART-TOWN-REPORT: "beige path bands with no edge", grade D).
// drawPathDetail paints, into the SAME baked path image (one texture, nothing per frame): worn wheel ruts on both roads, a darker edge lip
// with grass tufts, seeded pebbles with a catch light, and a cobble ring round the plaza. ?townpath=0 = the old flat road.
// Serve the repo root first:  python3 -m http.server 8440 &
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc8-art-town-path.test.js
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
  await joinOffline(page, 'ADMINcyc8path');
  await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 20000 });
  await page.waitForTimeout(600);
  const r = await page.evaluate(async () => {
    const s = window.__g.scene.getScene('Town'); const st = s.pathDetail || null;
    // the path image: the baked image whose texture holds the road (fall back to the recorded key)
    const key = st && st.key;
    const img = key ? s.children.list.find((o) => o.texture && o.texture.key === key) : null;
    let tex = null;
    if (key) {
      const cv = s.textures.get(key).getSourceImage(); const W = cv.width, H = cv.height;
      const d = cv.getContext('2d').getImageData(0, 0, W, H).data;
      const ox = img ? img.x : 0, oy = img ? img.y : 0;
      const at = (wx, wy) => { const i = ((wy - oy) * W + (wx - ox)) * 4; return (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]; };
      // colours inside the horizontal road band away from the plaza (x 1200..2300, y 570..630)
      const road = new Set(); for (let wy = 570; wy < 630; wy++) for (let wx = 1200; wx < 2300; wx += 1) road.add(at(wx, wy));
      const plaza = new Set(); for (let wy = 470; wy < 730; wy += 1) for (let wx = 670; wx < 930; wx += 1) { if ((wx - 800) ** 2 + (wy - 600) ** 2 < 140 * 140) plaza.add(at(wx, wy)); }
      tex = { W, H, road: road.size, plaza: plaza.size };
    }
    // nothing per frame: drawPathDetail never runs again after create
    let calls = 0; const f = s.drawPathDetail; s.drawPathDetail = function () { calls++; return f.apply(this, arguments); };
    await new Promise((res) => setTimeout(res, 800));
    s.drawPathDetail = f;
    return { st: st ? { on: st.on, ruts: st.ruts, lips: st.lips, tufts: st.tufts, pebbles: st.pebbles, joints: st.joints, key: !!st.key } : null,
      img: img ? img.type : null, tex, calls };
  });
  await ctx.close();
  return Object.assign(r, { errors, db: db.attempts(), clean: db.attempts() === 0 });
}

(async () => {
  const browser = await chromium.launch();
  const on = await sample(browser, '');
  const off = await sample(browser, '?townpath=0');
  check('default: road detail painted (ruts >= 300 dabs, edge lips >= 600, tufts >= 30, pebbles >= 250, 48 plaza joints)', on.st && on.st.on && on.st.ruts >= 300 && on.st.lips >= 600
    && on.st.tufts >= 30 && on.st.pebbles >= 250 && on.st.joints === 48, JSON.stringify(on.st));
  check('still ONE baked Image for the whole road (not a live Graphics)', on.st && on.st.key && on.img === 'Image' && off.img === 'Image', on.img + ' / ' + off.img);
  check('the horizontal road is no longer flat: >= 8 colours in the band (old flat road: <= 3)', on.tex && off.tex && on.tex.road >= 8 && off.tex.road <= 3, JSON.stringify([on.tex, off.tex]));
  check('the plaza has a cobble ring + pebbles: >= 7 colours inside r 140 (old: <= 3)', on.tex && off.tex && on.tex.plaza >= 7 && off.tex.plaza <= 3, JSON.stringify([on.tex, off.tex]));
  check('same texture footprint on and off (the road shape did not move)', on.tex && off.tex && on.tex.W === off.tex.W && on.tex.H === off.tex.H, JSON.stringify([on.tex, off.tex]));
  check('?townpath=0: the old flat road (detail off, nothing painted)', off.st && off.st.on === false && off.st.ruts === 0 && off.st.pebbles === 0, JSON.stringify(off.st));
  check('drawn once at create, never per frame', on.calls === 0 && off.calls === 0, on.calls + ' / ' + off.calls);
  check('no page errors', on.errors.length === 0 && off.errors.length === 0, JSON.stringify(on.errors.concat(off.errors).slice(0, 3)));
  check('Firebase never contacted (offlineStub attempts 0)', on.clean && off.clean && on.db === 0 && off.db === 0, on.db + ' / ' + off.db);
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
