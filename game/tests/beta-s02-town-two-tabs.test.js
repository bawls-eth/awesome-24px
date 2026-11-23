// Beta S-02 (b14-01, b14-02, P0): two Town tabs (and a Lantern Restore in a third page) no longer undo each other.
// Two pages in ONE browser context (shared localStorage). OFFLINE ONLY: blockDb + the Firebase SDK answered with an empty
// stub, entry through "Play offline"; never chats, never writes to Firebase.
//  1. A gains 5 wood while B (stale, missed the event) picks 2 fruit: storage keeps both; both HUDs show both.
//  2. A's lifetimeStats and an achievement unlocked in A survive B's next action.
//  3. A Lantern Restore in a third page: the Town tab's next action keeps the restored values; a different name reloads.
//  4. Single-tab play: 50 gathers = exactly +50 (no double count from the listener echo).
//  5. Spending in B after A gained: stored = stored - cost, never negative.
//  +  lint: main.js never writes a whole counter / set sub-object with plain writeSave.
// Run: BASE=http://localhost:8440/game/index.html node game/tests/beta-s02-town-two-tabs.test.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const BASE = process.env.BASE || 'http://localhost:8440/game/index.html';
const LANTERN = BASE.replace(/index\.html.*$/, 'games/mad-maze/lantern.html');
const SAVE_KEY = 'pixeltown-save-v1';

// ---- lint (node): no plain writeSave({ resources: / crafted: / caveInv: / lifetimeStats: / achievementsUnlocked: / museum* }) ----
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const calls = src.match(/writeSave\(\{[^)]*\}\)/gs) || [];
  const bad = calls.filter((c) => /\b(resources|crafted|caveInv|lifetimeStats|achievementsUnlocked|museumCollection|museumFauna|museumFlora)\s*:/.test(c));
  check('lint: no whole-sub-object writeSave for counters / sets in main.js', bad.length === 0, bad.join(' | ').slice(0, 300));
  check('lint: main.js listens for storage events on the save', /addEventListener\('storage'/.test(src));
}

const T = (page, fn, arg) => page.evaluate(([f, a]) => { const t = window.__g.scene.getScene('Town'); return new Function('t', 'a', 'return (' + f + ')(t, a)')(t, a); }, [fn.toString(), arg]);
const stored = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), SAVE_KEY);
const hud = (page, id) => page.evaluate((i) => { const e = document.getElementById(i); return e ? e.textContent.trim() : null; }, id);
const gain = (page, type, n) => T(page, (t, a) => { t.gainResource(a[0], a[1], t.localBody.x, t.localBody.y); }, [type, n]);
// Chromium syncs localStorage between renderers asynchronously: give the other tab's write time to arrive (its storage EVENT
// is what the test suppresses, not the data).
const settle = (page) => page.waitForTimeout(250);
const listener = (page, on) => T(page, (t, a) => { window[a ? 'addEventListener' : 'removeEventListener']('storage', t._onSaveStorage); }, on);

async function join(page) {
  await page.goto(BASE);
  await page.waitForSelector('#name-input');
  if (!(await page.inputValue('#name-input'))) await page.fill('#name-input', 'ADMINs02');
  await page.click('button:has-text("Join Town")'); // offline: the SDK is stubbed, so this only offers 'Play offline'
  await page.waitForSelector('#join-offline-btn:not(.hidden)', { timeout: 15000 });
  await page.click('#join-offline-btn');
  await page.waitForFunction(() => window.__g && window.__g.scene.getScene('Town') && window.__g.scene.getScene('Town').localBody, null, { timeout: 30000 });
  await page.waitForTimeout(600);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const db = await blockDb(ctx);
  await ctx.route(/gstatic\.com\/firebasejs\//, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* firebase SDK blocked by beta-s02 */' }));
  await ctx.route('**/main.js*', async (route) => {
    const resp = await route.fetch();
    const body = (await resp.text()).replace('const game = new Phaser.Game(config);', 'const game = window.__g = new Phaser.Game(config);');
    route.fulfill({ response: resp, body });
  });
  await ctx.addInitScript(() => { if (!localStorage.getItem('s02-seeded')) { localStorage.setItem('s02-seeded', '1'); localStorage.setItem('pixeltown-save-v1', JSON.stringify({ name: 'ADMINs02', species: 'ranger', frame: 0, resources: {} })); } });
  const errors = [];
  const A = await ctx.newPage();
  const B = await ctx.newPage();
  for (const p of [A, B]) p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await join(A);
  await join(B);

  // ---- 1: B misses A's write (listener off = a background tab whose event has not arrived) ----
  const s0 = await stored(A);
  const w0 = (s0.resources && s0.resources.wood) || 0, f0 = (s0.resources && s0.resources.fruit) || 0;
  await listener(B, false);
  await gain(A, 'wood', 5);
  await settle(B);
  await gain(B, 'fruit', 2);
  await listener(B, true);
  let s1 = await stored(A);
  check('[1] stored resources keep A\'s wood and B\'s fruit', s1.resources.wood === w0 + 5 && s1.resources.fruit === f0 + 2, JSON.stringify(s1.resources));
  await A.waitForFunction((v) => (document.getElementById('fruit-count') || {}).textContent === String(v), f0 + 2, { timeout: 1500 }).catch(() => {});
  check('[1] A\'s HUD shows B\'s fruit within 1 s', (await hud(A, 'fruit-count')) === String(f0 + 2), await hud(A, 'fruit-count'));
  check('[1] B\'s HUD shows A\'s wood', (await hud(B, 'wood-count')) === String(w0 + 5), await hud(B, 'wood-count'));

  // ---- 2: stats + an achievement from A survive B's next action ----
  await gain(A, 'wood', 10); // lifetime wood >= 10 -> 'wood10' (Lumberjack) unlocks in A
  const statA = await T(A, (t) => t.lifetimeStats.wood);
  check('[2] A unlocked wood10', await T(A, (t) => t.achievementsUnlocked.has('wood10')));
  await listener(B, false);
  await settle(B);
  await gain(B, 'fruit', 1);
  await listener(B, true);
  const s2 = await stored(A);
  check('[2] lifetimeStats.wood from A still stored after B\'s action', s2.lifetimeStats && s2.lifetimeStats.wood >= statA, JSON.stringify(s2.lifetimeStats));
  check('[2] A\'s achievement still stored after B\'s action', Array.isArray(s2.achievementsUnlocked) && s2.achievementsUnlocked.includes('wood10'));
  check('[2] B\'s own fruit stat also counted', s2.lifetimeStats.fruit >= 3, JSON.stringify(s2.lifetimeStats));

  // ---- 4: single-tab play, 50 gathers = exactly 50 ----
  const w4 = (await stored(A)).resources.wood;
  for (let i = 0; i < 50; i++) await gain(A, 'stone', 1);
  await A.waitForTimeout(300);
  const s4 = await stored(A);
  check('[4] 50 gathers -> stone exactly +50', s4.resources.stone === ((s2.resources.stone || 0) + 50), String(s4.resources.stone));
  check('[4] wood untouched by the stone gathers', s4.resources.wood === w4);
  check('[4] B adopted the stored stone (no echo write)', (await T(B, (t) => t.resources.stone)) === s4.resources.stone);

  // ---- 5: spending in B after A gained ----
  const wb = (await stored(A)).resources.wood;
  const crafted = await T(B, (t) => t.craftRecipe('plank'));
  const s5 = await stored(A);
  check('[5] B crafted a plank with the wood A gathered', crafted === true && s5.crafted && s5.crafted.plank >= 1);
  check('[5] stored wood = before - 3', s5.resources.wood === wb - 3, `${wb} -> ${s5.resources.wood}`);
  // stale B (missed A spending everything) spends again: never negative
  await listener(B, false);
  await T(A, (t) => { while (t.craftRecipe('plank')) { /* spend all wood */ } });
  const before5b = (await stored(A)).resources.wood;
  await settle(B);
  await T(B, (t) => t.craftRecipe('plank'));
  await listener(B, true);
  const s5b = await stored(A);
  check('[5] stale spend never makes stored wood negative', s5b.resources.wood >= 0 && s5b.resources.wood <= before5b, `${before5b} -> ${s5b.resources.wood}`);

  // ---- 3: Lantern Restore in a third page while both Town tabs are open ----
  const C = await ctx.newPage();
  C.on('pageerror', (e) => errors.push('lantern pageerror: ' + e.message));
  await C.goto(LANTERN);
  await C.waitForFunction(() => !!window.MMBackup);
  const restored = { name: 'ADMINs02', species: 'ranger', frame: 0, resources: { wood: 12, stone: 7 }, achievementsUnlocked: [], lifetimeStats: {} };
  const r = await C.evaluate((v) => window.MMBackup.restore(localStorage, { format: 'pixeltown-backup', v: 2, keys: { 'pixeltown-save-v1': JSON.stringify(v) } }), restored);
  check('[3] Lantern restore applied', r && r.ok === true, JSON.stringify(r));
  await A.waitForTimeout(400);
  await gain(A, 'fish', 1);
  const s3 = await stored(A);
  check('[3] after the Town tab\'s next action the restored wood / stone are kept', s3.resources.wood === 12 && s3.resources.stone === 7 && s3.resources.fish === 1, JSON.stringify(s3.resources));
  check('[3] restored (empty) achievements were not overwritten by the old tab', Array.isArray(s3.achievementsUnlocked) && !s3.achievementsUnlocked.includes('wood10'), JSON.stringify(s3.achievementsUnlocked));
  check('[3] restored stats were not overwritten (only the new fish counted)', !s3.lifetimeStats.wood && s3.lifetimeStats.fish === 1, JSON.stringify(s3.lifetimeStats));
  // a restore that changes the name forces a reload in the open Town tab
  const renamed = { name: 'ADMINs02c', species: 'ranger', frame: 0, resources: { wood: 3 } };
  await settle(C);
  const reloaded = B.waitForEvent('load', { timeout: 10000 }).then(() => true).catch(() => false);
  await C.evaluate((v) => window.MMBackup.restore(localStorage, { format: 'pixeltown-backup', v: 2, keys: { 'pixeltown-save-v1': JSON.stringify(v) } }), renamed);
  check('[3] renamed save: the Town tab says so and reloads', await reloaded);
  const s3b = await stored(C);
  check('[3] storage still equals the renamed restore after the reload', s3b.name === 'ADMINs02c' && s3b.resources.wood === 3, JSON.stringify(s3b).slice(0, 200));

  check('no page errors', errors.length === 0, errors.join(' | '));
  check('no database traffic', db.attempts() === 0, JSON.stringify([db.http, db.ws]));
  await ctx.close();
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
