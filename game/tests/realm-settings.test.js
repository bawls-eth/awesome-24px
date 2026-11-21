// AX2: the Realm settings sheet (gear icon + Esc menu): palette, HUD size, reduce motion, screen flashes, low graphics, bullet outline.
// Persists in pixeltown-access-v1 (MMAccess.prefs), applies live, survives a reload, recovers from a corrupt save, phone 390x844.
// Run: BASE=http://localhost:8663/game/index.html NODE_PATH=$(npm root -g) node game/tests/realm-settings.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const fs = require('fs');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=12345';
const KEY = 'pixeltown-access-v1';
const SHOTS = process.env.SHOTS || require('os').tmpdir();

async function open(browser, opts, seed, url) {
  const ctx = await browser.newContext(opts);
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('mm-aim-assist', '0'); if (s) localStorage.setItem('pixeltown-access-v1', s); }, seed || null);
  await page.goto(url || WORLD);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 15000 });
  await page.waitForTimeout(300);
  return { ctx, page, errors };
}
const stored = (page) => page.evaluate((k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return 'corrupt'; } }, KEY);
const click = (page, sel) => page.evaluate((s) => document.querySelector(s).click(), sel);

(async () => {
  const browser = await chromium.launch();

  // ---- desktop: open, change, persist, reload ----
  let T = await open(browser, { viewport: { width: 1000, height: 700 } });
  let page = T.page;
  check('gear icon exists and is a 44 px target', await page.evaluate(() => { const b = document.getElementById('mm-gear-btn'); const r = b.getBoundingClientRect(); return r.width >= 44 && r.height >= 44; }));
  check('defaults before any change: no save written, palette normal, HUD scale 1', (await stored(page)) === null && await page.evaluate(() => document.getElementById('realm-overlay').style.getPropertyValue('--mm-hud-scale') === '1' && document.body.classList.contains('mm-pal-normal')));
  await page.click('#mm-gear-btn'); await page.waitForTimeout(150);
  check('gear opens the settings sheet and the game is paused behind it', await page.evaluate(() => window.__mmAccess.isOpen() && window.__mm.arena.paused === true));
  await click(page, '#mm-settings button[data-ax="palette"][data-v="deuteranopia"]');
  await click(page, '#mm-settings button[data-ax="hudScale"][data-v="1.5"]');
  let live = await page.evaluate(() => ({ cls: document.body.classList.contains('mm-pal-deuteranopia'), bullet: document.getElementById('realm-overlay').style.getPropertyValue('--mm-bullet'), scale: document.getElementById('realm-overlay').style.getPropertyValue('--mm-hud-scale'), big: document.body.classList.contains('mm-hud-big'), zoom: getComputedStyle(document.getElementById('realm-hp')).zoom }));
  check('palette applies live (body class + CSS var from MMAccess)', live.cls && live.bullet === '#ffd92f', JSON.stringify(live));
  check('HUD size applies a CSS var to the Realm root at once', live.scale === '1.5' && live.big && String(live.zoom) === '1.5', JSON.stringify(live));
  let st = await stored(page);
  check('prefs persisted in pixeltown-access-v1', st && st.v === 1 && st.palette === 'deuteranopia' && st.hudScale === 1.5, JSON.stringify(st));

  // flashes: off pins the hit vignette at 0, on restores it
  await click(page, '#mm-settings button[data-ax="flashes"]');
  check('screen flashes off: the hit vignette cannot rise', await page.evaluate(() => { const a = window.__mm.arena; a.flash = 1; return a.flash === 0 && document.body.classList.contains('mm-no-flash'); }));
  await click(page, '#mm-settings button[data-ax="flashes"]');
  check('screen flashes on again: the vignette works', await page.evaluate(() => { const a = window.__mm.arena; a.flash = 1; return a.flash === 1; }));
  await click(page, '#mm-settings button[data-ax="flashes"]'); // leave off for the reload check
  await click(page, '#mm-settings button[data-ax="bulletOutline"]');
  await click(page, '#mm-settings button[data-ax="motion"]');
  check('reduce motion flips the arena setting (existing hook)', await page.evaluate(() => window.__mm.arena._reduced === true && localStorage.getItem('mm-reduce-motion') === '1'));
  st = await stored(page);
  check('flashes and outline persisted', st.flashes === false && st.bulletOutline === false, JSON.stringify(st));

  // Esc closes the sheet; a sheet opened by the gear also resumes the run it paused
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  check('Esc closes the gear sheet and resumes the run', await page.evaluate(() => !window.__mmAccess.isOpen() && window.__mm.arena.panel === null && window.__mm.arena.paused === false));
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  check('the Esc menu has a "More settings" button that opens the sheet', await page.evaluate(() => { const b = document.getElementById('mm-settings-open'); b.click(); return window.__mmAccess.isOpen() && window.__mm.arena.panel === 'menu'; }));
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  check('Esc closes the sheet first, the menu stays', await page.evaluate(() => !window.__mmAccess.isOpen() && window.__mm.arena.panel === 'menu'));
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  check('a second Esc closes the menu and the run resumes', await page.evaluate(() => window.__mm.arena.panel === null && window.__mm.arena.paused === false));
  check('no console errors (desktop)', T.errors.length === 0, T.errors.join(' | '));
  await T.ctx.close();

  // ---- reload with the saved prefs ----
  const savedRaw = JSON.stringify({ v: 1, palette: 'tritanopia', hudScale: 1.25, flashes: false, bulletOutline: false, lowGfx: false });
  T = await open(browser, { viewport: { width: 1000, height: 700 } }, savedRaw);
  page = T.page;
  live = await page.evaluate(() => ({ cls: document.body.classList.contains('mm-pal-tritanopia'), scale: document.getElementById('realm-overlay').style.getPropertyValue('--mm-hud-scale'), noFlash: document.body.classList.contains('mm-no-flash'), noOutline: !document.body.classList.contains('mm-outline') }));
  check('saved prefs are applied on load', live.cls && live.scale === '1.25' && live.noFlash && live.noOutline, JSON.stringify(live));
  check('applied prefs are also readable on the arena', await page.evaluate(() => window.__mm.arena.accessPrefs.palette === 'tritanopia' && window.__mm.arena.accessPrefs.hudScale === 1.25));
  await T.ctx.close();

  // ---- corrupt / hostile saves fall back to defaults, never an error ----
  for (const bad of ['{not json', JSON.stringify({ v: 1, palette: '__proto__', hudScale: 7, flashes: 'no', bulletOutline: 3, lowGfx: 'yes', extra: 1 }), '"x"', 'null', JSON.stringify([1, 2])]) {
    T = await open(browser, { viewport: { width: 1000, height: 700 } }, bad);
    page = T.page;
    const d = await page.evaluate(() => ({ pal: document.body.classList.contains('mm-pal-normal'), scale: document.getElementById('realm-overlay').style.getPropertyValue('--mm-hud-scale'), noFlash: document.body.classList.contains('mm-no-flash'), low: document.body.classList.contains('mm-low-gfx') }));
    check('corrupt save recovers to defaults: ' + bad.slice(0, 28), d.pal && d.scale === '1' && !d.noFlash && !d.low, JSON.stringify(d));
    await page.evaluate(() => window.__mmAccess.set('palette', 'protanopia'));
    st = await stored(page);
    check('  ...and the next change rewrites a clean save', st && st.v === 1 && st.palette === 'protanopia' && st.hudScale === 1 && !('extra' in st), JSON.stringify(st));
    check('  ...with no console errors', T.errors.length === 0, T.errors.join(' | '));
    await T.ctx.close();
  }

  // ---- phone 390x844 ----
  T = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  page = T.page;
  const gear = await page.evaluate(() => { const r = document.getElementById('mm-gear-btn').getBoundingClientRect(); const els = ['realm-stick-move', 'realm-stick-aim'].map((id) => document.getElementById(id).getBoundingClientRect()); const hit = els.some((s) => !(r.right <= s.left || r.left >= s.right || r.bottom <= s.top || r.top >= s.bottom)); return { w: r.width, h: r.height, hit, inside: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight }; });
  check('phone: gear is >= 44 px, on screen and clear of both sticks', gear.w >= 44 && gear.h >= 44 && !gear.hit && gear.inside, JSON.stringify(gear));
  await page.tap('#mm-gear-btn'); await page.waitForTimeout(200);
  const targets = await page.evaluate(() => Array.from(document.querySelectorAll('#mm-settings button')).map((b) => { const r = b.getBoundingClientRect(); return { t: b.textContent.slice(0, 18), w: Math.round(r.width), h: Math.round(r.height) }; }));
  check('phone: every settings control is >= 44 px (' + targets.length + ' buttons)', targets.length >= 12 && targets.every((t) => t.w >= 44 && t.h >= 44), JSON.stringify(targets.filter((t) => t.w < 44 || t.h < 44)));
  check('phone: the sheet fits the screen and the page has no horizontal scroll', await page.evaluate(() => { const r = document.querySelector('#mm-settings .rm-card').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth; }));
  await page.screenshot({ path: SHOTS + '/realm-settings-phone.png' });
  await page.tap('#mm-settings button[data-ax="hudScale"][data-v="1.5"]'); await page.tap('#mm-settings button[data-ax="done"]'); await page.waitForTimeout(150);
  check('phone: HUD at 150% still has no horizontal scroll and the HUD stays on screen', await page.evaluate(() => { const r = document.getElementById('realm-hud').getBoundingClientRect(); return document.documentElement.scrollWidth <= innerWidth && r.left >= -1 && r.right <= innerWidth + 1; }));
  await page.screenshot({ path: SHOTS + '/realm-settings-phone-hud150.png' });
  check('no console errors (phone)', T.errors.length === 0, T.errors.join(' | '));
  await T.ctx.close();

  await browser.close();
  done();
})();
