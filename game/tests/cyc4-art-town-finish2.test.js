// Cycle 4 art (G): Town building finish, second pass. At Town 1x the buildings still read as flat boxes after the cycle 1 outline /
// shade finish. Once at create (never per frame) the baked building textures now get window glints, an inner frame shadow and a lit sill
// on every glass pane, shingle courses on pitched roofs, and a ground contact shadow strip under each footprint. ?bldfinish2=0 = the
// cycle 1 finish only; ?bldfinish=0 still turns every finish off. Also (U ask): the green turnip sell price gets the same dark outline as
// the buy price, so it reads on the Shop roof / grass.
// Serve the repo root first:  python3 -m http.server 8440 &
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc4-art-town-finish2.test.js
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
  await joinOffline(page, 'ADMINcyc4bld');
  await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 20000 });
  await page.waitForTimeout(800);
  const r = await page.evaluate(async () => {
    const s = window.__g.scene.getScene('Town'); const st = s.bldFinish || null;
    const stat = (key) => {
      const cv = s.textures.get(key).getSourceImage(); const W = cv.width, H = cv.height;
      const d = cv.getContext('2d').getImageData(0, 0, W, H).data; const cols = new Set(); let glint = 0, semi = 0, h = 2166136261;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 0 && d[i + 3] < 255) semi++;
        if (d[i + 3] === 255) { cols.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]); if (d[i] >= 235 && d[i + 1] >= 240 && d[i + 2] >= 240) glint++; }
        h = Math.imul(h ^ d[i] ^ (d[i + 1] << 8) ^ (d[i + 2] << 16) ^ (d[i + 3] << 24), 16777619);
      }
      return { colors: cols.size, glint, semi, hash: h >>> 0 };
    };
    const shopKey = st && st.keys && st.keys.shop;
    // per frame: the second pass and the shadow never run again after create
    let calls = 0; const f2 = s.finishBakedTexture2, cs = s.bldContactShadow;
    s.finishBakedTexture2 = function () { calls++; return f2.apply(this, arguments); }; s.bldContactShadow = function () { calls++; return cs.apply(this, arguments); };
    await new Promise((res) => setTimeout(res, 1000));
    s.finishBakedTexture2 = f2; s.bldContactShadow = cs;
    const lb = s.turnipSellLabel, style = lb && lb.style;
    return {
      st: st ? { on: st.on, count: st.count, ms: st.ms, glass: st.glass || 0, roof: st.roof || 0, shadows: st.shadows || 0, pairs: st.shadowPairs || [] } : null,
      shop: shopKey ? stat(shopKey) : null, calls, frames: s.game.loop.frame,
      sell: lb ? { text: lb.text, color: style.color, stroke: style.stroke, thick: style.strokeThickness } : null,
    };
  });
  await ctx.close();
  return Object.assign(r, { errors, db: db.attempts(), clean: db.attempts() === 0 });
}

const lum = (hex) => { const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };

(async () => {
  const browser = await chromium.launch();
  const on = await sample(browser, '');
  const off2 = await sample(browser, '?bldfinish2=0');
  const off = await sample(browser, '?bldfinish=0');
  check('default: 8 textures finished, window panes found (>= 200 glass px)', on.st && on.st.count === 8 && on.st.glass >= 200, JSON.stringify(on.st && { count: on.st.count, glass: on.st.glass }));
  check('default: pitched-roof shingle courses painted (>= 300 px)', on.st && on.st.roof >= 300, String(on.st && on.st.roof));
  check('default: contact shadows under >= 6 buildings, each on the ground under its building (depth below the walls) and >= 12 px wide', on.st && on.st.shadows >= 6 && on.st.pairs.every((p) => p[1] < p[0] && p[2] >= 12), JSON.stringify(on.st && on.st.pairs));
  check('default: the whole finish stays a one-off create cost (< 250 ms in total)', on.st && on.st.ms < 250, String(on.st && on.st.ms));
  check('per frame: 0 second-pass / shadow calls in 1 s of running frames', on.calls === 0, JSON.stringify({ calls: on.calls, frames: on.frames }));
  check('shop: window glint pixels added (>= 8 more near-white px than ?bldfinish2=0)', on.shop && off2.shop && on.shop.glint >= off2.shop.glint + 8, JSON.stringify([on.shop, off2.shop]));
  check('shop: more colours than the cycle 1 finish (roof courses, sill, frame)', on.shop && off2.shop && on.shop.colors > off2.shop.colors + 3 && on.shop.hash !== off2.shop.hash, JSON.stringify([on.shop && on.shop.colors, off2.shop && off2.shop.colors]));
  check('shop: still no soft alpha fringe (0 semi-alpha px)', on.shop && on.shop.semi === 0, JSON.stringify(on.shop));
  check('?bldfinish2=0: cycle 1 finish still runs, no glass / roof / shadow pass', off2.st && off2.st.count === 8 && off2.st.glass === 0 && off2.st.roof === 0 && off2.st.shadows === 0, JSON.stringify(off2.st));
  check('?bldfinish=0: nothing finished, no shadows', (off.st === null || (off.st.count === 0 && off.st.shadows === 0 && off.st.glass === 0)), JSON.stringify(off.st));
  const sl = on.sell;
  check('turnip sell price: dark outline (stroke #1c2430, >= 2 px)', sl && sl.stroke === '#1c2430' && sl.thick >= 2 && /sells \d+/.test(sl.text), JSON.stringify(sl));
  const cr = sl ? (lum(sl.color) + 0.05) / (lum(sl.stroke) + 0.05) : 0;
  check('turnip sell price: text / outline contrast >= 7:1', cr >= 7, cr.toFixed(2));
  check('no page errors', [on, off2, off].every((r) => !r.errors.length), [on, off2, off].map((r) => r.errors.join(' | ')).join(' '));
  check('Firebase never reached (db.attempts() === 0 in all pages)', on.db === 0 && off2.db === 0 && off.db === 0, `${on.db} ${off2.db} ${off.db}`);
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
