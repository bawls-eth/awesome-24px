// Realm item icons: backpack / shop / equipped slots show manifest art with emoji fallback.
// Serve the repo root first:  python3 -m http.server 8452 &
// Run: BASE=http://localhost:8452/game/index.html NODE_PATH=$(npm root -g) node game/tests/item-icons.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const LS = require('./lib/load-scale');
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
  await page.waitForFunction(() => window.__mm && window.__mm.arena, null, { timeout: LS.budget(8000) });
  return { ctx, page, errors, bad };
}
const seed = (page) => page.evaluate((ids) => {
  const r = window.__mm.arena; r.state = 'play'; r.save.bestWave = 50; r.save.shards = 9999;
  r.save.items = ids.map((id, i) => ({ n: 100 + i, id, r: i % 4 })); r.save.items.push({ n: 200, id: 'sparkwand', r: 3 }); r.save.nextUid = 300;
  r.save.eq = { weapon: 100, charm: 102, ring: 104 };
}, IDS);
// cycle 8 L (flaky in 4 stamps running): the icon PNGs are fetched lazily, on the first render of the panel, and the test looked
// after a fixed 500 ms (backpack) / 400 ms (shop) / 700 ms (the deliberate 404). On a busy box the page's 6 connections were still
// serving enemy and terrain art, so the last icons in the list were not complete yet (always the same ones: swiftcharm, scholarring,
// wardring). The game was right, only the wait was short. Now the test waits for the condition itself: every icon in the panel has
// finished loading or failed (complete), within a load-scaled budget. The assertions are unchanged: still exactly 8 / 3 / >= 7
// icons, each complete with a real width; an icon that fails to load is still a FAIL (complete with width 0).
const settled = (page, sel, min) => page.waitForFunction(([s, n]) => { const im = [...document.querySelectorAll(s + ' img.realm-ico')]; return im.length >= n && im.every((i) => i.complete); }, [sel, min], { timeout: LS.budget(8000) }).catch(() => null);
const icons = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s + ' img.realm-ico')].map((i) => ({ ok: i.complete && i.naturalWidth > 0, w: i.naturalWidth, item: i.dataset.item })), sel);

(async () => {
  const browser = await chromium.launch();
  for (const [label, opts] of [['desktop', { viewport: { width: 1000, height: 700 } }], ['phone', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }]]) {
    const A = await open(browser, MAZE, opts);
    const p = A.page;
    await p.waitForFunction(() => window.__mm.arena._itemArt, null, { timeout: LS.budget(8000) });
    check(`${label}: setItemArt attached`, true);
    await seed(p);
    await p.evaluate(() => window.__mm.arena.setPaused(true));
    await settled(p, '#realm-bp-list', 8); await settled(p, '.realm-bp-slots', 3);
    const bp = await icons(p, '#realm-bp-list');
    check(`${label}: backpack rows have 8 loaded icons`, bp.length === 8 && bp.every((i) => i.ok), JSON.stringify(bp));
    check(`${label}: every item type shows an icon`, IDS.every((id) => bp.some((i) => i.item === id)));
    const eq = await icons(p, '.realm-bp-slots');
    check(`${label}: 3 equipped slots show loaded icons`, eq.length === 3 && eq.every((i) => i.ok), JSON.stringify(eq));
    const col = await p.evaluate(() => [...document.querySelectorAll('#realm-bp-list li .nm')].map((n) => n.style.color));
    check(`${label}: rarity colors still apply`, col.length === 8 && new Set(col).size >= 4, col.join('|'));
    const bd = await p.evaluate(() => getComputedStyle(document.querySelector('#realm-bp-list img.realm-ico')).borderTopColor + '|' + getComputedStyle(document.querySelector('#realm-bp-list .nm')).color);
    check(`${label}: icon border follows rarity color`, bd.split('|')[0] === bd.split('|')[1], bd);
    check(`${label}: Sell and Equip buttons unchanged`, await p.evaluate(() => document.querySelectorAll('#realm-bp-list button.dc[data-act="discard"], #realm-bp-list button.dc[data-act="sell-ask"]').length === 8 && !!document.querySelector('#realm-bp-list button[data-act="equip"]')));
    check(`${label}: no horizontal scroll (backpack)`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await p.evaluate(() => { window.__mm.arena.setPaused(false); window.__mm.arena._panel('shop'); });
    await settled(p, '#realm-shop-body', 7);
    const sh = await icons(p, '#realm-shop-body');
    check(`${label}: shop rows show loaded icons`, sh.length >= 7 && sh.every((i) => i.ok), JSON.stringify(sh).slice(0, 200));
    check(`${label}: Buy buttons unchanged`, await p.evaluate(() => document.querySelectorAll('#realm-shop-body button[data-buy]').length >= 7));
    check(`${label}: no horizontal scroll (shop)`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    check(`${label}: no console errors / 404s so far`, A.errors.length === 0 && A.bad.length === 0, JSON.stringify([A.errors, A.bad]));
    // unmapped / missing art -> emoji, no broken image
    const fb = await p.evaluate(async (ms) => {
      const a = window.__mm.arena;
      a.setItemArt({ iconUrl: (id) => (id === 'sparkwand' ? '/game/assets/arcane/nope/missing.png' : null), markBad() {} });
      a._panel('bp'); a.renderBackpack();
      // wait for the swap itself (the broken <img> is replaced by the emoji on its error event), at most `ms`; then 2 frames
      const t0 = performance.now(); while (document.querySelectorAll('#realm-backpack-body #realm-bp-list img').length && performance.now() - t0 < ms) await new Promise((r) => setTimeout(r, 50));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const li = (n) => [...document.querySelectorAll('#realm-backpack-body #realm-bp-list li')].find((l) => l.querySelector('.nm').textContent.includes(n));
      const broken = [...document.querySelectorAll('#realm-backpack-body #realm-bp-list img')].filter((i) => !i.naturalWidth).length;
      return { broken, spark: li('Spark Wand').querySelector('.nm').textContent, quick: li('Quickfire Wand').querySelector('.nm').textContent, imgs: document.querySelectorAll('#realm-backpack-body #realm-bp-list img').length };
    }, LS.budget(8000));
    check(`${label}: missing PNG falls back to emoji, no broken img`, fb.broken === 0 && fb.spark.includes('🪄') && fb.quick.includes('⚡') && fb.imgs === 0, JSON.stringify(fb));
    check(`${label}: only the deliberate missing icon 404'd`, A.bad.every((b) => /nope\/missing/.test(b)), JSON.stringify(A.bad));
    await A.ctx.close();
  }
  const Z = await open(browser, MAZE + '&itemart=0');
  await Z.page.waitForTimeout(800);
  await seed(Z.page);
  await Z.page.evaluate(() => window.__mm.arena.setPaused(true));
  await Z.page.waitForTimeout(300);
  const z = await Z.page.evaluate(() => ({ imgs: document.querySelectorAll('#realm-backpack-body img.realm-ico').length, art: !!window.__mm.arena._itemArt, txt: document.querySelector('#realm-bp-list .nm').textContent }));
  check('?itemart=0 shows emoji only', z.imgs === 0 && !z.art && z.txt.includes('🪄'), JSON.stringify(z));
  check('?itemart=0 no errors', Z.errors.length === 0 && Z.bad.length === 0, JSON.stringify([Z.errors, Z.bad]));
  await Z.ctx.close();
  const U = await browser.newContext(); const up = await U.newPage();
  await up.goto(ORIGIN + '/game/games/mad-maze/lantern.css'); await up.addScriptTag({ url: '/game/shared/mm-art.js' });
  const api = await up.evaluate(async () => {
    const o = {};
    o.before = MMArt.itemIconUrl('sparkwand');
    const set = await MMArt.loadItems('/game/assets/arcane/');
    o.map = Object.keys(MMArt.ITEM_ICON_MAP).every((k) => !!set.iconUrl(k));
    o.junk = [null, undefined, 5, {}, '__proto__', 'constructor'].map((x) => MMArt.itemIconUrl(x));
    o.bad = (await MMArt.loadItems('/nope/')).ids().length;
    o.tags = set.tags('wand_spark').join(',');
    return o;
  });
  check('itemIconUrl never throws; all 7 mapped ids resolve', api.before === null && api.map && api.junk.every((x) => x === null) && api.bad === 0 && api.tags.includes('wand'), JSON.stringify(api));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
