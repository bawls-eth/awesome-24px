// W-01 (b12-01): after picking a hero the player never pops to the code-fallback orb / an empty frame while the class strip loads.
// The picker preloads the owned heroes' strips; a switch keeps the previous sprite until the new strip resolves; a stale page-load request
// never overwrites a later pick; the fallback orb only when the strip request fails.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-w01-hero-popin.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&offline=1&heropick=1';
const hero = (id, name, cls, level) => ({ id, name, cls, level, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] });
const prof = (heroes) => ({ v: 1, heroes, stash: new Array(16).fill(null), fame: 0, mode: 'classic', hall: [], migratedFrom: null });
const HEROES = [hero('h1', 'Aya', 'ranger', 3), hero('h2', 'Bram', 'paladin', 3)];

async function run(browser, viewport, opts) {
  const ctx = await browser.newContext(Object.assign({ viewport }, viewport.width < 500 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : {}));
  await blockDb(ctx);
  if (opts.block) await ctx.route(/\/arcane\/[^?]*paladin[^?]*\.png/, (r) => r.abort());
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((p) => { localStorage.setItem('pixeltown-mm-v1', JSON.stringify(p)); localStorage.setItem('pixeltown-mm-active-v1', JSON.stringify({ v: 1, heroId: 'h1' })); }, prof(HEROES));
  await page.goto(WORLD);
  await page.waitForSelector('#realm-hero:not(.hidden) .hp-hero');
  // The picker warms both strips; wait for the ranger (the active hero) art so the "previous sprite" exists, as a player would see it.
  await page.waitForFunction(() => window.__mm.arena._heroClass === 'ranger', null, { timeout: 15000 }).catch(() => {});
  const cached = await page.evaluate(() => window.__heroArt.cached());
  // Per drawn frame: what drew the hero (art class or the fallback sprite). Instance wrapper over _drawHero; the fallback path runs when it returns false / no art.
  await page.evaluate(() => {
    const a = window.__mm.arena; const log = window.__w01 = { frames: 0, fallback: 0, cls: {} };
    const orig = a._draw.bind(a);
    a._draw = function () { const r = orig.apply(null, arguments); log.frames++; if (a._heroClass) log.cls[a._heroClass] = (log.cls[a._heroClass] || 0) + 1; return r; };
    // the code fallback = drawImage of the procedural orb / avatar sprite (realm.js hero branch when no art drew)
    const g = a.ctx; const di = g.drawImage;
    g.drawImage = function (img) { if (img && (img === a.sprites.playerFallback || (a._avatar && img === a._avatar))) log.fallback++; return di.apply(g, arguments); };
  });
  await page.click('#realm-hero .hp-hero[data-hero="h2"]');
  await page.click('#realm-hero-close').catch(() => {});
  const samples = [];
  const vw = viewport.width, vh = viewport.height;
  for (let i = 0; i < 30; i++) {
    const s = await page.evaluate(() => { const a = window.__mm.arena; return { cls: a._heroClass, dbg: !!a._heroArt && !!a._heroArt.anim(a._heroClass, 'idle', 'down'), frames: window.__w01.frames }; });
    samples.push(s);
    await page.waitForTimeout(100);
  }
  // pixel stats of the hero area at the end (canvas centre where the camera keeps the player)
  const shot = await page.screenshot({ clip: { x: Math.round(vw / 2 - 30), y: Math.round(vh / 2 - 50), width: 60, height: 80 } });
  const log = await page.evaluate(() => window.__w01);
  const stat = await page.evaluate(() => window.__heroArt.stat);
  await ctx.close();
  return { samples, log, stat, cached, errors, shot };
}

(async () => {
  const browser = await chromium.launch();
  for (const vp of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    const tag = vp.width + 'x' + vp.height;
    const R = await run(browser, vp, {});
    check(tag + ': the picker preloads the owned heroes\' class strips (ranger + paladin cached)', R.cached.indexOf('ranger') >= 0 && R.cached.indexOf('paladin') >= 0, JSON.stringify(R.cached));
    check(tag + ': every sample for 3 s after the pick has the hero drawn by class art (never empty, never the orb)', R.samples.every((s) => s.cls && s.dbg) && R.log.frames > 5, JSON.stringify(R.samples.map((s) => s.cls + ':' + s.dbg)));
    check(tag + ': no drawn frame fell back to the code orb after the pick (fallback counter 0)', R.log.fallback === 0 && R.stat.fallback === 0, JSON.stringify([R.log, R.stat]));
    check(tag + ': the hero switches to the picked class (paladin), the stale page-load request does not overwrite it', R.samples[R.samples.length - 1].cls === 'paladin' && R.samples.slice(5).every((s) => s.cls === 'paladin'), JSON.stringify(R.samples.map((s) => s.cls)));
    check(tag + ': no page errors', R.errors.length === 0, R.errors.join(' | '));
  }
  const B = await run(browser, { width: 1280, height: 720 }, { block: true });
  check('strip blocked: the fallback shows (counter > 0, failed counted)', B.stat.failed >= 1 && B.stat.fallback >= 1 && B.samples[B.samples.length - 1].cls === null, JSON.stringify([B.stat, B.samples[B.samples.length - 1]]));
  check('strip blocked: no page error', B.errors.length === 0, B.errors.join(' | '));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
