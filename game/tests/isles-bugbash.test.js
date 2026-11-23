// Bug bash (lane ISLES), Hearthvale Isles page (game/games/isles/):
// 1 feed pacing: after a feed the Feed button says 'Chewing Ns' with a fill, an early tap says exactly how long is left (no fake
//   urgency), and once the chew is over the button reads 'Feed k/need' again; the feeds and the tame play chip cues (pop, level_up);
// 2 universal controls (CONTROLS.md / MMInput): Enter fires like Space, Shift feeds like F, Esc and P open the shared Menu sheet,
//   Esc closes it, the old keys still work (M map, L log);
// 3 the shared Settings sheet (MMSettings): opened from Help, it pauses the island, its One-thumb switch applies live, the Menu's
//   Settings entry opens it, and the Pack open / close play ui_open / ui_close;
// 4 phone layout: the first-visit how-to never covers the hero (screen centre), the hint hides under an open Pack, 150% text keeps
//   ATTACK inside its button; landscape 844x390: the hint line sits clear of the hero and of the stick / buttons;
// plus no console errors or audio warnings (no AudioContext before a gesture) and 0 database requests.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/isles-bugbash.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ck = (cond, name, extra) => check(name, !!cond, extra === undefined ? '' : JSON.stringify(extra).slice(0, 600));
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/isles/index.html';
const PROFILE = { v: 1, heroes: [{ id: 'h1', name: 'Fern', cls: 'druid', level: 7, xp: 10, items: [] }], stash: [], fame: 0, mode: 'classic', hall: [] };
const HERO_KEYS = { 'pixeltown-mm-v1': JSON.stringify(PROFILE), 'pixeltown-mm-active-v1': JSON.stringify({ v: 1, heroId: 'h1' }) };
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
const LAND = { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true };

const all = [];
async function open(browser, opts, query, seed) {
  const ctx = await browser.newContext(opts);
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /AudioContext/.test(m.text()))) errors.push(m.type() + ': ' + m.text()); });
  await page.addInitScript((s) => {
    if (sessionStorage.seeded) return;
    sessionStorage.seeded = '1';
    localStorage.clear();
    Object.keys(s || {}).forEach((k) => localStorage.setItem(k, s[k]));
  }, seed || {});
  await page.goto(PAGE + '?test=1&seed=123' + (query || ''));
  await page.waitForFunction(() => window.__isles && window.__isles.world);
  const o = { ctx, page, errors, db };
  all.push(o);
  return o;
}
const ev = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__isles, ${JSON.stringify(arg === undefined ? null : arg)})`);
const frames = (page, n) => page.evaluate((k) => new Promise((res) => { let i = 0; const f = () => (++i >= k ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const hudTick = (page) => frames(page, 16); // drawHud runs 5 times a second
async function setup(page) {
  return ev(page, (I) => { I.pause(true); I.god(true); I.clearCreatures(); const r = I.findTile(null, 13); I.teleport(r.x, r.y); I.step(0, 0, 0.05); return r; });
}
// knock a Fern Raptor out with soothe shots and stand next to it
const KO = (I) => {
  const h = I.hero();
  const uid = I.spawn('fernraptor', h.tx + 3, h.ty);
  const get = () => I.creatures().find((c) => c.uid === uid) || null;
  I.soothe(true);
  for (let i = 0; i < 80 && get() && !get().ko; i++) { const c = get(), hh = I.hero(); I.fire(c.x - hh.x, c.y - 8 - hh.y); I.step(0, 0, 0.3); }
  I.soothe(false);
  I.nextTo(uid, -30);
  return { uid, ko: !!(get() && get().ko), need: get() ? get().need : 0 };
};

(async () => {
  const browser = await chromium.launch();

  // ---- 1: honest feed pacing on the Feed button ----
  const d = await open(browser, { viewport: { width: 1000, height: 700 } }, '', HERO_KEYS);
  await frames(d.page, 6);
  await d.page.mouse.click(500, 650); // a gesture first (sound may start)
  await setup(d.page);
  const k = await ev(d.page, KO);
  ck(k.ko && k.need > 1, '1a: a soothed Fern Raptor is asleep and needs several feeds', k);
  await hudTick(d.page);
  const before = await ev(d.page, (I) => I.feedLabel());
  ck(/^Feed 0\/\d+$/.test(before), '1b: before the first feed the button reads "Feed 0/need"', before);
  const f1 = await ev(d.page, (I, uid) => { const r = I.feed(); I.nextTo(uid, -30); return r; }, k.uid);
  await hudTick(d.page);
  const chewing = await d.page.evaluate(() => { const b = document.getElementById('btn-feed'); return { txt: b.textContent, chew: b.classList.contains('chew'), p: +b.style.getPropertyValue('--p'), aria: b.getAttribute('aria-label') }; });
  ck(f1.ok && /^Chewing \d+s$/.test(chewing.txt) && chewing.chew && chewing.p >= 0 && chewing.p < 1 && /still chewing/.test(chewing.aria),
    '1c: right after a feed the button says "Chewing Ns" with a fill bar and an honest label', { f1, chewing });
  const early = await ev(d.page, (I) => { const r = I.feed(); return { r, toast: document.getElementById('toast').textContent }; });
  ck(!early.r.ok && /still chewing: ready in \d+ s\./.test(early.early || early.toast), '1d: an early tap says exactly how long is left (nothing lost)', early);
  await ev(d.page, (I, uid) => { I.step(0, 0, 6.5); I.nextTo(uid, -30); }, k.uid);
  await hudTick(d.page);
  const after = await ev(d.page, (I) => ({ lbl: I.feedLabel(), sounds: I.sounds() }));
  ck(/^Feed [1-9]\d*\/\d+$/.test(after.lbl), '1e: once the chew is over the button reads "Feed k/need" again', after.lbl);
  ck(after.sounds.indexOf('pop') >= 0 && after.sounds.indexOf('select') >= 0, '1f: a feed plays "pop" and the ready-again moment a soft "select"', after.sounds);
  const tame = await ev(d.page, (I, uid) => { let r = null; for (let i = 0; i < 20; i++) { r = I.feed(); if (r.tamed) break; I.step(0, 0, 6.2); I.nextTo(uid, -30); } return { r, sounds: I.sounds() }; }, k.uid);
  ck(tame.r && tame.r.tamed && tame.sounds.indexOf('level_up') >= 0, '1g: the tame finishes and plays "level_up"', tame);

  // ---- 2: universal controls ----
  await ev(d.page, (I) => { I.pause(false); I.god(true); I.clearCreatures(); });
  await d.page.keyboard.down('Enter'); await frames(d.page, 6); await d.page.keyboard.up('Enter');
  const shots = await ev(d.page, (I) => I.sounds().filter((s) => s === 'shoot').length);
  ck(shots >= 1, '2a: Enter fires like Space (a shoot cue)', shots);
  await d.page.keyboard.press('Escape');
  await d.page.waitForTimeout(100);
  const menuOpen = await d.page.evaluate(() => !!(window.MMNav && window.MMNav.isOpen()));
  await d.page.keyboard.press('Escape');
  await d.page.waitForTimeout(100);
  const menuClosed = await d.page.evaluate(() => !!(window.MMNav && !window.MMNav.isOpen()));
  ck(menuOpen && menuClosed, '2b: Esc opens the shared Menu sheet and Esc closes it', { menuOpen, menuClosed });
  await d.page.keyboard.press('KeyP');
  await d.page.waitForTimeout(100);
  const pMenu = await d.page.evaluate(() => !!(window.MMNav && window.MMNav.isOpen()));
  await d.page.keyboard.press('Escape');
  ck(pMenu, '2c: P (away from the trophy pedestal) opens the Menu too', pMenu);
  await d.page.keyboard.press('KeyL');
  const logOpen = await d.page.evaluate(() => !document.getElementById('panel').hidden && document.getElementById('panel-title').textContent);
  await d.page.keyboard.press('Escape');
  const logShut = await d.page.evaluate(() => document.getElementById('panel').hidden);
  ck(logOpen === 'Island log' && logShut, '2d: the old keys stay: L opens the log and Esc closes the panel (not the menu)', { logOpen, logShut });
  // Shift = the F action: next to a sleeper it feeds
  await setup(d.page);
  const k2 = await ev(d.page, KO);
  await d.page.keyboard.press('Shift');
  const shiftFed = await ev(d.page, (I, uid) => { const c = I.creatures().find((x) => x.uid === uid); return c ? c.prog : -1; }, k2.uid);
  ck(k2.ko && shiftFed > 0, '2e: Shift (the universal secondary) feeds a sleeping creature like F', { k2, shiftFed });
  const help = await d.page.evaluate(() => document.getElementById('help').textContent);
  ck(/Enter/.test(help) && /Shift/.test(help) && /Esc \/ P menu/.test(help), '2f: the key help names the universal keys', help);

  // ---- 3: the shared Settings sheet ----
  await ev(d.page, (I) => { I.pause(false); });
  await d.page.click('#btn-pack');
  await d.page.click('#tab-help');
  const hasBtn = await d.page.$('#help-settings');
  ck(!!hasBtn, '3a: the Help tab has a Settings button', !!hasBtn);
  await d.page.click('#help-settings');
  const s1 = await d.page.evaluate(() => ({ open: !document.getElementById('mmset').hidden, panel: document.getElementById('panel').hidden, page: document.getElementById('mmset').dataset.page, s: window.__isles.settings() }));
  ck(s1.open && s1.panel && s1.page === 'isles' && s1.s.open, '3b: Settings opens over the island (the Pack closes first)', s1);
  const h0 = await ev(d.page, (I) => I.hero());
  await d.page.keyboard.down('KeyD'); await frames(d.page, 10); await d.page.keyboard.up('KeyD');
  const h1 = await ev(d.page, (I) => I.hero());
  ck(h1.x === h0.x, '3c: the island is paused while Settings is open (keys do not walk the hero)', { h0: h0.x, h1: h1.x });
  const ot0 = await d.page.evaluate(() => document.body.classList.contains('one-thumb'));
  await d.page.click('#mmset-one-thumb');
  const ot1 = await d.page.evaluate(() => ({ body: document.body.classList.contains('one-thumb'), keys: [localStorage.getItem('mm-auto-fire'), localStorage.getItem('mm-aim-toggle')] }));
  ck(!ot0 && ot1.body && ot1.keys.join() === '1,1', '3d: the One-thumb switch applies live (shared keys mm-auto-fire + mm-aim-toggle)', { ot0, ot1 });
  await d.page.click('#mmset-close');
  const closed = await d.page.evaluate(() => document.getElementById('mmset').hidden);
  await d.page.click('#btn-pack');
  await d.page.click('#panel-close');
  const snd = await ev(d.page, (I) => I.sounds());
  ck(closed && snd.indexOf('ui_open') >= 0 && snd.indexOf('ui_close') >= 0, '3e: Settings closes; the Pack plays ui_open / ui_close', snd.slice(-6));
  // the Menu's Settings entry opens the same sheet
  await d.page.click('#mm-nav-btn');
  const navSet = await d.page.$('#mm-nav-settings, [data-act="settings"], .mm-nav-settings');
  if (navSet) {
    await navSet.click();
    const viaNav = await d.page.evaluate(() => !document.getElementById('mmset').hidden);
    ck(viaNav, '3f: the Menu sheet Settings entry opens the shared Settings', viaNav);
    await d.page.click('#mmset-close');
  } else ck(false, '3f: the Menu sheet has a Settings entry', null);

  // ---- 4: phone layout ----
  const p = await open(browser, PHONE, '&isle=meadow', HERO_KEYS);
  await frames(p.page, 10);
  const how = await p.page.evaluate(() => {
    const h = document.getElementById('howto'), r = h.getBoundingClientRect(), cx = innerWidth / 2, cy = innerHeight / 2;
    return { shown: !h.hidden, r: [r.left, r.top, r.right, r.bottom].map(Math.round), coversHero: r.left < cx && r.right > cx && r.top < cy + 4 && r.bottom > cy - 40 };
  });
  ck(how.shown && !how.coversHero, '4a: phone: the first-visit how-to shows and never covers the hero', how);
  await p.page.tap('#btn-pack');
  const hid = await p.page.evaluate(() => getComputedStyle(document.getElementById('hint')).visibility);
  ck(hid === 'hidden', '4b: phone: the hint line hides under the open Pack', hid);
  await p.page.tap('#panel-close');
  const big = await open(browser, PHONE, '&isle=jungle', Object.assign({ 'pixeltown-access-v1': JSON.stringify({ hudScale: 1.5 }) }, HERO_KEYS));
  await frames(big.page, 10);
  const fire = await big.page.evaluate(() => { const b = document.getElementById('btn-fire'); return { sw: b.scrollWidth, cw: b.clientWidth, fs: parseFloat(getComputedStyle(b).fontSize) }; });
  ck(fire.sw <= fire.cw && fire.fs >= 18, '4c: phone 150% text: ATTACK fits its button at >= 18 px', fire);
  const l = await open(browser, LAND, '&isle=tundra', HERO_KEYS);
  await frames(l.page, 10);
  const land = await l.page.evaluate(() => {
    const R = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
    const hint = R('hint'), stick = R('stick'), fire = R('btn-fire'), acts = R('acts'), cy = innerHeight / 2;
    const ov = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
    return { hint, heroClear: hint.t > cy + 24 || hint.b < cy - 48, stick: ov(hint, stick), fire: ov(hint, fire), acts: ov(hint, acts), sw: document.documentElement.scrollWidth, iw: innerWidth };
  });
  ck(land.heroClear && !land.stick && !land.fire && !land.acts && land.sw <= land.iw, '4d: landscape 844x390: the hint clears the hero, the stick and the buttons', land);

  for (const o of all) ck(o.errors.length === 0, 'no console errors / audio warnings', o.errors.slice(0, 4));
  ck(all.every((o) => o.db.count() === 0), 'blockDb saw 0 database requests', all.map((o) => o.db.count()));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
