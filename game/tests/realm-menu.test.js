// Realm in-game menu (Resume / Restart / Leave / Settings) + death screen on the standalone Mad Maze page.
// Run: BASE=http://localhost:8481/game/index.html NODE_PATH=$(npm root -g) node game/tests/realm-menu.test.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const MAZE = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1';
const SAVE = { realm: { level: 3, xp: 4, shards: 123, bestWave: 2, deaths: 0, items: [{ n: 1, id: 'sparkwand', r: 1 }, { n: 2, id: 'heartcharm', r: 0 }], nextUid: 3, eq: { weapon: 1 } } };

async function open(browser, opts) {
  const ctx = await browser.newContext(opts || { viewport: { width: 1000, height: 700 } });
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' })); // the exit target: no network
  // NAV-AUDIT #12: with no previous place, Leave goes to the World map (not the Town join form); stub it too
  await ctx.route('**/game/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((v) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', v); }, JSON.stringify(SAVE));
  errors.length = 0;
  await page.goto(MAZE);
  await page.waitForFunction(() => window.__mm && window.__mm.arena);
  await page.evaluate(() => { window.__marker = 42; });
  await page.waitForFunction(() => window.__mm.arena.state === 'play' && window.__mm.arena.run.wave >= 1, null, { timeout: 8000 });
  return { ctx, page, errors };
}
const A = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__mm.arena, ${JSON.stringify(arg)})`);
const vis = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && !e.classList.contains('hidden') && getComputedStyle(e).display !== 'none'; }, sel);

(async () => {
  const browser = await chromium.launch();
  const errs = [];

  // ---------- open / close, pause ----------
  const P = await open(browser); const page = P.page;
  check('menu button exists and is visible (menu mode on)', await vis(page, '#realm-menu-btn'));
  check('existing 🎒 / 📊 / ✖ Leave buttons are still there', await vis(page, '#realm-bp-btn') && await vis(page, '#realm-board-btn') && await vis(page, '#realm-leave-btn'));
  check('menu is closed at start', !(await vis(page, '#realm-pause')));
  await page.click('#realm-menu-btn');
  check('☰ button opens the menu and pauses the run', await vis(page, '#realm-pause') && await A(page, (a) => a.panel === 'menu' && a.paused));
  const c0 = await A(page, (a) => a.clock); await page.waitForTimeout(500);
  check('the run is frozen while the menu is open', (await A(page, (a) => a.clock)) === c0);
  check('menu shows Resume, Restart run, Leave and the 3 settings', await page.evaluate(() => { const t = document.getElementById('realm-pause').innerText; return /Resume/.test(t) && /Restart run/.test(t) && /Leave/.test(t) && !/Leave to start/.test(t) && /Sound/.test(t) && /Reduce motion/.test(t) && /Aim assist/.test(t); }));
  await page.click('#realm-pause button[data-m="resume"].rm-btn');
  check('Resume closes the menu and the run continues', !(await vis(page, '#realm-pause')) && await A(page, (a) => !a.paused && a.panel === null));
  await page.waitForTimeout(400);
  check('clock advances again after Resume', (await A(page, (a) => a.clock)) > c0);
  await page.keyboard.press('Escape');
  check('Esc opens the menu (does not leave)', await vis(page, '#realm-pause') && page.url().indexOf('mad-maze') > 0);
  await page.keyboard.press('Escape');
  check('Esc closes the menu again', !(await vis(page, '#realm-pause')) && await A(page, (a) => a.panel === null && !a.paused));
  await page.click('#realm-menu-btn'); await page.click('#realm-menu-close');
  check('the X in the menu closes it', !(await vis(page, '#realm-pause')));

  // ---------- restart with the confirm step ----------
  await A(page, (a) => { a.run.wave = 5; a.run.kills = 9; a.run.shards = 33; a.player.hp = 10; a.bags[0].active = true; a.bags[0].x = 100; a.bags[0].y = 100; a.pBullets[0].active = true; a.eBullets[0].active = true; });
  await page.click('#realm-menu-btn');
  await page.click('#realm-pause button[data-m="restart"]');
  check('Restart asks for confirmation first', await vis(page, '#realm-pause .rm-confirm') && /Restart\? You keep your items and shards; your wave resets/.test(await page.innerText('#realm-pause .rm-confirm')));
  check('nothing was reset yet', await A(page, (a) => a.run.wave === 5 && a.player.hp === 10));
  await page.click('#realm-pause button[data-m="restart-no"]');
  check('"Keep playing" cancels the confirm and returns to the menu', !(await vis(page, '#realm-pause .rm-confirm')) && await vis(page, '#realm-pause .rm-main') && await A(page, (a) => a.run.wave === 5));
  await page.keyboard.press('Escape'); // closes the menu
  await page.click('#realm-menu-btn'); await page.click('#realm-pause button[data-m="restart"]');
  await page.keyboard.press('Escape');
  check('Esc inside the confirm step only cancels the confirm', await vis(page, '#realm-pause') && !(await vis(page, '#realm-pause .rm-confirm')));
  await page.click('#realm-pause button[data-m="restart"]');
  const before = await A(page, (a) => ({ items: JSON.stringify(a.save.items), shards: a.save.shards, level: a.save.level, eq: JSON.stringify(a.save.eq), raw: localStorage.getItem('pixeltown-save-v1') }));
  await page.click('#realm-pause button[data-m="restart-yes"]');
  const after = await A(page, (a) => ({
    wave: a.run.wave, kills: a.run.kills, rshards: a.run.shards, hp: a.player.hp, max: a.stats.maxHp, state: a.state, panel: a.panel, active: a.active,
    enemies: a.enemies.filter((o) => o.active).length, pb: a.pBullets.filter((o) => o.active).length, eb: a.eBullets.filter((o) => o.active).length, bags: a.bags.filter((o) => o.active).length,
    items: JSON.stringify(a.save.items), shards: a.save.shards, level: a.save.level, eq: JSON.stringify(a.save.eq), raw: localStorage.getItem('pixeltown-save-v1'),
  }));
  check('Restart resets wave / kills / run shards and refills hp', after.wave === 0 && after.kills === 0 && after.rshards === 0 && after.hp === after.max, JSON.stringify(after));
  check('Restart clears enemies, bullets and bags', after.enemies === 0 && after.pb === 0 && after.eb === 0 && after.bags === 0, JSON.stringify(after));
  check('Restart closes the menu and keeps the arena running', after.panel === null && after.active && after.state === 'banner' && !(await vis(page, '#realm-pause')));
  check('Restart keeps items, equipment, shards and level (save unchanged)', after.items === before.items && after.shards === before.shards && after.level === before.level && after.eq === before.eq && after.raw === before.raw && after.shards === 123, JSON.stringify([before, after]));
  await page.waitForFunction(() => window.__mm.arena.run.wave === 1 && window.__mm.arena.state === 'play', null, { timeout: 6000 });
  check('wave 1 starts again, same page (no reload)', (await page.evaluate(() => window.__marker)) === 42);

  // ---------- settings ----------
  await page.click('#realm-menu-btn');
  await page.click('#realm-pause button[data-set="sound"]');
  await page.click('#realm-pause button[data-set="motion"]');
  await page.click('#realm-pause button[data-set="aim"]');
  const st = await page.evaluate(() => ({ mute: localStorage.getItem('mm-sfx-muted'), motion: localStorage.getItem('mm-reduce-motion'), aim: localStorage.getItem('mm-aim-assist'), red: window.__mm.arena._reduced, aimOn: window.__mm.arena._aimAssist, muted: window.__mm.arena.isMuted(), txt: document.getElementById('realm-pause').innerText }));
  check('toggles write the existing preference keys (mute, reduce motion, aim assist)', st.mute === '1' && st.motion === '1' && st.aim === '0' && st.red === true && st.aimOn === false && st.muted === true, JSON.stringify(st));
  check('toggle labels follow the state', /Sound: off/.test(st.txt) && /Reduce motion: on/.test(st.txt) && /Aim assist: off/.test(st.txt), st.txt);
  await page.reload(); await page.waitForFunction(() => window.__mm && window.__mm.arena); await page.evaluate(() => { window.__marker = 42; });
  await page.click('#realm-menu-btn');
  const st2 = await page.evaluate(() => document.getElementById('realm-pause').innerText);
  check('settings persist across a reload', /Sound: off/.test(st2) && /Reduce motion: on/.test(st2) && /Aim assist: off/.test(st2), st2);
  await page.click('#realm-pause button[data-set="sound"]'); await page.click('#realm-pause button[data-set="motion"]'); await page.click('#realm-pause button[data-set="aim"]');
  check('toggling back restores the defaults', await page.evaluate(() => localStorage.getItem('mm-sfx-muted') === '0' && localStorage.getItem('mm-reduce-motion') === '0' && localStorage.getItem('mm-aim-assist') === '1'));
  await page.click('#realm-menu-close');

  // ---------- co-op / duel: Restart disabled with an explanation ----------
  await page.click('#realm-menu-btn');
  await A(page, (a) => { a.team = { isPvp: false, badge: () => null, close() {}, drawList: () => [] }; a._syncMenu(); }); // drawList: a frame may render while this stub is set
  const co = await page.evaluate(() => ({ dis: document.querySelector('#realm-pause button[data-m="restart"]').disabled, note: document.querySelector('#realm-pause .rm-note').innerText, can: window.__mm.arena.canRestart(), r: window.__mm.arena.restart() }));
  check('co-op/duel run: Restart is disabled with an explanation, restart() refuses', co.dis && /shared run/.test(co.note) && co.can === false && co.r === false, JSON.stringify(co));
  await A(page, (a) => { a.team = null; a._syncMenu(); });
  check('solo again: Restart re-enabled', await page.evaluate(() => !document.querySelector('#realm-pause button[data-m="restart"]').disabled));
  await page.click('#realm-menu-close');

  // ---------- death screen ----------
  await A(page, (a) => { a.run.wave = 4; a.run.kills = 17; a.run.shards = 55; a._die(); });
  await page.waitForFunction(() => { const e = document.getElementById('realm-death'); return !!e && !e.classList.contains('hidden'); }, null, { timeout: 6000 });
  const d = await page.evaluate(() => ({ txt: document.getElementById('realm-death').innerText, url: location.href, deaths: window.__mm.arena.save.deaths, active: window.__mm.arena.active }));
  check('death shows a recap (wave, kills, shards, cache item) instead of leaving', /Wave reached\s*4/.test(d.txt) && /Kills\s*17/.test(d.txt) && /\+55/.test(d.txt) && /cache/i.test(d.txt) && d.url.indexOf('mad-maze') > 0 && d.active, d.txt + d.url);
  check('death screen has Try again and Leave', /Try again/.test(d.txt) && /Leave/.test(d.txt));
  check('the menu cannot open on top of the death screen', await A(page, (a) => { a.setMenu(true); return a.panel === null; }));
  const itemsBefore = await A(page, (a) => a.save.items.length);
  await page.click('#realm-death button[data-d="again"]');
  const t = await A(page, (a) => ({ hp: a.player.hp, max: a.stats.maxHp, wave: a.run.wave, state: a.state, items: a.save.items.length, deaths: a.save.deaths }));
  check('Try again restarts the run on the same page and keeps the cache item', !(await vis(page, '#realm-death')) && t.hp === t.max && t.wave === 0 && t.state === 'banner' && t.items === itemsBefore && t.deaths === 1 && (await page.evaluate(() => window.__marker)) === 42, JSON.stringify(t));
  await page.waitForFunction(() => window.__mm.arena.run.wave === 1, null, { timeout: 6000 });

  // ---------- leave ----------
  await A(page, (a) => a._die());
  await page.waitForFunction(() => { const e = document.getElementById('realm-death'); return !!e && !e.classList.contains('hidden'); }, null, { timeout: 6000 });
  // NAV-AUDIT #12: no previous place (no referrer, empty mm-nav storage) -> the World map, never the Town join form
  await Promise.all([page.waitForURL(/\/game\/hub\/index\.html/, { timeout: 8000 }), page.click('#realm-death button[data-d="leave"]')]);
  check('Leave on the death screen goes back to the World map (no previous place)', /\/game\/hub\/index\.html/.test(page.url()));
  await page.goto(MAZE); await page.waitForFunction(() => window.__mm && window.__mm.arena);
  await page.click('#realm-menu-btn');
  await Promise.all([page.waitForURL(/\/game\/hub\/index\.html/, { timeout: 8000 }), page.click('#realm-pause button[data-m="leave"]')]);
  check('Leave (menu) exits to the World map', /\/game\/hub\/index\.html/.test(page.url()));
  errs.push(...P.errors); await P.ctx.close();

  // ---------- default behaviour without menu mode (town gate) ----------
  const Q = await open(browser); const pg = Q.page;
  await A(pg, (a) => { a.setMenuMode(false); });
  check('menu mode off hides the ☰ button', !(await vis(pg, '#realm-menu-btn')));
  await A(pg, (a) => { a.setMenu(true); });
  check('menu mode off: setMenu is a no-op', await A(pg, (a) => !a.panel) && !(await vis(pg, '#realm-pause')));
  await A(pg, (a) => { a.run.wave = 2; a._die(); });
  await Promise.all([pg.waitForURL(/\/game\/hub\/index\.html/, { timeout: 9000 }), pg.waitForTimeout(0)]);
  check('menu mode off: death exits as before (onExit death), no death screen', /\/game\/hub\/index\.html/.test(pg.url()));
  errs.push(...Q.errors); await Q.ctx.close();
  const R = await open(browser); const rg = R.page;
  await A(rg, (a) => { a.setMenuMode(false); });
  await Promise.all([rg.waitForURL(/\/game\/hub\/index\.html/, { timeout: 8000 }), rg.keyboard.press('Escape')]);
  check('menu mode off: Esc still leaves immediately', /\/game\/hub\/index\.html/.test(rg.url()));
  errs.push(...R.errors); await R.ctx.close();
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  check('town gate (main.js) does not opt in to the menu mode', main.indexOf('setMenuMode') < 0);

  // ---------- dungeon mode keeps its own death flow, Restart off ----------
  const D = await browser.newContext({ viewport: { width: 1000, height: 700 } }); const dp = await D.newPage();
  const derr = []; dp.on('pageerror', (e) => derr.push(e.message));
  await dp.goto(MAZE + '&mode=dungeon&seed=7'); await dp.waitForFunction(() => window.__mm && window.__mm.arena);
  await dp.waitForTimeout(500);
  check('Warren run: Restart is refused (own run controller)', await dp.evaluate(() => window.__mm.arena.canRestart() === false && window.__mm.arena.restart() === false));
  errs.push(...derr); await D.close();

  check('no console errors', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})();
