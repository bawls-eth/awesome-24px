// AX2-side: MMAccess prefs (text size, reduce motion) on the hub, Angler, Jam, Stalk and Deep Delve pages.
// Serve the repo root:  python3 -m http.server 8666 &   Run: BASE=http://localhost:8666/game/index.html NODE_PATH=$(npm root -g) node game/tests/side-access.test.js
// THREE_JS=<file> serves three.js locally for the Deep Delve page. No Firebase; storage only is read by the pages.
const { chromium } = require('playwright');
const fs = require('fs');
const { check, done } = require('./helpers');
const SA = require('../shared/mm-side-access.js');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const KEY = 'pixeltown-access-v1';
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
const PAGES = [
  ['hub', '/game/hub/index.html?test=1', 'window.__hub'],
  ['angler', '/game/games/angler/index.html?test=1', 'window.__angler'],
  ['jam', '/game/games/jam/index.html?test=1', 'window.__jam'],
  ['stalk', '/game/games/stalk/index.html?test=1&week=100', 'window.__stalk'],
  ['deepdelve', '/game/games/deepdelve/index.html?test=1', 'window.__dd && window.__dd.ready']
];

// pure helper checks
check('compute: defaults', JSON.stringify(SA.compute(null)) === '{"scale":1,"reduceMotion":false}');
check('compute: 1.5 + flashes off', JSON.stringify(SA.compute({ hudScale: 1.5, flashes: false })) === '{"scale":1.5,"reduceMotion":true}');
check('compute: junk values fall back', JSON.stringify(SA.compute({ hudScale: 9, flashes: 'no' })) === '{"scale":1,"reduceMotion":false}' && JSON.stringify(SA.compute('x')) === '{"scale":1,"reduceMotion":false}');

async function open(browser, url, cond, raw, viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1000, height: 760 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  if (process.env.THREE_JS) await page.route(THREE_URL, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(process.env.THREE_JS) }));
  if (raw !== undefined) await page.addInitScript(([k, v]) => { if (!sessionStorage.seeded) { sessionStorage.seeded = '1'; localStorage.setItem(k, v); } }, [KEY, raw]);
  await page.goto(ORIGIN + url);
  await page.waitForFunction(cond);
  return { ctx, page, errors };
}
const state = (page) => page.evaluate(() => ({
  scale: document.documentElement.style.getPropertyValue('--ui-scale'),
  rm: document.documentElement.getAttribute('data-reduce-motion'),
  font: getComputedStyle(document.body).fontSize,
  sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth
}));

(async () => {
  const browser = await chromium.launch();
  for (const [name, url, cond] of PAGES) {
    let s = await open(browser, url, cond);
    let st = await state(s.page);
    check(name + ': defaults (scale 1, no reduce-motion attribute, 16px text)', st.scale === '1' && st.rm === null && st.font === '16px', JSON.stringify(st));
    await s.ctx.close();

    s = await open(browser, url, cond, JSON.stringify({ v: 1, hudScale: 1.5, flashes: false }));
    st = await state(s.page);
    check(name + ': saved prefs apply (text 24px, reduce motion on)', st.scale === '1.5' && st.rm === '1' && st.font === '24px', JSON.stringify(st));
    await s.page.reload(); await s.page.waitForFunction(cond);
    st = await state(s.page);
    check(name + ': prefs persist across reload', st.scale === '1.5' && st.rm === '1');
    if (name === 'angler' || name === 'deepdelve') check(name + ': the game itself reports reduced motion', await s.page.evaluate(() => (window.__angler ? window.__angler.reduced : window.__dd.reduced) === true));
    if (name === 'jam') check('jam: the game reports reduced motion', await s.page.evaluate(() => window.__jam.reduced === true));
    if (name === 'stalk') check('stalk: the game reports reduced motion', await s.page.evaluate(() => window.__stalk.reduced === true));
    check(name + ': no console errors', s.errors.length === 0, s.errors.join('|'));
    await s.ctx.close();

    for (const bad of ['not json{', '{"hudScale":99,"flashes":"x"}', '[]']) {
      s = await open(browser, url, cond, bad);
      st = await state(s.page);
      check(name + ': corrupt prefs recover to defaults: ' + bad, st.scale === '1' && st.rm === null && st.font === '16px' && s.errors.length === 0, JSON.stringify(st) + s.errors.join('|'));
      await s.ctx.close();
    }

    s = await open(browser, url, cond, JSON.stringify({ v: 1, hudScale: 1.5, flashes: false }), { width: 390, height: 844 });
    st = await state(s.page);
    check(name + ': phone 390x844 at 150% text has no horizontal scroll', st.sw <= st.cw, JSON.stringify(st));
    check(name + ': phone no console errors', s.errors.length === 0, s.errors.join('|'));
    await s.ctx.close();
  }
  await browser.close();
  done();
})();
