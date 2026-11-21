// SA2: Realm audio hookup. The ambience drone is OFF by default, never starts before a user gesture, follows the zone index from the
// public world state, respects the existing Sound (mute) setting, and Realm buttons play ui_tap. A fake AudioContext counts voices.
// Run: BASE=http://localhost:8663/game/index.html NODE_PATH=$(npm root -g) node game/tests/realm-audio.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const WORLD = ORIGIN + '/game/games/mad-maze/index.html?mode=world&test=1&seed=12345';
const KEY = 'pixeltown-realm-audio-v1';

const FAKE = () => {
  window.__au = { made: 0, osc: 0, live: 0, src: 0 };
  class P { constructor() { this.value = 0; } setValueAtTime() {} linearRampToValueAtTime() {} setTargetAtTime() {} }
  class Ctx {
    constructor() { window.__au.made++; this.destination = {}; this.sampleRate = 8000; this.state = 'running'; this._t = 0; }
    get currentTime() { return (this._t += 0.001); }
    resume() { return Promise.resolve(); }
    createGain() { return { gain: new P(), connect() {}, disconnect() {} }; }
    createOscillator() { const o = { type: '', frequency: new P(), connect() {}, start() { window.__au.osc++; window.__au.live++; o.on = true; }, stop() { if (o.on) { o.on = false; window.__au.live--; } } }; return o; }
    createBuffer(c, n) { return { getChannelData: () => new Float32Array(n) }; }
    createBufferSource() { return { connect() {}, start() { window.__au.src++; }, stop() {} }; }
    createBiquadFilter() { return { frequency: new P(), connect() {}, type: '' }; }
  }
  window.AudioContext = Ctx; window.webkitAudioContext = Ctx;
};

async function open(browser, opts, key) {
  const ctx = await browser.newContext(opts);
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  await ctx.addInitScript(FAKE);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((k) => { localStorage.clear(); localStorage.setItem('mm-aim-assist', '0'); if (k) localStorage.setItem('pixeltown-realm-audio-v1', k); }, key || null);
  await page.goto(WORLD);
  await page.waitForFunction(() => window.__mm && window.__mm.world && window.__mm.arena.active && window.__mm.arena.state === 'play', null, { timeout: 15000 });
  return { ctx, page, errors };
}
const au = (page) => page.evaluate(() => Object.assign({}, window.__au, { st: window.RealmAudio.state(), on: window.RealmAudio.isOn(), gesture: window.__mm.arena._gesture === true, music: window.__mm.arena.sfx ? window.__mm.arena.sfx.musicOn : null }));

(async () => {
  const browser = await chromium.launch();
  let T = await open(browser, { viewport: { width: 1000, height: 700 } });
  let page = T.page;
  let a = await au(page);
  check('default: ambience is OFF and nothing is stored', a.on === false && a.st.playing === false && (await page.evaluate((k) => localStorage.getItem(k), KEY)) === null);
  check('no AudioContext exists before a user gesture', a.made === 0 && a.gesture === false, JSON.stringify(a));
  // turning it on before any gesture must still stay silent (no autoplay)
  await page.evaluate(() => window.RealmAudio.setOn(true)); await page.waitForTimeout(1300);
  a = await au(page);
  check('ambience switched on but no gesture yet: still silent, no context', a.on === true && a.made === 0 && a.live === 0 && a.st.playing === false, JSON.stringify(a));
  check('the choice persisted under pixeltown-realm-audio-v1', await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).ambience === true, KEY));
  await page.mouse.click(500, 350); // a real user gesture
  await page.waitForFunction(() => window.RealmAudio.state().playing === true, null, { timeout: 4000 });
  a = await au(page);
  check('after a gesture the quiet drone plays (2 oscillators) and music is on', a.live === 2 && a.music === true && a.made === 1, JSON.stringify(a));
  const zone = await page.evaluate(() => window.__mm.world.zone().zone);
  check('the zone index comes from the public world state', typeof a.st.zone === 'number' && a.st.zone === zone, 'zone ' + zone + ' vs ' + a.st.zone);
  const live1 = a.live;
  await page.waitForTimeout(2200); a = await au(page);
  check('the 1 Hz tick keeps ONE drone running (no stacking)', a.live === live1 && a.live === 2, JSON.stringify(a));
  // existing Sound setting: mute stops it, unmute brings it back
  await page.evaluate(() => window.__mm.arena.setMuted(true)); await page.waitForTimeout(1300); a = await au(page);
  check('Sound muted: the ambience stops', a.live === 0 && a.st.playing === false, JSON.stringify(a));
  await page.evaluate(() => window.__mm.arena.setMuted(false)); await page.waitForTimeout(1300); a = await au(page);
  check('Sound unmuted: the ambience resumes', a.live === 2 && a.st.playing === true, JSON.stringify(a));
  // settings toggle
  await page.evaluate(() => window.__mmAccess.open());
  check('the settings sheet has an Ambient music toggle showing on', await page.evaluate(() => { const b = document.querySelector('#mm-settings button[data-ax="music"]'); return !!b && /on/.test(b.textContent) && b.getAttribute('aria-pressed') === 'true'; }));
  await page.evaluate(() => document.querySelector('#mm-settings button[data-ax="music"]').click()); await page.waitForTimeout(200); a = await au(page);
  check('toggling it off in settings stops the drone and saves off', a.live === 0 && a.on === false && (await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).ambience, KEY)) === false, JSON.stringify(a));
  // ui_tap on Realm buttons
  await page.evaluate(() => window.__mmAccess.close());
  await page.evaluate(() => window.__mm.arena.setMenu(false));
  const s0 = (await au(page)).osc;
  await page.click('#realm-bp-btn'); await page.waitForTimeout(100);
  check('a Realm button plays the ui_tap blip', (await au(page)).osc > s0);
  check('no console errors (desktop)', T.errors.length === 0, T.errors.join(' | '));
  await T.ctx.close();

  // corrupt / hostile saved value -> off
  for (const bad of ['{nope', '"on"', JSON.stringify({ ambience: 'true' }), JSON.stringify([true]), 'null']) {
    T = await open(browser, { viewport: { width: 1000, height: 700 } }, bad);
    check('corrupt audio save stays OFF: ' + bad, (await au(T.page)).on === false && T.errors.length === 0, T.errors.join(' | '));
    await T.ctx.close();
  }
  // saved ON + muted existing setting -> silent even after a gesture
  T = await open(browser, { viewport: { width: 1000, height: 700 } }, JSON.stringify({ v: 1, ambience: true }));
  page = T.page;
  await page.evaluate(() => localStorage.setItem('mm-sfx-muted', '1'));
  await page.mouse.click(500, 350); await page.waitForTimeout(1500); a = await au(page);
  check('saved ON but the Sound setting is muted: silent', a.on === true && a.live === 0, JSON.stringify(a));
  await T.ctx.close();

  // phone: toggle is a 44 px target, no horizontal scroll
  T = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  page = T.page;
  await page.tap('#mm-gear-btn'); await page.waitForTimeout(150);
  const r = await page.evaluate(() => { const b = document.querySelector('#mm-settings button[data-ax="music"]').getBoundingClientRect(); return { w: b.width, h: b.height, sw: document.documentElement.scrollWidth <= innerWidth }; });
  check('phone: the Ambient music toggle is >= 44 px, no horizontal scroll', r.w >= 44 && r.h >= 44 && r.sw, JSON.stringify(r));
  check('no console errors (phone)', T.errors.length === 0, T.errors.join(' | '));
  await T.ctx.close();

  await browser.close();
  done();
})();
