// cyc0-S (Town E-interaction shadowing, same family as the weed/mailbox bug): every fixed E target in Town (NPCs, merchant,
// dig hole, Realm Gate, the four arcade doors, Isles sign, postcards, flower patches, fossil spots) must be the thing E does
// when you stand on it, and over most of its own range. Before the fix the 4th flower patch sat 22 px from the Kart Rally
// door; flowers answer E before doors in interact(), so E at that door picked a flower (door won over 40% of its range).
// Method: every action handler is replaced by a recorder, dynamic shadows (weeds, fish, villagers, bugs) are moved off the
// map, the merchant and concert are forced on, and interact() is called on a 4 px grid inside each target's radius.
// OFFLINE ONLY: blockDb + stubbed Firebase SDK; nothing is written.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/cyc0-town-interact-shadow.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const db = await blockDb(ctx);
  await ctx.route(/gstatic\.com\/firebasejs\//, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* firebase SDK blocked by cyc0 shadow test */' }));
  await ctx.route('**/main.js*', async (route) => {
    const resp = await route.fetch();
    route.fulfill({ response: resp, body: (await resp.text()).replace('const game = new Phaser.Game(config);', 'const game = window.__g = new Phaser.Game(config);') });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE);
  await page.fill('#name-input', 'ADMINshadow');
  await page.click('button:has-text("Join Town")');
  await page.waitForSelector('#join-offline-btn:not(.hidden)', { timeout: 20000 });
  await page.click('#join-offline-btn');
  await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 30000 });
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => {
    const s = window.__g.scene.getScene('Town');
    const acts = ['openOutfitShop', 'enjoyConcert', 'sellAtShop', 'openPolyroll', 'buyTurnips', 'donateFossils', 'claimScavenger', 'openWorkbench',
      'openMailbox', 'openHome', 'openGuestbook', 'useIslesSign', 'openPostcards', 'pullWeed', 'talkToNPC', 'talkToNPC2', 'talkToVillager',
      'collectBeachItem', 'startFishing', 'collectFloraFauna', 'buyFromMerchant', 'digFossil', 'collectFlower', 'enterUnderground',
      'openRealmGateMenu', 'useDoor', 'catchBug', 'triggerEmote', 'swingTool', 'shakeTreeVisual', 'gainResource'];
    let last = null;
    acts.forEach((a) => { s[a] = () => { if (!last) last = a; }; });
    s.isMerchantVisiting = () => true; s.isConcertTime = () => true;
    s.scavengerClaim = null; s.weedSpots = []; s.fishShadows = []; s.bugs = [];
    (s.villagers || []).forEach((v) => { if (v.sprite) { v.sprite.x = -9999; v.sprite.y = -9999; } v.x = -9999; v.y = -9999; });
    s.flowerCooldowns = {}; s.fossilCooldowns = {}; s.beachCooldowns = {};
    const targets = [
      ['Professor NPC', NPC_POS.x, NPC_POS.y, NPC_RADIUS, 'talkToNPC'], ['NPC 2', NPC2_POS.x, NPC2_POS.y, NPC2_RADIUS, 'talkToNPC2'],
      ['merchant', MERCHANT_POS.x, MERCHANT_POS.y, MERCHANT_RADIUS, 'buyFromMerchant'], ['dig hole', DIG_HOLE_POS.x, DIG_HOLE_POS.y, DIG_HOLE_RADIUS, 'enterUnderground'],
      ['Realm Gate', REALM_GATE_POS.x, REALM_GATE_POS.y + 30, REALM_GATE_RADIUS, 'openRealmGateMenu'],
      ...PORTALS.map((p) => ['door ' + p.label.replace(/[^\w ]/g, '').trim(), p.x, p.y, DOOR_RADIUS, 'useDoor']),
      ['Isles sign', ISLES_SIGN_POS.x, ISLES_SIGN_POS.y + 14, ISLES_SIGN_RADIUS, 'useIslesSign'],
      ['postcards', POSTCARD_POS.x, POSTCARD_POS.y, POSTCARD_RADIUS, 'openPostcards'],
      ...FLOWER_SPOTS.slice(0, 6).map((f, i) => ['village flower ' + i, f.x, f.y, FLOWER_PICKUP_RADIUS, 'collectFlower']),
      ...FOSSIL_SPOTS.map((f, i) => ['fossil ' + i, f.x, f.y, FOSSIL_DIG_RADIUS, 'digFossil']),
    ];
    const out = [];
    targets.forEach(([name, x, y, rad, want]) => {
      let n = 0, ok = 0; const who = {};
      for (let dx = -rad; dx <= rad; dx += 4) for (let dy = -rad; dy <= rad; dy += 4) {
        if (Math.hypot(dx, dy) >= rad - 1) continue;
        s.localBody.x = x + dx; s.localBody.y = y + dy; last = null; n++;
        try { s.interact(); } catch (e) { last = 'throw ' + e.message; }
        if (last === want) ok++; else who[last] = (who[last] || 0) + 1;
      }
      s.localBody.x = x; s.localBody.y = y; last = null; s.interact();
      out.push({ name, pct: Math.round(100 * ok / n), center: last, want, who });
    });
    const kart = PORTALS.find((p) => /Kart/.test(p.label));
    const flowerGap = Math.min(...FLOWER_SPOTS.map((f) => Math.min(...PORTALS.map((p) => Math.hypot(f.x - p.x, f.y - p.y)))));
    return { out, kart: !!kart, flowerGap };
  });
  r.out.forEach((o) => console.log(`  ${o.name.padEnd(20)} ${String(o.pct).padStart(3)}%  centre -> ${o.center}  ${Object.keys(o.who).length ? JSON.stringify(o.who) : ''}`));
  const kart = r.out.find((o) => /Kart/.test(o.name));
  check('the Kart Rally door exists and E at its centre uses the door (not the flower patch)', r.kart && kart && kart.center === 'useDoor', JSON.stringify(kart));
  check('the Kart Rally door answers E over >= 90% of its range', kart && kart.pct >= 90, JSON.stringify(kart));
  check('no flower patch sits within flower+door reach (68 px) of any arcade door', r.flowerGap >= 68, String(r.flowerGap));
  const centreBad = r.out.filter((o) => o.center !== o.want);
  check('every fixed Town E target is what E does at its own centre', centreBad.length === 0, JSON.stringify(centreBad));
  const lowBad = r.out.filter((o) => o.pct < 75);
  check('every fixed Town E target answers E over >= 75% of its range', lowBad.length === 0, JSON.stringify(lowBad));
  check('no page errors', errors.length === 0, errors.join(' | '));
  check('no Firebase / DB traffic', db.attempts() === 0, String(db.attempts()));
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
