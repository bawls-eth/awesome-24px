// Mad Maze loot bags show the item icon (rarity outline) above the bag; pickup / Combine / shop-buy text shows it too.
// Serve the repo root first:  python3 -m http.server 8455 &
// Run: BASE=http://localhost:8455/game/index.html NODE_PATH=$(npm root -g) node game/tests/loot-bag-icons.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const MAZE = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1';
const IDS = ['sparkwand', 'quickwand', 'heartcharm', 'swiftcharm', 'luckring', 'scholarring', 'wardring'];

async function open(browser, url, opts) {
  const ctx = await browser.newContext(opts || { viewport: { width: 1000, height: 700 } });
  const page = await ctx.newPage();
  const errors = [], bad = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  await page.goto(url);
  await page.waitForFunction(() => window.__mm && window.__mm.arena, null, { timeout: 8000 });
  return { ctx, page, errors, bad };
}

// In-page helper: freeze the sim, draw one bag (or none) and measure the area above it.
const PREP = () => {
  const r = window.__mm.arena; r.state = 'play';
  r._update = () => {};
  r.__shot = (id, rar, withBag, rgb) => {
    r.bags.forEach((b) => { b.active = false; }); r.texts.forEach((t) => { t.active = false; });
    r.player.x = 700; r.player.y = 500;
    if (withBag) { const b = r.dropBag(200, 220, rar, id); b.t = 0; b.vx = b.vy = 0; }
    r._draw();
    const s = r.scale; const x0 = Math.round((200 - 12) * s), y0 = Math.round((220 - 34) * s), w = Math.round(24 * s), h = Math.round(20 * s);
    const d = r.ctx.getImageData(x0, y0, w, h).data; const out = { match: 0, hash: 0 };
    for (let i = 0; i < d.length; i += 4) {
      out.hash = (out.hash * 31 + d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7) | 0;
      if (Math.abs(d[i] - rgb[0]) < 6 && Math.abs(d[i + 1] - rgb[1]) < 6 && Math.abs(d[i + 2] - rgb[2]) < 6) out.match++;
    }
    return out;
  };
};
const COLORS = ['#c9d1d9', '#7ee787', '#79c0ff', '#d2a8ff'];

(async () => {
  const browser = await chromium.launch();
  for (const [label, opts] of [['desktop', { viewport: { width: 1000, height: 700 } }], ['phone', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }]]) {
    const A = await open(browser, MAZE, opts); const p = A.page;
    await p.waitForFunction(() => window.__mm.arena._itemArt, null, { timeout: 8000 });
    await p.evaluate(PREP);
    await p.evaluate((ids) => { const r = window.__mm.arena; ids.forEach((id) => { for (let k = 0; k < 4; k++) r._lootIcon(id, k); }); }, IDS);
    await p.waitForTimeout(1200);
    const res = await p.evaluate(({ ids, cols }) => {
      const r = window.__mm.arena; const out = [];
      const toRgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
      for (const id of ids) for (let k = 0; k < 4; k++) {
        const rgb = toRgb(cols[k]);
        const art = r._itemArt; const withIcon = r.__shot(id, k, true, rgb);
        r._itemArt = null; const plain = r.__shot(id, k, true, rgb); r._itemArt = art;
        out.push({ id, k, differs: withIcon.hash !== plain.hash, extra: withIcon.match - plain.match, ready: !!r._lootIcon(id, k) });
      }
      return out;
    }, { ids: IDS, cols: COLORS });
    check(`${label}: all 28 id x rarity icons ready`, res.every((x) => x.ready), JSON.stringify(res.filter((x) => !x.ready)));
    check(`${label}: pixels above the bag differ from the plain bag (28/28)`, res.every((x) => x.differs), JSON.stringify(res.filter((x) => !x.differs)));
    check(`${label}: rarity outline colour present above bag (28/28)`, res.every((x) => x.extra > 8), JSON.stringify(res.filter((x) => x.extra <= 8)));
    const pk = await p.evaluate(() => {
      const r = window.__mm.arena; r.texts.forEach((t) => { t.active = false; }); r.save.items = []; r.player.x = 200; r.player.y = 300;
      r.collectItem('luckring', 2);
      const t = r.texts.find((x) => x.active);
      return { ico: t && t.ico, ir: t && t.ir, plain: t && t.plain, text: t && t.text };
    });
    check(`${label}: pickup text carries the icon path + emoji fallback text`, pk.ico === 'luckring' && pk.ir === 2 && pk.plain === 'Lucky Ring' && pk.text.includes('💍'), JSON.stringify(pk));
    const tx = await p.evaluate(() => {
      const r = window.__mm.arena; const t = r.texts.find((x) => x.active);
      const px = () => { r._draw(); const s = r.scale; const d = r.ctx.getImageData(Math.round((t.x - 70) * s), Math.round((t.y - 18) * s), Math.round(140 * s), Math.round(24 * s)).data; let h = 0; for (let i = 0; i < d.length; i += 4) h = (h * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 5) | 0; return h; };
      const a = px(); const art = r._itemArt; r._itemArt = null; const b = px(); r._itemArt = art;
      return { differs: a !== b };
    });
    check(`${label}: pickup text draws differently with icon than emoji text`, tx.differs);
    const cb = await p.evaluate(() => {
      const r = window.__mm.arena; r.texts.forEach((t) => { t.active = false; });
      r.save.items = [{ n: 1, id: 'sparkwand', r: 0 }, { n: 2, id: 'sparkwand', r: 0 }, { n: 3, id: 'sparkwand', r: 0 }]; r.save.nextUid = 10; r.save.eq = {};
      const okC = r.combine(1); const t1 = (({ ico, ir }) => ({ ico, ir }))(r.texts.find((x) => x.active && x.ico));
      r.texts.forEach((t) => { t.active = false; });
      r.save.bestWave = 50; r.save.shards = 9999; r.save.items = [];
      const okB = r.buy('wardring', 1); const t2 = (({ ico, ir }) => ({ ico, ir }))(r.texts.find((x) => x.active && x.ico));
      return { okC, c: [t1.ico, t1.ir], okB, b: [t2.ico, t2.ir] };
    });
    check(`${label}: Combine shows icon text`, cb.okC && cb.c && cb.c[0] === 'sparkwand' && cb.c[1] === 1, JSON.stringify(cb));
    check(`${label}: shop buy shows icon text`, cb.okB && cb.b && cb.b[0] === 'wardring' && cb.b[1] === 1, JSON.stringify(cb));
    const al = await p.evaluate(() => {
      const r = window.__mm.arena; r.texts.forEach((t) => { t.active = false; });
      r.dropBag(200, 220, 2, 'luckring'); r.collectItem('luckring', 2); r._draw();
      let n = 0; const ce = document.createElement; document.createElement = function () { n++; return ce.apply(document, arguments); };
      for (let i = 0; i < 200; i++) r._draw();
      document.createElement = ce; return { n };
    });
    check(`${label}: no canvas allocations over 200 frames`, al.n === 0, JSON.stringify(al));
    const fb = await p.evaluate(async () => {
      const r = window.__mm.arena; const art = r._itemArt; const rgb = [0x79, 0xc0, 0xff];
      r.setItemArt({ iconUrl: (id) => (id === 'luckring' ? '/game/assets/arcane/nope/missing.png' : null), markBad() {} });
      const before = r.__shot('luckring', 2, true, rgb);
      await new Promise((s) => setTimeout(s, 600));
      const after = r.__shot('luckring', 2, true, rgb);
      const ic = r._lootIcon('luckring', 2);
      r._itemArt = null; const plain = r.__shot('luckring', 2, true, rgb);
      r.setItemArt(art);
      return { sameBefore: before.hash === plain.hash, sameAfter: after.hash === plain.hash, ic: !!ic };
    });
    check(`${label}: missing icon falls back to the plain bag`, fb.sameBefore && fb.sameAfter && !fb.ic, JSON.stringify(fb));
    check(`${label}: no console errors (only the deliberate 404)`, A.errors.every((e) => /404|Failed to load resource/.test(e)) && A.bad.every((b) => /nope\/missing/.test(b)), JSON.stringify([A.errors, A.bad]));
    check(`${label}: no horizontal scroll`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await A.ctx.close();
  }
  const Z = await open(browser, MAZE + '&itemart=0'); await Z.page.waitForTimeout(800);
  await Z.page.evaluate(PREP);
  const z = await Z.page.evaluate(() => {
    const r = window.__mm.arena; r.save.items = [];
    const a = r.__shot('luckring', 2, true, [0x79, 0xc0, 0xff]); const b = r.__shot('luckring', 2, true, [0x79, 0xc0, 0xff]);
    r.collectItem('luckring', 2); r._draw();
    return { art: !!r._itemArt, ic: r._lootIcon('luckring', 2), stable: a.hash === b.hash, t: r.texts.find((x) => x.active).text };
  });
  check('?itemart=0 keeps the old look (no icon, emoji text)', !z.art && z.ic === null && z.stable && z.t.includes('💍'), JSON.stringify(z));
  check('?itemart=0 no errors', Z.errors.length === 0 && Z.bad.length === 0, JSON.stringify([Z.errors, Z.bad]));
  await Z.ctx.close();
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
