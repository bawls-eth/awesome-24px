// Universal controls in the Realm (design/CONTROLS.md, shared/mm-input.js): P pauses / menus, Shift = E, Enter fires,
// R restarts only from the fall screen or the open menu, the #realm-help hint comes from the mapping. Old keys keep working.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/realm-universal-controls.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const MAZE = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1';
const SAVE = { realm: { level: 6, xp: 4, shards: 50, bestWave: 2, deaths: 0, items: [{ n: 1, id: 'sparkwand', r: 1 }], nextUid: 2, eq: { weapon: 1 } } };

async function open(browser, viewport, opts) {
  const ctx = await browser.newContext(Object.assign({ viewport }, opts || {}));
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  await ctx.route('**/game/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((v) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', v); }, JSON.stringify(SAVE));
  await page.goto(MAZE);
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.state === 'play' && window.__mm.arena.run.wave >= 1, null, { timeout: 10000 });
  await page.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); });
  return { ctx, page, errors };
}
const A = (page, fn) => page.evaluate(`(${fn.toString()})(window.__mm.arena)`);

(async () => {
  const browser = await chromium.launch();
  for (const [label, vp, opts] of [['desktop', { width: 1280, height: 800 }, {}], ['390x844', { width: 390, height: 844 }, { hasTouch: true, isMobile: true }]]) {
    const { ctx, page, errors } = await open(browser, vp, opts);
    check(`[${label}] MMInput is loaded on the Realm page`, await page.evaluate(() => typeof MMInput === 'object' && MMInput.actionOf('Enter') === 'primary'));
    const hint = await page.evaluate(() => { const e = document.querySelector('#realm-help .key-hint'); return e ? { t: e.textContent, mm: e.dataset.mmInput } : null; });
    check(`[${label}] control hint is built from the mapping`, !!hint && hint.mm === '1' && hint.t === (await page.evaluate(() => MMInput.hint({ only: ['move', 'primary', 'secondary', 'menu'], names: { primary: 'fire', secondary: 'ability 2', menu: 'menu' } }))) + ' · mouse aims · Q E R F abilities · B bag · K board', JSON.stringify(hint));
    check(`[${label}] hint is one line and names Space / Enter, Shift / E, Esc / P`, !!hint && !/\n/.test(hint.t) && /Space \/ Enter fire/.test(hint.t) && /Shift \/ E/.test(hint.t) && /Esc \/ P menu/.test(hint.t));

    // Enter fires like Space (held), released on keyup
    await page.keyboard.down('Enter');
    check(`[${label}] Enter holds fire like Space`, await A(page, (a) => a.keys[' '] === true));
    await page.keyboard.up('Enter');
    check(`[${label}] Enter release stops fire`, await A(page, (a) => !a.keys[' ']));

    // Shift = E (second ability)
    const before = await A(page, (a) => a.cds ? JSON.stringify(a.cds) : JSON.stringify(a.abCd || null));
    await A(page, (a) => { a.__casts = []; const o = a.cast.bind(a); a.cast = (i) => { a.__casts.push(i); return o(i); }; });
    await page.keyboard.press('Shift');
    await page.keyboard.press('q');
    check(`[${label}] Shift casts ability 2 (same as E), Q still casts Dash`, JSON.stringify(await A(page, (a) => a.__casts)) === '[1,0]', JSON.stringify(await A(page, (a) => a.__casts)) + before);

    // R in play is still Shield (never a restart mid-fight)
    await A(page, (a) => { a.__casts = []; a.__rs = 0; const o = a.restart.bind(a); a.restart = () => { a.__rs++; return o(); }; });
    await page.keyboard.press('r');
    check(`[${label}] R in play casts Shield, no restart`, await A(page, (a) => a.__casts[0] === 2 && a.__rs === 0));

    // P pauses / opens the menu and P again resumes; never leaves
    await page.keyboard.press('p');
    const st1 = await A(page, (a) => ({ paused: a.paused, panel: a.panel, active: a.active }));
    check(`[${label}] P pauses (menu or bag), stays in the Realm`, st1.paused && !!st1.panel && st1.active, JSON.stringify(st1));
    // R in the open menu asks to restart (the confirm, not an instant restart)
    if (st1.panel === 'menu') {
      await page.keyboard.press('r');
      check(`[${label}] R in the open menu shows the restart confirm`, await page.evaluate(() => { const c = document.querySelector('#realm-pause .rm-confirm, .rm-confirm'); return !!c && !c.classList.contains('hidden'); }));
      await page.keyboard.press('Escape');
    }
    await page.keyboard.press('p');
    if (await A(page, (a) => a.paused)) await page.keyboard.press('p');
    check(`[${label}] P again resumes play`, await A(page, (a) => !a.paused && !a.panel && a.active && a.state === 'play'));

    // Fall screen: R = Try again
    await A(page, (a) => { a.__rs = 0; a.player.hp = 0; if (a._showDeath) a._showDeath(); });
    await page.waitForTimeout(100);
    await page.keyboard.press('r');
    await page.waitForTimeout(200);
    check(`[${label}] R on the fall screen restarts (Try again)`, await A(page, (a) => a.__rs === 1));
    check(`[${label}] no page errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
