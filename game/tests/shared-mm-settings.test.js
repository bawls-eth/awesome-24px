// MMSettings (game/shared/mm-settings.js): one simple 8-bit Settings panel on game/tests/fixtures/settings-fixture.html, desktop and phone 390x844.
// Groups Play/See/Hear/Help, every toggle >= 44 px, writes the existing device keys, focus trap + Esc close, keys never reach page hotkeys,
// feedback box inside Help, below the Menu button, toast + tooltip styles, text >= 12 px, no network, blockDb.
// Run: python3 -m http.server 9400 &   BASE=http://localhost:9400/game/index.html NODE_PATH=$(npm root -g) node game/tests/shared-mm-settings.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/tests/fixtures/settings-fixture.html';

async function open(browser, opts, seed) {
  const ctx = await browser.newContext(opts);
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  const errors = []; const offsite = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith(ORIGIN + '/') && !u.startsWith('data:')) offsite.push(u); });
  await page.addInitScript((s) => {
    if (sessionStorage.seeded) return;
    sessionStorage.seeded = '1';
    localStorage.clear();
    Object.keys(s || {}).forEach((k) => localStorage.setItem(k, s[k]));
  }, seed || {});
  await page.goto(PAGE);
  await page.waitForFunction(() => window.__set && document.getElementById('mmset'));
  return { ctx, page, errors, offsite, db };
}
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const layout = (page) => ev(page, () => {
  const d = document.getElementById('mmset'); const r = d.getBoundingClientRect(); const m = document.getElementById('menu').getBoundingClientRect();
  const tg = Array.from(d.querySelectorAll('button, textarea')).filter((e) => e.offsetParent);
  const small = tg.map((e) => { const b = e.getBoundingClientRect(); return { id: e.id || e.className, w: b.width, h: b.height }; }).filter((b) => b.w < 44 || b.h < 44);
  const fs = Array.from(d.querySelectorAll('*')).filter((e) => e.offsetParent && e.childNodes.length && Array.from(e.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim()))
    .map((e) => parseFloat(getComputedStyle(e).fontSize));
  const cs = getComputedStyle(d);
  return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, w: innerWidth, h: innerHeight, menuBottom: m.bottom, small: small, minFont: Math.min.apply(null, fs),
    sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, rad: cs.borderTopLeftRadius, bw: parseFloat(cs.borderTopWidth), font: cs.fontFamily,
    groups: Array.from(d.querySelectorAll('.mmset-gh')).map((h) => h.textContent).join(), role: d.getAttribute('role'), modal: d.getAttribute('aria-modal') };
});

(async () => {
  const browser = await chromium.launch();
  for (const [name, opts] of [['desktop', { viewport: { width: 1100, height: 760 } }], ['phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
    const o = await open(browser, opts, { 'pixeltown-access-v1': JSON.stringify({ v: 1, palette: 'deuteranopia', hudScale: 1, flashes: true, bulletOutline: true, lowGfx: false }) });
    const pg = o.page;
    const tap = (sel) => (name === 'phone' ? pg.tap(sel) : pg.click(sel));
    check(name + ': panel starts hidden', await ev(pg, () => document.getElementById('mmset').hidden && !window.__set.isOpen()));
    await tap('#open');
    const L = await layout(pg);
    check(name + ': opens as a modal dialog', L.role === 'dialog' && L.modal === 'true' && await ev(pg, () => window.__set.isOpen()), JSON.stringify(L));
    check(name + ': groups Play, See, Hear, Help', L.groups === 'Play,See,Hear,Help', L.groups);
    check(name + ': every target is >= 44 px', L.small.length === 0, JSON.stringify(L.small));
    check(name + ': all text >= 12 px', L.minFont >= 12, String(L.minFont));
    check(name + ': panel sits below the Menu button and inside the screen', L.top >= L.menuBottom && L.left >= 0 && L.right <= L.w && L.bottom <= L.h, JSON.stringify(L));
    check(name + ': no horizontal scroll', L.sw <= L.cw, L.sw + ' > ' + L.cw);
    check(name + ': 8-bit frame (square corners, 4 px border, monospace)', L.rad === '0px' && L.bw >= 4 && /mono|Courier|Menlo|Consolas|pixel/i.test(L.font), JSON.stringify(L));
    check(name + ': focus moves into the panel (Close)', await ev(pg, () => document.activeElement && document.activeElement.id === 'mmset-close'));

    // toggles write the existing keys
    await tap('#mmset-one-thumb');
    check(name + ': one-thumb on writes mm-auto-fire + mm-aim-toggle', await ev(pg, () => localStorage.getItem('mm-auto-fire') === '1' && localStorage.getItem('mm-aim-toggle') === '1'
      && document.getElementById('mmset-one-thumb').getAttribute('aria-checked') === 'true' && document.getElementById('mmset-auto-fire').getAttribute('aria-checked') === 'true'));
    check(name + ': change event fired for one-thumb', await ev(pg, () => window.__changes.some((c) => c.id === 'one-thumb' && c.value === true)));
    await tap('#mmset-aim-assist');
    check(name + ': aim assist (default on) off -> mm-aim-assist 0', await ev(pg, () => localStorage.getItem('mm-aim-assist') === '0'));
    await tap('#mmset-text-size button[data-value="1.5"]');
    check(name + ': text size Huge -> hudScale 1.5, --ui-scale 1.5, palette kept', await ev(pg, () => { const a = JSON.parse(localStorage.getItem('pixeltown-access-v1'));
      return a.hudScale === 1.5 && a.palette === 'deuteranopia' && document.documentElement.style.getPropertyValue('--ui-scale') === '1.5'; }));
    await tap('#mmset-low-gfx');
    await tap('#mmset-high-contrast');
    await tap('#mmset-reduce-motion');
    check(name + ': low graphics, high contrast, reduce motion mirrored on <html>', await ev(pg, () => { const h = document.documentElement;
      return JSON.parse(localStorage.getItem('pixeltown-access-v1')).lowGfx === true && h.getAttribute('data-low-gfx') === '1' && h.getAttribute('data-high-contrast') === '1'
        && localStorage.getItem('mm-high-contrast') === '1' && localStorage.getItem('mm-reduce-motion') === (h.getAttribute('data-reduce-motion') === '1' ? '1' : '0'); }));
    await tap('#mmset-sound');
    await tap('#mmset-music');
    check(name + ': sound off -> mm-sfx-muted 1, music on -> mm-music 1', await ev(pg, () => localStorage.getItem('mm-sfx-muted') === '1' && localStorage.getItem('mm-music') === '1'));
    check(name + ': no save key written', await ev(pg, () => localStorage.getItem('pixeltown-save-v1') === null));

    // help
    const help = await ev(pg, () => ({ keys: Array.from(document.querySelectorAll('#mmset-keys dt')).map((d) => d.textContent).join(),
      text: document.getElementById('mmset-keys').textContent, fb: !!document.querySelector('#mmset-fb .mmfb') }));
    check(name + ': help lists Move/Primary/Secondary/Menu/Restart', help.keys === 'Move,Primary,Secondary,Menu,Restart' && /WASD/.test(help.text) && /Esc \/ P/.test(help.text), JSON.stringify(help));
    check(name + ': feedback box sits inside Help', help.fb);

    // keys inside never reach page hotkeys; focus trap; Esc closes and returns focus
    const hot0 = await ev(pg, () => window.__hot);
    await pg.focus('#mmset-close');
    await pg.keyboard.press('w');
    await pg.keyboard.press('Shift+Tab');
    check(name + ': Shift+Tab from first wraps to the last control', await ev(pg, () => { const f = Array.from(document.querySelectorAll('#mmset button, #mmset textarea')).filter((e) => !e.disabled && e.offsetParent);
      return document.activeElement === f[f.length - 1]; }));
    await pg.keyboard.press('Tab');
    check(name + ': Tab from last wraps to Close', await ev(pg, () => document.activeElement.id === 'mmset-close'));
    check(name + ': keys in the panel never reach page hotkeys', (await ev(pg, () => window.__hot)) === hot0);
    await pg.keyboard.press('Escape');
    check(name + ': Esc closes and focus returns to the opener', await ev(pg, () => document.getElementById('mmset').hidden && document.getElementById('mmset-back').hidden && document.activeElement.id === 'open'));

    // reload keeps everything
    await pg.reload();
    await pg.waitForFunction(() => window.__set);
    const r = await ev(pg, () => window.__set.read());
    check(name + ': settings persist across reload', r['one-thumb'] && !r['aim-assist'] && r['text-size'] === 1.5 && r['low-gfx'] && r['high-contrast'] && !r.sound && r.music, JSON.stringify(r));
    check(name + ': <html> hooks re-applied on load', await ev(pg, () => document.documentElement.getAttribute('data-high-contrast') === '1' && document.documentElement.style.getPropertyValue('--ui-scale') === '1.5'));

    // toast + tooltip
    const t = await ev(pg, () => { const el = MMSettings.toast('<b>Saved</b>'); const r2 = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      return { txt: el.textContent, b: el.querySelector('b') === null, fs: parseFloat(cs.fontSize), rad: cs.borderTopLeftRadius, top: r2.top, l: r2.left, r: r2.right, w: innerWidth,
        live: document.getElementById('mm8-toasts').getAttribute('aria-live'), menu: document.getElementById('menu').getBoundingClientRect().bottom }; });
    check(name + ': toast shows text only (no markup), 8-bit, >= 12 px', t.txt === '<b>Saved</b>' && t.b && t.fs >= 12 && t.rad === '0px', JSON.stringify(t));
    check(name + ': toast is a polite live region below the Menu row, on screen', t.live === 'polite' && t.top >= t.menu && t.l >= 0 && t.r <= t.w, JSON.stringify(t));
    const tip = await ev(pg, () => { const b = document.getElementById('open'); b.setAttribute('data-mm-tip', 'Opens settings'); return getComputedStyle(b).position; });
    await pg.hover('#open');
    const tipAfter = await ev(pg, () => { const s = getComputedStyle(document.getElementById('open'), '::after'); return { c: s.content, fs: parseFloat(s.fontSize), rad: s.borderTopLeftRadius }; });
    check(name + ': tooltip from data-mm-tip, 12 px, square', tip === 'relative' && /Opens settings/.test(tipAfter.c) && tipAfter.fs >= 12 && tipAfter.rad === '0px', JSON.stringify(tipAfter));

    check(name + ': console clean', o.errors.length === 0, o.errors.join(' | '));
    check(name + ': no offsite requests, no DB attempts', o.offsite.length === 0 && o.db.attempts() === 0, o.offsite.join(', '));
    await o.ctx.close();
  }
  await browser.close();
  done();
})().catch((e) => { console.log('FAIL crashed: ' + (e && e.stack || e)); process.exitCode = 1; });
