// Round 4 QA replay (D5) of O-04 / b14-05 / b14-13: ONE backup, usable from the Hub, the Lantern and the Town, on a phone, by tapping.
//  1. Hub: a returning player finds Backup on Home by tapping (no script opens it), downloads the file: it holds the town save, a
//     Realm save, a mini-game save and the settings, with a version stamp.
//  2. Lantern on a NEW device (empty storage): Restore the Hub file -> confirm sheet -> Confirm: saves and settings are back.
//  3. Lantern: Back up my progress -> the Lantern file holds the same saves and settings (one backup, not a smaller one).
//  4. Hub on a third device: Restore the Lantern file -> preview -> nothing written before Confirm -> Confirm: everything is back.
//  5. An old town-only file (the pre-R4 Town export) is still accepted by the Lantern and by the Hub.
// Needs the D3 change (O-04): parked in tests/r4-open/ until r4-d3 is merged; D5 then moves it to game/tests/ and registers it
// (browser, full, timeoutSec 420). Offline: blockDb, no chat, no Firebase writes.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/r4-open/beta-r4-replay-backup-cross.test.js
const HERE = require('fs').existsSync(require('path').join(__dirname, 'helpers.js')) ? '.' : '..';
const fs = require('fs');
const { chromium } = require('playwright');
const { check, done, blockDb } = require(HERE + '/helpers');
const LS = require(HERE + '/lib/load-scale');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const HUB = ORIGIN + '/game/hub/index.html';
const LANTERN = ORIGIN + '/game/games/mad-maze/lantern.html';
const TOWN = { name: 'ADMINr4x', species: 'ranger', frame: 0, resources: { wood: 9, stone: 2 }, bells: 55 };
const SEED = { 'pixeltown-save-v1': JSON.stringify(TOWN), 'pixeltown-gift-v1': JSON.stringify({ v: 1, days: 4, last: '2026-11-20' }), 'mm-music': '1', 'mm-high-contrast': '1' };
const WANT = Object.keys(SEED);

async function device(browser, seed) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, acceptDownloads: true });
  const db = await blockDb(ctx);
  await ctx.route(/gstatic\.com\/firebasejs\//, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* firebase SDK blocked */' }));
  if (seed) await ctx.addInitScript((s) => { if (!sessionStorage.r4x) { sessionStorage.r4x = '1'; Object.keys(s).forEach((k) => localStorage.setItem(k, s[k])); } }, seed);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { ctx, page, db, errors };
}
const store = (page, keys) => page.evaluate((ks) => { const o = {}; ks.forEach((k) => { o[k] = localStorage.getItem(k); }); return o; }, keys);
const same = (got) => WANT.every((k) => (k === 'pixeltown-save-v1' ? !!got[k] && JSON.parse(got[k]).resources.wood === 9 && JSON.parse(got[k]).name === 'ADMINr4x' : got[k] === SEED[k]));
const shown = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !e.closest('[hidden]') && (!e.checkVisibility || e.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true })); }, sel); // checkVisibility: the body of a closed <details> has a box but is not rendered
// reach the Hub backup the way a player does: it lives on Home under a "Backup" fold; tap what is on screen
async function openHubBackup(page) {
  await page.goto(HUB);
  await page.waitForSelector('#hub-backup', { state: 'attached', timeout: LS.budget(15000) });
  await page.waitForTimeout(700);
  const taps = [];
  if (!(await shown(page, '#hub-backup'))) { // Home may be folded behind the map for a returning player: use the page's own Home control
    const home = await page.evaluate(() => { const c = Array.from(document.querySelectorAll('button, a, summary')).filter((e) => e.getClientRects().length && /^\W*home\b/i.test(e.textContent.trim()) && !/town/i.test(e.textContent)); if (!c.length) return null; c[0].scrollIntoView({ block: 'center' }); const r = c[0].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, t: c[0].textContent.trim().slice(0, 20) }; });
    if (home) { await page.touchscreen.tap(home.x, home.y); taps.push(home.t); await page.waitForTimeout(500); }
  }
  if (await shown(page, '#hub-backup') && !(await shown(page, '#mmb-backup'))) {
    const s = await page.evaluate(() => { const e = document.querySelector('#hub-backup summary') || document.getElementById('hub-backup'); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + Math.min(r.width / 2, 60), y: r.top + r.height / 2, t: e.textContent.trim().slice(0, 30), h: Math.round(r.height) }; });
    await page.touchscreen.tap(s.x, s.y); taps.push(s.t + ' (' + s.h + ' px)'); await page.waitForTimeout(400);
  }
  if (await shown(page, '#mmb-backup')) await page.evaluate(() => document.getElementById('mmb-backup').scrollIntoView({ block: 'center' }));
  return { ok: await shown(page, '#mmb-backup'), taps };
}
const sheetOpen = (page, id) => page.waitForFunction((i) => { const c = document.getElementById(i); return !!c && !c.hidden && c.getClientRects().length > 0; }, id, { timeout: LS.budget(10000) }).then(() => true).catch(() => false);

(async () => {
  const browser = await chromium.launch();
  // ---------- 1. Hub backup, reached by tapping
  const A = await device(browser, SEED);
  const reach = await openHubBackup(A.page);
  check('1a. on the Hub a returning player reaches Backup by tapping what is on screen', reach.ok, 'taps: ' + JSON.stringify(reach.taps));
  let hubFile = null; let hubText = '';
  if (reach.ok) {
    const [dl] = await Promise.all([A.page.waitForEvent('download', { timeout: LS.budget(20000) }), A.page.tap('#mmb-backup')]);
    hubText = fs.readFileSync(await dl.path(), 'utf8'); hubFile = JSON.parse(hubText);
  }
  const has = (f) => !!f && !!f.keys && WANT.every((k) => k in f.keys);
  check('1b. the Hub file is one bundle with the town save, a mini-game save and the settings, and a version stamp', has(hubFile) && hubFile.format === 'pixeltown-backup' && !!hubFile.v && typeof hubFile.build === 'string' && hubFile.build.length > 0, hubFile ? JSON.stringify({ v: hubFile.v, build: hubFile.build, keys: Object.keys(hubFile.keys) }) : 'no file');
  check('1c. no page errors on the Hub, no database traffic', A.errors.length === 0 && A.db.attempts() === 0, A.errors.join(' | '));
  await A.ctx.close();

  // ---------- 2. Lantern on a new device restores the Hub file
  const B = await device(browser, null);
  await B.page.goto(LANTERN);
  await B.page.waitForSelector('#restore', { state: 'attached', timeout: LS.budget(15000) });
  await B.page.waitForTimeout(600);
  const empty = await store(B.page, WANT);
  await B.page.setInputFiles('#restore', { name: 'hub-backup.json', mimeType: 'application/json', buffer: Buffer.from(hubText || '{}') });
  const l1 = await sheetOpen(B.page, 'restore-confirm');
  check('2a. the Lantern accepts the Hub file and asks before writing (nothing written yet)', l1 && JSON.stringify(await store(B.page, WANT)) === JSON.stringify(empty), await B.page.evaluate(() => document.body.innerText.split('\n').filter((l) => /backup|restore|file/i.test(l)).slice(-2).join(' / ')));
  if (l1) await B.page.tap('#restore-yes');
  await B.page.waitForFunction((k) => !!localStorage.getItem(k), 'pixeltown-save-v1', { timeout: LS.budget(8000) }).catch(() => {});
  await B.page.waitForTimeout(600);
  const gotB = await store(B.page, WANT);
  check('2b. after Confirm the saves AND the settings from the Hub file are on the new device', same(gotB), JSON.stringify(gotB).slice(0, 300));

  // ---------- 3. the Lantern's own backup is the same full bundle
  await B.page.goto(LANTERN);
  await B.page.waitForSelector('#backup', { state: 'attached', timeout: LS.budget(15000) });
  await B.page.waitForTimeout(600);
  await B.page.locator('#backup').scrollIntoViewIfNeeded();
  const [dl2] = await Promise.all([B.page.waitForEvent('download', { timeout: LS.budget(20000) }), B.page.tap('#backup')]);
  const lanText = fs.readFileSync(await dl2.path(), 'utf8'); const lanFile = JSON.parse(lanText);
  check('3. the Lantern backup holds the same saves and settings as the Hub one (ONE backup)', has(lanFile) && lanFile.keys['mm-music'] === '1' && lanFile.keys['mm-high-contrast'] === '1', JSON.stringify(Object.keys(lanFile.keys || {})));
  check('3b. no page errors in the Lantern, no database traffic', B.errors.length === 0 && B.db.attempts() === 0, B.errors.join(' | '));
  await B.ctx.close();

  // ---------- 4. Hub on a third device restores the Lantern file
  const C = await device(browser, null);
  const reachC = await openHubBackup(C.page);
  const before = await store(C.page, WANT);
  let prev = false;
  if (reachC.ok) { await C.page.setInputFiles('#mmb-restore', { name: 'lantern-backup.json', mimeType: 'application/json', buffer: Buffer.from(lanText) }); prev = await sheetOpen(C.page, 'mmb-confirm'); }
  const previewText = prev ? await C.page.evaluate(() => document.getElementById('mmb-confirm').innerText.replace(/\s+/g, ' ').slice(0, 400)) : '';
  check('4a. the Hub previews the Lantern file (saves and settings named) and writes nothing before Confirm', reachC.ok && prev && /town save/i.test(previewText) && /setting/i.test(previewText) && JSON.stringify(await store(C.page, WANT)) === JSON.stringify(before), previewText || 'taps: ' + JSON.stringify(reachC.taps));
  if (prev) { await Promise.all([C.page.waitForEvent('load', { timeout: LS.budget(15000) }).catch(() => {}), C.page.tap('#mmb-yes')]); await C.page.waitForTimeout(600); }
  check('4b. after Confirm everything is on the third device', same(await store(C.page, WANT)));
  check('4c. no page errors on the Hub restore, no database traffic', C.errors.length === 0 && C.db.attempts() === 0, C.errors.join(' | '));
  await C.ctx.close();

  // ---------- 5. an old town-only file still restores (Lantern, then Hub)
  const old = { name: 'old.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(TOWN)) };
  const D = await device(browser, null);
  await D.page.goto(LANTERN);
  await D.page.waitForSelector('#restore', { state: 'attached', timeout: LS.budget(15000) });
  await D.page.waitForTimeout(600);
  await D.page.setInputFiles('#restore', old);
  const l5 = await sheetOpen(D.page, 'restore-confirm');
  if (l5) await D.page.tap('#restore-yes');
  await D.page.waitForFunction((k) => !!localStorage.getItem(k), 'pixeltown-save-v1', { timeout: LS.budget(8000) }).catch(() => {});
  const gotD = await store(D.page, ['pixeltown-save-v1']);
  check('5a. the Lantern still restores an old town-only file', l5 && !!gotD['pixeltown-save-v1'] && JSON.parse(gotD['pixeltown-save-v1']).resources.wood === 9, JSON.stringify(gotD).slice(0, 120));
  await D.ctx.close();
  const E = await device(browser, null);
  const reachE = await openHubBackup(E.page);
  let p5 = false;
  if (reachE.ok) { await E.page.setInputFiles('#mmb-restore', old); p5 = await sheetOpen(E.page, 'mmb-confirm'); }
  if (p5) { await Promise.all([E.page.waitForEvent('load', { timeout: LS.budget(15000) }).catch(() => {}), E.page.tap('#mmb-yes')]); await E.page.waitForTimeout(600); }
  const gotE = await store(E.page, ['pixeltown-save-v1']);
  check('5b. the Hub still restores an old town-only file', p5 && !!gotE['pixeltown-save-v1'] && JSON.parse(gotE['pixeltown-save-v1']).resources.wood === 9, JSON.stringify(gotE).slice(0, 120));
  await E.ctx.close();

  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
