// G-13 (b07-11, b07-12): beachcombing wins over fish shadows and wildlife logging when a beach item is in pickup range (villagers still
// first); away from beach items A / E still casts; no "E: log" label shows while fishing. OFFLINE ONLY: blockDb, Firebase SDK stubbed,
// "Play offline", ADMIN* name; no chat, no Firebase writes.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-g13-beach-first.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await blockDb(ctx);
  await ctx.route(/gstatic\.com\/firebasejs\//, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* firebase SDK blocked by beta-g13-beach-first.test.js */' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.route('**/main.js*', async (route) => { const resp = await route.fetch(); const body = (await resp.text()).replace('const game = new Phaser.Game(config);', 'const game = window.__g = new Phaser.Game(config);'); route.fulfill({ response: resp, body }); });
  await page.goto(BASE);
  await page.fill('#name-input', 'ADMINbeach');
  await page.click('.species-tab');
  await page.click('.avatar-choice');
  await page.click('button:has-text("Join Town")');
  await page.waitForSelector('#join-offline-btn:not(.hidden)', { timeout: 9000 });
  await page.click('#join-offline-btn');
  await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 20000 });
  await page.waitForTimeout(800);
  const T = (fn, arg) => page.evaluate(`(${fn.toString()})(window.__g.scene.getScene('Town'), ${JSON.stringify(arg === undefined ? null : arg)})`);

  // 1 + 2: on the west-pond shore shell with a fish shadow and a wildlife specimen on the same spot: A picks the shell, no cast
  const r1 = await T((s) => {
    const spot = { x: 190, y: 510 }; // BEACH_SPOTS[0], the west pond shore
    s.beachCooldowns = {}; s.localBody.x = spot.x; s.localBody.y = spot.y; s.localBody.body && s.localBody.body.reset && s.localBody.body.reset(spot.x, spot.y);
    (s.villagers || []).forEach((v) => { if (v && v.sprite) { v.sprite.x += 2000; } });
    const sh = (s.fishShadows || [])[0]; if (sh) { sh.x = spot.x + 8; sh.y = spot.y + 6; sh.state = 'swim'; sh.spookedUntil = 0; }
    const fake = { id: 'g13_test_crab', name: 'Test Crab', reach: 80, sprite: { x: spot.x + 4, y: spot.y, displayWidth: 12, displayHeight: 12, visible: true } };
    s.ffNear = [fake].concat(s.ffNear || []);
    const shells0 = s.resources.shells || 0;
    s.interact();
    const a = { shells: (s.resources.shells || 0) - shells0, fishing: s.fishing.state, logged: s.ffDiscovered.has('g13_test_crab'), shadow: !!sh };
    s.ffNear = [fake].concat((s.ffNear || []).filter((x) => x !== fake));
    (s.fishShadows || []).forEach((q) => { q.x = -9999; q.y = -9999; }); // only the specimen is left in reach
    s.interact(); // the shell is on cooldown now: the specimen is still loggable on the next press
    a.loggedNext = s.ffDiscovered.has('g13_test_crab'); a.fishing2 = s.fishing.state;
    s.ffDiscovered.delete('g13_test_crab'); s.ffNear = (s.ffNear || []).filter((x) => x !== fake);
    return a;
  });
  check('1. a shell with a fish shadow and a wildlife specimen on the same spot: A picks the shell (shells +1), no cast, nothing logged', r1.shadow && r1.shells === 1 && r1.fishing === 'idle' && !r1.logged, JSON.stringify(r1));
  check('1b. the specimen is still loggable on the next press', r1.loggedNext === true && r1.fishing2 === 'idle', JSON.stringify(r1));

  // 3: 2+ tiles from any beach item, next to a fish shadow: A still casts
  const r3 = await T((s) => {
    const sh = (s.fishShadows || [])[0]; if (!sh) return { none: true };
    s.fishing.state = 'idle';
    sh.x = 1200; sh.y = 1200; sh.state = 'swim'; sh.spookedUntil = 0;
    s.localBody.x = sh.x - 20; s.localBody.y = sh.y; s.beachCooldowns = {};
    const far = [{ x: 190, y: 510 }, { x: 330, y: 510 }, { x: 170, y: 690 }, { x: 2000, y: 380 }, { x: 2100, y: 210 }].every((b) => Math.hypot(b.x - s.localBody.x, b.y - s.localBody.y) > 64);
    s.interact();
    return { far, fishing: s.fishing.state };
  });
  check('3. away from beach items, next to a fish shadow, A still casts', r3.far && r3.fishing !== 'idle', JSON.stringify(r3));

  // 4: while fishing (not idle) no "E: log" label is visible
  const r4 = await T((s) => {
    const fake = { id: 'g13_test_crab2', name: 'Test Crab', reach: 80, sprite: { x: s.localBody.x + 4, y: s.localBody.y, displayWidth: 12, displayHeight: 12 } };
    s.ffNear = [fake]; s.updateFloraFaunaHint();
    const fishingVis = s.ffHint.visible;
    const st = s.fishing.state; s.fishing.state = 'idle'; s.updateFloraFaunaHint(); const idleVis = s.ffHint.visible;
    s.fishing.state = st; s.ffNear = [];
    return { st, fishingVis, idleVis };
  });
  check('4. while fishing ("Reel it in!") the "E: log" label is hidden; idle it shows', r4.st !== 'idle' && r4.fishingVis === false && r4.idleVis === true, JSON.stringify(r4));
  check('no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close(); await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
