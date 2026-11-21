// LB3: Lantern backup reminder (calm). Serve the repo root:  python3 -m http.server 8666 &
// Run: BASE=http://localhost:8666/game/index.html NODE_PATH=$(npm root -g) node game/tests/lantern-backup-reminder.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const NOTE = 'pixeltown-backupnote-v1';

async function open(browser, { note, date, viewport, seed } = {}) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1000, height: 800 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('dialog', (d) => d.dismiss());
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate(([k, n, seedObj]) => { if (n !== undefined) localStorage.setItem(k, n); Object.keys(seedObj || {}).forEach((x) => localStorage.setItem(x, seedObj[x])); }, [NOTE, note, seed]);
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.html?test=1&bdate=' + (date || '2026-11-21'));
  await page.waitForSelector('#backup-last', { state: 'attached' });
  return { ctx, page, errors };
}
const txt = (page) => page.textContent('#backup-last');

(async () => {
  const browser = await chromium.launch();
  let s = await open(browser);
  check('fresh profile: calm "none yet" text', (await txt(s.page)) === 'Last backup: none yet');
  const dl = s.page.waitForEvent('download');
  await s.page.click('#backup'); await dl;
  check('backup stores the UTC day and says today', (await txt(s.page)) === 'Last backup: today' && JSON.parse(await s.page.evaluate((k) => localStorage.getItem(k), NOTE)).at === '2026-11-21');
  check('no console errors after backup', s.errors.length === 0, s.errors.join('|'));
  await s.ctx.close();

  s = await open(browser, { note: JSON.stringify({ v: 1, at: '2026-11-18' }) });
  check('3 days ago', (await txt(s.page)) === 'Last backup: 3 days ago');
  await s.page.reload(); await s.page.waitForSelector('#backup-last');
  check('still 3 days ago after reload (persisted)', (await txt(s.page)) === 'Last backup: 3 days ago');
  check('no guilt wording in the card', await s.page.evaluate(() => !/(overdue|warning|don't lose|hurry|!)/i.test(document.getElementById('backup-card').textContent)));
  await s.ctx.close();

  for (const bad of ['not json', '{"v":1,"at":"2026-13-45"}', '{"v":1,"at":"2099-01-01"}', '[]', '"x"']) {
    s = await open(browser, { note: bad });
    check('corrupt/future note recovers to "none yet": ' + bad, (await txt(s.page)) === 'Last backup: none yet' && s.errors.length === 0, s.errors.join('|'));
    await s.ctx.close();
  }

  s = await open(browser, { note: JSON.stringify({ v: 1, at: '2026-11-20' }) });
  check('1 day ago wording', (await txt(s.page)) === 'Last backup: 1 day ago');
  await s.ctx.close();

  s = await open(browser, { seed: { 'pixeltown-access-v1': JSON.stringify({ v: 1, palette: 'protanopia', hudScale: 1.25 }), 'pixeltown-gift-v1': JSON.stringify({ v: 1, days: 4, last: '2026-11-20' }) } });
  const b = await s.page.evaluate(() => MMBackup.bundle(localStorage));
  check('export covers the access and gift keys', !!b.keys['pixeltown-access-v1'] && !!b.keys['pixeltown-gift-v1'] && b.v === 2);
  const r = await s.page.evaluate(() => {
    const a = MMBackup.plan({ format: 'pixeltown-backup', v: 1, keys: { 'pixeltown-hub-v1': '{"v":1}' } });
    const g = MMBackup.plan({ format: 'pixeltown-backup', v: 2, keys: { 'pixeltown-gift-v1': '{"days":"x","last":"zz"}' } });
    return { old: a.ok, gift: g.ok ? g.entries['pixeltown-gift-v1'] : null };
  });
  check('a backup without those keys still restores; a bad gift entry is cleaned', r.old && r.gift === '{"v":1,"days":0,"last":null}', JSON.stringify(r));
  await s.ctx.close();

  s = await open(browser, { viewport: { width: 390, height: 844 }, note: JSON.stringify({ v: 1, at: '2026-11-18' }) });
  const ph = await s.page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, h: document.getElementById('backup').getBoundingClientRect().height }));
  check('phone 390x844: no horizontal scroll, backup button >= 44px', ph.sw <= ph.cw && ph.h >= 44, JSON.stringify(ph));
  check('no console errors on phone', s.errors.length === 0, s.errors.join('|'));
  await s.ctx.close();
  await browser.close();
  done();
})();
