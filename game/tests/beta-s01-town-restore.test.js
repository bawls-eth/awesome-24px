// Beta S-01 (b14-03, P0): the Town "Restore" button validates the file. OFFLINE ONLY: blockDb + the Firebase SDK answered
// with an empty stub, entry through "Play offline"; never chats, never writes to Firebase.
//  1. A Lantern backup bundle restores ALL its keys (town save gets the bundle's town name/resources, not {format, keys}).
//  2. {"hello":1}: the stored save is byte-identical, the chat says nothing was changed, no reload.
//  3. An old town-only export (made by exportSave) still restores as before.
//  4. A 5 MB file / an array / null / invalid JSON: storage untouched, friendly message.
//  5. After a successful restore pixeltown-save-v1-prev holds the pre-restore raw string.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-s01-town-restore.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const SAVE_KEY = 'pixeltown-save-v1';
const PREV_KEY = 'pixeltown-save-v1-prev';
const SEED = { name: 'ADMINs01', species: 'ranger', frame: 0, resources: { wood: 3, stone: 1 }, museumCollection: [1], achievementsUnlocked: ['first-wood'], lifetimeStats: { wood: 3 } };

async function openTown(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, acceptDownloads: true });
  const db = await blockDb(ctx);
  await ctx.route(/gstatic\.com\/firebasejs\//, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* firebase SDK blocked by beta-s01 */' }));
  await ctx.route('**/main.js*', async (route) => {
    const resp = await route.fetch();
    const body = (await resp.text()).replace('const game = new Phaser.Game(config);', 'const game = window.__g = new Phaser.Game(config);');
    route.fulfill({ response: resp, body });
  });
  await ctx.addInitScript(() => {
    const o = Storage.prototype.setItem; window.__s01w = [];
    Storage.prototype.setItem = function (k, v) {
      if (k === 'pixeltown-save-v1' || k === 'pixeltown-save-v1-prev') window.__s01w.push({ k, restore: /commitRestore|restoreBundle|importSave/.test(String(new Error().stack)) });
      return o.call(this, k, v);
    };
  });
  await ctx.addInitScript((v) => { if (!sessionStorage.s01Seeded) { sessionStorage.s01Seeded = '1'; localStorage.setItem('pixeltown-save-v1', v); } }, JSON.stringify(SEED));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  return { ctx, page, db, errors };
}

async function join(page) {
  await page.goto(BASE);
  await page.waitForSelector('#name-input');
  if (!(await page.inputValue('#name-input'))) await page.fill('#name-input', 'ADMINs01');
  await page.click('button:has-text("Join Town")'); // offline: the SDK is stubbed, so this only offers 'Play offline'
  await page.waitForSelector('#join-offline-btn:not(.hidden)', { timeout: 15000 });
  await page.click('#join-offline-btn');
  await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 30000 });
  await page.waitForTimeout(800);
}

const freeze = (page) => page.evaluate(() => { window.__g.loop.sleep(); });
// every write of the save / safety copy, with whether it came from the Restore code path
const restoreWrites = (page) => page.evaluate(() => (window.__s01w || []).filter((w) => w.restore));
const raw = (page) => page.evaluate((k) => localStorage.getItem(k), SAVE_KEY);
async function restoreFile(page, name, body) {
  await page.setInputFiles('#save-import-input', { name, mimeType: 'application/json', buffer: Buffer.isBuffer(body) ? body : Buffer.from(body) });
}

(async () => {
  const browser = await chromium.launch();
  const { ctx, page, db, errors } = await openTown(browser);
  await join(page);
  await page.evaluate(() => { window.__s01Marker = 1; });
  // The Town's own timed writers (weather, dailies, quests...) run on the Phaser loop and may write the save at any moment.
  // Sleep the loop while a check compares raw storage, so only what the Restore itself does can change it (deterministic).
  await freeze(page);

  // ---- 2 + 4: files that are not a save change nothing ----
  const before = await raw(page);
  const bad = [
    ['hello.json', '{"hello":1}'],
    ['array.json', '[1,2,3]'],
    ['null.json', 'null'],
    ['broken.json', '{"name": "x", '],
    ['huge.json', Buffer.alloc(5 * 1024 * 1024, 0x20)],
  ];
  for (const [name, body] of bad) {
    const lines = await page.evaluate(() => document.querySelectorAll('#chat-log .chat-line').length);
    await restoreFile(page, name, body);
    await page.waitForFunction((n) => document.querySelectorAll('#chat-log .chat-line').length > n, lines, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1100); // longer than the 800 ms reload delay of a successful restore
    check(`[${name}] stored town save is byte-identical`, (await raw(page)) === before);
    check(`[${name}] the newest chat line says nothing was changed`, await page.evaluate(() => { const l = [...document.querySelectorAll('#chat-log .chat-line')].pop(); return !!l && l.textContent.includes('Nothing was changed'); }));
    check(`[${name}] page did not reload`, await page.evaluate(() => window.__s01Marker === 1));
  }
  check('the Restore code wrote nothing for the refused files', (await restoreWrites(page)).length === 0, JSON.stringify(await restoreWrites(page)));
  check('no safety copy written by refused files', (await page.evaluate((k) => localStorage.getItem(k), PREV_KEY)) === null);

  // ---- 3: an old town-only export (made by today's exportSave) still restores ----
  // R4 O-04 changed exportSave to the full bundle (checked in beta-r4-o04-town-hub-backup); the old town-only file is what the
  // pre-R4 exportSave wrote: JSON.stringify(loadSave(), null, 2). Built here the same way so old files on players' disks stay covered.
  const exported = JSON.stringify(JSON.parse(await raw(page)), null, 2);
  const file = JSON.parse(exported);
  await page.evaluate(() => { const t = window.__g.scene.getScene('Town'); t.gainResource('wood', 4, t.localBody.x, t.localBody.y); });
  const preRestore = await raw(page);
  check('gathering after the export changed the stored wood', JSON.parse(preRestore).resources.wood === file.resources.wood + 4);
  await Promise.all([page.waitForEvent('load', { timeout: 15000 }), restoreFile(page, 'town.json', exported)]);
  await page.waitForTimeout(500);
  const afterOld = JSON.parse(await raw(page));
  check('[town file] name restored', afterOld.name === file.name, afterOld.name);
  check('[town file] resources equal the file', JSON.stringify(afterOld.resources) === JSON.stringify(file.resources), JSON.stringify(afterOld.resources));
  check('[town file] museum + achievements equal the file', JSON.stringify(afterOld.museumCollection) === JSON.stringify(file.museumCollection) && JSON.stringify(afterOld.achievementsUnlocked) === JSON.stringify(file.achievementsUnlocked));
  // ---- 5: safety copy ----
  check('[prev] pixeltown-save-v1-prev holds the pre-restore raw save', (await page.evaluate((k) => localStorage.getItem(k), PREV_KEY)) === preRestore);

  // ---- 1: a Lantern bundle restores every key ----
  await join(page);
  await freeze(page);
  const bundle = {
    format: 'pixeltown-backup', v: 2,
    keys: {
      'pixeltown-save-v1': JSON.stringify({ name: 'ADMINs01b', species: 'ranger', frame: 0, resources: { wood: 77, stone: 5 }, achievementsUnlocked: ['first-wood'] }),
      'pixeltown-realm-v1': JSON.stringify({ v: 1, s01: 42 }),
      'pixeltown-mm-v1': JSON.stringify({ v: 1, heroes: [], stash: [] }),
    },
  };
  let dialogText = '';
  page.once('dialog', (d) => { dialogText = d.message(); d.accept(); });
  const preBundle = await raw(page);
  await Promise.all([page.waitForEvent('load', { timeout: 20000 }), restoreFile(page, 'backup.json', JSON.stringify(bundle))]);
  await page.waitForTimeout(500);
  const town = JSON.parse(await raw(page));
  check('[bundle] confirm listed what will be replaced', dialogText.includes('town save') && dialogText.includes('Realm progress'), dialogText);
  check('[bundle] town save has the bundle town name + resources', town.name === 'ADMINs01b' && town.resources && town.resources.wood === 77, JSON.stringify(town).slice(0, 200));
  check('[bundle] town save is not the bundle envelope', !('format' in town) && !('keys' in town));
  const realm = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('pixeltown-realm-v1')); } catch (e) { return null; } });
  check('[bundle] the other keys were written (realm)', realm && realm.s01 === 42, JSON.stringify(realm));
  check('[bundle] the other keys were written (heroes)', typeof (await page.evaluate(() => localStorage.getItem('pixeltown-mm-v1'))) === 'string');
  check('[bundle] prev copy is the pre-bundle save', (await page.evaluate((k) => localStorage.getItem(k), PREV_KEY)) === preBundle);
  await page.waitForSelector('#name-input');
  check('[bundle] join card after reload carries the restored name', (await page.inputValue('#name-input')) === 'ADMINs01b');

  // ---- cancel: nothing changes ----
  await join(page);
  await freeze(page);
  const preCancel = await raw(page);
  page.once('dialog', (d) => d.dismiss());
  await restoreFile(page, 'backup.json', JSON.stringify(bundle));
  await page.waitForFunction(() => [...document.querySelectorAll('#chat-log .chat-line')].some((l) => l.textContent.includes('cancelled')), null, { timeout: 15000 }).catch(() => {});
  check('[cancel] storage untouched after Cancel', (await raw(page)) === preCancel);

  check('no page errors', errors.length === 0, errors.join(' | '));
  check('no database traffic', db.attempts() === 0, JSON.stringify([db.http, db.ws]));
  await ctx.close();
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
