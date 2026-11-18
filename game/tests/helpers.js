// Shared Playwright helpers. Run from the repo root with the static server up:
//   python3 -m http.server 8440 &   NODE_PATH=$(npm root -g) node game/tests/workbench.test.js
// Bots are named ADMIN* and the tests never chat. They do join the live town
// (presence only) but never write anything else to Firebase.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';

async function launch(viewport = { width: 1000, height: 700 }, seedSave, touch = false) {
  const browser = await chromium.launch();
  // touch=true emulates a phone so the on-screen joystick / A button show.
  const page = await browser.newPage(touch ? { viewport, hasTouch: true, isMobile: true } : { viewport });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.route('**/main.js', async (route) => {
    const resp = await route.fetch();
    const body = (await resp.text()).replace('const game = new Phaser.Game(config);', 'const game = window.__g = new Phaser.Game(config);');
    route.fulfill({ response: resp, body });
  });
  if (seedSave) {
    await page.addInitScript((v) => {
      if (!sessionStorage.seeded) { sessionStorage.seeded = '1'; localStorage.setItem('pixeltown-save-v1', v); }
    }, JSON.stringify(seedSave));
  }
  await page.goto(BASE);
  await page.fill('#name-input', 'ADMINtest');
  await page.click('.species-tab');
  await page.waitForTimeout(150);
  await page.click('.avatar-choice');
  await page.click('#join-btn');
  await page.waitForSelector('#player-list-panel', { timeout: 20000 });
  await page.waitForTimeout(1500);
  return { browser, page, errors };
}
const scene = (page, fn, arg) => page.evaluate(`(${fn.toString()})(window.__g.scene.getScene('Town'), ${JSON.stringify(arg)})`);

let failed = 0;
function check(name, cond, extra = '') {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra));
  if (!cond) failed++;
}
const done = () => { console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exitCode = failed ? 1 : 0; };
module.exports = { launch, scene, check, done };
