// Town heroes (shared/mm-town-heroes.js): the join screen and the outfit shop offer the 10 Realm hero classes, the chosen hero renders
// in the Town from a baked hero texture, a legacy species in a seeded save renders as its mapped hero while the stored value stays
// unchanged, and the old punk/mooncat sheets are never requested. OFFLINE ONLY: every database host is blocked (blockDb), the
// Firebase SDK is answered with an empty stub and the player enters through "Play offline". 0 DB requests, never chats, never writes.
// Run: python3 -m http.server 8440 &   BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/town-heroes.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const H = require('../shared/mm-town-heroes.js');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const SAVE_KEY = 'pixeltown-save-v1';
const LEGACY_RE = /\/i\/[a-z_]+-strip\.png|mooncats-strip\.png/;
const LEGACY_SHEET_RE = /\/i\/(coolcats|punks|pudgypenguins|doge|apes|zombies|mohawks|blondies|aliens|alienclan|apepunks|coolcats_[a-z]+|genius|goldenpunks|halloweenpunks|phunks|punkettes|avalanchepunks|expansionpunks|frontpunks|intlpunks|morepunks|punks_[a-z]+|aliens_[a-z]+|punkrocks|boredapes)-strip\.png|mooncats-strip\.png/;

async function open(browser, viewport, touch, seedSave, opts) {
  const ctx = await browser.newContext(touch ? { viewport, hasTouch: true, isMobile: true } : { viewport });
  const db = await blockDb(ctx);
  await ctx.route(/gstatic\.com\/firebasejs\//, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* firebase SDK blocked by town-heroes.test.js */' }));
  if (seedSave) await ctx.addInitScript((v) => { if (!sessionStorage.heroSeeded) { sessionStorage.heroSeeded = '1'; localStorage.setItem('pixeltown-save-v1', v); } }, seedSave);
  const page = await ctx.newPage();
  const errors = [];
  const legacy = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const strips = [], atlas = [];
  page.on('request', (r) => {
    if (LEGACY_SHEET_RE.test(r.url())) legacy.push(r.url());
    if (/\/characters\/[a-z]+\/[a-z]+_(idle|walk)_(down|up|right)\.png/.test(r.url())) strips.push(r.url());
    if (/town-heroes-atlas\.png/.test(r.url())) atlas.push(r.url());
  });
  if (opts && opts.noAtlas) await page.route(/town-heroes-atlas\.png/, (r) => r.fulfill({ status: 404, body: 'gone' }));
  await page.route('**/main.js*', async (route) => {
    const resp = await route.fetch();
    const body = (await resp.text()).replace('const game = new Phaser.Game(config);', 'const game = window.__g = new Phaser.Game(config);');
    route.fulfill({ response: resp, body });
  });
  return { ctx, page, db, errors, legacy, strips, atlas };
}

async function enter(page, tap) {
  await page.waitForSelector('#join-offline-btn:not(.hidden)', { timeout: 9000 });
  await tap('#join-offline-btn');
  await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 25000 });
  await page.waitForTimeout(1000);
}

const townTex = (page) => page.evaluate(() => {
  const s = window.__g.scene.getScene('Town');
  return { key: s.localVisual.texture.key, frame: String(s.localVisual.frame.name), w: s.localVisual.width, h: s.localVisual.height,
    body: s.localBody.texture.key, species: s.selfData.species, rocks: s.textures.exists('punkrocks') && s.textures.get('punkrocks').source[0].width };
});

(async () => {
  const browser = await chromium.launch();
  for (const [label, viewport, touch] of [['phone', { width: 390, height: 844 }, true], ['desktop', { width: 1280, height: 800 }, false]]) {
    // 1) Fresh player: 10 heroes, ranger by default, pick the druid, it renders in town.
    {
      const p = await open(browser, viewport, touch);
      const tap = touch ? (sel) => p.page.tap(sel) : (sel) => p.page.click(sel);
      await p.page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await p.page.waitForSelector('#avatar-grid .avatar-choice');
      const grid = await p.page.evaluate(() => [...document.querySelectorAll('#avatar-grid .avatar-choice')].map((b) => {
        const r = b.getBoundingClientRect(); return { hero: b.dataset.hero, label: b.getAttribute('aria-label'), w: r.width, h: r.height, bg: b.style.backgroundImage, sel: b.classList.contains('selected') };
      }));
      check(`${label}: join picker shows exactly the 10 heroes`, grid.length === 10 && H.CLASSES.every((c) => grid.some((g) => g.hero === c)), JSON.stringify(grid.map((g) => g.hero)));
      check(`${label}: every hero button has a name + role label and a portrait`, grid.every((g) => /: /.test(g.label || '') && /b20-class-portraits/.test(g.bg)));
      check(`${label}: hero buttons are >= 44px targets`, grid.every((g) => g.w >= 44 && g.h >= 44), JSON.stringify(grid.map((g) => [g.w, g.h])));
      check(`${label}: default pick is the ranger`, grid.filter((g) => g.sel).map((g) => g.hero).join() === 'ranger');
      const tabs = await p.page.evaluate(() => [...document.querySelectorAll('#species-tabs .species-tab')].map((b) => b.textContent));
      // R4 D4 (b07-r2-04, intentional): the lone 'Heroes' tab became the '🎲 Surprise me' random-hero chip
      check(`${label}: no old species tabs (only the Surprise me chip)`, tabs.length === 1 && tabs[0] === '🎲 Surprise me', JSON.stringify(tabs));
      await p.page.fill('#name-input', 'ADMINhero');
      await tap('#avatar-grid .avatar-choice[data-hero="druid"]');
      const cap = await p.page.evaluate(() => (document.getElementById('avatar-grid-hero-caption') || {}).textContent || '');
      check(`${label}: caption names the picked hero`, /Druid/.test(cap), cap);
      await tap('button:has-text("Join Town")');
      await enter(p.page, tap);
      const t = await townTex(p.page);
      check(`${label}: picked hero renders in town (texture hero_druid)`, t.key === 'hero_druid' && t.body === 'hero_druid' && t.species === 'hero_druid', JSON.stringify(t));
      check(`${label}: hero frame is 24px (Town scale unchanged)`, t.w === 24 && t.h === 24, JSON.stringify(t));
      const saved = await p.page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), SAVE_KEY);
      check(`${label}: save carries hero_druid frame 0 in the species field`, saved.species === 'hero_druid' && saved.frame === 0, JSON.stringify(saved));
      // Walking switches to a walk frame (setFrame only).
      const pos = () => p.page.evaluate(() => { const b = window.__g.scene.getScene('Town').localBody; return { x: b.x, y: b.y }; });
      const p0 = await pos();
      await p.page.keyboard.down('ArrowRight'); await p.page.waitForTimeout(1200);
      const walking = await townTex(p.page);
      const p1 = await pos();
      await p.page.keyboard.up('ArrowRight'); await p.page.waitForTimeout(900);
      const idle = await townTex(p.page);
      // Headless frame rates vary a lot: always a walk frame; facing right whenever the step was mostly sideways.
      const sideways = p1.x - p0.x > 3 && Math.abs(p1.x - p0.x) > Math.abs(p1.y - p0.y);
      check(`${label}: walking shows a walk frame (right when stepping right)`, /^walk_(right|down|up)_\d$/.test(walking.frame) && (!sideways || /^walk_right_/.test(walking.frame)), walking.frame + ' ' + JSON.stringify([p0, p1]));
      check(`${label}: standing shows an idle frame`, /^idle_/.test(idle.frame), idle.frame);
      check(`${label}: decor statues are baked hero frames (no punkrocks sheet)`, t.rocks === 24 * 16, String(t.rocks));
      // Outfit shop: the same 10 heroes, live.
      const shop = await p.page.evaluate(() => {
        const s = window.__g.scene.getScene('Town'); s.openOutfitShop();
        return [...document.querySelectorAll('#outfit-avatar-grid .avatar-choice')].map((b) => b.dataset.hero);
      });
      check(`${label}: outfit shop offers the 10 heroes`, shop.length === 10 && H.CLASSES.every((c) => shop.includes(c)), JSON.stringify(shop));
      await p.page.evaluate(() => { document.querySelector('#outfit-avatar-grid .avatar-choice[data-hero="paladin"]').click(); window.__g.scene.getScene('Town').applyOutfit(); });
      const t2 = await townTex(p.page);
      check(`${label}: outfit change re-textures to the hero`, t2.key === 'hero_paladin' && t2.species === 'hero_paladin', JSON.stringify(t2));
      check(`${label}: no request to the legacy punk/mooncat sheets`, p.legacy.length === 0, p.legacy.slice(0, 3).join(','));
      check(`${label}: heroes come from ONE atlas request`, p.atlas.length === 1, JSON.stringify(p.atlas));
      check(`${label}: no full-size hero strip is downloaded (atlas instead of ~650 KB)`, p.strips.length === 0, p.strips.slice(0, 2).join(','));
      const freed = await p.page.evaluate(() => !window.__g.scene.getScene('Town').textures.exists('htatlas'));
      check(`${label}: the atlas texture is freed after the bake`, freed);
      check(`${label}: 0 console errors`, p.errors.length === 0, p.errors.slice(0, 3).join(' | '));
      check(`${label}: 0 database requests`, p.db.count() === 0, JSON.stringify({ http: p.db.http.slice(0, 2), ws: p.db.ws.slice(0, 2) }));
      await p.ctx.close();
    }
    // 2) Legacy save: species 'goldenpunks' frame 5 renders as its mapped hero; the stored value is never rewritten.
    {
      const SEED = JSON.stringify({ name: 'ADMINold', species: 'goldenpunks', frame: 5, coins: 3 });
      const p = await open(browser, viewport, touch, SEED);
      const tap = touch ? (sel) => p.page.tap(sel) : (sel) => p.page.click(sel);
      await p.page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await p.page.waitForSelector('#avatar-grid .avatar-choice');
      const want = H.classFor('goldenpunks', 5);
      const sel = await p.page.evaluate(() => [...document.querySelectorAll('#avatar-grid .avatar-choice.selected')].map((b) => b.dataset.hero));
      check(`${label}: legacy save highlights its mapped hero`, sel.join() === want, sel.join() + ' vs ' + want);
      await tap('button:has-text("Join Town")');
      await enter(p.page, tap);
      const t = await townTex(p.page);
      check(`${label}: legacy species renders as mapped hero`, t.key === 'hero_' + want && t.species === 'goldenpunks', JSON.stringify(t));
      const saved = await p.page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), SAVE_KEY);
      check(`${label}: stored legacy species/frame unchanged`, saved.species === 'goldenpunks' && saved.frame === 5 && saved.coins === 3, JSON.stringify(saved));
      // A remote player with a legacy key and one with junk render as heroes too (no crash).
      const remote = await p.page.evaluate(() => {
        const s = window.__g.scene.getScene('Town');
        const a = s.safeTexture('punkettes', 2), b = s.safeTexture('whatever_new', 99), c = s.safeTexture(undefined, null), d = s.safeTexture('hero_mage', 0);
        return [a.key, b.key, c.key, d.key];
      });
      check(`${label}: legacy/junk/hero remote keys all resolve to hero textures`, remote.every((k) => /^hero_/.test(k)) && remote[0] === 'hero_' + H.classFor('punkettes', 2) && remote[3] === 'hero_mage', JSON.stringify(remote));
      check(`${label}: legacy save: no request to the old sheets`, p.legacy.length === 0, p.legacy.slice(0, 3).join(','));
      check(`${label}: legacy save: 0 console errors`, p.errors.length === 0, p.errors.slice(0, 3).join(' | '));
      check(`${label}: legacy save: 0 database requests`, p.db.count() === 0);
      await p.ctx.close();
    }
  }
  // 3) Atlas missing (404): the strips are fetched and baked as before, the hero still renders and animates.
  {
    const p = await open(browser, { width: 1280, height: 800 }, false, null, { noAtlas: true });
    await p.page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await p.page.waitForSelector('#avatar-grid .avatar-choice');
    await p.page.fill('#name-input', 'ADMINatlas');
    await p.page.click('#avatar-grid .avatar-choice[data-hero="warlock"]');
    await p.page.click('button:has-text("Join Town")');
    await enter(p.page, (sel) => p.page.click(sel));
    const t = await townTex(p.page);
    const frames = await p.page.evaluate(() => window.__g.scene.getScene('Town').textures.get('hero_warlock').getFrameNames().length);
    check('atlas 404: falls back to the hero strips', p.strips.length === 60, String(p.strips.length));
    check('atlas 404: the hero still renders with all 30 frames', t.key === 'hero_warlock' && frames >= 30, JSON.stringify(t) + ' ' + frames);
    check('atlas 404: no page errors', p.errors.filter((e) => !/404|Failed to load|htatlas/.test(e)).length === 0, p.errors.slice(0, 3).join(' | '));
    await p.ctx.close();
  }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exitCode = 1; });
