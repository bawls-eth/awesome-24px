// Beta S-05 (b15-01, P1): Deepdelve boots and plays when the `localStorage` getter itself throws (cookies / site data blocked).
// No Firebase on this page. Serve the repo root, then:
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-s05-deepdelve-storage.test.js
//  1. The status leaves "Loading the mine..." within 5 s and the canvas renders a non-blank frame.
//  2. Zero pageerror events.
//  3. Mining one block works (inventory +1 in memory) and the "cannot be saved" note is visible.
//  4. Normal context: no note, and the run record still persists across a reload.
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL = (q) => ORIGIN + '/game/games/deepdelve/index.html' + (q || '');
const NOTE = 'cannot be saved';

async function open(browser, blocked, q) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  if (blocked) {
    await ctx.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } });
    });
  }
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + (process.env.S05_DEBUG ? ' @ ' + String(e.stack).split('\n').slice(1, 3).join(' ') : '')));
  await page.goto(URL(q));
  return { ctx, page, errors };
}

async function mineOne(page) {
  return page.evaluate(() => {
    const d = window.__dd;
    const total = () => Object.values(d.inv).reduce((a, b) => a + (b | 0), 0);
    const before = total();
    for (let x = 40; x < 60; x++) {
      const s = d.surfaceY(x, 40);
      for (let y = s + 6; y >= s - 4; y--) {
        if (d.getBlock(x, y, 40) !== 0) { const was = JSON.stringify(d.inv); if (d.mineAt(x, y, 40)) return { before, after: total(), was, now: JSON.stringify(d.inv) }; }
      }
    }
    return { before, after: before };
  });
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

  // ---- blocked storage ----
  {
    const { ctx, page, errors } = await open(browser, true, '?test=1&seed=5');
    const threw = await page.evaluate(() => { try { void window.localStorage; return false; } catch (e) { return true; } });
    check('[blocked] the localStorage getter really throws in this context', threw);
    const booted = await page.waitForFunction(() => window.__dd && window.__dd.ready && !/Loading the mine/.test(document.getElementById('msg').textContent), null, { timeout: 5000 }).then(() => true).catch(() => false);
    check('[blocked] status leaves "Loading the mine..." within 5 s', booted, await page.evaluate(() => document.getElementById('msg').textContent));
    await page.waitForTimeout(600);
    const shot = await page.locator('canvas').first().screenshot();
    check('[blocked] the canvas renders a non-blank frame', shot.length > 15000, String(shot.length));
    const note = await page.evaluate(() => document.getElementById('msg').textContent);
    check('[blocked] the "Progress cannot be saved" note is visible', note.includes(NOTE) && await page.locator('#msg').isVisible(), note);
    const m = booted ? await mineOne(page) : { before: 0, after: 0 };
    const was = JSON.parse(m.was || '{}'), now = JSON.parse(m.now || '{}');
    const plusOne = Object.keys(now).filter((k) => !/^bp_/.test(k) && (now[k] | 0) === (was[k] | 0) + 1); // a blueprint find may come too
    check('[blocked] mining one block adds 1 to the inventory (memory)', plusOne.length === 1, JSON.stringify(m));
    check('[blocked] zero pageerror events', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---- normal storage: no note, and saves persist across a reload ----
  {
    const { ctx, page, errors } = await open(browser, false, '?test=1&seed=5');
    await page.waitForFunction(() => window.__dd && window.__dd.ready, null, { timeout: 15000 });
    const note = await page.evaluate(() => document.getElementById('msg').textContent);
    check('[normal] no "cannot be saved" note', !note.includes(NOTE), note);
    await page.evaluate(() => localStorage.setItem('pixeltown-deepdelve-v1', JSON.stringify({ v: 1, s05: 1 })));
    await page.evaluate(() => { const d = window.__dd; d.meta().goals.maxDepth = Math.max(3, d.meta().goals.maxDepth | 0); });
    const before = await page.evaluate(() => localStorage.getItem('pixeltown-deepdelve-v1'));
    await page.reload();
    await page.waitForFunction(() => window.__dd && window.__dd.ready, null, { timeout: 15000 });
    const after = await page.evaluate(() => localStorage.getItem('pixeltown-deepdelve-v1'));
    check('[normal] real localStorage is still used (value survives a reload)', typeof after === 'string' && after.length > 0 && before.length > 0, String(after).slice(0, 80));
    check('[normal] no probe key left behind', await page.evaluate(() => localStorage.getItem('pixeltown-deepdelve-probe') === null));
    check('[normal] zero pageerror events', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
