// SV3: Lantern restore of the one-time pre-gear snapshot (F14) and soulbound-safe legacy import (F17).
// Serve the repo root:  python3 -m http.server 9071 &
// Run: BASE=http://localhost:9071/game/index.html NODE_PATH=$(npm root -g) node game/tests/lantern-backup-restore.test.js
// Checks: the row shows only when a snapshot exists; restore shows a plan (counts) and needs Confirm, never automatic; the old save comes back
// byte-identical; an over-1 MB bundle is never snapshotted; deleting needs a second tap and only appears after a normal download; hostile
// snapshots never run markup or write; legacy import keeps T11+ in the Realm and says so; phone 390x844 targets >= 44 px; 0 DB requests; clean console.
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const B = require('../shared/mm-backup.js');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL_ = ORIGIN + '/game/games/mad-maze/lantern.html?test=1&bdate=2026-11-21';
const SAVE = 'pixeltown-save-v1', MM = 'pixeltown-mm-v1', PRE = B.PREGEAR_KEY, NOTE = 'pixeltown-backupnote-v1';

// An old gear-less town save (key order and spacing as main.js writes it) and the snapshot MMBackup takes of it.
const OLD_SAVE = JSON.stringify({ name: 'Bo', species: 'cat', realm: { level: 6, xp: 40, shards: 12, items: [{ n: 1, id: 'sparkwand', r: 1 }, { n: 2, id: 'luckring', r: 0 }], nextUid: 3 } });
const JAM = '{"offset":4}';
function memStore(init) { const m = Object.assign({}, init); return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, m }; }
const snapStore = memStore({ [SAVE]: OLD_SAVE, 'pixeltown-jam-v1': JAM });
const SNAP_RESULT = B.snapshotPregear(snapStore);
const SNAP = JSON.stringify(Object.assign(JSON.parse(snapStore.m[PRE]), { at: Date.UTC(2026, 10, 20, 9) })); // fixed day, before ?bdate
const SNAP_DAY = new Date(JSON.parse(SNAP).at).toISOString().slice(0, 10);
const GEARED = JSON.stringify({ name: 'Bo', species: 'cat', realm: { gv: 1, level: 9, xp: 0, shards: 3, items: [{ n: 1, id: 'sparkwand', r: 1, t: 6 }, { n: 2, id: 'luckring', r: 0 }, { n: 3, id: 'quickwand', r: 2, t: 8, a: 99 }], nextUid: 4 } });

async function open(browser, seed, viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1000, height: 800 }, acceptDownloads: true });
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  const errors = [], dialogs = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((s) => { localStorage.clear(); Object.keys(s).forEach((k) => localStorage.setItem(k, s[k])); }, seed || {});
  await page.goto(URL_);
  await page.waitForSelector('#heroes', { state: 'attached' });
  return { ctx, page, errors, dialogs, db };
}
const ls = (page, k) => page.evaluate((key) => localStorage.getItem(key), k);
const all = (page) => page.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return JSON.stringify(o, Object.keys(o).sort()); });
const vis = (page, sel) => page.isVisible(sel);
const status = (page) => page.textContent('#status');

(async () => {
  check('setup: the old save was snapshotted in Node', SNAP_RESULT === 'written' && typeof SNAP === 'string');
  const browser = await chromium.launch();
  const dbs = [];

  // 1. No snapshot: no row.
  let s = await open(browser, { [SAVE]: OLD_SAVE });
  dbs.push(s.db);
  check('1: without a snapshot the pre-gear row is hidden', !(await vis(s.page, '#pregear-row')) && !(await vis(s.page, '#pregear-restore')));
  check('1: console clean', s.errors.length === 0, s.errors.join(' | '));
  await s.ctx.close();

  // 2. Snapshot present, save has since gained gear. Plan first, never automatic, Confirm required, byte-identical round trip.
  s = await open(browser, { [SAVE]: GEARED, 'pixeltown-jam-v1': JAM, [PRE]: SNAP });
  dbs.push(s.db);
  check('2: the row shows when the snapshot exists, with its date', (await vis(s.page, '#pregear-restore')) && (await s.page.textContent('#pregear-note')).indexOf(SNAP_DAY) >= 0);
  check('2: never restored automatically on load', (await ls(s.page, SAVE)) === GEARED && !(await vis(s.page, '#restore-confirm')));
  check('2: delete is not offered before a normal download', !(await vis(s.page, '#pregear-drop')));
  const before = await all(s.page);
  await s.page.click('#pregear-restore');
  const sum = await s.page.textContent('#restore-summary');
  const items = await s.page.$$eval('#restore-list li', (l) => l.map((x) => x.textContent));
  check('2: the plan is shown in the confirm panel', await vis(s.page, '#restore-confirm'));
  check('2: plan summary has the counts (1 save changes, 1 same, Realm pack 3 now / 2 in snapshot)',
    /1 save would change/.test(sum) && /1 already the same/.test(sum) && /0 would be added/.test(sum) && /3 items now, 2 items in the snapshot/.test(sum) && sum.indexOf(SNAP_DAY) >= 0, sum);
  check('2: the list marks what changes', items.some((t) => /town save/.test(t) && /changes/.test(t)) && items.some((t) => /Jam save/.test(t) && /already the same/.test(t)), JSON.stringify(items));
  check('2: showing the plan wrote nothing', (await all(s.page)) === before);
  await s.page.click('#restore-no');
  check('2: Cancel leaves everything unchanged', (await all(s.page)) === before && !(await vis(s.page, '#restore-confirm')) && /cancelled/i.test(await status(s.page)));
  await s.page.click('#pregear-restore');
  await s.page.keyboard.press('Escape');
  check('2: Escape also cancels without writing', (await all(s.page)) === before);
  await s.page.click('#pregear-restore');
  await s.page.click('#restore-yes');
  check('2: Confirm restores the old save byte-identically', (await ls(s.page, SAVE)) === OLD_SAVE && (await ls(s.page, 'pixeltown-jam-v1')) === JAM, await ls(s.page, SAVE));
  check('2: status says it was restored; the snapshot is kept', /Restored 2 saved items/.test(await status(s.page)) && (await ls(s.page, PRE)) === SNAP);
  check('2: no dialogs, console clean', s.dialogs.length === 0 && s.errors.length === 0, s.errors.join(' | '));
  await s.ctx.close();

  // 3. Over-quota snapshot is skipped in a real browser storage, and a snapshot written earlier still works with a bundle under 1 MB.
  s = await open(browser, { [SAVE]: JSON.stringify({ name: 'Big', pad: 'x'.repeat(1200000) }) });
  dbs.push(s.db);
  const big = await s.page.evaluate(() => MMBackup.snapshotPregear(localStorage));
  check('3: a 1.2 MB bundle is not snapshotted ("too-big"), no key written, no row', big === 'too-big' && (await ls(s.page, PRE)) === null && !(await vis(s.page, '#pregear-row')), big);
  const small = await s.page.evaluate(() => { localStorage.setItem('pixeltown-save-v1', '{"name":"Small"}'); return MMBackup.snapshotPregear(localStorage); });
  check('3: a small gear-less save is snapshotted once', small === 'written' && (await s.page.evaluate(() => MMBackup.snapshotPregear(localStorage))) === 'exists');
  await s.ctx.close();

  // 4. Delete the snapshot: offered only after a normal download, needs a second tap, Keep backs out.
  s = await open(browser, { [SAVE]: GEARED, [PRE]: SNAP });
  dbs.push(s.db);
  const dl = s.page.waitForEvent('download');
  await s.page.click('#backup'); await dl;
  check('4: after a normal download the delete action appears', await vis(s.page, '#pregear-drop'));
  await s.page.click('#pregear-drop');
  check('4: the first tap only arms (snapshot still there, confirm wording)', (await ls(s.page, PRE)) === SNAP && /Tap again/.test(await s.page.textContent('#pregear-drop')) && (await vis(s.page, '#pregear-keep')));
  await s.page.click('#pregear-keep');
  check('4: Keep it backs out', (await ls(s.page, PRE)) === SNAP && !(await vis(s.page, '#pregear-keep')) && /Delete the old snapshot/.test(await s.page.textContent('#pregear-drop')));
  await s.page.click('#pregear-drop'); await s.page.click('#pregear-drop');
  check('4: the second tap deletes only the snapshot; the row hides', (await ls(s.page, PRE)) === null && (await ls(s.page, SAVE)) === GEARED && !(await vis(s.page, '#pregear-row')) && /deleted/.test(await status(s.page)));
  check('4: console clean', s.errors.length === 0, s.errors.join(' | '));
  await s.ctx.close();

  // 4b. A backup note dated on or after the snapshot also counts as "a normal download happened"; an older one does not.
  s = await open(browser, { [SAVE]: GEARED, [PRE]: SNAP, [NOTE]: JSON.stringify({ v: 1, at: '2026-11-21' }) });
  dbs.push(s.db);
  const noteShows = await vis(s.page, '#pregear-drop');
  await s.ctx.close();
  s = await open(browser, { [SAVE]: GEARED, [PRE]: SNAP, [NOTE]: JSON.stringify({ v: 1, at: '2000-01-01' }) });
  dbs.push(s.db);
  check('4b: delete is offered by a newer backup note, not by an older one', SNAP_DAY === '2026-11-20' && noteShows && !(await vis(s.page, '#pregear-drop')));
  await s.ctx.close();

  // 5. Hostile snapshots: refused with a message, nothing written, markup never runs.
  const hostile = [
    'not json{',
    '[]',
    JSON.stringify({ format: 'pixeltown-backup', v: 2, keys: { 'pixeltown-evil': '<img src=x onerror="window.__x=1">' } }),
    '{"format":"pixeltown-backup","v":2,"keys":{"__proto__":"{}"}}',
    JSON.stringify({ format: 'pixeltown-backup', v: 2, keys: { [SAVE]: '[1,2]' } })
  ];
  for (const h of hostile) {
    s = await open(browser, { [SAVE]: GEARED, [PRE]: h });
    dbs.push(s.db);
    const b4 = await all(s.page);
    await s.page.click('#pregear-restore');
    const st = await status(s.page);
    check('5: hostile snapshot refused, nothing written: ' + h.slice(0, 40), !(await vis(s.page, '#restore-confirm')) && (await all(s.page)) === b4 && /nothing was changed|damaged|not valid|does not know/.test(st) &&
      s.errors.length === 0 && s.dialogs.length === 0, st + ' ' + s.errors.join('|'));
    await s.ctx.close();
  }
  // A valid snapshot whose town save holds markup: shown as text only, restored as data.
  const evilSave = JSON.stringify({ name: '<img src=x onerror="window.__x=1">', realm: { items: [] } });
  const evilStore = memStore({ [SAVE]: evilSave }); B.snapshotPregear(evilStore);
  s = await open(browser, { [SAVE]: GEARED, [PRE]: evilStore.m[PRE] });
  dbs.push(s.db);
  await s.page.click('#pregear-restore');
  const xss = await s.page.evaluate(() => ({ x: window.__x, imgs: document.querySelectorAll('#backup-card img').length }));
  check('5: markup inside a snapshot is never rendered or run', xss.x === undefined && xss.imgs === 0, JSON.stringify(xss));
  await s.page.click('#restore-yes');
  check('5: and it restores as plain data, byte-identical', (await ls(s.page, SAVE)) === evilSave && (await s.page.evaluate(() => window.__x)) === undefined);
  await s.ctx.close();

  // 6. F17: legacy import keeps soulbound gear in the Realm and says so.
  const SB_SAVE = JSON.stringify({ name: 'Bo', realm: { level: 8, xp: 0, gv: 1, items: [{ n: 1, id: 'sparkwand', r: 2, t: 11, a: 5 }, { n: 2, id: 'luckring', r: 1, t: 12 }, { n: 3, id: 'heartcharm', r: 0, t: 4 }] } });
  s = await open(browser, { [SAVE]: SB_SAVE });
  dbs.push(s.db);
  await s.page.click('#import-yes');
  const prof = JSON.parse(await ls(s.page, MM));
  const lr = prof.heroes.find((h) => h.id === 'legacy-ranger');
  check('6: the Legacy Ranger gets only the non-soulbound item', lr && lr.items.length === 1 && lr.items[0].t === 4, JSON.stringify(lr));
  check('6: the Lantern says 2 soulbound items stayed in the Realm', /2 soulbound items \(T11\+\) stayed in the Realm/.test(await status(s.page)), await status(s.page));
  check('6: the old save is untouched and nothing extra is saved', (await ls(s.page, SAVE)) === SB_SAVE && !/skippedSoulbound/.test(await ls(s.page, MM)));
  check('6: no T11+ anywhere in the Lantern profile', !JSON.stringify(prof).match(/"t":1[12]\b/));
  await s.ctx.close();

  // 7. Phone 390x844: targets >= 44 px, no horizontal scroll, panel readable.
  s = await open(browser, { [SAVE]: GEARED, [PRE]: SNAP, [NOTE]: JSON.stringify({ v: 1, at: '2026-11-21' }) }, { width: 390, height: 844 });
  dbs.push(s.db);
  await s.page.click('#pregear-restore');
  const ph = await s.page.evaluate(() => {
    const ids = ['pregear-restore', 'restore-yes', 'restore-no', 'backup'];
    if (!document.getElementById('pregear-drop').hidden) ids.push('pregear-drop');
    const r = ids.map((id) => { const b = document.getElementById(id).getBoundingClientRect(); return { id, h: b.height, w: b.width, right: b.right }; });
    return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, r };
  });
  check('7: phone: every pre-gear / confirm button is at least 44x44 and on screen', ph.r.every((b) => b.h >= 44 && b.w >= 44 && b.right <= ph.cw + 1), JSON.stringify(ph));
  check('7: phone: no horizontal scroll', ph.sw <= ph.cw, JSON.stringify(ph));
  await s.page.click('#restore-no');
  if (await vis(s.page, '#pregear-drop')) {
    await s.page.click('#pregear-drop');
    const k = await s.page.evaluate(() => { const b = document.getElementById('pregear-keep').getBoundingClientRect(); return { h: b.height, w: b.width }; });
    check('7: phone: the Keep it button is at least 44x44', k.h >= 44 && k.w >= 44, JSON.stringify(k));
  }
  check('7: phone: console clean', s.errors.length === 0, s.errors.join(' | '));
  await s.ctx.close();

  check('8: 0 database requests across every page', dbs.every((d) => d.count() === 0), dbs.map((d) => d.count()).join(','));
  await browser.close();
  done();
})();
