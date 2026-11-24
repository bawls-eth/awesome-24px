// Cycle 3 U (item 5): Town world labels must not sit on each other. Measured before the fix (all three viewports):
//   - over the Shop the "+50% today" deal line and the turnip price ("sells 61 stars / 10") were both drawn at y - 38 (107x13 overlap);
//   - Professor Byte's daily quest line ("bring 5 shells (+11 stars)") sat 7 px over his name label (117x7).
//   The Shop title / deal line and Founder's Statue / quest line pairs named in the beta notes were clear; they stay pinned here.
// The check measures the world-space bounds of every visible static world label (Text with scroll factor 1, plus the G pixel icons
// beside them) and asks the named pairs, and then every pair of label texts, for a gap (no overlap > 1 px either way).
// Positions only: G owns the label art (icons, fonts, colours). Firebase blocked (offlineStub), offline join as an ADMIN bot.
// Serve the repo root first:  python3 -m http.server 8440 &
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc3-ui-town-labels.test.js
const { chromium } = require('playwright');
const { check, done, offlineStub, exposeGame, joinOffline } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');

async function sample(browser, q, vp) {
  const ctx = await browser.newContext({ viewport: vp || { width: 1280, height: 720 } });
  const db = await offlineStub(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await exposeGame(page);
  await page.goto(ORIGIN + '/game/index.html' + (q || ''));
  await joinOffline(page, 'ADMINcyc3lbl');
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => {
    const s = window.__g.scene.getScene('Town');
    const box = (o) => { if (!o || !o.visible || !o.active) return null; const b = o.getBounds(); return { x: b.x, y: b.y, R: b.right, B: b.bottom }; };
    const join = (a, b) => (!a ? b : !b ? a : { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), R: Math.max(a.R, b.R), B: Math.max(a.B, b.B) });
    const ov = (a, b) => (a && b ? { x: Math.min(a.R, b.R) - Math.max(a.x, b.x), y: Math.min(a.B, b.B) - Math.max(a.y, b.y) } : null);
    const decor = new Set(s.seasonDecorSprites || []); // the seasonal pumpkin / snowman glyphs are scenery, not labels
    const texts = s.children.list.filter((o) => o.type === 'Text' && o.scrollFactorX === 1 && o.visible && o.text && o.depth < 99000 && !decor.has(o));
    const lbl = (o) => join(box(o), o.pxIcon ? box(o.pxIcon) : null);
    const find = (w) => texts.find((o) => o.text.indexOf(w) >= 0);
    const shop = find('Shop'), deal = find('% today'), statue = find("Founder's Statue"), sign = s.npcQuestSign, byte = find('Professor Byte');
    const pair = (a, b) => { const o = ov(lbl(a), lbl(b)); return { a: a && a.text, b: b && b.text, ox: o && Math.round(o.x), oy: o && Math.round(o.y), A: a && lbl(a), Bx: b && lbl(b) }; };
    // every pair of static labels (the scoreboard of floating / bubble texts sits above depth 99000 and is excluded)
    const all = [];
    for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
      const o = ov(lbl(texts[i]), lbl(texts[j]));
      if (o && o.x > 1 && o.y > 1) all.push(texts[i].text + ' / ' + texts[j].text + ' ' + Math.round(o.x) + 'x' + Math.round(o.y));
    }
    return { dealTurnip: pair(deal, s.turnipSellLabel), byteSign: pair(byte, sign), shopDeal: pair(shop, deal), statueSign: pair(statue, sign), statueByte: pair(statue, byte), signText: sign && sign.text, all, n: texts.length };
  });
  await ctx.close();
  return Object.assign(r, { errors, attempts: db.attempts() });
}

const clear = (p) => p.a && p.b && !(p.ox > 1 && p.oy > 1);

(async () => {
  const browser = await chromium.launch();
  for (const [q, vp, name] of [['', null, '1280x720'], ['', { width: 390, height: 844 }, '390x844'], ['?worldicons=0', null, 'worldicons=0']]) {
    const r = await sample(browser, q, vp);
    check(`[${name}] found the Shop title and the deal line`, !!(r.shopDeal.a && r.shopDeal.b), JSON.stringify(r.shopDeal));
    check(`[${name}] "+50% today" deal line and the turnip price do not overlap`, clear(r.dealTurnip), JSON.stringify(r.dealTurnip));
    check(`[${name}] Professor Byte's name and his quest line do not overlap`, clear(r.byteSign), JSON.stringify(r.byteSign));
    check(`[${name}] Shop title and "+50% today" deal line do not overlap`, clear(r.shopDeal), JSON.stringify(r.shopDeal));
    check(`[${name}] Founder's Statue label and Professor Byte's quest line do not overlap`, clear(r.statueSign), JSON.stringify(r.statueSign));
    check(`[${name}] Founder's Statue label and the Professor Byte name do not overlap`, clear(r.statueByte), JSON.stringify(r.statueByte));
    check(`[${name}] no two static Town labels overlap`, r.all.length === 0, r.n + ' labels; ' + r.all.join(' | '));
    check(`[${name}] no page errors`, r.errors.length === 0, r.errors.join(' | '));
    check(`[${name}] offline: db.attempts() === 0`, r.attempts === 0, String(r.attempts));
  }
  await browser.close();
  done();
})();
