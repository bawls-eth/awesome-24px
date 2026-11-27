// Cycle 16 G: the Town's own Realm (main.js) never attached item art, so its shop / backpack showed emoji while the Mad Maze embed showed the
// frontier pixel icons. Before this change the Town realm had no ItemSet (_itemArt null) and every row was an emoji (0 img.realm-ico).
// Checks (OFFLINE, ADMIN bot, literal 0 database attempts): Town Realm shop at 390x844 and 1280x720 shows 7+ loaded art icons for the 7 base items,
// resolving to the newest art (b07 wands, b09 accessories); backpack rows too; ?itemart=0 keeps emoji; no 404 / page errors.
// Run: BASE=http://localhost:9103/game/index.html node game/tests/cyc16-art-town-realm-item-art.test.js   (SHOTS=<dir> saves screenshots)
const { chromium } = require('playwright');
const { check, done, offlineStub, exposeGame, joinOffline } = require('./helpers');
const LS = require('./lib/load-scale');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const SHOTS = process.env.SHOTS || '';
const WANT = { sparkwand: 'wand_spark', quickwand: 'wand_ember', heartcharm: 'red_garnet_heart_pendant', swiftcharm: 'gold_feather_brooch', luckring: 'copper_emerald_ring', scholarring: 'sapphire_wave_ring', wardring: 'gold_ruby_signet' };

async function town(browser, vp, q, name) {
  const ctx = await browser.newContext(vp);
  const db = await offlineStub(ctx); const page = await ctx.newPage(); const errors = [], bad = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
  await exposeGame(page);
  await page.goto(ORIGIN + '/game/index.html' + q);
  await joinOffline(page, name);
  await page.evaluate(() => { const s = window.__g.scene.getScene('Town'); s.localBody.setPosition(REALM_GATE_POS.x, REALM_GATE_POS.y + 30); s.enterRealm(); });
  await page.waitForFunction(() => { const r = window.__g.scene.getScene('Town').realm; return r && r.active && (r.state === 'play' || r.state === 'banner'); }, null, { timeout: LS.budget(20000) });
  return { ctx, db, page, errors, bad };
}
const settled = (page, sel, n) => page.waitForFunction(([s, k]) => { const im = [...document.querySelectorAll(s + ' img.realm-ico')]; return im.length >= k && im.every((i) => i.complete); }, [sel, n], { timeout: LS.budget(10000) }).then(() => true, () => false);

(async () => {
  const browser = await chromium.launch();
  for (const [label, vp] of [['390x844', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }], ['1280x720', { viewport: { width: 1280, height: 720 } }]]) {
    const T = await town(browser, vp, '', 'ADMINart' + label.slice(0, 3));
    const p = T.page;
    check(`${label}: Town realm has an ItemSet attached`, await p.waitForFunction(() => !!window.__g.scene.getScene('Town').realm._itemArt, null, { timeout: LS.budget(10000) }).then(() => true, () => false));
    await p.evaluate(() => {
      const r = window.__g.scene.getScene('Town').realm; r.state = 'play'; r.save.bestWave = 50; r.save.shards = 9999;
      const ids = ['sparkwand', 'quickwand', 'heartcharm', 'swiftcharm', 'luckring', 'scholarring', 'wardring'];
      r.save.items = ids.map((id, i) => ({ n: 100 + i, id, r: 0 })); r.save.nextUid = 300; r._panel('shop');
    });
    check(`${label}: shop rows settle with loaded art`, await settled(p, '#realm-shop-body', 7));
    const sh = await p.evaluate(() => [...document.querySelectorAll('#realm-shop-body img.realm-ico')].map((i) => ({ item: i.dataset.item, ok: i.complete && i.naturalWidth === 32, src: i.src })));
    check(`${label}: shop shows art for all 7 base items`, Object.keys(WANT).every((id) => sh.some((i) => i.item === id && i.ok)), JSON.stringify(sh.map((i) => i.item + ':' + i.ok)));
    check(`${label}: each resolves to the newest matching art`, Object.keys(WANT).every((id) => sh.filter((i) => i.item === id).every((i) => i.src.indexOf(WANT[id] + '.png') > 0)), JSON.stringify(sh.slice(0, 7).map((i) => i.src.split('/').pop())));
    if (SHOTS) await p.screenshot({ path: require('path').join(SHOTS, `cyc16-art-town-shop-${label}.jpg`), quality: 70, type: 'jpeg' });
    await p.evaluate(() => { const r = window.__g.scene.getScene('Town').realm; r._panel('bp'); r.renderBackpack(); });
    check(`${label}: backpack rows show art`, await settled(p, '#realm-bp-list', 7));
    check(`${label}: no horizontal scroll`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    check(`${label}: 0 database attempts, no page errors, no 404s`, T.db.attempts() === 0 && T.errors.length === 0 && T.bad.length === 0, T.db.attempts() + ' ' + JSON.stringify([T.errors, T.bad]));
    await T.ctx.close();
  }
  const Z = await town(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, '?itemart=0', 'ADMINartoff');
  await Z.page.waitForTimeout(1200);
  const z = await Z.page.evaluate(() => { const r = window.__g.scene.getScene('Town').realm; r.state = 'play'; r.save.shards = 9999; r.save.bestWave = 50; r._panel('shop'); return { art: !!r._itemArt, imgs: document.querySelectorAll('#realm-shop-body img.realm-ico').length, rows: document.querySelectorAll('#realm-shop-body li').length }; });
  check('?itemart=0: Town realm keeps emoji (no ItemSet, no img icons)', !z.art && z.imgs === 0 && z.rows > 0, JSON.stringify(z));
  check('?itemart=0: 0 database attempts, no page errors', Z.db.attempts() === 0 && Z.errors.length === 0, Z.errors.join('|'));
  await Z.ctx.close();
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
