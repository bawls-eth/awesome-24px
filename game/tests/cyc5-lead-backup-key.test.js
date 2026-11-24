// Cycle 5 L (b14-r3-N01): a backup that cannot be read as a bundle says WHICH part is at fault, and a bundle with one unknown
// key (a file from a newer build) is NOT refused: the unknown key is named as skipped and the rest restores.
// Checked: (node) MMBackup.plan; (browser) the Hub "Restore from a file" card with a real file pick.
// The retest's "whole file refused as damaged" only happens for a bundle with no numeric "v" or no "keys" map; that message
// was a bare "That backup file is damaged." before this change.
// OFFLINE only (offlineStub), db.attempts() === 0. Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc5-lead-backup-key.test.js
const B = require('../shared/mm-backup.js');
const { check, done, offlineStub } = require('./helpers');
const TOWN = { name: 'ADMINl5', avatar: {}, wallet: 5, inventory: [] };
const keysUnknown = { 'pixeltown-save-v1': JSON.stringify(TOWN), 'pixeltown-hoverboard-v9': '{"x":1}' };
const bundle = (o) => JSON.stringify(Object.assign({ format: B.FORMAT, v: B.VERSION }, o));

const p1 = B.plan(bundle({ keys: keysUnknown }));
check('node: one unknown key does not refuse the file: the town save still restores', p1.ok === true && JSON.stringify(p1.keys) === '["pixeltown-save-v1"]', JSON.stringify(p1).slice(0, 300));
check('node: the unknown key is named as skipped (plan.skipped and the message)', p1.ok && p1.skipped.length === 1 && p1.skipped[0].key === 'pixeltown-hoverboard-v9' && /Skipped \(not known by this version of the game\): pixeltown-hoverboard-v9/.test(p1.message || ''), JSON.stringify([p1.skipped, p1.message]));
const p2 = B.plan(bundle({ v: B.VERSION + 5, keys: keysUnknown }));
check('node: a bundle from a newer format version restores the keys this build knows', p2.ok === true && p2.newer === true && p2.keys.length === 1, JSON.stringify(p2).slice(0, 300));
const p3 = B.plan(JSON.stringify({ format: B.FORMAT, version: 2, keys: keysUnknown })); // "version" instead of "v"
check('node: no numeric "v": refused, and the message names the version number', p3.ok === false && p3.error === 'bad-bundle' && /^That backup file is damaged: its version number \("v"\)/.test(p3.message), JSON.stringify(p3));
const p4 = B.plan(bundle({ keys: ['pixeltown-save-v1'] }));
const p5 = B.plan(bundle({}));
check('node: "keys" not a map (array / missing): refused, and the message names the list of saves', [p4, p5].every((p) => p.ok === false && p.error === 'bad-bundle' && /^That backup file is damaged: its list of saves \("keys"\) is missing\.$/.test(p.message)), JSON.stringify([p4, p5]));
const p6 = B.plan(bundle({ keys: { 'pixeltown-hoverboard-v9': '{}' } }));
check('node: only unknown keys: refused with the key named', p6.ok === false && p6.error === 'unknown-key' && /pixeltown-hoverboard-v9/.test(p6.message), JSON.stringify(p6));
if (process.env.NODE_ONLY) { done(); return; }

const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const HUB = BASE.replace(/game\/index\.html.*$/, '') + 'game/hub/index.html';
const SHOTS = process.env.SHOTS || null;
(async () => {
  const browser = await chromium.launch();
  for (const [tag, opts] of [['desktop', { viewport: { width: 1280, height: 720 } }], ['phone', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }]]) {
    const ctx = await browser.newContext(opts);
    const db = await offlineStub(ctx);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(HUB);
    await page.waitForSelector('#hub-backup', { state: 'attached', timeout: 15000 });
    await page.evaluate(() => { const h = document.getElementById('home'); if (h) h.hidden = false; document.getElementById('hub-backup').open = true; });
    await page.waitForSelector('#mmb-backup', { timeout: 5000 });
    const before = await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])));
    const pick = (name, text) => page.setInputFiles('#mmb-restore', { name, mimeType: 'application/json', buffer: Buffer.from(text) });
    const status = () => page.evaluate(() => (document.querySelector('.mmb-status') || {}).textContent || '');

    await pick('bad.json', JSON.stringify({ format: B.FORMAT, version: 2, keys: keysUnknown }));
    await page.waitForFunction(() => /damaged/.test((document.querySelector('.mmb-status') || {}).textContent || ''), null, { timeout: 15000 }).catch(() => null);
    const s1 = await status();
    check(`${tag}: Hub restore of a bundle without "v": the status names the version number, nothing changed`, /damaged: its version number \("v"\) is missing or not a number\. Nothing was changed\.$/.test(s1) && before === await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)]))), s1);
    if (SHOTS) { await page.evaluate(() => document.querySelector('.mmb-status').scrollIntoView({ block: 'center' })); await page.screenshot({ path: `${SHOTS}/cyc5-lead-backup-${tag}-1-named.jpg`, type: 'jpeg', quality: 70 }); }

    await pick('newer.json', bundle({ keys: keysUnknown }));
    await page.waitForSelector('#mmb-confirm', { state: 'visible', timeout: 15000 }).catch(() => null);
    const c = await page.evaluate(() => { const cf = document.getElementById('mmb-confirm'); return { shown: !!cf && !cf.hidden, text: cf ? cf.textContent : '' }; });
    check(`${tag}: Hub restore with one unknown key: the confirm step opens, lists the town save and names the skipped key`, c.shown && /town save/i.test(c.text) && /pixeltown-hoverboard-v9 \(not known by this version\)/.test(c.text), c.text.slice(0, 400));
    if (SHOTS) { await page.evaluate(() => document.getElementById('mmb-confirm').scrollIntoView({ block: 'center' })); await page.screenshot({ path: `${SHOTS}/cyc5-lead-backup-${tag}-2-unknown-skipped.jpg`, type: 'jpeg', quality: 70 }); }
    await page.click('#mmb-no');
    check(`${tag}: no page errors, 0 database attempts`, errors.length === 0 && db.attempts() === 0, JSON.stringify([errors, db.attempts()]));
    await ctx.close();
  }
  await browser.close();
  done();
})();
