// R4 O-04 (b14-05 P2, b14-13, b14-r2-N02): the Town Backup and the new Hub Backup make the SAME full bundle (every save + settings),
// and both Restores preview before writing. OFFLINE ONLY: blockDb + a stubbed Firebase SDK; never chats, never writes to Firebase.
//  Hub: Backup -> file holds town save + settings; Restore on a fresh profile -> preview lists settings, nothing written before Confirm,
//       Cancel writes nothing, a junk file writes nothing, Confirm writes and reloads; an old town-only file previews as such.
//  Town: exportSave -> full bundle with settings (failed before R4: raw town save); bundle Restore says "Reading the backup…" before
//       the confirm (b14-r2-N02) and the confirm lists the settings apart.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-r4-o04-town-hub-backup.test.js
const { chromium } = require('playwright');
const fs = require('fs');
const { check, done, offlineStub } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const HUB = BASE.replace(/index\.html.*$/, 'hub/index.html');
const SEED = {
  'pixeltown-save-v1': JSON.stringify({ name: 'ADMINo04', species: 'ranger', frame: 0, resources: { wood: 9, stone: 2 }, achievementsUnlocked: ['first-wood'] }),
  'mm-music': '1', 'mm-high-contrast': '1', 'mm-auto-fire': '1',
  'pixeltown-gift-v1': JSON.stringify({ v: 1, days: 4, last: '2026-11-20' })
};
async function ctxWith(browser, seed) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const db = await offlineStub(ctx);
  if (seed) await ctx.addInitScript((s) => { if (!sessionStorage.o04) { sessionStorage.o04 = '1'; Object.keys(s).forEach((k) => localStorage.setItem(k, s[k])); } }, seed);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  return { ctx, page, db, errors };
}
const dump = (page) => page.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return JSON.stringify(o, Object.keys(o).sort()); });
async function openHubBackup(page) {
  await page.goto(HUB);
  await page.waitForSelector('#hub-backup', { state: 'attached', timeout: 15000 });
  await page.evaluate(() => { const h = document.getElementById('home'); if (h) h.hidden = false; document.getElementById('hub-backup').open = true; });
  await page.waitForSelector('#mmb-backup', { timeout: 5000 });
}
const pick = (page, name, text) => page.setInputFiles('#mmb-restore', { name, mimeType: 'application/json', buffer: Buffer.from(text) });

(async () => {
  const browser = await chromium.launch();
  // ---------- Hub ----------
  const A = await ctxWith(browser, SEED);
  await openHubBackup(A.page);
  const [dl] = await Promise.all([A.page.waitForEvent('download', { timeout: 20000 }), A.page.click('#mmb-backup')]);
  const fileText = fs.readFileSync(await dl.path(), 'utf8');
  const file = JSON.parse(fileText);
  check('[hub] Backup downloads the full bundle (format, scope all, build stamp)', file.format === 'pixeltown-backup' && file.scope === 'all' && typeof file.build === 'string');
  check('[hub] the file holds the town save and the settings', file.keys['pixeltown-save-v1'] === SEED['pixeltown-save-v1'] && file.keys['mm-music'] === '1' && file.keys['mm-high-contrast'] === '1' && file.keys['mm-auto-fire'] === '1', Object.keys(file.keys).join(','));
  check('[hub] the status says how many items were saved', /Backup saved: \d+ saves and settings/.test(await A.page.textContent('#mmb-status')));
  check('[hub] no page errors (backup side)', A.errors.length === 0, A.errors.join(' | '));
  check('[hub] no database traffic', A.db.attempts() === 0);
  await A.ctx.close();

  const F = await ctxWith(browser, null);
  await openHubBackup(F.page);
  const fresh0 = await dump(F.page);
  await pick(F.page, 'junk.json', '{"hello":1}');
  await F.page.waitForFunction(() => /Nothing was changed|nothing was changed/.test(document.getElementById('mmb-status').textContent), null, { timeout: 15000 });
  check('[hub] a junk file is refused with a message and writes nothing', (await dump(F.page)) === fresh0 && (await F.page.isHidden('#mmb-confirm')));
  await pick(F.page, 'backup.json', fileText);
  await F.page.waitForSelector('#mmb-confirm', { state: 'visible', timeout: 15000 });
  const listT = await F.page.textContent('#mmb-list'), metaT = await F.page.textContent('#mmb-meta');
  check('[hub] preview lists saves and settings', /town save/.test(listT) && /music setting \(setting\)/.test(listT) && /\d+ settings/.test(metaT), listT + ' | ' + metaT);
  check('[hub] preview shows the build stamp', metaT.indexOf(file.build) >= 0 && metaT.indexOf(file.made.slice(0, 10)) >= 0, metaT);
  check('[hub] nothing is written before Confirm', (await dump(F.page)) === fresh0);
  await F.page.click('#mmb-no');
  check('[hub] Cancel writes nothing', (await dump(F.page)) === fresh0 && /cancelled/.test(await F.page.textContent('#mmb-status')));
  await pick(F.page, 'backup.json', fileText);
  await F.page.waitForSelector('#mmb-confirm', { state: 'visible', timeout: 15000 });
  await Promise.all([F.page.waitForEvent('load', { timeout: 15000 }), F.page.click('#mmb-yes')]);
  const got = await F.page.evaluate(() => ({ m: localStorage.getItem('mm-music'), hc: localStorage.getItem('mm-high-contrast'), t: localStorage.getItem('pixeltown-save-v1'), g: localStorage.getItem('pixeltown-gift-v1') }));
  check('[hub] Confirm restores the settings and the saves, then reloads', got.m === '1' && got.hc === '1' && JSON.parse(got.t).name === 'ADMINo04' && JSON.parse(got.g).days === 4, JSON.stringify(got));
  await openHubBackup(F.page);
  await pick(F.page, 'town.json', SEED['pixeltown-save-v1']);
  await F.page.waitForSelector('#mmb-confirm', { state: 'visible', timeout: 15000 });
  check('[hub] an old town-only file previews as such', /old town-only file/.test(await F.page.textContent('#mmb-meta')));
  await F.page.click('#mmb-no');
  check('[hub] no page errors (restore side)', F.errors.length === 0, F.errors.join(' | '));
  check('[hub] no database traffic (restore side)', F.db.attempts() === 0);
  await F.ctx.close();

  // ---------- Town ----------
  const T = await ctxWith(browser, SEED);
  await T.ctx.route('**/main.js*', async (route) => {
    const resp = await route.fetch();
    route.fulfill({ response: resp, body: (await resp.text()).replace('const game = new Phaser.Game(config);', 'const game = window.__g = new Phaser.Game(config);') });
  });
  const tp = T.page;
  await tp.goto(BASE);
  await tp.waitForSelector('#name-input');
  if (!(await tp.inputValue('#name-input'))) await tp.fill('#name-input', 'ADMINo04');
  await tp.click('button:has-text("Join Town")');
  await tp.waitForSelector('#join-offline-btn:not(.hidden)', { timeout: 15000 });
  await tp.click('#join-offline-btn');
  await tp.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 30000 });
  await tp.waitForTimeout(800);
  const [tdl] = await Promise.all([tp.waitForEvent('download', { timeout: 20000 }), tp.evaluate(() => window.__g.scene.getScene('Town').exportSave())]);
  const tf = JSON.parse(fs.readFileSync(await tdl.path(), 'utf8'));
  check('[town] Backup is the full bundle with the settings (was the raw town save)', tf.format === 'pixeltown-backup' && tf.keys['mm-music'] === '1' && JSON.parse(tf.keys['pixeltown-save-v1']).name === 'ADMINo04', Object.keys(tf).join(','));
  // restore: fresh page state so MMBackup is not loaded yet -> the "Reading" line must come before the confirm
  await tp.reload();
  await tp.waitForSelector('#name-input');
  await tp.click('button:has-text("Join Town")');
  await tp.waitForSelector('#join-offline-btn:not(.hidden)', { timeout: 15000 });
  await tp.click('#join-offline-btn');
  await tp.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 30000 });
  const hadTool = await tp.evaluate(() => !!window.MMBackup);
  let dialogText = '';
  // the chat text at the moment the confirm opens (an evaluate while the dialog is open would block, so the page records it)
  await tp.evaluate(() => { const c = window.confirm; window.confirm = (m) => { window.__chatAtConfirm = document.getElementById('chat-log').textContent; return c.call(window, m); }; });
  tp.once('dialog', (d) => { dialogText = d.message(); d.dismiss(); });
  const pre = await dump(tp);
  await tp.setInputFiles('#save-import-input', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(tf)) });
  await tp.waitForFunction(() => /cancelled/.test(document.getElementById('chat-log').textContent), null, { timeout: 20000 });
  const chatAtDialog = await tp.evaluate(() => window.__chatAtConfirm || '');
  check('[town] "Reading the backup…" shows before the confirm (b14-r2-N02)', hadTool || /Reading the backup/.test(chatAtDialog), chatAtDialog.slice(-200));
  check('[town] the confirm lists the settings apart and the build', /Settings \(\d+\): .*music setting/.test(dialogText) && dialogText.indexOf(tf.build) >= 0, dialogText);
  check('[town] Cancel writes nothing', (await dump(tp)) === pre);
  check('[town] no page errors', T.errors.length === 0, T.errors.join(' | '));
  check('[town] no database traffic', T.db.attempts() === 0);
  await T.ctx.close();
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
