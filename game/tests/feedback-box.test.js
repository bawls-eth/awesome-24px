// Feedback box (game/shared/mm-feedback.js) on game/tests/fixtures/feedback-fixture.html, standalone Playwright with blockDb.
// Mount, save, reload persists, delete, Copy + Download give a valid export, 500-char cap, markup shown as text, phone 390x844
// (no horizontal scroll, 44 px targets, 48 px header), zero requests besides same-origin static files, clean console.
// Run: python3 -m http.server 8440 &   BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/feedback-box.test.js
const { chromium } = require('playwright');
const fs = require('fs');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/tests/fixtures/feedback-fixture.html';
const F = require('../shared/mm-feedback.js');
const KEY = 'pixeltown-feedback-v1';

async function open(browser, opts, seed) {
  const ctx = await browser.newContext(Object.assign({ acceptDownloads: true }, opts));
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  const errors = []; const offsite = []; const nonStatic = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push('console ' + m.type() + ': ' + m.text()); });
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith('data:') || u.startsWith('blob:')) return;
    if (!u.startsWith(ORIGIN + '/')) { offsite.push(u); return; }
    if (r.method() !== 'GET' || !/\.(html|js|css|png|ico|json|svg|woff2?)(\?|$)/.test(u)) nonStatic.push(r.method() + ' ' + u);
  });
  await page.addInitScript((s) => {
    if (sessionStorage.seeded) return;
    sessionStorage.seeded = '1';
    localStorage.clear();
    Object.keys(s || {}).forEach((k) => localStorage.setItem(k, s[k]));
  }, seed || {});
  await page.goto(PAGE);
  await page.waitForSelector('.mmfb-head');
  return { ctx, page, errors, offsite, nonStatic, db };
}
const box = (page, fn) => page.evaluate(fn);

(async () => {
  const browser = await chromium.launch();

  // ---------- desktop ----------
  const d = await open(browser, { viewport: { width: 1000, height: 700 } });
  const pg = d.page;
  await d.ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN });
  const m = await box(pg, () => {
    const h = document.querySelector('.mmfb-head'); const b = document.querySelector('.mmfb-body');
    return { n: document.querySelectorAll('.mmfb').length, title: h.textContent, exp: h.getAttribute('aria-expanded'), ctl: h.getAttribute('aria-controls') === b.id,
      hidden: b.hidden, h: h.getBoundingClientRect().height, inSettings: !!document.querySelector('#settings-body > .mmfb'),
      css: !!document.getElementById('mmfb-css'), note: document.querySelector('.mmfb-note').textContent };
  });
  check('mounts one collapsed section inside the container', m.n === 1 && m.inSettings && m.exp === 'false' && m.hidden && m.ctl, JSON.stringify(m));
  check('header says "Suggest or report a bug" and is 48 px tall', /Suggest or report a bug/.test(m.title) && m.h >= 48, JSON.stringify(m));
  check('stylesheet auto-added', m.css);
  check('calm device-only line', m.note === F.NOTE && /no personal info/.test(m.note));
  await pg.click('.mmfb-head');
  check('header toggles aria-expanded', await box(pg, () => document.querySelector('.mmfb-head').getAttribute('aria-expanded') === 'true' && !document.querySelector('.mmfb-body').hidden));
  check('no name/email fields: one textarea, no inputs', await box(pg, () => document.querySelectorAll('.mmfb input').length === 0 && document.querySelectorAll('.mmfb textarea.mmfb-text').length === 1));
  const fs12 = await box(pg, () => Array.from(document.querySelectorAll('.mmfb *')).filter((e) => e.offsetParent && e.textContent.trim())
    .map((e) => parseFloat(getComputedStyle(e).fontSize)).reduce((a, b) => Math.min(a, b), 99));
  check('all visible text is 12 px or larger', fs12 >= 12, String(fs12));
  check('Copy/Download disabled with nothing saved', await box(pg, () => document.querySelector('.mmfb-copy').disabled && document.querySelector('.mmfb-download').disabled));

  // save
  await pg.click('.mmfb-chip[data-kind="bug"]');
  check('chip aria-pressed follows the choice', await box(pg, () => document.querySelector('.mmfb-chip[data-kind="bug"]').getAttribute('aria-pressed') === 'true' &&
    document.querySelector('.mmfb-chip[data-kind="suggestion"]').getAttribute('aria-pressed') === 'false'));
  const MARK = '<img src=x onerror="window.__pwned=1"><b>bold</b> & the map button overlaps chat';
  await pg.fill('.mmfb-text', MARK);
  check('live counter', (await pg.textContent('.mmfb-count')) === MARK.length + ' / 500');
  await pg.click('.mmfb-save');
  const s1 = await box(pg, () => ({ raw: localStorage.getItem('pixeltown-feedback-v1'), ta: document.querySelector('.mmfb-text').value, items: document.querySelectorAll('.mmfb-item').length,
    status: document.querySelector('.mmfb-status').textContent, keys: Object.keys(localStorage) }));
  const saved = F.clean(s1.raw);
  check('save stores one entry in pixeltown-feedback-v1', saved.entries.length === 1 && saved.entries[0].k === 'bug' && saved.entries[0].page === 'fixture' && saved.entries[0].text === MARK, s1.raw);
  check('entry has only id/t/k/page/text/ua, ua desktop', JSON.stringify(Object.keys(JSON.parse(s1.raw).entries[0]).sort()) === '["id","k","page","t","text","ua"]' && saved.entries[0].ua === 'desktop');
  check('only the new key is written', s1.keys.length === 1 && s1.keys[0] === KEY, s1.keys.join());
  check('textarea cleared, list shows the item, status said', s1.ta === '' && s1.items === 1 && /Saved/.test(s1.status));
  const safe = await box(pg, () => ({ pwned: window.__pwned === 1, imgs: document.querySelectorAll('.mmfb img, .mmfb b').length, txt: document.querySelector('.mmfb-itext').textContent }));
  check('markup in text is shown as text, not HTML', !safe.pwned && safe.imgs === 0 && safe.txt === MARK, JSON.stringify(safe));
  await pg.fill('.mmfb-text', 'the MAP button overlaps chat');
  await pg.fill('.mmfb-text', MARK);
  await pg.click('.mmfb-save');
  check('duplicate is refused', (await box(pg, () => document.querySelectorAll('.mmfb-item').length)) === 1 && /already/.test(await pg.textContent('.mmfb-status')));
  await pg.click('.mmfb-chip[data-kind="suggestion"]');
  await pg.fill('.mmfb-text', 'Add a bigger font option');
  await pg.click('.mmfb-save');
  // 500 cap: type past the limit
  await pg.fill('.mmfb-text', '');
  await pg.type('.mmfb-text', 'x'.repeat(510), { delay: 0 });
  const cap = await box(pg, () => ({ len: document.querySelector('.mmfb-text').value.length, count: document.querySelector('.mmfb-count').textContent }));
  check('textarea caps at 500 chars', cap.len === 500 && cap.count === '500 / 500', JSON.stringify(cap));
  await pg.click('.mmfb-save');
  check('a 500-char entry is stored whole', F.clean(await box(pg, () => localStorage.getItem('pixeltown-feedback-v1'))).entries.some((e) => e.text.length === 500));

  // reload persists
  await pg.reload();
  await pg.waitForSelector('.mmfb-head');
  await pg.click('.mmfb-head');
  check('reload persists 3 entries', (await box(pg, () => document.querySelectorAll('.mmfb-item').length)) === 3);

  // delete
  await pg.click('.mmfb-item:last-child .mmfb-del');
  const afterDel = F.clean(await box(pg, () => localStorage.getItem('pixeltown-feedback-v1')));
  check('delete removes it from the list and storage', afterDel.entries.length === 2 && (await box(pg, () => document.querySelectorAll('.mmfb-item').length)) === 2 &&
    !afterDel.entries.some((e) => e.text === MARK), JSON.stringify(afterDel.entries.map((e) => e.text.slice(0, 10))));

  // Copy all (clipboard)
  await pg.click('.mmfb-copy');
  await pg.waitForFunction(() => /Copied|Select/.test(document.querySelector('.mmfb-status').textContent));
  const clip = await pg.evaluate(() => navigator.clipboard.readText());
  const pc = F.parseExport(clip);
  const jc = (() => { try { return JSON.parse(clip); } catch (e) { return {}; } })();
  check('Copy all puts a valid export on the clipboard', pc.ok && pc.entries.length === 2 && jc.v === 1 && jc.app === 'pixeltown', clip.slice(0, 120));
  // Copy fallback: clipboard API refused
  await pg.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) }, configurable: true }); });
  await pg.click('.mmfb-copy');
  await pg.waitForFunction(() => !document.querySelector('.mmfb-fallback').hidden);
  const fb = await box(pg, () => { const t = document.querySelector('.mmfb-fallback'); return { v: t.value, sel: t.selectionEnd - t.selectionStart, ro: t.readOnly }; });
  check('Copy fallback shows a selected read-only textarea with the export', F.parseExport(fb.v).ok && fb.sel === fb.v.length && fb.ro, JSON.stringify({ sel: fb.sel, len: fb.v.length }));

  // Download .json
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('.mmfb-download')]);
  const dlText = fs.readFileSync(await dl.path(), 'utf8');
  const pd = F.parseExport(dlText);
  check('Download .json gives a valid export file', /^pixeltown-feedback-\d{4}-\d{2}-\d{2}\.json$/.test(dl.suggestedFilename()) && pd.ok && pd.entries.length === 2 &&
    JSON.stringify(Object.keys(JSON.parse(dlText))) === '["v","app","entries"]', dl.suggestedFilename());

  // corrupt key -> defaults, no crash
  const c = await open(browser, { viewport: { width: 1000, height: 700 } }, { [KEY]: '{"entries":[{"id":"__proto__","text":"x"},"junk"' });
  await c.page.click('.mmfb-head');
  check('corrupt stored key loads as empty', (await box(c.page, () => document.querySelectorAll('.mmfb-item').length)) === 0 && /No saved notes/.test(await c.page.textContent('.mmfb-sub')));
  check('corrupt page console clean', c.errors.length === 0, c.errors.join(' | '));
  await c.ctx.close();

  check('desktop: console clean', d.errors.length === 0, d.errors.join(' | '));
  check('desktop: zero offsite requests, zero DB attempts', d.offsite.length === 0 && d.db.attempts() === 0, d.offsite.join(', '));
  check('desktop: only static GETs', d.nonStatic.length === 0, d.nonStatic.join(', '));
  await d.ctx.close();

  // ---------- phone 390x844 ----------
  const p = await open(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    { [KEY]: JSON.stringify({ v: 1, entries: [{ id: 'aaaa0001', t: '2026-11-22T09:00Z', k: 'bug', page: 'fixture', text: 'W'.repeat(500), ua: 'phone' }] }) });
  const pp = p.page;
  await pp.tap('.mmfb-head');
  await pp.tap('.mmfb-chip[data-kind="other"]');
  await pp.fill('.mmfb-text', 'Tapping works on my phone');
  await pp.tap('.mmfb-save');
  const ph = await box(pp, () => {
    const tg = Array.from(document.querySelectorAll('.mmfb button, .mmfb textarea:not([hidden])')).filter((e) => e.offsetParent);
    const small = tg.map((e) => { const r = e.getBoundingClientRect(); return { c: e.className, w: r.width, h: r.height }; }).filter((r) => r.w < 44 || r.h < 44);
    return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, small: small, head: document.querySelector('.mmfb-head').getBoundingClientRect().height,
      ua: JSON.parse(localStorage.getItem('pixeltown-feedback-v1')).entries.pop().ua, n: document.querySelectorAll('.mmfb-item').length };
  });
  check('phone: no horizontal scroll', ph.sw <= ph.cw, ph.sw + ' > ' + ph.cw);
  check('phone: every button/textarea target is at least 44 px', ph.small.length === 0, JSON.stringify(ph.small));
  check('phone: header is 48 px', ph.head >= 48, String(ph.head));
  check('phone: entry saved with ua phone', ph.ua === 'phone' && ph.n === 2, JSON.stringify(ph));
  check('phone: console clean', p.errors.length === 0, p.errors.join(' | '));
  check('phone: zero offsite requests, zero DB attempts, only static GETs', p.offsite.length === 0 && p.db.attempts() === 0 && p.nonStatic.length === 0, p.offsite.concat(p.nonStatic).join(', '));
  await p.ctx.close();

  await browser.close();
  done();
})().catch((e) => { console.log('FAIL crashed: ' + (e && e.stack || e)); process.exitCode = 1; });
