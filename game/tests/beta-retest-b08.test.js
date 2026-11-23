// QA re-test of b08-01 (G-01): a brand-new player (empty storage, phone 390x844) can claim the Daily gift on Home.
// Tester steps: empty storage -> /game/hub/ -> tap "Daily gift" -> tap Claim. blockDb on the context, no chat, no writes.
// Fails on the beta base (message "...until your town save is ready. Nothing was claimed."); passes once G-01 is fixed.
// Run: python3 -m http.server 8440 &   BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/beta-retest-b08.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const SK = 'pixeltown-save-v1', GK = 'pixeltown-gift-v1';

(async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const db = await blockDb(ctx);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(ORIGIN + '/game/hub/index.html?test=1&gdate=2026-11-23');
    await page.waitForFunction(() => window.__hub);
    check('fresh storage: no town save before the claim', (await page.evaluate((k) => localStorage.getItem(k), SK)) === null);
    await page.tap('#gift-btn');
    await page.waitForSelector('#gift-card:not([hidden])');
    const preview = await page.textContent('#gift-today');
    const want = Number((preview.match(/(\d+)\s*shards/) || [])[1] || 0);
    await page.tap('#gift-claim');
    await page.tap('#gift-claim').catch(() => {}); // second fast tap must not pay twice
    await page.waitForTimeout(400);
    const note = (await page.textContent('#gift-card')) || '';
    check('claim does not say "Nothing was claimed" / "town save"', !/Nothing was claimed|town save/i.test(note), note.slice(0, 200));
    check('card shows Days claimed: 1', /Days claimed: 1/.test(note), note.slice(0, 200));
    check('claim button is disabled afterwards', await page.locator('#gift-claim').isDisabled());
    const save = await page.evaluate((k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, SK);
    check('previewed shards were paid exactly once into realm.shards', !!(save && save.realm && save.realm.shards === want && want > 0), JSON.stringify(save) + ' want ' + want);
    check('no name was invented in the town save (join card still shows)', !!save && !('name' in save), JSON.stringify(save));
    const gift = await page.evaluate((k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, GK);
    check('gift key counts day 1', !!(gift && gift.days === 1), JSON.stringify(gift));
    if (process.env.QA_SHOTS) await page.screenshot({ path: process.env.QA_SHOTS + '/qa-b08-01-after.png' }).catch(() => {});
    // corrupt town save: nothing paid, raw string byte-identical, button still enabled
    const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await blockDb(c2);
    const p2 = await c2.newPage();
    await p2.addInitScript((k) => { if (!sessionStorage.s) { sessionStorage.s = 1; localStorage.setItem(k, 'not json'); } }, SK);
    await p2.goto(ORIGIN + '/game/hub/index.html?test=1&gdate=2026-11-23');
    await p2.waitForFunction(() => window.__hub);
    await p2.tap('#gift-btn'); await p2.waitForSelector('#gift-card:not([hidden])');
    await p2.tap('#gift-claim'); await p2.waitForTimeout(300);
    check('corrupt town save: raw string untouched', (await p2.evaluate((k) => localStorage.getItem(k), SK)) === 'not json');
    check('corrupt town save: gift key not written', (await p2.evaluate((k) => localStorage.getItem(k), GK)) === null);
    check('no database traffic', db.count() === 0);
    check('no pageerror', errors.length === 0, errors.join(' | '));
    await c2.close(); await ctx.close();
  } catch (e) {
    check('test ran to the end', false, e && e.stack);
  } finally {
    await browser.close();
    done();
  }
})();
