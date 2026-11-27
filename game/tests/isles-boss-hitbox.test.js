// cyc16 (owner: "hit box smaller than enemy often"): a hero bolt strikes an Isles boss wherever its DRAWN strip body is, not only inside
// the old 48 px circle at y - 36. The tide hydra's heads reach ~100 px above its feet (measured from the b38g idle strip), so a bolt
// flying level with them used to pass straight through. Real bolts (I.fire + I.step), no direct bossHit calls:
//  1 reef (tide hydra): a bolt level with the heads (feet - 96) damages it; one well above the drawn top (feet - 140) does not;
//  2 jungle (fernjaw tyrant): a bolt through the old circle (feet - 36) still damages it (the hit area never shrinks);
//  3 0 console errors, 0 DB requests.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/isles-boss-hitbox.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/games/isles/index.html';
const TOWN = '{"realm":{"level":3},"name":"Bo"}';

async function open(browser, isle) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript((s) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', s); }, TOWN);
  await page.goto(PAGE + '?test=1&seed=7&isle=' + isle);
  await page.waitForFunction(() => window.__isles && window.__isles.world, null, { timeout: 15000 });
  return { ctx, page, errors, db };
}

// Shoot one level bolt from the side at height (feet + dyFeet); returns the boss damage it did.
const SHOOT = (I, dyFeet) => {
  I.pause(true); I.god(true); I.clearCreatures();
  if (!I.boss().st) I.bossSpawn();
  const site = I.boss().site;
  I.place(site.px + 70, site.py + dyFeet + 6); // a bolt starts at hero.y - 6, 70 px to the side (outside the drawn body)
  I.step(0, 0, 1 / 60); I.render(); const bb = I.boss(); I.place(bb.x + 70, bb.y + dyFeet + 6); // re-aim at where it is now (it drifts toward the hero)
  const b0 = I.boss(); const h = I.hero();
  const out = { id: b0.id, st: b0.st, bx: b0.x, by: b0.y, hx: h.x, hy: h.y };
  const hp0 = b0.hp;
  const fired = I.fire(b0.x - h.x, 0);
  for (let k = 0; k < 20; k++) I.step(0, 0, 1 / 60);
  const b1 = I.boss();
  out.fired = fired; out.dmg = hp0 - b1.hp; out.hp0 = hp0; out.st1 = b1.st;
  return out;
};

(async () => {
  const browser = await chromium.launch();
  const R = await open(browser, 'reef');
  await R.page.waitForTimeout(1500); // the strips load (STRIPS.has)
  const heads = await R.page.evaluate(`(${SHOOT.toString()})(window.__isles, -96)`);
  const above = await R.page.evaluate(`(${SHOOT.toString()})(window.__isles, -140)`);
  check('reef: the island boss is the tide hydra', heads.id === 'tide_hydra', JSON.stringify(heads));
  check('reef: a bolt level with the hydra heads (feet - 96, outside the old circle) damages it', heads.fired && heads.dmg > 0, JSON.stringify(heads));
  check('reef: a bolt above the drawn top (feet - 140) does not', above.fired && above.dmg === 0, JSON.stringify(above));
  const J = await open(browser, 'jungle');
  await J.page.waitForTimeout(1500);
  const mid = await J.page.evaluate(`(${SHOOT.toString()})(window.__isles, -36)`);
  check('jungle: a bolt through the old circle (feet - 36) still damages the fernjaw tyrant', mid.id === 'fernjaw_tyrant' && mid.fired && mid.dmg > 0, JSON.stringify(mid));
  for (const o of [R, J]) {
    check('0 console errors', o.errors.length === 0, o.errors.join(' | '));
    check('0 DB requests', o.db.attempts() === 0, String(o.db.attempts()));
  }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
