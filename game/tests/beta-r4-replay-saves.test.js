// Round 4 QA replay (D5) of b14-r2-N01 (round-3 fix cced528), through the real Lantern Camp UI on a phone:
// a player downloads a backup, the file gains one entry this build does not know (a backup made by a newer build), and the player
// restores it. Expected: the confirm sheet opens and names the skipped entry, Confirm restores every known save, the unknown entry is
// never written. Before the fix the whole file was refused. Also: Cancel on the same file changes nothing.
// Proof run by D5: fails on the tree before round 3 (d267d0b: no confirm sheet, nothing restored), passes on the round-3 tip.
// Offline: blockDb, no chat, no Firebase writes. Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-r4-replay-saves.test.js
const fs = require('fs');
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const LS = require('./lib/load-scale');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const LANTERN = ORIGIN + '/game/games/mad-maze/lantern.html';
const TOWN_KEY = 'pixeltown-save-v1';
const FUTURE = 'pixeltown-zz-future-v9';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, acceptDownloads: true });
  const db = await blockDb(ctx);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(LANTERN);
  await page.evaluate((k) => { localStorage.clear(); localStorage.setItem(k, JSON.stringify({ resources: { wood: 5, stone: 2 }, bells: 120, name: 'ADMINr4' })); }, TOWN_KEY);
  await page.reload();
  await page.waitForSelector('#backup', { state: 'attached', timeout: LS.budget(15000) });
  await page.waitForTimeout(600);

  // 1. the player downloads a backup (real button, real file)
  await page.locator('#backup').scrollIntoViewIfNeeded();
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: LS.budget(15000) }), page.tap('#backup')]);
  const file = await dl.path();
  const bundle = JSON.parse(fs.readFileSync(file, 'utf8'));
  const names = Object.keys(bundle.keys || {});
  check('1. "Back up my progress" downloads a bundle that holds the town save', bundle.format === 'pixeltown-backup' && names.includes(TOWN_KEY), JSON.stringify({ format: bundle.format, v: bundle.v, names }));

  // 2. the same file as a newer build would write it: one more entry, and the town save differs from what is on the device
  const town = typeof bundle.keys[TOWN_KEY] === 'string' ? JSON.parse(bundle.keys[TOWN_KEY]) : bundle.keys[TOWN_KEY];
  town.resources.wood = 77;
  bundle.keys[TOWN_KEY] = typeof bundle.keys[TOWN_KEY] === 'string' ? JSON.stringify(town) : town;
  bundle.keys[FUTURE] = JSON.stringify({ made: 'by a newer build' });
  const upload = { name: 'pixeltown-backup-newer.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bundle)) };
  const seen = () => page.evaluate(() => { const c = document.getElementById('restore-confirm'); const open = !!c && !c.hidden && c.getClientRects().length > 0; return { open, text: open ? c.innerText : '', page: document.body.innerText }; });
  const wood = () => page.evaluate((k) => { try { return JSON.parse(localStorage.getItem(k)).resources.wood; } catch (e) { return null; } }, TOWN_KEY);

  // 3. Restore, then Cancel: nothing changes
  await page.setInputFiles('#restore', upload);
  const opened = await page.waitForFunction(() => { const c = document.getElementById('restore-confirm'); return c && !c.hidden && c.getClientRects().length > 0; }, null, { timeout: LS.budget(8000) }).then(() => true).catch(() => false);
  const s1 = await seen();
  check('3a. b14-r2-N01: a backup with one unknown entry opens the confirm sheet (it used to be refused outright)', opened, s1.page.split('\n').filter((l) => /backup|restore|unknown|newer|chang/i.test(l)).slice(-3).join(' / '));
  check('3b. the sheet says an entry was skipped and names it', /skip/i.test(s1.text) && s1.text.includes(FUTURE.slice(0, 20)), s1.text.replace(/\s+/g, ' ').slice(0, 300));
  const btn = await page.evaluate(() => ['restore-yes', 'restore-no'].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return { id, w: Math.round(r.width), h: Math.round(r.height), in: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth }; }));
  check('3c. Confirm and Cancel are on screen and at least 44 px tall on the phone', opened && btn.every((b) => b.in && b.h >= 44 && b.w >= 44), JSON.stringify(btn));
  if (opened) await page.tap('#restore-no');
  await page.waitForTimeout(300);
  check('3d. Cancel leaves the device save untouched (wood still 5) and writes no unknown entry', (await wood()) === 5 && await page.evaluate((k) => localStorage.getItem(k) === null, FUTURE));

  // 4. Restore again, Confirm
  await page.setInputFiles('#restore', []);
  await page.setInputFiles('#restore', upload);
  const opened2 = await page.waitForFunction(() => { const c = document.getElementById('restore-confirm'); return c && !c.hidden && c.getClientRects().length > 0; }, null, { timeout: LS.budget(8000) }).then(() => true).catch(() => false);
  if (opened2) await page.tap('#restore-yes');
  await page.waitForFunction((k) => { try { return JSON.parse(localStorage.getItem(k)).resources.wood === 77; } catch (e) { return false; } }, TOWN_KEY, { timeout: LS.budget(6000) }).catch(() => {});
  const after = await page.evaluate(([k, f]) => { let t = null; try { t = JSON.parse(localStorage.getItem(k)); } catch (e) { /* */ } return { wood: t && t.resources && t.resources.wood, stone: t && t.resources && t.resources.stone, bells: t && t.bells, future: localStorage.getItem(f), keys: Object.keys(localStorage).filter((x) => /future/.test(x)) }; }, [TOWN_KEY, FUTURE]);
  check('4a. Confirm restores the known saves from the file (wood 5 -> 77, the rest of the town save intact)', opened2 && after.wood === 77 && after.stone === 2 && after.bells === 120, JSON.stringify(after));
  check('4b. the unknown entry was never written to the device', after.future === null && after.keys.length === 0, JSON.stringify(after.keys));
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForTimeout(800);
  check('4c. the restored save survives a reload', (await wood()) === 77);
  check('no page errors', errors.length === 0, errors.join(' | '));
  check('no database traffic', db.attempts() === 0, String(db.attempts()));
  await ctx.close(); await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
