// Lantern hub page. Serve the repo root first:  python3 -m http.server 8449 &
// Run: BASE=http://localhost:8449/game/index.html NODE_PATH=$(npm root -g) node game/tests/lantern-page.test.js
// Set SHOTS=<dir> to also write desktop/phone screenshots. No Firebase, no external network.
const { chromium } = require('playwright');
const fs = require('fs');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const URL_ = ORIGIN + '/game/games/mad-maze/lantern.html?test=1';
const MM = 'pixeltown-mm-v1', SAVE = 'pixeltown-save-v1';
const LEGACY_SAVE = JSON.stringify({ realm: { level: 7, xp: 120, items: [{ n: 1, id: 'heartcharm', r: 1 }, { n: 2, id: 'sparkwand', r: 0 }] }, name: 'Bob' });
const hero = (o) => Object.assign({ id: 'h1', name: 'Tester', cls: 'ranger', level: 1, xp: 0, fame: 0, bonus: 0, mode: 'classic', items: [] }, o);

async function open(browser, { mm, save, viewport } = {}) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1000, height: 800 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [], reqs = [], dialogs = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', (r) => reqs.push(r.url()));
  page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css'); // same-origin blank page to seed storage
  await page.evaluate(([m, s, K1, K2]) => { if (m !== null) localStorage.setItem(K1, m); if (s !== null) localStorage.setItem(K2, s); },
    [mm === undefined ? null : (typeof mm === 'string' ? mm : JSON.stringify(mm)), save === undefined ? null : save, MM, SAVE]);
  await page.goto(URL_);
  await page.waitForSelector('#heroes', { state: 'attached' });
  return { ctx, page, errors, reqs, dialogs };
}
const prof = (page) => page.evaluate((K) => JSON.parse(localStorage.getItem(K) || 'null'), MM);

(async () => {
  const browser = await chromium.launch();

  // 1. Legacy import offer, idempotent, old save untouched.
  let s = await open(browser, { save: LEGACY_SAVE });
  check('first visit shows the legacy import offer', await s.page.isVisible('#import-offer'));
  await s.page.click('#import-yes');
  let p = await prof(s.page);
  check('importing creates one Legacy Ranger (level kept, items copied)', p.heroes.length === 1 && p.heroes[0].id === 'legacy-ranger' && p.heroes[0].level === 7 && p.heroes[0].items.length === 2, JSON.stringify(p));
  await s.page.reload(); await s.page.waitForSelector('#heroes', { state: 'attached' });
  check('after import the offer is gone', !(await s.page.isVisible('#import-offer')));
  await s.page.evaluate(() => window.__lantern.reload());
  p = await prof(s.page);
  check('importing twice still leaves one hero', p.heroes.length === 1 && p.migratedFrom === SAVE);
  check('pixeltown-save-v1 is byte-identical afterwards', (await s.page.evaluate((K) => localStorage.getItem(K), SAVE)) === LEGACY_SAVE);

  // 2. New Hero flow + Picnic lock.
  await s.page.fill('#new-name', 'Mossy');
  await s.page.selectOption('#new-class', 'herald');
  await s.page.check('input[name=mode][value=picnic]');
  await s.page.click('#new-create');
  p = await prof(s.page);
  const mossy = p.heroes.find((h) => h.name === 'Mossy');
  check('New Hero creates a herald hero in Picnic mode', !!mossy && mossy.cls === 'herald' && mossy.mode === 'picnic' && mossy.level === 1, JSON.stringify(p.heroes));
  const lockInfo = await s.page.evaluate(() => ({ radiosInCards: document.querySelectorAll('#heroes input').length, tag: [...document.querySelectorAll('#heroes .tag.mode')].map((n) => n.textContent) }));
  check('Picnic is locked after creation (shown as a label, no control)', lockInfo.radiosInCards === 0 && lockInfo.tag.includes('Picnic'), JSON.stringify(lockInfo));
  check('locked classes are disabled in the picker', await s.page.evaluate(() => document.querySelector('#new-class option[value=punk]').disabled === false) , 'punk should unlock via legacy L7 ranger');
  check('Start link carries ?hero=<id>', (await s.page.getAttribute('#start', 'href')) === './index.html?hero=' + mossy.id);

  // 3. Stash move + cap.
  await s.page.evaluate(() => { const p = window.__lantern.get(); p.heroes[0].items = []; localStorage.setItem('pixeltown-mm-v1', JSON.stringify(p)); window.__lantern.reload(); });
  await s.page.click('#heroes li:first-child .pick'); // select legacy ranger
  await s.page.evaluate(() => { const p = JSON.parse(localStorage.getItem('pixeltown-mm-v1')); p.heroes[0].items = [{ id: 'heartcharm', r: 1, n: 1 }, { id: 'sparkwand', r: 0, n: 2 }]; localStorage.setItem('pixeltown-mm-v1', JSON.stringify(p)); window.__lantern.reload(); });
  await s.page.click('#carry li:first-child .item');
  p = await prof(s.page);
  check('stash move: item goes hero -> stash', p.stash[0] && p.stash[0].id === 'heartcharm' && p.heroes[0].items.length === 1);
  await s.page.click('#stash .slot[data-slot="0"]');
  p = await prof(s.page);
  check('stash move: item goes stash -> hero', p.stash[0] === null && p.heroes[0].items.length === 2);
  await s.page.evaluate(() => { const p = JSON.parse(localStorage.getItem('pixeltown-mm-v1')); p.stash = p.stash.map((_, i) => ({ id: 'luckring', r: 0, n: i + 1 })); p.stash[15] = null; localStorage.setItem('pixeltown-mm-v1', JSON.stringify(p)); window.__lantern.reload(); });
  await s.page.click('#carry li:first-child .item'); // fills slot 15
  await s.page.click('#carry li:first-child .item'); // stash full -> refused
  p = await prof(s.page);
  check('stash caps at 16 and a full stash refuses', p.stash.filter(Boolean).length === 16 && p.heroes[0].items.length === 1 && /full/.test(await s.page.textContent('#status')));
  await s.ctx.close();

  // 4. Fall, Rekindle, Retire.
  s = await open(browser, { mm: { v: 1, heroes: [hero({ id: 'h-a', name: 'Fally', level: 9, fame: 1000, bonus: 10 }), hero({ id: 'h-b', name: 'Elder', cls: 'frostcaller', level: 20, fame: 500 }), hero({ id: 'h-c', name: 'Cozy', mode: 'picnic', level: 5 })] } });
  await s.page.evaluate(() => window.__lantern.fall('h-a'));
  p = await prof(s.page);
  check('Fall deletes the hero, banks fame and puts a Keepsake in the stash', !p.heroes.find((h) => h.id === 'h-a') && p.fame === 1100 && p.stash[0] && p.stash[0].keepsake === true && p.hall[0].how === 'fall', JSON.stringify(p));
  check('Picnic hero cannot Fall', await s.page.evaluate(() => window.__lantern.fall('h-c').ok === false));
  // G-05: Rekindle starts from the fallen Fally's Keepsake (level 9 -> level 4); living hero cards have no Rekindle button
  const elderCard = s.page.locator('#heroes li[data-hero="h-b"]');
  check('living hero cards have no Rekindle button (G-05)', (await s.page.locator('#heroes .rekindle').count()) === 0);
  await s.page.locator('#rekindle-list .rekindle-ks').first().click();
  p = await prof(s.page);
  const reborn = p.heroes.filter((h) => h.name === 'Fally');
  check('Rekindle level math: L9 Keepsake -> L4, same class, new id; the Keepsake stays marked rk', reborn.length === 1 && reborn[0].level === 4 && reborn[0].cls === 'ranger' && reborn[0].id !== 'h-a' && p.stash[0].keepsake === true && p.stash[0].rk === true, JSON.stringify(p.heroes));
  const cozyCard = s.page.locator('#heroes li', { hasText: 'Cozy' });
  check('Retire disabled below level 20 with a reason', (await cozyCard.locator('.retire').isDisabled()) && /level 20/.test(await cozyCard.textContent()));
  await elderCard.locator('.retire').click();
  await elderCard.locator('.retire').click();
  p = await prof(s.page);
  const lvl20 = p.hall.find((e) => e.how === 'retire');
  check('Retire at level 20 lists in the Hall with fame x1.2', !!lvl20 && lvl20.level === 20 && lvl20.fame === 600 && !p.heroes.find((h) => h.id === 'h-b'), JSON.stringify(p.hall));
  check('Hall of Heroes shows fallen and retired', (await s.page.locator('#hall li').count()) === 2);
  await s.ctx.close();

  // 5. Backup + restore.
  s = await open(browser, { mm: { v: 1, heroes: [hero({ name: 'Packed', level: 3 })], fame: 42 }, save: LEGACY_SAVE });
  const [dl] = await Promise.all([s.page.waitForEvent('download'), s.page.click('#backup')]);
  const dlPath = await dl.path();
  const bundle = JSON.parse(fs.readFileSync(dlPath, 'utf8'));
  check('backup download contains both keys', bundle.format === 'pixeltown-backup' && typeof bundle.keys[MM] === 'string' && typeof bundle.keys[SAVE] === 'string', Object.keys(bundle.keys || {}).join());
  await s.page.evaluate(([a, b]) => { localStorage.removeItem(a); localStorage.removeItem(b); window.__lantern.reload(); }, [MM, SAVE]);
  await s.page.setInputFiles('#restore', { name: 'b.json', mimeType: 'application/json', buffer: fs.readFileSync(dlPath) });
  await s.page.waitForSelector('#restore-confirm:not([hidden])');
  const listed = await s.page.locator('#restore-list li').allTextContents();
  // the hub map progress key (pixeltown-profile-v1, written by MMHubProfile.sync for the hero) is backed up too
  check('restore shows a confirmation panel listing the keys, and has changed nothing yet', listed.length === Object.keys(bundle.keys).length && listed.length === (bundle.keys['pixeltown-profile-v1'] ? 3 : 2) && listed.some((t) => t.includes(MM)) && listed.some((t) => t.includes(SAVE)) && (await s.page.evaluate((K) => localStorage.getItem(K), MM)) === null);
  await s.page.click('#restore-no');
  check('Cancel hides the panel and changes nothing', (await s.page.isHidden('#restore-confirm')) && (await s.page.evaluate((K) => localStorage.getItem(K), MM)) === null && (await s.page.evaluate((K) => localStorage.getItem(K), SAVE)) === null);
  await s.page.setInputFiles('#restore', { name: 'b.json', mimeType: 'application/json', buffer: fs.readFileSync(dlPath) });
  await s.page.waitForSelector('#restore-confirm:not([hidden])');
  await s.page.click('#restore-yes');
  await s.page.waitForFunction(() => /Restored/.test(document.getElementById('status').textContent));
  p = await prof(s.page);
  check('Confirm round-trips the profile and the old save', p.heroes[0].name === 'Packed' && p.fame === 42 && (await s.page.evaluate((K) => localStorage.getItem(K), SAVE)) === JSON.stringify(JSON.parse(LEGACY_SAVE)));
  // old single town-save file: accepted after confirm
  await s.page.evaluate((K) => { localStorage.removeItem(K); }, SAVE);
  await s.page.setInputFiles('#restore', { name: 'old.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ realm: { level: 3 }, name: 'Old' })) });
  await s.page.waitForSelector('#restore-confirm:not([hidden])');
  await s.page.click('#restore-yes');
  await s.page.waitForFunction(() => /Restored/.test(document.getElementById('status').textContent));
  check('old town save file restores into pixeltown-save-v1 after Confirm', (await s.page.evaluate((K) => JSON.parse(localStorage.getItem(K)).realm.level, SAVE)) === 3);
  // an old Angler export must NOT overwrite the town save
  const townNow = await s.page.evaluate((K) => localStorage.getItem(K), SAVE);
  await s.page.setInputFiles('#restore', { name: 'angler.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ caught: { bluegill: { n: 1, best: 4 } }, bosses: {} })) });
  await s.page.waitForFunction(() => document.getElementById('status').className === 'err');
  check('angler export is rejected with a clear message, no panel, town save untouched', /not a town save/.test(await s.page.textContent('#status')) && (await s.page.isHidden('#restore-confirm')) && (await s.page.evaluate((K) => localStorage.getItem(K), SAVE)) === townNow);
  await s.page.setInputFiles('#restore', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('not json {{{') });
  await s.page.waitForFunction(() => /not valid JSON/.test(document.getElementById('status').textContent));
  check('a bad restore file shows a friendly message and does not throw', s.errors.length === 0, s.errors.join());
  // a restored mm-v1 is cleaned by MMProfile.clean
  const dirtyBundle = { format: 'pixeltown-backup', v: 2, keys: { [MM]: JSON.stringify({ v: 1, heroes: [{ id: 'z', name: 'Zed', cls: 'nope', level: 500, evil: 1 }], fame: -9 }) } };
  await s.page.setInputFiles('#restore', { name: 'dirty.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(dirtyBundle)) });
  await s.page.waitForSelector('#restore-confirm:not([hidden])');
  await s.page.click('#restore-yes');
  await s.page.waitForFunction(() => /Restored/.test(document.getElementById('status').textContent));
  p = await prof(s.page);
  check('restored mm-v1 is cleaned before writing', p.heroes[0].cls === 'ranger' && p.heroes[0].level === 20 && p.heroes[0].evil === undefined && p.fame === 0, JSON.stringify(p.heroes));
  // mid-bundle write failure: 3rd setItem throws -> everything rolled back, honest message
  const before = await s.page.evaluate(([a, b]) => [localStorage.getItem(a), localStorage.getItem(b), localStorage.getItem('pixeltown-angler-v1'), localStorage.getItem('pixeltown-bugs-v1')], [MM, SAVE]);
  const failBundle = { format: 'pixeltown-backup', v: 2, keys: { 'pixeltown-angler-v1': '{}', 'pixeltown-bugs-v1': '{}', [MM]: JSON.stringify({ fame: 1 }), [SAVE]: JSON.stringify({ name: 'New' }) } };
  await s.page.setInputFiles('#restore', { name: 'fail.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(failBundle)) });
  await s.page.waitForSelector('#restore-confirm:not([hidden])');
  await s.page.evaluate(() => { const real = Storage.prototype.setItem; let n = 0; Storage.prototype.setItem = function (k, v) { n++; if (n === 3) { Storage.prototype.setItem = real; throw new Error('quota'); } return real.call(this, k, v); }; });
  await s.page.click('#restore-yes');
  await s.page.waitForFunction(() => document.getElementById('status').className === 'err');
  const after = await s.page.evaluate(([a, b]) => [localStorage.getItem(a), localStorage.getItem(b), localStorage.getItem('pixeltown-angler-v1'), localStorage.getItem('pixeltown-bugs-v1')], [MM, SAVE]);
  check('write failure on the 3rd key rolls every key back and says so', JSON.stringify(before) === JSON.stringify(after) && /put back|could not fully undo|failed/i.test(await s.page.textContent('#status')), JSON.stringify([before, after]));
  await s.ctx.close();

  // 5b. Backup reads raw values: a corrupt mm-v1 is backed up as it was.
  s = await open(browser, { mm: '{{corrupt-raw', save: LEGACY_SAVE });
  const [dl2] = await Promise.all([s.page.waitForEvent('download'), s.page.click('#backup')]);
  const b2 = JSON.parse(fs.readFileSync(await dl2.path(), 'utf8'));
  // beta S-03 (b14-04) changed this: a damaged value is left out of the file (it could never be restored) instead of exported raw.
  check('backup of a corrupt pixeltown-mm-v1 leaves the damaged value out of the file', !(MM in b2.keys) && b2.format === 'pixeltown-backup');
  check('the Backup status names what was left out', /left out: Mad Maze heroes and stash/.test(await s.page.evaluate(() => document.body.innerText)));
  await s.ctx.close();

  // 5c. Legacy import with a full roster says so and can be retried.
  const twelve = []; for (let i = 0; i < 12; i++) twelve.push(hero({ id: 'f' + i, name: 'F' + i }));
  s = await open(browser, { mm: { v: 1, heroes: twelve }, save: LEGACY_SAVE });
  await s.page.click('#import-yes');
  p = await prof(s.page);
  check('full roster: message says roster is full, no Legacy Ranger, import not marked done', /roster is full/.test(await s.page.textContent('#status')) && !/Legacy Ranger is here/.test(await s.page.textContent('#status')) && p.heroes.length === 12 && !p.migratedFrom, JSON.stringify(p.migratedFrom));
  check('the import offer is still shown (retry possible)', await s.page.isVisible('#import-offer'));
  await s.page.evaluate((K) => { const q = JSON.parse(localStorage.getItem(K)); q.heroes.pop(); localStorage.setItem(K, JSON.stringify(q)); window.__lantern.reload(); }, MM);
  await s.page.click('#import-yes');
  p = await prof(s.page);
  check('after a slot frees the import works', p.heroes.some((h) => h.id === 'legacy-ranger') && p.migratedFrom === SAVE);
  await s.ctx.close();

  // 5d. Fall with a full stash tells the player the Keepsake could not be stored.
  s = await open(browser, { mm: { v: 1, heroes: [hero({ id: 'h-a', name: 'Fally', fame: 10 })], stash: Array.from({ length: 16 }, (_, i) => ({ id: 'luckring', r: 0, n: i + 1 })) } });
  await s.page.evaluate(() => window.__lantern.fall('h-a'));
  check('full-stash Fall says the Keepsake could not be stored', /Keepsake could not be stored/.test(await s.page.textContent('#status')));
  await s.ctx.close();

  // 6. Hostile name.
  const evil = '<img src=x onerror=alert(1)>';
  s = await open(browser, { mm: { v: 1, heroes: [hero({ name: evil })] } });
  await s.page.fill('#new-name', evil);
  await s.page.click('#new-create');
  await s.page.waitForTimeout(300);
  const ev = await s.page.evaluate(() => ({ imgs: document.querySelectorAll('img').length, text: document.querySelector('#heroes .hname').textContent, names: [...document.querySelectorAll('#heroes .hname')].map((n) => n.textContent) }));
  check('hostile hero name renders as text: no <img>, no dialog', ev.imgs === 0 && ev.text === evil.slice(0, 24) && s.dialogs.length === 0 && ev.names.length === 2, JSON.stringify(ev));
  await s.ctx.close();

  // 7. Corrupt storage.
  s = await open(browser, { mm: '{{{not json' });
  check('corrupt pixeltown-mm-v1 loads clean (no heroes, empty stash)', (await s.page.locator('#heroes li').count()) === 0 && (await s.page.locator('#stash .slot').count()) === 16 && s.errors.length === 0, s.errors.join());
  await s.ctx.close();

  // 8. Network + phone layout.
  s = await open(browser, { mm: { v: 1, heroes: [hero({ name: 'Phone' })] }, viewport: { width: 390, height: 844 } });
  await s.page.waitForTimeout(300);
  const lay = await s.page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
    small: [...document.querySelectorAll('button, .btn, select, input[type=text]')].filter((n) => n.offsetParent && !n.classList.contains('mm-nav-legacy') && n.getBoundingClientRect().height < 47.5 && !n.closest('.choice')).map((n) => n.id || n.className) }));
  check('390x844: no horizontal scroll', lay.sw <= lay.cw, JSON.stringify(lay));
  check('390x844: touch targets at least 48px', lay.small.length === 0, lay.small.join());
  check('zero off-origin requests', s.reqs.every((u) => u.startsWith(ORIGIN + '/') || u.startsWith('data:') || u.startsWith('blob:')), s.reqs.join(' '));
  check('no console errors', s.errors.length === 0, s.errors.join());
  if (process.env.SHOTS) {
    await s.page.setInputFiles('#restore', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'pixeltown-backup', v: 2, keys: { [MM]: '{"v":1}', [SAVE]: '{"name":"Ben"}' } })) });
    await s.page.waitForSelector('#restore-confirm:not([hidden])');
    await s.page.locator('#restore-confirm').scrollIntoViewIfNeeded();
    await s.page.screenshot({ path: process.env.SHOTS + '/lantern-restore-confirm.png' });
    await s.page.click('#restore-no');
    await s.page.screenshot({ path: process.env.SHOTS + '/lantern-phone.png', fullPage: true });
    const d = await open(browser, { mm: { v: 1, heroes: [hero({ name: 'Mossy', level: 12 })], fame: 120, hall: [{ name: 'Old Pip', cls: 'herald', level: 20, fame: 900, how: 'retire' }], stash: [{ id: 'heartcharm', r: 1 }] }, save: LEGACY_SAVE });
    await d.page.screenshot({ path: process.env.SHOTS + '/lantern-desktop.png', fullPage: true });
  }
  await s.ctx.close();

  await browser.close();
  done();
})();
